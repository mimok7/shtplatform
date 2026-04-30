BEGIN;

-- ============================================================
-- 엠바사더 오버나이트/시그니처 크루즈 요금 인상 반영 (v4 - 스냅샷 + 삭제 + 재삽입)
-- 적용 기준(탑승일): 2026-04-15부터
-- 인상: price_adult, price_extra_bed, price_single 각 +150,000 VND
-- 대상: 패키지(프로모션) 포함 전체
-- ============================================================
-- 방식: TEMP TABLE 스냅샷 → 전체 삭제 → 구요금+신요금 재삽입
-- 재실행 안전: 항상 동일 결과 (멱등성 보장)
-- ⚠️ v1~v3 실패 원인:
--   - 엠바사더 원본 데이터의 valid_from/valid_to가 NULL
--     → WHERE valid_from < cutoff 이 NULL = FALSE → 소스 0행
--   - UPDATE 정규화 시 unique constraint 충돌
--   해결: DELETE+RE-INSERT 방식 + COALESCE(valid_from) + TEMP TABLE
-- ============================================================

-- ──────────────────────────────────────────────
-- ① 소스 스냅샷 (변경 전 원본 캡처)
--    - 시그니처/오버나이트 변형 이름 → 정규 이름 매핑 (_cname)
--    - NULL valid_from 포함 (IS NULL OR < cutoff)
--    - DISTINCT ON: 정규이름 기준으로 중복 제거 (최신 valid_from 우선)
-- ──────────────────────────────────────────────
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

-- ──────────────────────────────────────────────
-- ② 대상 행 전체 삭제
--    이 크루즈들의 2026년 데이터를 모두 제거
--    → ③/④에서 정규 이름 + 구체적 날짜로 깨끗하게 재삽입
-- ──────────────────────────────────────────────
DELETE FROM cruise_rate_card
WHERE cruise_name IN (
    '엠바사더 오버나이트','엠바사더 시그니처',
    '엠바사더 시그니쳐','시그니처 크루즈','시그니쳐 크루즈',
    'Ambassador Signature Cruise','Ambassador Signature',
    'Ambassador Overnight Cruise','Ambassador Overnight'
  )
  AND valid_year = 2026;

-- ──────────────────────────────────────────────
-- ③ 구요금 재삽입 (정규 이름, 원본 가격, ~cutoff-1)
--    NULL valid_from → COALESCE로 2026-01-01 고정
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
  DATE '2026-04-14',
  display_order, currency, true,
  '구요금(~2026-04-14)',
  price_child_extra_bed, extra_bed_available, includes_vehicle, vehicle_type,
  infant_policy, season_name, is_promotion, price_child_older,
  child_age_range, single_available
FROM _amb_src;

-- ──────────────────────────────────────────────
-- ④ 신요금 삽입 (정규 이름, +150,000, cutoff~12/31)
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
  price_adult + 150000,
  price_child, price_infant,
  CASE WHEN price_extra_bed IS NULL THEN NULL ELSE price_extra_bed + 150000 END,
  CASE WHEN price_single    IS NULL THEN NULL ELSE price_single    + 150000 END,
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

-- ============================================================
-- 검증 쿼리 (실행 후 주석 해제하여 확인)
-- ============================================================

-- 검증 1) 전체 결과 - 구요금(~4/14)과 신요금(4/15~) 쌍으로 존재해야 함
-- SELECT cruise_name, schedule_type, room_type, season_name,
--        valid_from, valid_to, price_adult, price_extra_bed, price_single
-- FROM cruise_rate_card
-- WHERE cruise_name IN ('엠바사더 오버나이트','엠바사더 시그니처')
--   AND valid_year = 2026
-- ORDER BY cruise_name, schedule_type, room_type, season_name, valid_from;

-- 검증 2) 오늘 날짜 기준 조회 - 반드시 나와야 함
-- SELECT cruise_name, schedule_type, room_type, valid_from, valid_to, price_adult
-- FROM cruise_rate_card
-- WHERE cruise_name IN ('엠바사더 오버나이트','엠바사더 시그니처')
--   AND valid_year = 2026 AND is_active = true
--   AND valid_from <= CURRENT_DATE AND valid_to >= CURRENT_DATE;

-- 검증 3) NULL valid_from/valid_to 없어야 함 - 결과 0행
-- SELECT * FROM cruise_rate_card
-- WHERE cruise_name IN ('엠바사더 오버나이트','엠바사더 시그니처') AND valid_year = 2026
--   AND (valid_from IS NULL OR valid_to IS NULL);

-- 검증 4) 이름 변형 없어야 함 - 결과 0행
-- SELECT * FROM cruise_rate_card
-- WHERE cruise_name IN ('엠바사더 시그니쳐','시그니처 크루즈','시그니쳐 크루즈',
--   'Ambassador Signature Cruise','Ambassador Signature',
--   'Ambassador Overnight Cruise','Ambassador Overnight') AND valid_year = 2026;

-- 검증 5) 중복 확인 - 결과 0행
-- SELECT cruise_name, schedule_type, room_type, COALESCE(season_name,'') AS sn,
--        valid_year, valid_from, COUNT(*)
-- FROM cruise_rate_card
-- WHERE cruise_name IN ('엠바사더 오버나이트','엠바사더 시그니처') AND valid_year = 2026
-- GROUP BY cruise_name, schedule_type, room_type, sn, valid_year, valid_from
-- HAVING COUNT(*) > 1;
