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

export function InventoryPage(props: InventoryPageProps) {
  const batches = props.batches ?? [];
  const suppliers = props.suppliers ?? [];
  const importOrders = props.importOrders ?? [];
  const salesOrders = props.salesOrders ?? [];
  const products = props.products ?? [];
  const quarters = props.quarters;
  const addNotification = props.addNotification;
  const { quarter: selQ, year: selYear } = usePeriod();
  const [search, setSearch] = useState('');
  const [collapsedSuppliers, setCollapsedSuppliers] = useState<Set<string>>(new Set());
  const [brandFilter, setBrandFilter] = useState<string>('all');
  const [supplierFilter, setSupplierFilter] = useState<string>('all');

  const currentQ = quarters?.find(q => q.quarter === selQ && q.year === selYear);
  const currentQLocked = !!currentQ?.locked;

  const brands = useMemo(() => {
    const set = new Set<string>();
    products.forEach(p => { if (!p.deletedAt && p.brand) set.add(p.brand); });
    return Array.from(set).sort();
  }, [products]);

  const filtered = useMemo(() => {
    // Filter to selected period (Q+Y)
    let result = batches.filter(b => b.quarter === selQ && b.year === selYear);

    if (supplierFilter !== 'all') result = result.filter(b => b.supplierId === supplierFilter);
    if (brandFilter !== 'all') {
      result = result.filter(b => {
        const p = products.find(pp => pp.id === b.productId);
        return p?.brand === brandFilter;
      });
    }

    if (!search.trim()) return result;
    const q = search.toLowerCase();
    return result.filter(b =>
      b.productName.toLowerCase().includes(q) ||
      b.supplierName.toLowerCase().includes(q)
    );
  }, [batches, search, selQ, selYear, brandFilter, supplierFilter, products]);

  const grouped = useMemo(() => {
    const map = new Map<string, InventoryBatch[]>();
    filtered.forEach(b => {
      if (!map.has(b.supplierId)) map.set(b.supplierId, []);
      map.get(b.supplierId)!.push(b);
    });
    return map;
  }, [filtered]);

  // End-of-quarter summary for selected Q+Y
  const quarterSummary = useMemo(() => {
    const lastMonth = selQ * 3;
    const lastDay = new Date(selYear, lastMonth, 0);
    const lastDayStr = lastDay.toISOString().split('T')[0];

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
    const totalSalesCost = qSales.reduce((s, o) => s + o.items.reduce((is, it) => is + it.buyPrice * it.quantity, 0), 0);
    const stockValue = filtered.reduce((s, b) => s + b.quantity * b.buyPrice, 0);
    const totalImportQty = qImports.reduce((s, o) => s + o.items.reduce((is, it) => is + it.quantity, 0), 0);
    const totalSalesQty = qSales.reduce((s, o) => s + o.items.reduce((is, it) => is + it.quantity, 0), 0);
    const totalStockQty = filtered.reduce((s, b) => s + b.quantity, 0);

    return {
      totalImport,
      totalSalesRevenue,
      totalSalesCost,
      stockValue: Math.max(0, stockValue),
      totalStockQty,
      lastDay: lastDayStr,
      importOrderCount: qImports.length,
      salesOrderCount: qSales.length,
      totalImportQty,
      totalSalesQty,
    };
  }, [selQ, selYear, importOrders, salesOrders, filtered]);

  const toggleSupplier = (id: string) => {
    setCollapsedSuppliers(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleExportPdf = () => {
    exportInventoryPdf(batches, products, suppliers, selQ, selYear);
    addNotification?.(`Đã xuất PDF Kho hàng Q${selQ}/${selYear}`, 'success');
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b-2 border-primary/20 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-bold">Kho hàng</h2>
          <Badge variant="outline" className="font-bold">{filtered.length} lô</Badge>
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

        {/* End-of-quarter summary */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" />
            <span>Cuối quý ({new Date(quarterSummary.lastDay).toLocaleDateString('vi-VN')})</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-2">
              <div className="flex items-center gap-1 mb-1">
                <TrendingUp className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                <span className="text-muted-foreground">Nhập (+)</span>
              </div>
              <p className="font-bold text-emerald-600 dark:text-emerald-400">{formatCompactVND(quarterSummary.totalImport)}</p>
              <p className="text-muted-foreground">{quarterSummary.importOrderCount} đơn · {quarterSummary.totalImportQty} đv</p>
            </div>
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-2">
              <div className="flex items-center gap-1 mb-1">
                <TrendingDown className="h-3.5 w-3.5 text-destructive" />
                <span className="text-muted-foreground">Bán (−)</span>
              </div>
              <p className="font-bold text-destructive">{formatCompactVND(quarterSummary.totalSalesRevenue)}</p>
              <p className="text-muted-foreground">{quarterSummary.salesOrderCount} đơn · {quarterSummary.totalSalesQty} đv</p>
            </div>
          </div>
          <div className="rounded-lg bg-primary/10 border border-primary/20 p-2.5 text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <Package className="h-4 w-4 text-primary" />
              <span className="text-xs text-muted-foreground">Giá trị tồn kho cuối quý</span>
            </div>
            <p className="font-bold text-lg text-primary">{formatVND(quarterSummary.stockValue)}</p>
            <p className="text-xs text-muted-foreground mt-1">{Math.round(quarterSummary.totalStockQty)} đv còn lại</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3 pb-20 lg:pb-4">
        {Array.from(grouped.entries()).map(([supplierId, supplierBatches]) => {
          const supplier = suppliers.find(s => s.id === supplierId);
          const isCollapsed = collapsedSuppliers.has(supplierId);
          const totalQty = supplierBatches.reduce((s, b) => s + b.quantity, 0);
          const totalValue = supplierBatches.reduce((s, b) => s + b.quantity * b.buyPrice, 0);

          const productMap = new Map<string, { name: string; batches: number; totalQty: number; totalValue: number; unit: string; brand: string }>();
          supplierBatches.forEach(b => {
            const prod = products.find(p => p.id === b.productId);
            const existing = productMap.get(b.productId);
            if (existing) {
              existing.batches++;
              existing.totalQty += b.quantity;
              existing.totalValue += b.quantity * b.buyPrice;
            } else {
              productMap.set(b.productId, { name: b.productName, batches: 1, totalQty: b.quantity, totalValue: b.quantity * b.buyPrice, unit: b.unit, brand: prod?.brand || '' });
            }
          });

          return (
            <div key={supplierId} className="rounded-xl border border-border shadow-sm overflow-hidden">
              <button className="flex w-full items-center gap-2 p-3 text-left hover:bg-muted/30 transition-colors" onClick={() => toggleSupplier(supplierId)}>
                {isCollapsed ? <ChevronRight className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
                <Package className="h-4 w-4 shrink-0 text-primary" />
                <div className="flex-1 min-w-0">
                  <span className="font-bold text-sm">{supplier?.name || 'Khác'}</span>
                  <p className="text-xs text-muted-foreground">{productMap.size} SP · {totalQty} đvị · {formatVND(totalValue)}</p>
                </div>
              </button>
              {!isCollapsed && (
                <div className="border-t border-border p-3 space-y-2 animate-in slide-in-from-top-1">
                  {Array.from(productMap.entries()).map(([pid, info]) => (
                    <div key={pid} className={`flex items-center justify-between text-xs p-2 rounded-lg ${info.totalQty <= 5 ? 'bg-destructive/10 border border-destructive/20' : 'bg-muted/30'}`}>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {info.brand && <Badge variant="outline" className="text-[9px] h-4">{info.brand}</Badge>}
                          <p className="font-semibold">{info.name}</p>
                          {info.totalQty <= 5 && <Badge variant="destructive" className="text-[9px] h-4"><AlertTriangle className="h-2.5 w-2.5 mr-0.5" />Sắp hết</Badge>}
                        </div>
                        <p className="text-muted-foreground">{info.batches} lô · {info.unit}</p>
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        <p className={`font-bold ${info.totalQty <= 5 ? 'text-destructive' : 'text-foreground'}`}>{info.totalQty}</p>
                        <p className="text-muted-foreground">{formatVND(info.totalValue)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="py-16 text-center text-sm text-muted-foreground">
            {search ? 'Không tìm thấy' : `Chưa có hàng trong kho Q${selQ}/${selYear}.`}
          </div>
        )}
      </div>
    </div>
  );
}
