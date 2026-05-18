'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import ManagerLayout from '@/components/ManagerLayout';
import supabase from '@/lib/supabase';
import { fetchTableInBatches } from '@/lib/fetchInBatches';

type CarRow = {
  reservation_id: string | null;
  vehicle_number: string | null;
  seat_number: string | null;
  pickup_datetime: string | null;
  sht_category: string | null;
};

type StatusRow = {
  pickupDate: string;
  vehicleNumber: string;
  seatCount: number;
  seatList: string[];
  names: string[];
  emails: string[];
  reservationIds: string[];
};

const toKstDateKey = (value: string | Date) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
};

const getKstToday = () => {
  const now = new Date();
  const key = toKstDateKey(now);
  return new Date(`${key}T00:00:00+09:00`);
};

const addDaysKst = (base: Date, days: number) => {
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  return next;
};

const isPickupCategory = (raw: string | null | undefined) => {
  const value = String(raw || '').toLowerCase().replace(/\s+/g, '');
  if (!value) return true;
  if (value.includes('drop') || value.includes('샌딩') || value.includes('sending') || value.includes('send')) {
    return false;
  }
  return true;
};

const splitSeats = (raw: string | null | undefined) => {
  const text = String(raw || '').trim();
  if (!text) return [] as string[];

  if (text.toUpperCase() === 'ALL') {
    return ['ALL_1', 'ALL_2', 'ALL_3', 'ALL_4', 'ALL_5', 'ALL_6', 'ALL_7', 'ALL_8', 'ALL_9', 'ALL_10', 'ALL_11'];
  }

  return text
    .split(/[,/\s]+/)
    .map((seat) => seat.trim().toUpperCase())
    .filter(Boolean);
};

export default function ShtCarReservationStatusPage() {
  const today = useMemo(() => getKstToday(), []);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [startDate, setStartDate] = useState<string>(toKstDateKey(today));
  const [endDate, setEndDate] = useState<string>(toKstDateKey(addDaysKst(today, 30)));
  const [rows, setRows] = useState<StatusRow[]>([]);

  const loadStatus = async () => {
    setLoading(true);
    try {
      const start = new Date(`${startDate}T00:00:00+09:00`);
      const end = new Date(`${endDate}T23:59:59+09:00`);
      const from = start.getTime() <= end.getTime() ? start : end;
      const to = start.getTime() <= end.getTime() ? end : start;

      const { data: carRows, error: carError } = await supabase
        .from('reservation_car_sht')
        .select('reservation_id, vehicle_number, seat_number, pickup_datetime, sht_category')
        .gte('pickup_datetime', from.toISOString())
        .lte('pickup_datetime', to.toISOString())
        .not('vehicle_number', 'is', null)
        .order('pickup_datetime', { ascending: true })
        .order('vehicle_number', { ascending: true });

      if (carError) {
        console.warn('reservation_car_sht 조회 실패:', carError);
        setRows([]);
        return;
      }

      const sourceRows = ((carRows || []) as CarRow[]).filter((row) => isPickupCategory(row.sht_category));
      const vehicleMap = new Map<string, { seatSet: Set<string>; reservationIds: Set<string> }>();

      for (const row of sourceRows) {
        const pickupDate = toKstDateKey(row.pickup_datetime || '');
        const vehicleNumber = String(row.vehicle_number || '').trim();
        if (!pickupDate || !vehicleNumber) continue;

        const key = `${pickupDate}::${vehicleNumber}`;
        const current = vehicleMap.get(key) || { seatSet: new Set<string>(), reservationIds: new Set<string>() };

        splitSeats(row.seat_number).forEach((seat) => current.seatSet.add(seat));
        if (row.reservation_id) current.reservationIds.add(row.reservation_id);

        vehicleMap.set(key, current);
      }

      const reservationIds = Array.from(
        new Set(Array.from(vehicleMap.values()).flatMap((value) => Array.from(value.reservationIds)))
      );

      const reservationRows = reservationIds.length > 0
        ? await fetchTableInBatches<any>('reservation', 're_id', reservationIds, 're_id, re_user_id', 80)
        : [];

      const userIds = Array.from(new Set((reservationRows || []).map((row: any) => row.re_user_id).filter(Boolean)));
      const userRows = userIds.length > 0
        ? await fetchTableInBatches<any>('users', 'id', userIds, 'id, name, email', 80)
        : [];

      const userMap = new Map((userRows || []).map((user: any) => [user.id, {
        name: String(user.name || '').trim(),
        email: String(user.email || '').trim(),
      }]));
      const reservationContactMap = new Map<string, { name: string; email: string }>();
      (reservationRows || []).forEach((row: any) => {
        if (!row.re_id || !row.re_user_id) return;
        const contact = userMap.get(row.re_user_id);
        if (contact) reservationContactMap.set(row.re_id, contact);
      });

      const candidates: StatusRow[] = [];
      for (const [key, value] of vehicleMap.entries()) {
        const [pickupDate, vehicleNumber] = key.split('::');
        const seatList = Array.from(value.seatSet).sort();
        const seatCount = seatList.length;

        if (seatCount <= 0 || seatCount >= 5) continue;

        const contactPairs = Array.from(value.reservationIds)
          .map((reservationId) => reservationContactMap.get(reservationId) || { name: '', email: '' })
          .filter((contact) => contact.name || contact.email)
          .filter((contact, index, list) => {
            const key = `${contact.name}::${contact.email}`;
            return list.findIndex((target) => `${target.name}::${target.email}` === key) === index;
          });

        const names = contactPairs
          .map((contact) => contact.name || '')
          .filter(Boolean)
          .sort();

        const emails = contactPairs
          .map((contact) => contact.email || '')
          .filter(Boolean)
          .sort();

        candidates.push({
          pickupDate,
          vehicleNumber,
          seatCount,
          seatList,
          names,
          emails,
          reservationIds: Array.from(value.reservationIds),
        });
      }

      candidates.sort((a, b) => {
        if (a.pickupDate !== b.pickupDate) return a.pickupDate.localeCompare(b.pickupDate);
        return a.vehicleNumber.localeCompare(b.vehicleNumber);
      });

      setRows(candidates);
    } catch (error) {
      console.error('스차 취소안내 조회 실패:', error);
      setRows([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, [startDate, endDate]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadStatus();
  };

  return (
    <ManagerLayout title="스하차량 취소안내" activeTab="sht-car">
      <div className="space-y-6">
        <div className="bg-white rounded-lg shadow-md p-4">
          <div className="flex items-center gap-2">
            <Link
              href="/manager/sht-car"
              className="px-3 py-1.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 border border-gray-200 whitespace-nowrap"
            >
              예약현황
            </Link>
            <Link
              href="/manager/sht-car/reservation-status"
              className="px-3 py-1.5 rounded-full text-xs font-semibold bg-blue-600 text-white whitespace-nowrap"
            >
              취소안내
            </Link>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600 whitespace-nowrap">시작일</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-2 py-1.5 border border-gray-300 rounded-lg bg-white text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600 whitespace-nowrap">종료일</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-2 py-1.5 border border-gray-300 rounded-lg bg-white text-sm"
              />
            </div>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="ml-auto px-3 py-2 rounded-lg text-sm font-medium bg-indigo-500 text-white hover:bg-indigo-600 disabled:opacity-60 flex items-center gap-1"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              새로고침
            </button>
          </div>

          <div className="p-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
            기준: 예약자 무관, 일별 차량별 좌석이 1~4석인 건만 취소안내로 표시합니다. (0석 제외)
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center items-center h-56">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500" />
          </div>
        ) : rows.length === 0 ? (
          <div className="bg-white rounded-lg shadow-md p-8 text-center text-gray-500 text-sm">
            조건에 맞는 저좌석(1~4석) 차량이 없습니다.
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((row) => {
              const seats = row.seatList.slice(0, 8).join(', ');
              const seatSuffix = row.seatList.length > 8 ? ' 외' : '';
              const names = row.names.slice(0, 5).join(', ');
              const nameSuffix = row.names.length > 5 ? ` 외 ${row.names.length - 5}명` : '';
              const emails = row.emails.slice(0, 5).join(', ');
              const emailSuffix = row.emails.length > 5 ? ` 외 ${row.emails.length - 5}건` : '';
              const notice = `예약자: ${names || '-'}${nameSuffix} | 이메일: ${emails || '-'}${emailSuffix} | 픽업일: ${row.pickupDate} | 차량: ${row.vehicleNumber} | 좌석: ${row.seatCount}석 (${seats}${seatSuffix})`;

              return (
                <div key={`${row.pickupDate}-${row.vehicleNumber}`} className="bg-white rounded-lg shadow-md border border-red-100 p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <div className="text-base font-semibold text-gray-900 truncate">{row.pickupDate} / {row.vehicleNumber}</div>
                      <div className="text-sm text-gray-500">예약좌석 {row.seatCount}석 (5석 미만)</div>
                    </div>
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700 whitespace-nowrap">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      안내 필요
                    </span>
                  </div>

                  <div className="text-sm text-gray-700 space-y-1">
                    <div><span className="font-semibold">좌석:</span> {seats}{seatSuffix}</div>
                    <div><span className="font-semibold">예약자:</span> {names || '-'}{nameSuffix}</div>
                    <div><span className="font-semibold">이메일:</span> {emails || '-'}{emailSuffix}</div>
                    <div className="pt-1 border-t border-gray-100 text-xs text-gray-600 break-words">
                      <span className="font-semibold">안내문:</span> {notice}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </ManagerLayout>
  );
}
