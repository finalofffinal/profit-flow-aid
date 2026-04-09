import { useState, useMemo } from 'react';
import { Search, ChevronDown, ChevronRight, Filter } from 'lucide-react';
import { SaleOrder, DailySales, OrderTag } from '@/types';
import { formatVND, formatCompactVND } from '@/lib/currency';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface SalesPageProps {
  salesOrders: SaleOrder[];
}

const TAG_COLORS: Record<OrderTag, string> = {
  auto: 'bg-secondary text-secondary-foreground',
  special: 'bg-destructive/20 text-destructive border-destructive/30',
  temporary: 'bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/30',
};
const TAG_LABELS: Record<OrderTag, string> = { auto: 'TM', special: 'Đặc biệt', temporary: 'Tạm thời' };

type TimeRange = 'all' | 'today' | 'week' | 'month' | 'quarter' | 'custom';

export function SalesPage({ salesOrders }: SalesPageProps) {
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState<string>('all');
  const [timeRange, setTimeRange] = useState<TimeRange>('quarter');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());

  const activeOrders = salesOrders.filter(o => !o.deletedAt);

  // Filter by time range
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
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border p-3 space-y-2">
        {/* Time range pills */}
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

        {/* Cumulative revenue banner */}
        <div className="flex items-center justify-between bg-primary/5 rounded-lg p-2">
          <div>
            <p className="text-xs text-muted-foreground">Doanh thu tích lũy</p>
            <p className="text-lg font-bold text-primary">{formatCompactVND(totalRevenue)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Lợi nhuận</p>
            <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{formatCompactVND(totalProfit)}</p>
          </div>
          <Badge variant="outline" className="text-xs">{filtered.length} ngày</Badge>
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
              <SelectItem value="temporary">🟡 Tạm thời</SelectItem>
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
                      {dateObj.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}
                    </span>
                    {isToday && <Badge className="bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[10px]">Hôm nay</Badge>}
                    {ds.orders.some(o => o.tag === 'special') && <span className="h-2 w-2 rounded-full bg-destructive" />}
                    {ds.orders.some(o => o.tag === 'temporary') && <span className="h-2 w-2 rounded-full bg-amber-500" />}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                    <span>Lãi: <span className="font-bold text-emerald-600 dark:text-emerald-400">{formatCompactVND(ds.totalProfit)}</span> ({ds.profitPercent}%)</span>
                    <span>Tổng: <span className="font-bold text-foreground">{formatCompactVND(ds.totalRevenue)}</span></span>
                  </div>
                </div>
              </button>

              {isExpanded && (
                <div className="border-t border-border animate-in slide-in-from-top-1">
                  {ds.orders.map(order => (
                    <div key={order.id} className={`p-3 ${order.tag !== 'auto' ? 'border-l-2' : ''} ${order.tag === 'special' ? 'border-l-destructive bg-destructive/5' : order.tag === 'temporary' ? 'border-l-amber-500 bg-amber-500/5' : ''}`}>
                      {order.tag !== 'auto' && (
                        <Badge className={`text-[10px] mb-1.5 ${TAG_COLORS[order.tag]}`}>{TAG_LABELS[order.tag]}</Badge>
                      )}
                      <div className="space-y-1">
                        {order.items.map((item, i) => (
                          <div key={i} className="flex items-center justify-between text-xs">
                            <div className="min-w-0">
                              <span className="font-medium">{item.productName}</span>
                              <span className="text-muted-foreground ml-1">×{item.quantity} {item.unit}</span>
                            </div>
                            <div className="text-right shrink-0 ml-2">
                              <span className="font-semibold">{formatVND(item.total)}</span>
                              <span className="text-emerald-600 dark:text-emerald-400 ml-1">(+{item.profitPercent}%)</span>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="flex justify-between mt-1.5 pt-1.5 border-t border-border text-xs">
                        <span className="text-muted-foreground">{order.paymentMethod === 'cash' ? '💵 Tiền mặt' : '💳 Chuyển khoản'}</span>
                        <span className="font-bold">{formatVND(order.totalRevenue)}</span>
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
            {search ? 'Không tìm thấy' : 'Chưa có dữ liệu bán hàng. Thiết lập mục tiêu doanh thu ở Tab Tổng quan.'}
          </div>
        )}
      </div>
    </div>
  );
}
