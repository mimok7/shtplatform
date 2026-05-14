import type { SupabaseClient as TypedSupabaseClient } from '@supabase/supabase-js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = TypedSupabaseClient<any, any, any>;

export interface TourPriceInput {
  tour_code?: string;
  tour_price_code?: string;
  adult_count?: number;
  child_count?: number;
}

export interface TourPriceResult {
  adult_price: number;
  child_price: number;
  adult_count: number;
  child_count: number;
  subtotal: number;
  price_breakdown: Record<string, unknown>;
}

export class TourPriceCalculator {
  constructor(private readonly supabase: SupabaseLike) {}

  async calculate(input: TourPriceInput): Promise<TourPriceResult> {
    const adult_count = Math.max(0, input.adult_count ?? 0);
    const child_count = Math.max(0, input.child_count ?? 0);

    let query = this.supabase
      .from('tour_pricing')
      .select('tour_code, pricing_id, adult_price, child_price, price_per_person');

    if (input.tour_price_code) {
      query = query.eq('pricing_id', input.tour_price_code);
    } else if (input.tour_code) {
      query = query.eq('tour_code', input.tour_code);
    }

    const { data, error } = await query.limit(1).maybeSingle();
    if (error) {
      throw new Error(`투어 가격 조회 실패: ${error.message}`);
    }

    const adult_price = Number(
      (data as { adult_price?: number | null } | null)?.adult_price ??
      (data as { price_per_person?: number } | null)?.price_per_person ?? 0
    );
    const child_price = Number(
      (data as { child_price?: number | null } | null)?.child_price ??
      (data as { price_per_person?: number } | null)?.price_per_person ?? 0
    );
    const subtotal = adult_price * adult_count + child_price * child_count;

    return {
      adult_price,
      child_price,
      adult_count,
      child_count,
      subtotal,
      price_breakdown: {
        tour_code: input.tour_code ?? (data as { tour_code?: string } | null)?.tour_code ?? null,
        pricing_id:
          input.tour_price_code ?? (data as { pricing_id?: string } | null)?.pricing_id ?? null,
        adult_price,
        child_price,
        adult_count,
        child_count,
        subtotal,
      },
    };
  }
}
