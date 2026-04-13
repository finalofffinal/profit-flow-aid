import { useState, useCallback, useEffect } from 'react';
import { Header } from '@/components/layout/Header';
import { BottomNav } from '@/components/layout/BottomNav';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { CatalogPage } from '@/components/catalog/CatalogPage';
import { DashboardPage } from '@/components/dashboard/DashboardPage';
import { ImportPage } from '@/components/import/ImportPage';
import { InventoryPage } from '@/components/inventory/InventoryPage';
import { SalesPage } from '@/components/sales/SalesPage';
import { PlaceholderTab } from '@/components/PlaceholderTab';
import { useProducts, useSuppliers, useNotifications, useTheme, useQuarters, useImportOrders, useSalesOrders, useInventoryBatches } from '@/hooks/useStore';
import { generateQuarterData } from '@/lib/dataEngine';
import { syncFromSupabase } from '@/lib/storage';
import { TabId } from '@/types';

const Index = () => {
  const [activeTab, setActiveTab] = useState<TabId>('catalog');
  const [supabaseSynced, setSupabaseSynced] = useState(false);

  // Sync from Supabase on first load
  useEffect(() => {
    syncFromSupabase().then((synced) => {
      if (synced) {
        setSupabaseSynced(true);
        window.location.reload();
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const { theme, toggleTheme } = useTheme();
  const { products, activeProducts, deletedProducts, addProduct, updateProduct, softDeleteProduct, restoreProduct, permanentDeleteProduct, moveProduct, copyProduct, setProducts } = useProducts();
  const { suppliers, activeSuppliers, addSupplier, updateSupplier, deleteSupplier, restoreSupplier, permanentDeleteSupplier, setSuppliers } = useSuppliers();
  const { notifications, addNotification, markRead, markAllRead, unreadCount } = useNotifications();
  const { quarters, setQuarterTarget, setQuarters } = useQuarters();
  const { orders: importOrders, activeOrders: activeImportOrders, deletedOrders: deletedImportOrders, addOrder: addImportOrder, deleteOrder: deleteImportOrder, restoreOrder: restoreImportOrder, permanentDeleteOrder: permanentDeleteImportOrder, setOrders: setImportOrders } = useImportOrders();

  const updateImportOrderDate = useCallback((id: string, newDate: string) => {
    setImportOrders(prev => prev.map(o => o.id === id ? { ...o, date: newDate } : o));
  }, [setImportOrders]);
  const { orders: salesOrders, activeOrders: activeSalesOrders, addOrder: addSaleOrder, deleteOrder: deleteSaleOrder, setOrders: setSalesOrders } = useSalesOrders();
  const { batches: inventoryBatches, setBatches: setInventoryBatches } = useInventoryBatches();

  useEffect(() => {
    if (quarters.length === 0 || activeProducts.length === 0) return;

    const manualImports = importOrders.filter(o => o.tag !== 'auto');
    const manualSales = salesOrders.filter(o => o.tag !== 'auto');

    let allAutoImports: typeof importOrders = [];
    let allAutoSales: typeof salesOrders = [];
    let allAutoBatches: typeof inventoryBatches = [];

    for (const q of quarters) {
      if (q.targetRevenue <= 0) continue;
      const qManualSales = manualSales.filter(o => {
        const d = new Date(o.date);
        return Math.ceil((d.getMonth() + 1) / 3) === q.quarter && d.getFullYear() === q.year;
      });
      const qManualImports = manualImports.filter(o => {
        const d = new Date(o.date);
        return Math.ceil((d.getMonth() + 1) / 3) === q.quarter && d.getFullYear() === q.year;
      });

      const generated = generateQuarterData(q, activeProducts, activeSuppliers, qManualImports, qManualSales);
      allAutoImports.push(...generated.importOrders);
      allAutoSales.push(...generated.salesOrders);
      allAutoBatches.push(...generated.inventoryBatches);
    }

    setImportOrders([...manualImports, ...allAutoImports]);
    setSalesOrders([...manualSales, ...allAutoSales]);
    setInventoryBatches(allAutoBatches);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quarters.map(q => `${q.quarter}-${q.year}-${q.targetRevenue}`).join(','), activeProducts.length]);

  const handleDataRestore = useCallback(() => {
    window.location.reload();
  }, []);

  const renderTab = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <DashboardPage
            quarters={quarters}
            setQuarterTarget={setQuarterTarget}
            salesOrders={salesOrders}
            importOrders={importOrders}
            addNotification={addNotification}
            onDataRestore={handleDataRestore}
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
};

export default Index;
