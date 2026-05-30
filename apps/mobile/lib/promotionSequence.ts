import supabase from '@/lib/supabase';

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
 */
export async function fetchPromotionSequenceMap(reservationIds: (string | null | undefined)[]): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    const ids = Array.from(new Set(reservationIds.filter(Boolean))) as string[];
    if (ids.length === 0) return result;

    const { data: mine } = await supabase
        .from('cruise_promotion_usage')
        .select('promotion_id, reservation_id')
        .in('reservation_id', ids)
        .in('status', ACTIVE_STATUSES);

    const promoIds = Array.from(new Set((mine || []).map((r: any) => r.promotion_id).filter(Boolean)));
    if (promoIds.length === 0) return result;

    const { data: all } = await supabase
        .from('cruise_promotion_usage')
        .select('promotion_id, reservation_id, used_at')
        .in('promotion_id', promoIds)
        .in('status', ACTIVE_STATUSES)
        .order('used_at', { ascending: true });

    const counters: Record<string, number> = {};
    const idSet = new Set(ids);
    for (const row of all || []) {
        const pid = (row as any).promotion_id;
        if (!pid) continue;
        counters[pid] = (counters[pid] || 0) + 1;
        const rid = (row as any).reservation_id;
        if (rid && idSet.has(rid) && !result.has(rid)) {
            result.set(rid, counters[pid]);
        }
    }
    return result;
}
