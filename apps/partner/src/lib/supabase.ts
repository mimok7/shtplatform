// lib/supabase.ts
import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _supabase: SupabaseClient | null = null;

function initSupabase(): SupabaseClient | null {
    const g = globalThis as any;
    if (_supabase) return _supabase;
    if (g.__sht_partner_supabase) {
        _supabase = g.__sht_partner_supabase as SupabaseClient;
        return _supabase;
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return null;

    const isBrowser = typeof window !== 'undefined';
    const client = createClient(url, key, {
        auth: isBrowser
            ? { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
            : { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    g.__sht_partner_supabase = client;
    _supabase = client;
    return _supabase;
}

const fallbackStub: any = {
    auth: {
        async getSession() { return { data: { session: null }, error: null }; },
        async getUser() { return { data: { user: null }, error: null }; },
        async signOut() { return { error: null }; },
        onAuthStateChange() { return { data: { subscription: { unsubscribe() { } } } }; },
    },
    from() {
        return {
            select() { return this; },
            eq() { return this; },
            in() { return this; },
            order() { return this; },
            limit() { return this; },
            single() { return Promise.resolve({ data: null, error: null }); },
            maybeSingle() { return Promise.resolve({ data: null, error: null }); },
            then(resolve: any) { resolve({ data: [], error: null }); },
        };
    },
};

export const supabase: SupabaseClient = (initSupabase() as any) || fallbackStub;

export function getSupabase(): SupabaseClient {
    const client = initSupabase();
    if (!client) throw new Error('Supabase not initialized: check NEXT_PUBLIC_SUPABASE_URL/ANON_KEY');
    return client;
}
