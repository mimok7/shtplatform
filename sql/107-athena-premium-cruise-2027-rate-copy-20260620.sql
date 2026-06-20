-- ============================================================================
-- 107-athena-premium-cruise-2027-rate-copy-20260620.sql
-- 아테나 프리미엄 크루즈 2026 요금을 기준으로 2027 요금 추가
-- ============================================================================
-- 목적:
--   1. 기존 2026 요금은 유지
--   2. 2026 요금을 기준으로 2027 연간 요금 추가
--   3. 기존 예약 참조를 끊지 않도록 DELETE 없이 INSERT만 수행
--   4. 크루즈명/객실명은 최신 표기('아테나 프리미엄 크루즈') 기준으로 통일
--
-- 적용 방식:
--   - 2026년 아테나 프리미엄 크루즈 요금을 source로 사용
--   - valid_year = 2027
--   - 2027 적용기간은 2027-01-01 ~ 2027-12-31로 고정
--   - notes / season_name에 '2026' 문자열이 있으면 '2027'로 치환
--   - 이미 같은 2027 행이 있으면 추가하지 않음
-- ============================================================================

BEGIN;

-- 0. 아테나/아테네 표기 및 영문 객실명을 최신 한글 표기로 정규화
UPDATE public.cruise_rate_card
SET
  cruise_name = '아테나 프리미엄 크루즈',
  room_type = CASE room_type
    WHEN 'Athena Ocean View' THEN '아테나 오션뷰'
    WHEN 'Executive Balcony' THEN '이그제큐티브 발코니'
    WHEN 'Triple Balcony' THEN '트리플 발코니'
    WHEN 'Connecting Balcony' THEN '커넥팅 발코니'
    WHEN 'Premium Balcony' THEN '프리미엄 발코니'
    WHEN 'Captain View Suite (VIP)' THEN '캡틴 뷰 스위트'
    WHEN 'Elite Suite (VIP)' THEN '엘리트 스위트'
    WHEN 'Imperial Athena (VIP)' THEN '임페리얼 아테나'
    ELSE room_type
  END,
  updated_at = now()
WHERE cruise_name IN (
    '아테나 프리미엄',
    '아테나 프리미엄 크루즈',
    '아테네 프리미엄',
    '아테네 프리미엄 크루즈'
  )
  AND valid_year IN (2026, 2027);

-- 1. 2026 요금을 source로 정리
WITH normalized_source AS (
  SELECT
    crc.id,
    '아테나 프리미엄 크루즈'::text AS cruise_name,
    crc.schedule_type,
    CASE crc.room_type
      WHEN 'Athena Ocean View' THEN '아테나 오션뷰'
      WHEN 'Executive Balcony' THEN '이그제큐티브 발코니'
      WHEN 'Triple Balcony' THEN '트리플 발코니'
      WHEN 'Connecting Balcony' THEN '커넥팅 발코니'
      WHEN 'Premium Balcony' THEN '프리미엄 발코니'
      WHEN 'Captain View Suite (VIP)' THEN '캡틴 뷰 스위트'
      WHEN 'Elite Suite (VIP)' THEN '엘리트 스위트'
      WHEN 'Imperial Athena (VIP)' THEN '임페리얼 아테나'
      ELSE crc.room_type
    END AS room_type,
    crc.room_type_en,
    crc.price_adult,
    crc.price_child,
    crc.price_child_older,
    crc.price_infant,
    crc.price_extra_bed,
    crc.price_child_extra_bed,
    crc.price_single,
    crc.display_order,
    crc.currency,
    crc.is_active,
    crc.extra_bed_available,
    crc.includes_vehicle,
    crc.vehicle_type,
    crc.infant_policy,
    crc.season_name,
    crc.is_promotion,
    crc.child_age_range,
    crc.single_available,
    crc.notes,
    crc.valid_from,
    crc.valid_to,
    row_number() OVER (
      PARTITION BY
        crc.schedule_type,
        CASE crc.room_type
          WHEN 'Athena Ocean View' THEN '아테나 오션뷰'
          WHEN 'Executive Balcony' THEN '이그제큐티브 발코니'
          WHEN 'Triple Balcony' THEN '트리플 발코니'
          WHEN 'Connecting Balcony' THEN '커넥팅 발코니'
          WHEN 'Premium Balcony' THEN '프리미엄 발코니'
          WHEN 'Captain View Suite (VIP)' THEN '캡틴 뷰 스위트'
          WHEN 'Elite Suite (VIP)' THEN '엘리트 스위트'
          WHEN 'Imperial Athena (VIP)' THEN '임페리얼 아테나'
          ELSE crc.room_type
        END,
        COALESCE(crc.valid_from, DATE '1900-01-01'),
        COALESCE(crc.valid_to, DATE '2999-12-31')
      ORDER BY
        CASE WHEN crc.cruise_name = '아테나 프리미엄 크루즈' THEN 0 ELSE 1 END,
        crc.updated_at DESC NULLS LAST,
        crc.created_at DESC NULLS LAST,
        crc.id DESC
    ) AS rn
  FROM public.cruise_rate_card crc
  WHERE crc.cruise_name IN (
      '아테나 프리미엄',
      '아테나 프리미엄 크루즈',
      '아테네 프리미엄',
      '아테네 프리미엄 크루즈'
    )
    AND crc.valid_year = 2026
), source_rows AS (
  SELECT
    cruise_name,
    schedule_type,
    room_type,
    room_type_en,
    price_adult,
    price_child,
    price_child_older,
    COALESCE(price_infant, 0) AS price_infant,
    price_extra_bed,
    price_child_extra_bed,
    price_single,
    2027 AS valid_year,
    DATE '2027-01-01' AS valid_from,
    DATE '2027-12-31' AS valid_to,
    display_order,
    currency,
    is_active,
    extra_bed_available,
    includes_vehicle,
    vehicle_type,
    infant_policy,
    CASE
      WHEN season_name IS NULL THEN NULL
      ELSE replace(season_name, '2026', '2027')
    END AS season_name,
    is_promotion,
    child_age_range,
    single_available,
    CASE
      WHEN notes IS NULL THEN '2026 요금 기준 2027 복제'
      WHEN position('2026' IN notes) > 0 THEN replace(notes, '2026', '2027')
      ELSE notes || ' / 2027 적용'
    END AS notes
  FROM normalized_source
  WHERE rn = 1
)
INSERT INTO public.cruise_rate_card (
  cruise_name,
  schedule_type,
  room_type,
  room_type_en,
  price_adult,
  price_child,
  price_child_older,
  price_infant,
  price_extra_bed,
  price_child_extra_bed,
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
  s.cruise_name,
  s.schedule_type,
  s.room_type,
  s.room_type_en,
  s.price_adult,
  s.price_child,
  s.price_child_older,
  s.price_infant,
  s.price_extra_bed,
  s.price_child_extra_bed,
  s.price_single,
  s.valid_year,
  s.valid_from,
  s.valid_to,
  s.display_order,
  s.currency,
  s.is_active,
  s.notes,
  s.extra_bed_available,
  s.includes_vehicle,
  s.vehicle_type,
  s.infant_policy,
  s.season_name,
  s.is_promotion,
  s.child_age_range,
  s.single_available
FROM source_rows s
WHERE NOT EXISTS (
  SELECT 1
  FROM public.cruise_rate_card e
  WHERE e.cruise_name = s.cruise_name
    AND e.schedule_type = s.schedule_type
    AND e.room_type = s.room_type
    AND e.valid_year = s.valid_year
    AND COALESCE(e.valid_from, DATE '1900-01-01') = COALESCE(s.valid_from, DATE '1900-01-01')
    AND COALESCE(e.valid_to, DATE '2999-12-31') = COALESCE(s.valid_to, DATE '2999-12-31')
);

COMMIT;

-- ============================================================================
-- 검증 쿼리
-- ============================================================================
-- 1) 2026 / 2027 아테나 요금 비교
-- SELECT
--   valid_year,
--   schedule_type,
--   room_type,
--   price_adult,
--   price_child,
--   price_child_older,
--   price_extra_bed,
--   price_child_extra_bed,
--   price_single,
--   valid_from,
--   valid_to
-- FROM public.cruise_rate_card
-- WHERE cruise_name = '아테나 프리미엄 크루즈'
--   AND valid_year IN (2026, 2027)
-- ORDER BY valid_year, display_order, room_type;
--
-- 2) 연도별 건수 확인 (정상 기대값: 각 8건)
-- SELECT valid_year, COUNT(*) AS row_count
-- FROM public.cruise_rate_card
-- WHERE cruise_name = '아테나 프리미엄 크루즈'
--   AND valid_year IN (2026, 2027)
-- GROUP BY valid_year
-- ORDER BY valid_year;
