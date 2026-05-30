'use client';

import React, { useEffect, useMemo, useState } from 'react';
import ManagerLayout from '@/components/ManagerLayout';
import supabase from '@/lib/supabase';
import { fetchTableInBatches } from '@/lib/fetchInBatches';
import { openCentralReservationDetailModal } from '@/contexts/reservationDetailModalEvents';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Eye,
  LayoutGrid,
  List,
  RefreshCw,
  Search,
  Ship,
  User,
} from 'lucide-react';

type StatusFilter = 'all' | 'pending' | 'approved' | 'confirmed' | 'completed' | 'cancelled';
type SpecialFilter =
  | 'all'
  | 'request_note'
  | 'connecting_room'
  | 'birthday_event'
  | 'boarding_assist'
  | 'room_options';
type ViewMode = 'table' | 'card';
type StatFilter = 'all' | 'memo' | 'connecting' | 'birthday' | 'boarding' | 'room_options';

interface CruiseRequestRow {
  id: string;
  reservation_id: string;
  room_price_code?: string | null;
  checkin?: string | null;
  guest_count?: number | null;
  adult_count?: number | null;
  child_count?: number | null;
  infant_count?: number | null;
  room_count?: number | null;
  request_note?: string | null;
  boarding_assist?: boolean | string | null;
  accommodation_info?: string | null;
  child_extra_bed_count?: number | null;
  extra_bed_count?: number | null;
  single_count?: number | null;
  connecting_room?: boolean | string | null;
  birthday_event?: boolean | string | null;
  birthday_name?: string | null;
  created_at?: string | null;
  reservation?: {
    re_id: string;
    re_user_id?: string | null;
    re_quote_id?: string | null;
    re_type?: string | null;
    re_status?: string | null;
    re_created_at?: string | null;
    order_id?: string | null;
    total_amount?: number | null;
  };
  user?: {
    id: string;
    name?: string | null;
    email?: string | null;
    phone_number?: string | null;
    english_name?: string | null;
  };
  quote?: {
    id: string;
    title?: string | null;
  };
  rate?: {
    cruise_name?: string | null;
    room_type?: string | null;
    schedule_type?: string | null;
  };
}

const STATUS_LABELS: Record<string, string> = {
  pending: '대기',
  approved: '승인',
  confirmed: '확정',
  completed: '완료',
  cancelled: '취소',
};

const SPECIAL_FILTER_LABELS: Record<SpecialFilter, string> = {
  all: '전체',
  request_note: '메모',
  connecting_room: '커넥팅룸',
  birthday_event: '생일 이벤트',
  boarding_assist: '승선 도움',
  room_options: '객실 옵션',
};

const isUuid = (value?: string | null) => {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
};

const isTruthy = (value: unknown) => {
  if (value === true) return true;
  if (typeof value === 'number') return value > 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return ['true', 'yes', 'y', '1', '있음', '신청', '요청'].includes(normalized);
  }
  return false;
};

const hasText = (value?: string | null) => !!String(value || '').trim();

const toDateKey = (value?: string | null) => {
  if (!value) return '';
  if (value.length >= 10 && value[4] === '-' && value[7] === '-') return value.slice(0, 10);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-CA');
};

const REQUEST_NOTE_HIDDEN_LINE_RE =
  /^\s*(?:\[[^\]]+\]\s*)*\[객실\s*\d+\]\s*.*\|\s*성인\s*\d+\s*,\s*아동\s*\d+\s*,\s*아동엑베\s*\d+\s*,\s*유아\s*\d+\s*,\s*성인엑베\s*\d+\s*,\s*싱글\s*\d+\s*$/i;
const REQUEST_NOTE_SYSTEM_TAG_RE = /^\s*\[[A-Z0-9_:-]+\]\s*$/i;

type RequestNoteRoomRow = {
  room_type?: string;
  room_count?: number;
  adult_count?: number;
  child_count?: number;
  child_extra_bed_count?: number;
  infant_count?: number;
  extra_bed_count?: number;
  single_count?: number;
};

const ROOM_JSON_BLOCK_RE = /\[\s*\{[\s\S]*?"room_type"[\s\S]*?"adult_count"[\s\S]*?\}\s*\]/g;

const normalizeEscapedJsonText = (value: string) => value.replace(/\\"/g, '"').trim();

const formatRoomJsonRequestNote = (value: string) => {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.length === 0) return '';
    const rows = parsed as RequestNoteRoomRow[];
    const lines = rows
      .map((row, index) => {
        const roomType = String(row.room_type || '객실').trim();
        const roomCount = Number(row.room_count) || 0;
        const adult = Number(row.adult_count) || 0;
        const child = Number(row.child_count) || 0;
        const childEb = Number(row.child_extra_bed_count) || 0;
        const infant = Number(row.infant_count) || 0;
        const adultEb = Number(row.extra_bed_count) || 0;
        const single = Number(row.single_count) || 0;
        return `[객실 ${index + 1}] ${roomType}${roomCount > 0 ? ` x${roomCount}` : ''}\n성인 ${adult}, 아동 ${child}, 아동엑베 ${childEb}, 유아 ${infant}, 성인엑베 ${adultEb}, 싱글 ${single}`;
      })
      .filter(Boolean);
    return lines.join('\n');
  } catch {
    return '';
  }
};

const formatRoomJsonBlock = (block: string) => {
  const normalized = normalizeEscapedJsonText(block);
  const formatted = formatRoomJsonRequestNote(normalized);
  return formatted || '';
};

const replaceRoomJsonBlocks = (text: string) => {
  let replaced = text;
  let matched = false;
  replaced = replaced.replace(ROOM_JSON_BLOCK_RE, (block) => {
    matched = true;
    const formatted = formatRoomJsonBlock(block);
    return formatted || '';
  });
  return { text: replaced, matched };
};

const cleanRequestNote = (value?: string | null) => {
  const original = String(value || '');
  if (!original.trim()) return '';

  const trimmedOriginal = original.trim();
  const normalizedOriginal = normalizeEscapedJsonText(trimmedOriginal);
  const jsonFormatted = formatRoomJsonRequestNote(trimmedOriginal);
  if (jsonFormatted) return jsonFormatted;

  const normalizedJsonFormatted = formatRoomJsonRequestNote(normalizedOriginal);
  if (normalizedJsonFormatted) return normalizedJsonFormatted;

  const { text: jsonReplaced, matched } = replaceRoomJsonBlocks(normalizedOriginal);
  if (matched) {
    const compact = jsonReplaced
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .join('\n')
      .trim();
    if (compact) return compact;
  }

  const lines = jsonReplaced
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return false;
      if (REQUEST_NOTE_HIDDEN_LINE_RE.test(trimmed)) return false;
      if (REQUEST_NOTE_SYSTEM_TAG_RE.test(trimmed)) return false;
      return true;
    });
  return lines.join('\n').trim();
};

const getDisplayRequestText = (row: CruiseRequestRow) => {
  return cleanRequestNote(row.request_note) || cleanRequestNote(row.accommodation_info);
};

const buildSpecialTags = (row: CruiseRequestRow) => {
  const tags: string[] = [];
  if (hasText(getDisplayRequestText(row))) tags.push('요청 메모');
  if (isTruthy(row.connecting_room)) tags.push('커넥팅룸');
  if (isTruthy(row.birthday_event) || hasText(row.birthday_name)) tags.push(`생일${hasText(row.birthday_name) ? `: ${row.birthday_name}` : ''}`);
  if (isTruthy(row.boarding_assist)) tags.push('승선 도움');
  if (hasText(cleanRequestNote(row.accommodation_info))) tags.push('숙박 정보');
  if ((Number(row.extra_bed_count) || 0) > 0) tags.push(`엑스트라베드 ${row.extra_bed_count}`);
  if ((Number(row.child_extra_bed_count) || 0) > 0) tags.push(`아동 EB ${row.child_extra_bed_count}`);
  if ((Number(row.single_count) || 0) > 0) tags.push(`싱글 ${row.single_count}`);
  return tags;
};

const matchesSpecialFilter = (row: CruiseRequestRow, filter: SpecialFilter) => {
  if (filter === 'all') return true;
  if (filter === 'request_note') return hasText(getDisplayRequestText(row));
  if (filter === 'connecting_room') return isTruthy(row.connecting_room);
  if (filter === 'birthday_event') return isTruthy(row.birthday_event) || hasText(row.birthday_name);
  if (filter === 'boarding_assist') return isTruthy(row.boarding_assist);
  return (
    hasText(cleanRequestNote(row.accommodation_info)) ||
    (Number(row.extra_bed_count) || 0) > 0 ||
    (Number(row.child_extra_bed_count) || 0) > 0 ||
    (Number(row.single_count) || 0) > 0
  );
};

export default function ReservationRequestsPage() {
  return (
    <ManagerLayout title="요청사항" activeTab="reservation-requests">
      <ReservationRequestsContent />
    </ManagerLayout>
  );
}

function ReservationRequestsContent() {
  const [rows, setRows] = useState<CruiseRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [specialFilter, setSpecialFilter] = useState<SpecialFilter>('all');
  const [futureOnly, setFutureOnly] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('card');
  const [statFilter, setStatFilter] = useState<StatFilter>('all');

  const loadRows = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: cruiseData, error: cruiseError } = await supabase
        .from('reservation_cruise')
        .select(
          'id, reservation_id, room_price_code, checkin, guest_count, room_count, adult_count, child_count, infant_count, request_note, boarding_assist, accommodation_info, child_extra_bed_count, extra_bed_count, single_count, connecting_room, birthday_event, birthday_name, created_at'
        )
        .order('checkin', { ascending: true })
        .limit(10000);

      if (cruiseError) throw cruiseError;

      const specialRows = ((cruiseData || []) as CruiseRequestRow[]).filter((row) => buildSpecialTags(row).length > 0);
      if (specialRows.length === 0) {
        setRows([]);
        return;
      }

      const reservationIds = Array.from(new Set(specialRows.map((row) => row.reservation_id).filter(Boolean)));
      const reservationRows = await fetchTableInBatches<any>(
        'reservation',
        're_id',
        reservationIds,
        're_id, re_user_id, re_quote_id, re_type, re_status, re_created_at, order_id, total_amount',
        200
      );
      const reservationMap = new Map<string, any>();
      reservationRows.forEach((row) => {
        if (row?.re_id) reservationMap.set(row.re_id, row);
      });

      const userIds = Array.from(new Set(reservationRows.map((row) => row.re_user_id).filter(Boolean)));
      const quoteIds = Array.from(new Set(reservationRows.map((row) => row.re_quote_id).filter(Boolean)));
      const roomCodes = Array.from(new Set(specialRows.map((row) => row.room_price_code).filter(Boolean))) as string[];
      const uuidRoomCodes = roomCodes.filter((code) => isUuid(code));

      const [userRows, quoteRows, rateRows] = await Promise.all([
        fetchTableInBatches<any>('users', 'id', userIds, 'id, name, email, phone_number, english_name', 200),
        fetchTableInBatches<any>('quote', 'id', quoteIds, 'id, title', 200),
        fetchTableInBatches<any>('cruise_rate_card', 'id', uuidRoomCodes, 'id, cruise_name, room_type, schedule_type', 200),
      ]);

      const userMap = new Map<string, any>();
      userRows.forEach((row) => {
        if (row?.id) userMap.set(row.id, row);
      });

      const quoteMap = new Map<string, any>();
      quoteRows.forEach((row) => {
        if (row?.id) quoteMap.set(row.id, row);
      });

      const rateMap = new Map<string, any>();
      rateRows.forEach((row) => {
        if (row?.id) rateMap.set(row.id, row);
      });

      const merged = specialRows.map((row) => {
        const reservation = reservationMap.get(row.reservation_id);
        return {
          ...row,
          reservation,
          user: reservation?.re_user_id ? userMap.get(reservation.re_user_id) : undefined,
          quote: reservation?.re_quote_id ? quoteMap.get(reservation.re_quote_id) : undefined,
          rate: row.room_price_code ? rateMap.get(row.room_price_code) : undefined,
        };
      });

      setRows(merged);
    } catch (err: any) {
      console.error('요청사항 예약 조회 실패:', err);
      setError(err?.message || '요청사항 예약을 불러오지 못했습니다.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRows();
  }, []);

  const todayKey = useMemo(() => toDateKey(new Date().toISOString()), []);

  const filteredRows = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return rows
      .filter((row) => {
        if (statusFilter !== 'all' && row.reservation?.re_status !== statusFilter) return false;
        if (!matchesSpecialFilter(row, specialFilter)) return false;
        if (statFilter === 'memo' && !hasText(getDisplayRequestText(row))) return false;
        if (statFilter === 'connecting' && !isTruthy(row.connecting_room)) return false;
        if (statFilter === 'birthday' && !(isTruthy(row.birthday_event) || hasText(row.birthday_name))) return false;
        if (statFilter === 'boarding' && !isTruthy(row.boarding_assist)) return false;
        if (statFilter === 'room_options') {
          const hasRoomOptions =
            hasText(cleanRequestNote(row.accommodation_info)) ||
            (Number(row.extra_bed_count) || 0) > 0 ||
            (Number(row.child_extra_bed_count) || 0) > 0 ||
            (Number(row.single_count) || 0) > 0;
          if (!hasRoomOptions) return false;
        }
        if (futureOnly && toDateKey(row.checkin) < todayKey) return false;
        if (!q) return true;

        const haystack = [
          row.reservation_id,
          row.id,
          row.reservation?.order_id,
          row.reservation?.re_quote_id,
          row.user?.name,
          row.user?.english_name,
          row.user?.email,
          row.user?.phone_number,
          row.quote?.title,
          row.rate?.cruise_name,
          row.rate?.room_type,
          row.room_price_code,
          getDisplayRequestText(row),
          row.birthday_name,
          cleanRequestNote(row.accommodation_info),
          buildSpecialTags(row).join(' '),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        return haystack.includes(q);
      })
      .sort((a, b) => {
        const dateA = toDateKey(a.checkin) || '9999-12-31';
        const dateB = toDateKey(b.checkin) || '9999-12-31';
        return dateA.localeCompare(dateB);
      });
  }, [rows, searchTerm, statusFilter, specialFilter, statFilter, futureOnly, todayKey]);

  const counts = useMemo(() => {
    return {
      total: rows.length,
      visible: filteredRows.length,
      connecting: rows.filter((row) => isTruthy(row.connecting_room)).length,
      birthday: rows.filter((row) => isTruthy(row.birthday_event) || hasText(row.birthday_name)).length,
      memo: rows.filter((row) => hasText(getDisplayRequestText(row))).length,
      boarding: rows.filter((row) => isTruthy(row.boarding_assist)).length,
      roomOptions: rows.filter((row) => {
        return (
          hasText(cleanRequestNote(row.accommodation_info)) ||
          (Number(row.extra_bed_count) || 0) > 0 ||
          (Number(row.child_extra_bed_count) || 0) > 0 ||
          (Number(row.single_count) || 0) > 0
        );
      }).length,
    };
  }, [rows, filteredRows]);

  const groupedRows = useMemo(() => {
    const map = new Map<string, CruiseRequestRow[]>();
    filteredRows.forEach((row) => {
      const key = toDateKey(row.checkin) || '날짜 미정';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row);
    });
    return Array.from(map.entries()).sort((a, b) => {
      if (a[0] === '날짜 미정') return 1;
      if (b[0] === '날짜 미정') return -1;
      return a[0].localeCompare(b[0]);
    });
  }, [filteredRows]);

  const openDetail = (row: CruiseRequestRow) => {
    const userId = row.user?.id || row.reservation?.re_user_id || null;
    if (!userId) return;
    openCentralReservationDetailModal({ userId, mode: 'auto' });
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        <SummaryCard label="전체 요청" value={counts.total} active={statFilter === 'all'} onClick={() => setStatFilter('all')} />
        <SummaryCard label="메모" value={counts.memo} active={statFilter === 'memo'} onClick={() => setStatFilter('memo')} />
        <SummaryCard label="커넥팅룸" value={counts.connecting} active={statFilter === 'connecting'} onClick={() => setStatFilter('connecting')} />
        <SummaryCard label="생일 이벤트" value={counts.birthday} active={statFilter === 'birthday'} onClick={() => setStatFilter('birthday')} />
        <SummaryCard label="승선 도움" value={counts.boarding} active={statFilter === 'boarding'} onClick={() => setStatFilter('boarding')} />
        <SummaryCard label="객실 옵션" value={counts.roomOptions} active={statFilter === 'room_options'} onClick={() => setStatFilter('room_options')} />
      </div>
      <div className="text-xs text-gray-500">통계 카드를 클릭하면 해당 조건으로 바로 필터링됩니다. 현재 결과: {counts.visible}건</div>

      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[1fr_160px_160px_120px_170px_auto]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="예약자, 예약ID, 주문ID, 요청내용, 크루즈명 검색"
              className="w-full rounded-md border border-gray-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </label>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="all">상태 전체</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>

          <select
            value={specialFilter}
            onChange={(e) => setSpecialFilter(e.target.value as SpecialFilter)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            {(Object.keys(SPECIAL_FILTER_LABELS) as SpecialFilter[]).map((value) => (
              <option key={value} value={value}>
                {SPECIAL_FILTER_LABELS[value]}
              </option>
            ))}
          </select>

          <label className="flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={futureOnly}
              onChange={(e) => setFutureOnly(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            예정만
          </label>
          <div className="inline-flex rounded-md border border-gray-300 p-1">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs ${viewMode === 'table' ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'}`}
            >
              <List className="h-3.5 w-3.5" />
              표 보기
            </button>
            <button
              type="button"
              onClick={() => setViewMode('card')}
              className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs ${viewMode === 'card' ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'}`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              카드 보기
            </button>
          </div>

          <button
            type="button"
            onClick={() => void loadRows()}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            새로고침
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-4 py-3">
          <div className="text-sm font-semibold text-gray-800">특별 신청 예약자</div>
          <div className="mt-1 text-xs text-gray-500">
            request_note, connecting_room, birthday_event, birthday_name, boarding_assist, accommodation_info, extra/single bed 항목을 점검합니다.
          </div>
        </div>

        {loading ? (
          <div className="flex h-56 items-center justify-center">
            <div className="h-9 w-9 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="flex h-56 flex-col items-center justify-center text-gray-500">
            <CheckCircle2 className="mb-2 h-8 w-8 text-gray-300" />
            <p className="text-sm">조건에 맞는 요청사항 예약이 없습니다.</p>
          </div>
        ) : (
          <div className="space-y-5 p-4">
            {groupedRows.map(([dateKey, dayRows]) => (
              <section key={dateKey} className="space-y-3">
                <div className="flex items-center justify-between border-b border-gray-200 pb-2">
                  <div className="inline-flex items-center gap-2 text-sm font-semibold text-gray-900">
                    <Calendar className="h-4 w-4 text-gray-500" />
                    {dateKey}
                  </div>
                  <div className="text-xs text-gray-500">{dayRows.length}건</div>
                </div>

                {viewMode === 'table' ? (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                      <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                        <tr>
                          <th className="whitespace-nowrap px-4 py-3 text-left">예약자</th>
                          <th className="whitespace-nowrap px-4 py-3 text-left">예약 ID / 주문 ID</th>
                          <th className="whitespace-nowrap px-4 py-3 text-left">크루즈 / 객실</th>
                          <th className="whitespace-nowrap px-4 py-3 text-left">특별 신청</th>
                          <th className="whitespace-nowrap px-4 py-3 text-left">요청 메모</th>
                          <th className="whitespace-nowrap px-4 py-3 text-right">관리</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 bg-white">
                        {dayRows.map((row) => {
                          const tags = buildSpecialTags(row);
                          const displayNote = getDisplayRequestText(row);
                          return (
                            <tr key={row.id} className="hover:bg-blue-50/40">
                              <td className="px-4 py-3 align-top">
                                <div className="flex items-center gap-2 font-semibold text-gray-900">
                                  <User className="h-4 w-4 text-gray-400" />
                                  {row.user?.name || row.user?.email || '예약자 미상'}
                                </div>
                                <div className="mt-1 text-xs text-gray-500">{row.user?.phone_number || row.user?.email || '-'}</div>
                                <div className="mt-1 text-xs text-gray-500">인원 {row.guest_count ?? '-'}명{row.room_count ? ` / 객실 ${row.room_count}` : ''}</div>
                              </td>
                              <td className="px-4 py-3 align-top">
                                <div className="font-mono text-xs text-gray-700">{row.reservation_id}</div>
                                <div className="mt-1 text-xs text-gray-500">주문: {row.reservation?.order_id || '-'}</div>
                                <div className="mt-1 text-xs text-gray-500">상태: {STATUS_LABELS[row.reservation?.re_status || ''] || row.reservation?.re_status || '-'}</div>
                              </td>
                              <td className="px-4 py-3 align-top">
                                <div className="flex items-center gap-2 font-medium text-gray-900">
                                  <Ship className="h-4 w-4 text-gray-400" />
                                  {row.rate?.cruise_name || '크루즈 미정'}
                                </div>
                                <div className="mt-1 text-xs text-gray-500">{row.rate?.room_type || row.room_price_code || '-'}</div>
                                {row.quote?.title && <div className="mt-1 text-xs text-gray-500">{row.quote.title}</div>}
                              </td>
                              <td className="px-4 py-3 align-top">
                                <div className="flex max-w-xs flex-wrap gap-1.5">
                                  {tags.map((tag) => (
                                    <span key={tag} className="rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-blue-100">
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              </td>
                              <td className="max-w-sm px-4 py-3 align-top">
                                <div className="whitespace-pre-wrap break-words text-sm text-gray-700">
                                  {displayNote || '-'}
                                </div>
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 text-right align-top">
                                <button
                                  type="button"
                                  onClick={() => openDetail(row)}
                                  className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                  상세
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {dayRows.map((row) => {
                      const tags = buildSpecialTags(row);
                      const displayNote = getDisplayRequestText(row);
                      return (
                        <article key={row.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold text-gray-900">{row.user?.name || row.user?.email || '예약자 미상'}</div>
                              <div className="mt-1 text-xs text-gray-500">{row.user?.phone_number || row.user?.email || '-'}</div>
                            </div>
                            <span className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-600">
                              {STATUS_LABELS[row.reservation?.re_status || ''] || row.reservation?.re_status || '-'}
                            </span>
                          </div>
                          <div className="mt-3 space-y-1 text-xs text-gray-600">
                            <div className="flex items-center gap-1.5"><Ship className="h-3.5 w-3.5" />{row.rate?.cruise_name || '크루즈 미정'} / {row.rate?.room_type || row.room_price_code || '-'}</div>
                            <div>인원 {row.guest_count ?? '-'}명{row.room_count ? ` / 객실 ${row.room_count}` : ''}</div>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {tags.map((tag) => (
                              <span key={tag} className="rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-blue-100">
                                {tag}
                              </span>
                            ))}
                          </div>
                          <div className="mt-3 max-h-20 overflow-y-auto whitespace-pre-wrap break-words rounded-md bg-gray-50 p-2 text-xs text-gray-700">
                            {displayNote || '-'}
                          </div>
                          <div className="mt-3 flex justify-end">
                            <button
                              type="button"
                              onClick={() => openDetail(row)}
                              className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              상세
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  active,
  onClick,
}: {
  label: string;
  value: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-4 py-3 text-left shadow-sm transition-colors ${
        active ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-white hover:bg-gray-50'
      }`}
    >
      <div className="text-xs font-medium text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-bold text-gray-900">{value.toLocaleString('ko-KR')}</div>
    </button>
  );
}
