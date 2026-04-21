import { useState } from 'react';
import { Lock, LogOut, Shield, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export function AdminAuthButton() {
  const { isAdmin, login, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [pwd, setPwd] = useState('');
  const [err, setErr] = useState(false);

  const handleLogin = () => {
    if (login(pwd)) {
      toast.success('Đã đăng nhập quyền Quản trị');
      setOpen(false);
      setPwd('');
      setErr(false);
    } else {
      setErr(true);
      toast.error('Mật khẩu không đúng');
    }
  };

  if (isAdmin) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="h-8 gap-1 px-2 text-emerald-600 dark:text-emerald-400 font-bold"
        onClick={() => { logout(); toast.message('Đã thoát quyền Quản trị (chế độ Chỉ xem)'); }}
        title="Thoát chế độ Quản trị"
      >
        <ShieldCheck className="h-4 w-4" />
        <span className="hidden sm:inline text-xs">Quản trị</span>
        <LogOut className="h-3 w-3 opacity-60" />
      </Button>
    );
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 gap-1 px-2 text-muted-foreground font-bold"
        onClick={() => setOpen(true)}
        title="Đăng nhập Quản trị"
      >
        <Shield className="h-4 w-4" />
        <span className="hidden sm:inline text-xs">Chỉ xem</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" /> Đăng nhập Quản trị
            </DialogTitle>
            <DialogDescription>
              Nhập mật khẩu để có quyền chỉnh sửa, thêm/xóa dữ liệu.
              Người không có mật khẩu chỉ có thể xem.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Mật khẩu</Label>
            <Input
              type="password"
              value={pwd}
              onChange={e => { setPwd(e.target.value); setErr(false); }}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              autoFocus
              className={err ? 'border-destructive' : ''}
            />
            {err && <p className="text-xs text-destructive">Mật khẩu không đúng</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Hủy</Button>
            <Button onClick={handleLogin}>Đăng nhập</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
