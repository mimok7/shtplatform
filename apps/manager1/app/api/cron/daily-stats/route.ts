import { NextRequest, NextResponse } from 'next/server';
import serviceSupabase from '../../../../lib/serviceSupabase';

// -------------------------------------------------------------------
// 일별 예약 통계 스냅샷 Cron API
// Vercel Cron: 매일 자정 KST (UTC 15:00) 호출
// reservation 테이블의 현재 상태를 서비스별/상태별로 카운트하여 저장
// -------------------------------------------------------------------

async function runDailyStats() {
    if (!serviceSupabase) {
        return NextResponse.json(
            { error: 'Service role client unavailable' },
            { status: 500 }
        );
    }

    const nowUtc = new Date();
    const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
    const kstNow = new Date(nowUtc.getTime() + KST_OFFSET_MS);
    const statDate = kstNow.toISOString().slice(0, 10);

    console.log(`[daily-stats] 실행 시각: ${nowUtc.toISOString()} / 통계 날짜(KST): ${statDate}`);

    try {
        const { data: reservations, error } = await serviceSupabase
            .from('reservation')
            .select('re_type, re_status');

        if (error) {
            console.error('[daily-stats] 예약 조회 실패:', error.message);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        const counts: Record<string, Record<string, number>> = {};
        for (const r of reservations || []) {
            const serviceType = r.re_type || 'unknown';
            const status = r.re_status || 'unknown';
            if (!counts[serviceType]) counts[serviceType] = {};
            counts[serviceType][status] = (counts[serviceType][status] || 0) + 1;
        }

        await serviceSupabase
            .from('reservation_daily_stats')
            .delete()
            .eq('stat_date', statDate);

        const rows: Array<{
            stat_date: string;
            service_type: string;
            status: string;
            count: number;
        }> = [];

        for (const [serviceType, statusCounts] of Object.entries(counts)) {
            for (const [status, count] of Object.entries(statusCounts)) {
                rows.push({ stat_date: statDate, service_type: serviceType, status, count });
            }
        }

        if (rows.length > 0) {
            const { error: insertError } = await serviceSupabase
                .from('reservation_daily_stats')
                .insert(rows);

            if (insertError) {
                console.error('[daily-stats] 통계 저장 실패:', insertError.message);
                return NextResponse.json({ error: insertError.message }, { status: 500 });
            }
        }

        const summary = {
            date: statDate,
            totalServices: Object.keys(counts).length,
            totalRows: rows.length,
            totalReservations: reservations?.length || 0,
        };

        console.log('[daily-stats] 완료:', JSON.stringify(summary));
        return NextResponse.json({ ok: true, summary });

    } catch (e: any) {
        console.error('[daily-stats] 오류:', e?.message);
        return NextResponse.json({ error: e?.message }, { status: 500 });
    }
}

export async function GET(req: NextRequest) {
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        if (process.env.NODE_ENV === 'production' && process.env.CRON_SECRET) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
    }
    return runDailyStats();
}
