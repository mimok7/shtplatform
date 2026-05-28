import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';
import { hashToken } from '@/lib/cancelToken';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const fmt = (v: any, len = 10) => v ? String(v).slice(0, len) : '-';
const WAY_TYPE: Record<string, string> = { inbound: '입국', outbound: '출국', both: '입출국' };

type ServiceConfig = {
    table: string;
    select: string;
    getDate: (row: any) => string | null;
    toLabel: (row: any) => string;
    toDetail: (row: any) => Record<string, string>;
};

const SERVICE_TABLES: Record<string, ServiceConfig> = {
    cruise: {
        table: 'reservation_cruise',
        select: 'id, reservation_id, room_price_code, checkin, guest_count, adult_count, child_count, unit_price, room_total_price',
        getDate: (r) => r.checkin,
        toLabel: (r) => `크루즈 승선 ${fmt(r.checkin)} / ${r.room_price_code || '-'} / 성인 ${r.adult_count ?? r.guest_count ?? '-'}명`,
        toDetail: (r) => ({
            '룸 코드': r.room_price_code || '-',
            '승선일': fmt(r.checkin),
            '성인': `${r.adult_count ?? r.guest_count ?? '-'}명`,
            '아동': r.child_count ? `${r.child_count}명` : '-',
            '금액': r.room_total_price ? `${Number(r.room_total_price).toLocaleString()}원` : '-',
        }),
    },
    cruise_car: {
        table: 'reservation_cruise_car',
        select: 'id, reservation_id, car_price_code, pickup_datetime, pickup_location, dropoff_location, passenger_count, car_total_price',
        getDate: (r) => r.pickup_datetime,
        toLabel: (r) => `크루즈 픽업차량 ${fmt(r.pickup_datetime, 10)} / ${r.pickup_location || '-'} → ${r.dropoff_location || '-'}`,
        toDetail: (r) => ({
            '픽업일': fmt(r.pickup_datetime, 10),
            '출발지': r.pickup_location || '-',
            '도착지': r.dropoff_location || '-',
            '인원': r.passenger_count ? `${r.passenger_count}명` : '-',
            '금액': r.car_total_price ? `${Number(r.car_total_price).toLocaleString()}원` : '-',
        }),
    },
    airport: {
        table: 'reservation_airport',
        select: 'id, reservation_id, way_type, ra_datetime, ra_flight_number, ra_passenger_count, unit_price, total_price',
        getDate: (r) => r.ra_datetime,
        toLabel: (r) => `공항 이동 ${WAY_TYPE[r.way_type] || r.way_type || '-'} / ${fmt(r.ra_datetime, 16)}${r.ra_flight_number ? ` / ${r.ra_flight_number}` : ''}`,
        toDetail: (r) => ({
            '구분': WAY_TYPE[r.way_type] || r.way_type || '-',
            '일시': fmt(r.ra_datetime, 16),
            '항공편': r.ra_flight_number || '-',
            '인원': r.ra_passenger_count ? `${r.ra_passenger_count}명` : '-',
            '금액': r.total_price ? `${Number(r.total_price).toLocaleString()}원` : '-',
        }),
    },
    hotel: {
        table: 'reservation_hotel',
        select: 'id, reservation_id, hotel_price_code, checkin_date, schedule, guest_count, adult_count, child_count, total_price',
        getDate: (r) => r.checkin_date,
        toLabel: (r) => `호텔 ${r.hotel_price_code || '-'} / 체크인 ${fmt(r.checkin_date)}`,
        toDetail: (r) => ({
            '호텔 코드': r.hotel_price_code || '-',
            '체크인': fmt(r.checkin_date),
            '일정': r.schedule || '-',
            '성인': r.adult_count ? `${r.adult_count}명` : (r.guest_count ? `${r.guest_count}명` : '-'),
            '아동': r.child_count ? `${r.child_count}명` : '-',
            '금액': r.total_price ? `${Number(r.total_price).toLocaleString()}원` : '-',
        }),
    },
    rentcar: {
        table: 'reservation_rentcar',
        select: 'id, reservation_id, rentcar_price_code, pickup_datetime, return_datetime, pickup_location, passenger_count, total_price',
        getDate: (r) => r.pickup_datetime,
        toLabel: (r) => `렌터카 ${fmt(r.pickup_datetime, 10)} ~ ${fmt(r.return_datetime, 10)} / ${r.pickup_location || '-'}`,
        toDetail: (r) => ({
            '픽업일시': fmt(r.pickup_datetime, 16),
            '반납일': fmt(r.return_datetime, 10),
            '픽업장소': r.pickup_location || '-',
            '인원': r.passenger_count ? `${r.passenger_count}명` : '-',
            '금액': r.total_price ? `${Number(r.total_price).toLocaleString()}원` : '-',
        }),
    },
    car_sht: {
        table: 'reservation_car_sht',
        select: 'id, reservation_id, car_price_code, pickup_datetime, usage_date, pickup_location, dropoff_location, passenger_count, car_total_price',
        getDate: (r) => r.usage_date || r.pickup_datetime,
        toLabel: (r) => `스테이하롱 차량 ${fmt(r.usage_date || r.pickup_datetime, 10)} / ${r.pickup_location || '-'} → ${r.dropoff_location || '-'}`,
        toDetail: (r) => ({
            '이용일': fmt(r.usage_date || r.pickup_datetime, 10),
            '출발지': r.pickup_location || '-',
            '도착지': r.dropoff_location || '-',
            '인원': r.passenger_count ? `${r.passenger_count}명` : '-',
            '금액': r.car_total_price ? `${Number(r.car_total_price).toLocaleString()}원` : '-',
        }),
    },
    tour: {
        table: 'reservation_tour',
        select: 'id, reservation_id, tour_price_code, usage_date, adult_count, child_count, total_price',
        getDate: (r) => r.usage_date,
        toLabel: (r) => `투어 ${r.tour_price_code || '-'} / ${fmt(r.usage_date)}${r.adult_count ? ` / 성인 ${r.adult_count}명` : ''}`,
        toDetail: (r) => ({
            '투어 코드': r.tour_price_code || '-',
            '이용일': fmt(r.usage_date),
            '성인': r.adult_count ? `${r.adult_count}명` : '-',
            '아동': r.child_count ? `${r.child_count}명` : '-',
            '금액': r.total_price ? `${Number(r.total_price).toLocaleString()}원` : '-',
        }),
    },
};

export async function POST(req: NextRequest) {
    try {
        const { token, reservationId } = await req.json();
        const t = String(token || '').trim();
        const rid = String(reservationId || '').trim();
        if (!t || !rid) return NextResponse.json({ error: 'invalid' }, { status: 400 });

        const supabase = getServiceSupabase();
        const tokenHash = hashToken(t);

        // 토큰 검증
        const { data: tokenRow } = await supabase
            .from('reservation_cancellation_access')
            .select('id, reservation_id, expires_at, used_at')
            .eq('token_hash', tokenHash)
            .eq('reservation_id', rid)
            .maybeSingle();
        if (!tokenRow) return NextResponse.json({ error: 'not_found' }, { status: 404 });
        if (tokenRow.used_at) return NextResponse.json({ error: 'used' }, { status: 410 });
        if (new Date(tokenRow.expires_at).getTime() < Date.now()) {
            return NextResponse.json({ error: 'expired' }, { status: 410 });
        }

        // 토큰의 주 예약 조회 (re_quote_id 포함)
        const { data: primaryResv } = await supabase
            .from('reservation')
            .select('re_id, re_status, re_type, re_quote_id, order_id, total_amount, reservation_date, re_created_at')
            .eq('re_id', rid)
            .maybeSingle();
        if (!primaryResv) return NextResponse.json({ error: 'reservation_not_found' }, { status: 404 });

        // 동일 견적의 모든 활성 예약 조회
        let allReservations: typeof primaryResv[] = [primaryResv];
        if (primaryResv.re_quote_id) {
            const { data: related } = await supabase
                .from('reservation')
                .select('re_id, re_status, re_type, re_quote_id, order_id, total_amount, reservation_date, re_created_at')
                .eq('re_quote_id', primaryResv.re_quote_id);
            if (related && related.length > 0) {
                // 취소됨/완료됨 제외
                const active = related.filter(r => !['cancelled', 'completed'].includes(r.re_status || ''));
                allReservations = active.length > 0 ? active : [primaryResv];
            }
        }

        const allIds = allReservations.map(r => r.re_id);

        // 날짜 과거 여부 판단 (오늘 00:00 기준)
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const isDatePast = (d: string | null): boolean => {
            if (!d) return false;
            const parsed = new Date(d);
            if (isNaN(parsed.getTime())) return false;
            parsed.setHours(0, 0, 0, 0);
            return parsed < today;
        };

        // 7개 서비스 테이블 병렬 조회 (전체 예약 ID 한 번에)
        const serviceResults = await Promise.all(
            Object.entries(SERVICE_TABLES).map(async ([serviceType, config]) => {
                const { data } = await supabase
                    .from(config.table)
                    .select(config.select)
                    .in('reservation_id', allIds);
                return { serviceType, config, rows: data || [] };
            }),
        );

        // 예약 ID별 서비스 targets 매핑
        const targetsByResv: Record<string, any[]> = {};
        for (const { serviceType, config, rows } of serviceResults) {
            for (const row of rows) {
                const resvId = row.reservation_id;
                if (!targetsByResv[resvId]) targetsByResv[resvId] = [];
                targetsByResv[resvId].push({
                    serviceType,
                    rowId: row.id,
                    reservationId: resvId,
                    label: config.toLabel(row),
                    detail: config.toDetail(row),
                    isPast: isDatePast(config.getDate(row)),
                });
            }
        }

        // 모든 서비스가 과거인 예약은 제외
        const eligibleReservations = allReservations.filter(r => {
            const targets = targetsByResv[r.re_id] || [];
            if (targets.length === 0) return true; // 서비스 없는 경우 포함
            return targets.some(t => !t.isPast);
        });

        if (eligibleReservations.length === 0) {
            return NextResponse.json({ error: 'no_eligible_reservations' }, { status: 410 });
        }

        // 미래 서비스만 포함
        const reservations = eligibleReservations.map(r => ({
            ...r,
            targets: (targetsByResv[r.re_id] || [])
                .filter(t => !t.isPast)
                .map(({ isPast: _p, ...rest }) => rest),
        }));

        // 취소 신청 이력
        const { data: requests } = await supabase
            .from('reservation_cancellation_request')
            .select('id, reservation_id, status, result_status, cancellation_type, cancel_reason_category, submitted_at')
            .in('reservation_id', allIds)
            .order('submitted_at', { ascending: false })
            .limit(20);

        return NextResponse.json({ reservations, requests: requests || [] });
    } catch (err: any) {
        console.error('[cancel/context] 실패', err);
        return NextResponse.json({ error: err?.message || 'server_error' }, { status: 500 });
    }
}
