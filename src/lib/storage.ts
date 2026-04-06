import { Product, Supplier, Notification, QuarterData } from '@/types';

const KEYS = {
  products: 'scp_products',
  suppliers: 'scp_suppliers',
  quarters: 'scp_quarters',
  notifications: 'scp_notifications',
  theme: 'scp_theme',
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
const DEFAULT_SUPPLIER: Supplier = { id: 'default', name: 'Khác', createdAt: new Date().toISOString() };
export const loadSuppliers = () => {
  const suppliers = load<Supplier[]>(KEYS.suppliers, [DEFAULT_SUPPLIER]);
  if (!suppliers.find(s => s.id === 'default')) {
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

// Backup / Restore
export function exportBackup(): string {
  return JSON.stringify({
    products: loadProducts(),
    suppliers: loadSuppliers(),
    quarters: loadQuarters(),
    notifications: loadNotifications(),
    exportedAt: new Date().toISOString(),
    version: '1.0',
  }, null, 2);
}

export function importBackup(json: string): boolean {
  try {
    const data = JSON.parse(json);
    if (data.products) saveProducts(data.products);
    if (data.suppliers) saveSuppliers(data.suppliers);
    if (data.quarters) saveQuarters(data.quarters);
    if (data.notifications) saveNotifications(data.notifications);
    return true;
  } catch {
    return false;
  }
}
