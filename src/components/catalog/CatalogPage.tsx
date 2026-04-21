import { useState, useMemo, useCallback } from 'react';
import { Plus, Trash2, Search, ChevronDown, ChevronRight, GripVertical, Copy, Pencil, Trash, RotateCcw, Package, History, Undo2, Filter, Check, X } from 'lucide-react';
import { Product, Supplier } from '@/types';
import { formatVND, formatPriceForInput, parsePriceInput } from '@/lib/currency';
import { PARENT_UNITS, CHILD_UNITS } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface CatalogPageProps {
  products: Product[];
  activeProducts: Product[];
  deletedProducts: Product[];
  suppliers: Supplier[];
  addProduct: (p: Omit<Product, 'id' | 'stock' | 'priceHistory' | 'deletedAt' | 'createdAt' | 'updatedAt'>) => Product;
  updateProduct: (id: string, updates: Partial<Product>) => void;
  softDeleteProduct: (id: string) => void;
  restoreProduct: (id: string) => void;
  permanentDeleteProduct: (id: string) => void;
  moveProduct: (productId: string, newSupplierId: string) => void;
  copyProduct: (productId: string, targetSupplierId: string) => void;
  reorderProducts: (orderedIds: string[]) => void;
  updatePriceHistoryEntry: (productId: string, index: number, entry: { date: string; buyPrice: number }) => void;
  addSupplier: (name: string) => Supplier;
  updateSupplier: (id: string, name: string) => void;
  deleteSupplier: (id: string) => void;
  restoreSupplier: (id: string) => void;
  permanentDeleteSupplier: (id: string) => void;
  addNotification: (message: string, type: any) => void;
}

// ─── Product Form Dialog ──────────────────────────────────
function ProductFormDialog({
  open, onClose, suppliers, onSubmit, editProduct, allProducts,
}: {
  open: boolean; onClose: () => void; suppliers: Supplier[];
  onSubmit: (data: Omit<Product, 'id' | 'stock' | 'priceHistory' | 'deletedAt' | 'createdAt' | 'updatedAt'>) => void;
  editProduct?: Product; allProducts: Product[];
}) {
  const [name, setName] = useState(editProduct?.name ?? '');
  const [brand, setBrand] = useState(editProduct?.brand ?? '');
  const [supplierId, setSupplierId] = useState(editProduct?.supplierId ?? 'default-khac');
  const [unit, setUnit] = useState(editProduct?.unit ?? '');
  const [buyPrice, setBuyPrice] = useState(editProduct ? formatPriceForInput(editProduct.buyPrice) : '');
  const [sellPrice, setSellPrice] = useState(editProduct ? formatPriceForInput(editProduct.sellPrice) : '');
  const [notes, setNotes] = useState(editProduct?.notes ?? '');
  const [hasChild, setHasChild] = useState(editProduct ? (editProduct.conversionRate > 1) : false);
  const [convUnit, setConvUnit] = useState(editProduct?.conversionUnit ?? '');
  const [convRate, setConvRate] = useState(editProduct?.conversionRate > 1 ? editProduct.conversionRate.toString() : '');

  const buyVND = parsePriceInput(buyPrice);
  const sellVND = parsePriceInput(sellPrice);
  const rate = parseFloat(convRate) || 1;
  const childBuy = rate > 1 ? Math.round(buyVND / rate) : 0;
  const childSell = rate > 1 ? Math.round(sellVND / rate) : 0;
  const childProfit = childSell - childBuy;
  const childProfitPct = childBuy > 0 ? ((childProfit / childBuy) * 100).toFixed(1) : '0';
  const parentProfit = sellVND - buyVND;
  const parentProfitPct = buyVND > 0 ? ((parentProfit / buyVND) * 100).toFixed(1) : '0';

  // Brand autocomplete suggestions
  const brandSuggestions = useMemo(() => {
    const brands = new Set(allProducts.map(p => p.brand).filter(Boolean));
    return Array.from(brands);
  }, [allProducts]);

  // Auto-suggest for kg products
  const isKg = unit.toLowerCase().includes('kg');

  const handleSubmit = () => {
    onSubmit({
      name: name || 'Sản phẩm mới',
      brand,
      supplierId,
      unit,
      buyPrice: buyVND,
      sellPrice: sellVND,
      conversionRate: hasChild ? (parseFloat(convRate) || 1) : 1,
      conversionUnit: hasChild ? convUnit : '',
      netWeights: [],
      notes,
    });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editProduct ? 'Sửa sản phẩm' : 'Thêm sản phẩm mới'}</DialogTitle>
          <DialogDescription>Tất cả trường đều không bắt buộc</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* NCC */}
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nhà cung cấp</Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Chọn NCC (mặc định: Khác)" /></SelectTrigger>
              <SelectContent>
                {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Brand */}
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nhãn hàng</Label>
            <Input className="mt-1" value={brand} onChange={e => setBrand(e.target.value)} placeholder="Vinamilk, Chinsu..." list="brand-suggestions" />
            <datalist id="brand-suggestions">
              {brandSuggestions.map(b => <option key={b} value={b} />)}
            </datalist>
          </div>

          {/* Tên SP */}
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tên sản phẩm</Label>
            <Input className="mt-1" value={name} onChange={e => setName(e.target.value)} placeholder="Tương ớt 700ml..." />
          </div>

          {/* ═══ VÙNG 1: PARENT UNIT ═══ */}
          <div className="rounded-xl border-2 border-primary/20 bg-muted/30 p-3 space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">📦 Đơn vị lớn (Sỉ)</p>
            <div>
              <Label className="text-xs text-muted-foreground">Đơn vị</Label>
              <Input className="mt-1" value={unit} onChange={e => setUnit(e.target.value)} placeholder="Thùng, Lốc, Kg..." list="parent-units" />
              <datalist id="parent-units">
                {PARENT_UNITS.map(u => <option key={u} value={u} />)}
              </datalist>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-destructive font-semibold">Giá nhập (×1000) 🔴</Label>
                <Input className="mt-1 font-semibold" value={buyPrice} onChange={e => setBuyPrice(e.target.value)} placeholder="VD: 85.5" />
                {buyVND > 0 && <p className="mt-0.5 text-[10px] text-muted-foreground">= {formatVND(buyVND)}</p>}
              </div>
              <div>
                <Label className="text-xs text-destructive font-semibold">Giá bán (×1000) 🔴</Label>
                <Input className="mt-1 font-semibold" value={sellPrice} onChange={e => setSellPrice(e.target.value)} placeholder="VD: 100" />
                {sellVND > 0 && <p className="mt-0.5 text-[10px] text-muted-foreground">= {formatVND(sellVND)}</p>}
              </div>
            </div>
            {buyVND > 0 && sellVND > 0 && !hasChild && (
              <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-2 text-xs">
                <p className="font-bold text-emerald-600 dark:text-emerald-400">Lợi nhuận/{unit || 'đơn vị'}: {formatVND(parentProfit)} ({parentProfitPct}%)</p>
              </div>
            )}
          </div>

          {/* ═══ VÙNG 2: CHILD UNIT ═══ */}
          <div className="flex items-center gap-2">
            <Switch id="hasChild" checked={hasChild} onCheckedChange={setHasChild} />
            <Label htmlFor="hasChild" className="text-sm font-medium cursor-pointer">+ Thêm quy đổi bán lẻ</Label>
          </div>

          {hasChild && (
            <div className="rounded-xl border-2 border-emerald-500/20 bg-muted/30 p-3 space-y-3 animate-in slide-in-from-top-2">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">🏷️ Đơn vị nhỏ (Lẻ)</p>
              {isKg && (
                <div className="rounded-lg bg-blue-500/10 border border-blue-500/30 p-2 text-xs text-blue-600 dark:text-blue-400">
                  💡 Gợi ý: Đơn vị nhỏ = Lạng (100g), Quy cách = 10
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Tên đơn vị nhỏ</Label>
                  <Input className="mt-1" value={convUnit} onChange={e => setConvUnit(e.target.value)} placeholder="Chai, Gói..." list="child-units" />
                  <datalist id="child-units">
                    {CHILD_UNITS.map(u => <option key={u} value={u} />)}
                  </datalist>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Số lượng quy đổi</Label>
                  <Input className="mt-1" type="number" min="1" value={convRate} onChange={e => setConvRate(e.target.value)} placeholder="6" />
                </div>
              </div>
              {buyVND > 0 && rate > 1 && (
                <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-2 text-xs space-y-0.5">
                  <p>⇒ Giá lẻ nhập: <span className="font-semibold">{formatVND(childBuy)}</span> / {convUnit || '?'}</p>
                  <p>⇒ Giá lẻ bán: <span className="font-semibold">{formatVND(childSell)}</span> / {convUnit || '?'}</p>
                  <p className="font-bold text-emerald-600 dark:text-emerald-400">⇒ Lợi nhuận/{convUnit || '?'}: {formatVND(childProfit)} ({childProfitPct}%)</p>
                </div>
              )}
            </div>
          )}

          {/* Ghi chú */}
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ghi chú</Label>
            <Textarea className="mt-1" rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ghi chú thêm..." />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Hủy</Button>
          <Button onClick={handleSubmit}>{editProduct ? 'Lưu thay đổi' : 'Tạo sản phẩm'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Product Card (collapsed by default) ──────────────────
// ─── Sortable Product Card (drag-drop enabled) ───────────
function ProductCard({
  product, suppliers, onEdit, onDelete, onCopy, onCopySameSupplier, onHistoryView,
}: {
  product: Product; suppliers: Supplier[];
  onEdit: (p: Product) => void;
  onDelete: (id: string) => void;
  onCopy: (productId: string, targetSupplierId: string) => void;
  onCopySameSupplier: (productId: string) => void;
  onHistoryView: (p: Product) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: product.id });
  const [expanded, setExpanded] = useState(false);
  const rate = product.conversionRate || 1;
  const hasChild = rate > 1;
  const childBuy = hasChild ? Math.round(product.buyPrice / rate) : 0;
  const childSell = hasChild ? Math.round(product.sellPrice / rate) : 0;
  const childProfit = childSell - childBuy;
  const childProfitPct = childBuy > 0 ? ((childProfit / childBuy) * 100).toFixed(1) : '0';
  const parentProfit = product.sellPrice - product.buyPrice;
  const parentProfitPct = product.buyPrice > 0 ? ((parentProfit / product.buyPrice) * 100).toFixed(1) : '0';
  const otherSuppliers = suppliers.filter(s => s.id !== product.supplierId && !s.deletedAt);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : 'auto' as any,
  };

  return (
    <div ref={setNodeRef} style={style} className="rounded-xl border border-border bg-card shadow-sm hover:shadow-md transition-all">
      {/* Collapsed header */}
      <div className="flex w-full items-center gap-2 p-3">
        <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing touch-none p-1 -ml-1 hover:bg-muted/40 rounded" title="Kéo để sắp xếp">
          <GripVertical className="h-4 w-4 text-muted-foreground/60" />
        </button>
        <button className="flex flex-1 items-center gap-2 text-left min-w-0" onClick={() => setExpanded(!expanded)}>
          {expanded ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
          <div className="flex-1 min-w-0 flex items-center gap-2">
            <span className="font-bold text-sm truncate">{product.name || 'Chưa đặt tên'}</span>
            {product.brand && (
              <Badge variant="secondary" className="text-[10px] font-semibold shrink-0 hidden sm:inline-flex">{product.brand}</Badge>
            )}
          </div>
        </button>
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(product)}><Pencil className="h-3.5 w-3.5" /></Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7"><Copy className="h-3.5 w-3.5" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onCopySameSupplier(product.id)}>📋 Copy (cùng NCC)</DropdownMenuItem>
              {otherSuppliers.length > 0 && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>📋 Copy sang NCC khác</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {otherSuppliers.map(s => (
                      <DropdownMenuItem key={s.id} onClick={() => onCopy(product.id, s.id)}>{s.name}</DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onHistoryView(product)}><History className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onDelete(product.id)}><Trash className="h-3.5 w-3.5" /></Button>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-border p-3 space-y-2 animate-in slide-in-from-top-1 text-xs">
          {product.brand && <p className="font-semibold text-primary text-sm">{product.brand}</p>}
          
          {/* Parent unit info */}
          <div className="rounded-lg bg-muted/40 p-2 space-y-0.5">
            <p className="font-semibold text-muted-foreground">📦 {product.unit || 'Đơn vị lớn'}</p>
            <div className="flex gap-4">
              {product.buyPrice > 0 && <p>Nhập: <span className="font-bold text-destructive">{formatVND(product.buyPrice)}</span></p>}
              {product.sellPrice > 0 && <p>Bán: <span className="font-bold text-emerald-600 dark:text-emerald-400">{formatVND(product.sellPrice)}</span></p>}
            </div>
            {!hasChild && product.buyPrice > 0 && product.sellPrice > 0 && (
              <p className="text-emerald-600 dark:text-emerald-400 font-bold">Lời: {formatVND(parentProfit)} ({parentProfitPct}%)</p>
            )}
          </div>

          {/* Child unit info */}
          {hasChild && (
            <div className="rounded-lg bg-muted/40 p-2 space-y-0.5">
              <p className="font-semibold text-muted-foreground">🏷️ {product.conversionUnit} (1 {product.unit} = {rate} {product.conversionUnit})</p>
              <div className="flex gap-4">
                <p>Nhập lẻ: <span className="font-bold text-destructive">{formatVND(childBuy)}</span></p>
                <p>Bán lẻ: <span className="font-bold text-emerald-600 dark:text-emerald-400">{formatVND(childSell)}</span></p>
              </div>
              <p className="text-emerald-600 dark:text-emerald-400 font-bold">Lời/{product.conversionUnit}: {formatVND(childProfit)} ({childProfitPct}%)</p>
            </div>
          )}

          {product.notes && <p className="text-muted-foreground italic">{product.notes}</p>}
        </div>
      )}
    </div>
  );
}

// ─── History Dialog (5 editable slots) ───────────────────
function PriceHistoryDialog({
  product, open, onClose, onUpdateEntry,
}: {
  product: Product | null; open: boolean; onClose: () => void;
  onUpdateEntry: (productId: string, index: number, entry: { date: string; buyPrice: number }) => void;
}) {
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editBuy, setEditBuy] = useState('');
  if (!product) return null;

  // Always show 5 slots — fill with empty entries
  const slots: (typeof product.priceHistory[number] | null)[] = [
    ...product.priceHistory.slice(0, 5),
    ...Array(Math.max(0, 5 - product.priceHistory.length)).fill(null),
  ].slice(0, 5);

  const startEdit = (i: number, h: typeof product.priceHistory[number] | null) => {
    setEditIdx(i);
    setEditDate(h?.date.split('T')[0] || new Date().toISOString().split('T')[0]);
    setEditBuy(h ? formatPriceForInput(h.buyPrice) : '');
  };

  const saveEdit = () => {
    if (editIdx === null) return;
    const buyVND = parsePriceInput(editBuy);
    if (buyVND <= 0 || !editDate) { setEditIdx(null); return; }
    onUpdateEntry(product.id, editIdx, { date: new Date(editDate).toISOString(), buyPrice: buyVND });
    setEditIdx(null);
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">Lịch sử giá — {product.name}</DialogTitle>
          <DialogDescription className="text-xs">Sửa giá nhập + ngày. Giá bán tự cập nhật để giữ nguyên % lợi nhuận.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {slots.map((h, i) => {
            const isEditing = editIdx === i;
            const isEmpty = !h;
            if (isEditing) {
              return (
                <div key={i} className="rounded-lg border-2 border-primary p-2 space-y-2">
                  <div className="text-[10px] font-bold text-muted-foreground uppercase">Ô #{i + 1}</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[10px]">Ngày</Label>
                      <Input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} className="h-8 text-xs" />
                    </div>
                    <div>
                      <Label className="text-[10px]">Giá nhập (×1000)</Label>
                      <Input value={editBuy} onChange={e => setEditBuy(e.target.value)} placeholder="VD: 85.5" className="h-8 text-xs" />
                    </div>
                  </div>
                  <div className="flex gap-1 justify-end">
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditIdx(null)}><X className="h-3 w-3" /></Button>
                    <Button size="sm" className="h-7 text-xs" onClick={saveEdit}><Check className="h-3 w-3 mr-1" />Lưu</Button>
                  </div>
                </div>
              );
            }
            return (
              <div key={i} className={`rounded-lg border p-2 flex items-center justify-between text-xs ${isEmpty ? 'border-dashed border-muted text-muted-foreground' : 'border-border'}`}>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-muted-foreground">#{i + 1}</span>
                  {isEmpty ? (
                    <span className="italic">— trống —</span>
                  ) : (
                    <>
                      <span className="text-muted-foreground">{new Date(h!.date).toLocaleDateString('vi-VN')}</span>
                      <span>Nhập <span className="font-semibold text-destructive">{formatVND(h!.buyPrice)}</span></span>
                      <span>Bán <span className="font-semibold text-emerald-600 dark:text-emerald-400">{formatVND(h!.sellPrice)}</span></span>
                    </>
                  )}
                </div>
                <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={() => startEdit(i, h)}>
                  <Pencil className="h-3 w-3 mr-1" />{isEmpty ? 'Thêm' : 'Sửa'}
                </Button>
              </div>
            );
          })}
        </div>
        <p className="text-[10px] text-muted-foreground text-center">
          ⚠️ Chỉ áp dụng cho đơn nhập tự động được sinh sau khi sửa. Đơn cũ giữ giá gốc.
        </p>
      </DialogContent>
    </Dialog>
  );
}

// ─── Trash Dialog ─────────────────────────────────────────
function TrashDialog({
  open, onClose, deletedProducts, deletedSuppliers, onRestoreProduct, onPermanentDeleteProduct, onRestoreSupplier, onPermanentDeleteSupplier,
}: {
  open: boolean; onClose: () => void;
  deletedProducts: Product[]; deletedSuppliers: Supplier[];
  onRestoreProduct: (id: string) => void; onPermanentDeleteProduct: (id: string) => void;
  onRestoreSupplier: (id: string) => void; onPermanentDeleteSupplier: (id: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Thùng rác</DialogTitle>
          <DialogDescription>Khôi phục hoặc xóa vĩnh viễn</DialogDescription>
        </DialogHeader>

        {deletedSuppliers.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-bold text-muted-foreground uppercase">Nhà cung cấp ({deletedSuppliers.length})</p>
            {deletedSuppliers.map(s => (
              <div key={s.id} className="flex items-center justify-between rounded-lg border p-2">
                <p className="text-sm font-medium">{s.name}</p>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onRestoreSupplier(s.id)}><RotateCcw className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onPermanentDeleteSupplier(s.id)}><Trash className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-2">
          <p className="text-xs font-bold text-muted-foreground uppercase">Sản phẩm ({deletedProducts.length})</p>
          {deletedProducts.length === 0 && deletedSuppliers.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Thùng rác trống</p>
          ) : deletedProducts.length === 0 ? null : (
            deletedProducts.map(p => (
              <div key={p.id} className="flex items-center justify-between rounded-lg border p-2">
                <div>
                  <p className="text-sm font-medium">{p.name || 'Không tên'}</p>
                  <p className="text-xs text-muted-foreground">Xóa: {new Date(p.deletedAt!).toLocaleDateString('vi-VN')}</p>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onRestoreProduct(p.id)}><RotateCcw className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onPermanentDeleteProduct(p.id)} disabled={p.stock > 0}><Trash className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Catalog Page ────────────────────────────────────
export function CatalogPage({
  products, activeProducts, deletedProducts, suppliers,
  addProduct, updateProduct, softDeleteProduct, restoreProduct, permanentDeleteProduct,
  moveProduct, copyProduct, reorderProducts, updatePriceHistoryEntry,
  addSupplier, updateSupplier, deleteSupplier,
  restoreSupplier, permanentDeleteSupplier, addNotification,
}: CatalogPageProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [search, setSearch] = useState('');
  const [filterNCC, setFilterNCC] = useState<string>('all');
  const [filterUnit, setFilterUnit] = useState<string>('all');
  const [filterBrand, setFilterBrand] = useState<string>('all');
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | undefined>();
  const [showTrash, setShowTrash] = useState(false);
  const [collapsedSuppliers, setCollapsedSuppliers] = useState<Set<string>>(new Set(suppliers.map(s => s.id)));
  const [showAddNCC, setShowAddNCC] = useState(false);
  const [newNCCName, setNewNCCName] = useState('');
  const [editingNCC, setEditingNCC] = useState<{ id: string; name: string } | null>(null);
  const [historyProduct, setHistoryProduct] = useState<Product | null>(null);
  const [undoStack, setUndoStack] = useState<{ action: string; data: any }[]>([]);

  const activeSuppliers = useMemo(() => suppliers.filter(s => !s.deletedAt), [suppliers]);
  const deletedSuppliers = useMemo(() => suppliers.filter(s => s.deletedAt), [suppliers]);

  // All unique units for filter
  const allUnits = useMemo(() => {
    const units = new Set(activeProducts.map(p => p.unit).filter(Boolean));
    return Array.from(units);
  }, [activeProducts]);

  const filtered = useMemo(() => {
    let list = activeProducts;
    if (filterNCC !== 'all') list = list.filter(p => p.supplierId === filterNCC);
    if (filterUnit !== 'all') list = list.filter(p => p.unit === filterUnit);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.brand.toLowerCase().includes(q) ||
        p.unit.toLowerCase().includes(q) ||
        p.conversionUnit?.toLowerCase().includes(q) ||
        p.notes.toLowerCase().includes(q)
      );
    }
    return list;
  }, [activeProducts, filterNCC, filterUnit, search]);

  const groupedBySupplier = useMemo(() => {
    const groups: { supplier: Supplier; products: Product[] }[] = [];
    const sids = filterNCC !== 'all' ? [filterNCC] : activeSuppliers.map(s => s.id);
    for (const sid of sids) {
      const supplier = activeSuppliers.find(s => s.id === sid);
      if (!supplier) continue;
      const prods = filtered.filter(p => p.supplierId === sid)
        .sort((a, b) => {
          const oa = a.order ?? 999999;
          const ob = b.order ?? 999999;
          if (oa !== ob) return oa - ob;
          return a.createdAt.localeCompare(b.createdAt);
        });
      if (prods.length > 0 || filterNCC === 'all') groups.push({ supplier, products: prods });
    }
    return groups;
  }, [filtered, activeSuppliers, filterNCC]);

  const handleDragEnd = useCallback((supplierId: string, prodIds: string[]) => (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = prodIds.indexOf(active.id as string);
    const newIdx = prodIds.indexOf(over.id as string);
    if (oldIdx < 0 || newIdx < 0) {
      // Cross-supplier drop: move product
      const overProd = activeProducts.find(p => p.id === over.id);
      if (overProd && overProd.supplierId !== supplierId) {
        moveProduct(active.id as string, overProd.supplierId);
        addNotification(`Đã chuyển sang ${overProd.supplierId}`, 'info');
      }
      return;
    }
    const next = arrayMove(prodIds, oldIdx, newIdx);
    reorderProducts(next);
  }, [reorderProducts, activeProducts, moveProduct, addNotification]);

  const toggleCollapse = (id: string) => {
    setCollapsedSuppliers(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleAddProduct = useCallback((data: Omit<Product, 'id' | 'stock' | 'priceHistory' | 'deletedAt' | 'createdAt' | 'updatedAt'>) => {
    const p = addProduct(data);
    addNotification(`Đã thêm sản phẩm: ${data.name}`, 'product_add');
    setUndoStack(prev => [...prev, { action: 'add_product', data: p.id }]);
  }, [addProduct, addNotification]);

  const handleEditProduct = useCallback((data: Omit<Product, 'id' | 'stock' | 'priceHistory' | 'deletedAt' | 'createdAt' | 'updatedAt'>) => {
    if (!editingProduct) return;
    const oldData = { ...editingProduct };
    updateProduct(editingProduct.id, data);
    if (data.buyPrice !== editingProduct.buyPrice || data.sellPrice !== editingProduct.sellPrice) {
      addNotification(`Cập nhật giá: ${data.name}`, 'price_update');
    } else {
      addNotification(`Đã cập nhật: ${data.name}`, 'success');
    }
    setUndoStack(prev => [...prev, { action: 'edit_product', data: oldData }]);
    setEditingProduct(undefined);
  }, [editingProduct, updateProduct, addNotification]);

  const handleDelete = useCallback((id: string) => {
    const p = activeProducts.find(x => x.id === id);
    if (p && p.stock > 0) {
      addNotification('Không thể xóa sản phẩm còn tồn kho', 'warning');
      return;
    }
    softDeleteProduct(id);
    if (p) addNotification(`Đã chuyển vào thùng rác: ${p.name}`, 'info');
    setUndoStack(prev => [...prev, { action: 'delete_product', data: id }]);
  }, [activeProducts, softDeleteProduct, addNotification]);

  const handleCopySameSupplier = useCallback((productId: string) => {
    const p = activeProducts.find(x => x.id === productId);
    if (p) {
      copyProduct(productId, p.supplierId);
      addNotification(`Đã copy: ${p.name}`, 'success');
    }
  }, [activeProducts, copyProduct, addNotification]);

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const last = undoStack[undoStack.length - 1];
    if (last.action === 'add_product') {
      permanentDeleteProduct(last.data);
    } else if (last.action === 'delete_product') {
      restoreProduct(last.data);
    }
    setUndoStack(prev => prev.slice(0, -1));
    addNotification('Đã hoàn tác', 'info');
  }, [undoStack, permanentDeleteProduct, restoreProduct, addNotification]);

  const handleAddNCC = () => {
    if (newNCCName.trim()) {
      addSupplier(newNCCName.trim());
      addNotification(`Đã thêm NCC: ${newNCCName.trim()}`, 'success');
      setNewNCCName('');
      setShowAddNCC(false);
    }
  };

  const handleDeleteNCC = useCallback((id: string) => {
    const supplierProds = activeProducts.filter(p => p.supplierId === id);
    supplierProds.forEach(p => moveProduct(p.id, 'default-khac'));
    deleteSupplier(id);
    addNotification('Đã xóa NCC, sản phẩm chuyển sang Khác', 'info');
  }, [activeProducts, moveProduct, deleteSupplier, addNotification]);

  return (
    <div className="flex flex-col h-full">
      {/* ═══ STICKY TOOLBAR ═══ */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-3 py-2 space-y-2">
        {/* Row 1: Title + Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-base font-bold flex-shrink-0">Danh mục</h2>
          <div className="flex-1" />
          {undoStack.length > 0 && (
            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={handleUndo}>
              <Undo2 className="mr-1 h-3.5 w-3.5" /> Hoàn tác
            </Button>
          )}
          <Button size="sm" className="h-8 text-xs" onClick={() => { setEditingProduct(undefined); setShowForm(true); }}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Thêm sản phẩm
          </Button>
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setShowAddNCC(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Thêm nhà cung cấp
          </Button>
          <Button size="sm" variant="outline" className="h-8 text-xs relative" onClick={() => setShowTrash(true)}>
            <Trash2 className="mr-1 h-3.5 w-3.5" /> Thùng rác
            {(deletedProducts.length + deletedSuppliers.length) > 0 && (
              <Badge className="ml-1 h-4 px-1 text-[10px] bg-destructive text-destructive-foreground">
                {deletedProducts.length + deletedSuppliers.length}
              </Badge>
            )}
          </Button>
        </div>

        {/* Row 2: Search + Filters */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8 h-9 text-sm" placeholder="Tìm sản phẩm, nhãn hàng..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Select value={filterNCC} onValueChange={setFilterNCC}>
            <SelectTrigger className="w-32 h-9 text-sm"><SelectValue placeholder="NCC" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả NCC</SelectItem>
              {activeSuppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterUnit} onValueChange={setFilterUnit}>
            <SelectTrigger className="w-28 h-9 text-sm"><Filter className="mr-1 h-3 w-3" /><SelectValue placeholder="Đơn vị" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả</SelectItem>
              {allUnits.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ═══ SUPPLIER SECTIONS ═══ */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 pb-20 lg:pb-4">
        {groupedBySupplier.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Package className="h-12 w-12 text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">Chưa có sản phẩm nào</p>
            <p className="text-xs text-muted-foreground mt-1">Nhấn "Thêm sản phẩm" để bắt đầu</p>
          </div>
        )}

        {groupedBySupplier.map(({ supplier, products: prods }) => (
          <div key={supplier.id} className="rounded-2xl border-2 border-primary/10 bg-card/50 overflow-hidden">
            <button
              className="flex w-full items-center justify-between px-4 py-3 text-left bg-muted/20 hover:bg-muted/40 transition-colors"
              onClick={() => toggleCollapse(supplier.id)}
            >
              <div className="flex items-center gap-2">
                {collapsedSuppliers.has(supplier.id) ? <ChevronRight className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
                <Package className="h-4 w-4 text-primary" />
                <h3 className="text-base font-bold">{supplier.name}</h3>
                <Badge variant="outline" className="text-xs font-bold">{prods.length} SP</Badge>
              </div>
              <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                {supplier.id !== 'default-khac' && (
                  <>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingNCC({ id: supplier.id, name: supplier.name })}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDeleteNCC(supplier.id)}>
                      <Trash className="h-3 w-3" />
                    </Button>
                  </>
                )}
              </div>
            </button>

            {!collapsedSuppliers.has(supplier.id) && (
              <div className="border-t border-border p-3">
                {prods.length === 0 ? (
                  <p className="py-4 text-center text-xs text-muted-foreground">Chưa có sản phẩm. Kéo thả sản phẩm vào đây.</p>
                ) : (
                  <div className="space-y-2">
                    {prods.map(p => (
                      <ProductCard
                        key={p.id}
                        product={p}
                        suppliers={activeSuppliers}
                        onEdit={(prod) => { setEditingProduct(prod); setShowForm(true); }}
                        onDelete={handleDelete}
                        onCopy={copyProduct}
                        onCopySameSupplier={handleCopySameSupplier}
                        onHistoryView={setHistoryProduct}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ═══ DIALOGS ═══ */}
      {showForm && (
        <ProductFormDialog
          open={showForm}
          onClose={() => { setShowForm(false); setEditingProduct(undefined); }}
          suppliers={activeSuppliers}
          onSubmit={editingProduct ? handleEditProduct : handleAddProduct}
          editProduct={editingProduct}
          allProducts={activeProducts}
        />
      )}

      <TrashDialog
        open={showTrash}
        onClose={() => setShowTrash(false)}
        deletedProducts={deletedProducts}
        deletedSuppliers={deletedSuppliers}
        onRestoreProduct={restoreProduct}
        onPermanentDeleteProduct={permanentDeleteProduct}
        onRestoreSupplier={restoreSupplier}
        onPermanentDeleteSupplier={permanentDeleteSupplier}
      />

      <PriceHistoryDialog product={historyProduct} open={!!historyProduct} onClose={() => setHistoryProduct(null)} />

      <Dialog open={showAddNCC} onOpenChange={v => !v && setShowAddNCC(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Thêm nhà cung cấp</DialogTitle></DialogHeader>
          <Input value={newNCCName} onChange={e => setNewNCCName(e.target.value)} placeholder="Tên nhà cung cấp..." onKeyDown={e => e.key === 'Enter' && handleAddNCC()} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddNCC(false)}>Hủy</Button>
            <Button onClick={handleAddNCC}>Thêm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingNCC} onOpenChange={v => !v && setEditingNCC(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Đổi tên nhà cung cấp</DialogTitle></DialogHeader>
          <Input value={editingNCC?.name ?? ''} onChange={e => setEditingNCC(prev => prev ? { ...prev, name: e.target.value } : null)} onKeyDown={e => e.key === 'Enter' && editingNCC && editingNCC.name.trim() && (updateSupplier(editingNCC.id, editingNCC.name.trim()), setEditingNCC(null), addNotification('Đã đổi tên NCC', 'success'))} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingNCC(null)}>Hủy</Button>
            <Button onClick={() => { if (editingNCC?.name.trim()) { updateSupplier(editingNCC.id, editingNCC.name.trim()); setEditingNCC(null); addNotification('Đã đổi tên NCC', 'success'); } }}>Lưu</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
