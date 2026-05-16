import { NextRequest, NextResponse } from 'next/server';
import serviceSupabase from '@/lib/serviceSupabase';

type SubscriptionRow = {
  id: string;
  app_name: string | null;
  user_id: string | null;
  endpoint: string;
  user_agent: string | null;
  is_active: boolean | null;
  last_used_at: string | null;
  created_at: string | null;
  users: {
    id: string;
    name: string | null;
    email: string | null;
  }[] | null;
};

type AuthUserSummary = {
  email: string | null;
  name: string | null;
};

async function authenticateAdmin(req: NextRequest) {
  if (!serviceSupabase) {
    return { ok: false as const, error: '서버 설정 오류', status: 500 };
  }

  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) {
    return { ok: false as const, error: '인증 필요', status: 401 };
  }

  const { data: authData, error: authError } = await serviceSupabase.auth.getUser(token);
  if (authError || !authData?.user) {
    return { ok: false as const, error: '인증 실패', status: 401 };
  }

  const { data: me } = await serviceSupabase
    .from('users')
    .select('id, role')
    .eq('id', authData.user.id)
    .maybeSingle();

  if (!me || me.role !== 'admin') {
    return { ok: false as const, error: '권한 없음', status: 403 };
  }

  return { ok: true as const };
}

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateAdmin(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const appName = req.nextUrl.searchParams.get('appName')?.trim() || '';

    let query = serviceSupabase!
      .from('push_subscriptions')
      .select('id, app_name, user_id, endpoint, user_agent, is_active, last_used_at, created_at, users:user_id(id, name, email)')
      .eq('is_active', true)
      .order('app_name', { ascending: true })
      .order('last_used_at', { ascending: false, nullsFirst: false })
      .limit(500);

    if (appName) {
      query = query.eq('app_name', appName);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rawRows = (data || []) as SubscriptionRow[];

    const missingUserIds = Array.from(
      new Set(
        rawRows
          .filter((row) => {
            const user = Array.isArray(row.users) ? row.users[0] : null;
            return !!row.user_id && !user?.email && !user?.name;
          })
          .map((row) => row.user_id)
          .filter((id): id is string => Boolean(id))
      )
    );

    const authFallbackMap = new Map<string, AuthUserSummary>();
    if (missingUserIds.length > 0) {
      await Promise.all(
        missingUserIds.map(async (id) => {
          try {
            const { data: authUserData, error: authUserError } = await serviceSupabase!.auth.admin.getUserById(id);
            if (authUserError || !authUserData?.user) return;

            const meta = authUserData.user.user_metadata as Record<string, unknown> | null;
            const metaName =
              (typeof meta?.name === 'string' && meta.name.trim()) ||
              (typeof meta?.full_name === 'string' && meta.full_name.trim()) ||
              null;

            authFallbackMap.set(id, {
              email: authUserData.user.email || null,
              name: metaName,
            });
          } catch {
            // auth 보강 조회 실패 시 users 조인 결과만 사용
          }
        })
      );
    }

    const rows = rawRows.map((row) => {
      const user = Array.isArray(row.users) ? row.users[0] : null;
      const authUser = row.user_id ? authFallbackMap.get(row.user_id) : undefined;
      return {
        id: row.id,
        app_name: row.app_name || 'unknown',
        user_id: row.user_id,
        account_email: user?.email || authUser?.email || null,
        user_name: user?.name || authUser?.name || null,
        endpoint: row.endpoint,
        user_agent: row.user_agent,
        last_used_at: row.last_used_at,
        created_at: row.created_at,
      };
    });

    return NextResponse.json({ rows });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || '서버 오류' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await authenticateAdmin(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await req.json().catch(() => ({}));
    const subscriptionId = typeof body?.subscriptionId === 'string' ? body.subscriptionId.trim() : '';
    const isActive = body?.isActive === undefined ? false : Boolean(body.isActive);

    if (!subscriptionId) {
      return NextResponse.json({ error: 'subscriptionId 필수' }, { status: 400 });
    }

    const { error } = await serviceSupabase!
      .from('push_subscriptions')
      .update({
        is_active: isActive,
        last_used_at: new Date().toISOString(),
      })
      .eq('id', subscriptionId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, id: subscriptionId, isActive });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || '서버 오류' }, { status: 500 });
  }
}
