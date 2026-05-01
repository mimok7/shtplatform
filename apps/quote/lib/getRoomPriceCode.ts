import supabase from './supabase';

/**
 * @deprecated cruise_rate_card 기반으로 전환됨. room_price 테이블 더 이상 사용하지 않음.
 * cruise_rate_card.id를 직접 사용하세요.
 */
export async function getRoomPriceCode({
  schedule_code,
  cruise_code,
  payment_code,
  room_code,
  checkin_date,
  room_category_code,
}: {
  schedule_code: string;
  cruise_code: string;
  payment_code: string;
  room_code: string;
  checkin_date: string;
  room_category_code: string;
}) {
  const formattedDate = new Date(checkin_date).toISOString().split('T')[0];

  // cruise_rate_card에서 조회
  const { data, error } = await supabase
    .from('cruise_rate_card')
    .select('id')
    .eq('cruise_name', cruise_code)
    .eq('schedule_type', schedule_code)
    .eq('room_type', room_code)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    console.warn('❌ cruise_rate_card 조회 실패:', {
      error: error?.message,
      schedule_code,
      cruise_code,
      room_code,
      checkin_date,
    });
    return null;
  }

  return data.id;
}
