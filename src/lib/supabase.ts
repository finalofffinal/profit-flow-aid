import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ewugwgzzmrgouutqgfpg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV3dWd3Z3p6bXJnb3V1dHFnZnBnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3ODYxMDIsImV4cCI6MjA5MTM2MjEwMn0.rcSjzuURZX49d5H75iu1jTctmwNrHTVMU9wlhjvQG4g';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Debounce map to prevent rapid-fire saves
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
const DEBOUNCE_MS = 2000; // 2 seconds debounce

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

// Internal save (no debounce)
async function _saveToSupabase<T>(key: string, value: T): Promise<void> {
  try {
    const { error } = await supabase
      .from('app_data')
      .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });

    if (error) {
      console.warn(`Supabase save [${key}]:`, error.message);
    }
  } catch (e) {
    console.warn('Supabase save failed:', e);
  }
}

// Debounced save to avoid timeout on rapid state changes
export function saveToSupabase<T>(key: string, value: T): void {
  const existing = debounceTimers.get(key);
  if (existing) clearTimeout(existing);

  debounceTimers.set(key, setTimeout(() => {
    debounceTimers.delete(key);
    _saveToSupabase(key, value);
  }, DEBOUNCE_MS));
}

// Immediate save (for backup import)
export async function saveToSupabaseImmediate<T>(key: string, value: T): Promise<void> {
  return _saveToSupabase(key, value);
}
