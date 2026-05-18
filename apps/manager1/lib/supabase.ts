import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _supabase: SupabaseClient | null = null;

function initSupabase(): SupabaseClient | null {
  const g = globalThis as any;
  if (_supabase) return _supabase;
  if (g.__supabase) {
    _supabase = g.__supabase as SupabaseClient;
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
  g.__supabase = client;
  _supabase = client;
  return _supabase;
}

export function getSupabase(): SupabaseClient {
  const client = initSupabase();
  if (!client) throw new Error('Supabase client not initialized');
  return client;
}

const fallbackStub: any = {
  auth: {
    async getUser() { return { data: { user: null }, error: null }; },
    async getSession() { return { data: { session: null }, error: null }; },
    signInWithPassword: async () => ({ data: { user: null, session: null }, error: new Error('Supabase not configured') }),
    signIn: async () => ({ data: null, error: new Error('Supabase not configured') }),
    async signOut() { return { error: null }; },
    onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; },
  },
  from: () => ({
    select: () => ({ data: null, error: null, eq: () => ({ data: null, error: null, single: () => ({ data: null, error: null }), maybeSingle: () => ({ data: null, error: null }) }) }),
    insert: () => ({ data: null, error: null, select: () => ({ data: null, error: null }) }),
    update: () => ({ data: null, error: null, eq: () => ({ data: null, error: null }) }),
    delete: () => ({ data: null, error: null, eq: () => ({ data: null, error: null }) }),
  }),
  channel: (_name?: string) => {
    const realtimeChannel: any = {
      on: (_event: any, _opts: any, _cb?: any) => realtimeChannel,
      subscribe: () => realtimeChannel,
      unsubscribe: () => ({}),
    };
    return realtimeChannel;
  },
  removeChannel: (_channel?: any) => ({}),
};

const supabaseProxy: any = new Proxy({}, {
  get(_, prop) {
    const client = initSupabase();
    const obj: any = client || fallbackStub;
    if (prop === 'auth' && obj?.auth) {
      const authObj = obj.auth;
      return new Proxy(authObj, {
        get(target, authProp) {
          const original = (target as any)[authProp as any];
          if (typeof original !== 'function') return original;
          return original.bind(target);
        }
      });
    }

    return obj[prop as any];
  }
});

export default supabaseProxy as SupabaseClient;
export { supabaseProxy as supabase };
