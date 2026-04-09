export interface Supplier {
  id: string;
  name: string;
  deletedAt: string | null;
  createdAt: string;
}

export interface PriceHistoryEntry {
  buyPrice: number;
  sellPrice: number;
  date: string; // user-selected date, NOT auto
}

export interface Product {
  id: string;
  name: string;
  brand: string;
  supplierId: string;
  unit: string; // parent unit: Thùng, Lốc, Kg...
  buyPrice: number;
  sellPrice: number;
  conversionRate: number; // child units per parent (default 1)
  conversionUnit: string; // child unit name
  netWeights: string[];
  notes: string;
  stock: number;
  priceHistory: PriceHistoryEntry[];
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
  targetProfitPercent: number;
}

export type TabId = 'dashboard' | 'import' | 'inventory' | 'sales' | 'catalog';

// ─── Orders ───────────────────────────────────────
export type OrderTag = 'auto' | 'special' | 'temporary';
export type PaymentMethod = 'cash' | 'transfer';

export interface ImportOrderItem {
  productId: string;
  productName: string;
  supplierId: string;
  supplierName: string;
  unit: string;
  conversionUnit: string;
  conversionRate: number;
  quantity: number; // parent units
  buyPrice: number; // per parent unit snapshot
  total: number;
}

export interface ImportOrder {
  id: string;
  supplierId: string;
  supplierName: string;
  date: string;
  items: ImportOrderItem[];
  total: number;
  tag: OrderTag;
  locked: boolean;
  deletedAt: string | null;
  createdAt: string;
}

export interface SaleItem {
  productId: string;
  productName: string;
  supplierId: string;
  unit: string; // sell unit (child or parent)
  quantity: number;
  sellPrice: number; // per unit snapshot
  buyPrice: number; // per unit snapshot (cost)
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
  tag: OrderTag;
  paymentMethod: PaymentMethod;
  transferImages: string[];
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
