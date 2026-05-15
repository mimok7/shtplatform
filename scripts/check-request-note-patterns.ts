#!/usr/bin/env node
/**
 * 🔍 reservation_cruise.request_note 데이터 점검 스크립트
 * - 시스템 생성 메타데이터 패턴 분석
 * - 사용자 입력 데이터 확인
 * - 삭제 안전성 검토
 * 
 * 실행: pnpm tsx scripts/check-request-note-patterns.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY 환경변수 필요');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

interface RequestNoteStats {
  total_rows: number;
  null_count: number;
  room_composition_pattern: number;
  catherine_pattern: number;
  option_pattern: number;
  options_tag_pattern: number;
  child_older_pattern: number;
  child_birth_pattern: number;
  infant_birth_pattern: number;
}

interface UserInputData {
  request_note: string;
  count: number;
}

interface MixedData {
  reservation_id: string;
  request_note: string;
  length: number;
}

async function checkRequestNotePatterns() {
  console.log('🔍 reservation_cruise.request_note 데이터 점검 시작...\n');

  try {
    // 1️⃣ 통계 조회
    console.log('📊 1️⃣ 전체 통계 조회 중...');
    const { data: stats, error: statsError } = await supabase
      .from('reservation_cruise')
      .select('request_note')
      .returns<{ request_note: string | null }[]>();

    if (statsError) {
      console.error('❌ 통계 조회 오류:', statsError);
      return;
    }

    if (!stats) {
      console.log('📭 데이터 없음');
      return;
    }

    const statsResult: RequestNoteStats = {
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
      
      // 사용자 입력 패턴 (커넥팅룸, 생일, 창가 등)
      const hasUserInput = note.includes('커넥팅룸') ||
                          note.includes('생일') ||
                          note.includes('창가') ||
                          note.includes('선택옵션') ||
                          note.includes('엑스트라') ||
                          note.includes('투어') ||
                          (note.length > 150 && !note.match(/^\[객실 \d+\].*\| 성인 \d+.*$/));
      
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
      
      // 사용자 입력이 없는 경우
      const hasNoUserInput = !note.includes('커넥팅룸') &&
                            !note.includes('생일') &&
                            !note.includes('창가') &&
                            !note.includes('선택옵션') &&
                            !note.includes('투어') &&
                            // 순수 시스템 패턴: [객실] | 성인 X, 아동 Y 형식
                            note.match(/^\[(?:객실|구성|옵션) \d+\].*?\| 성인 \d+.*$/);
      
      return hasMetadata && hasNoUserInput;
    });

    if (systemOnlyData.length > 0) {
      console.log(`\n✅ 순수 시스템 메타데이터: ${systemOnlyData.length}개 (삭제 가능)`);
      console.log('\n샘플 데이터 (최대 5개):');
      systemOnlyData.slice(0, 5).forEach((item, idx) => {
        console.log(`  ${idx + 1}. "${item.request_note}"`);
      });
    } else {
      console.log('\n ℹ️ 순수 시스템 메타데이터만 있는 데이터 없음');
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
    
    console.log(`\n📊 통계:`);
    console.log(`   - 전체: ${statsResult.total_rows}개`);
    console.log(`   - NULL: ${statsResult.null_count}개`);
    console.log(`   - 실제 데이터: ${statsResult.total_rows - statsResult.null_count}개`);

    console.log('\n' + '='.repeat(60));
    console.log('✨ 점검 완료!');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('❌ 오류 발생:', error);
    process.exit(1);
  }
}

checkRequestNotePatterns();
