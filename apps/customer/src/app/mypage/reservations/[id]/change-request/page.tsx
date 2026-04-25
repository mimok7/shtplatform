"use client";

import React, { useEffect, useState, Suspense, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import supabase from '@/lib/supabase';
import { getSessionUser } from '@/lib/authHelpers';
import { formatKst, toInputDateTime, toDbDateTimeKst } from '@/lib/kstDateTime';
import { isLocationFieldKey, normalizeLocationEnglishUpper } from '@/lib/locationInput';
import PageWrapper from '@/components/PageWrapper';

/* ─── 타입 ─── */
type ServiceType = 'cruise' | 'airport' | 'hotel' | 'rentcar' | 'tour' | 'sht_car' | 'sht' | 'car';

interface FieldConfig {
    key: string;
    label: string;
    type: string;
    enrichedOnly?: boolean; // 가격 테이블에서 조인된 필드 (change 테이블에 컬럼 없음)
}

/* ─── 서비스 → 테이블 매핑 ─── */
const BASE_TABLE: Record<string, string> = {
    airport: 'reservation_airport',
    hotel: 'reservation_hotel',
    rentcar: 'reservation_rentcar',
    tour: 'reservation_tour',
    cruise: 'reservation_cruise',
    car_sht: 'reservation_car_sht',
    sht_car: 'reservation_car_sht',
    sht: 'reservation_car_sht',
    car: 'reservation_cruise_car',
    cruise_car: 'reservation_cruise_car',
};

const CHANGE_TABLE: Record<string, string> = {
    airport: 'reservation_change_airport',
    hotel: 'reservation_change_hotel',
    rentcar: 'reservation_change_rentcar',
    tour: 'reservation_change_tour',
    cruise: 'reservation_change_cruise',
    car_sht: 'reservation_change_car_sht',
    sht_car: 'reservation_change_car_sht',
    sht: 'reservation_change_car_sht',
    car: 'reservation_change_cruise_car',
    cruise_car: 'reservation_change_cruise_car',
};

const RE_TYPE_MAP: Record<string, string> = {
    airport: 'airport',
    hotel: 'hotel',
    rentcar: 'rentcar',
    tour: 'tour',
    cruise: 'cruise',
    car_sht: 'car_sht',
    sht_car: 'car_sht',
    sht: 'car_sht',
    car: 'cruise_car',
    cruise_car: 'cruise_car',
};

/* ─── 서비스별 필드 설정 (view 페이지의 모든 표시 필드 포함) ─── */
const FIELDS_CONFIG: Record<string, FieldConfig[]> = {
    cruise: [
        { key: 'cruise_name', label: '🚢 크루즈명', type: 'text', enrichedOnly: true },
        { key: 'room_type', label: '🚪 객실 타입', type: 'text', enrichedOnly: true },
        { key: 'schedule_type', label: '📅 스케줄', type: 'text', enrichedOnly: true },
        { key: 'checkin', label: '🗓️ 승선일', type: 'date' },
        { key: 'guest_count', label: '👥 탑승 인원', type: 'number' },
        { key: 'adult_count', label: '🧑 성인', type: 'number' },
        { key: 'child_count', label: '👶 아동', type: 'number' },
        { key: 'infant_count', label: '👼 유아', type: 'number' },
        { key: 'child_extra_bed_count', label: '🛏️ 아동(엑베)', type: 'number' },
        { key: 'extra_bed_count', label: '🛏️ 엑스트라베드', type: 'number' },
        { key: 'single_count', label: '👤 싱글', type: 'number' },
        { key: 'boarding_code', label: '🎫 승선 코드', type: 'text' },
        { key: 'request_note', label: '📝 요청사항', type: 'textarea' },
    ],
    airport: [
        { key: 'service_type', label: '🛣️ 구분(픽업/샌딩)', type: 'text', enrichedOnly: true },
        { key: 'route', label: '🛣️ 경로', type: 'text', enrichedOnly: true },
        { key: 'vehicle_type', label: '🚗 차량 타입', type: 'text', enrichedOnly: true },
        { key: 'ra_airport_location', label: '📍 장소', type: 'text' },
        { key: 'ra_flight_number', label: '✈️ 항공편', type: 'text' },
        { key: 'ra_datetime', label: '🕐 일시', type: 'datetime-local' },
        { key: 'ra_stopover_location', label: '🔄 경유지', type: 'text' },
        { key: 'ra_stopover_wait_minutes', label: '⏱️ 경유 대기(분)', type: 'number' },
        { key: 'ra_car_count', label: '🚗 차량 수', type: 'number' },
        { key: 'ra_passenger_count', label: '👥 승객 수', type: 'number' },
        { key: 'ra_luggage_count', label: '🧳 수하물 수', type: 'number' },
        { key: 'accommodation_info', label: '🏨 숙소 정보', type: 'text' },
        { key: 'dispatch_code', label: '📦 차량번호', type: 'text' },
        { key: 'request_note', label: '📝 요청사항', type: 'textarea' },
    ],
    hotel: [
        { key: 'hotel_name', label: '🏨 호텔명', type: 'text', enrichedOnly: true },
        { key: 'room_name', label: '🚪 객실명', type: 'text', enrichedOnly: true },
        { key: 'hotel_category', label: '⭐ 호텔 등급', type: 'text' },
        { key: 'checkin_date', label: '📅 체크인', type: 'date' },
        { key: 'schedule', label: '📅 숙박일정', type: 'text' },
        { key: 'guest_count', label: '👥 총 인원', type: 'number' },
        { key: 'adult_count', label: '🧑 성인', type: 'number' },
        { key: 'child_count', label: '👶 아동', type: 'number' },
        { key: 'infant_count', label: '👼 유아', type: 'number' },
        { key: 'breakfast_service', label: '🍳 조식', type: 'text' },
        { key: 'assignment_code', label: '🏛️ 호텔 코드', type: 'text' },
        { key: 'request_note', label: '📝 요청사항', type: 'textarea' },
    ],
    rentcar: [
        { key: 'way_type', label: '🛣️ 이용방식', type: 'text', enrichedOnly: true },
        { key: 'route', label: '🛣️ 경로', type: 'text', enrichedOnly: true },
        { key: 'vehicle_type', label: '🚗 차종', type: 'text', enrichedOnly: true },
        { key: 'car_count', label: '🚗 차량 수', type: 'number' },
        { key: 'passenger_count', label: '👥 승객 수', type: 'number' },
        { key: 'luggage_count', label: '🧳 수하물', type: 'number' },
        { key: 'pickup_datetime', label: '🕐 픽업 시간 (Ⅰ)', type: 'datetime-local' },
        { key: 'pickup_location', label: '📍 승차 위치 (Ⅰ)', type: 'text' },
        { key: 'destination', label: '🎯 하차 위치 (Ⅰ)', type: 'text' },
        { key: 'via_location', label: '🔄 경유지 (Ⅰ)', type: 'text' },
        { key: 'via_waiting', label: '⏱️ 경유 대기 (Ⅰ)', type: 'text' },
        { key: 'return_datetime', label: '🕐 픽업 시간 (Ⅱ)', type: 'datetime-local' },
        { key: 'return_pickup_location', label: '📍 승차 위치 (Ⅱ)', type: 'text' },
        { key: 'return_destination', label: '🎯 하차 위치 (Ⅱ)', type: 'text' },
        { key: 'return_via_location', label: '🔄 경유지 (Ⅱ)', type: 'text' },
        { key: 'return_via_waiting', label: '⏱️ 경유 대기 (Ⅱ)', type: 'text' },
        { key: 'dispatch_code', label: '📦 차량번호', type: 'text' },
        { key: 'request_note', label: '📝 요청사항', type: 'textarea' },
    ],
    tour: [
        { key: 'tour_name', label: '🏞️ 투어명', type: 'text', enrichedOnly: true },
        { key: 'tour_vehicle', label: '🚙 차량', type: 'text', enrichedOnly: true },
        { key: 'tour_type', label: '🎫 투어 타입', type: 'text', enrichedOnly: true },
        { key: 'usage_date', label: '📅 투어 날짜', type: 'date' },
        { key: 'tour_capacity', label: '👥 정원', type: 'number' },
        { key: 'adult_count', label: '🧑 성인', type: 'number' },
        { key: 'child_count', label: '👶 아동', type: 'number' },
        { key: 'infant_count', label: '👼 유아', type: 'number' },
        { key: 'pickup_location', label: '📍 픽업 장소', type: 'text' },
        { key: 'dropoff_location', label: '🎯 하차 장소', type: 'text' },
        { key: 'request_note', label: '📝 요청사항', type: 'textarea' },
    ],
    car_sht: [
        { key: 'vehicle_number', label: '🔢 차량번호', type: 'text' },
        { key: 'sht_category', label: '🚙 차량 분류', type: 'text' },
        { key: 'seat_number', label: '💺 좌석번호', type: 'text' },
        { key: 'car_type', label: '🚙 차종', type: 'text', enrichedOnly: true },
        { key: 'car_category', label: '🏷️ 차량 카테고리', type: 'text', enrichedOnly: true },
        { key: 'usage_date', label: '📅 사용일', type: 'date' },
        { key: 'pickup_location', label: '📍 승차 위치', type: 'text' },
        { key: 'dropoff_location', label: '🎯 하차 위치', type: 'text' },
        { key: 'passenger_count', label: '👥 승객 수', type: 'number' },
        { key: 'request_note', label: '📝 요청사항', type: 'textarea' },
    ],
    cruise_car: [
        { key: 'way_type', label: '🛣️ 이용방식', type: 'text' },
        { key: 'route', label: '🛣️ 경로', type: 'text' },
        { key: 'vehicle_type', label: '🚗 차종', type: 'text' },
        { key: 'car_passenger_capacity', label: '👥 차량 정원', type: 'number', enrichedOnly: true },
        { key: 'pickup_datetime', label: '🕐 픽업 시간', type: 'datetime-local' },
        { key: 'pickup_location', label: '📍 승차 위치', type: 'text' },
        { key: 'dropoff_location', label: '🎯 하차 위치', type: 'text' },
        { key: 'car_count', label: '🚗 차량 수', type: 'number' },
        { key: 'passenger_count', label: '👥 탑승 인원', type: 'number' },
        { key: 'dispatch_code', label: '📦 차량번호', type: 'text' },
        { key: 'request_note', label: '📝 요청사항', type: 'textarea' },
    ],
};
FIELDS_CONFIG['sht_car'] = FIELDS_CONFIG['car_sht'];
FIELDS_CONFIG['sht'] = FIELDS_CONFIG['car_sht'];
FIELDS_CONFIG['car'] = FIELDS_CONFIG['cruise_car'];

/* ─── 헬퍼 함수 ─── */
function getTypeIcon(type: string) {
    switch (type) {
        case 'cruise': return '🚢'; case 'airport': return '✈️'; case 'hotel': return '🏨';
        case 'rentcar': return '🚗'; case 'tour': return '🎫';
        case 'sht_car': case 'sht': return '🚙'; case 'car': return '🚙';
        default: return '📋';
    }
}

function getTypeName(type: string) {
    switch (type) {
        case 'cruise': return '크루즈'; case 'airport': return '공항 서비스'; case 'hotel': return '호텔';
        case 'rentcar': return '렌터카'; case 'tour': return '투어';
        case 'sht_car': case 'sht': return '스하차량'; case 'car': return '크루즈 차량';
        default: return type;
    }
}

function formatDisplayValue(key: string, value: any): string {
    if (value === null || value === undefined || value === '') return '-';
    if (key === 'usage_date' && typeof value === 'string') {
        const d = new Date(value);
        if (!isNaN(d.getTime())) return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
    }
    if (typeof value === 'string' && /\d{4}-\d{2}-\d{2}/.test(value)) {
        if (value.includes('T') || value.includes(':')) return formatKst(value);
        const d = new Date(value);
        if (!isNaN(d.getTime())) return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
    }
    if (typeof value === 'number') return value.toLocaleString('ko-KR');
    if (typeof value === 'boolean') return value ? '예' : '아니오';
    return String(value);
}

function toInputValue(key: string, value: any, fieldType: string): string {
    if (value === null || value === undefined) return '';
    if (fieldType === 'datetime-local') return toInputDateTime(String(value));
    if (fieldType === 'date') {
        if (typeof value === 'string') return value.slice(0, 10);
        return '';
    }
    return String(value);
}

/* ─── 메인 컴포넌트 ─── */
function ChangeRequestInner() {
    const router = useRouter();
    const params = useParams();
    const reservationId = params?.id as string;

    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [reservation, setReservation] = useState<any>(null);
    const [quoteTitle, setQuoteTitle] = useState<string>('');
    const [serviceItems, setServiceItems] = useState<any[]>([]);
    const [editForms, setEditForms] = useState<Record<string, any>[]>([]);
    const [customerNote, setCustomerNote] = useState('');
    const [existingPending, setExistingPending] = useState<any>(null);
    const [selectedItemIdx, setSelectedItemIdx] = useState(0);

    /* ─── 가격 테이블 보강 (view 페이지와 동일) ─── */
    const enrichServiceItems = useCallback(async (items: any[], reType: string) => {
        if (reType === 'cruise') {
            const roomPriceCodes = items.map(it => it.room_price_code).filter(Boolean);
            if (roomPriceCodes.length === 0) return items;
            const { data: rateCards } = await supabase
                .from('cruise_rate_card')
                .select('id, cruise_name, room_type, schedule_type, price_adult, price_child, price_infant')
                .in('id', roomPriceCodes);
            const rcMap = new Map((rateCards || []).map((rc: any) => [rc.id, rc]));
            return items.map(item => {
                const rc = rcMap.get(item.room_price_code) as any;
                if (!rc) return item;
                return { ...item, cruise_name: rc.cruise_name, room_type: rc.room_type, schedule_type: rc.schedule_type };
            });
        }

        if (reType === 'airport') {
            return Promise.all(items.map(async (item) => {
                if (!item.airport_price_code) return item;
                const { data } = await supabase.from('airport_price')
                    .select('service_type, route, vehicle_type')
                    .eq('airport_code', item.airport_price_code).maybeSingle();
                return data ? { ...item, service_type: data.service_type, route: data.route, vehicle_type: data.vehicle_type } : item;
            }));
        }

        if (reType === 'hotel') {
            return Promise.all(items.map(async (item) => {
                if (!item.hotel_price_code) return item;
                const { data } = await supabase.from('hotel_price')
                    .select('hotel_name, room_name, room_category')
                    .eq('hotel_price_code', item.hotel_price_code).maybeSingle();
                return data ? { ...item, hotel_name: data.hotel_name, room_name: data.room_name } : item;
            }));
        }

        if (reType === 'rentcar') {
            return Promise.all(items.map(async (item) => {
                if (!item.rentcar_price_code) return item;
                const { data } = await supabase.from('rentcar_price')
                    .select('way_type, route, vehicle_type, capacity')
                    .eq('rent_code', item.rentcar_price_code).maybeSingle();
                return data ? { ...item, way_type: data.way_type || item.way_type, route: data.route, vehicle_type: data.vehicle_type } : item;
            }));
        }

        if (reType === 'tour') {
            return Promise.all(items.map(async (item) => {
                if (!item.tour_price_code) return item;
                const { data } = await supabase.from('tour_pricing')
                    .select('pricing_id, vehicle_type, tour_type, tour:tour_id(tour_name)')
                    .eq('pricing_id', item.tour_price_code).maybeSingle();
                return data ? { ...item, tour_name: (data as any).tour?.tour_name, tour_vehicle: data.vehicle_type, tour_type: (data as any).tour_type } : item;
            }));
        }

        if (reType === 'sht_car' || reType === 'sht' || reType === 'car_sht') {
            return Promise.all(items.map(async (item) => {
                if (!item.car_price_code) return item;
                try {
                    const { data } = await supabase.from('rentcar_price')
                        .select('way_type, route, vehicle_type, capacity')
                        .eq('rent_code', item.car_price_code).maybeSingle();
                    if (data) return { ...item, car_type: data.vehicle_type, car_category: data.way_type };
                } catch { /* ignore */ }
                return item;
            }));
        }

        if (reType === 'car' || reType === 'cruise_car') {
            return Promise.all(items.map(async (item) => {
                const priceCode = item.rentcar_price_code || item.car_price_code;
                if (!priceCode) return item;
                try {
                    const { data } = await supabase.from('rentcar_price')
                        .select('way_type, route, vehicle_type, capacity')
                        .eq('rent_code', priceCode).maybeSingle();
                    if (data) return {
                        ...item,
                        way_type: item.way_type || data.way_type,
                        route: item.route || data.route,
                        vehicle_type: item.vehicle_type || data.vehicle_type,
                        car_passenger_capacity: data.capacity,
                    };
                } catch { /* ignore */ }
                return item;
            }));
        }

        return items;
    }, []);

    /* ─── 데이터 로드 ─── */
    useEffect(() => {
        if (!reservationId) return;
        (async () => {
            try {
                setLoading(true);
                const { user } = await getSessionUser(8000);
                if (!user) { router.push('/login'); return; }

                const { data: row, error: rErr } = await supabase
                    .from('reservation')
                    .select('*')
                    .eq('re_id', reservationId)
                    .eq('re_user_id', user.id)
                    .maybeSingle();
                if (rErr) throw rErr;
                if (!row) { setError('예약이 없거나 접근 권한이 없습니다.'); return; }
                setReservation(row);

                if (row.re_quote_id) {
                    const { data: q } = await supabase.from('quote').select('title').eq('id', row.re_quote_id).maybeSingle();
                    if (q?.title) setQuoteTitle(q.title);
                }

                // 기존 pending 요청 확인
                const reType = RE_TYPE_MAP[row.re_type] || row.re_type;
                const { data: pending } = await supabase
                    .from('reservation_change_request')
                    .select('id, status, submitted_at, customer_note')
                    .eq('reservation_id', reservationId)
                    .eq('re_type', reType)
                    .eq('status', 'pending')
                    .maybeSingle();
                if (pending) setExistingPending(pending);

                // 서비스 상세 조회
                const baseTable = BASE_TABLE[row.re_type];
                if (!baseTable) { setError('지원하지 않는 서비스 타입입니다.'); return; }

                const { data: svcData } = await supabase
                    .from(baseTable)
                    .select('*')
                    .eq('reservation_id', reservationId)
                    .order('created_at', { ascending: true });

                const items = Array.isArray(svcData) ? svcData : (svcData ? [svcData] : []);

                // 가격 정보로 보강
                const enriched = await enrichServiceItems(items, row.re_type);
                setServiceItems(enriched);

                // 수정 폼 초기값 (enrichedOnly 포함 모든 필드)
                const fields = FIELDS_CONFIG[row.re_type] || FIELDS_CONFIG[RE_TYPE_MAP[row.re_type]] || [];
                setEditForms(enriched.map((item: any) => {
                    const form: Record<string, any> = {};
                    fields.forEach(f => {
                        form[f.key] = item[f.key] ?? '';
                    });
                    return form;
                }));
            } catch (e: any) {
                setError(e?.message || '데이터 로드 중 오류.');
            } finally {
                setLoading(false);
            }
        })();
    }, [reservationId, enrichServiceItems, router]);

    /* ─── 폼 변경 핸들러 ─── */
    const handleFieldChange = useCallback((itemIdx: number, key: string, value: any) => {
        const nextValue = typeof value === 'string' && isLocationFieldKey(key)
            ? normalizeLocationEnglishUpper(value)
            : value;
        setEditForms(prev => {
            const next = [...prev];
            next[itemIdx] = { ...next[itemIdx], [key]: nextValue };
            return next;
        });
    }, []);

    /* ─── 변경사항 확인 ─── */
    const hasChanges = useCallback((itemIdx: number) => {
        if (!serviceItems[itemIdx] || !editForms[itemIdx]) return false;
        const fields = FIELDS_CONFIG[reservation?.re_type] || FIELDS_CONFIG[RE_TYPE_MAP[reservation?.re_type]] || [];
        return fields.some(f => {
            const original = serviceItems[itemIdx][f.key];
            const edited = editForms[itemIdx][f.key];
            const origStr = original === null || original === undefined ? '' : String(original);
            const editStr = edited === null || edited === undefined ? '' : String(edited);
            if (f.type === 'datetime-local') return toInputDateTime(origStr) !== toInputDateTime(editStr);
            if (f.type === 'date') return origStr.slice(0, 10) !== editStr.slice(0, 10);
            return origStr !== editStr;
        });
    }, [serviceItems, editForms, reservation]);

    const getChangedFields = useCallback((itemIdx: number) => {
        if (!serviceItems[itemIdx] || !editForms[itemIdx]) return [];
        const fields = FIELDS_CONFIG[reservation?.re_type] || FIELDS_CONFIG[RE_TYPE_MAP[reservation?.re_type]] || [];
        return fields.filter(f => {
            const original = serviceItems[itemIdx][f.key];
            const edited = editForms[itemIdx][f.key];
            const origStr = original === null || original === undefined ? '' : String(original);
            const editStr = edited === null || edited === undefined ? '' : String(edited);
            if (f.type === 'datetime-local') return toInputDateTime(origStr) !== toInputDateTime(editStr);
            if (f.type === 'date') return origStr.slice(0, 10) !== editStr.slice(0, 10);
            return origStr !== editStr;
        });
    }, [serviceItems, editForms, reservation]);

    const anyChanges = editForms.some((_, idx) => hasChanges(idx));

    /* ─── 제출 ─── */
    const handleSubmit = async () => {
        if (!reservation || submitting) return;
        if (!anyChanges) { alert('변경된 항목이 없습니다.'); return; }
        if (!confirm('수정 요청을 제출하시겠습니까?\n매니저 승인 후 반영됩니다.')) return;

        setSubmitting(true);
        try {
            const { user } = await getSessionUser(8000);
            if (!user) throw new Error('로그인이 필요합니다.');

            const reType = RE_TYPE_MAP[reservation.re_type] || reservation.re_type;
            const changeTable = CHANGE_TABLE[reservation.re_type];
            const fields = FIELDS_CONFIG[reservation.re_type] || FIELDS_CONFIG[reType] || [];

            // enrichedOnly 변경 수집
            const enrichedChanges: Record<string, { field: string; from: string; to: string }[]> = {};
            for (let i = 0; i < serviceItems.length; i++) {
                if (!hasChanges(i)) continue;
                const changed = getChangedFields(i).filter(f => f.enrichedOnly);
                if (changed.length > 0) {
                    enrichedChanges[String(i)] = changed.map(f => ({
                        field: f.label.replace(/^[^\s]+\s/, ''),
                        from: formatDisplayValue(f.key, serviceItems[i][f.key]),
                        to: formatDisplayValue(f.key, editForms[i][f.key]),
                    }));
                }
            }

            // enrichedOnly 변경사항을 customer_note에 자동 추가
            let finalNote = customerNote || '';
            const enrichedLines: string[] = [];
            Object.entries(enrichedChanges).forEach(([idx, changes]) => {
                changes.forEach(c => {
                    enrichedLines.push(`[${Number(idx) + 1}번 항목] ${c.field}: ${c.from} → ${c.to}`);
                });
            });
            if (enrichedLines.length > 0) {
                const autoNote = `\n[자동] 서비스 옵션 변경 요청:\n${enrichedLines.join('\n')}`;
                finalNote = finalNote ? finalNote + autoNote : autoNote.trim();
            }

            // 원본+요청 스냅샷
            const snapshot = {
                original: serviceItems.map(item => ({ ...item })),
                requested: editForms.map((form, idx) => {
                    const result: Record<string, any> = {};
                    fields.forEach(f => {
                        result[f.key] = form[f.key] ?? serviceItems[idx]?.[f.key] ?? null;
                    });
                    return result;
                }),
            };

            // 헤더 생성
            const { data: requestRow, error: hdrErr } = await supabase
                .from('reservation_change_request')
                .insert({
                    reservation_id: reservationId,
                    re_type: reType,
                    requester_user_id: user.id,
                    status: 'pending',
                    customer_note: finalNote || null,
                    snapshot_data: snapshot,
                })
                .select('id')
                .single();
            if (hdrErr) throw hdrErr;

            // 서비스별 변경 데이터 저장 (enrichedOnly 제외 = DB 컬럼만)
            for (let i = 0; i < serviceItems.length; i++) {
                if (!hasChanges(i)) continue;

                const payload: Record<string, any> = {
                    request_id: requestRow.id,
                    reservation_id: reservationId,
                };

                // 가격 코드 필드 보존
                const item = serviceItems[i];
                const codeFields = ['airport_price_code', 'hotel_price_code', 'rentcar_price_code',
                    'tour_price_code', 'room_price_code', 'car_price_code'];
                codeFields.forEach(cf => {
                    if (item[cf] !== undefined) payload[cf] = item[cf];
                });

                // DB 컬럼 필드만 적용
                fields.filter(f => !f.enrichedOnly).forEach(f => {
                    let val = editForms[i][f.key];
                    if (f.type === 'datetime-local' && val) val = toDbDateTimeKst(val);
                    if (f.type === 'number' && val !== '' && val !== null && val !== undefined) val = Number(val);
                    if (val === '') val = null;
                    payload[f.key] = val;
                });

                const { error: detErr } = await supabase.from(changeTable).insert(payload);
                if (detErr) throw detErr;
            }

            alert('수정 요청이 제출되었습니다.\n매니저 확인 후 반영됩니다.');
            router.push(`/mypage/reservations/${reservationId}/view`);
        } catch (e: any) {
            console.error('수정 요청 제출 실패:', e);
            alert(`제출 중 오류가 발생했습니다: ${e?.message || '알 수 없는 오류'}`);
        } finally {
            setSubmitting(false);
        }
    };

    /* ─── 렌더링 ─── */
    if (loading) {
        return (
            <PageWrapper>
                <div className="flex flex-col justify-center items-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
                    <p className="mt-4 text-gray-600">데이터를 불러오는 중...</p>
                </div>
            </PageWrapper>
        );
    }

    if (error || !reservation) {
        return (
            <PageWrapper>
                <div className="text-center py-12">
                    <div className="text-6xl mb-4">⚠️</div>
                    <p className="text-sm text-gray-600 mb-4">{error || '예약 정보를 찾을 수 없습니다.'}</p>
                    <button onClick={() => router.back()} className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm">
                        돌아가기
                    </button>
                </div>
            </PageWrapper>
        );
    }

    const reType = reservation.re_type;
    const fields = FIELDS_CONFIG[reType] || FIELDS_CONFIG[RE_TYPE_MAP[reType]] || [];

    return (
        <PageWrapper>
            <div className="space-y-6 max-w-4xl mx-auto pb-8">
                {/* 헤더 */}
                <div className="bg-gradient-to-r from-orange-500 to-orange-600 rounded-xl p-6 text-white shadow-lg">
                    <div className="flex items-start justify-between">
                        <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                                <span className="text-4xl">✏️</span>
                                <div>
                                    <h1 className="text-2xl font-bold">{getTypeName(reType)} 수정 요청</h1>
                                    <p className="text-orange-100 text-sm mt-1">{quoteTitle || '예약 수정'}</p>
                                </div>
                            </div>
                            <p className="text-orange-100 text-sm mt-2">
                                아래 원본 정보를 확인하고, 수정할 내용을 변경 후 요청해 주세요.
                            </p>
                        </div>
                        <button
                            onClick={() => router.push(`/mypage/reservations/${reservationId}/view`)}
                            className="px-4 py-2 bg-white bg-opacity-20 hover:bg-opacity-30 text-white rounded-lg transition-all text-sm font-medium shrink-0"
                        >
                            ← 상세보기
                        </button>
                    </div>
                </div>

                {/* 기존 pending 요청 경고 */}
                {existingPending && (
                    <div className="bg-yellow-50 border border-yellow-300 rounded-xl p-4">
                        <div className="flex gap-3">
                            <span className="text-2xl">⚠️</span>
                            <div>
                                <p className="text-sm font-medium text-yellow-800">이미 대기 중인 수정 요청이 있습니다.</p>
                                <p className="text-xs text-yellow-700 mt-1">
                                    신청일: {new Date(existingPending.submitted_at).toLocaleString('ko-KR')}
                                    {existingPending.customer_note && ` / 메모: ${existingPending.customer_note}`}
                                </p>
                                <p className="text-xs text-yellow-700 mt-1">
                                    매니저 확인 전까지는 새 요청을 제출할 수 없습니다.
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* 여러 항목이 있을 경우 탭 */}
                {serviceItems.length > 1 && (
                    <div className="flex gap-2 flex-wrap">
                        {serviceItems.map((_, idx) => (
                            <button
                                key={idx}
                                onClick={() => setSelectedItemIdx(idx)}
                                className={`px-4 py-2 text-sm rounded-lg transition-all ${selectedItemIdx === idx
                                    ? 'bg-blue-500 text-white shadow-sm'
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                    }`}
                            >
                                {idx + 1}번 항목
                                {hasChanges(idx) && <span className="ml-1 text-xs">●</span>}
                            </button>
                        ))}
                    </div>
                )}

                {/* 선택된 항목 비교 영역 */}
                {serviceItems.map((item, idx) => {
                    if (idx !== selectedItemIdx) return null;
                    const form = editForms[idx] || {};

                    return (
                        <div key={idx} className="space-y-6">
                            {/* ──── 현재 예약 정보 (원본) ──── */}
                            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                                <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-6 py-4 border-b border-gray-200">
                                    <h2 className="text-base font-bold text-gray-800 flex items-center gap-2">
                                        {getTypeIcon(reType)} 현재 예약 정보 (원본)
                                    </h2>
                                </div>
                                <div className="p-6">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-3">
                                        {fields.map(f => {
                                            if (f.type === 'textarea') return null;
                                            const val = item[f.key];
                                            if (val === null || val === undefined || val === '') return null;
                                            return (
                                                <div key={f.key} className="flex items-center gap-2">
                                                    <span className="text-xs font-bold text-blue-600 shrink-0">{f.label}:</span>
                                                    <span className="text-sm text-gray-900">{formatDisplayValue(f.key, val)}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    {item.request_note && (
                                        <div className="mt-4 pt-3 border-t border-gray-100">
                                            <span className="text-xs font-bold text-gray-500">📝 요청사항</span>
                                            <div className="text-sm text-gray-900 bg-yellow-50 p-2 rounded border border-yellow-200 whitespace-pre-wrap mt-1">
                                                {item.request_note}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* ──── 수정 요청 폼 ──── */}
                            <div className="bg-white rounded-xl shadow-sm border-2 border-orange-200 overflow-hidden">
                                <div className="bg-gradient-to-r from-orange-50 to-orange-100 px-6 py-4 border-b border-orange-200">
                                    <h2 className="text-base font-bold text-orange-800 flex items-center gap-2">
                                        ✏️ 수정 요청 내용
                                        {hasChanges(idx) && (
                                            <span className="text-xs bg-orange-500 text-white px-2 py-0.5 rounded-full ml-2">변경됨</span>
                                        )}
                                    </h2>
                                    <p className="text-xs text-orange-600 mt-1">변경할 항목을 수정해 주세요. 모든 변경은 매니저 승인 후 반영됩니다.</p>
                                </div>
                                <div className="p-6">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        {fields.map(f => {
                                            const origVal = toInputValue(f.key, item[f.key], f.type);
                                            const curVal = form[f.key] ?? '';
                                            const curInputVal = f.type === 'datetime-local' ? toInputDateTime(curVal) : (f.type === 'date' ? String(curVal).slice(0, 10) : curVal);
                                            const isChanged = (() => {
                                                const origStr = origVal;
                                                const editStr = String(curInputVal);
                                                if (f.type === 'datetime-local') return toInputDateTime(origStr) !== toInputDateTime(editStr);
                                                if (f.type === 'date') return origStr.slice(0, 10) !== editStr.slice(0, 10);
                                                return origStr !== editStr;
                                            })();

                                            const labelSuffix = f.enrichedOnly ? ' 🔗' : '';

                                            if (f.type === 'textarea') {
                                                return (
                                                    <div key={f.key} className="col-span-full">
                                                        <label className="text-xs font-bold text-gray-700 mb-1 block">
                                                            {f.label}{labelSuffix}
                                                            {isChanged && <span className="ml-1 text-orange-500">●</span>}
                                                        </label>
                                                        <textarea
                                                            rows={3}
                                                            value={curVal}
                                                            onChange={e => handleFieldChange(idx, f.key, e.target.value)}
                                                            className={`w-full px-3 py-2 text-sm border rounded-lg ${isChanged ? 'border-orange-400 bg-orange-50' : 'border-gray-200'}`}
                                                            disabled={!!existingPending}
                                                        />
                                                    </div>
                                                );
                                            }

                                            return (
                                                <div key={f.key}>
                                                    <label className="text-xs font-bold text-gray-700 mb-1 block">
                                                        {f.label}{labelSuffix}
                                                        {isChanged && <span className="ml-1 text-orange-500">●</span>}
                                                    </label>
                                                    <input
                                                        type={f.type}
                                                        value={f.type === 'datetime-local' ? toInputDateTime(curVal) : (f.type === 'date' ? String(curVal).slice(0, 10) : curVal)}
                                                        onChange={e => {
                                                            let val: any = e.target.value;
                                                            if (f.type === 'datetime-local') val = toDbDateTimeKst(val) || val;
                                                            handleFieldChange(idx, f.key, val);
                                                        }}
                                                        className={`w-full px-3 py-2 text-sm border rounded-lg ${isChanged ? 'border-orange-400 bg-orange-50' : 'border-gray-200'}`}
                                                        disabled={!!existingPending}
                                                    />
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>

                            {/* ──── 변경 사항 요약 ──── */}
                            {hasChanges(idx) && (
                                <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
                                    <h3 className="text-sm font-bold text-blue-800 mb-3">📋 변경 사항 요약</h3>
                                    <div className="space-y-2">
                                        {getChangedFields(idx).map(f => (
                                            <div key={f.key} className="flex items-start gap-2 text-sm">
                                                <span className="font-medium text-blue-700 shrink-0">
                                                    {f.label}{f.enrichedOnly ? ' 🔗' : ''}:
                                                </span>
                                                <span className="text-gray-500 line-through">{formatDisplayValue(f.key, item[f.key])}</span>
                                                <span className="text-blue-500">→</span>
                                                <span className="text-blue-800 font-medium">{formatDisplayValue(f.key, form[f.key])}</span>
                                            </div>
                                        ))}
                                    </div>
                                    {getChangedFields(idx).some(f => f.enrichedOnly) && (
                                        <p className="text-xs text-blue-600 mt-3 pt-2 border-t border-blue-200">
                                            🔗 표시 항목은 서비스 옵션 변경으로, 매니저가 적합한 옵션으로 조정합니다.
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}

                {/* 고객 메모 */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <label className="text-sm font-bold text-gray-700 mb-2 block">💬 수정 사유 (선택사항)</label>
                    <textarea
                        rows={3}
                        value={customerNote}
                        onChange={e => setCustomerNote(e.target.value)}
                        placeholder="수정 사유나 추가 요청사항을 입력해 주세요"
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg"
                        disabled={!!existingPending}
                    />
                </div>

                {/* 제출 버튼 */}
                <div className="flex items-center justify-between gap-4">
                    <button
                        onClick={() => router.push(`/mypage/reservations/${reservationId}/view`)}
                        className="px-6 py-3 bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-xl text-sm font-medium transition-all"
                    >
                        취소
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={submitting || !anyChanges || !!existingPending}
                        className="px-8 py-3 bg-orange-500 text-white hover:bg-orange-600 rounded-xl text-sm font-bold transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {submitting ? '제출 중...' : '수정 요청 제출'}
                    </button>
                </div>

                {/* 안내 */}
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                    <div className="flex gap-3">
                        <span className="text-2xl">💡</span>
                        <div className="text-sm text-gray-600 space-y-1">
                            <p>수정 요청은 매니저 확인 후 반영됩니다.</p>
                            <p>🔗 표시 항목(크루즈명, 객실 타입, 차종 등)은 매니저가 적합한 옵션으로 조정합니다.</p>
                            <p>차량 시간/위치 변경은 전날 정오까지만 가능합니다.</p>
                        </div>
                    </div>
                </div>
            </div>
        </PageWrapper>
    );
}

export default function Page() {
    return (
        <Suspense fallback={
            <PageWrapper>
                <div className="flex justify-center items-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
                </div>
            </PageWrapper>
        }>
            <ChangeRequestInner />
        </Suspense>
    );
}
