import { Product, Supplier, QuarterData, ImportOrder, ImportOrderItem, SaleOrder, SaleItem, InventoryBatch } from '@/types';

const SEASONAL_WEIGHTS: Record<number, number> = { 1: 0.28, 2: 0.18, 3: 0.20, 4: 0.34 };

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

function isWeekend(dateStr: string): boolean {
  const d = new Date(dateStr).getDay();
  return d === 0 || d === 5 || d === 6;
}

function roundToStep(value: number, step: number): number {
  return Math.round(value / step) * step;
}

// Vietnamese holidays boost (before holidays sell more)
function getHolidayBoost(dateStr: string): number {
  const d = new Date(dateStr);
  const mmdd = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  // Tết period (late Jan / early Feb)
  const month = d.getMonth() + 1;
  const day = d.getDate();
  if (month === 1 && day >= 20) return 1.8; // Pre-Tết
  if (month === 2 && day <= 10) return 1.5; // Tết
  if (mmdd === '04-29' || mmdd === '04-30' || mmdd === '05-01') return 1.4;
  if (mmdd === '09-01' || mmdd === '09-02') return 1.3;
  if (month === 12 && day >= 20) return 1.6; // Pre-Christmas/New Year
  return 1.0;
}

function generateDailyRevenue(days: string[], totalRevenue: number, rand: () => number): Map<string, number> {
  const map = new Map<string, number>();
  const weights: number[] = [];
  let weightSum = 0;

  for (let i = 0; i < days.length; i++) {
    const sineWeight = 1 + 0.2 * Math.sin((i / days.length) * Math.PI * 6);
    const weekendBoost = isWeekend(days[i]) ? 1.25 : 1.0;
    const holidayBoost = getHolidayBoost(days[i]);
    const noise = 0.88 + rand() * 0.24;
    const w = sineWeight * weekendBoost * holidayBoost * noise;
    weights.push(w);
    weightSum += w;
  }

  let allocated = 0;
  for (let i = 0; i < days.length; i++) {
    const amount = i === days.length - 1
      ? totalRevenue - allocated
      : roundToStep(Math.max(50000, (weights[i] / weightSum) * totalRevenue), 1000);
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

  const rand = seededRandom(quarter.quarter * 1000 + quarter.year);
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

  // Determine import schedule based on supplier size
  const avgDailyRevenue = autoTargetRevenue / days.length;

  for (const [sid, prods] of supplierProducts) {
    const supplier = suppliers.find(s => s.id === sid);
    const supplierName = supplier?.name || 'Khác';
    const isSmall = prods.length < 10;
    
    // Small suppliers: 1-2 orders per month (3-6 per quarter)
    // Large suppliers: 6-9 orders per quarter
    const ordersPerQuarter = isSmall ? (1 + Math.floor(rand() * 2)) * 3 : 6 + Math.floor(rand() * 4);
    const orderDayIndices: number[] = [];
    
    for (let i = 0; i < Math.min(ordersPerQuarter, days.length); i++) {
      const idx = Math.floor((i / ordersPerQuarter) * days.length + rand() * (days.length / ordersPerQuarter * 0.8));
      orderDayIndices.push(Math.min(idx, days.length - 1));
    }

    // Distribute products across orders
    const prodsShuffled = [...prods].sort(() => rand() - 0.5);
    
    for (let oi = 0; oi < orderDayIndices.length; oi++) {
      const importDate = days[orderDayIndices[oi]];
      const items: ImportOrderItem[] = [];
      
      // For small suppliers, include all products in fewer orders
      // For large, distribute across orders
      const startIdx = isSmall ? 0 : Math.floor((oi / orderDayIndices.length) * prodsShuffled.length);
      const count = isSmall ? prodsShuffled.length : Math.max(2, Math.ceil(prodsShuffled.length / orderDayIndices.length) + Math.floor(rand() * 3));
      
      for (let pi = 0; pi < count && (startIdx + pi) < prodsShuffled.length; pi++) {
        const product = prodsShuffled[(startIdx + pi) % prodsShuffled.length];
        const rate = product.conversionRate || 1;
        
        // Products without child unit (rate=1) get smaller quantities
        const hasChild = rate > 1;
        const daysOfStock = hasChild ? (5 + Math.floor(rand() * 8)) : (2 + Math.floor(rand() * 3));
        const avgSmallUnitsPerDay = Math.max(1, Math.ceil((avgDailyRevenue * 0.12) / (product.sellPrice / rate)));
        let qtySmall = avgSmallUnitsPerDay * daysOfStock;
        
        // For kg products, round to 100g multiples
        if (product.unit.toLowerCase().includes('kg')) {
          qtySmall = Math.max(10, roundToStep(qtySmall, 10)); // 10 lạng = 1kg
        }
        
        const qtyParent = Math.max(1, Math.ceil(qtySmall / rate));
        const priceFluctuation = 0.97 + rand() * 0.06;
        const buyPrice = roundToStep(Math.round(product.buyPrice * priceFluctuation), 500);

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

  // Generate sales orders
  for (const day of days) {
    const targetDayRevenue = dailyRevenue.get(day) || 0;
    if (targetDayRevenue <= 0) continue;

    const items: SaleItem[] = [];
    let remaining = targetDayRevenue;

    const shuffled = [...activeProducts].sort(() => rand() - 0.5);
    const basketSize = Math.min(shuffled.length, 3 + Math.floor(rand() * 6));

    for (let i = 0; i < basketSize && remaining > 5000; i++) {
      const product = shuffled[i];
      const rate = product.conversionRate || 1;
      const sellPerUnit = roundToStep(Math.round(product.sellPrice / rate), 500);
      const buyPerUnit = roundToStep(Math.round(product.buyPrice / rate), 500);

      if (sellPerUnit <= 0) continue;

      const portion = remaining / (basketSize - i);
      let qty = Math.max(1, Math.round(portion / sellPerUnit));
      
      // For kg products, ensure multiples of lạng
      if (product.unit.toLowerCase().includes('kg') && rate > 1) {
        qty = Math.max(1, roundToStep(qty, 1));
      }

      // Products without child unit sell less
      if (rate <= 1) {
        qty = Math.max(1, Math.min(qty, 2 + Math.floor(rand() * 3)));
      }

      const stock = stockMap.get(product.id) || 0;
      if (stock <= 0) {
        stockMap.set(product.id, qty * 2);
      }
      qty = Math.min(qty, stockMap.get(product.id) || qty);

      const total = sellPerUnit * qty;
      const costTotal = buyPerUnit * qty;
      const profit = total - costTotal;
      const profitPct = costTotal > 0 ? (profit / costTotal) * 100 : 0;

      const sellUnit = rate > 1 ? (product.conversionUnit || product.unit) : product.unit;

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
  }

  return { importOrders, salesOrders, inventoryBatches };
}
