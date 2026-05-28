import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';
import { hashToken } from '@/lib/cancelToken';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const { token, reservationId } = await req.json();
        const t = String(token || '').trim();
        const rid = String(reservationId || '').trim();
        if (!t || !rid) return NextResponse.json({ valid: false, error: 'invalid' }, { status: 400 });

        const supabase = getServiceSupabase();
        const tokenHash = hashToken(t);

        const { data: row, error } = await supabase
            .from('reservation_cancellation_access')
            .select('id, reservation_id, expires_at, used_at')
            .eq('token_hash', tokenHash)
            .eq('reservation_id', rid)
            .maybeSingle();
        if (error) throw error;

        if (!row) return NextResponse.json({ valid: false, error: 'not_found' }, { status: 404 });
        if (row.used_at) return NextResponse.json({ valid: false, error: 'used' }, { status: 410 });
        if (new Date(row.expires_at).getTime() < Date.now()) {
            return NextResponse.json({ valid: false, error: 'expired' }, { status: 410 });
        }

        return NextResponse.json({ valid: true, reservationId: row.reservation_id, accessId: row.id });
    } catch (err: any) {
        console.error('[cancel/verify] 실패', err);
        return NextResponse.json({ valid: false, error: err?.message || 'server_error' }, { status: 500 });
    }
}
