export const BUSINESS_INFO = {
  name: 'Hồ Thị Hoa',
  taxId: '079154014218',
  address: 'Chợ An Sương, 2421A đường Đỗ Mười, KP57, phường Đông Hưng Thuận, Quận 12, TPHCM',
  stall: 'Sạp số 61',
  industry: '4711 - Bán lẻ thực phẩm (Bán tạp hóa)',
  phone: '0938774411',
} as const;

export const SEASONAL_WEIGHTS: Record<number, number> = { 1: 0.28, 2: 0.18, 3: 0.20, 4: 0.34 };

export const PARENT_UNITS = ['Thùng', 'Lốc', 'Bịch', 'Hộp', 'Bao', 'Kg', 'Cái', 'Chai', 'Lon', 'Gói', 'Can'];
export const CHILD_UNITS = ['Chai', 'Lon', 'Gói', 'Hộp', 'Cái', 'Chiếc', 'Lạng (100g)', 'Cuộn', 'Vỉ', 'Túi', 'Cây', 'Quả', 'Ống', 'Thanh'];

export const MAX_YEARLY_REVENUE = 1_000_000_000; // 1 tỷ VND

/**
 * Ngưỡng SÀN cho tổng nhập hàng theo từng quý (so với targetRevenue của quý).
 * - Auto generator phải sinh đủ để tổng nhập (manual + auto) vượt sàn này.
 * - Q1 đặc biệt: nhập rất ít → có thêm trần Q1_CEILING_RATIO (không vượt 70%).
 * - Q2/Q3/Q4 không có trần.
 */
export const QUARTER_FLOOR_RATIO: Record<number, number> = {
  1: 0.60,
  2: 1.40,
  3: 1.10,
  4: 1.20,
};
export const Q1_CEILING_RATIO = 0.70;

export const VIETNAM_HOLIDAYS: Record<string, number> = {
  '01-01': 1.3,
  '04-30': 1.4,
  '05-01': 1.3,
  '09-02': 1.3,
};

export const IMPORT_TAG_LABELS: Record<string, string> = {
  auto: 'Tự động',
  supplementary: 'Bổ sung',
  // Legacy fallbacks (dữ liệu cũ)
  special: 'Bổ sung',
  upgraded: 'Bổ sung',
};

export const IMPORT_TAG_COLORS: Record<string, string> = {
  auto: 'bg-secondary text-secondary-foreground',
  supplementary: 'bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/30',
  // Legacy fallbacks
  special: 'bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/30',
  upgraded: 'bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/30',
};

export const PAYMENT_LABELS: Record<string, string> = {
  cash: '💵 Tiền mặt',
  transfer: '💳 Chuyển khoản',
};
