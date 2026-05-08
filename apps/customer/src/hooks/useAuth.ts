import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabase';

interface AuthState {
    user: any | null;
    loading: boolean;
    error: Error | null;
}

// 인메모리 캐시 + sessionStorage 백업 (새로고침 시 깜빡임 방지)
const AUTH_CACHE_KEY = 'app:auth:cache';
const TAB_SESSION_KEY = 'sht:tab:id';
const ACTIVE_TAB_PREFIX = 'sht:active:tab:user:';
let authCache: { user: any | null; timestamp: number } | null = null;

function getOrCreateTabId() {
    if (typeof window === 'undefined') return '';
    let tabId = sessionStorage.getItem(TAB_SESSION_KEY);
    if (!tabId) {
        tabId = `tab_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
        sessionStorage.setItem(TAB_SESSION_KEY, tabId);
    }
    return tabId;
}

function parseActiveTabValue(raw: string | null): string | null {
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        return typeof parsed?.tabId === 'string' ? parsed.tabId : null;
    } catch {
        return null;
    }
}

function isActiveTabOwner(userId: string): boolean {
    if (typeof window === 'undefined') return true;
    const activeRaw = localStorage.getItem(`${ACTIVE_TAB_PREFIX}${userId}`);
    const activeTabId = parseActiveTabValue(activeRaw);
    if (!activeTabId) return true;
    return activeTabId === getOrCreateTabId();
}

function readSessionCache(): any | null {
    if (authCache?.user) return authCache.user;
    if (typeof window === 'undefined') return null;
    try {
        const raw = sessionStorage.getItem(AUTH_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (parsed?.user) {
            authCache = parsed;
            return parsed.user;
        }
    } catch { /* SSR 안전 */ }
    return null;
}

function writeSessionCache(user: any | null) {
    authCache = { user, timestamp: Date.now() };
    if (typeof window === 'undefined') return;
    try {
        if (user) {
            sessionStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(authCache));
        } else {
            sessionStorage.removeItem(AUTH_CACHE_KEY);
        }
    } catch { /* SSR 안전 */ }
}

export function primeAuthCache(user: any | null) {
    writeSessionCache(user);
}

export function clearAuthCache() {
    authCache = null;
    if (typeof window === 'undefined') return;
    try { sessionStorage.removeItem(AUTH_CACHE_KEY); } catch { /* SSR 안전 */ }
}

/**
 * 로그인 여부만 확인하는 단순한 인증 훅.
 *
 * 핵심 원칙(인증/세션 최소화):
 *  1) supabase.auth.getSession()은 로컬 캐시를 읽기만 함 → 네트워크 호출 없음
 *  2) onAuthStateChange 리스너로 토큰 갱신/로그아웃 변경을 자동 반영
 *  3) 탭 전환/포커스 변경 시 별도 재확인 없음 (Supabase autoRefreshToken이 알아서 처리)
 *  4) 일시적 오류로 자동 로그아웃 시키지 않음 (캐시된 사용자 유지)
 */
export function useAuth(redirectOnFail: string = '/login') {
    const router = useRouter();
    const [authState, setAuthState] = useState<AuthState>({
        // SSR/CSR 첫 렌더를 동일하게 유지해 hydration 불일치를 방지
        user: null,
        loading: true,
        error: null,
    });

    useEffect(() => {
        let cancelled = false;

        const checkOnce = async () => {
            try {
                const cached = readSessionCache();
                if (!cancelled && cached) {
                    setAuthState({ user: cached, loading: false, error: null });
                }

                // ✅ getSession() → getUser(): 서버에서 JWT 유효성 검증 + 만료 시 자동 refresh
                const { data, error } = await supabase.auth.getUser();
                if (cancelled) return;
                if (data?.user) {
                    if (!isActiveTabOwner(data.user.id)) {
                        await supabase.auth.signOut({ scope: 'local' });
                        writeSessionCache(null);
                        setAuthState({ user: null, loading: false, error: null });
                        router.replace(redirectOnFail);
                        return;
                    }
                    writeSessionCache(data.user);
                    setAuthState({ user: data.user, loading: false, error: null });
                } else if (!cached) {
                    // 캐시도 없고 세션도 없을 때만 로그인 페이지로 이동
                    setAuthState({ user: null, loading: false, error: null });
                    router.replace(redirectOnFail);
                } else {
                    // 캐시가 있으나 서버 세션 없음 → 로그인 유도
                    writeSessionCache(null);
                    setAuthState({ user: null, loading: false, error: error as Error | null });
                    router.replace(redirectOnFail);
                }
            } catch (err) {
                if (cancelled) return;
                // 오류 발생 시 캐시된 사용자를 유지 (강제 로그아웃 금지)
                setAuthState(prev => ({ ...prev, loading: false, error: err as Error }));
            }
        };

        checkOnce();

        // Supabase auth 상태 변경 리스너 - 토큰 갱신/로그아웃을 자동 반영
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (cancelled) return;
            if (event === 'SIGNED_OUT') {
                writeSessionCache(null);
                setAuthState({ user: null, loading: false, error: null });
                router.replace(redirectOnFail);
                return;
            }
            if (session?.user) {
                writeSessionCache(session.user);
                setAuthState({ user: session.user, loading: false, error: null });
            }
        });

        const handleStorage = (e: StorageEvent) => {
            if (cancelled || !e.key || !e.key.startsWith(ACTIVE_TAB_PREFIX)) return;
            const cachedUser = readSessionCache();
            if (!cachedUser?.id) return;
            if (e.key !== `${ACTIVE_TAB_PREFIX}${cachedUser.id}`) return;
            const incomingTabId = parseActiveTabValue(e.newValue);
            if (!incomingTabId || incomingTabId === getOrCreateTabId()) return;

            void (async () => {
                try { await supabase.auth.signOut({ scope: 'local' }); } catch { /* noop */ }
                writeSessionCache(null);
                setAuthState({ user: null, loading: false, error: null });
                router.replace(redirectOnFail);
            })();
        };
        window.addEventListener('storage', handleStorage);

        return () => {
            cancelled = true;
            window.removeEventListener('storage', handleStorage);
            try { subscription?.unsubscribe?.(); } catch { /* noop */ }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const refetch = async () => {
        try {
            const { data } = await supabase.auth.getUser();
            if (data?.user) {
                writeSessionCache(data.user);
                setAuthState({ user: data.user, loading: false, error: null });
            } else {
                writeSessionCache(null);
                setAuthState({ user: null, loading: false, error: null });
            }
        } catch (err) {
            setAuthState(prev => ({ ...prev, error: err as Error }));
        }
    };

    return {
        ...authState,
        isAuthenticated: !!authState.user,
        isManager: false,
        isAdmin: false,
        isMember: false,
        isGuest: false,
        refetch,
    };
}
