'use client';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabase';
import { getCachedRole, getCookieRole, setCachedRole, clearCachedRole } from '@/lib/userUtils';
import { RoleContext } from '@/app/components/RoleContext';
import ManagerSidebar from './ManagerSidebar';

interface ManagerLayoutProps {
  children: React.ReactNode;
  title?: string;
  activeTab?: string;
}

export default function ManagerLayout({ children, title, activeTab }: ManagerLayoutProps) {
  const [user, setUser] = useState<any>(null);
  const [userRole, setUserRole] = useState<string | null>(() => getCachedRole() || getCookieRole() || 'guest');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [sidebarMode, setSidebarMode] = useState<'auto' | 'manual'>('auto');
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    const cachedRole = getCachedRole() || getCookieRole();

    const init = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (cancelled) return;
        const sessionUser = data?.session?.user ?? null;
        if (error || !sessionUser) {
          if (cachedRole) {
            setUserRole(cachedRole);
            return;
          }
          setUserRole('guest');
          router.replace('/login');
          return;
        }
        setUser(sessionUser);
        const cached = getCachedRole();
        const cookieRole = !cached ? getCookieRole() : null;
        const roleFromCache = cached || cookieRole;
        setUserRole(roleFromCache || 'guest');
        if (!cached && roleFromCache) setCachedRole(roleFromCache);
      } catch {
        if (cancelled) return;
        if (cachedRole) {
          setUserRole(cachedRole);
          return;
        }
        setUserRole('guest');
        router.replace('/login');
      }
    };
    init();

    // 토큰 갱신/로그아웃 자동 반영
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === 'SIGNED_OUT') {
        clearCachedRole();
        setUser(null);
        setUserRole('guest');
        router.replace('/login');
        return;
      }
      if (session?.user) {
        setUser(session.user);
      }
    });

    return () => {
      cancelled = true;
      try { subscription?.unsubscribe?.(); } catch { /* noop */ }
    };
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('sidebarMode');
      if (saved === 'auto' || saved === 'manual') setSidebarMode(saved);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('sidebarMode', sidebarMode);
    } catch {}
  }, [sidebarMode]);

  let sidebarClasses = 'print:hidden fixed inset-y-0 left-0 z-50 transform transition-transform duration-300 ease-in-out';
  if (sidebarMode === 'auto') {
    if (isSidebarOpen) {
      sidebarClasses += ' translate-x-0 lg:static';
    } else {
      sidebarClasses += ' -translate-x-full lg:translate-x-0 lg:static';
    }
  } else {
    if (isSidebarOpen) {
      sidebarClasses += ' translate-x-0 lg:static';
    } else {
      sidebarClasses += ' -translate-x-full';
    }
  }

  const handleLogout = async () => {
    try { await supabase.auth.signOut({ scope: 'global' }); } catch {}
    clearCachedRole();
    try {
      const clearStorage = (s: Storage | null) => {
        if (!s) return;
        const keys: string[] = [];
        for (let i = 0; i < s.length; i++) { const k = s.key(i); if (k?.startsWith('sb-') && k.includes('-auth-token')) keys.push(k); }
        keys.forEach(k => s.removeItem(k));
      };
      clearStorage(window.sessionStorage);
      clearStorage(window.localStorage);
    } catch {}
    window.location.href = '/login';
  };

  return (
    <RoleContext.Provider value={{ role: userRole as any, user }}>
      <div className="h-screen w-full flex bg-gray-100 overflow-hidden">
        {isSidebarOpen && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden print:hidden"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        <div className={sidebarClasses}>
          <ManagerSidebar
            activeTab={activeTab}
            userEmail={user?.email}
            userRole={userRole}
            onLogout={handleLogout}
            onClose={() => setIsSidebarOpen(false)}
          />
        </div>
        <div className="flex-1 flex flex-col min-w-0">
          <div className="h-16 flex items-center px-4 border-b border-gray-200 bg-white/90 backdrop-blur supports-[backdrop-filter]:backdrop-blur-sm sticky top-0 z-30 print:hidden">
            <button
              onClick={() => setIsSidebarOpen(prev => !prev)}
              className="mr-3 p-2 rounded-md hover:bg-gray-100 text-gray-600"
              aria-label="사이드바 토글"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            <button
              onClick={() => setSidebarMode(prev => (prev === 'auto' ? 'manual' : 'auto'))}
              className="mr-3 px-2 py-1 text-xs border rounded text-gray-600"
              aria-label="사이드바 모드 전환"
            >
              {sidebarMode === 'auto' ? '숨김' : '표시'}
            </button>

            {title && <h1 className="text-lg font-semibold text-gray-800 truncate">{title}</h1>}
          </div>
          <main className="flex-1 overflow-y-auto px-4 py-6">
            {children}
            <div className="h-10" />
          </main>
        </div>
      </div>
    </RoleContext.Provider>
  );
}
