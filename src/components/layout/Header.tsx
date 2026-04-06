import { useState, useEffect } from 'react';
import { Sun, Moon, Bell, ChevronDown, ChevronUp } from 'lucide-react';
import { formatLunarDate, getCurrentQuarter } from '@/lib/lunar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Notification } from '@/types';

interface HeaderProps {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  notifications: Notification[];
  unreadCount: number;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
}

export function Header({ theme, toggleTheme, notifications, unreadCount, onMarkRead, onMarkAllRead }: HeaderProps) {
  const [time, setTime] = useState(new Date());
  const [showInfo, setShowInfo] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const quarter = getCurrentQuarter(time);
  const lunarDate = formatLunarDate(time);
  const solarDate = time.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
  const timeStr = time.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <header className="sticky top-0 z-40 glass-toolbar border-b border-border">
      <div className="flex items-center justify-between px-3 py-2 md:px-4">
        {/* Left: App name & quarter */}
        <div className="flex items-center gap-2">
          <h1 className="text-base font-bold tracking-tight text-foreground md:text-lg">Sổ Doanh Thu</h1>
          <Badge variant="outline" className="hidden text-xs font-semibold sm:inline-flex">
            Q{quarter}/{time.getFullYear()}
          </Badge>
        </div>

        {/* Center: Clock & date */}
        <div className="hidden flex-col items-center md:flex">
          <span className="text-sm font-semibold tabular-nums text-foreground">{timeStr}</span>
          <span className="text-xs text-muted-foreground">{solarDate} · AL: {lunarDate}</span>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1">
          <Badge variant="outline" className="text-xs font-semibold sm:hidden">
            Q{quarter}
          </Badge>
          
          {/* Notification Bell */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="relative">
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-crimson text-[10px] font-bold text-crimson-foreground">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72 max-h-80 overflow-y-auto">
              <div className="flex items-center justify-between px-2 py-1.5 border-b">
                <span className="text-sm font-semibold">Thông báo</span>
                {unreadCount > 0 && (
                  <Button variant="ghost" size="sm" className="text-xs h-6" onClick={onMarkAllRead}>
                    Đọc tất cả
                  </Button>
                )}
              </div>
              {notifications.slice(0, 20).map(n => (
                <DropdownMenuItem key={n.id} className={`flex flex-col items-start gap-0.5 ${!n.read ? 'bg-accent/50' : ''}`} onClick={() => onMarkRead(n.id)}>
                  <span className="text-xs">{n.message}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(n.createdAt).toLocaleString('vi-VN')}
                  </span>
                </DropdownMenuItem>
              ))}
              {notifications.length === 0 && (
                <div className="px-2 py-4 text-center text-xs text-muted-foreground">Không có thông báo</div>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Theme Toggle */}
          <Button variant="ghost" size="icon" onClick={toggleTheme}>
            {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </Button>

          {/* Business Info Toggle */}
          <Button variant="ghost" size="sm" className="hidden text-xs md:inline-flex" onClick={() => setShowInfo(!showInfo)}>
            Thông tin KD
            {showInfo ? <ChevronUp className="ml-1 h-3 w-3" /> : <ChevronDown className="ml-1 h-3 w-3" />}
          </Button>
        </div>
      </div>

      {/* Mobile: date row */}
      <div className="flex items-center justify-center gap-2 border-t border-border px-3 py-1 text-xs text-muted-foreground md:hidden">
        <span className="tabular-nums font-medium">{timeStr}</span>
        <span>·</span>
        <span>{time.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}</span>
        <span>·</span>
        <span>AL: {lunarDate}</span>
      </div>

      {/* Collapsible Business Info */}
      {showInfo && (
        <div className="border-t border-border bg-card/50 px-4 py-3 text-xs text-muted-foreground animate-in slide-in-from-top-2">
          <div className="grid gap-1 md:grid-cols-2">
            <div><span className="font-semibold text-foreground">Hộ kinh doanh:</span> Hồ Thị Hoa</div>
            <div><span className="font-semibold text-foreground">MST:</span> 079154014218</div>
            <div><span className="font-semibold text-foreground">Địa chỉ:</span> Chợ An Sương, Sạp 61 — 2421A Đỗ Mười, Đông Hưng Thuận, TP.HCM</div>
            <div><span className="font-semibold text-foreground">Ngành:</span> Bán tạp hóa · SĐT: 0938774411</div>
          </div>
        </div>
      )}
    </header>
  );
}
