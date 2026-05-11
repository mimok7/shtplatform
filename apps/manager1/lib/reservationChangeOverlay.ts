/**
 * reservation_change_* 오버레이 유틸 (manager1 미러)
 * - manager 측 ../../manager/src/lib/reservationChangeOverlay.ts 와 동일 로직
 */
import supabase from './supabase';

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
        if (map.has(row.reservation_id)) continue;
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

export async function applyChangeOverlay<T extends { reservation_id: string }>(
    serviceType: OverlayServiceType,
    baseRows: T[] | null | undefined,
    options?: {
        metaMap?: Map<string, ChangeMeta>;
        replaceMultiRow?: boolean;
    },
): Promise<T[]> {
    const rows = baseRows || [];
    if (rows.length === 0) return rows as T[];

    const reservationIds = Array.from(new Set(rows.map((r) => r.reservation_id).filter(Boolean)));
    if (reservationIds.length === 0) return rows as T[];

    const metaMap = options?.metaMap ?? (await fetchLatestActiveChangeRequests(reservationIds));
    if (metaMap.size === 0) return rows as T[];

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

    const changeByRes = new Map<string, any[]>();
    for (const r of (changeRows || []) as any[]) {
        const list = changeByRes.get(r.reservation_id) || [];
        list.push(r);
        changeByRes.set(r.reservation_id, list);
    }

    if (options?.replaceMultiRow) {
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

    return rows.map((r) => {
        const meta = applicable.get(r.reservation_id);
        if (!meta) return r;
        const list = changeByRes.get(r.reservation_id) || [];
        const ov = list[0];
        if (!ov) return r;
        return mergeOverride(r, ov, meta);
    });
}
