'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ManagerLayout from '@/components/ManagerLayout';
import supabase from '@/lib/supabase';

type RequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

type ChangeRequestRow = {
    id: string;
    reservation_id: string;
    re_type: string;
    requester_user_id: string;
    status: RequestStatus;
    customer_note: string | null;
    manager_note: string | null;
    submitted_at: string;
    reviewed_at: string | null;
    snapshot_data: any | null;
};

const SERVICE_TABLE_MAP: Record<string, { baseTable: string; tempTable: string }> = {
    airport: { baseTable: 'reservation_airport', tempTable: 'reservation_change_airport' },
    car_sht: { baseTable: 'reservation_car_sht', tempTable: 'reservation_change_car_sht' },
    sht: { baseTable: 'reservation_car_sht', tempTable: 'reservation_change_car_sht' },
    sht_car: { baseTable: 'reservation_car_sht', tempTable: 'reservation_change_car_sht' },
    cruise: { baseTable: 'reservation_cruise', tempTable: 'reservation_change_cruise' },
    cruise_car: { baseTable: 'reservation_cruise_car', tempTable: 'reservation_change_cruise_car' },
    car: { baseTable: 'reservation_cruise_car', tempTable: 'reservation_change_cruise_car' },
    hotel: { baseTable: 'reservation_hotel', tempTable: 'reservation_change_hotel' },
    rentcar: { baseTable: 'reservation_rentcar', tempTable: 'reservation_change_rentcar' },
    tour: { baseTable: 'reservation_tour', tempTable: 'reservation_change_tour' },
};

const EXCLUDED_FIELDS = new Set(['id', 'request_id', 'created_at', 'updated_at', 'reservation_id']);
const TABLE_SPECIFIC_EXCLUDED_FIELDS: Record<string, Set<string>> = {
    // 운영 스키마 캐시에 없는 컬럼 전송 방지
    reservation_airport: new Set(['ra_airport_name']),
    reservation_tour: new Set(['accommodation_info']),
    // reservation_car_sht 에는 accommodation_info 컬럼이 없음 (change 테이블에만 존재) → 400 방지
    reservation_car_sht: new Set(['accommodation_info']),
};

function normalizeReservationId(value?: string): string {
    if (!value) return '';
    return String(value).split(':')[0].trim();
}

const TYPE_NAME_MAP: Record<string, string> = {
    airport: '✈️ 공항', car_sht: '🚙 스하차량', cruise: '🚢 크루즈',
    sht: '🚙 스하차량', sht_car: '🚙 스하차량',
    cruise_car: '🚙 크루즈차량', car: '🚙 크루즈차량', hotel: '🏨 호텔', rentcar: '🚗 렌터카', tour: '🎫 투어',
};

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
    pending: { label: '대기', cls: 'bg-yellow-100 text-yellow-700' },
    approved: { label: '승인', cls: 'bg-green-100 text-green-700' },
    rejected: { label: '반려', cls: 'bg-red-100 text-red-700' },
    cancelled: { label: '취소', cls: 'bg-gray-100 text-gray-600' },
};

/* ─── 필드 라벨 매핑 ─── */
const FIELD_LABELS: Record<string, string> = {
    airport_price_code: '가격코드', ra_airport_location: '📍 장소', ra_flight_number: '✈️ 항공편',
    ra_datetime: '🕐 일시', ra_stopover_location: '🔄 경유지', ra_stopover_wait_minutes: '⏱️ 경유대기(분)',
    ra_car_count: '🚗 차량수', ra_passenger_count: '👥 승객수', ra_luggage_count: '🧳 수하물수',
    ra_airport_name: '공항명', way_type: '이용방식', accommodation_info: '숙소정보',
    hotel_price_code: '가격코드', checkin_date: '📅 체크인', guest_count: '👥 총인원',
    adult_count: '🧑 성인', child_count: '👶 아동', infant_count: '👼 유아',
    breakfast_service: '🍳 조식', hotel_category: '호텔등급', schedule: '일정',
    room_count: '객실수', assignment_code: '배정코드',
    rentcar_price_code: '가격코드', pickup_datetime: '🕐 픽업시간(Ⅰ)', pickup_location: '📍 승차위치(Ⅰ)',
    destination: '🎯 하차위치(Ⅰ)', via_location: '🔄 경유지(Ⅰ)', via_waiting: '⏱️ 경유대기(Ⅰ)',
    return_datetime: '🕐 픽업시간(Ⅱ)', return_pickup_location: '📍 승차위치(Ⅱ)',
    return_destination: '🎯 하차위치(Ⅱ)', return_via_location: '🔄 경유지(Ⅱ)', return_via_waiting: '⏱️ 경유대기(Ⅱ)',
    car_count: '🚗 차량수', passenger_count: '👥 승객수', luggage_count: '🧳 수하물',
    rentcar_count: '렌터카수',
    tour_price_code: '가격코드', usage_date: '📅 사용일', tour_capacity: '👥 정원',
    dropoff_location: '🎯 하차장소',
    room_price_code: '객실코드', checkin: '📅 승선일', room_total_price: '객실총가격',
    boarding_code: '승선코드', boarding_assist: '승선도움',
    child_extra_bed_count: '아동엑베', extra_bed_count: '엑스트라베드', single_count: '싱글',
    connecting_room: '커넥팅룸', birthday_event: '생일이벤트', birthday_name: '생일자',
    vehicle_number: '🔢 차량번호', seat_number: '💺 좌석', sht_category: '차량분류',
    car_price_code: '가격코드', car_total_price: '차량총가격',
    request_note: '📝 요청사항', dispatch_code: '📦 배차코드', dispatch_memo: '배차메모',
    pickup_confirmed_at: '승차확인', unit_price: '단가', total_price: '총가격',
    route: '경로', vehicle_type: '차종', rental_type: '렌탈타입',
    pickup_accommodation_info: '픽업 숙소 정보',
    sending_accommodation_info: '샌딩 숙소 정보',
    pickup_airport_location: '픽업 공항 위치',
    sending_airport_location: '샌딩 공항 위치',
};

function getFieldLabel(field: string): string {
    return FIELD_LABELS[field] || field;
}

function normalizeValue(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') {
        try { return JSON.stringify(value); } catch { return String(value); }
    }
    return String(value);
}

function formatDisplayValue(value: unknown): string {
    if (value === null || value === undefined || String(value).trim() === '') return '-';
    if (typeof value === 'boolean') return value ? '✅ 예' : '❌ 아니오';
    if (typeof value === 'number') return value.toLocaleString('ko-KR');
    if (typeof value === 'object') {
        try { return JSON.stringify(value); } catch { return String(value); }
    }
    const strVal = String(value);
    if (/^\d{4}-\d{2}-\d{2}T/.test(strVal) || /^\d{4}-\d{2}-\d{2} \d{2}:/.test(strVal)) {
        try {
            const d = new Date(strVal);
            if (!isNaN(d.getTime())) {
                return d.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
            }
        } catch { /* fall through */ }
    }
    return strVal;
}

function extractChangedFields(
    baseData: Record<string, any> | null,
    tempData: Record<string, any> | null,
    baseTable?: string,
) {
    if (!tempData) return [] as Array<{ field: string; before: unknown; after: unknown }>;
    const keys = new Set<string>([...Object.keys(baseData || {}), ...Object.keys(tempData || {})]);
    const tableExcluded = (baseTable && TABLE_SPECIFIC_EXCLUDED_FIELDS[baseTable]) || new Set<string>();
    return Array.from(keys)
        .filter(key => !EXCLUDED_FIELDS.has(key) && !tableExcluded.has(key))
        .map(key => ({ field: key, before: baseData?.[key], after: tempData?.[key] }))
        .filter(row => row.after !== undefined)
        .filter(row => normalizeValue(row.before) !== normalizeValue(row.after));
}

function extractAirportSnapshotChangedFields(snapshotData: any) {
    const originalRows = Array.isArray(snapshotData?.original) ? snapshotData.original : [];
    const requestedRows = Array.isArray(snapshotData?.requested) ? snapshotData.requested : [];
    if (requestedRows.length === 0) return [] as Array<{ field: string; before: unknown; after: unknown }>;

    const originalByKey = new Map<string, any>();
    originalRows.forEach((row: any, idx: number) => {
        const key = String(row?.id || row?.way_type || idx);
        originalByKey.set(key, row);
    });

    const rows: Array<{ field: string; before: unknown; after: unknown }> = [];
    requestedRows.forEach((row: any, idx: number) => {
        const key = String(row?.id || row?.way_type || idx);
        const original = originalByKey.get(key) || {};
        const way = String(row?.way_type || original?.way_type || '').toLowerCase();

        const accommodationField = way === 'pickup' ? 'pickup_accommodation_info' : way === 'sending' ? 'sending_accommodation_info' : 'accommodation_info';
        const airportField = way === 'pickup' ? 'pickup_airport_location' : way === 'sending' ? 'sending_airport_location' : 'ra_airport_location';

        const beforeAccommodation = original?.accommodation_info;
        const afterAccommodation = row?.accommodation_info;
        if (afterAccommodation !== undefined && normalizeValue(beforeAccommodation) !== normalizeValue(afterAccommodation)) {
            rows.push({ field: accommodationField, before: beforeAccommodation, after: afterAccommodation });
        }

        const beforeAirport = original?.ra_airport_location;
        const afterAirport = row?.ra_airport_location;
        if (afterAirport !== undefined && normalizeValue(beforeAirport) !== normalizeValue(afterAirport)) {
            rows.push({ field: airportField, before: beforeAirport, after: afterAirport });
        }
    });

    return rows;
}

function extractAirportRowsChangedFields(baseRows: any[], tempRows: any[]) {
    const rows: Array<{ field: string; before: unknown; after: unknown }> = [];
    const baseByWay = new Map<string, any>();
    (baseRows || []).forEach((row: any) => {
        const way = String(row?.way_type || '').toLowerCase();
        if (way) baseByWay.set(way, row);
    });

    (tempRows || []).forEach((row: any) => {
        const way = String(row?.way_type || '').toLowerCase();
        const base = baseByWay.get(way) || {};

        const accommodationField = way === 'pickup' ? 'pickup_accommodation_info' : way === 'sending' ? 'sending_accommodation_info' : 'accommodation_info';
        const airportField = way === 'pickup' ? 'pickup_airport_location' : way === 'sending' ? 'sending_airport_location' : 'ra_airport_location';

        if (row?.accommodation_info !== undefined && normalizeValue(base?.accommodation_info) !== normalizeValue(row?.accommodation_info)) {
            rows.push({ field: accommodationField, before: base?.accommodation_info, after: row?.accommodation_info });
        }
        if (row?.ra_airport_location !== undefined && normalizeValue(base?.ra_airport_location) !== normalizeValue(row?.ra_airport_location)) {
            rows.push({ field: airportField, before: base?.ra_airport_location, after: row?.ra_airport_location });
        }
    });

    return rows;
}

function extractSnapshotChangedFields(snapshotData: any, baseTable?: string) {
    const toRows = (v: any): any[] => {
        if (Array.isArray(v)) return v;
        if (v && typeof v === 'object') return [v];
        return [];
    };

    const originalRows = toRows(snapshotData?.original);
    const requestedRows = toRows(snapshotData?.requested);
    if (requestedRows.length === 0) return [] as Array<{ field: string; before: unknown; after: unknown }>;

    const originalByKey = new Map<string, any>();
    originalRows.forEach((row: any, idx: number) => {
        const key = String(row?.id || idx);
        originalByKey.set(key, row);
    });

    const rows: Array<{ field: string; before: unknown; after: unknown }> = [];
    requestedRows.forEach((row: any, idx: number) => {
        const key = String(row?.id || idx);
        const original = originalByKey.get(key) || {};
        rows.push(...extractChangedFields(original, row, baseTable));
    });

    return rows;
}

function isHeaderLikeChangedRow(row: { field: unknown; before: unknown; after: unknown }): boolean {
    const f = normalizeValue(row.field).trim();
    const b = normalizeValue(row.before).trim();
    const a = normalizeValue(row.after).trim();

    // 구형/오염 스냅샷: 헤더 텍스트 자체가 데이터로 저장된 경우 제거
    if (f === 'field' || f === 'before' || f === 'after') return true;
    if (f === '필드' && (b.includes('기존값') || a.includes('수정요청'))) return true;
    if (f.includes('기존값') || f.includes('수정요청')) return true;
    if (b === '🔵 기존값' || a === '🟠 수정요청') return true;

    return false;
}

function extractLegacyChangedRows(snapshotData: any): Array<{ field: string; before: unknown; after: unknown }> {
    const requested = Array.isArray(snapshotData?.requested) ? snapshotData.requested : [];
    const rows = requested
        .filter((r: any) => r && typeof r === 'object' && ('field' in r || 'before' in r || 'after' in r))
        .map((r: any) => ({ field: String(r.field || ''), before: r.before, after: r.after }))
        .filter((r) => !isHeaderLikeChangedRow(r));
    return rows;
}

function getSnapshotChangedRows(row: ChangeRequestRow): Array<{ field: string; before: unknown; after: unknown }> {
    const legacyRows = extractLegacyChangedRows(row.snapshot_data);
    if (legacyRows.length > 0) return legacyRows;

    if (row.re_type === 'airport') {
        return extractAirportSnapshotChangedFields(row.snapshot_data).filter((r) => !isHeaderLikeChangedRow(r));
    }
    const mapping = SERVICE_TABLE_MAP[row.re_type];
    return extractSnapshotChangedFields(row.snapshot_data, mapping?.baseTable).filter((r) => !isHeaderLikeChangedRow(r));
}

const FILTER_BUTTONS: Array<{ value: RequestStatus | 'all'; label: string }> = [
    { value: 'all', label: '전체' },
    { value: 'pending', label: '대기' },
    { value: 'approved', label: '승인' },
    { value: 'rejected', label: '반려' },
    { value: 'cancelled', label: '취소' },
];

type GroupedDate = {
    date: string;
    users: { userId: string; userName: string; email: string; rows: ChangeRequestRow[] }[];
};

export default function ReservationEditApprovalPage() {
    const [requests, setRequests] = useState<ChangeRequestRow[]>([]);
    const [userMap, setUserMap] = useState<Record<string, { name?: string; email?: string }>>({});
    const [statusFilter, setStatusFilter] = useState<RequestStatus | 'all'>('pending');
    const [loading, setLoading] = useState(false);

    const [selectedRequest, setSelectedRequest] = useState<ChangeRequestRow | null>(null);
    const [baseData, setBaseData] = useState<Record<string, any> | null>(null);
    const [tempData, setTempData] = useState<Record<string, any> | null>(null);
    const [airportBaseRows, setAirportBaseRows] = useState<any[]>([]);
    const [airportTempRows, setAirportTempRows] = useState<any[]>([]);
    const [detailLoading, setDetailLoading] = useState(false);

    const [managerNote, setManagerNote] = useState('');
    const [processing, setProcessing] = useState(false);
    const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
    const [bulkNote, setBulkNote] = useState('');

    const loadRequests = useCallback(async () => {
        setLoading(true);
        try {
            let query = supabase
                .from('reservation_change_request')
                .select('id, reservation_id, re_type, requester_user_id, status, customer_note, manager_note, submitted_at, reviewed_at, snapshot_data')
                .order('submitted_at', { ascending: false });
            if (statusFilter !== 'all') query = query.eq('status', statusFilter);

            const { data, error } = await query;
            if (error) throw error;

            const rows = (data || []) as ChangeRequestRow[];
            setRequests(rows);

            const ids = Array.from(new Set(rows.map(r => r.requester_user_id).filter(Boolean)));
            if (ids.length > 0) {
                const { data: usersData } = await supabase.from('users').select('id, name, email').in('id', ids);
                const m: Record<string, { name?: string; email?: string }> = {};
                (usersData || []).forEach((u: any) => { m[u.id] = { name: u.name, email: u.email }; });
                setUserMap(m);
            } else {
                setUserMap({});
            }
        } catch (err) {
            console.error('수정 요청 목록 조회 실패:', err);
            setRequests([]);
        } finally {
            setLoading(false);
        }
    }, [statusFilter]);

    const loadComparison = useCallback(async (row: ChangeRequestRow) => {
        setSelectedRequest(row);
        setManagerNote(row.manager_note || '');
        setDetailLoading(true);
        setBaseData(null);
        setTempData(null);
        setAirportBaseRows([]);
        setAirportTempRows([]);

        try {
            const mapping = SERVICE_TABLE_MAP[row.re_type];
            if (!mapping) return;

            const safeReservationId = normalizeReservationId(row.reservation_id);
            if (row.re_type === 'airport') {
                const [baseRowsRes, tempRowsRes] = await Promise.all([
                    supabase.from(mapping.baseTable).select('*').eq('reservation_id', safeReservationId).order('created_at', { ascending: false }),
                    supabase.from(mapping.tempTable).select('*').eq('request_id', row.id).eq('reservation_id', safeReservationId),
                ]);
                if (baseRowsRes.error) throw baseRowsRes.error;
                if (tempRowsRes.error) throw tempRowsRes.error;

                const bRows = Array.isArray(baseRowsRes.data) ? baseRowsRes.data : [];
                const tRows = Array.isArray(tempRowsRes.data) ? tempRowsRes.data : [];
                setAirportBaseRows(bRows);
                setAirportTempRows(tRows);
                setBaseData((bRows[0] as Record<string, any>) || null);
                setTempData((tRows[0] as Record<string, any>) || null);
            } else {
                const [baseRes, tempRes] = await Promise.all([
                    supabase.from(mapping.baseTable).select('*').eq('reservation_id', safeReservationId)
                        .order('created_at', { ascending: false }).limit(1).maybeSingle(),
                    supabase.from(mapping.tempTable).select('*').eq('request_id', row.id)
                        .eq('reservation_id', safeReservationId).maybeSingle(),
                ]);
                if (baseRes.error) throw baseRes.error;
                if (tempRes.error) throw tempRes.error;

                setBaseData((baseRes.data as Record<string, any>) || null);
                setTempData((tempRes.data as Record<string, any>) || null);
            }
        } catch (err) {
            console.error('비교 데이터 조회 실패:', err);
        } finally {
            setDetailLoading(false);
        }
    }, []);

    useEffect(() => { loadRequests(); }, [loadRequests]);

    /* ── 그룹화: 날짜 → 사용자 ── */
    const groupedRequests = useMemo((): GroupedDate[] => {
        const dateMap = new Map<string, Map<string, ChangeRequestRow[]>>();
        requests.forEach(row => {
            const date = row.submitted_at.slice(0, 10);
            if (!dateMap.has(date)) dateMap.set(date, new Map());
            const userMap2 = dateMap.get(date)!;
            const uid = row.requester_user_id || '__unknown__';
            if (!userMap2.has(uid)) userMap2.set(uid, []);
            userMap2.get(uid)!.push(row);
        });
        return Array.from(dateMap.entries()).map(([date, uMap]) => ({
            date,
            users: Array.from(uMap.entries()).map(([userId, rows]) => {
                const u = userMap[userId];
                return { userId, userName: u?.name || '-', email: u?.email || '-', rows };
            }),
        }));
    }, [requests, userMap]);

    /* ── 체크박스 ── */
    const pendingIds = useMemo(() => requests.filter(r => r.status === 'pending').map(r => r.id), [requests]);
    const allChecked = pendingIds.length > 0 && pendingIds.every(id => checkedIds.has(id));

    const toggleAll = () => {
        if (allChecked) {
            setCheckedIds(new Set());
        } else {
            setCheckedIds(new Set(pendingIds));
        }
    };

    const toggleOne = (id: string) => {
        setCheckedIds(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const toggleGroupDate = (dateGroup: GroupedDate) => {
        const ids = dateGroup.users.flatMap(u => u.rows.filter(r => r.status === 'pending').map(r => r.id));
        const allIn = ids.every(id => checkedIds.has(id));
        setCheckedIds(prev => {
            const next = new Set(prev);
            ids.forEach(id => allIn ? next.delete(id) : next.add(id));
            return next;
        });
    };

    const toggleGroupUser = (rows: ChangeRequestRow[]) => {
        const ids = rows.filter(r => r.status === 'pending').map(r => r.id);
        const allIn = ids.every(id => checkedIds.has(id));
        setCheckedIds(prev => {
            const next = new Set(prev);
            ids.forEach(id => allIn ? next.delete(id) : next.add(id));
            return next;
        });
    };

    /* ── 단건 승인 처리 내부 함수 (applyStatus에서 공유) ── */
    const applySingleApprove = async (
        req: ChangeRequestRow,
        userId: string | undefined,
        noteOverride?: string,
    ) => {
        const mapping = SERVICE_TABLE_MAP[req.re_type];
        if (!mapping) throw new Error(`지원하지 않는 서비스 타입: ${req.re_type}`);
        const safeReservationId = normalizeReservationId(req.reservation_id);
        const tableExcluded = TABLE_SPECIFIC_EXCLUDED_FIELDS[mapping.baseTable] || new Set<string>();

        const snapshotRequestedRows = Array.isArray(req.snapshot_data?.requested)
            ? req.snapshot_data.requested : [];

        const isMultiRow = mapping.baseTable === 'reservation_airport' || mapping.baseTable === 'reservation_cruise_car';

        if (isMultiRow && snapshotRequestedRows.length > 0) {
            const { data: currentRows, error: curErr } = await supabase
                .from(mapping.baseTable).select('*').eq('reservation_id', safeReservationId);
            if (curErr) throw curErr;
            const baseRows = Array.isArray(currentRows) ? currentRows : [];
            const processedIds = new Set<string>();

            for (const requestedRow of snapshotRequestedRows) {
                const payload: Record<string, any> = {};
                let target: any = null;

                // 1️⃣ id로 정확히 매칭
                if (requestedRow?.id) {
                    target = baseRows.find((r: any) => r?.id === requestedRow.id);
                }
                // 2️⃣ id가 없으면 way_type으로 매칭 (픽업/드롭 구분)
                if (!target && requestedRow?.way_type) {
                    target = baseRows.find((r: any) => r?.way_type === requestedRow.way_type);
                }

                const referenceKeys = new Set<string>(Object.keys(target || baseRows[0] || {}));
                Object.keys(requestedRow || {}).forEach(key => {
                    if (!EXCLUDED_FIELDS.has(key) && !tableExcluded.has(key) &&
                        (referenceKeys.size === 0 || referenceKeys.has(key)))
                        payload[key] = requestedRow[key];
                });
                if (Object.keys(payload).length === 0) continue;

                if (target?.id) {
                    processedIds.add(target.id);
                    const { error } = await supabase.from(mapping.baseTable).update(payload).eq('id', target.id);
                    if (error) throw error;
                } else {
                    const { error } = await supabase.from(mapping.baseTable).insert({ reservation_id: safeReservationId, ...payload });
                    if (error) throw error;
                }
            }

            // ✅ 기존 행 중 처리되지 않은 행 보존 확인
            const unprocessedRows = baseRows.filter((r: any) => !processedIds.has(r?.id));
            if (unprocessedRows.length > 0) {
                console.log(`ℹ️ ${unprocessedRows.length}개 기존 행 유지:`, unprocessedRows.map(r => ({ id: r.id, way_type: r.way_type })));
            }
        } else {
            // 임시 테이블에서 직접 로드
            const { data: tmpRow } = await supabase.from(mapping.tempTable).select('*')
                .eq('request_id', req.id).eq('reservation_id', safeReservationId).maybeSingle();
            if (!tmpRow) throw new Error('임시 데이터 없음');
            const payload: Record<string, any> = {};
            Object.keys(tmpRow).forEach(key => {
                if (!EXCLUDED_FIELDS.has(key) && !tableExcluded.has(key)) payload[key] = tmpRow[key];
            });
            const { data: existing } = await supabase.from(mapping.baseTable)
                .select('reservation_id').eq('reservation_id', safeReservationId).maybeSingle();
            if (existing) {
                const { error } = await supabase.from(mapping.baseTable).update(payload).eq('reservation_id', safeReservationId);
                if (error) throw error;
            } else {
                const { error } = await supabase.from(mapping.baseTable).insert({ reservation_id: safeReservationId, ...payload });
                if (error) throw error;
            }
        }

        const upd: Record<string, any> = { status: 'approved', reviewed_at: new Date().toISOString(), manager_note: noteOverride ?? null };
        if (userId) upd.reviewed_by = userId;
        const { error } = await supabase.from('reservation_change_request').update(upd).eq('id', req.id);
        if (error) throw error;
    };

    /* ── 일괄 처리 ── */
    const applyBulkStatus = async (nextStatus: 'approved' | 'rejected') => {
        const ids = Array.from(checkedIds);
        if (ids.length === 0) { alert('선택된 항목이 없습니다.'); return; }
        if (!confirm(`선택된 ${ids.length}건을 ${nextStatus === 'approved' ? '승인' : '반려'} 하시겠습니까?`)) return;

        setProcessing(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            const userId = user?.id;
            let successCount = 0;
            const errors: string[] = [];

            for (const id of ids) {
                const req = requests.find(r => r.id === id);
                if (!req || req.status !== 'pending') continue;
                try {
                    if (nextStatus === 'approved') {
                        await applySingleApprove(req, userId, bulkNote || null as any);
                    } else {
                        const upd: Record<string, any> = { status: 'rejected', reviewed_at: new Date().toISOString(), manager_note: bulkNote || null };
                        if (userId) upd.reviewed_by = userId;
                        const { error } = await supabase.from('reservation_change_request').update(upd).eq('id', id);
                        if (error) throw error;
                    }
                    successCount++;
                } catch (e: any) {
                    errors.push(`${id.slice(0, 6)}: ${e?.message || '오류'}`);
                }
            }

            if (errors.length > 0) {
                alert(`${successCount}건 처리 완료, ${errors.length}건 실패:\n${errors.join('\n')}`);
            } else {
                alert(`${successCount}건 ${nextStatus === 'approved' ? '승인' : '반려'} 완료`);
            }
            setCheckedIds(new Set());
            setBulkNote('');
            setSelectedRequest(null);
            await loadRequests();
        } catch (err: any) {
            alert(`처리 중 오류: ${err?.message || JSON.stringify(err)}`);
        } finally {
            setProcessing(false);
        }
    };

    const changedFields = useMemo(() => {
        const mapping = selectedRequest ? SERVICE_TABLE_MAP[selectedRequest.re_type] : undefined;

        if (selectedRequest?.re_type === 'airport') {
            const fromSnapshot = extractAirportSnapshotChangedFields(selectedRequest.snapshot_data);
            if (fromSnapshot.length > 0) return fromSnapshot;

            const fromRows = extractAirportRowsChangedFields(airportBaseRows, airportTempRows);
            if (fromRows.length > 0) return fromRows;
        }

        const genericSnapshot = extractSnapshotChangedFields(selectedRequest?.snapshot_data, mapping?.baseTable);
        if (genericSnapshot.length > 0) return genericSnapshot;

        return extractChangedFields(baseData, tempData, mapping?.baseTable);
    }, [selectedRequest, baseData, tempData, airportBaseRows, airportTempRows]);

    const canApproveSelectedRequest = useMemo(() => {
        if (!selectedRequest) return false;
        if (tempData) return true;
        const isCruiseCar = selectedRequest.re_type === 'cruise_car' || selectedRequest.re_type === 'car';
        if (selectedRequest.re_type !== 'airport' && !isCruiseCar) return false;

        const snapshotCount = Array.isArray(selectedRequest.snapshot_data?.requested)
            ? selectedRequest.snapshot_data.requested.length
            : 0;

        return snapshotCount > 0 || airportTempRows.length > 0;
    }, [selectedRequest, tempData, airportTempRows]);

    const applyStatus = async (nextStatus: 'approved' | 'rejected') => {
        if (!selectedRequest || processing) return;
        const mapping = SERVICE_TABLE_MAP[selectedRequest.re_type];
        if (!mapping) { alert(`지원하지 않는 서비스 타입: ${selectedRequest.re_type}`); return; }
        const airportSnapshotRequested = Array.isArray(selectedRequest.snapshot_data?.requested)
            ? selectedRequest.snapshot_data.requested : [];
        const isMultiRowType = selectedRequest.re_type === 'airport' || selectedRequest.re_type === 'cruise_car' || selectedRequest.re_type === 'car';
        const canApproveFromAirportRows = isMultiRowType && airportTempRows.length > 0;
        const canApproveFromAirportSnapshot = isMultiRowType && airportSnapshotRequested.length > 0;
        if (nextStatus === 'approved' && !tempData && !canApproveFromAirportSnapshot && !canApproveFromAirportRows) {
            alert('승인할 임시 데이터가 없습니다.');
            return;
        }
        if (!confirm(nextStatus === 'approved' ? '해당 수정 요청을 승인하시겠습니까?' : '해당 수정 요청을 반려하시겠습니까?')) return;

        setProcessing(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            const safeReservationId = normalizeReservationId(selectedRequest.reservation_id);

            if (nextStatus === 'approved') {
                const tableExcluded = TABLE_SPECIFIC_EXCLUDED_FIELDS[mapping.baseTable] || new Set<string>();
                const snapshotRequestedRows = Array.isArray(selectedRequest.snapshot_data?.requested)
                    ? selectedRequest.snapshot_data.requested : [];
                const airportRequestedRows = snapshotRequestedRows.length > 0 ? snapshotRequestedRows : airportTempRows;

                if ((mapping.baseTable === 'reservation_airport' || mapping.baseTable === 'reservation_cruise_car') && airportRequestedRows.length > 0) {
                    // ✅ 픽업/드롭 독립 처리: 기존 행 조회 → 매칭되는 행만 UPDATE → 매칭 안 되는 행은 INSERT
                    const { data: currentRows, error: currentRowsError } = await supabase
                        .from(mapping.baseTable).select('*').eq('reservation_id', safeReservationId);
                    if (currentRowsError) throw currentRowsError;
                    const baseRows = Array.isArray(currentRows) ? currentRows : [];
                    const processedIds = new Set<string>();

                    for (const requestedRow of airportRequestedRows) {
                        const payload: Record<string, any> = {};
                        let target: any = null;
                        let matchedById = false;

                        // 1️⃣ id로 정확히 매칭
                        if (requestedRow?.id) {
                            target = baseRows.find((r: any) => r?.id === requestedRow.id);
                            matchedById = true;
                        }
                        // 2️⃣ id가 없으면 way_type으로 매칭 (픽업/드롭 구분)
                        if (!target && requestedRow?.way_type) {
                            target = baseRows.find((r: any) => r?.way_type === requestedRow.way_type);
                        }

                        // payload 구성: 요청된 필드만 포함
                        const referenceKeys = new Set<string>(Object.keys(target || baseRows[0] || {}));
                        Object.keys(requestedRow || {}).forEach(key => {
                            const allowedByReference = referenceKeys.size === 0 || referenceKeys.has(key);
                            if (!EXCLUDED_FIELDS.has(key) && !tableExcluded.has(key) && allowedByReference)
                                payload[key] = requestedRow[key];
                        });

                        if (Object.keys(payload).length === 0) continue;

                        // ✅ UPDATE 또는 INSERT
                        if (target?.id) {
                            processedIds.add(target.id);
                            const { error: updateErr } = await supabase.from(mapping.baseTable).update(payload).eq('id', target.id);
                            if (updateErr) throw updateErr;
                        } else {
                            const { error: insertErr } = await supabase.from(mapping.baseTable).insert({ reservation_id: safeReservationId, ...payload });
                            if (insertErr) throw insertErr;
                        }
                    }

                    // ✅ 기존 행 중 처리되지 않은 행(드롭 수정 시 픽업, 픽업 수정 시 드롭) 보존 확인
                    const unprocessedRows = baseRows.filter((r: any) => !processedIds.has(r?.id));
                    if (unprocessedRows.length > 0) {
                        console.log(`ℹ️ ${unprocessedRows.length}개 기존 행 유지:`, unprocessedRows.map(r => ({ id: r.id, way_type: r.way_type })));
                    }
                } else {
                    const payload: Record<string, any> = {};
                    Object.keys(tempData || {}).forEach(key => {
                        if (!EXCLUDED_FIELDS.has(key) && !tableExcluded.has(key)) payload[key] = (tempData as any)[key];
                    });
                    const { data: existing } = await supabase.from(mapping.baseTable)
                        .select('reservation_id').eq('reservation_id', safeReservationId).maybeSingle();
                    if (existing) {
                        const { error: updateErr } = await supabase.from(mapping.baseTable).update(payload).eq('reservation_id', safeReservationId);
                        if (updateErr) throw updateErr;
                    } else {
                        const { error: insErr } = await supabase.from(mapping.baseTable).insert({ reservation_id: safeReservationId, ...payload });
                        if (insErr) throw insErr;
                    }
                }
            }

            const upd: Record<string, any> = {
                status: nextStatus,
                reviewed_at: new Date().toISOString(),
                manager_note: managerNote || null,
            };
            if (user?.id) upd.reviewed_by = user.id;

            const { error: reqErr } = await supabase.from('reservation_change_request').update(upd).eq('id', selectedRequest.id);
            if (reqErr) throw reqErr;

            alert(nextStatus === 'approved' ? '수정 요청을 승인 했습니다.' : '수정 요청을 반려 했습니다.');
            await loadRequests();
            setSelectedRequest(null);
            setBaseData(null);
            setTempData(null);
            setManagerNote('');
        } catch (err: any) {
            console.error('요청 처리 실패:', err);
            alert(`처리 중 오류: ${err?.message || JSON.stringify(err)}`);
        } finally {
            setProcessing(false);
        }
    };

    return (
        <ManagerLayout title="예약 수정 승인" activeTab="reservation-edit-approval">
            <div className="space-y-4">
                {/* ── 상단 필터 + 일괄처리 바 ── */}
                <div className="bg-white rounded-lg shadow-sm p-4 border border-orange-100 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <h2 className="text-base font-semibold text-gray-800">🛡️ 고객 수정 신청 검토</h2>
                            <p className="text-xs text-gray-500 mt-0.5">일별·사용자별로 그룹화된 수정 요청을 검토하고 승인/반려합니다.</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            {FILTER_BUTTONS.map(btn => {
                                const active = statusFilter === btn.value;
                                return (
                                    <button key={btn.value} onClick={() => { setStatusFilter(btn.value); setCheckedIds(new Set()); }}
                                        className={`px-3 py-1.5 text-xs rounded-md border transition-colors whitespace-nowrap ${active ? 'bg-orange-500 border-orange-500 text-white' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
                                        {btn.label}
                                    </button>
                                );
                            })}
                            <button onClick={loadRequests} className="px-3 py-1.5 text-xs rounded-md bg-blue-600 text-white hover:bg-blue-700">새로고침</button>
                        </div>
                    </div>

                    {/* 일괄처리 영역 */}
                    {checkedIds.size > 0 && (
                        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-orange-100">
                            <span className="text-xs font-medium text-orange-700">✔ {checkedIds.size}건 선택됨</span>
                            <input
                                value={bulkNote}
                                onChange={e => setBulkNote(e.target.value)}
                                placeholder="일괄 처리 메모 (선택)"
                                className="flex-1 min-w-[180px] px-2 py-1 text-xs border border-gray-300 rounded"
                            />
                            <button onClick={() => applyBulkStatus('approved')} disabled={processing}
                                className="px-4 py-1.5 text-xs rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-60 font-medium">
                                ✅ 일괄 승인
                            </button>
                            <button onClick={() => applyBulkStatus('rejected')} disabled={processing}
                                className="px-4 py-1.5 text-xs rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-60 font-medium">
                                ❌ 일괄 반려
                            </button>
                            <button onClick={() => setCheckedIds(new Set())}
                                className="px-3 py-1.5 text-xs rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50">
                                선택 해제
                            </button>
                        </div>
                    )}
                </div>

                {/* ── 그룹화 테이블 ── */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
                    {/* 테이블 헤더 */}
                    <div className="grid grid-cols-[32px_130px_120px_1fr_1fr_70px_140px_60px] items-center bg-gray-50 border-b border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600">
                        <div className="flex items-center justify-center">
                            {pendingIds.length > 0 && (
                                <input type="checkbox" checked={allChecked} onChange={toggleAll}
                                    className="rounded border-gray-300 text-orange-500 focus:ring-orange-400 w-3.5 h-3.5" />
                            )}
                        </div>
                        <div>서비스</div>
                        <div>필드</div>
                        <div>🔵 기존값</div>
                        <div>🟠 수정요청</div>
                        <div className="text-center">상태</div>
                        <div>신청일시</div>
                        <div className="text-center">상세</div>
                    </div>

                    {loading ? (
                        <div className="py-10 text-center text-sm text-gray-500">불러오는 중...</div>
                    ) : requests.length === 0 ? (
                        <div className="py-10 text-center text-sm text-gray-500">조회된 수정 요청이 없습니다.</div>
                    ) : (
                        <div>
                            {groupedRequests.map(dateGroup => {
                                const datePendingIds = dateGroup.users.flatMap(u => u.rows.filter(r => r.status === 'pending').map(r => r.id));
                                const dateAllChecked = datePendingIds.length > 0 && datePendingIds.every(id => checkedIds.has(id));
                                return (
                                    <div key={dateGroup.date}>
                                        {/* 날짜 그룹 헤더 */}
                                        <div className="grid grid-cols-[32px_1fr] items-center bg-orange-50 border-b border-orange-100 px-3 py-1.5">
                                            <div className="flex items-center justify-center">
                                                {datePendingIds.length > 0 && (
                                                    <input type="checkbox" checked={dateAllChecked}
                                                        onChange={() => toggleGroupDate(dateGroup)}
                                                        className="rounded border-gray-300 text-orange-500 w-3.5 h-3.5" />
                                                )}
                                            </div>
                                            <div className="text-xs font-bold text-orange-700">
                                                📅 {dateGroup.date}
                                                <span className="ml-2 text-orange-500 font-normal">
                                                    ({dateGroup.users.reduce((s, u) => s + u.rows.length, 0)}건)
                                                </span>
                                            </div>
                                        </div>

                                        {dateGroup.users.map(userGroup => {
                                            const userPendingIds = userGroup.rows.filter(r => r.status === 'pending').map(r => r.id);
                                            const userAllChecked = userPendingIds.length > 0 && userPendingIds.every(id => checkedIds.has(id));
                                            return (
                                                <div key={userGroup.userId}>
                                                    {/* 사용자 서브헤더 */}
                                                    <div className="grid grid-cols-[32px_1fr] items-center bg-blue-50 border-b border-blue-100 px-3 py-1">
                                                        <div className="flex items-center justify-center">
                                                            {userPendingIds.length > 0 && (
                                                                <input type="checkbox" checked={userAllChecked}
                                                                    onChange={() => toggleGroupUser(userGroup.rows)}
                                                                    className="rounded border-gray-300 text-blue-500 w-3.5 h-3.5" />
                                                            )}
                                                        </div>
                                                        <div className="text-xs font-semibold text-blue-700">
                                                            👤 {userGroup.userName}
                                                            <span className="ml-1.5 text-blue-400 font-normal text-[11px]">{userGroup.email}</span>
                                                            <span className="ml-2 text-blue-500 font-normal">({userGroup.rows.length}건)</span>
                                                        </div>
                                                    </div>

                                                    {/* 행 목록 */}
                                                    {userGroup.rows.map(row => {
                                                        const st = STATUS_MAP[row.status] || STATUS_MAP.cancelled;
                                                        const isSelected = selectedRequest?.id === row.id;
                                                        const isPending = row.status === 'pending';
                                                        const changedRows = getSnapshotChangedRows(row);
                                                        const displayRows = changedRows.length > 0
                                                            ? changedRows
                                                            : [{ field: '', before: '-', after: '-' }];

                                                        return displayRows.map((changedRow, index) => (
                                                            <div key={`${row.id}-${changedRow.field || 'empty'}-${index}`}
                                                                className={`grid grid-cols-[32px_130px_120px_1fr_1fr_70px_140px_60px] items-start px-3 py-2 border-b border-gray-100 text-xs hover:bg-gray-50 transition-colors ${isSelected ? 'bg-blue-50' : ''}`}>
                                                                <div className="flex items-center justify-center">
                                                                    {isPending ? (
                                                                        <input type="checkbox" checked={checkedIds.has(row.id)}
                                                                            onChange={() => toggleOne(row.id)}
                                                                            className="rounded border-gray-300 text-orange-500 w-3.5 h-3.5" />
                                                                    ) : <span className="w-3.5 h-3.5" />}
                                                                </div>
                                                                <div>
                                                                    <span className="font-medium text-gray-800">{TYPE_NAME_MAP[row.re_type] || row.re_type}</span>
                                                                </div>
                                                                <div className="text-gray-700 font-medium truncate">{changedRow.field ? getFieldLabel(changedRow.field) : '-'}</div>
                                                                <div className="text-gray-500 truncate">{formatDisplayValue(changedRow.before)}</div>
                                                                <div className="text-orange-700 font-medium truncate">{formatDisplayValue(changedRow.after)}</div>
                                                                <div className="text-center">
                                                                    <span className={`px-1.5 py-0.5 rounded-full text-[11px] ${st.cls}`}>{st.label}</span>
                                                                </div>
                                                                <div className="text-gray-500">
                                                                    {new Date(row.submitted_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                                                </div>
                                                                <div className="text-center">
                                                                    <button onClick={() => loadComparison(row)}
                                                                        className={`px-2 py-1 text-[11px] rounded border transition-colors ${isSelected ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600 hover:bg-gray-100'}`}>
                                                                        {isSelected ? '닫기' : '상세'}
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ));
                                                    })}
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* ── 상세 비교 패널 ── */}
                {selectedRequest && (
                    <div className="bg-white rounded-lg shadow-sm border border-blue-200 p-4 space-y-4">
                        <div className="flex items-center justify-between border-b border-gray-200 pb-3">
                            <div>
                                <h3 className="text-sm font-semibold text-gray-800">
                                    {TYPE_NAME_MAP[selectedRequest.re_type] || selectedRequest.re_type} 수정 비교
                                </h3>
                                <p className="text-xs text-gray-500 mt-0.5">
                                    예약ID: {selectedRequest.reservation_id.slice(0, 8)}...
                                    {' · '}신청: {new Date(selectedRequest.submitted_at).toLocaleString('ko-KR')}
                                    {' · '}{userMap[selectedRequest.requester_user_id]?.name || '-'}
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_MAP[selectedRequest.status]?.cls || ''}`}>
                                    {STATUS_MAP[selectedRequest.status]?.label || selectedRequest.status}
                                </span>
                                <button onClick={() => { setSelectedRequest(null); setBaseData(null); setTempData(null); }}
                                    className="text-xs text-gray-400 hover:text-gray-600 px-2 py-0.5 border border-gray-200 rounded">✕ 닫기</button>
                            </div>
                        </div>

                        {selectedRequest.customer_note && (
                            <div className="text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded p-2">
                                � 고객 메모: {selectedRequest.customer_note}
                            </div>
                        )}

                        {detailLoading ? (
                            <div className="flex justify-center items-center h-24">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
                            </div>
                        ) : (
                            <>
                                {changedFields.length === 0 ? (
                                    !tempData ? (
                                        <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded p-3">임시 저장 데이터가 없습니다.</div>
                                    ) : (
                                        <div className="text-sm text-gray-600 bg-gray-50 rounded p-3">변경된 필드가 없습니다.</div>
                                    )
                                ) : (
                                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                                        <div className="grid grid-cols-[180px_1fr_1fr] bg-gray-50 text-xs font-medium text-gray-700 border-b border-gray-200">
                                            <div className="px-3 py-2 border-r border-gray-200">필드</div>
                                            <div className="px-3 py-2 border-r border-gray-200">🔵 기존값</div>
                                            <div className="px-3 py-2">🟠 수정요청</div>
                                        </div>
                                        <div className="divide-y divide-gray-100">
                                            {changedFields.map(row => (
                                                <div key={row.field} className="grid grid-cols-[180px_1fr_1fr] text-xs hover:bg-gray-50">
                                                    <div className="px-3 py-2 border-r border-gray-100 text-gray-700 font-medium">{getFieldLabel(row.field)}</div>
                                                    <div className="px-3 py-2 border-r border-gray-100 text-gray-600 break-all">{formatDisplayValue(row.before)}</div>
                                                    <div className="px-3 py-2 text-orange-700 font-medium break-all">{formatDisplayValue(row.after)}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {selectedRequest.snapshot_data && (
                                    <details className="text-xs">
                                        <summary className="cursor-pointer text-gray-500 hover:text-gray-700">📷 요청 시점 원본 스냅샷 보기</summary>
                                        <pre className="mt-2 p-3 bg-gray-50 rounded border border-gray-200 overflow-auto max-h-48 text-xs text-gray-600">
                                            {JSON.stringify(selectedRequest.snapshot_data, null, 2)}
                                        </pre>
                                    </details>
                                )}

                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-gray-700">📝 매니저 메모</label>
                                    <textarea value={managerNote} onChange={e => setManagerNote(e.target.value)}
                                        rows={2} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md"
                                        placeholder="승인/반려 사유를 기록하세요"
                                        disabled={selectedRequest.status !== 'pending'} />
                                </div>

                                {selectedRequest.status === 'pending' && (
                                    <div className="flex gap-2">
                                        <button onClick={() => applyStatus('approved')}
                                            disabled={processing || !canApproveSelectedRequest}
                                            className="px-5 py-2 text-sm rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-60 font-medium">
                                            ✅ 승인
                                        </button>
                                        <button onClick={() => applyStatus('rejected')}
                                            disabled={processing}
                                            className="px-5 py-2 text-sm rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-60 font-medium">
                                            ❌ 반려
                                        </button>
                                    </div>
                                )}

                                {selectedRequest.status !== 'pending' && selectedRequest.reviewed_at && (
                                    <div className="text-xs text-gray-500 pt-2 border-t border-gray-100">
                                        처리일: {new Date(selectedRequest.reviewed_at).toLocaleString('ko-KR')}
                                        {selectedRequest.manager_note && ` · 사유: ${selectedRequest.manager_note}`}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}
            </div>
        </ManagerLayout>
    );
}
