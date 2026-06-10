'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import ManagerLayout from '@/components/ManagerLayout';
import supabase from '@/lib/supabase';
import { LayoutGrid, Table as TableIcon } from 'lucide-react';
import { recordReservationChange } from '@/lib/reservationChangeTracker';

type FixKind =
  | 'set_one_way_pickup'
  | 'move_pickup_to_return_end'
  | 'set_one_way_dropoff'
  | 'set_same_day_roundtrip'
  | 'set_different_day_roundtrip'
  | null;

interface ValidationRow {
  rcc_id: string;
  reservation_id: string;
  user_email: string;
  user_name: string;
  checkin: string;
  cruise_end_date: string;
  schedule: string;
  pickup_datetime: string;
  return_datetime: string;
  way_type: string;
  one_way_direction: string;
  error_type: string;
  error_summary: string;
  error_detail: string;
  fix_kind: FixKind;
  pickup_confirmed_at: string;
  checkin_error: boolean;
  pickup_error: boolean;
  cruise_end_error: boolean;
  return_error: boolean;
}

type ViewMode = 'table' | 'card';
type PageTab = 'issues' | 'completed';

interface CompletedRow {
  request_id: string;
  reservation_id: string;
  user_email: string;
  user_name: string;
  checkin: string;
  schedule: string;
  cruise_end_date: string;
  pickup_datetime: string;
  return_datetime: string;
  way_type: string;
  one_way_direction: string;
  action_type: string;
  manager_note: string;
  submitted_at: string;
  reviewed_at: string;
}

const toDateOnly = (value: any) => String(value || '').slice(0, 10);

const parseDateOnlyAsUtc = (dateStr: string) => {
  const match = String(dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, year, month, day] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
};

const addDays = (dateStr: string, days: number) => {
  if (!dateStr) return '';
  const date = parseDateOnlyAsUtc(dateStr);
  if (Number.isNaN(date.getTime())) return '';
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const getCruiseEndDate = (checkin: string, schedule: string) => {
  const checkinDate = toDateOnly(checkin);
  const raw = String(schedule || '').trim().toUpperCase();
  if (!checkinDate) return '';
  if (!raw || raw === 'DAY') return checkinDate;

  const match = raw.match(/^(\d+)N(\d+)D$/);
  if (match) {
    const nights = Number(match[1]);
    return addDays(checkinDate, Number.isFinite(nights) ? nights : 0);
  }

  return checkinDate;
};

const normalizeWayType = (value: any) => {
  const raw = String(value || '').trim();
  if (raw === '편도') return '편도';
  if (raw === '당일왕복') return '당일왕복';
  if (raw === '다른날왕복') return '다른날왕복';
  return raw || '-';
};

const normalizeDirection = (value: any): '' | 'pickup' | 'dropoff' => {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'pickup') return 'pickup';
  if (raw === 'dropoff') return 'dropoff';
  return '';
};

const getDirectionLabel = (value: string) => {
  if (value === 'pickup') return '픽업';
  if (value === 'dropoff') return '드롭';
  return '-';
};

const getDateTextClass = (role: 'reference' | 'actual', hasError: boolean) => {
  if (!hasError) return 'text-gray-900';
  return role === 'reference' ? 'text-blue-700' : 'text-red-600';
};

const getActionLabel = (value: string) => {
  if (value === 'auto_fix') return '자동수정';
  if (value === 'confirm') return '확인처리';
  return value || '-';
};

const fetchByIdsInChunks = async (
  table: string,
  selectClause: string,
  column: string,
  ids: string[],
  extra?: (query: any) => any
) => {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  if (!uniqueIds.length) return [];

  const chunkSize = 80;
  const results: any[] = [];
  for (let i = 0; i < uniqueIds.length; i += chunkSize) {
    const chunk = uniqueIds.slice(i, i + chunkSize);
    let query = supabase.from(table).select(selectClause).in(column, chunk);
    if (extra) query = extra(query);
    const { data, error } = await query;
    if (error) throw error;
    results.push(...(data || []));
  }
  return results;
};

const buildFixPayload = (row: ValidationRow) => {
  switch (row.fix_kind) {
    case 'set_one_way_pickup':
      return {
        pickup_datetime: row.checkin || null,
        return_datetime: null,
        one_way_direction: 'pickup',
      };
    case 'move_pickup_to_return_end':
      return {
        pickup_datetime: null,
        return_datetime: row.cruise_end_date || row.pickup_datetime || null,
        one_way_direction: 'dropoff',
      };
    case 'set_one_way_dropoff':
      return {
        pickup_datetime: null,
        return_datetime: row.cruise_end_date || null,
        one_way_direction: 'dropoff',
      };
    case 'set_same_day_roundtrip':
      return {
        pickup_datetime: row.checkin || null,
        return_datetime: row.checkin || null,
      };
    case 'set_different_day_roundtrip':
      return {
        pickup_datetime: row.checkin || null,
        return_datetime: row.cruise_end_date || null,
      };
    default:
      return null;
  }
};

const validateCruiseCarRow = (
  car: any,
  checkinDate: string,
  schedule: string,
  user: any
): ValidationRow | null => {
  const wayType = normalizeWayType(car.way_type);
  const direction = normalizeDirection(car.one_way_direction);
  const pickupDate = toDateOnly(car.pickup_datetime);
  const returnDate = toDateOnly(car.return_datetime);
  const cruiseEndDate = getCruiseEndDate(checkinDate, schedule);
  const issues: string[] = [];
  const issueTypes: string[] = [];
  let fixKind: FixKind = null;
  let checkinError = false;
  let pickupError = false;
  let cruiseEndError = false;
  let returnError = false;

  if (!checkinDate) return null;

  if (wayType === '편도') {
    if (!direction) {
      issues.push('편도 방향값이 없습니다');
      issueTypes.push('편도방향누락');
    } else if (direction === 'pickup') {
      if (pickupDate !== checkinDate) {
        issues.push('편도 픽업은 픽업일자가 체크인일자와 같아야 합니다');
        issueTypes.push('편도픽업일불일치');
        checkinError = true;
        pickupError = true;
      }
      if (returnDate) {
        issues.push('편도 픽업은 리턴일자가 비어 있어야 합니다');
        issueTypes.push('편도리턴값존재');
        returnError = true;
      }
      if (issues.length > 0) {
        fixKind = 'set_one_way_pickup';
      }
    } else if (direction === 'dropoff') {
      const actualDropoffDate = returnDate || pickupDate;
      if (actualDropoffDate !== cruiseEndDate) {
        issues.push('편도 드롭은 종료예정일과 같아야 합니다');
        issueTypes.push('편도드롭일불일치');
        cruiseEndError = true;
        if (returnDate) returnError = true;
        else if (pickupDate) pickupError = true;
      }
      if (!returnDate && pickupDate) {
        issues.push('편도 드롭은 리턴일자에 저장되어야 합니다');
        issueTypes.push('편도드롭저장위치오류');
        pickupError = true;
        returnError = true;
      }
      if (issues.length > 0) {
        fixKind = !returnDate && pickupDate && actualDropoffDate === cruiseEndDate
          ? 'move_pickup_to_return_end'
          : 'set_one_way_dropoff';
      }
    }
  } else if (wayType === '당일왕복') {
    if (pickupDate !== checkinDate || returnDate !== checkinDate) {
      issues.push('당일왕복은 체크인일자, 픽업일자, 리턴일자가 모두 같아야 합니다');
      issueTypes.push('당일왕복일자불일치');
      checkinError = true;
      if (pickupDate !== checkinDate) pickupError = true;
      if (returnDate !== checkinDate) returnError = true;
      fixKind = 'set_same_day_roundtrip';
    }
  } else if (wayType === '다른날왕복') {
    const hasManualDirection = !!direction;
    if (!hasManualDirection) {
      if (pickupDate !== checkinDate) {
        issues.push('다른날 왕복 픽업일자는 체크인일자와 같아야 합니다');
        issueTypes.push('다른날왕복픽업일불일치');
        checkinError = true;
        pickupError = true;
      }
      if (returnDate !== cruiseEndDate) {
        issues.push('다른날 왕복 리턴일자는 종료예정일과 같아야 합니다');
        issueTypes.push('다른날왕복리턴일불일치');
        cruiseEndError = true;
        returnError = true;
      }
      if (pickupDate && returnDate && returnDate <= pickupDate) {
        issues.push('다른날 왕복 리턴일자는 픽업일자보다 뒤여야 합니다');
        issueTypes.push('왕복순서오류');
        pickupError = true;
        returnError = true;
      }
      if (issues.length > 0) {
        fixKind = 'set_different_day_roundtrip';
      }
    }
  }

  if (issues.length === 0) return null;

  return {
    rcc_id: String(car.id),
    reservation_id: String(car.reservation_id || ''),
    user_email: user?.email || '-',
    user_name: user?.name || '-',
    checkin: checkinDate,
    cruise_end_date: cruiseEndDate,
    schedule: schedule || '-',
    pickup_datetime: pickupDate || '-',
    return_datetime: returnDate || '-',
    way_type: wayType,
    one_way_direction: direction,
    error_type: issueTypes.join(', '),
    error_summary: issues[0],
    error_detail: issues.join(' / '),
    fix_kind: fixKind,
    pickup_confirmed_at: String(car.pickup_confirmed_at || ''),
    checkin_error: checkinError,
    pickup_error: pickupError,
    cruise_end_error: cruiseEndError,
    return_error: returnError,
  };
};

export default function CruiseCarDatesPage() {
  const router = useRouter();
  const [rows, setRows] = useState<ValidationRow[]>([]);
  const [completedRows, setCompletedRows] = useState<CompletedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterFuture, setFilterFuture] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [pageTab, setPageTab] = useState<PageTab>('issues');
  const [syncing, setSyncing] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const today = new Date().toISOString().slice(0, 10);

  const load = useCallback(async () => {
    setLoading(true);
    setSelected(new Set());
    try {
      const { data: carRows, error: carErr } = await supabase
        .from('reservation_cruise_car')
        .select('id, reservation_id, pickup_datetime, return_datetime, way_type, one_way_direction, pickup_confirmed_at');

      if (carErr || !carRows?.length) {
        setRows([]);
        return;
      }

      const rccReservationIds = carRows.map((r) => r.reservation_id).filter(Boolean);
      const vehicleResRows = await fetchByIdsInChunks(
        'reservation',
        're_id, re_quote_id, re_user_id',
        're_id',
        rccReservationIds
      );

      if (!vehicleResRows?.length) {
        setRows([]);
        return;
      }

      const quoteIds = vehicleResRows.map((r) => r.re_quote_id).filter(Boolean);
      const cruiseResRows = await fetchByIdsInChunks(
        'reservation',
        're_id, re_quote_id',
        're_quote_id',
        quoteIds,
        (query) => query.eq('re_type', 'cruise')
      );

      if (!cruiseResRows?.length) {
        setRows([]);
        return;
      }

      const cruiseResIds = cruiseResRows.map((r) => r.re_id).filter(Boolean);
      const cruiseDetailRows = await fetchByIdsInChunks(
        'reservation_cruise',
        'reservation_id, checkin, room_price_code',
        'reservation_id',
        cruiseResIds
      );

      const roomPriceCodes = cruiseDetailRows.map((r) => String(r.room_price_code || '').trim()).filter(Boolean);
      const roomPriceRows = await fetchByIdsInChunks(
        'cruise_rate_card',
        'id, schedule_type',
        'id',
        roomPriceCodes
      );

      const userIds = vehicleResRows.map((r) => r.re_user_id).filter(Boolean);
      const userRows = await fetchByIdsInChunks(
        'users',
        'id, email, name',
        'id',
        userIds
      );

      const vehicleResByReId = new Map((vehicleResRows as any[]).map((r) => [r.re_id, r]));
      const cruiseResByQuoteId = new Map((cruiseResRows as any[]).map((r) => [r.re_quote_id, r.re_id]));
      const roomPriceById = new Map(
        (roomPriceRows || []).map((r) => [String(r.id || '').trim(), String(r.schedule_type || '')])
      );
      const cruiseInfoByReId = new Map(
        ((cruiseDetailRows || []) as any[]).map((r) => [
          r.reservation_id,
          {
            checkin: toDateOnly(r.checkin),
            schedule: roomPriceById.get(String(r.room_price_code || '').trim()) || '',
          },
        ])
      );
      const userById = new Map(((userRows || []) as any[]).map((u) => [u.id, u]));

      const result: ValidationRow[] = [];
      for (const car of carRows) {
        const vehicleRes = vehicleResByReId.get(car.reservation_id);
        if (!vehicleRes) continue;

        const cruiseResId = cruiseResByQuoteId.get(vehicleRes.re_quote_id);
        if (!cruiseResId) continue;

        const cruiseInfo = cruiseInfoByReId.get(cruiseResId);
        if (!cruiseInfo?.checkin) continue;

        const user = userById.get(vehicleRes.re_user_id);
        const issue = validateCruiseCarRow(car, cruiseInfo.checkin, cruiseInfo.schedule, user);
        if (issue && !issue.pickup_confirmed_at) result.push(issue);
      }

      const { data: completedRequestRows, error: completedRequestError } = await supabase
        .from('reservation_change_request')
        .select('id, reservation_id, re_type, status, manager_note, submitted_at, reviewed_at, snapshot_data')
        .eq('re_type', 'cruise_car')
        .in('status', ['approved', 'applied'])
        .order('submitted_at', { ascending: false });

      if (completedRequestError) {
        throw completedRequestError;
      }

      const filteredCompletedRequests = (completedRequestRows || []).filter(
        (row: any) => row?.snapshot_data?.source === 'manager/cruise-car-dates'
      );

      const completedRequestById = new Map(
        filteredCompletedRequests.map((row: any) => [row.id, row])
      );

      const completedChildRows = filteredCompletedRequests.length
        ? await fetchByIdsInChunks(
            'reservation_change_cruise_car',
            'request_id, reservation_id, pickup_datetime, return_datetime, way_type',
            'request_id',
            filteredCompletedRequests.map((row: any) => row.id)
          )
        : [];

      const completedResult: CompletedRow[] = [];
      for (const item of completedChildRows as any[]) {
        const req = completedRequestById.get(item.request_id);
        if (!req) continue;

        const vehicleRes = vehicleResByReId.get(item.reservation_id);
        if (!vehicleRes) continue;

        const cruiseResId = cruiseResByQuoteId.get(vehicleRes.re_quote_id);
        if (!cruiseResId) continue;

        const cruiseInfo = cruiseInfoByReId.get(cruiseResId);
        if (!cruiseInfo?.checkin) continue;

        const user = userById.get(vehicleRes.re_user_id);
        const snapshotRequestedRow = Array.isArray(req.snapshot_data?.requested)
          ? req.snapshot_data.requested[0]
          : null;
        completedResult.push({
          request_id: String(req.id),
          reservation_id: String(item.reservation_id || ''),
          user_email: user?.email || '-',
          user_name: user?.name || '-',
          checkin: cruiseInfo.checkin || '-',
          schedule: cruiseInfo.schedule || '-',
          cruise_end_date: getCruiseEndDate(cruiseInfo.checkin, cruiseInfo.schedule),
          pickup_datetime: toDateOnly(item.pickup_datetime) || '-',
          return_datetime: toDateOnly(item.return_datetime) || '-',
          way_type: normalizeWayType(item.way_type),
          one_way_direction: normalizeDirection(snapshotRequestedRow?.one_way_direction),
          action_type: String(req.snapshot_data?.action || ''),
          manager_note: String(req.manager_note || ''),
          submitted_at: String(req.submitted_at || ''),
          reviewed_at: String(req.reviewed_at || ''),
        });
      }

      result.sort((a, b) => {
        const dateCompare = a.checkin.localeCompare(b.checkin);
        if (dateCompare !== 0) return dateCompare;
        const pickupCompare = a.pickup_datetime.localeCompare(b.pickup_datetime);
        if (pickupCompare !== 0) return pickupCompare;
        const endCompare = a.cruise_end_date.localeCompare(b.cruise_end_date);
        if (endCompare !== 0) return endCompare;
        const returnCompare = a.return_datetime.localeCompare(b.return_datetime);
        if (returnCompare !== 0) return returnCompare;
        return a.user_name.localeCompare(b.user_name);
      });
      completedResult.sort((a, b) => (b.reviewed_at || b.submitted_at).localeCompare(a.reviewed_at || a.submitted_at));
      setRows(result);
      setCompletedRows(completedResult);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const displayRows = useMemo(
    () => (filterFuture ? rows.filter((r) => r.checkin >= today) : rows),
    [rows, filterFuture, today]
  );
  const displayCompletedRows = useMemo(
    () => (filterFuture ? completedRows.filter((r) => r.checkin >= today) : completedRows),
    [completedRows, filterFuture, today]
  );

  const fixableSelectedCount = displayRows.filter((r) => selected.has(r.rcc_id) && !!r.fix_kind).length;
  const allSelected = displayRows.length > 0 && selected.size === displayRows.length;

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === displayRows.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(displayRows.map((r) => r.rcc_id)));
    }
  };

  const moveToReservationEdit = (reservationId: string) => {
    if (!reservationId) return;
    router.push(`/manager/reservation-edit/vehicle?id=${reservationId}`);
  };

  const applyFix = async (row: ValidationRow) => {
    const payload = buildFixPayload(row);
    if (!payload) {
      alert('이 항목은 자동 수정 대상이 아닙니다.');
      return false;
    }

    const { data: originalRow, error: originalError } = await supabase
      .from('reservation_cruise_car')
      .select('*')
      .eq('id', row.rcc_id)
      .single();

    if (originalError || !originalRow) {
      alert(`원본 조회 실패: ${originalError?.message || '데이터를 찾을 수 없습니다.'}`);
      return false;
    }

    const { error } = await supabase
      .from('reservation_cruise_car')
      .update(payload)
      .eq('id', row.rcc_id);

    if (error) {
      alert(`수정 실패: ${error.message}`);
      return false;
    }

    const requestedRow = { ...originalRow, ...payload };
    const changeResult = await recordReservationChange({
      reservationId: row.reservation_id,
      reType: 'cruise_car',
      status: 'approved',
      managerNote: '크차 일자 화면 자동수정',
      snapshotData: {
        source: 'manager/cruise-car-dates',
        action: 'auto_fix',
        row_id: row.rcc_id,
        original: [originalRow],
        requested: [requestedRow],
      },
      rows: {
        cruise_car: [requestedRow],
      },
    });

    if (changeResult.error || Object.keys(changeResult.childErrors).length > 0) {
      alert('원본 수정은 완료되었지만 reservation_change_cruise_car 기록 저장에 실패했습니다.');
    }

    return true;
  };

  const handleSync = async (row: ValidationRow) => {
    setSyncing(row.rcc_id);
    try {
      const ok = await applyFix(row);
      if (ok) await load();
    } finally {
      setSyncing(null);
    }
  };

  const handleSyncSelected = async () => {
    const targetRows = displayRows.filter((r) => selected.has(r.rcc_id) && !!r.fix_kind);
    if (!targetRows.length) {
      alert('자동 수정 가능한 선택 항목이 없습니다.');
      return;
    }
    if (!confirm(`선택한 ${targetRows.length}건을 기준 일자로 수정하시겠습니까?`)) return;

    setSyncingAll(true);
    try {
      for (const row of targetRows) {
        const ok = await applyFix(row);
        if (!ok) break;
      }
      await load();
    } finally {
      setSyncingAll(false);
    }
  };

  const handleConfirm = async (row: ValidationRow) => {
    setConfirming(row.rcc_id);
    try {
      const confirmedAt = new Date().toISOString();
      const { data: originalRow, error: originalError } = await supabase
        .from('reservation_cruise_car')
        .select('*')
        .eq('id', row.rcc_id)
        .single();

      if (originalError || !originalRow) {
        alert(`원본 조회 실패: ${originalError?.message || '데이터를 찾을 수 없습니다.'}`);
        return;
      }

      const { error } = await supabase
        .from('reservation_cruise_car')
        .update({ pickup_confirmed_at: confirmedAt })
        .eq('id', row.rcc_id);

      if (error) {
        alert(`확인 처리 실패: ${error.message}`);
        return;
      }

      const requestedRow = { ...originalRow, pickup_confirmed_at: confirmedAt };
      const changeResult = await recordReservationChange({
        reservationId: row.reservation_id,
        reType: 'cruise_car',
        status: 'approved',
        managerNote: '크차 일자 화면 확인 처리',
        snapshotData: {
          source: 'manager/cruise-car-dates',
          action: 'confirm',
          row_id: row.rcc_id,
          original: [originalRow],
          requested: [requestedRow],
        },
        rows: {
          cruise_car: [requestedRow],
        },
      });

      if (changeResult.error || Object.keys(changeResult.childErrors).length > 0) {
        alert('확인 처리는 완료되었지만 reservation_change_cruise_car 기록 저장에 실패했습니다.');
      }

      await load();
    } finally {
      setConfirming(null);
    }
  };

  return (
    <ManagerLayout title="크차 일자 오류 수정" activeTab="cruise-car-dates">
      <div className="p-4">
        <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="grid gap-2 xl:flex-1 xl:grid-cols-[1fr_auto_1fr] xl:items-center">
            <div className="flex justify-start">
              <div className="flex overflow-hidden rounded-md border border-gray-300 bg-white">
                <button
                  onClick={() => setPageTab('issues')}
                  className={`px-3 py-1.5 text-xs transition-colors ${
                    pageTab === 'issues' ? 'bg-slate-800 text-white' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  오류 점검 ({displayRows.length}건)
                </button>
                <button
                  onClick={() => setPageTab('completed')}
                  className={`border-l border-gray-300 px-3 py-1.5 text-xs transition-colors ${
                    pageTab === 'completed' ? 'bg-slate-800 text-white' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  수정완료 ({displayCompletedRows.length}건)
                </button>
              </div>
            </div>
            <div className="flex justify-center">
              <div className="flex overflow-hidden rounded-md border border-gray-300 bg-white">
                <button
                  onClick={() => setViewMode('table')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors ${
                    viewMode === 'table'
                      ? 'bg-gray-800 text-white'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <TableIcon className="h-3.5 w-3.5" />
                  테이블
                </button>
                <button
                  onClick={() => setViewMode('card')}
                  className={`flex items-center gap-1.5 border-l border-gray-300 px-3 py-1.5 text-xs transition-colors ${
                    viewMode === 'card'
                      ? 'bg-gray-800 text-white'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                  카드
                </button>
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                onClick={() => setFilterFuture((v) => !v)}
                className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
                  filterFuture
                    ? 'border-blue-500 bg-blue-500 text-white'
                    : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                오늘 이후만
              </button>
              <button
                onClick={() => void load()}
                className="rounded-md border border-gray-300 bg-gray-100 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-200"
              >
                새로고침
              </button>
              {pageTab === 'issues' && fixableSelectedCount > 0 && (
                <button
                  onClick={() => void handleSyncSelected()}
                  disabled={syncingAll}
                  className="rounded-md bg-orange-500 px-3 py-1.5 text-xs text-white hover:bg-orange-600 disabled:opacity-50"
                >
                  {syncingAll ? '처리중...' : `선택 자동수정 (${fixableSelectedCount}건)`}
                </button>
              )}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-500" />
          </div>
        ) : pageTab === 'issues' && displayRows.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-500">
            오류 데이터가 없습니다
          </div>
        ) : pageTab === 'completed' && displayCompletedRows.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-500">
            수정완료 이력이 없습니다
          </div>
        ) : pageTab === 'issues' && viewMode === 'card' ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {displayRows.map((row) => (
              <div
                key={row.rcc_id}
                className={`rounded-xl border bg-white p-4 shadow-sm transition-colors ${
                  selected.has(row.rcc_id) ? 'border-blue-300 ring-2 ring-blue-100' : 'border-gray-200'
                }`}
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">{row.user_name || '-'}</div>
                    <div className="mt-0.5 text-xs text-gray-500">{row.user_email}</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={selected.has(row.rcc_id)}
                    onChange={() => toggleSelect(row.rcc_id)}
                    className="mt-0.5 h-4 w-4"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg bg-sky-50 px-3 py-2">
                    <div className="text-[11px] text-gray-500">일정</div>
                    <div className="mt-1 font-medium text-gray-900">{row.schedule || '-'}</div>
                  </div>
                  <div className="rounded-lg bg-gray-50 px-3 py-2">
                    <div className="text-[11px] text-gray-500">이용유형</div>
                    <div className="mt-1 font-medium text-gray-900">{row.way_type}</div>
                  </div>
                  <div className="rounded-lg bg-green-50 px-3 py-2">
                    <div className="text-[11px] text-gray-500">체크인</div>
                    <div className={`mt-1 font-medium ${getDateTextClass('reference', row.checkin_error)}`}>{row.checkin || '-'}</div>
                  </div>
                  <div className="rounded-lg bg-rose-50 px-3 py-2">
                    <div className="text-[11px] text-gray-500">픽업일자</div>
                    <div className={`mt-1 font-medium ${getDateTextClass('actual', row.pickup_error)}`}>{row.pickup_datetime}</div>
                  </div>
                  <div className="rounded-lg bg-blue-50 px-3 py-2">
                    <div className="text-[11px] text-gray-500">종료예정일</div>
                    <div className={`mt-1 font-medium ${getDateTextClass('reference', row.cruise_end_error)}`}>{row.cruise_end_date || '-'}</div>
                  </div>
                  <div className="rounded-lg bg-orange-50 px-3 py-2">
                    <div className="text-[11px] text-gray-500">리턴일자</div>
                    <div className={`mt-1 font-medium ${getDateTextClass('actual', row.return_error)}`}>{row.return_datetime}</div>
                  </div>
                  <div className="rounded-lg bg-gray-50 px-3 py-2">
                    <div className="text-[11px] text-gray-500">편도방향</div>
                    <div className="mt-1 font-medium text-gray-900">{getDirectionLabel(row.one_way_direction)}</div>
                  </div>
                  <div className="rounded-lg bg-violet-50 px-3 py-2">
                    <div className="text-[11px] text-gray-500">오류유형</div>
                    <div className="mt-1 font-medium text-gray-900">{row.error_type || '-'}</div>
                  </div>
                </div>

                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                  <div className="text-[11px] font-semibold text-amber-800">{row.error_summary}</div>
                  {row.error_detail !== row.error_summary && (
                    <div className="mt-1 whitespace-pre-line text-[11px] text-amber-700">{row.error_detail}</div>
                  )}
                </div>

                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-gray-400">ID: {row.rcc_id.slice(0, 8)}</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => moveToReservationEdit(row.reservation_id)}
                      disabled={confirming === row.rcc_id || syncing === row.rcc_id || syncingAll}
                      className="whitespace-nowrap rounded border border-sky-300 bg-sky-50 px-3 py-1.5 text-xs text-sky-700 hover:bg-sky-100 disabled:opacity-50"
                    >
                      수정
                    </button>
                    <button
                      onClick={() => void handleConfirm(row)}
                      disabled={confirming === row.rcc_id || syncing === row.rcc_id || syncingAll}
                      className="whitespace-nowrap rounded border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      {confirming === row.rcc_id ? '확인중...' : '확인'}
                    </button>
                    {row.fix_kind ? (
                      <button
                        onClick={() => void handleSync(row)}
                        disabled={syncing === row.rcc_id || syncingAll || confirming === row.rcc_id}
                        className="whitespace-nowrap rounded bg-blue-500 px-3 py-1.5 text-xs text-white hover:bg-blue-600 disabled:opacity-50"
                      >
                        {syncing === row.rcc_id ? '처리중...' : '자동수정'}
                      </button>
                    ) : (
                      <span className="text-[11px] text-gray-400">수동 확인</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : pageTab === 'completed' && viewMode === 'card' ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {displayCompletedRows.map((row) => (
              <div key={row.request_id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">{row.user_name || '-'}</div>
                    <div className="mt-0.5 text-xs text-gray-500">{row.user_email}</div>
                  </div>
                  <div className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-medium text-emerald-700">
                    {getActionLabel(row.action_type)}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg bg-sky-50 px-3 py-2">
                    <div className="text-[11px] text-gray-500">일정</div>
                    <div className="mt-1 font-medium text-gray-900">{row.schedule || '-'}</div>
                  </div>
                  <div className="rounded-lg bg-gray-50 px-3 py-2">
                    <div className="text-[11px] text-gray-500">이용유형</div>
                    <div className="mt-1 font-medium text-gray-900">{row.way_type}</div>
                  </div>
                  <div className="rounded-lg bg-green-50 px-3 py-2">
                    <div className="text-[11px] text-gray-500">체크인</div>
                    <div className="mt-1 font-medium text-gray-900">{row.checkin || '-'}</div>
                  </div>
                  <div className="rounded-lg bg-rose-50 px-3 py-2">
                    <div className="text-[11px] text-gray-500">픽업일자</div>
                    <div className="mt-1 font-medium text-gray-900">{row.pickup_datetime}</div>
                  </div>
                  <div className="rounded-lg bg-blue-50 px-3 py-2">
                    <div className="text-[11px] text-gray-500">종료예정일</div>
                    <div className="mt-1 font-medium text-gray-900">{row.cruise_end_date || '-'}</div>
                  </div>
                  <div className="rounded-lg bg-orange-50 px-3 py-2">
                    <div className="text-[11px] text-gray-500">리턴일자</div>
                    <div className="mt-1 font-medium text-gray-900">{row.return_datetime}</div>
                  </div>
                </div>

                <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-[11px] text-gray-600">
                  <div>처리메모: {row.manager_note || '-'}</div>
                  <div className="mt-1">처리시각: {row.reviewed_at ? new Date(row.reviewed_at).toLocaleString('ko-KR') : '-'}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="w-full text-xs">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  {pageTab === 'issues' && (
                  <th className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                      className="h-3.5 w-3.5"
                    />
                  </th>
                  )}
                  <th className="px-3 py-2 text-left font-medium text-gray-600">이름</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">이메일</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">이용유형</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">편도방향</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">일정</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">체크인</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">픽업일자</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">종료예정일</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">리턴일자</th>
                  {pageTab === 'issues' ? (
                    <>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">오류유형</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">오류내용</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">작업</th>
                    </>
                  ) : (
                    <>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">처리구분</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">처리메모</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">처리시각</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {(pageTab === 'issues' ? displayRows : displayCompletedRows).map((row: any) => (
                  <tr
                    key={pageTab === 'issues' ? row.rcc_id : row.request_id}
                    className={`border-b border-gray-100 hover:bg-gray-50 ${
                      pageTab === 'issues' && selected.has(row.rcc_id) ? 'bg-blue-50' : ''
                    }`}
                  >
                    {pageTab === 'issues' && (
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={selected.has(row.rcc_id)}
                        onChange={() => toggleSelect(row.rcc_id)}
                        className="h-3.5 w-3.5"
                      />
                    </td>
                    )}
                    <td className="px-3 py-2 font-semibold text-gray-800">{row.user_name || '-'}</td>
                    <td className="px-3 py-2 text-gray-600">{row.user_email}</td>
                    <td className="px-3 py-2 font-medium text-gray-700">{row.way_type}</td>
                    <td className="px-3 py-2 text-gray-600">{getDirectionLabel(row.one_way_direction)}</td>
                    <td className="px-3 py-2 text-gray-900">{row.schedule || '-'}</td>
                    <td className={`px-3 py-2 font-medium ${getDateTextClass('reference', row.checkin_error)}`}>{row.checkin || '-'}</td>
                    <td className={`px-3 py-2 font-medium ${getDateTextClass('actual', row.pickup_error)}`}>{row.pickup_datetime}</td>
                    <td className={`px-3 py-2 font-medium ${pageTab === 'issues' ? getDateTextClass('reference', row.cruise_end_error) : 'text-gray-900'}`}>{row.cruise_end_date || '-'}</td>
                    <td className={`px-3 py-2 font-medium ${pageTab === 'issues' ? getDateTextClass('actual', row.return_error) : 'text-gray-900'}`}>{row.return_datetime}</td>
                    {pageTab === 'issues' ? (
                      <>
                        <td className="px-3 py-2 text-[11px] text-violet-700">{row.error_type || '-'}</td>
                        <td className="px-3 py-2 text-gray-500">
                          <div>{row.error_summary}</div>
                          {row.error_detail !== row.error_summary && (
                            <div className="mt-0.5 whitespace-pre-line text-[11px] text-gray-400">{row.error_detail}</div>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => moveToReservationEdit(row.reservation_id)}
                              disabled={confirming === row.rcc_id || syncing === row.rcc_id || syncingAll}
                              className="whitespace-nowrap rounded border border-sky-300 bg-sky-50 px-2 py-1 text-xs text-sky-700 hover:bg-sky-100 disabled:opacity-50"
                            >
                              수정
                            </button>
                            <button
                              onClick={() => void handleConfirm(row)}
                              disabled={confirming === row.rcc_id || syncing === row.rcc_id || syncingAll}
                              className="whitespace-nowrap rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                            >
                              {confirming === row.rcc_id ? '...' : '확인'}
                            </button>
                            {row.fix_kind ? (
                              <button
                                onClick={() => void handleSync(row)}
                                disabled={syncing === row.rcc_id || syncingAll || confirming === row.rcc_id}
                                className="whitespace-nowrap rounded bg-blue-500 px-2 py-1 text-xs text-white hover:bg-blue-600 disabled:opacity-50"
                              >
                                {syncing === row.rcc_id ? '...' : '자동수정'}
                              </button>
                            ) : (
                              <span className="text-[11px] text-gray-400">수동 확인</span>
                            )}
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-2 text-gray-700">{getActionLabel(row.action_type)}</td>
                        <td className="px-3 py-2 text-gray-600">{row.manager_note || '-'}</td>
                        <td className="px-3 py-2 text-gray-600">
                          {row.reviewed_at ? new Date(row.reviewed_at).toLocaleString('ko-KR') : '-'}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </ManagerLayout>
  );
}
