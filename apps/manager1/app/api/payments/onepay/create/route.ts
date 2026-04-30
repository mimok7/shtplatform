import { NextRequest, NextResponse } from 'next/server';
import serviceSupabase from '../../../../../lib/serviceSupabase';
import { buildOnepayUrl, getOnepayConfigFromEnv, getBaseSiteUrl } from '../../../../../lib/onepay';

async function requireManagerOrAdmin(req: NextRequest): Promise<NextResponse | null> {
    if (!serviceSupabase) {
        return NextResponse.json(
            { error: 'Service client unavailable', code: 'SUPABASE_SERVICE_ROLE_MISSING', required: ['SUPABASE_SERVICE_ROLE_KEY'] },
            { status: 500 }
        );
    }

    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token) return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });

    const { data: authData, error: authError } = await serviceSupabase.auth.getUser(token);
    if (authError || !authData?.user) {
        return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    }

    const { data: profile, error: profileError } = await serviceSupabase
        .from('users')
        .select('role')
        .eq('id', authData.user.id)
        .maybeSingle();

    if (profileError || !profile?.role || !['manager', 'admin'].includes(profile.role)) {
        return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    return null;
}

export async function POST(req: NextRequest) {
    try {
        const cfg = getOnepayConfigFromEnv();
        if (!cfg) {
            return NextResponse.json(
                {
                    error: 'OnePay env not configured or contains placeholder values',
                    code: 'ONEPAY_ENV_INVALID',
                    required: [
                        'ONEPAY_VPC_PAYMENT_URL',
                        'ONEPAY_VPC_MERCHANT',
                        'ONEPAY_VPC_ACCESS_CODE',
                        'ONEPAY_VPC_SECURE_SECRET'
                    ]
                },
                { status: 500 }
            );
        }
        if (!serviceSupabase) {
            return NextResponse.json(
                { error: 'Service client unavailable', code: 'SUPABASE_SERVICE_ROLE_MISSING', required: ['SUPABASE_SERVICE_ROLE_KEY'] },
                { status: 500 }
            );
        }

        const authError = await requireManagerOrAdmin(req);
        if (authError) return authError;

        const body = await req.json();
        const paymentId: string = body?.paymentId;
        const paymentIds: string[] = body?.paymentIds;
        const overrideAmount: number = body?.amount;

        let finalPaymentId: string;
        let finalAmount: number;

        if (paymentIds && paymentIds.length > 0) {
            // 통합 결제: 여러 결제 ID + 합산 금액
            finalAmount = Number(overrideAmount || 0);
            if (finalAmount <= 0) {
                return NextResponse.json({ error: 'amount required for combined payment', code: 'AMOUNT_REQUIRED' }, { status: 400 });
            }
            finalPaymentId = paymentIds[0];
        } else if (paymentId) {
            // 단일 결제
            const { data: payment, error } = await serviceSupabase
                .from('reservation_payment')
                .select('id, amount, reservation_id, user_id')
                .eq('id', paymentId)
                .maybeSingle();
            if (error || !payment) {
                return NextResponse.json({ error: 'Payment not found', code: 'PAYMENT_NOT_FOUND' }, { status: 404 });
            }
            finalPaymentId = payment.id;
            finalAmount = Number(payment.amount || 0);
        } else {
            return NextResponse.json({ error: 'paymentId or paymentIds required' }, { status: 400 });
        }

        // Create redirect URL
        const requestOrigin = req.nextUrl?.origin;
        const base = getBaseSiteUrl(requestOrigin);
        const returnURL = `${base}/api/payments/onepay/return`;
        const ipnURL = `${base}/api/payments/onepay/notify`;

        const orderInfo = `SHT Payment ${finalPaymentId}`;
        const url = buildOnepayUrl(cfg, {
            amount: finalAmount,
            merchTxnRef: finalPaymentId,
            orderInfo,
            returnURL,
            ipnURL,
            currency: 'VND',
            locale: 'vn',
        });

        return NextResponse.json({ url });
    } catch (e: any) {
        console.error('OnePay create error', e);
        return NextResponse.json({ error: 'internal', code: 'ONEPAY_CREATE_INTERNAL' }, { status: 500 });
    }
}
