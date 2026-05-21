import { useState, useCallback, useEffect, useMemo } from 'react';
import { Header } from '@/components/layout/Header';
import { BottomNav } from '@/components/layout/BottomNav';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { CatalogPage } from '@/components/catalog/CatalogPage';
import { DashboardPage } from '@/components/dashboard/DashboardPage';
import { ImportPage } from '@/components/import/ImportPage';
import { InventoryPage } from '@/components/inventory/InventoryPage';
import { SalesPage } from '@/components/sales/SalesPage';
import { PlaceholderTab } from '@/components/PlaceholderTab';
import {
  useProducts, useSuppliers, useNotifications, useTheme,
  useQuarters, useImportOrders, useSalesOrders, useInventoryBatches,
  useRegenSeeds, useGeneratedQuarters,
} from '@/hooks/useStore';
import { generateQuarterData, computeCarryOverStock, computeInventorySnapshot, generateSupplementaryOrder, generateSupplementaryAutoOrders, DATA_ENGINE_VERSION } from '@/lib/dataEngine';
import { syncFromSupabase } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import { TabId, QuarterData } from '@/types';
import { PeriodProvider, usePeriod } from '@/contexts/PeriodContext';

function IndexInner() {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [online, setOnline] = useState<boolean>(navigator.onLine);
  const [initialSyncDone, setInitialSyncDone] = useState(false);
  const { quarter: selQ, year: selYear } = usePeriod();

  const { theme, toggleTheme } = useTheme();
  const { products, activeProducts, deletedProducts, addProduct, updateProduct, softDeleteProduct, restoreProduct, permanentDeleteProduct, moveProduct, copyProduct, reorderProducts, updatePriceHistoryEntry } = useProducts();
  const { suppliers, activeSuppliers, addSupplier, updateSupplier, deleteSupplier, restoreSupplier, permanentDeleteSupplier } = useSuppliers();
  const { notifications, addNotification, markRead, markAllRead, unreadCount } = useNotifications();
  const { quarters, setQuarterTarget, setQuarterLock, rebalanceQuarters } = useQuarters();
  const { orders: importOrders, activeOrders: activeImportOrders, deletedOrders: deletedImportOrders, addOrder: addImportOrder, deleteOrder: deleteImportOrder, restoreOrder: restoreImportOrder, permanentDeleteOrder: permanentDeleteImportOrder, updateOrder: updateImportOrder, setOrders: setImportOrders } = useImportOrders();
  const { orders: salesOrders, activeOrders: activeSalesOrders, addOrder: addSaleOrder, deleteOrder: deleteSaleOrder, setOrders: setSalesOrders } = useSalesOrders();
  const { batches: inventoryBatches, setBatches: setInventoryBatches } = useInventoryBatches();
  const { seeds: regenSeeds, setSeeds: setRegenSeeds } = useRegenSeeds();
  const { generated: generatedQuarters, setGenerated: setGeneratedQuarters } = useGeneratedQuarters();

  // Online/offline tracking
  useEffect(() => {
    const onUp = () => setOnline(true);
    const onDown = () => setOnline(false);
    window.addEventListener('online', onUp);
    window.addEventListener('offline', onDown);
    // Realtime channel status
    const chan = supabase.channel('health-check').subscribe(s => {
      if (s === 'SUBSCRIBED') setOnline(true);
      if (s === 'CHANNEL_ERROR' || s === 'CLOSED') setOnline(navigator.onLine);
    });
    return () => {
      window.removeEventListener('online', onUp);
      window.removeEventListener('offline', onDown);
      supabase.removeChannel(chan);
    };
  }, []);

  // One-time initial sync from Supabase WITHOUT page reload.
  // syncFromSupabase dispatches per-key 'supabase-initial-sync-data' events that
  // hook listeners use to populate React state with FULL data while localStorage
  // keeps only a trimmed slice (≤10%).
  useEffect(() => {
    let cancelled = false;
    syncFromSupabase().then(() => {
      if (cancelled) return;
      setInitialSyncDone(true);
    });
    return () => { cancelled = true; };
  }, []);

  const updateImportOrderDate = useCallback((id: string, newDate: string) => {
    setImportOrders(prev => prev.map(o => o.id === id ? { ...o, date: newDate } : o));
  }, [setImportOrders]);

  const manualImportSig = useMemo(
    () => importOrders
      .filter(o => o.tag !== 'auto')
      .map(o => `${o.id}-${o.date}-${o.total}-${o.deletedAt || ''}-${o.items.map(it => `${it.productId}:${it.quantity}:${it.buyPrice}`).join(',')}`)
      .sort()
      .join('|'),
    [importOrders]
  );

  const manualSalesSig = useMemo(
    () => salesOrders
      .filter(o => o.tag !== 'auto')
      .map(o => `${o.id}-${o.date}-${o.totalRevenue}-${o.deletedAt || ''}-${o.items.map(it => `${it.productId}:${it.quantity}:${it.total}`).join(',')}`)
      .sort()
      .join('|'),
    [salesOrders]
  );

  // Đơn auto đã KHÓA: thay đổi (lock/unlock) phải kích hoạt regen để cân lại phần còn lại
  const lockedAutoSig = useMemo(
    () => [
      ...importOrders.filter(o => o.tag === 'auto' && o.locked).map(o => `i:${o.id}:${o.date}:${o.total}`),
      ...salesOrders.filter(o => o.tag === 'auto' && o.locked).map(o => `s:${o.id}:${o.date}:${o.totalRevenue}`),
    ].sort().join('|'),
    [importOrders, salesOrders]
  );

  // Auto regen chỉ phụ thuộc vào GIÁ GỐC (baseBuy/baseSell), không phải giá hiện tại.
  // Catalog edit thay đổi buyPrice/sellPrice sẽ KHÔNG khiến đơn auto regen.
  const productSig = useMemo(
    () => activeProducts.map(p => `${p.id}-${p.baseBuyPrice ?? p.buyPrice}-${p.baseSellPrice ?? p.sellPrice}-${p.conversionRate}-${p.supplierId}`).sort().join('|'),
    [activeProducts]
  );

  const supplierSig = useMemo(
    () => activeSuppliers.map(s => `${s.id}-${s.name}`).sort().join('|'),
    [activeSuppliers]
  );

  // Per-quarter signature: chỉ regen quý có sig thay đổi
  const quarterSigs = useMemo(() => {
    const map = new Map<string, string>();
    for (const q of quarters) {
      const key = `${q.quarter}-${q.year}`;
      // Manual orders trong quý này
      const qManualImpSig = importOrders
        .filter(o => o.tag !== 'auto')
        .filter(o => {
          const d = new Date(o.date);
          return Math.ceil((d.getMonth() + 1) / 3) === q.quarter && d.getFullYear() === q.year;
        })
        .map(o => `${o.id}-${o.date}-${o.total}-${o.deletedAt || ''}-${o.items.map(it => `${it.productId}:${it.quantity}:${it.buyPrice}`).join(',')}`)
        .sort().join('|');
      const qManualSalesSig = salesOrders
        .filter(o => o.tag !== 'auto')
        .filter(o => {
          const d = new Date(o.date);
          return Math.ceil((d.getMonth() + 1) / 3) === q.quarter && d.getFullYear() === q.year;
        })
        .map(o => `${o.id}-${o.date}-${o.totalRevenue}-${o.deletedAt || ''}`)
        .sort().join('|');
      const qLockedAutoSig = [
        ...importOrders.filter(o => o.tag === 'auto' && o.locked).filter(o => {
          const d = new Date(o.date);
          return Math.ceil((d.getMonth() + 1) / 3) === q.quarter && d.getFullYear() === q.year;
        }).map(o => `i:${o.id}:${o.date}:${o.total}`),
        ...salesOrders.filter(o => o.tag === 'auto' && o.locked).filter(o => {
          const d = new Date(o.date);
          return Math.ceil((d.getMonth() + 1) / 3) === q.quarter && d.getFullYear() === q.year;
        }).map(o => `s:${o.id}:${o.date}:${o.totalRevenue}`),
      ].sort().join('|');

      const sig = [
        DATA_ENGINE_VERSION,
        `${q.targetRevenue}-${q.locked ? 1 : 0}-${regenSeeds[key] || 0}`,
        qManualImpSig,
        qManualSalesSig,
        qLockedAutoSig,
        productSig,
        supplierSig,
      ].join('||');
      map.set(key, sig);
    }
    return map;
  }, [quarters, importOrders, salesOrders, regenSeeds, productSig, supplierSig]);

  const quarterSigsKey = useMemo(
    () => Array.from(quarterSigs.entries()).sort().map(([k, v]) => `${k}=${v}`).join('§§'),
    [quarterSigs]
  );

  // Auto-generate import/sales/batches whenever quarters or active products change.
  // CHỈ regen quý có sig khác với generatedQuarters đã lưu trên Supabase.
  useEffect(() => {
    if (!initialSyncDone) return;
    if (quarters.length === 0 || activeProducts.length === 0) return;

    // Tìm các quý cần regen
    const quartersToRegen: QuarterData[] = [];
    for (const q of quarters) {
      if (q.targetRevenue <= 0 || q.locked) continue;
      const key = `${q.quarter}-${q.year}`;
      const newSig = quarterSigs.get(key);
      if (!newSig) continue;
      if (generatedQuarters[key] !== newSig) {
        quartersToRegen.push(q);
      }
    }

    if (quartersToRegen.length === 0) return;

    const manualImports = importOrders.filter(o => o.tag !== 'auto');
    const manualSales = salesOrders.filter(o => o.tag !== 'auto');
    const lockedAutoImports = importOrders.filter(o => {
      if (o.tag !== 'auto') return false;
      const d = new Date(o.date);
      const q = quarters.find(qd => qd.quarter === Math.ceil((d.getMonth() + 1) / 3) && qd.year === d.getFullYear());
      return q?.locked || o.locked;
    });
    const lockedAutoSales = salesOrders.filter(o => {
      if (o.tag !== 'auto') return false;
      const d = new Date(o.date);
      const q = quarters.find(qd => qd.quarter === Math.ceil((d.getMonth() + 1) / 3) && qd.year === d.getFullYear());
      return q?.locked || o.locked;
    });

    const regenKeys = new Set(quartersToRegen.map(q => `${q.quarter}-${q.year}`));
    // Đơn auto KHÔNG khóa của quý KHÔNG regen → giữ nguyên
    const preservedAutoImports = importOrders.filter(o => {
      if (o.tag !== 'auto') return false;
      if (o.locked) return false;
      const d = new Date(o.date);
      const k = `${Math.ceil((d.getMonth() + 1) / 3)}-${d.getFullYear()}`;
      const q = quarters.find(qd => qd.quarter === Math.ceil((d.getMonth() + 1) / 3) && qd.year === d.getFullYear());
      if (q?.locked) return false; // đã nằm trong lockedAutoImports
      return !regenKeys.has(k);
    });
    const preservedAutoSales = salesOrders.filter(o => {
      if (o.tag !== 'auto') return false;
      if (o.locked) return false;
      const d = new Date(o.date);
      const k = `${Math.ceil((d.getMonth() + 1) / 3)}-${d.getFullYear()}`;
      const q = quarters.find(qd => qd.quarter === Math.ceil((d.getMonth() + 1) / 3) && qd.year === d.getFullYear());
      if (q?.locked) return false;
      return !regenKeys.has(k);
    });

    const lockedBatches = inventoryBatches.filter(b => {
      const q = quarters.find(qd => qd.quarter === b.quarter && qd.year === b.year);
      if (q?.locked) return true;
      return lockedAutoImports.some(o => o.id === b.importOrderId);
    });
    // Batches của quý không regen → giữ
    const preservedBatches = inventoryBatches.filter(b => {
      const k = `${b.quarter}-${b.year}`;
      if (regenKeys.has(k)) return false;
      const q = quarters.find(qd => qd.quarter === b.quarter && qd.year === b.year);
      if (q?.locked) return false; // đã trong lockedBatches
      // Bỏ qua nếu đã thuộc lockedBatches (tránh duplicate)
      return !lockedAutoImports.some(o => o.id === b.importOrderId);
    });

    let allAutoImports: typeof importOrders = [];
    let allAutoSales: typeof salesOrders = [];

    // Sort các quý regen chronologically
    const sortedRegen = [...quartersToRegen].sort((a, b) =>
      a.year !== b.year ? a.year - b.year : a.quarter - b.quarter
    );

    for (const q of sortedRegen) {
      const qManualSales = manualSales.filter(o => {
        const d = new Date(o.date);
        return Math.ceil((d.getMonth() + 1) / 3) === q.quarter && d.getFullYear() === q.year;
      });
      const qManualImports = manualImports.filter(o => {
        const d = new Date(o.date);
        return Math.ceil((d.getMonth() + 1) / 3) === q.quarter && d.getFullYear() === q.year;
      });
      const qFrozenAutoImports = lockedAutoImports.filter(o => {
        const d = new Date(o.date);
        return Math.ceil((d.getMonth() + 1) / 3) === q.quarter && d.getFullYear() === q.year;
      });
      const qFrozenAutoSales = lockedAutoSales.filter(o => {
        const d = new Date(o.date);
        return Math.ceil((d.getMonth() + 1) / 3) === q.quarter && d.getFullYear() === q.year;
      });

      const allImportsSoFar = [...manualImports, ...lockedAutoImports, ...preservedAutoImports, ...allAutoImports];
      const allSalesSoFar = [...manualSales, ...lockedAutoSales, ...preservedAutoSales, ...allAutoSales];
      const carryOver = computeCarryOverStock(q.quarter, q.year, activeProducts, allImportsSoFar, allSalesSoFar);

      const seedKey = `${q.quarter}-${q.year}`;
      const qWithSeed = { ...q, regenSeed: regenSeeds[seedKey] || 0 } as any;
      const generated = generateQuarterData(
        qWithSeed,
        activeProducts,
        activeSuppliers,
        [...qManualImports, ...qFrozenAutoImports],
        [...qManualSales, ...qFrozenAutoSales],
        carryOver,
      );
      allAutoImports.push(...generated.importOrders);
      allAutoSales.push(...generated.salesOrders);
    }

    const finalImports = [...manualImports, ...lockedAutoImports, ...preservedAutoImports, ...allAutoImports];
    const finalSales = [...manualSales, ...lockedAutoSales, ...preservedAutoSales, ...allAutoSales];

    // Inventory snapshot CHỈ tính lại cho các quý regen (giữ batch quý không regen)
    const recomputedBatches = sortedRegen.flatMap(q =>
      computeInventorySnapshot(q.quarter, q.year, activeProducts, finalImports, finalSales)
    );

    setImportOrders(finalImports);
    setSalesOrders(finalSales);
    setInventoryBatches([...lockedBatches, ...preservedBatches, ...recomputedBatches]);

    // Cập nhật generatedQuarters để lần sau load lại không regen các quý này
    setGeneratedQuarters(prev => {
      const next = { ...prev };
      for (const q of sortedRegen) {
        const key = `${q.quarter}-${q.year}`;
        const sig = quarterSigs.get(key);
        if (sig) next[key] = sig;
      }
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quarterSigsKey, initialSyncDone]);

  const handleDataRestore = useCallback(() => {
    // Don't reload page; trigger a soft re-render
    addNotification('Khôi phục thành công, dữ liệu đã làm mới', 'success');
  }, [addNotification]);

  // Lock helper: a quarter is locked
  const isQuarterLocked = useCallback((q: number, y: number) => {
    return !!quarters.find(qd => qd.quarter === q && qd.year === y && qd.locked);
  }, [quarters]);

  /** Xóa toàn bộ đơn auto của 1 quý (giữ thủ công + auto đã KHÓA) — useEffect sẽ tự sinh lại */
  const handleClearAutoOrders = useCallback((q: number, y: number) => {
    const key = `${q}-${y}`;
    // Tăng seed để sig đổi → useEffect sẽ regen
    setRegenSeeds(prev => ({ ...prev, [key]: (prev[key] || 0) + 1 }));
    // Invalidate generatedQuarters[key] để buộc regen
    setGeneratedQuarters(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    const keptImportIds = new Set<string>();
    setImportOrders(prev => prev.filter(o => {
      if (o.tag !== 'auto') return true;
      const d = new Date(o.date);
      const sameQ = Math.ceil((d.getMonth() + 1) / 3) === q && d.getFullYear() === y;
      if (!sameQ) return true;
      if (o.locked) { keptImportIds.add(o.id); return true; }
      return false;
    }));
    setSalesOrders(prev => prev.filter(o => {
      if (o.tag !== 'auto') return true;
      const d = new Date(o.date);
      const sameQ = Math.ceil((d.getMonth() + 1) / 3) === q && d.getFullYear() === y;
      if (!sameQ) return true;
      return !!o.locked;
    }));
    setInventoryBatches(prev => prev.filter(b => {
      if (b.quarter !== q || b.year !== y) return true;
      return keptImportIds.has(b.importOrderId);
    }));
    addNotification(`Đã xóa đơn tự động Q${q}/${y} (giữ đơn đã khóa), đang sinh lại...`, 'info');
  }, [setImportOrders, setSalesOrders, setInventoryBatches, setRegenSeeds, setGeneratedQuarters, addNotification]);

  /** Reroll: tạo seed mới → useEffect regen với cấu trúc khác (giữ thủ công + auto đã KHÓA) */
  const handleAutoReplenish = useCallback((q: number, y: number) => {
    const key = `${q}-${y}`;
    setRegenSeeds(prev => ({ ...prev, [key]: (prev[key] || 0) + 1 }));
    setGeneratedQuarters(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    const keptImportIds = new Set<string>();
    setImportOrders(prev => prev.filter(o => {
      if (o.tag !== 'auto') return true;
      const d = new Date(o.date);
      const sameQ = Math.ceil((d.getMonth() + 1) / 3) === q && d.getFullYear() === y;
      if (!sameQ) return true;
      if (o.locked) { keptImportIds.add(o.id); return true; }
      return false;
    }));
    setSalesOrders(prev => prev.filter(o => {
      if (o.tag !== 'auto') return true;
      const d = new Date(o.date);
      const sameQ = Math.ceil((d.getMonth() + 1) / 3) === q && d.getFullYear() === y;
      if (!sameQ) return true;
      return !!o.locked;
    }));
    setInventoryBatches(prev => prev.filter(b => {
      if (b.quarter !== q || b.year !== y) return true;
      return keptImportIds.has(b.importOrderId);
    }));
    addNotification(`Đang ngẫu nhiên hóa lại Q${q}/${y} (giữ đơn đã khóa)...`, 'info');
  }, [setImportOrders, setSalesOrders, setInventoryBatches, setRegenSeeds, setGeneratedQuarters, addNotification]);

  /**
   * Cân bằng quý: giữ nguyên đơn thủ công + đơn auto đã KHÓA,
   * xóa các đơn auto chưa khóa trong quý → useEffect sẽ tự sinh lại
   * sao cho tổng (manual + locked + auto mới) ≈ target.
   * KHÔNG đổi seed → cấu trúc đơn auto mới sẽ ổn định/lặp lại.
   */
  const handleRebalanceQuarter = useCallback((q: number, y: number) => {
    const key = `${q}-${y}`;
    // Invalidate generatedQuarters[key] để buộc regen, KHÔNG tăng seed
    setGeneratedQuarters(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    const keptImportIds = new Set<string>();
    setImportOrders(prev => prev.filter(o => {
      if (o.tag !== 'auto') return true;
      const d = new Date(o.date);
      const sameQ = Math.ceil((d.getMonth() + 1) / 3) === q && d.getFullYear() === y;
      if (!sameQ) return true;
      if (o.locked) { keptImportIds.add(o.id); return true; }
      return false;
    }));
    setSalesOrders(prev => prev.filter(o => {
      if (o.tag !== 'auto') return true;
      const d = new Date(o.date);
      const sameQ = Math.ceil((d.getMonth() + 1) / 3) === q && d.getFullYear() === y;
      if (!sameQ) return true;
      return !!o.locked;
    }));
    setInventoryBatches(prev => prev.filter(b => {
      if (b.quarter !== q || b.year !== y) return true;
      return keptImportIds.has(b.importOrderId);
    }));
    addNotification(`Đang cân bằng Q${q}/${y} (giữ thủ công + đơn đã khóa)...`, 'info');
  }, [setImportOrders, setSalesOrders, setInventoryBatches, setGeneratedQuarters, addNotification]);

  /**
   * Tạo thêm N đơn auto cho 1 NCC trong 1 quý, KHÔNG bị giới hạn ordersCount của rule.
   * Các đơn này sẽ chèn trực tiếp vào importOrders (không trigger full regen).
   */
  const handleGenerateAutoOrders = useCallback((q: number, y: number, supplierId: string, count: number) => {
    const supplier = activeSuppliers.find(s => s.id === supplierId);
    if (!supplier) { addNotification('Không tìm thấy nhà cung cấp', 'warning'); return; }
    const { orders, batches } = generateSupplementaryAutoOrders(q, y, supplier, activeProducts, count);
    if (orders.length === 0) {
      addNotification(`Không thể tạo đơn — không có sản phẩm phù hợp cho ${supplier.name}`, 'warning');
      return;
    }
    setImportOrders(prev => [...prev, ...orders]);
    setInventoryBatches(prev => [...prev, ...batches]);
    addNotification(`Đã tạo ${orders.length} đơn tự động cho ${supplier.name} Q${q}/${y}`, 'success');
  }, [activeSuppliers, activeProducts, setImportOrders, setInventoryBatches, addNotification]);

  const renderTab = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <DashboardPage
            quarters={quarters}
            setQuarterTarget={setQuarterTarget}
            setQuarterLock={setQuarterLock}
            rebalanceQuarters={rebalanceQuarters}
            salesOrders={salesOrders}
            importOrders={importOrders}
            products={activeProducts}
            addNotification={addNotification}
            onDataRestore={handleDataRestore}
            onTabChange={setActiveTab}
          />
        );
      case 'import':
        return (
          <ImportPage
            importOrders={importOrders}
            activeOrders={activeImportOrders}
            deletedOrders={deletedImportOrders}
            suppliers={activeSuppliers}
            products={activeProducts}
            addOrder={addImportOrder}
            deleteOrder={deleteImportOrder}
            restoreOrder={restoreImportOrder}
            permanentDeleteOrder={permanentDeleteImportOrder}
            addNotification={addNotification}
            onUpdateOrderDate={updateImportOrderDate}
            onUpdateOrder={updateImportOrder}
            isQuarterLocked={isQuarterLocked}
            quarters={quarters}
            onAutoReplenish={handleAutoReplenish}
            onClearAutoOrders={handleClearAutoOrders}
            onRebalanceQuarter={handleRebalanceQuarter}
          />
        );
      case 'inventory':
        return (
          <InventoryPage
            batches={inventoryBatches}
            suppliers={activeSuppliers}
            importOrders={importOrders}
            salesOrders={salesOrders}
            products={activeProducts}
            quarters={quarters}
            addNotification={addNotification}
          />
        );
      case 'sales':
        return <SalesPage salesOrders={salesOrders} products={activeProducts} quarters={quarters} addNotification={addNotification} />;
      case 'catalog':
        return (
          <CatalogPage
            products={products}
            activeProducts={activeProducts}
            deletedProducts={deletedProducts}
            suppliers={suppliers}
            addProduct={addProduct}
            updateProduct={updateProduct}
            softDeleteProduct={softDeleteProduct}
            restoreProduct={restoreProduct}
            permanentDeleteProduct={permanentDeleteProduct}
            moveProduct={moveProduct}
            copyProduct={copyProduct}
            reorderProducts={reorderProducts}
            updatePriceHistoryEntry={updatePriceHistoryEntry}
            addSupplier={addSupplier}
            updateSupplier={updateSupplier}
            deleteSupplier={deleteSupplier}
            restoreSupplier={restoreSupplier}
            permanentDeleteSupplier={permanentDeleteSupplier}
            addNotification={addNotification}
          />
        );
      default:
        return <PlaceholderTab tabId={activeTab} />;
    }
  };

  return (
    <div className="flex h-screen w-full flex-col bg-background">
      <Header
        theme={theme}
        toggleTheme={toggleTheme}
        notifications={notifications}
        unreadCount={unreadCount}
        onMarkRead={markRead}
        onMarkAllRead={markAllRead}
        online={online}
      />
      <div className="flex flex-1 overflow-hidden">
        <AppSidebar activeTab={activeTab} onTabChange={setActiveTab} />
        <main className="flex flex-1 flex-col overflow-hidden">
          {renderTab()}
        </main>
      </div>
      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
}

const Index = () => (
  <PeriodProvider>
    <IndexInner />
  </PeriodProvider>
);

export default Index;
