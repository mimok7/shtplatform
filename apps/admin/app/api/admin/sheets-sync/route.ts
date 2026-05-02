import { NextRequest, NextResponse } from 'next/server';
import { google, sheets_v4 } from 'googleapis';
import serviceSupabase from '@/lib/serviceSupabase';
import { checkAdmin, fetchAll } from '@/lib/exportAuth';

export const runtime = 'nodejs';
export const maxDuration = 300;

type SheetMatrix = { title: string; rows: any[]; headers: string[] };

const RELATION_HEADERS = ['시트', '표시 목적', '주요 키', '연결 대상', '사용 예시'];
const STATUS_HEADERS = ['항목', '값'];
const RESERVATION_SUMMARY_HEADERS = [
  '예약ID', '주문번호', '예약자ID', '예약자명', '이메일', '연락처', '서비스', '상태', '결제상태', '예약일', '생성일', '총금액', '결제금액',
  '크루즈체크인', '객실가격코드', '인원', '성인', '아동', '유아', '요청사항', '견적ID',
];
const CRUISE_RESERVATION_HEADERS = [
  '예약ID', '주문번호', '예약자명', '이메일', '예약상태', '결제상태', '체크인', '객실가격코드', '크루즈명', '일정', '객실명', '시즌',
  '성인가', '아동가', '유아가', '싱글차지', '엑스트라베드', '예약단가', '객실합계', '총금액', '포함차량', '차량종류',
  '객실면적', '객실설명', '포함사항', '불포함사항', '취소규정', '요청사항',
];
const CRUISE_GUIDE_HEADERS = [
  '가격코드', '크루즈명', '일정', '객실명', '영문객실명', '시즌', '적용시작', '적용종료', '연도', '통화', '성인가', '아동가',
  '아동엑스트라베드', '유아가', '싱글차지', '성인엑스트라베드', '차량포함', '차량종류', '객실면적', '최대성인', '최대인원',
  '발코니', '추천', '객실설명', '포함사항', '불포함사항', '취소규정', '안내메모',
];
const USER_HEADERS = ['예약자ID', '예약자명', '이메일', '연락처', '역할', '가입일', '예약건수'];
const DEFAULT_SERVICE_ACCOUNT_EMAIL = 'sheets-importer@cruise-7683b.iam.gserviceaccount.com';

function getSpreadsheetId(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  return searchParams.get('spreadsheetId') || process.env.GOOGLE_SHEETS_SPREADSHEET_ID || process.env.GOOGLE_SPREADSHEET_ID || '';
}

function getServiceAccount() {
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GCP_SA_KEY || '';
  if (json) {
    try {
      const parsed = JSON.parse(json);
      return {
        clientEmail: parsed.client_email || '',
        privateKey: parsed.private_key || '',
      };
    } catch {
      return {
        clientEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || process.env.GOOGLE_CLIENT_EMAIL || DEFAULT_SERVICE_ACCOUNT_EMAIL,
        privateKey: (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
      };
    }
  }

  return {
    clientEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || process.env.GOOGLE_CLIENT_EMAIL || DEFAULT_SERVICE_ACCOUNT_EMAIL,
    privateKey: (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  };
}

function envStatus(req: NextRequest) {
  const spreadsheetId = getSpreadsheetId(req);
  const serviceAccount = getServiceAccount();
  return {
    supabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    serviceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    googleSpreadsheetId: Boolean(spreadsheetId),
    googleServiceAccount: Boolean(serviceAccount.clientEmail && serviceAccount.privateKey),
    spreadsheetId: spreadsheetId ? `${spreadsheetId.slice(0, 8)}...` : '',
    serviceAccountEmail: serviceAccount.clientEmail || '',
  };
}

function getSheetsClient() {
  const serviceAccount = getServiceAccount();
  if (!serviceAccount.clientEmail || !serviceAccount.privateKey) {
    throw new Error('Google 서비스 계정 환경변수가 필요합니다. GOOGLE_SERVICE_ACCOUNT_JSON 또는 GOOGLE_SERVICE_ACCOUNT_EMAIL/GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY를 설정하세요.');
  }

  const auth = new google.auth.JWT({
    email: serviceAccount.clientEmail,
    key: serviceAccount.privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return google.sheets({ version: 'v4', auth });
}

function text(value: any) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return value;
}

function rowFromHeaders(row: Record<string, any>, headers: string[]) {
  return headers.map((header) => text(row[header]));
}

function asMap(rows: any[], key: string) {
  const map = new Map<string, any>();
  rows.forEach((row) => {
    const value = row?.[key];
    if (value) map.set(String(value), row);
  });
  return map;
}

function userLabel(user: any) {
  return user?.name || user?.nickname || user?.email || '';
}

async function safeFetch(table: string, filterFn?: (q: any) => any) {
  try {
    return await fetchAll(table, filterFn);
  } catch (error) {
    console.warn(`Sheets sync skip ${table}:`, error);
    return [];
  }
}

function createReservationSummary(reservations: any[], usersById: Map<string, any>, cruiseByReservationId: Map<string, any>) {
  return reservations.map((reservation) => {
    const user = usersById.get(String(reservation.re_user_id || '')) || {};
    const cruise = cruiseByReservationId.get(String(reservation.re_id || '')) || {};
    return {
      예약ID: reservation.re_id,
      주문번호: reservation.order_id,
      예약자ID: reservation.re_user_id,
      예약자명: userLabel(user),
      이메일: user.email,
      연락처: user.phone || user.mobile || user.tel,
      서비스: reservation.re_type,
      상태: reservation.re_status,
      결제상태: reservation.payment_status,
      예약일: reservation.reservation_date,
      생성일: reservation.re_created_at,
      총금액: reservation.total_amount,
      결제금액: reservation.paid_amount,
      크루즈체크인: cruise.checkin,
      객실가격코드: cruise.room_price_code,
      인원: reservation.pax_count || cruise.guest_count,
      성인: reservation.re_adult_count || cruise.adult_count,
      아동: reservation.re_child_count || cruise.child_count,
      유아: reservation.re_infant_count || cruise.infant_count,
      요청사항: cruise.request_note || reservation.manager_note,
      견적ID: reservation.re_quote_id,
    };
  });
}

function createCruiseReservationRows(
  reservations: any[],
  usersById: Map<string, any>,
  cruiseReservations: any[],
  ratesById: Map<string, any>,
  ratesByNameRoom: Map<string, any>,
  infosByNameRoom: Map<string, any>
) {
  const reservationsById = asMap(reservations, 're_id');
  return cruiseReservations.map((cruise) => {
    const reservation = reservationsById.get(String(cruise.reservation_id || '')) || {};
    const user = usersById.get(String(reservation.re_user_id || '')) || {};
    const directRate = ratesById.get(String(cruise.room_price_code || '')) || {};
    const fallbackKey = `${directRate.cruise_name || ''}::${directRate.room_type || cruise.room_price_code || ''}`;
    const rate = directRate.id ? directRate : (ratesByNameRoom.get(fallbackKey) || {});
    const info = infosByNameRoom.get(`${rate.cruise_name || ''}::${rate.room_type || ''}`) || {};
    return {
      예약ID: reservation.re_id,
      주문번호: reservation.order_id,
      예약자명: userLabel(user),
      이메일: user.email,
      예약상태: reservation.re_status,
      결제상태: reservation.payment_status,
      체크인: cruise.checkin,
      객실가격코드: cruise.room_price_code,
      크루즈명: rate.cruise_name || info.cruise_name,
      일정: rate.schedule_type,
      객실명: rate.room_type || info.room_name,
      시즌: rate.season_name,
      성인가: rate.price_adult,
      아동가: rate.price_child,
      유아가: rate.price_infant,
      싱글차지: rate.price_single,
      엑스트라베드: rate.price_extra_bed,
      예약단가: cruise.unit_price,
      객실합계: cruise.room_total_price,
      총금액: reservation.total_amount,
      포함차량: rate.includes_vehicle,
      차량종류: rate.vehicle_type,
      객실면적: info.room_area,
      객실설명: info.room_description,
      포함사항: info.inclusions,
      불포함사항: info.exclusions,
      취소규정: info.cancellation_policy,
      요청사항: cruise.request_note,
    };
  });
}

function createCruiseGuideRows(rates: any[], infosByNameRoom: Map<string, any>, inclusionsByRateId: Map<string, any[]>) {
  return rates.map((rate) => {
    const info = infosByNameRoom.get(`${rate.cruise_name || ''}::${rate.room_type || ''}`) || {};
    const inclusions = (inclusionsByRateId.get(String(rate.id || '')) || [])
      .map((row) => row.inclusion_text)
      .filter(Boolean)
      .join('\n');
    return {
      가격코드: rate.id,
      크루즈명: rate.cruise_name,
      일정: rate.schedule_type,
      객실명: rate.room_type,
      영문객실명: rate.room_type_en,
      시즌: rate.season_name,
      적용시작: rate.valid_from,
      적용종료: rate.valid_to,
      연도: rate.valid_year,
      통화: rate.currency,
      성인가: rate.price_adult,
      아동가: rate.price_child,
      아동엑스트라베드: rate.price_child_extra_bed,
      유아가: rate.price_infant,
      싱글차지: rate.price_single,
      성인엑스트라베드: rate.price_extra_bed,
      차량포함: rate.includes_vehicle,
      차량종류: rate.vehicle_type,
      객실면적: info.room_area,
      최대성인: info.max_adults,
      최대인원: info.max_guests,
      발코니: info.has_balcony,
      추천: info.is_recommended,
      객실설명: info.room_description,
      포함사항: inclusions || info.inclusions,
      불포함사항: info.exclusions,
      취소규정: info.cancellation_policy,
      안내메모: rate.notes || info.warnings,
    };
  });
}

async function buildSheets(): Promise<SheetMatrix[]> {
  if (!serviceSupabase) throw new Error('SUPABASE_SERVICE_ROLE_KEY 미설정');

  const [reservations, users, cruiseReservations, cruiseRates, cruiseInfos, cruiseInclusions] = await Promise.all([
    safeFetch('reservation', (q) => q.order('re_created_at', { ascending: false })),
    safeFetch('users'),
    safeFetch('reservation_cruise'),
    safeFetch('cruise_rate_card', (q) => q.eq('is_active', true).order('cruise_name').order('display_order')),
    safeFetch('cruise_info', (q) => q.order('display_order')),
    safeFetch('cruise_rate_card_inclusions', (q) => q.order('display_order')),
  ]);

  const usersById = asMap(users, 'id');
  const cruiseByReservationId = asMap(cruiseReservations, 'reservation_id');
  const ratesById = asMap(cruiseRates, 'id');
  const ratesByNameRoom = new Map<string, any>();
  cruiseRates.forEach((rate) => ratesByNameRoom.set(`${rate.cruise_name || ''}::${rate.room_type || ''}`, rate));

  const infosByNameRoom = new Map<string, any>();
  cruiseInfos.forEach((info) => {
    infosByNameRoom.set(`${info.cruise_name || info.name || ''}::${info.room_name || info.room_type || ''}`, info);
  });

  const inclusionsByRateId = new Map<string, any[]>();
  cruiseInclusions.forEach((row) => {
    const key = String(row.rate_card_id || '');
    if (!inclusionsByRateId.has(key)) inclusionsByRateId.set(key, []);
    inclusionsByRateId.get(key)?.push(row);
  });

  const reservationSummary = createReservationSummary(reservations, usersById, cruiseByReservationId);
  const cruiseReservationRows = createCruiseReservationRows(reservations, usersById, cruiseReservations, ratesById, ratesByNameRoom, infosByNameRoom);
  const cruiseGuideRows = createCruiseGuideRows(cruiseRates, infosByNameRoom, inclusionsByRateId);
  const reservationCountsByUserId = reservations.reduce((map, reservation) => {
    const key = String(reservation.re_user_id || '');
    if (key) map.set(key, (map.get(key) || 0) + 1);
    return map;
  }, new Map<string, number>());

  const userRows = users.map((user) => ({
    예약자ID: user.id,
    예약자명: userLabel(user),
    이메일: user.email,
    연락처: user.phone || user.mobile || user.tel,
    역할: user.role,
    가입일: user.created_at,
    예약건수: reservationCountsByUserId.get(String(user.id || '')) || 0,
  }));

  const relationRows = [
    { 시트: '예약자별_예약조회', '표시 목적': '예약자가 예약한 내용을 바로 조회', '주요 키': '예약자ID, 예약ID, 주문번호', '연결 대상': 'users.id -> reservation.re_user_id -> reservation_cruise.reservation_id', '사용 예시': '이메일/예약자명으로 필터 후 예약 상태와 금액 확인' },
    { 시트: '크루즈예약_상세', '표시 목적': '크루즈 예약과 가격/안내를 함께 조회', '주요 키': '예약ID, 객실가격코드', '연결 대상': 'reservation.re_id -> reservation_cruise.reservation_id -> cruise_rate_card.id', '사용 예시': '예약 객실의 성인가/포함사항/요청사항 확인' },
    { 시트: '크루즈가격_안내', '표시 목적': '크루즈 가격표와 객실 안내 조회', '주요 키': '가격코드, 크루즈명, 객실명', '연결 대상': 'cruise_rate_card + cruise_info + cruise_rate_card_inclusions', '사용 예시': '상담 중 크루즈명/일정/객실명 필터로 안내' },
    { 시트: '예약자_목록', '표시 목적': '예약자 마스터', '주요 키': '예약자ID', '연결 대상': 'users.id', '사용 예시': '예약자별 예약건수 확인' },
  ];

  const statusRows = [
    { 항목: '동기화시각', 값: new Date().toISOString() },
    { 항목: '예약건수', 값: reservations.length },
    { 항목: '예약자건수', 값: users.length },
    { 항목: '크루즈예약건수', 값: cruiseReservations.length },
    { 항목: '크루즈가격건수', 값: cruiseRates.length },
    { 항목: '크루즈안내건수', 값: cruiseInfos.length },
  ];

  return [
    { title: '동기화_상태', rows: statusRows, headers: STATUS_HEADERS },
    { title: '관계_매핑', rows: relationRows, headers: RELATION_HEADERS },
    { title: '예약자별_예약조회', rows: reservationSummary, headers: RESERVATION_SUMMARY_HEADERS },
    { title: '크루즈예약_상세', rows: cruiseReservationRows, headers: CRUISE_RESERVATION_HEADERS },
    { title: '크루즈가격_안내', rows: cruiseGuideRows, headers: CRUISE_GUIDE_HEADERS },
    { title: '예약자_목록', rows: userRows, headers: USER_HEADERS },
  ];
}

async function ensureSheets(sheets: sheets_v4.Sheets, spreadsheetId: string, titles: string[]) {
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
  const existing = new Set((spreadsheet.data.sheets || []).map((sheet) => sheet.properties?.title).filter(Boolean) as string[]);
  const requests = titles
    .filter((title) => !existing.has(title))
    .map((title) => ({ addSheet: { properties: { title, gridProperties: { frozenRowCount: 1 } } } }));

  if (requests.length > 0) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
  }
}

async function writeSheet(sheets: sheets_v4.Sheets, spreadsheetId: string, matrix: SheetMatrix) {
  const values = [matrix.headers, ...matrix.rows.map((row) => rowFromHeaders(row, matrix.headers))];
  await sheets.spreadsheets.values.clear({ spreadsheetId, range: `'${matrix.title}'` });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${matrix.title}'!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: values.length ? values : [['데이터 없음']] },
  });
}

export async function GET(req: NextRequest) {
  const auth = await checkAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  return NextResponse.json({ ok: true, env: envStatus(req) });
}

export async function POST(req: NextRequest) {
  const auth = await checkAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const spreadsheetId = getSpreadsheetId(req);
  if (!spreadsheetId) {
    return NextResponse.json({ error: 'GOOGLE_SHEETS_SPREADSHEET_ID가 필요합니다.' }, { status: 400 });
  }

  try {
    const sheetMatrices = await buildSheets();
    const sheets = getSheetsClient();
    await ensureSheets(sheets, spreadsheetId, sheetMatrices.map((sheet) => sheet.title));
    for (const sheet of sheetMatrices) {
      await writeSheet(sheets, spreadsheetId, sheet);
    }

    return NextResponse.json({
      ok: true,
      syncedAt: new Date().toISOString(),
      spreadsheetId,
      sheets: sheetMatrices.map((sheet) => ({ title: sheet.title, rows: sheet.rows.length, columns: sheet.headers.length })),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || String(error), env: envStatus(req) }, { status: 500 });
  }
}
