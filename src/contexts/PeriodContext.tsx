import { createContext, useContext, useState, useMemo, ReactNode } from 'react';

interface PeriodContextValue {
  quarter: number;
  year: number;
  setQuarter: (q: number) => void;
  setYear: (y: number) => void;
  quarterStart: Date;
  quarterEnd: Date;
}

const PeriodContext = createContext<PeriodContextValue | null>(null);

export const AVAILABLE_YEARS = [2026, 2027, 2028, 2029, 2030] as const;

export function PeriodProvider({ children }: { children: ReactNode }) {
  const now = new Date();
  const defaultYear = AVAILABLE_YEARS.includes(now.getFullYear() as 2026) ? now.getFullYear() : 2026;
  const defaultQ = Math.ceil((now.getMonth() + 1) / 3);

  const [quarter, setQuarter] = useState(defaultQ);
  const [year, setYear] = useState(defaultYear);

  const value = useMemo<PeriodContextValue>(() => {
    const startMonth = (quarter - 1) * 3;
    const quarterStart = new Date(year, startMonth, 1);
    const quarterEnd = new Date(year, startMonth + 3, 0, 23, 59, 59, 999);
    return { quarter, year, setQuarter, setYear, quarterStart, quarterEnd };
  }, [quarter, year]);

  return <PeriodContext.Provider value={value}>{children}</PeriodContext.Provider>;
}

export function usePeriod(): PeriodContextValue {
  const ctx = useContext(PeriodContext);
  if (!ctx) throw new Error('usePeriod must be used inside PeriodProvider');
  return ctx;
}

export function isInQuarter(dateStr: string, q: number, year: number): boolean {
  const d = new Date(dateStr);
  if (d.getFullYear() !== year) return false;
  const dq = Math.ceil((d.getMonth() + 1) / 3);
  return dq === q;
}

export function isInYear(dateStr: string, year: number): boolean {
  return new Date(dateStr).getFullYear() === year;
}
