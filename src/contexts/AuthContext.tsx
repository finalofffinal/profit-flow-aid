import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

const ADMIN_PASSWORD = 'Investordr1412.';
const STORAGE_KEY = 'auth_role_v1';

type Role = 'admin' | 'viewer';

interface AuthCtx {
  role: Role;
  isAdmin: boolean;
  login: (password: string) => boolean;
  logout: () => void;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role>('viewer');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'admin') setRole('admin');
  }, []);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.body.setAttribute('data-role', role);
    }
  }, [role]);

  const login = (password: string): boolean => {
    if (password === ADMIN_PASSWORD) {
      setRole('admin');
      localStorage.setItem(STORAGE_KEY, 'admin');
      return true;
    }
    return false;
  };

  const logout = () => {
    setRole('viewer');
    localStorage.removeItem(STORAGE_KEY);
  };

  return (
    <Ctx.Provider value={{ role, isAdmin: role === 'admin', login, logout }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used within AuthProvider');
  return v;
}
