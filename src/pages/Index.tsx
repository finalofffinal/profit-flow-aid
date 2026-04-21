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
} from '@/hooks/useStore';
import { generateQuarterData, computeCarryOverStock } from '@/lib/dataEngine';
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
  const { products, activeProducts, deletedProducts, addProduct, updateProduct, softDeleteProduct, restoreProduct, permanentDeleteProduct, moveProduct, copyProduct } = useProducts();
  const { suppliers, activeSuppliers, addSupplier, updateSupplier, deleteSupplier, restoreSupplier, permanentDeleteSupplier } = useSuppliers();
  const { notifications, addNotification, markRead, markAllRead, unreadCount } = useNotifications();
  const { quarters, setQuarterTarget, setQuarterLock, rebalanceQuarters } = useQuarters();
  const { orders: importOrders, activeOrders: activeImportOrders, deletedOrders: deletedImportOrders, addOrder: addImportOrder, deleteOrder: deleteImportOrder, restoreOrder: restoreImportOrder, permanentDeleteOrder: permanentDeleteImportOrder, setOrders: setImportOrders } = useImportOrders();
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

  // One-time initial sync from Supabase WITHOUT page reload
  useEffect(() => {
    let cancelled = false;
    syncFromSupabase().then((result) => {
      if (cancelled) return;
      // Refresh in-memory state from localStorage only if remote brought new data
      if (Object.keys(result).length > 0) {
        // Force a state refresh by triggering a custom event each hook listens to via realtime
        window.dispatchEvent(new Event('supabase-initial-sync'));
      }
      setInitialSyncDone(true);
    });
    return () => { cancelled = true; };
  }, []);

  const updateImportOrderDate = useCallback((id: string, newDate: string) => {
    setImportOrders(prev => prev.map(o => o.id === id ? { ...o, date: newDate } : o));
  }, [setImportOrders]);

  // Stable signature to avoid unnecessary regen
  const quarterSig = useMemo(
    () => quarters.map(q => `${q.quarter}-${q.year}-${q.targetRevenue}-${q.locked ? 1 : 0}`).sort().join('|'),
    [quarters]
  );

  // Auto-generate import/sales/batches whenever quarters or active products change
  useEffect(() => {
    if (quarters.length === 0 || activeProducts.length === 0) return;

    const manualImports = importOrders.filter(o => o.tag !== 'auto');
    const manualSales = salesOrders.filter(o => o.tag !== 'auto');
    // Keep auto orders of LOCKED quarters as-is (frozen)
    const lockedAutoImports = importOrders.filter(o => {
      if (o.tag !== 'auto') return false;
      const d = new Date(o.date);
      const q = quarters.find(qd => qd.quarter === Math.ceil((d.getMonth() + 1) / 3) && qd.year === d.getFullYear());
      return q?.locked;
    });
    const lockedAutoSales = salesOrders.filter(o => {
      if (o.tag !== 'auto') return false;
      const d = new Date(o.date);
      const q = quarters.find(qd => qd.quarter === Math.ceil((d.getMonth() + 1) / 3) && qd.year === d.getFullYear());
      return q?.locked;
    });
    const lockedBatches = inventoryBatches.filter(b => {
      const q = quarters.find(qd => qd.quarter === b.quarter && qd.year === b.year);
      return q?.locked;
    });

    let allAutoImports: typeof importOrders = [];
    let allAutoSales: typeof salesOrders = [];
    let allAutoBatches: typeof inventoryBatches = [];

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

      // Compute carry-over: include all manual + locked-auto + already-generated previous-quarter auto data
      const allImportsSoFar = [...manualImports, ...lockedAutoImports, ...allAutoImports];
      const allSalesSoFar = [...manualSales, ...lockedAutoSales, ...allAutoSales];
      const carryOver = computeCarryOverStock(q.quarter, q.year, activeProducts, allImportsSoFar, allSalesSoFar);

      const generated = generateQuarterData(q, activeProducts, activeSuppliers, qManualImports, qManualSales, carryOver);
      allAutoImports.push(...generated.importOrders);
      allAutoSales.push(...generated.salesOrders);
      allAutoBatches.push(...generated.inventoryBatches);
    }

    setImportOrders([...manualImports, ...lockedAutoImports, ...allAutoImports]);
    setSalesOrders([...manualSales, ...lockedAutoSales, ...allAutoSales]);
    setInventoryBatches([...lockedBatches, ...allAutoBatches]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quarterSig, activeProducts.length]);

  const handleDataRestore = useCallback(() => {
    // Don't reload page; trigger a soft re-render
    addNotification('Khôi phục thành công, dữ liệu đã làm mới', 'success');
  }, [addNotification]);

  // Lock helper: a quarter is locked
  const isQuarterLocked = useCallback((q: number, y: number) => {
    return !!quarters.find(qd => qd.quarter === q && qd.year === y && qd.locked);
  }, [quarters]);

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
            isQuarterLocked={isQuarterLocked}
          />
        );
      case 'inventory':
        return (
          <InventoryPage
            batches={inventoryBatches}
            suppliers={activeSuppliers}
            importOrders={importOrders}
            salesOrders={salesOrders}
          />
        );
      case 'sales':
        return <SalesPage salesOrders={salesOrders} />;
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
