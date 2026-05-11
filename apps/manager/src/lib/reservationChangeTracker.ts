/**
 * 예약 수정 변경 추적 (reservation_change_*) 공용 유틸
 * - 매니저가 예약수정 페이지에서 저장할 때 호출하여
 *   reservation_change_request + reservation_change_<type> 테이블에 INSERT 한다.
 * - 기본 status='approved' (매니저 직접 수정)
 * - read-overlay 와 짝을 이룸: ./reservationChangeOverlay.ts
 */
import supabase from '@/lib/supabase';

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
    /** reservation_change_request.re_type 에 들어갈 값 (보통 메인 서비스 타입) */
    reType: string;
    /** 변경 후 행들. 키는 자식 테이블 식별용 서비스 타입. */
    rows: Partial<Record<ChangeServiceType, any[]>>;
    managerNote?: string;
    customerNote?: string;
    /** 부가 메타(가격 breakdown 등) - reservation_change_request.snapshot_data 에 저장 */
    snapshotData?: any;
    /** 기본 'approved' (매니저 직접 수정). 'pending' 으로 바꾸면 검토 대기. */
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

/**
 * reservation_change_request + child rows 를 INSERT.
 * 실패해도 throw 하지 않음 (편집 저장의 부가 액션으로 동작) — 결과 객체로 반환.
 */
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
