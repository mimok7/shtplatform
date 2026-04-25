import { NextRequest, NextResponse } from 'next/server';
import supabase from '@/lib/supabase';
import serviceSupabase from '../../../lib/serviceSupabase';

// 네이버 환율 API에서 실시간 환율 가져오기
async function fetchNaverExchangeRate(): Promise<number | null> {
    try {
        const response = await fetch('https://api.naver.com/finance/exchange?query=USD_KRW', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        if (!response.ok) {
            console.error('네이버 API 호출 실패:', response.status);
            return null;
        }

        const html = await response.text();

        // VND 환율 추출 (실제로는 HTML 파싱이 필요하지만, 여기서는 임시 값 사용)
        // 실제 구현에서는 cheerio 등의 라이브러리로 HTML을 파싱해야 함
        return 23.85; // 임시 값

    } catch (error) {
        console.error('네이버 환율 조회 실패:', error);
        return null;
    }
}

// GET: 환율 조회
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const currency = searchParams.get('currency') || 'VND';
        const forceRefresh = searchParams.get('force') === 'true';

        // 데이터베이스에서 환율 조회
        const { data: exchangeRateData, error } = await supabase
            .from('exchange_rates')
            .select('*')
            .eq('currency_code', currency)
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116은 데이터가 없을 때의 에러
            console.error('데이터베이스 조회 실패:', error);
            return NextResponse.json({ success: false, error: 'Database error' }, { status: 500 });
        }

        let rateData = exchangeRateData;

        // 데이터가 없거나 강제 새로고침인 경우 네이버에서 조회
        if (!exchangeRateData || forceRefresh) {
            const naverRate = await fetchNaverExchangeRate();

            if (naverRate) {
                // 데이터베이스에 저장 또는 업데이트
                const upsertData = {
                    currency_code: currency,
                    rate_to_krw: 1 / naverRate, // KRW/VND를 VND/KRW로 변환해서 저장
                    source: 'naver',
                    last_updated: new Date().toISOString()
                };

                const { data: upsertedData, error: upsertError } = await supabase
                    .from('exchange_rates')
                    .upsert(upsertData, { onConflict: 'currency_code' })
                    .select()
                    .single();

                if (upsertError) {
                    console.error('데이터베이스 저장 실패:', upsertError);
                } else {
                    rateData = upsertedData;
                }
            }
        }

        if (!rateData) {
            return NextResponse.json({
                success: false,
                error: 'Exchange rate not found'
            }, { status: 404 });
        }

        return NextResponse.json({
            success: true,
            data: {
                currency_code: rateData.currency_code,
                // raw_rate_to_krw: 실제 DB에 저장된 컬럼 값 (테이블의 rate_to_krw)
                raw_rate_to_krw: rateData.rate_to_krw,
                // rate_to_krw: API가 클라이언트에 반환하는 값 (DB값을 그대로 반환)
                rate_to_krw: rateData.rate_to_krw,
                last_updated: rateData.last_updated,
                source: rateData.source
            }
        });

    } catch (error) {
        console.error('환율 조회 API 오류:', error);
        return NextResponse.json({
            success: false,
            error: 'Internal server error'
        }, { status: 500 });
    }
}

// POST: 환율 수동 업데이트
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        console.debug('[exchange-rate POST] body:', body);
        const { currency_code, rate_to_krw } = body;

        if (!currency_code || (rate_to_krw === undefined || rate_to_krw === null)) {
            return NextResponse.json({
                success: false,
                error: 'currency_code and rate_to_krw are required'
            }, { status: 400 });
        }

        const parsedRate = Number(rate_to_krw);
        if (!isFinite(parsedRate)) {
            console.error('[exchange-rate POST] invalid rate_to_krw:', rate_to_krw);
            return NextResponse.json({ success: false, error: 'rate_to_krw must be a finite number' }, { status: 400 });
        }

        // 데이터베이스에 저장 (클라이언트는 KRW/VND 값을 보냄)
        // Use server-side service key client for writes to bypass RLS safely on the backend.
        const dbClient = serviceSupabase || supabase;
        const { data, error } = await dbClient
            .from('exchange_rates')
            .upsert({
                currency_code,
                rate_to_krw: parsedRate,
                source: 'manual',
                last_updated: new Date().toISOString()
            }, { onConflict: 'currency_code' })
            .select()
            .single();

        if (error) {
            console.error('[exchange-rate POST] supabase upsert error:', error);
            // Return the error message during local development to aid debugging
            return NextResponse.json({
                success: false,
                error: error.message || 'Failed to save exchange rate',
                details: error
            }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            data: {
                currency_code: data.currency_code,
                rate_to_krw: data.rate_to_krw, // 저장된 값 그대로 반환 (이미 KRW/VND)
                last_updated: data.last_updated,
                source: data.source
            }
        });

    } catch (error) {
        console.error('환율 업데이트 API 오류:', error);
        return NextResponse.json({
            success: false,
            error: 'Internal server error'
        }, { status: 500 });
    }
}
