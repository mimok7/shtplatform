import { NextRequest, NextResponse } from 'next/server';
import serviceSupabase from '../../../../../lib/serviceSupabase';
import { getOnepayConfigFromEnv, verifyOnepayHash } from '../../../../../lib/onepay';

async function markPaid(paymentId: string, extra: { transaction_id?: string; raw?: any; gateway?: string }) {
    if (!serviceSupabase) return;
    await serviceSupabase
        .from('reservation_payment')
        .update({ payment_status: 'completed', updated_at: new Date().toISOString(), transaction_id: extra.transaction_id || null, gateway: extra.gateway || 'onepay', raw_response: extra.raw || null })
        .eq('id', paymentId);
}

export async function GET(req: NextRequest) {
    try {
        const cfg = getOnepayConfigFromEnv();
        if (!cfg) return NextResponse.json({ success: false, message: 'config' }, { status: 500 });
        const url = new URL(req.url);
        const params = url.searchParams;
        const merchTxnRef = params.get('vpc_MerchTxnRef') || params.get('vpc_MerchantTxnRef') || '';
        const vpc_TxnResponseCode = params.get('vpc_TxnResponseCode');
        const vpc_TransactionNo = params.get('vpc_TransactionNo') || undefined;

        const valid = verifyOnepayHash(params, cfg.secureSecret);
        if (!valid) return NextResponse.json({ success: false, message: 'invalid hash' }, { status: 400 });

        const raw: Record<string, string> = {};
        params.forEach((v, k) => (raw[k] = v));

        if (vpc_TxnResponseCode === '0' && merchTxnRef) {
            await markPaid(merchTxnRef, { transaction_id: vpc_TransactionNo, gateway: 'onepay', raw });
            return NextResponse.json({ success: true });
        }

        if (serviceSupabase && merchTxnRef) {
            await serviceSupabase
                .from('reservation_payment')
                .update({ payment_status: 'failed', updated_at: new Date().toISOString(), transaction_id: vpc_TransactionNo || null, gateway: 'onepay', raw_response: raw })
                .eq('id', merchTxnRef);
        }
        return NextResponse.json({ success: false, code: vpc_TxnResponseCode });
    } catch (e) {
        console.error('OnePay notify error', e);
        return NextResponse.json({ success: false, message: 'internal' }, { status: 500 });
    }
}
