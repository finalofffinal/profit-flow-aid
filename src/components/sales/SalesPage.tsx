import { useState, useMemo } from 'react';
import { Search, ChevronDown, ChevronRight, Filter, Camera, X, FileText, FileDown, Lock } from 'lucide-react';
import { SaleOrder, DailySales, ImportTag, PaymentMethod, QuarterData } from '@/types';
import { formatVND, formatCompactVND } from '@/lib/currency';
import { IMPORT_TAG_LABELS, IMPORT_TAG_COLORS, PAYMENT_LABELS } from '@/lib/constants';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { usePeriod } from '@/contexts/PeriodContext';
import { exportSalesPdf } from '@/lib/exportPdf';

interface SalesPageProps {
  salesOrders: SaleOrder[];
  quarters?: QuarterData[];
  addNotification?: (msg: string, type?: any) => void;
}

type TimeRange = 'all' | 'today' | 'week' | 'month' | 'quarter' | 'custom';

export function SalesPage({ salesOrders }: SalesPageProps) {
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState<string>('all');
  const [timeRange, setTimeRange] = useState<TimeRange>('quarter');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [viewingImages, setViewingImages] = useState<string[] | null>(null);

  const activeOrders = salesOrders.filter(o => !o.deletedAt);

  const timeFiltered = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    
    return activeOrders.filter(o => {
      const day = o.date.split('T')[0];
      switch (timeRange) {
        case 'today': return day === todayStr;
        case 'week': {
          const d = new Date(day);
          const weekStart = new Date(now);
          weekStart.setDate(now.getDate() - now.getDay() + 1);
          weekStart.setHours(0, 0, 0, 0);
          return d >= weekStart && d <= now;
        }
        case 'month': {
          const d = new Date(day);
          return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        }
        case 'quarter': {
          const d = new Date(day);
          const q = Math.ceil((now.getMonth() + 1) / 3);
          const dq = Math.ceil((d.getMonth() + 1) / 3);
          return dq === q && d.getFullYear() === now.getFullYear();
        }
        case 'custom': {
          if (!customFrom || !customTo) return true;
          return day >= customFrom && day <= customTo;
        }
        default: return true;
      }
    });
  }, [activeOrders, timeRange, customFrom, customTo]);

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
    return result;
  }, [dailySales, search, tagFilter]);

  const totalRevenue = filtered.reduce((s, d) => s + d.totalRevenue, 0);
  const totalProfit = filtered.reduce((s, d) => s + d.totalProfit, 0);

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
        <div className="flex gap-1.5 overflow-x-auto">
          {(['today', 'week', 'month', 'quarter', 'all', 'custom'] as TimeRange[]).map(r => (
            <Button key={r} size="sm" variant={timeRange === r ? 'default' : 'outline'} className="h-7 text-xs shrink-0"
              onClick={() => setTimeRange(r)}>
              {{ today: 'Hôm nay', week: 'Tuần', month: 'Tháng', quarter: 'Quý', all: 'Tất cả', custom: 'Tùy chọn' }[r]}
            </Button>
          ))}
        </div>

        {timeRange === 'custom' && (
          <div className="flex gap-2">
            <Input type="date" className="h-8 text-xs" value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
            <Input type="date" className="h-8 text-xs" value={customTo} onChange={e => setCustomTo(e.target.value)} />
          </div>
        )}

        {/* Cumulative revenue banner - high contrast for dark mode */}
        <div className="flex items-center justify-between bg-primary/15 dark:bg-primary/25 rounded-xl p-3 border border-primary/30">
          <div>
            <p className="text-xs text-muted-foreground font-medium">Doanh thu tích lũy</p>
            <p className="text-xl font-black text-primary dark:text-primary">{formatCompactVND(totalRevenue)} VND</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground font-medium">Lợi nhuận</p>
            <p className="text-xl font-black text-emerald-600 dark:text-emerald-300">{formatCompactVND(totalProfit)} VND</p>
          </div>
          <Badge variant="outline" className="text-xs font-bold border-primary/40">{filtered.length} ngày</Badge>
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
                    {ds.orders.some(o => o.tag === 'special') && <span className="h-2 w-2 rounded-full bg-destructive" />}
                    {ds.orders.some(o => o.tag === 'supplementary') && <span className="h-2 w-2 rounded-full bg-amber-500" />}
                    {ds.orders.some(o => o.tag === 'upgraded') && <span className="h-2 w-2 rounded-full bg-blue-600" />}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                    <span>Lãi: <span className="font-bold text-emerald-600 dark:text-emerald-300">{formatCompactVND(ds.totalProfit)}</span> ({ds.profitPercent}%)</span>
                    <span>Tổng: <span className="font-bold text-foreground">{formatCompactVND(ds.totalRevenue)}</span></span>
                  </div>
                </div>
              </button>

              {isExpanded && (
                <div className="border-t border-border animate-in slide-in-from-top-1">
                  {ds.orders.map(order => {
                    const tagColor = IMPORT_TAG_COLORS[order.tag] || '';
                    const tagLabel = IMPORT_TAG_LABELS[order.tag] || 'TM';
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
                          {order.items.map((item, i) => (
                            <div key={i} className="flex items-center justify-between text-xs">
                              <div className="min-w-0">
                                <span className="font-medium">{item.productName}</span>
                                <span className="text-muted-foreground ml-1">×{item.quantity} {item.unit}</span>
                              </div>
                              <div className="text-right shrink-0 ml-2">
                                <span className="font-semibold">{formatVND(item.total)}</span>
                                <span className="text-emerald-600 dark:text-emerald-300 ml-1">(+{item.profitPercent}%)</span>
                              </div>
                            </div>
                          ))}
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
