import { Product, Supplier, QuarterData, ImportOrder, ImportOrderItem, SaleOrder, SaleItem, InventoryBatch } from '@/types';
import { getLunarParts } from '@/lib/lunar';
import { QUARTER_FLOOR_RATIO, Q1_CEILING_RATIO } from '@/lib/constants';

export const DATA_ENGINE_VERSION = '2026-05-22-quarter-floor-v1';

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function getDaysInQuarter(q: number, year: number): string[] {
  const startMonth = (q - 1) * 3;
  const days: string[] = [];
  for (let m = startMonth; m < startMonth + 3; m++) {
    const daysInMonth = new Date(year, m + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const yyyy = year;
      const mm = String(m + 1).padStart(2, '0');
      const dd = String(d).padStart(2, '0');
      days.push(`${yyyy}-${mm}-${dd}`);
    }
  }
  return days;
}

/** Round revenue values to nearest 1000 VND. */
function roundRevenue(value: number): number {
  return Math.round(value / 1000) * 1000;
}

/** Tet closed days (Mùng 1-6 Âm lịch) -> doanh thu = 0, hiển thị "Nghỉ Tết" */
function isTetClosedDay(dateStr: string): boolean {
  const d = new Date(dateStr);
  const lunar = getLunarParts(d);
  return lunar.month === 1 && lunar.day >= 1 && lunar.day <= 6;
}

/** Get "Nghỉ mùng X Tết Âm lịch" label for closed Tet day. */
export function getTetClosedLabel(dateStr: string): string | null {
  const d = new Date(dateStr);
  const lunar = getLunarParts(d);
  if (lunar.month === 1 && lunar.day >= 1 && lunar.day <= 6) {
    return `Nghỉ mùng ${lunar.day} Tết Âm lịch`;
  }
  return null;
}

/**
 * Doanh thu mỗi ngày phải KHÁC BIỆT RÕ — không quá đều.
 * Cuối tuần KHÔNG mặc định cao bất thường, đôi khi còn thấp hơn ngày thường (mưa, vắng).
 */
function getRevenueWeight(dateStr: string, rand: () => number): number {
  if (isTetClosedDay(dateStr)) return 0;

  const d = new Date(dateStr);
  const dow = d.getDay();
  const day = d.getDate();
  const month = d.getMonth() + 1;
  const mmdd = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const lunar = getLunarParts(d);

  // Phân phối dàn trải: đa số ngày quanh trung bình, đỉnh nhẹ vào T7/CN.
  // Hạn chế ngày quá thấp (<0.80) và ngày quá cao (>1.25) để tránh bất thường.
  let weeklyBoost: number;
  const r = rand();
  if (dow === 0 || dow === 6) {
    // Cuối tuần: 35% nhỉnh hơn, 60% bình thường, 5% hơi thấp
    if (r < 0.35) weeklyBoost = 1.08 + rand() * 0.15;       // 1.08–1.23
    else if (r < 0.95) weeklyBoost = 0.92 + rand() * 0.14;  // 0.92–1.06
    else weeklyBoost = 0.82 + rand() * 0.08;                // 0.82–0.90
  } else {
    // Ngày thường: phân bổ hẹp quanh 1.0
    if (r < 0.10) weeklyBoost = 1.04 + rand() * 0.08;       // 1.04–1.12 (hiếm)
    else if (r < 0.85) weeklyBoost = 0.90 + rand() * 0.14;  // 0.90–1.04
    else weeklyBoost = 0.80 + rand() * 0.10;                // 0.80–0.90
  }

  let monthlyWeight = 1.0;
  if (day <= 5) monthlyWeight = 1.06;
  else if (day <= 10) monthlyWeight = 1.03;
  else if (day <= 20) monthlyWeight = 1.0;
  else if (day <= 25) monthlyWeight = 0.97;
  else monthlyWeight = 0.93;

  let holidayBoost = 1.0;
  if (lunar.month === 12 && lunar.day >= 15 && lunar.day <= 19) holidayBoost = 1.10;
  if (lunar.month === 12 && lunar.day >= 20 && lunar.day <= 24) holidayBoost = 1.20 + (lunar.day - 20) * 0.03;
  if (lunar.month === 12 && lunar.day >= 25) holidayBoost = 1.40 + (lunar.day - 25) * 0.04;
  if (lunar.month === 1 && lunar.day >= 7 && lunar.day <= 15) holidayBoost = 1.07;
  if ((lunar.month === 1 || lunar.month === 7) && lunar.day >= 13 && lunar.day <= 15) {
    holidayBoost = Math.max(holidayBoost, 1.12);
  }
  if (mmdd === '04-30' || mmdd === '05-01') holidayBoost = Math.max(holidayBoost, 1.18);
  if (mmdd === '09-01' || mmdd === '09-02') holidayBoost = Math.max(holidayBoost, 1.12);
  if (lunar.month === 8 && lunar.day >= 10 && lunar.day <= 15) holidayBoost = Math.max(holidayBoost, 1.12);
  if (month === 12 && day >= 22) holidayBoost = Math.max(holidayBoost, 1.10 + (day - 22) * 0.015);

  // Nhiễu nhẹ ±8% — tránh ngày bất thường, vẫn giữ vẻ ngẫu nhiên
  const noise = 0.92 + rand() * 0.16;
  return weeklyBoost * monthlyWeight * holidayBoost * noise;
}

/**
 * Phân bổ doanh thu theo trọng số sao cho TỔNG = totalRevenue chính xác.
 * Closed days (Tet mùng 1-6) = 0.
 */
function generateDailyRevenue(days: string[], totalRevenue: number, rand: () => number): Map<string, number> {
  const map = new Map<string, number>();
  const weights: number[] = [];
  let weightSum = 0;

  for (const day of days) {
    const w = getRevenueWeight(day, rand);
    weights.push(w);
    weightSum += w;
  }

  if (weightSum === 0) {
    days.forEach(d => map.set(d, 0));
    return map;
  }

  // Clamp + làm mượt: kéo các ngày về [0.78×, 1.25×] trung bình của ngày mở cửa
  const openIdx: number[] = [];
  for (let i = 0; i < weights.length; i++) if (weights[i] > 0) openIdx.push(i);
  if (openIdx.length > 0) {
    const avg0 = weightSum / openIdx.length;
    const minW = avg0 * 0.78;
    const maxW = avg0 * 1.25;
    for (const i of openIdx) {
      if (weights[i] < minW) weights[i] = minW;
      else if (weights[i] > maxW) weights[i] = maxW;
    }
    // Làm mượt 2 lượt: mỗi ngày = 0.6 * chính nó + 0.2 * trước + 0.2 * sau (chỉ áp dụng ngày mở cửa)
    for (let pass = 0; pass < 2; pass++) {
      const next = weights.slice();
      for (let k = 0; k < openIdx.length; k++) {
        const i = openIdx[k];
        const prev = k > 0 ? weights[openIdx[k - 1]] : weights[i];
        const after = k < openIdx.length - 1 ? weights[openIdx[k + 1]] : weights[i];
        next[i] = weights[i] * 0.6 + prev * 0.2 + after * 0.2;
      }
      for (const i of openIdx) weights[i] = next[i];
    }
    // Tính lại weightSum
    weightSum = 0;
    for (const w of weights) weightSum += w;
  }

  let allocated = 0;
  let lastNonZeroIdx = -1;
  for (let i = 0; i < days.length; i++) {
    if (weights[i] === 0) {
      map.set(days[i], 0);
      continue;
    }
    const raw = (weights[i] / weightSum) * totalRevenue;
    const amount = Math.max(50000, Math.round(raw / 1000) * 1000);
    map.set(days[i], amount);
    allocated += amount;
    lastNonZeroIdx = i;
  }
  if (lastNonZeroIdx >= 0) {
    const diff = totalRevenue - allocated;
    const cur = map.get(days[lastNonZeroIdx]) || 0;
    map.set(days[lastNonZeroIdx], Math.max(0, cur + diff));
  }

  return map;
}

export interface GeneratedData {
  importOrders: ImportOrder[];
  salesOrders: SaleOrder[];
  inventoryBatches: InventoryBatch[];
}

// ============================================================================
// SUPPLIER RULES
// ============================================================================

interface SupplierRuleResult {
  ordersCount: [number, number];
  fixedOrdersCount?: number;
  maxQtyPerProduct?: (product: Product) => number | undefined;
  maxQtyPerQuarter?: (product: Product) => number | undefined;
  minQtyPerOrder?: (product: Product) => number | undefined;
  /** Số lượng CỐ ĐỊNH mỗi đơn (nếu set thì qty = giá trị này, ko ngẫu nhiên) */
  fixedQtyPerOrder?: (product: Product) => number | undefined;
  excludeProduct?: (product: Product) => boolean;
  allowedProducts?: (product: Product) => boolean;
  minItemsPerOrder?: number;
  preferUniquePerQuarter?: boolean;
  uniqueAcrossOrders?: boolean;
  /** Mỗi đơn PHẢI chứa TẤT CẢ sản phẩm eligible (Đường, Đậu) */
  requireAllInEveryOrder?: boolean;
  /** SP phải dồn toàn bộ qty (maxQtyPerQuarter) vào DUY NHẤT 1 đơn (TADA Aji-Mayo, Xì dầu đặc biệt, Sốt hải sản) */
  singleOrderProducts?: (product: Product) => boolean;
  /** SP phải phân phối vào số đơn cố định (HPV Shiitake = 2 đơn × 10) */
  splitAcrossOrders?: (product: Product) => { orders: number; qtyEach: number } | undefined;
  manualOnly?: boolean;
}

// Helper: name matching (case-insensitive)
const nm = (name: string, ...patterns: string[]): boolean => {
  const ln = name.toLowerCase();
  return patterns.some(p => ln.includes(p.toLowerCase()));
};

function getSupplierRule(supplierName: string): SupplierRuleResult {
  const n = supplierName.toLowerCase();
  const has = (s: string) => n.includes(s.toLowerCase());

  // ===== HPV: 3-5 đơn/quý, whitelist =====
  if (has('hpv')) {
    const isAllowed = (p: Product) => {
      const ln = p.name.toLowerCase();
      return nm(ln, 'hạt nêm 1,8', 'hạt nêm 1.8', 'hat nem 1.8', 'hat nem 1,8')
        || nm(ln, 'shiitake')
        || nm(ln, 'xúc xích', 'xuc xich', 'bin & bon', 'bin&bon', 'bin bon')
        || nm(ln, 'nam ngư 750', 'nam ngu 750')
        || nm(ln, 'đệ nhị', 'de nhi')
        || nm(ln, 'siêu tiết kiệm 5l', 'sieu tiet kiem 5l')
        || nm(ln, 'nhất ca', 'nhat ca')
        || nm(ln, 'nhị ca', 'nhi ca')
        || nm(ln, 'tương ớt 500ml', 'tuong ot 500ml');
    };
    return {
      ordersCount: [5, 5],
      fixedOrdersCount: 5,
      allowedProducts: isAllowed,
      maxQtyPerQuarter: (p) => {
        const ln = p.name.toLowerCase();
        if (nm(ln, 'hạt nêm 1,8', 'hạt nêm 1.8', 'hat nem 1.8', 'hat nem 1,8')) return 1;
        if (nm(ln, 'shiitake')) return 20;
        if (nm(ln, 'xúc xích', 'xuc xich', 'bin & bon', 'bin&bon')) return 20;
        if (nm(ln, 'nhất ca', 'nhat ca')) return 1;
        return undefined;
      },
      maxQtyPerProduct: (p) => {
        const ln = p.name.toLowerCase();
        if (nm(ln, 'nam ngư 750', 'nam ngu 750')) return 3;
        if (nm(ln, 'đệ nhị', 'de nhi')) return 3;
        if (nm(ln, 'siêu tiết kiệm 5l', 'sieu tiet kiem 5l')) return 2;
        if (nm(ln, 'nhị ca', 'nhi ca')) return 3;
        if (nm(ln, 'tương ớt 500ml', 'tuong ot 500ml')) return 3;
        if (nm(ln, 'shiitake')) return 10;
        if (nm(ln, 'xúc xích', 'xuc xich', 'bin & bon', 'bin&bon')) return 10;
        return undefined;
      },
      minQtyPerOrder: (p) => {
        const ln = p.name.toLowerCase();
        if (nm(ln, 'xúc xích', 'xuc xich', 'bin & bon', 'bin&bon')) return 5;
        return undefined;
      },
      // Shiitake: bắt buộc 2 đơn × 10
      splitAcrossOrders: (p) => {
        const ln = p.name.toLowerCase();
        if (nm(ln, 'shiitake')) return { orders: 2, qtyEach: 10 };
        return undefined;
      },
    };
  }

  if (has('bánh tráng') || has('banh trang')) {
    return {
      ordersCount: [1, 1],
      fixedOrdersCount: 1,
      allowedProducts: (p) => {
        const ln = p.name.toLowerCase();
        if (nm(ln, 'vuông', 'vuong')) return true;
        if (nm(ln, 'tròn', 'tron')) return nm(ln, 'lớn', 'lon', '(lớn)', '(lon)');
        return false;
      },
      maxQtyPerQuarter: () => 2,
      maxQtyPerProduct: () => 2,
    };
  }

  if (has('đường') || has('duong')) {
    return {
      ordersCount: [3, 3],
      fixedOrdersCount: 3,
      requireAllInEveryOrder: true,
      allowedProducts: (p) => nm(p.name, 'đường trắng bao', 'duong trang bao',
        'đường trắng đóng gói', 'duong trang dong goi',
        'đường mía', 'duong mia', 'phèn viên', 'phen vien'),
      maxQtyPerProduct: (p) => {
        if (nm(p.name, 'đường trắng bao', 'duong trang bao')) return 2;
        if (nm(p.name, 'phèn viên', 'phen vien')) return 3;
        return 1;
      },
    };
  }

  // Mắm (NCC tên "mắm" — không phải Mỹ Nga/Liên Thành/Chấn Hưng)
  if ((has('mắm') || has('mam')) && !has('mỹ nga') && !has('my nga')
      && !has('liên thành') && !has('lien thanh') && !has('chấn hưng') && !has('chan hung')) {
    return {
      ordersCount: [2, 2],
      fixedOrdersCount: 2,
      minItemsPerOrder: 4,
      allowedProducts: (p) => nm(p.name, 'ruốc', 'ruoc', 'tôm bắc', 'tom bac', 'nêm', 'nem'),
      maxQtyPerQuarter: (p) => {
        const ln = p.name.toLowerCase();
        if (nm(ln, 'ruốc nhỏ', 'ruoc nho')) return 2;
        if (nm(ln, 'ruốc trung', 'ruoc trung')) return 3;
        if (nm(ln, 'ruốc lớn', 'ruoc lon')) return 5;
        if (nm(ln, 'tôm bắc nhỏ', 'tom bac nho')) return 1;
        if (nm(ln, 'tôm bắc lớn', 'tom bac lon')) return 2;
        if (nm(ln, 'nêm nhỏ', 'nem nho')) return 3;
        if (nm(ln, 'nêm lớn', 'nem lon')) return 4;
        return undefined;
      },
      maxQtyPerProduct: (p) => {
        const ln = p.name.toLowerCase();
        if (nm(ln, 'ruốc lớn', 'ruoc lon')) return 3;
        if (nm(ln, 'nêm lớn', 'nem lon')) return 3;
        if (nm(ln, 'ruốc trung', 'ruoc trung', 'nêm nhỏ', 'nem nho')) return 2;
        return 2;
      },
    };
  }

  if (has('giấm') || has('giam')) {
    return {
      ordersCount: [2, 2],
      fixedOrdersCount: 2,
      allowedProducts: (p) => nm(p.name, 'tinh luyện', 'tinh luyen', 'nuôi', 'nuoi', 'cốt', 'cot'),
      maxQtyPerQuarter: (p) => {
        const ln = p.name.toLowerCase();
        if (nm(ln, 'tinh luyện', 'tinh luyen')) return 4;
        if (nm(ln, 'nuôi', 'nuoi')) return 2;
        if (nm(ln, 'cốt', 'cot')) return 10;
        return undefined;
      },
      maxQtyPerProduct: (p) => {
        const ln = p.name.toLowerCase();
        if (nm(ln, 'cốt', 'cot')) return 6;
        if (nm(ln, 'tinh luyện', 'tinh luyen')) return 3;
        return 2;
      },
    };
  }

  if (has('vĩnh thuận') || has('vinh thuan')) {
    return { ordersCount: [0, 0], manualOnly: true };
  }

  if (has('sen việt') || has('sen viet')) {
    return {
      ordersCount: [2, 2],
      fixedOrdersCount: 2,
      minItemsPerOrder: 4,
      allowedProducts: (p) => nm(p.name, 'bột chiên giòn', 'bot chien gion',
        'bơ thực vật 1kg', 'bo thuc vat 1kg', 'dầu nành', 'dau nanh'),
      maxQtyPerQuarter: (p) => {
        const ln = p.name.toLowerCase();
        if (nm(ln, 'bột chiên giòn 1kg', 'bot chien gion 1kg')) return 2;
        if (nm(ln, 'bột chiên giòn 150', 'bot chien gion 150')) return 2;
        if (nm(ln, 'bơ thực vật 1kg', 'bo thuc vat 1kg')) return 2;
        if (nm(ln, 'dầu nành 1l', 'dau nanh 1l')) return 3;
        if (nm(ln, 'dầu nành 2l', 'dau nanh 2l')) return 3;
        return undefined;
      },
      maxQtyPerProduct: () => 2,
    };
  }

  if (has('đậu') || has('dau')) {
    return {
      ordersCount: [1, 1],
      fixedOrdersCount: 1,
      requireAllInEveryOrder: true,
      allowedProducts: (p) => nm(p.name, 'đậu', 'dau', 'điều màu', 'dieu mau'),
      fixedQtyPerOrder: (p) => {
        const ln = p.name.toLowerCase();
        if (nm(ln, 'đậu đen', 'dau den')) return 2;
        if (nm(ln, 'đậu đỏ', 'dau do')) return 1;
        if (nm(ln, 'đậu xanh hột', 'dau xanh hot')) return 1;
        if (nm(ln, 'đậu xanh tróc vỏ', 'dau xanh troc vo')) return 2;
        if (nm(ln, 'đậu xanh nửa vàng', 'dau xanh nua vang')) return 1;
        if (nm(ln, 'đậu phộng nhỏ', 'dau phong nho')) return 2;
        if (nm(ln, 'điều màu', 'dieu mau')) return 10;
        return 1;
      },
      maxQtyPerProduct: () => 10,
    };
  }

  if (has('cô lan') || has('co lan')) {
    return {
      ordersCount: [1, 1],
      fixedOrdersCount: 1,
      requireAllInEveryOrder: true,
      allowedProducts: (p) => nm(p.name, 'bún tàu', 'bun tau', 'miến dong', 'mien dong', 'măng', 'mang'),
      fixedQtyPerOrder: (p) => {
        const ln = p.name.toLowerCase();
        if (nm(ln, 'bún tàu', 'bun tau')) return 1;
        if (nm(ln, 'miến dong', 'mien dong')) return 10;
        if (nm(ln, 'măng', 'mang')) return 2;
        return 1;
      },
      maxQtyPerProduct: () => 10,
    };
  }

  if (has('mỹ nga') || has('my nga')) {
    return {
      ordersCount: [1, 1],
      fixedOrdersCount: 1,
      allowedProducts: (p) => nm(p.name, '800ml', '800 ml'),
      fixedQtyPerOrder: () => 3,
      maxQtyPerProduct: () => 3,
    };
  }

  if (has('liên thành') || has('lien thanh')) {
    return {
      ordersCount: [1, 1],
      fixedOrdersCount: 1,
      requireAllInEveryOrder: true,
      allowedProducts: (p) => nm(p.name, 'mắm chay', 'mam chay', 'nhãn vàng', 'nhan vang'),
      fixedQtyPerOrder: () => 1,
      maxQtyPerProduct: () => 1,
    };
  }

  if (has('huy hoàng') || has('huy hoang')) {
    return {
      ordersCount: [1, 1],
      fixedOrdersCount: 1,
      allowedProducts: (p) => nm(p.name, 'bún tươi', 'bun tuoi'),
      fixedQtyPerOrder: () => 10,
      maxQtyPerProduct: () => 10,
    };
  }

  if (has('chấn hưng') || has('chan hung')) {
    return {
      ordersCount: [1, 1],
      fixedOrdersCount: 1,
      allowedProducts: (p) => nm(p.name, 'mắm nêm pha', 'mam nem pha', '170ml'),
      fixedQtyPerOrder: () => 1,
      maxQtyPerProduct: () => 1,
    };
  }

  if (has('tada')) {
    const isAllowed = (p: Product) => {
      const ln = p.name.toLowerCase();
      return nm(ln, 'tương ớt 700', 'tuong ot 700',
        'tương đen 700', 'tuong den 700',
        'tương ớt 5l', 'tuong ot 5l',
        'tương đen 5l', 'tuong den 5l',
        'lẩu thái', 'lau thai',
        'dầu giấm', 'dau giam',
        'sốt lẩu chua hải sản', 'sot lau chua hai san',
        'sa tế tôm', 'sa te tom',
        'tương đen', 'tuong den',
        'dầu hào', 'dau hao',
        'nấm mèo', 'nam meo',
        'nấm đông cô', 'nam dong co',
        'thanh dịu', 'thanh diu',
        'đậm đặc', 'dam dac',
        'sốt xá xíu', 'sot xa xiu',
        'sốt thịt nướng', 'sot thit nuong',
        'ớt sa tế 150', 'ot sa te 150',
        'ớt khô sa tế', 'ot kho sa te',
        'hương việt', 'huong viet',
        'xì dầu đặc biệt', 'xi dau dac biet',
        'sốt hải sản', 'sot hai san',
        'chao',
        'hạt nêm nấm hương', 'hat nem nam huong',
        'aji-mayo', 'mayonnaise',
        'sườn kí', 'suon ki',
        'tương hột', 'tuong hot',
        'tương ớt 830', 'tuong ot 830',
        'bột chiên xù 1kg', 'bot chien xu 1kg');
    };
    return {
      ordersCount: [6, 8],
      minItemsPerOrder: 6,
      allowedProducts: isAllowed,
      singleOrderProducts: (p) => {
        const ln = p.name.toLowerCase();
        return nm(ln, 'aji-mayo', 'mayonnaise')
          || nm(ln, 'xì dầu đặc biệt', 'xi dau dac biet')
          || nm(ln, 'sốt hải sản', 'sot hai san');
      },
      maxQtyPerProduct: (p) => {
        const ln = p.name.toLowerCase();
        if (nm(ln, 'aji-mayo', 'mayonnaise')) return 10;
        if (nm(ln, 'xì dầu đặc biệt', 'xi dau dac biet')) return 5;
        if (nm(ln, 'sốt hải sản', 'sot hai san')) return 5;
        if (nm(ln, 'tương ớt 700', 'tuong ot 700')) return 3;
        if (nm(ln, 'tương đen 700', 'tuong den 700')) return 3;
        if (nm(ln, 'tương ớt 5l', 'tuong ot 5l')) return 3;
        if (nm(ln, 'lẩu thái', 'lau thai')) return 4;
        if (nm(ln, 'dầu giấm', 'dau giam')) return 4;
        if (nm(ln, 'sa tế tôm 90', 'sa te tom 90')) return 4;
        if (nm(ln, 'sa tế tôm 450', 'sa te tom 450')) return 2;
        if (nm(ln, 'dầu hào 350', 'dau hao 350')) return 2;
        if (nm(ln, 'nấm mèo', 'nam meo')) return 5;
        if (nm(ln, 'nấm đông cô', 'nam dong co')) return 3;
        if (nm(ln, 'sốt thịt nướng gói 70', 'sot thit nuong goi 70')) return 2;
        if (nm(ln, 'hương việt', 'huong viet')) return 3;
        return 2;
      },
      maxQtyPerQuarter: (p) => {
        const ln = p.name.toLowerCase();
        if (nm(ln, 'tương đen 5l', 'tuong den 5l')) return 1;
        if (nm(ln, 'sốt lẩu chua hải sản', 'sot lau chua hai san')) return 2;
        if (nm(ln, 'thanh dịu', 'thanh diu', 'đậm đặc', 'dam dac')) return 2;
        if (nm(ln, 'sốt xá xíu', 'sot xa xiu')) return 2;
        if (nm(ln, 'sốt thịt nướng hủ 200', 'sot thit nuong hu 200')) return 4;
        if (nm(ln, 'ớt sa tế 150', 'ot sa te 150', 'ớt khô sa tế', 'ot kho sa te')) return 1;
        if (nm(ln, 'dầu hào 820', 'dau hao 820')) return 3;
        if (nm(ln, 'xì dầu đặc biệt', 'xi dau dac biet')) return 5;
        if (nm(ln, 'sốt hải sản', 'sot hai san')) return 5;
        if (nm(ln, 'chao')) return 1;
        if (nm(ln, 'hạt nêm nấm hương', 'hat nem nam huong')) return 1;
        if (nm(ln, 'aji-mayo', 'mayonnaise')) return 10;
        if (nm(ln, 'sườn kí', 'suon ki')) return 2;
        if (nm(ln, 'tương hột 250', 'tuong hot 250')) return 6;
        if (nm(ln, 'tương ớt 830', 'tuong ot 830')) return 2;
        if (nm(ln, 'bột chiên xù 1kg', 'bot chien xu 1kg')) return 2;
        if (nm(ln, 'tương đen', 'tuong den') && !nm(ln, '700', '5l')) return 2;
        return undefined;
      },
    };
  }

  if (has('địa đạo') || has('dia dao')) {
    const isAllowed = (p: Product) => {
      const ln = p.name.toLowerCase();
      return nm(ln, 'giấm gạo', 'giam gao',
        'aji-ngon', 'ajingon',
        'miến đậu xanh', 'mien dau xanh',
        'tương ớt 500', 'tuong ot 500',
        'thượng vàng', 'thuong vang',
        'đặc biệt', 'dac biet',
        'nui',
        'bún tươi', 'bun tuoi',
        'bún gạo gói', 'bun gao goi',
        'cốt dừa', 'cot dua',
        'hạt nêm 3kg', 'hat nem 3kg',
        'tương xí muội', 'tuong xi muoi',
        'tương cà 830', 'tuong ca 830',
        'cooking oil',
        'bột ngọt', 'bot ngot',
        'nhất ca', 'nhat ca',
        'nhị ca', 'nhi ca',
        'nam ngư 750', 'nam ngu 750',
        'đệ nhị', 'de nhi',
        'hạt nêm 400', 'hat nem 400', 'hạt nêm 900', 'hat nem 900',
        'tương ớt 2.1', 'tuong ot 2.1',
        'tương cà 2.1', 'tuong ca 2.1',
        'tương ớt 830', 'tuong ot 830',
        'tương cà 270', 'tuong ca 270',
        'tương ớt 270', 'tuong ot 270');
    };
    return {
      ordersCount: [6, 8],
      minItemsPerOrder: 5,
      allowedProducts: isAllowed,
      maxQtyPerProduct: (p) => {
        const ln = p.name.toLowerCase();
        if (nm(ln, 'hạt nêm 400', 'hat nem 400', 'hạt nêm 900', 'hat nem 900')) return 2;
        if (nm(ln, 'cooking oil 1l')) return 3;
        if (nm(ln, 'cooking oil 2l')) return 3;
        if (nm(ln, 'bột ngọt 454', 'bot ngot 454')) return 3;
        if (nm(ln, 'bột ngọt 400', 'bot ngot 400')) return 3;
        if (nm(ln, 'bột ngọt 1kg', 'bot ngot 1kg')) return 5;
        if (nm(ln, 'bột ngọt 5kg', 'bot ngot 5kg')) return 3;
        if (nm(ln, 'nam ngư 750', 'nam ngu 750')) return 3;
        if (nm(ln, 'đệ nhị', 'de nhi')) return 5;
        if (nm(ln, 'nhị ca', 'nhi ca')) return 3;
        return 2;
      },
      minQtyPerOrder: (p) => {
        const ln = p.name.toLowerCase();
        // "Bắt buộc có 2 đơn vị lớn mỗi đơn" — khi có trong đơn, qty = 2
        if (nm(ln, 'hạt nêm 400', 'hat nem 400', 'hạt nêm 900', 'hat nem 900')) return 2;
        return undefined;
      },
      maxQtyPerQuarter: (p) => {
        const ln = p.name.toLowerCase();
        if (nm(ln, 'nhất ca', 'nhat ca')) return 1;
        if (nm(ln, 'nhị ca', 'nhi ca')) return 3;
        if (nm(ln, 'hạt nêm 400', 'hat nem 400', 'hạt nêm 900', 'hat nem 900')) return 2;
        if (nm(ln, 'tương ớt 2.1', 'tuong ot 2.1', 'tương cà 2.1', 'tuong ca 2.1')) return 2;
        if (nm(ln, 'tương ớt 830', 'tuong ot 830')) return 3;
        if (nm(ln, 'tương cà 270', 'tuong ca 270', 'tương ớt 270', 'tuong ot 270')) return 2;
        if (nm(ln, 'giấm gạo', 'giam gao', 'aji-ngon', 'ajingon',
          'miến đậu xanh', 'mien dau xanh',
          'tương ớt 500', 'tuong ot 500',
          'thượng vàng', 'thuong vang',
          'đặc biệt', 'dac biet',
          'nui', 'bún tươi', 'bun tuoi', 'bún gạo gói', 'bun gao goi',
          'cốt dừa', 'cot dua',
          'hạt nêm 3kg', 'hat nem 3kg',
          'tương xí muội', 'tuong xi muoi',
          'tương cà 830', 'tuong ca 830')) return 1;
        return undefined;
      },
    };
  }

  if (has('chợ lớn') || has('cho lon')) {
    const allowList = [
      'nước mắm cá cơm','bột chiên xù 100','bánh phồng tôm','táo đỏ',
      'nấm hương','la hán quả','la han qua','nấm tuyết','nam tuyet',
      'tiêu đen','tieu den','tiêu sọ','tieu so','ớt hàn quốc','ot han quoc',
      'kỷ tử','ky tu','hoành thành','hoanh thanh','tàu hủ ki','tau hu ki',
      'da heo','bơ thực vật 200','bo thuc vat 200','vị rang phở','vi rang pho',
      'bột sắn dây','bot san day','rong canh','phèn','phen',
      'sốt thịt nướng 240','sot thit nuong 240','ngũ vị hương','ngu vi huong',
      'nhãn nhục','nhan nhuc','hạt chia','hat chia','cải','cai',
      'mai quế lộ','mai que lo','rong nấu','rong nau','rong cuộn','rong cuon',
      'óc chó','oc cho','hạnh nhân','hanh nhan','kim châm','kim cham',
      'hạt é','hat e','muối ớt xanh','muoi ot xanh',
      'soup','hạt nêm nấm hương 450','hat nem nam huong 450',
      'miến khô minh châu','mien kho minh chau',
      'hoa cúc','hoa cuc','macca','rau câu','rau cau','râu câu',
      'bột cà ri','bot ca ri','bột bò kho','bot bo kho',
      'bột la gu','bot la gu','bột bún bò','bot bun bo',
      'tiềm thuốc bắc','tiem thuoc bac',
      'sen khô','sen kho','mè','me ','long nhãn','long nhan',
      'nho khô','nho kho','hạt điều','hat dieu',
      'cá hộp 3 cô gái','ca hop 3 co gai','bơ thực vật 80','bo thuc vat 80',
      'bột chiên giòn gà giòn','bot chien gion ga gion','aji-quick',
      'bột lẩu thái aji-quick','bot lau thai aji-quick',
      'phổ tai','pho tai','phô mai gói','pho mai goi',
      'bồ kết','bo ket','bột nghệ','bot nghe','bột bán','bot ban',
      'sương sáo','suong sao','màu gạch tôm','mau gach tom',
      'nấm đông cô','nam dong co','bò kho ly','bo kho ly',
      'la gu ly','cà ri ly','ca ri ly',
    ];
    const isAllowed = (p: Product) => allowList.some(s => nm(p.name, s));
    return {
      ordersCount: [5, 5],
      fixedOrdersCount: 5,
      minItemsPerOrder: 10,
      uniqueAcrossOrders: true,
      allowedProducts: isAllowed,
      maxQtyPerQuarter: (p) => {
        const ln = p.name.toLowerCase();
        if (nm(ln, 'bột chiên xù 100', 'bot chien xu 100')) return 20;
        if (nm(ln, 'bột chiên giòn gà giòn', 'bot chien gion ga gion')) return 20;
        if (nm(ln, 'bột lẩu thái aji-quick', 'bot lau thai aji-quick')) return 10;
        if (nm(ln, 'táo đỏ', 'tao do')) return 4;
        if (nm(ln, 'nấm hương', 'nam huong') && !nm(ln, 'hạt nêm', 'hat nem')) return 2;
        if (nm(ln, 'tiêu đen', 'tieu den')) return 4;
        if (nm(ln, 'tiêu sọ', 'tieu so')) return 3;
        if (nm(ln, 'ớt hàn quốc', 'ot han quoc')) return 4;
        if (nm(ln, 'kỷ tử', 'ky tu')) return 4;
        if (nm(ln, 'hoành thành', 'hoanh thanh')) return 4;
        if (nm(ln, 'bơ thực vật 200', 'bo thuc vat 200')) return 2;
        if (nm(ln, 'vị rang phở', 'vi rang pho')) return 5;
        if (nm(ln, 'bột sắn dây', 'bot san day')) return 3;
        if (nm(ln, 'hạt chia', 'hat chia')) return 2;
        if (nm(ln, 'mai quế lộ', 'mai que lo')) return 3;
        if (nm(ln, 'óc chó', 'oc cho')) return 2;
        if (nm(ln, 'hạnh nhân', 'hanh nhan')) return 3;
        if (nm(ln, 'hạt é', 'hat e')) return 2;
        if (nm(ln, 'soup bún bò chay', 'soup bun bo chay')) return 2;
        if (nm(ln, 'soup')) return 4;
        if (nm(ln, 'miến khô minh châu', 'mien kho minh chau')) return 2;
        if (nm(ln, 'macca')) return 2;
        if (nm(ln, 'rau câu giòn', 'rau cau gion', 'râu câu giòn')) return 2;
        if (nm(ln, 'rau câu dẻo', 'rau cau deo', 'râu câu dẻo')) return 3;
        if (nm(ln, 'bột cà ri', 'bot ca ri', 'bột bò kho', 'bot bo kho',
          'bột la gu', 'bot la gu', 'bột bún bò', 'bot bun bo')) return 3;
        if (nm(ln, 'mè', 'me ')) return 2;
        if (nm(ln, 'cá hộp 3 cô gái', 'ca hop 3 co gai')) return 2;
        if (nm(ln, 'bơ thực vật 80', 'bo thuc vat 80')) return 2;
        if (nm(ln, 'bột nghệ', 'bot nghe')) return 6;
        if (nm(ln, 'sương sáo', 'suong sao')) return 2;
        if (nm(ln, 'nấm đông cô', 'nam dong co')) return 2;
        if (nm(ln, 'bò kho ly', 'bo kho ly', 'la gu ly', 'cà ri ly', 'ca ri ly')) return 2;
        return 1;
      },
      maxQtyPerProduct: (p) => {
        const ln = p.name.toLowerCase();
        if (nm(ln, 'bột chiên xù 100', 'bot chien xu 100')) return 20;
        if (nm(ln, 'bột chiên giòn gà giòn', 'bot chien gion ga gion')) return 20;
        if (nm(ln, 'bột lẩu thái aji-quick', 'bot lau thai aji-quick')) return 10;
        if (nm(ln, 'bột nghệ', 'bot nghe')) return 6;
        if (nm(ln, 'vị rang phở', 'vi rang pho')) return 5;
        if (nm(ln, 'táo đỏ', 'tao do', 'kỷ tử', 'ky tu', 'hoành thành', 'hoanh thanh',
          'ớt hàn quốc', 'ot han quoc', 'tiêu đen', 'tieu den', 'soup')) return 4;
        if (nm(ln, 'tiêu sọ', 'tieu so', 'mai quế lộ', 'mai que lo',
          'hạnh nhân', 'hanh nhan', 'rau câu dẻo', 'rau cau deo',
          'bột sắn dây', 'bot san day',
          'bột cà ri', 'bot ca ri', 'bột bò kho', 'bot bo kho',
          'bột la gu', 'bot la gu', 'bột bún bò', 'bot bun bo')) return 3;
        return 2;
      },
    };
  }

  // Default fallback - không có rule cứng (không tạo đơn auto)
  return { ordersCount: [0, 0], manualOnly: true };
}

// ============================================================================
// IMPORT GENERATOR — balanced amounts, full coverage, minimize duplicates
// ============================================================================

/**
 * Sinh đơn nhập tự động cho 1 NCC trong 1 quý.
 * - Mỗi sản phẩm sẽ được phân bổ vào ít nhất 1 đơn (bao phủ toàn bộ).
 * - Số lượng đơn vị tối đa per product/order/quarter tuân theo rule.
 * - Ngày tạo đơn ngẫu nhiên trong quý.
 * - Tổng tiền các đơn cố gắng cân bằng (chênh < 30%).
 */
function generateSupplierImports(
  supplier: Supplier,
  prods: Product[],
  manualOrdersCount: number,
  days: string[],
  rand: () => number,
  stockMap: Map<string, number>,
  overrideOrdersCount?: number,
): { orders: ImportOrder[]; batches: InventoryBatch[] } {
  const rule = getSupplierRule(supplier.name);
  if (rule.manualOnly && overrideOrdersCount === undefined) return { orders: [], batches: [] };

  const eligible = prods.filter(p => {
    if (rule.excludeProduct?.(p)) return false;
    if (rule.allowedProducts && !rule.allowedProducts(p)) return false;
    return true;
  });
  if (eligible.length === 0) return { orders: [], batches: [] };

  const [minOrders, maxOrders] = rule.ordersCount;
  let autoCount: number;
  if (overrideOrdersCount !== undefined) {
    autoCount = Math.max(0, overrideOrdersCount);
  } else {
    const total = rule.fixedOrdersCount ?? (minOrders + Math.floor(rand() * (maxOrders - minOrders + 1)));
    autoCount = rule.fixedOrdersCount ?? Math.max(0, total - manualOrdersCount);
  }
  if (autoCount === 0) return { orders: [], batches: [] };

  // Schedule order days — RẢI ĐỀU CẢ QUÝ nhưng ƯU TIÊN ĐẦU/GIỮA (gối đầu hàng).
  // Phân phối: chia 3 tháng theo tỉ lệ ~40% / 35% / 25% (ưu tiên đầu nhưng vẫn có T cuối).
  // Đảm bảo MỌI tháng đều có ít nhất 1 đơn nếu autoCount >= 3.
  const dayIdxs: number[] = [];
  if (autoCount === 1) {
    // Đặt ngẫu nhiên trong 60% đầu quý
    dayIdxs.push(Math.floor(rand() * Math.max(1, Math.floor(days.length * 0.6))));
  } else {
    const totalDays = days.length;
    // Trọng số phân phối từng tháng (3 tháng = 3 phần)
    const monthWeights = [0.40, 0.35, 0.25];
    const monthBoundaries = [0, Math.floor(totalDays / 3), Math.floor((totalDays * 2) / 3), totalDays];
    // Phân bổ số đơn cho từng tháng theo trọng số
    const ordersPerMonth = [0, 0, 0];
    let remaining = autoCount;
    for (let m = 0; m < 3; m++) {
      if (m === 2) ordersPerMonth[m] = remaining;
      else {
        ordersPerMonth[m] = Math.max(autoCount >= 3 ? 1 : 0, Math.round(autoCount * monthWeights[m]));
        ordersPerMonth[m] = Math.min(ordersPerMonth[m], remaining);
        remaining -= ordersPerMonth[m];
      }
    }
    // Đảm bảo tháng 3 có ít nhất 1 đơn nếu autoCount >= 3
    if (autoCount >= 3 && ordersPerMonth[2] === 0) {
      // Lấy 1 từ tháng có nhiều nhất
      const maxM = ordersPerMonth[0] >= ordersPerMonth[1] ? 0 : 1;
      ordersPerMonth[maxM]--;
      ordersPerMonth[2]++;
    }
    // Đặt ngày trong từng tháng (rải đều)
    for (let m = 0; m < 3; m++) {
      const startIdx = monthBoundaries[m];
      const endIdx = monthBoundaries[m + 1];
      const monthLen = endIdx - startIdx;
      const cnt = ordersPerMonth[m];
      for (let i = 0; i < cnt; i++) {
        const base = startIdx + Math.floor(((i + 0.5) / Math.max(1, cnt)) * monthLen);
        const jitter = Math.floor((rand() - 0.5) * Math.max(1, Math.floor(monthLen / Math.max(1, cnt) * 0.5)));
        dayIdxs.push(Math.min(endIdx - 1, Math.max(startIdx, base + jitter)));
      }
    }
  }
  dayIdxs.sort((a, b) => a - b);

  // Quantity tracking
  const qtyUsedQuarter = new Map<string, number>();
  const productsUsed = new Set<string>();

  const isLargeSupplier = eligible.length > 10;

  const orderItems: ImportOrderItem[][] = Array.from({ length: autoCount }, () => []);

  // ===== Pre-pass: SP có splitAcrossOrders (HPV Shiitake) — phân vào N đơn cố định =====
  const consumedIds = new Set<string>();
  if (rule.splitAcrossOrders && autoCount > 0) {
    for (const p of eligible) {
      const split = rule.splitAcrossOrders(p);
      if (!split) continue;
      const orderIdxs = [...Array(autoCount).keys()]
        .sort(() => rand() - 0.5)
        .slice(0, Math.min(split.orders, autoCount));
      let total = 0;
      for (const oi of orderIdxs) {
        orderItems[oi].push(buildItem(p, supplier, split.qtyEach));
        total += split.qtyEach;
      }
      qtyUsedQuarter.set(p.id, total);
      productsUsed.add(p.id);
      consumedIds.add(p.id);
    }
  }

  // ===== Pre-pass: SP single-order (TADA Aji-Mayo, Xì dầu đặc biệt, Sốt hải sản) =====
  if (rule.singleOrderProducts && autoCount > 0) {
    for (const p of eligible) {
      if (consumedIds.has(p.id)) continue;
      if (!rule.singleOrderProducts(p)) continue;
      const totalQty = rule.maxQtyPerQuarter?.(p) ?? rule.maxQtyPerProduct?.(p) ?? 1;
      const oi = Math.floor(rand() * autoCount);
      orderItems[oi].push(buildItem(p, supplier, totalQty));
      qtyUsedQuarter.set(p.id, totalQty);
      productsUsed.add(p.id);
      consumedIds.add(p.id);
    }
  }

  // ===== requireAllInEveryOrder (Đường, Đậu, Cô Lan, Liên Thành): mỗi đơn = toàn bộ SP =====
  if (rule.requireAllInEveryOrder && autoCount > 0) {
    for (let oi = 0; oi < autoCount; oi++) {
      for (const p of eligible) {
        if (consumedIds.has(p.id)) continue;
        const fixedQ = rule.fixedQtyPerOrder?.(p);
        const ruleMax = rule.maxQtyPerProduct?.(p) ?? 3;
        let qty: number;
        if (fixedQ !== undefined) qty = fixedQ;
        else qty = Math.max(1, Math.floor(1 + rand() * ruleMax));
        qty = Math.min(qty, ruleMax);
        const qCap = rule.maxQtyPerQuarter?.(p);
        if (qCap !== undefined) {
          const used = qtyUsedQuarter.get(p.id) || 0;
          qty = Math.min(qty, Math.max(0, qCap - used));
        }
        if (qty <= 0) continue;
        orderItems[oi].push(buildItem(p, supplier, qty));
        qtyUsedQuarter.set(p.id, (qtyUsedQuarter.get(p.id) || 0) + qty);
        productsUsed.add(p.id);
      }
    }
    // Skip phần còn lại — đã phủ
  } else if (rule.uniqueAcrossOrders && autoCount > 0) {
    // Chợ Lớn: mỗi SP xuất hiện DUY NHẤT 1 lần trong toàn bộ N đơn,
    // phân phối ~đều ra các đơn (chênh lệch ≤1 SP giữa các đơn).
    const shuffled = [...eligible].filter(p => !consumedIds.has(p.id)).sort(() => rand() - 0.5);
    shuffled.forEach((p, i) => {
      const orderIdx = i % autoCount;
      const ruleMax = rule.maxQtyPerProduct?.(p) ?? 1;
      const qCap = rule.maxQtyPerQuarter?.(p);
      const minReq = rule.minQtyPerOrder?.(p);
      const cap = qCap !== undefined ? Math.min(ruleMax, qCap) : ruleMax;
      let qty = minReq ?? Math.max(1, Math.min(cap, Math.floor(1 + rand() * cap)));
      qty = Math.min(qty, cap);
      if (qty <= 0) return;
      orderItems[orderIdx].push(buildItem(p, supplier, qty));
      qtyUsedQuarter.set(p.id, qty);
      productsUsed.add(p.id);
    });
  } else if (isLargeSupplier) {
    // NCC lớn (>10 SP): mỗi đơn 4-6 SP đa dạng, cân bằng tiền chặt, bao phủ TOÀN BỘ SP.
    const distributable = eligible.filter(p => !consumedIds.has(p.id));
    const targetItemsPerOrder = Math.max(
      rule.minItemsPerOrder ?? 4,
      Math.min(8, Math.ceil(distributable.length / autoCount) + 1)
    );
    const totalSlots = targetItemsPerOrder * autoCount;
    const passes = Math.max(1, Math.ceil(totalSlots / Math.max(1, distributable.length)));

    let slotCursor = 0;
    for (let pass = 0; pass < passes; pass++) {
      const passList = [...distributable].sort(() => rand() - 0.5);
      for (const p of passList) {
        if (slotCursor >= totalSlots) break;
        const orderIdx = slotCursor % autoCount;
        slotCursor++;

        const ruleMax = rule.maxQtyPerProduct?.(p) ?? 3;
        const qCap = rule.maxQtyPerQuarter?.(p);
        const minReq = rule.minQtyPerOrder?.(p);
        const used = qtyUsedQuarter.get(p.id) || 0;
        const remainCap = qCap !== undefined ? Math.max(0, qCap - used) : Infinity;
        if (remainCap === 0) continue;

        // Tránh trùng SP trong cùng đơn (giữ đa dạng)
        if (orderItems[orderIdx].some(x => x.productId === p.id)) continue;

        let qty = minReq ?? Math.max(1, Math.floor(1 + rand() * Math.max(1, ruleMax)));
        qty = Math.min(qty, ruleMax, remainCap);
        if (qty <= 0) continue;

        orderItems[orderIdx].push(buildItem(p, supplier, qty));
        qtyUsedQuarter.set(p.id, used + qty);
        productsUsed.add(p.id);
      }
    }

    // Cân bằng tiền: kéo các đơn lệch nhiều về quanh trung bình (chặt hơn)
    const totals = orderItems.map(its => its.reduce((s, it) => s + it.total, 0));
    const avg = totals.reduce((a, b) => a + b, 0) / Math.max(1, totals.length);
    if (avg > 0) {
      orderItems.forEach((its, idx) => {
        const t = totals[idx];
        if (t === 0) return;
        const ratio = avg / t;
        // Chặt: chỉ cho phép lệch ±15% so với trung bình → các đơn cùng NCC gần đồng đều
        const clamped = Math.max(0.85, Math.min(1.15, ratio));
        if (Math.abs(clamped - 1) < 0.03) return;
        its.forEach(it => {
          const prod = eligible.find(p => p.id === it.productId);
          if (!prod) return;
          const hardMax = rule.maxQtyPerProduct?.(prod);
          const minReq = rule.minQtyPerOrder?.(prod) ?? 1;
          let newQty = Math.max(minReq, Math.round(it.quantity * clamped));
          if (hardMax !== undefined) newQty = Math.min(newQty, hardMax);
          const delta = newQty - it.quantity;
          if (delta !== 0) {
            it.quantity = newQty;
            it.total = it.buyPrice * newQty;
            qtyUsedQuarter.set(it.productId, (qtyUsedQuarter.get(it.productId) || 0) + delta);
          }
        });
      });
    }
  } else {
    // ===== NCC nhỏ ≤10 SP: theo rule chi tiết =====
    const shuffled = [...eligible].filter(p => !consumedIds.has(p.id)).sort(() => rand() - 0.5);

    for (let oi = 0; oi < autoCount; oi++) {
      let prodsForOrder: Product[];
      if (rule.preferUniquePerQuarter) {
        const remaining = shuffled.filter(p => !productsUsed.has(p.id));
        const targetCount = Math.ceil(shuffled.length / autoCount);
        prodsForOrder = remaining.slice(0, Math.max(1, targetCount));
        if (prodsForOrder.length === 0) {
          // Đã phân bổ hết SP → chỉ thêm 1-2 SP ngẫu nhiên cho phép trùng
          prodsForOrder = shuffled.slice(0, Math.min(2, shuffled.length));
        }
      } else {
        // Bao phủ chia đều
        const perOrder = Math.ceil(shuffled.length / autoCount);
        const start = oi * perOrder;
        prodsForOrder = shuffled.slice(start, start + perOrder);
        if (prodsForOrder.length === 0) prodsForOrder = shuffled.slice(0, 1);
      }

      for (const p of prodsForOrder) {
        const ruleMax = rule.maxQtyPerProduct?.(p) ?? 3;
        const qCap = rule.maxQtyPerQuarter?.(p);
        const minReq = rule.minQtyPerOrder?.(p);
        const fixedQ = rule.fixedQtyPerOrder?.(p);
        const used = qtyUsedQuarter.get(p.id) || 0;
        const remainCap = qCap !== undefined ? Math.max(0, qCap - used) : Infinity;
        if (remainCap === 0) continue;
        let qty = fixedQ ?? minReq ?? Math.max(1, Math.floor(1 + rand() * ruleMax));
        qty = Math.min(qty, ruleMax, remainCap);
        if (qty <= 0) continue;
        orderItems[oi].push(buildItem(p, supplier, qty));
        qtyUsedQuarter.set(p.id, used + qty);
        productsUsed.add(p.id);
      }
    }
  }

  // Yêu cầu: KHÔNG có đơn chỉ 1 SP, hạn chế đơn 2 SP (trừ khi NCC chỉ có ≤2 SP).
  // Dồn đơn nhỏ sang đơn liền kề có ít SP nhất để cân bằng.
  const minItemsPerOrder = rule.minItemsPerOrder ?? (eligible.length <= 2 ? 1 : 3);
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < orderItems.length; i++) {
      if (orderItems[i].length === 0 || orderItems[i].length >= minItemsPerOrder) continue;
      // Tìm đơn khác (≠ rỗng) có ít SP nhất để dồn vào
      let targetIdx = -1;
      let minLen = Infinity;
      for (let j = 0; j < orderItems.length; j++) {
        if (j === i || orderItems[j].length === 0) continue;
        if (orderItems[j].length < minLen) { minLen = orderItems[j].length; targetIdx = j; }
      }
      if (targetIdx === -1) break;
      // Dồn nhưng tránh trùng SP trong cùng đơn (gộp qty nếu trùng)
      for (const it of orderItems[i]) {
        const exist = orderItems[targetIdx].find(x => x.productId === it.productId);
        if (exist) {
          exist.quantity += it.quantity;
          exist.total = exist.buyPrice * exist.quantity;
        } else {
          orderItems[targetIdx].push(it);
        }
      }
      orderItems[i] = [];
      merged = true;
      break;
    }
  }

  // ===== POST-PROCESS đặc biệt cho VIFON =====
  // Yêu cầu: 1 đơn duy nhất / quý, tổng ≤3 đơn vị lớn, BẮT BUỘC đủ 2 SP khác nhau.
  if (supplier.name.toLowerCase().includes('vifon')) {
    // Gộp tất cả items từ orderItems vào 1 đơn duy nhất
    const merged: ImportOrderItem[] = [];
    for (const its of orderItems) {
      for (const it of its) {
        const exist = merged.find(x => x.productId === it.productId);
        if (exist) {
          exist.quantity += it.quantity;
          exist.total = exist.buyPrice * exist.quantity;
        } else {
          merged.push({ ...it });
        }
      }
    }
    // Đảm bảo đủ 2 SP khác nhau (lấy từ eligible nếu thiếu)
    if (merged.length < 2 && eligible.length >= 2) {
      for (const p of eligible) {
        if (merged.find(x => x.productId === p.id)) continue;
        merged.push(buildItem(p, supplier, 1));
        if (merged.length >= 2) break;
      }
    }
    // Giữ tối đa 2 SP đầu (nếu nhiều hơn)
    while (merged.length > 2) merged.pop();
    // Cap tổng số đơn vị ≤ 3 (chia: 2+1 hoặc 1+2)
    let totalQty = merged.reduce((s, it) => s + it.quantity, 0);
    if (merged.length === 2) {
      // Chuẩn hóa: SP đầu 2, SP sau 1 (tổng 3) — hoặc giảm về cấu hình ≤3
      if (totalQty > 3) {
        merged[0].quantity = 2;
        merged[1].quantity = 1;
        merged.forEach(it => { it.total = it.buyPrice * it.quantity; });
        totalQty = 3;
      } else if (totalQty < 2) {
        // Đảm bảo ít nhất 1+1 = 2
        merged.forEach(it => { if (it.quantity < 1) it.quantity = 1; it.total = it.buyPrice * it.quantity; });
      }
    } else if (merged.length === 1) {
      // Trường hợp xấu: chỉ 1 SP eligible — giữ ≤3
      if (merged[0].quantity > 3) {
        merged[0].quantity = 3;
        merged[0].total = merged[0].buyPrice * 3;
      }
    }
    // Reset stockMap (vì sẽ tính lại theo merged)
    for (const its of orderItems) {
      for (const it of its) {
        const rate = it.conversionRate || 1;
        stockMap.set(it.productId, (stockMap.get(it.productId) || 0) - it.quantity * rate);
      }
    }
    // Đặt tất cả vào orderItems[0], các slot khác rỗng
    for (let i = 0; i < orderItems.length; i++) orderItems[i] = [];
    orderItems[0] = merged;
    // Cập nhật qtyUsedQuarter
    qtyUsedQuarter.clear();
    merged.forEach(it => qtyUsedQuarter.set(it.productId, it.quantity));
  }

  const orders: ImportOrder[] = [];
  const batches: InventoryBatch[] = [];

  orderItems.forEach((items, idx) => {
    if (items.length === 0) return;
    const importDate = days[dayIdxs[idx] ?? Math.floor(rand() * days.length)];
    const order: ImportOrder = {
      id: generateId(),
      supplierId: supplier.id,
      supplierName: supplier.name,
      date: importDate,
      items,
      total: items.reduce((s, it) => s + it.total, 0),
      tag: 'auto',
      locked: false,
      images: [],
      deletedAt: null,
      createdAt: importDate + 'T08:00:00.000Z',
    };
    orders.push(order);
    items.forEach(it => {
      const rate = it.conversionRate || 1;
      stockMap.set(it.productId, (stockMap.get(it.productId) || 0) + it.quantity * rate);
      batches.push({
        id: generateId(),
        importOrderId: order.id,
        productId: it.productId,
        productName: it.productName,
        supplierId: it.supplierId,
        supplierName: it.supplierName,
        unit: it.unit,
        quantity: it.quantity,
        originalQuantity: it.quantity,
        buyPrice: it.buyPrice,
        date: importDate,
        quarter: Math.ceil((new Date(importDate).getMonth() + 1) / 3),
        year: new Date(importDate).getFullYear(),
      });
    });
  });

  return { orders, batches };
}

function buildItem(p: Product, supplier: Supplier, qty: number): ImportOrderItem {
  // Auto generator dùng GIÁ GỐC (baseBuyPrice). Catalog edit chỉ ảnh hưởng đơn thủ công.
  const buy = p.baseBuyPrice ?? p.buyPrice;
  return {
    productId: p.id,
    productName: p.name,
    supplierId: p.supplierId,
    supplierName: supplier.name,
    unit: p.unit,
    conversionUnit: p.conversionUnit || p.unit,
    conversionRate: p.conversionRate || 1,
    quantity: qty,
    buyPrice: buy,
    total: buy * qty,
  };
}

/**
 * Tạo N đơn tự động bổ sung cho 1 NCC trong 1 quý.
 * KHÔNG bị giới hạn `ordersCount`/`fixedOrdersCount` của rule —
 * chỉ tuân theo whitelist sản phẩm + maxQtyPerProduct/maxQtyPerQuarter.
 * Đơn có tag = 'auto' và vẫn có thể bị Ngẫu nhiên hóa (trừ khi khóa).
 */
export function generateSupplementaryAutoOrders(
  quarter: number,
  year: number,
  supplier: Supplier,
  products: Product[],
  count: number,
  seed: number = Date.now(),
): { orders: ImportOrder[]; batches: InventoryBatch[] } {
  if (count <= 0) return { orders: [], batches: [] };
  const days = getDaysInQuarter(quarter, year);
  const rand = seededRandom(seed);
  const stockMap = new Map<string, number>();
  const prods = products.filter(p => !p.deletedAt && p.supplierId === supplier.id);
  if (prods.length === 0) return { orders: [], batches: [] };
  return generateSupplierImports(supplier, prods, 0, days, rand, stockMap, count);
}

// ============================================================================
// MAIN GENERATOR
// ============================================================================

function getQuarterInventoryProfile(quarterNumber: number, rand: () => number) {
  // Lưu ý quan trọng về cơ chế:
  //   • Sales auto LUÔN scale 100% theo targetRevenue (xem phase scale cuối cùng).
  //   • Imports auto bị CLAMP bởi cap maxQtyPerOrder/Quarter của từng NCC →
  //     thực tế chỉ đạt ~60% so với targetImportTotal đặt ra.
  // Vì vậy targetRatio (seasonalRatio) phải đặt CAO ~1.65× ratio mong muốn cuối cùng.
  //
  // YÊU CẦU LOGIC MÙA VỤ:
  //   • Q1: bán xả tồn 2025, nhập rất ít → gap ÂM rất lớn.
  //   • Q2 & Q3: doanh thu THẤP (đã set ở targetRevenue) nhưng NHẬP RẤT NHIỀU
  //     để dồn kho → gap DƯƠNG RẤT LỚN, tồn cuối Q2/Q3 CAO NHẤT năm.
  //   • Q4: cao điểm — NHẬP NHIỀU + BÁN RA NHIỀU → gap DƯƠNG vẫn rõ nhưng
  //     tồn cuối Q4 THẤP HƠN Q2/Q3 (vì xả mạnh cho mùa cao điểm).
  //   • Tổng gap dương Q2+Q3+Q4 đủ bù gap âm Q1 năm sau.
  //
  // Ratio mong muốn (nhập_thực / bán_thực) sau khi bị clamp:
  //   • Q1: ≈ 0.35  (gap ÂM rất lớn)
  //   • Q2: ≈ 1.50–1.60  (gap DƯƠNG cao)
  //   • Q3: ≈ 1.55–1.65  (vẫn DƯƠNG cao, nhỉnh hơn Q2)
  //   • Q4: ≈ 1.20–1.30  (vẫn DƯƠNG rõ nhưng thấp hơn Q2/Q3)
  // ⇒ targetRatio đặt = mong muốn / 0.60.
  // ====== NEW: floor-based (theo QUARTER_FLOOR_RATIO) ======
  // Trả về seasonalRatio = floor ratio (sàn tối thiểu nhập/doanh thu).
  // Auto generator phải sinh đủ để vượt sàn này; không có trần (trừ Q1 = 70%).
  const floor = QUARTER_FLOOR_RATIO[quarterNumber] ?? 1.0;
  const endingStockRatioByQ: Record<number, number> = { 1: 0.04, 2: 0.18, 3: 0.20, 4: 0.13 };
  return {
    seasonalRatio: floor,
    endingStockRatio: endingStockRatioByQ[quarterNumber] ?? 0.12,
  };
}

export function generateQuarterData(
  quarter: QuarterData,
  products: Product[],
  suppliers: Supplier[],
  existingManualImports: ImportOrder[],
  existingManualSales: SaleOrder[],
  carryOverStock: Map<string, number> = new Map(),
): GeneratedData {
  if (products.length === 0 || quarter.targetRevenue <= 0) {
    return { importOrders: [], salesOrders: [], inventoryBatches: [] };
  }

  const regenSeed = (quarter as any).regenSeed || 0;
  const rand = seededRandom(quarter.quarter * 7919 + quarter.year * 31 + regenSeed * 13);
  const days = getDaysInQuarter(quarter.quarter, quarter.year);
  const activeProducts = products.filter(p => !p.deletedAt && p.sellPrice > 0);
  if (activeProducts.length === 0) {
    return { importOrders: [], salesOrders: [], inventoryBatches: [] };
  }

  const productById = new Map(activeProducts.map(p => [p.id, p]));
  const activeManualImports = existingManualImports.filter(o => !o.deletedAt);
  const activeManualSales = existingManualSales.filter(o => !o.deletedAt);
  const manualSalesTotal = activeManualSales.reduce((sum, s) => sum + s.totalRevenue, 0);
  const manualImportTotal = activeManualImports.reduce((sum, o) => sum + o.total, 0);
  const autoTargetRevenue = Math.max(0, quarter.targetRevenue - manualSalesTotal);
  const dailyRevenue = generateDailyRevenue(days, autoTargetRevenue, rand);

  const importOrders: ImportOrder[] = [];
  const salesOrders: SaleOrder[] = [];
  const inventoryBatches: InventoryBatch[] = [];

  // Stock đầu quý = carry-over từ quý trước
  const stockMap = new Map<string, number>(carryOverStock);
  activeProducts.forEach(p => { if (!stockMap.has(p.id)) stockMap.set(p.id, 0); });

  // ===== SEED tồn kho mở đầu kỳ từ "Q4/2025" cho quý đầu tiên (Q1/2026) =====
  // Giả định: cuối 2025 đã có sẵn một lô hàng đủ lớn để Q1 vừa đạt doanh thu vừa còn tồn cuối kỳ.
  // Tạo như một import order thật ở 31/12/2025 để tab Kho hàng/FIFO đều nhìn thấy.
  const isFirstQuarter = quarter.quarter === 1 && quarter.year === 2026;
  const hasRealCarryOver = Array.from(carryOverStock.values()).some(v => v > 0);
  if (isFirstQuarter && !hasRealCarryOver) {
    const eligibleProds = activeProducts.filter(p => {
      const supplier = suppliers.find(s => s.id === p.supplierId);
      if (!supplier) return false;
      const rule = getSupplierRule(supplier.name);
      return !rule.manualOnly && (p.baseSellPrice ?? p.sellPrice) > 0;
    });

    if (eligibleProds.length > 0) {
      const openingOrderId = generateId();
      const openingDate = '2025-12-31';
      const openingItems: ImportOrderItem[] = [];
      // Tồn mở đầu = target × 1.05 (đủ bán Q1 + một phần nhỏ tồn cuối kỳ ~3-5%)
      const targetOpeningRevenue = quarter.targetRevenue * 1.05;
      const perProductRevenue = targetOpeningRevenue / eligibleProds.length;

      for (const p of eligibleProds) {
        const supplier = suppliers.find(s => s.id === p.supplierId);
        if (!supplier) continue;
        const rate = p.conversionRate || 1;
        const sellPerChild = (p.baseSellPrice ?? p.sellPrice) / rate;
        if (sellPerChild <= 0) continue;

        const childUnitsNeeded = Math.ceil(perProductRevenue / sellPerChild);
        const parentQtyNeeded = Math.max(1, Math.ceil(childUnitsNeeded / rate));
        const openingItem = buildItem(p, supplier, parentQtyNeeded);
        openingItems.push(openingItem);
        stockMap.set(p.id, (stockMap.get(p.id) || 0) + parentQtyNeeded * rate);
        inventoryBatches.push({
          id: generateId(),
          importOrderId: openingOrderId,
          productId: openingItem.productId,
          productName: openingItem.productName,
          supplierId: openingItem.supplierId,
          supplierName: openingItem.supplierName,
          quarter: quarter.quarter,
          year: quarter.year,
          quantity: openingItem.quantity,
          originalQuantity: openingItem.quantity,
          buyPrice: openingItem.buyPrice,
          unit: openingItem.unit,
          date: openingDate,
        });
      }

      if (openingItems.length > 0) {
        importOrders.push({
          id: openingOrderId,
          supplierId: '__opening_2025__',
          supplierName: 'Tồn đầu kỳ 2025',
          date: openingDate,
          items: openingItems,
          total: openingItems.reduce((s, it) => s + it.total, 0),
          tag: 'auto',
          locked: true,
          images: [],
          deletedAt: null,
          createdAt: openingDate + 'T06:00:00.000Z',
        });
      }
    }
  }

  // Cộng/trừ ảnh hưởng của đơn thủ công hiện có trong quý để auto logic bám sát thực tế.
  activeManualImports.forEach(order => {
    order.items.forEach(it => {
      const prod = productById.get(it.productId);
      const rate = it.conversionRate || prod?.conversionRate || 1;
      stockMap.set(it.productId, (stockMap.get(it.productId) || 0) + it.quantity * rate);
    });
  });
  activeManualSales.forEach(order => {
    order.items.forEach(it => {
      if (!productById.has(it.productId)) return;
      stockMap.set(it.productId, Math.max(0, (stockMap.get(it.productId) || 0) - it.quantity));
    });
  });

  const supplierProducts = new Map<string, Product[]>();
  activeProducts.forEach(p => {
    if (!supplierProducts.has(p.supplierId)) supplierProducts.set(p.supplierId, []);
    supplierProducts.get(p.supplierId)!.push(p);
  });

  // ===== Mục tiêu nhập theo mùa vụ và tồn cuối quý =====
  const { seasonalRatio, endingStockRatio } = getQuarterInventoryProfile(quarter.quarter, rand);
  const targetQuarterImportTotal = quarter.targetRevenue * seasonalRatio;
  const targetImportTotal = Math.max(0, targetQuarterImportTotal - manualImportTotal);

  const largeSupplierIds = new Set<string>();
  const smallSupplierIds = new Set<string>();
  const fixedSupplierIds = new Set<string>(); // NCC có rule cứng (như Vifon) — không scale
  for (const [sid, prods] of supplierProducts) {
    const supplier = suppliers.find(s => s.id === sid);
    if (!supplier) continue;
    const rule = getSupplierRule(supplier.name);
    if (rule.manualOnly) continue;
    // Vifon: 1 đơn/quý, ≤3 đơn vị → KHÔNG được scale
    if (supplier.name.toLowerCase().includes('vifon')) {
      fixedSupplierIds.add(sid);
      continue;
    }
    const eligibleCount = prods.filter(p => !rule.excludeProduct?.(p)).length;
    if (eligibleCount > 10) largeSupplierIds.add(sid);
    else smallSupplierIds.add(sid);
  }

  if (targetImportTotal > 0) {
    // ===== Sinh đơn nhập theo NCC =====
    for (const [sid, prods] of supplierProducts) {
      const supplier = suppliers.find(s => s.id === sid);
      if (!supplier) continue;
      const manualCount = activeManualImports.filter(o => o.supplierId === sid).length;
      const { orders, batches } = generateSupplierImports(supplier, prods, manualCount, days, rand, stockMap);
      importOrders.push(...orders);
      inventoryBatches.push(...batches);
    }

    const smallShareRatio = 0.10 + rand() * 0.05; // 10–15%
    const largeShareRatio = 1 - smallShareRatio;

    /**
     * Scale 1 nhóm NCC về targetTotal, CLAMP qty theo cap.
     * Trả về tổng thực tế đạt được sau clamp (có thể < target nếu chạm cap).
     */
    const scaleGroup = (sids: Set<string>, targetTotal: number): number => {
      const groupOrders = importOrders.filter(o => sids.has(o.supplierId));
      const currentTotal = groupOrders.reduce((s, o) => s + o.total, 0);
      if (groupOrders.length === 0 || currentTotal <= 0 || targetTotal <= 0) return currentTotal;
      const scale = targetTotal / currentTotal;
      // CHỈ SCALE LÊN — không scale xuống. Sàn quý là tối thiểu, không có trần.
      if (scale <= 1.05) return currentTotal;

      const qUsed = new Map<string, number>();
      for (const o of groupOrders) for (const it of o.items) {
        qUsed.set(it.productId, (qUsed.get(it.productId) || 0) + it.quantity);
      }

      for (const order of groupOrders) {
        const supplier = suppliers.find(s => s.id === order.supplierId)!;
        const rule = getSupplierRule(supplier.name);
        for (const it of order.items) {
          const prod = productById.get(it.productId);
          if (!prod) continue;
          const hardMaxPerOrder = rule.maxQtyPerProduct?.(prod);
          const hardMaxPerQuarter = rule.maxQtyPerQuarter?.(prod);
          const minReq = rule.minQtyPerOrder?.(prod);

          let newQty = Math.max(minReq ?? 1, Math.round(it.quantity * scale));
          if (hardMaxPerOrder !== undefined) {
            newQty = Math.min(newQty, hardMaxPerOrder);
          }
          if (hardMaxPerQuarter !== undefined) {
            const otherQ = (qUsed.get(it.productId) || 0) - it.quantity;
            newQty = Math.min(newQty, Math.max(0, hardMaxPerQuarter - otherQ));
          }
          if (newQty < 1) newQty = 1;
          const rate = it.conversionRate || 1;
          stockMap.set(it.productId, (stockMap.get(it.productId) || 0) + (newQty - it.quantity) * rate);
          qUsed.set(it.productId, (qUsed.get(it.productId) || 0) + (newQty - it.quantity));
          it.quantity = newQty;
          it.total = it.buyPrice * newQty;
        }
        order.total = order.items.reduce((s, it) => s + it.total, 0);
      }
      return groupOrders.reduce((s, o) => s + o.total, 0);
    };

    scaleGroup(smallSupplierIds, targetImportTotal * smallShareRatio);
    const smallActual = importOrders.filter(o => smallSupplierIds.has(o.supplierId)).reduce((s, o) => s + o.total, 0);
    const largeTarget = Math.max(targetImportTotal - smallActual, targetImportTotal * largeShareRatio);
    scaleGroup(largeSupplierIds, largeTarget);

    for (const batch of inventoryBatches) {
      const order = importOrders.find(o => o.id === batch.importOrderId);
      const it = order?.items.find(x => x.productId === batch.productId);
      if (it) {
        batch.quantity = it.quantity;
        batch.originalQuantity = it.quantity;
      }
    }
  }

  // BƠM KHO bị tắt: hệ số seasonalRatio + tồn mở đầu Q1 đã đủ cung cấp hàng cho doanh thu mục tiêu.
  // Nếu thiếu, phase scale cuối ở SALES sẽ tự co/giãn để khớp 100% target.

  // ==========================================================================
  // REBALANCE FINAL: với mỗi NCC, nếu đơn lớn nhất > 1.6× trung bình
  // → chuyển bớt qty từ items đắt nhất sang đơn nhỏ nhất cùng NCC.
  // ==========================================================================
  const ordersBySupplier = new Map<string, ImportOrder[]>();
  for (const o of importOrders) {
    if (o.tag !== 'auto') continue;
    if (!ordersBySupplier.has(o.supplierId)) ordersBySupplier.set(o.supplierId, []);
    ordersBySupplier.get(o.supplierId)!.push(o);
  }

  for (const [sid, sOrders] of ordersBySupplier) {
    if (sOrders.length < 2) continue;
    const supplier = suppliers.find(s => s.id === sid);
    if (!supplier) continue;
    const rule = getSupplierRule(supplier.name);

    let passes = 4;
    while (passes-- > 0) {
      const totals = sOrders.map(o => o.total);
      const avg = totals.reduce((a, b) => a + b, 0) / sOrders.length;
      if (avg <= 0) break;
      let maxIdx = 0, minIdx = 0;
      for (let i = 1; i < sOrders.length; i++) {
        if (totals[i] > totals[maxIdx]) maxIdx = i;
        if (totals[i] < totals[minIdx]) minIdx = i;
      }
      if (totals[maxIdx] < avg * 1.6 || maxIdx === minIdx) break;

      const bigOrder = sOrders[maxIdx];
      const smallOrder = sOrders[minIdx];
      const candidates = bigOrder.items
        .filter(it => it.quantity > 1)
        .sort((a, b) => b.total - a.total);
      if (candidates.length === 0) break;

      let moved = false;
      for (const cand of candidates) {
        const prod = productById.get(cand.productId);
        if (!prod) continue;
        cand.quantity -= 1;
        cand.total = cand.buyPrice * cand.quantity;
        bigOrder.total = bigOrder.items.reduce((s, it) => s + it.total, 0);

        const existing = smallOrder.items.find(it => it.productId === cand.productId);
        if (existing) {
          const hardMax = rule.maxQtyPerProduct?.(prod);
          if (hardMax !== undefined && existing.quantity + 1 > hardMax) {
            cand.quantity += 1;
            cand.total = cand.buyPrice * cand.quantity;
            bigOrder.total = bigOrder.items.reduce((s, it) => s + it.total, 0);
            continue;
          }
          existing.quantity += 1;
          existing.total = existing.buyPrice * existing.quantity;
        } else {
          smallOrder.items.push(buildItem(prod, supplier, 1));
        }
        smallOrder.total = smallOrder.items.reduce((s, it) => s + it.total, 0);

        for (const b of inventoryBatches) {
          if (b.importOrderId === bigOrder.id && b.productId === cand.productId) {
            b.quantity = cand.quantity;
            b.originalQuantity = cand.quantity;
          }
        }
        const smallItem = smallOrder.items.find(it => it.productId === cand.productId)!;
        const smallBatch = inventoryBatches.find(b => b.importOrderId === smallOrder.id && b.productId === cand.productId);
        if (smallBatch) {
          smallBatch.quantity = smallItem.quantity;
          smallBatch.originalQuantity = smallItem.quantity;
        } else {
          inventoryBatches.push({
            id: generateId(),
            importOrderId: smallOrder.id,
            productId: smallItem.productId,
            productName: smallItem.productName,
            supplierId: smallItem.supplierId,
            supplierName: smallItem.supplierName,
            unit: smallItem.unit,
            quantity: smallItem.quantity,
            originalQuantity: smallItem.quantity,
            buyPrice: smallItem.buyPrice,
            date: smallOrder.date,
            quarter: quarter.quarter,
            year: quarter.year,
          });
        }

        if (cand.quantity === 0) {
          bigOrder.items = bigOrder.items.filter(it => it.productId !== cand.productId);
          for (let i = inventoryBatches.length - 1; i >= 0; i--) {
            if (inventoryBatches[i].importOrderId === bigOrder.id && inventoryBatches[i].productId === cand.productId) {
              inventoryBatches.splice(i, 1);
            }
          }
        }
        moved = true;
        break;
      }
      if (!moved) break;
    }
  }

  // ==========================================================================
  // POST-CLAMP IMPORT BOOST — đảm bảo TỔNG NHẬP ≥ SÀN QUÝ (QUARTER_FLOOR_RATIO)
  //   • Q1: sàn 60%, trần 70% (đặc biệt)
  //   • Q2: sàn 140%, không trần
  //   • Q3: sàn 110%, không trần
  //   • Q4: sàn 120%, không trần
  // ==========================================================================
  const floorRatio = QUARTER_FLOOR_RATIO[quarter.quarter] ?? 1.0;
  const ceilingRatio = quarter.quarter === 1 ? Q1_CEILING_RATIO : Infinity;
  if (floorRatio > 0) {
    const totalSalesTarget = quarter.targetRevenue;
    const minImportNeeded = totalSalesTarget * floorRatio;
    const maxImportAllowed = totalSalesTarget * ceilingRatio;
    let currentImport = importOrders.reduce((s, o) => s + o.total, 0);

    if (currentImport < minImportNeeded) {
      const autoOrdersForBoost = importOrders.filter(o =>
        o.tag === 'auto' && o.total > 0 &&
        !o.supplierName.toLowerCase().includes('vifon') &&
        o.supplierId !== '__opening_2025__'
      );
      if (autoOrdersForBoost.length > 0) {
        // Sort: đơn lớn nhất trước (clone hiệu quả hơn).
        const sortedBoost = [...autoOrdersForBoost].sort((a, b) => b.total - a.total);
        let cursor = 0;
        let safety = 200;
        const smallestBoostTotal = Math.min(...sortedBoost.map(o => o.total));
        while (currentImport < minImportNeeded && currentImport + smallestBoostTotal <= maxImportAllowed && safety-- > 0) {
          const src = sortedBoost[cursor % sortedBoost.length];
          cursor++;
          // Clone đơn (bỏ qua cap — yêu cầu nghiệp vụ).
          const clonedId = generateId();
          const clonedItems: ImportOrderItem[] = src.items.map(it => ({
            ...it,
            quantity: it.quantity,
            total: it.total,
          }));
          const clonedOrder: ImportOrder = {
            ...src,
            id: clonedId,
            items: clonedItems,
            total: src.total,
            createdAt: src.createdAt,
          };
          importOrders.push(clonedOrder);
          // Thêm batch tồn kho tương ứng.
          for (const it of clonedItems) {
            const rate = it.conversionRate || 1;
            inventoryBatches.push({
              id: generateId(),
              importOrderId: clonedId,
              productId: it.productId,
              productName: it.productName,
              supplierId: src.supplierId,
              supplierName: it.supplierName,
              unit: it.unit,
              quantity: it.quantity,
              originalQuantity: it.quantity,
              buyPrice: it.buyPrice,
              date: src.date,
              quarter: quarter.quarter,
              year: quarter.year,
            });
            stockMap.set(it.productId, (stockMap.get(it.productId) || 0) + it.quantity * rate);
          }
          currentImport += src.total;
        }
      }
    }
  }

  // ==========================================================================
  // SALES — bán dựa trên kho thực, không bù doanh thu ảo vượt kho.
  // ==========================================================================
  for (let dayIdx = 0; dayIdx < days.length; dayIdx++) {
    const day = days[dayIdx];
    const targetDayRevenue = dailyRevenue.get(day) || 0;

    const tetLabel = getTetClosedLabel(day);
    if (tetLabel) {
      salesOrders.push({
        id: generateId(),
        date: day,
        items: [{
          productId: '__tet__',
          productName: tetLabel,
          supplierId: '',
          unit: '',
          quantity: 0,
          sellPrice: 0,
          buyPrice: 0,
          total: 0,
          profit: 0,
          profitPercent: 0,
        }],
        totalRevenue: 0,
        totalProfit: 0,
        profitPercent: 0,
        tag: 'auto',
        paymentMethod: 'cash',
        transferImages: [],
        deletedAt: null,
        createdAt: day + 'T00:00:00.000Z',
      });
      continue;
    }

    if (targetDayRevenue <= 0) continue;

    const items: SaleItem[] = [];
    let remaining = targetDayRevenue;
    const dailyParentSold = new Map<string, number>();
    const targetDistinctProducts = 10 + Math.floor(rand() * 6);

    const inStock = activeProducts.filter(p => (stockMap.get(p.id) || 0) > 0);
    const shuffled = [...inStock].sort(() => rand() - 0.5);
    const dailyPool = shuffled.slice(0, Math.min(targetDistinctProducts, shuffled.length));

    for (let i = 0; i < dailyPool.length && remaining > 3000; i++) {
      const product = dailyPool[i];
      const rate = product.conversionRate || 1;
      const hasChild = rate > 1;
      // Auto sales dùng GIÁ GỐC (baseBuy/baseSell). Đảm bảo doanh thu auto luôn ổn định.
      const baseSell = product.baseSellPrice ?? product.sellPrice;
      const baseBuy = product.baseBuyPrice ?? product.buyPrice;
      const sellPerChild = baseSell / rate;
      const buyPerChild = baseBuy / rate;
      if (sellPerChild <= 0) continue;

      // Quy tắc bán lẻ: tối đa 10–40% của 1 đơn vị lớn/ngày (theo memory)
      // SP không có đơn vị con (rate = 1) → tối đa 1 đơn vị/ngày.
      let maxChildUnitsToday: number;
      let minChildUnitsToday = 1;
      if (hasChild && rate >= 10) {
        const minPct = 0.10 + rand() * 0.05;  // 10–15%
        const maxPct = 0.25 + rand() * 0.15;  // 25–40%
        minChildUnitsToday = Math.max(1, Math.floor(rate * minPct));
        maxChildUnitsToday = Math.max(minChildUnitsToday, Math.floor(rate * maxPct));
      } else if (hasChild) {
        // SP có đơn vị con rate nhỏ (<10): tối đa 40% rate, ít nhất 1
        maxChildUnitsToday = Math.max(1, Math.floor(rate * 0.4));
      } else {
        maxChildUnitsToday = 1;
      }

      const alreadySold = dailyParentSold.get(product.id) || 0;
      if (alreadySold >= maxChildUnitsToday) continue;
      const remainingCapToday = maxChildUnitsToday - alreadySold;

      const remainingProds = dailyPool.length - i;
      const portion = remaining / Math.max(1, remainingProds);
      let qty = Math.max(minChildUnitsToday, Math.round(portion / sellPerChild));
      qty = Math.min(qty, remainingCapToday);

      const stock = stockMap.get(product.id) || 0;
      if (stock <= 0) continue;
      qty = Math.min(qty, stock);
      if (qty <= 0) continue;

      const total = sellPerChild * qty;
      const profit = total - buyPerChild * qty;
      const sellUnit = hasChild ? (product.conversionUnit || product.unit) : product.unit;

      items.push({
        productId: product.id,
        productName: product.name,
        supplierId: product.supplierId,
        unit: sellUnit,
        quantity: qty,
        sellPrice: sellPerChild,
        buyPrice: buyPerChild,
        total,
        profit,
        profitPercent: 0,
      });

      stockMap.set(product.id, stock - qty);
      dailyParentSold.set(product.id, alreadySold + qty);
      remaining -= total;
    }

    if (items.length === 0) continue;

    const rawTotal = items.reduce((s, it) => s + it.total, 0);
    const diff = targetDayRevenue - rawTotal;
    const tolerableAdjust = Math.max(5000, targetDayRevenue * 0.02);
    if (Math.abs(diff) > 0 && Math.abs(diff) <= tolerableAdjust) {
      const last = items[items.length - 1];
      last.total = Math.max(0, last.total + diff);
      last.profit = last.total - last.buyPrice * last.quantity;
    }

    const totalRevenue = items.reduce((s, it) => s + it.total, 0);
    const totalProfit = items.reduce((s, it) => s + it.profit, 0);

    salesOrders.push({
      id: generateId(),
      date: day,
      items,
      totalRevenue,
      totalProfit,
      profitPercent: totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 1000) / 10 : 0,
      tag: 'auto',
      paymentMethod: 'cash',
      transferImages: [],
      deletedAt: null,
      createdAt: day + 'T18:00:00.000Z',
    });
  }

  // Nếu còn thiếu doanh thu, bù vào các ngày đã có bán nhưng VẪN tuân thủ cap 10–40%/ngày.
  // Phân tán đều nhiều ngày, không dồn 1 ngày → tránh ngày 8 triệu bất thường.
  let nonTetOrders = salesOrders.filter(o => o.totalRevenue > 0);
  let currentSalesTotal = nonTetOrders.reduce((s, o) => s + o.totalRevenue, 0);
  let salesGap = autoTargetRevenue - currentSalesTotal;

  if (salesGap > 0 && nonTetOrders.length > 0) {
    // Cap mỗi ngày được bù thêm: không vượt 25% doanh thu trung bình ngày của quý
    const avgDailyRev = autoTargetRevenue / Math.max(1, nonTetOrders.length);
    const perDayAddCap = avgDailyRev * 0.25;

    // Pre-compute cap số đơn vị con bán/ngày cho mỗi SP (theo cùng quy tắc 10–40%)
    const productDayCap = new Map<string, number>();
    for (const p of activeProducts) {
      const rate = p.conversionRate || 1;
      let cap: number;
      if (rate >= 10) cap = Math.max(1, Math.floor(rate * 0.4));
      else if (rate > 1) cap = Math.max(1, Math.floor(rate * 0.4));
      else cap = 1;
      productDayCap.set(p.id, cap);
    }

    // Theo dõi đã bán bao nhiêu đơn vị mỗi SP cho mỗi ngày (bao gồm cả đợt bán đầu)
    const soldByDayProd = new Map<string, Map<string, number>>();
    for (const o of nonTetOrders) {
      const m = new Map<string, number>();
      for (const it of o.items) {
        m.set(it.productId, (m.get(it.productId) || 0) + it.quantity);
      }
      soldByDayProd.set(o.id, m);
    }
    const addedByDay = new Map<string, number>();

    const candidateProducts = [...activeProducts]
      .filter(p => (stockMap.get(p.id) || 0) > 0)
      .sort((a, b) => {
        const aSell = (a.baseSellPrice ?? a.sellPrice) / Math.max(1, a.conversionRate || 1);
        const bSell = (b.baseSellPrice ?? b.sellPrice) / Math.max(1, b.conversionRate || 1);
        return bSell - aSell;
      });

    // Duyệt nhiều vòng để dàn trải đều
    let safetyPasses = 8;
    while (salesGap > 3000 && safetyPasses-- > 0) {
      let movedThisPass = false;
      for (const product of candidateProducts) {
        if (salesGap <= 3000) break;
        const stock = stockMap.get(product.id) || 0;
        if (stock <= 0) continue;
        const rate = product.conversionRate || 1;
        const sellPerChild = (product.baseSellPrice ?? product.sellPrice) / rate;
        const buyPerChild = (product.baseBuyPrice ?? product.buyPrice) / rate;
        if (sellPerChild <= 0) continue;
        const dayCap = productDayCap.get(product.id) || 1;

        // Chọn ngày có capacity còn — duyệt theo thứ tự xáo
        const orderIdxShuffled = nonTetOrders
          .map((_, i) => i)
          .sort(() => rand() - 0.5);

        for (const idx of orderIdxShuffled) {
          if (salesGap <= 3000) break;
          const order = nonTetOrders[idx];
          const dayMap = soldByDayProd.get(order.id)!;
          const soldToday = dayMap.get(product.id) || 0;
          if (soldToday >= dayCap) continue;
          const dayAdded = addedByDay.get(order.id) || 0;
          if (dayAdded >= perDayAddCap) continue;

          // Thêm 1 đơn vị nhỏ
          const remainCapToday = dayCap - soldToday;
          const remainDayBudget = perDayAddCap - dayAdded;
          const maxByBudget = Math.max(1, Math.floor(remainDayBudget / sellPerChild));
          const addQty = Math.min(remainCapToday, stockMap.get(product.id) || 0, maxByBudget,
            Math.max(1, Math.ceil(salesGap / sellPerChild / 10)));
          if (addQty <= 0) continue;

          const addTotal = addQty * sellPerChild;
          const addProfit = addTotal - addQty * buyPerChild;
          const sellUnit = rate > 1 ? (product.conversionUnit || product.unit) : product.unit;
          const existing = order.items.find(it => it.productId === product.id && it.sellPrice === sellPerChild);
          if (existing) {
            existing.quantity += addQty;
            existing.total += addTotal;
            existing.profit += addProfit;
            existing.profitPercent = existing.total > 0 ? Math.round((existing.profit / existing.total) * 1000) / 10 : 0;
          } else {
            order.items.push({
              productId: product.id,
              productName: product.name,
              supplierId: product.supplierId,
              unit: sellUnit,
              quantity: addQty,
              sellPrice: sellPerChild,
              buyPrice: buyPerChild,
              total: addTotal,
              profit: addProfit,
              profitPercent: addTotal > 0 ? Math.round((addProfit / addTotal) * 1000) / 10 : 0,
            });
          }
          order.totalRevenue += addTotal;
          order.totalProfit += addProfit;
          order.profitPercent = order.totalRevenue > 0 ? Math.round((order.totalProfit / order.totalRevenue) * 1000) / 10 : 0;

          dayMap.set(product.id, soldToday + addQty);
          addedByDay.set(order.id, dayAdded + addTotal);
          stockMap.set(product.id, (stockMap.get(product.id) || 0) - addQty);
          salesGap -= addTotal;
          movedThisPass = true;
        }
      }
      if (!movedThisPass) break;
    }
  }

  nonTetOrders = salesOrders.filter(o => o.totalRevenue > 0);
  currentSalesTotal = nonTetOrders.reduce((s, o) => s + o.totalRevenue, 0);

  // Luôn scale phần auto để tổng doanh thu bán hàng KHỚP CHÍNH XÁC 100% target quý.
  if (nonTetOrders.length > 0 && currentSalesTotal > 0 && currentSalesTotal !== autoTargetRevenue) {
    const scale = autoTargetRevenue / currentSalesTotal;
    let allocated = 0;

    for (let i = 0; i < nonTetOrders.length; i++) {
      const o = nonTetOrders[i];
      const isLast = i === nonTetOrders.length - 1;
      let newOrderTotal: number;

      if (isLast) {
        newOrderTotal = autoTargetRevenue - allocated;
      } else {
        newOrderTotal = Math.round((o.totalRevenue * scale) / 1000) * 1000;
      }

      newOrderTotal = Math.max(0, newOrderTotal);
      const itemScale = o.totalRevenue > 0 ? newOrderTotal / o.totalRevenue : 1;
      let itemAlloc = 0;

      for (let j = 0; j < o.items.length; j++) {
        const it = o.items[j];
        const isLastItem = j === o.items.length - 1;
        let newTotal: number;

        if (isLastItem) {
          newTotal = Math.max(0, newOrderTotal - itemAlloc);
        } else {
          newTotal = Math.max(0, Math.round((it.total * itemScale) / 1000) * 1000);
        }

        const prevTotal = it.total;
        if (prevTotal > 0) {
          const margin = it.profit / prevTotal;
          it.total = newTotal;
          it.profit = newTotal * margin;
          it.profitPercent = it.total > 0 ? Math.round((it.profit / it.total) * 1000) / 10 : 0;
        } else {
          it.total = newTotal;
          it.profit = 0;
          it.profitPercent = 0;
        }

        itemAlloc += newTotal;
      }

      o.totalRevenue = newOrderTotal;
      o.totalProfit = o.items.reduce((s, it) => s + it.profit, 0);
      o.profitPercent = newOrderTotal > 0 ? Math.round((o.totalProfit / newOrderTotal) * 1000) / 10 : 0;
      allocated += newOrderTotal;
    }
  }



  return { importOrders, salesOrders, inventoryBatches };
}

// ============================================================================
// CARRY-OVER HELPER
// ============================================================================

export function computeCarryOverStock(
  targetQuarter: number,
  targetYear: number,
  products: Product[],
  imports: ImportOrder[],
  sales: SaleOrder[],
): Map<string, number> {
  const stock = new Map<string, number>();
  products.forEach(p => stock.set(p.id, 0));

  const isBefore = (date: string) => {
    const d = new Date(date);
    const y = d.getFullYear();
    const q = Math.ceil((d.getMonth() + 1) / 3);
    return y < targetYear || (y === targetYear && q < targetQuarter);
  };

  imports.filter(o => !o.deletedAt && isBefore(o.date)).forEach(o => {
    o.items.forEach(it => {
      const rate = it.conversionRate || 1;
      stock.set(it.productId, (stock.get(it.productId) || 0) + it.quantity * rate);
    });
  });

  sales.filter(o => !o.deletedAt && isBefore(o.date)).forEach(o => {
    o.items.forEach(it => {
      stock.set(it.productId, (stock.get(it.productId) || 0) - it.quantity);
    });
  });

  for (const [k, v] of stock) {
    if (v < 0) stock.set(k, 0);
  }
  return stock;
}

export function computeInventorySnapshot(
  targetQuarter: number,
  targetYear: number,
  products: Product[],
  imports: ImportOrder[],
  sales: SaleOrder[],
): InventoryBatch[] {
  const productById = new Map(products.map(p => [p.id, p]));
  const isOnOrBefore = (date: string) => {
    const d = new Date(date);
    const y = d.getFullYear();
    const q = Math.ceil((d.getMonth() + 1) / 3);
    return y < targetYear || (y === targetYear && q <= targetQuarter);
  };
  const makeSortKey = (date: string, createdAt?: string) => `${date}|${createdAt || date}`;

  type WorkingBatch = InventoryBatch & {
    remainingChildQuantity: number;
    conversionRate: number;
    sortKey: string;
  };

  const batches: WorkingBatch[] = [];
  const queues = new Map<string, WorkingBatch[]>();

  const relevantImports = imports
    .filter(o => !o.deletedAt && isOnOrBefore(o.date))
    .sort((a, b) => makeSortKey(a.date, a.createdAt).localeCompare(makeSortKey(b.date, b.createdAt)));

  relevantImports.forEach(order => {
    order.items.forEach(it => {
      const product = productById.get(it.productId);
      const conversionRate = it.conversionRate || product?.conversionRate || 1;
      const batch: WorkingBatch = {
        id: `${order.id}:${it.productId}`,
        importOrderId: order.id,
        productId: it.productId,
        productName: it.productName,
        supplierId: it.supplierId,
        supplierName: it.supplierName,
        unit: it.unit,
        quantity: it.quantity,
        originalQuantity: it.quantity,
        buyPrice: it.buyPrice,
        date: order.date,
        quarter: targetQuarter,
        year: targetYear,
        remainingChildQuantity: it.quantity * conversionRate,
        conversionRate,
        sortKey: makeSortKey(order.date, order.createdAt),
      };
      batches.push(batch);
      if (!queues.has(it.productId)) queues.set(it.productId, []);
      queues.get(it.productId)!.push(batch);
    });
  });

  const relevantSales = sales
    .filter(o => !o.deletedAt && isOnOrBefore(o.date))
    .sort((a, b) => makeSortKey(a.date, a.createdAt).localeCompare(makeSortKey(b.date, b.createdAt)));

  relevantSales.forEach(order => {
    order.items.forEach(it => {
      if (it.quantity <= 0 || it.productId === '__tet__') return;
      const queue = queues.get(it.productId);
      if (!queue || queue.length === 0) return;
      let remaining = it.quantity;
      for (const batch of queue) {
        if (remaining <= 0) break;
        if (batch.remainingChildQuantity <= 0) continue;
        const used = Math.min(batch.remainingChildQuantity, remaining);
        batch.remainingChildQuantity -= used;
        remaining -= used;
      }
    });
  });

  return batches
    .filter(batch => batch.remainingChildQuantity > 0)
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
    .map(batch => {
      const { remainingChildQuantity, conversionRate, sortKey, ...rest } = batch;
      const displayQuantity = Math.round((remainingChildQuantity / conversionRate) * 1000) / 1000;
      return {
        ...rest,
        quarter: targetQuarter,
        year: targetYear,
        quantity: displayQuantity,
      };
    })
    .filter(batch => batch.quantity > 0);
}

// ============================================================================
// SUPPLEMENTARY ORDER — tạo đơn bù khi tổng nhập < doanh thu cần
// ============================================================================

/**
 * Tạo NHIỀU đơn nhập "bổ sung" (tag = 'supplementary') để bù số tiền thiếu.
 * - Chia đều cho TẤT CẢ NCC đủ tư cách (không manual-only) — KHÔNG dồn vào vài NCC.
 * - Mỗi SP tối đa 3 đơn vị lớn / đơn bù.
 * - Trải đều TẤT CẢ sản phẩm của NCC, không chỉ vài SP.
 */
export function generateSupplementaryOrder(
  quarter: number,
  year: number,
  shortfall: number,
  products: Product[],
  suppliers: Supplier[],
): ImportOrder[] | null {
  if (shortfall <= 0) return null;
  const activeProducts = products.filter(p => !p.deletedAt && p.buyPrice > 0);
  if (activeProducts.length === 0) return null;

  const supplierProducts = new Map<string, Product[]>();
  activeProducts.forEach(p => {
    if (!supplierProducts.has(p.supplierId)) supplierProducts.set(p.supplierId, []);
    supplierProducts.get(p.supplierId)!.push(p);
  });

  type Cand = { sup: Supplier; prods: Product[]; rule: SupplierRuleResult };
  const candidates: Cand[] = [];
  for (const [sid, prods] of supplierProducts) {
    const sup = suppliers.find(s => s.id === sid);
    if (!sup) continue;
    const rule = getSupplierRule(sup.name);
    if (rule.manualOnly) continue;
    const eligible = prods.filter(p => !rule.excludeProduct?.(p));
    if (eligible.length === 0) continue;
    candidates.push({ sup, prods: eligible, rule });
  }
  if (candidates.length === 0) return null;

  const totalProds = candidates.reduce((s, c) => s + c.prods.length, 0);
  const rand = seededRandom(quarter * 991 + year * 41 + Math.floor(shortfall / 1000));
  const days = getDaysInQuarter(quarter, year);
  const importDate = days[Math.floor(days.length * 0.1)];

  const results: ImportOrder[] = [];
  const MAX_QTY_PER_PRODUCT = 3;

  for (const { sup, prods, rule } of candidates) {
    const supplierBudget = shortfall * (prods.length / totalProds);
    const shuffled = [...prods].sort(() => rand() - 0.5);

    const items: ImportOrderItem[] = [];
    for (const p of shuffled) {
      let qty = 1;
      const hardMax = rule.maxQtyPerProduct?.(p);
      if (hardMax !== undefined) qty = Math.min(qty, hardMax);
      if (qty <= 0) continue;
      items.push(buildItem(p, sup, qty));
    }

    let acc = items.reduce((s, it) => s + it.total, 0);
    let safety = items.length * MAX_QTY_PER_PRODUCT;
    let cursor = 0;
    while (acc < supplierBudget && safety-- > 0 && items.length > 0) {
      const it = items[cursor % items.length];
      cursor++;
      const prod = prods.find(p => p.id === it.productId)!;
      const hardMax = rule.maxQtyPerProduct?.(prod);
      const cap = Math.min(MAX_QTY_PER_PRODUCT, hardMax ?? MAX_QTY_PER_PRODUCT);
      if (it.quantity >= cap) continue;
      it.quantity += 1;
      it.total = it.buyPrice * it.quantity;
      acc += it.buyPrice;
    }

    if (items.length === 0) continue;

    results.push({
      id: generateId(),
      supplierId: sup.id,
      supplierName: sup.name,
      date: importDate,
      items,
      total: items.reduce((s, it) => s + it.total, 0),
      tag: 'auto',
      locked: false,
      images: [],
      deletedAt: null,
      createdAt: new Date().toISOString(),
    });
  }

  return results.length > 0 ? results : null;
}
