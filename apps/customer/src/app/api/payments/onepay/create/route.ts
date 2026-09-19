// 로그인 고객의 등록된 결제 요청으로 OnePay 결제 URL을 생성하는 API
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import serviceSupabase from '@/lib/serviceSupabase';
import { buildOnepayUrl, getOnepayConfigFromEnv } from '@/lib/onepay';

function getPaymentRequest(rawResponse: unknown) {
  if (!rawResponse || typeof rawResponse !== 'object' || Array.isArray(rawResponse)) return null;
  const request = (rawResponse as Record<string, unknown>).onepay_payment_request;
  return request && typeof request === 'object' && !Array.isArray(request)
    ? request as Record<string, unknown>
    : null;
}

export async function POST(req: NextRequest) {
  if (!serviceSupabase) {
    return NextResponse.json({ error: '결제를 시작할 수 없습니다.' }, { status: 500 });
  }

  const authorization = req.headers.get('authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  const { data: authData, error: authError } = token
    ? await serviceSupabase.auth.getUser(token)
    : { data: { user: null }, error: null };
  const userId = authData?.user?.id;
  if (authError || !userId) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const body = await req.json().catch(() => null) as { paymentRequestId?: string } | null;
  const paymentRequestId = String(body?.paymentRequestId || '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(paymentRequestId)) {
    return NextResponse.json({ error: '결제 요청을 확인할 수 없습니다.' }, { status: 400 });
  }

  const config = getOnepayConfigFromEnv();
  if (!config) {
    return NextResponse.json({ error: 'OnePay 온라인 결제가 아직 준비되지 않았습니다.' }, { status: 503 });
  }

  const { data: reservations, error: reservationError } = await serviceSupabase
    .from('reservation')
    .select('re_id')
    .eq('re_user_id', userId);
  if (reservationError) {
    console.error('OnePay 고객 예약 확인 실패', reservationError);
    return NextResponse.json({ error: '결제 정보를 확인하지 못했습니다.' }, { status: 500 });
  }

  const reservationIds = (reservations || []).map((reservation: any) => reservation.re_id);
  if (reservationIds.length === 0) {
    return NextResponse.json({ error: '결제 요청을 찾을 수 없습니다.' }, { status: 404 });
  }

  const { data: paymentRows, error: paymentError } = await serviceSupabase
    .from('reservation_payment')
    .select('id,reservation_id,amount,payment_status,raw_response')
    .in('reservation_id', reservationIds)
    .in('payment_status', ['pending', 'processing'])
    .gt('amount', 0);
  if (paymentError) {
    console.error('OnePay 고객 결제 요청 확인 실패', paymentError);
    return NextResponse.json({ error: '결제 정보를 확인하지 못했습니다.' }, { status: 500 });
  }

  const payments = (paymentRows || []).filter((payment: any) => (
    getPaymentRequest(payment.raw_response)?.id === paymentRequestId
  ));
  if (payments.length === 0) {
    return NextResponse.json({ error: '결제 요청을 찾을 수 없습니다.' }, { status: 404 });
  }

  const amount = payments.reduce((total: number, payment: any) => total + Number(payment.amount || 0), 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: '결제 금액을 확인할 수 없습니다.' }, { status: 400 });
  }

  const { data: profile } = await serviceSupabase
    .from('users')
    .select('name,email,phone_number')
    .eq('id', userId)
    .maybeSingle();
  const requestInfo = getPaymentRequest(payments[0].raw_response);
  const startedAt = new Date().toISOString();
  const previousStartedAt = typeof payments[0].raw_response?.onepay_started_at === 'string'
    ? new Date(payments[0].raw_response.onepay_started_at).getTime()
    : 0;
  const previousAttemptRef = typeof payments[0].raw_response?.onepay_attempt_ref === 'string'
    ? payments[0].raw_response.onepay_attempt_ref
    : '';
  const canReuseAttempt = previousAttemptRef
    && Number.isFinite(previousStartedAt)
    && Date.now() - previousStartedAt < 30 * 60 * 1000;
  const attemptRef = canReuseAttempt ? previousAttemptRef : crypto.randomUUID();

  const updateResults = await Promise.all(payments.map((payment: any) => {
    const rawResponse = payment.raw_response && typeof payment.raw_response === 'object'
      ? payment.raw_response
      : {};
    return serviceSupabase
      .from('reservation_payment')
      .update({
        payment_status: 'processing',
        gateway: 'onepay',
        raw_response: {
          ...rawResponse,
          onepay_attempt_ref: attemptRef,
          onepay_started_at: canReuseAttempt ? rawResponse.onepay_started_at : startedAt,
        },
        updated_at: startedAt,
      })
      .eq('id', payment.id)
      .select('id')
      .maybeSingle();
  }));
  if (updateResults.some((result) => result.error || !result.data)) {
    console.error('OnePay 결제 시작 상태 저장 실패', updateResults.find((result) => result.error)?.error);
    return NextResponse.json({ error: '결제를 시작하지 못했습니다.' }, { status: 500 });
  }

  const origin = req.nextUrl.origin.replace(/\/$/, '');
  const url = buildOnepayUrl(config, {
    amount,
    merchTxnRef: attemptRef,
    orderInfo: `Stay Halong ${paymentRequestId}`,
    returnURL: `${origin}/api/payments/onepay/return`,
    ipnURL: `${origin}/api/payments/onepay/notify`,
    customerName: String(requestInfo?.customer_name || profile?.name || ''),
    customerEmail: String(requestInfo?.customer_email || profile?.email || ''),
    customerPhone: String(profile?.phone_number || ''),
    clientIp: (req.headers.get('x-forwarded-for') || '').split(',')[0]?.trim() || '',
  });

  return NextResponse.json({ url });
}
