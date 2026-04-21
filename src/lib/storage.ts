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
  // Always save FULL data to Supabase (single source of truth).
  if (key !== KEYS.theme) saveToSupabase(key, data);

  // Locally, only persist a TRIMMED slice to keep localStorage ≤ 10%.
  try {
    const trimmed = trimForLocal(key, data);
    localStorage.setItem(key, JSON.stringify(trimmed));
  } catch (e) {
    console.warn('localStorage save failed (will rely on Supabase):', e);
    try {
      hardPurgeLocal();
      const trimmed = trimForLocal(key, data);
      localStorage.setItem(key, JSON.stringify(trimmed));
    } catch {}
  }
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

/**
 * Trim large datasets BEFORE writing to localStorage so we stay ≤ 10% capacity.
 * Full data still lives in Supabase — local is only a cache for fast UI rendering.
 */
export function trimForLocal<T>(key: string, data: T): T {
  if (!Array.isArray(data)) return data;
  const arr = data as unknown[];

  if (key === KEYS.notifications) {
    const list = arr as Notification[];
    const sorted = [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const unread = sorted.filter(n => !n.read).slice(0, 30);
    const read = sorted.filter(n => n.read).slice(0, 10);
    return [...unread, ...read] as unknown as T;
  }

  if (key === KEYS.importOrders || key === KEYS.salesOrders) {
    const list = arr as Array<{ date: string; deletedAt: string | null }>;
    const now = new Date();
    const curQ = Math.ceil((now.getMonth() + 1) / 3);
    const curY = now.getFullYear();
    const inWindow = (dateStr: string) => {
      const d = new Date(dateStr);
      const q = Math.ceil((d.getMonth() + 1) / 3);
      const y = d.getFullYear();
      if (y === curY && q === curQ) return true;
      if (y === curY && q === curQ - 1) return true;
      if (curQ === 1 && y === curY - 1 && q === 4) return true;
      return false;
    };
    return list.filter(o => !o.deletedAt && inWindow(o.date)) as unknown as T;
  }

  if (key === KEYS.inventoryBatches) {
    const list = arr as Array<{ quarter: number; year: number }>;
    const now = new Date();
    const curQ = Math.ceil((now.getMonth() + 1) / 3);
    const curY = now.getFullYear();
    return list.filter(b => b.year === curY && (b.quarter === curQ || b.quarter === curQ - 1)) as unknown as T;
  }

  return data;
}

function hardPurgeLocal() {
  try { localStorage.removeItem(KEYS.notifications); } catch {}
  try { localStorage.removeItem(KEYS.importOrders); } catch {}
  try { localStorage.removeItem(KEYS.salesOrders); } catch {}
  try { localStorage.removeItem(KEYS.inventoryBatches); } catch {}
}

function autoPurgeIfFull() {
  const usage = getStorageUsage();
  if (usage.percent <= 10) return;
  for (const key of [KEYS.notifications, KEYS.importOrders, KEYS.salesOrders, KEYS.inventoryBatches]) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const trimmed = trimForLocal(key, parsed);
      localStorage.setItem(key, JSON.stringify(trimmed));
    } catch {}
  }
  if (getStorageUsage().percent > 10) {
    hardPurgeLocal();
  }
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

/** Sync from Supabase → React state (full via custom event) + localStorage (trimmed). */
export async function syncFromSupabase(): Promise<Record<string, boolean>> {
  const result: Record<string, boolean> = {};
  await Promise.all(
    Object.entries(KEYS)
      .filter(([, k]) => k !== KEYS.theme)
      .map(async ([, key]) => {
        try {
          const data = await loadFromSupabase(key, null);
          if (data !== null) {
            // 1. Trim before persisting locally to keep ≤ 10%
            try {
              const trimmed = trimForLocal(key, data);
              localStorage.setItem(key, JSON.stringify(trimmed));
            } catch {}
            // 2. Push FULL data into React state via custom event
            window.dispatchEvent(new CustomEvent('supabase-initial-sync-data', {
              detail: { key, value: data },
            }));
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
