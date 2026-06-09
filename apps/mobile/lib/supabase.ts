import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const hasSupabaseEnv = !!(supabaseUrl && supabaseAnonKey);

let _supabase: SupabaseClient | null = null;

function initSupabase(): SupabaseClient {
  const g = globalThis as any;
  if (_supabase) return _supabase;
  if (g.__mobile_supabase) {
    _supabase = g.__mobile_supabase as SupabaseClient;
    return _supabase;
  }

  const isBrowser = typeof window !== 'undefined';
  _supabase = createClient(
    supabaseUrl || 'https://placeholder.supabase.co',
    supabaseAnonKey || 'placeholder-key',
    {
      auth: isBrowser
        ? {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
          }
        : {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
    }
  );

  g.__mobile_supabase = _supabase;
  return _supabase;
}

const supabase = initSupabase();

export default supabase;
