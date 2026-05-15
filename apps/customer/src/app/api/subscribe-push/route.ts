import { NextRequest, NextResponse } from 'next/server';
import serviceSupabase from '../../../lib/serviceSupabase';

export async function POST(req: NextRequest) {
  try {
    if (!serviceSupabase) {
      return NextResponse.json({ error: '서버 설정 오류' }, { status: 500 });
    }

    // Bearer 토큰으로 사용자 인증
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

    // push_subscriptions에 저장 (중복 endpoint는 upsert)
    const { error } = await serviceSupabase
      .from('push_subscriptions')
      .upsert(
        {
          user_id: userId,
          endpoint: subscription.endpoint,
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
          app_name: appName || 'customer',
          user_agent: req.headers.get('user-agent') || '',
          is_active: true,
          last_used_at: new Date().toISOString(),
        },
        { onConflict: 'endpoint' }
      );

    if (error) {
      console.error('[subscribe-push] DB 저장 실패:', error);
      return NextResponse.json({ error: 'DB 저장 실패' }, { status: 500 });
    }

    console.log(`[subscribe-push] ✅ 구독 저장 완료. userId: ${userId}, app: ${appName}`);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[subscribe-push] 오류:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
