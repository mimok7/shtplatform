/**
 * reservation_change_* 테이블의 최신 변경값을 reservation_* 행 위에 오버레이.
 * - 활성 상태(reservation_change_request.status NOT IN ('rejected','cancelled')) 중
 *   가장 최근 submitted_at 행을 reservation_id 별로 선택
 * - change_<type> 의 컬럼 중 NULL 이 아닌 값만 base 행에 덮어씀
 * - 결과 각 행에 _change_meta 메타데이터 부여
 */
import supabase from '@/lib/supabase';

export type OverlayServiceType =
    | 'cruise'
    | 'cruise_car'
    | 'airport'
    | 'hotel'
    | 'tour'
    | 'rentcar'
    | 'car_sht'
    | 'package';

const CHILD_TABLE: Record<OverlayServiceType, string> = {
    cruise: 'reservation_change_cruise',
    cruise_car: 'reservation_change_cruise_car',
    airport: 'reservation_change_airport',
    hotel: 'reservation_change_hotel',
    tour: 'reservation_change_tour',
    rentcar: 'reservation_change_rentcar',
    car_sht: 'reservation_change_car_sht',
    package: 'reservation_change_package',
};

/** request 의 re_type → overlay 적용 가능한 자식 서비스 후보 매핑 */
const TYPE_TO_CHILDREN: Record<string, OverlayServiceType[]> = {
    cruise: ['cruise', 'cruise_car'],
    cruise_car: ['cruise_car'],
    airport: ['airport'],
    hotel: ['hotel'],
    tour: ['tour'],
    rentcar: ['rentcar'],
    car_sht: ['car_sht'],
    sht: ['car_sht'],
    package: ['package'],
};

const META_KEY = '_change_meta';
const STRIP = new Set(['id', 'request_id', 'reservation_id', 'created_at', 'updated_at']);

export interface ChangeMeta {
    request_id: string;
    re_type: string;
    status: string;
    submitted_at: string | null;
    customer_note: string | null;
    manager_note: string | null;
}

/**
 * reservation_id 목록에 대해 활성 change_request 최신본을 조회.
 * 반환: Map<reservationId, ChangeMeta>
 */
export async function fetchLatestActiveChangeRequests(
    reservationIds: string[],
): Promise<Map<string, ChangeMeta>> {
    const map = new Map<string, ChangeMeta>();
    if (!reservationIds || reservationIds.length === 0) return map;

    const { data, error } = await supabase
        .from('reservation_change_request')
        .select('id, reservation_id, re_type, status, submitted_at, customer_note, manager_note')
        .in('reservation_id', reservationIds)
        .not('status', 'in', '(rejected,cancelled)')
        .order('submitted_at', { ascending: false });

    if (error || !data) {
        if (error) console.warn('[overlay] change_request 조회 실패:', error);
        return map;
    }

    for (const row of data as any[]) {
        if (map.has(row.reservation_id)) continue; // 최신만 선택
        map.set(row.reservation_id, {
            request_id: row.id,
            re_type: row.re_type,
            status: row.status,
            submitted_at: row.submitted_at,
            customer_note: row.customer_note,
            manager_note: row.manager_note,
        });
    }
    return map;
}

function mergeOverride<T extends Record<string, any>>(base: T, override: any, meta: ChangeMeta): T {
    const merged: Record<string, any> = { ...base };
    for (const [k, v] of Object.entries(override || {})) {
        if (STRIP.has(k)) continue;
        if (v === null || v === undefined) continue;
        merged[k] = v;
    }
    merged[META_KEY] = meta;
    return merged as T;
}

/**
 * 단일 서비스 타입의 base rows 위에 overlay 적용.
 * - base rows 의 reservation_id 별로 가장 최근 활성 change_request 가 있고
 *   해당 request 가 이 서비스 타입에 매핑되면 change_<type> 의 첫 행을 머지
 *   (cruise 의 경우 한 reservation 당 여러 객실이지만, 매니저가 "전체 재저장"하므로 각 행은 동일 request_id 를 공유)
 * - cruise_car 등 다중 행 테이블의 경우 all rows 를 fetch 해서 base 와 매칭(reservation_id 단위로 모두 교체).
 */
export async function applyChangeOverlay<T extends { reservation_id: string }>(
    serviceType: OverlayServiceType,
    baseRows: T[] | null | undefined,
    options?: {
        /** 사전에 조회한 metaMap 재사용 (다중 호출 최적화) */
        metaMap?: Map<string, ChangeMeta>;
        /** true 면 cruise/cruise_car 등 다중 행 테이블에서 reservation_id 단위로 base 전체를 change rows 로 교체 */
        replaceMultiRow?: boolean;
    },
): Promise<T[]> {
    const rows = baseRows || [];
    if (rows.length === 0) return rows as T[];

    const reservationIds = Array.from(new Set(rows.map((r) => r.reservation_id).filter(Boolean)));
    if (reservationIds.length === 0) return rows as T[];

    const metaMap = options?.metaMap ?? (await fetchLatestActiveChangeRequests(reservationIds));
    if (metaMap.size === 0) return rows as T[];

    // 이 서비스 타입에 적용 가능한 reservation 만 필터
    const applicable = new Map<string, ChangeMeta>();
    for (const [resId, meta] of metaMap.entries()) {
        const children = TYPE_TO_CHILDREN[meta.re_type] || [];
        if (children.includes(serviceType)) applicable.set(resId, meta);
    }
    if (applicable.size === 0) return rows as T[];

    const requestIds = Array.from(new Set(Array.from(applicable.values()).map((m) => m.request_id)));
    const tbl = CHILD_TABLE[serviceType];
    const { data: changeRows, error } = await supabase
        .from(tbl)
        .select('*')
        .in('request_id', requestIds);

    if (error) {
        console.warn(`[overlay] ${tbl} 조회 실패:`, error);
        return rows as T[];
    }

    // change rows 를 reservation_id → rows[] 로 그룹핑
    const changeByRes = new Map<string, any[]>();
    for (const r of (changeRows || []) as any[]) {
        const list = changeByRes.get(r.reservation_id) || [];
        list.push(r);
        changeByRes.set(r.reservation_id, list);
    }

    if (options?.replaceMultiRow) {
        // 다중 행 교체: 변경된 reservation 의 base 행은 제거, change 행으로 대체
        const result: T[] = [];
        const replaced = new Set<string>();
        for (const r of rows) {
            const meta = applicable.get(r.reservation_id);
            if (!meta) {
                result.push(r);
                continue;
            }
            if (replaced.has(r.reservation_id)) continue;
            const list = changeByRes.get(r.reservation_id) || [];
            if (list.length === 0) {
                // change 행이 없으면 base 유지
                result.push(r);
                continue;
            }
            for (const c of list) {
                const merged = mergeOverride({ ...r } as any, c, meta);
                result.push(merged as T);
            }
            replaced.add(r.reservation_id);
        }
        return result;
    }

    // 기본: base 행 위에 첫 change 행을 머지
    return rows.map((r) => {
        const meta = applicable.get(r.reservation_id);
        if (!meta) return r;
        const list = changeByRes.get(r.reservation_id) || [];
        const ov = list[0];
        if (!ov) return r;
        return mergeOverride(r, ov, meta);
    });
}
