// OnePay 서버 알림의 서명을 확인하고 결제 상태를 반영하는 API
import { NextRequest, NextResponse } from 'next/server';
import { getOnepayConfigFromEnv, verifyOnepayHash } from '@/lib/onepay';
import { applyOnepayPaymentResult } from '@/lib/onepayPaymentResult';

export async function GET(req: NextRequest) {
  const config = getOnepayConfigFromEnv();
  if (!config) return NextResponse.json({ success: false }, { status: 503 });

  const params = req.nextUrl.searchParams;
  if (!verifyOnepayHash(params, config.secureSecret)) {
    return NextResponse.json({ success: false }, { status: 400 });
  }

  const attemptRef = params.get('vpc_MerchTxnRef') || params.get('vpc_MerchantTxnRef') || '';
  const responseCode = params.get('vpc_TxnResponseCode') || '';
  const transactionId = params.get('vpc_TransactionNo') || undefined;
  const response: Record<string, string> = {};
  params.forEach((value, key) => {
    response[key] = value;
  });

  const stored = await applyOnepayPaymentResult({
    attemptRef,
    success: responseCode === '0',
    transactionId,
    response,
  });
  return NextResponse.json({ success: stored && responseCode === '0' }, { status: stored ? 200 : 500 });
}
