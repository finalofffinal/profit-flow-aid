import { useState, useMemo } from 'react';
import { Search, Trash2, Plus, ChevronDown, ChevronRight, Lock, RotateCcw, Trash, X } from 'lucide-react';
import { ImportOrder, Supplier, Product, OrderTag } from '@/types';
import { formatVND } from '@/lib/currency';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';

interface ImportPageProps {
  importOrders: ImportOrder[];
  activeOrders: ImportOrder[];
  deletedOrders: ImportOrder[];
  suppliers: Supplier[];
  products: Product[];
  addOrder: (o: Omit<ImportOrder, 'id' | 'createdAt' | 'deletedAt'>) => ImportOrder;
  deleteOrder: (id: string) => void;
  restoreOrder: (id: string) => void;
  permanentDeleteOrder: (id: string) => void;
  addNotification: (msg: string, type?: any) => void;
}

const TAG_LABELS: Record<OrderTag, string> = { auto: 'Tự động', special: 'Đặc biệt', temporary: 'Tạm thời' };
const TAG_COLORS: Record<OrderTag, string> = {
  auto: 'bg-secondary text-secondary-foreground',
  special: 'bg-destructive/20 text-destructive border-destructive/30',
  temporary: 'bg-gold/20 text-foreground border-gold/50',
};

export function ImportPage({ activeOrders, deletedOrders, suppliers, products, addOrder, deleteOrder, restoreOrder, permanentDeleteOrder, addNotification }: ImportPageProps) {
  const [search, setSearch] = useState('');
  const [showTrash, setShowTrash] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());

  const filteredOrders = useMemo(() => {
    if (!search.trim()) return activeOrders;
    const q = search.toLowerCase();
    return activeOrders.filter(o =>
      o.supplierName.toLowerCase().includes(q) ||
      o.items.some(it => it.productName.toLowerCase().includes(q)) ||
      o.date.includes(q)
    );
  }, [activeOrders, search]);

  // Group by date
  const groupedByDate = useMemo(() => {
    const map = new Map<string, ImportOrder[]>();
    const sorted = [...filteredOrders].sort((a, b) => b.date.localeCompare(a.date));
    sorted.forEach(o => {
      const day = o.date.split('T')[0];
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(o);
    });
    return map;
  }, [filteredOrders]);

  const toggleExpand = (id: string) => {
    setExpandedOrders(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Sticky toolbar */}
      <div className="sticky top-0 z-20 glass-toolbar border-b border-border p-3 space-y-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8" placeholder="Tìm NCC, sản phẩm, ngày..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Button variant="outline" size="icon" onClick={() => setShowTrash(true)} className="relative shrink-0">
            <Trash2 className="h-4 w-4" />
            {deletedOrders.length > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
                {deletedOrders.length}
              </span>
            )}
          </Button>
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <Plus className="mr-1 h-4 w-4" /> Thêm
          </Button>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline">{activeOrders.length} đơn</Badge>
          <span>Tổng: <span className="font-bold text-foreground">{formatVND(activeOrders.reduce((s, o) => s + o.total, 0))}</span></span>
        </div>
      </div>

      {/* Orders list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4 safe-bottom">
        {Array.from(groupedByDate.entries()).map(([date, orders]) => (
          <div key={date}>
            <p className="text-xs font-bold text-muted-foreground mb-2">
              {new Date(date).toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}
            </p>
            <div className="space-y-2">
              {orders.map(order => {
                const isExpanded = expandedOrders.has(order.id);
                return (
                  <div key={order.id} className="rounded-xl border border-border glass card-shadow overflow-hidden">
                    <button
                      className="flex w-full items-center gap-2 p-3 text-left"
                      onClick={() => toggleExpand(order.id)}
                    >
                      {isExpanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm truncate">{order.supplierName}</span>
                          <Badge className={`text-[10px] ${TAG_COLORS[order.tag]}`}>{TAG_LABELS[order.tag]}</Badge>
                          {order.locked && <Lock className="h-3 w-3 text-muted-foreground" />}
                        </div>
                        <p className="text-xs text-muted-foreground">{order.items.length} SP · {formatVND(order.total)}</p>
                      </div>
                      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={e => { e.stopPropagation(); deleteOrder(order.id); }}>
                        <Trash className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-border p-3 space-y-1.5 animate-in slide-in-from-top-1">
                        {order.items.map((item, i) => (
                          <div key={i} className="flex items-center justify-between text-xs">
                            <div className="min-w-0">
                              <span className="font-medium">{item.productName}</span>
                              <span className="text-muted-foreground ml-1">×{item.quantity} {item.parentUnit}</span>
                            </div>
                            <span className="font-semibold shrink-0 ml-2">{formatVND(item.total)}</span>
                          </div>
                        ))}
                        <div className="flex justify-end pt-1 border-t border-border text-xs font-bold">
                          Tổng: {formatVND(order.total)}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {filteredOrders.length === 0 && (
          <div className="py-16 text-center text-sm text-muted-foreground">
            {search ? 'Không tìm thấy đơn nhập nào' : 'Chưa có đơn nhập hàng. Thiết lập mục tiêu doanh thu ở Tab Tổng quan để tự động tạo.'}
          </div>
        )}
      </div>

      {/* Trash Dialog */}
      <Dialog open={showTrash} onOpenChange={v => !v && setShowTrash(false)}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Thùng rác ({deletedOrders.length})</DialogTitle>
            <DialogDescription>Đơn nhập đã xóa</DialogDescription>
          </DialogHeader>
          {deletedOrders.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Trống</p>
          ) : (
            <div className="space-y-2">
              {deletedOrders.map(o => (
                <div key={o.id} className="flex items-center justify-between rounded-lg border p-2">
                  <div>
                    <p className="text-sm font-medium">{o.supplierName}</p>
                    <p className="text-xs text-muted-foreground">{formatVND(o.total)} · {new Date(o.date).toLocaleDateString('vi-VN')}</p>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => restoreOrder(o.id)}>
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => permanentDeleteOrder(o.id)}>
                      <Trash className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Order Dialog */}
      <AddImportDialog
        open={showAdd}
        onClose={() => setShowAdd(false)}
        suppliers={suppliers}
        products={products}
        onSubmit={(order) => {
          addOrder(order);
          addNotification(`Đã thêm đơn nhập từ ${order.supplierName}`, 'info');
        }}
      />
    </div>
  );
}

function AddImportDialog({ open, onClose, suppliers, products, onSubmit }: {
  open: boolean; onClose: () => void;
  suppliers: Supplier[]; products: Product[];
  onSubmit: (order: Omit<ImportOrder, 'id' | 'createdAt' | 'deletedAt'>) => void;
}) {
  const [supplierId, setSupplierId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [tag, setTag] = useState<OrderTag>('special');
  const [selectedProducts, setSelectedProducts] = useState<{ productId: string; quantity: number }[]>([]);

  const supplierProducts = useMemo(() =>
    products.filter(p => !p.deletedAt && p.supplierId === supplierId),
    [products, supplierId]
  );

  const addItem = () => setSelectedProducts(prev => [...prev, { productId: '', quantity: 1 }]);
  const removeItem = (i: number) => setSelectedProducts(prev => prev.filter((_, idx) => idx !== i));

  const handleSubmit = () => {
    const supplier = suppliers.find(s => s.id === supplierId);
    if (!supplier) return;

    const items: ImportOrder['items'] = selectedProducts
      .filter(sp => sp.productId && sp.quantity > 0)
      .map(sp => {
        const product = products.find(p => p.id === sp.productId)!;
        return {
          productId: product.id,
          productName: product.name,
          supplierId: product.supplierId,
          supplierName: supplier.name,
          parentUnit: product.parentUnit,
          childUnit: product.childUnit || product.parentUnit,
          conversionRate: product.conversionRate || 1,
          quantity: sp.quantity,
          buyPrice: product.buyPrice,
          total: product.buyPrice * sp.quantity,
        };
      });

    if (items.length === 0) return;

    onSubmit({
      supplierId,
      supplierName: supplier.name,
      date,
      items,
      total: items.reduce((s, it) => s + it.total, 0),
      tag,
      locked: false,
    });
    onClose();
    setSupplierId('');
    setSelectedProducts([]);
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Thêm đơn nhập hàng</DialogTitle>
          <DialogDescription>Chọn NCC và sản phẩm</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Nhà cung cấp</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Chọn NCC" /></SelectTrigger>
                <SelectContent>
                  {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Ngày nhập</Label>
              <Input className="mt-1" type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
          </div>

          <div>
            <Label className="text-xs">Tag</Label>
            <Select value={tag} onValueChange={v => setTag(v as OrderTag)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="special">🔴 Đặc biệt</SelectItem>
                <SelectItem value="temporary">🟡 Tạm thời</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Product items */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-bold">Sản phẩm</Label>
              <Button variant="outline" size="sm" onClick={addItem} disabled={!supplierId}>
                <Plus className="mr-1 h-3 w-3" /> Thêm SP
              </Button>
            </div>
            {selectedProducts.map((sp, i) => (
              <div key={i} className="flex items-center gap-2">
                <Select value={sp.productId} onValueChange={v => {
                  const updated = [...selectedProducts];
                  updated[i].productId = v;
                  setSelectedProducts(updated);
                }}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder="Chọn SP" /></SelectTrigger>
                  <SelectContent>
                    {supplierProducts.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input className="w-20" type="number" min={1} value={sp.quantity} onChange={e => {
                  const updated = [...selectedProducts];
                  updated[i].quantity = parseInt(e.target.value) || 1;
                  setSelectedProducts(updated);
                }} />
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removeItem(i)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Hủy</Button>
          <Button onClick={handleSubmit} disabled={!supplierId || selectedProducts.length === 0}>Tạo đơn</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
