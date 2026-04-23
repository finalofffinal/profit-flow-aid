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
import { generateQuarterData, computeCarryOverStock, computeInventorySnapshot, generateSupplementaryOrder, DATA_ENGINE_VERSION } from '@/lib/dataEngine';
import { syncFromSupabase } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import { TabId } from '@/types';
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

  // Stable signature to avoid unnecessary regen (includes regenSeeds + manual data changes)
  const quarterSig = useMemo(
    () => [
      DATA_ENGINE_VERSION,
      quarters.map(q => `${q.quarter}-${q.year}-${q.targetRevenue}-${q.locked ? 1 : 0}-${regenSeeds[`${q.quarter}-${q.year}`] || 0}`).sort().join('|'),
      manualImportSig,
      manualSalesSig,
      lockedAutoSig,
      productSig,
      supplierSig,
    ].join('||'),
    [DATA_ENGINE_VERSION, quarters, regenSeeds, manualImportSig, manualSalesSig, lockedAutoSig, productSig, supplierSig]
  );

  // Auto-generate import/sales/batches whenever quarters or active products change
  useEffect(() => {
    if (quarters.length === 0 || activeProducts.length === 0) return;

    const manualImports = importOrders.filter(o => o.tag !== 'auto');
    const manualSales = salesOrders.filter(o => o.tag !== 'auto');
    // Keep auto orders of LOCKED quarters as-is (frozen)
    // ALSO keep individual auto orders user has flagged with locked=true
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
    const lockedBatches = inventoryBatches.filter(b => {
      const q = quarters.find(qd => qd.quarter === b.quarter && qd.year === b.year);
      if (q?.locked) return true;
      // Keep batches tied to a locked auto import order
      return lockedAutoImports.some(o => o.id === b.importOrderId);
    });

    let allAutoImports: typeof importOrders = [];
    let allAutoSales: typeof salesOrders = [];

    // Sort quarters chronologically so carry-over compounds correctly
    const sortedQs = [...quarters].sort((a, b) =>
      a.year !== b.year ? a.year - b.year : a.quarter - b.quarter
    );

    for (const q of sortedQs) {
      if (q.targetRevenue <= 0 || q.locked) continue;
      const qManualSales = manualSales.filter(o => {
        const d = new Date(o.date);
        return Math.ceil((d.getMonth() + 1) / 3) === q.quarter && d.getFullYear() === q.year;
      });
      const qManualImports = manualImports.filter(o => {
        const d = new Date(o.date);
        return Math.ceil((d.getMonth() + 1) / 3) === q.quarter && d.getFullYear() === q.year;
      });
      // Auto orders đã KHÓA của quý này — coi như "đã có sẵn" để regen trừ ra
      const qFrozenAutoImports = lockedAutoImports.filter(o => {
        const d = new Date(o.date);
        return Math.ceil((d.getMonth() + 1) / 3) === q.quarter && d.getFullYear() === q.year;
      });
      const qFrozenAutoSales = lockedAutoSales.filter(o => {
        const d = new Date(o.date);
        return Math.ceil((d.getMonth() + 1) / 3) === q.quarter && d.getFullYear() === q.year;
      });

      const allImportsSoFar = [...manualImports, ...lockedAutoImports, ...allAutoImports];
      const allSalesSoFar = [...manualSales, ...lockedAutoSales, ...allAutoSales];
      const carryOver = computeCarryOverStock(q.quarter, q.year, activeProducts, allImportsSoFar, allSalesSoFar);

      const seedKey = `${q.quarter}-${q.year}`;
      const qWithSeed = { ...q, regenSeed: regenSeeds[seedKey] || 0 } as any;
      // Truyền các đơn locked-auto như "manual" để generator trừ ra phần đã có
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

    const finalImports = [...manualImports, ...lockedAutoImports, ...allAutoImports];
    const finalSales = [...manualSales, ...lockedAutoSales, ...allAutoSales];
    const recomputedBatches = sortedQs.flatMap(q => {
      if (q.locked) return [] as typeof inventoryBatches;
      return computeInventorySnapshot(q.quarter, q.year, activeProducts, finalImports, finalSales);
    });

    setImportOrders(finalImports);
    setSalesOrders(finalSales);
    setInventoryBatches([...lockedBatches, ...recomputedBatches]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quarterSig]);

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
  }, [setImportOrders, setSalesOrders, setInventoryBatches, addNotification]);

  /** Reroll: tạo seed mới → useEffect regen với cấu trúc khác (giữ thủ công + auto đã KHÓA) */
  const handleAutoReplenish = useCallback((q: number, y: number) => {
    const key = `${q}-${y}`;
    setRegenSeeds(prev => ({ ...prev, [key]: (prev[key] || 0) + 1 }));
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
  }, [setImportOrders, setSalesOrders, setInventoryBatches, addNotification]);

  /** Tạo NHIỀU đơn nhập "bổ sung" để bù số tiền thiếu cho 1 quý — chia đều nhiều NCC */
  const handleCreateSupplementary = useCallback((q: number, y: number, shortfall: number) => {
    const orders = generateSupplementaryOrder(q, y, shortfall, activeProducts, activeSuppliers);
    if (!orders || orders.length === 0) {
      addNotification('Không thể tạo đơn bù: thiếu sản phẩm/NCC hợp lệ', 'warning');
      return;
    }
    orders.forEach(o => addImportOrder(o));
    addNotification(`Đã tạo ${orders.length} đơn bù phân bổ cho ${orders.length} NCC`, 'success');
  }, [activeProducts, activeSuppliers, addImportOrder, addNotification]);

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
            onCreateSupplementaryOrder={handleCreateSupplementary}
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
