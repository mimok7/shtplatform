'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, FileText, Home, Search } from 'lucide-react';
import supabase from '@/lib/supabase';
import { fetchTableInBatches } from '@/lib/fetchInBatches';
import ConfirmationGenerateModal from '@/components/ConfirmationGenerateModal';

type ReservationRow = {
  re_id: string;
  re_quote_id: string | null;
  re_status: string;
  re_created_at: string;
  re_user_id: string;
  re_type: string;
  price_breakdown?: Record<string, any> | null;
  payment_created_at?: string;
};

type GroupItem = {
  key: string;
  previewId: string;
  quoteId: string | null;
  reservationIds: string[];
  createdAt: string;
  userName: string;
  userEmail: string;
  serviceTypes: string[];
  count: number;
  confirmationStatus: 'waiting' | 'generated';
  hasPromotion: boolean;
};

const TYPE_LABEL: Record<string, string> = {
  cruise: '크루즈',
  airport: '공항',
  hotel: '호텔',
  tour: '투어',
  rentcar: '렌터카',
  car: '차량',
  vehicle: '차량',
  sht: '스하차량',
  car_sht: '스하차량',
  package: '패키지',
};

function hasPromotionBreakdown(value: any): boolean {
  if (!value) return false;
  if (value.promotion_code) return true;
  return Array.isArray(value.room_selections) && value.room_selections.some((item: any) => !!item?.promotion_code);
}

export default function MobileConfirmationPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<GroupItem[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'waiting' | 'generated'>('waiting');
  const [generatedVisibleCount, setGeneratedVisibleCount] = useState(20);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedQuoteId, setSelectedQuoteId] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        // manager1과 동일하게 결제완료(payment completed) 데이터 기준으로 대기 목록을 구성
        const { data: payments, error: paymentError } = await supabase
          .from('reservation_payment')
          .select('reservation_id, payment_status, created_at')
          .eq('payment_status', 'completed')
          .order('created_at', { ascending: false })
          .limit(2000);
        if (paymentError) throw paymentError;

        const uniquePaymentByReservation = new Map<string, any>();
        for (const row of payments || []) {
          const reservationId = String(row?.reservation_id || '').trim();
          if (!reservationId || uniquePaymentByReservation.has(reservationId)) continue;
          uniquePaymentByReservation.set(reservationId, row);
        }

        const reservationIds = Array.from(uniquePaymentByReservation.keys());
        if (reservationIds.length === 0) {
          if (!cancelled) setItems([]);
          return;
        }

        const reservationRows = await fetchTableInBatches<ReservationRow>(
          'reservation',
          're_id',
          reservationIds,
          're_id, re_quote_id, re_status, re_created_at, re_user_id, re_type, price_breakdown',
          80
        );

        const reservations = (reservationRows || [])
          .filter((r) => r?.re_status !== 'completed')
          .map((r) => {
          const payment = uniquePaymentByReservation.get(String(r.re_id));
          return { ...r, payment_created_at: payment?.created_at || r.re_created_at };
        });

        const userIds = Array.from(new Set(reservations.map((r) => r.re_user_id).filter(Boolean)));

        let users: any[] = [];
        if (userIds.length > 0) {
          users = await fetchTableInBatches<any>('users', 'id', userIds, 'id, name, email', 80);
        }

        const userMap = new Map(users.map((u) => [u.id, u]));

        const confirmationRows = reservationIds.length > 0
          ? await fetchTableInBatches<any>('confirmation_status', 'reservation_id', reservationIds, 'reservation_id, status', 80)
          : [];

        const confirmationMap = new Map<string, string>();
        for (const row of confirmationRows) {
          const reservationId = String(row?.reservation_id || '').trim();
          if (!reservationId) continue;
          const rawStatus = String(row?.status || '').toLowerCase();
          confirmationMap.set(reservationId, rawStatus);
        }

        const grouped = new Map<string, GroupItem>();

        for (const row of reservations) {
          const groupKey = String(row.re_quote_id || row.re_id);
          const user = userMap.get(row.re_user_id);
          const existed = grouped.get(groupKey);
          if (!existed) {
            grouped.set(groupKey, {
              key: groupKey,
              previewId: groupKey,
              quoteId: row.re_quote_id ? String(row.re_quote_id) : null,
              reservationIds: [row.re_id],
              createdAt: row.payment_created_at || row.re_created_at,
              userName: String(user?.name || user?.email?.split('@')?.[0] || '고객'),
              userEmail: String(user?.email || ''),
              serviceTypes: [row.re_type],
              count: 1,
              confirmationStatus: 'waiting',
              hasPromotion: hasPromotionBreakdown(row.price_breakdown),
            });
            continue;
          }
          existed.count += 1;
          if (!existed.reservationIds.includes(row.re_id)) existed.reservationIds.push(row.re_id);
          if (!existed.serviceTypes.includes(row.re_type)) existed.serviceTypes.push(row.re_type);
          existed.hasPromotion = existed.hasPromotion || hasPromotionBreakdown(row.price_breakdown);
          const nextCreatedAt = row.payment_created_at || row.re_created_at;
          if (new Date(nextCreatedAt).getTime() > new Date(existed.createdAt).getTime()) {
            existed.createdAt = nextCreatedAt;
          }
        }

        for (const item of grouped.values()) {
          const statuses = item.reservationIds.map((rid) => String(confirmationMap.get(rid) || 'waiting').toLowerCase());
          const hasGenerated = statuses.some((s) => s === 'generated' || s === 'sent');
          item.confirmationStatus = hasGenerated ? 'generated' : 'waiting';
        }

        if (!cancelled) {
          const sorted = Array.from(grouped.values()).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          setItems(sorted);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || '확인서 목록을 불러오지 못했습니다.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setGeneratedVisibleCount(20);
  }, [statusFilter, searchTerm]);

  const filteredItems = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return items.filter((item) => {
      const statusMatched = statusFilter === 'all' ? true : item.confirmationStatus === statusFilter;
      if (!statusMatched) return false;
      if (!term) return true;
      return (
        item.userName.toLowerCase().includes(term) ||
        item.userEmail.toLowerCase().includes(term) ||
        item.previewId.toLowerCase().includes(term)
      );
    });
  }, [items, searchTerm, statusFilter]);

  const displayedItems = useMemo(() => {
    if (statusFilter !== 'generated') return filteredItems;
    return filteredItems.slice(0, generatedVisibleCount);
  }, [filteredItems, generatedVisibleCount, statusFilter]);

  const openConfirmation = (id: string) => {
    setSelectedQuoteId(id);
    setIsModalOpen(true);
  };

  const handleGenerate = async (item: GroupItem) => {
    try {
      const targets = item.reservationIds;
      if (targets.length === 0) return;

      const { data: updatedRows, error: updateError } = await supabase
        .from('confirmation_status')
        .update({ status: 'generated' })
        .in('reservation_id', targets)
        .select('reservation_id');

      if (updateError) {
        console.warn('확인서 상태 업데이트 실패(삽입 시도로 진행):', updateError.message);
      }

      const updatedSet = new Set((updatedRows || []).map((r: any) => String(r.reservation_id)));
      const toInsert = targets.filter((rid) => !updatedSet.has(rid));

      if (toInsert.length > 0) {
        const payload = toInsert.map((rid) => ({
          reservation_id: rid,
          quote_id: item.quoteId,
          status: 'generated' as const,
        }));
        const { error: insertError } = await supabase.from('confirmation_status').insert(payload);
        if (insertError) {
          console.warn('확인서 상태 삽입 실패:', insertError.message);
        }
      }

      setItems((prev) => prev.map((p) => (p.key === item.key ? { ...p, confirmationStatus: 'generated' } : p)));
      openConfirmation(item.previewId);
    } catch (e: any) {
      console.error('확인서 생성 실패:', e?.message || e);
      setItems((prev) => prev.map((p) => (p.key === item.key ? { ...p, confirmationStatus: 'generated' } : p)));
      openConfirmation(item.previewId);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-16">
      <div className="bg-white border-b shadow-sm px-2 py-2">
        <div className="flex items-center gap-2">
          <button onClick={() => router.back()} className="p-1.5 rounded-lg hover:bg-gray-100">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h1 className="text-base font-bold text-gray-800 flex-1 text-center">예약확인서</h1>
          <Link href="/" className="p-1.5 rounded-lg hover:bg-gray-100">
            <Home className="w-5 h-5 text-gray-600" />
          </Link>
        </div>
      </div>

      <div className="px-3 py-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSearchTerm(searchInput);
          }}
          className="mb-3 flex gap-2"
        >
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="고객명, 이메일, 예약번호 검색"
              className="h-10 w-full rounded-lg border bg-white pl-8 pr-3 text-sm outline-none focus:border-blue-400"
            />
          </div>
          <button type="submit" className="h-10 rounded-lg bg-blue-600 px-3 text-sm font-semibold text-white">
            검색
          </button>
        </form>

        <div className="mb-3 flex gap-2">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`h-8 rounded-full px-3 text-xs font-medium ${statusFilter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}
          >
            전체
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('waiting')}
            className={`h-8 rounded-full px-3 text-xs font-medium ${statusFilter === 'waiting' ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-600'}`}
          >
            대기중
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('generated')}
            className={`h-8 rounded-full px-3 text-xs font-medium ${statusFilter === 'generated' ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600'}`}
          >
            생성됨
          </button>
        </div>

        {loading ? (
          <div className="flex h-[60vh] flex-col items-center justify-center gap-2 text-sm text-gray-500">
            <div className="h-9 w-9 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />
            <p>대기 화면 불러오는 중...</p>
          </div>
        ) : error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
        ) : displayedItems.length === 0 ? (
          <div className="flex h-56 flex-col items-center justify-center gap-2 text-gray-400">
            <FileText className="h-8 w-8" />
            <p className="text-sm">생성 가능한 확인서가 없습니다.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {displayedItems.map((item) => (
              <div
                key={item.key}
                role="button"
                tabIndex={0}
                onClick={() => openConfirmation(item.previewId)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openConfirmation(item.previewId);
                  }
                }}
                className="relative w-full rounded-xl border border-gray-200 bg-white p-3 text-left shadow-sm transition-colors hover:bg-violet-50"
              >
                <div className="mb-2 flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-800">{item.userName}</p>
                    <p className="truncate text-[11px] text-gray-500">{item.userEmail || '-'}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {item.hasPromotion && (
                      <span className="rounded-full bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-700 border border-red-100 whitespace-nowrap">🎁 프로모션</span>
                    )}
                    <span className={`rounded-full px-2 py-1 text-[11px] ${item.confirmationStatus === 'generated' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                      {item.confirmationStatus === 'generated' ? '생성됨' : '대기중'}
                    </span>
                    <span className="rounded-full bg-gray-100 px-2 py-1 text-[11px] text-gray-600">
                      {item.count}건
                    </span>
                  </div>
                </div>
                <p className="text-[11px] text-gray-500">예약일: {new Date(item.createdAt).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}</p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {item.serviceTypes.map((type) => (
                    <span key={`${item.key}-${type}`} className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] text-blue-700">
                      {TYPE_LABEL[type] || type}
                    </span>
                  ))}
                </div>

                {item.confirmationStatus === 'waiting' && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleGenerate(item);
                    }}
                    className="absolute bottom-2 right-2 rounded bg-blue-600 px-2 py-1 text-[10px] font-semibold text-white shadow-sm hover:bg-blue-700"
                  >
                    생성
                  </button>
                )}
              </div>
            ))}

            {statusFilter === 'generated' && filteredItems.length > displayedItems.length && (
              <button
                type="button"
                onClick={() => setGeneratedVisibleCount((prev) => prev + 20)}
                className="h-10 w-full rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700"
              >
                더 불러오기
              </button>
            )}
          </div>
        )}
      </div>

      <ConfirmationGenerateModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        quoteId={selectedQuoteId}
      />
    </div>
  );
}
