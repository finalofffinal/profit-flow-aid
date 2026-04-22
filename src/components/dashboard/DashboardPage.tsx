import { useState, useMemo, useEffect } from 'react';
import { Eye, EyeOff, Download, Upload, TrendingUp, Package, AlertTriangle, ChevronDown, ChevronUp, FileText, FileSpreadsheet, HardDrive, Shuffle, Lock, Unlock, LayoutDashboard, Tag, Truck, Warehouse, ShoppingCart, Lightbulb } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { QuarterData, SaleOrder, ImportOrder, TabId } from '@/types';
import { formatVND, formatCompactVND, parsePriceInput } from '@/lib/currency';
import { exportBackup, importBackup, getStorageUsage } from '@/lib/storage';
import { MAX_YEARLY_REVENUE } from '@/lib/constants';
import { exportSalesPdf } from '@/lib/exportPdf';
import { exportSalesExcel } from '@/lib/exportExcel';
import { computeInventorySnapshot } from '@/lib/dataEngine';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { usePeriod } from '@/contexts/PeriodContext';
import { useAuth } from '@/contexts/AuthContext';

interface DashboardPageProps {
  quarters: QuarterData[];
  setQuarterTarget: (q: number, year: number, targetRevenue: number) => void;
  setQuarterLock: (q: number, year: number, locked: boolean) => void;
  rebalanceQuarters: (year: number, keepQ: number, keepRevenue: number, totalAnnual: number) => void;
  salesOrders: SaleOrder[];
  importOrders: ImportOrder[];
  products?: any[];
  addNotification: (msg: string, type?: any) => void;
  onDataRestore: () => void;
  onTabChange: (tab: TabId) => void;
}

export function DashboardPage({
  quarters, setQuarterTarget, setQuarterLock, rebalanceQuarters,
  salesOrders, importOrders, products = [], addNotification, onDataRestore, onTabChange,
}: DashboardPageProps) {
  const { quarter: selectedQ, year: selectedYear } = usePeriod();
  const { isAdmin } = useAuth();
  const [showNumbers, setShowNumbers] = useState(true);
  const [editingQ, setEditingQ] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [showStorage, setShowStorage] = useState(false);
  const [storageUsage, setStorageUsage] = useState(getStorageUsage());
  const [exportDialog, setExportDialog] = useState<null | 'pdf' | 'excel'>(null);

  // Refresh storage every 3s
  useEffect(() => {
    const t = setInterval(() => setStorageUsage(getStorageUsage()), 3000);
    return () => clearInterval(t);
  }, []);

  const getQ = (q: number) => quarters.find(qd => qd.quarter === q && qd.year === selectedYear);
  const lockedQs = useMemo(() => [1, 2, 3, 4].filter(q => getQ(q)?.locked), [quarters, selectedYear]);

  // Sales filtered to current Q+Y for KPI/chart
  const filteredSales = useMemo(() => {
    return salesOrders.filter(o => {
      if (o.deletedAt) return false;
      const d = new Date(o.date);
      return d.getFullYear() === selectedYear && Math.ceil((d.getMonth() + 1) / 3) === selectedQ;
    });
  }, [salesOrders, selectedYear, selectedQ]);

  const totalRevenue = filteredSales.reduce((s, o) => s + o.totalRevenue, 0);

  const totalImportCost = useMemo(() => {
    return importOrders.filter(o => {
      if (o.deletedAt) return false;
      const d = new Date(o.date);
      return d.getFullYear() === selectedYear && Math.ceil((d.getMonth() + 1) / 3) === selectedQ;
    }).reduce((s, o) => s + o.total, 0);
  }, [importOrders, selectedYear, selectedQ]);

  // Giá trị tồn kho cuối quý — dùng CHÍNH XÁC cùng logic với tab Kho hàng (FIFO snapshot).
  const stockValue = useMemo(() => {
    if (products.length === 0) return 0;
    const snapshot = computeInventorySnapshot(selectedQ, selectedYear, products as any, importOrders, salesOrders);
    return snapshot.reduce((s, b) => s + b.quantity * b.buyPrice, 0);
  }, [products, importOrders, salesOrders, selectedQ, selectedYear]);

  const quarterActuals = useMemo(() => {
    const result: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
    salesOrders.filter(o => !o.deletedAt).forEach(o => {
      const d = new Date(o.date);
      if (d.getFullYear() !== selectedYear) return;
      const q = Math.ceil((d.getMonth() + 1) / 3);
      result[q] += o.totalRevenue;
    });
    return result;
  }, [salesOrders, selectedYear]);

  const totalTarget = [1, 2, 3, 4].reduce((s, q) => s + (getQ(q)?.targetRevenue || 0), 0);
  const totalActualYear = [1, 2, 3, 4].reduce((s, q) => s + quarterActuals[q], 0);

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

  const mask = (v: string) => showNumbers ? v : '••••••';

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
    // Random 650-950tr (cap 1 tỷ). Bias: 70% trong khoảng 650-900, 30% trong khoảng 900-950
    const r = Math.random();
    const totalAnnual = r < 0.7
      ? Math.round((650_000_000 + Math.random() * 250_000_000) / 1000) * 1000
      : Math.round((900_000_000 + Math.random() * 50_000_000) / 1000) * 1000;
    const weights = [0.30, 0.18, 0.20, 0.32]; // Q1+Q4 cao
    let allocated = 0;
    const unlockedQs = [1, 2, 3, 4].filter(q => !getQ(q)?.locked);
    const lockedSum = [1, 2, 3, 4].filter(q => getQ(q)?.locked).reduce((s, q) => s + (getQ(q)?.targetRevenue || 0), 0);
    const remaining = Math.max(0, totalAnnual - lockedSum);
    const wSum = unlockedQs.reduce((s, q) => s + weights[q - 1], 0) || 1;
    unlockedQs.forEach((q, idx) => {
      let rev: number;
      if (idx === unlockedQs.length - 1) {
        rev = Math.max(0, remaining - allocated);
      } else {
        const base = remaining * weights[q - 1] / wSum;
        const noise = 0.92 + Math.random() * 0.16;
        rev = Math.round((base * noise) / 1000) * 1000;
      }
      setQuarterTarget(q, selectedYear, rev);
      allocated += rev;
    });
    addNotification(`Đã tạo định mức năm ${selectedYear}: ${(totalAnnual / 1_000_000).toFixed(0)} triệu`, 'quarter_update');
  };

  /**
   * Kiến nghị: Giữ nguyên các quý đã sửa thủ công (locked OR có target>0 do user đặt),
   * tự động phân bổ phần còn lại cho các quý chưa sửa theo trọng số mùa vụ
   * (Q1+Q4 cao hơn) sao cho TỔNG = MAX_YEARLY_REVENUE.
   */
  const handleSuggest = () => {
    const weights = [0.30, 0.18, 0.20, 0.32];
    // "Giữ nguyên" = locked. Các quý chưa locked sẽ được điều chỉnh.
    const lockedQuarters = [1, 2, 3, 4].filter(q => getQ(q)?.locked);
    const lockedSum = lockedQuarters.reduce((s, q) => s + (getQ(q)?.targetRevenue || 0), 0);
    const adjustableQs = [1, 2, 3, 4].filter(q => !getQ(q)?.locked);
    if (adjustableQs.length === 0) {
      addNotification('Tất cả 4 quý đã khóa — không còn quý nào để điều chỉnh', 'warning');
      return;
    }
    const remaining = Math.max(0, MAX_YEARLY_REVENUE - lockedSum);
    const wSum = adjustableQs.reduce((s, q) => s + weights[q - 1], 0) || 1;
    let allocated = 0;
    adjustableQs.forEach((q, idx) => {
      let rev: number;
      if (idx === adjustableQs.length - 1) {
        rev = Math.max(0, remaining - allocated);
      } else {
        rev = Math.round((remaining * weights[q - 1] / wSum) / 1000) * 1000;
      }
      setQuarterTarget(q, selectedYear, rev);
      allocated += rev;
    });
    addNotification(`Kiến nghị: giữ ${lockedQuarters.length} quý đã khóa, cân chỉnh ${adjustableQs.length} quý còn lại để đạt 1 tỷ`, 'quarter_update');
  };

  const handleExport = (type: 'pdf' | 'excel') => {
    if (lockedQs.length === 0) {
      addNotification('Cần khóa ít nhất 1 quý trước khi xuất', 'warning');
      return;
    }
    if (lockedQs.length === 1) {
      // Direct export for that quarter
      doExport(type, lockedQs);
      return;
    }
    setExportDialog(type);
  };

  const doExport = (type: 'pdf' | 'excel', quarters: number[]) => {
    if (type === 'pdf') exportSalesPdf(salesOrders, selectedYear, quarters);
    else exportSalesExcel(salesOrders, selectedYear, quarters);
    addNotification(`Đã xuất ${type.toUpperCase()} năm ${selectedYear}`, 'success');
    setExportDialog(null);
  };

  const navTabs: { id: TabId; label: string; icon: any; color: string }[] = [
    { id: 'catalog', label: 'Danh mục', icon: Tag, color: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30' },
    { id: 'import', label: 'Nhập hàng', icon: Truck, color: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30' },
    { id: 'inventory', label: 'Kho hàng', icon: Warehouse, color: 'bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/30' },
    { id: 'sales', label: 'Bán hàng', icon: ShoppingCart, color: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30' },
  ];

  const currentQTarget = getQ(selectedQ)?.targetRevenue || 0;
  const currentQLocked = !!getQ(selectedQ)?.locked;
  const currentQProgress = currentQTarget > 0 ? Math.min(100, (totalRevenue / currentQTarget) * 100) : 0;

  return (
    <div className="flex-1 overflow-y-auto p-3 md:p-4 space-y-4 pb-20 lg:pb-4">
      {/* Big context header */}
      <div className="rounded-2xl border-2 border-primary/30 bg-gradient-to-br from-primary/10 via-background to-primary/5 p-4 shadow-md">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">Đang xem</p>
            <h2 className="text-2xl md:text-3xl font-black text-primary flex items-center gap-2">
              Quý {selectedQ} / {selectedYear}
              {currentQLocked && <Lock className="h-5 w-5 text-amber-600" />}
            </h2>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setShowNumbers(!showNumbers)} title={showNumbers ? 'Ẩn số' : 'Hiện số'}>
            {showNumbers ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </Button>
        </div>
        <div className="mt-3">
          <p className="text-xs text-muted-foreground">Doanh thu Q{selectedQ}</p>
          <p className="text-2xl md:text-3xl font-black text-primary">{mask(formatVND(totalRevenue))}</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="shadow-sm border-primary/20">
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><TrendingUp className="h-3.5 w-3.5" /> Doanh thu Q{selectedQ}</div>
            <p className="mt-1 text-lg md:text-xl font-black text-primary">{mask(formatCompactVND(totalRevenue))}</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Package className="h-3.5 w-3.5" /> Vốn nhập Q{selectedQ}</div>
            <p className="mt-1 text-lg md:text-xl font-black">{mask(formatCompactVND(totalImportCost))}</p>
          </CardContent>
        </Card>
      </div>

      {/* Revenue Chart */}
      {chartData.length > 0 && (
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Doanh thu Q{selectedQ}/{selectedYear} (nghìn VND)</CardTitle>
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
      <Card className="shadow-sm border-2 border-primary/20">
        <CardHeader className="pb-2 cursor-pointer" onClick={() => setExpanded(!expanded)}>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-bold">Doanh thu năm {selectedYear}</CardTitle>
            <div className="flex items-center gap-1">
              <Button data-admin-only variant="outline" size="sm" className="h-7 text-xs" onClick={e => { e.stopPropagation(); handleSuggest(); }} title="Giữ nguyên các quý đã khóa, tự cân chỉnh các quý còn lại để đạt 1 tỷ">
                <Lightbulb className="mr-1 h-3 w-3" /> Kiến nghị
              </Button>
              <Button data-admin-only variant="outline" size="sm" className="h-7 text-xs" onClick={e => { e.stopPropagation(); handleRandomize(); }}>
                <Shuffle className="mr-1 h-3 w-3" /> Ngẫu nhiên
              </Button>
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </div>
          </div>
        </CardHeader>
        {expanded && (
          <CardContent className="space-y-3">
            <div className="rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 border-2 border-primary/30 p-3">
              <div className="flex items-baseline justify-between gap-2 mb-1.5">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Tổng 4 quý {selectedYear}</span>
                <span className="text-[10px] text-muted-foreground">tối đa 1 tỷ VND</span>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-2xl md:text-3xl font-black text-primary">{mask(formatVND(totalTarget))}</p>
                <span className="text-sm font-bold text-foreground/70">/ {formatCompactVND(MAX_YEARLY_REVENUE)}</span>
              </div>
              <Progress value={Math.min(100, (totalTarget / MAX_YEARLY_REVENUE) * 100)} className="h-2 mt-2" />
              <p className="text-[11px] text-muted-foreground mt-1">
                Doanh thu 4 quý gộp lại trong năm {selectedYear}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {[1, 2, 3, 4].map(q => {
                const qData = getQ(q);
                const target = qData?.targetRevenue || 0;
                const actual = quarterActuals[q];
                const progress = target > 0 ? Math.min(100, (actual / target) * 100) : 0;
                const isEditing = editingQ === q;
                const locked = !!qData?.locked;
                return (
                  <QuarterCard key={q} quarter={q} year={selectedYear} target={target}
                    actual={actual} progress={progress} showNumbers={showNumbers}
                    isEditing={isEditing} locked={locked} isAdmin={isAdmin}
                    onEdit={() => setEditingQ(isEditing ? null : q)}
                    onToggleLock={() => { setQuarterLock(q, selectedYear, !locked); addNotification(`${!locked ? 'Đã khóa' : 'Đã mở khóa'} Q${q}/${selectedYear}`, 'quarter_update'); }}
                    onSave={(rev) => {
                      setQuarterTarget(q, selectedYear, rev);
                      // Note: Manual save no longer auto-rebalances. User can hit "Kiến nghị" to rebalance.
                      setEditingQ(null);
                      addNotification(`Đã cập nhật Q${q}/${selectedYear}`, 'quarter_update');
                    }}
                  />
                );
              })}
            </div>

            {totalTarget > MAX_YEARLY_REVENUE && (
              <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-2 text-xs text-destructive">
                <AlertTriangle className="h-4 w-4" /> Tổng định mức vượt 1 tỷ VND!
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => handleExport('pdf')} disabled={lockedQs.length === 0}>
                <FileText className="mr-2 h-4 w-4" /> Xuất PDF {lockedQs.length > 0 && `(${lockedQs.length} quý)`}
              </Button>
              <Button variant="outline" size="sm" className="flex-1" onClick={() => handleExport('excel')} disabled={lockedQs.length === 0}>
                <FileSpreadsheet className="mr-2 h-4 w-4" /> Xuất Excel {lockedQs.length > 0 && `(${lockedQs.length} quý)`}
              </Button>
            </div>
            {lockedQs.length === 0 && (
              <p className="text-[11px] text-muted-foreground text-center">🔒 Khóa ít nhất 1 quý để xuất báo cáo</p>
            )}
          </CardContent>
        )}
      </Card>

      {/* Backup/Restore */}
      <div className="flex gap-2 flex-wrap">
        <Button variant="outline" size="sm" className="flex-1" onClick={handleBackup}>
          <Download className="mr-2 h-4 w-4" /> Sao lưu JSON
        </Button>
        <Button data-admin-only variant="outline" size="sm" className="flex-1" onClick={handleRestore}>
          <Upload className="mr-2 h-4 w-4" /> Khôi phục
        </Button>
      </div>

      {/* Quick tab nav */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2"><CardTitle className="text-sm">Đi tới tab khác</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {navTabs.map(t => {
            const Icon = t.icon;
            return (
              <button key={t.id} onClick={() => onTabChange(t.id)}
                className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 p-3 transition-all hover:scale-105 hover:shadow-md ${t.color}`}>
                <Icon className="h-6 w-6" />
                <span className="text-xs font-bold">{t.label}</span>
              </button>
            );
          })}
        </CardContent>
      </Card>

      {/* Storage indicator */}
      <div className="rounded-lg border-2 p-3 cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => setShowStorage(!showStorage)}>
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 font-semibold"><HardDrive className="h-3.5 w-3.5 text-muted-foreground" /> Dữ liệu lưu trữ</div>
          <span className={`font-bold ${storageUsage.percent > 80 ? 'text-destructive' : storageUsage.percent > 50 ? 'text-amber-600' : 'text-emerald-600'}`}>
            {storageUsage.percent}% · {(storageUsage.used / 1024).toFixed(0)} KB
          </span>
        </div>
        <Progress value={storageUsage.percent} className="h-1.5 mt-1.5" />
        {showStorage && (
          <div className="mt-3 space-y-1 text-[11px] animate-in slide-in-from-top-1">
            {storageUsage.breakdown.map(b => (
              <div key={b.key} className="flex items-center justify-between border-t pt-1">
                <span className="text-muted-foreground">{b.label} <span className="text-foreground/60">({b.count})</span></span>
                <span className="font-mono font-semibold">{(b.bytes / 1024).toFixed(1)} KB</span>
              </div>
            ))}
            <p className="pt-2 text-muted-foreground">Tổng dung lượng giới hạn: {(storageUsage.total / 1024 / 1024).toFixed(1)} MB (localStorage). Dữ liệu cũng đồng bộ Cloud không giới hạn.</p>
            {storageUsage.percent > 80 && <p className="text-destructive font-semibold">⚠️ Sắp hết dung lượng cục bộ!</p>}
          </div>
        )}
      </div>

      {/* Export choice dialog */}
      <Dialog open={!!exportDialog} onOpenChange={v => !v && setExportDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Chọn quý để xuất</DialogTitle>
            <DialogDescription>
              Có {lockedQs.length} quý đã khóa. Chọn xuất từng quý hoặc cả năm.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2">
            {lockedQs.map(q => (
              <Button key={q} variant="outline" onClick={() => doExport(exportDialog!, [q])}>
                Quý {q}/{selectedYear}
              </Button>
            ))}
            {lockedQs.length === 4 && (
              <Button className="col-span-2" onClick={() => doExport(exportDialog!, [1, 2, 3, 4])}>
                📊 Cả năm {selectedYear} (4 quý)
              </Button>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setExportDialog(null)}>Hủy</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function QuarterCard({ quarter, year, target, actual, progress, showNumbers, isEditing, locked, isAdmin, onEdit, onSave, onToggleLock }: {
  quarter: number; year: number; target: number;
  actual: number; progress: number;
  showNumbers: boolean; isEditing: boolean; locked: boolean; isAdmin?: boolean;
  onEdit: () => void; onSave: (rev: number) => void; onToggleLock: () => void;
}) {
  const [revInput, setRevInput] = useState(target > 0 ? (target / 1000).toString() : '');
  useEffect(() => { setRevInput(target > 0 ? (target / 1000).toString() : ''); }, [target]);
  const mask = (v: string) => showNumbers ? v : '••••';
  // Admin có thể sửa cả khi locked; viewer thì không
  const canEdit = isAdmin === true; // viewer luôn không sửa được (data-admin-only ẩn nút)

  return (
    <div className={`rounded-xl border-2 p-3 space-y-2 ${locked ? 'border-amber-500/50 bg-amber-500/5' : 'border-border'}`}>
      <div className="flex items-center justify-between">
        <Badge variant="outline" className="font-bold text-sm">Q{quarter}/{year}</Badge>
        <div className="flex items-center gap-1">
          <Button data-admin-only variant="ghost" size="sm" className="text-xs h-6 px-2" onClick={onToggleLock} title={locked ? 'Mở khóa' : 'Khóa quý'}>
            {locked ? <Lock className="h-3.5 w-3.5 text-amber-600" /> : <Unlock className="h-3.5 w-3.5" />}
          </Button>
          <Button data-admin-only variant="ghost" size="sm" className="text-xs h-6" onClick={onEdit}>
            {isEditing ? 'Đóng' : 'Sửa'}
          </Button>
        </div>
      </div>
      {isEditing && canEdit ? (
        <div className="space-y-2">
          <div>
            <label className="text-xs text-muted-foreground">Doanh thu (×1.000 VND){locked && ' — đang sửa quý đã khóa'}</label>
            <Input value={revInput} onChange={e => setRevInput(e.target.value)} placeholder="250000" />
          </div>
          <Button size="sm" className="w-full" onClick={() => onSave(parsePriceInput(revInput))}>Lưu</Button>
        </div>
      ) : (
        <>
          <div>
            <p className="text-[11px] text-muted-foreground">Doanh thu</p>
            <p className="text-lg font-black text-primary">{mask(formatVND(target))}</p>
          </div>
        </>
      )}
    </div>
  );
}
