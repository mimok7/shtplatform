import { NextRequest, NextResponse } from 'next/server';
import serviceSupabase from '@/lib/serviceSupabase';

async function deactivateDuplicateSubscriptions(options: {
  userId: string;
  appName: string;
  userAgent: string;
  endpoint: string;
}) {
  const { userId, appName, userAgent, endpoint } = options;
  if (!userAgent) return;

  await serviceSupabase!
    .from('push_subscriptions')
    .update({ is_active: false })
    .eq('user_id', userId)
    .eq('app_name', appName)
    .eq('user_agent', userAgent)
    .neq('endpoint', endpoint)
    .eq('is_active', true);
}

export async function POST(req: NextRequest) {
  try {
    if (!serviceSupabase) {
      return NextResponse.json({ error: '서버 설정 오류' }, { status: 500 });
    }

    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

    let userId: string | null = null;
    if (token) {
      const { data } = await serviceSupabase.auth.getUser(token);
      userId = data.user?.id || null;
    }

    const { subscription, appName } = await req.json();
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return NextResponse.json({ error: '유효하지 않은 구독 정보' }, { status: 400 });
    }

    if (!userId) {
      return NextResponse.json({ error: '로그인 세션이 필요합니다.' }, { status: 401 });
    }

    const resolvedAppName = appName || 'admin';
    const resolvedUserAgent = req.headers.get('user-agent') || '';

    const { error } = await serviceSupabase
      .from('push_subscriptions')
      .upsert(
        {
          user_id: userId,
          endpoint: subscription.endpoint,
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
          app_name: resolvedAppName,
          user_agent: resolvedUserAgent,
          is_active: true,
          last_used_at: new Date().toISOString(),
        },
        { onConflict: 'endpoint' }
      );

    if (error) {
      console.error('[admin subscribe-push] DB 저장 실패:', error);
      return NextResponse.json({ error: 'DB 저장 실패' }, { status: 500 });
    }

    await deactivateDuplicateSubscriptions({
      userId,
      appName: resolvedAppName,
      userAgent: resolvedUserAgent,
      endpoint: subscription.endpoint,
    });

    console.log(`[admin subscribe-push] ✅ 구독 저장 완료. userId: ${userId}, app: ${resolvedAppName}`);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[admin subscribe-push] 오류:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
