-- ============================================================
-- 🚀 라이나/엠바사더 크루즈 최종 통합 실행 스크립트
-- ============================================================
-- 이 스크립트를 Supabase SQL Editor에 전체 복사-붙여넣기하여 실행하면
-- 라이나 크루즈 요금 변동과 엠바사더 크루즈 활성화를 동시에 처리합니다.
-- ============================================================

-- 단계 1️⃣: 진단 및 상태 출력
SELECT 
  '=== 실행 전 상태 진단 ===' as status,
  (SELECT COUNT(*) FROM cruise_rate_card WHERE cruise_name ILIKE '%라이나%' OR cruise_name ILIKE '%라이라%' AND valid_year = 2026) as laina_total_rows,
  (SELECT COUNT(*) FROM cruise_rate_card WHERE cruise_name ILIKE '%엠바%' AND valid_year = 2026) as ambassador_total_rows,
  (SELECT COUNT(*) FROM cruise_rate_card WHERE (cruise_name ILIKE '%라이나%' OR cruise_name ILIKE '%라이라%') AND is_active = true AND valid_year = 2026) as laina_active_rows,
  (SELECT COUNT(*) FROM cruise_rate_card WHERE cruise_name ILIKE '%엠바%' AND is_active = true AND valid_year = 2026) as ambassador_active_rows;

-- 단계 2️⃣: 라이나 크루즈 모든 행을 강제로 활성화
UPDATE cruise_rate_card
SET is_active = true
WHERE (cruise_name ILIKE '%라이나%' OR cruise_name ILIKE '%라이라%')
  AND valid_year = 2026;

-- 단계 3️⃣: 라이나 크루즈 요금 변동 적용 (2026-04-03부터)
BEGIN;

-- 3-1️⃣ 원본 데이터 스냅샷
CREATE TEMP TABLE _laina_src AS
SELECT DISTINCT ON (
  schedule_type, room_type, COALESCE(season_name,'')
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
  schedule_type, room_type, COALESCE(season_name,''),
  valid_from DESC NULLS LAST, id DESC;

-- 3-2️⃣ 기존 라이나 데이터 전체 삭제
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

-- 3-3️⃣ 구요금 재삽입 (~2026-04-02)
INSERT INTO cruise_rate_card (
  cruise_name, schedule_type, room_type, room_type_en,
  price_adult, price_child, price_infant, price_extra_bed, price_single,
  valid_year, valid_from, valid_to,
  display_order, currency, is_active, notes,
  price_child_extra_bed, extra_bed_available, includes_vehicle, vehicle_type,
  infant_policy, season_name, is_promotion, price_child_older,
  child_age_range, single_available
)
SELECT
  _cname,
  schedule_type, room_type, room_type_en,
  price_adult, price_child, price_infant, price_extra_bed, price_single,
  valid_year,
  COALESCE(valid_from, DATE '2026-01-01'),
  DATE '2026-04-02',
  display_order, currency, true,
  '구요금(~2026-04-02)',
  price_child_extra_bed, extra_bed_available, includes_vehicle, vehicle_type,
  infant_policy, season_name, is_promotion, price_child_older,
  child_age_range, single_available
FROM _laina_src;

-- 3-4️⃣ 신요금 삽입 (2026-04-03~, +250k/+500k)
INSERT INTO cruise_rate_card (
  cruise_name, schedule_type, room_type, room_type_en,
  price_adult, price_child, price_infant, price_extra_bed, price_single,
  valid_year, valid_from, valid_to,
  display_order, currency, is_active, notes,
  price_child_extra_bed, extra_bed_available, includes_vehicle, vehicle_type,
  infant_policy, season_name, is_promotion, price_child_older,
  child_age_range, single_available
)
SELECT
  _cname,
  schedule_type, room_type, room_type_en,
  price_adult + CASE WHEN schedule_type = '2N3D' THEN 500000 ELSE 250000 END,
  price_child, price_infant,
  CASE WHEN price_extra_bed IS NULL THEN NULL
       ELSE price_extra_bed + CASE WHEN schedule_type = '2N3D' THEN 500000 ELSE 250000 END END,
  CASE WHEN price_single IS NULL THEN NULL
       ELSE price_single + CASE WHEN schedule_type = '2N3D' THEN 500000 ELSE 250000 END END,
  valid_year,
  DATE '2026-04-03',
  DATE '2026-12-31',
  display_order, currency, true,
  CASE WHEN schedule_type = '2N3D'
    THEN '유가인상 +500,000 (2026-04-03~)'
    ELSE '유가인상 +250,000 (2026-04-03~)' END,
  price_child_extra_bed, extra_bed_available, includes_vehicle, vehicle_type,
  infant_policy, season_name, is_promotion, price_child_older,
  child_age_range, single_available
FROM _laina_src;

DROP TABLE _laina_src;
COMMIT;

-- 단계 4️⃣: 엠바사더 크루즈 모든 행을 강제로 활성화
UPDATE cruise_rate_card
SET is_active = true
WHERE cruise_name ILIKE '%엠바%'
  AND valid_year = 2026;

-- 단계 5️⃣: 엠바사더 크루즈 요금 변동 적용 (2026-04-15부터)
BEGIN;

-- 5-1️⃣ 원본 데이터 스냅샷
CREATE TEMP TABLE _amb_src AS
SELECT DISTINCT ON (
  schedule_type, room_type, COALESCE(season_name,'')
)
  *,
  CASE
    WHEN cruise_name IN ('엠바사더 시그니쳐','시그니처 크루즈','시그니쳐 크루즈',
                         'Ambassador Signature Cruise','Ambassador Signature')
      THEN '엠바사더 시그니처'
    WHEN cruise_name IN ('Ambassador Overnight Cruise','Ambassador Overnight')
      THEN '엠바사더 오버나이트'
    ELSE cruise_name
  END AS _cname
FROM cruise_rate_card
WHERE cruise_name IN (
    '엠바사더 오버나이트','엠바사더 시그니처',
    '엠바사더 시그니쳐','시그니처 크루즈','시그니쳐 크루즈',
    'Ambassador Signature Cruise','Ambassador Signature',
    'Ambassador Overnight Cruise','Ambassador Overnight'
  )
  AND valid_year = 2026
  AND (valid_from IS NULL OR valid_from < DATE '2026-04-15')
ORDER BY
  schedule_type, room_type, COALESCE(season_name,''),
  valid_from DESC NULLS LAST, id DESC;

-- 5-2️⃣ 기존 엠바사더 데이터 전체 삭제
DELETE FROM cruise_rate_card
WHERE cruise_name IN (
    '엠바사더 오버나이트','엠바사더 시그니처',
    '엠바사더 시그니쳐','시그니처 크루즈','시그니쳐 크루즈',
    'Ambassador Signature Cruise','Ambassador Signature',
    'Ambassador Overnight Cruise','Ambassador Overnight'
  )
  AND valid_year = 2026;

-- 5-3️⃣ 구요금 재삽입 (~2026-04-14)
INSERT INTO cruise_rate_card (
  cruise_name, schedule_type, room_type, room_type_en,
  price_adult, price_child, price_infant, price_extra_bed, price_single,
  valid_year, valid_from, valid_to,
  display_order, currency, is_active, notes,
  price_child_extra_bed, extra_bed_available, includes_vehicle, vehicle_type,
  infant_policy, season_name, is_promotion, price_child_older,
  child_age_range, single_available
)
SELECT
  _cname,
  schedule_type, room_type, room_type_en,
  price_adult, price_child, price_infant, price_extra_bed, price_single,
  valid_year,
  COALESCE(valid_from, DATE '2026-01-01'),
  DATE '2026-04-14',
  display_order, currency, true,
  '구요금(~2026-04-14)',
  price_child_extra_bed, extra_bed_available, includes_vehicle, vehicle_type,
  infant_policy, season_name, is_promotion, price_child_older,
  child_age_range, single_available
FROM _amb_src;

-- 5-4️⃣ 신요금 삽입 (2026-04-15~, +150k)
INSERT INTO cruise_rate_card (
  cruise_name, schedule_type, room_type, room_type_en,
  price_adult, price_child, price_infant, price_extra_bed, price_single,
  valid_year, valid_from, valid_to,
  display_order, currency, is_active, notes,
  price_child_extra_bed, extra_bed_available, includes_vehicle, vehicle_type,
  infant_policy, season_name, is_promotion, price_child_older,
  child_age_range, single_available
)
SELECT
  _cname,
  schedule_type, room_type, room_type_en,
  price_adult + 150000,
  price_child, price_infant,
  CASE WHEN price_extra_bed IS NULL THEN NULL ELSE price_extra_bed + 150000 END,
  CASE WHEN price_single IS NULL THEN NULL ELSE price_single + 150000 END,
  valid_year,
  DATE '2026-04-15',
  DATE '2026-12-31',
  display_order, currency, true,
  '요금인상 +150,000 (2026-04-15~)',
  price_child_extra_bed, extra_bed_available, includes_vehicle, vehicle_type,
  infant_policy, season_name, is_promotion, price_child_older,
  child_age_range, single_available
FROM _amb_src;

DROP TABLE _amb_src;
COMMIT;

-- 단계 6️⃣: 최종 결과 확인
SELECT 
  '=== 실행 후 상태 확인 ===' as status,
  (SELECT COUNT(*) FROM cruise_rate_card WHERE cruise_name = '라이라 그랜져 크루즈' AND valid_year = 2026) as laina_total,
  (SELECT COUNT(*) FROM cruise_rate_card WHERE cruise_name = '라이라 그랜져 크루즈' AND is_active = true AND valid_year = 2026) as laina_active,
  (SELECT COUNT(*) FROM cruise_rate_card WHERE cruise_name IN ('엠바사더 시그니처','엠바사더 오버나이트') AND valid_year = 2026) as ambassador_total,
  (SELECT COUNT(*) FROM cruise_rate_card WHERE cruise_name IN ('엠바사더 시그니처','엠바사더 오버나이트') AND is_active = true AND valid_year = 2026) as ambassador_active;

-- 단계 7️⃣: 라이나 크루즈 요금 쌍 확인 (구요금+신요금)
SELECT '라이나 요금 구성:' as check_name, cruise_name, schedule_type, 
       valid_from, valid_to, price_adult
FROM cruise_rate_card
WHERE cruise_name = '라이라 그랜져 크루즈' AND valid_year = 2026
ORDER BY schedule_type, valid_from;

-- 단계 8️⃣: 엠바사더 크루즈 요금 쌍 확인 (구요금+신요금)
SELECT '엠바사더 요금 구성:' as check_name, cruise_name, schedule_type,
       valid_from, valid_to, price_adult
FROM cruise_rate_card
WHERE cruise_name IN ('엠바사더 시그니처','엠바사더 오버나이트') AND valid_year = 2026
ORDER BY cruise_name, schedule_type, valid_from;
