// boarding_assist 컬럼을 Y/N 타입으로 변경하는 스크립트

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function modifyColumn() {
    console.log('🔧 boarding_assist 컬럼을 Y/N 타입으로 변경 중...');

    try {
        // 1. 기존 컬럼 삭제
        console.log('1️⃣ 기존 boarding_assist 컬럼 삭제...');
        const { error: dropError } = await supabase.rpc('exec_sql', {
            sql_query: 'ALTER TABLE reservation_cruise DROP COLUMN IF EXISTS boarding_assist;'
        });

        if (dropError) {
            console.error('컬럼 삭제 실패:', dropError);
        } else {
            console.log('✅ 기존 컬럼 삭제 완료');
        }

        // 2. 새 컬럼 추가 (Y/N 타입)
        console.log('2️⃣ 새로운 boarding_assist 컬럼 추가 (Y/N 타입)...');
        const { error: addError } = await supabase.rpc('exec_sql', {
            sql_query: "ALTER TABLE reservation_cruise ADD COLUMN boarding_assist text CHECK (boarding_assist IN ('Y', 'N')) DEFAULT 'N';"
        });

        if (addError) {
            console.error('컬럼 추가 실패:', addError);
        } else {
            console.log('✅ 새 컬럼 추가 완료');
        }

        // 3. 컬럼 확인
        console.log('3️⃣ 변경된 컬럼 확인...');
        const { data: columnInfo, error: checkError } = await supabase.rpc('exec_sql', {
            sql_query: "SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = 'reservation_cruise' AND column_name = 'boarding_assist';"
        });

        if (checkError) {
            console.error('컬럼 확인 실패:', checkError);
        } else {
            console.log('📋 변경된 컬럼 정보:', columnInfo);
        }

        console.log('🎉 boarding_assist 컬럼 변경 완료!');

    } catch (e) {
        console.error('❌ 오류 발생:', e.message);
    }
}

modifyColumn().catch(console.error);
