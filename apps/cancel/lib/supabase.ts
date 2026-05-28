import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

export function getBrowserSupabase(): SupabaseClient {
    if (_client) return _client;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error('Supabase env not configured');
    _client = createClient(url, key, {
        auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true },
    });
    return _client;
}

let _service: SupabaseClient | null = null;
export function getServiceSupabase(): SupabaseClient {
    if (_service) return _service;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Service role env not configured');
    _service = createClient(url, key, {
        auth: { autoRefreshToken: false, persistSession: false },
    });
    return _service;
}
