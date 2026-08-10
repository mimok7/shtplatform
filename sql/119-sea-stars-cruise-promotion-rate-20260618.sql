-- 씨스타 크루즈 1박 2일 프로모션 요금과 휴일 추가요금을 추가하는 스크립트
-- 근거: 2026-06-18 네이버 카페 게시글. 적용: 2026-06-18 ~ 2026-12-31 승선.
-- 기존 기본요금은 수정·삭제하지 않고 프로모션 행만 중복 없이 추가한다.

BEGIN;

WITH source_rows AS (
  SELECT *
  FROM (
    VALUES
      ('디럭스룸'::text, 'Deluxe Room'::text, 4350000::numeric, 2800000::numeric, 4150000::numeric, 3500000::numeric, 7500000::numeric, true, true, 1::integer),
      ('이그제큐티브'::text, 'Executive'::text, 4650000::numeric, 2800000::numeric, 4150000::numeric, 3800000::numeric, 7700000::numeric, true, true, 2::integer),
      ('이그제큐티브 트리플'::text, 'Executive Triple'::text, 4900000::numeric, 2800000::numeric, NULL::numeric, NULL::numeric, NULL::numeric, false, false, 3::integer),
      ('프리미엄 이그제큐티브'::text, 'Premium Executive'::text, 4850000::numeric, 2800000::numeric, 4150000::numeric, 4000000::numeric, 8600000::numeric, true, true, 4::integer),
      ('주니어 스위트'::text, 'Junior Suite'::text, 8150000::numeric, 2800000::numeric, 4150000::numeric, 6550000::numeric, 13250000::numeric, true, true, 5::integer),
      ('캡틴 스위트'::text, 'Captain Suite'::text, 9100000::numeric, 2800000::numeric, 4150000::numeric, 7300000::numeric, 16200000::numeric, true, true, 6::integer),
      ('로얄 스위트'::text, 'Royal Suite'::text, 11900000::numeric, 2800000::numeric, 4150000::numeric, 9550000::numeric, 20700000::numeric, true, true, 7::integer)
  ) AS v(room_type, room_type_en, price_adult, price_child, price_child_extra_bed, price_extra_bed, price_single, extra_bed_available, single_available, display_order)
)
INSERT INTO public.cruise_rate_card (
  cruise_name, schedule_type, room_type, room_type_en,
  price_adult, price_child, price_child_older, price_child_extra_bed,
  price_infant, price_extra_bed, price_single,
  valid_year, valid_from, valid_to, display_order, currency, is_active, notes,
  extra_bed_available, includes_vehicle, vehicle_type, infant_policy,
  season_name, is_promotion, child_age_range, single_available
)
SELECT
  '씨스타 크루즈'::text,
  '1N2D'::text,
  source.room_type,
  source.room_type_en,
  source.price_adult,
  source.price_child,
  source.price_child,
  source.price_child_extra_bed,
  NULL::numeric,
  source.price_extra_bed,
  source.price_single,
  2026::integer,
  DATE '2026-06-18',
  DATE '2026-12-31',
  source.display_order,
  'VND'::text,
  true,
  '2026-06-18 게시 프로모션 요금. 5-11세 아동 2,800,000동. 5-10세 아동 엑스트라베드 4,150,000동. 성인 2인+5세 미만 아동 1인은 무료, 5세 미만 아동 2인은 2,850,000동 추가. 승선 5일 전부터 신규 예약 불가.'::text,
  source.extra_bed_available,
  false,
  NULL::text,
  '성인 2인+5세 미만 아동 1인은 무료. 5세 미만 아동 2인은 2,850,000동 추가.'::text,
  '2026 프로모션'::text,
  true,
  '5-11세'::text,
  source.single_available
FROM source_rows AS source
WHERE NOT EXISTS (
  SELECT 1
  FROM public.cruise_rate_card AS existing
  WHERE existing.cruise_name = '씨스타 크루즈'
    AND existing.schedule_type = '1N2D'
    AND existing.room_type = source.room_type
    AND existing.valid_year = 2026::integer
    AND existing.valid_from = DATE '2026-06-18'
    AND existing.valid_to = DATE '2026-12-31'
    AND existing.is_promotion IS TRUE
)
RETURNING room_type, valid_from, valid_to, price_adult, price_child, price_child_extra_bed, price_extra_bed, price_single, season_name;

WITH source_rows AS (
  SELECT *
  FROM (
    VALUES
      (DATE '2026-08-30', DATE '2026-09-02', '국경절 연휴'::text, 1150000::numeric),
      (DATE '2026-12-24', NULL::date, '크리스마스 이브'::text, 1150000::numeric),
      (DATE '2026-12-31', NULL::date, '연말연시'::text, 1150000::numeric)
  ) AS v(holiday_date, holiday_date_end, holiday_name, surcharge_per_person)
)
INSERT INTO public.cruise_holiday_surcharge (
  cruise_name, schedule_type, holiday_date, holiday_date_end, holiday_name,
  surcharge_per_person, surcharge_type, valid_year, is_confirmed, currency, notes, surcharge_child
)
SELECT
  '씨스타 크루즈'::text,
  '1N2D'::text,
  source.holiday_date,
  source.holiday_date_end,
  source.holiday_name,
  source.surcharge_per_person,
  'per_person'::text,
  2026::integer,
  true,
  'VND'::text,
  '2026 프로모션 휴일 추가요금. 원문상 1인당 2,500,000동에서 1,150,000동으로 할인.'::text,
  NULL::numeric
FROM source_rows AS source
WHERE NOT EXISTS (
  SELECT 1
  FROM public.cruise_holiday_surcharge AS existing
  WHERE existing.cruise_name = '씨스타 크루즈'
    AND existing.schedule_type = '1N2D'
    AND existing.holiday_date = source.holiday_date
    AND existing.holiday_date_end IS NOT DISTINCT FROM source.holiday_date_end
    AND existing.holiday_name = source.holiday_name
    AND existing.valid_year = 2026::integer
)
RETURNING holiday_name, holiday_date, holiday_date_end, surcharge_per_person, valid_year;

SELECT
  room_type, valid_from, valid_to, price_adult, price_child,
  price_child_extra_bed, price_extra_bed, price_single, season_name, is_promotion, is_active
FROM public.cruise_rate_card
WHERE cruise_name = '씨스타 크루즈'
  AND schedule_type = '1N2D'
  AND valid_year = 2026::integer
  AND valid_from = DATE '2026-06-18'
  AND valid_to = DATE '2026-12-31'
  AND is_promotion IS TRUE
ORDER BY display_order, room_type;

SELECT holiday_name, holiday_date, holiday_date_end, surcharge_per_person, surcharge_child, notes
FROM public.cruise_holiday_surcharge
WHERE cruise_name = '씨스타 크루즈'
  AND schedule_type = '1N2D'
  AND valid_year = 2026::integer
  AND holiday_date IN (DATE '2026-08-30', DATE '2026-12-24', DATE '2026-12-31')
ORDER BY holiday_date;

COMMIT;