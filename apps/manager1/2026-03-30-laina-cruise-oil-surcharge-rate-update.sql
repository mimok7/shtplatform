-- ============================================================
-- ★ 진단 쿼리 (먼저 실행하여 현재 DB 상태 확인) ★
-- 아래를 먼저 실행해서 결과를 확인하세요
-- ============================================================
SELECT cruise_name, schedule_type, room_type, valid_from, valid_to, price_adult, is_active
FROM cruise_rate_card
WHERE (
  cruise_name ILIKE '%라이나%'
  OR cruise_name ILIKE '%laina%'
  OR cruise_name ILIKE '%그랜드 크루즈%'
)
  AND valid_year = 2026
ORDER BY cruise_name, schedule_type, room_type, valid_from;

-- ============================================================
-- ★ 위 진단 쿼리 결과를 확인한 후, 아래 BEGIN~COMMIT 블록을 실행하세요 ★
-- ============================================================

BEGIN;

-- ============================================================
-- 라이라 그랜져 크루즈 유가 인상 반영 (v4.1)
-- 적용 기준(탑승일): 2026-04-03부터
-- 인상:
--   1N2D: price_adult, price_extra_bed, price_single 각 +250,000 VND
--   2N3D: price_adult, price_extra_bed, price_single 각 +500,000 VND
-- 대상: 라이라 그랜져 크루즈 전체
-- ============================================================
-- 방식: TEMP TABLE 스냅샷 → 전체 삭제 → 구요금+신요금 재삽입
-- 정규 이름: '라이라 그랜져 크루즈'
-- 변형 이름(삭제 대상): '라이나 크루즈', 'Laina Cruise', '그랜드 크루즈',
--   '라이나 그랜드 크루즈', 'Laina Grand Cruise', '라이나그랜드크루즈', '라이라그랜져크루즈'
-- ============================================================

-- ──────────────────────────────────────────────
-- ① 소스 스냅샷 (변경 전 원본 캡처)
-- ──────────────────────────────────────────────
CREATE TEMP TABLE _laina_src AS
SELECT DISTINCT ON (
  '라이라 그랜져 크루즈',
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
  '라이나 그랜드 크루즈',
  schedule_type, room_type, COALESCE(season_name,''),
  valid_from DESC NULLS LAST, id DESC;

-- ──────────────────────────────────────────────
-- ② 대상 행 전체 삭제 (모든 변형 이름 포함)
-- ──────────────────────────────────────────────
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

-- ──────────────────────────────────────────────
-- ③ 구요금 재삽입 (정규 이름, 원본 가격, ~cutoff-1)
-- ──────────────────────────────────────────────
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

-- ──────────────────────────────────────────────
-- ④ 신요금 삽입 (정규 이름, 인상 가격, cutoff~12/31)
-- ──────────────────────────────────────────────
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
       ELSE price_extra_bed + CASE WHEN schedule_type = '2N3D' THEN 500000 ELSE 250000 END
  END,
  CASE WHEN price_single IS NULL THEN NULL
       ELSE price_single + CASE WHEN schedule_type = '2N3D' THEN 500000 ELSE 250000 END
  END,
  valid_year,
  DATE '2026-04-03',
  DATE '2026-12-31',
  display_order, currency, true,
  CASE WHEN schedule_type = '2N3D'
    THEN '유가인상 +500,000 (2026-04-03~)'
    ELSE '유가인상 +250,000 (2026-04-03~)'
  END,
  price_child_extra_bed, extra_bed_available, includes_vehicle, vehicle_type,
  infant_policy, season_name, is_promotion, price_child_older,
  child_age_range, single_available
FROM _laina_src;

DROP TABLE _laina_src;

COMMIT;

-- ============================================================
-- 검증 쿼리 (BEGIN~COMMIT 실행 후 아래를 실행하여 확인)
-- ============================================================

-- 검증 1) 전체 결과 - 구요금(~4/2)과 신요금(4/3~) 쌍으로 존재해야 함
SELECT cruise_name, schedule_type, room_type, season_name,
       valid_from, vali라 그랜져 크루즈' AND valid_year = 2026
ORDER BY schedule_type, room_type, season_name, valid_from;

-- 검증 2) 변형 이름 없어야 함 - 결과 0행
SELECT * FROM cruise_rate_card
WHERE cruise_name IN ('라이나 크루즈','Laina Cruise','그랜드 크루즈',
  'Laina Grand Cruise','라이나그랜드크루즈','라이나 그랜드 크루즈','라이라그랜져크루즈') AND valid_year = 2026;

-- 검증 3) NULL valid_from/valid_to 없어야 함 - 결과 0행
SELECT * FROM cruise_rate_card
WHERE cruise_name = '라이라 그랜져id_to 없어야 함 - 결과 0행
SELECT * FROM cruise_rate_card
WHERE cruise_name = '라이나 그랜드 크루즈' AND valid_year = 2026
  AND (valid_from IS NULL OR valid_to IS NULL);
