import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';
import { hashToken } from '@/lib/cancelToken';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SERVICE_TABLES: Record<string, { table: string; select: string; toLabel: (row: any) => string }> = {
    cruise: { table: 'reservation_cruise', select: 'id, room_price_code, checkin', toLabel: (r) => `크루즈 ${r.room_price_code || '-'} / 승선 ${String(r.checkin || '-').slice(0, 10)}` },
    cruise_car: { table: 'reservation_cruise_car', select: 'id, pickup_datetime, pickup_location', toLabel: (r) => `크루즈차량 ${String(r.pickup_datetime || '-').slice(0, 10)} / ${r.pickup_location || '-'}` },
    airport: { table: 'reservation_airport', select: 'id, way_type, ra_datetime', toLabel: (r) => `공항 ${r.way_type || '-'} / ${String(r.ra_datetime || '-').slice(0, 16)}` },
    hotel: { table: 'reservation_hotel', select: 'id, hotel_price_code, checkin_date', toLabel: (r) => `호텔 ${r.hotel_price_code || '-'} / ${String(r.checkin_date || '-').slice(0, 10)}` },
    rentcar: { table: 'reservation_rentcar', select: 'id, pickup_datetime, pickup_location', toLabel: (r) => `렌터카 ${String(r.pickup_datetime || '-').slice(0, 16)} / ${r.pickup_location || '-'}` },
    car_sht: { table: 'reservation_car_sht', select: 'id, pickup_datetime, pickup_location', toLabel: (r) => `스하차량 ${String(r.pickup_datetime || '-').slice(0, 10)} / ${r.pickup_location || '-'}` },
    tour: { table: 'reservation_tour', select: 'id, usage_date, tour_price_code', toLabel: (r) => `투어 ${r.tour_price_code || '-'} / ${String(r.usage_date || '-').slice(0, 10)}` },
};

export async function POST(req: NextRequest) {
    try {
        const { token, reservationId } = await req.json();
        const t = String(token || '').trim();
        const rid = String(reservationId || '').trim();
        if (!t || !rid) return NextResponse.json({ error: 'invalid' }, { status: 400 });

        const supabase = getServiceSupabase();
        const tokenHash = hashToken(t);

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

        const { data: reservation } = await supabase
            .from('reservation')
            .select('re_id, re_status, order_id, total_amount, reservation_date')
            .eq('re_id', rid)
            .maybeSingle();
        if (!reservation) return NextResponse.json({ error: 'reservation_not_found' }, { status: 404 });

        const serviceRows = await Promise.all(
            Object.entries(SERVICE_TABLES).map(async ([serviceType, config]) => {
                const { data } = await supabase.from(config.table).select(config.select).eq('reservation_id', rid);
                return (data || []).map((row: any) => ({ serviceType, rowId: row.id, label: config.toLabel(row) }));
            }),
        );

        const { data: requests } = await supabase
            .from('reservation_cancellation_request')
            .select('id, status, result_status, cancellation_type, cancel_reason_category, submitted_at')
            .eq('reservation_id', rid)
            .order('submitted_at', { ascending: false })
            .limit(10);

        return NextResponse.json({
            reservation,
            targets: serviceRows.flat(),
            requests: requests || [],
        });
    } catch (err: any) {
        console.error('[cancel/context] 실패', err);
        return NextResponse.json({ error: err?.message || 'server_error' }, { status: 500 });
    }
}
