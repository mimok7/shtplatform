// 홈페이지 DB 도구의 테이블 목록, 행 조회, 행 추가를 제공한다.
import { NextRequest, NextResponse } from 'next/server';
import { checkAdmin } from '@/lib/exportAuth';
import { fetchTablePage, insertTableRow, listPublicTables } from '@/lib/dbBrowser';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseFilters(value: string | null) {
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>)
        .filter(([key, item]) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) && typeof item === 'string')
        .map(([key, item]) => [key, (item as string).slice(0, 200)]),
    ) as Record<string, string>;
  } catch {
    throw new Error('컬럼 필터 형식이 올바르지 않습니다.');
  }
}

export async function GET(request: NextRequest) {
  const auth = await checkAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const mode = request.nextUrl.searchParams.get('mode') || 'tables';
    if (mode === 'tables') return NextResponse.json({ ok: true, tables: await listPublicTables('homepage') });
    if (mode === 'rows') {
      const table = request.nextUrl.searchParams.get('table') || '';
      const result = await fetchTablePage(table, {
        search: request.nextUrl.searchParams.get('search') || '',
        filters: parseFilters(request.nextUrl.searchParams.get('filters')),
        sort: request.nextUrl.searchParams.get('sort') || '',
        direction: request.nextUrl.searchParams.get('direction') === 'desc' ? 'desc' : 'asc',
        offset: Number(request.nextUrl.searchParams.get('offset') || 0),
        limit: Number(request.nextUrl.searchParams.get('limit') || 100),
      }, 'homepage');
      return NextResponse.json({ ok: true, table, ...result });
    }
    return NextResponse.json({ error: 'mode는 tables 또는 rows만 지원합니다.' }, { status: 400 });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '홈페이지 DB 조회에 실패했습니다.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await checkAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const table = typeof body?.table === 'string' ? body.table.trim() : '';
    const data = await insertTableRow(table, body?.values && typeof body.values === 'object' ? body.values : {}, 'homepage');
    return NextResponse.json({ ok: true, data });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '홈페이지 DB 행 추가에 실패했습니다.' }, { status: 400 });
  }
}
