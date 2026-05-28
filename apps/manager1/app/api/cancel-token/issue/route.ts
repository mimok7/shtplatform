import { NextRequest, NextResponse } from 'next/server';
import serviceSupabase from '@/lib/serviceSupabase';
import { randomBytes, createHmac } from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function hashToken(raw: string): string {
    const pepper = process.env.CANCEL_TOKEN_PEPPER || '';
    return createHmac('sha256', pepper).update(raw).digest('hex');
}

export async function POST(req: NextRequest) {
    if (!serviceSupabase) {
        return NextResponse.json({ error: 'service_unavailable' }, { status: 500 });
    }
    try {
        const { reservationId, email, phone, issuedBy, ttlMinutes } = await req.json();
        const rid = String(reservationId || '').trim();
        if (!rid) return NextResponse.json({ error: 'reservationId_required' }, { status: 400 });

        const { data: reservation, error: resvErr } = await serviceSupabase
            .from('reservation')
            .select('re_id, order_id')
            .eq('re_id', rid)
            .maybeSingle();
        if (resvErr) throw resvErr;
        if (!reservation) return NextResponse.json({ error: 'reservation_not_found' }, { status: 404 });

        const raw = randomBytes(32).toString('base64url');
        const tokenHash = hashToken(raw);
        const ttl = Math.max(5, Math.min(Number(ttlMinutes) || 30, 240));
        const expiresAt = new Date(Date.now() + ttl * 60 * 1000).toISOString();

        const { error: insErr } = await serviceSupabase
            .from('reservation_cancellation_access')
            .insert({
                reservation_id: rid,
                token_hash: tokenHash,
                purpose: 'cancel',
                issued_by: issuedBy || null,
                issued_to_email: email || null,
                issued_to_phone: phone || null,
                expires_at: expiresAt,
            });
        if (insErr) throw insErr;

        const base = process.env.CANCEL_APP_BASE_URL || 'https://cancel.stayhalong.com';
        const url = `${base.replace(/\/$/, '')}/r/${rid}?t=${encodeURIComponent(raw)}`;

        return NextResponse.json({ ok: true, url, expiresAt, orderId: reservation.order_id });
    } catch (err: any) {
        console.error('[cancel-token] 실패', err);
        return NextResponse.json({ error: err?.message || 'server_error' }, { status: 500 });
    }
}
