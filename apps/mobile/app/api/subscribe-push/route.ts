import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import serviceSupabase from '@/lib/serviceSupabase';

function getTokenFromRequest(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
}

function getAnonClient(accessToken: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey || !accessToken) return null;

  return createClient(supabaseUrl, anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    const token = getTokenFromRequest(req);

    let userId: string | null = null;
    if (serviceSupabase && token) {
      const { data } = await serviceSupabase.auth.getUser(token);
      userId = data.user?.id || null;
    }

    if (!userId && token) {
      const anonClient = getAnonClient(token);
      if (anonClient) {
        const { data } = await anonClient.auth.getUser(token);
        userId = data.user?.id || null;
      }
    }

    const { subscription, appName } = await req.json();
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return NextResponse.json({ error: '유효하지 않은 구독 정보' }, { status: 400 });
    }

    if (!userId) {
      return NextResponse.json({ error: '로그인 세션을 확인할 수 없습니다. 다시 로그인 후 시도해 주세요.' }, { status: 401 });
    }

    const payload = {
      user_id: userId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      app_name: appName || 'mobile',
      user_agent: req.headers.get('user-agent') || '',
      is_active: true,
      last_used_at: new Date().toISOString(),
    };

    // 서비스키가 있으면 RLS 우회 upsert, 없으면 anon 토큰으로 delete+insert fallback
    if (serviceSupabase) {
      const { error } = await serviceSupabase
        .from('push_subscriptions')
        .upsert(payload, { onConflict: 'endpoint' });

      if (error) {
        return NextResponse.json({ error: `DB 저장 실패: ${error.message}` }, { status: 500 });
      }
    } else {
      const anonClient = getAnonClient(token);
      if (!anonClient) {
        return NextResponse.json({ error: '서버 설정 오류(anon/client 구성 실패)' }, { status: 500 });
      }

      await anonClient.from('push_subscriptions').delete().eq('endpoint', payload.endpoint);
      const { error } = await anonClient.from('push_subscriptions').insert(payload);

      if (error) {
        return NextResponse.json({ error: `DB 저장 실패: ${error.message}` }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || '서버 오류' }, { status: 500 });
  }
}
