import { NextRequest, NextResponse } from 'next/server';
import serviceSupabase from '../../../lib/serviceSupabase';

export async function POST(req: NextRequest) {
  try {
    if (!serviceSupabase) {
      return NextResponse.json({ error: '서버 설정 오류' }, { status: 500 });
    }

    const { endpoint } = await req.json();
    if (!endpoint) {
      return NextResponse.json({ error: 'endpoint 필수' }, { status: 400 });
    }

    const { error } = await serviceSupabase
      .from('push_subscriptions')
      .update({ is_active: false })
      .eq('endpoint', endpoint);

    if (error) {
      console.error('[unsubscribe-push] DB 업데이트 실패:', error);
      return NextResponse.json({ error: 'DB 업데이트 실패' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[unsubscribe-push] 오류:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
