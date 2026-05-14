import type { SupabaseClient as TypedSupabaseClient } from '@supabase/supabase-js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = TypedSupabaseClient<any, any, any>;

export interface AirportPriceInput {
  airport_price_code?: string;
  airport_code?: string;
  service_type?: string;
  quantity?: number;
}

export interface AirportPriceResult {
  unit_price: number;
  quantity: number;
  subtotal: number;
  price_breakdown: Record<string, unknown>;
}

export class AirportPriceCalculator {
  constructor(private readonly supabase: SupabaseLike) {}

  async calculate(input: AirportPriceInput): Promise<AirportPriceResult> {
    const quantity = Math.max(1, input.quantity ?? 1);

    // airport_price_code 또는 airport_code로 조회
    let query = this.supabase.from('airport_price').select('id, airport_code, service_type, price');

    if (input.airport_price_code) {
      query = query.eq('id', input.airport_price_code);
    } else if (input.airport_code) {
      query = query.eq('airport_code', input.airport_code);
      if (input.service_type) query = query.eq('service_type', input.service_type);
    }

    const { data, error } = await query.limit(1).maybeSingle();
    if (error) {
      throw new Error(`공항 가격 조회 실패: ${error.message}`);
    }

    const unit_price = Number((data as { price?: number } | null)?.price ?? 0);
    const subtotal = unit_price * quantity;

    return {
      unit_price,
      quantity,
      subtotal,
      price_breakdown: {
        airport_price_id: input.airport_price_code ?? (data as { id?: string } | null)?.id ?? null,
        airport_code: input.airport_code ?? (data as { airport_code?: string } | null)?.airport_code ?? null,
        service_type: input.service_type ?? (data as { service_type?: string } | null)?.service_type ?? null,
        unit_price,
        quantity,
        subtotal,
      },
    };
  }
}
