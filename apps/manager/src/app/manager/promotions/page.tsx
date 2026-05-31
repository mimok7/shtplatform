'use client';

import { useEffect, useMemo, useState } from 'react';
import ManagerLayout from '@/components/ManagerLayout';
import supabase from '@/lib/supabase';
import {
  BadgePercent,
  CalendarDays,
  CheckCircle2,
  CircleOff,
  Filter,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Settings2,
  Trash2,
} from 'lucide-react';

type Promotion = {
  id: string;
  code: string;
  name: string;
  cruise_name: string;
  booking_from: string;
  booking_to: string | null;
  checkin_from: string;
  checkin_to: string;
  quota_total: number;
  is_active: boolean;
  notes: string | null;
  created_at?: string;
  updated_at?: string;
};

type PromotionRate = {
  id: string;
  promotion_id: string;
  schedule_type: string;
  room_type: string;
  checkin_from: string;
  checkin_to: string;
  price_adult: number;
  price_child: number | null;
  price_infant: number | null;
  price_extra_bed: number | null;
  price_child_extra_bed: number | null;
  price_single: number | null;
  currency: string | null;
};

type UsageSummary = Record<string, number>;
type PageTab = 'settings' | 'reservations';

type PromotionReservationRow = {
  usage_id: string;
  promotion_id: string;
  promotion_name: string;
  promotion_code: string;
  reservation_id: string;
  reservation_status: string;
  reservation_created_at: string | null;
  promotion_status: string;
  promotion_used_at: string | null;
  promotion_sequence: number | null;
  user_name: string;
  user_email: string;
  cruise_name: string;
  room_type: string;
  checkin: string | null;
};

type PromotionForm = Omit<Promotion, 'id' | 'created_at' | 'updated_at'> & { id?: string };
type RateForm = Omit<PromotionRate, 'id' | 'promotion_id'> & { id?: string };

const emptyPromotionForm: PromotionForm = {
  code: '',
  name: '',
  cruise_name: '',
  booking_from: new Date().toISOString().slice(0, 10),
  booking_to: null,
  checkin_from: new Date().toISOString().slice(0, 10),
  checkin_to: new Date().toISOString().slice(0, 10),
  quota_total: 1,
  is_active: true,
  notes: '',
};

const emptyRateForm: RateForm = {
  schedule_type: '1N2D',
  room_type: '',
  checkin_from: new Date().toISOString().slice(0, 10),
  checkin_to: new Date().toISOString().slice(0, 10),
  price_adult: 0,
  price_child: null,
  price_infant: null,
  price_extra_bed: null,
  price_child_extra_bed: null,
  price_single: null,
  currency: 'VND',
};

const toNumberOrNull = (value: unknown) => {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const formatMoney = (value: number | null | undefined) => {
  if (value === null || value === undefined) return '-';
  return `${Number(value).toLocaleString('ko-KR')}동`;
};

const formatDateRange = (from?: string | null, to?: string | null) => {
  if (!from && !to) return '-';
  return `${from || '-'} ~ ${to || '제한 없음'}`;
};

export default function PromotionManagementPage() {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [rates, setRates] = useState<PromotionRate[]>([]);
  const [usageSummary, setUsageSummary] = useState<UsageSummary>({});
  const [pageTab, setPageTab] = useState<PageTab>('settings');
  const [usageRows, setUsageRows] = useState<PromotionReservationRow[]>([]);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageFilterPromotionId, setUsageFilterPromotionId] = useState<string>('all');
  const [selectedPromotionId, setSelectedPromotionId] = useState<string>('');
  const [promotionForm, setPromotionForm] = useState<PromotionForm>(emptyPromotionForm);
  const [rateForm, setRateForm] = useState<RateForm>(emptyRateForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rateSaving, setRateSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const selectedPromotion = useMemo(
    () => promotions.find((promotion) => promotion.id === selectedPromotionId) || null,
    [promotions, selectedPromotionId]
  );

  const selectedUsageCount = selectedPromotion ? usageSummary[selectedPromotion.id] || 0 : 0;
  const selectedRemaining = selectedPromotion ? Math.max(selectedPromotion.quota_total - selectedUsageCount, 0) : 0;

  const filteredUsageRows = useMemo(() => {
    if (usageFilterPromotionId === 'all') return usageRows;
    return usageRows.filter((row) => row.promotion_id === usageFilterPromotionId);
  }, [usageRows, usageFilterPromotionId]);

  const visibleUsageRows = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return filteredUsageRows
      .filter((row) => {
        const checkinRaw = String(row.checkin || '').trim();
        if (!checkinRaw) return true;
        const checkin = new Date(`${checkinRaw}T00:00:00`);
        if (Number.isNaN(checkin.getTime())) return true;
        return checkin.getTime() >= today.getTime();
      })
      .sort((a, b) => {
        const aReservationTime = a.reservation_created_at ? new Date(a.reservation_created_at).getTime() : Number.MAX_SAFE_INTEGER;
        const bReservationTime = b.reservation_created_at ? new Date(b.reservation_created_at).getTime() : Number.MAX_SAFE_INTEGER;
        if (aReservationTime !== bReservationTime) return aReservationTime - bReservationTime;

        const aCheckin = String(a.checkin || '');
        const bCheckin = String(b.checkin || '');
        return aCheckin.localeCompare(bCheckin);
      });
  }, [filteredUsageRows]);

  const groupedUsageRows = useMemo(() => {
    const groups = new Map<string, { promotionId: string; promotionName: string; promotionCode: string; rows: PromotionReservationRow[] }>();

    for (const row of visibleUsageRows) {
      const key = row.promotion_id || 'unknown';
      if (!groups.has(key)) {
        groups.set(key, {
          promotionId: key,
          promotionName: row.promotion_name || '-',
          promotionCode: row.promotion_code || '-',
          rows: [],
        });
      }
      groups.get(key)!.rows.push(row);
    }

    return Array.from(groups.values()).sort((a, b) => a.promotionName.localeCompare(b.promotionName, 'ko'));
  }, [visibleUsageRows]);

  const hiddenPastCount = Math.max(filteredUsageRows.length - visibleUsageRows.length, 0);

  const loadPromotionReservations = async (promotionList?: Promotion[]) => {
    setUsageLoading(true);
    try {
      const usingPromotions = promotionList || promotions;
      const promotionMap = new Map(usingPromotions.map((promotion) => [promotion.id, promotion]));

      const { data: usageData, error: usageError } = await supabase
        .from('cruise_promotion_usage')
        .select('id, promotion_id, reservation_id, reservation_cruise_id, status, used_at, promotion_sequence')
        .not('reservation_id', 'is', null)
        .in('status', ['reserved', 'confirmed'])
        .order('used_at', { ascending: false });

      if (usageError) throw usageError;

      const usageRowsRaw = (usageData || []) as any[];
      if (usageRowsRaw.length === 0) {
        setUsageRows([]);
        return;
      }

      const reservationIds = Array.from(new Set(usageRowsRaw.map((row) => String(row.reservation_id || '').trim()).filter(Boolean)));
      const reservationCruiseIds = Array.from(new Set(usageRowsRaw.map((row) => String(row.reservation_cruise_id || '').trim()).filter(Boolean)));

      const [{ data: reservationsData, error: reservationError }, { data: reservationCruiseData, error: reservationCruiseError }] = await Promise.all([
        reservationIds.length > 0
          ? supabase
              .from('reservation')
              .select('re_id, re_status, re_created_at, re_user_id')
              .in('re_id', reservationIds)
          : Promise.resolve({ data: [], error: null }),
        reservationIds.length > 0
          ? supabase
              .from('reservation_cruise')
              .select('id, reservation_id, room_price_code, checkin')
              .in('reservation_id', reservationIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (reservationError) throw reservationError;
      if (reservationCruiseError) throw reservationCruiseError;

      const reservationMap = new Map(((reservationsData || []) as any[]).map((row) => [String(row.re_id || '').trim(), row]));
      const reservationCruiseMapById = new Map(((reservationCruiseData || []) as any[]).map((row) => [String(row.id || '').trim(), row]));
      const reservationCruiseMapByReservationId = new Map<string, any>();
      for (const row of (reservationCruiseData || []) as any[]) {
        const key = String(row.reservation_id || '').trim();
        if (!key || reservationCruiseMapByReservationId.has(key)) continue;
        reservationCruiseMapByReservationId.set(key, row);
      }

      const userIds = Array.from(
        new Set(
          Array.from(reservationMap.values())
            .map((row: any) => String(row.re_user_id || '').trim())
            .filter(Boolean)
        )
      );

      const { data: usersData, error: usersError } = userIds.length > 0
        ? await supabase.from('users').select('id, name, email').in('id', userIds)
        : { data: [], error: null };

      if (usersError) throw usersError;

      const userMap = new Map(((usersData || []) as any[]).map((row) => [String(row.id || '').trim(), row]));

      const roomCodes = Array.from(
        new Set(
          ((reservationCruiseData || []) as any[])
            .map((row) => String(row.room_price_code || '').trim())
            .filter((value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))
        )
      );

      const { data: rateCardsData, error: rateCardError } = roomCodes.length > 0
        ? await supabase.from('cruise_rate_card').select('id, cruise_name, room_type').in('id', roomCodes)
        : { data: [], error: null };

      if (rateCardError) throw rateCardError;

      const rateCardMap = new Map(((rateCardsData || []) as any[]).map((row) => [String(row.id || '').trim(), row]));

      const mergedRows: PromotionReservationRow[] = usageRowsRaw.map((usage) => {
        const reservationId = String(usage.reservation_id || '').trim();
        const reservationCruiseId = String(usage.reservation_cruise_id || '').trim();
        const reservation = reservationMap.get(reservationId) || null;
        const cruiseRow = (reservationCruiseId && reservationCruiseMapById.get(reservationCruiseId))
          || reservationCruiseMapByReservationId.get(reservationId)
          || null;

        const promotionId = String(usage.promotion_id || '').trim();
        const promotion = promotionMap.get(promotionId) || null;
        const user = reservation ? userMap.get(String((reservation as any).re_user_id || '').trim()) : null;

        const roomPriceCode = String((cruiseRow as any)?.room_price_code || '').trim();
        const rateCard = roomPriceCode ? rateCardMap.get(roomPriceCode) : null;

        return {
          usage_id: String(usage.id || '').trim(),
          promotion_id: promotionId,
          promotion_name: promotion?.name || '-',
          promotion_code: promotion?.code || '-',
          reservation_id: reservationId,
          reservation_status: String((reservation as any)?.re_status || '-'),
          reservation_created_at: (reservation as any)?.re_created_at || null,
          promotion_status: String(usage.status || '-'),
          promotion_used_at: usage.used_at || null,
          promotion_sequence: Number(usage.promotion_sequence || 0) || null,
          user_name: String((user as any)?.name || '-'),
          user_email: String((user as any)?.email || '-'),
          cruise_name: String((rateCard as any)?.cruise_name || promotion?.cruise_name || '-'),
          room_type: String((rateCard as any)?.room_type || roomPriceCode || '-'),
          checkin: (cruiseRow as any)?.checkin || null,
        };
      });

      setUsageRows(mergedRows);
    } catch (err) {
      console.error('프로모션 예약내역 조회 실패:', err);
      setError('프로모션 예약내역을 조회하지 못했습니다.');
    } finally {
      setUsageLoading(false);
    }
  };

  const loadPromotions = async (preferredId?: string) => {
    setLoading(true);
    setError('');
    try {
      const { data, error: promotionError } = await supabase
        .from('cruise_promotion')
        .select('*')
        .order('is_active', { ascending: false })
        .order('created_at', { ascending: false });

      if (promotionError) throw promotionError;

      const loadedPromotions = (data || []) as Promotion[];
      setPromotions(loadedPromotions);

      const { data: usageRows } = await supabase
        .from('cruise_promotion_usage')
        .select('promotion_id, status')
        .in('status', ['reserved', 'confirmed']);

      const counts: UsageSummary = {};
      for (const row of usageRows || []) {
        const promotionId = (row as any).promotion_id;
        if (!promotionId) continue;
        counts[promotionId] = (counts[promotionId] || 0) + 1;
      }
      setUsageSummary(counts);

      const nextSelectedId = preferredId || selectedPromotionId || loadedPromotions[0]?.id || '';
      setSelectedPromotionId(nextSelectedId);

      const nextSelected = loadedPromotions.find((promotion) => promotion.id === nextSelectedId) || loadedPromotions[0];
      if (nextSelected) {
        setPromotionForm({ ...nextSelected, booking_to: nextSelected.booking_to || null, notes: nextSelected.notes || '' });
        await loadRates(nextSelected.id);
      } else {
        setPromotionForm(emptyPromotionForm);
        setRates([]);
      }

      await loadPromotionReservations(loadedPromotions);
    } catch (err) {
      console.error('프로모션 조회 실패:', err);
      setError('프로모션 테이블을 조회하지 못했습니다. 프로모션 SQL 마이그레이션 적용 여부를 확인해 주세요.');
    } finally {
      setLoading(false);
    }
  };

  const loadRates = async (promotionId: string) => {
    const { data, error: rateError } = await supabase
      .from('cruise_promotion_rate')
      .select('*')
      .eq('promotion_id', promotionId)
      .order('checkin_from', { ascending: true })
      .order('schedule_type', { ascending: true })
      .order('room_type', { ascending: true });

    if (rateError) throw rateError;
    setRates((data || []) as PromotionRate[]);
  };

  useEffect(() => {
    void loadPromotions();
  }, []);

  const selectPromotion = async (promotion: Promotion) => {
    setSelectedPromotionId(promotion.id);
    setPromotionForm({ ...promotion, booking_to: promotion.booking_to || null, notes: promotion.notes || '' });
    setRateForm(emptyRateForm);
    setError('');
    setMessage('');
    try {
      await loadRates(promotion.id);
    } catch (err) {
      console.error('요금 구간 조회 실패:', err);
      setError('프로모션 요금 구간을 조회하지 못했습니다.');
    }
  };

  const startNewPromotion = () => {
    setSelectedPromotionId('');
    setPageTab('settings');
    setPromotionForm(emptyPromotionForm);
    setRateForm(emptyRateForm);
    setRates([]);
    setError('');
    setMessage('새 프로모션을 작성 중입니다. 저장 후 요금 구간을 추가할 수 있습니다.');
  };

  const savePromotion = async () => {
    if (!promotionForm.code.trim() || !promotionForm.name.trim() || !promotionForm.cruise_name.trim()) {
      setError('코드, 프로모션명, 크루즈명은 필수입니다.');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');
    try {
      const payload = {
        code: promotionForm.code.trim(),
        name: promotionForm.name.trim(),
        cruise_name: promotionForm.cruise_name.trim(),
        booking_from: promotionForm.booking_from,
        booking_to: promotionForm.booking_to || null,
        checkin_from: promotionForm.checkin_from,
        checkin_to: promotionForm.checkin_to,
        quota_total: Number(promotionForm.quota_total || 1),
        is_active: promotionForm.is_active,
        notes: promotionForm.notes || null,
        updated_at: new Date().toISOString(),
      };

      if (promotionForm.id) {
        const { error: updateError } = await supabase
          .from('cruise_promotion')
          .update(payload)
          .eq('id', promotionForm.id);
        if (updateError) throw updateError;
        setMessage('프로모션 설정을 저장했습니다.');
        await loadPromotions(promotionForm.id);
      } else {
        const { data, error: insertError } = await supabase
          .from('cruise_promotion')
          .insert(payload)
          .select('*')
          .single();
        if (insertError) throw insertError;
        setMessage('프로모션을 생성했습니다.');
        await loadPromotions((data as Promotion).id);
      }
    } catch (err) {
      console.error('프로모션 저장 실패:', err);
      setError('프로모션 저장에 실패했습니다. 코드 중복 또는 입력값을 확인해 주세요.');
    } finally {
      setSaving(false);
    }
  };

  const togglePromotion = async (promotion: Promotion, nextActive: boolean) => {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const { error: updateError } = await supabase
        .from('cruise_promotion')
        .update({ is_active: nextActive, updated_at: new Date().toISOString() })
        .eq('id', promotion.id);
      if (updateError) throw updateError;
      setMessage(nextActive ? '프로모션 적용을 다시 켰습니다.' : '프로모션 적용을 중지했습니다.');
      await loadPromotions(promotion.id);
    } catch (err) {
      console.error('프로모션 상태 변경 실패:', err);
      setError('프로모션 상태 변경에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const editRate = (rate: PromotionRate) => {
    setRateForm({
      id: rate.id,
      schedule_type: rate.schedule_type,
      room_type: rate.room_type,
      checkin_from: rate.checkin_from,
      checkin_to: rate.checkin_to,
      price_adult: rate.price_adult,
      price_child: rate.price_child,
      price_infant: rate.price_infant,
      price_extra_bed: rate.price_extra_bed,
      price_child_extra_bed: rate.price_child_extra_bed,
      price_single: rate.price_single,
      currency: rate.currency || 'VND',
    });
  };

  const saveRate = async () => {
    if (!selectedPromotionId) {
      setError('먼저 프로모션을 저장하거나 선택해 주세요.');
      return;
    }
    if (!rateForm.schedule_type.trim() || !rateForm.room_type.trim() || !rateForm.checkin_from || !rateForm.checkin_to) {
      setError('일정, 객실명, 적용 기간은 필수입니다.');
      return;
    }
    if (!Number(rateForm.price_adult)) {
      setError('성인 요금은 0보다 커야 합니다.');
      return;
    }

    setRateSaving(true);
    setError('');
    setMessage('');
    try {
      const payload = {
        promotion_id: selectedPromotionId,
        schedule_type: rateForm.schedule_type.trim(),
        room_type: rateForm.room_type.trim(),
        checkin_from: rateForm.checkin_from,
        checkin_to: rateForm.checkin_to,
        price_adult: Number(rateForm.price_adult),
        price_child: toNumberOrNull(rateForm.price_child),
        price_infant: toNumberOrNull(rateForm.price_infant),
        price_extra_bed: toNumberOrNull(rateForm.price_extra_bed),
        price_child_extra_bed: toNumberOrNull(rateForm.price_child_extra_bed),
        price_single: toNumberOrNull(rateForm.price_single),
        currency: rateForm.currency || 'VND',
        updated_at: new Date().toISOString(),
      };

      if (rateForm.id) {
        const { error: updateError } = await supabase
          .from('cruise_promotion_rate')
          .update(payload)
          .eq('id', rateForm.id);
        if (updateError) throw updateError;
        setMessage('요금 구간을 수정했습니다.');
      } else {
        const { error: insertError } = await supabase
          .from('cruise_promotion_rate')
          .insert(payload);
        if (insertError) throw insertError;
        setMessage('요금 구간을 추가했습니다.');
      }

      setRateForm(emptyRateForm);
      await loadRates(selectedPromotionId);
    } catch (err) {
      console.error('요금 구간 저장 실패:', err);
      setError('요금 구간 저장에 실패했습니다. 같은 기간/일정/객실 조합이 이미 있는지 확인해 주세요.');
    } finally {
      setRateSaving(false);
    }
  };

  const deleteRate = async (rate: PromotionRate) => {
    const confirmed = window.confirm(`${rate.room_type} 요금 구간을 삭제할까요?`);
    if (!confirmed) return;

    setRateSaving(true);
    setError('');
    try {
      const { error: deleteError } = await supabase
        .from('cruise_promotion_rate')
        .delete()
        .eq('id', rate.id);
      if (deleteError) throw deleteError;
      setMessage('요금 구간을 삭제했습니다.');
      await loadRates(selectedPromotionId);
    } catch (err) {
      console.error('요금 구간 삭제 실패:', err);
      setError('요금 구간 삭제에 실패했습니다.');
    } finally {
      setRateSaving(false);
    }
  };

  const getPromotionStatusBadge = (status: string) => {
    if (status === 'confirmed') return 'bg-green-100 text-green-700';
    if (status === 'reserved') return 'bg-blue-100 text-blue-700';
    return 'bg-slate-100 text-slate-600';
  };

  return (
    <ManagerLayout title="프로모션 관리" activeTab="promotions">
      <div className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">프로모션 관리</h1>
            <p className="mt-1 text-sm text-slate-600">적용 여부, 예약 기간, 승선 기간, 한정 수량, 객실별 프로모션 요금을 관리합니다.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg border border-slate-300 bg-white p-1">
              <button
                type="button"
                onClick={() => setPageTab('settings')}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${pageTab === 'settings' ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
              >
                설정
              </button>
              <button
                type="button"
                onClick={() => setPageTab('reservations')}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${pageTab === 'reservations' ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
              >
                프로모션 예약내역
              </button>
            </div>
            <button
              type="button"
              onClick={() => void loadPromotions(selectedPromotionId)}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw className="h-4 w-4" />
              새로고침
            </button>
            <button
              type="button"
              onClick={startNewPromotion}
              className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              새 프로모션
            </button>
          </div>
        </div>

        {(error || message) && (
          <div className={`rounded-lg border px-4 py-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-blue-200 bg-blue-50 text-blue-700'}`}>
            {error || message}
          </div>
        )}

        {loading ? (
          <div className="flex h-64 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            프로모션을 불러오는 중입니다.
          </div>
        ) : (
          pageTab === 'settings' ? (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[360px_1fr]">
            <section className="space-y-3">
              <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                <div className="mb-3 flex items-center gap-2">
                  <BadgePercent className="h-4 w-4 text-blue-600" />
                  <h2 className="text-sm font-semibold text-slate-900">프로모션 목록</h2>
                </div>
                <div className="space-y-2">
                  {promotions.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">등록된 프로모션이 없습니다.</div>
                  ) : promotions.map((promotion) => {
                    const usageCount = usageSummary[promotion.id] || 0;
                    const remaining = Math.max(promotion.quota_total - usageCount, 0);
                    const selected = selectedPromotionId === promotion.id;
                    return (
                      <button
                        key={promotion.id}
                        type="button"
                        onClick={() => void selectPromotion(promotion)}
                        className={`w-full rounded-lg border p-3 text-left transition ${selected ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-slate-900">{promotion.name}</div>
                            <div className="mt-1 truncate text-xs text-slate-500">{promotion.cruise_name}</div>
                          </div>
                          <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold ${promotion.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                            {promotion.is_active ? '적용중' : '중지'}
                          </span>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
                          <span>사용 {usageCount.toLocaleString()}팀</span>
                          <span>잔여 {remaining.toLocaleString()}팀</span>
                          <span className="col-span-2 truncate">코드 {promotion.code}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Settings2 className="h-4 w-4 text-blue-600" />
                    <h2 className="text-sm font-semibold text-slate-900">기본 설정</h2>
                  </div>
                  {selectedPromotion && (
                    <button
                      type="button"
                      onClick={() => void togglePromotion(selectedPromotion, !selectedPromotion.is_active)}
                      disabled={saving}
                      className={`inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:opacity-60 ${selectedPromotion.is_active ? 'bg-slate-600 hover:bg-slate-700' : 'bg-green-600 hover:bg-green-700'}`}
                    >
                      {selectedPromotion.is_active ? <CircleOff className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                      {selectedPromotion.is_active ? '적용 중지' : '적용 켜기'}
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <label className="space-y-1">
                    <span className="text-xs font-semibold text-blue-700">프로모션 코드</span>
                    <input
                      value={promotionForm.code}
                      onChange={(event) => setPromotionForm((prev) => ({ ...prev, code: event.target.value }))}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      placeholder="예: LYRA-GRANZER-1N2D-VOUCHER-2026-30"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-semibold text-blue-700">프로모션명</span>
                    <input
                      value={promotionForm.name}
                      onChange={(event) => setPromotionForm((prev) => ({ ...prev, name: event.target.value }))}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      placeholder="라이라 그랜져 1박2일 바우처 프로모션"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-semibold text-blue-700">크루즈명</span>
                    <input
                      value={promotionForm.cruise_name}
                      onChange={(event) => setPromotionForm((prev) => ({ ...prev, cruise_name: event.target.value }))}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      placeholder="cruise_rate_card의 크루즈명과 동일해야 합니다"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-semibold text-blue-700">한정 수량</span>
                    <input
                      type="number"
                      min={1}
                      value={promotionForm.quota_total}
                      onChange={(event) => setPromotionForm((prev) => ({ ...prev, quota_total: Number(event.target.value || 1) }))}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-semibold text-blue-700">예약 시작일</span>
                    <input
                      type="date"
                      value={promotionForm.booking_from}
                      onChange={(event) => setPromotionForm((prev) => ({ ...prev, booking_from: event.target.value }))}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-semibold text-blue-700">예약 종료일</span>
                    <input
                      type="date"
                      value={promotionForm.booking_to || ''}
                      onChange={(event) => setPromotionForm((prev) => ({ ...prev, booking_to: event.target.value || null }))}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-semibold text-blue-700">승선 시작일</span>
                    <input
                      type="date"
                      value={promotionForm.checkin_from}
                      onChange={(event) => setPromotionForm((prev) => ({ ...prev, checkin_from: event.target.value }))}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-semibold text-blue-700">승선 종료일</span>
                    <input
                      type="date"
                      value={promotionForm.checkin_to}
                      onChange={(event) => setPromotionForm((prev) => ({ ...prev, checkin_to: event.target.value }))}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={promotionForm.is_active}
                      onChange={(event) => setPromotionForm((prev) => ({ ...prev, is_active: event.target.checked }))}
                      className="h-4 w-4"
                    />
                    프로모션 적용
                  </label>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    <div>현재 사용 {selectedUsageCount.toLocaleString()}팀</div>
                    <div>잔여 {selectedRemaining.toLocaleString()}팀</div>
                  </div>
                  <label className="space-y-1 md:col-span-2">
                    <span className="text-xs font-semibold text-blue-700">설명 / 적용 조건</span>
                    <textarea
                      value={promotionForm.notes || ''}
                      onChange={(event) => setPromotionForm((prev) => ({ ...prev, notes: event.target.value }))}
                      rows={4}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      placeholder="예: 선착순 30팀, 차량 50% 할인, 특정 월 승선 적용 등"
                    />
                  </label>
                </div>

                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={() => void savePromotion()}
                    disabled={saving}
                    className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    기본 설정 저장
                  </button>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-4 flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-blue-600" />
                  <h2 className="text-sm font-semibold text-slate-900">객실별 요금 구간</h2>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-6">
                  <label className="space-y-1">
                    <span className="text-xs font-semibold text-blue-700">일정</span>
                    <input
                      value={rateForm.schedule_type}
                      onChange={(event) => setRateForm((prev) => ({ ...prev, schedule_type: event.target.value }))}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="space-y-1 md:col-span-2 xl:col-span-2">
                    <span className="text-xs font-semibold text-blue-700">객실명</span>
                    <input
                      value={rateForm.room_type}
                      onChange={(event) => setRateForm((prev) => ({ ...prev, room_type: event.target.value }))}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-semibold text-blue-700">시작일</span>
                    <input
                      type="date"
                      value={rateForm.checkin_from}
                      onChange={(event) => setRateForm((prev) => ({ ...prev, checkin_from: event.target.value }))}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-semibold text-blue-700">종료일</span>
                    <input
                      type="date"
                      value={rateForm.checkin_to}
                      onChange={(event) => setRateForm((prev) => ({ ...prev, checkin_to: event.target.value }))}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-semibold text-blue-700">성인</span>
                    <input
                      type="number"
                      value={rateForm.price_adult}
                      onChange={(event) => setRateForm((prev) => ({ ...prev, price_adult: Number(event.target.value || 0) }))}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </label>
                  {[
                    ['아동', 'price_child'],
                    ['유아', 'price_infant'],
                    ['엑스트라베드', 'price_extra_bed'],
                    ['아동 엑스트라', 'price_child_extra_bed'],
                    ['싱글차지', 'price_single'],
                  ].map(([label, key]) => (
                    <label key={key} className="space-y-1">
                      <span className="text-xs font-semibold text-blue-700">{label}</span>
                      <input
                        type="number"
                        value={(rateForm as any)[key] ?? ''}
                        onChange={(event) => setRateForm((prev) => ({ ...prev, [key]: event.target.value === '' ? null : Number(event.target.value) }))}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                    </label>
                  ))}
                  <label className="space-y-1">
                    <span className="text-xs font-semibold text-blue-700">통화</span>
                    <input
                      value={rateForm.currency || 'VND'}
                      onChange={(event) => setRateForm((prev) => ({ ...prev, currency: event.target.value }))}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </label>
                </div>

                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setRateForm(emptyRateForm)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    입력 초기화
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveRate()}
                    disabled={rateSaving || !selectedPromotionId}
                    className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                  >
                    {rateSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    요금 저장
                  </button>
                </div>

                <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
                  <table className="min-w-[960px] w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        <th className="px-3 py-2">일정</th>
                        <th className="px-3 py-2">객실</th>
                        <th className="px-3 py-2">적용 기간</th>
                        <th className="px-3 py-2 text-right">성인</th>
                        <th className="px-3 py-2 text-right">아동</th>
                        <th className="px-3 py-2 text-right">유아</th>
                        <th className="px-3 py-2 text-right">엑스트라</th>
                        <th className="px-3 py-2 text-right">싱글</th>
                        <th className="px-3 py-2 text-center">작업</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {rates.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="px-3 py-8 text-center text-slate-500">선택된 프로모션의 요금 구간이 없습니다.</td>
                        </tr>
                      ) : rates.map((rate) => (
                        <tr key={rate.id} className="hover:bg-slate-50">
                          <td className="px-3 py-2 font-medium text-slate-700">{rate.schedule_type}</td>
                          <td className="px-3 py-2 text-slate-700">{rate.room_type}</td>
                          <td className="px-3 py-2 text-slate-500">{formatDateRange(rate.checkin_from, rate.checkin_to)}</td>
                          <td className="px-3 py-2 text-right text-slate-700">{formatMoney(rate.price_adult)}</td>
                          <td className="px-3 py-2 text-right text-slate-700">{formatMoney(rate.price_child)}</td>
                          <td className="px-3 py-2 text-right text-slate-700">{formatMoney(rate.price_infant)}</td>
                          <td className="px-3 py-2 text-right text-slate-700">{formatMoney(rate.price_extra_bed)}</td>
                          <td className="px-3 py-2 text-right text-slate-700">{formatMoney(rate.price_single)}</td>
                          <td className="px-3 py-2">
                            <div className="flex justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => editRate(rate)}
                                className="rounded-md border border-slate-300 px-2 py-1 text-slate-700 hover:bg-slate-100"
                              >
                                수정
                              </button>
                              <button
                                type="button"
                                onClick={() => void deleteRate(rate)}
                                className="rounded-md border border-red-200 px-2 py-1 text-red-600 hover:bg-red-50"
                                title="요금 삭제"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          </div>
          ) : (
            <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">프로모션 예약 상세</h2>
                  <p className="mt-1 text-sm text-slate-600">프로모션 적용으로 저장된 예약의 예약일, 예약자, 크루즈, 객실, 체크인 일자를 확인합니다.</p>
                </div>
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-slate-500" />
                  <select
                    value={usageFilterPromotionId}
                    onChange={(event) => setUsageFilterPromotionId(event.target.value)}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="all">전체 프로모션</option>
                    {promotions.map((promotion) => (
                      <option key={promotion.id} value={promotion.id}>{promotion.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="text-xs text-slate-500">
                전체 {usageRows.length.toLocaleString()}건, 필터 결과 {filteredUsageRows.length.toLocaleString()}건, 표시 {visibleUsageRows.length.toLocaleString()}건
                {hiddenPastCount > 0 ? ` (체크인 지난 예약 ${hiddenPastCount.toLocaleString()}건 숨김)` : ''}
              </div>

              {usageLoading ? (
                <div className="rounded-lg border border-slate-200 px-3 py-8 text-center text-slate-500">
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    예약내역을 조회하는 중입니다.
                  </span>
                </div>
              ) : groupedUsageRows.length === 0 ? (
                <div className="rounded-lg border border-slate-200 px-3 py-8 text-center text-slate-500">표시할 프로모션 예약내역이 없습니다.</div>
              ) : (
                <div className="space-y-4">
                  {groupedUsageRows.map((group) => (
                    <div key={group.promotionId} className="rounded-lg border border-slate-200">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
                        <div>
                          <div className="text-sm font-semibold text-slate-800">{group.promotionName}</div>
                          <div className="text-[11px] text-slate-500">{group.promotionCode}</div>
                        </div>
                        <div className="text-xs font-medium text-slate-600">{group.rows.length.toLocaleString()}건</div>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="min-w-[1050px] w-full text-left text-xs">
                          <thead className="bg-white text-slate-600">
                            <tr>
                              <th className="px-3 py-2">예약일</th>
                              <th className="px-3 py-2">예약자</th>
                              <th className="px-3 py-2">크루즈</th>
                              <th className="px-3 py-2">객실</th>
                              <th className="px-3 py-2">체크인</th>
                              <th className="px-3 py-2 text-center">순번</th>
                              <th className="px-3 py-2 text-center">상태</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 bg-white">
                            {group.rows.map((row) => (
                              <tr key={row.usage_id} className="hover:bg-slate-50">
                                <td className="px-3 py-2 text-slate-700">{row.reservation_created_at ? String(row.reservation_created_at).slice(0, 10) : '-'}</td>
                                <td className="px-3 py-2">
                                  <div className="font-medium text-slate-700">{row.user_name}</div>
                                  <div className="text-[11px] text-slate-500">{row.user_email}</div>
                                </td>
                                <td className="px-3 py-2 text-slate-700">{row.cruise_name}</td>
                                <td className="px-3 py-2 text-slate-700">{row.room_type}</td>
                                <td className="px-3 py-2 text-slate-700">{row.checkin || '-'}</td>
                                <td className="px-3 py-2 text-center font-semibold text-slate-700">{row.promotion_sequence ? `${row.promotion_sequence}번` : '-'}</td>
                                <td className="px-3 py-2 text-center">
                                  <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${getPromotionStatusBadge(row.promotion_status)}`}>
                                    {row.promotion_status}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )
        )}
      </div>
    </ManagerLayout>
  );
}
