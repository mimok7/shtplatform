'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const CACHE_KEY = 'sht_partner_user_cache';
const PROFILE_CACHE_KEY = 'sht_partner_profile_cache';
const PROFILE_CACHE_TTL_MS = 1000 * 60 * 30;
const TAB_SESSION_KEY = 'sht:tab:id';
const ACTIVE_TAB_PREFIX = 'sht:active:tab:user:';

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

function readCache(): any | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = window.localStorage.getItem(CACHE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch { return null; }
}
function writeCache(user: any | null) {
    if (typeof window === 'undefined') return;
    try {
        if (user) window.localStorage.setItem(CACHE_KEY, JSON.stringify(user));
        else window.localStorage.removeItem(CACHE_KEY);
    } catch { /* noop */ }
}

function readProfileCache(userId: string): AuthState['profile'] | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = window.localStorage.getItem(PROFILE_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (parsed?.userId !== userId || !parsed?.cachedAt) return null;
        if (Date.now() - parsed.cachedAt > PROFILE_CACHE_TTL_MS) return null;
        return parsed.profile ?? null;
    } catch { return null; }
}

function writeProfileCache(userId: string | null, profile: AuthState['profile'] | null) {
    if (typeof window === 'undefined') return;
    try {
        if (!userId || !profile) {
            window.localStorage.removeItem(PROFILE_CACHE_KEY);
            return;
        }
        window.localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({ userId, profile, cachedAt: Date.now() }));
    } catch { /* noop */ }
}

export interface AuthState {
    user: any;
    profile: {
        role?: string;
        partner_id?: string | null;
        partner_code?: string | null;
        partner_name?: string | null;
        branch_name?: string | null;
        name?: string | null;
    } | null;
    loading: boolean;
}

/**
 * useAuth — manager 표준 패턴(watchdog 없음, [] 의존성, cancelled 플래그)
 * @param requiredRoles - ['member','partner','manager','admin'] 중 허용할 role 목록 (선택)
 * @param redirectOnFail - 권한 미달/세션 없음 시 이동 경로 (기본 /partner/login)
 */
export function useAuth(requiredRoles?: string[], redirectOnFail: string = '/partner/login') {
    const router = useRouter();
    const cached = typeof window !== 'undefined' ? readCache() : null;
    const [state, setState] = useState<AuthState>({
        user: cached,
        profile: null,
        loading: true,
    });

    useEffect(() => {
        let cancelled = false;

        const init = async () => {
            try {
                // ✅ getSession() → getUser(): 서버에서 JWT 유효성 검증 + 만료 시 자동 refresh
                const { data, error } = await supabase.auth.getUser();
                if (cancelled) return;

                const user = data?.user || null;
                if (!user || error) {
                    writeCache(null);
                    setState({ user: null, profile: null, loading: false });
                    router.replace(redirectOnFail);
                    return;
                }

                if (!isActiveTabOwner(user.id)) {
                    try { await supabase.auth.signOut({ scope: 'local' }); } catch { /* noop */ }
                    writeCache(null);
                    writeProfileCache(null, null);
                    setState({ user: null, profile: null, loading: false });
                    router.replace(redirectOnFail);
                    return;
                }

                writeCache(user);

                // role/partner_id 조회
                let profile: AuthState['profile'] = readProfileCache(user.id);
                try {
                    if (!profile) {
                        const { data: u } = await supabase
                            .from('users')
                            .select('role, name')
                            .eq('id', user.id)
                            .maybeSingle();
                        let partner_id: string | null = null;
                        let partner_code: string | null = null;
                        let partner_name: string | null = null;
                        let branch_name: string | null = null;
                        if (u?.role === 'partner') {
                            const { data: pu } = await supabase
                                .from('partner_user')
                                .select('pu_partner_id, partner:pu_partner_id(partner_code, name, branch_name)')
                                .eq('pu_user_id', user.id)
                                .maybeSingle();
                            partner_id = (pu as any)?.pu_partner_id ?? null;
                            const p = (pu as any)?.partner;
                            partner_code = p?.partner_code ?? null;
                            partner_name = p?.name ?? null;
                            branch_name = p?.branch_name ?? null;
                        }
                        profile = { role: u?.role, name: u?.name, partner_id, partner_code, partner_name, branch_name };
                        writeProfileCache(user.id, profile);
                    }
                } catch { /* ignore */ }

                if (cancelled) return;

                if (requiredRoles && requiredRoles.length > 0) {
                    if (!profile?.role || !requiredRoles.includes(profile.role)) {
                        setState({ user, profile, loading: false });
                        router.replace(redirectOnFail);
                        return;
                    }
                }

                setState({ user, profile, loading: false });
            } catch (err) {
                if (cancelled) return;
                console.error('[useAuth] error:', err);
                setState(prev => ({ ...prev, loading: false }));
            }
        };

        init();

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (cancelled) return;
            if (event === 'SIGNED_OUT') {
                writeCache(null);
                writeProfileCache(null, null);
                setState({ user: null, profile: null, loading: false });
                router.replace(redirectOnFail);
                return;
            }
            if (session?.user) {
                writeCache(session.user);
                setState(prev => ({ ...prev, user: session.user }));
            }
        });

        const handleStorage = (e: StorageEvent) => {
            if (cancelled || !e.key || !e.key.startsWith(ACTIVE_TAB_PREFIX)) return;
            const current = readCache();
            if (!current?.id) return;
            if (e.key !== `${ACTIVE_TAB_PREFIX}${current.id}`) return;
            const incomingTabId = parseActiveTabValue(e.newValue);
            if (!incomingTabId || incomingTabId === getOrCreateTabId()) return;

            void (async () => {
                try { await supabase.auth.signOut({ scope: 'local' }); } catch { /* noop */ }
                writeCache(null);
                writeProfileCache(null, null);
                setState({ user: null, profile: null, loading: false });
                router.replace(redirectOnFail);
            })();
        };
        window.addEventListener('storage', handleStorage);

        return () => {
            cancelled = true;
            window.removeEventListener('storage', handleStorage);
            try { subscription?.unsubscribe?.(); } catch { /* noop */ }
        };
    }, []);

    return { ...state, isAuthenticated: !!state.user };
}
