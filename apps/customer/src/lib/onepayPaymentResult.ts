// OnePay 결제 결과를 같은 고객 결제 요청에 포함된 모든 항목에 반영하는 서버 유틸리티
import serviceSupabase from '@/lib/serviceSupabase';

interface ApplyResultInput {
  attemptRef: string;
  success: boolean;
  transactionId?: string;
  response: Record<string, string>;
}

function mergeResult(rawResponse: unknown, response: Record<string, string>) {
  const current = rawResponse && typeof rawResponse === 'object' && !Array.isArray(rawResponse)
    ? rawResponse as Record<string, unknown>
    : {};
  return {
    ...current,
    onepay_result: response,
    onepay_result_received_at: new Date().toISOString(),
  };
}

export async function applyOnepayPaymentResult(input: ApplyResultInput): Promise<boolean> {
  if (!serviceSupabase) return false;

  const { data: payments, error } = await serviceSupabase
    .from('reservation_payment')
    .select('id,reservation_id,payment_status,raw_response')
    .contains('raw_response', { onepay_attempt_ref: input.attemptRef });

  if (error || !payments?.length) {
    console.error('OnePay 결제 요청 조회 실패', error || input.attemptRef);
    return false;
  }

  const updatedAt = new Date().toISOString();
  const updateResults = await Promise.all(payments.map((payment: any) => {
    let updateQuery = serviceSupabase
      .from('reservation_payment')
      .update({
        payment_status: input.success ? 'completed' : 'pending',
        updated_at: updatedAt,
        transaction_id: input.transactionId || null,
        gateway: 'onepay',
        raw_response: mergeResult(payment.raw_response, input.response),
      })
      .eq('id', payment.id);
    if (!input.success) updateQuery = updateQuery.neq('payment_status', 'completed');
    return updateQuery;
  }));

  if (updateResults.some((result) => result.error)) {
    console.error('OnePay 결제 결과 저장 실패', updateResults.find((result) => result.error)?.error);
    return false;
  }

  if (!input.success) return true;

  const reservationIds = [...new Set(payments.map((payment: any) => payment.reservation_id).filter(Boolean))];
  const { data: reservations } = await serviceSupabase
    .from('reservation')
    .select('re_id,re_quote_id')
    .in('re_id', reservationIds);
  const quoteIds = [...new Set((reservations || []).map((reservation: any) => reservation.re_quote_id).filter(Boolean))];

  for (const quoteId of quoteIds) {
    const { data: quoteReservations } = await serviceSupabase
      .from('reservation')
      .select('re_id')
      .eq('re_quote_id', quoteId);
    const quoteReservationIds = (quoteReservations || []).map((reservation: any) => reservation.re_id);
    if (quoteReservationIds.length === 0) continue;

    const { count: unpaidCount } = await serviceSupabase
      .from('reservation_payment')
      .select('id', { count: 'exact', head: true })
      .in('reservation_id', quoteReservationIds)
      .gt('amount', 0)
      .neq('payment_status', 'completed');

    if ((unpaidCount || 0) === 0) {
      await serviceSupabase
        .from('quote')
        .update({ payment_status: 'paid', updated_at: updatedAt })
        .eq('quote_id', quoteId);
    }
  }

  return true;
}
