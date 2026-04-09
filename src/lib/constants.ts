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

export const VIETNAM_HOLIDAYS: Record<string, string> = {
  '01-01': 'Tết Dương lịch',
  '04-30': 'Giải phóng miền Nam',
  '05-01': 'Quốc tế Lao động',
  '09-02': 'Quốc khánh',
};
