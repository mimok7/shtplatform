import { NextRequest, NextResponse } from 'next/server';
import serviceSupabase from '../../../../../lib/serviceSupabase';
import { getOnepayConfigFromEnv, verifyOnepayHash } from '../../../../../lib/onepay';

async function markPaidAndSyncQuote(paymentId: string, extra: { transaction_id?: string; raw?: any; gateway?: string }) {
    if (!serviceSupabase) return;
    const { data: pay } = await serviceSupabase
        .from('reservation_payment')
        .select('id, reservation_id')
        .eq('id', paymentId)
        .maybeSingle();
    if (!pay) return;
    await serviceSupabase
        .from('reservation_payment')
        .update({ payment_status: 'completed', updated_at: new Date().toISOString(), transaction_id: extra.transaction_id || null, gateway: extra.gateway || 'onepay', raw_response: extra.raw || null })
        .eq('id', paymentId);

    const { data: reservation } = await serviceSupabase
        .from('reservation')
        .select('re_quote_id')
        .eq('re_id', pay.reservation_id)
        .maybeSingle();
    const quoteId = reservation?.re_quote_id;
    if (quoteId) {
        await serviceSupabase
            .from('quote')
            .update({ payment_status: 'paid', updated_at: new Date().toISOString() })
            .eq('quote_id', quoteId);
    }
}

export async function GET(req: NextRequest) {
    try {
        const cfg = getOnepayConfigFromEnv();
        if (!cfg) return NextResponse.json({ error: 'OnePay env not configured' }, { status: 500 });
        const url = new URL(req.url);
        const params = url.searchParams;

        const valid = verifyOnepayHash(params, cfg.secureSecret);
        const vpc_TxnResponseCode = params.get('vpc_TxnResponseCode');
        const vpc_TransactionNo = params.get('vpc_TransactionNo') || undefined;
        const merchTxnRef = params.get('vpc_MerchTxnRef') || params.get('vpc_MerchantTxnRef') || '';

        if (!valid) {
            console.warn('OnePay return: invalid hash for', merchTxnRef);
            return NextResponse.redirect(new URL(`/mypage/payments/individual/${merchTxnRef}/receipt?error=hash`, url.origin));
        }

        if (vpc_TxnResponseCode === '0') {
            const raw: Record<string, string> = {};
            params.forEach((v, k) => (raw[k] = v));
            await markPaidAndSyncQuote(merchTxnRef, { transaction_id: vpc_TransactionNo, gateway: 'onepay', raw });
            return NextResponse.redirect(new URL(`/mypage/payments/individual/${merchTxnRef}/receipt?status=success`, url.origin));
        }

        // Non-success (fail/cancel/other)
        if (serviceSupabase && merchTxnRef) {
            const raw: Record<string, string> = {};
            params.forEach((v, k) => (raw[k] = v));
            await serviceSupabase
                .from('reservation_payment')
                .update({ payment_status: 'failed', updated_at: new Date().toISOString(), transaction_id: vpc_TransactionNo || null, gateway: 'onepay', raw_response: raw })
                .eq('id', merchTxnRef);
        }
        return NextResponse.redirect(new URL(`/mypage/payments/individual/${merchTxnRef}/receipt?status=failed&code=${vpc_TxnResponseCode}`, url.origin));
    } catch (e) {
        console.error('OnePay return error', e);
        return NextResponse.json({ error: 'internal' }, { status: 500 });
    }
}
