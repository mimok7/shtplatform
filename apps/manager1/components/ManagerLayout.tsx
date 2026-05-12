'use client';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabase';
import { useReservationListener } from '@/hooks/useReservationListener';
import { RESERVATION_REALTIME_NOTIFICATIONS_ENABLED } from '@/lib/reservationNotificationFeature';
import { getCachedRole, getCookieRole, setCachedRole, clearCachedRole } from '@/lib/userUtils';
import { RoleContext } from '@/app/components/RoleContext';
import ManagerSidebar from './ManagerSidebar';
import { ReservationDetailModalProvider } from '@/contexts/ReservationDetailModalProvider';
import ReservationDetailModalSwitch from './ReservationDetailModalSwitch';
import PackageDetailModalContainer from './PackageDetailModalContainer';
import GoogleSheetsDetailModal from './GoogleSheetsDetailModal';
import { useReservationDetailModal } from '@/hooks/useReservationDetailModal';

const TAB_SESSION_KEY = 'sht:tab:id';
const ACTIVE_TAB_PREFIX = 'sht:active:tab:user:manager1:';

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

interface ManagerLayoutProps {
  children: React.ReactNode;
  title?: string;
  activeTab?: string;
}

export default function ManagerLayout({ children, title, activeTab }: ManagerLayoutProps) {
  return (
    <ReservationDetailModalProvider>
      <ManagerLayoutContent children={children} title={title} activeTab={activeTab} />
    </ReservationDetailModalProvider>
  );
}

function ManagerLayoutContent({ children, title, activeTab }: ManagerLayoutProps) {
  const [user, setUser] = useState<any>(null);
  const [userRole, setUserRole] = useState<string | null>(() => getCachedRole() || getCookieRole() || 'guest');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [sidebarMode, setSidebarMode] = useState<'auto' | 'manual'>('auto');
  const [authReady, setAuthReady] = useState(false);
  const router = useRouter();
  const { latestReservation, unreadCount, clearLatestReservation } = useReservationListener(
    RESERVATION_REALTIME_NOTIFICATIONS_ENABLED && authReady && (userRole === 'manager' || userRole === 'admin'),
    user?.id || 'anonymous'
  );
  
  // Context에서 모달 상태 가져오기
  const {
    isOpen,
    userInfo,
    allUserServices,
    loading,
    modalKey,
    closeModal,
    isPackageOpen,
    packageModalUserId,
    closePackageModal,
    googleSheetsDetail,
    closeGoogleSheetsModal,
  } = useReservationDetailModal();

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
          if (cachedRole) {
            setUserRole(cachedRole);
            // 캐시 있어도 실제 세션 없으면 로그인으로
            router.replace('/login');
            return;
          }
          setUserRole('guest');
          router.replace('/login');
          return;
        }

        if (!isActiveTabOwner(sessionUser.id)) {
          try { await supabase.auth.signOut({ scope: 'local' }); } catch { /* noop */ }
          clearCachedRole();
          setUser(null);
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
      } catch {
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
        setUser(null);
        setUserRole('guest');
        router.replace('/login');
        return;
      }
      if (session?.user) {
        setUser(session.user);
      }
    });

    const handleStorage = (e: StorageEvent) => {
      if (cancelled || !e.key || !e.key.startsWith(ACTIVE_TAB_PREFIX)) return;
      const incomingTabId = parseActiveTabValue(e.newValue);
      if (!incomingTabId || incomingTabId === getOrCreateTabId()) return;

      void (async () => {
        const { data } = await supabase.auth.getUser();
        const currentUser = data?.user;
        if (!currentUser) return;
        if (e.key !== `${ACTIVE_TAB_PREFIX}${currentUser.id}`) return;
        try { await supabase.auth.signOut({ scope: 'local' }); } catch { /* noop */ }
        clearCachedRole();
        setUser(null);
        setUserRole('guest');
        router.replace('/login');
      })();
    };
    window.addEventListener('storage', handleStorage);

    return () => {
      cancelled = true;
      window.removeEventListener('storage', handleStorage);
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
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" suppressHydrationWarning>
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

        {/* ✅ 중앙 모달 렌더링: 모든 페이지에서 한 번만 */}
        {isOpen && (
          <ReservationDetailModalSwitch
            key={modalKey}
            isOpen={isOpen}
            onClose={closeModal}
            userInfo={userInfo}
            allUserServices={allUserServices}
            loading={loading}
          />
        )}

        <PackageDetailModalContainer
          userId={packageModalUserId}
          isOpen={isPackageOpen}
          onClose={closePackageModal}
        />

        <GoogleSheetsDetailModal
          key={googleSheetsDetail.modalKey}
          isOpen={googleSheetsDetail.isOpen}
          onClose={closeGoogleSheetsModal}
          selectedReservation={googleSheetsDetail.selectedReservation}
          allOrderServices={googleSheetsDetail.allOrderServices}
          loading={googleSheetsDetail.loading}
          orderUserInfo={googleSheetsDetail.orderUserInfo}
          relatedEmail={googleSheetsDetail.relatedEmail}
          relatedDbServices={googleSheetsDetail.relatedDbServices}
          relatedDbLoading={googleSheetsDetail.relatedDbLoading}
        />
      </div>
    </RoleContext.Provider>
  );
}
