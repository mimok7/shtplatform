import type { SupabaseClient as TypedSupabaseClient } from '@supabase/supabase-js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = TypedSupabaseClient<any, any, any>;

export interface RentcarPriceInput {
  car_price_code?: string;
  rent_code?: string;
  quantity?: number;
}

export interface RentcarPriceResult {
  unit_price: number;
  quantity: number;
  subtotal: number;
  price_breakdown: Record<string, unknown>;
}

export class RentcarPriceCalculator {
  constructor(private readonly supabase: SupabaseLike) {}

  async calculate(input: RentcarPriceInput): Promise<RentcarPriceResult> {
    const quantity = Math.max(1, input.quantity ?? 1);

    let query = this.supabase.from('rentcar_price').select('code, rent_code, price');

    if (input.car_price_code) {
      query = query.eq('code', input.car_price_code);
    } else if (input.rent_code) {
      query = query.eq('rent_code', input.rent_code);
    }

    const { data, error } = await query.limit(1).maybeSingle();
    if (error) {
      throw new Error(`렌트카 가격 조회 실패: ${error.message}`);
    }

    const unit_price = Number((data as { price?: number } | null)?.price ?? 0);
    const subtotal = unit_price * quantity;

    return {
      unit_price,
      quantity,
      subtotal,
      price_breakdown: {
        car_price_code: input.car_price_code ?? (data as { code?: string } | null)?.code ?? null,
        rent_code: input.rent_code ?? (data as { rent_code?: string } | null)?.rent_code ?? null,
        unit_price,
        quantity,
        subtotal,
      },
    };
  }
}
