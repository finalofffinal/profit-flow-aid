import { useState, useMemo } from 'react';
import { Search, ChevronDown, ChevronRight, Filter, Calendar } from 'lucide-react';
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
  temporary: 'bg-gold/20 text-foreground border-gold/50',
};
const TAG_LABELS: Record<OrderTag, string> = { auto: 'Tự động', special: 'Đặc biệt', temporary: 'Tạm thời' };

export function SalesPage({ salesOrders }: SalesPageProps) {
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState<string>('all');
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());

  const activeOrders = salesOrders.filter(o => !o.deletedAt);

  // Group by date
  const dailySales = useMemo(() => {
    const map = new Map<string, DailySales>();
    activeOrders.forEach(o => {
      const day = o.date.split('T')[0];
      if (!map.has(day)) {
        map.set(day, { date: day, orders: [], totalRevenue: 0, totalProfit: 0, profitPercent: 0 });
      }
      const ds = map.get(day)!;
      ds.orders.push(o);
      ds.totalRevenue += o.totalRevenue;
      ds.totalProfit += o.totalProfit;
    });
    // Calculate profit percent
    map.forEach(ds => {
      ds.profitPercent = ds.totalRevenue > 0 ? Math.round((ds.totalProfit / ds.totalRevenue) * 1000) / 10 : 0;
    });
    return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date));
  }, [activeOrders]);

  // Apply filters
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
      {/* Sticky toolbar */}
      <div className="sticky top-0 z-20 glass-toolbar border-b border-border p-3 space-y-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8" placeholder="Tìm ngày, sản phẩm..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Select value={tagFilter} onValueChange={setTagFilter}>
            <SelectTrigger className="w-28">
              <Filter className="mr-1 h-3 w-3" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả</SelectItem>
              <SelectItem value="auto">Tự động</SelectItem>
              <SelectItem value="special">Đặc biệt</SelectItem>
              <SelectItem value="temporary">Tạm thời</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline">{filtered.length} ngày</Badge>
          <span>Tổng: <span className="font-bold text-emerald">{formatCompactVND(filtered.reduce((s, d) => s + d.totalRevenue, 0))}</span></span>
        </div>
      </div>

      {/* Daily cards */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 safe-bottom">
        {filtered.slice(0, 60).map(ds => {
          const isExpanded = expandedDays.has(ds.date);
          const isToday = ds.date === today;
          const dateObj = new Date(ds.date);

          return (
            <div key={ds.date} className={`rounded-xl border glass card-shadow overflow-hidden ${isToday ? 'border-emerald/50 ring-1 ring-emerald/20' : 'border-border'}`}>
              <button
                className="flex w-full items-center gap-2 p-3 text-left"
                onClick={() => toggleDay(ds.date)}
              >
                {isExpanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">
                      {dateObj.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}
                    </span>
                    {isToday && <Badge className="bg-emerald/20 text-emerald text-[10px]">Hôm nay</Badge>}
                    {ds.orders.some(o => o.tag === 'special') && <span className="h-2 w-2 rounded-full bg-destructive" />}
                    {ds.orders.some(o => o.tag === 'temporary') && <span className="h-2 w-2 rounded-full bg-gold" />}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                    <span>Lãi: <span className="font-bold text-emerald">{formatCompactVND(ds.totalProfit)}</span> ({ds.profitPercent}%)</span>
                    <span>Tổng: <span className="font-bold text-foreground">{formatCompactVND(ds.totalRevenue)}</span></span>
                  </div>
                </div>
              </button>

              {isExpanded && (
                <div className="border-t border-border animate-in slide-in-from-top-1">
                  {ds.orders.map(order => (
                    <div key={order.id} className={`p-3 ${order.tag !== 'auto' ? 'border-l-2' : ''} ${order.tag === 'special' ? 'border-l-destructive bg-destructive/5' : order.tag === 'temporary' ? 'border-l-gold bg-gold/5' : ''}`}>
                      {order.tag !== 'auto' && (
                        <Badge className={`text-[10px] mb-1.5 ${TAG_COLORS[order.tag]}`}>{TAG_LABELS[order.tag]}</Badge>
                      )}
                      <div className="space-y-1">
                        {order.items.map((item, i) => (
                          <div key={i} className="flex items-center justify-between text-xs">
                            <div className="min-w-0">
                              <span className="font-medium">{item.productName}</span>
                              <span className="text-muted-foreground ml-1">×{item.quantitySmall} {item.childUnit}</span>
                            </div>
                            <div className="text-right shrink-0 ml-2">
                              <span className="font-semibold">{formatVND(item.total)}</span>
                              <span className="text-emerald ml-1">(+{formatVND(item.profit)})</span>
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

        {filtered.length > 60 && (
          <p className="text-center text-xs text-muted-foreground py-4">
            Hiển thị 60/{filtered.length} ngày. Sử dụng tìm kiếm để xem thêm.
          </p>
        )}
      </div>
    </div>
  );
}
