import { useState, useEffect } from 'react';
import { Sun, Moon, Bell, Info, Cloud, CloudOff, CalendarDays } from 'lucide-react';
import { formatLunarDateFull } from '@/lib/lunar';
import { BUSINESS_INFO } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Notification } from '@/types';
import { usePeriod, AVAILABLE_YEARS } from '@/contexts/PeriodContext';
import { AdminAuthButton } from '@/components/auth/AdminAuthButton';

interface HeaderProps {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  notifications: Notification[];
  unreadCount: number;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  online: boolean;
}

function getGMT7Time(): Date {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utc + 7 * 3600000);
}

export function Header({ theme, toggleTheme, notifications, unreadCount, onMarkRead, onMarkAllRead, online }: HeaderProps) {
  const [time, setTime] = useState(getGMT7Time);
  const [showInfo, setShowInfo] = useState(false);
  const [showDates, setShowDates] = useState(false); // mobile: lunar/solar hidden by default
  const { quarter, year, setQuarter, setYear } = usePeriod();

  useEffect(() => {
    const timer = setInterval(() => setTime(getGMT7Time()), 1000);
    return () => clearInterval(timer);
  }, []);

  const lunarDate = formatLunarDateFull(time);
  const solarDate = time.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
  const solarShort = time.toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' });
  const hours = String(time.getHours()).padStart(2, '0');
  const minutes = String(time.getMinutes()).padStart(2, '0');
  const seconds = String(time.getSeconds()).padStart(2, '0');

  return (
    <header className="sticky top-0 z-50 border-b-2 border-primary/40 bg-gradient-to-r from-primary/10 via-primary/5 to-primary/10 backdrop-blur-xl shadow-sm">
      <div className="flex items-center gap-1.5 px-2 py-1.5 md:gap-2 md:px-5 md:py-3">
        {/* Left: Quarter + Year selectors — compact on mobile */}
        <div className="flex items-center gap-1 shrink-0">
          <Select value={String(quarter)} onValueChange={v => setQuarter(Number(v))}>
            <SelectTrigger className="h-8 w-[62px] md:h-9 md:w-[92px] px-2 font-bold text-xs md:text-sm bg-primary/10 border-primary/40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4].map(q => (
                <SelectItem key={q} value={String(q)} className="font-bold">Quý {q}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
            <SelectTrigger className="h-8 w-[64px] md:h-9 md:w-[92px] px-2 font-bold text-xs md:text-sm bg-primary/10 border-primary/40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AVAILABLE_YEARS.map(y => (
                <SelectItem key={y} value={String(y)} className="font-bold">{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="ghost" size="icon" className="h-8 w-8 hidden md:inline-flex" onClick={() => setShowInfo(!showInfo)} title="Thông tin kinh doanh">
            <Info className="h-4 w-4" />
          </Button>
        </div>

        {/* Center: Clock */}
        <div className="flex flex-col items-center min-w-0 flex-1">
          <div className="flex items-baseline gap-0.5">
            <span className="text-xl md:text-4xl font-black tabular-nums tracking-tight text-primary leading-none">
              {hours}:{minutes}
            </span>
            <span className="hidden sm:inline text-sm md:text-lg font-bold tabular-nums text-primary/60">:{seconds}</span>
          </div>
          {/* Desktop: full dates */}
          <div className="hidden md:flex flex-col items-center gap-0.5 mt-1">
            <span className="text-base font-black text-foreground tracking-tight">{solarDate}</span>
            <span className="text-sm font-bold text-primary/85">Âm lịch: {lunarDate}</span>
          </div>
        </div>

        {/* Right: actions — compact on mobile */}
        <div className="flex items-center gap-0.5 shrink-0">
          <AdminAuthButton />

          {/* Mobile: toggle dates panel */}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 md:hidden"
            onClick={() => setShowDates(!showDates)}
            title="Hiện/ẩn lịch"
          >
            <CalendarDays className="h-4 w-4" />
          </Button>

          {/* Sync status — desktop only */}
          <div title={online ? 'Đã đồng bộ Cloud' : 'Mất kết nối Cloud'} className={`hidden md:flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${online ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' : 'bg-destructive/15 text-destructive'}`}>
            {online ? <Cloud className="h-3 w-3" /> : <CloudOff className="h-3 w-3" />}
            <span>{online ? 'Online' : 'Offline'}</span>
          </div>

          {/* Mobile: tiny online dot */}
          <span
            title={online ? 'Online' : 'Offline'}
            className={`md:hidden h-2 w-2 rounded-full ${online ? 'bg-emerald-500' : 'bg-destructive'}`}
          />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="relative h-8 w-8 md:h-9 md:w-9">
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 md:h-5 md:w-5 items-center justify-center rounded-full bg-destructive text-[9px] md:text-[10px] font-bold text-destructive-foreground shadow-sm">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72 max-h-80 overflow-y-auto">
              <div className="flex items-center justify-between px-2 py-1.5 border-b">
                <span className="text-sm font-semibold">Thông báo</span>
                {unreadCount > 0 && (
                  <Button variant="ghost" size="sm" className="text-xs h-6" onClick={onMarkAllRead}>Đọc tất cả</Button>
                )}
              </div>
              {notifications.slice(0, 20).map(n => (
                <DropdownMenuItem key={n.id} className={`flex flex-col items-start gap-0.5 ${!n.read ? 'bg-accent/50' : ''}`} onClick={() => onMarkRead(n.id)}>
                  <span className="text-xs">{n.message}</span>
                  <span className="text-[10px] text-muted-foreground">{new Date(n.createdAt).toLocaleString('vi-VN')}</span>
                </DropdownMenuItem>
              ))}
              {notifications.length === 0 && (
                <div className="px-2 py-4 text-center text-xs text-muted-foreground">Không có thông báo</div>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button variant="ghost" size="icon" className="h-8 w-8 md:h-9 md:w-9" onClick={toggleTheme}>
            {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Mobile: dates panel — HIDDEN by default, toggled by button */}
      {showDates && (
        <div className="flex flex-col gap-0.5 border-t border-primary/20 bg-primary/5 px-3 py-1.5 md:hidden animate-in slide-in-from-top-1">
          <span className="text-xs font-bold text-foreground">{solarDate}</span>
          <span className="text-[11px] font-semibold text-primary/85">Âm lịch: {lunarDate}</span>
        </div>
      )}

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
