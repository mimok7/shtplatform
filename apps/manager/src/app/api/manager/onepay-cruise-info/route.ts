// OnePay 송장에 필요한 크루즈 한글·영문명을 관리자 권한으로 제공한다.
import { NextRequest, NextResponse } from 'next/server';
import serviceSupabase from '@/lib/serviceSupabase';

async function requireManager(request: NextRequest) {
  if (!serviceSupabase) return { error: NextResponse.json({ error: '송장 정보 설정을 확인하지 못했습니다.' }, { status: 500 }) };
  const authorization = request.headers.get('authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!token) return { error: NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }) };
  const { data: authData, error: authError } = await serviceSupabase.auth.getUser(token);
  if (authError || !authData.user) return { error: NextResponse.json({ error: '로그인 정보를 확인하지 못했습니다.' }, { status: 401 }) };
  const { data: profile, error: profileError } = await serviceSupabase.from('users').select('role').eq('id', authData.user.id).maybeSingle();
  if (profileError || !['manager', 'admin'].includes(profile?.role || '')) return { error: NextResponse.json({ error: '송장 정보를 조회할 권한이 없습니다.' }, { status: 403 }) };
  return { userId: authData.user.id };
}

export async function GET(request: NextRequest) {
  const access = await requireManager(request);
  if (access.error) return access.error;
  const cruiseName = String(request.nextUrl.searchParams.get('cruiseName') || '').trim();
  if (!cruiseName || cruiseName.length > 160) return NextResponse.json({ error: '크루즈 정보가 올바르지 않습니다.' }, { status: 400 });

  const { data, error } = await serviceSupabase!
    .from('homepage_cruise_content')
    .select('name_ko,name_en')
    .eq('cruise_name', cruiseName)
    .maybeSingle();
  if (error) {
    console.error('[onepay-cruise-info] read failed', error);
    return NextResponse.json({ error: '크루즈 정보를 불러오지 못했습니다.' }, { status: 500 });
  }
  if (!data?.name_ko || !data?.name_en) return NextResponse.json({ error: '크루즈 한글명 또는 영문명이 없습니다.' }, { status: 404 });
  return NextResponse.json({ koreanName: data.name_ko, englishName: data.name_en });
}
