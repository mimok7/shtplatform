import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';
import { generateRawToken, hashToken, getDefaultExpiry } from '@/lib/cancelToken';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EXCLUDED_STATUSES = ['cancelled', 'completed'];

export async function POST(req: NextRequest) {
    try {
        const { name, email } = await req.json();
        const trimmedName = String(name || '').trim();
        const trimmedEmail = String(email || '').trim().toLowerCase();
        if (!trimmedName || !trimmedEmail) {
            return NextResponse.json({ error: '이름과 이메일이 필요합니다.' }, { status: 400 });
        }

        const supabase = getServiceSupabase();

        // 1) users 테이블에서 이름+이메일 매칭
        const { data: users, error: userErr } = await supabase
            .from('users')
            .select('id, name, email')
            .ilike('email', trimmedEmail);
        if (userErr) throw userErr;

        let matched = (users || []);
        // 이름이 주어지면 이름으로 필터링, 없으면 이메일로만 조회 허용
        if (trimmedName) {
            matched = matched.filter((u: any) => (u.name || '').trim() === trimmedName);
            if (matched.length === 0) {
                return NextResponse.json({ error: '이름과 이메일이 일치하는 회원을 찾지 못했습니다.' }, { status: 404 });
            }
        }
        const userIds = matched.map((u: any) => u.id);

        // 2) 해당 사용자의 활성 예약 조회
        const { data: reservations, error: resvErr } = await supabase
            .from('reservation')
            .select('re_id, re_status, order_id, reservation_date, re_created_at')
            .in('re_user_id', userIds)
            .not('re_status', 'in', `(${EXCLUDED_STATUSES.map((s) => `"${s}"`).join(',')})`)
            .order('re_created_at', { ascending: false })
            .limit(20);
        if (resvErr) throw resvErr;
        if (!reservations || reservations.length === 0) {
            return NextResponse.json({ error: '취소 가능한 예약이 없습니다.' }, { status: 404 });
        }

        // 3) 각 예약별 단회 토큰 발급
        const expiresAt = getDefaultExpiry(30);
        const tokens: Array<{ reservationId: string; token: string; tokenHash: string }> = reservations.map((r: any) => {
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

        if (reservations.length === 1) {
            return NextResponse.json({
                reservationId: reservations[0].re_id,
                token: tokens[0].token,
                expiresAt,
            });
        }

        return NextResponse.json({
            reservations: reservations.map((r: any, idx: number) => ({
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
