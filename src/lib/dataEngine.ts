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
  return new Date(dateStr).getDay();
}

/** Only round final revenue/profit totals to nearest 1000. Never round buy/sell prices. */
function roundRevenue(value: number): number {
  return Math.round(value / 1000) * 1000;
}

function getRevenueWeight(dateStr: string, rand: () => number): number {
  const d = new Date(dateStr);
  const dow = d.getDay();
  const day = d.getDate();
  const month = d.getMonth() + 1;
  const mmdd = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  const weeklyWeight = [1.25, 0.72, 0.75, 0.78, 0.88, 1.15, 1.30][dow];

  let monthlyWeight = 1.0;
  if (day <= 10) monthlyWeight = 1.15;
  else if (day <= 20) monthlyWeight = 1.0;
  else monthlyWeight = 0.85;

  let holidayBoost = 1.0;
  if (month === 1 && day >= 15) holidayBoost = 1.5 + (day - 15) * 0.05;
  if (month === 1 && day >= 25) holidayBoost = 2.0;
  if (month === 2 && day <= 5) holidayBoost = 1.6;
  if (month === 2 && day <= 15) holidayBoost = Math.max(holidayBoost, 1.2);
  if (month === 4 && day >= 25) holidayBoost = 1.35;
  if (mmdd === '04-30' || mmdd === '05-01') holidayBoost = 1.4;
  if (mmdd === '09-01' || mmdd === '09-02') holidayBoost = 1.3;
  if (month === 8 && day >= 10 && day <= 20) holidayBoost = 1.2;
  if (month === 12 && day >= 15) holidayBoost = 1.3 + (day - 15) * 0.02;
  if (month === 12 && day >= 25) holidayBoost = 1.6;

  const noise = 0.88 + rand() * 0.24;
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
      amount = roundRevenue(Math.max(50000, raw));
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

  // Calculate manual contributions
  const manualSalesTotal = existingManualSales.filter(s => !s.deletedAt).reduce((sum, s) => sum + s.totalRevenue, 0);
  const autoTargetRevenue = Math.max(0, quarter.targetRevenue - manualSalesTotal);
  const dailyRevenue = generateDailyRevenue(days, autoTargetRevenue, rand);

  const importOrders: ImportOrder[] = [];
  const salesOrders: SaleOrder[] = [];
  const inventoryBatches: InventoryBatch[] = [];

  const stockMap = new Map<string, number>();
  activeProducts.forEach(p => stockMap.set(p.id, 0));

  // Track which products already imported manually
  const manualImportedProducts = new Set<string>();
  const manualImportCount = existingManualImports.filter(o => !o.deletedAt).length;
  existingManualImports.filter(o => !o.deletedAt).forEach(o => {
    o.items.forEach(it => manualImportedProducts.add(it.productId));
  });

  // Group products by supplier
  const supplierProducts = new Map<string, Product[]>();
  activeProducts.forEach(p => {
    if (!supplierProducts.has(p.supplierId)) supplierProducts.set(p.supplierId, []);
    supplierProducts.get(p.supplierId)!.push(p);
  });

  // Determine supplier sizes
  const supplierSizes = new Map<string, { isSmall: boolean; products: Product[] }>();
  let totalLargeProducts = 0;
  let totalSmallProducts = 0;
  for (const [sid, prods] of supplierProducts) {
    const isSmall = prods.length < 10;
    supplierSizes.set(sid, { isSmall, products: prods });
    if (isSmall) totalSmallProducts += prods.length;
    else totalLargeProducts += prods.length;
  }

  const smallSupplierPercent = 0.05 + rand() * 0.10;
  const targetCOGS = autoTargetRevenue * (1 - (quarter.targetProfitPercent || 15) / 100);

  for (const [sid, { isSmall, products: prods }] of supplierSizes) {
    const supplier = suppliers.find(s => s.id === sid);
    const supplierName = supplier?.name || 'Khác';

    // Count manual orders for this supplier
    const supplierManualOrders = existingManualImports.filter(
      o => !o.deletedAt && o.supplierId === sid
    ).length;

    // Determine total orders needed (including manual)
    let totalOrdersNeeded: number;
    if (isSmall) {
      totalOrdersNeeded = 2; // Small NCC: exactly 2 orders per quarter
    } else {
      totalOrdersNeeded = 6 + Math.floor(rand() * 4); // Large NCC: 6-9 orders per quarter
    }

    // Auto orders = total needed minus manual orders already created
    const autoOrdersCount = Math.max(0, totalOrdersNeeded - supplierManualOrders);
    if (autoOrdersCount === 0) continue;

    // Allocate import cost for this supplier
    const supplierShare = isSmall
      ? (smallSupplierPercent * (prods.length / Math.max(1, totalSmallProducts)))
      : ((1 - smallSupplierPercent) * (prods.length / Math.max(1, totalLargeProducts)));
    const supplierCOGS = targetCOGS * supplierShare;
    const cogsPerOrder = supplierCOGS / autoOrdersCount;

    // Schedule orders across the quarter evenly
    const orderDayIndices: number[] = [];
    for (let i = 0; i < autoOrdersCount; i++) {
      const base = Math.floor(((i + 0.5) / autoOrdersCount) * days.length);
      const jitter = Math.floor(rand() * Math.max(1, days.length / autoOrdersCount * 0.4));
      const idx = Math.min(base + jitter, days.length - 1);
      orderDayIndices.push(idx);
    }
    orderDayIndices.sort((a, b) => a - b);

    // Filter out products that were already imported manually (for variety)
    const availableProds = prods.filter(p => !manualImportedProducts.has(p.id));
    const prodsToUse = availableProds.length > 0 ? availableProds : prods;
    const prodsShuffled = [...prodsToUse].sort(() => rand() - 0.5);

    // For small NCC: ensure ALL products appear across the 2 auto orders
    // For large NCC: distribute products evenly across orders
    for (let oi = 0; oi < autoOrdersCount; oi++) {
      const importDate = days[orderDayIndices[oi]];
      const items: ImportOrderItem[] = [];

      let productsForOrder: Product[];

      if (isSmall) {
        // Small NCC: distribute all products across 2 orders
        // Each order gets a subset, but together they cover everything
        if (autoOrdersCount === 1) {
          productsForOrder = prodsShuffled;
        } else {
          // Split products: order 0 gets first half + some overlap, order 1 gets second half + overlap
          const half = Math.ceil(prodsShuffled.length / 2);
          const overlap = Math.min(2, Math.floor(prodsShuffled.length * 0.3));
          if (oi === 0) {
            productsForOrder = prodsShuffled.slice(0, half + overlap);
          } else {
            productsForOrder = prodsShuffled.slice(half - overlap);
          }
        }
      } else {
        // Large NCC: distribute evenly, each order gets roughly equal products
        const totalProds = prodsShuffled.length;
        const prodsPerOrder = Math.ceil(totalProds / autoOrdersCount);
        const start = oi * prodsPerOrder;
        productsForOrder = prodsShuffled.slice(start, start + prodsPerOrder);
        // Add 1-2 random extras for variety
        const extras = Math.min(2, Math.floor(rand() * 3));
        for (let e = 0; e < extras; e++) {
          const randomProd = prodsShuffled[Math.floor(rand() * totalProds)];
          if (!productsForOrder.find(p => p.id === randomProd.id)) {
            productsForOrder.push(randomProd);
          }
        }
      }

      for (const product of productsForOrder) {
        const rate = product.conversionRate || 1;

        // MAX 3 parent units per product per order
        let qtyParent = 1 + Math.floor(rand() * 3); // 1-3
        qtyParent = Math.min(3, qtyParent);

        // For kg products, ensure valid quantity
        if (product.unit.toLowerCase().includes('kg')) {
          qtyParent = Math.max(1, qtyParent);
        }

        // Use exact buy price - NO rounding on prices
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

  // Generate sales orders - must match target revenue exactly
  let totalSalesGenerated = 0;

  for (let dayIdx = 0; dayIdx < days.length; dayIdx++) {
    const day = days[dayIdx];
    const targetDayRevenue = dailyRevenue.get(day) || 0;
    if (targetDayRevenue <= 0) continue;

    const items: SaleItem[] = [];
    let remaining = targetDayRevenue;

    const shuffled = [...activeProducts].sort(() => rand() - 0.5);
    const basketSize = Math.min(shuffled.length, 10 + Math.floor(rand() * 21));

    for (let i = 0; i < basketSize && remaining > 3000; i++) {
      const product = shuffled[i];
      const rate = product.conversionRate || 1;
      const hasChild = rate > 1;

      // Use exact prices - NO rounding
      const sellPerUnit = product.sellPrice / rate;
      const buyPerUnit = product.buyPrice / rate;

      if (sellPerUnit <= 0) continue;

      const portion = remaining / (basketSize - i);
      const maxChildUnits = Math.max(1, Math.floor(rate * (0.1 + rand() * 0.3)));
      let qty = Math.max(1, Math.round(portion / sellPerUnit));

      if (hasChild) {
        qty = Math.min(qty, maxChildUnits);
      } else {
        qty = Math.min(qty, 1 + Math.floor(rand() * 2));
      }

      // Check stock
      const stock = stockMap.get(product.id) || 0;
      if (stock <= 0) {
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
        sellPrice: sellPerUnit, // exact price, no rounding
        buyPrice: buyPerUnit,   // exact price, no rounding
        total,     // exact total
        profit,
        profitPercent: Math.round(profitPct * 10) / 10,
      });

      stockMap.set(product.id, (stockMap.get(product.id) || 0) - qty);
      remaining -= total;
    }

    if (items.length > 0) {
      const totalRevenue = items.reduce((s, it) => s + it.total, 0);
      const totalProfit = items.reduce((s, it) => s + it.profit, 0);

      // Only round final revenue total
      const roundedRevenue = roundRevenue(totalRevenue);
      const roundedProfit = roundRevenue(totalProfit);

      salesOrders.push({
        id: generateId(),
        date: day,
        items,
        totalRevenue: roundedRevenue,
        totalProfit: roundedProfit,
        profitPercent: roundedRevenue > 0 ? Math.round((roundedProfit / roundedRevenue) * 1000) / 10 : 0,
        tag: 'auto',
        paymentMethod: rand() > 0.7 ? 'transfer' : 'cash',
        transferImages: [],
        deletedAt: null,
        createdAt: day + 'T18:00:00.000Z',
      });

      totalSalesGenerated += roundedRevenue;
    }
  }

  return { importOrders, salesOrders, inventoryBatches };
}
