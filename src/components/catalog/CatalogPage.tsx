import { useState, useMemo, useCallback } from 'react';
import { Plus, Trash2, Search, Filter, X, ChevronDown, ChevronRight, GripVertical, Copy, Pencil, Trash, RotateCcw, AlertTriangle } from 'lucide-react';
import { Product, Supplier } from '@/types';
import { formatVND, formatPriceForInput, parsePriceInput } from '@/lib/currency';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

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
  addSupplier: (name: string) => Supplier;
  updateSupplier: (id: string, name: string) => void;
  deleteSupplier: (id: string) => void;
  addNotification: (message: string, type: 'product_add' | 'product_delete' | 'price_update') => void;
}

// ─── Product Form Dialog ──────────────────────────────────────
function ProductFormDialog({
  open, onClose, suppliers, onSubmit, editProduct
}: {
  open: boolean;
  onClose: () => void;
  suppliers: Supplier[];
  onSubmit: (data: Omit<Product, 'id' | 'stock' | 'priceHistory' | 'deletedAt' | 'createdAt' | 'updatedAt'>) => void;
  editProduct?: Product;
}) {
  const [name, setName] = useState(editProduct?.name ?? '');
  const [supplierId, setSupplierId] = useState(editProduct?.supplierId ?? 'default');
  const [parentUnit, setParentUnit] = useState(editProduct?.parentUnit ?? '');
  const [buyPrice, setBuyPrice] = useState(editProduct ? formatPriceForInput(editProduct.buyPrice) : '');
  const [sellPrice, setSellPrice] = useState(editProduct ? formatPriceForInput(editProduct.sellPrice) : '');
  const [netWeights, setNetWeights] = useState(editProduct?.netWeights?.join(', ') ?? '');
  const [notes, setNotes] = useState(editProduct?.notes ?? '');
  const [hasChild, setHasChild] = useState(editProduct?.hasChildUnit ?? false);
  const [childUnit, setChildUnit] = useState(editProduct?.childUnit ?? '');
  const [convRate, setConvRate] = useState(editProduct?.conversionRate?.toString() ?? '');

  const buyVND = parsePriceInput(buyPrice);
  const sellVND = parsePriceInput(sellPrice);
  const rate = parseFloat(convRate) || 1;
  const childBuy = rate > 0 ? Math.round(buyVND / rate) : 0;
  const childSell = rate > 0 ? Math.round(sellVND / rate) : 0;
  const childProfit = childSell - childBuy;
  const childProfitPct = childBuy > 0 ? ((childProfit / childBuy) * 100).toFixed(1) : '0';

  const handleSubmit = () => {
    onSubmit({
      name,
      supplierId,
      parentUnit,
      buyPrice: buyVND,
      sellPrice: sellVND,
      netWeights: netWeights ? netWeights.split(',').map(w => w.trim()).filter(Boolean) : [],
      notes,
      hasChildUnit: hasChild,
      childUnit: hasChild ? childUnit : '',
      conversionRate: hasChild ? rate : 1,
    });
    onClose();
  };

  // Common unit suggestions
  const unitSuggestions = ['Thùng', 'Lốc', 'Bao', 'Kg', 'Hộp', 'Chai', 'Gói', 'Can', 'Bịch'];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg">{editProduct ? 'Sửa sản phẩm' : 'Thêm sản phẩm mới'}</DialogTitle>
          <DialogDescription>Tất cả trường đều không bắt buộc</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* NCC */}
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nhà cung cấp</Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {suppliers.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Tên SP */}
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tên sản phẩm</Label>
            <Input className="mt-1" value={name} onChange={e => setName(e.target.value)} placeholder="Tương ớt Chinsu..." />
          </div>

          {/* ═══ VÙNG 1: PARENT UNIT ═══ */}
          <div className="rounded-xl border border-border bg-card/50 p-3 space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Đơn vị lớn (Sỉ)</p>
            <div>
              <Label className="text-xs text-muted-foreground">Đơn vị</Label>
              <Input
                className="mt-1"
                value={parentUnit}
                onChange={e => setParentUnit(e.target.value)}
                placeholder="Thùng, Lốc, Kg..."
                list="unit-suggestions"
              />
              <datalist id="unit-suggestions">
                {unitSuggestions.map(u => <option key={u} value={u} />)}
              </datalist>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Giá nhập (×1000)</Label>
                <Input className="mt-1 text-price-input font-semibold" value={buyPrice} onChange={e => setBuyPrice(e.target.value)} placeholder="VD: 85.5" />
                {buyVND > 0 && <p className="mt-0.5 text-[10px] text-muted-foreground">= {formatVND(buyVND)}</p>}
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Giá bán (×1000)</Label>
                <Input className="mt-1 text-price-input font-semibold" value={sellPrice} onChange={e => setSellPrice(e.target.value)} placeholder="VD: 100" />
                {sellVND > 0 && <p className="mt-0.5 text-[10px] text-muted-foreground">= {formatVND(sellVND)}</p>}
              </div>
            </div>
          </div>

          {/* ═══ VÙNG 2: CHILD UNIT ═══ */}
          <div className="flex items-center gap-2">
            <Checkbox id="hasChild" checked={hasChild} onCheckedChange={(v) => setHasChild(!!v)} />
            <Label htmlFor="hasChild" className="text-sm font-medium cursor-pointer">+ Thêm quy đổi bán lẻ</Label>
          </div>

          {hasChild && (
            <div className="rounded-xl border border-dashed border-border bg-card/30 p-3 space-y-3 animate-in slide-in-from-top-2">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Đơn vị nhỏ (Lẻ)</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Tên đơn vị nhỏ</Label>
                  <Input className="mt-1" value={childUnit} onChange={e => setChildUnit(e.target.value)} placeholder="Chai, Gói..." />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Số lượng quy đổi</Label>
                  <Input className="mt-1" type="number" min="1" value={convRate} onChange={e => setConvRate(e.target.value)} placeholder="6" />
                </div>
              </div>
              {buyVND > 0 && rate > 0 && (
                <div className="rounded-lg bg-emerald/10 p-2 text-xs">
                  <p>⇒ Giá lẻ nhập: <span className="font-semibold">{formatVND(childBuy)}</span> / {childUnit || '?'}</p>
                  <p>⇒ Giá lẻ bán: <span className="font-semibold">{formatVND(childSell)}</span> / {childUnit || '?'}</p>
                  <p>⇒ Lợi nhuận: <span className="font-bold text-emerald">{formatVND(childProfit)}</span> ({childProfitPct}%)</p>
                </div>
              )}
            </div>
          )}

          {/* Khối lượng tịnh */}
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Khối lượng tịnh</Label>
            <Input className="mt-1" value={netWeights} onChange={e => setNetWeights(e.target.value)} placeholder="700ml, 500g, 1L (phân tách bằng dấu phẩy)" />
          </div>

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

// ─── Product Card ─────────────────────────────────────────────
function ProductCard({
  product, suppliers, onEdit, onDelete, onMove, onCopy
}: {
  product: Product;
  suppliers: Supplier[];
  onEdit: (p: Product) => void;
  onDelete: (id: string) => void;
  onMove: (productId: string, newSupplierId: string) => void;
  onCopy: (productId: string, targetSupplierId: string) => void;
}) {
  const rate = product.conversionRate || 1;
  const childBuy = rate > 0 ? Math.round(product.buyPrice / rate) : 0;
  const childSell = rate > 0 ? Math.round(product.sellPrice / rate) : 0;
  const childProfit = childSell - childBuy;
  const childProfitPct = childBuy > 0 ? ((childProfit / childBuy) * 100).toFixed(1) : '0';
  const parentProfit = product.sellPrice - product.buyPrice;
  const parentProfitPct = product.buyPrice > 0 ? ((parentProfit / product.buyPrice) * 100).toFixed(1) : '0';
  const supplierName = suppliers.find(s => s.id === product.supplierId)?.name || 'Khác';
  const otherSuppliers = suppliers.filter(s => s.id !== product.supplierId);

  return (
    <div className="group rounded-xl border border-border bg-card glass card-shadow p-3 transition-all hover:card-shadow-lg">
      {/* Top: Name + Actions */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="min-w-0">
            <h4 className="font-bold text-sm text-foreground truncate">{product.name || 'Chưa đặt tên'}</h4>
            {product.netWeights.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-0.5">
                {product.netWeights.map((w, i) => (
                  <Badge key={i} variant="secondary" className="text-[10px] px-1.5 py-0">{w}</Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(product)}>
              <Pencil className="mr-2 h-3.5 w-3.5" /> Chỉnh sửa
            </DropdownMenuItem>
            {otherSuppliers.length > 0 && (
              <>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger><GripVertical className="mr-2 h-3.5 w-3.5" /> Di chuyển tới</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {otherSuppliers.map(s => (
                      <DropdownMenuItem key={s.id} onClick={() => onMove(product.id, s.id)}>{s.name}</DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger><Copy className="mr-2 h-3.5 w-3.5" /> Sao chép tới</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {otherSuppliers.map(s => (
                      <DropdownMenuItem key={s.id} onClick={() => onCopy(product.id, s.id)}>{s.name}</DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </>
            )}
            <DropdownMenuItem className="text-destructive" onClick={() => onDelete(product.id)}>
              <Trash className="mr-2 h-3.5 w-3.5" /> Xóa
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Pricing Grid */}
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <div>
          <span className="text-muted-foreground">Đơn vị lớn:</span>
          <span className="ml-1 font-semibold">{product.parentUnit || '—'}</span>
        </div>
        <div>
          <span className="text-muted-foreground">NCC:</span>
          <span className="ml-1 font-medium">{supplierName}</span>
        </div>
        {product.buyPrice > 0 && (
          <div>
            <span className="text-muted-foreground">Nhập:</span>
            <span className="ml-1 font-semibold text-price-input">{formatVND(product.buyPrice)}</span>
          </div>
        )}
        {product.sellPrice > 0 && (
          <div>
            <span className="text-muted-foreground">Bán:</span>
            <span className="ml-1 font-semibold text-price-input">{formatVND(product.sellPrice)}</span>
          </div>
        )}
        {product.buyPrice > 0 && product.sellPrice > 0 && (
          <div className="col-span-2">
            <span className="text-muted-foreground">Lời (sỉ):</span>
            <span className="ml-1 font-bold text-emerald">{formatVND(parentProfit)} ({parentProfitPct}%)</span>
          </div>
        )}
      </div>

      {/* Child unit */}
      {product.hasChildUnit && product.childUnit && (
        <div className="mt-2 rounded-lg bg-accent/50 p-2 text-xs space-y-0.5">
          <p className="font-semibold text-muted-foreground">
            Đơn vị nhỏ: {product.childUnit} (1 {product.parentUnit} = {rate} {product.childUnit})
          </p>
          {product.buyPrice > 0 && (
            <>
              <p>Nhập lẻ: <span className="font-semibold text-price-input">{formatVND(childBuy)}</span></p>
              <p>Bán lẻ: <span className="font-semibold text-price-input">{formatVND(childSell)}</span></p>
              <p>Lời lẻ: <span className="font-bold text-emerald">{formatVND(childProfit)} ({childProfitPct}%)</span></p>
            </>
          )}
        </div>
      )}

      {product.notes && (
        <p className="mt-1.5 text-[10px] text-muted-foreground italic truncate">{product.notes}</p>
      )}
    </div>
  );
}

// ─── Trash Dialog ─────────────────────────────────────────────
function TrashDialog({
  open, onClose, deletedProducts, onRestore, onPermanentDelete
}: {
  open: boolean;
  onClose: () => void;
  deletedProducts: Product[];
  onRestore: (id: string) => void;
  onPermanentDelete: (id: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Thùng rác ({deletedProducts.length})</DialogTitle>
          <DialogDescription>Sản phẩm đã xóa có thể khôi phục hoặc xóa vĩnh viễn</DialogDescription>
        </DialogHeader>
        {deletedProducts.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Thùng rác trống</p>
        ) : (
          <div className="space-y-2">
            {deletedProducts.map(p => (
              <div key={p.id} className="flex items-center justify-between rounded-lg border p-2">
                <div>
                  <p className="text-sm font-medium">{p.name || 'Không tên'}</p>
                  <p className="text-xs text-muted-foreground">
                    Xóa: {new Date(p.deletedAt!).toLocaleDateString('vi-VN')}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onRestore(p.id)}>
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onPermanentDelete(p.id)} disabled={p.stock > 0}>
                    <Trash className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Catalog Page ────────────────────────────────────────
export function CatalogPage({
  activeProducts, deletedProducts, suppliers,
  addProduct, updateProduct, softDeleteProduct, restoreProduct, permanentDeleteProduct,
  moveProduct, copyProduct, addSupplier, updateSupplier, deleteSupplier, addNotification,
}: CatalogPageProps) {
  const [search, setSearch] = useState('');
  const [filterNCC, setFilterNCC] = useState<string>('all');
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | undefined>();
  const [showTrash, setShowTrash] = useState(false);
  const [collapsedSuppliers, setCollapsedSuppliers] = useState<Set<string>>(new Set());
  const [showAddNCC, setShowAddNCC] = useState(false);
  const [newNCCName, setNewNCCName] = useState('');
  const [editingNCC, setEditingNCC] = useState<{ id: string; name: string } | null>(null);

  // Filter products
  const filtered = useMemo(() => {
    let list = activeProducts;
    if (filterNCC !== 'all') list = list.filter(p => p.supplierId === filterNCC);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.parentUnit.toLowerCase().includes(q) ||
        p.childUnit?.toLowerCase().includes(q) ||
        p.notes.toLowerCase().includes(q)
      );
    }
    return list;
  }, [activeProducts, filterNCC, search]);

  // Group by supplier
  const groupedBySupplier = useMemo(() => {
    const groups: { supplier: Supplier; products: Product[] }[] = [];
    const supplierIds = filterNCC !== 'all' ? [filterNCC] : suppliers.map(s => s.id);

    for (const sid of supplierIds) {
      const supplier = suppliers.find(s => s.id === sid);
      if (!supplier) continue;
      const prods = filtered.filter(p => p.supplierId === sid);
      if (prods.length > 0 || filterNCC === 'all') {
        groups.push({ supplier, products: prods });
      }
    }
    return groups;
  }, [filtered, suppliers, filterNCC]);

  const toggleCollapse = (id: string) => {
    setCollapsedSuppliers(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleAddProduct = useCallback((data: Omit<Product, 'id' | 'stock' | 'priceHistory' | 'deletedAt' | 'createdAt' | 'updatedAt'>) => {
    addProduct(data);
    addNotification(`Đã thêm sản phẩm: ${data.name || 'Không tên'}`, 'product_add');
  }, [addProduct, addNotification]);

  const handleEditProduct = useCallback((data: Omit<Product, 'id' | 'stock' | 'priceHistory' | 'deletedAt' | 'createdAt' | 'updatedAt'>) => {
    if (!editingProduct) return;
    updateProduct(editingProduct.id, data);
    if (data.buyPrice !== editingProduct.buyPrice || data.sellPrice !== editingProduct.sellPrice) {
      addNotification(`Cập nhật giá: ${data.name || editingProduct.name}`, 'price_update');
    }
    setEditingProduct(undefined);
  }, [editingProduct, updateProduct, addNotification]);

  const handleDelete = useCallback((id: string) => {
    const p = activeProducts.find(x => x.id === id);
    softDeleteProduct(id);
    if (p) addNotification(`Đã xóa sản phẩm: ${p.name || 'Không tên'}`, 'product_delete');
  }, [activeProducts, softDeleteProduct, addNotification]);

  const handleAddNCC = () => {
    if (newNCCName.trim()) {
      addSupplier(newNCCName.trim());
      setNewNCCName('');
      setShowAddNCC(false);
    }
  };

  const handleUpdateNCC = () => {
    if (editingNCC && editingNCC.name.trim()) {
      updateSupplier(editingNCC.id, editingNCC.name.trim());
      setEditingNCC(null);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* ═══ STICKY TOOLBAR ═══ */}
      <div className="sticky top-0 z-30 glass-toolbar border-b border-border px-3 py-2 space-y-2">
        {/* Row 1: Search + Filter */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8 h-9 text-sm"
              placeholder="Tìm sản phẩm, đơn vị..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button className="absolute right-2 top-1/2 -translate-y-1/2" onClick={() => setSearch('')}>
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            )}
          </div>
          <Select value={filterNCC} onValueChange={setFilterNCC}>
            <SelectTrigger className="w-36 h-9 text-sm">
              <Filter className="mr-1 h-3.5 w-3.5" />
              <SelectValue placeholder="NCC" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả NCC</SelectItem>
              {suppliers.map(s => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Row 2: Actions */}
        <div className="flex gap-2">
          <Button size="sm" className="h-8 text-xs" onClick={() => { setEditingProduct(undefined); setShowForm(true); }}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Thêm SP
          </Button>
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setShowAddNCC(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Thêm NCC
          </Button>
          <Button size="sm" variant="outline" className="h-8 text-xs relative" onClick={() => setShowTrash(true)}>
            <Trash2 className="mr-1 h-3.5 w-3.5" /> Thùng rác
            {deletedProducts.length > 0 && (
              <Badge className="ml-1 h-4 px-1 text-[10px] bg-crimson text-crimson-foreground">{deletedProducts.length}</Badge>
            )}
          </Button>
        </div>
      </div>

      {/* ═══ SUPPLIER SECTIONS ═══ */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 safe-bottom">
        {groupedBySupplier.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted mb-3">
              <AlertTriangle className="h-7 w-7 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">Chưa có sản phẩm nào</p>
            <p className="text-xs text-muted-foreground mt-1">Nhấn "Thêm SP" để bắt đầu</p>
          </div>
        )}

        {groupedBySupplier.map(({ supplier, products: prods }) => (
          <div key={supplier.id} className="rounded-2xl border border-border bg-card/50 glass overflow-hidden">
            {/* Supplier Header */}
            <button
              className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-accent/30 transition-colors"
              onClick={() => toggleCollapse(supplier.id)}
            >
              <div className="flex items-center gap-2">
                {collapsedSuppliers.has(supplier.id) ? (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
                <h3 className="text-sm font-bold text-foreground">{supplier.name}</h3>
                <Badge variant="secondary" className="text-[10px]">{prods.length} SP</Badge>
              </div>
              <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                {supplier.id !== 'default' && (
                  <>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditingNCC({ id: supplier.id, name: supplier.name })}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => {
                      // Move products to default before deleting
                      prods.forEach(p => moveProduct(p.id, 'default'));
                      deleteSupplier(supplier.id);
                    }}>
                      <Trash className="h-3 w-3" />
                    </Button>
                  </>
                )}
              </div>
            </button>

            {/* Products Grid */}
            {!collapsedSuppliers.has(supplier.id) && (
              <div className="border-t border-border p-3">
                {prods.length === 0 ? (
                  <p className="py-4 text-center text-xs text-muted-foreground">Chưa có sản phẩm</p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {prods.map(p => (
                      <ProductCard
                        key={p.id}
                        product={p}
                        suppliers={suppliers}
                        onEdit={(prod) => { setEditingProduct(prod); setShowForm(true); }}
                        onDelete={handleDelete}
                        onMove={moveProduct}
                        onCopy={copyProduct}
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
          suppliers={suppliers}
          onSubmit={editingProduct ? handleEditProduct : handleAddProduct}
          editProduct={editingProduct}
        />
      )}

      <TrashDialog
        open={showTrash}
        onClose={() => setShowTrash(false)}
        deletedProducts={deletedProducts}
        onRestore={restoreProduct}
        onPermanentDelete={permanentDeleteProduct}
      />

      {/* Add NCC Dialog */}
      <Dialog open={showAddNCC} onOpenChange={v => !v && setShowAddNCC(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Thêm nhà cung cấp</DialogTitle>
          </DialogHeader>
          <Input value={newNCCName} onChange={e => setNewNCCName(e.target.value)} placeholder="Tên nhà cung cấp..." onKeyDown={e => e.key === 'Enter' && handleAddNCC()} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddNCC(false)}>Hủy</Button>
            <Button onClick={handleAddNCC}>Thêm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit NCC Dialog */}
      <Dialog open={!!editingNCC} onOpenChange={v => !v && setEditingNCC(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Đổi tên nhà cung cấp</DialogTitle>
          </DialogHeader>
          <Input value={editingNCC?.name ?? ''} onChange={e => setEditingNCC(prev => prev ? { ...prev, name: e.target.value } : null)} onKeyDown={e => e.key === 'Enter' && handleUpdateNCC()} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingNCC(null)}>Hủy</Button>
            <Button onClick={handleUpdateNCC}>Lưu</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
