import { useState, useMemo } from 'react';
import { Search, Trash2, Plus, ChevronDown, ChevronRight, Lock, RotateCcw, Trash, X, Filter, Undo2, Shuffle, Camera } from 'lucide-react';
import { ImportOrder, Supplier, Product, ImportTag } from '@/types';
import { formatVND, formatCompactVND } from '@/lib/currency';
import { IMPORT_TAG_LABELS, IMPORT_TAG_COLORS } from '@/lib/constants';
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

type TimeRange = 'all' | 'today' | 'week' | 'month' | 'quarter' | 'custom';

export function ImportPage({ activeOrders, deletedOrders, suppliers, products, addOrder, deleteOrder, restoreOrder, permanentDeleteOrder, addNotification }: ImportPageProps) {
  const [search, setSearch] = useState('');
  const [showTrash, setShowTrash] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const [tagFilter, setTagFilter] = useState<string>('all');
  const [supplierFilter, setSupplierFilter] = useState<string>('all');
  const [timeRange, setTimeRange] = useState<TimeRange>('quarter');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [undoStack, setUndoStack] = useState<{ action: string; data: any }[]>([]);

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

  const filteredOrders = useMemo(() => {
    let list = timeFiltered;
    if (tagFilter !== 'all') list = list.filter(o => o.tag === tagFilter);
    if (supplierFilter !== 'all') list = list.filter(o => o.supplierId === supplierFilter);
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(o =>
      o.supplierName.toLowerCase().includes(q) ||
      o.items.some(it => it.productName.toLowerCase().includes(q)) ||
      o.date.includes(q)
    );
  }, [timeFiltered, search, tagFilter, supplierFilter]);

  // Group by quarter
  const groupedByQuarter = useMemo(() => {
    const map = new Map<string, ImportOrder[]>();
    const sorted = [...filteredOrders].sort((a, b) => a.date.localeCompare(b.date));
    sorted.forEach(o => {
      const d = new Date(o.date);
      const q = Math.ceil((d.getMonth() + 1) / 3);
      const key = `Q${q}/${d.getFullYear()}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(o);
    });
    return map;
  }, [filteredOrders]);

  const toggleExpand = (id: string) => {
    setExpandedOrders(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const handleDeleteOrder = (id: string) => {
    const order = activeOrders.find(o => o.id === id);
    deleteOrder(id);
    if (order) {
      setUndoStack(prev => [...prev, { action: 'delete_order', data: id }]);
      addNotification(`Đã xóa đơn nhập ${order.supplierName}`, 'info');
    }
  };

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const last = undoStack[undoStack.length - 1];
    if (last.action === 'delete_order') {
      restoreOrder(last.data);
    }
    setUndoStack(prev => prev.slice(0, -1));
    addNotification('Đã hoàn tác', 'info');
  };

  const totalImport = filteredOrders.reduce((s, o) => s + o.total, 0);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b-2 border-primary/20 p-3 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-base font-bold">Nhập hàng</h2>
          <Badge variant="outline" className="font-bold">{filteredOrders.length} đơn</Badge>
          <div className="flex-1" />
          {undoStack.length > 0 && (
            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={handleUndo}>
              <Undo2 className="mr-1 h-3.5 w-3.5" /> Hoàn tác
            </Button>
          )}
          <Button size="sm" variant="outline" className="h-8 text-xs relative" onClick={() => setShowTrash(true)}>
            <Trash2 className="mr-1 h-3.5 w-3.5" />
            {deletedOrders.length > 0 && <Badge className="ml-1 h-4 px-1 text-[10px] bg-destructive text-destructive-foreground">{deletedOrders.length}</Badge>}
          </Button>
          <Button size="sm" className="h-8 text-xs" onClick={() => setShowAdd(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Thêm đơn nhập
          </Button>
        </div>

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

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8 h-8" placeholder="Tìm NCC, sản phẩm, ngày..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Select value={tagFilter} onValueChange={setTagFilter}>
            <SelectTrigger className="w-28 h-8"><Filter className="mr-1 h-3 w-3" /><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả tag</SelectItem>
              <SelectItem value="auto">⚪ Tự động</SelectItem>
              <SelectItem value="special">🔴 Đặc biệt</SelectItem>
              <SelectItem value="supplementary">🟡 Bổ sung</SelectItem>
              <SelectItem value="upgraded">🔵 Nâng cấp</SelectItem>
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

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>Tổng nhập: <span className="font-bold text-foreground">{formatVND(totalImport)}</span></span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4 pb-20 lg:pb-4">
        {Array.from(groupedByQuarter.entries()).map(([qLabel, orders]) => (
          <div key={qLabel}>
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline" className="font-bold text-sm">{qLabel}</Badge>
              <span className="text-xs text-muted-foreground">{orders.length} đơn · {formatVND(orders.reduce((s, o) => s + o.total, 0))}</span>
            </div>
            <div className="space-y-2">
              {orders.map(order => {
                const isExpanded = expandedOrders.has(order.id);
                const tagColor = IMPORT_TAG_COLORS[order.tag] || IMPORT_TAG_COLORS.auto;
                const tagLabel = IMPORT_TAG_LABELS[order.tag] || 'Tự động';
                return (
                  <div key={order.id} className={`rounded-xl border shadow-sm overflow-hidden ${order.tag === 'special' ? 'border-destructive/30' : order.tag === 'supplementary' ? 'border-amber-500/30' : order.tag === 'upgraded' ? 'border-blue-600/30' : 'border-border'}`}>
                    <button className="flex w-full items-center gap-2 p-3 text-left hover:bg-muted/30 transition-colors" onClick={() => toggleExpand(order.id)}>
                      {isExpanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm truncate">{order.supplierName}</span>
                          <Badge className={`text-[10px] ${tagColor}`}>{tagLabel}</Badge>
                          {order.locked && <Lock className="h-3 w-3 text-muted-foreground" />}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {new Date(order.date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })} · {order.items.length} SP · {formatVND(order.total)}
                        </p>
                      </div>
                      {order.tag !== 'auto' && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={e => { e.stopPropagation(); handleDeleteOrder(order.id); }}>
                          <Trash className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      )}
                    </button>
                    {isExpanded && (
                      <div className="border-t border-border p-3 space-y-1.5 animate-in slide-in-from-top-1">
                        {order.items.map((item, i) => (
                          <div key={i} className="flex items-center justify-between text-xs">
                            <div className="min-w-0">
                              <span className="font-medium">{item.productName}</span>
                              <span className="text-muted-foreground ml-1">×{item.quantity} {item.unit}</span>
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
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => restoreOrder(o.id)}><RotateCcw className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => permanentDeleteOrder(o.id)}><Trash className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Import Dialog */}
      <AddImportDialog open={showAdd} onClose={() => setShowAdd(false)} suppliers={suppliers.filter(s => !s.deletedAt)} products={products} onSubmit={(order) => { addOrder(order); addNotification(`Đã thêm đơn nhập từ ${order.supplierName}`, 'info'); }} />
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
  const [tag, setTag] = useState<ImportTag>('special');
  const [selectedProducts, setSelectedProducts] = useState<{ productId: string; quantity: number }[]>([]);
  const [images, setImages] = useState<string[]>([]);

  const supplierProducts = useMemo(() => products.filter(p => !p.deletedAt && p.supplierId === supplierId), [products, supplierId]);

  const addItem = () => setSelectedProducts(prev => [...prev, { productId: '', quantity: 1 }]);
  const removeItem = (i: number) => setSelectedProducts(prev => prev.filter((_, idx) => idx !== i));

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).slice(0, 5 - images.length).forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        setImages(prev => [...prev.slice(0, 4), result]);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleSubmit = () => {
    const supplier = suppliers.find(s => s.id === supplierId);
    if (!supplier) return;
    const items: ImportOrder['items'] = selectedProducts
      .filter(sp => sp.productId && sp.quantity > 0)
      .map(sp => {
        const product = products.find(p => p.id === sp.productId)!;
        return {
          productId: product.id, productName: product.name,
          supplierId: product.supplierId, supplierName: supplier.name,
          unit: product.unit, conversionUnit: product.conversionUnit || product.unit,
          conversionRate: product.conversionRate || 1,
          quantity: sp.quantity, buyPrice: product.buyPrice,
          total: product.buyPrice * sp.quantity,
        };
      });
    if (items.length === 0) return;
    onSubmit({
      supplierId, supplierName: supplier.name, date, items,
      total: items.reduce((s, it) => s + it.total, 0),
      tag, locked: false, images,
    });
    onClose();
    setSupplierId('');
    setSelectedProducts([]);
    setImages([]);
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Thêm đơn nhập hàng</DialogTitle>
          <DialogDescription>Chọn NCC và sản phẩm từ danh mục</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Nhà cung cấp</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Chọn NCC" /></SelectTrigger>
                <SelectContent>{suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Ngày nhập</Label>
              <Input className="mt-1" type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Tag đơn hàng</Label>
            <Select value={tag} onValueChange={v => setTag(v as ImportTag)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="special">🔴 Đặc biệt</SelectItem>
                <SelectItem value="supplementary">🟡 Bổ sung</SelectItem>
                <SelectItem value="upgraded">🔵 Nâng cấp</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Image upload for supplementary */}
          {tag === 'supplementary' && (
            <div className="space-y-2">
              <Label className="text-xs">Ảnh đính kèm (tối đa 5)</Label>
              <div className="flex gap-2 flex-wrap">
                {images.map((img, i) => (
                  <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border">
                    <img src={img} alt="" className="w-full h-full object-cover" />
                    <button className="absolute top-0 right-0 bg-destructive text-destructive-foreground rounded-bl p-0.5" onClick={() => setImages(prev => prev.filter((_, idx) => idx !== i))}>
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                {images.length < 5 && (
                  <label className="w-16 h-16 rounded-lg border-2 border-dashed border-muted-foreground/30 flex items-center justify-center cursor-pointer hover:border-primary/50 transition-colors">
                    <Camera className="h-5 w-5 text-muted-foreground" />
                    <input type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} />
                  </label>
                )}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-bold">Sản phẩm</Label>
              <Button variant="outline" size="sm" onClick={addItem} disabled={!supplierId}><Plus className="mr-1 h-3 w-3" /> Thêm SP</Button>
            </div>
            {selectedProducts.map((sp, i) => (
              <div key={i} className="flex items-center gap-2">
                <Select value={sp.productId} onValueChange={v => { const u = [...selectedProducts]; u[i].productId = v; setSelectedProducts(u); }}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder="Chọn SP" /></SelectTrigger>
                  <SelectContent>{supplierProducts.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
                <Input className="w-20" type="number" min={1} value={sp.quantity} onChange={e => { const u = [...selectedProducts]; u[i].quantity = parseInt(e.target.value) || 1; setSelectedProducts(u); }} />
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removeItem(i)}><X className="h-3.5 w-3.5" /></Button>
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
