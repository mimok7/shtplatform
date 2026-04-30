/**
 * 라이나/엠바사더 크루즈 강제 활성화 헬퍼
 * 
 * 목적: DB에서 비활성화된 라이나/엠바사더 크루즈를 자동으로 활성화
 * 사용: node activate-cruises.js
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Supabase credentials not found in environment variables');
  console.error('   Set: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function activateCruises() {
  console.log('🚀 라이나/엠바사더 크루즈 자동 활성화 시작...\n');

  try {
    // 1️⃣ 라이나 크루즈 확인
    console.log('1️⃣ 라이나 크루즈 상태 확인...');
    const { data: lainaData, error: lainaError } = await supabase
      .from('cruise_rate_card')
      .select('id, cruise_name, is_active')
      .or('cruise_name.ilike.%라이나%,cruise_name.ilike.%라이라%')
      .eq('valid_year', 2026);

    if (lainaError) {
      console.error('   ❌ 라이나 조회 실패:', lainaError.message);
      return;
    }

    if (!lainaData || lainaData.length === 0) {
      console.log('   ⚠️ 라이나 크루즈가 DB에 없습니다. (정상 - 첫 생성 시)');
    } else {
      const inactiveCount = lainaData.filter(r => !r.is_active).length;
      console.log(`   ✓ 총 ${lainaData.length}행 발견, 비활성화: ${inactiveCount}행`);

      if (inactiveCount > 0) {
        const { error: updateError } = await supabase
          .from('cruise_rate_card')
          .update({ is_active: true })
          .or('cruise_name.ilike.%라이나%,cruise_name.ilike.%라이라%')
          .eq('valid_year', 2026)
          .eq('is_active', false);

        if (updateError) {
          console.error('   ❌ 라이나 활성화 실패:', updateError.message);
        } else {
          console.log(`   ✅ 라이나 ${inactiveCount}행 활성화 완료`);
        }
      } else {
        console.log('   ✅ 라이나 모두 활성화됨');
      }
    }

    // 2️⃣ 엠바사더 크루즈 확인
    console.log('\n2️⃣ 엠바사더 크루즈 상태 확인...');
    const { data: ambData, error: ambError } = await supabase
      .from('cruise_rate_card')
      .select('id, cruise_name, is_active')
      .ilike('cruise_name', '%엠바%')
      .eq('valid_year', 2026);

    if (ambError) {
      console.error('   ❌ 엠바사더 조회 실패:', ambError.message);
      return;
    }

    if (!ambData || ambData.length === 0) {
      console.log('   ⚠️ 엠바사더 크루즈가 DB에 없습니다. (정상 - 첫 생성 시)');
    } else {
      const inactiveCount = ambData.filter(r => !r.is_active).length;
      console.log(`   ✓ 총 ${ambData.length}행 발견, 비활성화: ${inactiveCount}행`);

      if (inactiveCount > 0) {
        const { error: updateError } = await supabase
          .from('cruise_rate_card')
          .update({ is_active: true })
          .ilike('cruise_name', '%엠바%')
          .eq('valid_year', 2026)
          .eq('is_active', false);

        if (updateError) {
          console.error('   ❌ 엠바사더 활성화 실패:', updateError.message);
        } else {
          console.log(`   ✅ 엠바사더 ${inactiveCount}행 활성화 완료`);
        }
      } else {
        console.log('   ✅ 엠바사더 모두 활성화됨');
      }
    }

    // 3️⃣ 최종 확인
    console.log('\n3️⃣ 최종 상태 확인...');
    const { data: finalLaina } = await supabase
      .from('cruise_rate_card')
      .select('id')
      .or('cruise_name.ilike.%라이나%,cruise_name.ilike.%라이라%')
      .eq('valid_year', 2026)
      .eq('is_active', true);

    const { data: finalAmb } = await supabase
      .from('cruise_rate_card')
      .select('id')
      .ilike('cruise_name', '%엠바%')
      .eq('valid_year', 2026)
      .eq('is_active', true);

    console.log(`   라이나: ${finalLaina?.length || 0}행 활성화됨`);
    console.log(`   엠바사더: ${finalAmb?.length || 0}행 활성화됨`);

    console.log('\n✅ 완료! UI를 새로고침하면 크루즈가 표시됩니다.');
  } catch (error) {
    console.error('❌ 오류 발생:', error);
  }
}

// 실행
activateCruises();
