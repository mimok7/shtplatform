'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import supabase from '@/lib/supabase';
import { ArrowLeft, Calendar, CheckSquare, Home, Square } from 'lucide-react';

interface MismatchRow {
  rcc_id: string;
  user_email: string;
  user_name: string;
  checkin: string;
  pickup_datetime: string;
  diff_days: number;
  way_type: string;
}

export default function MobileCruiseCarDatesPage() {
  const [rows, setRows] = useState<MismatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterFuture, setFilterFuture] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const today = new Date().toISOString().slice(0, 10);

  const load = useCallback(async () => {
    setLoading(true);
    setSelected(new Set());
    try {
      const { data: carRows, error: carErr } = await supabase
        .from('reservation_cruise_car')
        .select('id, reservation_id, pickup_datetime, way_type')
        .not('pickup_datetime', 'is', null);

      if (carErr || !carRows?.length) {
        setRows([]);
        return;
      }

      const rccReservationIds = carRows.map((r) => r.reservation_id).filter(Boolean);
      const { data: vehicleResRows } = await supabase
        .from('reservation')
        .select('re_id, re_quote_id, re_user_id')
        .in('re_id', rccReservationIds);

      if (!vehicleResRows?.length) {
        setRows([]);
        return;
      }

      const quoteIds = vehicleResRows.map((r) => r.re_quote_id).filter(Boolean);
      const { data: cruiseResRows } = await supabase
        .from('reservation')
        .select('re_id, re_quote_id')
        .in('re_quote_id', quoteIds)
        .eq('re_type', 'cruise');

      if (!cruiseResRows?.length) {
        setRows([]);
        return;
      }

      const cruiseResIds = cruiseResRows.map((r) => r.re_id).filter(Boolean);
      const { data: cruiseDetailRows } = await supabase
        .from('reservation_cruise')
        .select('reservation_id, checkin')
        .in('reservation_id', cruiseResIds);

      const userIds = vehicleResRows.map((r) => r.re_user_id).filter(Boolean);
      const { data: userRows } = await supabase
        .from('users')
        .select('id, email, name')
        .in('id', userIds);

      const vehicleResByReId = new Map(vehicleResRows.map((r) => [r.re_id, r]));
      const cruiseResByQuoteId = new Map(cruiseResRows.map((r) => [r.re_quote_id, r.re_id]));
      const checkinByReId = new Map((cruiseDetailRows || []).map((r) => [r.reservation_id, r.checkin as string]));
      const userById = new Map((userRows || []).map((u) => [u.id, u]));

      const result: MismatchRow[] = [];
      for (const car of carRows) {
        const vehicleRes = vehicleResByReId.get(car.reservation_id);
        if (!vehicleRes) continue;

        const cruiseResId = cruiseResByQuoteId.get(vehicleRes.re_quote_id);
        if (!cruiseResId) continue;

        const checkin = checkinByReId.get(cruiseResId);
        if (!checkin) continue;

        const pickupDate = String(car.pickup_datetime || '').slice(0, 10);
        const checkinDate = String(checkin || '').slice(0, 10);
        if (!pickupDate || !checkinDate || pickupDate === checkinDate) continue;

        const user = userById.get(vehicleRes.re_user_id);
        const diffMs = new Date(pickupDate).getTime() - new Date(checkinDate).getTime();
        const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

        result.push({
          rcc_id: String(car.id),
          user_email: user?.email || '-',
          user_name: user?.name || '-',
          checkin: checkinDate,
          pickup_datetime: pickupDate,
          diff_days: diffDays,
          way_type: (car.way_type as string) || '-',
        });
      }

      result.sort((a, b) => a.checkin.localeCompare(b.checkin));
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

  const handleSync = async (row: MismatchRow) => {
    setSyncing(row.rcc_id);
    try {
      const { error } = await supabase
        .from('reservation_cruise_car')
        .update({ pickup_datetime: row.checkin })
        .eq('id', row.rcc_id);

      if (error) {
        alert(`수정 실패: ${error.message}`);
        return;
      }
      await load();
    } finally {
      setSyncing(null);
    }
  };

  const handleSyncSelected = async () => {
    const targetRows = displayRows.filter((r) => selected.has(r.rcc_id));
    if (!targetRows.length) return;
    if (!window.confirm(`선택한 ${targetRows.length}건을 체크인 날짜로 수정하시겠습니까?`)) return;

    setSyncingAll(true);
    try {
      for (const row of targetRows) {
        await supabase
          .from('reservation_cruise_car')
          .update({ pickup_datetime: row.checkin })
          .eq('id', row.rcc_id);
      }
      await load();
    } finally {
      setSyncingAll(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b bg-white p-3">
        <Link href="/" className="p-1.5 rounded-lg hover:bg-gray-100" aria-label="뒤로">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </Link>
        <h1 className="text-base font-bold text-gray-800 flex-1 text-center whitespace-nowrap">크차 일자 관리</h1>
        <Link href="/" className="p-1.5 rounded-lg hover:bg-gray-100" aria-label="홈으로">
          <Home className="w-5 h-5 text-gray-600" />
        </Link>
      </header>

      <div className="space-y-2 px-2 py-2">
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs text-slate-600">
              픽업일자 ≠ 체크인 예약 <span className="font-semibold text-slate-800">{displayRows.length}건</span>
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

              {selected.size > 0 && (
                <button
                  type="button"
                  onClick={() => void handleSyncSelected()}
                  disabled={syncingAll}
                  className="rounded-lg bg-orange-500 px-2 py-1 text-xs font-semibold text-white disabled:opacity-60"
                >
                  {syncingAll ? '처리중...' : `선택 동기화 (${selected.size})`}
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
            불일치 데이터가 없습니다
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
                      <div className="text-xs text-slate-500 mt-0.5">{row.user_email}</div>
                      <div className="mt-1 text-[11px] font-semibold text-blue-600">운송 방식: {row.way_type}</div>
                    </div>

                    <button
                      type="button"
                      onClick={() => void handleSync(row)}
                      disabled={syncing === row.rcc_id || syncingAll}
                      className="whitespace-nowrap rounded-lg bg-blue-600 px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-60"
                    >
                      {syncing === row.rcc_id ? '...' : '체크인으로 수정'}
                    </button>
                  </div>

                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg bg-emerald-50 px-2 py-1.5 text-emerald-700">
                      <div className="text-[10px]">체크인</div>
                      <div className="font-semibold whitespace-nowrap">{row.checkin}</div>
                    </div>
                    <div className="rounded-lg bg-rose-50 px-2 py-1.5 text-rose-700">
                      <div className="text-[10px]">픽업일자</div>
                      <div className="font-semibold whitespace-nowrap">{row.pickup_datetime}</div>
                    </div>
                  </div>

                  <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-[11px] text-slate-600">
                    <Calendar className="h-3 w-3" />
                    {row.diff_days > 0 ? `픽업이 +${row.diff_days}일 늦음` : `픽업이 ${Math.abs(row.diff_days)}일 빠름`}
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
