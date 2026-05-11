/**
 * 예약 수정 변경 추적 (reservation_change_*) 공용 유틸 (manager1 미러)
 * 사용 가이드: ../../manager/src/lib/reservationChangeTracker.ts 와 동일
 */
import supabase from './supabase';

export type ChangeServiceType =
    | 'cruise'
    | 'cruise_car'
    | 'airport'
    | 'hotel'
    | 'tour'
    | 'rentcar'
    | 'car_sht'
    | 'package';

export interface RecordChangeInput {
    reservationId: string;
    reType: string;
    rows: Partial<Record<ChangeServiceType, any[]>>;
    managerNote?: string;
    customerNote?: string;
    snapshotData?: any;
    status?: 'approved' | 'pending' | 'applied' | 'rejected';
}

const CHILD_TABLE: Record<ChangeServiceType, string> = {
    cruise: 'reservation_change_cruise',
    cruise_car: 'reservation_change_cruise_car',
    airport: 'reservation_change_airport',
    hotel: 'reservation_change_hotel',
    tour: 'reservation_change_tour',
    rentcar: 'reservation_change_rentcar',
    car_sht: 'reservation_change_car_sht',
    package: 'reservation_change_package',
};

const STRIP_FIELDS = new Set(['id', 'created_at', 'updated_at']);

function sanitizeRow(row: any, requestId: string, reservationId: string) {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(row || {})) {
        if (STRIP_FIELDS.has(k)) continue;
        out[k] = v;
    }
    out.request_id = requestId;
    out.reservation_id = reservationId;
    return out;
}

export async function recordReservationChange(input: RecordChangeInput): Promise<{
    requestId: string | null;
    error: any;
    childErrors: Record<string, any>;
}> {
    const childErrors: Record<string, any> = {};
    try {
        const { data: userData } = await supabase.auth.getUser();
        const userId = userData?.user?.id;
        if (!userId) {
            console.warn('[change-tracker] 인증 사용자 없음 - 변경 기록 생략');
            return { requestId: null, error: 'no_auth_user', childErrors };
        }

        const status = input.status ?? 'approved';

        const { data: req, error: reqErr } = await supabase
            .from('reservation_change_request')
            .insert({
                reservation_id: input.reservationId,
                re_type: input.reType,
                requester_user_id: userId,
                status,
                customer_note: input.customerNote ?? null,
                manager_note: input.managerNote ?? '매니저 직접 수정',
                reviewed_at: status === 'approved' || status === 'applied' ? new Date().toISOString() : null,
                reviewed_by: status === 'approved' || status === 'applied' ? userId : null,
                snapshot_data: input.snapshotData ?? null,
            })
            .select('id')
            .single();

        if (reqErr || !req) {
            console.error('[change-tracker] reservation_change_request 생성 실패:', reqErr);
            return { requestId: null, error: reqErr, childErrors };
        }

        const requestId = req.id as string;

        for (const [type, rows] of Object.entries(input.rows)) {
            if (!rows || rows.length === 0) continue;
            const tbl = CHILD_TABLE[type as ChangeServiceType];
            if (!tbl) continue;
            const payload = rows.map((r) => sanitizeRow(r, requestId, input.reservationId));
            const { error: childErr } = await supabase.from(tbl).insert(payload);
            if (childErr) {
                console.error(`[change-tracker] ${tbl} INSERT 실패:`, childErr);
                childErrors[type] = childErr;
            }
        }

        return { requestId, error: null, childErrors };
    } catch (e) {
        console.error('[change-tracker] 예외:', e);
        return { requestId: null, error: e, childErrors };
    }
}
