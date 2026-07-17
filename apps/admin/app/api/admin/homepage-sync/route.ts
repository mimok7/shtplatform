// 홈페이지 상품 데이터 푸시를 관리자 권한으로 실행하는 API다.
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import serviceSupabase from '@/lib/serviceSupabase';
import { getHomepageCatalogStatus, pushHomepageCatalog, refreshHomepageCatalog } from '@/lib/homepageSync';

async function isAdmin(request: NextRequest) {
  if (!serviceSupabase) return false;
  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  let userId: string | undefined;
  if (token) {
    const { data } = await serviceSupabase.auth.getUser(token);
    userId = data.user?.id;
  }
  if (!userId) {
    const response = NextResponse.next();
    const client = await createSupabaseServerClient(response);
    const { data } = await client.auth.getUser();
    userId = data.user?.id;
  }
  if (!userId) return false;
  const { data } = await serviceSupabase.from('users').select('role').eq('id', userId).maybeSingle();
  return data?.role === 'admin';
}

export async function POST(request: NextRequest) {
  if (!(await isAdmin(request))) return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
  try {
    const body = await request.json().catch(() => ({}));
    if (body.action === 'transform') return NextResponse.json({ ok: true, ...(await refreshHomepageCatalog()) });
    return NextResponse.json({ ok: true, ...(await pushHomepageCatalog('manual')) });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || '홈페이지 전송에 실패했습니다.' }, { status: 502 });
  }
}

export async function GET(request: NextRequest) {
  if (!(await isAdmin(request))) return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
  try {
    return NextResponse.json(await getHomepageCatalogStatus());
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || '홈페이지 변환 현황을 조회하지 못했습니다.' }, { status: 502 });
  }
}
