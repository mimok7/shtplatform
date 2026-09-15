// 고객명으로 예약 상태 처리 이력을 조회하는 관리자 API.
import { NextRequest, NextResponse } from 'next/server';
import serviceSupabase from '@/lib/serviceSupabase';

export const dynamic = 'force-dynamic';

async function authenticateAdmin(request: NextRequest) {
  if (!serviceSupabase) {
    return { ok: false as const, error: '서버 설정 오류', status: 500 };
  }

  const authorization = request.headers.get('authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!token) return { ok: false as const, error: '인증 필요', status: 401 };

  const { data: authData, error: authError } = await serviceSupabase.auth.getUser(token);
  if (authError || !authData.user) return { ok: false as const, error: '인증 실패', status: 401 };

  const { data: profile, error: profileError } = await serviceSupabase
    .from('users')
    .select('role')
    .eq('id', authData.user.id)
    .maybeSingle();
  if (profileError || profile?.role !== 'admin') return { ok: false as const, error: '관리자 권한이 필요합니다.', status: 403 };

  return { ok: true as const };
}

export async function GET(request: NextRequest) {
  const auth = await authenticateAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const customerName = (request.nextUrl.searchParams.get('customerName') || '').trim().slice(0, 80);
  if (!customerName) return NextResponse.json({ error: '고객명을 입력해 주세요.' }, { status: 400 });

  const { data: customers, error: customerError } = await serviceSupabase!
    .from('users')
    .select('id,name,email')
    .ilike('name', `%${customerName}%`)
    .order('name')
    .limit(50);
  if (customerError) {
    console.error('[admin-reservation-status-handlers] customer read failed', customerError.message);
    return NextResponse.json({ error: '고객 정보를 불러오지 못했습니다.' }, { status: 500 });
  }

  const customerRows = customers || [];
  const customerIds = customerRows.map((customer: any) => customer.id).filter(Boolean);
  if (!customerIds.length) return NextResponse.json({ customers: [], histories: [] });

  const { data: reservations, error: reservationError } = await serviceSupabase!
    .from('reservation')
    .select('re_id,re_user_id,re_type,re_status,re_created_at,re_update_at')
    .in('re_user_id', customerIds)
    .order('re_created_at', { ascending: false })
    .limit(500);
  if (reservationError) {
    console.error('[admin-reservation-status-handlers] reservation read failed', reservationError.message);
    return NextResponse.json({ error: '예약 정보를 불러오지 못했습니다.' }, { status: 500 });
  }

  const reservationRows = reservations || [];
  const reservationIds = reservationRows.map((reservation: any) => reservation.re_id).filter(Boolean);
  if (!reservationIds.length) return NextResponse.json({ customers: customerRows, histories: [] });

  const { data: statusLogs, error: statusLogError } = await serviceSupabase!
    .from('reservation_status_log')
    .select('id,reservation_id,re_type,prev_status,new_status,changed_by,changed_by_email,changed_at,note')
    .in('reservation_id', reservationIds)
    .order('changed_at', { ascending: false })
    .limit(1000);
  if (statusLogError) {
    console.error('[admin-reservation-status-handlers] status log read failed', statusLogError.message);
    return NextResponse.json({ error: '상태 처리 이력을 불러오지 못했습니다.' }, { status: 500 });
  }

  const statusLogRows = statusLogs || [];
  const processorIds = Array.from(new Set(statusLogRows.map((log: any) => log.changed_by).filter(Boolean)));
  const { data: processors, error: processorError } = processorIds.length
    ? await serviceSupabase!.from('users').select('id,name,english_name,email').in('id', processorIds)
    : { data: [], error: null };
  if (processorError) {
    console.error('[admin-reservation-status-handlers] processor read failed', processorError.message);
    return NextResponse.json({ error: '처리자 정보를 불러오지 못했습니다.' }, { status: 500 });
  }

  const customerById = new Map(customerRows.map((customer: any) => [customer.id, customer]));
  const reservationById = new Map(reservationRows.map((reservation: any) => [reservation.re_id, reservation]));
  const processorById = new Map((processors || []).map((processor: any) => [processor.id, processor]));
  const histories = statusLogRows.map((log: any) => {
    const reservation = reservationById.get(log.reservation_id);
    const customer = reservation ? customerById.get(reservation.re_user_id) : null;
    const processor = log.changed_by ? processorById.get(log.changed_by) : null;
    return {
      id: log.id,
      reservationId: log.reservation_id,
      customerName: customer?.name || '고객 정보 없음',
      customerEmail: customer?.email || '',
      reservationType: reservation?.re_type || log.re_type || '',
      currentStatus: reservation?.re_status || '',
      previousStatus: log.prev_status || '',
      nextStatus: log.new_status || '',
      processorName: processor?.name || processor?.english_name || log.changed_by_email || '시스템',
      processorEmail: processor?.email || log.changed_by_email || '',
      changedAt: log.changed_at,
      note: log.note || '',
    };
  });

  return NextResponse.json({ customers: customerRows, histories });
}
