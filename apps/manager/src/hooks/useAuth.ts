import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabase';

interface AuthState {
    user: any | null;
    role: string | null;
    loading: boolean;
    error: Error | null;
}

// 인메모리 + sessionStorage 백업 캐시 (새로고침/탭 복귀 시 깜빡임 방지)
const AUTH_CACHE_KEY = 'app:auth:cache';
let authCache: { user: any | null; role: string | null; timestamp: number } | null = null;

function readSessionCache(): { user: any | null; role: string | null } | null {
    if (authCache?.user) return { user: authCache.user, role: authCache.role };
    if (typeof window === 'undefined') return null;
    try {
        const raw = sessionStorage.getItem(AUTH_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (parsed?.user) {
            authCache = parsed;
            return { user: parsed.user, role: parsed.role ?? null };
        }
    } catch { /* SSR 안전 */ }
    return null;
}

function writeSessionCache(user: any | null, role: string | null = null) {
    authCache = { user, role, timestamp: Date.now() };
    if (typeof window === 'undefined') return;
    try {
        if (user) {
            sessionStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(authCache));
        } else {
            sessionStorage.removeItem(AUTH_CACHE_KEY);
        }
    } catch { /* SSR 안전 */ }
}

/**
 * 인증/권한 확인 훅 (단순화 버전).
 *
 * 핵심 원칙(인증/세션 최소화):
 *  1) supabase.auth.getSession()은 로컬 캐시만 읽음 → 네트워크 호출 없음
 *  2) onAuthStateChange 리스너로 토큰 갱신/로그아웃 변경을 자동 반영
 *  3) 탭 전환/포커스/online 강제 재확인 없음 (Supabase autoRefreshToken이 처리)
 *  4) 일시적 오류로 자동 로그아웃 시키지 않음 (캐시된 사용자 유지)
 *  5) watchdog 타임아웃 없음 → 잘못된 false negative 제거
 */
export function useAuth(requiredRoles?: string[], redirectOnFail: string = '/login') {
    const router = useRouter();
    const cached = typeof window !== 'undefined' ? readSessionCache() : null;
    const [authState, setAuthState] = useState<AuthState>({
        user: cached?.user ?? null,
        role: cached?.role ?? null,
        loading: !cached, // 캐시가 있으면 즉시 사용 → 로딩 깜빡임 방지
        error: null,
    });

    useEffect(() => {
        let cancelled = false;

        const fetchRole = async (userId: string): Promise<string> => {
            try {
                const { data } = await supabase
                    .from('users')
                    .select('role')
                    .eq('id', userId)
                    .maybeSingle();
                return ((data?.role as string) || 'guest');
            } catch {
                return 'guest';
            }
        };

        const applyAuth = async (user: any | null) => {
            if (cancelled) return;

            if (!user) {
                if (!cached) {
                    writeSessionCache(null);
                    setAuthState({ user: null, role: null, loading: false, error: null });
                    if (requiredRoles?.length) router.replace('/login');
                } else {
                    // 캐시 있는데 일시적으로 세션이 없는 경우 → 캐시 유지
                    setAuthState((prev) => ({ ...prev, loading: false }));
                }
                return;
            }

            let role: string | null = cached?.role ?? null;
            if (requiredRoles?.length || !role || role === 'guest') {
                role = await fetchRole(user.id);
            }
            if (cancelled) return;

            writeSessionCache(user, role);

            if (requiredRoles?.length && role && !requiredRoles.includes(role)) {
                setAuthState({ user: null, role: null, loading: false, error: null });
                router.replace(redirectOnFail);
                return;
            }
            setAuthState({ user, role, loading: false, error: null });
        };

        const checkOnce = async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                await applyAuth(session?.user ?? null);
            } catch (err) {
                if (cancelled) return;
                setAuthState((prev) => ({ ...prev, loading: false, error: err as Error }));
            }
        };

        checkOnce();

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (cancelled) return;
            if (event === 'SIGNED_OUT') {
                writeSessionCache(null);
                setAuthState({ user: null, role: null, loading: false, error: null });
                if (requiredRoles?.length) router.replace('/login');
                return;
            }
            if (session?.user) {
                if (event === 'TOKEN_REFRESHED') {
                    writeSessionCache(session.user, authCache?.role ?? null);
                    setAuthState((prev) => ({ ...prev, user: session.user, loading: false }));
                    return;
                }
                void applyAuth(session.user);
            }
        });

        return () => {
            cancelled = true;
            try { subscription?.unsubscribe?.(); } catch { /* noop */ }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const refetch = async () => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) {
                const { data } = await supabase
                    .from('users')
                    .select('role')
                    .eq('id', session.user.id)
                    .maybeSingle();
                const role = ((data?.role as string) || 'guest');
                writeSessionCache(session.user, role);
                setAuthState({ user: session.user, role, loading: false, error: null });
            } else {
                writeSessionCache(null);
                setAuthState({ user: null, role: null, loading: false, error: null });
            }
        } catch (err) {
            setAuthState((prev) => ({ ...prev, loading: false, error: err as Error }));
        }
    };

    return {
        ...authState,
        isAuthenticated: !!authState.user,
        isManager: authState.role === 'manager' || authState.role === 'admin',
        isAdmin: authState.role === 'admin',
        isMember: authState.role === 'member',
        isGuest: authState.role === 'guest',
        refetch,
    };
}

/** 캐시 수동 무효화 (로그아웃 시 사용) */
export function clearAuthCache() {
    authCache = null;
    if (typeof window === 'undefined') return;
    try { sessionStorage.removeItem(AUTH_CACHE_KEY); } catch { /* SSR 안전 */ }
}
