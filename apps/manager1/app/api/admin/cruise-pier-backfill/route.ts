import { NextResponse } from 'next/server';
import serviceSupabase from '../../../../lib/serviceSupabase';

type ReservationCarShtRow = {
    id: string;
    reservation_id: string | null;
    pickup_location: string | null;
    dropoff_location: string | null;
};

type ReservationRow = {
    re_id: string;
    re_quote_id: string | null;
};

type ReservationCruiseRow = {
    reservation_id: string;
    room_price_code: string;
};

type CruiseRateCardRow = {
    id: string;
    cruise_name: string;
};

type CruiseLocationRow = {
    kr_name: string | null;
    en_name: string | null;
    pier_location: string | null;
};

const TARGET_TEXT = '선착장';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalize(value: string | null | undefined): string {
    return (value || '').trim().toLowerCase();
}

export async function POST() {
    try {
        if (!serviceSupabase) {
            return NextResponse.json(
                { success: false, error: 'SUPABASE_SERVICE_ROLE_KEY 환경변수를 확인하세요.' },
                { status: 500 }
            );
        }

        const { data: carRowsRaw, error: carError } = await serviceSupabase
            .from('reservation_car_sht')
            .select('id, reservation_id, pickup_location, dropoff_location')
            .or('pickup_location.eq.선착장,dropoff_location.eq.선착장');

        if (carError) {
            return NextResponse.json({ success: false, error: carError.message }, { status: 500 });
        }

        const carRows = (carRowsRaw || []) as ReservationCarShtRow[];
        if (carRows.length === 0) {
            return NextResponse.json({ success: true, targetCount: 0, updatedCount: 0, skippedCount: 0 });
        }

        const reservationIds = Array.from(new Set(carRows.map((row) => row.reservation_id).filter(Boolean))) as string[];
        if (reservationIds.length === 0) {
            return NextResponse.json({ success: true, targetCount: carRows.length, updatedCount: 0, skippedCount: carRows.length });
        }

        const { data: reservationRowsRaw, error: reservationError } = await serviceSupabase
            .from('reservation')
            .select('re_id, re_quote_id')
            .in('re_id', reservationIds);

        if (reservationError) {
            return NextResponse.json({ success: false, error: reservationError.message }, { status: 500 });
        }

        const reservationRows = (reservationRowsRaw || []) as ReservationRow[];
        const quoteIdByReservationId = new Map(reservationRows.map((row) => [row.re_id, row.re_quote_id]));
        const quoteIds = Array.from(new Set(reservationRows.map((row) => row.re_quote_id).filter(Boolean))) as string[];

        if (quoteIds.length === 0) {
            return NextResponse.json({ success: true, targetCount: carRows.length, updatedCount: 0, skippedCount: carRows.length });
        }

        const { data: cruiseReservationsRaw, error: cruiseReservationError } = await serviceSupabase
            .from('reservation')
            .select('re_id, re_quote_id')
            .eq('re_type', 'cruise')
            .in('re_quote_id', quoteIds);

        if (cruiseReservationError) {
            return NextResponse.json({ success: false, error: cruiseReservationError.message }, { status: 500 });
        }

        const cruiseReservations = (cruiseReservationsRaw || []) as ReservationRow[];
        const cruiseReservationIds = cruiseReservations.map((row) => row.re_id);

        if (cruiseReservationIds.length === 0) {
            return NextResponse.json({ success: true, targetCount: carRows.length, updatedCount: 0, skippedCount: carRows.length });
        }

        const { data: reservationCruiseRowsRaw, error: reservationCruiseError } = await serviceSupabase
            .from('reservation_cruise')
            .select('reservation_id, room_price_code')
            .in('reservation_id', cruiseReservationIds);

        if (reservationCruiseError) {
            return NextResponse.json({ success: false, error: reservationCruiseError.message }, { status: 500 });
        }

        const reservationCruiseRows = (reservationCruiseRowsRaw || []) as ReservationCruiseRow[];
        const uuidRoomPriceCodes = Array.from(
            new Set(
                reservationCruiseRows
                    .map((row) => (row.room_price_code || '').trim())
                    .filter((code) => UUID_REGEX.test(code))
            )
        );

        if (uuidRoomPriceCodes.length === 0) {
            return NextResponse.json({ success: true, targetCount: carRows.length, updatedCount: 0, skippedCount: carRows.length });
        }

        const { data: cruiseRateCardRowsRaw, error: cruiseRateCardError } = await serviceSupabase
            .from('cruise_rate_card')
            .select('id, cruise_name')
            .in('id', uuidRoomPriceCodes);

        if (cruiseRateCardError) {
            return NextResponse.json({ success: false, error: cruiseRateCardError.message }, { status: 500 });
        }

        const cruiseRateCardRows = (cruiseRateCardRowsRaw || []) as CruiseRateCardRow[];
        const cruiseNameByRateCardId = new Map(
            cruiseRateCardRows.map((row) => [row.id, row.cruise_name])
        );

        const quoteIdByCruiseReservationId = new Map(
            cruiseReservations.map((row) => [row.re_id, row.re_quote_id])
        );

        const cruiseNameByQuoteId = new Map<string, string>();
        for (const row of reservationCruiseRows) {
            const quoteId = quoteIdByCruiseReservationId.get(row.reservation_id);
            const cruiseName = cruiseNameByRateCardId.get((row.room_price_code || '').trim());
            if (quoteId && cruiseName && !cruiseNameByQuoteId.has(quoteId)) {
                cruiseNameByQuoteId.set(quoteId, cruiseName);
            }
        }

        const { data: cruiseLocationRowsRaw, error: cruiseLocationError } = await serviceSupabase
            .from('cruise_location')
            .select('kr_name, en_name, pier_location');

        if (cruiseLocationError) {
            return NextResponse.json({ success: false, error: cruiseLocationError.message }, { status: 500 });
        }

        const cruiseLocationRows = (cruiseLocationRowsRaw || []) as CruiseLocationRow[];
        const pierByCruiseName = new Map<string, string>();

        for (const row of cruiseLocationRows) {
            const pier = (row.pier_location || '').trim();
            if (!pier) continue;

            const krKey = normalize(row.kr_name);
            if (krKey && !pierByCruiseName.has(krKey)) {
                pierByCruiseName.set(krKey, pier);
            }

            const enKey = normalize(row.en_name);
            if (enKey && !pierByCruiseName.has(enKey)) {
                pierByCruiseName.set(enKey, pier);
            }
        }

        const updates: Array<{ id: string; pickup_location: string | null; dropoff_location: string | null }> = [];

        for (const carRow of carRows) {
            const reservationId = carRow.reservation_id;
            if (!reservationId) continue;

            const quoteId = quoteIdByReservationId.get(reservationId);
            if (!quoteId) continue;

            const cruiseName = cruiseNameByQuoteId.get(quoteId);
            if (!cruiseName) continue;

            const pier = pierByCruiseName.get(normalize(cruiseName));
            if (!pier) continue;

            const nextPickup = (carRow.pickup_location || '').trim() === TARGET_TEXT ? pier : carRow.pickup_location;
            const nextDropoff = (carRow.dropoff_location || '').trim() === TARGET_TEXT ? pier : carRow.dropoff_location;

            if (nextPickup !== carRow.pickup_location || nextDropoff !== carRow.dropoff_location) {
                updates.push({
                    id: carRow.id,
                    pickup_location: nextPickup,
                    dropoff_location: nextDropoff,
                });
            }
        }

        for (const row of updates) {
            const { error: updateError } = await serviceSupabase
                .from('reservation_car_sht')
                .update({ pickup_location: row.pickup_location, dropoff_location: row.dropoff_location })
                .eq('id', row.id);
            if (updateError) {
                return NextResponse.json({ success: false, error: updateError.message }, { status: 500 });
            }
        }

        return NextResponse.json({
            success: true,
            targetCount: carRows.length,
            updatedCount: updates.length,
            skippedCount: carRows.length - updates.length,
        });
    } catch (error: any) {
        return NextResponse.json(
            { success: false, error: error?.message || 'Internal server error' },
            { status: 500 }
        );
    }
}
