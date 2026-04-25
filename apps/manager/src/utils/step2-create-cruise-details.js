// 2단계: 크루즈 시트 → 예약 크루즈 상세 테이블 생성 스크립트
// 기존 예약 테이블과 연결하여 크루즈 상세 정보 저장

const { GoogleAuth } = require('google-auth-library');
const { google } = require('googleapis');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const dotenv = require('dotenv');

try { dotenv.config({ path: path.join(process.cwd(), '.env.local') }); } catch { }
try { dotenv.config({ path: path.join(process.cwd(), '.env') }); } catch { }

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const GOOGLE_SHEETS_ID = process.env.GOOGLE_SHEETS_ID;
const GOOGLE_SERVICE_ACCOUNT = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const GOOGLE_SERVICE_KEY = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Missing SUPABASE env variables.');
    process.exit(1);
}
if (!GOOGLE_SHEETS_ID || !GOOGLE_SERVICE_ACCOUNT || !GOOGLE_SERVICE_KEY) {
    console.error('Missing Google Sheets env variables.');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function getSheetsClient() {
    const auth = new GoogleAuth({
        credentials: {
            client_email: GOOGLE_SERVICE_ACCOUNT,
            private_key: GOOGLE_SERVICE_KEY.replace(/\\n/g, '\n'),
        },
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    const authClient = await auth.getClient();
    return google.sheets({ version: 'v4', auth: authClient });
}

// 이메일로 예약 ID 찾기
async function findReservationByEmail(email) {
    if (!email) return null;

    console.log(`🔍 예약 검색 중: ${email}`);

    const { data: reservations, error } = await supabase
        .from('reservation')
        .select('re_id, contact_email, applicant_email')
        .eq('re_type', 'cruise')
        .or(`contact_email.eq.${email.toLowerCase().trim()},applicant_email.eq.${email.toLowerCase().trim()}`);

    if (error) {
        console.log(`❌ 예약 검색 오류: ${error.message}`);
        return null;
    }

    console.log(`📋 발견된 예약: ${reservations?.length || 0}건`);

    if (!reservations || reservations.length === 0) {
        return null;
    }

    // 첫 번째 예약 반환 (같은 이메일의 여러 예약 중 첫 번째)
    return reservations[0];
}

// 금액 파싱 함수
function parseAmount(amountStr) {
    if (!amountStr) return 0;

    // 문자열에서 숫자만 추출
    const numStr = String(amountStr).replace(/[^\d]/g, '');
    const amount = parseInt(numStr) || 0;

    return amount;
}

async function main() {
    console.log('🚀 크루즈 예약 2단계: 예약 크루즈 상세 테이블 생성 시작');

    // 1. 크루즈 시트에서 데이터 가져오기
    const sheets = await getSheetsClient();
    const sheetName = '크루즈';
    const range = `${sheetName}!A:Z`;

    console.log(`📋 구글시트 '${sheetName}' 탭에서 데이터 조회 중...`);
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: GOOGLE_SHEETS_ID,
        range
    });

    const values = res.data.values || [];
    if (values.length < 2) {
        console.error('❌ 크루즈 시트에 데이터가 없습니다.');
        return;
    }

    // 2. 헤더 분석
    const header = values[0].map((h) => String(h || '').trim());
    const rows = values.slice(1);

    console.log(`📊 헤더 분석: ${header.join(', ')}`);

    // 3. 컬럼 인덱스 찾기
    const emailIdx = header.findIndex(h => /^(이메일|email)$/i.test(h));
    const boardingCodeIdx = header.findIndex(h => /^(승선코드|boarding.*code|보딩.*코드)$/i.test(h));
    const guestCountIdx = header.findIndex(h => /^(인원수|승선인원|guest.*count|인원)$/i.test(h));
    const checkinIdx = header.findIndex(h => /^(체크인|checkin|check.*in)$/i.test(h));
    const amountIdx = header.findIndex(h => /^(금액|amount|price|단가)$/i.test(h));
    const roomCodeIdx = header.findIndex(h => /^(객실코드|room.*code)$/i.test(h));
    const boardingAssistIdx = header.findIndex(h => /^(승선도움|승선지원|boarding.*assist)$/i.test(h));

    if (emailIdx === -1) {
        console.error('❌ 이메일 컬럼을 찾을 수 없습니다.');
        return;
    }

    console.log(`✅ 컬럼 매핑:`);
    console.log(`   이메일=${emailIdx}, 승선코드=${boardingCodeIdx}, 인원수=${guestCountIdx}`);
    console.log(`   체크인=${checkinIdx}, 금액=${amountIdx}`);
    console.log(`   객실코드=${roomCodeIdx}, 승선도움=${boardingAssistIdx}`);

    // 3.1. 예약 테이블 상태 확인
    const { data: allReservations, error: reservationCheckError } = await supabase
        .from('reservation')
        .select('re_id, contact_email, applicant_email, re_type')
        .eq('re_type', 'cruise')
        .limit(5);

    if (reservationCheckError) {
        console.error('❌ 예약 테이블 확인 실패:', reservationCheckError.message);
        return;
    }

    console.log(`📋 예약 테이블 샘플 (${allReservations?.length || 0}건):`);
    allReservations?.forEach(r => {
        console.log(`   - ${r.re_id}: ${r.contact_email || r.applicant_email || 'NO_EMAIL'}`);
    });

    // 4. 기존 크루즈 상세 예약 확인
    const { data: existingCruiseReservations, error: cruiseError } = await supabase
        .from('reservation_cruise')
        .select('reservation_id');

    if (cruiseError) {
        console.error('❌ 기존 크루즈 상세 예약 조회 실패:', cruiseError.message);
        return;
    }

    const existingCruiseIds = new Set(existingCruiseReservations.map(r => r.reservation_id));
    console.log(`📋 기존 크루즈 상세 예약: ${existingCruiseReservations.length}건`);

    // 5. 크루즈 상세 예약 생성
    let success = 0, skipped = 0, failed = 0;

    for (const [rowIdx, row] of rows.entries()) {
        const email = emailIdx >= 0 ? (row[emailIdx] || '').trim() : '';
        const boardingCode = boardingCodeIdx >= 0 ? (row[boardingCodeIdx] || '').trim() : '';
        const guestCount = guestCountIdx >= 0 ? (row[guestCountIdx] || '').trim() : '';
        const checkin = checkinIdx >= 0 ? (row[checkinIdx] || '').trim() : '';
        const amount = amountIdx >= 0 ? (row[amountIdx] || '').trim() : '';
        const roomCode = roomCodeIdx >= 0 ? (row[roomCodeIdx] || '').trim() : '';
        const boardingAssist = boardingAssistIdx >= 0 ? (row[boardingAssistIdx] || '').trim() : '';

        console.log(`\n처리 중 [${rowIdx + 1}]: 이메일=${email}, 객실코드=${roomCode}, 인원수=${guestCount}`);

        if (!email) {
            console.log(`SKIP: 이메일 없음`);
            skipped++;
            continue;
        }

        // 예약 ID 찾기
        const reservation = await findReservationByEmail(email);
        if (!reservation) {
            console.log(`SKIP: 예약 없음 - ${email}`);
            skipped++;
            continue;
        }

        // 이미 존재하는 크루즈 상세 예약인지 확인
        if (existingCruiseIds.has(reservation.re_id)) {
            console.log(`SKIP: 이미 존재하는 크루즈 상세 예약 - ${reservation.re_id}`);
            skipped++;
            continue;
        }

        // 날짜 파싱 (체크인만)
        let parsedCheckin = null;

        if (checkin) {
            try {
                let dateStr = checkin.trim();
                if (dateStr.match(/^\d{4}[-./]\d{1,2}[-./]\d{1,2}$/)) {
                    const parts = dateStr.split(/[-./]/);
                    parsedCheckin = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;

                    const testDate = new Date(parsedCheckin);
                    if (isNaN(testDate.getTime())) {
                        parsedCheckin = null;
                        console.log(`⚠️ 잘못된 체크인 날짜: ${checkin}`);
                    } else {
                        console.log(`📅 체크인 날짜: ${parsedCheckin}`);
                    }
                }
            } catch (e) {
                console.log(`⚠️ 체크인 날짜 파싱 실패: ${checkin}`);
            }
        }

        // 금액 파싱
        const parsedAmount = parseAmount(amount);
        console.log(`💰 파싱된 금액: ${parsedAmount}원`);

        // 인원수 파싱
        const parsedGuestCount = parseInt(guestCount) || 0;

        try {
            // 크루즈 상세 예약 데이터 생성 (실제 DB 스키마에 맞게)
            const cruiseData = {
                reservation_id: reservation.re_id, // 예약 테이블의 re_id를 연결
                room_price_code: roomCode || null, // 객실코드 → room_price_code
                boarding_code: boardingCode || null, // 승선코드 → boarding_code (별도 컬럼)
                guest_count: parsedGuestCount, // 인원수
                checkin: parsedCheckin, // 체크인 날짜
                unit_price: parsedAmount, // 단가 (금액)
                room_total_price: parsedAmount, // 총 금액 (단가와 동일)
                boarding_assist: boardingAssist ? 'Y' : 'N', // 승선도움 Y/N 값으로 변경
                request_note: null // 기본값
            };

            console.log(`📝 크루즈 상세 데이터:`, {
                reservation_id: cruiseData.reservation_id,
                room_price_code: cruiseData.room_price_code,
                boarding_code: cruiseData.boarding_code,
                guest_count: cruiseData.guest_count,
                unit_price: cruiseData.unit_price,
                boarding_assist: cruiseData.boarding_assist
            });

            // 크루즈 상세 예약 테이블에 저장
            const { data, error } = await supabase
                .from('reservation_cruise')
                .insert(cruiseData)
                .select()
                .single();

            if (error) {
                console.error(`FAIL: ${email} - ${error.message}`);
                failed++;
            } else {
                console.log(`✅ OK: ${email} 크루즈 상세 예약 생성 성공`);
                success++;
            }

        } catch (e) {
            console.error(`❌ 예외 발생: ${email} - ${e.message}`);
            failed++;
        }

        // API 호출 제한 방지
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log('\n🎉 크루즈 예약 2단계 완료:');
    console.log(`✅ 성공: ${success}건`);
    console.log(`⏭️  건너뜀: ${skipped}건`);
    console.log(`❌ 실패: ${failed}건`);
    console.log(`📊 총 처리: ${success + skipped + failed}건`);

    if (success > 0) {
        console.log('\n🎯 다음 단계: 예약 크루즈 차량 및 SHT 차량 데이터를 업로드할 수 있습니다.');
        console.log('💡 명령어: node ./utils/step3-create-cruise-cars.js');
    }
}

main().catch(console.error);
