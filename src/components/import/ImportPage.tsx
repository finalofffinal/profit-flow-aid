import { useState, useMemo, useEffect } from 'react';
import { Search, Trash2, Plus, ChevronDown, ChevronRight, Lock, RotateCcw, Trash, X, Filter, Undo2, Calendar, FileDown, Wand2, Pencil, AlertTriangle, Shuffle, Eraser, Scale } from 'lucide-react';
import { ImportOrder, Supplier, Product, ImportTag, QuarterData } from '@/types';
import { formatVND, formatCompactVND } from '@/lib/currency';
import { IMPORT_TAG_LABELS, IMPORT_TAG_COLORS, QUARTER_FLOOR_RATIO, Q1_CEILING_RATIO, PARENT_UNITS, CHILD_UNITS } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
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
  onClearAutoOrders?: (q: number, y: number) => void;
  onGenerateAutoOrders?: (q: number, y: number, supplierId: string, count: number) => void;
  onRebalanceQuarter?: (q: number, y: number) => void;
}

export function ImportPage({ importOrders, activeOrders, deletedOrders, suppliers, products, addOrder, deleteOrder, restoreOrder, permanentDeleteOrder, addNotification, onUpdateOrderDate, onUpdateOrder, isQuarterLocked, quarters, onAutoReplenish, onClearAutoOrders, onGenerateAutoOrders, onRebalanceQuarter }: ImportPageProps) {
  const { quarter: selQ, year: selYear } = usePeriod();
  const [search, setSearch] = useState('');
  const [showTrash, setShowTrash] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const [tagFilter, setTagFilter] = useState<string>('all');
  const [supplierFilter, setSupplierFilter] = useState<string>('all');
  const [undoStack, setUndoStack] = useState<{ action: string; data: any; label?: string }[]>([]);
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>('quarter');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [showGenAuto, setShowGenAuto] = useState(false);
  const [genSupplierId, setGenSupplierId] = useState<string>('');
  const [genCount, setGenCount] = useState<number>(1);

  const currentQLocked = isQuarterLocked ? isQuarterLocked(selQ, selYear) : false;
  const currentQuarter = quarters?.find(q => q.quarter === selQ && q.year === selYear);

  const timeFiltered = useMemo(() => {
    return filterByTimeRange(activeOrders, timeRange, selQ, selYear, customFrom, customTo);
  }, [activeOrders, timeRange, selQ, selYear, customFrom, customTo]);

  const handleExportPdf = () => {
    exportImportPdf(importOrders, products, selQ, selYear);
    addNotification(`Đã xuất PDF Nhập hàng Q${selQ}/${selYear}`, 'success');
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
      setUndoStack(prev => [...prev, { action: 'delete_order', data: id, label: `đơn nhập ${order.supplierName}` }].slice(-20));
      addNotification(`Đã xóa đơn nhập ${order.supplierName} · Ctrl+Z để hoàn tác`, 'info');
    }
  };

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const last = undoStack[undoStack.length - 1];
    if (last.action === 'delete_order') {
      restoreOrder(last.data);
    }
    setUndoStack(prev => prev.slice(0, -1));
    addNotification(`Đã hoàn tác: ${last.label || 'hành động'}`, 'success');
  };

  // Ctrl+Z keyboard shortcut
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && undoStack.length > 0) {
        e.preventDefault();
        handleUndo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undoStack]);

  const handleDateChange = (orderId: string, newDate: string) => {
    if (onUpdateOrderDate) {
      onUpdateOrderDate(orderId, newDate);
      addNotification('Đã cập nhật ngày đơn hàng', 'info');
    }
    setEditingDate(null);
  };

  // ===== Cảnh báo nhập thiếu so với doanh thu cần tạo =====
  // Tổng nhập trong quý hiện tại / Doanh thu mục tiêu Q. Chuẩn: 80–115%.
  const currentQTotalImport = useMemo(() => {
    return activeOrders.filter(o => {
      const d = new Date(o.date);
      return Math.ceil((d.getMonth() + 1) / 3) === selQ && d.getFullYear() === selYear;
    }).reduce((s, o) => s + o.total, 0);
  }, [activeOrders, selQ, selYear]);

  const targetRev = currentQuarter?.targetRevenue || 0;
  const floorRatio = QUARTER_FLOOR_RATIO[selQ] ?? 1.0;
  const ceilingRatio = selQ === 1 ? Q1_CEILING_RATIO : Infinity;
  const importRatio = targetRev > 0 ? currentQTotalImport / targetRev : 1;
  const minImportNeeded = targetRev * floorRatio;
  const isShort = targetRev > 0 && currentQTotalImport < minImportNeeded && !currentQLocked;
  const isOverCeiling = targetRev > 0 && currentQTotalImport > targetRev * ceilingRatio && !currentQLocked;
  const shortfall = Math.max(0, minImportNeeded - currentQTotalImport);

  const handleRebalance = () => {
    if (!onRebalanceQuarter) return;
    onRebalanceQuarter(selQ, selYear);
    addNotification(`Đang cân bằng lại Q${selQ}/${selYear} (giữ thủ công + đơn đã khóa)`, 'success');
  };

  const totalImport = filteredOrders.reduce((s, o) => s + o.total, 0);

  const [showFilters, setShowFilters] = useState(false); // mobile: filters hidden by default

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b-2 border-primary/20 p-2 md:p-3 space-y-1.5 md:space-y-2">
        {/* Row 1: Title + count + primary actions */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <h2 className="text-sm md:text-base font-bold">Nhập hàng</h2>
          <Badge variant="outline" className="font-bold text-[10px] md:text-xs h-5">{filteredOrders.length} đơn</Badge>
          <span className="text-[11px] md:text-xs text-muted-foreground hidden md:inline">· {formatVND(totalImport)}</span>
          <div className="flex-1" />
          {undoStack.length > 0 && (
            <Button size="sm" variant="ghost" className="h-7 md:h-8 text-xs px-1.5" onClick={handleUndo} title="Ctrl+Z">
              <Undo2 className="h-3.5 w-3.5 md:mr-1" />
              <span className="hidden md:inline">Hoàn tác ({undoStack.length})</span>
            </Button>
          )}
          {/* Mobile: filter toggle */}
          <Button size="sm" variant="outline" className="h-7 md:h-8 text-xs px-2 md:hidden" onClick={() => setShowFilters(!showFilters)}>
            <Filter className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="outline" className="h-7 md:h-8 text-xs px-2" onClick={handleExportPdf}>
            <FileDown className="h-3.5 w-3.5 md:mr-1" />
            <span className="hidden md:inline">PDF Q{selQ}/{selYear}</span>
          </Button>
          {onAutoReplenish && !currentQLocked && (
            <Button data-admin-only size="sm" variant="outline" className="h-7 md:h-8 text-xs px-2" onClick={() => onAutoReplenish(selQ, selYear)} title="Tạo ngẫu nhiên đơn auto">
              <Shuffle className="h-3.5 w-3.5 md:mr-1" />
              <span className="hidden md:inline">Ngẫu nhiên</span>
            </Button>
          )}
          {onGenerateAutoOrders && !currentQLocked && (
            <Button data-admin-only size="sm" variant="outline" className="h-7 md:h-8 text-xs px-2" onClick={() => { setGenSupplierId(suppliers[0]?.id || ''); setGenCount(1); setShowGenAuto(true); }} title="Tạo thêm đơn tự động (bỏ qua giới hạn số đơn của NCC)">
              <Wand2 className="h-3.5 w-3.5 md:mr-1" />
              <span className="hidden md:inline">Tạo đơn tự động</span>
            </Button>
          )}
          {/* Đã bỏ nút "Xóa auto" theo spec mới */}
          <Button data-admin-only size="sm" variant="outline" className="h-7 md:h-8 text-xs px-2 relative" onClick={() => setShowTrash(true)}>
            <Trash2 className="h-3.5 w-3.5" />
            {deletedOrders.length > 0 && <Badge className="ml-1 h-4 px-1 text-[10px] bg-destructive text-destructive-foreground">{deletedOrders.length}</Badge>}
          </Button>
          <Button data-admin-only size="sm" className="h-7 md:h-8 text-xs px-2" onClick={() => {
            if (currentQLocked) { addNotification(`Quý ${selQ}/${selYear} đã khóa, không thể thêm đơn`, 'warning'); return; }
            setShowAdd(true);
          }} disabled={currentQLocked}>
            <Plus className="h-3.5 w-3.5 md:mr-1" />
            <span className="hidden md:inline">Thêm đơn</span>
          </Button>
        </div>

        {currentQLocked && (
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 px-2 py-1 text-[11px] text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
            <Lock className="h-3.5 w-3.5" /> Quý {selQ}/{selYear} đã khóa - chỉ xem
          </div>
        )}

        {isShort && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/30 px-2 py-1.5 text-[11px] flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-destructive">Nhập Q{selQ} thiếu ({Math.round(importRatio * 100)}%)</div>
              <div className="text-muted-foreground truncate">
                {formatCompactVND(currentQTotalImport)} / {formatCompactVND(targetRev)} · thiếu ~{formatCompactVND(shortfall)}
              </div>
            </div>
            {onRebalanceQuarter && (
              <Button size="sm" className="h-7 text-xs shrink-0 px-2" onClick={handleRebalance}>
                <Scale className="mr-1 h-3.5 w-3.5" /> Cân bằng
              </Button>
            )}
          </div>
        )}

        {/* Filters: desktop always shown, mobile toggleable */}
        <div className={`${showFilters ? 'block' : 'hidden'} md:block space-y-1.5`}>
          <TimeRangeFilter
            value={timeRange} onChange={setTimeRange}
            customFrom={customFrom} onCustomFromChange={setCustomFrom}
            customTo={customTo} onCustomToChange={setCustomTo}
          />

          <div className="flex items-center gap-1.5">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-7 h-8 text-xs" placeholder="Tìm NCC, sản phẩm..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Select value={tagFilter} onValueChange={setTagFilter}>
              <SelectTrigger className="w-[80px] md:w-28 h-8 text-xs px-2"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tag</SelectItem>
                <SelectItem value="auto">⚪ Tự động</SelectItem>
                <SelectItem value="supplementary">🟡 Bổ sung</SelectItem>
              </SelectContent>
            </Select>
            <Select value={supplierFilter} onValueChange={setSupplierFilter}>
              <SelectTrigger className="w-[80px] md:w-28 h-8 text-xs px-2"><SelectValue placeholder="NCC" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả NCC</SelectItem>
                {suppliers.filter(s => !s.deletedAt).map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Compact summary: mobile shows in 1 line */}
        <div className="flex items-center gap-2 text-[10px] md:text-xs text-muted-foreground flex-wrap">
          <span className="md:hidden">Σ <span className="font-bold text-foreground">{formatCompactVND(totalImport)}</span></span>
          {targetRev > 0 && !currentQLocked && (
            <span>Tỉ lệ: <span className={`font-bold ${importRatio < 0.80 ? 'text-destructive' : importRatio > 1.20 ? 'text-amber-600' : 'text-emerald-600'}`}>{Math.round(importRatio * 100)}%</span></span>
          )}
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
                  <div key={order.id} className={`rounded-xl border shadow-sm overflow-hidden ${order.tag === 'supplementary' ? 'border-amber-500/30' : 'border-border'}`}>
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
                      {!currentQLocked && (
                        <div data-admin-only className="flex items-center gap-0.5 shrink-0">
                          {/* Khóa đơn auto → chuyển thành "Bổ sung" để không bị ảnh hưởng bởi Ngẫu nhiên */}
                          {order.tag === 'auto' && onUpdateOrder && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={e => {
                                e.stopPropagation();
                                onUpdateOrder(order.id, { tag: 'supplementary', locked: false });
                                addNotification('Đã khóa đơn — chuyển thành Bổ sung, không bị Ngẫu nhiên tác động', 'info');
                              }}
                              title="Khóa đơn (chuyển thành Bổ sung — Ngẫu nhiên sẽ giữ nguyên)"
                            >
                              <Lock className="h-3.5 w-3.5 text-muted-foreground/50" />
                            </Button>
                          )}
                          {order.tag !== 'auto' && onUpdateOrder && (
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={e => { e.stopPropagation(); setEditingOrderId(order.id); }}>
                              <Pencil className="h-3.5 w-3.5 text-primary" />
                            </Button>
                          )}
                          {!order.locked && (
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={e => { e.stopPropagation(); handleDeleteOrder(order.id); }} title={order.tag === 'auto' ? 'Xóa đơn tự động này' : 'Xóa đơn'}>
                              <Trash className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          )}
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
                        {(order.discount && order.discount > 0) || order.vat ? (
                          <>
                            <div className="flex justify-between text-xs text-muted-foreground pt-1 border-t border-border">
                              <span>Tạm tính</span>
                              <span>{formatVND(order.items.reduce((s, it) => s + it.total, 0))}</span>
                            </div>
                            {order.vat ? (
                              <div className="flex justify-between text-xs text-blue-600">
                                <span>Thuế GTGT (8%)</span>
                                <span>+ {formatVND(order.vat)}</span>
                              </div>
                            ) : null}
                            {order.discount && order.discount > 0 ? (
                              <div className="flex justify-between text-xs text-amber-600">
                                <span>Chiết khấu</span>
                                <span>− {formatVND(order.discount)}</span>
                              </div>
                            ) : null}
                          </>
                        ) : null}
                        <div className={`flex justify-end ${(order.discount && order.discount > 0) || order.vat ? '' : 'pt-1 border-t border-border'} text-xs font-bold text-primary`}>
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

      {/* Generate Auto Orders Dialog */}
      <Dialog open={showGenAuto} onOpenChange={setShowGenAuto}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Tạo đơn tự động bổ sung</DialogTitle>
            <DialogDescription>
              Tạo thêm đơn tự động cho 1 nhà cung cấp trong Q{selQ}/{selYear}.
              Không bị giới hạn số đơn tối đa/quý của NCC.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Nhà cung cấp</Label>
              <Select value={genSupplierId} onValueChange={setGenSupplierId}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Chọn NCC" /></SelectTrigger>
                <SelectContent>
                  {suppliers.filter(s => !s.deletedAt).map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Số đơn cần tạo</Label>
              <Input
                type="number"
                min={1}
                max={50}
                value={genCount}
                onChange={e => setGenCount(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
                className="h-9"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGenAuto(false)}>Hủy</Button>
            <Button
              onClick={() => {
                if (!genSupplierId || !onGenerateAutoOrders) return;
                onGenerateAutoOrders(selQ, selYear, genSupplierId, genCount);
                setShowGenAuto(false);
              }}
              disabled={!genSupplierId}
            >
              Tạo {genCount} đơn
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Item shape inside Add dialog: supports a one-time "ad-hoc" product NOT in catalog
type AddItem = {
  productId: string;       // empty = unset; 'custom' = ad-hoc
  quantity: number;
  buyPrice?: number;
  // Ad-hoc only fields:
  customName?: string;
  customUnit?: string;
  customConversionUnit?: string;
  customConversionRate?: number;
  customSellPrice?: number;
};




function AddImportDialog({ open, onClose, suppliers, products, onSubmit }: {
  open: boolean; onClose: () => void;
  suppliers: Supplier[]; products: Product[];
  onSubmit: (order: Omit<ImportOrder, 'id' | 'createdAt' | 'deletedAt'>) => void;
}) {
  const [supplierId, setSupplierId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const tag: ImportTag = 'supplementary';
  const [selectedProducts, setSelectedProducts] = useState<AddItem[]>([]);
  const [discountInput, setDiscountInput] = useState('');
  const [hasVat, setHasVat] = useState(false);

  const supplierProducts = useMemo(() => products.filter(p => !p.deletedAt && p.supplierId === supplierId), [products, supplierId]);

  const getLine = (sp: AddItem): { price: number; total: number; valid: boolean } => {
    if (sp.productId === 'custom') {
      const price = sp.buyPrice ?? 0;
      return { price, total: price * sp.quantity, valid: !!sp.customName && price > 0 && sp.quantity > 0 };
    }
    const product = products.find(p => p.id === sp.productId);
    if (!product) return { price: 0, total: 0, valid: false };
    const price = sp.buyPrice ?? product.buyPrice;
    return { price, total: price * sp.quantity, valid: true };
  };

  const subtotal = useMemo(
    () => selectedProducts.reduce((s, sp) => s + getLine(sp).total, 0),
    [selectedProducts, products],
  );

  const vat = useMemo(() => hasVat ? Math.round(subtotal * 0.08) : 0, [hasVat, subtotal]);

  const discount = useMemo(() => {
    const v = parseFloat(discountInput.replace(/,/g, '.'));
    if (isNaN(v) || v <= 0) return 0;
    return Math.round(v * 1000);
  }, [discountInput]);

  const orderTotal = Math.max(0, subtotal + vat - discount);

  const addItem = () => setSelectedProducts(prev => [...prev, { productId: '', quantity: 1 }]);
  const removeItem = (i: number) => setSelectedProducts(prev => prev.filter((_, idx) => idx !== i));

  const handleSubmit = () => {
    const supplier = suppliers.find(s => s.id === supplierId);
    if (!supplier) return;
    const items: ImportOrder['items'] = selectedProducts
      .map(sp => {
        const line = getLine(sp);
        if (!line.valid || sp.quantity <= 0) return null;
        if (sp.productId === 'custom') {
          return {
            productId: `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
            productName: sp.customName!.trim(),
            supplierId: supplier.id,
            supplierName: supplier.name,
            unit: (sp.customUnit || 'cái').trim(),
            conversionUnit: (sp.customConversionUnit || sp.customUnit || 'cái').trim(),
            conversionRate: sp.customConversionRate && sp.customConversionRate > 0 ? sp.customConversionRate : 1,
            quantity: Math.max(1, sp.quantity),
            buyPrice: line.price,
            total: line.price * Math.max(1, sp.quantity),
          };
        }
        const product = products.find(p => p.id === sp.productId)!;
        return {
          productId: product.id, productName: product.name,
          supplierId: product.supplierId, supplierName: supplier.name,
          unit: product.unit, conversionUnit: product.conversionUnit || product.unit,
          conversionRate: product.conversionRate || 1,
          quantity: Math.max(1, sp.quantity),
          buyPrice: line.price,
          total: line.price * Math.max(1, sp.quantity),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    if (items.length === 0) return;
    const sub = items.reduce((s, it) => s + it.total, 0);
    const vatAmt = hasVat ? Math.round(sub * 0.08) : 0;
    onSubmit({
      supplierId, supplierName: supplier.name, date, items,
      total: Math.max(0, sub + vatAmt - discount),
      discount: discount > 0 ? discount : undefined,
      hasVat,
      vat: vatAmt > 0 ? vatAmt : undefined,
      tag, locked: false, images: [],
    });
    onClose();
    setSupplierId('');
    setSelectedProducts([]);
    setDiscountInput('');
    setHasVat(false);
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Thêm đơn nhập (Bổ sung)</DialogTitle>
          <DialogDescription>Sửa giá nhập từng SP, thêm SP ngoài danh mục, VAT 8% và chiết khấu</DialogDescription>
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

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-bold">Sản phẩm</Label>
              <Button variant="outline" size="sm" onClick={addItem} disabled={!supplierId}><Plus className="mr-1 h-3 w-3" /> Thêm SP</Button>
            </div>
            {selectedProducts.map((sp, i) => {
              const isCustom = sp.productId === 'custom';
              const prod = isCustom ? null : products.find(p => p.id === sp.productId);
              const { price, total: lineTotal } = getLine(sp);
              return (
                <div key={i} className="space-y-1.5 rounded-lg border p-2">
                  <div className="flex items-center gap-2">
                    <Select value={sp.productId} onValueChange={v => {
                      const u = [...selectedProducts];
                      if (v === 'custom') {
                        u[i] = { ...u[i], productId: 'custom', buyPrice: 0, customName: '', customUnit: 'cái', customConversionUnit: 'cái', customConversionRate: 1, customSellPrice: 0 };
                      } else {
                        const p = products.find(pp => pp.id === v);
                        u[i] = { productId: v, quantity: u[i].quantity, buyPrice: p?.buyPrice };
                      }
                      setSelectedProducts(u);
                    }}>
                      <SelectTrigger className="flex-1"><SelectValue placeholder="Chọn SP" /></SelectTrigger>
                      <SelectContent>
                        {supplierProducts.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                        <SelectItem value="custom">+ Sản phẩm mới (chỉ đơn này)</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removeItem(i)}><X className="h-3.5 w-3.5" /></Button>
                  </div>

                  {isCustom && (
                    <div className="space-y-1.5 p-2 rounded bg-muted/30 border border-dashed">
                      <Input className="h-8 text-xs" placeholder="Tên sản phẩm (vd: Nước mắm ABC)"
                        value={sp.customName || ''}
                        onChange={e => { const u = [...selectedProducts]; u[i].customName = e.target.value; setSelectedProducts(u); }} />
                      <div className="grid grid-cols-2 gap-2">
                        <Input className="h-8 text-xs" placeholder="Đơn vị lớn (vd: thùng)"
                          value={sp.customUnit || ''}
                          onChange={e => { const u = [...selectedProducts]; u[i].customUnit = e.target.value; setSelectedProducts(u); }} />
                        <Input className="h-8 text-xs" placeholder="Đơn vị bé (vd: chai)"
                          value={sp.customConversionUnit || ''}
                          onChange={e => { const u = [...selectedProducts]; u[i].customConversionUnit = e.target.value; setSelectedProducts(u); }} />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-[10px] text-muted-foreground">Qui đổi (1 lớn = ? bé)</Label>
                          <Input className="h-8 text-xs" type="number" min={1}
                            value={sp.customConversionRate ?? 1}
                            onChange={e => { const u = [...selectedProducts]; u[i].customConversionRate = Math.max(1, parseInt(e.target.value) || 1); setSelectedProducts(u); }} />
                        </div>
                        <div>
                          <Label className="text-[10px] text-muted-foreground">Giá bán/đv lớn (×1000)</Label>
                          <Input className="h-8 text-xs" type="text" inputMode="decimal"
                            value={(sp.customSellPrice ?? 0) > 0 ? ((sp.customSellPrice ?? 0) / 1000).toString() : ''}
                            onChange={e => {
                              const v = parseFloat(e.target.value.replace(/,/g, '.'));
                              const u = [...selectedProducts];
                              u[i].customSellPrice = isNaN(v) ? 0 : Math.round(v * 1000);
                              setSelectedProducts(u);
                            }} />
                        </div>
                      </div>
                    </div>
                  )}

                  {(prod || isCustom) && (
                    <div className="grid grid-cols-3 gap-2 items-center">
                      <div>
                        <Label className="text-[10px] text-muted-foreground">SL ({isCustom ? (sp.customUnit || 'đv') : prod?.unit})</Label>
                        <Input className="h-8 text-xs" type="number" min={1} value={sp.quantity}
                          onChange={e => { const u = [...selectedProducts]; u[i].quantity = Math.max(1, parseInt(e.target.value) || 1); setSelectedProducts(u); }} />
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Giá nhập (×1000)</Label>
                        <Input className="h-8 text-xs" type="text" inputMode="decimal"
                          value={price > 0 ? (price / 1000).toString() : ''}
                          onChange={e => {
                            const v = parseFloat(e.target.value.replace(/,/g, '.'));
                            const u = [...selectedProducts];
                            u[i].buyPrice = isNaN(v) ? 0 : Math.round(v * 1000);
                            setSelectedProducts(u);
                          }} />
                      </div>
                      <div className="text-right">
                        <Label className="text-[10px] text-muted-foreground">Thành tiền</Label>
                        <div className="text-xs font-bold tabular-nums text-primary truncate">{formatVND(lineTotal)}</div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {selectedProducts.length > 0 && (
              <div className="space-y-1.5 pt-2 border-t">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Tạm tính</span>
                  <span className="font-semibold">{formatVND(subtotal)}</span>
                </div>

                <div className="flex items-center justify-between gap-2 pt-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={hasVat} onCheckedChange={v => setHasVat(!!v)} />
                    <span className="text-xs">Thuế GTGT 8%</span>
                  </label>
                  <span className="text-xs font-semibold text-blue-600 tabular-nums">
                    {hasVat ? `+ ${formatVND(vat)}` : '—'}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs">Chiết khấu (×1000)</Label>
                  <Input className="h-8 text-xs w-32 text-right" type="text" inputMode="decimal"
                    placeholder="0" value={discountInput}
                    onChange={e => setDiscountInput(e.target.value)} />
                </div>
                {discount > 0 && (
                  <div className="flex justify-between text-xs text-amber-600">
                    <span>Giảm giá</span>
                    <span>− {formatVND(discount)}</span>
                  </div>
                )}
                <div className="flex justify-end pt-1 border-t text-sm font-bold text-primary">
                  Tổng đơn: {formatVND(orderTotal)}
                </div>
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
  const isAuto = order.tag === 'auto';
  const [date, setDate] = useState(order.date.split('T')[0]);
  const [supplierId, setSupplierId] = useState(order.supplierId);
  const [items, setItems] = useState(order.items.map(it => ({
    productId: it.productId,
    quantity: it.quantity,
    buyPrice: it.buyPrice,
  })));
  const [discountInput, setDiscountInput] = useState(
    order.discount && order.discount > 0 ? (order.discount / 1000).toString() : ''
  );

  const supplierProducts = useMemo(() => products.filter(p => !p.deletedAt && p.supplierId === supplierId), [products, supplierId]);

  const subtotal = useMemo(() => items.reduce((s, it) => {
    const p = products.find(pp => pp.id === it.productId);
    if (!p) return s;
    // Đơn auto LUÔN dùng baseBuyPrice từ catalog. Đơn bổ sung dùng giá đã sửa (nếu có).
    const price = isAuto ? (p.baseBuyPrice ?? p.buyPrice) : (it.buyPrice ?? p.buyPrice);
    return s + price * it.quantity;
  }, 0), [items, products, isAuto]);

  const discount = useMemo(() => {
    if (isAuto) return 0;
    const v = parseFloat(discountInput.replace(/,/g, '.'));
    if (isNaN(v) || v <= 0) return 0;
    return Math.round(v * 1000);
  }, [discountInput, isAuto]);

  const total = Math.max(0, subtotal - discount);

  const handleSubmit = () => {
    const supplier = suppliers.find(s => s.id === supplierId);
    if (!supplier) return;
    const newItems: ImportOrder['items'] = items
      .filter(it => it.productId && it.quantity > 0)
      .map(it => {
        const p = products.find(pp => pp.id === it.productId)!;
        const price = isAuto ? (p.baseBuyPrice ?? p.buyPrice) : (it.buyPrice ?? p.buyPrice);
        return {
          productId: p.id, productName: p.name,
          supplierId: p.supplierId, supplierName: supplier.name,
          unit: p.unit, conversionUnit: p.conversionUnit || p.unit,
          conversionRate: p.conversionRate || 1,
          quantity: it.quantity, buyPrice: price,
          total: price * it.quantity,
        };
      });
    if (newItems.length === 0) return;
    onSubmit({
      date, supplierId, supplierName: supplier.name,
      items: newItems,
      discount: !isAuto && discount > 0 ? discount : undefined,
    });
  };

  return (
    <Dialog open={true} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Sửa đơn nhập {isAuto ? '(Tự động)' : '(Bổ sung)'}</DialogTitle>
          <DialogDescription>
            {isAuto
              ? 'Đơn tự động dùng giá nhập từ tab Danh mục, không sửa được giá hay chiết khấu'
              : 'Có thể sửa giá nhập từng sản phẩm và chiết khấu'}
          </DialogDescription>
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
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-bold">Sản phẩm ({items.length})</Label>
              <Button variant="outline" size="sm" onClick={() => setItems(prev => [...prev, { productId: '', quantity: 1, buyPrice: 0 }])} disabled={!supplierId}>
                <Plus className="mr-1 h-3 w-3" /> Thêm SP
              </Button>
            </div>
            {items.map((it, i) => {
              const prod = products.find(p => p.id === it.productId);
              const price = isAuto
                ? (prod?.baseBuyPrice ?? prod?.buyPrice ?? 0)
                : (it.buyPrice ?? prod?.buyPrice ?? 0);
              const lineTotal = price * it.quantity;
              return (
                <div key={i} className="space-y-1.5 rounded-lg border p-2">
                  <div className="flex items-center gap-2">
                    <Select value={it.productId} onValueChange={v => {
                      const u = [...items];
                      const p = products.find(pp => pp.id === v);
                      u[i] = { ...u[i], productId: v, buyPrice: p?.buyPrice ?? 0 };
                      setItems(u);
                    }}>
                      <SelectTrigger className="flex-1"><SelectValue placeholder="Chọn SP" /></SelectTrigger>
                      <SelectContent>{supplierProducts.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                    </Select>
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0"
                      onClick={() => setItems(prev => prev.filter((_, idx) => idx !== i))}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {prod && (
                    <div className="grid grid-cols-3 gap-2 items-center">
                      <div>
                        <Label className="text-[10px] text-muted-foreground">SL</Label>
                        <Input className="h-8 text-xs" type="number" min={1} value={it.quantity}
                          onChange={e => { const u = [...items]; u[i].quantity = Math.max(1, parseInt(e.target.value) || 1); setItems(u); }} />
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Giá nhập (×1000)</Label>
                        <Input className="h-8 text-xs" type="text" inputMode="decimal"
                          disabled={isAuto}
                          value={price > 0 ? (price / 1000).toString() : ''}
                          onChange={e => {
                            const v = parseFloat(e.target.value.replace(/,/g, '.'));
                            const u = [...items];
                            u[i].buyPrice = isNaN(v) ? 0 : Math.round(v * 1000);
                            setItems(u);
                          }} />
                      </div>
                      <div className="text-right">
                        <Label className="text-[10px] text-muted-foreground">Thành tiền</Label>
                        <div className="text-xs font-bold tabular-nums text-primary truncate">{formatVND(lineTotal)}</div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {items.length > 0 && (
              <div className="space-y-1.5 pt-2 border-t">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Tạm tính</span>
                  <span className="font-semibold">{formatVND(subtotal)}</span>
                </div>
                {!isAuto && (
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-xs">Chiết khấu (×1000)</Label>
                    <Input className="h-8 text-xs w-32 text-right" type="text" inputMode="decimal"
                      placeholder="0" value={discountInput}
                      onChange={e => setDiscountInput(e.target.value)} />
                  </div>
                )}
                {discount > 0 && (
                  <div className="flex justify-between text-xs text-amber-600">
                    <span>Giảm giá</span>
                    <span>− {formatVND(discount)}</span>
                  </div>
                )}
                <div className="flex justify-end pt-1 border-t text-sm font-bold text-primary">
                  Tổng: {formatVND(total)}
                </div>
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
