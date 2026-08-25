// 레거시 옌뜨 호텔 프레지덴셜 스위트 요금 추가 마이그레이션 실행 스크립트
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://jkhookaflhibrcafmlxn.supabase.co';
const SERVICE_ROLE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpraG9va2FmbGhpYnJjYWZtbHhuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTgzMjgzMCwiZXhwIjoyMDY3NDA4ODMwfQ.KmBE7PA-ns2_HLbq8rhZe-hOeRlKoZ_phawRCvtGPSE';

const client = createClient(SUPABASE_URL, SERVICE_ROLE);

async function run() {
  console.log('🚀 프레지덴셜 스위트 요금 추가 마이그레이션 실행 중... (exec_sql RPC 미존재로 직접 INSERT 사용)');

  const { data: existing, error: existErr } = await client
    .from('hotel_price')
    .select('hotel_price_code')
    .eq('hotel_price_code', 'LEGACY_YENTU_PRESIDENTIAL_SUITE_2026');

  if (existErr) {
    console.error('❌ 중복 확인 실패:', existErr);
    process.exit(1);
  }

  if (existing && existing.length > 0) {
    console.log('ℹ️ 이미 존재하는 행입니다. INSERT를 건너뜁니다.');
  } else {
    const { error: insertErr } = await client.from('hotel_price').insert({
      hotel_price_code: 'LEGACY_YENTU_PRESIDENTIAL_SUITE_2026',
      hotel_code: 'LEGACY_YENTU',
      hotel_name: '레거시 옌뜨, MGALLERY 호텔',
      room_type: 'PRESIDENTIAL_SUITE',
      room_name: '프레지덴셜 스위트',
      room_category: 'SUITE',
      include_breakfast: true,
      base_price: 12300000,
      extra_person_price: null,
      child_policy: null,
      season_name: '2026 일반요금',
      start_date: '2026-01-01',
      end_date: '2026-12-31',
      weekday_type: 'ALL',
      notes: '수영장이 보이는 뷰. 조식 포함.'
    });

    if (insertErr) {
      console.error('❌ 마이그레이션 실패:', insertErr);
      process.exit(1);
    }
    console.log('✅ 마이그레이션 성공');
  }

  const { data: rows, error: verifyErr } = await client
    .from('hotel_price')
    .select('hotel_price_code, room_type, room_name, base_price, weekday_type, notes')
    .eq('hotel_code', 'LEGACY_YENTU')
    .eq('room_type', 'PRESIDENTIAL_SUITE');

  if (verifyErr) {
    console.error('❌ 검증 조회 실패:', verifyErr);
    return;
  }
  console.log('📋 검증 결과:', rows);
}

run().catch(console.error);
