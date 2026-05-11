#!/usr/bin/env node
'use strict';

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESERVATION_ID = process.argv[2] || '65078917-1871-48dd-85b4-9ab72e5088cb';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Environment variables required');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function formatPrice(price) {
  return new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency: 'KRW',
    minimumFractionDigits: 0
  }).format(price || 0);
}

async function analyzeChanges() {
  console.log(`📊 예약 ID: ${RESERVATION_ID}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    const { data: reservation } = await supabase
      .from('reservation')
      .select('re_id, price_breakdown, re_update_at, re_created_at, re_status, total_amount')
      .eq('re_id', RESERVATION_ID)
      .single();

    if (!reservation || !reservation.price_breakdown) {
      console.error('❌ 예약이나 price_breakdown 데이터를 찾을 수 없습니다.');
      process.exit(1);
    }

    const pb = reservation.price_breakdown;

    console.log('🏗️ 가격 구조 (Price Breakdown)\n');

    // 기본 정보
    console.log('📌 기본 정보:');
    console.log(`   생성일: ${reservation.re_created_at}`);
    console.log(`   수정일: ${reservation.re_update_at}`);
    console.log(`   상태: ${reservation.re_status}`);
    console.log(`   DB 총액: ${formatPrice(reservation.total_amount)}\n`);

    // 1. 인원 정보
    console.log('👥 인원 정보:');
    if (pb.adult) {
      console.log(`   성인(Adult):`);
      console.log(`     - 명수: ${pb.adult.count || 0}명`);
      console.log(`     - 단가: ${formatPrice(pb.adult.unit_price)}`);
      console.log(`     - 소계: ${formatPrice(pb.adult.total)}`);
    }
    if (pb.child) {
      console.log(`   아동(Child):`);
      console.log(`     - 명수: ${pb.child.count || 0}명`);
      console.log(`     - 단가: ${formatPrice(pb.child.unit_price)}`);
      console.log(`     - 소계: ${formatPrice(pb.child.total)}`);
    }
    if (pb.child_older) {
      console.log(`   연장아동(Child Older):`);
      console.log(`     - 명수: ${pb.child_older.count || 0}명`);
      console.log(`     - 단가: ${formatPrice(pb.child_older.unit_price)}`);
      console.log(`     - 소계: ${formatPrice(pb.child_older.total)}`);
    }
    if (pb.infant) {
      console.log(`   유아(Infant):`);
      console.log(`     - 명수: ${pb.infant.count || 0}명`);
      console.log(`     - 단가: ${formatPrice(pb.infant.unit_price)}`);
      console.log(`     - 소계: ${formatPrice(pb.infant.total)}`);
    }
    if (pb.extra_bed) {
      console.log(`   엑스트라베드(Extra Bed):`);
      console.log(`     - 수량: ${pb.extra_bed.count || 0}개`);
      console.log(`     - 단가: ${formatPrice(pb.extra_bed.unit_price)}`);
      console.log(`     - 소계: ${formatPrice(pb.extra_bed.total)}`);
    }
    if (pb.child_extra_bed) {
      console.log(`   아동 엑스트라베드(Child Extra Bed):`);
      console.log(`     - 수량: ${pb.child_extra_bed.count || 0}개`);
      console.log(`     - 단가: ${formatPrice(pb.child_extra_bed.unit_price)}`);
      console.log(`     - 소계: ${formatPrice(pb.child_extra_bed.total)}`);
    }
    if (pb.single) {
      console.log(`   싱글(Single):`);
      console.log(`     - 수량: ${pb.single.count || 0}개`);
      console.log(`     - 단가: ${formatPrice(pb.single.unit_price)}`);
      console.log(`     - 소계: ${formatPrice(pb.single.total)}`);
    }
    console.log('');

    // 2. 객실 정보
    if (pb.rooms && Array.isArray(pb.rooms)) {
      console.log(`🏨 객실 정보 (${pb.rooms.length}개):\n`);
      pb.rooms.forEach((room, idx) => {
        console.log(`   [객실 ${idx + 1}]`);
        console.log(`     크루즈: ${room.cruise || 'N/A'}`);
        console.log(`     객실명: ${room.room_type || 'N/A'}`);
        console.log(`     스케줄: ${room.schedule || 'N/A'}`);
        console.log(`     체크인: ${room.checkin || 'N/A'}`);
        console.log(`     객실수: ${room.room_count || 1}개`);
        console.log(`     게스트수: ${room.guest_count || 0}명`);
        
        if (room.adult) {
          console.log(`     ├─ 성인: ${room.adult.count}명 × ${formatPrice(room.adult.unit_price)} = ${formatPrice(room.adult.total)}`);
        }
        if (room.child && room.child.count > 0) {
          console.log(`     ├─ 아동: ${room.child.count}명 × ${formatPrice(room.child.unit_price)} = ${formatPrice(room.child.total)}`);
        }
        if (room.child_older && room.child_older.count > 0) {
          console.log(`     ├─ 연장아동: ${room.child_older.count}명 × ${formatPrice(room.child_older.unit_price)} = ${formatPrice(room.child_older.total)}`);
        }
        if (room.infant && room.infant.count > 0) {
          console.log(`     ├─ 유아: ${room.infant.count}명 × ${formatPrice(room.infant.unit_price)} = ${formatPrice(room.infant.total)}`);
        }
        if (room.extra_bed && room.extra_bed.count > 0) {
          console.log(`     ├─ 엑베: ${room.extra_bed.count}개 × ${formatPrice(room.extra_bed.unit_price)} = ${formatPrice(room.extra_bed.total)}`);
        }
        if (room.child_extra_bed && room.child_extra_bed.count > 0) {
          console.log(`     ├─ 아동엑베: ${room.child_extra_bed.count}개 × ${formatPrice(room.child_extra_bed.unit_price)} = ${formatPrice(room.child_extra_bed.total)}`);
        }
        if (room.single && room.single.count > 0) {
          console.log(`     ├─ 싱글: ${room.single.count}개 × ${formatPrice(room.single.unit_price)} = ${formatPrice(room.single.total)}`);
        }
        console.log(`     └─ 객실 소계: ${formatPrice(room.total)}`);
        
        if (room.category_prices_manual) {
          console.log(`     ⚠️  수동 가격 설정됨 (category_prices_manual: true)`);
        }
        console.log('');
      });
    }

    // 3. 옵션
    if (pb.options && Array.isArray(pb.options) && pb.options.length > 0) {
      console.log(`🎁 추가 옵션 (${pb.options.length}개):\n`);
      pb.options.forEach((option, idx) => {
        console.log(`   [옵션 ${idx + 1}] ${option.name || 'N/A'}`);
        console.log(`     - 수량: ${option.quantity || 1}`);
        console.log(`     - 단가: ${formatPrice(option.price)}`);
        console.log(`     - 소계: ${formatPrice(option.total)}`);
      });
      console.log(`   옵션 총합: ${formatPrice(pb.options_total)}\n`);
    } else {
      console.log('🎁 추가 옵션: 없음\n');
    }

    // 4. 차량
    if (pb.car_total && pb.car_total > 0) {
      console.log(`🚗 차량 비용: ${formatPrice(pb.car_total)}\n`);
    }

    // 5. 수수료 및 할인
    console.log('💰 수수료 및 할인:\n');
    if (pb.additional_fee_items && Array.isArray(pb.additional_fee_items) && pb.additional_fee_items.length > 0) {
      console.log(`   추가 수수료 항목 (${pb.additional_fee_items.length}개):`);
      pb.additional_fee_items.forEach((item, idx) => {
        console.log(`     [${idx + 1}] ${item.name || 'N/A'}: ${formatPrice(item.amount)}`);
      });
      console.log(`     소계: ${formatPrice(pb.additional_fee)}`);
    } else {
      console.log(`   추가 수수료: ${formatPrice(pb.additional_fee || 0)}`);
    }

    if (pb.discount_sequence && Array.isArray(pb.discount_sequence) && pb.discount_sequence.length > 0) {
      console.log(`\n   할인 항목 (${pb.discount_sequence.length}개):`);
      pb.discount_sequence.forEach((discount, idx) => {
        console.log(`     [${idx + 1}] ${discount.name || 'N/A'}`);
        console.log(`         비율: ${discount.rate || 0}%`);
        console.log(`         금액: ${formatPrice(discount.amount)}`);
      });
      console.log(`     소계: ${formatPrice(pb.discount_amount)}`);
    } else {
      console.log(`\n   할인: ${formatPrice(pb.discount_amount || 0)}`);
    }

    if (pb.manual_additional_fee_detail) {
      console.log(`\n   수동 추가요금 설명: ${pb.manual_additional_fee_detail}`);
    }
    console.log('');

    // 6. 합계
    console.log('📊 금액 합계:\n');
    console.log(`   기본 소계(Subtotal): ${formatPrice(pb.subtotal)}`);
    if (pb.surcharge_total && pb.surcharge_total > 0) {
      console.log(`   + 추가료금(Surcharge): ${formatPrice(pb.surcharge_total)}`);
    }
    if (pb.additional_fee && pb.additional_fee > 0) {
      console.log(`   + 추가 수수료: ${formatPrice(pb.additional_fee)}`);
    }
    if (pb.discount_amount && pb.discount_amount > 0) {
      console.log(`   - 할인: ${formatPrice(pb.discount_amount)}`);
    }
    if (pb.car_total && pb.car_total > 0) {
      console.log(`   + 차량비: ${formatPrice(pb.car_total)}`);
    }
    if (pb.options_total && pb.options_total > 0) {
      console.log(`   + 옵션: ${formatPrice(pb.options_total)}`);
    }
    console.log(`   ─────────────────────`);
    console.log(`   최종 합계: ${formatPrice(pb.grand_total || pb.calculated_total)}`);
    console.log('');

    // 7. 메타정보
    if (pb.mode || pb.is_day_tour !== undefined || pb.is_promotion !== undefined) {
      console.log('⚙️ 메타 정보:\n');
      if (pb.mode) console.log(`   모드: ${pb.mode}`);
      if (pb.is_day_tour !== undefined) console.log(`   일일투어: ${pb.is_day_tour ? '예' : '아니오'}`);
      if (pb.is_promotion !== undefined) console.log(`   프로모션: ${pb.is_promotion ? '예' : '아니오'}`);
      if (pb.season_name) console.log(`   시즌: ${pb.season_name}`);
      if (pb.rate_card_id) console.log(`   레이트카드 ID: ${pb.rate_card_id}`);
      console.log('');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

analyzeChanges();
