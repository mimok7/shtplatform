import { NextRequest, NextResponse } from 'next/server';
import serviceSupabase from '../../../../lib/serviceSupabase';

// -------------------------------------------------------------------
// cruise_document 자동 삭제 Cron API
// Vercel Cron: 매일 새벽 4시 KST (UTC 19:00) 호출
// 조건: checkout_date + 3일이 지난 문서를 삭제
// -------------------------------------------------------------------

async function runCleanup() {
    if (!serviceSupabase) {
        return NextResponse.json(
            { error: 'Service role client unavailable' },
            { status: 500 }
        );
    }

    const nowUtc = new Date();
    const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
    const kstNow = new Date(nowUtc.getTime() + KST_OFFSET_MS);
    const todayKst = kstNow.toISOString().slice(0, 10);

    // checkout_date + 3일 = 삭제 기준일
    const cutoffDate = new Date(kstNow);
    cutoffDate.setDate(cutoffDate.getDate() - 3);
    const cutoffStr = cutoffDate.toISOString().slice(0, 10);

    console.log(`[cleanup-documents] 실행: ${nowUtc.toISOString()} / 삭제 기준 checkout_date <= ${cutoffStr}`);

    const summary = { found: 0, deleted: 0, error: '' };

    try {
        // 1) checkout_date가 설정되어 있고, 3일 경과한 문서 조회
        const { data: expiredDocs, error: selectErr } = await serviceSupabase
            .from('cruise_document')
            .select('id, document_type, checkout_date')
            .not('checkout_date', 'is', null)
            .lte('checkout_date', cutoffStr);

        if (selectErr) {
            summary.error = selectErr.message;
            console.error('[cleanup-documents] 조회 오류:', selectErr);
            return NextResponse.json({ summary }, { status: 500 });
        }

        summary.found = expiredDocs?.length || 0;

        if (expiredDocs && expiredDocs.length > 0) {
            const ids = expiredDocs.map(d => d.id);

            const { error: deleteErr } = await serviceSupabase
                .from('cruise_document')
                .delete()
                .in('id', ids);

            if (deleteErr) {
                summary.error = deleteErr.message;
                console.error('[cleanup-documents] 삭제 오류:', deleteErr);
            } else {
                summary.deleted = ids.length;
                console.log(`[cleanup-documents] ${ids.length}건 삭제 완료`);
            }
        }

        // 2) 여권 사진: checkout_date가 없지만 사용자의 모든 크루즈가 완료된 경우
        // → 최근 크루즈 체크인일 + 5일 경과한 여권 사진도 삭제
        const { data: passportDocs } = await serviceSupabase
            .from('cruise_document')
            .select('id, user_id')
            .eq('document_type', 'passport')
            .is('checkout_date', null);

        if (passportDocs && passportDocs.length > 0) {
            const userIds = Array.from(new Set(passportDocs.map(d => d.user_id)));

            // 각 사용자의 가장 최근 크루즈 체크인 확인
            for (const userId of userIds) {
                const { data: userRes } = await serviceSupabase
                    .from('reservation')
                    .select('re_id')
                    .eq('re_user_id', userId)
                    .in('re_type', ['cruise', 'package']);

                if (!userRes || userRes.length === 0) continue;

                const reIds = userRes.map(r => r.re_id);
                const { data: cruiseRows } = await serviceSupabase
                    .from('reservation_cruise')
                    .select('checkin')
                    .in('reservation_id', reIds)
                    .order('checkin', { ascending: false })
                    .limit(1);

                if (cruiseRows && cruiseRows.length > 0 && cruiseRows[0].checkin) {
                    const lastCheckin = cruiseRows[0].checkin;
                    // checkin + 5일 (체크아웃 + 3일 여유)
                    const expiry = new Date(lastCheckin);
                    expiry.setDate(expiry.getDate() + 5);
                    const expiryStr = expiry.toISOString().slice(0, 10);

                    if (expiryStr <= todayKst) {
                        const passportIds = passportDocs.filter(d => d.user_id === userId).map(d => d.id);
                        const { error: delErr } = await serviceSupabase
                            .from('cruise_document')
                            .delete()
                            .in('id', passportIds);

                        if (!delErr) {
                            summary.deleted += passportIds.length;
                            console.log(`[cleanup-documents] 여권 ${passportIds.length}건 삭제 (user: ${userId})`);
                        }
                    }
                }
            }
        }

    } catch (e: any) {
        summary.error = e?.message || 'Unknown error';
        console.error('[cleanup-documents] 예외:', e);
    }

    return NextResponse.json({ summary, timestamp: nowUtc.toISOString() });
}

export async function GET(request: NextRequest) {
    // Vercel Cron 인증 확인
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return runCleanup();
}
