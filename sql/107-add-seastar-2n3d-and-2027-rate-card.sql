-- 씨스타 크루즈의 2박 3일 및 2027년 요금을 안전하게 추가하는 스크립트
--
-- 원본: 2026년 1박 2일 활성 요금 7개 객실.
-- 추가: 2026년 2박 3일(1박 요금의 2배), 2027년 1박 2일(2026년과 동일),
--       2027년 2박 3일(2026년 1박 요금의 2배).
-- 기존 행은 변경·삭제하지 않으며, 동일한 일정·객실·기간 행이 있으면 추가하지 않는다.

BEGIN;

DO $$
DECLARE
  source_count integer;
BEGIN
  SELECT COUNT(*)
  INTO source_count
  FROM public.cruise_rate_card
  WHERE cruise_name = '씨스타 크루즈'
    AND schedule_type = '1N2D'
    AND valid_year = 2026::integer
    AND valid_from = DATE '2026-01-01'
    AND valid_to = DATE '2026-12-31'
    AND is_active IS TRUE;

  IF source_count <> 7 THEN
    RAISE EXCEPTION
      '씨스타 크루즈 2026년 1박 2일 원본 요금은 7개 객실이어야 합니다. 현재 %개입니다.',
      source_count;
  END IF;
END $$;

WITH source_rows AS (
  SELECT
    crc.cruise_name,
    crc.room_type,
    crc.room_type_en,
    crc.price_adult,
    crc.price_child,
    crc.price_child_older,
    crc.price_child_extra_bed,
    crc.price_infant,
    crc.price_extra_bed,
    crc.price_single,
    crc.display_order,
    crc.currency,
    crc.is_active,
    crc.notes,
    crc.extra_bed_available,
    crc.includes_vehicle,
    crc.vehicle_type,
    crc.infant_policy,
    crc.is_promotion,
    crc.child_age_range,
    crc.single_available
  FROM public.cruise_rate_card AS crc
  WHERE crc.cruise_name = '씨스타 크루즈'
    AND crc.schedule_type = '1N2D'
    AND crc.valid_year = 2026::integer
    AND crc.valid_from = DATE '2026-01-01'
    AND crc.valid_to = DATE '2026-12-31'
    AND crc.is_active IS TRUE
), rate_plans AS (
  SELECT *
  FROM (
    VALUES
      (
        '2N3D'::text,
        2026::integer,
        DATE '2026-01-01',
        DATE '2026-12-31',
        2::numeric,
        '2026 기본요금 (2박3일)'::text,
        '2박3일 요금은 2026년 1박2일 요금의 2배로 적용.'::text
      ),
      (
        '1N2D'::text,
        2027::integer,
        DATE '2027-01-01',
        DATE '2027-12-31',
        1::numeric,
        '2027 기본요금'::text,
        '2027년 1박2일 요금은 2026년 기본요금과 동일하게 적용.'::text
      ),
      (
        '2N3D'::text,
        2027::integer,
        DATE '2027-01-01',
        DATE '2027-12-31',
        2::numeric,
        '2027 기본요금 (2박3일)'::text,
        '2027년 2박3일 요금은 2026년 1박2일 요금의 2배로 적용.'::text
      )
  ) AS plan (
    schedule_type,
    valid_year,
    valid_from,
    valid_to,
    price_multiplier,
    season_name,
    note_suffix
  )
), target_rows AS (
  SELECT
    src.cruise_name,
    plan.schedule_type,
    src.room_type,
    src.room_type_en,
    (src.price_adult * plan.price_multiplier)::numeric AS price_adult,
    (src.price_child * plan.price_multiplier)::numeric AS price_child,
    (src.price_child_older * plan.price_multiplier)::numeric AS price_child_older,
    (src.price_child_extra_bed * plan.price_multiplier)::numeric AS price_child_extra_bed,
    (src.price_infant * plan.price_multiplier)::numeric AS price_infant,
    (src.price_extra_bed * plan.price_multiplier)::numeric AS price_extra_bed,
    (src.price_single * plan.price_multiplier)::numeric AS price_single,
    plan.valid_year,
    plan.valid_from,
    plan.valid_to,
    src.display_order,
    src.currency,
    src.is_active,
    CONCAT_WS(E'\n', NULLIF(src.notes, ''), plan.note_suffix) AS notes,
    src.extra_bed_available,
    src.includes_vehicle,
    src.vehicle_type,
    src.infant_policy,
    plan.season_name,
    src.is_promotion,
    src.child_age_range,
    src.single_available
  FROM source_rows AS src
  CROSS JOIN rate_plans AS plan
)
INSERT INTO public.cruise_rate_card (
  cruise_name,
  schedule_type,
  room_type,
  room_type_en,
  price_adult,
  price_child,
  price_child_older,
  price_child_extra_bed,
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
  extra_bed_available,
  includes_vehicle,
  vehicle_type,
  infant_policy,
  season_name,
  is_promotion,
  child_age_range,
  single_available
)
SELECT
  target.cruise_name,
  target.schedule_type,
  target.room_type,
  target.room_type_en,
  target.price_adult,
  target.price_child,
  target.price_child_older,
  target.price_child_extra_bed,
  target.price_infant,
  target.price_extra_bed,
  target.price_single,
  target.valid_year,
  target.valid_from,
  target.valid_to,
  target.display_order,
  target.currency,
  target.is_active,
  target.notes,
  target.extra_bed_available,
  target.includes_vehicle,
  target.vehicle_type,
  target.infant_policy,
  target.season_name,
  target.is_promotion,
  target.child_age_range,
  target.single_available
FROM target_rows AS target
WHERE NOT EXISTS (
  SELECT 1
  FROM public.cruise_rate_card AS existing
  WHERE existing.cruise_name = target.cruise_name
    AND existing.schedule_type = target.schedule_type
    AND existing.room_type = target.room_type
    AND existing.valid_year = target.valid_year
    AND existing.valid_from = target.valid_from
    AND existing.valid_to = target.valid_to
)
RETURNING
  id,
  cruise_name,
  schedule_type,
  room_type,
  valid_year,
  valid_from,
  valid_to,
  price_adult,
  price_child,
  price_child_older,
  price_child_extra_bed,
  price_infant,
  price_extra_bed,
  price_single,
  season_name;

SELECT
  cruise_name,
  schedule_type,
  room_type,
  valid_year,
  valid_from,
  valid_to,
  price_adult,
  price_child,
  price_child_older,
  price_child_extra_bed,
  price_infant,
  price_extra_bed,
  price_single,
  season_name,
  is_active
FROM public.cruise_rate_card
WHERE cruise_name = '씨스타 크루즈'
  AND (
    (valid_year = 2026::integer AND schedule_type IN ('1N2D', '2N3D'))
    OR (valid_year = 2027::integer AND schedule_type IN ('1N2D', '2N3D'))
  )
ORDER BY valid_year, schedule_type, display_order, room_type;

COMMIT;
