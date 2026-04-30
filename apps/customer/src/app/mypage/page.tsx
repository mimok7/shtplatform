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

export default function MyPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // 안전 타임아웃: 10초 이상 로딩 중이면 강제 해제
  useLoadingTimeout(loading, setLoading, 10000);

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
          .select('name')
          .eq('id', user.id)
          .maybeSingle();

        if (!mounted) return;

        setUser(user);
        setUserProfile(profile);

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
  }, []); // ✅ [] 의존성 - 최초 1회만 (router 의존성 금지)

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

  const quickActions = useMemo(() => [
    { icon: '📝', label: '견적 작성', href: '/mypage/quotes' },
    { icon: '🎯', label: '예약하기', href: '/mypage/direct-booking' },
    { icon: '📋', label: '예약내역', href: '/mypage/reservations/list' },
    { icon: '🤝', label: '제휴업체', href: 'partner' },
    { icon: '📍', label: '장소 추가', href: '/mypage/location-updates' },
    { icon: '📄', label: '예약확인서', href: '/mypage/confirmations' },
    { icon: '👤', label: '내 정보', href: '/mypage/profile' },
  ], []);

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
    <PageWrapper title={`🌟 ${getUserDisplayName()}님 즐거운 하루 되세요 ^^`}>
      <div className="mb-6 flex justify-end items-center gap-3">
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors text-sm font-medium shadow-sm"
        >
          🚪 로그아웃
        </button>
      </div>

      {/* 알림 기능 숨김 */}

      <SectionBox title="원하는 서비스를 선택하세요">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {quickActions.map((action, index) => {
            if (action.href === 'partner') {
              return (
                <button key={index} type="button" onClick={handleGoPartner} className="group text-left">
                  <div className="bg-white border border-gray-200 rounded-lg p-6 text-center hover:border-blue-500 hover:shadow-md transition-all duration-200">
                    <div className="text-4xl mb-3 transform group-hover:scale-110 transition-transform duration-200">
                      {action.icon}
                    </div>
                    <div className="text-sm font-medium text-gray-900 group-hover:text-blue-600 transition-colors">
                      {action.label}
                    </div>
                  </div>
                </button>
              );
            }

            return (
              <Link key={index} href={action.href} className="group">
                <div className="bg-white border border-gray-200 rounded-lg p-6 text-center hover:border-blue-500 hover:shadow-md transition-all duration-200">
                  <div className="text-4xl mb-3 transform group-hover:scale-110 transition-transform duration-200">
                    {action.icon}
                  </div>
                  <div className="text-sm font-medium text-gray-900 group-hover:text-blue-600 transition-colors">
                    {action.label}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </SectionBox>
    </PageWrapper>
  );
}
