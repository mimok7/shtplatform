#!/usr/bin/env node
/**
 * 박선형 예약 현황 검색 — 자동 환경 설정 + 쿼리 실행
 * 
 * Usage:
 *   node scripts/search-by-name-auto.js [name] [mode]
 *   
 * 동작 방식:
 *   1. 환경 변수 자동 감지 (시스템/파일)
 *   2. 감지 실패 시 대화형 입력 요청
 *   3. 쿼리 실행 및 결과 출력
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const NAME = process.argv[2] || '박선형';
const MODE = process.argv[3] || 'created';

let SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
let SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const ENV_FILE = path.join(process.env.HOME || process.env.USERPROFILE, '.sht-platform.env');

/**
 * 환경 파일에서 변수 로드
 */
function loadFromEnvFile() {
  if (fs.existsSync(ENV_FILE)) {
    const content = fs.readFileSync(ENV_FILE, 'utf-8');
    const urlMatch = content.match(/NEXT_PUBLIC_SUPABASE_URL="([^"]+)"/);
    const keyMatch = content.match(/SUPABASE_SERVICE_ROLE_KEY="([^"]+)"/);
    
    if (urlMatch) SUPABASE_URL = urlMatch[1];
    if (keyMatch) SUPABASE_KEY = keyMatch[1];
  }
}

/**
 * 대화형 입력
 */
async function promptForCredentials() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    console.log('\n❌ Supabase 환경 변수를 찾을 수 없습니다.\n');
    console.log('📝 다음 정보를 입력해주세요 (Supabase Dashboard에서 확인 가능):');
    console.log('   → https://app.supabase.com/projects\n');

    rl.question('1. NEXT_PUBLIC_SUPABASE_URL (https://xxx.supabase.co): ', (url) => {
      rl.question(
        '2. SUPABASE_SERVICE_ROLE_KEY (Service Role Secret): ',
        (key) => {
          rl.close();

          if (!url || !key) {
            console.error('❌ 필수 정보가 누락되었습니다.');
            process.exit(1);
          }

          SUPABASE_URL = url;
          SUPABASE_KEY = key;

          // 저장 여부 확인
          rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
          });

          rl.question(`\n저장해서 다음에 자동으로 사용할까요? (${ENV_FILE}) [y/n]: `, (ans) => {
            rl.close();
            if (ans.toLowerCase() === 'y') {
              saveCredentials();
            }
            resolve();
          });
        }
      );
    });
  });
}

/**
 * 환경 정보 저장
 */
function saveCredentials() {
  const content = `export NEXT_PUBLIC_SUPABASE_URL="${SUPABASE_URL}"
export SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_KEY}"
`;
  fs.writeFileSync(ENV_FILE, content, { mode: 0o600 });
  console.log(`✅ 저장됨: ${ENV_FILE}`);
}

/**
 * 검색 실행
 */
async function searchReservations() {
  const { createClient } = require('@supabase/supabase-js');

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌ 환경 변수가 여전히 설정되지 않았습니다.');
    process.exit(1);
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    console.log(`\n🔍 검색 중: "${NAME}" (${MODE === 'created' ? '생성일' : '체크인'} 기준)...`);
    console.log('');

    let query;

    if (MODE === 'created') {
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
      console.error('   확인사항:');
      console.error('   - Supabase 정보가 정확한지 확인해주세요.');
      console.error('   - 서비스 역할 키(Secret)를 사용했는지 확인해주세요.');
      process.exit(1);
    }

    if (!data || data.length === 0) {
      console.log(`✅ 결과 없음: 오늘 생성되거나 체크인 예정인 예약이 없습니다.`);
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

    // 결과 출력
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
      console.log(
        `    생성 일시: ${
          reservation.re_created_at
            ? new Date(reservation.re_created_at).toLocaleString('ko-KR')
            : '(미설정)'
        }`
      );

      if (MODE === 'checkin') {
        const services = {
          cruise: reservation.reservation_cruise,
          hotel: reservation.reservation_hotel,
          airport: reservation.reservation_airport,
          tour: reservation.reservation_tour,
          rentcar: reservation.reservation_rentcar,
          ticket: reservation.reservation_ticket,
          car_sht: reservation.reservation_car_sht,
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
    console.log('\n✅ 검색 완료!\n');
  } catch (err) {
    console.error('❌ 오류:', err.message);
    process.exit(1);
  }
}

/**
 * 메인
 */
async function main() {
  loadFromEnvFile();

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    await promptForCredentials();
  }

  await searchReservations();
}

main();
