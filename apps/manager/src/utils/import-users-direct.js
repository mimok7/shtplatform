// 사용자 시트 → Supabase users 테이블 직접 삽입
// Auth 대신 users 테이블에 직접 등록

const { GoogleAuth } = require('google-auth-library');
const { google } = require('googleapis');
const { createClient } = require('@supabase/supabase-js');
const { randomUUID } = require('crypto');
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
    console.error('Missing SUPABASE env.');
    process.exit(1);
}
if (!GOOGLE_SHEETS_ID || !GOOGLE_SERVICE_ACCOUNT || !GOOGLE_SERVICE_KEY) {
    console.error('Missing Google Sheets env.');
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
    try {
        const sheets = await getSheetsClient();
        const sheetName = '사용자';
        const range = `${sheetName}!A:Z`;

        console.log('구글 시트에서 사용자 데이터 읽는 중...');
        const res = await sheets.spreadsheets.values.get({ spreadsheetId: GOOGLE_SHEETS_ID, range });
        const values = res.data.values || [];

        if (values.length < 2) {
            console.error('사용자 시트에 데이터가 없습니다.');
            return;
        }

        const header = values[0].map((h) => String(h || '').trim());
        const rows = values.slice(1);

        console.log('헤더:', header);

        // 영문/한글 컬럼명 모두 지원
        const emailIdx = header.findIndex(h => /^(이메일|Email)$/i.test(h));
        const nameIdx = header.findIndex(h => /^(이름|name)$/i.test(h));

        if (emailIdx === -1 || nameIdx === -1) {
            console.error('시트에 이메일/이름(name) 컬럼이 없습니다.');
            console.error(`찾은 컬럼: ${header.join(', ')}`);
            return;
        }

        console.log(`이메일 컬럼: ${emailIdx}, 이름 컬럼: ${nameIdx}`);

        let success = 0, skipped = 0, failed = 0;
        console.log(`시작: 총 ${rows.length}명 처리 예정`);

        for (const row of rows) {
            const email = (row[emailIdx] || '').trim();
            const name = (row[nameIdx] || '').trim();

            console.log(`처리 중: ${email} (${name})`);

            if (!email || !name) {
                console.log(`SKIP: 빈 데이터 - ${email || '이메일없음'}`);
                skipped++;
                continue;
            }

            // users 테이블에 이미 있는지 확인
            const { data: existing } = await supabase
                .from('users')
                .select('id')
                .eq('email', email)
                .single();

            if (existing) {
                console.log(`SKIP: 이미 등록됨 - ${email}`);
                skipped++;
                continue;
            }

            // users 테이블에 직접 삽입
            const { data, error } = await supabase
                .from('users')
                .insert({
                    id: randomUUID(),
                    email: email,
                    name: name,
                    role: 'member',
                    created_at: new Date().toISOString()
                });

            if (error) {
                console.error(`FAIL: ${email} - ${error.message}`);
                failed++;
            } else {
                console.log(`OK: ${email} 등록 성공`);
                success++;
            }
        }

        console.log(`\n완료: 등록 ${success}건, 중복 ${skipped}건, 실패 ${failed}건`);
    } catch (error) {
        console.error('전체 오류:', error);
    }
}

main();
