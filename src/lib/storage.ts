import { Product, Supplier, Notification, QuarterData, ImportOrder, SaleOrder, InventoryBatch } from '@/types';

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

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function save<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.error('Storage save failed:', e);
  }
}

// Products
export const loadProducts = () => load<Product[]>(KEYS.products, []);
export const saveProducts = (data: Product[]) => save(KEYS.products, data);

// Suppliers
const DEFAULT_SUPPLIER: Supplier = { id: 'default-khac', name: 'Khác', deletedAt: null, createdAt: new Date().toISOString() };
export const loadSuppliers = () => {
  const suppliers = load<Supplier[]>(KEYS.suppliers, [DEFAULT_SUPPLIER]);
  if (!suppliers.find(s => s.id === 'default-khac')) {
    suppliers.unshift(DEFAULT_SUPPLIER);
  }
  return suppliers;
};
export const saveSuppliers = (data: Supplier[]) => save(KEYS.suppliers, data);

// Quarters
export const loadQuarters = () => load<QuarterData[]>(KEYS.quarters, []);
export const saveQuarters = (data: QuarterData[]) => save(KEYS.quarters, data);

// Notifications
export const loadNotifications = () => load<Notification[]>(KEYS.notifications, []);
export const saveNotifications = (data: Notification[]) => save(KEYS.notifications, data);

// Theme
export const loadTheme = () => load<'light' | 'dark'>(KEYS.theme, 'light');
export const saveTheme = (theme: 'light' | 'dark') => save(KEYS.theme, theme);

// Import Orders
export const loadImportOrders = () => load<ImportOrder[]>(KEYS.importOrders, []);
export const saveImportOrders = (data: ImportOrder[]) => save(KEYS.importOrders, data);

// Sales Orders
export const loadSalesOrders = () => load<SaleOrder[]>(KEYS.salesOrders, []);
export const saveSalesOrders = (data: SaleOrder[]) => save(KEYS.salesOrders, data);

// Inventory Batches
export const loadInventoryBatches = () => load<InventoryBatch[]>(KEYS.inventoryBatches, []);
export const saveInventoryBatches = (data: InventoryBatch[]) => save(KEYS.inventoryBatches, data);

// Storage usage
export function getStorageUsage(): { used: number; total: number; percent: number } {
  let used = 0;
  for (const key of Object.values(KEYS)) {
    const item = localStorage.getItem(key);
    if (item) used += item.length * 2; // UTF-16
  }
  const total = 5 * 1024 * 1024; // 5MB typical
  return { used, total, percent: Math.round((used / total) * 100) };
}

// Backup / Restore
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
    version: '3.0',
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
  } catch {
    return false;
  }
}
