import { useState, useMemo } from 'react';
import { Search, ChevronDown, ChevronRight, Package, AlertTriangle, TrendingUp, TrendingDown, CalendarDays } from 'lucide-react';
import { InventoryBatch, Supplier, SaleOrder, ImportOrder } from '@/types';
import { formatVND, formatCompactVND } from '@/lib/currency';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface InventoryPageProps {
  batches: InventoryBatch[];
  suppliers: Supplier[];
  importOrders: ImportOrder[];
  salesOrders: SaleOrder[];
}

export function InventoryPage({ batches, suppliers, importOrders, salesOrders }: InventoryPageProps) {
  const [search, setSearch] = useState('');
  const [collapsedSuppliers, setCollapsedSuppliers] = useState<Set<string>>(new Set());
  const [selectedQuarter, setSelectedQuarter] = useState<string>('all');

  const quarterOptions = useMemo(() => {
    const qs = new Set<string>();
    batches.forEach(b => qs.add(`Q${b.quarter}/${b.year}`));
    return Array.from(qs).sort();
  }, [batches]);

  const filtered = useMemo(() => {
    let result = batches;
    if (selectedQuarter !== 'all') {
      const [qStr, yStr] = selectedQuarter.replace('Q', '').split('/');
      result = result.filter(b => b.quarter === parseInt(qStr) && b.year === parseInt(yStr));
    }
    if (!search.trim()) return result;
    const q = search.toLowerCase();
    return result.filter(b =>
      b.productName.toLowerCase().includes(q) ||
      b.supplierName.toLowerCase().includes(q)
    );
  }, [batches, search, selectedQuarter]);

  const grouped = useMemo(() => {
    const map = new Map<string, InventoryBatch[]>();
    filtered.forEach(b => {
      if (!map.has(b.supplierId)) map.set(b.supplierId, []);
      map.get(b.supplierId)!.push(b);
    });
    return map;
  }, [filtered]);

  // End-of-quarter summary: last day stats
  const quarterSummary = useMemo(() => {
    if (selectedQuarter === 'all') return null;
    const [qStr, yStr] = selectedQuarter.replace('Q', '').split('/');
    const q = parseInt(qStr);
    const y = parseInt(yStr);

    // Get last day of quarter
    const lastMonth = q * 3;
    const lastDay = new Date(y, lastMonth, 0);
    const lastDayStr = lastDay.toISOString().split('T')[0];

    const qImports = importOrders.filter(o => {
      if (o.deletedAt) return false;
      const d = new Date(o.date);
      return Math.ceil((d.getMonth() + 1) / 3) === q && d.getFullYear() === y;
    });
    const qSales = salesOrders.filter(o => {
      if (o.deletedAt) return false;
      const d = new Date(o.date);
      return Math.ceil((d.getMonth() + 1) / 3) === q && d.getFullYear() === y;
    });

    const totalImport = qImports.reduce((s, o) => s + o.total, 0);
    const totalSalesRevenue = qSales.reduce((s, o) => s + o.totalRevenue, 0);
    const totalSalesCost = qSales.reduce((s, o) => {
      return s + o.items.reduce((is, it) => is + it.buyPrice * it.quantity, 0);
    }, 0);

    // Stock value = total import cost - total cost of goods sold
    const stockValue = totalImport - totalSalesCost;

    return {
      totalImport,
      totalSalesRevenue,
      totalSalesCost,
      stockValue: Math.max(0, stockValue),
      lastDay: lastDayStr,
      importOrderCount: qImports.length,
      salesOrderCount: qSales.length,
    };
  }, [selectedQuarter, importOrders, salesOrders]);

  const toggleSupplier = (id: string) => {
    setCollapsedSuppliers(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b-2 border-primary/20 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-bold">Kho hàng</h2>
          <div className="flex-1" />
          <Badge variant="outline" className="font-bold">{filtered.length} lô</Badge>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8 h-9" placeholder="Tìm sản phẩm, NCC..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Select value={selectedQuarter} onValueChange={setSelectedQuarter}>
            <SelectTrigger className="w-28 h-9"><SelectValue placeholder="Quý" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả</SelectItem>
              {quarterOptions.map(q => <SelectItem key={q} value={q}>{q}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* End-of-quarter summary */}
        {quarterSummary && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5" />
              <span>Thống kê cuối quý ({new Date(quarterSummary.lastDay).toLocaleDateString('vi-VN')})</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-2">
                <div className="flex items-center gap-1 mb-1">
                  <TrendingUp className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-muted-foreground">Nhập (+)</span>
                </div>
                <p className="font-bold text-emerald-600 dark:text-emerald-400">{formatCompactVND(quarterSummary.totalImport)}</p>
                <p className="text-muted-foreground">{quarterSummary.importOrderCount} đơn nhập</p>
              </div>
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-2">
                <div className="flex items-center gap-1 mb-1">
                  <TrendingDown className="h-3.5 w-3.5 text-destructive" />
                  <span className="text-muted-foreground">Bán (−)</span>
                </div>
                <p className="font-bold text-destructive">{formatCompactVND(quarterSummary.totalSalesRevenue)}</p>
                <p className="text-muted-foreground">{quarterSummary.salesOrderCount} đơn bán · Vốn: {formatCompactVND(quarterSummary.totalSalesCost)}</p>
              </div>
            </div>
            <div className="rounded-lg bg-primary/10 border border-primary/20 p-2.5 text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <Package className="h-4 w-4 text-primary" />
                <span className="text-xs text-muted-foreground">Giá trị tồn kho cuối quý</span>
              </div>
              <p className="font-bold text-lg text-primary">{formatVND(quarterSummary.stockValue)}</p>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3 pb-20 lg:pb-4">
        {Array.from(grouped.entries()).map(([supplierId, supplierBatches]) => {
          const supplier = suppliers.find(s => s.id === supplierId);
          const isCollapsed = collapsedSuppliers.has(supplierId);
          const totalQty = supplierBatches.reduce((s, b) => s + b.quantity, 0);
          const totalValue = supplierBatches.reduce((s, b) => s + b.quantity * b.buyPrice, 0);

          const productMap = new Map<string, { name: string; batches: number; totalQty: number; totalValue: number; unit: string }>();
          supplierBatches.forEach(b => {
            const existing = productMap.get(b.productId);
            if (existing) {
              existing.batches++;
              existing.totalQty += b.quantity;
              existing.totalValue += b.quantity * b.buyPrice;
            } else {
              productMap.set(b.productId, { name: b.productName, batches: 1, totalQty: b.quantity, totalValue: b.quantity * b.buyPrice, unit: b.unit });
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
                        <div className="flex items-center gap-2">
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
            {search ? 'Không tìm thấy' : 'Chưa có hàng trong kho. Tạo đơn nhập ở Tab Nhập hàng.'}
          </div>
        )}
      </div>
    </div>
  );
}
