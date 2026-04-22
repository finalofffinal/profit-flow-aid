export interface Supplier {
  id: string;
  name: string;
  deletedAt: string | null;
  createdAt: string;
}

export interface PriceHistoryEntry {
  buyPrice: number;
  sellPrice: number;
  date: string;
}

export interface Product {
  id: string;
  name: string;
  brand: string;
  supplierId: string;
  unit: string;
  buyPrice: number;
  sellPrice: number;
  /** Giá nhập GỐC — auto generator dùng giá này. Catalog edit KHÔNG thay đổi. */
  baseBuyPrice?: number;
  /** Giá bán GỐC — auto generator dùng giá này. Catalog edit KHÔNG thay đổi. */
  baseSellPrice?: number;
  conversionRate: number;
  conversionUnit: string;
  netWeights: string[];
  notes: string;
  stock: number;
  priceHistory: PriceHistoryEntry[];
  /** Sort order within supplier group; lower = first. Optional for backwards compat. */
  order?: number;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Notification {
  id: string;
  message: string;
  type: 'product_add' | 'product_delete' | 'price_update' | 'quarter_update' | 'info' | 'warning' | 'success';
  read: boolean;
  createdAt: string;
}

export interface QuarterData {
  quarter: number;
  year: number;
  targetRevenue: number;
  targetProfitPercent: number; // legacy, unused in UI
  locked?: boolean;
}

export type TabId = 'dashboard' | 'import' | 'inventory' | 'sales' | 'catalog';

export type ImportTag = 'auto' | 'special' | 'supplementary' | 'upgraded';
export type PaymentMethod = 'cash' | 'transfer';
export type OrderTag = ImportTag;

export interface ImportOrderItem {
  productId: string;
  productName: string;
  supplierId: string;
  supplierName: string;
  unit: string;
  conversionUnit: string;
  conversionRate: number;
  quantity: number;
  buyPrice: number;
  total: number;
}

export interface ImportOrder {
  id: string;
  supplierId: string;
  supplierName: string;
  date: string;
  items: ImportOrderItem[];
  total: number;
  tag: ImportTag;
  locked: boolean;
  images: string[];
  deletedAt: string | null;
  createdAt: string;
}

export interface SaleItem {
  productId: string;
  productName: string;
  supplierId: string;
  unit: string;
  quantity: number;
  sellPrice: number;
  buyPrice: number;
  total: number;
  profit: number;
  profitPercent: number;
}

export interface SaleOrder {
  id: string;
  date: string;
  items: SaleItem[];
  totalRevenue: number;
  totalProfit: number;
  profitPercent: number;
  tag: ImportTag;
  paymentMethod: PaymentMethod;
  transferImages: string[];
  /** Khóa đơn auto: regen sẽ giữ nguyên đơn này, không thay/xóa */
  locked?: boolean;
  deletedAt: string | null;
  createdAt: string;
}

export interface DailySales {
  date: string;
  orders: SaleOrder[];
  totalRevenue: number;
  totalProfit: number;
  profitPercent: number;
}

export interface InventoryBatch {
  id: string;
  importOrderId: string;
  productId: string;
  productName: string;
  supplierId: string;
  supplierName: string;
  unit: string;
  quantity: number;
  originalQuantity: number;
  buyPrice: number;
  date: string;
  quarter: number;
  year: number;
}
