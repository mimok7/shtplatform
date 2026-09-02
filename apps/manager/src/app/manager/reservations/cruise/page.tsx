'use client';

import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { ArrowDown, ArrowUp, ArrowUpDown, Download, Filter, RefreshCw, Ship } from 'lucide-react';
import ManagerLayout from '@/components/ManagerLayout';
import supabase from '@/lib/supabase';
import { fetchTableInBatches } from '@/lib/fetchInBatches';

type DataScope = 'upcoming' | 'all';
type SortKey = 'reservationDate' | 'usageDate' | 'cruiseName' | 'roomName' | 'customerName' | 'status' | 'guestCount' | 'roomTotalPrice' | 'boardingCode';
type SortDirection = 'asc' | 'desc';

interface CruiseReservationRow {
  id: string;
  reservationId: string;
  reservationDate: string;
  createdAt: string;
  usageDate: string;
  cruiseName: string;
  roomName: string;
  scheduleType: string;
  customerName: string;
  customerEmail: string;
  status: string;
  guestCount: number;
  adultCount: number;
  childCount: number;
  infantCount: number;
  roomCount: number;
  roomTotalPrice: number;
  boardingCode: string;
  requestNote: string;
}

const PAGE_SIZE = 500;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID_PATTERN.test(value);

const dateKeyInKorea = (value?: string | null) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value).slice(0, 10);
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(parsed);
};

const dateLabel = (value?: string | null) => {
  const dateKey = value ? String(value).slice(0, 10) : '';
  if (!dateKey) return '-';
  const [year, month, day] = dateKey.split('-');
  return year && month && day ? `${year}.${month}.${day}` : dateKey;
};

const statusLabel = (status?: string | null) => ({
  pending: '대기', approved: '승인', confirmed: '확정', completed: '완료', cancelled: '취소',
}[String(status || '').toLowerCase()] || status || '-');

function SortHeader({ label, column, activeColumn, direction, onSort, align = 'left' }: {
  label: string;
  column: SortKey;
  activeColumn: SortKey;
  direction: SortDirection;
  onSort: (column: SortKey) => void;
  align?: 'left' | 'center' | 'right';
}) {
  const Icon = activeColumn !== column ? ArrowUpDown : direction === 'asc' ? ArrowUp : ArrowDown;
  const alignClass = align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start';
  return <th className={`whitespace-nowrap border-b px-4 py-3 text-${align} font-semibold`}><button type="button" onClick={() => onSort(column)} className={`inline-flex w-full items-center gap-1 hover:text-sky-800 ${alignClass}`} aria-label={`${label} ${activeColumn === column && direction === 'asc' ? '오름차순' : activeColumn === column ? '내림차순' : '정렬'}으로 정렬`}><span>{label}</span><Icon className={`h-3.5 w-3.5 ${activeColumn === column ? 'text-sky-700' : 'text-gray-400'}`} /></button></th>;
}

async function fetchCruiseReservations({ scope, usageStartDate, usageEndDate }: { scope: DataScope; usageStartDate: string; usageEndDate: string }) {
  const rows: any[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = supabase
      .from('reservation_cruise')
      .select('id, reservation_id, room_price_code, checkin, guest_count, adult_count, child_count, infant_count, room_count, room_total_price, boarding_code, request_note, created_at')
      .order('created_at', { ascending: false });
    if (scope === 'upcoming') query = query.gte('checkin', usageStartDate || dateKeyInKorea(new Date().toISOString()));
    else if (usageStartDate) query = query.gte('checkin', usageStartDate);
    if (usageEndDate) query = query.lte('checkin', usageEndDate);
    const { data, error } = await query.range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = data || [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

export default function CruiseReservationsPage() {
  const [rows, setRows] = useState<CruiseReservationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dataScope, setDataScope] = useState<DataScope>('upcoming');
  const [usageStartDate, setUsageStartDate] = useState(() => dateKeyInKorea(new Date().toISOString()));
  const [usageEndDate, setUsageEndDate] = useState('');
  const [reservationDate, setReservationDate] = useState('');
  const [usageDate, setUsageDate] = useState('');
  const [cruiseName, setCruiseName] = useState('');
  const [roomName, setRoomName] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('reservationDate');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const loadReservations = async () => {
    setLoading(true);
    setError(null);
    try {
      if (usageStartDate && usageEndDate && usageStartDate > usageEndDate) throw new Error('기간의 시작일은 종료일보다 늦을 수 없습니다.');
      const cruiseRows = await fetchCruiseReservations({ scope: dataScope, usageStartDate, usageEndDate });
      const reservationIds = Array.from(new Set(cruiseRows.map((row) => row.reservation_id).filter(Boolean)));
      const reservations = await fetchTableInBatches<any>(
        'reservation', 're_id', reservationIds, 're_id, re_created_at, re_user_id, re_status', 100,
      );
      const reservationById = new Map(reservations.map((row) => [row.re_id, row]));
      const userIds = Array.from(new Set(reservations.map((row) => row.re_user_id).filter(Boolean)));
      const users = await fetchTableInBatches<any>('users', 'id', userIds, 'id, name, email', 100);
      const userById = new Map(users.map((row) => [row.id, row]));
      // db.csv 관계: reservation_cruise.room_price_code(text) → cruise_rate_card.id(uuid).
      // 레거시 비 UUID 코드를 UUID IN 조회에 포함하면 해당 배치 전체가 Postgres 형식 오류로 실패한다.
      const roomPriceCodes = Array.from(new Set(cruiseRows.map((row) => row.room_price_code).filter(isUuid)));
      const rateCards = await fetchTableInBatches<any>(
        'cruise_rate_card', 'id', roomPriceCodes, 'id, cruise_name, room_type, schedule_type', 100,
      );
      const rateCardById = new Map(rateCards.map((row) => [row.id, row]));

      setRows(cruiseRows.map((row) => {
        const reservation = reservationById.get(row.reservation_id);
        const user = reservation ? userById.get(reservation.re_user_id) : null;
        const rateCard = rateCardById.get(row.room_price_code);
        return {
          id: row.id,
          reservationId: row.reservation_id,
          reservationDate: reservation?.re_created_at || row.created_at || '',
          createdAt: row.created_at || '',
          usageDate: row.checkin || '',
          cruiseName: rateCard?.cruise_name || '미등록 크루즈',
          roomName: rateCard?.room_type || '미등록 객실',
          scheduleType: rateCard?.schedule_type || '',
          customerName: user?.name || '-',
          customerEmail: user?.email || '-',
          status: reservation?.re_status || '-',
          guestCount: Number(row.guest_count || 0),
          adultCount: Number(row.adult_count || 0),
          childCount: Number(row.child_count || 0),
          infantCount: Number(row.infant_count || 0),
          roomCount: Number(row.room_count || 0),
          roomTotalPrice: Number(row.room_total_price || 0),
          boardingCode: row.boarding_code || '',
          requestNote: row.request_note || '',
        };
      }));
    } catch (loadError) {
      console.error('크루즈 예약 조회 실패:', loadError);
      setRows([]);
      setError(loadError instanceof Error ? loadError.message : '크루즈 예약 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadReservations(); }, []);

  const cruiseOptions = useMemo(() => Array.from(new Set(rows.map((row) => row.cruiseName))).sort((a, b) => a.localeCompare(b, 'ko')), [rows]);
  const roomOptions = useMemo(() => Array.from(new Set(rows.map((row) => row.roomName))).sort((a, b) => a.localeCompare(b, 'ko')), [rows]);

  const filteredRows = useMemo(() => {
    const matched = rows.filter((row) => (
      (!reservationDate || dateKeyInKorea(row.reservationDate) === reservationDate)
      && (!usageDate || row.usageDate === usageDate)
      && (!cruiseName || row.cruiseName === cruiseName)
      && (!roomName || row.roomName === roomName)
    ));
    return [...matched].sort((left, right) => {
      const leftValue = sortKey === 'reservationDate' ? left.reservationDate
        : sortKey === 'usageDate' ? left.usageDate
          : sortKey === 'cruiseName' ? left.cruiseName
          : sortKey === 'roomName' ? left.roomName
            : sortKey === 'customerName' ? left.customerName
              : sortKey === 'status' ? left.status
                : sortKey === 'guestCount' ? left.guestCount
                  : sortKey === 'roomTotalPrice' ? left.roomTotalPrice : left.boardingCode;
      const rightValue = sortKey === 'reservationDate' ? right.reservationDate
        : sortKey === 'usageDate' ? right.usageDate
          : sortKey === 'cruiseName' ? right.cruiseName
            : sortKey === 'roomName' ? right.roomName
              : sortKey === 'customerName' ? right.customerName
                : sortKey === 'status' ? right.status
                  : sortKey === 'guestCount' ? right.guestCount
                    : sortKey === 'roomTotalPrice' ? right.roomTotalPrice : right.boardingCode;
      const compared = typeof leftValue === 'number' && typeof rightValue === 'number'
        ? leftValue - rightValue
        : String(leftValue || '').localeCompare(String(rightValue || ''), 'ko', { numeric: true });
      return sortDirection === 'asc' ? compared : -compared;
    });
  }, [rows, reservationDate, usageDate, cruiseName, roomName, sortKey, sortDirection]);

  const resetFilters = () => {
    setReservationDate('');
    setUsageDate('');
    setCruiseName('');
    setRoomName('');
    setSortKey('reservationDate');
    setSortDirection('desc');
  };

  const handleColumnSort = (column: SortKey) => {
    if (sortKey === column) setSortDirection((current) => current === 'asc' ? 'desc' : 'asc');
    else {
      setSortKey(column);
      setSortDirection(column === 'reservationDate' || column === 'usageDate' ? 'desc' : 'asc');
    }
  };

  const handleScopeChange = (scope: DataScope) => {
    setDataScope(scope);
    if (scope === 'upcoming') {
      setUsageStartDate(dateKeyInKorea(new Date().toISOString()));
      setUsageEndDate('');
    } else {
      setUsageStartDate('');
      setUsageEndDate('');
    }
  };

  const downloadExcel = () => {
    const exportRows = filteredRows.map((row) => ({
      '예약일': dateLabel(dateKeyInKorea(row.reservationDate)),
      '사용일(체크인)': dateLabel(row.usageDate),
      '크루즈': row.cruiseName,
      '객실명': row.roomName,
      '일정': row.scheduleType || '-',
      '고객명': row.customerName,
      '이메일': row.customerEmail,
      '예약 상태': statusLabel(row.status),
      '인원': row.guestCount,
      '성인': row.adultCount,
      '아동': row.childCount,
      '유아': row.infantCount,
      '객실 수': row.roomCount,
      '객실 총액(VND)': row.roomTotalPrice,
      '승선 코드': row.boardingCode || '-',
      '요청사항': row.requestNote || '-',
      '예약 ID': row.reservationId,
    }));
    const sheet = XLSX.utils.json_to_sheet(exportRows);
    sheet['!cols'] = [
      { wch: 13 }, { wch: 16 }, { wch: 24 }, { wch: 28 }, { wch: 12 }, { wch: 14 }, { wch: 28 },
      { wch: 12 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 18 }, { wch: 16 }, { wch: 36 }, { wch: 38 },
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, '크루즈 예약');
    XLSX.writeFile(workbook, `크루즈-예약조회-${dateKeyInKorea(new Date().toISOString())}.xlsx`, { bookType: 'xlsx' });
  };

  return (
    <ManagerLayout title="크루즈 조회" activeTab="reservations-cruise">
      <div className="mx-auto max-w-[1600px] space-y-4">
        <section className="border border-sky-100 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-sky-100 bg-sky-50 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-2"><Ship className="h-5 w-5 text-sky-700" /><div><h2 className="font-semibold text-gray-900">크루즈 예약 조회</h2><p className="text-sm text-gray-600">{dataScope === 'upcoming' ? '오늘 이후' : '전체'} 사용일 기준 {rows.length.toLocaleString()}건 중 조건에 맞는 {filteredRows.length.toLocaleString()}건</p></div></div>
            <div className="flex gap-2"><button type="button" onClick={() => void loadReservations()} disabled={loading} className="inline-flex min-h-10 items-center justify-center gap-2 border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />조회</button><button type="button" onClick={downloadExcel} disabled={filteredRows.length === 0} className="inline-flex min-h-10 items-center justify-center gap-2 bg-emerald-700 px-3 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-gray-300"><Download className="h-4 w-4" />엑셀 다운로드</button></div>
          </div>
          <div className="grid gap-3 border-b border-gray-100 bg-white p-4 sm:grid-cols-2 lg:grid-cols-[220px_1fr_1fr]">
            <label className="text-sm font-medium text-gray-700">조회 범위<select value={dataScope} onChange={(event) => handleScopeChange(event.target.value as DataScope)} className="mt-1 min-h-10 w-full border border-gray-300 bg-white px-3 text-sm"><option value="upcoming">오늘 이후 데이터</option><option value="all">전체 데이터</option></select></label>
            <label className="text-sm font-medium text-gray-700">사용일 시작<input type="date" value={usageStartDate} onChange={(event) => setUsageStartDate(event.target.value)} className="mt-1 min-h-10 w-full border border-gray-300 bg-white px-3 text-sm" /></label>
            <label className="text-sm font-medium text-gray-700">사용일 종료<input type="date" value={usageEndDate} onChange={(event) => setUsageEndDate(event.target.value)} className="mt-1 min-h-10 w-full border border-gray-300 bg-white px-3 text-sm" /></label>
          </div>
          <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <label className="text-sm font-medium text-gray-700">예약일<input type="date" value={reservationDate} onChange={(event) => setReservationDate(event.target.value)} className="mt-1 min-h-10 w-full border border-gray-300 bg-white px-3 text-sm" /></label>
            <label className="text-sm font-medium text-gray-700">사용일<input type="date" value={usageDate} onChange={(event) => setUsageDate(event.target.value)} className="mt-1 min-h-10 w-full border border-gray-300 bg-white px-3 text-sm" /></label>
            <label className="text-sm font-medium text-gray-700">크루즈<select value={cruiseName} onChange={(event) => setCruiseName(event.target.value)} className="mt-1 min-h-10 w-full border border-gray-300 bg-white px-3 text-sm"><option value="">전체 크루즈</option>{cruiseOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
            <label className="text-sm font-medium text-gray-700">객실명<select value={roomName} onChange={(event) => setRoomName(event.target.value)} className="mt-1 min-h-10 w-full border border-gray-300 bg-white px-3 text-sm"><option value="">전체 객실</option>{roomOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
            <div className="flex items-end"><button type="button" onClick={resetFilters} className="inline-flex min-h-10 items-center gap-1 border border-gray-300 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50"><Filter className="h-4 w-4" />필터 초기화</button></div>
          </div>
        </section>

        {error && <p role="alert" className="border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        <section className="overflow-hidden border border-gray-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-[1180px] w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs text-gray-600"><tr><SortHeader label="예약일" column="reservationDate" activeColumn={sortKey} direction={sortDirection} onSort={handleColumnSort} /><SortHeader label="사용일" column="usageDate" activeColumn={sortKey} direction={sortDirection} onSort={handleColumnSort} /><SortHeader label="크루즈명" column="cruiseName" activeColumn={sortKey} direction={sortDirection} onSort={handleColumnSort} /><SortHeader label="객실명" column="roomName" activeColumn={sortKey} direction={sortDirection} onSort={handleColumnSort} /><SortHeader label="고객" column="customerName" activeColumn={sortKey} direction={sortDirection} onSort={handleColumnSort} /><SortHeader label="상태" column="status" activeColumn={sortKey} direction={sortDirection} onSort={handleColumnSort} /><SortHeader label="인원" column="guestCount" activeColumn={sortKey} direction={sortDirection} onSort={handleColumnSort} align="center" /><SortHeader label="객실 총액" column="roomTotalPrice" activeColumn={sortKey} direction={sortDirection} onSort={handleColumnSort} align="right" /><SortHeader label="승선 코드" column="boardingCode" activeColumn={sortKey} direction={sortDirection} onSort={handleColumnSort} /></tr></thead>
              <tbody>{loading ? <tr><td colSpan={9} className="px-4 py-14 text-center text-gray-500">크루즈 예약을 불러오는 중입니다.</td></tr> : filteredRows.length === 0 ? <tr><td colSpan={9} className="px-4 py-14 text-center text-gray-500">조건에 맞는 크루즈 예약이 없습니다.</td></tr> : filteredRows.map((row) => <tr key={row.id} className="border-b border-gray-100 hover:bg-sky-50/40"><td className="whitespace-nowrap px-4 py-3 text-gray-700">{dateLabel(dateKeyInKorea(row.reservationDate))}</td><td className="whitespace-nowrap px-4 py-3 text-gray-700">{dateLabel(row.usageDate)}</td><td className="max-w-64 px-4 py-3 font-medium text-gray-900">{row.cruiseName}<span className="ml-1 text-xs font-normal text-gray-500">{row.scheduleType}</span></td><td className="max-w-72 px-4 py-3 text-gray-800">{row.roomName}</td><td className="px-4 py-3"><p className="font-medium text-gray-900">{row.customerName}</p><p className="text-xs text-gray-500">{row.customerEmail}</p></td><td className="whitespace-nowrap px-4 py-3 text-gray-700">{statusLabel(row.status)}</td><td className="whitespace-nowrap px-4 py-3 text-center text-gray-700">{row.guestCount}명</td><td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-gray-900">{row.roomTotalPrice.toLocaleString('ko-KR')} VND</td><td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-gray-700">{row.boardingCode || '-'}</td></tr>)}</tbody>
            </table>
          </div>
        </section>
      </div>
    </ManagerLayout>
  );
}
