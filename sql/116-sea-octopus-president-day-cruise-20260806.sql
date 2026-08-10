-- 씨옥토퍼스 프레지던트 크루즈 당일 투어 오프닝 프로모션 요금을 추가하는 스크립트
-- 원본: 2026-08-05 네이버 카페 게시글.
-- 적용 기간: 2026-08-01 ~ 2026-12-31, 2027-01-01 ~ 2027-12-31 승선.
-- 2027년 요금은 2026년 오프닝 프로모션 요금과 동일하게 적용한다.
-- 원문에 없는 유아, 엑스트라베드, 싱글차지 요금은 임의로 등록하지 않는다.

BEGIN;

WITH source_rows AS (
  SELECT *
  FROM (
    VALUES
      (
        '씨옥토퍼스 프레지던트 크루즈'::text,
        'DAY'::text,
        '크루즈 셔틀 왕복 포함'::text,
        'Round-trip Cruise Shuttle Included'::text,
        2000000::numeric,
        1850000::numeric,
        NULL::numeric,
        NULL::numeric,
        NULL::numeric,
        2026::integer,
        DATE '2026-08-01',
        DATE '2026-12-31',
        1::integer,
        'VND'::text,
        true,
        '크루즈 셔틀 왕복 포함. 웰컴드링크, 조식, 점심식사, 카약 또는 뱀부보트, 애프터눈티 세트, 크루즈 직원 영어 가이드, 선상안전보험 포함. 음료·주류, 항공권·호텔 숙박, VIP 라운지는 별도 결제.'::text,
        NULL::numeric,
        false,
        true,
        '크루즈 셔틀 왕복'::text,
        '유아 요금은 원문 미공지'::text,
        '오프닝 프로모션'::text,
        true,
        NULL::numeric,
        '5~11세'::text,
        false
      ),
      (
        '씨옥토퍼스 프레지던트 크루즈'::text,
        'DAY'::text,
        '크루즈 티켓 단독'::text,
        'Cruise Ticket Only'::text,
        1300000::numeric,
        1050000::numeric,
        NULL::numeric,
        NULL::numeric,
        NULL::numeric,
        2026::integer,
        DATE '2026-08-01',
        DATE '2026-12-31',
        2::integer,
        'VND'::text,
        true,
        '크루즈 티켓 단독. 웰컴드링크, 조식, 점심식사, 카약 또는 뱀부보트, 애프터눈티 세트, 크루즈 직원 영어 가이드, 선상안전보험 포함. 음료·주류, 항공권·호텔 숙박, VIP 라운지는 별도 결제.'::text,
        NULL::numeric,
        false,
        false,
        NULL::text,
        '유아 요금은 원문 미공지'::text,
        '오프닝 프로모션'::text,
        true,
        NULL::numeric,
        '5~11세'::text,
        false
      ),
      (
        '씨옥토퍼스 프레지던트 크루즈'::text,
        'DAY'::text,
        '크루즈 셔틀 왕복 포함'::text,
        'Round-trip Cruise Shuttle Included'::text,
        2000000::numeric,
        1850000::numeric,
        NULL::numeric,
        NULL::numeric,
        NULL::numeric,
        2027::integer,
        DATE '2027-01-01',
        DATE '2027-12-31',
        1::integer,
        'VND'::text,
        true,
        '크루즈 셔틀 왕복 포함. 웰컴드링크, 조식, 점심식사, 카약 또는 뱀부보트, 애프터눈티 세트, 크루즈 직원 영어 가이드, 선상안전보험 포함. 음료·주류, 항공권·호텔 숙박, VIP 라운지는 별도 결제. 2027년 요금은 2026년 오프닝 프로모션과 동일.'::text,
        NULL::numeric,
        false,
        true,
        '크루즈 셔틀 왕복'::text,
        '유아 요금은 원문 미공지'::text,
        '2027년 동일 요금'::text,
        true,
        NULL::numeric,
        '5~11세'::text,
        false
      ),
      (
        '씨옥토퍼스 프레지던트 크루즈'::text,
        'DAY'::text,
        '크루즈 티켓 단독'::text,
        'Cruise Ticket Only'::text,
        1300000::numeric,
        1050000::numeric,
        NULL::numeric,
        NULL::numeric,
        NULL::numeric,
        2027::integer,
        DATE '2027-01-01',
        DATE '2027-12-31',
        2::integer,
        'VND'::text,
        true,
        '크루즈 티켓 단독. 웰컴드링크, 조식, 점심식사, 카약 또는 뱀부보트, 애프터눈티 세트, 크루즈 직원 영어 가이드, 선상안전보험 포함. 음료·주류, 항공권·호텔 숙박, VIP 라운지는 별도 결제. 2027년 요금은 2026년 오프닝 프로모션과 동일.'::text,
        NULL::numeric,
        false,
        false,
        NULL::text,
        '유아 요금은 원문 미공지'::text,
        '2027년 동일 요금'::text,
        true,
        NULL::numeric,
        '5~11세'::text,
        false
      )
  ) AS v (
    cruise_name,
    schedule_type,
    room_type,
    room_type_en,
    price_adult,
    price_child,
    price_infant,
    price_extra_bed,
    price_single,
    valid_year,
    valid_from,
    valid_to,
    display_order,
    currency,
    is_active,
    notes,
    price_child_extra_bed,
    extra_bed_available,
    includes_vehicle,
    vehicle_type,
    infant_policy,
    season_name,
    is_promotion,
    price_child_older,
    child_age_range,
    single_available
  )
)
INSERT INTO public.cruise_rate_card (
  cruise_name,
  schedule_type,
  room_type,
  room_type_en,
  price_adult,
  price_child,
  price_infant,
  price_extra_bed,
  price_single,
  valid_year,
  valid_from,
  valid_to,
  display_order,
  currency,
  is_active,
  notes,
  price_child_extra_bed,
  extra_bed_available,
  includes_vehicle,
  vehicle_type,
  infant_policy,
  season_name,
  is_promotion,
  price_child_older,
  child_age_range,
  single_available
)
SELECT
  source.cruise_name,
  source.schedule_type,
  source.room_type,
  source.room_type_en,
  source.price_adult,
  source.price_child,
  source.price_infant,
  source.price_extra_bed,
  source.price_single,
  source.valid_year,
  source.valid_from,
  source.valid_to,
  source.display_order,
  source.currency,
  source.is_active,
  source.notes,
  source.price_child_extra_bed,
  source.extra_bed_available,
  source.includes_vehicle,
  source.vehicle_type,
  source.infant_policy,
  source.season_name,
  source.is_promotion,
  source.price_child_older,
  source.child_age_range,
  source.single_available
FROM source_rows AS source
WHERE NOT EXISTS (
  SELECT 1
  FROM public.cruise_rate_card AS existing
  WHERE existing.cruise_name = source.cruise_name
    AND existing.schedule_type = source.schedule_type
    AND existing.room_type = source.room_type
    AND existing.valid_year = source.valid_year
    AND existing.valid_from = source.valid_from
    AND existing.valid_to = source.valid_to
)
RETURNING
  id,
  cruise_name,
  room_type,
  valid_from,
  valid_to,
  price_adult,
  price_child,
  includes_vehicle;

SELECT
  cruise_name,
  schedule_type,
  room_type,
  valid_from,
  valid_to,
  price_adult,
  price_child,
  includes_vehicle,
  vehicle_type,
  child_age_range,
  season_name,
  is_active
FROM public.cruise_rate_card
WHERE cruise_name = '씨옥토퍼스 프레지던트 크루즈'
  AND schedule_type = 'DAY'
  AND ((valid_year = 2026::integer AND valid_from = DATE '2026-08-01' AND valid_to = DATE '2026-12-31')
    OR (valid_year = 2027::integer AND valid_from = DATE '2027-01-01' AND valid_to = DATE '2027-12-31'))
ORDER BY display_order, room_type;

COMMIT;
