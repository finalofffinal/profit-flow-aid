import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export type TimeRange = 'all' | 'today' | 'week' | 'month' | 'quarter' | 'custom';

interface TimeRangeFilterProps {
  value: TimeRange;
  onChange: (r: TimeRange) => void;
  customFrom: string;
  customTo: string;
  onCustomFromChange: (v: string) => void;
  onCustomToChange: (v: string) => void;
}

const LABELS: Record<TimeRange, string> = {
  today: 'Hôm nay',
  week: 'Tuần',
  month: 'Tháng',
  quarter: 'Quý',
  all: 'Tất cả',
  custom: 'Tùy chọn',
};

export function TimeRangeFilter({ value, onChange, customFrom, customTo, onCustomFromChange, onCustomToChange }: TimeRangeFilterProps) {
  return (
    <div className="space-y-2">
      <div className="flex gap-1.5 overflow-x-auto">
        {(['today', 'week', 'month', 'quarter', 'all', 'custom'] as TimeRange[]).map(r => (
          <Button
            key={r}
            size="sm"
            variant={value === r ? 'default' : 'outline'}
            className="h-7 text-xs shrink-0"
            onClick={() => onChange(r)}
          >
            {LABELS[r]}
          </Button>
        ))}
      </div>
      {value === 'custom' && (
        <div className="flex gap-2">
          <Input type="date" className="h-8 text-xs" value={customFrom} onChange={e => onCustomFromChange(e.target.value)} />
          <Input type="date" className="h-8 text-xs" value={customTo} onChange={e => onCustomToChange(e.target.value)} />
        </div>
      )}
    </div>
  );
}

/** Filter dates within selected range. Quarter/today/etc relative to selQ/selYear context. */
export function filterByTimeRange<T extends { date: string }>(
  items: T[],
  range: TimeRange,
  selQ: number,
  selYear: number,
  customFrom: string,
  customTo: string
): T[] {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  return items.filter(it => {
    const day = it.date.split('T')[0];
    const d = new Date(day);
    switch (range) {
      case 'today':
        return day === todayStr;
      case 'week': {
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay() + 1);
        weekStart.setHours(0, 0, 0, 0);
        return d >= weekStart && d <= now;
      }
      case 'month':
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      case 'quarter': {
        const dq = Math.ceil((d.getMonth() + 1) / 3);
        return dq === selQ && d.getFullYear() === selYear;
      }
      case 'custom': {
        if (!customFrom || !customTo) return true;
        return day >= customFrom && day <= customTo;
      }
      default:
        return true;
    }
  });
}
