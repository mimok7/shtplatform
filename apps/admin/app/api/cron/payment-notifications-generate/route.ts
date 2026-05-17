import { NextRequest, NextResponse } from 'next/server';
import serviceSupabase from '@/lib/serviceSupabase';
import { dispatchPushNotification } from '@/lib/notificationDispatcher';

const EVENT_KEY = 'payment_due';

// 매일 KST 09:00 (UTC 00:00) 실행: 결제 미완료 예약을 검사하여 payment_notifications에 자동 생성
// vercel.json crons에 등록: { "path": "/api/cron/payment-notifications-generate", "schedule": "0 0 * * *" }

function todayKstIsoDate() {
  const nowUtc = new Date();
  const kst = new Date(nowUtc.getTime() + 9 * 60 * 60 * 1000);
  kst.setUTCHours(0, 0, 0, 0);
  return kst.toISOString().slice(0, 10); // YYYY-MM-DD
}

async function runCron() {
  if (!serviceSupabase) {
    return NextResponse.json({ error: 'Service role client unavailable' }, { status: 500 });
  }

  const today = todayKstIsoDate();

  // 결제 미완료 예약 조회 (pending / partial / overdue)
  const { data: reservations, error: resErr } = await serviceSupabase
    .from('reservation')
    .select('re_id, re_user_id, re_type, total_amount, paid_amount, payment_status, re_created_at')
    .in('payment_status', ['pending', 'partial', 'overdue'])
    .gt('total_amount', 0);

  if (resErr) {
    console.error('[payment-notifications-generate] reservation 조회 실패:', resErr);
    return NextResponse.json({ error: 'reservation query failed' }, { status: 500 });
  }

  const candidates = (reservations || []).filter((r: any) => {
    const total = Number(r.total_amount || 0);
    const paid = Number(r.paid_amount || 0);
    return total > paid;
  });

  if (candidates.length === 0) {
    return NextResponse.json({ ok: true, today, candidates: 0, inserted: 0, message: '미결제 예약 없음' });
  }

  const reservationIds = candidates.map((r: any) => r.re_id);

  // 오늘 이미 payment_due 알림 생성된 reservation 제외 (중복 방지)
  const { data: existing, error: existErr } = await serviceSupabase
    .from('payment_notifications')
    .select('reservation_id')
    .eq('notification_type', 'payment_due')
    .eq('notification_date', today)
    .in('reservation_id', reservationIds);

  if (existErr) {
    console.error('[payment-notifications-generate] 기존 알림 조회 실패:', existErr);
    return NextResponse.json({ error: 'existing notification query failed' }, { status: 500 });
  }

  const existingSet = new Set((existing || []).map((e: any) => e.reservation_id));
  const toInsert = candidates.filter((r: any) => !existingSet.has(r.re_id));

  if (toInsert.length === 0) {
    return NextResponse.json({ ok: true, today, candidates: candidates.length, inserted: 0, message: '오늘 이미 모두 생성됨' });
  }

  // 예약자 email 조회 (recipient_email 채우기 위해)
  const userIds = Array.from(new Set(toInsert.map((r: any) => r.re_user_id).filter(Boolean)));
  const emailMap = new Map<string, string>();
  const phoneMap = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: users } = await serviceSupabase
      .from('users')
      .select('id, email, phone_number')
      .in('id', userIds);
    (users || []).forEach((u: any) => {
      if (u?.id) {
        if (u.email) emailMap.set(u.id, u.email);
        if (u.phone_number) phoneMap.set(u.id, u.phone_number);
      }
    });
  }

  const rows = toInsert.map((r: any) => {
    const total = Number(r.total_amount || 0);
    const paid = Number(r.paid_amount || 0);
    const remain = total - paid;
    return {
      reservation_id: r.re_id,
      notification_type: 'payment_due',
      notification_date: today,
      message_content: `[${r.re_type || '예약'}] 미결제 잔액 ${remain.toLocaleString()}원 확인 부탁드립니다.`,
      is_sent: false,
      recipient_email: r.re_user_id ? (emailMap.get(r.re_user_id) || null) : null,
      recipient_phone: r.re_user_id ? (phoneMap.get(r.re_user_id) || null) : null,
    };
  });

  const { error: insErr, count } = await serviceSupabase
    .from('payment_notifications')
    .insert(rows, { count: 'exact' });

  if (insErr) {
    console.error('[payment-notifications-generate] insert 실패:', insErr);
    return NextResponse.json({ error: 'insert failed', details: insErr.message }, { status: 500 });
  }

  // 어드민 예약설정의 payment_due 정책을 따라 푸시 발송
  let pushSent = 0;
  let pushFailed = 0;
  const pushWarnings: string[] = [];
  for (const r of toInsert) {
    const total = Number(r.total_amount || 0);
    const paid = Number(r.paid_amount || 0);
    const remain = total - paid;
    try {
      const result = await dispatchPushNotification({
        eventKey: EVENT_KEY,
        title: '결제 예정 알림',
        body: `[${r.re_type || '예약'}] 미결제 잔액 ${remain.toLocaleString()}원 확인이 필요합니다.`,
        userId: r.re_user_id || null,
        url: 'https://staycruise.kr/mypage/payment',
        priority: 'high',
      });
      pushSent += result.sentCount;
      pushFailed += result.failCount;
      if (result.warning) pushWarnings.push(result.warning);
    } catch (err) {
      console.warn('[payment-notifications-generate] push 발송 실패(저장은 계속):', err);
      pushFailed += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    today,
    candidates: candidates.length,
    inserted: count ?? rows.length,
    pushSent,
    pushFailed,
    pushWarnings: Array.from(new Set(pushWarnings)),
    message: '결제 알림 자동 생성 + 푸시 발송 완료',
  });
}

function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // 비활성 환경 허용
  const header = request.headers.get('authorization') || '';
  return header === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return runCron();
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return runCron();
}
