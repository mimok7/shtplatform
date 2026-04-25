// lib/supabase.ts
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
  // Reuse a global singleton to survive HMR in dev and avoid multiple GoTrue instances
  const g = globalThis as any;
  if (_supabase) return _supabase;
  if (g.__supabase) {
    _supabase = g.__supabase as SupabaseClient;
    return _supabase;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return null;
  }

  const isBrowser = typeof window !== 'undefined';

  const client = createClient(url, key, {
    auth: isBrowser
      ? {
        // 로그아웃 전까지 로그인 유지 (브라우저 기본 localStorage 사용)
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      }
      : {
        // 서버 환경에서는 세션 저장 비활성화
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
  });
  g.__supabase = client;
  _supabase = client;
  return _supabase;
}

export function getSupabase(): SupabaseClient {
  const client = initSupabase();
  if (!client) {
    throw new Error('Supabase client not initialized: missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }
  return client;
}

// Minimal safe fallback stub used when env vars are not provided.
const fallbackStub: any = {
  auth: {
    async getUser() {
      return { data: { user: null }, error: null };
    },
    // preserve common auth methods used in the app
    signIn: async () => ({ data: null, error: new Error('Supabase not configured') }),
    signOut: async () => ({ data: null, error: new Error('Supabase not configured') })
  },
  from: (_table: string) => ({
    select: (_cols?: string) => ({
      eq: (_col: string, _val: any) => ({ single: async () => ({ data: null, error: null }) }),
      in: (_col: string, _vals: any[]) => ({ order: (_c: string, _o?: any) => ({ limit: (_n: number) => ({ then: (f: any) => f({ data: [], error: null }) }) }) }),
      order: (_c: string, _opts?: any) => ({ limit: (_n: number) => ({ then: (f: any) => f({ data: [], error: null }) }) }),
      single: async () => ({ data: null, error: null }),
      limit: (_n: number) => ({ then: (f: any) => f({ data: [], error: null }) })
    }),
    insert: async (_payload: any) => ({ data: null, error: null }),
    update: async (_payload: any) => ({ data: null, error: null }),
    eq: (_col: string, _val: any) => ({ select: async () => ({ data: null, error: null }) })
  }),
  channel: (_name?: string) => ({
    on: (_event: any, _opts: any, _cb?: any) => ({ subscribe: () => ({}) }),
    subscribe: () => ({})
  }),
  // If code expects other properties, return a function that throws a clear error when invoked.
  __notConfigured: true
};

// Default export: a lightweight proxy that calls getSupabase() lazily.
// When real creds are missing, return the safe fallback stub instead of throwing so the app doesn't crash on import.
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
    // @ts-ignore
    return obj[prop as any];
  }
});

export default supabaseProxy;
export { supabaseProxy as supabase };
