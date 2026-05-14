export interface ReservationPricingLineItem {
  label: string;
  code?: string | null;
  unit_price?: number | null;
  quantity?: number | null;
  total: number;
  metadata?: Record<string, unknown>;
}

export interface ReservationPricingInput {
  serviceType: string;
  baseTotal: number;
  additionalFee?: number | null;
  additionalFeeDetail?: string | null;
  discountRate?: number | null;
  manualDiscountAmount?: number | null;
  lineItems?: ReservationPricingLineItem[];
  metadata?: Record<string, unknown>;
}

export interface ReservationPricingResult {
  base_total: number;
  discount_rate: number;
  discount_rate_amount: number;
  discount_manual_amount: number;
  discount_amount: number;
  discounted_subtotal: number;
  additional_fee: number;
  total_amount: number;
  price_breakdown: Record<string, unknown>;
}

const asMoney = (value?: number | null): number => {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.round(parsed));
};

const asRate = (value?: number | null): number => {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(100, Math.max(0, parsed));
};

export function calculateReservationPricing(input: ReservationPricingInput): ReservationPricingResult {
  const base_total = asMoney(input.baseTotal);
  const additional_fee = asMoney(input.additionalFee);
  const discount_rate = asRate(input.discountRate);
  const discount_rate_amount = Math.min(base_total, Math.round(base_total * (discount_rate / 100)));
  const afterRateDiscount = Math.max(0, base_total - discount_rate_amount);
  const discount_manual_amount = Math.min(afterRateDiscount, asMoney(input.manualDiscountAmount));
  const discount_amount = discount_rate_amount + discount_manual_amount;
  const discounted_subtotal = Math.max(0, base_total - discount_amount);
  const total_amount = discounted_subtotal + additional_fee;

  return {
    base_total,
    discount_rate,
    discount_rate_amount,
    discount_manual_amount,
    discount_amount,
    discounted_subtotal,
    additional_fee,
    total_amount,
    price_breakdown: {
      schema: 'reservation_pricing_v1',
      service_type: input.serviceType,
      line_items: input.lineItems ?? [],
      base_total,
      discount_rate,
      discount_rate_amount,
      discount_manual_amount,
      discount_amount,
      discounted_subtotal,
      additional_fee,
      additional_fee_detail: input.additionalFeeDetail || null,
      grand_total: total_amount,
      metadata: input.metadata ?? {},
      calculated_at: new Date().toISOString(),
    },
  };
}
