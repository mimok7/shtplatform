// 1단계: 크루즈 시트 → 예약 테이블 생성 스크립트
// 사용자별로 크루즈 예약을 생성 (견적ID 없이, 타입은 'cruise')

const { GoogleAuth } = require('google-auth-library');
const { google } = require('googleapis');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const dotenv = require('dotenv');
const crypto = require('crypto');

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

// 사용자 이메일로 사용자 ID 찾기
async function findUserByEmail(email) {
    if (!email) return null;

    const { data: user, error } = await supabase
        .from('users')
        .select('id, email, name')
        .eq('email', email.toLowerCase().trim())
        .single();

    if (error || !user) {
        return null;
    }

    return user;
}

// UUID 생성 함수
function generateUUID() {
    return crypto.randomUUID();
}

async function main() {
    console.log('🚀 크루즈 예약 1단계: 예약 테이블 생성 시작');

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
    const nameIdx = header.findIndex(h => /^(이름|name)$/i.test(h));
    const phoneIdx = header.findIndex(h => /^(전화번호|phone|핸드폰|휴대폰)$/i.test(h));
    const checkinIdx = header.findIndex(h => /^(체크인|checkin|check.*in)$/i.test(h));
    const guestCountIdx = header.findIndex(h => /^(인원수|승선인원|guest.*count|인원)$/i.test(h));
    const requestNoteIdx = header.findIndex(h => /^(요청사항|request|note|비고)$/i.test(h));

    if (emailIdx === -1) {
        console.error('❌ 이메일 컬럼을 찾을 수 없습니다.');
        return;
    }

    console.log(`✅ 컬럼 매핑: 이메일=${emailIdx}, 이름=${nameIdx}`);
    console.log(`   추가 정보: 체크인=${checkinIdx}, 인원수=${guestCountIdx}, 요청사항=${requestNoteIdx}`);

    // 4. 기존 예약 확인 (이메일 기반)
    const { data: existingReservations, error: reservationError } = await supabase
        .from('reservation')
        .select('re_id, contact_email, applicant_email')
        .eq('re_type', 'cruise');

    if (reservationError) {
        console.error('❌ 기존 예약 조회 실패:', reservationError.message);
        return;
    }

    const existingEmails = new Set();
    existingReservations.forEach(r => {
        if (r.contact_email) existingEmails.add(r.contact_email.toLowerCase().trim());
        if (r.applicant_email) existingEmails.add(r.applicant_email.toLowerCase().trim());
    });
    console.log(`📋 기존 크루즈 예약: ${existingReservations.length}건 (이메일 ${existingEmails.size}개)`);

    // 5. 크루즈 예약 생성
    let success = 0, skipped = 0, failed = 0;

    for (const [rowIdx, row] of rows.entries()) {
        const email = emailIdx >= 0 ? (row[emailIdx] || '').trim() : '';
        const name = nameIdx >= 0 ? (row[nameIdx] || '').trim() : '';
        const phone = phoneIdx >= 0 ? (row[phoneIdx] || '').trim() : '';
        const checkin = checkinIdx >= 0 ? (row[checkinIdx] || '').trim() : '';
        const guestCount = guestCountIdx >= 0 ? (row[guestCountIdx] || '').trim() : '';
        const requestNote = requestNoteIdx >= 0 ? (row[requestNoteIdx] || '').trim() : '';

        console.log(`\n처리 중 [${rowIdx + 1}]: 이메일=${email}, 이름=${name}`);

        if (!email) {
            console.log(`SKIP: 이메일 없음`);
            skipped++;
            continue;
        }

        // 이미 존재하는 예약인지 확인 (이메일 기반)
        if (existingEmails.has(email.toLowerCase().trim())) {
            console.log(`SKIP: 이미 존재하는 예약 - ${email}`);
            skipped++;
            continue;
        }

        // 사용자 찾기
        let userId = null;
        if (email) {
            const user = await findUserByEmail(email);
            if (user) {
                userId = user.id;
                console.log(`✅ 사용자 발견: ${user.name} (${user.email})`);
            } else {
                console.log(`⚠️ 사용자 미발견: ${email}`);
            }
        }

        // 날짜 파싱
        let parsedCheckin = null;
        if (checkin) {
            try {
                // 다양한 날짜 형식 지원
                let dateStr = checkin.trim();
                if (dateStr.match(/^\d{4}[-./]\d{1,2}[-./]\d{1,2}$/)) {
                    const parts = dateStr.split(/[-./]/);
                    parsedCheckin = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;

                    // 유효성 검증
                    const testDate = new Date(parsedCheckin);
                    if (isNaN(testDate.getTime())) {
                        parsedCheckin = null;
                        console.log(`⚠️ 잘못된 체크인 날짜: ${checkin}`);
                    } else {
                        console.log(`📅 체크인 날짜: ${parsedCheckin}`);
                    }
                }
            } catch (e) {
                console.log(`⚠️ 날짜 파싱 실패: ${checkin}`);
            }
        }

        try {
            // 예약 데이터 생성
            const reservationData = {
                // re_id는 자동 생성되는 UUID이므로 제거
                re_user_id: userId, // 사용자ID (없으면 null)
                re_quote_id: null, // 견적ID 없이 생성
                re_type: 'cruise', // 크루즈 타입
                re_status: 'pending', // 기본 상태
                contact_name: name || null,
                contact_phone: phone || null,
                contact_email: email || null,
                applicant_name: name || null,
                applicant_email: email || null,
                applicant_phone: phone || null,
                application_datetime: new Date().toISOString(),
                special_requests: requestNote || null // 요청사항만 저장
            };

            console.log(`📝 예약 데이터:`, {
                re_user_id: reservationData.re_user_id ? '✅' : '❌',
                re_type: reservationData.re_type,
                contact_name: reservationData.contact_name,
                contact_email: reservationData.contact_email
            });

            // 예약 테이블에 저장
            const { data, error } = await supabase
                .from('reservation')
                .insert(reservationData)
                .select()
                .single();

            if (error) {
                console.error(`FAIL: ${email} - ${error.message}`);
                failed++;
            } else {
                console.log(`✅ OK: ${email} 예약 생성 성공`);
                success++;
            }

        } catch (e) {
            console.error(`❌ 예외 발생: ${email} - ${e.message}`);
            failed++;
        }

        // API 호출 제한 방지
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log('\n🎉 크루즈 예약 1단계 완료:');
    console.log(`✅ 성공: ${success}건`);
    console.log(`⏭️  건너뜀: ${skipped}건`);
    console.log(`❌ 실패: ${failed}건`);
    console.log(`📊 총 처리: ${success + skipped + failed}건`);

    if (success > 0) {
        console.log('\n🎯 다음 단계: 예약 크루즈 상세 데이터를 업로드할 수 있습니다.');
        console.log('💡 명령어: node ./utils/import-cruise-details.js');
    }
}

main().catch(console.error);
