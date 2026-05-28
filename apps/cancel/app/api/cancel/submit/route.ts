import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';
import { hashToken } from '@/lib/cancelToken';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Payload = {
    token: string;
    reservationId: string;
    additionalReservationIds?: string[];
    cancellationType: 'full' | 'partial';
    reasonCategory: 'natural_disaster' | 'change_of_mind' | 'other';
    reasonDetail?: string | null;
    cancelTargets?: Array<{ service_type: string; row_id: string; label?: string }>;
    requesterEmail?: string | null;
    requesterPhone?: string | null;
};

export async function POST(req: NextRequest) {
    try {
        const body = (await req.json()) as Payload;
        const t = String(body.token || '').trim();
        const rid = String(body.reservationId || '').trim();
        if (!t || !rid) return NextResponse.json({ error: 'invalid' }, { status: 400 });
        if (body.reasonCategory === 'other' && !String(body.reasonDetail || '').trim()) {
            return NextResponse.json({ error: 'reason_detail_required' }, { status: 400 });
        }
        if (body.cancellationType === 'partial' && (!body.cancelTargets || body.cancelTargets.length === 0)) {
            return NextResponse.json({ error: 'targets_required' }, { status: 400 });
        }

        const supabase = getServiceSupabase();
        const tokenHash = hashToken(t);

        const { data: tokenRow, error: tokenErr } = await supabase
            .from('reservation_cancellation_access')
            .select('id, reservation_id, expires_at, used_at')
            .eq('token_hash', tokenHash)
            .eq('reservation_id', rid)
            .maybeSingle();
        if (tokenErr) throw tokenErr;
        if (!tokenRow) return NextResponse.json({ error: 'not_found' }, { status: 404 });
        if (tokenRow.used_at) return NextResponse.json({ error: 'used' }, { status: 410 });
        if (new Date(tokenRow.expires_at).getTime() < Date.now()) {
            return NextResponse.json({ error: 'expired' }, { status: 410 });
        }

        // 중복 pending 차단
        const { data: pending } = await supabase
            .from('reservation_cancellation_request')
            .select('id')
            .eq('reservation_id', rid)
            .eq('status', 'pending')
            .maybeSingle();
        if (pending) return NextResponse.json({ error: 'already_pending' }, { status: 409 });

        const { error: insErr } = await supabase
            .from('reservation_cancellation_request')
            .insert({
                reservation_id: rid,
                requester_user_id: null,
                requester_email: body.requesterEmail || null,
                requester_phone: body.requesterPhone || null,
                cancellation_type: body.cancellationType,
                cancel_reason_category: body.reasonCategory,
                cancel_reason_detail: body.reasonDetail || null,
                cancel_targets: body.cancellationType === 'partial' ? body.cancelTargets : null,
                status: 'pending',
                result_status: 'requested',
            });
        if (insErr) throw insErr;

        // 연결된 추가 예약 취소 신청
        if (body.additionalReservationIds && body.additionalReservationIds.length > 0) {
            const { data: primaryData } = await supabase
                .from('reservation')
                .select('re_quote_id')
                .eq('re_id', rid)
                .maybeSingle();

            if (primaryData?.re_quote_id) {
                const { data: addlResvs } = await supabase
                    .from('reservation')
                    .select('re_id')
                    .in('re_id', body.additionalReservationIds)
                    .eq('re_quote_id', primaryData.re_quote_id);

                for (const addl of addlResvs || []) {
                    const { data: existingPending } = await supabase
                        .from('reservation_cancellation_request')
                        .select('id')
                        .eq('reservation_id', addl.re_id)
                        .eq('status', 'pending')
                        .maybeSingle();
                    if (existingPending) continue;

                    await supabase.from('reservation_cancellation_request').insert({
                        reservation_id: addl.re_id,
                        requester_user_id: null,
                        requester_email: body.requesterEmail || null,
                        requester_phone: body.requesterPhone || null,
                        cancellation_type: body.cancellationType,
                        cancel_reason_category: body.reasonCategory,
                        cancel_reason_detail: body.reasonDetail || null,
                        cancel_targets: body.cancellationType === 'partial' ? body.cancelTargets : null,
                        status: 'pending',
                        result_status: 'requested',
                    });
                }
            }
        }

        const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || null;
        await supabase
            .from('reservation_cancellation_access')
            .update({ used_at: new Date().toISOString(), used_ip: ip })
            .eq('id', tokenRow.id);

        // notifications insert (cancellation_requested)
        try {
            const { data: resvRow } = await supabase
                .from('reservation')
                .select('re_id, order_id, re_user_id')
                .eq('re_id', rid)
                .maybeSingle();
            let customerName: string | null = null;
            let customerEmail: string | null = body.requesterEmail || null;
            let customerPhone: string | null = body.requesterPhone || null;
            if (resvRow?.re_user_id) {
                const { data: userRow } = await supabase
                    .from('users')
                    .select('name, email, phone_number')
                    .eq('id', resvRow.re_user_id)
                    .maybeSingle();
                customerName = userRow?.name || null;
                customerEmail = customerEmail || userRow?.email || null;
                customerPhone = customerPhone || userRow?.phone_number || null;
            }
            const nowIso = new Date().toISOString();
            await supabase.from('notifications').insert({
                type: 'system',
                category: 'reservation',
                subcategory: 'cancellation_requested',
                title: `예약 취소 신청 (주문 ${resvRow?.order_id || '-'})`,
                message: `${body.cancellationType === 'partial' ? '부분 취소' : '전체 취소'} • 사유: ${body.reasonCategory}${body.reasonDetail ? ` • ${body.reasonDetail}` : ''}`,
                target_table: 'reservation',
                target_id: rid,
                priority: 'high',
                status: 'unread',
                customer_name: customerName,
                customer_email: customerEmail,
                customer_phone: customerPhone,
                metadata: {
                    cancellationType: body.cancellationType,
                    reasonCategory: body.reasonCategory,
                    reasonDetail: body.reasonDetail || null,
                    cancelTargets: body.cancellationType === 'partial' ? body.cancelTargets : null,
                    orderId: resvRow?.order_id || null,
                },
                created_at: nowIso,
                updated_at: nowIso,
            });
        } catch (notifyErr) {
            console.warn('[cancel/submit] 알림 생성 실패(요청은 계속):', notifyErr);
        }

        return NextResponse.json({ ok: true });
    } catch (err: any) {
        console.error('[cancel/submit] 실패', err);
        return NextResponse.json({ error: err?.message || 'server_error' }, { status: 500 });
    }
}
