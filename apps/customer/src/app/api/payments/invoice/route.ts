// 고객 본인의 OnePay Invoice 결제 정보만 안전하게 제공하는 API
import { NextRequest, NextResponse } from 'next/server';
import serviceSupabase from '@/lib/serviceSupabase';

function getBearerToken(req: NextRequest): string {
  const authorization = req.headers.get('authorization') || '';
  return authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
}

function getSafeOnepayUrl(rawResponse: unknown): string | null {
  if (!rawResponse || typeof rawResponse !== 'object' || Array.isArray(rawResponse)) return null;

  const candidate = (rawResponse as Record<string, unknown>).invoice_payment_url;
  if (typeof candidate !== 'string') return null;

  try {
    const url = new URL(candidate.trim());
    const isOnepayHost = url.hostname === 'onepay.vn' || url.hostname.endsWith('.onepay.vn');
    return url.protocol === 'https:' && isOnepayHost ? url.toString() : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  if (!serviceSupabase) {
    return NextResponse.json({ error: '결제 정보를 불러올 수 없습니다.' }, { status: 500 });
  }

  const token = getBearerToken(req);
  if (!token) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const { data: authData, error: authError } = await serviceSupabase.auth.getUser(token);
  const userId = authData?.user?.id;
  if (authError || !userId) {
    return NextResponse.json({ error: '로그인 정보를 확인할 수 없습니다.' }, { status: 401 });
  }

  const { data: reservations, error: reservationError } = await serviceSupabase
    .from('reservation')
    .select('re_id,re_quote_id,re_type,reservation_date')
    .eq('re_user_id', userId);

  if (reservationError) {
    console.error('고객 결제용 예약 조회 실패', reservationError);
    return NextResponse.json({ error: '결제 정보를 불러오지 못했습니다.' }, { status: 500 });
  }

  const reservationRows = reservations || [];
  if (reservationRows.length === 0) {
    return NextResponse.json({ payments: [] });
  }

  const reservationById = new Map(reservationRows.map((reservation: any) => [reservation.re_id, reservation]));
  const reservationIds = [...reservationById.keys()].filter(Boolean);

  const { data: payments, error: paymentError } = await serviceSupabase
    .from('reservation_payment')
    .select('id,reservation_id,quote_id,amount,payment_status,payment_method,gateway,raw_response,created_at,updated_at')
    .in('reservation_id', reservationIds)
    .in('payment_status', ['pending', 'processing'])
    .gt('amount', 0)
    .order('created_at', { ascending: false });

  if (paymentError) {
    console.error('고객 결제 정보 조회 실패', paymentError);
    return NextResponse.json({ error: '결제 정보를 불러오지 못했습니다.' }, { status: 500 });
  }

  const safePayments = (payments || []).map((payment: any) => {
    const reservation: any = reservationById.get(payment.reservation_id);
    return {
      id: payment.id,
      reservationId: payment.reservation_id,
      quoteId: payment.quote_id || reservation?.re_quote_id || null,
      amount: Number(payment.amount) || 0,
      status: payment.payment_status,
      method: payment.payment_method || null,
      serviceType: reservation?.re_type || null,
      reservationDate: reservation?.reservation_date || null,
      paymentUrl: getSafeOnepayUrl(payment.raw_response),
      updatedAt: payment.updated_at || payment.created_at || null,
    };
  });

  return NextResponse.json(
    { payments: safePayments },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
