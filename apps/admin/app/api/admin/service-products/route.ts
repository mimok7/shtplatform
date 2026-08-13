import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import serviceSupabase from '@/lib/serviceSupabase';
import { findProductDataset, findProductService, ProductDataset, ProductField } from '@/lib/serviceProductCatalog';
import { pushHomepageCatalog } from '@/lib/homepageSync';

export const dynamic = 'force-dynamic';

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

async function isAdmin(request: NextRequest) {
  if (!serviceSupabase) return false;
  const authorization = request.headers.get('authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
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

function normalizeValue(field: ProductField, value: unknown) {
  if (field.type === 'boolean') return value === true || value === 'true';
  if (field.type === 'number') {
    if (value === '' || value === null || value === undefined) return null;
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error(`${field.label} 값을 확인해 주세요.`);
    return number;
  }
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function sanitizeValues(dataset: ProductDataset, values: Record<string, unknown>, isCreate: boolean) {
  const result: Record<string, unknown> = { ...(isCreate ? dataset.insertDefaults || {} : {}) };
  for (const field of dataset.fields) {
    if (!Object.hasOwn(values || {}, field.key)) continue;
    result[field.key] = normalizeValue(field, values[field.key]);
  }
  if (!isCreate) delete result[dataset.primaryKey];
  for (const field of dataset.fields.filter((item) => item.required)) {
    const value = result[field.key];
    if ((isCreate || Object.hasOwn(result, field.key)) && (value === null || value === undefined || value === '')) throw new Error(`${field.label}은(는) 필수입니다.`);
  }
  if (dataset.touchesUpdatedAt) result.updated_at = new Date().toISOString();
  return result;
}

async function syncHomepage() {
  try {
    const result = await pushHomepageCatalog('manual');
    return { synced: true, syncResult: result };
  } catch (error: unknown) {
    const message = errorMessage(error, '홈페이지 동기화에 실패했습니다.');
    // eslint-disable-next-line no-console
    console.error('[service-products] homepage sync failed', message);
    return { synced: false, syncWarning: message };
  }
}

export async function GET(request: NextRequest) {
  if (!(await isAdmin(request))) return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
  if (!serviceSupabase) return NextResponse.json({ error: '플랫폼 DB 연결 정보가 없습니다.' }, { status: 503 });
  const service = findProductService(request.nextUrl.searchParams.get('service'));
  if (!service) return NextResponse.json({ error: '지원하지 않는 서비스입니다.' }, { status: 400 });
  try {
    const entries = await Promise.all(service.datasets.map(async (dataset) => {
      const select = [dataset.primaryKey, ...dataset.fields.map((field) => field.key)].filter((value, index, values) => values.indexOf(value) === index).join(',');
      const { data, error } = await serviceSupabase
        .from(dataset.table)
        .select(select)
        .order(dataset.orderBy, { ascending: dataset.orderAscending ?? true })
        .limit(5000);
      if (error) throw new Error(`${dataset.label} 조회 실패: ${error.message}`);
      return [dataset.id, data || []] as const;
    }));
    return NextResponse.json({ service: service.id, datasets: Object.fromEntries(entries) });
  } catch (error: unknown) {
    return NextResponse.json({ error: errorMessage(error, '상품 데이터를 불러오지 못했습니다.') }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!(await isAdmin(request))) return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
  if (!serviceSupabase) return NextResponse.json({ error: '플랫폼 DB 연결 정보가 없습니다.' }, { status: 503 });
  try {
    const body = await request.json();
    const dataset = findProductDataset(body.service, body.dataset);
    if (!dataset) return NextResponse.json({ error: '지원하지 않는 상품 데이터입니다.' }, { status: 400 });
    const values = sanitizeValues(dataset, body.values || {}, true);
    const { data, error } = await serviceSupabase.from(dataset.table).insert(values).select().single();
    if (error) throw error;
    return NextResponse.json({ ok: true, data, ...(await syncHomepage()) });
  } catch (error: unknown) {
    const message = errorMessage(error, '상품을 추가하지 못했습니다.');
    const status = /필수|확인해/.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(request: NextRequest) {
  if (!(await isAdmin(request))) return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
  if (!serviceSupabase) return NextResponse.json({ error: '플랫폼 DB 연결 정보가 없습니다.' }, { status: 503 });
  try {
    const body = await request.json();
    const dataset = findProductDataset(body.service, body.dataset);
    if (!dataset || body.id === null || body.id === undefined || body.id === '') return NextResponse.json({ error: '수정 대상을 확인해 주세요.' }, { status: 400 });
    const values = sanitizeValues(dataset, body.values || {}, false);
    const { data, error } = await serviceSupabase.from(dataset.table).update(values).eq(dataset.primaryKey, body.id).select().single();
    if (error) throw error;
    return NextResponse.json({ ok: true, data, ...(await syncHomepage()) });
  } catch (error: unknown) {
    const message = errorMessage(error, '상품을 수정하지 못했습니다.');
    const status = /필수|확인해/.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: NextRequest) {
  if (!(await isAdmin(request))) return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
  if (!serviceSupabase) return NextResponse.json({ error: '플랫폼 DB 연결 정보가 없습니다.' }, { status: 503 });
  try {
    const body = await request.json();
    const dataset = findProductDataset(body.service, body.dataset);
    if (!dataset || body.id === null || body.id === undefined || body.id === '') return NextResponse.json({ error: '삭제 대상을 확인해 주세요.' }, { status: 400 });
    const { error } = await serviceSupabase.from(dataset.table).delete().eq(dataset.primaryKey, body.id);
    if (error) throw error;
    return NextResponse.json({ ok: true, ...(await syncHomepage()) });
  } catch (error: unknown) {
    return NextResponse.json({ error: errorMessage(error, '상품을 삭제하지 못했습니다.') }, { status: 500 });
  }
}
