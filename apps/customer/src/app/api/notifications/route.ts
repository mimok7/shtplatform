import { NextRequest, NextResponse } from 'next/server';
import serviceSupabase from '../../../lib/serviceSupabase';

async function authenticateUser(req: NextRequest) {
  if (!serviceSupabase) {
    return { ok: false as const, status: 500, error: '서버 설정 오류' };
  }

  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) {
    return { ok: false as const, status: 401, error: '인증 필요' };
  }

  const { data, error } = await serviceSupabase.auth.getUser(token);
  if (error || !data?.user?.id) {
    return { ok: false as const, status: 401, error: '인증 실패' };
  }

  return { ok: true as const, userId: data.user.id };
}

export async function GET(req: NextRequest) {
  const auth = await authenticateUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { data, error } = await serviceSupabase!
    .from('notifications')
    .select('*')
    .eq('assigned_to', auth.userId)
    .order('created_at', { ascending: false })
    .limit(300);

  if (error) {
    return NextResponse.json({ error: `알림 조회 실패: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ rows: data || [] });
}

export async function PATCH(req: NextRequest) {
  const auth = await authenticateUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await req.json().catch(() => null) as
    | { mode?: 'single' | 'all'; notificationId?: string }
    | null;

  const mode = body?.mode || 'single';

  if (mode === 'all') {
    const { error } = await serviceSupabase!
      .from('notifications')
      .update({ status: 'read', updated_at: new Date().toISOString() })
      .eq('assigned_to', auth.userId)
      .neq('status', 'read');

    if (error) {
      return NextResponse.json({ error: `전체 읽음 처리 실패: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({ ok: true, mode: 'all' });
  }

  const notificationId = String(body?.notificationId || '').trim();
  if (!notificationId) {
    return NextResponse.json({ error: 'notificationId가 필요합니다.' }, { status: 400 });
  }

  const { error } = await serviceSupabase!
    .from('notifications')
    .update({ status: 'read', updated_at: new Date().toISOString() })
    .eq('id', notificationId)
    .eq('assigned_to', auth.userId);

  if (error) {
    return NextResponse.json({ error: `읽음 처리 실패: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, mode: 'single' });
}
