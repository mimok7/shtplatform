#!/usr/bin/env node
/**
 * 단순 구글 시트 → DB 이관 스크립트
 * - insert만 사용, 중복 오류 무시
 * - 예약 테이블 의존성 제거
 */

const { createClient } = require('@supabase/supabase-js');
const { GoogleAuth } = require('google-auth-library');
const { google } = require('googleapis');
const path = require('path');
const dotenv = require('dotenv');
const crypto = require('crypto');

// 환경 변수 로드
try { dotenv.config({ path: path.join(process.cwd(), '.env.local') }); } catch { }
try { dotenv.config({ path: path.join(process.cwd(), '.env') }); } catch { }

const { sheetsConfig } = require('./sheets-column-maps');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GOOGLE_SHEETS_ID = process.env.GOOGLE_SHEETS_ID;
const GOOGLE_SERVICE_ACCOUNT = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const GOOGLE_SERVICE_KEY = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Missing SUPABASE env vars');
    process.exit(1);
}
if (!GOOGLE_SHEETS_ID || !GOOGLE_SERVICE_ACCOUNT || !GOOGLE_SERVICE_KEY) {
    console.error('Missing Google Sheets env vars');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// 사용자 정보를 기반으로 사용자 생성/확인
async function ensureUser(userInfo = {}) {
    // 기본 사용자 정보
    const defaultUserId = '00000000-0000-0000-0000-000000000001';
    const defaultEmail = 'import@example.com';
    const defaultName = '시트 이관용 사용자';

    // 사용자 정보 추출 (구글 시트에서 온 데이터)
    const userName = userInfo.name || userInfo.고객명 || userInfo.예약자명 || defaultName;
    const userPhone = userInfo.phone || userInfo.전화번호 || userInfo.연락처 || null;
    const userEmail = userInfo.email || userInfo.이메일 || defaultEmail;

    // 이메일을 기준으로 기존 사용자 확인
    let userId = defaultUserId;

    if (userEmail !== defaultEmail) {
        const { data: existing } = await supabase
            .from('users')
            .select('id')
            .eq('email', userEmail)
            .single();

        if (existing) {
            console.log(`✓ 기존 사용자 사용: ${userEmail}`);
            return existing.id;
        }

        // 새 사용자 생성을 위한 UUID 생성
        userId = crypto.randomUUID();
    } else {
        // 기본 사용자 존재 확인
        const { data: existing } = await supabase
            .from('users')
            .select('id')
            .eq('id', defaultUserId)
            .single();

        if (existing) {
            console.log('✓ 기본 사용자 존재');
            return defaultUserId;
        }
    }

    const { error } = await supabase
        .from('users')
        .insert({
            id: userId,
            email: userEmail,
            name: userName,
            phone: userPhone,
            role: 'member',
            created_at: new Date().toISOString()
        });

    if (error) {
        console.error(`사용자 생성 실패 (${userEmail}):`, error.message);
        // 실패 시 기본 사용자 반환
        return defaultUserId;
    }

    console.log(`✓ 사용자 생성: ${userName} (${userEmail})`);
    return userId;
}

// 예약 레코드 생성/확인
async function ensureReservation(reservationId, userId) {
    if (!reservationId) return false;

    const { data: existing } = await supabase
        .from('reservation')
        .select('re_id')
        .eq('re_id', reservationId)
        .single();

    if (existing) return true;

    const { error } = await supabase
        .from('reservation')
        .insert({
            re_id: reservationId,
            re_user_id: userId,
            re_status: 'confirmed',
            re_type: 'imported',
            created_at: new Date().toISOString()
        });

    if (error) {
        console.warn(`예약 생성 실패 (${reservationId}):`, error.message);
        return false;
    }

    return true;
}

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

function mapRow(row, header, config) {
    const obj = {};

    // 컬럼 매핑
    header.forEach((h, idx) => {
        const dbCol = config.columnMap[h];
        if (dbCol && row[idx] !== undefined && row[idx] !== null && row[idx] !== '') {
            obj[dbCol] = row[idx];
        }
    });

    // 변환 함수 적용
    if (config.transforms) {
        for (const [key, fn] of Object.entries(config.transforms)) {
            if (key in obj) {
                try {
                    obj[key] = fn(obj[key]);
                } catch (e) {
                    // 변환 실패 시 원래 값 유지
                }
            }
        }
    }

    // postProcess 적용
    if (typeof config.postProcess === 'function') {
        try {
            const processed = config.postProcess(obj, { row, header });
            return processed || obj;
        } catch (e) {
            console.warn('PostProcess error:', e.message);
        }
    }

    return obj;
}

async function importSheet(sheets, config) {
    console.log(`\n=== ${config.sheetName} → ${config.targetTable}`);

    const range = `${config.sheetName}!A:Z`;
    let res;

    try {
        res = await sheets.spreadsheets.values.get({
            spreadsheetId: GOOGLE_SHEETS_ID,
            range
        });
    } catch (e) {
        if (e.message && e.message.includes('Unable to parse range')) {
            console.log(`스킵: 시트 '${config.sheetName}' 없음`);
            return { inserted: 0, skipped: 0 };
        }
        throw e;
    }

    const values = res.data.values || [];
    if (values.length < 2) {
        console.log('데이터 없음');
        return { inserted: 0, skipped: 0 };
    }

    // 헤더 찾기 (1행 제목, 2행 헤더 가능성)
    let headerIndex = 0;
    if (values.length > 1) {
        const row0 = values[0].filter(v => v && v.trim());
        const row1 = values[1].filter(v => v && v.trim());

        // 주문ID가 2행에 있으면 2행을 헤더로 사용
        if (!row0.includes(config.idColumn) && row1.includes(config.idColumn)) {
            headerIndex = 1;
        }
    }

    const header = values[headerIndex].map(h => String(h || '').trim());
    const dataRows = values.slice(headerIndex + 1);

    let inserted = 0, skipped = 0;

    for (const row of dataRows) {
        if (!row || row.length === 0) continue;

        const mapped = mapRow(row, header, config);

        // 필수 컬럼 체크
        if (!mapped.reservation_id) {
            skipped++;
            continue;
        }

        // 사용자 정보 추출 (구글 시트의 컬럼에서)
        const userInfo = {};
        header.forEach((h, idx) => {
            if (['고객명', '예약자명', '이름', '성명'].includes(h)) {
                userInfo.name = row[idx];
            } else if (['전화번호', '연락처', '휴대폰'].includes(h)) {
                userInfo.phone = row[idx];
            } else if (['이메일', '메일', 'email'].includes(h)) {
                userInfo.email = row[idx];
            }
        });

        // 사용자 생성/확인
        const userId = await ensureUser(userInfo);

        // 예약 레코드 생성
        const reservationCreated = await ensureReservation(mapped.reservation_id, userId);
        if (!reservationCreated) {
            console.warn(`예약 ${mapped.reservation_id} 생성 실패, 건너뜀`);
            skipped++;
            continue;
        }

        // 단순 insert 시도
        const { error } = await supabase
            .from(config.targetTable)
            .insert(mapped);

        if (error) {
            const errMsg = String(error.message || '');
            if (errMsg.includes('duplicate') ||
                errMsg.includes('already exists') ||
                errMsg.includes('violates unique') ||
                errMsg.includes('constraint')) {
                // 중복/제약 위반은 무시
                skipped++;
            } else {
                console.error(`Insert 실패:`, errMsg);
                skipped++;
            }
        } else {
            inserted++;
        }
    }

    console.log(`✓ Inserted: ${inserted}, Skipped: ${skipped}`);
    return { inserted, skipped };
}

async function main() {
    console.log('=== 구글 시트 → DB 이관 시작 ===\n');

    const sheets = await getSheetsClient();
    let totalInserted = 0, totalSkipped = 0;

    for (const config of sheetsConfig) {
        const { inserted, skipped } = await importSheet(sheets, config);
        totalInserted += inserted;
        totalSkipped += skipped;
    }

    console.log(`\n=== 완료 ===`);
    console.log(`Total Inserted: ${totalInserted}`);
    console.log(`Total Skipped: ${totalSkipped}`);
}

main().catch(console.error);
