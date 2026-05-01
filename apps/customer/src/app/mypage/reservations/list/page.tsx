'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabase';
import PageWrapper from '@/components/PageWrapper';
import { useReservations, useReservationAdditionalData } from '../../../../hooks/useQueries';
import { useQueryClient } from '@tanstack/react-query';
import { getAuthUserSafe } from '@/lib/authSafe';
import { Home } from 'lucide-react';

interface Reservation {
  re_id: string;
  re_type: string;
  re_status: string;
  re_created_at: string;
  re_quote_id: string | null;
}

export default function MyReservationsListPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState<string | undefined>(undefined);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const isAuthTimeoutError = (error: unknown) => {
    const message = (error as { message?: string } | null)?.message || '';
    return /AUTH_TIMEOUT_|timed out|timeout/i.test(message);
  };

  // 사용자 정보 로드
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        setAuthError(null);
        const { user, timedOut } = await getAuthUserSafe({ timeoutMs: 8000, retries: 1 });
        if (cancelled) return;

        if (timedOut) {
          setAuthError('세션 확인이 지연되었습니다. 잠시 후 다시 시도해 주세요.');
          return;
        }

        if (!user) {
          router.replace('/login');
          return;
        }

        setUserId(user.id);
      } catch (error) {
        if (cancelled) return;
        console.error('예약 목록 인증 확인 실패:', error);
        setUserId(undefined);
        if (isAuthTimeoutError(error)) {
          setAuthError('세션 확인이 지연되었습니다. 네트워크 상태를 확인 후 다시 시도해 주세요.');
          return;
        }
        router.replace('/login');
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    };

    init();
    return () => { cancelled = true; };
  }, []); // ✅ [] 의존성 - 최초 1회만

  // React Query 훅 사용
  const { data: reservationsData = [], isLoading: isReservationsLoading } = useReservations(userId);
  const reservations = reservationsData as Reservation[];

  const { data: additionalData, isLoading: isAdditionalLoading } = useReservationAdditionalData(reservations);

  // 추가 데이터 구조 분해
  const {
    quotesById = {},
    cruiseMeta = {},
    amountsByReservation = {},
    paymentStatusByReservation = {}
  } = additionalData || {};

  const loading = authLoading || (!!userId && (isReservationsLoading || isAdditionalLoading));

  // UI 상태



  const statusText = (s: string) => (
    s === 'pending' ? '대기중' :
      s === 'confirmed' ? '확정됨' :
        s === 'processing' ? '처리중' :
          s === 'cancelled' ? '취소됨' :
            s === 'completed' ? '확정됨' : s
  );

  const statusBadgeClass = (s: string) => (
    s === 'pending' ? 'bg-yellow-50 text-yellow-700' :
      s === 'confirmed' ? 'bg-green-50 text-green-700' :
        s === 'processing' ? 'bg-blue-50 text-blue-700' :
          s === 'cancelled' ? 'bg-red-50 text-red-700 line-through' :
            s === 'completed' ? 'bg-purple-50 text-purple-700' : 'bg-gray-50 text-gray-600'
  );

  const typeIcon = (t: string) => (
    t === 'cruise' ? '🚢' :
      t === 'airport' ? '✈️' :
        t === 'hotel' ? '🏨' :
          t === 'tour' ? '🎫' :
            t === 'ticket' ? '🎟️' :
            t === 'rentcar' ? '🚗' :
              t === 'car' ? '🚙' :
                t === 'cruise_car' ? '🚙' :
                  t === 'sht_car' || t === 'sht' ? '🚙' : '📋'
  );

  const typeName = (t: string) => (
    t === 'cruise' ? '크루즈' :
      t === 'airport' ? '공항' :
        t === 'hotel' ? '호텔' :
          t === 'tour' ? '투어' :
            t === 'ticket' ? '티켓' :
            t === 'rentcar' ? '렌터카' :
              t === 'car' ? '크루즈 차량' :
                t === 'cruise_car' ? '크루즈 차량' :
                  t === 'sht_car' || t === 'sht' ? '스하차량' : t
  );

  const typeCardBg = (t: string) => (
    t === 'cruise' ? 'from-blue-100/40 to-cyan-100/40 border-blue-100' :
      t === 'airport' ? 'from-orange-100/40 to-amber-100/40 border-orange-100' :
        t === 'hotel' ? 'from-purple-100/40 to-pink-100/40 border-purple-100' :
          t === 'tour' ? 'from-green-100/40 to-emerald-100/40 border-green-100' :
            t === 'ticket' ? 'from-teal-100/40 to-cyan-100/40 border-teal-100' :
            t === 'rentcar' ? 'from-red-100/40 to-rose-100/40 border-red-100' :
              t === 'car' || t === 'cruise_car' ? 'from-yellow-100/40 to-orange-100/40 border-yellow-100' :
                t === 'sht_car' || t === 'sht' ? 'from-indigo-100/40 to-blue-100/40 border-indigo-100' : 'from-gray-100/40 to-slate-100/40 border-gray-100'
  );

  const typeAccentColor = (t: string) => (
    t === 'cruise' ? 'text-blue-700' :
      t === 'airport' ? 'text-orange-700' :
        t === 'hotel' ? 'text-purple-700' :
          t === 'tour' ? 'text-green-700' :
            t === 'ticket' ? 'text-teal-700' :
            t === 'rentcar' ? 'text-red-700' :
              t === 'car' || t === 'cruise_car' ? 'text-yellow-700' :
                t === 'sht_car' || t === 'sht' ? 'text-indigo-700' : 'text-gray-700'
  );

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? iso : d.toLocaleDateString('ko-KR');
  };

  const cruiseTitle = (r: Reservation) => {
    const meta = cruiseMeta[r.re_id];
    if (!meta) return formatDate(r.re_created_at);
    const date = meta.checkin ? formatDate(meta.checkin) : '날짜 미정';
    // 성인/아동/유아 상세 표시
    const parts: string[] = [];
    if (meta.adult_count > 0) parts.push(`성인${meta.adult_count}`);
    if (meta.child_count > 0) parts.push(`아동${meta.child_count}`);
    if (meta.infant_count > 0) parts.push(`유아${meta.infant_count}`);
    const paxLabel = parts.length > 0 ? parts.join(' ') : `${meta.guest_count || 0}명`;
    return `${date} · ${paxLabel}`;
  };





  if (loading) {
    return (
      <PageWrapper>
        <div className="flex flex-col items-center justify-center h-72">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400" />
          <p className="mt-4 text-sm text-gray-600">예약 정보를 로딩 중...</p>
        </div>
      </PageWrapper>
    );
  }

  if (authError) {
    return (
      <PageWrapper>
        <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-sm border border-gray-100 p-6 text-center">
          <div className="text-5xl mb-3">⏱️</div>
          <h2 className="text-lg font-semibold text-gray-800">인증 확인이 지연되고 있습니다</h2>
          <p className="mt-2 text-sm text-gray-600">{authError}</p>
          <div className="mt-5 flex justify-center gap-2">
            <button
              onClick={() => router.refresh()}
              className="px-4 py-2 rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-colors"
            >
              다시 시도
            </button>
            <button
              onClick={() => router.push('/mypage')}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm font-medium"
            >
              <Home className="w-4 h-4" />
              홈
            </button>
          </div>
        </div>
      </PageWrapper>
    );
  }

  // 그룹화 (견적 기준)
  const groups = reservations.reduce((acc, r) => {
    const key = r.re_quote_id || 'no-quote';
    (acc[key] ||= []).push(r);
    return acc;
  }, {} as Record<string, Reservation[]>);
  const groupEntries = Object.entries(groups).sort(([, a], [, b]) => {
    const ta = Math.max(...a.map(x => new Date(x.re_created_at).getTime()));
    const tb = Math.max(...b.map(x => new Date(x.re_created_at).getTime()));
    return tb - ta;
  });

  return (
    <PageWrapper>
      <div className="max-w-5xl mx-auto">
        {/* 헤더 */}
        <div className="rounded-xl bg-gradient-to-r from-blue-200/60 via-blue-100/60 to-cyan-100/60 px-6 py-5 mb-6 flex flex-col gap-3 border border-blue-100/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-2xl">📋</span>
              <h1 className="text-lg font-bold text-blue-900">예약 정보</h1>
            </div>
            <button
              onClick={() => router.push('/mypage')}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm font-medium"
            >
              <Home className="w-4 h-4" />
              홈
            </button>
          </div>
        </div>

        {/* 내용 */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          {reservations.length === 0 && (
            <div className="py-24 flex flex-col items-center justify-center">
              <div className="text-6xl mb-4">📭</div>
              <p className="text-gray-600 text-lg font-medium mb-2">등록된 예약이 없습니다</p>
              <p className="text-gray-500 text-sm">새로운 예약을 만들어 시작하세요</p>
            </div>
          )}
          {groupEntries.map(([qid, list]) => {
            const title = qid === 'no-quote' ? '견적 연결 없음' : (quotesById[qid]?.title || '제목 없음');
            return (
              <div key={qid} className="mb-8">
                {/* 그룹 헤더(견적 제목/견적 보기/서비스 배지) 제거됨 */}
                <div className="space-y-2">
                  {list.filter(r => r.re_type !== 'cruise_car' && r.re_type !== 'car').sort((a, b) => {
                    const typeOrder: Record<string, number> = {
                      cruise: 1,
                      airport: 2,
                      tour: 3,
                      rentcar: 4,
                      hotel: 5,
                      package: 6,
                      package_tour: 6,
                      ticket: 7,
                      cruise_car: 8,
                      car: 8,
                      sht_car: 8,
                      sht: 8
                    };
                    const orderA = typeOrder[a.re_type] || 99;
                    const orderB = typeOrder[b.re_type] || 99;
                    if (orderA !== orderB) return orderA - orderB;
                    return new Date(b.re_created_at).getTime() - new Date(a.re_created_at).getTime();
                  }).map(r => {
                    const amount = amountsByReservation[r.re_id] || 0;
                    const pay = paymentStatusByReservation[r.re_id];
                    const completed = pay?.hasCompleted;
                    const dateLabel = r.re_type === 'cruise' ? cruiseTitle(r) : formatDate(r.re_created_at);
                    return (
                      <div
                        key={r.re_id}
                        className={`group border-2 rounded-xl p-4 bg-gradient-to-br ${typeCardBg(r.re_type)} flex items-center justify-between hover:shadow-md transition-all duration-200 cursor-pointer`}
                        onClick={() => router.push(`/mypage/reservations/${r.re_id}/view`)}
                      >
                        <div className="flex items-center gap-4 flex-1">
                          <div className="text-3xl">{typeIcon(r.re_type)}</div>
                          <div className="flex flex-col gap-1 flex-1">
                            <div className="flex items-center gap-3">
                              <span className={`text-sm font-bold ${typeAccentColor(r.re_type)}`}>{typeName(r.re_type)}</span>
                              <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${statusBadgeClass(r.re_status)}`}>{statusText(r.re_status)}</span>
                            </div>
                            <div className="text-xs text-gray-600 font-medium">
                              {dateLabel}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); router.push(`/mypage/reservations/${r.re_id}/view`); }}
                            className="px-4 py-2 rounded-lg bg-gray-300 hover:bg-gray-400 text-gray-700 text-xs font-semibold hover:shadow-md transition-all duration-200"
                          >상세 보기</button>
                          {/* 확인서 버튼 삭제됨 */}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </PageWrapper>
  );
}
