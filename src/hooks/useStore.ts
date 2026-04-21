import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Product, Supplier, Notification, QuarterData, ImportOrder, SaleOrder, InventoryBatch } from '@/types';
import * as storage from '@/lib/storage';
import { subscribeRealtime } from '@/lib/supabase';

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Generic realtime-syncable state hook
function useSyncedState<T>(
  storageKey: string,
  loader: () => T,
  saver: (data: T) => void,
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [state, setState] = useState<T>(loader);
  const isFirstRender = useRef(true);
  const incomingFromRemote = useRef(false);

  // Save on local change (skip initial mount + remote-triggered updates)
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    if (incomingFromRemote.current) { incomingFromRemote.current = false; return; }
    saver(state);
  }, [state, saver]);

  // Subscribe to realtime updates for this key
  useEffect(() => {
    const unsub = subscribeRealtime((key, value) => {
      if (key !== storageKey) return;
      if (value === null || value === undefined) return;
      incomingFromRemote.current = true;
      try { localStorage.setItem(storageKey, JSON.stringify(value)); } catch {}
      setState(value as T);
    });
    return unsub;
  }, [storageKey]);

  return [state, setState];
}

export function useProducts() {
  const [products, setProducts] = useSyncedState<Product[]>('scp_products', storage.loadProducts, storage.saveProducts);

  const addProduct = useCallback((product: Omit<Product, 'id' | 'stock' | 'priceHistory' | 'deletedAt' | 'createdAt' | 'updatedAt'>) => {
    const now = new Date().toISOString();
    const newProduct: Product = {
      ...product,
      id: generateId(),
      stock: 0,
      priceHistory: product.buyPrice || product.sellPrice ? [{
        buyPrice: product.buyPrice, sellPrice: product.sellPrice, date: now,
      }] : [],
      deletedAt: null, createdAt: now, updatedAt: now,
    };
    setProducts(prev => [...prev, newProduct]);
    return newProduct;
  }, [setProducts]);

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
  }, [setProducts]);

  const softDeleteProduct = useCallback((id: string) => {
    setProducts(prev => prev.map(p => p.id === id ? { ...p, deletedAt: new Date().toISOString() } : p));
  }, [setProducts]);
  const restoreProduct = useCallback((id: string) => {
    setProducts(prev => prev.map(p => p.id === id ? { ...p, deletedAt: null } : p));
  }, [setProducts]);
  const permanentDeleteProduct = useCallback((id: string) => {
    setProducts(prev => prev.filter(p => p.id !== id));
  }, [setProducts]);
  const moveProduct = useCallback((productId: string, newSupplierId: string) => {
    setProducts(prev => prev.map(p => p.id === productId ? { ...p, supplierId: newSupplierId, updatedAt: new Date().toISOString() } : p));
  }, [setProducts]);
  const copyProduct = useCallback((productId: string, targetSupplierId: string) => {
    setProducts(prev => {
      const source = prev.find(p => p.id === productId);
      if (!source) return prev;
      const now = new Date().toISOString();
      const copy: Product = { ...source, id: generateId(), supplierId: targetSupplierId, createdAt: now, updatedAt: now };
      return [...prev, copy];
    });
  }, [setProducts]);

  /** Reorder products: receives a flat array with new order positions for products in the same supplier */
  const reorderProducts = useCallback((orderedIds: string[]) => {
    setProducts(prev => prev.map(p => {
      const idx = orderedIds.indexOf(p.id);
      if (idx < 0) return p;
      return { ...p, order: idx, updatedAt: new Date().toISOString() };
    }));
  }, [setProducts]);

  /** Update price history entry at index; back-fills sellPrice to keep profit ratio. */
  const updatePriceHistoryEntry = useCallback((productId: string, index: number, entry: { date: string; buyPrice: number }) => {
    setProducts(prev => prev.map(p => {
      if (p.id !== productId) return p;
      const history = [...(p.priceHistory || [])];
      const old = history[index];
      if (!old) return p;
      // Preserve profit margin: newSell = newBuy * (oldSell / oldBuy) when oldBuy > 0
      const ratio = old.buyPrice > 0 ? old.sellPrice / old.buyPrice : 1;
      const newSell = Math.round(entry.buyPrice * ratio);
      history[index] = { date: entry.date, buyPrice: entry.buyPrice, sellPrice: newSell };
      // Sort by date desc
      history.sort((a, b) => b.date.localeCompare(a.date));
      // If this is the latest entry, also update product's current price
      const latest = history[0];
      return {
        ...p,
        priceHistory: history.slice(0, 5),
        buyPrice: latest.buyPrice,
        sellPrice: latest.sellPrice,
        updatedAt: new Date().toISOString(),
      };
    }));
  }, [setProducts]);

  const activeProducts = useMemo(() => products.filter(p => !p.deletedAt), [products]);
  const deletedProducts = useMemo(() => products.filter(p => p.deletedAt), [products]);

  return {
    products, activeProducts, deletedProducts,
    addProduct, updateProduct, softDeleteProduct,
    restoreProduct, permanentDeleteProduct,
    moveProduct, copyProduct, reorderProducts, updatePriceHistoryEntry, setProducts,
  };
}

export function useSuppliers() {
  const [suppliers, setSuppliers] = useSyncedState<Supplier[]>('scp_suppliers', storage.loadSuppliers, storage.saveSuppliers);
  const activeSuppliers = useMemo(() => suppliers.filter(s => !s.deletedAt), [suppliers]);

  const addSupplier = useCallback((name: string) => {
    const supplier: Supplier = { id: generateId(), name, deletedAt: null, createdAt: new Date().toISOString() };
    setSuppliers(prev => [...prev, supplier]);
    return supplier;
  }, [setSuppliers]);
  const updateSupplier = useCallback((id: string, name: string) => {
    setSuppliers(prev => prev.map(s => s.id === id ? { ...s, name } : s));
  }, [setSuppliers]);
  const deleteSupplier = useCallback((id: string) => {
    if (id === 'default-khac') return;
    setSuppliers(prev => prev.map(s => s.id === id ? { ...s, deletedAt: new Date().toISOString() } : s));
  }, [setSuppliers]);
  const restoreSupplier = useCallback((id: string) => {
    setSuppliers(prev => prev.map(s => s.id === id ? { ...s, deletedAt: null } : s));
  }, [setSuppliers]);
  const permanentDeleteSupplier = useCallback((id: string) => {
    if (id === 'default-khac') return;
    setSuppliers(prev => prev.filter(s => s.id !== id));
  }, [setSuppliers]);

  return { suppliers, activeSuppliers, addSupplier, updateSupplier, deleteSupplier, restoreSupplier, permanentDeleteSupplier, setSuppliers };
}

export function useNotifications() {
  const [notifications, setNotifications] = useSyncedState<Notification[]>('scp_notifications', storage.loadNotifications, storage.saveNotifications);

  const addNotification = useCallback((message: string, type: Notification['type'] = 'info') => {
    const notif: Notification = { id: generateId(), message, type, read: false, createdAt: new Date().toISOString() };
    setNotifications(prev => [notif, ...prev].slice(0, 100));
  }, [setNotifications]);
  const markRead = useCallback((id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }, [setNotifications]);
  const markAllRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, [setNotifications]);

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
  const [quarters, setQuarters] = useSyncedState<QuarterData[]>('scp_quarters', storage.loadQuarters, storage.saveQuarters);

  const setQuarterTarget = useCallback((q: number, year: number, targetRevenue: number) => {
    setQuarters(prev => {
      const existing = prev.findIndex(qd => qd.quarter === q && qd.year === year);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = { ...updated[existing], targetRevenue };
        return updated;
      }
      return [...prev, { quarter: q, year, targetRevenue, targetProfitPercent: 15, locked: false }];
    });
  }, [setQuarters]);

  const setQuarterLock = useCallback((q: number, year: number, locked: boolean) => {
    setQuarters(prev => {
      const existing = prev.findIndex(qd => qd.quarter === q && qd.year === year);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = { ...updated[existing], locked };
        return updated;
      }
      return [...prev, { quarter: q, year, targetRevenue: 0, targetProfitPercent: 15, locked }];
    });
  }, [setQuarters]);

  /** Rebalance: keep target for `keepQ`, distribute remaining (toward 1 tỷ avg) across other unlocked quarters */
  const rebalanceQuarters = useCallback((year: number, keepQ: number, keepRevenue: number, totalAnnual: number) => {
    setQuarters(prev => {
      const others = [1, 2, 3, 4].filter(q => q !== keepQ);
      const remaining = Math.max(0, totalAnnual - keepRevenue);
      // Get locks
      const lockMap = new Map<number, boolean>();
      [1, 2, 3, 4].forEach(q => {
        const found = prev.find(p => p.quarter === q && p.year === year);
        lockMap.set(q, !!found?.locked);
      });
      // Don't touch locked quarters
      const lockedSum = others
        .filter(q => lockMap.get(q))
        .reduce((s, q) => s + (prev.find(p => p.quarter === q && p.year === year)?.targetRevenue || 0), 0);
      const unlockedQs = others.filter(q => !lockMap.get(q));
      const remainingForUnlocked = Math.max(0, remaining - lockedSum);

      // Seasonal weights
      const w: Record<number, number> = { 1: 0.28, 2: 0.18, 3: 0.20, 4: 0.34 };
      const wSum = unlockedQs.reduce((s, q) => s + w[q], 0) || 1;

      let allocated = 0;
      const next = [...prev];
      const upsert = (q: number, rev: number) => {
        const i = next.findIndex(p => p.quarter === q && p.year === year);
        if (i >= 0) next[i] = { ...next[i], targetRevenue: rev };
        else next.push({ quarter: q, year, targetRevenue: rev, targetProfitPercent: 15, locked: false });
      };

      upsert(keepQ, keepRevenue);
      unlockedQs.forEach((q, idx) => {
        let rev: number;
        if (idx === unlockedQs.length - 1) {
          rev = Math.max(0, remainingForUnlocked - allocated);
        } else {
          rev = Math.round((remainingForUnlocked * w[q] / wSum) / 1000) * 1000;
        }
        upsert(q, rev);
        allocated += rev;
      });

      return next;
    });
  }, [setQuarters]);

  return { quarters, setQuarterTarget, setQuarterLock, rebalanceQuarters, setQuarters };
}

export function useImportOrders() {
  const [orders, setOrders] = useSyncedState<ImportOrder[]>('scp_import_orders', storage.loadImportOrders, storage.saveImportOrders);

  const addOrder = useCallback((order: Omit<ImportOrder, 'id' | 'createdAt' | 'deletedAt'>) => {
    const newOrder: ImportOrder = { ...order, id: generateId(), deletedAt: null, createdAt: new Date().toISOString() };
    setOrders(prev => [...prev, newOrder]);
    return newOrder;
  }, [setOrders]);
  const deleteOrder = useCallback((id: string) => {
    setOrders(prev => prev.map(o => o.id === id ? { ...o, deletedAt: new Date().toISOString() } : o));
  }, [setOrders]);
  const restoreOrder = useCallback((id: string) => {
    setOrders(prev => prev.map(o => o.id === id ? { ...o, deletedAt: null } : o));
  }, [setOrders]);
  const permanentDeleteOrder = useCallback((id: string) => {
    setOrders(prev => prev.filter(o => o.id !== id));
  }, [setOrders]);

  const activeOrders = useMemo(() => orders.filter(o => !o.deletedAt), [orders]);
  const deletedOrders = useMemo(() => orders.filter(o => o.deletedAt), [orders]);

  return { orders, activeOrders, deletedOrders, addOrder, deleteOrder, restoreOrder, permanentDeleteOrder, setOrders };
}

export function useSalesOrders() {
  const [orders, setOrders] = useSyncedState<SaleOrder[]>('scp_sales_orders', storage.loadSalesOrders, storage.saveSalesOrders);

  const addOrder = useCallback((order: Omit<SaleOrder, 'id' | 'createdAt' | 'deletedAt'>) => {
    const newOrder: SaleOrder = { ...order, id: generateId(), deletedAt: null, createdAt: new Date().toISOString() };
    setOrders(prev => [...prev, newOrder]);
    return newOrder;
  }, [setOrders]);
  const deleteOrder = useCallback((id: string) => {
    setOrders(prev => prev.map(o => o.id === id ? { ...o, deletedAt: new Date().toISOString() } : o));
  }, [setOrders]);

  const activeOrders = useMemo(() => orders.filter(o => !o.deletedAt), [orders]);
  return { orders, activeOrders, addOrder, deleteOrder, setOrders };
}

export function useInventoryBatches() {
  const [batches, setBatches] = useSyncedState<InventoryBatch[]>('scp_inventory_batches', storage.loadInventoryBatches, storage.saveInventoryBatches);
  return { batches, setBatches };
}
