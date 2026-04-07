import { useState, useMemo } from 'react';
import { Eye, EyeOff, Download, Upload, TrendingUp, Wallet, Package, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { QuarterData, SaleOrder, ImportOrder } from '@/types';
import { formatVND, formatCompactVND, parsePriceInput } from '@/lib/currency';
import { exportBackup, importBackup } from '@/lib/storage';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

interface DashboardPageProps {
  quarters: QuarterData[];
  setQuarterTarget: (q: number, year: number, targetRevenue: number, targetProfitPercent: number) => void;
  salesOrders: SaleOrder[];
  importOrders: ImportOrder[];
  addNotification: (msg: string, type?: any) => void;
  onDataRestore: () => void;
}

export function DashboardPage({ quarters, setQuarterTarget, salesOrders, importOrders, addNotification, onDataRestore }: DashboardPageProps) {
  const [showNumbers, setShowNumbers] = useState(true);
  const [editingQ, setEditingQ] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(true);
  const year = new Date().getFullYear();

  // Get quarter data
  const getQ = (q: number) => quarters.find(qd => qd.quarter === q && qd.year === year);

  // Compute actuals from sales orders
  const quarterActuals = useMemo(() => {
    const result: Record<number, { revenue: number; profit: number }> = { 1: { revenue: 0, profit: 0 }, 2: { revenue: 0, profit: 0 }, 3: { revenue: 0, profit: 0 }, 4: { revenue: 0, profit: 0 } };
    salesOrders.filter(o => !o.deletedAt).forEach(o => {
      const d = new Date(o.date);
      if (d.getFullYear() !== year) return;
      const q = Math.ceil((d.getMonth() + 1) / 3);
      result[q].revenue += o.totalRevenue;
      result[q].profit += o.totalProfit;
    });
    return result;
  }, [salesOrders, year]);

  const totalRevenue = Object.values(quarterActuals).reduce((s, v) => s + v.revenue, 0);
  const totalProfit = Object.values(quarterActuals).reduce((s, v) => s + v.profit, 0);
  const totalTarget = [1, 2, 3, 4].reduce((s, q) => s + (getQ(q)?.targetRevenue || 0), 0);
  const totalCOGS = totalRevenue - totalProfit;

  // Chart data: daily revenue for current quarter
  const currentQ = Math.ceil((new Date().getMonth() + 1) / 3);
  const chartData = useMemo(() => {
    const dailyMap = new Map<string, number>();
    salesOrders.filter(o => !o.deletedAt).forEach(o => {
      const d = new Date(o.date);
      if (d.getFullYear() !== year) return;
      const q = Math.ceil((d.getMonth() + 1) / 3);
      if (q !== currentQ) return;
      const key = o.date.split('T')[0];
      dailyMap.set(key, (dailyMap.get(key) || 0) + o.totalRevenue);
    });
    return Array.from(dailyMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, revenue]) => ({
        date: new Date(date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }),
        revenue: Math.round(revenue / 1000),
      }));
  }, [salesOrders, year, currentQ]);

  const mask = (v: string) => showNumbers ? v : '********';

  const handleBackup = () => {
    const data = exportBackup();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sdt_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    addNotification('Đã sao lưu dữ liệu', 'info');
  };

  const handleRestore = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const success = importBackup(reader.result as string);
        if (success) {
          addNotification('Đã khôi phục dữ liệu', 'info');
          onDataRestore();
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  return (
    <div className="flex-1 overflow-y-auto p-3 md:p-4 space-y-4 safe-bottom">
      {/* Top row: title + eye toggle */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-foreground">Tổng quan</h2>
        <Button variant="ghost" size="icon" onClick={() => setShowNumbers(!showNumbers)}>
          {showNumbers ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
        </Button>
      </div>

      {/* Finance Cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card className="glass card-shadow">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><TrendingUp className="h-3.5 w-3.5" /> Doanh thu</div>
            <p className="mt-1 text-financial">{mask(formatCompactVND(totalRevenue))}</p>
          </CardContent>
        </Card>
        <Card className="glass card-shadow">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><Wallet className="h-3.5 w-3.5" /> Lợi nhuận</div>
            <p className="mt-1 text-financial">{mask(formatCompactVND(totalProfit))}</p>
          </CardContent>
        </Card>
        <Card className="glass card-shadow">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><Package className="h-3.5 w-3.5" /> Vốn nhập</div>
            <p className="mt-1 text-lg font-bold text-foreground">{mask(formatCompactVND(totalCOGS))}</p>
          </CardContent>
        </Card>
        <Card className="glass card-shadow">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><TrendingUp className="h-3.5 w-3.5" /> Mục tiêu</div>
            <p className="mt-1 text-lg font-bold text-foreground">{mask(formatCompactVND(totalTarget))}</p>
          </CardContent>
        </Card>
      </div>

      {/* Revenue Chart */}
      {chartData.length > 0 && (
        <Card className="glass card-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Doanh thu Q{currentQ} theo ngày (nghìn VND)</CardTitle>
          </CardHeader>
          <CardContent className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(152, 69%, 40%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(152, 69%, 40%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                <Area type="monotone" dataKey="revenue" stroke="hsl(152, 69%, 40%)" fill="url(#colorRevenue)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Quarter Targets */}
      <Card className="glass card-shadow">
        <CardHeader className="pb-2 cursor-pointer" onClick={() => setExpanded(!expanded)}>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Định mức doanh thu {year}</CardTitle>
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </CardHeader>
        {expanded && (
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {[1, 2, 3, 4].map(q => {
                const qData = getQ(q);
                const actual = quarterActuals[q];
                const target = qData?.targetRevenue || 0;
                const progress = target > 0 ? Math.min(100, (actual.revenue / target) * 100) : 0;
                const isEditing = editingQ === q;

                return (
                  <QuarterCard
                    key={q}
                    quarter={q}
                    year={year}
                    target={target}
                    profitPercent={qData?.targetProfitPercent || 15}
                    actualRevenue={actual.revenue}
                    actualProfit={actual.profit}
                    progress={progress}
                    showNumbers={showNumbers}
                    isEditing={isEditing}
                    onEdit={() => setEditingQ(isEditing ? null : q)}
                    onSave={(rev, pct) => {
                      setQuarterTarget(q, year, rev, pct);
                      setEditingQ(null);
                      addNotification(`Đã cập nhật mục tiêu Q${q}/${year}`, 'quarter_update');
                    }}
                  />
                );
              })}
            </div>

            {/* Warnings */}
            {totalTarget > 1_000_000_000 && (
              <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-2 text-xs text-destructive">
                <AlertTriangle className="h-4 w-4" /> Tổng mục tiêu vượt 1 tỷ VND — cần cân nhắc!
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Backup / Restore */}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={handleBackup} className="flex-1">
          <Download className="mr-2 h-4 w-4" /> Sao lưu JSON
        </Button>
        <Button variant="outline" size="sm" onClick={handleRestore} className="flex-1">
          <Upload className="mr-2 h-4 w-4" /> Khôi phục JSON
        </Button>
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
            <p>Thực tế: <span className="font-bold text-emerald">{mask(formatCompactVND(actualRevenue))}</span></p>
            <p>Lợi nhuận: <span className="font-bold text-emerald">{mask(formatCompactVND(actualProfit))}</span></p>
          </div>
          <Progress value={progress} className="h-2" />
          <p className="text-[10px] text-muted-foreground">{progress.toFixed(1)}% hoàn thành</p>
        </>
      )}
    </div>
  );
}
