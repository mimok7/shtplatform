// 사용자 시트 → Supabase 인증(회원가입) 이관 스크립트
// 이메일, 이름만 사용, 비밀번호는 qwe123!로 통일

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
    const sheets = await getSheetsClient();
    // 사용자 시트명은 '사용자' 또는 'Users'로 가정
    const sheetName = '사용자';
    const range = `${sheetName}!A:Z`;
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: GOOGLE_SHEETS_ID, range });
    const values = res.data.values || [];
    if (values.length < 2) {
        console.error('사용자 시트에 데이터가 없습니다.');
        return;
    }
    const header = values[0].map((h) => String(h || '').trim());
    const rows = values.slice(1);
    // 영문/한글 컬럼명 모두 지원
    const emailIdx = header.findIndex(h => /^(이메일|Email)$/i.test(h));
    const nameIdx = header.findIndex(h => /^(이름|name)$/i.test(h));
    if (emailIdx === -1 || nameIdx === -1) {
        console.error('시트에 이메일/이름(name) 컬럼이 없습니다.');
        return;
    }
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

        // 이미 등록된 이메일은 skip
        try {
            const { data: exists, error: checkError } = await supabase.auth.admin.getUserByEmail(email);
            if (checkError && checkError.message !== 'User not found') {
                console.error(`체크 에러: ${email} - ${checkError.message}`);
                failed++;
                continue;
            }
            if (exists && exists.user) {
                console.log(`SKIP: 이미 등록됨 - ${email}`);
                skipped++;
                continue;
            }
        } catch (e) {
            console.error(`체크 예외: ${email} - ${e.message}`);
        }

        // 회원가입
        try {
            const { data, error } = await supabase.auth.admin.createUser({
                email,
                password: 'qwe123!',
                user_metadata: { name },
                email_confirm: true
            });
            if (error) {
                console.error(`FAIL: ${email} - ${error.message}`);
                failed++;
            } else {
                console.log(`OK: ${email} 등록 성공`);
                success++;
            }
        } catch (e) {
            console.error(`등록 예외: ${email} - ${e.message}`);
            failed++;
        }

        // API 호출 제한 방지를 위한 딜레이
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    console.log(`\n완료: 등록 ${success}건, 중복 ${skipped}건, 실패 ${failed}건`);
}

main().catch(console.error);
