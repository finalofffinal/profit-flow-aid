import { useState, useCallback, useEffect, useMemo } from 'react';
import { Product, Supplier, Notification, QuarterData, ImportOrder, SaleOrder, InventoryBatch } from '@/types';
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
      const copy: Product = { ...source, id: generateId(), supplierId: targetSupplierId, createdAt: now, updatedAt: now };
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
    const supplier: Supplier = { id: generateId(), name, createdAt: new Date().toISOString() };
    setSuppliers(prev => [...prev, supplier]);
    return supplier;
  }, []);

  const updateSupplier = useCallback((id: string, name: string) => {
    setSuppliers(prev => prev.map(s => s.id === id ? { ...s, name } : s));
  }, []);

  const deleteSupplier = useCallback((id: string) => {
    if (id === 'default') return;
    setSuppliers(prev => prev.filter(s => s.id !== id));
  }, []);

  return { suppliers, addSupplier, updateSupplier, deleteSupplier, setSuppliers };
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>(() => storage.loadNotifications());
  useEffect(() => { storage.saveNotifications(notifications); }, [notifications]);

  const addNotification = useCallback((message: string, type: Notification['type'] = 'info') => {
    const notif: Notification = { id: generateId(), message, type, read: false, createdAt: new Date().toISOString() };
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

export function useQuarters() {
  const [quarters, setQuarters] = useState<QuarterData[]>(() => storage.loadQuarters());
  useEffect(() => { storage.saveQuarters(quarters); }, [quarters]);

  const setQuarterTarget = useCallback((q: number, year: number, targetRevenue: number, targetProfitPercent: number) => {
    setQuarters(prev => {
      const existing = prev.findIndex(qd => qd.quarter === q && qd.year === year);
      const data: QuarterData = { quarter: q, year, targetRevenue, targetProfitPercent };
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = data;
        return updated;
      }
      return [...prev, data];
    });
  }, []);

  return { quarters, setQuarterTarget, setQuarters };
}

export function useImportOrders() {
  const [orders, setOrders] = useState<ImportOrder[]>(() => storage.loadImportOrders());
  useEffect(() => { storage.saveImportOrders(orders); }, [orders]);

  const addOrder = useCallback((order: Omit<ImportOrder, 'id' | 'createdAt' | 'deletedAt'>) => {
    const newOrder: ImportOrder = { ...order, id: generateId(), deletedAt: null, createdAt: new Date().toISOString() };
    setOrders(prev => [...prev, newOrder]);
    return newOrder;
  }, []);

  const deleteOrder = useCallback((id: string) => {
    setOrders(prev => prev.map(o => o.id === id ? { ...o, deletedAt: new Date().toISOString() } : o));
  }, []);

  const restoreOrder = useCallback((id: string) => {
    setOrders(prev => prev.map(o => o.id === id ? { ...o, deletedAt: null } : o));
  }, []);

  const permanentDeleteOrder = useCallback((id: string) => {
    setOrders(prev => prev.filter(o => o.id !== id));
  }, []);

  const activeOrders = orders.filter(o => !o.deletedAt);
  const deletedOrders = orders.filter(o => o.deletedAt);

  return { orders, activeOrders, deletedOrders, addOrder, deleteOrder, restoreOrder, permanentDeleteOrder, setOrders };
}

export function useSalesOrders() {
  const [orders, setOrders] = useState<SaleOrder[]>(() => storage.loadSalesOrders());
  useEffect(() => { storage.saveSalesOrders(orders); }, [orders]);

  const addOrder = useCallback((order: Omit<SaleOrder, 'id' | 'createdAt' | 'deletedAt'>) => {
    const newOrder: SaleOrder = { ...order, id: generateId(), deletedAt: null, createdAt: new Date().toISOString() };
    setOrders(prev => [...prev, newOrder]);
    return newOrder;
  }, []);

  const deleteOrder = useCallback((id: string) => {
    setOrders(prev => prev.map(o => o.id === id ? { ...o, deletedAt: new Date().toISOString() } : o));
  }, []);

  const activeOrders = orders.filter(o => !o.deletedAt);

  return { orders, activeOrders, addOrder, deleteOrder, setOrders };
}

export function useInventoryBatches() {
  const [batches, setBatches] = useState<InventoryBatch[]>(() => storage.loadInventoryBatches());
  useEffect(() => { storage.saveInventoryBatches(batches); }, [batches]);

  return { batches, setBatches };
}
