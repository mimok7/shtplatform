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

async function deactivateDuplicateSubscriptions(options: {
  userId: string;
  appName: string;
  userAgent: string;
  endpoint: string;
  anonClient: ReturnType<typeof getAnonClient>;
}) {
  const { userId, appName, userAgent, endpoint, anonClient } = options;
  if (!userAgent) return;

  const duplicateFilterQuery = (client: any) =>
    client
      .from('push_subscriptions')
      .update({ is_active: false })
      .eq('user_id', userId)
      .eq('app_name', appName)
      .eq('user_agent', userAgent)
      .neq('endpoint', endpoint)
      .eq('is_active', true);

  if (serviceSupabase) {
    await duplicateFilterQuery(serviceSupabase);
    return;
  }

  if (anonClient) {
    await duplicateFilterQuery(anonClient);
  }
}

export async function POST(req: NextRequest) {
  try {
    const token = getTokenFromRequest(req);
    const anonClient = getAnonClient(token);

    let userId: string | null = null;
    if (token && serviceSupabase) {
      const { data, error } = await serviceSupabase.auth.getUser(token);
      // Service key가 잘못된 환경에서는 anon client로 fallback한다.
      if (!error) {
        userId = data.user?.id || null;
      }
    }

    if (!userId && token && anonClient) {
      const { data, error } = await anonClient.auth.getUser(token);
      if (!error) {
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

    const resolvedAppName = appName || 'mobile';
    const resolvedUserAgent = req.headers.get('user-agent') || '';

    const payload = {
      user_id: userId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      app_name: resolvedAppName,
      user_agent: resolvedUserAgent,
      is_active: true,
      last_used_at: new Date().toISOString(),
    };

    // 서비스키가 있으면 RLS 우회 upsert, 없으면 anon 토큰으로 delete+insert fallback
    if (serviceSupabase) {
      const { error } = await serviceSupabase
        .from('push_subscriptions')
        .upsert(payload, { onConflict: 'endpoint' });

      if (!error) {
        await deactivateDuplicateSubscriptions({
          userId,
          appName: resolvedAppName,
          userAgent: resolvedUserAgent,
          endpoint: payload.endpoint,
          anonClient,
        });
        return NextResponse.json({ success: true });
      }

      // 서비스키가 비정상일 때 anon fallback 경로로 재시도한다.
      if (!anonClient) {
        return NextResponse.json({ error: `DB 저장 실패: ${error.message}` }, { status: 500 });
      }

      await anonClient.from('push_subscriptions').delete().eq('endpoint', payload.endpoint);
      const { error: fallbackError } = await anonClient.from('push_subscriptions').insert(payload);
      if (fallbackError) {
        return NextResponse.json({ error: `DB 저장 실패: ${fallbackError.message}` }, { status: 500 });
      }

      await deactivateDuplicateSubscriptions({
        userId,
        appName: resolvedAppName,
        userAgent: resolvedUserAgent,
        endpoint: payload.endpoint,
        anonClient,
      });

      return NextResponse.json({ success: true });
    }

    if (!anonClient) {
      return NextResponse.json({ error: '서버 설정 오류(anon/client 구성 실패)' }, { status: 500 });
    }

    await anonClient.from('push_subscriptions').delete().eq('endpoint', payload.endpoint);
    const { error } = await anonClient.from('push_subscriptions').insert(payload);
    if (error) {
      return NextResponse.json({ error: `DB 저장 실패: ${error.message}` }, { status: 500 });
    }

    await deactivateDuplicateSubscriptions({
      userId,
      appName: resolvedAppName,
      userAgent: resolvedUserAgent,
      endpoint: payload.endpoint,
      anonClient,
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || '서버 오류' }, { status: 500 });
  }
}
