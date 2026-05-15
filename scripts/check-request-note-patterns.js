#!/usr/bin/env node
/**
 * 🔍 reservation_cruise.request_note 데이터 점검 스크립트
 * - 시스템 생성 메타데이터 패턴 분석
 * - 사용자 입력 데이터 확인
 * - 삭제 안전성 검토
 * 
 * 실행: node scripts/check-request-note-patterns.js
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// .env.local 파일 읽기 (apps/customer에서)
const envPath = path.join(__dirname, '../apps/customer/.env.local');
let supabaseUrl = '';
let supabaseKey = '';

if (!fs.existsSync(envPath)) {
  console.error('❌ .env.local 파일을 찾을 수 없습니다:', envPath);
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf-8');
const lines = envContent.split('\n');
lines.forEach(line => {
  const trimmed = line.trim();
  if (trimmed.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) {
    supabaseUrl = trimmed.replace('NEXT_PUBLIC_SUPABASE_URL=', '').trim().replace(/^["']|["']$/g, '');
  }
  if (trimmed.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) {
    supabaseKey = trimmed.replace('SUPABASE_SERVICE_ROLE_KEY=', '').trim().replace(/^["']|["']$/g, '');
  }
});

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ 환경변수 로드 실패:');
  console.error('   NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? '✅ 로드됨' : '❌ 없음');
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', supabaseKey ? '✅ 로드됨' : '❌ 없음');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

console.log('✅ Supabase 연결 설정 완료');
console.log('   URL:', supabaseUrl.substring(0, 50) + '...');
console.log('   KEY 길이:', supabaseKey.length, 'chars');
console.log('   KEY 첫 20글자:', supabaseKey.substring(0, 20) + '...');

async function checkRequestNotePatterns() {
  console.log('🔍 reservation_cruise.request_note 데이터 점검 시작...\n');

  try {
    // 1️⃣ 통계 조회
    console.log('📊 1️⃣ 전체 통계 조회 중...');
    const { data: stats, error: statsError } = await supabase
      .from('reservation_cruise')
      .select('request_note');

    if (statsError) {
      console.error('❌ 통계 조회 오류:', statsError);
      return;
    }

    if (!stats) {
      console.log('📭 데이터 없음');
      return;
    }

    const statsResult = {
      total_rows: stats.length,
      null_count: stats.filter(row => row.request_note === null).length,
      room_composition_pattern: stats.filter(row => row.request_note?.includes('[객실')).length,
      catherine_pattern: stats.filter(row => row.request_note?.includes('[구성')).length,
      option_pattern: stats.filter(row => row.request_note?.includes('[옵션')).length,
      options_tag_pattern: stats.filter(row => row.request_note?.includes('[OPTIONS:')).length,
      child_older_pattern: stats.filter(row => row.request_note?.includes('[CHILD_OLDER_COUNTS:')).length,
      child_birth_pattern: stats.filter(row => row.request_note?.includes('[CHILD_BIRTH_DATES:')).length,
      infant_birth_pattern: stats.filter(row => row.request_note?.includes('[INFANT_BIRTH_DATES:')).length,
    };

    console.log('\n📈 통계 결과:');
    console.log(`  총 행 수: ${statsResult.total_rows}`);
    console.log(`  NULL 값: ${statsResult.null_count}`);
    console.log(`  [객실 N] 패턴: ${statsResult.room_composition_pattern}`);
    console.log(`  [구성 N] 패턴 (캐서린): ${statsResult.catherine_pattern}`);
    console.log(`  [옵션 N] 패턴: ${statsResult.option_pattern}`);
    console.log(`  [OPTIONS:...] 태그: ${statsResult.options_tag_pattern}`);
    console.log(`  [CHILD_OLDER_COUNTS:...] 태그: ${statsResult.child_older_pattern}`);
    console.log(`  [CHILD_BIRTH_DATES:...] 태그: ${statsResult.child_birth_pattern}`);
    console.log(`  [INFANT_BIRTH_DATES:...] 태그: ${statsResult.infant_birth_pattern}`);

    // 2️⃣ 사용자 입력 데이터만 있는 경우
    console.log('\n📝 2️⃣ 순수 사용자 입력 데이터 (메타데이터 없음) 조회 중...');
    const userInputData = stats.filter(row => {
      if (!row.request_note) return false;
      const note = row.request_note;
      
      // 메타데이터 패턴이 없는 것만 필터링
      const hasNoMetadata = !note.includes('[객실') &&
                           !note.includes('[구성') &&
                           !note.includes('[옵션') &&
                           !note.includes('[OPTIONS:') &&
                           !note.includes('[CHILD_OLDER_COUNTS:') &&
                           !note.includes('[CHILD_BIRTH_DATES:') &&
                           !note.includes('[INFANT_BIRTH_DATES:');
      
      return hasNoMetadata;
    });

    if (userInputData.length > 0) {
      console.log(`\n✅ 순수 사용자 입력 데이터: ${userInputData.length}개`);
      console.log('\n샘플 데이터 (최대 10개):');
      userInputData.slice(0, 10).forEach((item, idx) => {
        console.log(`  ${idx + 1}. "${item.request_note}"`);
      });
    } else {
      console.log('\nℹ️  순수 사용자 입력 데이터 없음');
    }

    // 3️⃣ 시스템 메타데이터 + 사용자 입력 혼합 데이터
    console.log('\n🔀 3️⃣ 혼합 데이터 (메타데이터 + 사용자 입력) 조회 중...');
    const mixedData = stats.filter(row => {
      if (!row.request_note) return false;
      const note = row.request_note;
      
      // 메타데이터가 있으면서 동시에 다른 텍스트도 있는 경우
      const hasMetadata = note.includes('[객실') ||
                         note.includes('[구성') ||
                         note.includes('[옵션') ||
                         note.includes('[OPTIONS:') ||
                         note.includes('[CHILD_OLDER_COUNTS:') ||
                         note.includes('[CHILD_BIRTH_DATES:') ||
                         note.includes('[INFANT_BIRTH_DATES:');
      
      // 사용자 입력 패턴
      const hasUserInput = note.includes('커넥팅룸') ||
                          note.includes('생일') ||
                          note.includes('창가') ||
                          note.includes('선택옵션') ||
                          note.includes('엑스트라') ||
                          note.includes('투어') ||
                          note.includes('베란다') ||
                          note.includes('스위트') ||
                          (note.length > 150);
      
      return hasMetadata && hasUserInput;
    });

    if (mixedData.length > 0) {
      console.log(`\n⚠️  혼합 데이터: ${mixedData.length}개`);
      console.log('\n샘플 데이터 (최대 10개):');
      mixedData.slice(0, 10).forEach((item, idx) => {
        const preview = item.request_note.substring(0, 100) + (item.request_note.length > 100 ? '...' : '');
        console.log(`  ${idx + 1}. (길이: ${item.request_note.length}) "${preview}"`);
      });
    } else {
      console.log('\n✅ 혼합 데이터 없음 (순수 메타데이터만 있음)');
    }

    // 4️⃣ 시스템 메타데이터만 있는 경우
    console.log('\n🤖 4️⃣ 순수 시스템 메타데이터만 있는 데이터 (삭제 안전) 조회 중...');
    const systemOnlyData = stats.filter(row => {
      if (!row.request_note) return false;
      const note = row.request_note;
      
      const hasMetadata = note.includes('[객실') ||
                         note.includes('[구성') ||
                         note.includes('[OPTIONS:') ||
                         note.includes('[CHILD_OLDER_COUNTS:');
      
      // 사용자 입력이 없는 경우 (순수 메타데이터만)
      const hasNoUserInput = !note.includes('커넥팅룸') &&
                            !note.includes('생일') &&
                            !note.includes('창가') &&
                            !note.includes('선택옵션') &&
                            !note.includes('투어') &&
                            !note.includes('베란다') &&
                            !note.includes('스위트') &&
                            note.length < 200;
      
      return hasMetadata && hasNoUserInput;
    });

    if (systemOnlyData.length > 0) {
      console.log(`\n✅ 순수 시스템 메타데이터: ${systemOnlyData.length}개 (삭제 가능)`);
      console.log('\n샘플 데이터 (최대 5개):');
      systemOnlyData.slice(0, 5).forEach((item, idx) => {
        console.log(`  ${idx + 1}. "${item.request_note}"`);
      });
    } else {
      console.log('\nℹ️  순수 시스템 메타데이터만 있는 데이터 없음');
    }

    // 5️⃣ 삭제 안전성 요약
    console.log('\n' + '='.repeat(60));
    console.log('📋 삭제 안전성 요약');
    console.log('='.repeat(60));
    
    const safeToDelete = systemOnlyData.length;
    const needsManualReview = mixedData.length;
    const doNotDelete = userInputData.length;

    console.log(`\n✅ 안전하게 삭제 가능: ${safeToDelete}개`);
    console.log(`   - 순수 시스템 생성 메타데이터만 포함`);
    console.log(`   - price_breakdown에 동일 정보 저장됨`);
    
    console.log(`\n⚠️  수동 검토 필요: ${needsManualReview}개`);
    console.log(`   - 시스템 메타데이터 + 사용자 입력 혼합`);
    console.log(`   - 사용자 입력 부분 추출 후 삭제 가능`);
    
    console.log(`\n❌ 절대 삭제 금지: ${doNotDelete}개`);
    console.log(`   - 사용자가 직접 입력한 요청사항`);
    console.log(`   - price_breakdown에 저장되지 않음`);
    
    console.log(`\n📊 전체 분석:`);
    console.log(`   - 전체 행: ${statsResult.total_rows}개`);
    console.log(`   - NULL 데이터: ${statsResult.null_count}개`);
    console.log(`   - 실제 데이터: ${statsResult.total_rows - statsResult.null_count}개`);
    console.log(`   - 삭제 가능: ${safeToDelete}개 (${((safeToDelete / (statsResult.total_rows - statsResult.null_count)) * 100).toFixed(1)}%)`);

    console.log('\n' + '='.repeat(60));
    console.log('✨ 점검 완료!');
    console.log('='.repeat(60));
    console.log('\n💡 다음 단계:');
    console.log('   1. 위 결과를 검토합니다');
    console.log('   2. 삭제 안전 데이터만 제거하는 SQL 작성');
    console.log('   3. 백업 후 점진적 삭제 실행');

  } catch (error) {
    console.error('❌ 오류 발생:', error);
    process.exit(1);
  }
}

checkRequestNotePatterns();
