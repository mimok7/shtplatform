'use client';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import PageWrapper from '../../components/PageWrapper';
import SectionBox from '../../components/SectionBox';
import Link from 'next/link';
import supabase from '@/lib/supabase';
import { clearCachedUser } from '@/lib/authCache';
import { clearAuthCache } from '@/hooks/useAuth';
import { clearInvalidSession, isInvalidRefreshTokenError } from '@/lib/authRecovery';
import { useLoadingTimeout } from '@/hooks/useLoadingTimeout';
import { getSessionUser } from '@/lib/authHelpers';
import { buildProfileCompletionPath, hasRequiredProfileFields } from '@/lib/profileRequirements';
import { BadgeCheck, Briefcase, CircleDollarSign, FileText, LogOut, Mail, Phone, User } from 'lucide-react';

function stripPaymentMethodLines(value: string | null | undefined): string {
  if (!value) return '';

  return String(value)
    .split(/\r?\n/)
    .filter((line) => {
      const normalized = line.replace(/\s+/g, '').toLowerCase();
      return !normalized.startsWith('결제방법:') && !normalized.startsWith('결제방식:');
    })
    .join('\n')
    .trim();
}

function getNotificationLineIcon(line: string) {
  const label = line.split(':')[0]?.trim();

  if (label.includes('고객명')) return User;
  if (label.includes('이메일')) return Mail;
  if (label.includes('연락처')) return Phone;
  if (label.includes('서비스')) return Briefcase;
  if (label.includes('견적명')) return FileText;
  if (label.includes('예약 금액')) return CircleDollarSign;
  if (label.includes('예약 상태')) return BadgeCheck;
  return null;
}

function renderNotificationDescription(description: string, className: string) {
  const lines = description
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return (
    <div className={className}>
      {lines.map((line, index) => {
        const Icon = getNotificationLineIcon(line);
        return (
          <div key={`${line}-${index}`} className="flex items-start gap-1.5">
            {Icon ? <Icon className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-slate-400" /> : null}
            <span className="break-words">{line}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function MyPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  // 안전 타임아웃: 10초 이상 로딩 중이면 강제 해제
  useLoadingTimeout(loading, setLoading, 10000);

  const normalizeNotifications = useCallback((rows: any[]) => (
    (rows || []).map((row: any) => {
      const isRead = typeof row?.is_read === 'boolean'
        ? row.is_read
        : ['read', 'completed'].includes(String(row?.status || '').toLowerCase());
      return {
        ...row,
        is_read: isRead,
        description: stripPaymentMethodLines(row?.description ?? row?.message ?? ''),
      };
    })
  ), []);

  const getAccessToken = useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    return sessionData.session?.access_token || '';
  }, []);

  useEffect(() => {
    let mounted = true;

    const loadUserInfo = async () => {
      try {
        setLoading(true);

        const { user, error: userError } = await getSessionUser(8000);

        if (!mounted) return;

        if (userError || !user) {
          if (userError && isInvalidRefreshTokenError(userError)) {
            await clearInvalidSession();
          }
          router.push('/login');
          return;
        }

        // 사용자 프로필 정보 조회 (최소 필드만)
        const { data: profile } = await supabase
          .from('users')
          .select('email, name, english_name, phone_number')
          .eq('id', user.id)
          .maybeSingle();

        if (!mounted) return;

        setUser(user);
        setUserProfile(profile);

        // 알림 조회
        const token = await getAccessToken();
        const response = await fetch('/api/notifications', {
          cache: 'no-store',
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(result?.error || '알림 조회 실패');
        }

        if (!mounted) return;

        const rows = Array.isArray(result?.rows) ? result.rows : [];
        const normalized = normalizeNotifications(rows);
        setNotifications(normalized);
        const unread = normalized.filter((n: any) => !n.is_read).length;
        setUnreadCount(unread);

      } catch (error) {
        if (isInvalidRefreshTokenError(error)) {
          await clearInvalidSession();
          if (mounted) router.push('/login');
          return;
        }
        console.error('사용자 정보 로드 실패:', error);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadUserInfo();

    return () => { mounted = false; };
  }, [getAccessToken, normalizeNotifications]); // ✅ [] 의존성 - 최초 1회만 (router 의존성 금지)

  const getUserDisplayName = useCallback(() => {
    if (userProfile?.name) return userProfile.name;
    if (user?.email) {
      return user.email.split('@')[0];
    }
    return '고객';
  }, [userProfile, user]);

  const handleLogout = useCallback(async () => {
    try {
      clearCachedUser();
      clearAuthCache();
      // Supabase SDK signOut 호출 시 세션 상태에 따라 403 로그가 남을 수 있어,
      // 마이페이지 로그아웃은 로컬 세션/캐시 정리만 수행한다.
      try {
        for (const key of Object.keys(localStorage)) {
          if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
            localStorage.removeItem(key);
          }
        }
      } catch (error) {
        console.error('localStorage 세션 정리 실패:', error);
      }

      try {
        for (const key of Object.keys(sessionStorage)) {
          if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
            sessionStorage.removeItem(key);
          }
        }
      } catch (error) {
        console.error('sessionStorage 세션 정리 실패:', error);
      }

      alert('로그아웃되었습니다.');
      router.push('/login');
    } catch (error) {
      console.error('로그아웃 처리 실패:', error);
      alert('로그아웃되었습니다.');
      router.push('/login');
    }
  }, [router]);

  const handleProtectedNavigation = useCallback((targetHref: string) => {
    const profileToValidate = {
      email: userProfile?.email || user?.email || '',
      name: userProfile?.name || '',
      english_name: userProfile?.english_name || '',
      phone_number: userProfile?.phone_number || '',
    };

    if (!hasRequiredProfileFields(profileToValidate)) {
      alert('예약 진행 전 내 정보의 필수 항목을 먼저 입력해주세요.');
      router.push(buildProfileCompletionPath(targetHref));
      return;
    }

    router.push(targetHref);
  }, [router, userProfile, user]);

  const quickActions = useMemo(() => [
    { icon: '🎯', label: '예약 하기', desc: '새로운 예약 신청', href: '/mypage/direct-booking', bg: 'bg-blue-100', color: 'text-blue-600' },
    { icon: '📋', label: '예약 내역', desc: '예약 조회 및 관리', href: '/mypage/reservations/list', bg: 'bg-green-100', color: 'text-green-600' },
    { icon: '🤝', label: '제휴 업체', desc: '파트너사 예약', href: 'partner', bg: 'bg-orange-100', color: 'text-orange-600' },
    { icon: '📍', label: '장소 추가', desc: '여행 위치 정보', href: '/mypage/location-updates', bg: 'bg-purple-100', color: 'text-purple-600' },
    { icon: '🔔', label: '알림', desc: unreadCount > 0 ? `새 알림 ${unreadCount}개` : '알림 확인', href: '/mypage/notifications', bg: 'bg-red-100', color: 'text-red-600' },
    { icon: '📄', label: '예약 확인서', desc: '확인서 조회', href: '/mypage/confirmations', bg: 'bg-violet-100', color: 'text-violet-600' },
    { icon: '👤', label: '내 정보', desc: '프로필 관리', href: '/mypage/profile', bg: 'bg-slate-100', color: 'text-slate-600' },
  ], [unreadCount]);

  // 제휴업체(파트너) 도메인으로 SSO 이동: 현재 세션 토큰을 hash로 전달
  const handleGoPartner = useCallback(async () => {
    const partnerBase = (process.env.NEXT_PUBLIC_PARTNER_URL || 'https://partner.stayhalong.com').replace(/\/$/, '');
    const next = '/partner/browse';
    try {
      const { data } = await supabase.auth.getSession();
      const at = data?.session?.access_token;
      const rt = data?.session?.refresh_token;
      if (at && rt) {
        const url = `${partnerBase}/auth/bridge#at=${encodeURIComponent(at)}&rt=${encodeURIComponent(rt)}&next=${encodeURIComponent(next)}`;
        window.location.href = url;
        return;
      }
    } catch (err) {
      console.error('파트너 이동을 위한 세션 조회 실패:', err);
    }
    // 세션 없으면 그냥 파트너 사이트로 이동(로그인 페이지로 자연스럽게 리다이렉트됨)
    window.location.href = `${partnerBase}${next}`;
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <PageWrapper
      title={`${getUserDisplayName()}님 환영합니다`}
      rightIcon={<LogOut className="w-5 h-5 text-gray-600" />}
      rightLabel="로그아웃"
      onRightClick={handleLogout}
    >
      <div className="space-y-4">
        {/* 인사말 */}
        <div className="text-sm text-slate-600 flex items-center gap-2">
          <span>오늘도 행복한 하루 보내세요</span>
          <span>😊</span>
        </div>

        {/* 서비스 메뉴 - 2열 격자 */}
        <div className="grid grid-cols-2 gap-2.5">
          {quickActions.map((action, index) => {
            if (action.href === 'partner') {
              return (
                <button
                  key={index}
                  type="button"
                  onClick={handleGoPartner}
                  className="w-full text-left p-0 border-0 bg-transparent cursor-pointer"
                >
                  <div className="bg-white border border-slate-300 rounded-lg p-2 hover:shadow-md transition shadow-sm flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 flex items-center justify-center rounded-lg ${action.bg} flex-shrink-0`}>
                        <span className="text-base">{action.icon}</span>
                      </div>
                      <h3 className="text-sm font-semibold text-slate-900">{action.label}</h3>
                    </div>
                    <p className="text-xs text-slate-500 ml-10">{action.desc}</p>
                  </div>
                </button>
              );
            }

            if (action.href === '/mypage/direct-booking') {
              return (
                <button
                  key={index}
                  type="button"
                  onClick={() => handleProtectedNavigation(action.href)}
                  className="text-left block w-full"
                >
                  <div className="bg-white border border-slate-300 rounded-lg p-2 hover:shadow-md transition shadow-sm flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 flex items-center justify-center rounded-lg ${action.bg} flex-shrink-0`}>
                        <span className="text-base">{action.icon}</span>
                      </div>
                      <h3 className="text-sm font-semibold text-slate-900">{action.label}</h3>
                    </div>
                    <p className="text-xs text-slate-500 ml-10">{action.desc}</p>
                  </div>
                </button>
              );
            }

            return (
              <Link key={index} href={action.href} className="text-left block w-full">
                <div className="bg-white border border-slate-300 rounded-lg p-2 hover:shadow-md transition shadow-sm flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 flex items-center justify-center rounded-lg ${action.bg} flex-shrink-0`}>
                      <span className="text-base">{action.icon}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <h3 className="text-sm font-semibold text-slate-900">{action.label}</h3>
                      {action.href === '/mypage/notifications' && unreadCount > 0 && (
                        <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                          {unreadCount > 99 ? '99+' : unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 ml-10">{action.desc}</p>
                </div>
              </Link>
            );
          })}
        </div>

        {/* 알림 섹션 */}
        {notifications.length > 0 && (
          <div id="notifications-section" className="mt-6">
            <h2 className="text-sm font-semibold text-slate-900 mb-2.5">나에게 온 알림 (최근 1개)</h2>
            <div className="space-y-2">
              {notifications.slice(0, 1).map((notification: any) => (
                <div
                  key={notification.id}
                  className={`border rounded-lg p-3 text-sm ${
                    !notification.is_read
                      ? 'bg-blue-50 border-blue-200'
                      : 'bg-white border-slate-200'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {!notification.is_read && (
                      <div className="w-2 h-2 rounded-full bg-blue-600 mt-1.5 flex-shrink-0"></div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className={`${!notification.is_read ? 'font-medium text-slate-900' : 'text-slate-700'} break-words`}>
                        {notification.title}
                      </p>
                      {notification.description && (
                        renderNotificationDescription(notification.description, 'mt-1 space-y-1 text-xs text-slate-500')
                      )}
                      <p className="text-xs text-slate-400 mt-1">
                        {new Date(notification.created_at).toLocaleDateString('ko-KR', {
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <Link href="/mypage/notifications" className="mt-3 inline-block">
              <button className="text-xs font-medium text-blue-600 hover:text-blue-700 transition">
                모든 알림 보기 →
              </button>
            </Link>
          </div>
        )}
      </div>
    </PageWrapper>
  );
}
