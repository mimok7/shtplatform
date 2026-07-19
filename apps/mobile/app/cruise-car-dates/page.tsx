'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import supabase from '@/lib/supabase';
import { ArrowLeft, Calendar, CheckSquare, Home, Square } from 'lucide-react';
import { getKstTodayDateKey } from '@/lib/dateKst';

type FixKind =
  | 'set_one_way_pickup'
  | 'move_pickup_to_return_end'
  | 'set_one_way_dropoff'
  | 'set_same_day_roundtrip'
  | 'set_different_day_roundtrip'
  | null;

interface ValidationRow {
  rcc_id: string;
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
}

const toDateOnly = (value: any) => String(value || '').slice(0, 10);

const addDays = (dateStr: string, days: number) => {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  if (Number.isNaN(date.getTime())) return '';
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

  if (!checkinDate) return null;

  if (wayType === '편도') {
    if (!direction) {
      issues.push('편도 방향값이 없습니다');
      issueTypes.push('편도방향누락');
    } else if (direction === 'pickup') {
      if (pickupDate !== checkinDate) {
        issues.push('편도 픽업은 픽업일자가 체크인일자와 같아야 합니다');
        issueTypes.push('편도픽업일불일치');
      }
      if (returnDate) {
        issues.push('편도 픽업은 리턴일자가 비어 있어야 합니다');
        issueTypes.push('편도리턴값존재');
      }
      if (issues.length > 0) {
        fixKind = 'set_one_way_pickup';
      }
    } else if (direction === 'dropoff') {
      const actualDropoffDate = returnDate || pickupDate;
      if (actualDropoffDate !== cruiseEndDate) {
        issues.push('편도 드롭은 종료예정일과 같아야 합니다');
        issueTypes.push('편도드롭일불일치');
      }
      if (!returnDate && pickupDate) {
        issues.push('편도 드롭은 리턴일자에 저장되어야 합니다');
        issueTypes.push('편도드롭저장위치오류');
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
      fixKind = 'set_same_day_roundtrip';
    }
  } else if (wayType === '다른날왕복') {
    if (pickupDate !== checkinDate) {
      issues.push('다른날 왕복 픽업일자는 체크인일자와 같아야 합니다');
      issueTypes.push('다른날왕복픽업일불일치');
    }
    if (returnDate !== cruiseEndDate) {
      issues.push('다른날 왕복 리턴일자는 종료예정일과 같아야 합니다');
      issueTypes.push('다른날왕복리턴일불일치');
    }
    if (pickupDate && returnDate && returnDate <= pickupDate) {
      issues.push('다른날 왕복 리턴일자는 픽업일자보다 뒤여야 합니다');
      issueTypes.push('왕복순서오류');
    }
    if (issues.length > 0) {
      fixKind = 'set_different_day_roundtrip';
    }
  }

  if (issues.length === 0) return null;

  return {
    rcc_id: String(car.id),
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
  };
};

export default function MobileCruiseCarDatesPage() {
  const [rows, setRows] = useState<ValidationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterFuture, setFilterFuture] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const today = getKstTodayDateKey();

  const load = useCallback(async () => {
    setLoading(true);
    setSelected(new Set());
    try {
      const { data: carRows, error: carErr } = await supabase
        .from('reservation_cruise_car')
        .select('id, reservation_id, pickup_datetime, return_datetime, way_type, one_way_direction');

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

      const vehicleResByReId = new Map(vehicleResRows.map((r) => [r.re_id, r]));
      const cruiseResByQuoteId = new Map(cruiseResRows.map((r) => [r.re_quote_id, r.re_id]));
      const roomPriceById = new Map(
        (roomPriceRows || []).map((r) => [String(r.id || '').trim(), String(r.schedule_type || '')])
      );
      const cruiseInfoByReId = new Map(
        (cruiseDetailRows || []).map((r) => [
          r.reservation_id,
          {
            checkin: toDateOnly(r.checkin),
            schedule: roomPriceById.get(String(r.room_price_code || '').trim()) || '',
          },
        ])
      );
      const userById = new Map((userRows || []).map((u) => [u.id, u]));

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
        if (issue) result.push(issue);
      }

      result.sort((a, b) => {
        const dateCompare = a.checkin.localeCompare(b.checkin);
        if (dateCompare !== 0) return dateCompare;
        return a.user_name.localeCompare(b.user_name);
      });
      setRows(result);
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
    if (allSelected) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(displayRows.map((r) => r.rcc_id)));
  };

  const applyFix = async (row: ValidationRow) => {
    const payload = buildFixPayload(row);
    if (!payload) {
      alert('이 항목은 자동 수정 대상이 아닙니다.');
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
    if (!window.confirm(`선택한 ${targetRows.length}건을 기준 일자로 수정하시겠습니까?`)) return;

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

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b bg-white p-3">
        <Link href="/" className="rounded-lg p-1.5 hover:bg-gray-100" aria-label="뒤로">
          <ArrowLeft className="h-5 w-5 text-gray-600" />
        </Link>
        <h1 className="flex-1 text-center text-base font-bold whitespace-nowrap text-gray-800">크차 일자 관리</h1>
        <Link href="/" className="rounded-lg p-1.5 hover:bg-gray-100" aria-label="홈으로">
          <Home className="h-5 w-5 text-gray-600" />
        </Link>
      </header>

      <div className="space-y-2 px-2 py-2">
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs text-slate-600">
              오류 데이터 <span className="font-semibold text-slate-800">{displayRows.length}건</span>
            </div>
            <button
              type="button"
              onClick={() => setFilterFuture((v) => !v)}
              className={`rounded-lg px-2 py-1 text-xs font-medium ${
                filterFuture ? 'bg-blue-600 text-white' : 'border border-slate-300 bg-white text-slate-700'
              }`}
            >
              오늘 이후만
            </button>
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            편도 방향값, 당일왕복 일치, 다른날왕복 일정, 리턴&gt;픽업 기준
          </div>

          {displayRows.length > 0 && (
            <div className="mt-2 flex items-center justify-between">
              <button
                type="button"
                onClick={toggleSelectAll}
                className="inline-flex items-center gap-1 text-xs text-slate-700"
              >
                {allSelected ? <CheckSquare className="h-4 w-4 text-blue-600" /> : <Square className="h-4 w-4 text-slate-500" />}
                전체 선택
              </button>

              {fixableSelectedCount > 0 && (
                <button
                  type="button"
                  onClick={() => void handleSyncSelected()}
                  disabled={syncingAll}
                  className="rounded-lg bg-orange-500 px-2 py-1 text-xs font-semibold text-white disabled:opacity-60"
                >
                  {syncingAll ? '처리중...' : `선택 자동수정 (${fixableSelectedCount})`}
                </button>
              )}
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-10">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-500" />
          </div>
        ) : displayRows.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white py-10 text-center text-sm text-slate-500">
            오류 데이터가 없습니다
          </div>
        ) : (
          <div className="space-y-2">
            {displayRows.map((row) => {
              const selectedRow = selected.has(row.rcc_id);
              return (
                <div
                  key={row.rcc_id}
                  className={`rounded-xl border bg-white p-3 ${selectedRow ? 'border-blue-300' : 'border-slate-200'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => toggleSelect(row.rcc_id)}
                      className="mt-0.5 rounded p-0.5"
                      aria-label="행 선택"
                    >
                      {selectedRow ? <CheckSquare className="h-4 w-4 text-blue-600" /> : <Square className="h-4 w-4 text-slate-500" />}
                    </button>

                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold text-slate-900">{row.user_name || '-'}</div>
                      <div className="mt-0.5 text-xs text-slate-500">{row.user_email}</div>
                      <div className="mt-1 text-[11px] font-semibold text-blue-600">
                        이용유형: {row.way_type} / 편도방향: {getDirectionLabel(row.one_way_direction)}
                      </div>
                      <div className="mt-1 text-[11px] font-semibold text-violet-700">오류유형: {row.error_type || '-'}</div>
                      <div className="mt-1 text-[11px] text-rose-600">{row.error_detail}</div>
                    </div>

                    {row.fix_kind ? (
                      <button
                        type="button"
                        onClick={() => void handleSync(row)}
                        disabled={syncing === row.rcc_id || syncingAll}
                        className="whitespace-nowrap rounded-lg bg-blue-600 px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-60"
                      >
                        {syncing === row.rcc_id ? '...' : '자동수정'}
                      </button>
                    ) : (
                      <span className="whitespace-nowrap text-[11px] text-slate-400">수동 확인</span>
                    )}
                  </div>

                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg bg-emerald-50 px-2 py-1.5 text-emerald-700">
                      <div className="text-[10px]">체크인</div>
                      <div className="font-semibold whitespace-nowrap">{row.checkin}</div>
                    </div>
                    <div className="rounded-lg bg-sky-50 px-2 py-1.5 text-sky-700">
                      <div className="text-[10px]">종료예정일</div>
                      <div className="font-semibold whitespace-nowrap">{row.cruise_end_date || '-'}</div>
                    </div>
                    <div className="rounded-lg bg-rose-50 px-2 py-1.5 text-rose-700">
                      <div className="text-[10px]">픽업일자</div>
                      <div className="font-semibold whitespace-nowrap">{row.pickup_datetime}</div>
                    </div>
                    <div className="rounded-lg bg-orange-50 px-2 py-1.5 text-orange-700">
                      <div className="text-[10px]">리턴일자</div>
                      <div className="font-semibold whitespace-nowrap">{row.return_datetime}</div>
                    </div>
                  </div>

                  <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-[11px] text-slate-600">
                    <Calendar className="h-3 w-3" />
                    일정: {row.schedule || '-'}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
