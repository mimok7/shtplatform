require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const { google } = require('googleapis');
const { sheetsConfig, parseNumber, parseDate, parseDateTime, toNull } = require('./sheets-column-maps');

// Supabase 클라이언트 설정
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Google Sheets API 설정
const spreadsheetId = process.env.GOOGLE_SHEETS_ID;

async function getGoogleSheetsClient() {
    const auth = new google.auth.GoogleAuth({
        credentials: {
            type: 'service_account',
            client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            private_key: process.env.GOOGLE_SERVICE_ACCOUNT_KEY.replace(/\\n/g, '\n'),
        },
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    return google.sheets({ version: 'v4', auth });
}

/**
 * 사용자 이메일로 user_id 조회
 */
async function getUserIdByEmail(email) {
    if (!email) return null;

    const { data, error } = await supabase
        .from('users')
        .select('id')
        .eq('email', email.trim())
        .single();

    if (error || !data) {
        console.warn(`⚠️ 사용자를 찾을 수 없습니다: ${email}`);
        return null;
    }

    return data.id;
}

/**
 * 구글 시트에서 크루즈 데이터 읽기
 */
async function readCruiseSheet(sheets, sheetName) {
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `${sheetName}!A:Z`,
        });

        const rows = response.data.values || [];
        if (rows.length < 2) {
            console.warn(`⚠️ ${sheetName} 시트에 데이터가 없습니다.`);
            return [];
        }

        const header = rows[0];
        const dataRows = rows.slice(1);

        console.log(`📊 ${sheetName} 시트 헤더:`, header);
        console.log(`📋 총 ${dataRows.length}개 행 발견`);

        return { header, dataRows };
    } catch (error) {
        console.error(`❌ ${sheetName} 시트 읽기 실패:`, error.message);
        return { header: [], dataRows: [] };
    }
}

/**
 * 시트 데이터를 DB 컬럼으로 매핑
 */
function mapSheetData(row, header, config) {
    const mapped = {};

    // 기본 매핑
    for (const [sheetCol, dbCol] of Object.entries(config.columnMap)) {
        const index = header.indexOf(sheetCol);
        if (index >= 0) {
            let value = row[index];

            // 변환 함수 적용
            if (config.transforms && config.transforms[dbCol]) {
                value = config.transforms[dbCol](value);
            }

            mapped[dbCol] = value;
        }
    }

    // 후처리 함수 적용
    if (config.postProcess) {
        return config.postProcess(mapped, { row, header });
    }

    return mapped;
}

/**
 * 크루즈 예약 생성
 */
async function createCruiseReservation(cruiseData, userEmail) {
    try {
        // 1. 사용자 ID 조회
        const userId = await getUserIdByEmail(userEmail);
        if (!userId) {
            console.error(`❌ 사용자 ID를 찾을 수 없습니다: ${userEmail}`);
            return null;
        }

        // 2. 메인 예약 생성
        const reservationData = {
            re_user_id: userId,
            re_quote_id: cruiseData.quote_id || null, // 견적 ID가 있다면
            re_type: 'cruise',
            re_status: 'pending',
            contact_name: cruiseData.contact_name || cruiseData.applicant_name,
            contact_phone: cruiseData.contact_phone || cruiseData.applicant_phone,
            contact_email: cruiseData.contact_email || userEmail,
            applicant_name: cruiseData.applicant_name,
            applicant_email: cruiseData.applicant_email || userEmail,
            applicant_phone: cruiseData.applicant_phone,
            application_datetime: cruiseData.application_datetime || new Date().toISOString(),
        };

        const { data: reservation, error: reservationError } = await supabase
            .from('reservation')
            .insert(reservationData)
            .select()
            .single();

        if (reservationError) {
            console.error('❌ 메인 예약 생성 실패:', reservationError.message);
            return null;
        }

        console.log(`✅ 메인 예약 생성 성공: ${reservation.re_id}`);

        // 3. 크루즈 예약 상세 생성
        if (cruiseData.cruise) {
            const cruiseReservationData = {
                reservation_id: reservation.re_id,
                ...cruiseData.cruise
            };

            const { error: cruiseError } = await supabase
                .from('reservation_cruise')
                .insert(cruiseReservationData);

            if (cruiseError) {
                console.error('❌ 크루즈 예약 생성 실패:', cruiseError.message);
            } else {
                console.log(`✅ 크루즈 예약 생성 성공`);
            }
        }

        // 4. 크루즈 차량 예약 생성 (선택사항)
        if (cruiseData.car && Object.keys(cruiseData.car).length > 1) { // reservation_id 외에 다른 데이터가 있는 경우
            const carReservationData = {
                reservation_id: reservation.re_id,
                ...cruiseData.car
            };

            const { error: carError } = await supabase
                .from('reservation_cruise_car')
                .insert(carReservationData);

            if (carError) {
                console.error('❌ 크루즈 차량 예약 생성 실패:', carError.message);
            } else {
                console.log(`✅ 크루즈 차량 예약 생성 성공`);
            }
        }

        return reservation.re_id;
    } catch (error) {
        console.error('❌ 크루즈 예약 생성 중 오류:', error.message);
        return null;
    }
}

/**
 * 메인 실행 함수
 */
async function importCruiseReservations() {
    try {
        console.log('🚢 크루즈 예약 데이터 가져오기 시작...\n');

        const sheets = await getGoogleSheetsClient();

        // 크루즈 관련 시트들 처리
        const cruiseSheets = ['크루즈', '차량']; // 실제 시트명으로 변경
        const processedData = new Map(); // 주문ID별로 데이터 그룹화

        // 1. 모든 크루즈 시트 데이터 수집
        for (const sheetName of cruiseSheets) {
            const { header, dataRows } = await readCruiseSheet(sheets, sheetName);
            if (header.length === 0) continue;

            const config = sheetsConfig.find(c => c.sheetName === sheetName);
            if (!config) {
                console.warn(`⚠️ ${sheetName} 시트 설정을 찾을 수 없습니다.`);
                continue;
            }

            console.log(`\n📊 ${sheetName} 시트 처리 중...`);

            for (let i = 0; i < dataRows.length; i++) {
                const row = dataRows[i];
                if (!row || row.length === 0) continue;

                const mapped = mapSheetData(row, header, config);

                // 주문ID 확인 (실제 컬럼명 기준)
                const orderIdColumn = config.idColumn;
                let orderId = null;

                // 주문ID 컬럼 찾기
                const orderIdIndex = header.indexOf(orderIdColumn);
                if (orderIdIndex >= 0) {
                    orderId = row[orderIdIndex];
                }

                if (!orderId) {
                    console.warn(`⚠️ ${sheetName} 행 ${i + 2}: 주문ID가 없습니다.`);
                    continue;
                }

                // 필수 필드 확인
                const missingFields = config.requiredDbFields.filter(field =>
                    mapped[field] === null || mapped[field] === undefined
                );
                if (missingFields.length > 0) {
                    console.warn(`⚠️ ${sheetName} 행 ${i + 2}: 필수 필드 누락 - ${missingFields.join(', ')}`);
                    continue;
                }

                // 사용자 이메일 찾기
                const emailIndex = header.indexOf('Email');
                const userEmail = emailIndex >= 0 ? row[emailIndex] : null;

                if (!userEmail) {
                    console.warn(`⚠️ ${sheetName} 행 ${i + 2}: 사용자 이메일이 없습니다.`);
                    continue;
                }

                // 데이터 그룹화
                if (!processedData.has(orderId)) {
                    processedData.set(orderId, {
                        userEmail,
                        cruise: null,
                        car: null,
                        quote_id: null,
                        contact_name: null,
                        contact_phone: null,
                        contact_email: null,
                        applicant_name: null,
                        applicant_email: null,
                        applicant_phone: null,
                        application_datetime: null
                    });
                }

                const orderData = processedData.get(orderId);

                if (sheetName === '크루즈') {
                    orderData.cruise = mapped;
                    // 연락처 정보 수집 (실제 컬럼명 기준)
                    const nameIndex = header.indexOf('구분'); // 또는 다른 이름 컬럼
                    const phoneIndex = header.indexOf('전화번호');

                    if (nameIndex >= 0) orderData.applicant_name = row[nameIndex];
                    if (phoneIndex >= 0) orderData.applicant_phone = row[phoneIndex];
                    orderData.applicant_email = userEmail;
                } else if (sheetName === '차량') {
                    orderData.car = mapped;
                }
            }
        }

        // 2. 수집된 데이터로 예약 생성
        console.log(`\n📋 총 ${processedData.size}개의 주문 처리 시작...\n`);

        let successCount = 0;
        let errorCount = 0;

        for (const [orderId, orderData] of processedData) {
            console.log(`\n🔄 주문 ${orderId} 처리 중...`);

            // 크루즈 예약이 없으면 건너뛰기
            if (!orderData.cruise) {
                console.warn(`⚠️ 주문 ${orderId}: 크루즈 예약 데이터가 없습니다.`);
                errorCount++;
                continue;
            }

            const reservationId = await createCruiseReservation(orderData, orderData.userEmail);

            if (reservationId) {
                successCount++;
                console.log(`✅ 주문 ${orderId} → 예약 ${reservationId} 생성 완료`);
            } else {
                errorCount++;
                console.error(`❌ 주문 ${orderId} 처리 실패`);
            }
        }

        console.log('\n🎉 크루즈 예약 가져오기 완료!');
        console.log(`✅ 성공: ${successCount}개`);
        console.log(`❌ 실패: ${errorCount}개`);
        console.log(`📊 총 처리: ${successCount + errorCount}개`);

    } catch (error) {
        console.error('❌ 크루즈 예약 가져오기 실패:', error.message);
        process.exit(1);
    }
}

// 스크립트 실행
if (require.main === module) {
    importCruiseReservations();
}

module.exports = { importCruiseReservations };
