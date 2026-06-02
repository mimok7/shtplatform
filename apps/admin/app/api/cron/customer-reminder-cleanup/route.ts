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

async function runCleanup(request: NextRequest) {
  if (!serviceSupabase) {
    return NextResponse.json({ error: 'Service role client unavailable' }, { status: 500 });
  }

  const retentionDaysRaw = Number(request.nextUrl.searchParams.get('retentionDays') || DEFAULT_RETENTION_DAYS);
  const retentionDays = Math.max(1, Math.min(90, Number.isFinite(retentionDaysRaw) ? retentionDaysRaw : DEFAULT_RETENTION_DAYS));
  const dryRun = String(request.nextUrl.searchParams.get('dryRun') || '').toLowerCase() === 'true';
  const cutoffIso = toIsoBeforeDays(retentionDays);

  const { data: targetNotifications, error: targetError } = await serviceSupabase
    .from('notifications')
    .select('id')
    .eq('category', NOTIFICATION_CATEGORY)
    .lt('created_at', cutoffIso)
    .limit(50000);

  if (targetError) {
    return NextResponse.json({ error: `notifications target query failed: ${targetError.message}` }, { status: 500 });
  }

  const notificationIds = (targetNotifications || []).map((row: any) => row.id).filter(Boolean);

  const { count: dispatchTargetCount, error: dispatchTargetError } = await serviceSupabase
    .from('notification_dispatch_log')
    .select('event_key', { count: 'exact', head: true })
    .eq('event_key', EVENT_KEY)
    .lt('created_at', cutoffIso);

  if (dispatchTargetError) {
    return NextResponse.json({ error: `dispatch target query failed: ${dispatchTargetError.message}` }, { status: 500 });
  }

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      dryRun: true,
      retentionDays,
      cutoffIso,
      targetNotificationCount: notificationIds.length,
      targetDispatchLogCount: dispatchTargetCount || 0,
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

  const { error: deleteDispatchError, count: deletedDispatchCount } = await serviceSupabase
    .from('notification_dispatch_log')
    .delete({ count: 'exact' })
    .eq('event_key', EVENT_KEY)
    .lt('created_at', cutoffIso);

  if (deleteDispatchError) {
    return NextResponse.json({ error: `dispatch log delete failed: ${deleteDispatchError.message}` }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    dryRun: false,
    retentionDays,
    cutoffIso,
    deletedNotificationCount,
    deletedDispatchLogCount: deletedDispatchCount || 0,
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
