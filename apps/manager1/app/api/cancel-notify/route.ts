import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/serviceSupabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = {
    subcategory: 'cancellation_approved' | 'cancellation_rejected';
    reservationId: string;
    title: string;
    message: string;
    createdBy?: string | null;
    metadata?: Record<string, unknown>;
};

export async function POST(req: NextRequest) {
    try {
        const body = (await req.json()) as Body;
        if (!body?.reservationId || !body?.subcategory) {
            return NextResponse.json({ error: 'invalid' }, { status: 400 });
        }
        const supabase = getServiceSupabase();

        const { data: resvRow } = await supabase
            .from('reservation')
            .select('re_id, order_id, re_user_id')
            .eq('re_id', body.reservationId)
            .maybeSingle();
        let customerName: string | null = null;
        let customerEmail: string | null = null;
        let customerPhone: string | null = null;
        if (resvRow?.re_user_id) {
            const { data: userRow } = await supabase
                .from('users')
                .select('name, email, phone_number')
                .eq('id', resvRow.re_user_id)
                .maybeSingle();
            customerName = userRow?.name || null;
            customerEmail = userRow?.email || null;
            customerPhone = userRow?.phone_number || null;
        }

        const nowIso = new Date().toISOString();
        const { error } = await supabase.from('notifications').insert({
            type: 'system',
            category: 'reservation',
            subcategory: body.subcategory,
            title: body.title,
            message: body.message,
            target_table: 'reservation',
            target_id: body.reservationId,
            priority: 'normal',
            status: 'unread',
            created_by: body.createdBy || null,
            customer_name: customerName,
            customer_email: customerEmail,
            customer_phone: customerPhone,
            metadata: {
                ...(body.metadata || {}),
                orderId: resvRow?.order_id || null,
            },
            created_at: nowIso,
            updated_at: nowIso,
        });
        if (error) throw error;

        return NextResponse.json({ ok: true });
    } catch (err: any) {
        console.error('[cancel-notify] 실패', err);
        return NextResponse.json({ error: err?.message || 'server_error' }, { status: 500 });
    }
}
