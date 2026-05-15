import { NextRequest, NextResponse } from 'next/server';
import serviceSupabase from '@/lib/serviceSupabase';

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

    const { error } = await serviceSupabase
      .from('push_subscriptions')
      .upsert(
        {
          user_id: userId,
          endpoint: subscription.endpoint,
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
          app_name: appName || 'mobile',
          user_agent: req.headers.get('user-agent') || '',
          is_active: true,
          last_used_at: new Date().toISOString(),
        },
        { onConflict: 'endpoint' }
      );

    if (error) {
      return NextResponse.json({ error: 'DB 저장 실패' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
