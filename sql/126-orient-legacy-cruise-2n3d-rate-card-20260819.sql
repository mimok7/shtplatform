-- 오리엔트 레거시 크루즈 2박 3일(2N3D) 요금을 추가하는 스크립트
-- 기준: 실행 시점의 활성 1박 2일(1N2D) 요금 24개 행(8개 객실 × 3개 시즌).
-- 2027년 1월 1일부터 12월 31일까지로 1박 2일·2박 3일 요금의 적용 기간을 맞춘다.
-- 모든 금액 요금 컬럼은 1박 2일 요금의 정확히 2배로 저장한다.
-- 2027년 대상 기간은 기존 행을 정정하며, 그 밖의 기존 2박 3일 행은 수정·삭제하지 않는다.

BEGIN;

-- 기존 1박 2일 2027년 시즌의 적용 종료일을 12월 31일로 연장한다.
UPDATE public.cruise_rate_card
SET valid_to = DATE '2027-12-31'
WHERE cruise_name = '오리엔트 레거시 크루즈'
  AND schedule_type = '1N2D'
  AND valid_year = 2027::integer
  AND valid_from = DATE '2027-01-01'
  AND valid_to <> DATE '2027-12-31';

-- 이전 버전의 SQL이 실행된 적 있으면, 생성된 2박 3일 2027년 요금도 같은 종료일로 정정한다.
UPDATE public.cruise_rate_card
SET valid_to = DATE '2027-12-31'
WHERE cruise_name = '오리엔트 레거시 크루즈'
  AND schedule_type = '2N3D'
  AND valid_year = 2027::integer
  AND valid_from = DATE '2027-01-01'
  AND valid_to <> DATE '2027-12-31';

DO $$
DECLARE
  source_count integer;
BEGIN
  SELECT COUNT(*)
  INTO source_count
  FROM public.cruise_rate_card
  WHERE cruise_name = '오리엔트 레거시 크루즈'
    AND schedule_type = '1N2D'
    AND is_active IS TRUE;

  IF source_count <> 24 THEN
    RAISE EXCEPTION
      '오리엔트 레거시 크루즈의 활성 1박 2일 원본 요금은 24개여야 합니다. 현재 %개입니다.',
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
    crc.valid_year,
    crc.valid_from,
    crc.valid_to,
    crc.display_order,
    crc.currency,
    crc.is_active,
    crc.notes,
    crc.extra_bed_available,
    crc.includes_vehicle,
    crc.vehicle_type,
    crc.infant_policy,
    crc.season_name,
    crc.is_promotion,
    crc.child_age_range,
    crc.single_available
  FROM public.cruise_rate_card AS crc
  WHERE crc.cruise_name = '오리엔트 레거시 크루즈'
    AND crc.schedule_type = '1N2D'
    AND crc.is_active IS TRUE
), target_rows AS (
  SELECT
    src.cruise_name,
    '2N3D'::text AS schedule_type,
    src.room_type,
    src.room_type_en,
    (src.price_adult * 2)::numeric AS price_adult,
    (src.price_child * 2)::numeric AS price_child,
    (src.price_child_older * 2)::numeric AS price_child_older,
    (src.price_child_extra_bed * 2)::numeric AS price_child_extra_bed,
    (src.price_infant * 2)::numeric AS price_infant,
    (src.price_extra_bed * 2)::numeric AS price_extra_bed,
    (src.price_single * 2)::numeric AS price_single,
    src.valid_year,
    src.valid_from,
    src.valid_to,
    src.display_order,
    src.currency,
    src.is_active,
    CONCAT_WS(E'\n', NULLIF(src.notes, ''), '2박 3일 요금: 동일 시즌 1박 2일 요금의 2배.') AS notes,
    src.extra_bed_available,
    src.includes_vehicle,
    src.vehicle_type,
    src.infant_policy,
    CONCAT_WS(' ', NULLIF(src.season_name, ''), '(2박3일)') AS season_name,
    src.is_promotion,
    src.child_age_range,
    src.single_available
  FROM source_rows AS src
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
)
RETURNING
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

-- 실행 후 24개 행이 등록됐는지 확인한다.
DO $$
DECLARE
  target_count integer;
BEGIN
  SELECT COUNT(*)
  INTO target_count
  FROM public.cruise_rate_card
  WHERE cruise_name = '오리엔트 레거시 크루즈'
    AND schedule_type = '2N3D'
    AND is_active IS TRUE;

  IF target_count <> 24 THEN
    RAISE EXCEPTION
      '오리엔트 레거시 크루즈의 활성 2박 3일 요금은 24개여야 합니다. 현재 %개입니다.',
      target_count;
  END IF;
END $$;

SELECT
  room_type,
  season_name,
  valid_year,
  valid_from,
  valid_to,
  price_adult,
  price_child,
  price_child_extra_bed,
  price_infant,
  price_extra_bed,
  price_single,
  currency,
  is_active
FROM public.cruise_rate_card
WHERE cruise_name = '오리엔트 레거시 크루즈'
  AND schedule_type = '2N3D'
ORDER BY valid_from, display_order, room_type;

COMMIT;
