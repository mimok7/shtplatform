// @ts-nocheck
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getServiceSupabase() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Supabase env missing');
    return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function POST(req) {
    try {
        const body = await req.json();
        if (!body?.reservationId || !body?.subcategory) {
            return NextResponse.json({ error: 'invalid' }, { status: 400 });
        }
        const supabase = getServiceSupabase();

        const { data: resvRow } = await supabase
            .from('reservation')
            .select('re_id, order_id, re_user_id')
            .eq('re_id', body.reservationId)
            .maybeSingle();
        let customerName = null, customerEmail = null, customerPhone = null;
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
            metadata: { ...(body.metadata || {}), orderId: resvRow?.order_id || null },
            created_at: nowIso,
            updated_at: nowIso,
        });
        if (error) throw error;
        return NextResponse.json({ ok: true });
    } catch (err) {
        console.error('[mobile cancel-notify] 실패', err);
        return NextResponse.json({ error: err?.message || 'server_error' }, { status: 500 });
    }
}
