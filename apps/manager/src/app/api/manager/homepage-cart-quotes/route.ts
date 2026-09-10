// 홈페이지 장바구니에서 발행된 견적서를 관리자에게 안전하게 제공한다.
import { NextRequest, NextResponse } from 'next/server';
import serviceSupabase from '@/lib/serviceSupabase';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validId(value: unknown): value is string {
    return typeof value === 'string' && UUID_PATTERN.test(value);
}

async function requireManagerOrAdmin(request: NextRequest): Promise<NextResponse | null> {
    if (!serviceSupabase) {
        return NextResponse.json({ error: '견적서 조회 설정을 확인하지 못했습니다.' }, { status: 500 });
    }

    const authorization = request.headers.get('authorization') || '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    if (!token) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

    const { data: authData, error: authError } = await serviceSupabase.auth.getUser(token);
    if (authError || !authData.user) return NextResponse.json({ error: '로그인 정보를 확인하지 못했습니다.' }, { status: 401 });

    const { data: profile, error: profileError } = await serviceSupabase
        .from('users')
        .select('role')
        .eq('id', authData.user.id)
        .maybeSingle();
    if (profileError || !['manager', 'admin'].includes(profile?.role || '')) {
        return NextResponse.json({ error: '견적서를 조회할 권한이 없습니다.' }, { status: 403 });
    }

    return null;
}

export async function POST(request: NextRequest) {
    if (!serviceSupabase) {
        return NextResponse.json({ error: '견적서 조회 설정을 확인하지 못했습니다.' }, { status: 500 });
    }

    const accessError = await requireManagerOrAdmin(request);
    if (accessError) return accessError;

    let body: any;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: '요청 정보가 올바르지 않습니다.' }, { status: 400 });
    }

    if (body?.action === 'summaries') {
        const userIds = Array.from(new Set(Array.isArray(body.userIds) ? body.userIds.filter(validId) : [])).slice(0, 100);
        if (!userIds.length) return NextResponse.json({ summaries: [] });

        const { data, error } = await serviceSupabase
            .from('homepage_cart_quotes')
            .select('id,quote_number,platform_user_id,recipient_name,item_count,issued_at')
            .in('platform_user_id', userIds)
            .order('issued_at', { ascending: false });
        if (error) {
            console.error('[manager-cart-quotes] summary read failed', error.message);
            return NextResponse.json({ error: '발행 견적서를 불러오지 못했습니다.' }, { status: 500 });
        }

        const latestByUser = new Map<string, any>();
        (data || []).forEach((quote: any) => {
            if (quote.platform_user_id && !latestByUser.has(quote.platform_user_id)) latestByUser.set(quote.platform_user_id, quote);
        });
        return NextResponse.json({ summaries: Array.from(latestByUser.values()) });
    }

    if (body?.action === 'detail' && validId(body.quoteId)) {
        const { data, error } = await serviceSupabase
            .from('homepage_cart_quotes')
            .select('id,quote_number,platform_user_id,recipient_name,memo,items,totals,item_count,issued_at')
            .eq('id', body.quoteId)
            .maybeSingle();
        if (error) {
            console.error('[manager-cart-quotes] detail read failed', error.message);
            return NextResponse.json({ error: '발행 견적서를 불러오지 못했습니다.' }, { status: 500 });
        }
        if (!data) return NextResponse.json({ error: '발행 견적서를 찾을 수 없습니다.' }, { status: 404 });
        return NextResponse.json({ quote: data });
    }

    return NextResponse.json({ error: '요청 유형이 올바르지 않습니다.' }, { status: 400 });
}
