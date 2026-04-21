import { useState, useMemo } from 'react';
import { Search, Trash2, Plus, ChevronDown, ChevronRight, Lock, RotateCcw, Trash, X, Filter, Undo2, Camera, Calendar, FileDown, Wand2, Pencil } from 'lucide-react';
import { ImportOrder, Supplier, Product, ImportTag, QuarterData } from '@/types';
import { formatVND, formatCompactVND } from '@/lib/currency';
import { IMPORT_TAG_LABELS, IMPORT_TAG_COLORS } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { usePeriod } from '@/contexts/PeriodContext';
import { TimeRangeFilter, TimeRange, filterByTimeRange } from '@/components/common/TimeRangeFilter';
import { exportImportPdf } from '@/lib/exportImportPdf';

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
  onUpdateOrderDate?: (id: string, newDate: string) => void;
  onUpdateOrder?: (id: string, updates: Partial<ImportOrder>) => void;
  isQuarterLocked?: (q: number, y: number) => boolean;
  quarters?: QuarterData[];
  onAutoReplenish?: (q: number, y: number) => void;
}

export function ImportPage({ importOrders, activeOrders, deletedOrders, suppliers, products, addOrder, deleteOrder, restoreOrder, permanentDeleteOrder, addNotification, onUpdateOrderDate, onUpdateOrder, isQuarterLocked, quarters, onAutoReplenish }: ImportPageProps) {
  const { quarter: selQ, year: selYear } = usePeriod();
  const [search, setSearch] = useState('');
  const [showTrash, setShowTrash] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const [tagFilter, setTagFilter] = useState<string>('all');
  const [supplierFilter, setSupplierFilter] = useState<string>('all');
  const [undoStack, setUndoStack] = useState<{ action: string; data: any }[]>([]);
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>('quarter');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const currentQLocked = isQuarterLocked ? isQuarterLocked(selQ, selYear) : false;
  const currentQuarter = quarters?.find(q => q.quarter === selQ && q.year === selYear);

  const timeFiltered = useMemo(() => {
    return filterByTimeRange(activeOrders, timeRange, selQ, selYear, customFrom, customTo);
  }, [activeOrders, timeRange, selQ, selYear, customFrom, customTo]);

  // Revenue gap detection: total nhập nên nằm trong dải 80–110% doanh thu mục tiêu.
  // Nếu < 70% target -> cảnh báo thiếu hàng tạo doanh thu.
  const revenueGap = useMemo(() => {
    if (!currentQuarter || currentQuarter.locked || currentQuarter.targetRevenue <= 0) return null;
    const qOrders = activeOrders.filter(o => {
      const d = new Date(o.date);
      return d.getFullYear() === selYear && Math.ceil((d.getMonth() + 1) / 3) === selQ;
    });
    const totalImport = qOrders.reduce((s, o) => s + o.total, 0);
    const expectedMinImport = currentQuarter.targetRevenue * 0.80; // dải dưới
    if (totalImport < expectedMinImport) {
      return { totalImport, expectedMinImport, target: currentQuarter.targetRevenue };
    }
    return null;
  }, [activeOrders, currentQuarter, selQ, selYear]);

  const handleExportPdf = () => {
    exportImportPdf(importOrders, products, selQ, selYear);
    addNotification(`Đã xuất PDF Nhập hàng Q${selQ}/${selYear}`, 'success');
  };

  const handleAutoReplenish = () => {
    if (currentQLocked) {
      // Replenish next non-locked quarter instead
      const nextQ = quarters?.find(q => !q.locked && (q.year > selYear || (q.year === selYear && q.quarter > selQ)));
      if (nextQ && onAutoReplenish) {
        onAutoReplenish(nextQ.quarter, nextQ.year);
        addNotification(`Đã chuyển bù sang Q${nextQ.quarter}/${nextQ.year} (quý này đã khóa)`, 'info');
      }
    } else if (onAutoReplenish) {
      onAutoReplenish(selQ, selYear);
      addNotification(`Đã tạo lại đơn nhập tự động cho Q${selQ}/${selYear}`, 'success');
    }
  };

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

  const handleDateChange = (orderId: string, newDate: string) => {
    if (onUpdateOrderDate) {
      onUpdateOrderDate(orderId, newDate);
      addNotification('Đã cập nhật ngày đơn hàng', 'info');
    }
    setEditingDate(null);
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
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={handleExportPdf}>
            <FileDown className="mr-1 h-3.5 w-3.5" /> PDF Q{selQ}/{selYear}
          </Button>
          <Button size="sm" variant="outline" className="h-8 text-xs relative" onClick={() => setShowTrash(true)}>
            <Trash2 className="mr-1 h-3.5 w-3.5" />
            {deletedOrders.length > 0 && <Badge className="ml-1 h-4 px-1 text-[10px] bg-destructive text-destructive-foreground">{deletedOrders.length}</Badge>}
          </Button>
          <Button size="sm" className="h-8 text-xs" onClick={() => {
            if (currentQLocked) { addNotification(`Quý ${selQ}/${selYear} đã khóa, không thể thêm đơn`, 'warning'); return; }
            setShowAdd(true);
          }} disabled={currentQLocked}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Thêm đơn nhập
          </Button>
        </div>

        {currentQLocked && (
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 px-2 py-1.5 text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
            <Lock className="h-3.5 w-3.5" /> Quý {selQ}/{selYear} đã khóa - chỉ xem
          </div>
        )}

        {revenueGap && onAutoReplenish && (
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 px-2 py-2 text-xs text-amber-800 dark:text-amber-300 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <Wand2 className="h-3.5 w-3.5 shrink-0" />
              <span>Hàng nhập không đủ tạo doanh thu Q{selQ} ({formatCompactVND(revenueGap.totalImport)} / cần ≥{formatCompactVND(revenueGap.expectedMinImport)})</span>
            </div>
            <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" onClick={handleAutoReplenish}>
              <Wand2 className="mr-1 h-3 w-3" /> Tạo bù
            </Button>
          </div>
        )}

        <TimeRangeFilter
          value={timeRange} onChange={setTimeRange}
          customFrom={customFrom} onCustomFromChange={setCustomFrom}
          customTo={customTo} onCustomToChange={setCustomTo}
        />

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
          <span>Tổng: <span className="font-bold text-foreground">{formatVND(totalImport)}</span></span>
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
                const isEditingThisDate = editingDate === order.id;

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
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          {isEditingThisDate && order.tag === 'auto' ? (
                            <Input
                              type="date"
                              className="h-6 w-32 text-xs px-1"
                              defaultValue={order.date.split('T')[0]}
                              onClick={e => e.stopPropagation()}
                              onBlur={e => handleDateChange(order.id, e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') handleDateChange(order.id, (e.target as HTMLInputElement).value); }}
                              autoFocus
                            />
                          ) : (
                            <span
                              className={order.tag === 'auto' ? 'cursor-pointer hover:text-primary' : ''}
                              onClick={e => {
                                if (order.tag === 'auto') {
                                  e.stopPropagation();
                                  setEditingDate(order.id);
                                }
                              }}
                            >
                              {new Date(order.date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}
                              {order.tag === 'auto' && <Calendar className="inline h-3 w-3 ml-1 opacity-50" />}
                            </span>
                          )}
                          <span>· {order.items.length} SP</span>
                          <span className="font-bold text-foreground">· {formatVND(order.total)}</span>
                        </div>
                      </div>
                      {order.tag !== 'auto' && !order.locked && !currentQLocked && (
                        <div className="flex items-center gap-0.5 shrink-0">
                          {onUpdateOrder && (
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={e => { e.stopPropagation(); setEditingOrderId(order.id); }}>
                              <Pencil className="h-3.5 w-3.5 text-primary" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={e => { e.stopPropagation(); handleDeleteOrder(order.id); }}>
                            <Trash className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
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
                        <div className="flex justify-end pt-1 border-t border-border text-xs font-bold text-primary">
                          Tổng đơn: {formatVND(order.total)}
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

      {/* Edit Import Dialog */}
      {editingOrderId && onUpdateOrder && (
        <EditImportDialog
          order={activeOrders.find(o => o.id === editingOrderId)!}
          products={products}
          suppliers={suppliers.filter(s => !s.deletedAt)}
          onClose={() => setEditingOrderId(null)}
          onSubmit={(updates) => {
            onUpdateOrder(editingOrderId, updates);
            addNotification(`Đã cập nhật đơn nhập`, 'info');
            setEditingOrderId(null);
          }}
        />
      )}
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

  const orderTotal = useMemo(() => {
    return selectedProducts.reduce((sum, sp) => {
      const product = products.find(p => p.id === sp.productId);
      if (!product) return sum;
      return sum + product.buyPrice * sp.quantity;
    }, 0);
  }, [selectedProducts, products]);

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
          quantity: Math.min(3, sp.quantity), // Max 3 units per product
          buyPrice: product.buyPrice,
          total: product.buyPrice * Math.min(3, sp.quantity),
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
          <DialogDescription>Chọn NCC và sản phẩm từ danh mục (tối đa 3 đơn vị lớn/SP)</DialogDescription>
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
                <Input className="w-20" type="number" min={1} max={3} value={sp.quantity} onChange={e => { const u = [...selectedProducts]; u[i].quantity = Math.min(3, parseInt(e.target.value) || 1); setSelectedProducts(u); }} />
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removeItem(i)}><X className="h-3.5 w-3.5" /></Button>
              </div>
            ))}

            {/* Order total */}
            {selectedProducts.length > 0 && (
              <div className="flex justify-end pt-2 border-t text-sm font-bold text-primary">
                Tổng đơn: {formatVND(orderTotal)}
              </div>
            )}
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

function EditImportDialog({ order, products, suppliers, onClose, onSubmit }: {
  order: ImportOrder;
  products: Product[];
  suppliers: Supplier[];
  onClose: () => void;
  onSubmit: (updates: Partial<ImportOrder>) => void;
}) {
  const [date, setDate] = useState(order.date.split('T')[0]);
  const [tag, setTag] = useState<ImportTag>(order.tag);
  const [supplierId, setSupplierId] = useState(order.supplierId);
  const [items, setItems] = useState(order.items.map(it => ({ productId: it.productId, quantity: it.quantity })));

  const supplierProducts = useMemo(() => products.filter(p => !p.deletedAt && p.supplierId === supplierId), [products, supplierId]);

  const total = useMemo(() => items.reduce((s, it) => {
    const p = products.find(pp => pp.id === it.productId);
    return s + (p ? p.buyPrice * it.quantity : 0);
  }, 0), [items, products]);

  const handleSubmit = () => {
    const supplier = suppliers.find(s => s.id === supplierId);
    if (!supplier) return;
    const newItems: ImportOrder['items'] = items
      .filter(it => it.productId && it.quantity > 0)
      .map(it => {
        const p = products.find(pp => pp.id === it.productId)!;
        return {
          productId: p.id, productName: p.name,
          supplierId: p.supplierId, supplierName: supplier.name,
          unit: p.unit, conversionUnit: p.conversionUnit || p.unit,
          conversionRate: p.conversionRate || 1,
          quantity: it.quantity, buyPrice: p.buyPrice,
          total: p.buyPrice * it.quantity,
        };
      });
    if (newItems.length === 0) return;
    onSubmit({
      date, tag, supplierId, supplierName: supplier.name,
      items: newItems,
    });
  };

  return (
    <Dialog open={true} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Sửa đơn nhập</DialogTitle>
          <DialogDescription>Chỉnh ngày, NCC, tag, sản phẩm và số lượng</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Nhà cung cấp</Label>
              <Select value={supplierId} onValueChange={(v) => { setSupplierId(v); setItems([]); }}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Ngày nhập</Label>
              <Input className="mt-1" type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Tag</Label>
            <Select value={tag} onValueChange={v => setTag(v as ImportTag)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="special">🔴 Đặc biệt</SelectItem>
                <SelectItem value="supplementary">🟡 Bổ sung</SelectItem>
                <SelectItem value="upgraded">🔵 Nâng cấp</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-bold">Sản phẩm ({items.length})</Label>
              <Button variant="outline" size="sm" onClick={() => setItems(prev => [...prev, { productId: '', quantity: 1 }])} disabled={!supplierId}>
                <Plus className="mr-1 h-3 w-3" /> Thêm SP
              </Button>
            </div>
            {items.map((it, i) => (
              <div key={i} className="flex items-center gap-2">
                <Select value={it.productId} onValueChange={v => { const u = [...items]; u[i].productId = v; setItems(u); }}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder="Chọn SP" /></SelectTrigger>
                  <SelectContent>{supplierProducts.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
                <Input className="w-20" type="number" min={1} value={it.quantity}
                  onChange={e => { const u = [...items]; u[i].quantity = Math.max(1, parseInt(e.target.value) || 1); setItems(u); }} />
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0"
                  onClick={() => setItems(prev => prev.filter((_, idx) => idx !== i))}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            {items.length > 0 && (
              <div className="flex justify-end pt-2 border-t text-sm font-bold text-primary">
                Tổng: {formatVND(total)}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Hủy</Button>
          <Button onClick={handleSubmit} disabled={!supplierId || items.length === 0}>Lưu</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
