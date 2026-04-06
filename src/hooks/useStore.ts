import { useState, useCallback, useEffect } from 'react';
import { Product, Supplier, Notification } from '@/types';
import * as storage from '@/lib/storage';

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function useProducts() {
  const [products, setProducts] = useState<Product[]>(() => storage.loadProducts());

  useEffect(() => { storage.saveProducts(products); }, [products]);

  const addProduct = useCallback((product: Omit<Product, 'id' | 'stock' | 'priceHistory' | 'deletedAt' | 'createdAt' | 'updatedAt'>) => {
    const now = new Date().toISOString();
    const newProduct: Product = {
      ...product,
      id: generateId(),
      stock: 0,
      priceHistory: product.buyPrice || product.sellPrice ? [{
        buyPrice: product.buyPrice,
        sellPrice: product.sellPrice,
        date: now,
      }] : [],
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    setProducts(prev => [...prev, newProduct]);
    return newProduct;
  }, []);

  const updateProduct = useCallback((id: string, updates: Partial<Product>) => {
    setProducts(prev => prev.map(p => {
      if (p.id !== id) return p;
      const updated = { ...p, ...updates, updatedAt: new Date().toISOString() };
      // Track price history
      if ((updates.buyPrice !== undefined && updates.buyPrice !== p.buyPrice) ||
          (updates.sellPrice !== undefined && updates.sellPrice !== p.sellPrice)) {
        updated.priceHistory = [
          { buyPrice: updated.buyPrice, sellPrice: updated.sellPrice, date: updated.updatedAt },
          ...p.priceHistory,
        ].slice(0, 5);
      }
      return updated;
    }));
  }, []);

  const softDeleteProduct = useCallback((id: string) => {
    setProducts(prev => prev.map(p =>
      p.id === id ? { ...p, deletedAt: new Date().toISOString() } : p
    ));
  }, []);

  const restoreProduct = useCallback((id: string) => {
    setProducts(prev => prev.map(p =>
      p.id === id ? { ...p, deletedAt: null } : p
    ));
  }, []);

  const permanentDeleteProduct = useCallback((id: string) => {
    setProducts(prev => prev.filter(p => p.id !== id));
  }, []);

  const moveProduct = useCallback((productId: string, newSupplierId: string) => {
    setProducts(prev => prev.map(p =>
      p.id === productId ? { ...p, supplierId: newSupplierId, updatedAt: new Date().toISOString() } : p
    ));
  }, []);

  const copyProduct = useCallback((productId: string, targetSupplierId: string) => {
    setProducts(prev => {
      const source = prev.find(p => p.id === productId);
      if (!source) return prev;
      const now = new Date().toISOString();
      const copy: Product = {
        ...source,
        id: generateId(),
        supplierId: targetSupplierId,
        createdAt: now,
        updatedAt: now,
      };
      return [...prev, copy];
    });
  }, []);

  const activeProducts = products.filter(p => !p.deletedAt);
  const deletedProducts = products.filter(p => p.deletedAt);

  return {
    products, activeProducts, deletedProducts,
    addProduct, updateProduct, softDeleteProduct,
    restoreProduct, permanentDeleteProduct,
    moveProduct, copyProduct, setProducts,
  };
}

export function useSuppliers() {
  const [suppliers, setSuppliers] = useState<Supplier[]>(() => storage.loadSuppliers());

  useEffect(() => { storage.saveSuppliers(suppliers); }, [suppliers]);

  const addSupplier = useCallback((name: string) => {
    const supplier: Supplier = {
      id: generateId(),
      name,
      createdAt: new Date().toISOString(),
    };
    setSuppliers(prev => [...prev, supplier]);
    return supplier;
  }, []);

  const updateSupplier = useCallback((id: string, name: string) => {
    setSuppliers(prev => prev.map(s => s.id === id ? { ...s, name } : s));
  }, []);

  const deleteSupplier = useCallback((id: string) => {
    if (id === 'default') return; // Cannot delete default
    setSuppliers(prev => prev.filter(s => s.id !== id));
  }, []);

  return { suppliers, addSupplier, updateSupplier, deleteSupplier, setSuppliers };
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>(() => storage.loadNotifications());

  useEffect(() => { storage.saveNotifications(notifications); }, [notifications]);

  const addNotification = useCallback((message: string, type: Notification['type'] = 'info') => {
    const notif: Notification = {
      id: generateId(),
      message,
      type,
      read: false,
      createdAt: new Date().toISOString(),
    };
    setNotifications(prev => [notif, ...prev].slice(0, 100));
  }, []);

  const markRead = useCallback((id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  return { notifications, addNotification, markRead, markAllRead, unreadCount };
}

export function useTheme() {
  const [theme, setThemeState] = useState<'light' | 'dark'>(() => storage.loadTheme());

  useEffect(() => {
    storage.saveTheme(theme);
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setThemeState(prev => prev === 'light' ? 'dark' : 'light');
  }, []);

  return { theme, toggleTheme };
}
