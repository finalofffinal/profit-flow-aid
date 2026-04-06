import { useState } from 'react';
import { Header } from '@/components/layout/Header';
import { BottomNav } from '@/components/layout/BottomNav';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { CatalogPage } from '@/components/catalog/CatalogPage';
import { PlaceholderTab } from '@/components/PlaceholderTab';
import { useProducts, useSuppliers, useNotifications, useTheme } from '@/hooks/useStore';
import { TabId } from '@/types';

const Index = () => {
  const [activeTab, setActiveTab] = useState<TabId>('catalog');
  const { theme, toggleTheme } = useTheme();
  const { products, activeProducts, deletedProducts, addProduct, updateProduct, softDeleteProduct, restoreProduct, permanentDeleteProduct, moveProduct, copyProduct } = useProducts();
  const { suppliers, addSupplier, updateSupplier, deleteSupplier } = useSuppliers();
  const { notifications, addNotification, markRead, markAllRead, unreadCount } = useNotifications();

  const renderTab = () => {
    switch (activeTab) {
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
            addNotification={addNotification}
          />
        );
      default:
        return <PlaceholderTab tabId={activeTab as Exclude<TabId, 'catalog'>} />;
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
