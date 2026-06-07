import { NextRequest, NextResponse } from 'next/server';
import serviceSupabase from '@/lib/serviceSupabase';

const EVENT_KEY = 'customer_pre_reminder';
const NOTIFICATION_CATEGORY = 'customer_reminder';
const DEFAULT_RETENTION_DAYS = 5;

async function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get('authorization') || '';
  if (secret && header === `Bearer ${secret}`) return true;

  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) {
    return !secret;
  }

  if (!serviceSupabase) return false;

  const { data: authData, error: authError } = await serviceSupabase.auth.getUser(token);
  if (authError || !authData?.user) return false;

  const { data: me } = await serviceSupabase
    .from('users')
    .select('id, role')
    .eq('id', authData.user.id)
    .maybeSingle();

  return Boolean(me && me.role === 'admin');
}

function toIsoBeforeDays(days: number) {
  const now = new Date();
  now.setDate(now.getDate() - days);
  return now.toISOString();
}

function toYmdInKst(value: string | null | undefined): string | null {
  if (!value) return null;

  const plainYmd = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(plainYmd)) return plainYmd;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  return formatter.format(date);
}

function todayYmdInKst() {
  return toYmdInKst(new Date().toISOString()) || new Date().toISOString().slice(0, 10);
}

async function runCleanup(request: NextRequest) {
  if (!serviceSupabase) {
    return NextResponse.json({ error: 'Service role client unavailable' }, { status: 500 });
  }

  const retentionDaysRaw = Number(request.nextUrl.searchParams.get('retentionDays') || DEFAULT_RETENTION_DAYS);
  const retentionDays = Math.max(1, Math.min(90, Number.isFinite(retentionDaysRaw) ? retentionDaysRaw : DEFAULT_RETENTION_DAYS));
  const dryRun = String(request.nextUrl.searchParams.get('dryRun') || '').toLowerCase() === 'true';
  const cutoffIso = toIsoBeforeDays(retentionDays);
  const todayYmd = todayYmdInKst();

  const { data: targetNotifications, error: targetError } = await serviceSupabase
    .from('notifications')
    .select('id, created_at, metadata')
    .eq('category', NOTIFICATION_CATEGORY)
    .limit(50000);

  if (targetError) {
    return NextResponse.json({ error: `notifications target query failed: ${targetError.message}` }, { status: 500 });
  }

  const notificationTargets = (targetNotifications || []).filter((row: any) => {
    const createdAt = String(row?.created_at || '');
    const serviceDate = toYmdInKst(row?.metadata?.serviceDate || row?.metadata?.service_date);
    return createdAt < cutoffIso || Boolean(serviceDate && serviceDate < todayYmd);
  });
  const notificationIds = notificationTargets.map((row: any) => row.id).filter(Boolean);

  const { data: dispatchRows, error: dispatchTargetError } = await serviceSupabase
    .from('notification_dispatch_log')
    .select('id, created_at, payload')
    .eq('event_key', EVENT_KEY)
    .limit(50000);

  if (dispatchTargetError) {
    return NextResponse.json({ error: `dispatch target query failed: ${dispatchTargetError.message}` }, { status: 500 });
  }

  const dispatchTargets = (dispatchRows || []).filter((row: any) => {
    const createdAt = String(row?.created_at || '');
    const serviceDate = toYmdInKst(row?.payload?.serviceDate || row?.payload?.service_date);
    return createdAt < cutoffIso || Boolean(serviceDate && serviceDate < todayYmd);
  });
  const dispatchIds = dispatchTargets.map((row: any) => row.id).filter(Boolean);

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      dryRun: true,
      retentionDays,
      cutoffIso,
      todayYmd,
      targetNotificationCount: notificationIds.length,
      targetDispatchLogCount: dispatchIds.length,
      message: '삭제 대상 집계 완료',
    });
  }

  let deletedNotificationCount = 0;
  if (notificationIds.length > 0) {
    const { error: deleteNotificationError, count } = await serviceSupabase
      .from('notifications')
      .delete({ count: 'exact' })
      .in('id', notificationIds);

    if (deleteNotificationError) {
      return NextResponse.json({ error: `notifications delete failed: ${deleteNotificationError.message}` }, { status: 500 });
    }

    deletedNotificationCount = count || 0;
  }

  let deletedDispatchCount = 0;
  if (dispatchIds.length > 0) {
    const { error: deleteDispatchError, count } = await serviceSupabase
      .from('notification_dispatch_log')
      .delete({ count: 'exact' })
      .in('id', dispatchIds);

    if (deleteDispatchError) {
      return NextResponse.json({ error: `dispatch log delete failed: ${deleteDispatchError.message}` }, { status: 500 });
    }

    deletedDispatchCount = count || 0;
  }

  return NextResponse.json({
    ok: true,
    dryRun: false,
    retentionDays,
    cutoffIso,
    todayYmd,
    deletedNotificationCount,
    deletedDispatchLogCount: deletedDispatchCount,
    message: '고객 사전알림 데이터 정리 완료',
  });
}

export async function GET(request: NextRequest) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return runCleanup(request);
}

export async function POST(request: NextRequest) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return runCleanup(request);
}
