import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const { email } = await req.json();
        if (!email || typeof email !== 'string') {
            return NextResponse.json({ error: '이메일 정보가 필요합니다.' }, { status: 400 });
        }

        const supabase = getServiceSupabase();
        const normalizedEmail = email.trim().toLowerCase();

        // 1. 사용자 조회 (없어도 이메일 기반으로 조회)
        const { data: users } = await supabase
            .from('users')
            .select('id, email')
            .ilike('email', normalizedEmail)
            .maybeSingle();

        // 2. 해당 이메일의 예약 ID 목록 조회 (re_user_id 경유)
        let reservationIds: string[] = [];
        if (users?.id) {
            const { data: resvRows } = await supabase
                .from('reservation')
                .select('re_id')
                .eq('re_user_id', users.id);
            reservationIds = (resvRows || []).map((r: any) => r.re_id);
        }

        // 3. 조건 1: requester_email 일치
        const { data: byEmail } = await supabase
            .from('reservation_cancellation_request')
            .select('*')
            .ilike('requester_email', normalizedEmail);

        // 4. 조건 2: requester_user_id 일치
        const { data: byUserId } = await (users?.id
            ? supabase
                .from('reservation_cancellation_request')
                .select('*')
                .eq('requester_user_id', users.id)
            : Promise.resolve({ data: [] }));

        // 5. 조건 3: 예약의 re_user_id로 연결된 신청
        const { data: byReservation } = await (reservationIds.length > 0
            ? supabase
                .from('reservation_cancellation_request')
                .select('*')
                .in('reservation_id', reservationIds)
            : Promise.resolve({ data: [] }));

        // 중복 제거 후 최신순 정렬
        const allMap = new Map<string, any>();
        for (const row of [...(byEmail || []), ...(byUserId || []), ...(byReservation || [])]) {
            if (!allMap.has(row.id)) allMap.set(row.id, row);
        }
        const requests = Array.from(allMap.values()).sort(
            (a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime()
        );

        return NextResponse.json({
            email: users?.email || email.trim(),
            requests,
        });
    } catch (err: any) {
        console.error('History API 오류:', err);
        return NextResponse.json({ error: err?.message || '서버 오류' }, { status: 500 });
    }
}
