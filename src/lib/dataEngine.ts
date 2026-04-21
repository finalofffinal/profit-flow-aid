import { Product, Supplier, QuarterData, ImportOrder, ImportOrderItem, SaleOrder, SaleItem, InventoryBatch } from '@/types';
import { getLunarParts } from '@/lib/lunar';

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
      const date = new Date(year, m, d);
      days.push(date.toISOString().split('T')[0]);
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
 * Tự nhiên hơn: cuối tuần KHÔNG phải lúc nào cũng cao đột biến.
 * Random theo từng tuần, có ngày T7/CN cao, có ngày bình thường.
 */
function getRevenueWeight(dateStr: string, rand: () => number): number {
  if (isTetClosedDay(dateStr)) return 0;

  const d = new Date(dateStr);
  const dow = d.getDay();
  const day = d.getDate();
  const month = d.getMonth() + 1;
  const mmdd = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const lunar = getLunarParts(d);

  // Cuối tuần: 50% là cao nhẹ, 30% bình thường, 20% thấp (mưa, vắng khách)
  let weeklyBoost = 1.0;
  if (dow === 0 || dow === 6) {
    const r = rand();
    if (r < 0.5) weeklyBoost = 1.10 + rand() * 0.15;       // 1.10–1.25
    else if (r < 0.8) weeklyBoost = 0.95 + rand() * 0.10;  // 0.95–1.05
    else weeklyBoost = 0.80 + rand() * 0.10;               // 0.80–0.90
  } else {
    // Ngày thường: dao động 0.85–1.15
    weeklyBoost = 0.85 + rand() * 0.30;
  }

  // Trong tháng: đầu tháng (lương) cao hơn nhẹ
  let monthlyWeight = 1.0;
  if (day <= 5) monthlyWeight = 1.08;
  else if (day <= 10) monthlyWeight = 1.04;
  else if (day <= 20) monthlyWeight = 1.0;
  else if (day <= 25) monthlyWeight = 0.95;
  else monthlyWeight = 0.92;

  // Lễ Việt Nam
  let holidayBoost = 1.0;
  // Trước Tết Âm (tháng Chạp ÂL): tăng dần
  if (lunar.month === 12 && lunar.day >= 15 && lunar.day <= 19) holidayBoost = 1.15;
  if (lunar.month === 12 && lunar.day >= 20 && lunar.day <= 24) holidayBoost = 1.30 + (lunar.day - 20) * 0.04;
  if (lunar.month === 12 && lunar.day >= 25) holidayBoost = 1.55 + (lunar.day - 25) * 0.05;
  // Sau Tết: phục hồi nhẹ
  if (lunar.month === 1 && lunar.day >= 7 && lunar.day <= 15) holidayBoost = 1.10;
  // Rằm tháng Giêng / tháng 7
  if ((lunar.month === 1 || lunar.month === 7) && lunar.day >= 13 && lunar.day <= 15) {
    holidayBoost = Math.max(holidayBoost, 1.18);
  }
  // 30/4 - 1/5
  if (mmdd === '04-30' || mmdd === '05-01') holidayBoost = Math.max(holidayBoost, 1.25);
  // Quốc khánh
  if (mmdd === '09-01' || mmdd === '09-02') holidayBoost = Math.max(holidayBoost, 1.18);
  // Trung thu
  if (lunar.month === 8 && lunar.day >= 10 && lunar.day <= 15) holidayBoost = Math.max(holidayBoost, 1.18);
  // Noel + Tết Tây
  if (month === 12 && day >= 22) holidayBoost = Math.max(holidayBoost, 1.15 + (day - 22) * 0.02);

  // Nhiễu nhỏ ±10%
  const noise = 0.90 + rand() * 0.20;
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
  /** Số lượng đơn vị lớn tối đa mỗi sản phẩm trong 1 đơn (mặc định 3) */
  maxQtyPerProduct?: (product: Product) => number;
  /** Cap tổng cả quý cho 1 sản phẩm (cộng dồn các đơn) */
  maxQtyPerQuarter?: (product: Product) => number | undefined;
  /** Số lượng tối thiểu mỗi đơn (e.g. miến dong = 10) */
  minQtyPerOrder?: (product: Product) => number | undefined;
  /** Loại bỏ sản phẩm khỏi đơn tự động */
  excludeProduct?: (product: Product) => boolean;
  /** Ưu tiên không trùng sản phẩm giữa các đơn trong cùng quý */
  preferUniquePerQuarter?: boolean;
  /** Không tạo tự động */
  manualOnly?: boolean;
}

function getSupplierRule(supplierName: string): SupplierRuleResult {
  const n = supplierName.toLowerCase();
  const has = (s: string) => n.includes(s.toLowerCase());

  if (has('vifon')) return { ordersCount: [2, 2], maxQtyPerProduct: () => 3 };

  if (has('liên thành') || has('lien thanh')) {
    return { ordersCount: [1, 1], maxQtyPerProduct: () => 1 };
  }

  if (has('ánh 3 miền') || has('anh 3 mien')) {
    return { ordersCount: [2, 2], maxQtyPerProduct: () => 3 };
  }

  if (has('cô lan') || has('co lan')) {
    return {
      ordersCount: [2, 2],
      preferUniquePerQuarter: true,
      maxQtyPerProduct: (p) => {
        const lp = p.name.toLowerCase();
        if (lp.includes('miến dong')) return 10;
        if (lp.includes('bún tàu') || lp.includes('bun tau')) return 1;
        if (lp.includes('măng') || lp.includes('mang')) return 2;
        return 3;
      },
      minQtyPerOrder: (p) => {
        const lp = p.name.toLowerCase();
        if (lp.includes('miến dong')) return 10; // bắt buộc 10 đơn vị/đơn
        return undefined;
      },
    };
  }

  if (has('đậu') || has('dau')) {
    return {
      ordersCount: [2, 2],
      preferUniquePerQuarter: true,
      maxQtyPerProduct: () => 2,
    };
  }

  if (has('hpv')) {
    return {
      ordersCount: [3, 5],
      excludeProduct: (p) => {
        const lp = p.name.toLowerCase();
        return lp.includes('nam ngư cao cấp 500ml') || lp.includes('nam ngu cao cap 500ml')
          || lp.includes('nam ngư nhãn vàng 650ml') || lp.includes('nam ngu nhan vang 650ml')
          || lp.includes('tương ớt 250ml') || lp.includes('tuong ot 250ml')
          || lp.includes('nhị ca') || lp.includes('nhi ca');
      },
      maxQtyPerQuarter: (p) => {
        const lp = p.name.toLowerCase();
        if (lp.includes('hạt nêm 1,8kg') || lp.includes('hat nem 1,8kg') || lp.includes('hạt nêm 1.8kg')) return 1;
        if (lp.includes('shiitake')) return 4;
        if (lp.includes('xúc xích') || lp.includes('xuc xich') || lp.includes('bin & bon') || lp.includes('bin&bon')) return 20;
        return undefined;
      },
      maxQtyPerProduct: (p) => {
        const lp = p.name.toLowerCase();
        // Bin & Bon: tối đa 20/quý, mỗi đơn ≥5 và ≤10 (chia 2-4 đơn)
        if (lp.includes('xúc xích') || lp.includes('xuc xich') || lp.includes('bin & bon') || lp.includes('bin&bon')) return 10;
        if (lp.includes('nhất ca') || lp.includes('nhat ca')) return 1;
        if (lp.includes('tương ớt 500ml') || lp.includes('tuong ot 500ml')) return 1;
        return 5;
      },
      minQtyPerOrder: (p) => {
        const lp = p.name.toLowerCase();
        // Bin & Bon: trong 1 đơn ≥5 đơn vị lớn
        if (lp.includes('xúc xích') || lp.includes('xuc xich') || lp.includes('bin & bon') || lp.includes('bin&bon')) return 5;
        return undefined;
      },
    };
  }

  if (has('meizan')) {
    return {
      ordersCount: [2, 2],
      maxQtyPerQuarter: (p) => {
        const lp = p.name.toLowerCase();
        if (lp.includes('bơ thực vật') || lp.includes('bo thuc vat')) return 1;
        return 3; // các SP còn lại tối đa 3 đơn vị/quý
      },
      maxQtyPerProduct: (p) => {
        const lp = p.name.toLowerCase();
        if (lp.includes('bơ thực vật') || lp.includes('bo thuc vat')) return 1;
        return 3;
      },
    };
  }

  if (has('vĩnh thuận') || has('vinh thuan')) {
    return { ordersCount: [0, 0], manualOnly: true };
  }

  if (has('giấm') || has('giam')) {
    return {
      ordersCount: [1, 1],
      maxQtyPerProduct: (p) => {
        const lp = p.name.toLowerCase();
        if (lp.includes('cốt') || lp.includes('cot')) return 6;
        return 3; // tinh luyện, nuôi
      },
    };
  }

  if (has('mắm') || has('mam')) {
    return {
      ordersCount: [3, 3],
      maxQtyPerProduct: (p) => {
        const lp = p.name.toLowerCase();
        if (lp.includes('mắm tôm bắc') || lp.includes('mam tom bac')) return 2;
        return 3;
      },
    };
  }

  if (has('đường') || has('duong')) {
    return {
      ordersCount: [2, 2],
      maxQtyPerProduct: (p) => {
        const lp = p.name.toLowerCase();
        const brand = (p.brand || '').toLowerCase();
        if (lp.includes('an khê') || lp.includes('an khe')) return 1;
        if (lp.includes('phèn') || lp.includes('phen')) return 3;
        if (lp.includes('đường trắng') || lp.includes('duong trang')) {
          if (brand.includes('biên hòa') || brand.includes('bien hoa')) return 2;
          return 2; // brand "Khác" cũng 2
        }
        return 2;
      },
    };
  }

  if (has('bánh tráng') || has('banh trang')) {
    return { ordersCount: [1, 1], maxQtyPerProduct: () => 2 };
  }

  if (has('chợ lớn') || has('cho lon')) {
    return {
      ordersCount: [5, 7],
      maxQtyPerProduct: (p) => {
        const lp = p.name.toLowerCase();
        const brand = (p.brand || '').toLowerCase();
        if (lp.includes('nước mắm cá cơm') && (brand.includes('hạnh phúc') || brand.includes('hanh phuc'))) return 1;
        if (lp.includes('aji-quick') || lp.includes('aji-mayo') || lp.includes('mayonnaise')) return 10;
        if (lp.includes('bánh phồng tôm') || lp.includes('banh phong tom')) return 1;
        if (lp.includes('la hán quả') || lp.includes('la han qua')) return 1;
        if (lp.includes('giấm gạo') || lp.includes('giam gao')) return 1;
        if (lp.includes('rong canh')) return 1;
        if (lp.includes('da heo')) return 1;
        return 3;
      },
      maxQtyPerQuarter: (p) => {
        const lp = p.name.toLowerCase();
        const brand = (p.brand || '').toLowerCase();
        if (lp.includes('nước mắm cá cơm') && (brand.includes('hạnh phúc') || brand.includes('hanh phuc'))) return 1;
        if (lp.includes('aji-quick') || lp.includes('aji-mayo') || lp.includes('mayonnaise')) return 20;
        if (lp.includes('bánh phồng tôm') || lp.includes('banh phong tom')) return 1;
        if (lp.includes('la hán quả') || lp.includes('la han qua')) return 1;
        if (lp.includes('giấm gạo') || lp.includes('giam gao')) return 1;
        if (lp.includes('rong canh')) return 1;
        if (lp.includes('da heo')) return 1;
        return undefined;
      },
    };
  }

  if (has('tada')) {
    return {
      ordersCount: [6, 9],
      maxQtyPerProduct: (p) => {
        const brand = (p.brand || '').toLowerCase();
        if (brand.includes('phúc bình dương') || brand.includes('phuc binh duong')) return 1;
        return 3;
      },
      maxQtyPerQuarter: (p) => {
        const brand = (p.brand || '').toLowerCase();
        if (brand.includes('phúc bình dương') || brand.includes('phuc binh duong')) return 1;
        return undefined;
      },
    };
  }

  if (has('địa đạo') || has('dia dao')) {
    return {
      ordersCount: [7, 10],
      maxQtyPerProduct: (p) => {
        const lp = p.name.toLowerCase();
        const brand = (p.brand || '').toLowerCase();
        if (lp.includes('aji-ngon 900g') || (lp.includes('3kg') && brand.includes('knorr'))
          || lp.includes('xí muội 270g') || lp.includes('xi muoi 270g')
          || lp.includes('xí muội 2.1kg') || lp.includes('xi muoi 2.1kg')) return 1;
        if (lp.includes('nhất ca') || lp.includes('nhat ca')) return 1;
        if (lp.includes('miến đậu xanh') || lp.includes('mien dau xanh')) return 1;
        if (lp.includes('nui dài') || lp.includes('nui dai')
          || lp.includes('nui ngắn') || lp.includes('nui ngan')
          || lp.includes('nui xoắn') || lp.includes('nui xoan')
          || lp.includes('bún tươi') || lp.includes('bun tuoi')
          || lp.includes('cốt dừa') || lp.includes('cot dua')) return 1;
        if (lp.includes('tương ớt 2.1kg') || lp.includes('tuong ot 2.1kg')
          || lp.includes('tương cà 2.1kg') || lp.includes('tuong ca 2.1kg')) return 1;
        return 3;
      },
      maxQtyPerQuarter: (p) => {
        const lp = p.name.toLowerCase();
        const brand = (p.brand || '').toLowerCase();
        if (lp.includes('aji-ngon 900g')) return 1;
        if (lp.includes('3kg') && brand.includes('knorr')) return 1;
        if (lp.includes('xí muội 270g') || lp.includes('xi muoi 270g')) return 1;
        if (lp.includes('xí muội 2.1kg') || lp.includes('xi muoi 2.1kg')) return 1;
        if (lp.includes('nhất ca') || lp.includes('nhat ca')) return 1;
        if (lp.includes('miến đậu xanh') || lp.includes('mien dau xanh')) return 1;
        if ((lp.includes('hạt nêm 400g') || lp.includes('hạt nêm 900g'))
          && (brand.includes('ajimoto') || brand.includes('ajinomoto'))) return 3;
        if ((lp.includes('hạt nêm 400g') || lp.includes('hạt nêm 900g'))
          && brand.includes('knorr')) return 3;
        if (lp.includes('nui') || lp.includes('bún tươi') || lp.includes('bun tuoi')
          || lp.includes('cốt dừa') || lp.includes('cot dua')) return 1;
        if (lp.includes('tương ớt 2.1kg') || lp.includes('tuong ot 2.1kg')
          || lp.includes('tương cà 2.1kg') || lp.includes('tuong ca 2.1kg')) return 1;
        return undefined;
      },
    };
  }

  // Default fallback
  return { ordersCount: [2, 2], maxQtyPerProduct: () => 3 };
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
): { orders: ImportOrder[]; batches: InventoryBatch[] } {
  const rule = getSupplierRule(supplier.name);
  if (rule.manualOnly) return { orders: [], batches: [] };

  const eligible = prods.filter(p => !rule.excludeProduct?.(p));
  if (eligible.length === 0) return { orders: [], batches: [] };

  const [minOrders, maxOrders] = rule.ordersCount;
  const total = minOrders + Math.floor(rand() * (maxOrders - minOrders + 1));
  const autoCount = Math.max(0, total - manualOrdersCount);
  if (autoCount === 0) return { orders: [], batches: [] };

  // Schedule order days (rải đều có jitter)
  const dayIdxs: number[] = [];
  for (let i = 0; i < autoCount; i++) {
    const base = Math.floor(((i + 0.5) / autoCount) * days.length);
    const jitter = Math.floor((rand() - 0.5) * (days.length / autoCount * 0.6));
    dayIdxs.push(Math.min(days.length - 1, Math.max(0, base + jitter)));
  }
  dayIdxs.sort((a, b) => a - b);

  // Quantity tracking
  const qtyUsedQuarter = new Map<string, number>();
  const productsUsed = new Set<string>();

  const isLargeSupplier = eligible.length > 10;

  // ===== Đối với NCC nhỏ (≤10 SP): phân bổ theo rule cũ =====
  // ===== Đối với NCC lớn (>10 SP): bao phủ toàn bộ + cân bằng tiền =====
  const orderItems: ImportOrderItem[][] = Array.from({ length: autoCount }, () => []);

  if (isLargeSupplier) {
    // Bao phủ toàn bộ: shuffle rồi chia đều round-robin
    const shuffled = [...eligible].sort(() => rand() - 0.5);
    shuffled.forEach((p, i) => {
      const orderIdx = i % autoCount;
      const ruleMax = rule.maxQtyPerProduct?.(p) ?? 3;
      const qCap = rule.maxQtyPerQuarter?.(p);
      const minReq = rule.minQtyPerOrder?.(p);
      const used = qtyUsedQuarter.get(p.id) || 0;
      const remainCap = qCap !== undefined ? Math.max(0, qCap - used) : Infinity;
      if (remainCap === 0) return;
      let qty = minReq ?? Math.max(1, Math.floor(1 + rand() * ruleMax));
      qty = Math.min(qty, ruleMax, remainCap);
      if (qty <= 0) return;
      orderItems[orderIdx].push(buildItem(p, supplier, qty));
      qtyUsedQuarter.set(p.id, used + qty);
      productsUsed.add(p.id);
    });

    // Cân bằng tiền: tính tổng từng đơn, scale qty các đơn lệch nhiều về trung bình
    const totals = orderItems.map(its => its.reduce((s, it) => s + it.total, 0));
    const avg = totals.reduce((a, b) => a + b, 0) / Math.max(1, totals.length);
    if (avg > 0) {
      orderItems.forEach((its, idx) => {
        const t = totals[idx];
        if (t === 0) return;
        const ratio = avg / t;
        // Chỉ điều chỉnh nhẹ ±25% để giữ số nguyên hợp lý
        const clamped = Math.max(0.75, Math.min(1.25, ratio));
        if (Math.abs(clamped - 1) < 0.05) return;
        its.forEach(it => {
          const ruleMax = rule.maxQtyPerProduct?.(eligible.find(p => p.id === it.productId)!) ?? 3;
          const newQty = Math.max(1, Math.min(ruleMax, Math.round(it.quantity * clamped)));
          const delta = newQty - it.quantity;
          if (delta !== 0) {
            it.quantity = newQty;
            it.total = it.buyPrice * newQty;
            // Cập nhật qtyUsedQuarter
            qtyUsedQuarter.set(it.productId, (qtyUsedQuarter.get(it.productId) || 0) + delta);
          }
        });
      });
    }
  } else {
    // ===== NCC nhỏ ≤10 SP: theo rule chi tiết =====
    const shuffled = [...eligible].sort(() => rand() - 0.5);

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
        const used = qtyUsedQuarter.get(p.id) || 0;
        const remainCap = qCap !== undefined ? Math.max(0, qCap - used) : Infinity;
        if (remainCap === 0) continue;
        let qty = minReq ?? Math.max(1, Math.floor(1 + rand() * ruleMax));
        qty = Math.min(qty, ruleMax, remainCap);
        if (qty <= 0) continue;
        orderItems[oi].push(buildItem(p, supplier, qty));
        qtyUsedQuarter.set(p.id, used + qty);
        productsUsed.add(p.id);
      }
    }
  }

  // Build orders + batches; bỏ đơn rỗng (yêu cầu: KHÔNG tạo đơn 1 món thì… đơn rỗng càng không)
  // Yêu cầu: không tạo đơn chỉ có 1 SP → nếu đơn chỉ có 1 SP, dồn sang đơn liền kề
  for (let i = 0; i < orderItems.length; i++) {
    if (orderItems[i].length === 1 && orderItems.length > 1) {
      const target = i + 1 < orderItems.length ? i + 1 : i - 1;
      orderItems[target].push(...orderItems[i]);
      orderItems[i] = [];
    }
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
  return {
    productId: p.id,
    productName: p.name,
    supplierId: p.supplierId,
    supplierName: supplier.name,
    unit: p.unit,
    conversionUnit: p.conversionUnit || p.unit,
    conversionRate: p.conversionRate || 1,
    quantity: qty,
    buyPrice: p.buyPrice,
    total: p.buyPrice * qty,
  };
}

// ============================================================================
// MAIN GENERATOR
// ============================================================================

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

  const rand = seededRandom(quarter.quarter * 7919 + quarter.year * 31);
  const days = getDaysInQuarter(quarter.quarter, quarter.year);
  const activeProducts = products.filter(p => !p.deletedAt && p.sellPrice > 0);
  if (activeProducts.length === 0) {
    return { importOrders: [], salesOrders: [], inventoryBatches: [] };
  }

  const manualSalesTotal = existingManualSales.filter(s => !s.deletedAt).reduce((sum, s) => sum + s.totalRevenue, 0);
  const autoTargetRevenue = Math.max(0, quarter.targetRevenue - manualSalesTotal);
  const dailyRevenue = generateDailyRevenue(days, autoTargetRevenue, rand);

  const importOrders: ImportOrder[] = [];
  const salesOrders: SaleOrder[] = [];
  const inventoryBatches: InventoryBatch[] = [];

  // Stock từ carry-over
  const stockMap = new Map<string, number>(carryOverStock);
  activeProducts.forEach(p => { if (!stockMap.has(p.id)) stockMap.set(p.id, 0); });

  // Group sản phẩm theo NCC
  const supplierProducts = new Map<string, Product[]>();
  activeProducts.forEach(p => {
    if (!supplierProducts.has(p.supplierId)) supplierProducts.set(p.supplierId, []);
    supplierProducts.get(p.supplierId)!.push(p);
  });

  // ===== Sinh đơn nhập theo NCC =====
  for (const [sid, prods] of supplierProducts) {
    const supplier = suppliers.find(s => s.id === sid);
    if (!supplier) continue;
    const manualCount = existingManualImports.filter(o => !o.deletedAt && o.supplierId === sid).length;
    const { orders, batches } = generateSupplierImports(supplier, prods, manualCount, days, rand, stockMap);
    importOrders.push(...orders);
    inventoryBatches.push(...batches);
  }

  // ===== Cân bằng tổng nhập về 80–110% doanh thu mục tiêu =====
  const isHighRev = quarter.quarter === 1 || quarter.quarter === 4;
  const importBudgetRatio = isHighRev ? 0.95 + rand() * 0.15 : 0.80 + rand() * 0.15;
  const targetImportTotal = autoTargetRevenue * importBudgetRatio;
  const currentImportTotal = importOrders.reduce((s, o) => s + o.total, 0);
  if (currentImportTotal > 0 && targetImportTotal > 0) {
    const scale = targetImportTotal / currentImportTotal;
    if (Math.abs(scale - 1) > 0.05) {
      for (const order of importOrders) {
        for (const it of order.items) {
          const newQty = Math.max(1, Math.round(it.quantity * scale));
          const rate = it.conversionRate || 1;
          stockMap.set(it.productId, (stockMap.get(it.productId) || 0) + (newQty - it.quantity) * rate);
          it.quantity = newQty;
          it.total = it.buyPrice * newQty;
        }
        order.total = order.items.reduce((s, it) => s + it.total, 0);
      }
      for (const batch of inventoryBatches) {
        const order = importOrders.find(o => o.id === batch.importOrderId);
        const it = order?.items.find(x => x.productId === batch.productId);
        if (it) {
          batch.quantity = it.quantity;
          batch.originalQuantity = it.quantity;
        }
      }
    }
  }

  // ============================================================================
  // SALES — tổng = autoTargetRevenue chính xác.
  // - Mỗi SP/ngày tối đa 1 đơn vị LỚN (= conversionRate child units, hoặc 1 nếu không có child).
  // - Biên lợi nhuận tự nhiên 10–25% (đã quyết định bởi giá nhập/bán).
  // - Nghỉ Tết: tạo SaleOrder placeholder doanh thu 0 với label.
  // ============================================================================

  for (let dayIdx = 0; dayIdx < days.length; dayIdx++) {
    const day = days[dayIdx];
    const targetDayRevenue = dailyRevenue.get(day) || 0;

    // Ngày Tết kiêng — tạo placeholder revenue 0
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

    // Track SP đã bán hôm nay (để cap 1 đơn vị lớn / SP / ngày)
    const dailyParentSold = new Map<string, number>();

    // Cần basket lớn để đạt target nhưng giữ "1 đơn vị lớn / SP / ngày"
    // → cần bán nhiều SP khác nhau. Shuffle danh sách.
    const shuffled = [...activeProducts].sort(() => rand() - 0.5);

    for (let i = 0; i < shuffled.length && remaining > 3000; i++) {
      const product = shuffled[i];
      const rate = product.conversionRate || 1;
      const hasChild = rate > 1;
      const sellPerChild = product.sellPrice / rate;
      const buyPerChild = product.buyPrice / rate;
      if (sellPerChild <= 0) continue;

      // 1 đơn vị lớn = `rate` child units (hoặc 1 nếu không có child)
      const maxChildUnitsToday = hasChild ? rate : 1;
      const alreadySold = dailyParentSold.get(product.id) || 0;
      if (alreadySold >= maxChildUnitsToday) continue;
      const remainingCapToday = maxChildUnitsToday - alreadySold;

      // Lượng cần bán ước tính từ portion còn lại
      const remainingProds = shuffled.length - i;
      const portion = remaining / Math.max(1, Math.min(remainingProds, 20));
      let qty = Math.max(1, Math.round(portion / sellPerChild));
      qty = Math.min(qty, remainingCapToday);
      if (qty <= 0) continue;

      // Soft stock (nếu hết stock, virtual để vẫn đạt target)
      const stock = stockMap.get(product.id) || 0;
      if (stock <= 0) stockMap.set(product.id, qty * 3);
      qty = Math.min(qty, stockMap.get(product.id) || qty);
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

      stockMap.set(product.id, (stockMap.get(product.id) || 0) - qty);
      dailyParentSold.set(product.id, alreadySold + qty);
      remaining -= total;
    }

    if (items.length === 0) continue;

    // Khớp chính xác doanh thu ngày — chỉnh item cuối
    const rawTotal = items.reduce((s, it) => s + it.total, 0);
    const diff = targetDayRevenue - rawTotal;
    if (Math.abs(diff) > 0) {
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
