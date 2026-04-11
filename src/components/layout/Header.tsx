import { useState, useEffect } from 'react';
import { Sun, Moon, Bell, ChevronDown, ChevronUp, Info } from 'lucide-react';
import { formatLunarDate, getCurrentQuarter } from '@/lib/lunar';
import { BUSINESS_INFO } from '@/lib/constants';
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

function getGMT7Time(): Date {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utc + 7 * 3600000);
}

export function Header({ theme, toggleTheme, notifications, unreadCount, onMarkRead, onMarkAllRead }: HeaderProps) {
  const [time, setTime] = useState(getGMT7Time);
  const [showInfo, setShowInfo] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setTime(getGMT7Time()), 1000);
    return () => clearInterval(timer);
  }, []);

  const quarter = getCurrentQuarter(time);
  const lunarDate = formatLunarDate(time);
  const solarDate = time.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
  const hours = String(time.getHours()).padStart(2, '0');
  const minutes = String(time.getMinutes()).padStart(2, '0');
  const seconds = String(time.getSeconds()).padStart(2, '0');

  return (
    <header className="sticky top-0 z-50 border-b-2 border-primary/30 bg-gradient-to-r from-primary/10 via-background to-primary/10 backdrop-blur-xl shadow-md">
      <div className="flex items-center justify-between px-3 py-2.5 md:px-5">
        {/* Left: Quarter/Year + Info toggle */}
        <div className="flex items-center gap-2">
          <Badge className="bg-primary text-primary-foreground font-black text-sm px-3 py-1 shadow-sm">
            Q{quarter}/{time.getFullYear()}
          </Badge>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowInfo(!showInfo)} title="Thông tin kinh doanh">
            <Info className="h-4 w-4" />
          </Button>
        </div>

        {/* Center: Clock */}
        <div className="flex flex-col items-center">
          <div className="flex items-baseline gap-0.5">
            <span className="text-2xl md:text-3xl font-black tabular-nums tracking-tight text-primary">
              {hours}:{minutes}
            </span>
            <span className="text-sm md:text-base font-bold tabular-nums text-primary/60">
              :{seconds}
            </span>
          </div>
          <div className="hidden md:flex items-center gap-1.5 text-[11px] text-muted-foreground mt-0.5">
            <span>{solarDate}</span>
            <span className="text-primary/40">·</span>
            <span>AL: {lunarDate}</span>
          </div>
        </div>

        {/* Right: Notifications + Theme */}
        <div className="flex items-center gap-1">
          {/* Notification Bell */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="relative h-9 w-9">
                <Bell className="h-4.5 w-4.5" />
                {unreadCount > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground shadow-sm">
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
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={toggleTheme}>
            {theme === 'light' ? <Moon className="h-4.5 w-4.5" /> : <Sun className="h-4.5 w-4.5" />}
          </Button>
        </div>
      </div>

      {/* Mobile: date row */}
      <div className="flex items-center justify-center gap-2 border-t border-primary/10 px-3 py-1 text-[11px] text-muted-foreground md:hidden">
        <span>{time.toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' })}</span>
        <span className="text-primary/40">·</span>
        <span>AL: {lunarDate}</span>
      </div>

      {/* Collapsible Business Info */}
      {showInfo && (
        <div className="border-t border-primary/15 bg-card/80 backdrop-blur px-4 py-3 text-xs text-muted-foreground animate-in slide-in-from-top-2">
          <div className="grid gap-1.5 md:grid-cols-2 max-w-3xl mx-auto">
            <div><span className="font-bold text-foreground">Hộ kinh doanh:</span> {BUSINESS_INFO.name}</div>
            <div><span className="font-bold text-foreground">MST:</span> {BUSINESS_INFO.taxId}</div>
            <div className="md:col-span-2"><span className="font-bold text-foreground">Địa điểm:</span> {BUSINESS_INFO.address}, {BUSINESS_INFO.stall}</div>
            <div><span className="font-bold text-foreground">Ngành:</span> {BUSINESS_INFO.industry}</div>
            <div><span className="font-bold text-foreground">SĐT:</span> {BUSINESS_INFO.phone}</div>
          </div>
        </div>
      )}
    </header>
  );
}
