import { supabase } from '@/lib/supabase';

const ACTIVE_STATUSES = ['reserved', 'confirmed'];

/** price_breakdown 안에 프로모션 정보가 있는지 판별 */
export function hasPromotionBreakdown(value: any): boolean {
    if (!value) return false;
    if (value.promotion_code) return true;
    if (Array.isArray(value.applied_promotions) && value.applied_promotions.length > 0) return true;
    if (Array.isArray(value.room_selections) && value.room_selections.some((item: any) => !!item?.promotion_code)) return true;
    return false;
}

/**
 * 예약 ID 목록을 받아 각 예약이 프로모션의 "몇 번째 예약"인지(used_at 오름차순 순번) 맵으로 반환한다.
 * cruise_promotion_usage 의 활성 행(reserved/confirmed)을 promotion_id 별로 used_at 오름차순 정렬해 순번을 매긴다.
 */
export async function fetchPromotionSequenceMap(reservationIds: (string | null | undefined)[]): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    const ids = Array.from(new Set(reservationIds.filter(Boolean))) as string[];
    if (ids.length === 0) return result;

    // 1) 대상 예약의 usage 행 조회 (컬럼 저장값 우선)
    const { data: mine } = await supabase
        .from('cruise_promotion_usage')
        .select('promotion_id, reservation_id, promotion_sequence')
        .in('reservation_id', ids)
        .in('status', ACTIVE_STATUSES);

    for (const row of mine || []) {
        const rid = String((row as any)?.reservation_id || '').trim();
        const seq = Number((row as any)?.promotion_sequence || 0);
        if (rid && seq > 0) result.set(rid, seq);
    }

    const missingIds = ids.filter((rid) => !result.has(rid));
    if (missingIds.length === 0) return result;

    const promoIds = Array.from(new Set((mine || []).map((r: any) => r.promotion_id).filter(Boolean)));
    if (promoIds.length === 0) return result;

    // 2) 누락 건에 한해 기존 계산식 fallback (구데이터 호환)
    const { data: all } = await supabase
        .from('cruise_promotion_usage')
        .select('promotion_id, reservation_id, promotion_sequence, used_at, created_at, id')
        .in('promotion_id', promoIds)
        .in('status', ACTIVE_STATUSES)
        .order('used_at', { ascending: true })
        .order('created_at', { ascending: true })
        .order('id', { ascending: true });

    const counters: Record<string, number> = {};
    const idSet = new Set(missingIds);
    for (const row of all || []) {
        const pid = (row as any).promotion_id;
        if (!pid) continue;
        const explicitSeq = Number((row as any).promotion_sequence || 0);
        counters[pid] = explicitSeq > 0 ? explicitSeq : (counters[pid] || 0) + 1;
        const rid = (row as any).reservation_id;
        if (rid && idSet.has(rid) && !result.has(rid)) {
            result.set(rid, counters[pid]);
        }
    }
    return result;
}
