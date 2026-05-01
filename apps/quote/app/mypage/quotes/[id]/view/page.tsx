'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import supabase from '@/lib/supabase';
import { upgradeGuestToMember } from '@/lib/userRoleUtils';

interface QuoteDetail {
  id: string;
  status: string;
  payment_status?: string;
  total_price: number;
  created_at: string;
  updated_at: string;
  user_id: string;
  title?: string;
  cruise_name?: string;
  manager_note?: string;
  users?: {
    name: string;
    email: string;
    phone_number?: string;
  };
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  draft: { label: '작성 중', cls: 'bg-gray-100 text-gray-700' },
  submitted: { label: '제출됨', cls: 'bg-yellow-100 text-yellow-700' },
  pending: { label: '검토 대기', cls: 'bg-yellow-100 text-yellow-700' },
  approved: { label: '승인됨', cls: 'bg-blue-100 text-blue-700' },
  confirmed: { label: '확정됨', cls: 'bg-blue-100 text-blue-700' },
  rejected: { label: '거절됨', cls: 'bg-red-100 text-red-700' },
  completed: { label: '완료됨', cls: 'bg-green-100 text-green-700' },
};

const pick = (...values: any[]): string => {
  for (const v of values) {
    if (v === 0) return '0';
    if (v === null || v === undefined) continue;
    if (typeof v === 'string' && v.trim() === '') continue;
    return String(v);
  }
  return '-';
};

const fmt = (n: number | null | undefined) =>
  (Number(n) || 0).toLocaleString('ko-KR');

export default function QuoteDetailPage() {
  const router = useRouter();
  const params = useParams();
  const quoteId = (
    Array.isArray((params as any)?.id) ? (params as any).id[0] : (params as any)?.id
  ) as string;

  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [quote, setQuote] = useState<QuoteDetail | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [detailedServices, setDetailedServices] = useState<any>({
    rooms: [], cars: [], airports: [], hotels: [], rentcars: [], tours: []
  });

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      try {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (cancelled) return;
        if (error || !user) {
          alert('로그인이 필요합니다.');
          router.push('/login');
          return;
        }
        setUser(user);
      } catch (e) {
        console.error('인증 오류:', e);
        if (!cancelled) router.push('/login');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    init();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (user && quoteId) {
      loadQuoteDetail();
      loadDetailedServices();
    }
  }, [user, quoteId]);

  const loadQuoteDetail = async () => {
    try {
      const { data: quoteData, error } = await supabase
        .from('quote')
        .select('*, payment_status')
        .eq('id', quoteId)
        .single();
      if (error || !quoteData) {
        alert('견적을 찾을 수 없습니다.');
        router.push('/mypage/quotes');
        return;
      }
      const { data: userData } = await supabase
        .from('users')
        .select('id, name, email, phone_number')
        .eq('id', quoteData.user_id)
        .maybeSingle();
      setQuote({ ...quoteData, users: userData || undefined });
    } catch (e) {
      console.error('견적 로드 오류:', e);
      alert('견적 정보를 불러오는데 실패했습니다.');
    }
  };

  const loadDetailedServices = async () => {
    try {
      const { data: quoteItems, error } = await supabase
        .from('quote_item')
        .select('*')
        .eq('quote_id', quoteId);
      if (error) throw error;

      const detailed: any = {
        rooms: [], cars: [], airports: [], hotels: [], rentcars: [], tours: []
      };

      for (const item of quoteItems || []) {
        try {
          if (item.service_type === 'room') {
            const { data: roomData } = await supabase.from('room').select('*').eq('id', item.service_ref_id).maybeSingle();
            if (!roomData) continue;
            const code = item.options?.room_price_code || roomData.room_price_code || roomData.room_code;
            const { data: priceData } = code
              ? await supabase.from('cruise_rate_card').select('*').eq('id', code).maybeSingle()
              : { data: null as any };
            detailed.rooms.push({
              ...item, roomInfo: roomData, price: priceData,
              displayQuantity: roomData.person_count || 1,
            });
          } else if (item.service_type === 'car') {
            const { data: carData } = await supabase.from('car').select('*').eq('id', item.service_ref_id).maybeSingle();
            if (!carData) continue;
            const code = item.options?.car_price_code || carData.car_price_code || carData.car_code;
            const { data: priceList } = await supabase.from('rentcar_price').select('*').eq('rent_code', code);
            detailed.cars.push({
              ...item, carInfo: carData, price: priceList?.[0],
              displayQuantity: carData.car_count || 1,
            });
          } else if (item.service_type === 'airport') {
            const { data: airportData } = await supabase.from('airport').select('*').eq('id', item.service_ref_id).maybeSingle();
            if (!airportData) continue;
            const code = item.options?.airport_price_code || airportData.airport_price_code || airportData.airport_code;
            const { data: priceList } = await supabase.from('airport_price').select('*').eq('airport_code', code);
            detailed.airports.push({
              ...item, airportInfo: airportData, price: priceList?.[0],
              displayQuantity: item.quantity || 1,
            });
          } else if (item.service_type === 'hotel') {
            const { data: hotelData } = await supabase.from('hotel').select('*').eq('id', item.service_ref_id).maybeSingle();
            if (!hotelData) continue;
            const hpc = item.options?.hotel_price_code || hotelData.hotel_price_code;
            const hc = hotelData.hotel_code || item.options?.hotel_code;
            const { data: pri } = hpc ? await supabase.from('hotel_price').select('*').eq('hotel_price_code', hpc) : { data: [] as any[] };
            const priceList = (pri && pri.length > 0)
              ? pri
              : (hc ? (await supabase.from('hotel_price').select('*').eq('hotel_code', hc)).data || [] : []);
            detailed.hotels.push({
              ...item, hotelInfo: hotelData, price: priceList?.[0],
              displayQuantity: hotelData.room_count || 1,
            });
          } else if (item.service_type === 'rentcar') {
            const { data: rentData } = await supabase.from('rentcar').select('*').eq('id', item.service_ref_id).maybeSingle();
            if (!rentData) continue;
            const code = item.options?.rentcar_price_code || rentData.rentcar_price_code || rentData.rentcar_code;
            const { data: priceList } = await supabase.from('rentcar_price').select('*').eq('rent_code', code);
            detailed.rentcars.push({
              ...item, rentcarInfo: rentData, price: priceList?.[0],
              displayQuantity: rentData.vehicle_count || item.quantity || 1,
            });
          } else if (item.service_type === 'tour') {
            let tourData: any = null;
            const { data: byTourId } = await supabase.from('tour').select('*').eq('tour_id', item.service_ref_id).maybeSingle();
            tourData = byTourId;
            if (!tourData) {
              const { data: byId } = await supabase.from('tour').select('*').eq('id', item.service_ref_id).maybeSingle();
              tourData = byId;
            }
            if (!tourData) continue;
            const { data: priceList } = await supabase
              .from('tour_pricing')
              .select('*, tour:tour_id(tour_name, tour_code)')
              .eq('tour_id', tourData.tour_id || tourData.id);
            detailed.tours.push({
              ...item, tourInfo: tourData, price: priceList?.[0],
              displayQuantity: tourData.participant_count || item.quantity || 1,
            });
          }
        } catch (err) {
          console.warn(`${item.service_type} 로드 실패:`, err);
        }
      }
      setDetailedServices(detailed);
    } catch (e) {
      console.error('상세 서비스 로드 실패:', e);
    }
  };

  // 총합계 계산
  const grandTotal = useMemo(() => {
    const sum = (arr: any[]) => arr.reduce((s, x) => s + (Number(x.total_price) || 0), 0);
    return (
      sum(detailedServices.rooms) +
      sum(detailedServices.cars) +
      sum(detailedServices.airports) +
      sum(detailedServices.hotels) +
      sum(detailedServices.rentcars) +
      sum(detailedServices.tours)
    );
  }, [detailedServices]);

  const handleReservation = async () => {
    if (!user || !quote?.id) return;
    try {
      const upgradeResult = await upgradeGuestToMember(user.id, user.email);
      if (!upgradeResult.success && upgradeResult.error) {
        alert('예약 권한 설정 중 오류가 발생했습니다.');
        return;
      }
      router.push(`/mypage/reservations?quoteId=${quote.id}`);
    } catch (e) {
      console.error('예약 처리 오류:', e);
      alert('예약 처리 중 오류가 발생했습니다.');
    }
  };

  const handleSubmitQuote = async () => {
    if (!quote?.id || submitting) return;
    if (!confirm('견적을 제출하시겠습니까?')) return;
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('quote')
        .update({ status: 'submitted', submitted_at: new Date().toISOString() })
        .eq('id', quote.id);
      if (error) {
        alert(`견적 제출 중 오류가 발생했습니다.\n${error.message}`);
        return;
      }
      alert('견적이 성공적으로 제출되었습니다!');
      router.push('/mypage/quotes');
    } catch (e: any) {
      alert(`견적 제출 중 오류: ${e?.message || ''}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !quote) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto" />
          <p className="mt-4 text-gray-600 text-sm">견적 정보를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  const status = STATUS_META[quote.status] || { label: quote.status, cls: 'bg-gray-100 text-gray-700' };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white pb-32 sm:pb-8">
      {/* 상단 헤더 */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="p-2 -ml-2 rounded-full hover:bg-slate-100 transition"
            aria-label="뒤로"
          >
            <span className="text-xl">←</span>
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base sm:text-lg font-bold text-slate-800 truncate">
              {quote.title || quote.cruise_name || '견적 상세'}
            </h1>
            <p className="text-xs text-slate-500">
              {new Date(quote.created_at).toLocaleDateString('ko-KR')}
            </p>
          </div>
          <span className={`shrink-0 inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${status.cls}`}>
            {status.label}
          </span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-4 space-y-4">
        {/* 총합계 카드 */}
        <section className="rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white p-5 shadow-lg">
          <p className="text-xs opacity-80">총 견적 금액</p>
          <p className="text-3xl font-bold mt-1 tracking-tight">
            {fmt(grandTotal || quote.total_price)}<span className="text-lg ml-1">동</span>
          </p>
          <div className="mt-3 flex items-center gap-3 text-xs opacity-90">
            <span>📋 {[
              detailedServices.rooms.length && '객실',
              detailedServices.cars.length && '차량',
              detailedServices.airports.length && '공항',
              detailedServices.hotels.length && '호텔',
              detailedServices.rentcars.length && '렌트카',
              detailedServices.tours.length && '투어',
            ].filter(Boolean).join(' · ') || '항목 없음'}</span>
          </div>
        </section>

        {/* 고객 정보 */}
        <section className="rounded-2xl bg-white border border-slate-200 p-4">
          <h2 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-1.5">
            <span>👤</span> 고객 정보
          </h2>
          <dl className="grid grid-cols-3 gap-y-2 text-sm">
            <dt className="text-slate-500">이름</dt>
            <dd className="col-span-2 text-slate-800">{quote.users?.name || '-'}</dd>
            <dt className="text-slate-500">이메일</dt>
            <dd className="col-span-2 text-slate-800 break-all">{quote.users?.email || '-'}</dd>
            <dt className="text-slate-500">연락처</dt>
            <dd className="col-span-2 text-slate-800">{quote.users?.phone_number || '-'}</dd>
          </dl>
        </section>

        {/* 객실 */}
        {detailedServices.rooms.length > 0 && (
          <ServiceSection icon="🛏" title="객실" accent="amber" count={detailedServices.rooms.length}>
            {detailedServices.rooms.map((it: any, i: number) => (
              <ItemCard
                key={i}
                title={pick(it.price?.cruise, it.price?.cruise_name, it.roomInfo?.cruise_name)}
                subtitle={pick(it.price?.room_type, it.roomInfo?.room_type)}
                rows={[
                  ['일정', pick(it.price?.schedule, it.price?.schedule_type, it.roomInfo?.schedule)],
                  ['카테고리', pick(it.price?.room_category, it.price?.category, it.roomInfo?.room_category)],
                  ['인원', `${pick(it.roomInfo?.person_count)}명`],
                ]}
                unitPrice={it.unit_price}
                quantity={it.displayQuantity}
                total={it.total_price}
                quantityUnit="명"
              />
            ))}
          </ServiceSection>
        )}

        {/* 차량 */}
        {detailedServices.cars.length > 0 && (
          <ServiceSection icon="🚗" title="차량" accent="cyan" count={detailedServices.cars.length}>
            {detailedServices.cars.map((it: any, i: number) => {
              const type = String(it.price?.car_type || '').toLowerCase();
              const isShuttle = type.includes('셔틀') || type.includes('shuttle');
              const shuttleOnly = isShuttle && /^(셔틀|shuttle)(\s*버스)?$/i.test(type.trim());
              const useGuests = isShuttle && !shuttleOnly;
              const qty = useGuests
                ? (it.carInfo?.passenger_count || it.carInfo?.person_count || it.carInfo?.car_count || 1)
                : it.displayQuantity;
              return (
                <ItemCard
                  key={i}
                  title={pick(it.price?.car_type, it.carInfo?.car_type)}
                  subtitle={pick(it.price?.cruise, it.carInfo?.cruise)}
                  rows={[
                    ['일정', pick(it.price?.schedule, it.carInfo?.schedule)],
                    ['카테고리', pick(it.price?.car_category, it.carInfo?.car_category)],
                  ]}
                  unitPrice={it.unit_price}
                  quantity={qty}
                  total={it.total_price}
                  quantityUnit={useGuests ? '인' : '대'}
                />
              );
            })}
          </ServiceSection>
        )}

        {/* 공항 */}
        {detailedServices.airports.length > 0 && (
          <ServiceSection icon="✈️" title="공항 서비스" accent="sky" count={detailedServices.airports.length}>
            {detailedServices.airports.map((it: any, i: number) => (
              <ItemCard
                key={i}
                title={pick(it.price?.airport_route, it.price?.route, it.airportInfo?.airport_route)}
                subtitle={pick(it.price?.airport_car_type, it.price?.vehicle_type, it.airportInfo?.airport_car_type)}
                rows={[
                  ['카테고리', pick(it.price?.airport_category, it.price?.service_type, it.airportInfo?.airport_category)],
                ]}
                unitPrice={it.unit_price}
                quantity={it.displayQuantity}
                total={it.total_price}
                quantityUnit="대"
              />
            ))}
          </ServiceSection>
        )}

        {/* 호텔 */}
        {detailedServices.hotels.length > 0 && (
          <ServiceSection icon="🏨" title="호텔" accent="emerald" count={detailedServices.hotels.length}>
            {detailedServices.hotels.map((it: any, i: number) => {
              const hotelName = pick(
                typeof it.price?.hotel_info === 'object' ? it.price?.hotel_info?.hotel_name : it.price?.hotel_name,
                it.hotelInfo?.hotel_name
              );
              const roomName = pick(
                typeof it.price?.room_type === 'object' ? it.price?.room_type?.room_name : it.price?.room_name,
                it.hotelInfo?.room_name
              );
              const roomType = pick(
                typeof it.price?.room_type === 'object' ? it.price?.room_type?.room_category : it.price?.room_type,
                it.price?.room_category, it.hotelInfo?.room_type
              );
              return (
                <ItemCard
                  key={i}
                  title={hotelName}
                  subtitle={roomName}
                  rows={[['객실 타입', roomType]]}
                  unitPrice={it.unit_price}
                  quantity={it.displayQuantity}
                  total={it.total_price}
                  quantityUnit="개"
                />
              );
            })}
          </ServiceSection>
        )}

        {/* 렌트카 */}
        {detailedServices.rentcars.length > 0 && (
          <ServiceSection icon="🚙" title="렌트카" accent="orange" count={detailedServices.rentcars.length}>
            {detailedServices.rentcars.map((it: any, i: number) => (
              <ItemCard
                key={i}
                title={pick(it.price?.vehicle_type, it.rentcarInfo?.vehicle_type)}
                subtitle={pick(it.price?.route, it.rentcarInfo?.route)}
                rows={[
                  ['이용방식', pick(it.price?.way_type, it.rentcarInfo?.way_type)],
                ]}
                unitPrice={it.unit_price}
                quantity={it.displayQuantity}
                total={it.total_price}
                quantityUnit="대"
              />
            ))}
          </ServiceSection>
        )}

        {/* 투어 - 단일 카드 표시 (반복 제거) */}
        {detailedServices.tours.length > 0 && (
          <ServiceSection icon="🎯" title="투어" accent="rose" count={detailedServices.tours.length}>
            {detailedServices.tours.map((it: any, i: number) => (
              <ItemCard
                key={i}
                title={pick(it.price?.tour_name, it.price?.tour?.tour_name, it.tourInfo?.tour_name)}
                subtitle={pick(it.tourInfo?.tour_date, it.options?.tour_date)}
                rows={[
                  ['차량', pick(it.price?.tour_vehicle, it.price?.vehicle_type)],
                  ['최대 인원', `${pick(it.price?.tour_capacity, it.price?.max_guests)}명`],
                ]}
                unitPrice={it.unit_price}
                quantity={it.displayQuantity}
                total={it.total_price}
                quantityUnit="대"
              />
            ))}
          </ServiceSection>
        )}

        {/* 매니저 메모 */}
        {quote.manager_note && (
          <section className="rounded-2xl bg-yellow-50 border border-yellow-200 p-4">
            <h2 className="text-sm font-bold text-yellow-800 mb-2">📝 매니저 메모</h2>
            <p className="text-sm text-yellow-900 whitespace-pre-wrap">{quote.manager_note}</p>
          </section>
        )}

        {/* 안내 */}
        <section className="rounded-2xl bg-blue-50 border border-blue-200 p-4">
          <p className="text-sm text-blue-700 leading-relaxed">
            💡 내역을 확인하시고 견적 제출을 클릭하시면 빠른 답변 드리겠습니다.
          </p>
        </section>
      </main>

      {/* 하단 액션 바 (모바일 sticky) */}
      <div className="fixed bottom-0 left-0 right-0 sm:static sm:max-w-3xl sm:mx-auto sm:px-4 z-20">
        <div className="bg-white border-t sm:border sm:rounded-2xl sm:shadow-lg border-slate-200 p-3 sm:p-4 flex gap-2">
          <button
            onClick={() => router.push('/mypage/quotes')}
            className="px-4 py-3 rounded-xl border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 transition"
            aria-label="홈"
          >
            🏠
          </button>
          {quote.status !== 'approved' && quote.status !== 'submitted' && (
            <button
              onClick={handleSubmitQuote}
              disabled={submitting}
              className="flex-1 px-4 py-3 rounded-xl bg-gradient-to-r from-green-500 to-emerald-500 text-white text-sm font-bold hover:opacity-90 transition disabled:opacity-50"
            >
              {submitting ? '제출 중...' : '📝 견적 제출'}
            </button>
          )}
          {quote.status === 'approved' && quote.payment_status !== 'paid' && (
            <button
              onClick={() => router.push('/mypage/payments')}
              className="flex-1 px-4 py-3 rounded-xl bg-yellow-500 text-white text-sm font-bold hover:bg-yellow-600 transition"
            >
              💳 결제하기
            </button>
          )}
          {quote.payment_status === 'paid' && (
            <button
              onClick={() => window.open(`/customer/confirmation?quote_id=${quote.id}&token=customer`, '_blank')}
              className="flex-1 px-4 py-3 rounded-xl bg-blue-500 text-white text-sm font-bold hover:bg-blue-600 transition"
            >
              📄 예약확인서
            </button>
          )}
          {quote.status === 'approved' && (
            <button
              onClick={handleReservation}
              className="flex-1 px-4 py-3 rounded-xl bg-indigo-500 text-white text-sm font-bold hover:bg-indigo-600 transition"
            >
              🎫 예약하기
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============== 하위 프레젠테이션 컴포넌트 ============== */

const ACCENT: Record<string, { bg: string; text: string }> = {
  amber: { bg: 'bg-amber-50', text: 'text-amber-700' },
  cyan: { bg: 'bg-cyan-50', text: 'text-cyan-700' },
  sky: { bg: 'bg-sky-50', text: 'text-sky-700' },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700' },
  orange: { bg: 'bg-orange-50', text: 'text-orange-700' },
  rose: { bg: 'bg-rose-50', text: 'text-rose-700' },
};

function ServiceSection({
  icon, title, accent, count, children,
}: {
  icon: string; title: string; accent: string; count: number; children: React.ReactNode;
}) {
  const c = ACCENT[accent] || ACCENT.amber;
  return (
    <section className="rounded-2xl bg-white border border-slate-200 overflow-hidden">
      <header className={`${c.bg} px-4 py-2.5 flex items-center justify-between`}>
        <h2 className={`text-sm font-bold ${c.text} flex items-center gap-1.5`}>
          <span>{icon}</span>
          <span>{title}</span>
        </h2>
        <span className={`text-xs font-semibold ${c.text} bg-white/70 px-2 py-0.5 rounded-full`}>
          {count}건
        </span>
      </header>
      <div className="p-3 sm:p-4 space-y-3">{children}</div>
    </section>
  );
}

function ItemCard({
  title, subtitle, rows, unitPrice, quantity, total, quantityUnit,
}: {
  title: string;
  subtitle?: string;
  rows: [string, string][];
  unitPrice: number | null | undefined;
  quantity: number | null | undefined;
  total: number | null | undefined;
  quantityUnit: string;
}) {
  return (
    <div className="rounded-xl bg-slate-50/60 border border-slate-200 p-3 sm:p-4">
      <div className="mb-2.5">
        <p className="text-base font-bold text-slate-800 leading-tight">{title}</p>
        {subtitle && subtitle !== '-' && (
          <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
        )}
      </div>

      {rows.length > 0 && (
        <dl className="grid grid-cols-3 gap-y-1.5 text-xs mb-3 pb-3 border-b border-slate-200">
          {rows.map(([k, v], i) => (
            <React.Fragment key={i}>
              <dt className="text-slate-500">{k}</dt>
              <dd className="col-span-2 text-slate-700">{v}</dd>
            </React.Fragment>
          ))}
        </dl>
      )}

      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-[10px] text-slate-500 uppercase tracking-wide">단가</p>
          <p className="text-xs sm:text-sm font-semibold text-slate-700 mt-0.5">{fmt(unitPrice)}</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-500 uppercase tracking-wide">수량</p>
          <p className="text-xs sm:text-sm font-semibold text-slate-700 mt-0.5">
            {Number(quantity || 0)}{quantityUnit}
          </p>
        </div>
        <div className="rounded-lg bg-blue-50">
          <p className="text-[10px] text-blue-600 uppercase tracking-wide pt-1">합계</p>
          <p className="text-sm sm:text-base font-bold text-blue-700">{fmt(total)}</p>
        </div>
      </div>
    </div>
  );
}
