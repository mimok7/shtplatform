'use client';

import React, { useState, useEffect, useCallback } from 'react';
import ManagerLayout from '@/components/ManagerLayout';
import supabase from '@/lib/supabase';

interface MismatchRow {
  rcc_id: string;
  re_id: string;
  user_email: string;
  user_name: string;
  checkin: string;
  pickup_datetime: string;
  diff_days: number;
}

export default function CruiseCarDatesPage() {
  const [rows, setRows] = useState<MismatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterFuture, setFilterFuture] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const today = new Date().toISOString().slice(0, 10);

  const load = useCallback(async () => {
    setLoading(true);
    setSelected(new Set());
    try {
      // Step 1: reservation_cruise_car 전체 조회
      const { data: carRows, error: carErr } = await supabase
        .from('reservation_cruise_car')
        .select('id, reservation_id, pickup_datetime')
        .not('pickup_datetime', 'is', null);

      if (carErr || !carRows?.length) {
        setRows([]);
        return;
      }

      // Step 2: 차량 예약 (reservation) 조회
      const rccReservationIds = carRows.map((r) => r.reservation_id).filter(Boolean);
      const { data: vehicleResRows } = await supabase
        .from('reservation')
        .select('re_id, re_quote_id, re_user_id')
        .in('re_id', rccReservationIds);

      if (!vehicleResRows?.length) {
        setRows([]);
        return;
      }

      // Step 3: 같은 quote의 크루즈 예약 조회
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

      // Step 4: reservation_cruise checkin 조회
      const cruiseResIds = cruiseResRows.map((r) => r.re_id).filter(Boolean);
      const { data: cruiseDetailRows } = await supabase
        .from('reservation_cruise')
        .select('reservation_id, checkin')
        .in('reservation_id', cruiseResIds);

      // Step 5: 사용자 정보 조회
      const userIds = vehicleResRows.map((r) => r.re_user_id).filter(Boolean);
      const { data: userRows } = await supabase
        .from('users')
        .select('id, email, name')
        .in('id', userIds);

      // 룩업 맵 구성
      const vehicleResByReId = new Map((vehicleResRows as any[]).map((r) => [r.re_id, r]));
      const cruiseResByQuoteId = new Map((cruiseResRows as any[]).map((r) => [r.re_quote_id, r.re_id]));
      const checkinByReId = new Map(((cruiseDetailRows || []) as any[]).map((r) => [r.reservation_id, r.checkin as string]));
      const userById = new Map(((userRows || []) as any[]).map((u) => [u.id, u]));

      // 불일치 목록 구성
      const result: MismatchRow[] = [];
      for (const car of carRows) {
        const vehicleRes = vehicleResByReId.get(car.reservation_id);
        if (!vehicleRes) continue;

        const cruiseResId = cruiseResByQuoteId.get(vehicleRes.re_quote_id);
        if (!cruiseResId) continue;

        const checkin = checkinByReId.get(cruiseResId);
        if (!checkin) continue;

        const pickupDate = (car.pickup_datetime as string)?.slice(0, 10) || '';
        const checkinDate = (checkin as string)?.slice(0, 10) || '';

        if (pickupDate === checkinDate) continue; // 동일 → 스킵

        const user = userById.get(vehicleRes.re_user_id);
        const diffMs = new Date(pickupDate).getTime() - new Date(checkinDate).getTime();
        const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

        result.push({
          rcc_id: car.id as string,
          re_id: vehicleRes.re_id as string,
          user_email: user?.email || '-',
          user_name: user?.name || '-',
          checkin: checkinDate,
          pickup_datetime: pickupDate,
          diff_days: diffDays,
        });
      }

      // 체크인 날짜 오름차순 정렬
      result.sort((a, b) => a.checkin.localeCompare(b.checkin));
      setRows(result);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const displayRows = filterFuture ? rows.filter((r) => r.checkin >= today) : rows;

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

  const handleSync = async (row: MismatchRow) => {
    setSyncing(row.rcc_id);
    try {
      const { error } = await supabase
        .from('reservation_cruise_car')
        .update({ pickup_datetime: row.checkin })
        .eq('id', row.rcc_id);
      if (error) {
        alert('수정 실패: ' + error.message);
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
    if (!confirm(`선택한 ${targetRows.length}건을 체크인 날짜로 수정하시겠습니까?`)) return;
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

  const allSelected = displayRows.length > 0 && selected.size === displayRows.length;

  return (
    <ManagerLayout title="크차 일자" activeTab="cruise-car-dates">
      <div className="p-4">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-lg font-bold text-gray-800">크차 일자 관리</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              픽업일자 ≠ 체크인인 예약 목록 ({displayRows.length}건)
            </p>
          </div>
          <div className="flex gap-2 flex-wrap justify-end">
            <button
              onClick={() => setFilterFuture((v) => !v)}
              className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${filterFuture
                  ? 'bg-blue-500 text-white border-blue-500'
                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                }`}
            >
              오늘 이후만
            </button>
            <button
              onClick={load}
              className="px-3 py-1.5 text-xs rounded-md bg-gray-100 text-gray-600 border border-gray-300 hover:bg-gray-200"
            >
              새로고침
            </button>
            {selected.size > 0 && (
              <button
                onClick={handleSyncSelected}
                disabled={syncingAll}
                className="px-3 py-1.5 text-xs rounded-md bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50"
              >
                {syncingAll ? '처리중...' : `선택 동기화 (${selected.size}건)`}
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
          </div>
        ) : displayRows.length === 0 ? (
          <div className="text-center py-12 text-gray-500 text-sm">
            불일치 데이터가 없습니다 🎉
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                      className="w-3.5 h-3.5"
                    />
                  </th>
                  <th className="px-3 py-2 text-left text-gray-600 font-medium">예약자 이메일</th>
                  <th className="px-3 py-2 text-left text-gray-600 font-medium">예약 ID</th>
                  <th className="px-3 py-2 text-left text-gray-600 font-medium">체크인</th>
                  <th className="px-3 py-2 text-left text-gray-600 font-medium">픽업일자</th>
                  <th className="px-3 py-2 text-left text-gray-600 font-medium">비고</th>
                  <th className="px-3 py-2 text-left text-gray-600 font-medium">수정</th>
                </tr>
              </thead>
              <tbody>
                {displayRows.map((row) => (
                  <tr
                    key={row.rcc_id}
                    className={`border-b border-gray-100 hover:bg-gray-50 ${selected.has(row.rcc_id) ? 'bg-blue-50' : ''
                      }`}
                  >
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={selected.has(row.rcc_id)}
                        onChange={() => toggleSelect(row.rcc_id)}
                        className="w-3.5 h-3.5"
                      />
                    </td>
                    <td className="px-3 py-2 text-gray-700">
                      {row.user_email}
                      {row.user_name && row.user_name !== '-' && (
                        <span className="ml-1 text-gray-400">({row.user_name})</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-500 font-mono">
                      {row.re_id.slice(0, 8)}...
                    </td>
                    <td className="px-3 py-2 text-green-700 font-medium">{row.checkin}</td>
                    <td className="px-3 py-2 text-red-600 font-medium">{row.pickup_datetime}</td>
                    <td className="px-3 py-2 text-gray-500">
                      {row.diff_days > 0
                        ? `픽업이 +${row.diff_days}일 늦음`
                        : `픽업이 ${Math.abs(row.diff_days)}일 빠름`}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => handleSync(row)}
                        disabled={syncing === row.rcc_id || syncingAll}
                        className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 whitespace-nowrap"
                      >
                        {syncing === row.rcc_id ? '...' : '체크인으로 수정'}
                      </button>
                    </td>
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
