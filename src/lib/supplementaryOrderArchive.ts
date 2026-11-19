import type { ImportOrder } from '@/types';
import { supabase } from '@/lib/supabase';

const ARCHIVE_PREFIX = 'scp_supplementary_import_order_';
const QUEUE_KEY = 'scp_supplementary_import_archive_queue_v1';

type ArchiveAction =
  | { kind: 'upsert'; id: string; order: ImportOrder }
  | { kind: 'delete'; id: string };

const serialWrites = new Map<string, Promise<boolean>>();
let flushing: Promise<void> | null = null;

function readQueue(): Record<string, ArchiveAction> {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) as Record<string, ArchiveAction> : {};
  } catch {
    return {};
  }
}

function writeQueue(queue: Record<string, ArchiveAction>): void {
  try {
    if (Object.keys(queue).length === 0) localStorage.removeItem(QUEUE_KEY);
    else localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch (error) {
    console.warn('Không lưu được hàng chờ dự phòng đơn bổ sung trên thiết bị.', error);
  }
}

function queueAction(action: ArchiveAction): void {
  writeQueue({ ...readQueue(), [action.id]: action });
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
  const next = previous.catch(() => false).then(() => sendAction(action)).then(success => {
    if (success) {
      const queue = readQueue();
      const current = queue[action.id];
      if (current && JSON.stringify(current) === JSON.stringify(action)) {
        delete queue[action.id];
        writeQueue(queue);
      }
    }
    return success;
  }).finally(() => {
    if (serialWrites.get(action.id) === next) serialWrites.delete(action.id);
  });
  serialWrites.set(action.id, next);
  return next;
}

export function archiveSupplementaryOrder(order: ImportOrder): Promise<boolean> {
  if (order.tag !== 'supplementary') return Promise.resolve(true);
  const action: ArchiveAction = { kind: 'upsert', id: order.id, order };
  queueAction(action);
  return runSerial(action);
}

export function removeSupplementaryOrderArchive(id: string): Promise<boolean> {
  const action: ArchiveAction = { kind: 'delete', id };
  queueAction(action);
  return runSerial(action);
}

export async function flushSupplementaryOrderArchiveQueue(): Promise<void> {
  if (flushing) return flushing;
  flushing = (async () => {
    for (const action of Object.values(readQueue())) {
      await runSerial(action);
    }
  })().finally(() => { flushing = null; });
  return flushing;
}

export async function loadSupplementaryOrderArchives(): Promise<ImportOrder[]> {
  await flushSupplementaryOrderArchiveQueue();
  const { data, error } = await supabase
    .from('app_data')
    .select('value')
    .like('key', `${ARCHIVE_PREFIX}%`);
  if (error) {
    console.warn('Không tải được bản dự phòng đơn bổ sung:', error.message);
    return [];
  }
  return (data || [])
    .map(row => row.value as ImportOrder)
    .filter(order => order && order.tag === 'supplementary' && typeof order.id === 'string');
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