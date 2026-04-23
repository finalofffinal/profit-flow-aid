import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  realtime: { params: { eventsPerSecond: 5 } },
});

// Per-key debounce + last-write tracking
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
const lastLocalWrite = new Map<string, number>(); // ms timestamp
const DEBOUNCE_MS = 1500;

export function getLastLocalWrite(key: string): number {
  return lastLocalWrite.get(key) || 0;
}

export async function loadFromSupabase<T>(key: string, fallback: T): Promise<T> {
  try {
    const { data, error } = await supabase
      .from('app_data')
      .select('value')
      .eq('key', key)
      .maybeSingle();
    if (error) {
      console.warn(`Supabase load [${key}]:`, error.message);
      return fallback;
    }
    return data ? (data.value as T) : fallback;
  } catch (e) {
    console.warn('Supabase load failed:', e);
    return fallback;
  }
}

async function _saveToSupabase<T>(key: string, value: T): Promise<void> {
  try {
    const { error } = await supabase
      .from('app_data')
      .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (error) console.warn(`Supabase save [${key}]:`, error.message);
  } catch (e) {
    console.warn('Supabase save failed:', e);
  }
}

export function saveToSupabase<T>(key: string, value: T): void {
  lastLocalWrite.set(key, Date.now());
  const existing = debounceTimers.get(key);
  if (existing) clearTimeout(existing);
  debounceTimers.set(key, setTimeout(() => {
    debounceTimers.delete(key);
    _saveToSupabase(key, value);
  }, DEBOUNCE_MS));
}

export async function saveToSupabaseImmediate<T>(key: string, value: T): Promise<void> {
  lastLocalWrite.set(key, Date.now());
  return _saveToSupabase(key, value);
}

/**
 * Subscribe to realtime changes on app_data.
 * Uses ONE shared Supabase channel with multiple JS-level listeners to avoid
 * the "cannot add postgres_changes callbacks after subscribe()" error.
 */
type RealtimeListener = (key: string, value: unknown) => void;
const listeners = new Set<RealtimeListener>();
let sharedChannel: ReturnType<typeof supabase.channel> | null = null;

function ensureChannel() {
  if (sharedChannel) return sharedChannel;
  sharedChannel = supabase
    .channel('app_data_changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'app_data' },
      (payload) => {
        const row = (payload.new || payload.old) as { key?: string; value?: unknown };
        if (!row?.key) return;
        const lastWrite = lastLocalWrite.get(row.key) || 0;
        if (Date.now() - lastWrite < 5000) return;
        listeners.forEach(l => {
          try { l(row.key!, row.value); } catch (e) { console.warn('Realtime listener error:', e); }
        });
      }
    )
    .subscribe();
  return sharedChannel;
}

export function subscribeRealtime(onChange: RealtimeListener) {
  ensureChannel();
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
    // Keep the shared channel alive across hook unmounts to avoid resubscribe churn.
  };
}
