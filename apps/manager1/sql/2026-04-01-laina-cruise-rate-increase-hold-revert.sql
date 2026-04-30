-- ============================================================
-- 라이라 그랜져 크루즈 요금 인상(2026-04-03) 잠정 보류 / 원상복구 SQL
-- 작성일: 2026-04-01
-- 목적:
--   - 4/3부터 적용된 인상분(+250k/+500k)을 잠정 보류
--   - 2026년 전체를 인상 전 단가로 복구
--   - 추후 재적용 시 기존 인상 SQL 재실행으로 복구 가능
--     (sql/2026-03-30-laina-cruise-oil-surcharge-rate-update.sql)
--
-- 패턴: TEMP TABLE 스냅샷 -> 전체 삭제 -> 원상 단일구간 재삽입
-- ============================================================

-- 0) 실행 전 진단
SELECT
  cruise_name,
  schedule_type,
  room_type,
  season_name,
  valid_from,
  valid_to,
  price_adult,
  price_extra_bed,
  price_single,
  notes,
  is_active
FROM cruise_rate_card
WHERE cruise_name IN (
    '라이라 그랜져 크루즈',
    '라이나 그랜드 크루즈',
    '라이나 크루즈',
    'Laina Cruise',
    'Laina Grand Cruise',
    '그랜드 크루즈',
    '라이나그랜드크루즈',
    '라이라그랜져크루즈'
  )
  AND valid_year = 2026
ORDER BY schedule_type, room_type, season_name, valid_from;

BEGIN;

-- 1) 인상 전 기준단가 스냅샷 캡처
--    valid_from < 2026-04-03 인 행 중 최신 1건을 기준으로 사용
CREATE TEMP TABLE _laina_revert_src AS
SELECT DISTINCT ON (
  schedule_type,
  room_type,
  COALESCE(season_name, '')
)
  *,
  '라이라 그랜져 크루즈' AS _cname
FROM cruise_rate_card
WHERE cruise_name IN (
    '라이라 그랜져 크루즈',
    '라이나 그랜드 크루즈',
    '라이나 크루즈',
    'Laina Cruise',
    'Laina Grand Cruise',
    '그랜드 크루즈',
    '라이나그랜드크루즈',
    '라이라그랜져크루즈'
  )
  AND valid_year = 2026
  AND (valid_from IS NULL OR valid_from < DATE '2026-04-03')
ORDER BY
  schedule_type,
  room_type,
  COALESCE(season_name, ''),
  valid_from DESC NULLS LAST,
  id DESC;

-- 2) 라이라 2026 대상행 전체 삭제
DELETE FROM cruise_rate_card
WHERE cruise_name IN (
    '라이라 그랜져 크루즈',
    '라이나 그랜드 크루즈',
    '라이나 크루즈',
    'Laina Cruise',
    'Laina Grand Cruise',
    '그랜드 크루즈',
    '라이나그랜드크루즈',
    '라이라그랜져크루즈'
  )
  AND valid_year = 2026;

-- 3) 원상복구 단가 재삽입 (2026-01-01 ~ 2026-12-31)
INSERT INTO cruise_rate_card (
  id,
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
  id,
  _cname,
  schedule_type,
  room_type,
  room_type_en,
  price_adult,
  price_child,
  price_infant,
  price_extra_bed,
  price_single,
  valid_year,
  DATE '2026-01-01',
  DATE '2026-12-31',
  display_order,
  currency,
  true,
  '인상 보류(원상복구) - 2026-04-01 실행',
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
FROM _laina_revert_src;

DROP TABLE _laina_revert_src;

COMMIT;

-- 4) 실행 후 검증
-- 4-1) 정규명으로만 존재하는지
SELECT cruise_name, COUNT(*) AS row_count
FROM cruise_rate_card
WHERE valid_year = 2026
  AND cruise_name IN (
    '라이라 그랜져 크루즈',
    '라이나 그랜드 크루즈',
    '라이나 크루즈',
    'Laina Cruise',
    'Laina Grand Cruise',
    '그랜드 크루즈',
    '라이나그랜드크루즈',
    '라이라그랜져크루즈'
  )
GROUP BY cruise_name
ORDER BY cruise_name;

-- 4-2) 구간이 단일구간(1/1~12/31)인지
SELECT
  cruise_name,
  schedule_type,
  room_type,
  season_name,
  valid_from,
  valid_to,
  price_adult,
  price_extra_bed,
  price_single,
  notes
FROM cruise_rate_card
WHERE cruise_name = '라이라 그랜져 크루즈'
  AND valid_year = 2026
ORDER BY schedule_type, room_type, season_name, valid_from;

-- 4-3) 4/3 분기 행이 남아있는지 체크 (0행 기대)
SELECT *
FROM cruise_rate_card
WHERE cruise_name = '라이라 그랜져 크루즈'
  AND valid_year = 2026
  AND valid_from = DATE '2026-04-03';
