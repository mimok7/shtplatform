// OnePay 결제 완료 후 서명을 확인하고 고객 결제 화면으로 돌려보내는 API
import { NextRequest, NextResponse } from 'next/server';
import { getOnepayConfigFromEnv, verifyOnepayHash } from '@/lib/onepay';
import { applyOnepayPaymentResult } from '@/lib/onepayPaymentResult';

export async function GET(req: NextRequest) {
  const config = getOnepayConfigFromEnv();
  const paymentsUrl = new URL('/mypage/payments', req.url);
  if (!config) {
    paymentsUrl.searchParams.set('payment', 'unavailable');
    return NextResponse.redirect(paymentsUrl);
  }

  const params = req.nextUrl.searchParams;
  if (!verifyOnepayHash(params, config.secureSecret)) {
    paymentsUrl.searchParams.set('payment', 'invalid');
    return NextResponse.redirect(paymentsUrl);
  }

  const attemptRef = params.get('vpc_MerchTxnRef') || params.get('vpc_MerchantTxnRef') || '';
  const responseCode = params.get('vpc_TxnResponseCode') || '';
  const transactionId = params.get('vpc_TransactionNo') || undefined;
  const response: Record<string, string> = {};
  params.forEach((value, key) => {
    response[key] = value;
  });

  const success = responseCode === '0';
  const stored = await applyOnepayPaymentResult({ attemptRef, success, transactionId, response });
  paymentsUrl.searchParams.set('payment', stored && success ? 'success' : success ? 'error' : 'cancelled');
  return NextResponse.redirect(paymentsUrl);
}
