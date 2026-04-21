import { LayoutDashboard, Truck, Warehouse, ShoppingCart, Tag } from 'lucide-react';
import { TabId } from '@/types';

interface BottomNavProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

const tabs: { id: TabId; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Tổng quan', icon: LayoutDashboard },
  { id: 'catalog', label: 'Danh mục', icon: Tag },
  { id: 'import', label: 'Nhập hàng', icon: Truck },
  { id: 'inventory', label: 'Kho hàng', icon: Warehouse },
  { id: 'sales', label: 'Bán hàng', icon: ShoppingCart },
];

export function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t-2 border-primary/30 bg-background/95 backdrop-blur md:hidden">
      <div className="flex items-stretch" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-2 transition-colors min-h-[52px] ${
                isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className={`h-5 w-5 ${isActive ? 'stroke-[2.5]' : ''}`} />
              <span className={`text-[10px] leading-tight ${isActive ? 'font-bold' : 'font-medium'}`}>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
