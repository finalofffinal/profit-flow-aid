import { useState, useMemo } from 'react';
import { Search, ChevronDown, ChevronRight, Package, AlertTriangle, TrendingUp, TrendingDown, CalendarDays, FileDown, Lock, Filter } from 'lucide-react';
import { InventoryBatch, Supplier, SaleOrder, ImportOrder, Product, QuarterData } from '@/types';
import { formatVND, formatCompactVND } from '@/lib/currency';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePeriod } from '@/contexts/PeriodContext';
import { exportInventoryPdf } from '@/lib/exportInventoryPdf';

interface InventoryPageProps {
  batches: InventoryBatch[];
  suppliers: Supplier[];
  importOrders: ImportOrder[];
  salesOrders: SaleOrder[];
  products: Product[];
  quarters?: QuarterData[];
  addNotification?: (msg: string, type?: any) => void;
}

/** Format "X lớn + Y bé" (theo thứ tự đv lớn → đv bé). */
function formatBigSmall(totalSmall: number, rate: number, bigUnit: string, smallUnit: string): string {
  if (totalSmall <= 0) return `0 ${smallUnit || bigUnit}`;
  if (rate <= 1 || !smallUnit || smallUnit === bigUnit) {
    return `${totalSmall} ${bigUnit}`;
  }
  const bigs = Math.floor(totalSmall / rate);
  const smalls = totalSmall - bigs * rate;
  if (bigs === 0) return `${smalls} ${smallUnit}`;
  if (smalls === 0) return `${bigs} ${bigUnit}`;
  return `${bigs} ${bigUnit} + ${smalls} ${smallUnit}`;
}

interface ProductStock {
  productId: string;
  productName: string;
  supplierId: string;
  supplierName: string;
  brand: string;
  unit: string;             // đv lớn
  conversionUnit: string;   // đv bé
  conversionRate: number;
  importedBig: number;      // tổng nhập đv lớn (quarter)
  importedSmall: number;    // tổng nhập đv bé (quarter)
  soldSmall: number;        // tổng bán đv bé (quarter)
  remainingSmall: number;   // còn lại đv bé (capped: max 0..importedSmall)
  totalValue: number;       // giá trị tồn = remainingSmall * (buyPrice/rate)
  avgBuyPricePerSmall: number;
}

export function InventoryPage(props: InventoryPageProps) {
  const suppliers = props.suppliers ?? [];
  const importOrders = props.importOrders ?? [];
  const salesOrders = props.salesOrders ?? [];
  const products = props.products ?? [];
  const quarters = props.quarters;
  const addNotification = props.addNotification;
  const { quarter: selQ, year: selYear } = usePeriod();
  const [search, setSearch] = useState('');
  const [collapsedSuppliers, setCollapsedSuppliers] = useState<Set<string>>(new Set());
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());
  const [brandFilter, setBrandFilter] = useState<string>('all');
  const [supplierFilter, setSupplierFilter] = useState<string>('all');
  const [summaryCollapsed, setSummaryCollapsed] = useState(true);

  const currentQ = quarters?.find(q => q.quarter === selQ && q.year === selYear);
  const currentQLocked = !!currentQ?.locked;

  const brands = useMemo(() => {
    const set = new Set<string>();
    products.forEach(p => { if (!p.deletedAt && p.brand) set.add(p.brand); });
    return Array.from(set).sort();
  }, [products]);

  // Aggregate per-product per current quarter; cap remaining = max(0, imported - sold)
  const productStocks = useMemo<ProductStock[]>(() => {
    const inQuarter = (dateStr: string) => {
      const d = new Date(dateStr);
      return Math.ceil((d.getMonth() + 1) / 3) === selQ && d.getFullYear() === selYear;
    };

    const map = new Map<string, ProductStock>();

    importOrders.forEach(o => {
      if (o.deletedAt || !inQuarter(o.date)) return;
      o.items.forEach(it => {
        const rate = it.conversionRate || 1;
        const big = it.quantity;
        const small = big * rate;
        const existing = map.get(it.productId);
        if (existing) {
          existing.importedBig += big;
          existing.importedSmall += small;
          // weighted avg price per small unit
          const prevValue = existing.avgBuyPricePerSmall * (existing.importedSmall - small);
          const newValue = (it.buyPrice / rate) * small;
          existing.avgBuyPricePerSmall = existing.importedSmall > 0
            ? (prevValue + newValue) / existing.importedSmall : 0;
        } else {
          const p = products.find(pp => pp.id === it.productId);
          map.set(it.productId, {
            productId: it.productId,
            productName: it.productName,
            supplierId: it.supplierId,
            supplierName: it.supplierName,
            brand: p?.brand || '',
            unit: it.unit,
            conversionUnit: it.conversionUnit || it.unit,
            conversionRate: rate,
            importedBig: big,
            importedSmall: small,
            soldSmall: 0,
            remainingSmall: 0,
            totalValue: 0,
            avgBuyPricePerSmall: it.buyPrice / rate,
          });
        }
      });
    });

    salesOrders.forEach(o => {
      if (o.deletedAt || !inQuarter(o.date)) return;
      o.items.forEach(it => {
        const ps = map.get(it.productId);
        if (!ps) return;
        ps.soldSmall += it.quantity;
      });
    });

    // Cap remaining
    const result: ProductStock[] = [];
    for (const ps of map.values()) {
      const rem = Math.max(0, ps.importedSmall - ps.soldSmall);
      ps.remainingSmall = Math.min(rem, ps.importedSmall);
      ps.totalValue = Math.round(ps.remainingSmall * ps.avgBuyPricePerSmall);
      if (ps.remainingSmall > 0) result.push(ps);
    }
    return result;
  }, [importOrders, salesOrders, products, selQ, selYear]);

  // Filters
  const filtered = useMemo(() => {
    let result = productStocks;
    if (supplierFilter !== 'all') result = result.filter(p => p.supplierId === supplierFilter);
    if (brandFilter !== 'all') result = result.filter(p => p.brand === brandFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(p =>
        p.productName.toLowerCase().includes(q) ||
        p.supplierName.toLowerCase().includes(q)
      );
    }
    return result;
  }, [productStocks, search, brandFilter, supplierFilter]);

  // Group by supplier
  const grouped = useMemo(() => {
    const map = new Map<string, ProductStock[]>();
    filtered.forEach(p => {
      if (!map.has(p.supplierId)) map.set(p.supplierId, []);
      map.get(p.supplierId)!.push(p);
    });
    return map;
  }, [filtered]);

  // Quarter-level summary
  const quarterSummary = useMemo(() => {
    const lastMonth = selQ * 3;
    const lastDay = new Date(selYear, lastMonth, 0);
    const yyyy = lastDay.getFullYear();
    const mm = String(lastDay.getMonth() + 1).padStart(2, '0');
    const dd = String(lastDay.getDate()).padStart(2, '0');
    const lastDayStr = `${yyyy}-${mm}-${dd}`;

    const qImports = importOrders.filter(o => {
      if (o.deletedAt) return false;
      const d = new Date(o.date);
      return Math.ceil((d.getMonth() + 1) / 3) === selQ && d.getFullYear() === selYear;
    });
    const qSales = salesOrders.filter(o => {
      if (o.deletedAt) return false;
      const d = new Date(o.date);
      return Math.ceil((d.getMonth() + 1) / 3) === selQ && d.getFullYear() === selYear;
    });

    const totalImport = qImports.reduce((s, o) => s + o.total, 0);
    const totalSalesRevenue = qSales.reduce((s, o) => s + o.totalRevenue, 0);
    const stockValue = productStocks.reduce((s, p) => s + p.totalValue, 0);
    const totalImportQty = qImports.reduce((s, o) => s + o.items.reduce((is, it) => is + it.quantity, 0), 0);
    const totalSalesQty = qSales.reduce((s, o) => s + o.items.reduce((is, it) => is + it.quantity, 0), 0);
    const totalStockSmall = productStocks.reduce((s, p) => s + p.remainingSmall, 0);
    const netQuarterFlow = totalImport - totalSalesRevenue;

    return {
      totalImport, totalSalesRevenue, stockValue,
      totalStockSmall, lastDay: lastDayStr,
      importOrderCount: qImports.length, salesOrderCount: qSales.length,
      totalImportQty, totalSalesQty,
      netQuarterFlow, netIsNegative: netQuarterFlow < 0,
      productCount: productStocks.length,
    };
  }, [selQ, selYear, importOrders, salesOrders, productStocks]);

  const toggleSupplier = (id: string) => {
    setCollapsedSuppliers(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const toggleProduct = (id: string) => {
    setExpandedProducts(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleExportPdf = () => {
    exportInventoryPdf(props.batches, products, suppliers, selQ, selYear);
    addNotification?.(`Đã xuất PDF Kho hàng Q${selQ}/${selYear}`, 'success');
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b-2 border-primary/20 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-bold">Kho hàng</h2>
          <Badge variant="outline" className="font-bold">{filtered.length} SP</Badge>
          <div className="flex-1" />
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={handleExportPdf}>
            <FileDown className="mr-1 h-3.5 w-3.5" /> PDF Q{selQ}/{selYear}
          </Button>
        </div>

        {currentQLocked && (
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 px-2 py-1.5 text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
            <Lock className="h-3.5 w-3.5" /> Quý {selQ}/{selYear} đã khóa
          </div>
        )}

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8 h-8" placeholder="Tìm SP, NCC..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Select value={brandFilter} onValueChange={setBrandFilter}>
            <SelectTrigger className="w-28 h-8"><Filter className="mr-1 h-3 w-3" /><SelectValue placeholder="Nhãn" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả nhãn</SelectItem>
              {brands.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={supplierFilter} onValueChange={setSupplierFilter}>
            <SelectTrigger className="w-28 h-8"><SelectValue placeholder="NCC" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả NCC</SelectItem>
              {suppliers.filter(s => !s.deletedAt).map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Quarter summary */}
        <div className="rounded-lg border border-border overflow-hidden">
          <button
            type="button"
            onClick={() => setSummaryCollapsed(!summaryCollapsed)}
            className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left bg-muted/30 hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5" />
              <span>Cuối quý ({new Date(quarterSummary.lastDay).toLocaleDateString('vi-VN')})</span>
            </div>
            <div className="flex items-center gap-2 text-[11px]">
              <span className={`font-bold ${quarterSummary.netIsNegative ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'}`}>
                {quarterSummary.netIsNegative ? '−' : '+'}{formatCompactVND(Math.abs(quarterSummary.netQuarterFlow))}
              </span>
              {summaryCollapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5 rotate-90" />}
            </div>
          </button>

          {!summaryCollapsed && (
            <div className="p-2 space-y-1.5 animate-in slide-in-from-top-1">
              <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-1.5">
                  <div className="flex items-center gap-1">
                    <TrendingUp className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-muted-foreground">Nhập</span>
                  </div>
                  <p className="font-bold text-emerald-600 dark:text-emerald-400">+{formatCompactVND(quarterSummary.totalImport)}</p>
                  <p className="text-muted-foreground text-[10px]">{quarterSummary.importOrderCount} đơn · {quarterSummary.totalImportQty} đv</p>
                </div>
                <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-1.5">
                  <div className="flex items-center gap-1">
                    <TrendingDown className="h-3 w-3 text-destructive" />
                    <span className="text-muted-foreground">Bán</span>
                  </div>
                  <p className="font-bold text-destructive">-{formatCompactVND(quarterSummary.totalSalesRevenue)}</p>
                  <p className="text-muted-foreground text-[10px]">{quarterSummary.salesOrderCount} đơn · {quarterSummary.totalSalesQty} đv</p>
                </div>
              </div>

              <div className={`rounded-lg border p-1.5 text-center ${
                quarterSummary.netIsNegative
                  ? 'bg-destructive/10 border-destructive/20'
                  : 'bg-emerald-500/10 border-emerald-500/20'
              }`}>
                <div className="flex items-center justify-center gap-1">
                  <Package className={`h-3 w-3 ${quarterSummary.netIsNegative ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'}`} />
                  <span className="text-[10px] text-muted-foreground">Chênh lệch nhập − bán</span>
                </div>
                <p className={`font-bold text-sm ${
                  quarterSummary.netIsNegative ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'
                }`}>
                  {quarterSummary.netIsNegative ? '−' : '+'}{formatVND(Math.abs(quarterSummary.netQuarterFlow))}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Giá trị tồn: {formatVND(quarterSummary.stockValue)}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3 pb-20 lg:pb-4">
        {Array.from(grouped.entries()).map(([supplierId, supplierStocks]) => {
          const supplier = suppliers.find(s => s.id === supplierId);
          const isCollapsed = collapsedSuppliers.has(supplierId);
          const totalValue = supplierStocks.reduce((s, p) => s + p.totalValue, 0);

          return (
            <div key={supplierId} className="rounded-xl border border-border shadow-sm overflow-hidden">
              <button className="flex w-full items-center gap-2 p-3 text-left hover:bg-muted/30 transition-colors" onClick={() => toggleSupplier(supplierId)}>
                {isCollapsed ? <ChevronRight className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
                <Package className="h-4 w-4 shrink-0 text-primary" />
                <div className="flex-1 min-w-0">
                  <span className="font-bold text-sm">{supplier?.name || 'Khác'}</span>
                  <p className="text-xs text-muted-foreground">{supplierStocks.length} SP · {formatVND(totalValue)}</p>
                </div>
              </button>
              {!isCollapsed && (
                <div className="border-t border-border p-2 space-y-2 animate-in slide-in-from-top-1">
                  {supplierStocks.map(ps => {
                    const isExpanded = expandedProducts.has(ps.productId);
                    const stockLabel = formatBigSmall(ps.remainingSmall, ps.conversionRate, ps.unit, ps.conversionUnit);
                    const isLow = ps.remainingSmall <= 5;
                    const importedLabel = formatBigSmall(ps.importedSmall, ps.conversionRate, ps.unit, ps.conversionUnit);
                    return (
                      <div key={ps.productId} className={`rounded-lg border ${isLow ? 'border-destructive/30 bg-destructive/5' : 'border-border bg-muted/20'} overflow-hidden`}>
                        <button
                          className="flex w-full items-center justify-between p-2 text-left hover:bg-muted/40 transition-colors text-xs"
                          onClick={() => toggleProduct(ps.productId)}
                        >
                          <div className="min-w-0 flex items-center gap-1.5">
                            {isExpanded ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {ps.brand && <Badge variant="outline" className="text-[9px] h-4">{ps.brand}</Badge>}
                                <p className="font-semibold">{ps.productName}</p>
                                {isLow && <Badge variant="destructive" className="text-[9px] h-4"><AlertTriangle className="h-2.5 w-2.5 mr-0.5" />Sắp hết</Badge>}
                              </div>
                            </div>
                          </div>
                          <div className="text-right shrink-0 ml-2">
                            <p className={`font-bold ${isLow ? 'text-destructive' : 'text-foreground'}`}>
                              {stockLabel}
                              {ps.conversionRate > 1 && ps.conversionUnit !== ps.unit && (
                                <span className="text-muted-foreground font-normal"> · ={ps.remainingSmall} {ps.conversionUnit}</span>
                              )}
                            </p>
                            <p className="text-muted-foreground">{formatVND(ps.totalValue)}</p>
                          </div>
                        </button>
                        {isExpanded && (
                          <div className="border-t border-border/50 px-2.5 py-1.5 space-y-1 text-[11px] bg-background/40 animate-in slide-in-from-top-1">
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground flex items-center gap-1"><TrendingUp className="h-3 w-3 text-emerald-600" />Nhập</span>
                              <span className="font-medium">
                                {ps.importedBig} {ps.unit}
                                {ps.conversionRate > 1 && ps.conversionUnit !== ps.unit && (
                                  <span className="text-muted-foreground"> = {ps.importedSmall} {ps.conversionUnit}</span>
                                )}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground flex items-center gap-1"><TrendingDown className="h-3 w-3 text-destructive" />Bán</span>
                              <span className="font-medium">{ps.soldSmall} {ps.conversionUnit}</span>
                            </div>
                            <div className="flex items-center justify-between pt-1 border-t border-border/50">
                              <span className="text-muted-foreground">Còn lại</span>
                              <span className="font-bold text-primary">
                                {stockLabel}
                                {ps.conversionRate > 1 && ps.conversionUnit !== ps.unit && (
                                  <span className="font-normal text-muted-foreground"> = {ps.remainingSmall} {ps.conversionUnit}</span>
                                )}
                                {' · '}{formatVND(ps.totalValue)}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="py-16 text-center text-sm text-muted-foreground">
            {search ? 'Không tìm thấy' : `Chưa có hàng tồn trong Q${selQ}/${selYear}.`}
          </div>
        )}
      </div>
    </div>
  );
}
