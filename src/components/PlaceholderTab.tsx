import { LayoutDashboard, Truck, Warehouse, ShoppingCart } from 'lucide-react';
import { TabId } from '@/types';

const placeholders: Record<Exclude<TabId, 'catalog'>, { icon: typeof LayoutDashboard; label: string; desc: string }> = {
  dashboard: { icon: LayoutDashboard, label: 'Tổng quan', desc: 'Dashboard tài chính sẽ được triển khai ở Giai đoạn 2' },
  import: { icon: Truck, label: 'Nhập hàng', desc: 'Quản lý đơn nhập sẽ được triển khai ở Giai đoạn 3' },
  inventory: { icon: Warehouse, label: 'Kho hàng', desc: 'Quản lý tồn kho sẽ được triển khai ở Giai đoạn 3' },
  sales: { icon: ShoppingCart, label: 'Bán hàng', desc: 'Nhật ký bán hàng sẽ được triển khai ở Giai đoạn 4' },
};

export function PlaceholderTab({ tabId }: { tabId: Exclude<TabId, 'catalog'> }) {
  const info = placeholders[tabId];
  const Icon = info.icon;
  
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
          <Icon className="h-8 w-8 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-foreground">{info.label}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{info.desc}</p>
        </div>
      </div>
    </div>
  );
}
