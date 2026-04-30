import { NextRequest, NextResponse } from 'next/server';
import supabase from '@/lib/supabase';
import serviceSupabase from '../../../lib/serviceSupabase';

// GET: 환율 조회
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const currency = searchParams.get('currency') || 'VND';

        const { data: exchangeRateData, error } = await supabase
            .from('exchange_rates')
            .select('*')
            .eq('currency_code', currency)
            .single();

        if (error && error.code !== 'PGRST116') {
            console.error('환율 조회 실패:', error);
            return NextResponse.json({ success: false, error: 'Database error' }, { status: 500 });
        }

        if (!exchangeRateData) {
            return NextResponse.json({ success: false, error: 'Exchange rate not found' }, { status: 404 });
        }

        return NextResponse.json({
            success: true,
            data: {
                currency_code: exchangeRateData.currency_code,
                raw_rate_to_krw: exchangeRateData.rate_to_krw,
                rate_to_krw: exchangeRateData.rate_to_krw,
                last_updated: exchangeRateData.last_updated,
                source: exchangeRateData.source
            }
        });

    } catch (error) {
        console.error('환율 조회 API 오류:', error);
        return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
    }
}

// POST: 환율 수동 업데이트
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { currency_code, rate_to_krw } = body;

        if (!currency_code || rate_to_krw === undefined || rate_to_krw === null) {
            return NextResponse.json({ success: false, error: 'currency_code and rate_to_krw are required' }, { status: 400 });
        }

        const parsedRate = Number(rate_to_krw);
        if (!isFinite(parsedRate)) {
            return NextResponse.json({ success: false, error: 'rate_to_krw must be a finite number' }, { status: 400 });
        }

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
            console.error('환율 업데이트 실패:', error);
            return NextResponse.json({ success: false, error: error.message || 'Failed to save exchange rate' }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            data: {
                currency_code: data.currency_code,
                rate_to_krw: data.rate_to_krw,
                last_updated: data.last_updated,
                source: data.source
            }
        });

    } catch (error) {
        console.error('환율 업데이트 API 오류:', error);
        return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
    }
}
