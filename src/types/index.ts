export interface Supplier {
  id: string;
  name: string;
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
  supplierId: string;
  parentUnit: string;
  buyPrice: number;
  sellPrice: number;
  netWeights: string[];
  notes: string;
  hasChildUnit: boolean;
  childUnit: string;
  conversionRate: number;
  childBuyPrice?: number;
  childSellPrice?: number;
  childProfit?: number;
  childProfitPercent?: number;
  stock: number;
  priceHistory: PriceHistoryEntry[];
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Notification {
  id: string;
  message: string;
  type: 'product_add' | 'product_delete' | 'price_update' | 'quarter_update' | 'info';
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

// ─── Data Engine Types ───────────────────────────────────────

export type OrderTag = 'auto' | 'special' | 'temporary';

export interface ImportOrderItem {
  productId: string;
  productName: string;
  supplierId: string;
  supplierName: string;
  parentUnit: string;
  childUnit: string;
  conversionRate: number;
  quantity: number; // in parent units
  buyPrice: number; // snapshot price per parent unit
  total: number;
}

export interface ImportOrder {
  id: string;
  supplierId: string;
  supplierName: string;
  date: string; // ISO date
  items: ImportOrderItem[];
  total: number;
  tag: OrderTag;
  locked: boolean;
  deletedAt: string | null;
  createdAt: string;
}

export interface InventoryBatch {
  id: string;
  importOrderId: string;
  productId: string;
  productName: string;
  supplierId: string;
  supplierName: string;
  parentUnit: string;
  quantity: number; // remaining in parent units
  originalQuantity: number;
  buyPrice: number; // snapshot
  date: string; // date entered inventory
  quarter: number;
  year: number;
}

export interface SaleItem {
  productId: string;
  productName: string;
  supplierId: string;
  childUnit: string;
  conversionRate: number;
  quantitySmall: number; // in smallest unit
  sellPrice: number; // per small unit (snapshot)
  buyPrice: number; // per small unit (COGS snapshot)
  total: number;
  profit: number;
  profitPercent: number;
}

export interface SaleOrder {
  id: string;
  date: string; // ISO date
  items: SaleItem[];
  totalRevenue: number;
  totalProfit: number;
  profitPercent: number;
  tag: OrderTag;
  paymentMethod: 'cash' | 'transfer';
  transferImages: string[]; // base64 compressed
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
