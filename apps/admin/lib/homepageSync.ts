// 홈페이지로 공개 상품 카탈로그를 전송하는 관리자 서버 전용 도우미다.
import serviceSupabase from '@/lib/serviceSupabase';

const CATALOGS = [
  {
    table: 'cruise_rate_card',
    select: 'id,cruise_name,schedule_type,room_type,room_type_en,currency,price_adult,price_child,price_infant,price_single,price_extra_bed,valid_from,valid_to,season_name,is_active,updated_at',
  },
  {
    table: 'hotel_price',
    select: 'hotel_price_code,hotel_code,hotel_name,room_type,room_name,base_price,start_date,end_date,season_name,updated_at',
  },
  {
    table: 'tour_pricing',
    select: 'pricing_id,tour_id,min_guests,max_guests,price_per_person,valid_from,valid_until,is_active,updated_at',
  },
  {
    table: 'rentcar_price',
    select: 'id,rent_code,category,vehicle_type,route,route_from,route_to,way_type,price,capacity,year,is_active,updated_at',
  },
] as const;

async function fetchAllRows(table: string, select: string) {
  if (!serviceSupabase) throw new Error('SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다.');
  const rows: Record<string, unknown>[] = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await serviceSupabase.from(table).select(select).range(offset, offset + pageSize - 1);
    if (error) throw new Error(`${table} 조회 실패: ${error.message}`);
    rows.push(...((data || []) as unknown as Record<string, unknown>[]));
    if (!data || data.length < pageSize) return rows;
  }
}

export async function pushHomepageCatalog(trigger: 'manual' | 'scheduled') {
  const targetUrl = process.env.HOMEPAGE_SYNC_URL;
  const sharedSecret = process.env.HOMEPAGE_SYNC_SECRET;
  if (!targetUrl || !sharedSecret) throw new Error('HOMEPAGE_SYNC_URL 또는 HOMEPAGE_SYNC_SECRET이 설정되지 않았습니다.');

  const entries = await Promise.all(CATALOGS.map(async (catalog) => [catalog.table, await fetchAllRows(catalog.table, catalog.select)] as const));
  const catalogs = Object.fromEntries(entries);
  const response = await fetch(targetUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${sharedSecret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: 'sht-platform', trigger, sentAt: new Date().toISOString(), catalogs }),
    cache: 'no-store',
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok) throw new Error(result.error || `홈페이지 응답 오류 (${response.status})`);
  return { ...result, catalogCounts: Object.fromEntries(entries.map(([table, rows]) => [table, rows.length])) };
}
