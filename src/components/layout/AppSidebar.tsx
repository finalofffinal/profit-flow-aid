import { LayoutDashboard, Truck, Warehouse, ShoppingCart, Tag, PanelLeftClose, PanelLeft } from 'lucide-react';
import { useState } from 'react';
import { TabId } from '@/types';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface AppSidebarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

// New order: Tổng quan → Danh mục → Nhập hàng → Kho hàng → Bán hàng
const tabs: { id: TabId; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Tổng quan', icon: LayoutDashboard },
  { id: 'catalog', label: 'Danh mục', icon: Tag },
  { id: 'import', label: 'Nhập hàng', icon: Truck },
  { id: 'inventory', label: 'Kho hàng', icon: Warehouse },
  { id: 'sales', label: 'Bán hàng', icon: ShoppingCart },
];

export function AppSidebar({ activeTab, onTabChange }: AppSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`hidden md:flex flex-col border-r transition-all duration-200 ${collapsed ? 'w-14' : 'w-52'}`}
      style={{ background: 'hsl(var(--sidebar-background))' }}
    >
      <div className={`flex items-center border-b p-2 ${collapsed ? 'justify-center' : 'justify-end'}`} style={{ borderColor: 'hsl(var(--sidebar-border))' }}>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-sidebar-foreground hover:bg-sidebar-accent" onClick={() => setCollapsed(!collapsed)}>
          {collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </Button>
      </div>
      <nav className="flex flex-1 flex-col gap-1 p-2">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const btn = (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ${
                isActive ? 'bg-primary text-primary-foreground shadow-sm' : 'text-sidebar-foreground hover:bg-sidebar-accent/60'
              } ${collapsed ? 'justify-center px-0' : ''}`}
            >
              <Icon className="h-4.5 w-4.5 shrink-0" />
              {!collapsed && <span>{tab.label}</span>}
            </button>
          );
          if (collapsed) {
            return (
              <Tooltip key={tab.id}>
                <TooltipTrigger asChild>{btn}</TooltipTrigger>
                <TooltipContent side="right">{tab.label}</TooltipContent>
              </Tooltip>
            );
          }
          return btn;
        })}
      </nav>
    </aside>
  );
}
