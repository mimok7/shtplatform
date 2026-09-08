// 관리자 DB 도구의 테이블 목록, 행 조회, 행 추가를 제공한다.
import { NextRequest, NextResponse } from 'next/server';
import { checkAdmin } from '@/lib/exportAuth';
import { fetchTablePage, insertTableRow, listPublicTables } from '@/lib/dbBrowser';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await checkAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const mode = request.nextUrl.searchParams.get('mode') || 'tables';
    if (mode === 'tables') {
      const tables = await listPublicTables();
      return NextResponse.json({ ok: true, tables });
    }
    if (mode === 'rows') {
      const table = request.nextUrl.searchParams.get('table') || '';
      const search = request.nextUrl.searchParams.get('search') || '';
      const offset = Number(request.nextUrl.searchParams.get('offset') || 0);
      const limit = Number(request.nextUrl.searchParams.get('limit') || 100);
      const result = await fetchTablePage(table, { search, offset, limit });
      return NextResponse.json({ ok: true, table, ...result });
    }
    return NextResponse.json({ error: 'mode는 tables 또는 rows만 지원합니다.' }, { status: 400 });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'DB 조회에 실패했습니다.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await checkAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const table = typeof body?.table === 'string' ? body.table.trim() : '';
    const data = await insertTableRow(table, body?.values && typeof body.values === 'object' ? body.values : {});
    return NextResponse.json({ ok: true, data });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '행 추가에 실패했습니다.' }, { status: 400 });
  }
}
