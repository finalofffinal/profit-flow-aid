import { Product, Supplier, QuarterData, ImportOrder, ImportOrderItem, SaleOrder, SaleItem, InventoryBatch } from '@/types';

// Seasonal weights
const SEASONAL_WEIGHTS: Record<number, number> = { 1: 0.28, 2: 0.18, 3: 0.20, 4: 0.34 };

// Seeded PRNG
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
  return d === 0 || d === 5 || d === 6; // Fri, Sat, Sun
}

function roundToStep(value: number, step: number): number {
  return Math.round(value / step) * step;
}

// Generate sinusoidal daily revenue distribution
function generateDailyRevenue(days: string[], totalRevenue: number, rand: () => number): Map<string, number> {
  const map = new Map<string, number>();
  const weights: number[] = [];
  let weightSum = 0;

  for (let i = 0; i < days.length; i++) {
    // Sine wave for natural variation
    const sineWeight = 1 + 0.3 * Math.sin((i / days.length) * Math.PI * 4);
    // Weekend boost
    const weekendBoost = isWeekend(days[i]) ? 1.3 : 1.0;
    // Random noise ±15%
    const noise = 0.85 + rand() * 0.3;
    const w = sineWeight * weekendBoost * noise;
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

  // Calculate manual totals to subtract
  const manualSalesTotal = existingManualSales
    .filter(s => !s.deletedAt)
    .reduce((sum, s) => sum + s.totalRevenue, 0);
  const autoTargetRevenue = Math.max(0, quarter.targetRevenue - manualSalesTotal);

  // Generate daily revenue distribution
  const dailyRevenue = generateDailyRevenue(days, autoTargetRevenue, rand);

  const importOrders: ImportOrder[] = [];
  const salesOrders: SaleOrder[] = [];
  const inventoryBatches: InventoryBatch[] = [];

  // Track stock per product
  const stockMap = new Map<string, number>(); // productId -> qty in small units
  activeProducts.forEach(p => stockMap.set(p.id, 0));

  // Generate import orders: create batches every 3-7 days
  const importDays: string[] = [];
  let nextImportIdx = Math.floor(rand() * 3);
  while (nextImportIdx < days.length) {
    importDays.push(days[nextImportIdx]);
    nextImportIdx += 3 + Math.floor(rand() * 5); // 3-7 day gap
  }

  // Estimate needed stock for sales
  const avgDailyRevenue = autoTargetRevenue / days.length;

  for (const importDate of importDays) {
    // Group by supplier for invoice splitting
    const supplierGroups = new Map<string, ImportOrderItem[]>();

    // Pick 3-8 products to restock
    const shuffled = [...activeProducts].sort(() => rand() - 0.5);
    const numProducts = Math.min(shuffled.length, 3 + Math.floor(rand() * 6));

    for (let i = 0; i < numProducts; i++) {
      const product = shuffled[i];
      const supplier = suppliers.find(s => s.id === product.supplierId);
      const supplierName = supplier?.name || 'Khác';

      // Calculate quantity: enough for ~5-10 days of sales
      const rate = product.conversionRate || 1;
      const avgSmallUnitsPerDay = Math.max(1, Math.ceil(
        (avgDailyRevenue * 0.15) / (product.sellPrice / rate)
      ));
      const daysStock = 5 + Math.floor(rand() * 6);
      let qtySmall = avgSmallUnitsPerDay * daysStock;

      // Round to parent units
      const qtyParent = Math.max(1, Math.ceil(qtySmall / rate));

      // Price fluctuation ±3%
      const priceFluctuation = 0.97 + rand() * 0.06;
      const buyPrice = roundToStep(Math.round(product.buyPrice * priceFluctuation), 500);

      const item: ImportOrderItem = {
        productId: product.id,
        productName: product.name,
        supplierId: product.supplierId,
        supplierName,
        parentUnit: product.parentUnit,
        childUnit: product.childUnit || product.parentUnit,
        conversionRate: rate,
        quantity: qtyParent,
        buyPrice,
        total: buyPrice * qtyParent,
      };

      if (!supplierGroups.has(product.supplierId)) {
        supplierGroups.set(product.supplierId, []);
      }
      supplierGroups.get(product.supplierId)!.push(item);

      // Add to stock
      const currentStock = stockMap.get(product.id) || 0;
      stockMap.set(product.id, currentStock + qtyParent * rate);
    }

    // Create one import order per supplier
    for (const [sid, items] of supplierGroups) {
      const supplier = suppliers.find(s => s.id === sid);
      const order: ImportOrder = {
        id: generateId(),
        supplierId: sid,
        supplierName: supplier?.name || 'Khác',
        date: importDate,
        items,
        total: items.reduce((s, it) => s + it.total, 0),
        tag: 'auto',
        locked: false,
        deletedAt: null,
        createdAt: importDate + 'T08:00:00.000Z',
      };
      importOrders.push(order);

      // Create inventory batches
      for (const item of items) {
        inventoryBatches.push({
          id: generateId(),
          importOrderId: order.id,
          productId: item.productId,
          productName: item.productName,
          supplierId: item.supplierId,
          supplierName: item.supplierName,
          parentUnit: item.parentUnit,
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

  // Generate sales orders: every day must have sales
  for (const day of days) {
    const targetDayRevenue = dailyRevenue.get(day) || 0;
    if (targetDayRevenue <= 0) continue;

    const items: SaleItem[] = [];
    let remaining = targetDayRevenue;

    // Create basket of 3-8 products
    const shuffled = [...activeProducts].sort(() => rand() - 0.5);
    const basketSize = Math.min(shuffled.length, 3 + Math.floor(rand() * 6));

    for (let i = 0; i < basketSize && remaining > 5000; i++) {
      const product = shuffled[i];
      const rate = product.conversionRate || 1;
      const smallSellPrice = roundToStep(Math.round(product.sellPrice / rate), 500);
      const smallBuyPrice = roundToStep(Math.round(product.buyPrice / rate), 500);

      if (smallSellPrice <= 0) continue;

      // How many small units to sell
      const portion = remaining / (basketSize - i);
      let qty = Math.max(1, Math.round(portion / smallSellPrice));

      // Check stock
      const stock = stockMap.get(product.id) || 0;
      if (stock <= 0) {
        // Auto-restock if needed
        stockMap.set(product.id, qty * 2);
      }
      qty = Math.min(qty, stockMap.get(product.id) || qty);

      const total = smallSellPrice * qty;
      const costTotal = smallBuyPrice * qty;
      const profit = total - costTotal;
      const profitPct = costTotal > 0 ? (profit / costTotal) * 100 : 0;

      items.push({
        productId: product.id,
        productName: product.name,
        supplierId: product.supplierId,
        childUnit: product.childUnit || product.parentUnit || 'đơn vị',
        conversionRate: rate,
        quantitySmall: qty,
        sellPrice: smallSellPrice,
        buyPrice: smallBuyPrice,
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
