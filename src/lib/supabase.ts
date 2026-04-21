import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ewugwgzzmrgouutqgfpg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV3dWd3Z3p6bXJnb3V1dHFnZnBnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3ODYxMDIsImV4cCI6MjA5MTM2MjEwMn0.rcSjzuURZX49d5H75iu1jTctmwNrHTVMU9wlhjvQG4g';

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
 * Callback fires whenever ANY row is inserted/updated/deleted by another client.
 * We ignore echoes of our own recent writes (within 5s) to avoid feedback loops.
 */
export function subscribeRealtime(onChange: (key: string, value: unknown) => void) {
  const channel = supabase
    .channel('app_data_changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'app_data' },
      (payload) => {
        const row = (payload.new || payload.old) as { key?: string; value?: unknown };
        if (!row?.key) return;
        const lastWrite = lastLocalWrite.get(row.key) || 0;
        // Skip if this came from our own recent write (echo)
        if (Date.now() - lastWrite < 5000) return;
        onChange(row.key, row.value);
      }
    )
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}
