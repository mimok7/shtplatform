'use client';
import React from 'react';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabase';
import { useReservationListener } from '@/hooks/useReservationListener';
import { RESERVATION_REALTIME_NOTIFICATIONS_ENABLED } from '@/lib/reservationNotificationFeature';
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
  // ✅ 인증 완료 전까지 children 렌더링 차단 (403 방지)
  const [authReady, setAuthReady] = useState(false);
  const { latestReservation, unreadCount, clearLatestReservation } = useReservationListener(
    RESERVATION_REALTIME_NOTIFICATIONS_ENABLED && authReady && (userRole === 'manager' || userRole === 'admin'),
    user?.id || 'anonymous'
  );

  useEffect(() => {
    let cancelled = false;
    const cachedRole = getCachedRole() || getCookieRole();

    const init = async () => {
      try {
        // ✅ getSession() → getUser() 로 변경: 서버에서 JWT 유효성 검증 + 만료 시 자동 갱신
        const { data, error } = await supabase.auth.getUser();
        if (cancelled) return;
        const sessionUser = data?.user ?? null;
        if (error || !sessionUser) {
          setUserRole('guest');
          router.replace('/login');
          return;
        }
        setUser(sessionUser);
        const { data: userData, error: roleError } = await supabase
          .from('users')
          .select('role')
          .eq('id', sessionUser.id)
          .single();
        if (cancelled) return;

        const cached = getCachedRole();
        const cookieRole = !cached ? getCookieRole() : null;
        const roleFromDb = !roleError && typeof userData?.role === 'string' ? userData.role : null;
        const roleFromCache = cached || cookieRole;
        const resolvedRole = roleFromDb || roleFromCache || 'guest';
        setUserRole(resolvedRole);
        if (resolvedRole !== 'guest') setCachedRole(resolvedRole);
        // ✅ 인증 완료 → children 렌더링 허용
        setAuthReady(true);
      } catch (err) {
        console.warn('세션 확인 경고:', err);
        if (cancelled) return;
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

            <div className="ml-auto flex items-center gap-3">
              <div className="relative" title="새 예약 알림">
                <div className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-lg text-gray-700">
                  🔔
                </div>
                {RESERVATION_REALTIME_NOTIFICATIONS_ENABLED && unreadCount > 0 && (
                  <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-500 px-1.5 text-center text-[11px] font-semibold leading-5 text-white">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </div>
            </div>
          </div>
          <main className="flex-1 overflow-y-auto px-4 py-6">
            {authReady ? children : (
              <div className="flex justify-center items-center h-72">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500" />
              </div>
            )}
            <div className="h-10" />
          </main>

          {RESERVATION_REALTIME_NOTIFICATIONS_ENABLED && latestReservation && (
            <div className="pointer-events-none fixed right-4 top-20 z-50 w-full max-w-sm">
              <div className="pointer-events-auto rounded-xl border border-emerald-200 bg-white p-4 shadow-xl">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-lg">🔔</div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900">새 예약이 접수되었습니다</p>
                    <p className="mt-1 text-sm text-gray-700">유형: {latestReservation.type}</p>
                    <p className="text-sm text-gray-700">상태: {latestReservation.status}</p>
                    <p className="mt-1 text-xs text-gray-500">{new Date(latestReservation.createdAt).toLocaleString('ko-KR')}</p>
                  </div>
                  <button
                    type="button"
                    onClick={clearLatestReservation}
                    className="rounded-md px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                  >
                    닫기
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </RoleContext.Provider>
  );
}
