import { useState, useMemo } from 'react';
import { Search, ChevronDown, ChevronRight, Package, AlertTriangle } from 'lucide-react';
import { InventoryBatch, Supplier } from '@/types';
import { formatVND } from '@/lib/currency';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

interface InventoryPageProps {
  batches: InventoryBatch[];
  suppliers: Supplier[];
}

export function InventoryPage({ batches, suppliers }: InventoryPageProps) {
  const [search, setSearch] = useState('');
  const [collapsedSuppliers, setCollapsedSuppliers] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    if (!search.trim()) return batches;
    const q = search.toLowerCase();
    return batches.filter(b =>
      b.productName.toLowerCase().includes(q) ||
      b.supplierName.toLowerCase().includes(q)
    );
  }, [batches, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, InventoryBatch[]>();
    filtered.forEach(b => {
      if (!map.has(b.supplierId)) map.set(b.supplierId, []);
      map.get(b.supplierId)!.push(b);
    });
    return map;
  }, [filtered]);

  const toggleSupplier = (id: string) => {
    setCollapsedSuppliers(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border p-3 space-y-2">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-bold">Kho hàng</h2>
          <div className="flex-1" />
          <Badge variant="outline">{batches.length} lô</Badge>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8 h-9" placeholder="Tìm sản phẩm, NCC..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3 pb-20 lg:pb-4">
        {Array.from(grouped.entries()).map(([supplierId, supplierBatches]) => {
          const supplier = suppliers.find(s => s.id === supplierId);
          const isCollapsed = collapsedSuppliers.has(supplierId);
          const totalQty = supplierBatches.reduce((s, b) => s + b.quantity, 0);
          const totalValue = supplierBatches.reduce((s, b) => s + b.quantity * b.buyPrice, 0);

          const productMap = new Map<string, { name: string; batches: number; totalQty: number; totalValue: number; unit: string }>();
          supplierBatches.forEach(b => {
            const existing = productMap.get(b.productId);
            if (existing) {
              existing.batches++;
              existing.totalQty += b.quantity;
              existing.totalValue += b.quantity * b.buyPrice;
            } else {
              productMap.set(b.productId, { name: b.productName, batches: 1, totalQty: b.quantity, totalValue: b.quantity * b.buyPrice, unit: b.unit });
            }
          });

          return (
            <div key={supplierId} className="rounded-xl border border-border shadow-sm overflow-hidden">
              <button className="flex w-full items-center gap-2 p-3 text-left hover:bg-muted/30 transition-colors" onClick={() => toggleSupplier(supplierId)}>
                {isCollapsed ? <ChevronRight className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
                <Package className="h-4 w-4 shrink-0 text-primary" />
                <div className="flex-1 min-w-0">
                  <span className="font-bold text-sm">{supplier?.name || 'Khác'}</span>
                  <p className="text-xs text-muted-foreground">{productMap.size} SP · {totalQty} đvị · {formatVND(totalValue)}</p>
                </div>
              </button>
              {!isCollapsed && (
                <div className="border-t border-border p-3 space-y-2 animate-in slide-in-from-top-1">
                  {Array.from(productMap.entries()).map(([pid, info]) => (
                    <div key={pid} className={`flex items-center justify-between text-xs p-2 rounded-lg ${info.totalQty <= 5 ? 'bg-destructive/10 border border-destructive/20' : 'bg-muted/30'}`}>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold">{info.name}</p>
                          {info.totalQty <= 5 && <Badge variant="destructive" className="text-[9px] h-4"><AlertTriangle className="h-2.5 w-2.5 mr-0.5" />Sắp hết</Badge>}
                        </div>
                        <p className="text-muted-foreground">{info.batches} lô · {info.unit}</p>
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        <p className={`font-bold ${info.totalQty <= 5 ? 'text-destructive' : 'text-foreground'}`}>{info.totalQty}</p>
                        <p className="text-muted-foreground">{formatVND(info.totalValue)}</p>
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
            {search ? 'Không tìm thấy' : 'Chưa có hàng trong kho. Tạo đơn nhập ở Tab Nhập hàng.'}
          </div>
        )}
      </div>
    </div>
  );
}
