import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _supabase: SupabaseClient | null = null;
const AUTH_CALL_TIMEOUT_MS = 10000;

function withTimeoutFallback<T>(
  promise: Promise<T>,
  fallback: () => T,
  timeoutMs = AUTH_CALL_TIMEOUT_MS
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      resolve(fallback());
    }, timeoutMs);

    promise
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

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
    async signOut() { return { error: null }; },
    onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; },
  },
  from: () => ({
    select: () => ({ data: null, error: null, eq: () => ({ data: null, error: null, single: () => ({ data: null, error: null }), maybeSingle: () => ({ data: null, error: null }) }) }),
    insert: () => ({ data: null, error: null, select: () => ({ data: null, error: null }) }),
    update: () => ({ data: null, error: null, eq: () => ({ data: null, error: null }) }),
    delete: () => ({ data: null, error: null, eq: () => ({ data: null, error: null }) }),
  }),
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

          if (authProp === 'getUser') {
            return async (...args: any[]) => {
              if (args.length === 0 && typeof window !== 'undefined' && typeof (target as any).getSession === 'function') {
                try {
                  const sessionResult = await withTimeoutFallback(
                    Promise.resolve((target as any).getSession()),
                    () => ({ data: { session: null }, error: new Error('supabase_getSession_timeout') } as any),
                    AUTH_CALL_TIMEOUT_MS
                  );
                  const sessionUser = sessionResult?.data?.session?.user ?? null;
                  if (sessionUser) {
                    return { data: { user: sessionUser }, error: null } as any;
                  }
                } catch {
                  // Ignore and fallback to getUser call
                }
              }

              return withTimeoutFallback(
                Promise.resolve(original.apply(target, args)),
                () => ({ data: { user: null }, error: new Error('supabase_getUser_timeout') } as any),
                AUTH_CALL_TIMEOUT_MS
              );
            };
          }

          if (authProp === 'getSession') {
            return (...args: any[]) => withTimeoutFallback(
              Promise.resolve(original.apply(target, args)),
              () => {
                const timeoutError = new Error('supabase_getSession_timeout');
                return { data: { session: null }, error: timeoutError } as any;
              },
              AUTH_CALL_TIMEOUT_MS
            );
          }

          return original.bind(target);
        }
      });
    }

    return obj[prop as any];
  }
});

export default supabaseProxy as SupabaseClient;
export { supabaseProxy as supabase };
