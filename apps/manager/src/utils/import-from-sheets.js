#!/usr/bin/env node
/**
 * 구글 시트 → Supabase DB 이관 스크립트
 * - 시트별 탭에서 데이터를 읽어 테이블에 insert/upsert
 * - 주문ID는 reservation_id로 매핑
 * - 컬럼은 utils/sheets-column-maps.js 설정을 사용
 */

const { createClient } = require('@supabase/supabase-js');
const { GoogleAuth } = require('google-auth-library');
const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
// Load .env.local first (if exists), then .env
try { dotenv.config({ path: path.join(process.cwd(), '.env.local') }); } catch { }
try { dotenv.config({ path: path.join(process.cwd(), '.env') }); } catch { }

const { sheetsConfig } = require('./sheets-column-maps');

// 환경 변수 요구
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const GOOGLE_SHEETS_ID = process.env.GOOGLE_SHEETS_ID; // 스프레드시트 ID
const GOOGLE_SERVICE_ACCOUNT = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL; // 서비스 계정 이메일
const GOOGLE_SERVICE_KEY = process.env.GOOGLE_SERVICE_ACCOUNT_KEY; // 서비스 계정 프라이빗 키 (\n 포함 인코딩)

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Missing SUPABASE env. Required: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (service role).');
    console.error('Hint: set them in .env.local or .env.');
    process.exit(1);
}
if (!GOOGLE_SHEETS_ID || !GOOGLE_SERVICE_ACCOUNT || !GOOGLE_SERVICE_KEY) {
    console.error('Missing Google Sheets env. Required: GOOGLE_SHEETS_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_KEY.');
    console.error('Hint: share the spreadsheet with the service account email.');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function ensureReservationExists(reservationId) {
    if (!reservationId) return false;

    // 먼저 기존 예약이 있는지 확인
    const { data: existing } = await supabase
        .from('reservation')
        .select('re_id')
        .eq('re_id', reservationId)
        .single();

    if (existing) return true;

    // 없으면 기본 예약 레코드 생성
    const { error } = await supabase
        .from('reservation')
        .insert({
            re_id: reservationId,
            re_status: 'confirmed', // 기본값
            re_type: 'pending', // 서비스별로 나중에 업데이트 가능
            created_at: new Date().toISOString()
        });

    if (error) {
        console.warn(`기본 예약 생성 실패 (${reservationId}):`, error.message);
        return false;
    }

    console.log(`✓ 기본 예약 생성: ${reservationId}`);
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
    header.forEach((h, idx) => {
        const dbCol = config.columnMap[h];
        if (!dbCol) return;
        obj[dbCol] = row[idx] ?? null;
    });
    // 주문ID → reservation_id
    const idIdx = header.findIndex((h) => h === config.idColumn);
    if (idIdx >= 0) {
        obj.reservation_id = row[idIdx] ?? obj.reservation_id ?? null;
    }
    // transform 적용
    if (config.transforms) {
        for (const [k, fn] of Object.entries(config.transforms)) {
            if (Object.prototype.hasOwnProperty.call(obj, k)) {
                try { obj[k] = fn(obj[k]); } catch { }
            }
        }
    }
    return obj;
}

function isValidRow(mapped, config) {
    if (!mapped) return false;
    if (!config.requiredDbFields || config.requiredDbFields.length === 0) return true;
    return config.requiredDbFields.every((k) => mapped[k] !== undefined && mapped[k] !== null && mapped[k] !== '');
}

async function importSheetTab(sheets, config) {
    console.log(`\n=== ▶ ${config.sheetName} (→ ${config.targetTable})`);
    const range = `${config.sheetName}!A:Z`;
    let res;
    try {
        res = await sheets.spreadsheets.values.get({ spreadsheetId: GOOGLE_SHEETS_ID, range });
    } catch (e) {
        const msg = (e && e.message) || '';
        if (String(msg).includes('Unable to parse range')) {
            console.warn(`스킵: 시트 탭 '${config.sheetName}'을 찾을 수 없습니다.`);
            return { inserted: 0, skipped: 0 };
        }
        throw e;
    }
    const values = res.data.values || [];
    if (values.length === 0) {
        console.log('No data.');
        return { inserted: 0, skipped: 0 };
    }
    // 헤더 감지: 1행이 시트명일 수 있음 → 2행을 헤더로 사용
    let headerRowIndex = 0;
    if (values.length >= 2) {
        const row0 = (values[0] || []).map((v) => String(v || '').trim());
        const row1 = (values[1] || []).map((v) => String(v || '').trim());
        const row0HasId = row0.includes(config.idColumn);
        const row1HasId = row1.includes(config.idColumn);
        if (!row0HasId && row1HasId) {
            headerRowIndex = 1;
        } else if (row0.length <= 3 && !row0HasId) {
            // 1행이 제목 등으로 보이는 경우 (컬럼 수가 적고 idColumn 없음)
            headerRowIndex = 1;
        }
    }
    const header = (values[headerRowIndex] || []).map((v) => String(v || '').trim());
    const rows = values.slice(headerRowIndex + 1);

    let inserted = 0, skipped = 0;
    for (const row of rows) {
        const mappedBase = mapRow(row, header, config);
        const mapped = (typeof config.postProcess === 'function')
            ? (config.postProcess(mappedBase, { row, header }) || mappedBase)
            : mappedBase;
        if (!isValidRow(mapped, config)) {
            skipped++;
            continue;
        }

        // 예약 테이블에 먼저 레코드가 있는지 확인하고 없으면 생성
        const reservationExists = await ensureReservationExists(mapped.reservation_id);
        if (!reservationExists) {
            console.warn(`예약 ${mapped.reservation_id} 생성 실패, 건너뜀`);
            skipped++;
            continue;
        }

        // upsert 기준: (reservation_id, price_code) 조합이 자연스러운 경우가 많음
        // 테이블별 고유키 후보 결정
        const conflictCols = ['reservation_id'];
        const priceKey = Object.values(config.columnMap).find((c) => c.endsWith('_price_code'));
        if (priceKey) conflictCols.push(priceKey);

        let upsertError;
        try {
            const { error } = await supabase
                .from(config.targetTable)
                .upsert(mapped, { onConflict: conflictCols.join(','), ignoreDuplicates: false });
            upsertError = error || null;
        } catch (e) {
            upsertError = e;
        }
        if (upsertError && String(upsertError.message || upsertError).includes('no unique or exclusion constraint')) {
            // 유니크 제약이 없으면 일반 insert로 폴백
            const { error: insError } = await supabase.from(config.targetTable).insert(mapped);
            if (insError) {
                console.error('Insert error:', insError.message, mapped);
                skipped++;
            } else {
                inserted++;
            }
        } else if (upsertError) {
            console.error('Upsert error:', upsertError.message || upsertError, mapped);
            skipped++;
        } else {
            inserted++;
        }
    }

    console.log(`Inserted: ${inserted}, Skipped: ${skipped}`);
    return { inserted, skipped };
}

async function main() {
    const sheets = await getSheetsClient();
    let totalInserted = 0, totalSkipped = 0;
    for (const conf of sheetsConfig) {
        const { inserted, skipped } = await importSheetTab(sheets, conf);
        totalInserted += inserted;
        totalSkipped += skipped;
    }
    console.log(`\n=== 완료: Inserted ${totalInserted}, Skipped ${totalSkipped}`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
