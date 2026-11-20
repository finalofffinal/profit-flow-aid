import type { ImportOrder } from '@/types';
import { supabase } from '@/lib/supabase';

const ARCHIVE_PREFIX = 'scp_supplementary_import_order_';
const LEGACY_QUEUE_KEY = 'scp_supplementary_import_archive_queue_v1';
const QUEUE_DB_NAME = 'scp-supplementary-order-archive';
const QUEUE_STORE_NAME = 'pending-actions';
const PAGE_SIZE = 1000;

type ArchiveAction =
  | { kind: 'upsert'; id: string; order: ImportOrder }
  | { kind: 'delete'; id: string };

const serialWrites = new Map<string, Promise<boolean>>();
let flushing: Promise<void> | null = null;
let queueDatabase: Promise<IDBDatabase | null> | null = null;

function openQueueDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (queueDatabase) return queueDatabase;
  queueDatabase = new Promise(resolve => {
    const request = indexedDB.open(QUEUE_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(QUEUE_STORE_NAME)) {
        db.createObjectStore(QUEUE_STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      console.warn('Không mở được hàng chờ lưu đơn bổ sung trên thiết bị.');
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

async function storePendingAction(action: ArchiveAction): Promise<boolean> {
  const db = await openQueueDatabase();
  if (db) {
    return new Promise(resolve => {
      const transaction = db.transaction(QUEUE_STORE_NAME, 'readwrite');
      transaction.objectStore(QUEUE_STORE_NAME).put(action);
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => resolve(false);
      transaction.onabort = () => resolve(false);
    });
  }

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

async function getPendingActions(): Promise<ArchiveAction[]> {
  const db = await openQueueDatabase();
  if (!db) return Object.values(readLegacyQueue());
  const stored = await new Promise<ArchiveAction[]>(resolve => {
    const request = db.transaction(QUEUE_STORE_NAME, 'readonly').objectStore(QUEUE_STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result as ArchiveAction[]);
    request.onerror = () => resolve([]);
  });

  const legacy = Object.values(readLegacyQueue());
  for (const action of legacy) await storePendingAction(action);
  try { localStorage.removeItem(LEGACY_QUEUE_KEY); } catch {}
  const byId = new Map(stored.map(action => [action.id, action]));
  legacy.forEach(action => byId.set(action.id, action));
  return [...byId.values()];
}

async function removePendingAction(id: string): Promise<void> {
  const db = await openQueueDatabase();
  if (db) {
    await new Promise<void>(resolve => {
      const transaction = db.transaction(QUEUE_STORE_NAME, 'readwrite');
      transaction.objectStore(QUEUE_STORE_NAME).delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
      transaction.onabort = () => resolve();
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
}

function runSerial(action: ArchiveAction): Promise<boolean> {
  const previous = serialWrites.get(action.id) || Promise.resolve(true);
  const next = previous.catch(() => false).then(() => sendAction(action)).then(async success => {
    if (success) await removePendingAction(action.id);
    return success;
  }).finally(() => {
    if (serialWrites.get(action.id) === next) serialWrites.delete(action.id);
  });
  serialWrites.set(action.id, next);
  return next;
}

export async function archiveSupplementaryOrder(order: ImportOrder): Promise<boolean> {
  if (order.tag !== 'supplementary') return true;
  const action: ArchiveAction = { kind: 'upsert', id: order.id, order };
  const queued = await storePendingAction(action);
  if (!queued) return false;
  return runSerial(action);
}

export async function removeSupplementaryOrderArchive(id: string): Promise<boolean> {
  const action: ArchiveAction = { kind: 'delete', id };
  const queued = await storePendingAction(action);
  if (!queued) return false;
  return runSerial(action);
}

export async function flushSupplementaryOrderArchiveQueue(): Promise<void> {
  if (flushing) return flushing;
  flushing = (async () => {
    for (const action of await getPendingActions()) await runSerial(action);
  })().finally(() => { flushing = null; });
  return flushing;
}

export async function loadSupplementaryOrderArchives(): Promise<ImportOrder[]> {
  await flushSupplementaryOrderArchiveQueue();
  const orders: ImportOrder[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('app_data')
      .select('value')
      .like('key', `${ARCHIVE_PREFIX}%`)
      .order('key')
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) {
      console.warn('Không tải được bản dự phòng đơn bổ sung:', error.message);
      return orders;
    }
    const page = (data || [])
      .map(row => row.value as ImportOrder)
      .filter(order => order && order.tag === 'supplementary' && typeof order.id === 'string');
    orders.push(...page);
    if ((data || []).length < PAGE_SIZE) return orders;
  }
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
}