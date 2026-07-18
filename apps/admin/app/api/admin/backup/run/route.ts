// 관리자 요청으로 GitHub Actions 데이터베이스 백업을 시작하는 API
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import serviceSupabase from '@/lib/serviceSupabase';

const GITHUB_OWNER = process.env.GITHUB_BACKUP_OWNER || 'mimok7';
const GITHUB_REPO = process.env.GITHUB_BACKUP_REPO || 'shtplatform';
const GITHUB_TOKEN = process.env.GITHUB_BACKUP_TOKEN || process.env.GITHUB_TOKEN || '';
const BACKUP_WORKFLOW = process.env.GITHUB_BACKUP_WORKFLOW || 'supabase-backup.yml';
const BACKUP_BRANCH = process.env.GITHUB_BACKUP_BRANCH || 'main';

async function checkAdmin(req: NextRequest): Promise<{ ok: boolean; error?: string; status?: number }> {
  if (!serviceSupabase) {
    return { ok: false, error: 'SUPABASE_SERVICE_ROLE_KEY 미설정', status: 500 };
  }

  let requesterId: string | null = null;
  const authHeader = req.headers.get('authorization') || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (bearerToken) {
    const { data, error } = await serviceSupabase.auth.getUser(bearerToken);
    if (!error && data.user) requesterId = data.user.id;
  }
  if (!requesterId) {
    const response = NextResponse.next();
    const supabase = await createSupabaseServerClient(response);
    const { data, error } = await supabase.auth.getUser();
    if (!error && data.user) requesterId = data.user.id;
  }
  if (!requesterId) return { ok: false, error: '로그인이 필요합니다.', status: 401 };

  const { data: me, error } = await serviceSupabase
    .from('users')
    .select('role')
    .eq('id', requesterId)
    .maybeSingle();
  if (error || me?.role !== 'admin') return { ok: false, error: '관리자 권한이 필요합니다.', status: 403 };
  return { ok: true };
}

export async function POST(req: NextRequest) {
  try {
    const auth = await checkAdmin(req);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    if (!GITHUB_TOKEN) {
      return NextResponse.json(
        { error: 'GITHUB_BACKUP_TOKEN이 설정되지 않았습니다. Actions 쓰기 권한이 있는 토큰을 설정하세요.' },
        { status: 500 },
      );
    }

    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${BACKUP_WORKFLOW}/dispatches`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify({ ref: BACKUP_BRANCH }),
      },
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: `백업 워크플로 실행 실패 (${response.status})`, detail: await response.text() },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      message: '백업 생성을 시작했습니다. 완료 후 복원 마법사에서 목록을 새로고침하세요.',
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || '백업 시작 중 서버 오류' }, { status: 500 });
  }
}
