// 홈페이지로 공개 상품 카탈로그를 전송하는 관리자 서버 전용 도우미다.
import serviceSupabase from '@/lib/serviceSupabase';

type CatalogRow = Record<string, unknown>;

const CATALOGS = [
  // 크루즈 홈페이지 표시·상세·요금·프로모션에 필요한 읽기 전용 원본 11종이다.
  { table: 'cruise_info', select: 'id,cruise_code,name,description,duration,features,images,base_price,created_at,updated_at,category,cruise_name,cruise_image,room_name,room_image,room_area,room_description,room_url,bed_type,max_adults,max_guests,has_balcony,is_vip,has_butler,is_recommended,connecting_available,extra_bed_available,special_amenities,warnings,itinerary,cancellation_policy,inclusions,exclusions,star_rating,capacity,awards,facilities,display_order,cruise_images,room_images' },
  {
    table: 'cruise_rate_card',
    select: 'id,cruise_name,schedule_type,room_type,room_type_en,price_adult,price_child,price_infant,price_extra_bed,price_single,valid_year,valid_from,valid_to,display_order,currency,is_active,notes,created_at,updated_at,price_child_extra_bed,extra_bed_available,includes_vehicle,vehicle_type,infant_policy,season_name,is_promotion,price_child_older,child_age_range,single_available',
  },
  { table: 'cruise_rate_card_inclusions', select: 'id,rate_card_id,inclusion_text,display_order,created_at' },
  { table: 'cruise_location', select: 'id,en_name,kr_name,pier_location,pier_map_url,tour_schedule_url,details,created_at' },
  { table: 'cruise_promotion', select: 'id,code,name,cruise_name,booking_from,booking_to,checkin_from,checkin_to,quota_total,is_active,notes,created_at,updated_at' },
  { table: 'cruise_promotion_rate', select: 'id,promotion_id,schedule_type,room_type,checkin_from,checkin_to,price_adult,price_child,price_infant,price_extra_bed,price_child_extra_bed,price_single,currency,created_at,updated_at' },
  { table: 'cruise_holiday_surcharge', select: 'id,cruise_name,schedule_type,holiday_date,holiday_date_end,holiday_name,surcharge_per_person,surcharge_type,valid_year,is_confirmed,currency,notes,created_at,updated_at,surcharge_child' },
  { table: 'cruise_tour_options', select: 'option_id,cruise_name,schedule_type,option_name,option_name_en,option_price,option_type,description,is_active,created_at,updated_at' },
  { table: 'cruise_info_by_category', select: 'category,cruise_name,room_count,room_names,room_areas' },
  { table: 'cruise_info_view', select: 'id,cruise_code,name,description,duration,features,images,base_price,created_at,updated_at' },
  { table: 'cruise_rooms_view', select: 'id,category,cruise_name,cruise_image,room_name,room_image,room_area,room_description,room_url,created_at,updated_at' },
  {
    table: 'hotel_info',
    select: 'hotel_code,hotel_name,product_type,location,star_rating,notes,active,updated_at',
  },
  {
    table: 'hotel_price',
    select: 'hotel_price_code,hotel_code,hotel_name,room_type,room_name,room_category,occupancy_max,include_breakfast,base_price,extra_person_price,child_policy,season_name,start_date,end_date,weekday_type,notes,created_at,updated_at',
  },
  // 공항 요금과 공항명은 함께 읽지만, 플랫폼 원본에는 어떠한 변경도 하지 않는다.
  { table: 'airport_name', select: 'airport_id,airport_code,airport_name,created_at' },
  { table: 'airport_price', select: 'id,airport_code,service_type,vehicle_type,vehicle_examples,recommended_capacity,max_capacity,route,route_from,route_to,duration,price,year,is_active,created_at,updated_at' },
  {
    table: 'tour',
    select: 'tour_id,tour_code,tour_name,category,description,overview,duration,guide_language,group_type,location,starting_point,meeting_time,image_url,thumbnail_url,rating,review_count,is_active,status,min_age_free_applicable,special_age_policy_description,contact_info,payment_notes,cancellation_policy_url,created_at,updated_at,program_type,is_cruise_addon',
  },
  {
    table: 'tour_pricing',
    select: 'pricing_id,tour_id,min_guests,max_guests,price_per_person,vehicle_type,deposit_amount,deposit_rate,deposit_payment_method,balance_payment_method,balance_currency,season_key,valid_from,valid_until,is_active,created_at,updated_at,default_payment_method,adult_price,child_price',
  },
  { table: 'tour_schedule', select: 'schedule_id,tour_id,day_number,order_seq,start_time,end_time,activity_name,activity_description,location,duration_minutes,notes,optional,order_changeable,created_at' },
  { table: 'tour_inclusions', select: 'inclusion_id,tour_id,order_seq,description,icon,category,created_at' },
  { table: 'tour_exclusions', select: 'exclusion_id,tour_id,order_seq,description,category,estimated_price,price_currency,notes,created_at' },
  { table: 'tour_important_info', select: 'info_id,tour_id,info_type,title,content,order_seq,is_highlighted,icon,created_at' },
  { table: 'tour_addon_options', select: 'option_id,tour_id,option_name,option_category,description,detailed_description,price,price_type,price_currency,is_guide_escort_fee,is_post_tour_optional,duration_minutes,is_required,is_available,max_capacity,order_seq,created_at,updated_at' },
  { table: 'tour_payment_pricing', select: 'payment_pricing_id,tour_id,payment_method,price,price_adjustment,currency,valid_from,valid_until,notes,is_active,created_at,updated_at' },
  { table: 'tour_cancellation_policy', select: 'policy_id,tour_id,policy_name,order_seq,days_before_min,days_before_max,penalty_type,penalty_amount,penalty_rate,description,refundable,notes,created_at' },
  { table: 'tour_cruise_integration', select: 'cruise_integration_id,tour_id,is_cruise_compatible,cruise_addon_type,cruise_linking_note,requires_cruise_booking,cruise_booking_code,cruise_contact_info,is_active,created_at,updated_at' },
  {
    table: 'rentcar_price',
    select: 'id,rent_code,category,car_category_code,vehicle_type,route,route_from,route_to,way_type,price,capacity,duration_hours,rental_type,year,description,is_active,created_at,updated_at,cruise,memo',
  },
] as const;

function sourceRecordId(table: string, row: CatalogRow, index: number) {
  const values = row as Record<string, string | number | null | undefined>;
  if (table === 'cruise_info_by_category') return `${values.category || ''}:${values.cruise_name || index}`;
  return values.id || values.option_id || values.pricing_id || values.schedule_id || values.inclusion_id
    || values.exclusion_id || values.info_id || values.payment_pricing_id || values.policy_id
    || values.cruise_integration_id || values.hotel_price_code || values.hotel_code || values.airport_id
    || values.tour_id || values.rent_code || null;
}

async function fetchAllRows(table: string, select: string) {
  if (!serviceSupabase) throw new Error('SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다.');
  const rows: CatalogRow[] = [];
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

  const entries = await Promise.all(CATALOGS.map(async (catalog) => {
    const rows = await fetchAllRows(catalog.table, catalog.select);
    return [catalog.table, rows.map((row, index) => ({ ...row, __source_id: String(sourceRecordId(catalog.table, row, index) || index) }))] as const;
  }));
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

async function requestHomepageTransform(method: 'GET' | 'POST') {
  const targetUrl = process.env.HOMEPAGE_SYNC_URL;
  const sharedSecret = process.env.HOMEPAGE_SYNC_SECRET;
  if (!targetUrl || !sharedSecret) throw new Error('HOMEPAGE_SYNC_URL 또는 HOMEPAGE_SYNC_SECRET이 설정되지 않았습니다.');
  const response = await fetch(targetUrl.replace(/\/sync$/, '/transform'), {
    method,
    headers: { Authorization: `Bearer ${sharedSecret}` },
    cache: 'no-store',
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok) throw new Error(result.error || `홈페이지 변환 응답 오류 (${response.status})`);
  return result;
}

export function getHomepageCatalogStatus() {
  return requestHomepageTransform('GET');
}

export function refreshHomepageCatalog() {
  return requestHomepageTransform('POST');
}
