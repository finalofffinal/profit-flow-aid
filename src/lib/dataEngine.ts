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

/** Round only final revenue totals to nearest 1000 (preserve buy/sell prices). */
function roundRevenue(value: number): number {
  return Math.round(value / 1000) * 1000;
}

/** Detect Vietnamese Tet kiêng (Mùng 1-6 Âm lịch) -> revenue = 0 */
function isTetClosedDay(dateStr: string): boolean {
  const d = new Date(dateStr);
  const lunar = getLunarParts(d);
  return lunar.month === 1 && lunar.day >= 1 && lunar.day <= 6;
}

function getRevenueWeight(dateStr: string, rand: () => number): number {
  if (isTetClosedDay(dateStr)) return 0;

  const d = new Date(dateStr);
  const dow = d.getDay();
  const day = d.getDate();
  const month = d.getMonth() + 1;
  const mmdd = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const lunar = getLunarParts(d);

  // Cuối tuần bán nhiều hơn nhưng có biến động
  const weeklyBoost = (dow === 0 || dow === 6)
    ? (rand() > 0.25 ? 1.30 + rand() * 0.20 : 1.05) // not every weekend is high
    : (0.85 + rand() * 0.20);

  let monthlyWeight = 1.0;
  if (day <= 10) monthlyWeight = 1.10;
  else if (day <= 20) monthlyWeight = 1.0;
  else monthlyWeight = 0.90;

  // Vietnamese holidays + pre-holiday boost
  let holidayBoost = 1.0;
  // Trước Tết Âm (tháng Chạp - tháng 12 ÂL)
  if (lunar.month === 12 && lunar.day >= 20) holidayBoost = 1.5 + (lunar.day - 20) * 0.05;
  if (lunar.month === 12 && lunar.day >= 25) holidayBoost = 2.0;
  // Sau mùng 6 Tết -> phục hồi dần
  if (lunar.month === 1 && lunar.day >= 7 && lunar.day <= 15) holidayBoost = 1.15;
  // Rằm tháng Giêng, rằm tháng 7
  if ((lunar.month === 1 || lunar.month === 7) && lunar.day >= 13 && lunar.day <= 15) holidayBoost = Math.max(holidayBoost, 1.25);
  // Lễ Tây
  if (mmdd === '04-30' || mmdd === '05-01') holidayBoost = Math.max(holidayBoost, 1.4);
  if (mmdd === '09-01' || mmdd === '09-02') holidayBoost = Math.max(holidayBoost, 1.3);
  // Trung thu (~rằm tháng 8 ÂL)
  if (lunar.month === 8 && lunar.day >= 10 && lunar.day <= 15) holidayBoost = Math.max(holidayBoost, 1.25);
  // Noel + Tết Tây
  if (month === 12 && day >= 20) holidayBoost = Math.max(holidayBoost, 1.3 + (day - 20) * 0.02);

  const noise = 0.85 + rand() * 0.30;
  return weeklyBoost * monthlyWeight * holidayBoost * noise;
}

/**
 * Allocate target revenue across quarter days such that the SUM == target exactly.
 * Closed days (Tet mùng 1-6) get 0.
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

  // Allocate then enforce EXACT sum on the last non-zero day
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
  // Adjust last non-zero day to make sum match exactly
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
// SUPPLIER RULES (per requirements)
// ============================================================================

interface SupplierRuleResult {
  ordersCount: [number, number]; // [min, max]
  /** maxParentUnits per product per order - default 3 */
  maxQtyPerProduct?: (productName: string) => number;
  /** Total cap across the whole quarter for a product (sum of all orders) */
  maxQtyPerQuarter?: (productName: string) => number | undefined;
  /** Skip product entirely from auto orders */
  excludeProduct?: (productName: string) => boolean;
  /** True = avoid duplicating products across orders within the quarter */
  preferUniquePerQuarter?: boolean;
  /** True = no auto generation (manual only) */
  manualOnly?: boolean;
  /** Minimum unit (e.g. miến dong = 10 lớn / đơn) */
  minQtyPerOrder?: (productName: string) => number | undefined;
}

function getSupplierRule(supplierName: string): SupplierRuleResult {
  const n = supplierName.toLowerCase();
  const has = (s: string) => n.includes(s.toLowerCase());

  if (has('vifon')) return { ordersCount: [2, 2] };
  if (has('liên thành') || has('lien thanh')) return { ordersCount: [1, 1], maxQtyPerProduct: () => 1 };
  if (has('ánh 3 miền') || has('anh 3 mien')) return { ordersCount: [2, 2] };

  if (has('cô lan') || has('co lan')) {
    return {
      ordersCount: [2, 2],
      preferUniquePerQuarter: true,
      maxQtyPerProduct: (p) => {
        const lp = p.toLowerCase();
        if (lp.includes('miến dong')) return 10;
        if (lp.includes('bún tàu') || lp.includes('bun tau')) return 1;
        if (lp.includes('măng') || lp.includes('mang')) return 2;
        return 3;
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
        const lp = p.toLowerCase();
        return lp.includes('nam ngư cao cấp 500ml')
          || lp.includes('nam ngư nhãn vàng 650ml') || lp.includes('nam ngu nhan vang 650ml')
          || lp.includes('tương ớt 250ml') || lp.includes('tuong ot 250ml')
          || lp.includes('nhị ca') || lp.includes('nhi ca');
      },
      maxQtyPerQuarter: (p) => {
        const lp = p.toLowerCase();
        if (lp.includes('hạt nêm 1,8kg') || lp.includes('hat nem 1,8kg') || lp.includes('hạt nêm 1.8kg')) return 1;
        if (lp.includes('shiitake')) return 4;
        if (lp.includes('xúc xích') || lp.includes('xuc xich')) return 20;
        return undefined;
      },
      maxQtyPerProduct: (p) => {
        const lp = p.toLowerCase();
        if (lp.includes('xúc xích') || lp.includes('xuc xich')) return 5;
        if (lp.includes('nhất ca') || lp.includes('nhat ca')) return 1;
        if (lp.includes('tương ớt 500ml') || lp.includes('tuong ot 500ml')) return 1;
        return 5;
      },
    };
  }

  if (has('meizan')) {
    return {
      ordersCount: [2, 2],
      maxQtyPerQuarter: (p) => p.toLowerCase().includes('bơ thực vật') || p.toLowerCase().includes('bo thuc vat') ? 1 : undefined,
      maxQtyPerProduct: () => 3,
    };
  }

  if (has('vĩnh thuận') || has('vinh thuan')) return { ordersCount: [0, 0], manualOnly: true };

  if (has('giấm') || has('giam')) {
    return {
      ordersCount: [1, 1],
      maxQtyPerProduct: (p) => {
        const lp = p.toLowerCase();
        if (lp.includes('cốt') || lp.includes('cot')) return 6;
        return 3;
      },
    };
  }

  if (has('mắm') || has('mam')) {
    return {
      ordersCount: [3, 3],
      maxQtyPerProduct: (p) => {
        const lp = p.toLowerCase();
        if (lp.includes('mắm tôm bắc') || lp.includes('mam tom bac')) return 2;
        return 3;
      },
    };
  }

  if (has('đường') || has('duong')) {
    return {
      ordersCount: [2, 2],
      maxQtyPerProduct: (p) => {
        const lp = p.toLowerCase();
        if (lp.includes('an khê') || lp.includes('an khe')) return 1;
        if (lp.includes('phèn') || lp.includes('phen')) return 3;
        return 2;
      },
    };
  }

  if (has('bánh tráng') || has('banh trang')) return { ordersCount: [1, 1], maxQtyPerProduct: () => 2 };

  if (has('chợ lớn') || has('cho lon')) {
    return {
      ordersCount: [5, 7],
      maxQtyPerProduct: (p) => {
        const lp = p.toLowerCase();
        if (lp.includes('hạnh phúc') || lp.includes('hanh phuc')) return 1;
        if (lp.includes('aji-quick') || lp.includes('aji-mayo') || lp.includes('mayonnaise')) return 10;
        if (lp.includes('bánh phồng tôm') || lp.includes('banh phong tom')) return 1;
        if (lp.includes('la hán quả') || lp.includes('la han qua')) return 1;
        if (lp.includes('giấm gạo') || lp.includes('giam gao')) return 1;
        if (lp.includes('rong canh')) return 1;
        if (lp.includes('da heo')) return 1;
        return 3;
      },
      maxQtyPerQuarter: (p) => {
        const lp = p.toLowerCase();
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
      maxQtyPerProduct: () => 3,
      // Phúc Bình Dương brand: would need brand-aware logic — caller passes Product, we only have name here. Approximated by name.
    };
  }

  if (has('địa đạo') || has('dia dao')) {
    return {
      ordersCount: [7, 10],
      maxQtyPerProduct: (p) => {
        const lp = p.toLowerCase();
        if (lp.includes('aji-ngon 900g') || lp.includes('knorr 3kg')
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
        const lp = p.toLowerCase();
        if ((lp.includes('hạt nêm 400g') || lp.includes('hạt nêm 900g'))
          && (lp.includes('ajimoto') || lp.includes('ajinomoto') || lp.includes('knorr'))) return 3;
        return undefined;
      },
    };
  }

  // Default: small NCC = 2 orders, large = 6-9
  return { ordersCount: [2, 2] };
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
  /** Inventory carried over from previous quarters/years (for rollover stock) */
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

  // Init stock from carry-over (đầu quý)
  const stockMap = new Map<string, number>(carryOverStock);
  activeProducts.forEach(p => {
    if (!stockMap.has(p.id)) stockMap.set(p.id, 0);
  });

  // Group products by supplier
  const supplierProducts = new Map<string, Product[]>();
  activeProducts.forEach(p => {
    if (!supplierProducts.has(p.supplierId)) supplierProducts.set(p.supplierId, []);
    supplierProducts.get(p.supplierId)!.push(p);
  });

  // Import budget = 80–110% of autoTargetRevenue (theo yêu cầu cân bằng thị trường)
  // Q1 + Q4 lệch nhẹ về phía cao (dự trữ Tết), Q2/Q3 lệch về phía thấp.
  const isHighRevenueQuarter = quarter.quarter === 1 || quarter.quarter === 4;
  const importBudgetRatio = isHighRevenueQuarter
    ? 0.95 + rand() * 0.15  // 0.95–1.10
    : 0.80 + rand() * 0.15; // 0.80–0.95
  const targetImportTotal = autoTargetRevenue * importBudgetRatio;
  const importMultiplier = isHighRevenueQuarter ? 1.15 : 0.95;

  for (const [sid, prods] of supplierProducts) {
    const supplier = suppliers.find(s => s.id === sid);
    const supplierName = supplier?.name || 'Khác';
    const rule = getSupplierRule(supplierName);
    if (rule.manualOnly) continue;

    // Filter excluded products
    const eligibleProds = prods.filter(p => !rule.excludeProduct?.(p.name));
    if (eligibleProds.length === 0) continue;

    // Manual orders this supplier already has
    const supplierManualOrders = existingManualImports.filter(o => !o.deletedAt && o.supplierId === sid).length;

    const [minOrders, maxOrders] = rule.ordersCount;
    const totalOrdersNeeded = minOrders + Math.floor(rand() * (maxOrders - minOrders + 1));
    const autoOrdersCount = Math.max(0, totalOrdersNeeded - supplierManualOrders);
    if (autoOrdersCount === 0) continue;

    // Schedule order days
    const orderDayIndices: number[] = [];
    for (let i = 0; i < autoOrdersCount; i++) {
      const base = Math.floor(((i + 0.5) / autoOrdersCount) * days.length);
      const jitter = Math.floor(rand() * Math.max(1, days.length / autoOrdersCount * 0.5));
      const idx = Math.min(base + jitter, days.length - 1);
      orderDayIndices.push(idx);
    }
    orderDayIndices.sort((a, b) => a - b);

    // Track quarter-wide quantities for cap enforcement
    const qtyUsedThisQuarter = new Map<string, number>();
    // Track which products already used (for preferUniquePerQuarter)
    const productsUsedSet = new Set<string>();

    const prodsShuffled = [...eligibleProds].sort(() => rand() - 0.5);

    for (let oi = 0; oi < autoOrdersCount; oi++) {
      const importDate = days[orderDayIndices[oi]];
      const items: ImportOrderItem[] = [];

      // Pick products for this order
      let productsForOrder: Product[];
      if (rule.preferUniquePerQuarter) {
        // Distribute uniquely across orders
        const remaining = prodsShuffled.filter(p => !productsUsedSet.has(p.id));
        const targetCount = Math.ceil(prodsShuffled.length / autoOrdersCount);
        productsForOrder = remaining.slice(0, targetCount);
        // If first order and lots of products, give it more
        if (productsForOrder.length === 0) productsForOrder = prodsShuffled.slice(0, 2);
      } else {
        // Distribute roughly evenly, all products covered across orders
        const totalProds = prodsShuffled.length;
        const prodsPerOrder = Math.ceil(totalProds / autoOrdersCount);
        const start = oi * prodsPerOrder;
        productsForOrder = prodsShuffled.slice(start, start + prodsPerOrder);
        // Add 1-2 random extras for HPV/large NCC variety
        if (totalProds > 5) {
          const extras = Math.floor(rand() * 3);
          for (let e = 0; e < extras; e++) {
            const r = prodsShuffled[Math.floor(rand() * totalProds)];
            if (!productsForOrder.find(p => p.id === r.id)) productsForOrder.push(r);
          }
        }
      }

      for (const product of productsForOrder) {
        productsUsedSet.add(product.id);
        const rate = product.conversionRate || 1;

        // Determine max qty for this product in this order
        const ruleMax = rule.maxQtyPerProduct?.(product.name) ?? 3;
        const minRequired = rule.minQtyPerOrder?.(product.name);

        // Apply quarter-wide cap
        const qCap = rule.maxQtyPerQuarter?.(product.name);
        const usedSoFar = qtyUsedThisQuarter.get(product.id) || 0;
        const remainingByQCap = qCap !== undefined ? Math.max(0, qCap - usedSoFar) : Infinity;
        if (remainingByQCap === 0) continue;

        // Random qty within rules, weighted by importMultiplier (Q1/Q4 heavier)
        let qtyParent = minRequired ?? Math.max(1, Math.floor(1 + rand() * ruleMax * importMultiplier));
        qtyParent = Math.min(qtyParent, ruleMax, remainingByQCap);
        if (qtyParent <= 0) continue;

        const buyPrice = product.buyPrice;
        items.push({
          productId: product.id,
          productName: product.name,
          supplierId: product.supplierId,
          supplierName,
          unit: product.unit,
          conversionUnit: product.conversionUnit || product.unit,
          conversionRate: rate,
          quantity: qtyParent,
          buyPrice,
          total: buyPrice * qtyParent,
        });

        stockMap.set(product.id, (stockMap.get(product.id) || 0) + qtyParent * rate);
        qtyUsedThisQuarter.set(product.id, usedSoFar + qtyParent);
      }

      if (items.length > 0) {
        const order: ImportOrder = {
          id: generateId(),
          supplierId: sid,
          supplierName,
          date: importDate,
          items,
          total: items.reduce((s, it) => s + it.total, 0),
          tag: 'auto',
          locked: false,
          images: [],
          deletedAt: null,
          createdAt: importDate + 'T08:00:00.000Z',
        };
        importOrders.push(order);

        for (const item of items) {
          inventoryBatches.push({
            id: generateId(),
            importOrderId: order.id,
            productId: item.productId,
            productName: item.productName,
            supplierId: item.supplierId,
            supplierName: item.supplierName,
            unit: item.unit,
            quantity: item.quantity,
            originalQuantity: item.quantity,
            buyPrice: item.buyPrice,
            date: importDate,
            quarter: quarter.quarter,
            year: quarter.year,
          });
        }
      }
    }
  }

  // ============================================================================
  // REBALANCE IMPORTS — đưa tổng nhập về 80–110% doanh thu mục tiêu
  // ============================================================================
  const currentImportTotal = importOrders.reduce((s, o) => s + o.total, 0);
  if (currentImportTotal > 0 && targetImportTotal > 0) {
    const scale = targetImportTotal / currentImportTotal;
    // Chỉ scale nếu lệch >5% để tránh nhiễu nhỏ
    if (Math.abs(scale - 1) > 0.05) {
      for (const order of importOrders) {
        for (const it of order.items) {
          // scale quantity, giữ buyPrice nguyên (snapshot)
          const newQty = Math.max(1, Math.round(it.quantity * scale));
          // cập nhật stock theo chênh lệch
          const rate = it.conversionRate || 1;
          const stockDelta = (newQty - it.quantity) * rate;
          stockMap.set(it.productId, (stockMap.get(it.productId) || 0) + stockDelta);
          it.quantity = newQty;
          it.total = it.buyPrice * newQty;
        }
        order.total = order.items.reduce((s, it) => s + it.total, 0);
      }
      // Cập nhật batches tương ứng
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

  for (let dayIdx = 0; dayIdx < days.length; dayIdx++) {
    const day = days[dayIdx];
    const targetDayRevenue = dailyRevenue.get(day) || 0;
    if (targetDayRevenue <= 0) continue; // Tet closed days = 0

    const items: SaleItem[] = [];
    let remaining = targetDayRevenue;

    const shuffled = [...activeProducts].sort(() => rand() - 0.5);
    const basketSize = Math.min(shuffled.length, 12 + Math.floor(rand() * 20));

    for (let i = 0; i < basketSize && remaining > 3000; i++) {
      const product = shuffled[i];
      const rate = product.conversionRate || 1;
      const hasChild = rate > 1;
      const sellPerUnit = product.sellPrice / rate;
      const buyPerUnit = product.buyPrice / rate;
      if (sellPerUnit <= 0) continue;

      const portion = remaining / Math.max(1, basketSize - i);
      const maxChildUnits = Math.max(1, Math.floor(rate * (0.1 + rand() * 0.3)));
      let qty = Math.max(1, Math.round(portion / sellPerUnit));
      qty = hasChild ? Math.min(qty, maxChildUnits) : Math.min(qty, 1 + Math.floor(rand() * 2));

      // Soft stock check — never block reaching target (carry-over absorbs deficit)
      const stock = stockMap.get(product.id) || 0;
      if (stock <= 0) {
        // create implicit virtual stock so sales target can still hit
        stockMap.set(product.id, qty * 5);
      }
      qty = Math.min(qty, stockMap.get(product.id) || qty);
      if (qty <= 0) continue;

      const total = sellPerUnit * qty;
      const profit = total - buyPerUnit * qty;
      const sellUnit = hasChild ? (product.conversionUnit || product.unit) : product.unit;

      items.push({
        productId: product.id,
        productName: product.name,
        supplierId: product.supplierId,
        unit: sellUnit,
        quantity: qty,
        sellPrice: sellPerUnit,
        buyPrice: buyPerUnit,
        total,
        profit,
        profitPercent: 0, // not displayed anywhere now
      });

      stockMap.set(product.id, (stockMap.get(product.id) || 0) - qty);
      remaining -= total;
    }

    if (items.length === 0) continue;

    // Force EXACT daily target — adjust last item to absorb the entire residual
    const rawTotal = items.reduce((s, it) => s + it.total, 0);
    const diff = targetDayRevenue - rawTotal; // exact, not rounded
    if (Math.abs(diff) > 0 && items.length > 0) {
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
      totalRevenue, // EXACT match to dailyRevenue.get(day)
      totalProfit,
      profitPercent: 0,
      tag: 'auto',
      paymentMethod: 'cash', // legacy field, not displayed in PDF
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

/**
 * Compute end-of-period stock (productId -> child units remaining)
 * across all imports/sales BEFORE the target quarter. Used to seed
 * the new quarter's stockMap so end-of-Q4/Y becomes start-of-Q1/Y+1.
 */
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

  // Floor at 0 (we don't carry negative stock)
  for (const [k, v] of stock) {
    if (v < 0) stock.set(k, 0);
  }
  return stock;
}
