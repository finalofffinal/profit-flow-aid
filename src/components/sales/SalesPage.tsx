import { useState, useMemo } from 'react';
import { Search, ChevronDown, ChevronRight, Filter, Camera, X, FileText, FileDown, Lock, Undo2 } from 'lucide-react';
import { SaleOrder, DailySales, ImportTag, PaymentMethod, QuarterData, Product } from '@/types';
import { formatVND, formatCompactVND } from '@/lib/currency';
import { IMPORT_TAG_LABELS, IMPORT_TAG_COLORS, PAYMENT_LABELS } from '@/lib/constants';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { usePeriod } from '@/contexts/PeriodContext';
import { TimeRangeFilter, TimeRange, filterByTimeRange } from '@/components/common/TimeRangeFilter';
import { exportSalesPdf } from '@/lib/exportPdf';

interface SalesPageProps {
  salesOrders: SaleOrder[];
  products?: Product[];
  quarters?: QuarterData[];
  addNotification?: (msg: string, type?: any) => void;
}



export function SalesPage({ salesOrders, products = [], quarters, addNotification }: SalesPageProps) {
  const { quarter: selQ, year: selYear } = usePeriod();
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState<string>('all');
  const [brandFilter, setBrandFilter] = useState<string>('all');
  const [timeRange, setTimeRange] = useState<TimeRange>('quarter');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [viewingImages, setViewingImages] = useState<string[] | null>(null);
  const [undoStack, setUndoStack] = useState<{ action: string; data: any }[]>([]);

  const allBrands = useMemo(() => {
    const set = new Set<string>();
    products.forEach(p => { if (p.brand && !p.deletedAt) set.add(p.brand); });
    return Array.from(set).sort();
  }, [products]);

  const productBrandMap = useMemo(() => {
    const m = new Map<string, string>();
    products.forEach(p => { if (p.brand) m.set(p.id, p.brand); });
    return m;
  }, [products]);

  const currentQ = quarters?.find(q => q.quarter === selQ && q.year === selYear);
  const currentQLocked = !!currentQ?.locked;

  const handleExportPdf = () => {
    exportSalesPdf(salesOrders, selYear, [selQ]);
    addNotification?.(`Đã xuất PDF Bán hàng Q${selQ}/${selYear}`, 'success');
  };

  const activeOrders = salesOrders.filter(o => !o.deletedAt);

  const timeFiltered = useMemo(() => {
    return filterByTimeRange(activeOrders, timeRange, selQ, selYear, customFrom, customTo);
  }, [activeOrders, timeRange, selQ, selYear, customFrom, customTo]);

  const dailySales = useMemo(() => {
    const map = new Map<string, DailySales>();
    timeFiltered.forEach(o => {
      const day = o.date.split('T')[0];
      if (!map.has(day)) map.set(day, { date: day, orders: [], totalRevenue: 0, totalProfit: 0, profitPercent: 0 });
      const ds = map.get(day)!;
      ds.orders.push(o);
      ds.totalRevenue += o.totalRevenue;
      ds.totalProfit += o.totalProfit;
    });
    map.forEach(ds => {
      ds.profitPercent = ds.totalRevenue > 0 ? Math.round((ds.totalProfit / ds.totalRevenue) * 1000) / 10 : 0;
    });
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [timeFiltered]);

  const filtered = useMemo(() => {
    let result = dailySales;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(ds =>
        ds.date.includes(q) ||
        ds.orders.some(o => o.items.some(it => it.productName.toLowerCase().includes(q)))
      );
    }
    if (tagFilter !== 'all') {
      result = result.filter(ds => ds.orders.some(o => o.tag === tagFilter));
    }
    if (brandFilter !== 'all') {
      result = result.filter(ds =>
        ds.orders.some(o => o.items.some(it => productBrandMap.get(it.productId) === brandFilter))
      );
    }
    return result;
  }, [dailySales, search, tagFilter, brandFilter, productBrandMap]);

  // Doanh thu tích lũy / Lợi nhuận: LUÔN tính trên TOÀN BỘ Q+Năm đang chọn
  // (không bị filter UI ảnh hưởng) — đảm bảo khớp số trên Dashboard.
  const quarterRevenue = useMemo(() => {
    return activeOrders
      .filter(o => {
        const d = new Date(o.date);
        return d.getFullYear() === selYear && Math.ceil((d.getMonth() + 1) / 3) === selQ;
      })
      .reduce((s, o) => s + o.totalRevenue, 0);
  }, [activeOrders, selQ, selYear]);

  const quarterProfit = useMemo(() => {
    return activeOrders
      .filter(o => {
        const d = new Date(o.date);
        return d.getFullYear() === selYear && Math.ceil((d.getMonth() + 1) / 3) === selQ;
      })
      .reduce((s, o) => s + o.totalProfit, 0);
  }, [activeOrders, selQ, selYear]);

  // Tổng theo bộ lọc hiện tại (phản ứng theo TimeRange + search/tag/brand)
  const totalRevenue = filtered.reduce((s, d) => s + d.totalRevenue, 0);
  const totalProfit = filtered.reduce((s, d) => s + d.totalProfit, 0);

  const rangeLabel: Record<TimeRange, string> = {
    today: 'Hôm nay',
    week: 'Tuần này',
    month: 'Tháng này',
    quarter: `Q${selQ}/${selYear}`,
    custom: 'Tùy chọn',
  };

  const toggleDay = (date: string) => {
    setExpandedDays(prev => {
      const next = new Set(prev);
      next.has(date) ? next.delete(date) : next.add(date);
      return next;
    });
  };

  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b-2 border-primary/20 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-bold">Bán hàng</h2>
          <div className="flex-1" />
          {undoStack.length > 0 && (
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => {
              setUndoStack(prev => prev.slice(0, -1));
              addNotification?.('Đã hoàn tác (chỉ trong UI)', 'info');
            }}>
              <Undo2 className="mr-1 h-3.5 w-3.5" /> Hoàn tác
            </Button>
          )}
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleExportPdf}>
            <FileDown className="mr-1 h-3.5 w-3.5" /> PDF Q{selQ}/{selYear}
          </Button>
        </div>
        {currentQLocked && (
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 px-2 py-1.5 text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
            <Lock className="h-3.5 w-3.5" /> Quý {selQ}/{selYear} đã khóa
          </div>
        )}
        <TimeRangeFilter
          value={timeRange} onChange={setTimeRange}
          customFrom={customFrom} onCustomFromChange={setCustomFrom}
          customTo={customTo} onCustomToChange={setCustomTo}
        />

        {/* Doanh thu phản ứng theo bộ lọc thời gian; quý hiển thị tổng quý (khớp Dashboard) */}
        <div className="space-y-1.5 bg-primary/15 dark:bg-primary/25 rounded-xl p-3 border border-primary/30">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold">Doanh thu — {rangeLabel[timeRange]}</p>
              <p className="text-xl font-black text-primary dark:text-primary truncate">{formatCompactVND(totalRevenue)} VND</p>
            </div>
            <div className="text-right min-w-0">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold">Lợi nhuận</p>
              <p className="text-xl font-black text-emerald-600 dark:text-emerald-300 truncate">{formatCompactVND(totalProfit)} VND</p>
            </div>
            <Badge variant="outline" className="text-xs font-bold border-primary/40 shrink-0">{filtered.length} ngày</Badge>
          </div>
          {timeRange !== 'quarter' && (
            <div className="flex items-center justify-between text-[11px] text-muted-foreground border-t border-primary/20 pt-1.5">
              <span>Tổng cả Q{selQ}/{selYear}: <span className="font-bold text-foreground">{formatCompactVND(quarterRevenue)}</span></span>
              <span>Lãi quý: <span className="font-bold text-emerald-600 dark:text-emerald-300">{formatCompactVND(quarterProfit)}</span></span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8 h-8 text-sm" placeholder="Tìm ngày, sản phẩm..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Select value={tagFilter} onValueChange={setTagFilter}>
            <SelectTrigger className="w-28 h-8"><Filter className="mr-1 h-3 w-3" /><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả</SelectItem>
              <SelectItem value="auto">⚪ Tự động</SelectItem>
              <SelectItem value="special">🔴 Đặc biệt</SelectItem>
              <SelectItem value="supplementary">🟡 Bổ sung</SelectItem>
              <SelectItem value="upgraded">🔵 Nâng cấp</SelectItem>
            </SelectContent>
          </Select>
          {allBrands.length > 0 && (
            <Select value={brandFilter} onValueChange={setBrandFilter}>
              <SelectTrigger className="w-28 h-8"><SelectValue placeholder="Nhãn" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả nhãn</SelectItem>
                {allBrands.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2 pb-20 lg:pb-4">
        {filtered.map(ds => {
          const isExpanded = expandedDays.has(ds.date);
          const isToday = ds.date === today;
          const dateObj = new Date(ds.date);

          return (
            <div key={ds.date} className={`rounded-xl border shadow-sm overflow-hidden ${isToday ? 'border-emerald-500/50 ring-1 ring-emerald-500/20' : 'border-border'}`}>
              <button className="flex w-full items-center gap-2 p-3 text-left hover:bg-muted/30 transition-colors"
                onClick={() => toggleDay(ds.date)}>
                {isExpanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm">
                      {dateObj.toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                    </span>
                    {isToday && <Badge className="bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-[10px]">Hôm nay</Badge>}
                    {ds.totalRevenue === 0 && ds.orders.some(o => o.items[0]?.productId === '__tet__') && (
                      <Badge className="bg-amber-500/20 text-amber-700 dark:text-amber-300 text-[10px]">🏮 Nghỉ Tết</Badge>
                    )}
                    {ds.orders.some(o => o.tag === 'special') && <span className="h-2 w-2 rounded-full bg-destructive" />}
                    {ds.orders.some(o => o.tag === 'supplementary') && <span className="h-2 w-2 rounded-full bg-amber-500" />}
                    {ds.orders.some(o => o.tag === 'upgraded') && <span className="h-2 w-2 rounded-full bg-blue-600" />}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                    {ds.totalRevenue === 0 ? (
                      <span className="italic">Không bán hàng</span>
                    ) : (
                      <>
                        <span>Lãi: <span className="font-bold text-emerald-600 dark:text-emerald-300">{formatCompactVND(ds.totalProfit)}</span> ({ds.profitPercent}%)</span>
                        <span>Tổng: <span className="font-bold text-foreground">{formatCompactVND(ds.totalRevenue)}</span></span>
                      </>
                    )}
                  </div>
                </div>
              </button>

              {isExpanded && (
                <div className="border-t border-border animate-in slide-in-from-top-1">
                  {ds.orders.map(order => {
                    const tagColor = IMPORT_TAG_COLORS[order.tag] || '';
                    const tagLabel = IMPORT_TAG_LABELS[order.tag] || 'TM';
                    const isTetClosed = order.totalRevenue === 0 && order.items.length === 1 && order.items[0].productId === '__tet__';
                    if (isTetClosed) {
                      return (
                        <div key={order.id} className="p-3 border-l-2 border-l-amber-500 bg-amber-500/10">
                          <p className="text-sm font-bold text-amber-700 dark:text-amber-300">🏮 {order.items[0].productName}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">Doanh thu: 0 VND</p>
                        </div>
                      );
                    }
                    return (
                      <div key={order.id} className={`p-3 ${order.tag !== 'auto' ? 'border-l-2' : ''} ${order.tag === 'special' ? 'border-l-destructive bg-destructive/5' : order.tag === 'supplementary' ? 'border-l-amber-500 bg-amber-500/5' : order.tag === 'upgraded' ? 'border-l-blue-600 bg-blue-600/5' : ''}`}>
                        <div className="flex items-center gap-2 mb-1.5">
                          <Badge className={`text-[10px] ${tagColor}`}>{tagLabel}</Badge>
                          <span className="text-[10px] text-muted-foreground">{PAYMENT_LABELS[order.paymentMethod]}</span>
                          {order.transferImages.length > 0 && (
                            <button className="text-[10px] text-primary underline" onClick={() => setViewingImages(order.transferImages)}>
                              📷 {order.transferImages.length} ảnh
                            </button>
                          )}
                        </div>
                        <div className="space-y-1">
                          {order.items.map((item, i) => {
                            const itemProfitPct = item.total > 0 ? Math.round((item.profit / item.total) * 1000) / 10 : 0;
                            return (
                              <div key={i} className="flex items-center justify-between text-xs">
                                <div className="min-w-0">
                                  <span className="font-medium">{item.productName}</span>
                                  <span className="text-muted-foreground ml-1">×{item.quantity} {item.unit}</span>
                                </div>
                                <div className="text-right shrink-0 ml-2">
                                  <span className="font-semibold">{formatVND(item.total)}</span>
                                  <span className="text-emerald-600 dark:text-emerald-300 ml-1">(+{itemProfitPct}%)</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <div className="flex justify-between mt-1.5 pt-1.5 border-t border-border text-xs">
                          <span className="text-muted-foreground">{PAYMENT_LABELS[order.paymentMethod]}</span>
                          <span className="font-bold">{formatVND(order.totalRevenue)}</span>
                        </div>
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
            {search ? 'Không tìm thấy' : 'Chưa có dữ liệu bán hàng. Thiết lập mục tiêu doanh thu ở Tab Tổng quan.'}
          </div>
        )}
      </div>

      {/* Image viewer dialog */}
      <Dialog open={!!viewingImages} onOpenChange={() => setViewingImages(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Ảnh chuyển khoản</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-2">
            {viewingImages?.map((img, i) => (
              <img key={i} src={img} alt={`Transfer ${i + 1}`} className="rounded-lg w-full" />
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
