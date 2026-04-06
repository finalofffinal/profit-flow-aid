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
  parentUnit: string; // thùng, lốc, kg, bao...
  buyPrice: number; // giá nhập (VND) per parent unit
  sellPrice: number; // giá bán (VND) per parent unit
  netWeights: string[]; // khối lượng tịnh (multi-value)
  notes: string;
  // Child unit conversion
  hasChildUnit: boolean;
  childUnit: string; // chai, gói, cái...
  conversionRate: number; // 1 parent = N child
  // Computed (not stored)
  childBuyPrice?: number;
  childSellPrice?: number;
  childProfit?: number;
  childProfitPercent?: number;
  // Meta
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
  quarter: number; // 1-4
  year: number;
  targetRevenue: number;
  targetProfitPercent: number;
}

export type TabId = 'dashboard' | 'import' | 'inventory' | 'sales' | 'catalog';
