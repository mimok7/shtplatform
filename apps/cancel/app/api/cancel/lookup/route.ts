import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';
import { generateRawToken, hashToken, getDefaultExpiry } from '@/lib/cancelToken';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EXCLUDED_STATUSES = ['cancelled', 'completed'];

type ServiceDateConfig = {
    table: string;
    select: string;
    getDate: (row: any) => string | null;
};

const SERVICE_DATE_TABLES: ServiceDateConfig[] = [
    { table: 'reservation_cruise', select: 'reservation_id, checkin', getDate: (r) => r.checkin },
    { table: 'reservation_cruise_car', select: 'reservation_id, pickup_datetime', getDate: (r) => r.pickup_datetime },
    { table: 'reservation_airport', select: 'reservation_id, ra_datetime', getDate: (r) => r.ra_datetime },
    { table: 'reservation_hotel', select: 'reservation_id, checkin_date', getDate: (r) => r.checkin_date },
    { table: 'reservation_rentcar', select: 'reservation_id, pickup_datetime', getDate: (r) => r.pickup_datetime },
    { table: 'reservation_car_sht', select: 'reservation_id, usage_date, pickup_datetime', getDate: (r) => r.usage_date || r.pickup_datetime },
    { table: 'reservation_tour', select: 'reservation_id, usage_date', getDate: (r) => r.usage_date },
];

function isPastDate(value: string | null | undefined): boolean {
    if (!value) return false;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    parsed.setHours(0, 0, 0, 0);
    return parsed < today;
}

function pickBetterReservation(current: any, next: any): any {
    const score = (row: any) => {
        let s = 0;
        if (row.order_id) s += 2;
        if (row.reservation_date) s += 1;
        if (row.re_created_at) s += 1;
        return s;
    };
    const currentScore = score(current);
    const nextScore = score(next);
    if (nextScore !== currentScore) return nextScore > currentScore ? next : current;

    const currentTs = current?.re_created_at ? new Date(current.re_created_at).getTime() : 0;
    const nextTs = next?.re_created_at ? new Date(next.re_created_at).getTime() : 0;
    return nextTs > currentTs ? next : current;
}

export async function POST(req: NextRequest) {
    try {
        const { name, email } = await req.json();
        const trimmedEmail = String(email || '').trim().toLowerCase();
        if (!trimmedEmail) {
            return NextResponse.json({ error: '이메일이 필요합니다.' }, { status: 400 });
        }

        const supabase = getServiceSupabase();

        // 1) users 테이블에서 이메일 매칭
        const { data: users, error: userErr } = await supabase
            .from('users')
            .select('id, name, email')
            .ilike('email', trimmedEmail);
        if (userErr) throw userErr;

        const matched = (users || []);
        if (matched.length === 0) {
            return NextResponse.json({ error: '이메일과 일치하는 회원을 찾지 못했습니다.' }, { status: 404 });
        }
        const userIds = matched.map((u: any) => u.id);

        // 2) 해당 사용자의 활성 예약 조회
        const { data: reservations, error: resvErr } = await supabase
            .from('reservation')
            .select('re_id, re_quote_id, re_status, order_id, reservation_date, re_created_at')
            .in('re_user_id', userIds)
            .not('re_status', 'in', `(${EXCLUDED_STATUSES.map((s) => `"${s}"`).join(',')})`)
            .order('re_created_at', { ascending: false })
            .limit(20);
        if (resvErr) throw resvErr;
        if (!reservations || reservations.length === 0) {
            return NextResponse.json({ error: '취소 가능한 예약이 없습니다.' }, { status: 404 });
        }

        const reservationIds = reservations.map((r: any) => r.re_id);
        const serviceRowsByType = await Promise.all(
            SERVICE_DATE_TABLES.map(async (cfg) => {
                const { data } = await supabase
                    .from(cfg.table)
                    .select(cfg.select)
                    .in('reservation_id', reservationIds);
                return { cfg, rows: data || [] };
            }),
        );

        const hasServiceByReservation = new Map<string, boolean>();
        const hasFutureServiceByReservation = new Map<string, boolean>();

        for (const { cfg, rows } of serviceRowsByType) {
            for (const row of rows as any[]) {
                const rid = row.reservation_id as string;
                hasServiceByReservation.set(rid, true);
                if (!isPastDate(cfg.getDate(row))) {
                    hasFutureServiceByReservation.set(rid, true);
                }
            }
        }

        const eligibleReservations = reservations.filter((r: any) => {
            const rid = r.re_id as string;
            if (hasFutureServiceByReservation.get(rid)) return true;
            if (hasServiceByReservation.get(rid)) return false;
            if (!r.reservation_date) return false;
            return !isPastDate(r.reservation_date);
        });

        if (eligibleReservations.length === 0) {
            return NextResponse.json({ error: '취소 가능한 예약이 없습니다.' }, { status: 404 });
        }

        // 동일 견적의 예약 행이 여러 개일 수 있어, 대표 1건만 후보로 노출한다.
        const byQuote = new Map<string, any>();
        for (const row of eligibleReservations) {
            const key = row.re_quote_id ? `quote:${row.re_quote_id}` : `resv:${row.re_id}`;
            const existing = byQuote.get(key);
            if (!existing) {
                byQuote.set(key, row);
                continue;
            }
            byQuote.set(key, pickBetterReservation(existing, row));
        }
        const candidateReservations = Array.from(byQuote.values());

        // 3) 각 예약별 단회 토큰 발급
        const expiresAt = getDefaultExpiry(30);
        const tokens: Array<{ reservationId: string; token: string; tokenHash: string }> = candidateReservations.map((r: any) => {
            const raw = generateRawToken();
            return { reservationId: r.re_id, token: raw, tokenHash: hashToken(raw) };
        });

        const insertRows = tokens.map((t) => ({
            reservation_id: t.reservationId,
            token_hash: t.tokenHash,
            purpose: 'cancel',
            issued_to_email: trimmedEmail,
            expires_at: expiresAt,
        }));
        const { error: insErr } = await supabase
            .from('reservation_cancellation_access')
            .insert(insertRows);
        if (insErr) throw insErr;

        if (candidateReservations.length === 1) {
            return NextResponse.json({
                reservationId: candidateReservations[0].re_id,
                token: tokens[0].token,
                expiresAt,
            });
        }

        return NextResponse.json({
            reservations: candidateReservations.map((r: any, idx: number) => ({
                reservationId: r.re_id,
                orderId: r.order_id,
                reservationDate: r.reservation_date,
                status: r.re_status,
                token: tokens[idx].token,
            })),
            expiresAt,
        });
    } catch (err: any) {
        console.error('[cancel/lookup] 실패', err);
        return NextResponse.json({ error: err?.message || '서버 오류' }, { status: 500 });
    }
}
