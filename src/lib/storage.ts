import { Product, Supplier, Notification, QuarterData, ImportOrder, SaleOrder, InventoryBatch } from '@/types';
import { saveToSupabase, loadFromSupabase } from '@/lib/supabase';

const KEYS = {
  products: 'scp_products',
  suppliers: 'scp_suppliers',
  quarters: 'scp_quarters',
  notifications: 'scp_notifications',
  theme: 'scp_theme',
  importOrders: 'scp_import_orders',
  salesOrders: 'scp_sales_orders',
  inventoryBatches: 'scp_inventory_batches',
} as const;

function loadLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function save<T>(key: string, data: T): void {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch (e) { console.error('localStorage save failed:', e); }
  if (key !== KEYS.theme) saveToSupabase(key, data);
  // Auto-purge when usage > 80% to keep storage healthy
  scheduleAutoPurge();
}

let purgeTimer: number | null = null;
function scheduleAutoPurge() {
  if (purgeTimer !== null) return;
  purgeTimer = window.setTimeout(() => {
    purgeTimer = null;
    try { autoPurgeIfFull(); } catch (e) { console.warn('Auto-purge failed:', e); }
  }, 1500);
}

/** Purge old read notifications + old soft-deleted import/sales orders when localStorage > 80%. */
function autoPurgeIfFull() {
  const usage = getStorageUsage();
  if (usage.percent < 80) return;

  // 1. Drop read notifications older than 7 days
  try {
    const raw = localStorage.getItem(KEYS.notifications);
    if (raw) {
      const list = JSON.parse(raw) as Notification[];
      const cutoff = Date.now() - 7 * 24 * 3600 * 1000;
      const kept = list.filter(n => !n.read || new Date(n.createdAt).getTime() > cutoff);
      if (kept.length < list.length) {
        localStorage.setItem(KEYS.notifications, JSON.stringify(kept));
        saveToSupabase(KEYS.notifications, kept);
      }
    }
  } catch {}

  // 2. Permanently remove soft-deleted import orders > 30 days
  try {
    const raw = localStorage.getItem(KEYS.importOrders);
    if (raw) {
      const list = JSON.parse(raw) as ImportOrder[];
      const cutoff = Date.now() - 30 * 24 * 3600 * 1000;
      const kept = list.filter(o => !o.deletedAt || new Date(o.deletedAt).getTime() > cutoff);
      if (kept.length < list.length) {
        localStorage.setItem(KEYS.importOrders, JSON.stringify(kept));
        saveToSupabase(KEYS.importOrders, kept);
      }
    }
  } catch {}

  // 3. Trim notifications to last 100
  try {
    const raw = localStorage.getItem(KEYS.notifications);
    if (raw) {
      const list = JSON.parse(raw) as Notification[];
      if (list.length > 100) {
        const sorted = [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        const kept = sorted.slice(0, 100);
        localStorage.setItem(KEYS.notifications, JSON.stringify(kept));
        saveToSupabase(KEYS.notifications, kept);
      }
    }
  } catch {}
}

export const loadProducts = () => loadLocal<Product[]>(KEYS.products, []);
export const saveProducts = (data: Product[]) => save(KEYS.products, data);

const DEFAULT_SUPPLIER: Supplier = { id: 'default-khac', name: 'Khác', deletedAt: null, createdAt: new Date().toISOString() };
export const loadSuppliers = () => {
  const suppliers = loadLocal<Supplier[]>(KEYS.suppliers, [DEFAULT_SUPPLIER]);
  if (!suppliers.find(s => s.id === 'default-khac')) suppliers.unshift(DEFAULT_SUPPLIER);
  return suppliers;
};
export const saveSuppliers = (data: Supplier[]) => save(KEYS.suppliers, data);

export const loadQuarters = () => loadLocal<QuarterData[]>(KEYS.quarters, []);
export const saveQuarters = (data: QuarterData[]) => save(KEYS.quarters, data);

export const loadNotifications = () => loadLocal<Notification[]>(KEYS.notifications, []);
export const saveNotifications = (data: Notification[]) => save(KEYS.notifications, data);

export const loadTheme = () => loadLocal<'light' | 'dark'>(KEYS.theme, 'light');
export const saveTheme = (theme: 'light' | 'dark') => save(KEYS.theme, theme);

export const loadImportOrders = () => loadLocal<ImportOrder[]>(KEYS.importOrders, []);
export const saveImportOrders = (data: ImportOrder[]) => save(KEYS.importOrders, data);

export const loadSalesOrders = () => loadLocal<SaleOrder[]>(KEYS.salesOrders, []);
export const saveSalesOrders = (data: SaleOrder[]) => save(KEYS.salesOrders, data);

export const loadInventoryBatches = () => loadLocal<InventoryBatch[]>(KEYS.inventoryBatches, []);
export const saveInventoryBatches = (data: InventoryBatch[]) => save(KEYS.inventoryBatches, data);

/** Sync from Supabase → localStorage. Returns map of keys that had remote data. */
export async function syncFromSupabase(): Promise<Record<string, boolean>> {
  const result: Record<string, boolean> = {};
  await Promise.all(
    Object.entries(KEYS)
      .filter(([, k]) => k !== KEYS.theme)
      .map(async ([, key]) => {
        try {
          const data = await loadFromSupabase(key, null);
          if (data !== null) {
            localStorage.setItem(key, JSON.stringify(data));
            result[key] = true;
          }
        } catch { /* offline ok */ }
      })
  );
  return result;
}

export interface StorageBreakdown {
  key: string;
  label: string;
  bytes: number;
  count: number;
}

const LABELS: Record<string, string> = {
  scp_products: 'Sản phẩm',
  scp_suppliers: 'Nhà cung cấp',
  scp_quarters: 'Mục tiêu quý',
  scp_notifications: 'Thông báo',
  scp_import_orders: 'Đơn nhập hàng',
  scp_sales_orders: 'Đơn bán hàng',
  scp_inventory_batches: 'Lô hàng tồn kho',
};

export function getStorageUsage(): {
  used: number; total: number; percent: number; breakdown: StorageBreakdown[];
} {
  let used = 0;
  const breakdown: StorageBreakdown[] = [];
  for (const key of Object.values(KEYS)) {
    if (key === KEYS.theme) continue;
    const item = localStorage.getItem(key);
    const bytes = item ? item.length * 2 : 0;
    used += bytes;
    let count = 0;
    try { if (item) count = (JSON.parse(item) as unknown[])?.length || 0; } catch {}
    breakdown.push({ key, label: LABELS[key] || key, bytes, count });
  }
  breakdown.sort((a, b) => b.bytes - a.bytes);
  const total = 5 * 1024 * 1024;
  return { used, total, percent: Math.round((used / total) * 100), breakdown };
}

export function exportBackup(): string {
  return JSON.stringify({
    products: loadProducts(),
    suppliers: loadSuppliers(),
    quarters: loadQuarters(),
    notifications: loadNotifications(),
    importOrders: loadImportOrders(),
    salesOrders: loadSalesOrders(),
    inventoryBatches: loadInventoryBatches(),
    exportedAt: new Date().toISOString(),
    version: '4.0',
  }, null, 2);
}

export function importBackup(json: string): boolean {
  try {
    const data = JSON.parse(json);
    if (data.products) saveProducts(data.products);
    if (data.suppliers) saveSuppliers(data.suppliers);
    if (data.quarters) saveQuarters(data.quarters);
    if (data.notifications) saveNotifications(data.notifications);
    if (data.importOrders) saveImportOrders(data.importOrders);
    if (data.salesOrders) saveSalesOrders(data.salesOrders);
    if (data.inventoryBatches) saveInventoryBatches(data.inventoryBatches);
    return true;
  } catch { return false; }
}
