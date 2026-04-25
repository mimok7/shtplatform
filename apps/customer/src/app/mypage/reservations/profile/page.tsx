'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import supabase from '@/lib/supabase';
import { getSessionUser } from '@/lib/authHelpers';
import { upsertUserProfile } from '@/lib/userUtils';
import { clearInvalidSession, isInvalidRefreshTokenError } from '@/lib/authRecovery';
import PageWrapper from '@/components/PageWrapper';
import SectionBox from '@/components/SectionBox';

function ReservationProfileContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const quoteId = searchParams.get('quoteId');

  const [loading, setLoading] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [quote, setQuote] = useState<any>(null);
  const [userFormData, setUserFormData] = useState({
    name: '',
    english_name: '',
    phone_number: ''
  });

  useEffect(() => {
    checkAuthAndLoadUser();
    if (quoteId) {
      loadQuoteInfo();
    }
  }, [quoteId]);

  const isAuthTimeoutError = (error: unknown) => {
    const message = (error as { message?: string } | null)?.message || '';
    return /AUTH_TIMEOUT_|timed out|timeout/i.test(message);
  };

  const checkAuthAndLoadUser = async () => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      const { user: authUser, error: userError } = await getSessionUser(8000);
      if (userError || !authUser) {
        if (userError && isInvalidRefreshTokenError(userError)) {
          await clearInvalidSession();
          router.replace('/login');
          return;
        }
        if (userError && isAuthTimeoutError(userError)) {
          setAuthError('세션 확인이 지연되었습니다. 잠시 후 다시 시도해 주세요.');
          return;
        }
        alert('로그인이 필요합니다.');
        router.replace('/login');
        return;
      }
      setUser(authUser);

      // 기존 사용자 정보 로드
      const { data: existingUser } = await supabase
        .from('users')
        .select('*')
        .eq('id', authUser.id)
        .maybeSingle();

      if (existingUser) {
        setUserFormData({
          name: existingUser.name || '',
          english_name: existingUser.english_name || '',
          phone_number: existingUser.phone_number || ''
        });
      }
    } catch (error) {
      if (isInvalidRefreshTokenError(error)) {
        await clearInvalidSession();
        router.replace('/login');
        return;
      }
      if (isAuthTimeoutError(error)) {
        setAuthError('세션 확인이 지연되었습니다. 네트워크 상태를 확인 후 다시 시도해 주세요.');
        return;
      }
      console.error('사용자 정보 로드 오류:', error);
    } finally {
      setAuthLoading(false);
    }
  };

  const loadQuoteInfo = async () => {
    if (!quoteId) return;

    try {
      const { data: quoteData, error } = await supabase
        .from('quote')
        .select('id, title, cruise_name, checkin, cruise_code')
        .eq('id', quoteId)
        .single();

      if (error) {
        console.error('견적 정보 로드 실패:', error);
        return;
      }

      setQuote(quoteData);
    } catch (error) {
      console.error('견적 정보 로드 오류:', error);
    }
  };

  const getQuoteTitle = (quote: any) => {
    if (!quote) return '';

    // title 필드가 있으면 우선 사용
    if (quote.title && quote.title.trim()) {
      return quote.title;
    }

    // title이 없으면 기본 형식으로 생성
    const date = quote.checkin ? new Date(quote.checkin).toLocaleDateString() : '날짜 미정';
    const cruiseCode = quote.cruise_code || quote.cruise_name || '크루즈 미정';
    return `${date} | ${cruiseCode}`;
  };

  // 사용자 정보 저장 및 예약 홈으로 이동
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!userFormData.name.trim()) {
      alert('이름을 입력해주세요.');
      return;
    }

    if (!userFormData.english_name.trim()) {
      alert('영문 이름을 입력해주세요.');
      return;
    }

    setLoading(true);
    try {
      if (!user) return;

      // 향상된 사용자 프로필 업데이트
      const result = await upsertUserProfile(user.id, user.email || '', {
        name: userFormData.name.trim(),
        english_name: userFormData.english_name.trim().toUpperCase(),
        phone_number: userFormData.phone_number.trim(),
        role: 'member'  // 예약시 member로 승격
      });

      if (!result.success) {
        console.error('❌ 사용자 정보 저장 실패:', result.error);
        alert('사용자 정보 저장에 실패했습니다.');
        return;
      }

      console.log('✅ 사용자 정보 저장 성공, 예약 홈으로 이동');

      // 견적 ID와 함께 예약 홈으로 이동
      const redirectUrl = quoteId
        ? `/mypage/reservations?quoteId=${quoteId}`
        : '/mypage/reservations';
      router.push(redirectUrl);

    } catch (error) {
      console.error('❌ 사용자 정보 저장 오류:', error);
      alert('사용자 정보 저장 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 이름 입력 시 영문 이름 자동 생성
  const handleNameChange = (name: string) => {
    setUserFormData(prev => {
      const englishName = convertToEnglish(name);
      return {
        ...prev,
        name,
        english_name: englishName
      };
    });
  };

  // 한글 이름을 영문으로 변환
  const convertToEnglish = (koreanName: string): string => {
    const names = koreanName.trim().split(' ');
    if (names.length >= 2) {
      return `${names[0]} ${names.slice(1).join(' ')}`.toUpperCase();
    }
    return koreanName.toUpperCase();
  };

  return (
    <PageWrapper>
      <SectionBox title="예약자 정보 입력">
        <div className="max-w-md mx-auto">
          {authLoading && (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500 mx-auto" />
              <p className="mt-3 text-sm text-gray-600">사용자 인증 확인 중...</p>
            </div>
          )}

          {!authLoading && authError && (
            <div className="mb-6 p-4 border border-amber-200 bg-amber-50 rounded-lg">
              <p className="text-sm text-amber-800">{authError}</p>
              <button
                type="button"
                onClick={checkAuthAndLoadUser}
                className="mt-3 px-3 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700"
              >
                다시 시도
              </button>
            </div>
          )}

          {!authLoading && !authError && (
            <>
              {quoteId && (
                <div className="mb-6 p-4 bg-blue-50 rounded-lg">
                  <h3 className="font-semibold text-blue-800">견적 정보</h3>
                  <p className="text-sm text-blue-600">
                    견적: {quote ? getQuoteTitle(quote) : '로딩 중...'}
                  </p>
                  <p className="text-sm text-blue-600">해당 견적으로 예약을 진행합니다.</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    이름 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={userFormData.name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="홍길동"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    영문 이름 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={userFormData.english_name}
                    onChange={(e) => setUserFormData(prev => ({ ...prev, english_name: e.target.value.toUpperCase() }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="HONG GILDONG"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    이름 입력 시 자동으로 영문명이 생성됩니다. 필요시 수정해주세요.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    연락처
                  </label>
                  <input
                    type="tel"
                    value={userFormData.phone_number}
                    onChange={(e) => setUserFormData(prev => ({ ...prev, phone_number: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="010-1234-5678"
                  />
                </div>

                <div className="flex space-x-3 pt-6">
                  <button
                    type="button"
                    onClick={() => router.back()}
                    className="flex-1 px-4 py-3 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
                    disabled={loading}
                  >
                    취소
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-4 py-3 text-white bg-blue-500 rounded-md hover:bg-blue-600 disabled:opacity-50"
                    disabled={loading}
                  >
                    {loading ? '저장 중...' : '저장하고 예약하기'}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </SectionBox>
    </PageWrapper>
  );
}


export default function ReservationProfilePage() {
  return (
    <Suspense fallback={<div className="flex justify-center items-center h-64">로딩 중...</div>}>
      <ReservationProfileContent />
    </Suspense>
  );
}
