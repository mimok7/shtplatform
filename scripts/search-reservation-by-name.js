#!/usr/bin/env node
/**
 * 박선형 같은 이름으로 오늘 예약 현황 검색
 * Usage: node scripts/search-reservation-by-name.js [name] [mode]
 *        name: 검색할 이름 (기본값: 박선형)
 *        mode: created (기본값) | checkin
 */

const { createClient } = require('@supabase/supabase-js');

const NAME = process.argv[2] || '박선형';
const MODE = process.argv[3] || 'created';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ 환경 변수가 설정되지 않았습니다:');
  console.error(`   NEXT_PUBLIC_SUPABASE_URL = ${SUPABASE_URL || '(미설정)'}`);
  console.error(`   SUPABASE_SERVICE_ROLE_KEY = ${SUPABASE_KEY ? '(설정됨)' : '(미설정)'}`);
  console.error('');
  console.error('설정 방법:');
  console.error('  export NEXT_PUBLIC_SUPABASE_URL="https://xxx.supabase.co"');
  console.error('  export SUPABASE_SERVICE_ROLE_KEY="eyJ..."');
  console.error('  node scripts/search-reservation-by-name.js');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function searchReservations() {
  try {
    console.log(`🔍 검색 중: "${NAME}" (${MODE === 'created' ? '생성일' : '체크인'} 기준)...`);
    console.log('');

    let query;

    if (MODE === 'created') {
      // 생성일(오늘) 기준
      query = supabase
        .from('reservation')
        .select(`
          re_id,
          re_type,
          re_status,
          re_created_at,
          users:re_user_id(name, email, phone_number)
        `)
        .gte('re_created_at', 'now()::date')
        .lt('re_created_at', '(now() + interval \'1 day\')::date');
    } else {
      // 체크인(오늘) 기준
      query = supabase
        .from('reservation')
        .select(`
          re_id,
          re_type,
          re_status,
          reservation_cruise:reservation_cruise(checkin),
          reservation_hotel:reservation_hotel(checkin),
          reservation_airport:reservation_airport(checkin),
          reservation_tour:reservation_tour(checkin),
          reservation_rentcar:reservation_rentcar(checkin),
          reservation_ticket:reservation_ticket(checkin),
          reservation_car_sht:reservation_car_sht(checkin),
          users:re_user_id(name, email, phone_number)
        `);
    }

    const { data, error } = await query;

    if (error) {
      console.error('❌ 쿼리 실행 오류:', error.message);
      process.exit(1);
    }

    if (!data || data.length === 0) {
      console.log(`✅ 결과 없음: "${NAME}"과 일치하는 ${MODE === 'created' ? '오늘 생성된' : '오늘 체크인'} 예약이 없습니다.`);
      process.exit(0);
    }

    // 이름 필터 (클라이언트 사이드)
    const filtered = data.filter(r => {
      const userName = r.users?.name || '';
      return userName.includes(NAME);
    });

    if (filtered.length === 0) {
      console.log(`✅ 결과 없음: "${NAME}"과 일치하는 사용자 예약이 없습니다.`);
      process.exit(0);
    }

    console.log(`✅ ${filtered.length}개 예약 발견:\n`);
    console.log('='.repeat(120));

    filtered.forEach((reservation, idx) => {
      const user = reservation.users || {};
      console.log(`\n[${idx + 1}] 예약 ID: ${reservation.re_id}`);
      console.log(`    이름: ${user.name || '(미설정)'}`);
      console.log(`    이메일: ${user.email || '(미설정)'}`);
      console.log(`    전화번호: ${user.phone_number || '(미설정)'}`);
      console.log(`    예약 유형: ${reservation.re_type}`);
      console.log(`    상태: ${reservation.re_status}`);
      console.log(`    생성 일시: ${reservation.re_created_at ? new Date(reservation.re_created_at).toLocaleString('ko-KR') : '(미설정)'}`);

      // 체크인 모드에서 각 서비스의 체크인 날짜 표시
      if (MODE === 'checkin') {
        const services = {
          'cruise': reservation.reservation_cruise,
          'hotel': reservation.reservation_hotel,
          'airport': reservation.reservation_airport,
          'tour': reservation.reservation_tour,
          'rentcar': reservation.reservation_rentcar,
          'ticket': reservation.reservation_ticket,
          'car_sht': reservation.reservation_car_sht,
        };
        const checkIns = Object.entries(services)
          .filter(([_, v]) => v && v.length > 0)
          .map(([name, items]) => `${name}: ${items.map(i => i.checkin).join(', ')}`)
          .join(', ');
        if (checkIns) {
          console.log(`    체크인 정보: ${checkIns}`);
        }
      }
    });

    console.log('\n' + '='.repeat(120));
  } catch (err) {
    console.error('❌ 오류:', err.message);
    process.exit(1);
  }
}

searchReservations();
