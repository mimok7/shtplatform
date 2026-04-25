// 2단계: Supabase Auth 사용자들을 users 테이블에 등록하는 스크립트
// 구글시트에서 이메일, 이름, 전화번호 등 추가 정보를 가져와서 users 테이블에 저장
// 권한은 모두 'member'로 설정

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

async function main() {
    console.log('🚀 2단계: Supabase Auth 사용자들을 users 테이블에 등록 시작');

    // 1. 구글시트에서 사용자 데이터 가져오기
    const sheets = await getSheetsClient();
    const sheetName = '사용자';
    const range = `${sheetName}!A:Z`;

    console.log(`📋 구글시트 '${sheetName}' 탭에서 데이터 조회 중...`);
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: GOOGLE_SHEETS_ID,
        range
    });

    const values = res.data.values || [];
    if (values.length < 2) {
        console.error('❌ 사용자 시트에 데이터가 없습니다.');
        return;
    }

    // 2. 헤더 분석 및 컬럼 인덱스 찾기
    const header = values[0].map((h) => String(h || '').trim());
    const rows = values.slice(1);

    console.log(`📊 헤더 분석: ${header.join(', ')}`);

    // 영문/한글 컬럼명 모두 지원 - 추가 컬럼들 포함
    const emailIdx = header.findIndex(h => /^(이메일|Email)$/i.test(h));
    const nameIdx = header.findIndex(h => /^(이름|name)$/i.test(h));
    const phoneIdx = header.findIndex(h => /^(전화번호|phone|핸드폰|휴대폰)$/i.test(h));
    const englishNameIdx = header.findIndex(h => /^(영문이름|english.*name|name.*english)$/i.test(h));
    const reservationDateIdx = header.findIndex(h => /^(예약일|reservation.*date|date)$/i.test(h));
    const nicknameIdx = header.findIndex(h => /^(닉네임|nickname)$/i.test(h));
    const kakaoIdIdx = header.findIndex(h => /^(카톡.*id|kakao.*id|카카오.*id)$/i.test(h));

    if (emailIdx === -1 || nameIdx === -1) {
        console.error('❌ 시트에 이메일/이름 컬럼이 없습니다.');
        console.log('발견된 헤더:', header);
        return;
    }

    console.log(`✅ 컬럼 매핑: 이메일=${emailIdx}, 이름=${nameIdx}, 전화번호=${phoneIdx >= 0 ? phoneIdx : '없음'}`);
    console.log(`   추가 컬럼: 영문이름=${englishNameIdx >= 0 ? englishNameIdx : '없음'}, 예약일=${reservationDateIdx >= 0 ? reservationDateIdx : '없음'}`);
    console.log(`   기타: 닉네임=${nicknameIdx >= 0 ? nicknameIdx : '없음'}, 카톡ID=${kakaoIdIdx >= 0 ? kakaoIdIdx : '없음'}`);

    // 3. Supabase Auth에서 모든 사용자 가져오기 (페이지네이션 처리)
    console.log('🔍 Supabase Auth에서 사용자 목록 조회 중...');
    let allAuthUsers = [];
    let page = 1;
    const perPage = 1000; // 최대 1000명씩 조회

    while (true) {
        const { data: authResponse, error: authError } = await supabase.auth.admin.listUsers({
            page,
            perPage
        });

        if (authError) {
            console.error('❌ Auth 사용자 조회 실패:', authError.message);
            return;
        }

        console.log(`� 페이지 ${page}: ${authResponse.users.length}명 조회`);
        allAuthUsers.push(...authResponse.users);

        // 다음 페이지가 없으면 종료
        if (authResponse.users.length < perPage) {
            break;
        }
        page++;
    }

    console.log(`�📋 Auth에서 총 ${allAuthUsers.length}명의 사용자 발견`);

    // 4. 기존 users 테이블의 사용자 확인
    const { data: existingUsers, error: usersError } = await supabase
        .from('users')
        .select('id, email');

    if (usersError) {
        console.error('❌ 기존 users 테이블 조회 실패:', usersError.message);
        return;
    }

    const existingUserIds = new Set(existingUsers.map(u => u.id));
    console.log(`📋 users 테이블에 이미 ${existingUsers.length}명 등록됨`);

    // 5. 구글시트 데이터를 이메일 기준으로 매핑 (추가 컬럼 포함)
    const sheetDataMap = new Map();
    for (const row of rows) {
        const email = (row[emailIdx] || '').trim().toLowerCase();
        const name = (row[nameIdx] || '').trim();
        const phone = phoneIdx >= 0 ? (row[phoneIdx] || '').trim() : '';
        const englishName = englishNameIdx >= 0 ? (row[englishNameIdx] || '').trim() : '';
        const reservationDate = reservationDateIdx >= 0 ? (row[reservationDateIdx] || '').trim() : '';
        const nickname = nicknameIdx >= 0 ? (row[nicknameIdx] || '').trim() : '';
        const kakaoId = kakaoIdIdx >= 0 ? (row[kakaoIdIdx] || '').trim() : '';

        if (email && name) {
            sheetDataMap.set(email, {
                name,
                phone,
                englishName,
                reservationDate,
                nickname,
                kakaoId
            });
        }
    }

    console.log(`📊 구글시트에서 ${sheetDataMap.size}명의 유효한 데이터 발견`);

    // 6. Auth 사용자들을 users 테이블에 등록/업데이트
    let success = 0, updated = 0, skipped = 0, failed = 0;

    for (const authUser of allAuthUsers) {
        const email = authUser.email?.toLowerCase();
        const authUserId = authUser.id;

        console.log(`\n처리 중: ${email} (ID: ${authUserId})`);

        // 구글시트에서 추가 정보 가져오기
        const sheetData = sheetDataMap.get(email);
        if (!sheetData) {
            console.log(`SKIP: 구글시트에 데이터 없음 - ${email}`);
            skipped++;
            continue;
        }

        // 기존 사용자인지 확인
        const isExisting = existingUserIds.has(authUserId);
        console.log(`📋 사용자 상태: ${isExisting ? '기존 사용자 (업데이트)' : '신규 사용자'}`);

        // users 테이블에 등록/업데이트 (실제 DB 컬럼에 맞춰서)
        try {
            // 예약일 파싱 (YYYY-MM-DD 형식으로 변환) - 개선된 버전
            let parsedReservationDate = null;
            if (sheetData.reservationDate) {
                try {
                    const dateStr = sheetData.reservationDate.trim();
                    console.log(`🔍 원본 예약일: "${dateStr}"`);

                    // 다양한 날짜 형식 지원 (더 포괄적으로)
                    if (dateStr.match(/^\d{4}-\d{1,2}-\d{1,2}$/)) {
                        // 2024-1-1 → 2024-01-01 형식으로 정규화
                        const parts = dateStr.split('-');
                        parsedReservationDate = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
                    } else if (dateStr.match(/^\d{4}\.\d{1,2}\.\d{1,2}$/)) {
                        // 2024.1.1 → 2024-01-01
                        const parts = dateStr.split('.');
                        parsedReservationDate = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
                    } else if (dateStr.match(/^\d{4}\/\d{1,2}\/\d{1,2}$/)) {
                        // 2024/1/1 → 2024-01-01
                        const parts = dateStr.split('/');
                        parsedReservationDate = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
                    } else if (dateStr.match(/^\d{2,4}[./-]\d{1,2}[./-]\d{1,2}$/)) {
                        // 일반적인 날짜 형식들 처리
                        const separators = ['.', '/', '-'];
                        for (const sep of separators) {
                            if (dateStr.includes(sep)) {
                                const parts = dateStr.split(sep);
                                if (parts.length === 3) {
                                    const year = parts[0].length === 2 ? `20${parts[0]}` : parts[0];
                                    parsedReservationDate = `${year}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
                                    break;
                                }
                            }
                        }
                    }

                    // Date 객체로 유효성 검증
                    if (parsedReservationDate) {
                        const testDate = new Date(parsedReservationDate);
                        if (isNaN(testDate.getTime())) {
                            console.log(`⚠️ 유효하지 않은 날짜: ${parsedReservationDate}`);
                            parsedReservationDate = null;
                        } else {
                            console.log(`✅ 파싱된 예약일: ${parsedReservationDate}`);
                        }
                    } else {
                        console.log(`⚠️ 날짜 형식 인식 실패: ${dateStr}`);
                    }
                } catch (e) {
                    console.log(`⚠️ 날짜 파싱 예외: ${sheetData.reservationDate} - ${e.message}`);
                }
            } else {
                console.log(`⚠️ 예약일 데이터 없음`);
            }

            const userInsertData = {
                id: authUserId,
                email: authUser.email,
                name: sheetData.name,
                english_name: sheetData.englishName || null,
                nickname: sheetData.nickname || null,
                phone_number: sheetData.phone || null,
                phone: sheetData.phone || null, // phone_number와 phone 둘 다 있어서 양쪽에 저장
                kakao_id: sheetData.kakaoId || null,
                reservation_date: parsedReservationDate,
                role: 'member', // 모든 사용자를 member로 등록
                status: 'pending',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

            console.log(`📝 ${isExisting ? '업데이트' : '등록'} 데이터:`, {
                email: userInsertData.email,
                name: userInsertData.name,
                english_name: userInsertData.english_name,
                nickname: userInsertData.nickname,
                phone: userInsertData.phone,
                kakao_id: userInsertData.kakao_id,
                reservation_date: userInsertData.reservation_date,
                role: userInsertData.role
            });

            // upsert 방식으로 저장 (존재하면 업데이트, 없으면 생성)
            const { data, error } = await supabase
                .from('users')
                .upsert(userInsertData, {
                    onConflict: 'id', // id 기준으로 중복 체크
                    ignoreDuplicates: false // 중복시 업데이트 수행
                })
                .select()
                .single();

            if (error) {
                console.error(`FAIL: ${email} - ${error.message}`);
                failed++;
            } else {
                if (isExisting) {
                    console.log(`✅ UPDATE: ${email} users 테이블 업데이트 성공`);
                    updated++;
                } else {
                    console.log(`✅ INSERT: ${email} users 테이블 등록 성공`);
                    success++;
                }
            }
        } catch (e) {
            console.error(`❌ 등록 예외: ${email} - ${e.message}`);
            failed++;
        }

        // API 호출 제한 방지를 위한 딜레이
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log('\n🎉 2단계 완료 요약:');
    console.log(`✅ 신규 등록: ${success}건`);
    console.log(`🔄 업데이트: ${updated}건`);
    console.log(`⏭️  건너뜀: ${skipped}건`);
    console.log(`❌ 실패: ${failed}건`);
    console.log(`📊 총 처리: ${success + updated + skipped + failed}건`);

    if (success > 0 || updated > 0) {
        console.log('\n🎯 다음 단계: 예약 데이터 이관을 진행할 수 있습니다.');
        console.log(`💡 팁: 예약일이 누락된 사용자가 있으면 구글시트의 예약일 컬럼을 확인해주세요.`);
    }
}

main().catch(console.error);
