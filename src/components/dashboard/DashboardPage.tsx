import { useState, useMemo } from 'react';
import { Eye, EyeOff, Download, Upload, TrendingUp, Wallet, Package, AlertTriangle, ChevronDown, ChevronUp, FileText, FileSpreadsheet, HardDrive, Shuffle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { QuarterData, SaleOrder, ImportOrder } from '@/types';
import { formatVND, formatCompactVND, parsePriceInput } from '@/lib/currency';
import { exportBackup, importBackup, getStorageUsage } from '@/lib/storage';
import { MAX_YEARLY_REVENUE } from '@/lib/constants';
import { exportSalesPdf } from '@/lib/exportPdf';
import { exportSalesExcel } from '@/lib/exportExcel';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

interface DashboardPageProps {
  quarters: QuarterData[];
  setQuarterTarget: (q: number, year: number, targetRevenue: number, targetProfitPercent: number) => void;
  salesOrders: SaleOrder[];
  importOrders: ImportOrder[];
  addNotification: (msg: string, type?: any) => void;
  onDataRestore: () => void;
}

type TimeRange = 'today' | 'week' | 'month' | 'quarter' | 'custom';

export function DashboardPage({ quarters, setQuarterTarget, salesOrders, importOrders, addNotification, onDataRestore }: DashboardPageProps) {
  const [showNumbers, setShowNumbers] = useState(true);
  const [editingQ, setEditingQ] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [timeRange, setTimeRange] = useState<TimeRange>('quarter');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [showStorage, setShowStorage] = useState(false);

  const now = new Date();
  const currentQ = Math.ceil((now.getMonth() + 1) / 3);

  const getQ = (q: number) => quarters.find(qd => qd.quarter === q && qd.year === selectedYear);

  const filteredSales = useMemo(() => {
    const todayStr = now.toISOString().split('T')[0];
    return salesOrders.filter(o => {
      if (o.deletedAt) return false;
      const d = new Date(o.date);
      if (d.getFullYear() !== selectedYear) return false;
      const day = o.date.split('T')[0];
      switch (timeRange) {
        case 'today': return day === todayStr;
        case 'week': {
          const weekStart = new Date(now);
          weekStart.setDate(now.getDate() - now.getDay() + 1);
          weekStart.setHours(0, 0, 0, 0);
          return d >= weekStart && d <= now;
        }
        case 'month': return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        case 'quarter': {
          const dq = Math.ceil((d.getMonth() + 1) / 3);
          return dq === currentQ;
        }
        case 'custom': {
          if (!customFrom || !customTo) return true;
          return day >= customFrom && day <= customTo;
        }
        default: return true;
      }
    });
  }, [salesOrders, timeRange, selectedYear, customFrom, customTo, now, currentQ]);

  const totalRevenue = filteredSales.reduce((s, o) => s + o.totalRevenue, 0);
  const totalProfit = filteredSales.reduce((s, o) => s + o.totalProfit, 0);
  const profitPercent = totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 1000) / 10 : 0;

  // Total import cost (COGS) from import orders for the selected time
  const totalImportCost = useMemo(() => {
    return importOrders.filter(o => {
      if (o.deletedAt) return false;
      const d = new Date(o.date);
      return d.getFullYear() === selectedYear;
    }).reduce((s, o) => s + o.total, 0);
  }, [importOrders, selectedYear]);

  const quarterActuals = useMemo(() => {
    const result: Record<number, { revenue: number; profit: number }> = { 1: { revenue: 0, profit: 0 }, 2: { revenue: 0, profit: 0 }, 3: { revenue: 0, profit: 0 }, 4: { revenue: 0, profit: 0 } };
    salesOrders.filter(o => !o.deletedAt).forEach(o => {
      const d = new Date(o.date);
      if (d.getFullYear() !== selectedYear) return;
      const q = Math.ceil((d.getMonth() + 1) / 3);
      result[q].revenue += o.totalRevenue;
      result[q].profit += o.totalProfit;
    });
    return result;
  }, [salesOrders, selectedYear]);

  const totalTarget = [1, 2, 3, 4].reduce((s, q) => s + (getQ(q)?.targetRevenue || 0), 0);

  const chartData = useMemo(() => {
    const dailyMap = new Map<string, number>();
    filteredSales.forEach(o => {
      const key = o.date.split('T')[0];
      dailyMap.set(key, (dailyMap.get(key) || 0) + o.totalRevenue);
    });
    return Array.from(dailyMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, revenue]) => ({
        date: new Date(date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }),
        revenue: Math.round(revenue / 1000),
      }));
  }, [filteredSales]);

  const mask = (v: string) => showNumbers ? v : '********';
  const storage = getStorageUsage();

  const handleBackup = () => {
    const data = exportBackup();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `sdt_backup_${selectedYear}_${new Date().toISOString().split('T')[0]}.json`;
    a.click(); URL.revokeObjectURL(url);
    addNotification('Đã sao lưu dữ liệu', 'info');
  };

  const handleRestore = () => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => { if (importBackup(reader.result as string)) { addNotification('Đã khôi phục dữ liệu', 'info'); onDataRestore(); } };
      reader.readAsText(file);
    };
    input.click();
  };

  const handleRandomize = () => {
    // Generate random total between 700M and 999M (rounded to thousands)
    const totalAnnual = Math.round((700_000_000 + Math.random() * 299_000_000) / 1000) * 1000;
    const weights = [0.28, 0.18, 0.20, 0.34];
    
    for (let q = 1; q <= 4; q++) {
      const base = totalAnnual * weights[q - 1];
      // Add ±8% noise per quarter
      const noise = 0.92 + Math.random() * 0.16;
      const rev = Math.round((base * noise) / 1000) * 1000;
      const pct = 10 + Math.round(Math.random() * 8);
      setQuarterTarget(q, selectedYear, rev, pct);
    }
    addNotification(`Đã tạo ngẫu nhiên mục tiêu ${selectedYear}`, 'quarter_update');
  };

  const handleExportPdf = () => {
    exportSalesPdf(salesOrders, selectedYear);
    addNotification(`Đã xuất PDF năm ${selectedYear}`, 'info');
  };

  const handleExportExcel = () => {
    exportSalesExcel(salesOrders, selectedYear);
    addNotification(`Đã xuất Excel năm ${selectedYear}`, 'info');
  };

  return (
    <div className="flex-1 overflow-y-auto p-3 md:p-4 space-y-4 pb-20 lg:pb-4">
      {/* Time range selector */}
      <div className="flex gap-1.5 overflow-x-auto">
        {(['today', 'week', 'month', 'quarter', 'custom'] as TimeRange[]).map(r => (
          <Button key={r} size="sm" variant={timeRange === r ? 'default' : 'outline'} className="h-7 text-xs shrink-0"
            onClick={() => setTimeRange(r)}>
            {{ today: `Hôm nay ${now.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}`, week: 'Tuần này', month: 'Tháng này', quarter: `Quý ${currentQ}`, custom: 'Tùy chọn' }[r]}
          </Button>
        ))}
      </div>

      {timeRange === 'custom' && (
        <div className="flex gap-2">
          <Input type="date" className="h-8 text-xs" value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
          <Input type="date" className="h-8 text-xs" value={customTo} onChange={e => setCustomTo(e.target.value)} />
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card className="shadow-sm border-primary/20">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><TrendingUp className="h-3.5 w-3.5" /> Doanh thu tích lũy</div>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowNumbers(!showNumbers)}>
                {showNumbers ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
              </Button>
            </div>
            <p className="mt-1 text-xl font-black text-primary">{mask(formatCompactVND(totalRevenue))}</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm border-emerald-500/20">
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Wallet className="h-3.5 w-3.5" /> Lợi nhuận tích lũy</div>
            <p className="mt-1 text-xl font-black text-emerald-600 dark:text-emerald-400">{mask(formatCompactVND(totalProfit))}</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><TrendingUp className="h-3.5 w-3.5" /> % Lợi nhuận</div>
            <p className="mt-1 text-xl font-black">{mask(`${profitPercent}%`)}</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Package className="h-3.5 w-3.5" /> Vốn hàng nhập</div>
            <p className="mt-1 text-xl font-black">{mask(formatCompactVND(totalImportCost))}</p>
          </CardContent>
        </Card>
      </div>

      {/* Revenue Chart */}
      {chartData.length > 0 && (
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Doanh thu theo ngày (nghìn VND)</CardTitle>
          </CardHeader>
          <CardContent className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                <Area type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" fill="url(#colorRevenue)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Quarter Targets */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2 cursor-pointer" onClick={() => setExpanded(!expanded)}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm">Định mức doanh thu (1 tỷ)</CardTitle>
              <select className="text-xs border rounded px-2 py-1 bg-background" value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))} onClick={e => e.stopPropagation()}>
                {[2026, 2027, 2028, 2029, 2030].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={e => { e.stopPropagation(); handleRandomize(); }}>
                <Shuffle className="mr-1 h-3 w-3" /> Ngẫu nhiên
              </Button>
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </div>
          </div>
        </CardHeader>
        {expanded && (
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Tổng mục tiêu</span>
                <span className="font-bold">{formatCompactVND(totalTarget)} / {formatCompactVND(MAX_YEARLY_REVENUE)}</span>
              </div>
              <Progress value={Math.min(100, (totalTarget / MAX_YEARLY_REVENUE) * 100)} className="h-2" />
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {[1, 2, 3, 4].map(q => {
                const qData = getQ(q);
                const actual = quarterActuals[q];
                const target = qData?.targetRevenue || 0;
                const progress = target > 0 ? Math.min(100, (actual.revenue / target) * 100) : 0;
                const isEditing = editingQ === q;

                return (
                  <QuarterCard key={q} quarter={q} year={selectedYear} target={target}
                    profitPercent={qData?.targetProfitPercent || 15}
                    actualRevenue={actual.revenue} actualProfit={actual.profit}
                    progress={progress} showNumbers={showNumbers}
                    isEditing={isEditing}
                    onEdit={() => setEditingQ(isEditing ? null : q)}
                    onSave={(rev, pct) => { setQuarterTarget(q, selectedYear, rev, pct); setEditingQ(null); addNotification(`Đã cập nhật Q${q}/${selectedYear}`, 'quarter_update'); }}
                  />
                );
              })}
            </div>

            {totalTarget > MAX_YEARLY_REVENUE && (
              <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-2 text-xs text-destructive">
                <AlertTriangle className="h-4 w-4" /> Tổng mục tiêu vượt 1 tỷ VND! Cần cân bằng lại.
              </div>
            )}

            {/* Export buttons */}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={handleExportPdf}>
                <FileText className="mr-2 h-4 w-4" /> Xuất PDF
              </Button>
              <Button variant="outline" size="sm" className="flex-1" onClick={handleExportExcel}>
                <FileSpreadsheet className="mr-2 h-4 w-4" /> Xuất Excel
              </Button>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Backup/Restore */}
      <div className="flex gap-2 flex-wrap">
        <Button variant="outline" size="sm" className="flex-1" onClick={handleBackup}>
          <Download className="mr-2 h-4 w-4" /> Sao lưu JSON
        </Button>
        <Button variant="outline" size="sm" className="flex-1" onClick={handleRestore}>
          <Upload className="mr-2 h-4 w-4" /> Khôi phục
        </Button>
      </div>

      {/* Storage indicator */}
      <div className="rounded-lg border p-3 cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => setShowStorage(!showStorage)}>
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2"><HardDrive className="h-3.5 w-3.5 text-muted-foreground" /> Dữ liệu lưu trữ</div>
          <span className={`font-bold ${storage.percent > 80 ? 'text-destructive' : 'text-muted-foreground'}`}>{storage.percent}%</span>
        </div>
        <Progress value={storage.percent} className="h-1.5 mt-1" />
        {showStorage && (
          <div className="mt-2 text-[10px] text-muted-foreground space-y-0.5 animate-in slide-in-from-top-1">
            <p>Đã dùng: {(storage.used / 1024).toFixed(1)} KB / {(storage.total / 1024 / 1024).toFixed(1)} MB</p>
            <p>Sản phẩm: {localStorage.getItem('scp_products')?.length || 0} bytes</p>
            <p>Đơn nhập: {localStorage.getItem('scp_import_orders')?.length || 0} bytes</p>
            <p>Đơn bán: {localStorage.getItem('scp_sales_orders')?.length || 0} bytes</p>
            {storage.percent > 80 && <p className="text-destructive font-semibold">⚠️ Sắp hết dung lượng! Hãy sao lưu và xuất dữ liệu.</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function QuarterCard({ quarter, year, target, profitPercent, actualRevenue, actualProfit, progress, showNumbers, isEditing, onEdit, onSave }: {
  quarter: number; year: number; target: number; profitPercent: number;
  actualRevenue: number; actualProfit: number; progress: number;
  showNumbers: boolean; isEditing: boolean;
  onEdit: () => void; onSave: (rev: number, pct: number) => void;
}) {
  const [revInput, setRevInput] = useState(target > 0 ? (target / 1000).toString() : '');
  const [pctInput, setPctInput] = useState(profitPercent.toString());
  const mask = (v: string) => showNumbers ? v : '********';

  return (
    <div className="rounded-xl border border-border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <Badge variant="outline" className="font-bold">Q{quarter}/{year}</Badge>
        <Button variant="ghost" size="sm" className="text-xs h-6" onClick={onEdit}>
          {isEditing ? 'Đóng' : 'Sửa'}
        </Button>
      </div>
      {isEditing ? (
        <div className="space-y-2">
          <div>
            <label className="text-xs text-muted-foreground">Mục tiêu doanh thu (×1000 VND)</label>
            <Input size={1} value={revInput} onChange={e => setRevInput(e.target.value)} placeholder="250000" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">% Lợi nhuận kỳ vọng</label>
            <Input size={1} type="number" value={pctInput} onChange={e => setPctInput(e.target.value)} placeholder="15" />
          </div>
          <Button size="sm" onClick={() => onSave(parsePriceInput(revInput), parseFloat(pctInput) || 15)}>Lưu</Button>
        </div>
      ) : (
        <>
          <div className="text-xs space-y-0.5">
            <p>Mục tiêu: <span className="font-bold">{mask(formatVND(target))}</span></p>
            <p>Thực tế: <span className="font-bold text-emerald-600 dark:text-emerald-400">{mask(formatCompactVND(actualRevenue))}</span></p>
            <p>Lợi nhuận: <span className="font-bold text-emerald-600 dark:text-emerald-400">{mask(formatCompactVND(actualProfit))}</span></p>
          </div>
          <Progress value={progress} className="h-2" />
          <p className="text-[10px] text-muted-foreground">{progress.toFixed(1)}% hoàn thành</p>
        </>
      )}
    </div>
  );
}
