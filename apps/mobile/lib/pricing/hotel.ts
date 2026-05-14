import type { SupabaseClient as TypedSupabaseClient } from '@supabase/supabase-js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = TypedSupabaseClient<any, any, any>;

export interface HotelPriceInput {
  hotel_price_code: string;
  checkin_date: string;
  checkout_date: string;
  room_count?: number;
}

export interface HotelPriceResult {
  base_price: number;
  nights: number;
  room_count: number;
  subtotal: number;
  price_breakdown: Record<string, unknown>;
}

function getNightCount(checkin_date: string, checkout_date: string): number {
  const checkin = new Date(checkin_date);
  const checkout = new Date(checkout_date);
  const diff = checkout.getTime() - checkin.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export class HotelPriceCalculator {
  constructor(private readonly supabase: SupabaseLike) {}

  async calculate(input: HotelPriceInput): Promise<HotelPriceResult> {
    const room_count = Math.max(1, input.room_count ?? 1);
    const nights = getNightCount(input.checkin_date, input.checkout_date);

    const { data, error } = await this.supabase
      .from('hotel_price')
      .select('base_price')
      .eq('hotel_price_code', input.hotel_price_code)
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(`호텔 가격 조회 실패: ${error.message}`);
    }

    const base_price = Number((data as { base_price?: number } | null)?.base_price ?? 0);
    const subtotal = base_price * nights * room_count;

    return {
      base_price,
      nights,
      room_count,
      subtotal,
      price_breakdown: {
        hotel_price_code: input.hotel_price_code,
        checkin_date: input.checkin_date,
        checkout_date: input.checkout_date,
        nights,
        room_count,
        base_price,
        subtotal,
      },
    };
  }
}
