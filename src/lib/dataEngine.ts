import { Product, Supplier, QuarterData, ImportOrder, ImportOrderItem, SaleOrder, SaleItem, InventoryBatch } from '@/types';

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

function getDayOfWeek(dateStr: string): number {
  return new Date(dateStr).getDay(); // 0=Sun, 1=Mon...6=Sat
}

function roundToThousand(value: number): number {
  return Math.round(value / 1000) * 1000;
}

// Realistic daily revenue pattern based on Vietnamese retail
function getRevenueWeight(dateStr: string, rand: () => number): number {
  const d = new Date(dateStr);
  const dow = d.getDay();
  const day = d.getDate();
  const month = d.getMonth() + 1;
  const mmdd = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  // 1. Weekly pattern: Mon-Wed lowest, Thu moderate, Fri-Sun highest
  const weeklyWeight = [1.25, 0.72, 0.75, 0.78, 0.88, 1.15, 1.30][dow]; // Sun,Mon...Sat

  // 2. Monthly salary cycle: days 1-10 high, 11-20 moderate, 21-31 low
  let monthlyWeight = 1.0;
  if (day <= 10) monthlyWeight = 1.15;
  else if (day <= 20) monthlyWeight = 1.0;
  else monthlyWeight = 0.85;

  // 3. Holiday boosts (pre-holiday periods)
  let holidayBoost = 1.0;
  // Tết period (late Jan/early Feb)
  if (month === 1 && day >= 15) holidayBoost = 1.5 + (day - 15) * 0.05;
  if (month === 1 && day >= 25) holidayBoost = 2.0;
  if (month === 2 && day <= 5) holidayBoost = 1.6;
  if (month === 2 && day <= 15) holidayBoost = Math.max(holidayBoost, 1.2);
  // 30/4 - 1/5
  if (month === 4 && day >= 25) holidayBoost = 1.35;
  if (mmdd === '04-30' || mmdd === '05-01') holidayBoost = 1.4;
  // Quốc khánh
  if (mmdd === '09-01' || mmdd === '09-02') holidayBoost = 1.3;
  // Trung thu (mid-Aug)
  if (month === 8 && day >= 10 && day <= 20) holidayBoost = 1.2;
  // Christmas/New Year
  if (month === 12 && day >= 15) holidayBoost = 1.3 + (day - 15) * 0.02;
  if (month === 12 && day >= 25) holidayBoost = 1.6;

  // 4. Random noise: ±12% to avoid artificial smoothness
  const noise = 0.88 + rand() * 0.24;

  // 5. Gentle sine wave for intra-quarter variation
  const dayOfYear = Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 1).getTime()) / 86400000);
  const sineWave = 1 + 0.08 * Math.sin((dayOfYear / 365) * Math.PI * 4);

  return weeklyWeight * monthlyWeight * holidayBoost * noise * sineWave;
}

function generateDailyRevenue(days: string[], totalRevenue: number, rand: () => number): Map<string, number> {
  const map = new Map<string, number>();
  const weights: number[] = [];
  let weightSum = 0;

  for (const day of days) {
    const w = getRevenueWeight(day, rand);
    weights.push(w);
    weightSum += w;
  }

  let allocated = 0;
  for (let i = 0; i < days.length; i++) {
    let amount: number;
    if (i === days.length - 1) {
      amount = totalRevenue - allocated;
    } else {
      const raw = (weights[i] / weightSum) * totalRevenue;
      // Round to thousands, add small random jitter to avoid repetitive numbers
      amount = roundToThousand(Math.max(50000, raw));
    }
    map.set(days[i], amount);
    allocated += amount;
  }

  return map;
}

export interface GeneratedData {
  importOrders: ImportOrder[];
  salesOrders: SaleOrder[];
  inventoryBatches: InventoryBatch[];
}

export function generateQuarterData(
  quarter: QuarterData,
  products: Product[],
  suppliers: Supplier[],
  existingManualImports: ImportOrder[],
  existingManualSales: SaleOrder[],
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

  const stockMap = new Map<string, number>();
  activeProducts.forEach(p => stockMap.set(p.id, 0));

  // Group products by supplier
  const supplierProducts = new Map<string, Product[]>();
  activeProducts.forEach(p => {
    if (!supplierProducts.has(p.supplierId)) supplierProducts.set(p.supplierId, []);
    supplierProducts.get(p.supplierId)!.push(p);
  });

  // Determine supplier import weights based on size
  const supplierSizes = new Map<string, { isSmall: boolean; products: Product[] }>();
  let totalLargeProducts = 0;
  let totalSmallProducts = 0;
  for (const [sid, prods] of supplierProducts) {
    const isSmall = prods.length < 10;
    supplierSizes.set(sid, { isSmall, products: prods });
    if (isSmall) totalSmallProducts += prods.length;
    else totalLargeProducts += prods.length;
  }

  // Small suppliers: 5%-15% of import cost, large: 85%-95%
  const smallSupplierPercent = 0.05 + rand() * 0.10;
  const targetCOGS = autoTargetRevenue * (1 - (quarter.targetProfitPercent || 15) / 100);

  for (const [sid, { isSmall, products: prods }] of supplierSizes) {
    const supplier = suppliers.find(s => s.id === sid);
    const supplierName = supplier?.name || 'Khác';

    // Determine number of orders per quarter
    let ordersPerQuarter: number;
    if (isSmall) {
      // 1-2 orders per quarter for small suppliers
      ordersPerQuarter = prods.length <= 5 ? 1 : (1 + Math.floor(rand() * 2));
    } else {
      // 4-6 orders per quarter for large suppliers
      ordersPerQuarter = 4 + Math.floor(rand() * 3);
    }

    // Allocate import cost for this supplier
    const supplierShare = isSmall
      ? (smallSupplierPercent * (prods.length / Math.max(1, totalSmallProducts)))
      : ((1 - smallSupplierPercent) * (prods.length / Math.max(1, totalLargeProducts)));
    const supplierCOGS = targetCOGS * supplierShare;
    const cogsPerOrder = supplierCOGS / ordersPerQuarter;

    // Schedule orders across the quarter
    const orderDayIndices: number[] = [];
    for (let i = 0; i < ordersPerQuarter; i++) {
      const base = Math.floor((i / ordersPerQuarter) * days.length);
      const jitter = Math.floor(rand() * Math.max(1, days.length / ordersPerQuarter * 0.6));
      orderDayIndices.push(Math.min(base + jitter, days.length - 1));
    }
    orderDayIndices.sort((a, b) => a - b);

    // Distribute all products across orders
    const prodsShuffled = [...prods].sort(() => rand() - 0.5);

    for (let oi = 0; oi < orderDayIndices.length; oi++) {
      const importDate = days[orderDayIndices[oi]];
      const items: ImportOrderItem[] = [];

      // Determine which products to include in this order
      let productsForOrder: Product[];
      if (isSmall) {
        // Small suppliers: include ALL products in each order
        productsForOrder = prodsShuffled;
      } else {
        // Large suppliers: 8-12 products per order, rotating through all
        const perOrder = 8 + Math.floor(rand() * 5);
        const start = Math.floor((oi / ordersPerQuarter) * prodsShuffled.length);
        productsForOrder = [];
        for (let pi = 0; pi < perOrder; pi++) {
          productsForOrder.push(prodsShuffled[(start + pi) % prodsShuffled.length]);
        }
      }

      for (const product of productsForOrder) {
        const rate = product.conversionRate || 1;
        const hasChild = rate > 1;

        // Quantity: 1-4 parent units (max 5 as specified)
        let qtyParent: number;
        if (!hasChild) {
          // Products without child unit: fewer quantities
          qtyParent = 1 + Math.floor(rand() * 2);
        } else {
          qtyParent = 1 + Math.floor(rand() * 4);
        }

        // Cap at 5
        qtyParent = Math.min(5, qtyParent);

        // For kg products, round quantity
        if (product.unit.toLowerCase().includes('kg')) {
          qtyParent = Math.max(1, qtyParent);
        }

        const priceFluctuation = 0.97 + rand() * 0.06;
        const buyPrice = roundToThousand(Math.round(product.buyPrice * priceFluctuation));

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

  // Generate sales orders - realistic daily baskets
  for (const day of days) {
    const targetDayRevenue = dailyRevenue.get(day) || 0;
    if (targetDayRevenue <= 0) continue;

    const items: SaleItem[] = [];
    let remaining = targetDayRevenue;

    const shuffled = [...activeProducts].sort(() => rand() - 0.5);
    // 10-30 product lines per day
    const basketSize = Math.min(shuffled.length, 10 + Math.floor(rand() * 21));

    for (let i = 0; i < basketSize && remaining > 3000; i++) {
      const product = shuffled[i];
      const rate = product.conversionRate || 1;
      const hasChild = rate > 1;

      // Sell price per small unit
      const sellPerUnit = roundToThousand(Math.round(product.sellPrice / rate));
      const buyPerUnit = roundToThousand(Math.round(product.buyPrice / rate));

      if (sellPerUnit <= 0) continue;

      const portion = remaining / (basketSize - i);

      // Limit: 10%-40% of one parent unit per day
      const maxChildUnits = Math.max(1, Math.floor(rate * (0.1 + rand() * 0.3)));
      let qty = Math.max(1, Math.round(portion / sellPerUnit));

      if (hasChild) {
        qty = Math.min(qty, maxChildUnits);
      } else {
        // Products without child unit sell less (1-2 per day)
        qty = Math.min(qty, 1 + Math.floor(rand() * 2));
      }

      // For kg products, ensure 100g multiples
      if (product.unit.toLowerCase().includes('kg') && rate > 1) {
        qty = Math.max(1, qty);
      }

      // Check stock
      const stock = stockMap.get(product.id) || 0;
      if (stock <= 0) {
        // Pre-stock for first days
        stockMap.set(product.id, qty * 3);
      }
      qty = Math.min(qty, stockMap.get(product.id) || qty);
      if (qty <= 0) continue;

      const total = sellPerUnit * qty;
      const costTotal = buyPerUnit * qty;
      const profit = total - costTotal;
      const profitPct = costTotal > 0 ? (profit / costTotal) * 100 : 0;

      const sellUnit = hasChild ? (product.conversionUnit || product.unit) : product.unit;

      items.push({
        productId: product.id,
        productName: product.name,
        supplierId: product.supplierId,
        unit: sellUnit,
        quantity: qty,
        sellPrice: sellPerUnit,
        buyPrice: buyPerUnit,
        total: roundToThousand(total),
        profit: roundToThousand(profit),
        profitPercent: Math.round(profitPct * 10) / 10,
      });

      stockMap.set(product.id, (stockMap.get(product.id) || 0) - qty);
      remaining -= total;
    }

    if (items.length > 0) {
      const totalRevenue = items.reduce((s, it) => s + it.total, 0);
      const totalProfit = items.reduce((s, it) => s + it.profit, 0);

      salesOrders.push({
        id: generateId(),
        date: day,
        items,
        totalRevenue: roundToThousand(totalRevenue),
        totalProfit: roundToThousand(totalProfit),
        profitPercent: totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 1000) / 10 : 0,
        tag: 'auto',
        paymentMethod: 'cash',
        transferImages: [],
        deletedAt: null,
        createdAt: day + 'T18:00:00.000Z',
      });
    }
  }

  return { importOrders, salesOrders, inventoryBatches };
}
