import supabase from './supabase';

export async function getCarPriceCode({
  schedule_code,
  cruise_code,
  car_code,
  car_category_code,
}: {
  schedule_code: string;
  cruise_code: string;
  car_code: string;
  car_category_code: string;
}): Promise<string | null> {
  const { data, error } = await supabase
    .from('rentcar_price')
    .select('code')
    .eq('schedule_code', schedule_code)
    .eq('cruise_code', cruise_code)
    .eq('rent_code', car_code)
    .eq('car_category_code', car_category_code)
    .limit(1)
    .single();

  if (error || !data) {
    console.warn('❌ rent_price_code 조회 실패 또는 없음:', {
      error: error?.message,
      schedule_code,
      cruise_code,
      car_code,
      car_category_code,
    });
    return null;
  }

  return data.code;
}
