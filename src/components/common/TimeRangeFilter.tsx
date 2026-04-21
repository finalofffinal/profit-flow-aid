import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export type TimeRange = 'today' | 'week' | 'month' | 'quarter' | 'custom';

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
  custom: 'Tùy chọn',
};

export function TimeRangeFilter({ value, onChange, customFrom, customTo, onCustomFromChange, onCustomToChange }: TimeRangeFilterProps) {
  return (
    <div className="space-y-2">
      <div className="flex gap-1.5 overflow-x-auto">
        {(['today', 'week', 'month', 'quarter', 'custom'] as TimeRange[]).map(r => (
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

/**
 * Filter dates by range, ALWAYS scoped to selected quarter (selQ/selYear) from Header.
 * - quarter: full selected quarter
 * - month: month within selected quarter that contains "today" (or first month of quarter if today is outside)
 * - week: 7-day window inside selected quarter
 * - today: today if it falls inside selected quarter; else first day of quarter
 * - custom: explicit range, but still clipped to selected quarter
 */
export function filterByTimeRange<T extends { date: string }>(
  items: T[],
  range: TimeRange,
  selQ: number,
  selYear: number,
  customFrom: string,
  customTo: string
): T[] {
  const startMonth = (selQ - 1) * 3;
  const qStart = new Date(selYear, startMonth, 1);
  const qEnd = new Date(selYear, startMonth + 3, 0, 23, 59, 59, 999);

  const now = new Date();
  const todayInQuarter = now >= qStart && now <= qEnd;
  const anchor = todayInQuarter ? now : qStart;
  const todayStr = anchor.toISOString().split('T')[0];

  return items.filter(it => {
    const day = it.date.split('T')[0];
    const d = new Date(day);
    // First: must be inside the selected quarter, always
    if (d < qStart || d > qEnd) return false;

    switch (range) {
      case 'today':
        return day === todayStr;
      case 'week': {
        const weekStart = new Date(anchor);
        weekStart.setDate(anchor.getDate() - ((anchor.getDay() + 6) % 7));
        weekStart.setHours(0, 0, 0, 0);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        weekEnd.setHours(23, 59, 59, 999);
        return d >= weekStart && d <= weekEnd;
      }
      case 'month':
        return d.getMonth() === anchor.getMonth() && d.getFullYear() === anchor.getFullYear();
      case 'quarter':
        return true; // already clipped
      case 'custom': {
        if (!customFrom || !customTo) return true;
        return day >= customFrom && day <= customTo;
      }
      default:
        return true;
    }
  });
}
