'use client';
import React from 'react';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabase';
import { getCachedRole, getCookieRole, setCachedRole, clearCachedRole } from '@/lib/userUtils';
import { clearAuthCache } from '@/hooks/useAuth';
import { RoleContext } from '@/app/components/RoleContext';
import ManagerSidebar from './ManagerSidebar';

interface ManagerLayoutProps {
  children: React.ReactNode;
  title?: string;
  activeTab?: string;
  // (전역 정책 변경) 더 이상 매니저 권한 확인을 수행하지 않음
}

export default function ManagerLayout({ children, title, activeTab }: ManagerLayoutProps) {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [userRole, setUserRole] = useState<string | null>(() => getCachedRole() || getCookieRole() || 'guest');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [sidebarMode, setSidebarMode] = useState<'auto' | 'manual'>('auto');

  useEffect(() => {
    let cancelled = false;
    const cachedRole = getCachedRole() || getCookieRole();

    const init = async () => {
      try {
        // 레이아웃 렌더를 블로킹하지 않고 세션을 동기화한다.
        const { data, error } = await supabase.auth.getSession();
        if (cancelled) return;
        const sessionUser = data?.session?.user ?? null;
        if (error || !sessionUser) {
          // 캐시된 role/사용자가 있으면 일시적 세션 미스로 간주하고 유지
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
      } catch (err) {
        console.warn('세션 확인 경고:', err);
        if (cancelled) return;
        // 일시 오류 시 캐시된 role이 있으면 유지 (강제 로그아웃 금지)
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
        clearAuthCache();
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

  // 로컬 스토리지에 저장된 사이드바 모드 불러오기
  useEffect(() => {
    try {
      const saved = localStorage.getItem('sidebarMode');
      if (saved === 'auto' || saved === 'manual') setSidebarMode(saved);
    } catch (e) {
      // 서버 사이드 렌더링 안전성: 무시
    }
  }, []);

  // 사이드바 모드 변경 시 로컬 스토리지에 저장
  useEffect(() => {
    try {
      localStorage.setItem('sidebarMode', sidebarMode);
    } catch (e) {
      // ignore
    }
  }, [sidebarMode]);

  // transform 클래스는 자동/수동 모드에 따라 달라짐
  // 사이드바의 전체 클래스 조합 (수동 모드에서 숨김 시 레이아웃 공간 제거)
  let sidebarClasses = 'print:hidden fixed inset-y-0 left-0 z-50 transform transition-transform duration-300 ease-in-out';
  if (sidebarMode === 'auto') {
    // 자동 모드: 큰 화면에서는 항상 표시, 작은 화면은 토글
    if (isSidebarOpen) {
      sidebarClasses += ' translate-x-0 lg:static';
    } else {
      sidebarClasses += ' -translate-x-full lg:translate-x-0 lg:static';
    }
  } else {
    // 수동 모드: 사용자가 열었을 때만 보이도록, 숨기면 큰 화면에서도 공간을 차지하지 않음
    if (isSidebarOpen) {
      sidebarClasses += ' translate-x-0 lg:static';
    } else {
      sidebarClasses += ' -translate-x-full';
    }
  }

  const handleLogout = async () => {
    const clearSupabaseAuthStorage = () => {
      const clearStorage = (storage: Storage | null) => {
        if (!storage) return;
        const keysToDelete: string[] = [];
        for (let i = 0; i < storage.length; i += 1) {
          const key = storage.key(i);
          if (!key) continue;
          if (key.startsWith('sb-') && key.includes('-auth-token')) {
            keysToDelete.push(key);
          }
        }
        keysToDelete.forEach((key) => storage.removeItem(key));
      };

      try {
        clearStorage(window.sessionStorage);
        clearStorage(window.localStorage);
      } catch (e) {
        console.warn('스토리지 인증키 정리 중 경고:', e);
      }
    };

    try {
      // 로컬/글로벌 세션 모두 종료 시도
      await supabase.auth.signOut({ scope: 'global' });
    } catch (e) {
      console.warn('로그아웃 처리 중 경고:', e);
    } finally {
      // 모든 캐시 명시적 초기화
      clearCachedRole();   // sessionStorage + 쿠키 삭제
      clearAuthCache();    // 인메모리 5분 role 캐시 삭제
      clearSupabaseAuthStorage();
      // 하드 리다이렉트: Next.js 라우터 캐시까지 완전 초기화
      window.location.href = '/login';
    }
  };

  return (
    <RoleContext.Provider value={{ role: userRole as any, user }}>
      <div className="h-screen w-full flex bg-gray-100 overflow-hidden">
        {/* 모바일 오버레이 */}
        {isSidebarOpen && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden print:hidden"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        {/* 좌측 사이드바 */}
        <div className={sidebarClasses}>
          <ManagerSidebar
            activeTab={activeTab}
            userEmail={user?.email}
            userRole={userRole}
            onLogout={handleLogout}
            onClose={() => setIsSidebarOpen(false)}
          />
        </div>

        {/* 우측 콘텐츠 영역 */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* 상단 바 (선택적 타이틀) */}
          <div className="h-16 flex items-center px-4 border-b border-gray-200 bg-white/90 backdrop-blur supports-[backdrop-filter]:backdrop-blur-sm sticky top-0 z-30 print:hidden">
            {/* 사이드바 수동 토글 (모바일/데스크톱 모두 사용 가능) */}
            <button
              onClick={() => setIsSidebarOpen(prev => !prev)}
              className="mr-3 p-2 rounded-md hover:bg-gray-100 text-gray-600"
              aria-label="사이드바 토글"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            {/* 표시/숨김 모드 토글 */}
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
