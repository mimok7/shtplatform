import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import supabase from '@/lib/supabase';

const spreadsheetId = process.env.GOOGLE_SHEETS_ID;

async function getGoogleSheetsClient() {
    const auth = new google.auth.GoogleAuth({
        credentials: {
            type: 'service_account',
            client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            private_key: process.env.GOOGLE_SERVICE_ACCOUNT_KEY?.replace(/\\n/g, '\n'),
        },
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    return google.sheets({ version: 'v4', auth });
}

const SHEET_MAPPINGS = {
    'SH_M': 'sh_m',
    'SH_R': 'sh_r',
    'SH_C': 'sh_c',
    'SH_CC': 'sh_cc',
    'SH_P': 'sh_p',
    'SH_H': 'sh_h',
    'SH_T': 'sh_t',
    'SH_RC': 'sh_rc',
};

async function fetchSheetData(sheets: any, sheetName: string) {
    try {
        const headerResponse = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `'${sheetName}'!1:1`,
        });
        const headers = headerResponse.data.values?.[0] || [];

        // 전체 데이터 가져오기 (범위 제한 제거 - 최대 100만 행)
        const dataResponse = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `'${sheetName}'!2:1000000`,
        });
        const rows = dataResponse.data.values || [];

        console.log(`📋 ${sheetName}: ${headers.length}개 컬럼, ${rows.length}개 행`);
        return { headers, rows };
    } catch (error) {
        console.error(`❌ ${sheetName} 데이터 가져오기 실패:`, error);
        return { headers: [], rows: [] };
    }
}

function sanitizeColumnName(header: string, index: number): string {
    if (!header || header.trim() === '') {
        return `col_${index}`;
    }

    const koreanMap: Record<string, string> = {
        '주문id': 'order_id',
        'id': 'sheet_id',
        'email': 'email',
        'adult': 'adult',
        'child': 'child',
        'toddler': 'toddler',
        'toodler': 'toddler',
        '예약일': 'reservation_date',
        '닉네임': 'nickname',
        '한글이름': 'korean_name',
        '영문이름': 'english_name',
        '여권번호': 'passport_number',
        '생년월일': 'birth_date',
        '성별': 'gender',
        '핸드폰': 'phone',
        '전화번호': 'phone',
        '이메일': 'email',
        '주소': 'address',
        '결제방법': 'payment_method',
        '결제방식': 'payment_method',
        '결제금액': 'payment_amount',
        '결제상태': 'payment_status',
        '입금액': 'deposit_amount',
        '잔금': 'balance_amount',
        '결제일': 'payment_date',
        '요청사항': 'request_note',
        '특이사항': 'special_note',
        '메모': 'memo',
        '상태': 'status',
        '크루즈': 'cruise_name',
        '크루즈명': 'cruise_name',
        '구분': 'division',
        '분류': 'category',
        '객실타입': 'room_type',
        '객실종류': 'room_type',
        '객실수': 'room_count',
        '체크인': 'checkin_date',
        '체크인날짜': 'checkin_date',
        '체크아웃': 'checkout_date',
        '체크아웃날짜': 'checkout_date',
        '박수': 'nights',
        '일정일수': 'schedule_days',
        '일정': 'schedule',
        '인원': 'guest_count',
        '인원수': 'guest_count',
        '성인인원': 'adult_count',
        '아동인원': 'child_count',
        '어린이인원': 'child_count',
        '투어인원': 'tour_count',
        '투숙인원': 'guest_count',
        '승선인원': 'boarding_count',
        '가격': 'price',
        '총금액': 'total_price',
        '금액': 'amount',
        '합계': 'total',
        '할인금액': 'discount_amount',
        '할인액': 'discount_amount',
        '할인코드': 'discount_code',
        '이용일': 'usage_date',
        '날짜': 'date',
        '일자': 'date',
        '시작일자': 'start_date',
        '종료일자': 'end_date',
        '승차일': 'boarding_date',
        '승차일자': 'boarding_date',
        '승차일시': 'boarding_datetime',
        '차량타입': 'vehicle_type',
        '차량': 'vehicle_type',
        '차량종류': 'vehicle_type',
        '차량수': 'vehicle_count',
        '차량대수': 'vehicle_count',
        '차량번호': 'vehicle_number',
        '차량코드': 'vehicle_code',
        '객실코드': 'room_code',
        '호텔코드': 'hotel_code',
        '투어코드': 'tour_code',
        '좌석번호': 'seat_number',
        '승차인원': 'passenger_count',
        '출발지': 'departure',
        '목적지': 'destination',
        '경로': 'route',
        '픽업': 'pickup_location',
        '픽업위치': 'pickup_location',
        '하차': 'dropoff_location',
        '하차위치': 'dropoff_location',
        '드랍위치': 'dropoff_location',
        '승차위치': 'boarding_location',
        '승차장소': 'boarding_location',
        '장소명': 'location_name',
        '시간': 'time',
        '승차시간': 'boarding_time',
        '승객수': 'passenger_count',
        '항공일': 'flight_date',
        '항공편': 'flight_number',
        '공항': 'airport_name',
        '공항명': 'airport_name',
        '호텔': 'hotel_name',
        '호텔명': 'hotel_name',
        '객실명': 'room_name',
        '투어': 'tour_name',
        '투어명': 'tour_name',
        '투어종류': 'tour_type',
        '수량': 'quantity',
        '상세구분': 'detail_category',
        '참가자': 'participant_count',
        '회원등급': 'member_grade',
        '이름': 'name',
        '만든사람': 'creator',
        '만든일시': 'created_at',
        '수정자': 'modifier',
        '수정일시': 'modified_at',
        '객실할인': 'room_discount',
        '비고': 'note',
        '객실비고': 'room_note',
        '투어비고': 'tour_note',
        '처리': 'processed',
        '처리일시': 'processed_at',
        '환율': 'exchange_rate',
        '미환율': 'usd_rate',
        'url': 'url',
        '요금제': 'plan',
        '카톡id': 'kakao_id',
        '단위': 'unit',
        '이관': 'migrated',
        '캐리어수량': 'carrier_count',
        '캐리어갯수': 'carrier_count',
        '경유지': 'stopover',
        '경유지대기시간': 'stopover_wait_time',
        '패스트': 'fast_service',
        '조식서비스': 'breakfast_service',
        '엑스트라베드': 'extra_bed',
        '배차': 'dispatch',
        '사용기간': 'usage_period',
        '보트': 'boat',
        '커넥팅룸': 'connecting_room',
        '승선도움': 'boarding_help',
    };

    const clean = header.trim().toLowerCase();
    if (koreanMap[clean]) return koreanMap[clean];

    let name = clean
        .replace(/[^a-z0-9가-힣\s]/g, '')
        .replace(/\s+/g, '_');

    if (/^\d/.test(name)) name = 'col_' + name;
    if (name.length > 63) name = name.substring(0, 63);

    return name || `col_${index}`;
}

// 날짜 형식 정규화 함수 (ISO 형식으로 통일)
function normalizeDateFormat(dateStr: string): string {
    if (!dateStr || typeof dateStr !== 'string') return dateStr;

    const trimmed = dateStr.trim();

    // 1. 이미 ISO 형식 (YYYY-MM-DD 또는 YYYY-MM-DD HH:mm:ss)
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
        return trimmed;
    }

    // 2. 한국식 (YYYY. M. D 또는 YYYY. MM. DD)
    const koreanMatch = trimmed.match(/^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/);
    if (koreanMatch) {
        const [, year, month, day] = koreanMatch;
        const isoDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        // 시간 정보가 있으면 유지
        const timeMatch = trimmed.match(/(\d{1,2}:\d{2}(?::\d{2})?)$/);
        return timeMatch ? `${isoDate} ${timeMatch[1]}` : isoDate;
    }

    // 3. 점 구분 공백 없음 (YYYY.MM.DD 또는 YYYY.M.D)
    const dotMatch = trimmed.match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})/);
    if (dotMatch) {
        const [, year, month, day] = dotMatch;
        const isoDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        const timeMatch = trimmed.match(/(\d{1,2}:\d{2}(?::\d{2})?)$/);
        return timeMatch ? `${isoDate} ${timeMatch[1]}` : isoDate;
    }

    // 4. 하이픈 형식 (YYYY-M-D)
    const hyphenMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (hyphenMatch) {
        const [, year, month, day] = hyphenMatch;
        const isoDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        const timeMatch = trimmed.match(/(\d{1,2}:\d{2}(?::\d{2})?)$/);
        return timeMatch ? `${isoDate} ${timeMatch[1]}` : isoDate;
    }

    // 5. 슬래시 형식 (YYYY/MM/DD 또는 YYYY/M/D)
    const slashMatch = trimmed.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
    if (slashMatch) {
        const [, year, month, day] = slashMatch;
        const isoDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        const timeMatch = trimmed.match(/(\d{1,2}:\d{2}(?::\d{2})?)$/);
        return timeMatch ? `${isoDate} ${timeMatch[1]}` : isoDate;
    }

    // 변환 실패시 원본 반환
    return dateStr;
}

// 날짜 컬럼 목록 (자동 변환 대상)
const DATE_COLUMNS = [
    'checkin_date',
    'checkout_date',
    'boarding_date',
    'boarding_datetime',
    'date',
    'start_date',
    'end_date',
    'reservation_date',
    'payment_date',
    'birth_date',
    'flight_date',
    'usage_date',
    'created_at',
    'modified_at',
    'processed_at'
];

function rowToObject(row: any[], columnNames: string[]): Record<string, any> {
    const obj: Record<string, any> = {
        synced_at: new Date().toISOString(),
    };

    columnNames.forEach((colName, index) => {
        const value = row[index];
        if (value !== undefined && value !== null && value !== '') {
            let processedValue = String(value).trim();

            // 날짜 컬럼이면 자동으로 ISO 형식으로 변환
            if (DATE_COLUMNS.includes(colName)) {
                processedValue = normalizeDateFormat(processedValue);
            }

            obj[colName] = processedValue;
        }
    });

    return obj;
}

async function syncToSupabase(tableName: string, data: any[]) {
    if (data.length === 0) {
        console.log(`⚠️ ${tableName}: 동기화할 데이터 없음`);
        return { success: true, count: 0 };
    }

    try {
        console.log(`🔄 ${tableName}: ${data.length}건 삽입 준비...`);

        await supabase.from(tableName).delete().gte('id', 0);

        const batchSize = 100;
        let totalInserted = 0;

        for (let i = 0; i < data.length; i += batchSize) {
            const batch = data.slice(i, i + batchSize);
            const { error } = await supabase.from(tableName).insert(batch);

            if (error) {
                console.error(`❌ ${tableName} 삽입 실패:`, error);
                return { success: false, error: error.message };
            }

            totalInserted += batch.length;
        }

        console.log(`✅ ${tableName}: ${totalInserted}건 완료`);
        return { success: true, count: totalInserted };
    } catch (error: any) {
        console.error(`❌ ${tableName} 오류:`, error);
        return { success: false, error: error.message };
    }
}

function generateSQL(tableName: string, columnNames: string[]): string {
    const columns = columnNames
        .filter(col => col !== 'synced_at')
        .map(col => `    ${col} TEXT`);

    return `
DROP TABLE IF EXISTS ${tableName};
CREATE TABLE ${tableName} (
    id SERIAL PRIMARY KEY,
${columns.join(',\n')},
    synced_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_${tableName}_order_id ON ${tableName}(order_id);
`.trim();
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const action = searchParams.get('action') || 'sync';
        const sheetFilter = searchParams.get('sheet');

        if (!spreadsheetId) {
            return NextResponse.json(
                { success: false, error: 'Google Sheets ID 미설정' },
                { status: 500 }
            );
        }

        const sheets = await getGoogleSheetsClient();

        // SQL 생성
        if (action === 'generate-sql') {
            const sqlStatements: string[] = [];

            for (const [sheetName, tableName] of Object.entries(SHEET_MAPPINGS)) {
                const { headers } = await fetchSheetData(sheets, sheetName);
                if (headers.length === 0) continue;

                const columnNames = headers.map((h, i) => sanitizeColumnName(h, i));
                sqlStatements.push(generateSQL(tableName, columnNames));
            }

            return NextResponse.json({
                success: true,
                sql: sqlStatements.join('\n\n'),
                message: 'SQL 생성 완료',
            });
        }

        // 데이터 동기화
        const sheetsToSync = sheetFilter
            ? { [sheetFilter]: SHEET_MAPPINGS[sheetFilter as keyof typeof SHEET_MAPPINGS] }
            : SHEET_MAPPINGS;

        const results: Record<string, any> = {};

        for (const [sheetName, tableName] of Object.entries(sheetsToSync)) {
            if (!tableName) continue;

            console.log(`\n🔄 ${sheetName} → ${tableName} 동기화...`);

            const { headers, rows } = await fetchSheetData(sheets, sheetName);
            const columnNames = headers.map((h, i) => sanitizeColumnName(h, i));

            const data = rows
                .map(row => rowToObject(row, columnNames))
                .filter(obj => obj.order_id || obj.sheet_id);

            console.log(`✅ ${data.length}건 유효 데이터`);

            const result = await syncToSupabase(tableName, data);
            results[sheetName] = {
                tableName,
                rowCount: rows.length,
                validCount: data.length,
                ...result,
            };
        }

        return NextResponse.json({
            success: true,
            results,
            timestamp: new Date().toISOString(),
        });

    } catch (error: any) {
        console.error('❌ 동기화 오류:', error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}

export async function POST(request: Request) {
    return GET(request);
}
