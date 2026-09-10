// 매니저 견적서 발행 이력을 홈페이지 견적서 저장소에 기록한다.
import { NextRequest, NextResponse } from 'next/server';
import serviceSupabase from '@/lib/serviceSupabase';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type QuoteIssueRow = { category: string; name: string; details: string; total: number };

function validId(value: unknown): value is string { return typeof value === 'string' && UUID_PATTERN.test(value); }
function text(value: unknown, limit: number) { return typeof value === 'string' ? value.trim().slice(0, limit) : ''; }
function recipientLabel(value: unknown) { const name = text(value, 160); return name ? (name.endsWith('고객님') ? name : `${name} 고객님`) : '고객님'; }
function quoteNumber() { return `SHT-Q-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`; }

async function requireManager(request: NextRequest) {
  if (!serviceSupabase) return { error: NextResponse.json({ error: '견적서 저장 설정을 확인하지 못했습니다.' }, { status: 500 }) };
  const authorization = request.headers.get('authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!token) return { error: NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }) };
  const { data: authData, error: authError } = await serviceSupabase.auth.getUser(token);
  if (authError || !authData.user) return { error: NextResponse.json({ error: '로그인 정보를 확인하지 못했습니다.' }, { status: 401 }) };
  const { data: profile, error: profileError } = await serviceSupabase.from('users').select('role').eq('id', authData.user.id).maybeSingle();
  if (profileError || !['manager', 'admin'].includes(profile?.role || '')) return { error: NextResponse.json({ error: '견적서를 발행할 권한이 없습니다.' }, { status: 403 }) };
  return { userId: authData.user.id };
}

async function quoteOwner(quoteId: string) {
  const { data, error } = await serviceSupabase!.from('quote').select('id,user_id,title').eq('id', quoteId).maybeSingle();
  if (error) throw new Error('견적 정보를 확인하지 못했습니다.');
  if (!data?.user_id) throw new Error('발행할 견적을 찾을 수 없습니다.');
  return data;
}

function normalizeRows(value: unknown): QuoteIssueRow[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 40).map((row) => ({ category: text(row?.category, 80), name: text(row?.name, 240), details: text(row?.details, 500), total: Number(row?.total) || 0 })).filter((row) => row.category && row.name && row.total >= 0);
}

function homepageQuoteItemName(item: any) {
  if (item?.serviceType !== 'airport') return item?.name || '상품';
  const metadata = item?.metadata || {};
  const summaryRoute = Array.isArray(metadata.summary) ? metadata.summary.find((row: any) => Array.isArray(row) && row[0] === '이동 경로')?.[1] : '';
  const legs = Array.isArray(metadata.platform?.legs) ? metadata.platform.legs : [];
  const routes = [...new Set([metadata.airportRoute, summaryRoute, ...legs.map((leg: any) => leg?.route)].filter(Boolean).map(String))];
  if (routes.length === 1) return routes[0];
  const parts = routes[0]?.split(/\s+[-↔]\s+/).map((part: string) => part.trim()).filter(Boolean) || [];
  return parts.length >= 2 ? `${parts[0]} ↔ ${parts[parts.length - 1]}` : item?.name || '상품';
}

function issueView(record: any, quoteId: string) {
  const items = Array.isArray(record.items) ? record.items.filter((item: any) => item?.metadata?.managerQuoteId === quoteId) : [];
  return { quote_number: record.quote_number, quote_title: items[0]?.metadata?.quoteTitle || '', recipient_name: recipientLabel(record.recipient_name), memo: record.memo || '', items: items.map((item: any) => ({ category: item.serviceLabel || '여행 상품', name: homepageQuoteItemName(item), details: item.optionName || '', total: Number(item.unitPrice) * Number(item.quantity || 1) })), totals: record.totals || {}, item_count: record.item_count, issued_at: record.issued_at };
}

export async function GET(request: NextRequest) {
  const access = await requireManager(request);
  if (access.error) return access.error;
  const quoteId = request.nextUrl.searchParams.get('quoteId');
  if (!validId(quoteId)) return NextResponse.json({ error: '견적 정보가 올바르지 않습니다.' }, { status: 400 });
  try {
    const quote = await quoteOwner(quoteId);
    const { data, error } = await serviceSupabase!.from('homepage_cart_quotes').select('quote_number,recipient_name,memo,items,totals,item_count,issued_at').eq('platform_user_id', quote.user_id).order('issued_at', { ascending: false }).limit(200);
    if (error) throw error;
    const issue = (data || []).find((record: any) => Array.isArray(record.items) && record.items.some((item: any) => item?.metadata?.managerQuoteId === quoteId));
    return NextResponse.json({ issue: issue ? issueView(issue, quoteId) : null });
  } catch (error) {
    console.error('[manager-quote-issues] latest read failed', error);
    return NextResponse.json({ error: '발행 견적서를 불러오지 못했습니다.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const access = await requireManager(request);
  if (access.error) return access.error;
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: '견적서 정보가 올바르지 않습니다.' }, { status: 400 }); }
  if (!validId(body?.quoteId)) return NextResponse.json({ error: '견적 정보가 올바르지 않습니다.' }, { status: 400 });
  const rows = normalizeRows(body.items);
  if (!rows.length) return NextResponse.json({ error: '발행할 상품이 없습니다.' }, { status: 400 });
  try {
    const quote = await quoteOwner(body.quoteId);
    const issuedAt = new Date().toISOString();
    const items = rows.map((row, index) => ({ id: `${body.quoteId}-${index + 1}`, serviceType: 'manager_quote', serviceLabel: row.category, name: row.name, optionName: row.details, startDate: '', endDate: '', adults: 0, children: 0, infants: 0, quantity: 1, unitPrice: row.total, currency: 'VND', metadata: { managerQuoteId: body.quoteId, quoteTitle: text(body.quoteTitle, 240), issuedBy: access.userId } }));
    const totals = { VND: Math.max(0, Number(body?.totals?.VND) || 0), KRW: Math.max(0, Number(body?.totals?.KRW) || 0) };
    const { data, error } = await serviceSupabase!.from('homepage_cart_quotes').insert({ quote_number: quoteNumber(), platform_user_id: quote.user_id, recipient_name: recipientLabel(body.recipientName), memo: text(body.memo, 1000), items, totals, item_count: items.length, issued_at: issuedAt }).select('quote_number,recipient_name,memo,items,totals,item_count,issued_at').single();
    if (error || !data) throw error || new Error('발행 이력 저장 결과가 없습니다.');
    return NextResponse.json({ issue: issueView(data, body.quoteId) });
  } catch (error) {
    console.error('[manager-quote-issues] issue failed', error);
    return NextResponse.json({ error: '견적서를 발행하지 못했습니다.' }, { status: 500 });
  }
}
