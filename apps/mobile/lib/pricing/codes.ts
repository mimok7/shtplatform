/**
 * 가격 코드 조회 헬퍼 (room_price_code, car_price_code 등)
 */
import type { SupabaseClient as TypedSupabaseClient } from '@supabase/supabase-js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = TypedSupabaseClient<any, any, any>;

export interface RoomPriceCodeInput {
  schedule_code: string;
  cruise_code: string;
  payment_code?: string;
  room_code: string;
  checkin_date: string;
  room_category_code?: string;
}

/**
 * cruise_rate_card.id 를 room_price_code 로 사용.
 * schedule_type, cruise_name, room_type, valid 기간 일치하는 카드 1건 조회.
 */
export async function getRoomPriceCode(
  supabase: SupabaseLike,
  input: RoomPriceCodeInput,
): Promise<string | null> {
  const formattedDate = new Date(input.checkin_date).toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('cruise_rate_card')
    .select('id')
    .eq('schedule_type', input.schedule_code)
    .eq('cruise_name', input.cruise_code)
    .eq('room_type', input.room_code)
    .eq('is_active', true)
    .lte('valid_from', formattedDate)
    .gte('valid_to', formattedDate)
    .limit(1)
    .single();

  if (error || !data) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any).id as string;
}

export interface CarPriceCodeInput {
  schedule_code: string;
  cruise_code: string;
  car_code: string;
  car_category_code: string;
}

export async function getCarPriceCode(
  supabase: SupabaseLike,
  input: CarPriceCodeInput,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('rentcar_price')
    .select('code')
    .eq('schedule_code', input.schedule_code)
    .eq('cruise_code', input.cruise_code)
    .eq('rent_code', input.car_code)
    .eq('car_category_code', input.car_category_code)
    .limit(1)
    .single();

  if (error || !data) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any).code as string;
}

export interface AirportPriceCodeInput {
  airport_code: string;
  service_type?: '픽업' | '샌딩';
}

export async function getAirportPriceCode(
  supabase: SupabaseLike,
  input: AirportPriceCodeInput,
): Promise<string | null> {
  let query = supabase
    .from('airport_price')
    .select('airport_code')
    .eq('airport_code', input.airport_code);

  if (input.service_type) query = query.eq('service_type', input.service_type);

  const { data, error } = await query.limit(1).maybeSingle();
  if (error || !data) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any).airport_code as string;
}
