import type { ImportOrder } from '@/types';
import { supabase } from '@/lib/supabase';

const ARCHIVE_PREFIX = 'scp_supplementary_import_order_';
const LEGACY_QUEUE_KEY = 'scp_supplementary_import_archive_queue_v1';
const QUEUE_DB_NAME = 'scp-supplementary-order-archive';
const QUEUE_STORE_NAME = 'pending-actions';
const SNAPSHOT_STORE_NAME = 'order-snapshots';
const PAGE_SIZE = 1000;
const RETRY_BASE_MS = 2000;
const RETRY_MAX_MS = 60000;

type ArchiveAction =
  | { kind: 'upsert'; id: string; order: ImportOrder }
  | { kind: 'delete'; id: string };

type SnapshotRecord =
  | { id: string; kind: 'upsert'; order: ImportOrder; synced: boolean }
  | { id: string; kind: 'delete'; synced: boolean };

const serialWrites = new Map<string, Promise<boolean>>();
let flushing: Promise<void> | null = null;
let queueDatabase: Promise<IDBDatabase | null> | null = null;
let retryTimer: number | null = null;
let retryDelay = RETRY_BASE_MS;

function requestPersistentStorage(): void {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return;
  void navigator.storage.persist().catch(() => false);
}

function openQueueDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (queueDatabase) return queueDatabase;
  queueDatabase = new Promise(resolve => {
    const request = indexedDB.open(QUEUE_DB_NAME, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(QUEUE_STORE_NAME)) {
        db.createObjectStore(QUEUE_STORE_NAME, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(SNAPSHOT_STORE_NAME)) {
        db.createObjectStore(SNAPSHOT_STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => {
      requestPersistentStorage();
      resolve(request.result);
    };
    request.onerror = () => {
      console.warn('Không mở được hàng chờ lưu đơn bổ sung trên thiết bị.');
      queueDatabase = null;
      resolve(null);
    };
    request.onblocked = () => {
      console.warn('Cơ sở lưu trữ đơn bổ sung đang bị chặn bởi một thẻ ứng dụng khác.');
      queueDatabase = null;
      resolve(null);
    };
  });
  return queueDatabase;
}

function readLegacyQueue(): Record<string, ArchiveAction> {
  try {
    const raw = localStorage.getItem(LEGACY_QUEUE_KEY);
    return raw ? JSON.parse(raw) as Record<string, ArchiveAction> : {};
  } catch {
    return {};
  }
}

function storeLegacyAction(action: ArchiveAction): boolean {
  try {
    const queue = readLegacyQueue();
    queue[action.id] = action;
    localStorage.setItem(LEGACY_QUEUE_KEY, JSON.stringify(queue));
    return true;
  } catch (error) {
    console.warn('Không thể tạo bản chờ lưu cho đơn bổ sung trên thiết bị.', error);
    return false;
  }
}

async function writeActionToDatabase(db: IDBDatabase, action: ArchiveAction): Promise<boolean> {
  return new Promise(resolve => {
    try {
      const transaction = db.transaction(QUEUE_STORE_NAME, 'readwrite');
      transaction.objectStore(QUEUE_STORE_NAME).put(action);
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => resolve(false);
      transaction.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

async function storePendingAction(action: ArchiveAction): Promise<boolean> {
  const db = await openQueueDatabase();
  if (db) {
    if (await writeActionToDatabase(db, action)) return true;
    console.warn('Hàng chờ lưu bằng IndexedDB gặp lỗi; đang thử bộ nhớ dự phòng.');
  }
  return storeLegacyAction(action);
}

async function storeSnapshotRecord(record: SnapshotRecord): Promise<boolean> {
  const db = await openQueueDatabase();
  if (!db) return false;
  return new Promise(resolve => {
    try {
      const transaction = db.transaction(SNAPSHOT_STORE_NAME, 'readwrite');
      transaction.objectStore(SNAPSHOT_STORE_NAME).put(record);
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => resolve(false);
      transaction.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

async function readSnapshotRecords(): Promise<SnapshotRecord[]> {
  const db = await openQueueDatabase();
  if (!db) return [];
  return new Promise(resolve => {
    try {
      const request = db.transaction(SNAPSHOT_STORE_NAME, 'readonly')
        .objectStore(SNAPSHOT_STORE_NAME).getAll();
      request.onsuccess = () => resolve(request.result as SnapshotRecord[]);
      request.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

async function markSnapshotSynced(id: string): Promise<void> {
  const records = await readSnapshotRecords();
  const current = records.find(record => record.id === id);
  if (current && current.kind === 'upsert') {
    await storeSnapshotRecord({ ...current, synced: true });
  }
}

async function removeSnapshotRecord(id: string): Promise<void> {
  const db = await openQueueDatabase();
  if (!db) return;
  await new Promise<void>(resolve => {
    try {
      const transaction = db.transaction(SNAPSHOT_STORE_NAME, 'readwrite');
      transaction.objectStore(SNAPSHOT_STORE_NAME).delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
      transaction.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

async function getPendingActions(): Promise<ArchiveAction[]> {
  const db = await openQueueDatabase();
  const stored = db ? await new Promise<ArchiveAction[]>(resolve => {
    try {
      const request = db.transaction(QUEUE_STORE_NAME, 'readonly').objectStore(QUEUE_STORE_NAME).getAll();
      request.onsuccess = () => resolve(request.result as ArchiveAction[]);
      request.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  }) : [];
  const legacy = Object.values(readLegacyQueue());
  let legacyMigrated = legacy.length > 0 && !!db;
  if (db) {
    for (const action of legacy) {
      if (!(await writeActionToDatabase(db, action))) legacyMigrated = false;
    }
    if (legacyMigrated) {
      try { localStorage.removeItem(LEGACY_QUEUE_KEY); } catch {}
    }
  }
  const byId = new Map(stored.map(action => [action.id, action]));
  legacy.forEach(action => byId.set(action.id, action));
  for (const record of await readSnapshotRecords()) {
    if (record.synced) continue;
    byId.set(record.id, record.kind === 'upsert'
      ? { kind: 'upsert', id: record.id, order: record.order }
      : { kind: 'delete', id: record.id });
  }
  return [...byId.values()];
}

async function removePendingAction(id: string): Promise<void> {
  const db = await openQueueDatabase();
  if (db) {
    await new Promise<void>(resolve => {
      try {
        const transaction = db.transaction(QUEUE_STORE_NAME, 'readwrite');
        transaction.objectStore(QUEUE_STORE_NAME).delete(id);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => resolve();
        transaction.onabort = () => resolve();
      } catch {
        resolve();
      }
    });
  }
  const legacy = readLegacyQueue();
  if (legacy[id]) {
    delete legacy[id];
    try {
      if (Object.keys(legacy).length === 0) localStorage.removeItem(LEGACY_QUEUE_KEY);
      else localStorage.setItem(LEGACY_QUEUE_KEY, JSON.stringify(legacy));
    } catch {}
  }
}

async function sendAction(action: ArchiveAction): Promise<boolean> {
  try {
    if (action.kind === 'upsert') {
      const { error } = await supabase.from('app_data').upsert({
        key: `${ARCHIVE_PREFIX}${action.id}`,
        value: action.order,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' });
      if (error) {
        console.warn('Lưu bản dự phòng đơn bổ sung chưa thành công:', error.message);
        return false;
      }
      return true;
    }

    const { error } = await supabase.from('app_data').delete().eq('key', `${ARCHIVE_PREFIX}${action.id}`);
    if (error) {
      console.warn('Xóa bản dự phòng đơn đã xóa vĩnh viễn chưa thành công:', error.message);
      return false;
    }
    return true;
  } catch (error) {
    console.warn('Không kết nối được kho lưu trữ đơn bổ sung; sẽ thử lại.', error);
    return false;
  }
}

function scheduleRetry(): void {
  if (typeof window === 'undefined' || retryTimer !== null) return;
  retryTimer = window.setTimeout(() => {
    retryTimer = null;
    void flushSupplementaryOrderArchiveQueue();
  }, retryDelay);
  retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS);
}

function runSerial(action: ArchiveAction): Promise<boolean> {
  const previous = serialWrites.get(action.id) || Promise.resolve(true);
  const next = previous.catch(() => false).then(async () => {
    const success = await sendAction(action);
    if (!success) {
      scheduleRetry();
      return false;
    }
    await removePendingAction(action.id);
    if (action.kind === 'delete') await removeSnapshotRecord(action.id);
    else await markSnapshotSynced(action.id);
    return true;
  }).finally(() => {
    if (serialWrites.get(action.id) === next) serialWrites.delete(action.id);
  });
  serialWrites.set(action.id, next);
  return next;
}

export async function archiveSupplementaryOrder(order: ImportOrder): Promise<boolean> {
  if (order.tag !== 'supplementary') return true;
  const action: ArchiveAction = { kind: 'upsert', id: order.id, order };
  await storeSnapshotRecord({ id: order.id, kind: 'upsert', order, synced: false });
  const queued = await storePendingAction(action);
  if (!queued) {
    const saved = await sendAction(action);
    if (saved) {
      await markSnapshotSynced(order.id);
      return true;
    }
    scheduleRetry();
    return false;
  }
  return runSerial(action);
}

export async function removeSupplementaryOrderArchive(id: string): Promise<boolean> {
  const action: ArchiveAction = { kind: 'delete', id };
  await storeSnapshotRecord({ id, kind: 'delete', synced: false });
  const queued = await storePendingAction(action);
  if (!queued) {
    const removed = await sendAction(action);
    if (removed) {
      await removeSnapshotRecord(id);
      return true;
    }
    scheduleRetry();
    return false;
  }
  return runSerial(action);
}

export async function flushSupplementaryOrderArchiveQueue(): Promise<void> {
  if (flushing) return flushing;
  flushing = (async () => {
    const actions = await getPendingActions();
    let allSucceeded = true;
    for (const action of actions) {
      if (!(await runSerial(action))) allSucceeded = false;
    }
    if (allSucceeded) retryDelay = RETRY_BASE_MS;
    else scheduleRetry();
  })().finally(() => { flushing = null; });
  return flushing;
}

export async function loadSupplementaryOrderArchives(): Promise<ImportOrder[]> {
  await flushSupplementaryOrderArchiveQueue();
  const byId = new Map<string, ImportOrder>();
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('app_data')
      .select('value')
      .like('key', `${ARCHIVE_PREFIX}%`)
      .order('key')
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) {
      console.warn('Không tải được bản dự phòng đơn bổ sung:', error.message);
      break;
    }
    const page = (data || [])
      .map(row => row.value as ImportOrder)
      .filter(order => order && order.tag === 'supplementary' && typeof order.id === 'string');
    page.forEach(order => byId.set(order.id, order));
    if ((data || []).length < PAGE_SIZE) break;
  }

  // IndexedDB keeps a second, larger-than-localStorage copy for offline recovery.
  for (const record of await readSnapshotRecords()) {
    if (record.kind === 'upsert' && record.order.tag === 'supplementary') {
      byId.set(record.id, record.order);
    }
  }
  const pendingDeletes = new Set(
    (await getPendingActions()).filter(action => action.kind === 'delete').map(action => action.id),
  );
  return [...byId.values()].filter(order => !pendingDeletes.has(order.id));
}

export function mergeSupplementaryOrders(
  currentOrders: ImportOrder[],
  archivedOrders: ImportOrder[],
): ImportOrder[] {
  const currentIds = new Set(currentOrders.map(order => order.id));
  return [
    ...currentOrders,
    ...archivedOrders.filter(order => order.tag === 'supplementary' && !currentIds.has(order.id)),
  ];
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { void flushSupplementaryOrderArchiveQueue(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void flushSupplementaryOrderArchiveQueue();
  });
}