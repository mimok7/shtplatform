import { NextRequest, NextResponse } from 'next/server';
import serviceSupabase from '../../../../lib/serviceSupabase';

// -------------------------------------------------------------------
// 자동 완료 처리 Cron API
// Vercel Cron: 매일 새벽 3시 KST (UTC 18:00) 호출
// 조건: 서비스 기준일로부터 2일이 지난 예약을 완료 처리
// -------------------------------------------------------------------

async function runAutoComplete() {
    if (!serviceSupabase) {
        return NextResponse.json(
            { error: 'Service role client unavailable - SUPABASE_SERVICE_ROLE_KEY 환경변수를 확인하세요.' },
            { status: 500 }
        );
    }

    // 2. KST 기준 날짜 계산
    const nowUtc = new Date();
    const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
    const kstNow = new Date(nowUtc.getTime() + KST_OFFSET_MS);

    const COMPLETE_AFTER_DAYS = 2;

    // date 컬럼: 서비스일 <= 오늘(KST) - 2일
    const dateCutoffKst = new Date(kstNow);
    dateCutoffKst.setDate(dateCutoffKst.getDate() - COMPLETE_AFTER_DAYS);
    const cutoffDate = dateCutoffKst.toISOString().slice(0, 10); // "YYYY-MM-DD"

    // timestamp without time zone 컬럼: 오늘(KST) - 1일 자정 이전이면 완료
    const timestampBoundaryKst = new Date(kstNow);
    timestampBoundaryKst.setDate(timestampBoundaryKst.getDate() - (COMPLETE_AFTER_DAYS - 1));
    const timestampBoundaryDate = timestampBoundaryKst.toISOString().slice(0, 10); // "YYYY-MM-DD"

    // timestamptz 컬럼: KST 오프셋 포함 자정으로 비교
    const timestampBoundaryKstMidnight = `${timestampBoundaryDate}T00:00:00+09:00`;

    // 완료 처리 대상 상태: 취소/완료가 아닌 모든 상태 (pending, approved, confirmed)
    const ACTIVE_STATUSES = ['pending', 'approved', 'confirmed'] as const;

    console.log(`[auto-complete] 실행 시각: ${nowUtc.toISOString()} / date cutoff: ${cutoffDate} / timestamp boundary: ${timestampBoundaryDate}`);

    const summary: Record<string, { found: number; updated: number; error?: string }> = {};
    const updatedAt = nowUtc.toISOString();

    // -------------------------------------------------------------------
    // 3. 서비스별 처리
    // -------------------------------------------------------------------

    // (A) 크루즈: reservation_cruise.checkin (date)
    try {
        const { data: rows } = await serviceSupabase
            .from('reservation_cruise')
            .select('reservation_id')
            .lte('checkin', cutoffDate)
            .not('reservation_id', 'is', null);

        const ids = [...new Set((rows || []).map((r: any) => r.reservation_id).filter(Boolean))];
        summary.cruise = { found: ids.length, updated: 0 };

        if (ids.length > 0) {
            const { data: updated, error } = await serviceSupabase
                .from('reservation')
                .update({ re_status: 'completed', re_update_at: updatedAt })
                .in('re_id', ids)
                .in('re_status', ACTIVE_STATUSES)
                .eq('re_type', 'cruise')
                .select('re_id');
            summary.cruise.updated = updated?.length ?? 0;
            if (error) summary.cruise.error = error.message;
        }
    } catch (e: any) {
        summary.cruise = { found: 0, updated: 0, error: e?.message };
    }

    // (B) 공항: reservation_airport.ra_datetime (timestamp without time zone, KST로 저장)
    try {
        const { data: rows } = await serviceSupabase
            .from('reservation_airport')
            .select('reservation_id')
            .lt('ra_datetime', timestampBoundaryDate)
            .not('reservation_id', 'is', null);

        const ids = [...new Set((rows || []).map((r: any) => r.reservation_id).filter(Boolean))];
        summary.airport = { found: ids.length, updated: 0 };

        if (ids.length > 0) {
            const { data: updated, error } = await serviceSupabase
                .from('reservation')
                .update({ re_status: 'completed', re_update_at: updatedAt })
                .in('re_id', ids)
                .in('re_status', ACTIVE_STATUSES)
                .eq('re_type', 'airport')
                .select('re_id');
            summary.airport.updated = updated?.length ?? 0;
            if (error) summary.airport.error = error.message;
        }
    } catch (e: any) {
        summary.airport = { found: 0, updated: 0, error: e?.message };
    }

    // (C) 크루즈 차량: reservation_cruise_car.pickup_datetime / return_datetime (date)
    try {
        const { data: rows } = await serviceSupabase
            .from('reservation_cruise_car')
            .select('reservation_id, pickup_datetime, return_datetime')
            .not('reservation_id', 'is', null);

        const ids = [...new Set((rows || [])
            .filter((row: any) => {
                const effectiveDate = row.return_datetime || row.pickup_datetime;
                return effectiveDate && effectiveDate <= cutoffDate;
            })
            .map((row: any) => row.reservation_id)
            .filter(Boolean))];
        summary.vehicle = { found: ids.length, updated: 0 };

        if (ids.length > 0) {
            const { data: updated, error } = await serviceSupabase
                .from('reservation')
                .update({ re_status: 'completed', re_update_at: updatedAt })
                .in('re_id', ids)
                .in('re_status', ACTIVE_STATUSES)
                .eq('re_type', 'car')
                .select('re_id');
            summary.vehicle.updated = updated?.length ?? 0;
            if (error) summary.vehicle.error = error.message;
        }
    } catch (e: any) {
        summary.vehicle = { found: 0, updated: 0, error: e?.message };
    }

    // (D) 호텔: reservation_hotel.checkin_date (date)
    try {
        const { data: rows } = await serviceSupabase
            .from('reservation_hotel')
            .select('reservation_id')
            .lte('checkin_date', cutoffDate)
            .not('reservation_id', 'is', null);

        const ids = [...new Set((rows || []).map((r: any) => r.reservation_id).filter(Boolean))];
        summary.hotel = { found: ids.length, updated: 0 };

        if (ids.length > 0) {
            const { data: updated, error } = await serviceSupabase
                .from('reservation')
                .update({ re_status: 'completed', re_update_at: updatedAt })
                .in('re_id', ids)
                .in('re_status', ACTIVE_STATUSES)
                .eq('re_type', 'hotel')
                .select('re_id');
            summary.hotel.updated = updated?.length ?? 0;
            if (error) summary.hotel.error = error.message;
        }
    } catch (e: any) {
        summary.hotel = { found: 0, updated: 0, error: e?.message };
    }

    // (E) 렌터카: reservation_rentcar.pickup_datetime / return_datetime (timestamp without tz)
    try {
        const { data: rows } = await serviceSupabase
            .from('reservation_rentcar')
            .select('reservation_id, pickup_datetime, return_datetime')
            .not('reservation_id', 'is', null);

        const ids = [...new Set((rows || [])
            .filter((row: any) => {
                const effectiveDate = row.return_datetime || row.pickup_datetime;
                return effectiveDate && effectiveDate < timestampBoundaryDate;
            })
            .map((row: any) => row.reservation_id)
            .filter(Boolean))];
        summary.rentcar = { found: ids.length, updated: 0 };

        if (ids.length > 0) {
            const { data: updated, error } = await serviceSupabase
                .from('reservation')
                .update({ re_status: 'completed', re_update_at: updatedAt })
                .in('re_id', ids)
                .in('re_status', ACTIVE_STATUSES)
                .eq('re_type', 'rentcar')
                .select('re_id');
            summary.rentcar.updated = updated?.length ?? 0;
            if (error) summary.rentcar.error = error.message;
        }
    } catch (e: any) {
        summary.rentcar = { found: 0, updated: 0, error: e?.message };
    }

    // (F) 투어: reservation_tour.usage_date (date)
    try {
        const { data: rows } = await serviceSupabase
            .from('reservation_tour')
            .select('reservation_id')
            .lte('usage_date', cutoffDate)
            .not('reservation_id', 'is', null);

        const ids = [...new Set((rows || []).map((r: any) => r.reservation_id).filter(Boolean))];
        summary.tour = { found: ids.length, updated: 0 };

        if (ids.length > 0) {
            const { data: updated, error } = await serviceSupabase
                .from('reservation')
                .update({ re_status: 'completed', re_update_at: updatedAt })
                .in('re_id', ids)
                .in('re_status', ACTIVE_STATUSES)
                .eq('re_type', 'tour')
                .select('re_id');
            summary.tour.updated = updated?.length ?? 0;
            if (error) summary.tour.error = error.message;
        }
    } catch (e: any) {
        summary.tour = { found: 0, updated: 0, error: e?.message };
    }

    // (G) 스하차량(SHT): reservation_car_sht.pickup_datetime (timestamp with time zone)
    // timestamptz는 KST 오프셋 포함 자정과 비교해야 UTC 오차 없이 정확 처리
    try {
        const { data: rows } = await serviceSupabase
            .from('reservation_car_sht')
            .select('reservation_id')
            .lt('pickup_datetime', timestampBoundaryKstMidnight)
            .not('reservation_id', 'is', null);

        const ids = [...new Set((rows || []).map((r: any) => r.reservation_id).filter(Boolean))];
        summary.sht = { found: ids.length, updated: 0 };

        if (ids.length > 0) {
            // sht / car_sht / car 세 타입 모두 포함
            const { data: updated, error } = await serviceSupabase
                .from('reservation')
                .update({ re_status: 'completed', re_update_at: updatedAt })
                .in('re_id', ids)
                .in('re_status', ACTIVE_STATUSES)
                .in('re_type', ['sht', 'car_sht', 'reservation_car_sht'])
                .select('re_id');
            summary.sht.updated = updated?.length ?? 0;
            if (error) summary.sht.error = error.message;
        }
    } catch (e: any) {
        summary.sht = { found: 0, updated: 0, error: e?.message };
    }

    const totalUpdated = Object.values(summary).reduce((sum, s) => sum + s.updated, 0);
    console.log(`[auto-complete] 완료. 총 ${totalUpdated}건 완료 처리.`, summary);

    // 상태 변경 로그는 DB 트리거(trg_reservation_status_change)가 자동 기록

    return NextResponse.json({
        success: true,
        executedAt: updatedAt,
        cutoffDate,
        totalUpdated,
        summary,
    });
}

export async function GET(req: NextRequest) {
    // 1. 인증 체크 (Vercel Cron 또는 CRON_SECRET)
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return runAutoComplete();
}

export async function POST(req: NextRequest) {
    if (!serviceSupabase) {
        return NextResponse.json(
            { error: 'Service role client unavailable - SUPABASE_SERVICE_ROLE_KEY 환경변수를 확인하세요.' },
            { status: 500 }
        );
    }

    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: authData, error: authError } = await serviceSupabase.auth.getUser(token);
    if (authError || !authData?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile, error: profileError } = await serviceSupabase
        .from('users')
        .select('role')
        .eq('id', authData.user.id)
        .maybeSingle();

    if (profileError || !profile?.role || !['manager', 'admin'].includes(profile.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return runAutoComplete();
}
