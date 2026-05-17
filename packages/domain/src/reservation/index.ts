import type { SupabaseClient as TypedSupabaseClient } from '@supabase/supabase-js';

export type SupabaseLike = TypedSupabaseClient<any, any, any>;

export type ReservationType = 'cruise' | 'airport' | 'hotel' | 'rentcar' | 'tour' | 'sht';

export interface ReservationRow {
  re_id: string;
  re_user_id: string;
  re_quote_id: string | null;
  re_type: ReservationType;
  re_status: string | null;
  re_created_at: string;
}

export interface ReservationAmountSource {
  total_amount?: number | string | null;
  price_breakdown?: {
    grand_total?: number | string | null;
  } | null;
}

export interface PreferredPaymentAmountInput {
  reservation?: ReservationAmountSource | null;
  paymentAmount?: number | string | null;
  serviceAmount?: number | string | null;
}

const toFiniteNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * 예약 마스터 최종 금액을 표준 우선순위로 계산한다.
 * 1) reservation.total_amount
 * 2) reservation.price_breakdown.grand_total
 * 3) 0
 */
export function getReservationStoredAmount(reservation?: ReservationAmountSource | null): number {
  const totalAmount = toFiniteNumber(reservation?.total_amount);
  if (totalAmount !== null && totalAmount > 0) return totalAmount;

  const grandTotal = toFiniteNumber(reservation?.price_breakdown?.grand_total);
  if (grandTotal !== null && grandTotal > 0) return grandTotal;

  return 0;
}

/**
 * 결제 화면 표준 우선순위 금액.
 * 1) 예약 마스터 최종 금액(total_amount/grand_total)
 * 2) 결제 레코드 amount
 * 3) 서비스 상세 합계
 */
export function getPreferredPaymentAmount(input: PreferredPaymentAmountInput): number {
  const reservationAmount = getReservationStoredAmount(input.reservation);
  if (reservationAmount > 0) return reservationAmount;

  const paymentAmount = toFiniteNumber(input.paymentAmount);
  if (paymentAmount !== null) return paymentAmount;

  const serviceAmount = toFiniteNumber(input.serviceAmount);
  if (serviceAmount !== null) return serviceAmount;

  return 0;
}

export async function listReservations(
  supabase: SupabaseLike,
  userId: string,
): Promise<ReservationRow[]> {
  const { data, error } = await supabase
    .from('reservation')
    .select('*')
    .eq('re_user_id', userId)
    .order('re_created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as ReservationRow[];
}

export async function findReservationByQuote(
  supabase: SupabaseLike,
  userId: string,
  quoteId: string,
  type: ReservationType,
): Promise<ReservationRow | null> {
  const { data } = await supabase
    .from('reservation')
    .select('*')
    .eq('re_user_id', userId)
    .eq('re_quote_id', quoteId)
    .eq('re_type', type)
    .maybeSingle();
  return (data as ReservationRow | null) ?? null;
}

export async function ensureReservation(
  supabase: SupabaseLike,
  userId: string,
  quoteId: string,
  type: ReservationType,
): Promise<ReservationRow> {
  const existing = await findReservationByQuote(supabase, userId, quoteId, type);
  if (existing) return existing;
  const { data, error } = await supabase
    .from('reservation')
    .insert({
      re_user_id: userId,
      re_quote_id: quoteId,
      re_type: type,
      re_status: 'pending',
    })
    .select()
    .single();
  if (error) throw error;
  return data as ReservationRow;
}
