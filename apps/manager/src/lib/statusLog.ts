import supabase from './supabase';

/**
 * 예약 상태 변경 로그를 기록합니다.
 * 상태 변경이 발생하는 모든 곳에서 호출해야 합니다.
 */
export async function logStatusChange(params: {
    reservationId: string;
    reType?: string;
    prevStatus?: string;
    newStatus: string;
    changedBy?: string;
    changedByEmail?: string;
    note?: string;
}) {
    try {
        const { error } = await supabase
            .from('reservation_status_log')
            .insert({
                reservation_id: params.reservationId,
                re_type: params.reType || null,
                prev_status: params.prevStatus || null,
                new_status: params.newStatus,
                changed_by: params.changedBy || null,
                changed_by_email: params.changedByEmail || null,
                note: params.note || null,
            });
        if (error) {
            console.warn('상태 변경 로그 기록 실패:', error.message);
        }
    } catch (e) {
        console.warn('상태 변경 로그 기록 오류:', e);
    }
}

/**
 * 여러 예약의 상태 변경 로그를 일괄 기록합니다.
 */
export async function logBulkStatusChange(params: {
    reservationIds: string[];
    reTypes?: Map<string, string>;
    prevStatuses?: Map<string, string>;
    newStatus: string;
    changedBy?: string;
    changedByEmail?: string;
    note?: string;
}) {
    if (params.reservationIds.length === 0) return;
    try {
        const rows = params.reservationIds.map((id) => ({
            reservation_id: id,
            re_type: params.reTypes?.get(id) || null,
            prev_status: params.prevStatuses?.get(id) || null,
            new_status: params.newStatus,
            changed_by: params.changedBy || null,
            changed_by_email: params.changedByEmail || null,
            note: params.note || null,
        }));
        const { error } = await supabase
            .from('reservation_status_log')
            .insert(rows);
        if (error) {
            console.warn('일괄 상태 변경 로그 기록 실패:', error.message);
        }
    } catch (e) {
        console.warn('일괄 상태 변경 로그 기록 오류:', e);
    }
}
