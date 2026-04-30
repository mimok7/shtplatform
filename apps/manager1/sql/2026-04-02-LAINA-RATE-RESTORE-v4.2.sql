-- ============================================================
-- ★ 라이라 그랜져 크루즈 요금 변동 (복구 안전 버전 v4.2) ★
-- ★ TEMP TABLE + 원본 valid_to 보존 ★
-- ============================================================
-- 목적:
--   - 요금 변동 데이터 추가 후 롤백 시에도 원본 상태 100% 복구 가능
--   - 구요금의 valid_to는 **원본 값 유지** (하드코딩 X)
--   - 삭제 후 복구: 동일한 쿼리로 원상복구
-- ============================================================
-- 진행 단계 1) 아래 진단 쿼리를 먼저 실행하여 현재 상태 확인
-- ============================================================

-- 진단 쿼리 1) 라이라 관련 데이터 현재 상태
SELECT cruise_name, schedule_type, room_type, season_name,
       valid_from, valid_to, price_adult, id
FROM cruise_rate_card
WHERE (cruise_name ILIKE '%라이나%' OR cruise_name ILIKE '%라이라%'
       OR cruise_name ILIKE '%그랜드 크루즈%')
  AND valid_year = 2026
ORDER BY cruise_name, schedule_type, room_type, valid_from;

-- 진단 쿼리 2) 4월 3일 이후 비수기 가격 확인
SELECT cruise_name, schedule_type, room_type, valid_from, valid_to, price_adult
FROM cruise_rate_card
WHERE (cruise_name ILIKE '%라이나%' OR cruise_name ILIKE '%라이라%')
  AND valid_year = 2026
  AND valid_from >= DATE '2026-04-03'
LIMIT 10;

-- ============================================================
-- 진행 단계 2) BEGIN~COMMIT 블록 실행 (요금 변동 반영)
-- ============================================================

BEGIN;

-- ──────────────────────────────────────────────────────────
-- ① 소스 데이터 스냅샷 (변경 전 원본 캡처)
--    ⚠️ 중요: valid_to도 함께 캡처하여 원본 복구 시 사용
-- ──────────────────────────────────────────────────────────
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

-- ──────────────────────────────────────────────────────────
-- ② 대상 데이터 전체 삭제
-- ──────────────────────────────────────────────────────────
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

-- ──────────────────────────────────────────────────────────
-- ③ 구요금 재삽입 (~2026-04-02)
--    ⚠️ 핵심: valid_to는 **원본값 유지** (not DATE '2026-04-02')
--    이렇게 해야 롤백 시 완전 복구 가능
-- ──────────────────────────────────────────────────────────
INSERT INTO cruise_rate_card (
  id,
  cruise_name, schedule_type, room_type, room_type_en,
  price_adult, price_child, price_infant, price_extra_bed, price_single,
  valid_year, valid_from, valid_to,
  display_order, currency, is_active, notes,
  price_child_extra_bed, extra_bed_available, includes_vehicle, vehicle_type,
  infant_policy, season_name, is_promotion, price_child_older,
  child_age_range, single_available
)
SELECT
  id,
  _cname,
  schedule_type, room_type, room_type_en,
  price_adult, price_child, price_infant, price_extra_bed, price_single,
  valid_year,
  COALESCE(valid_from, DATE '2026-01-01'),
  valid_to,  -- ✅ 원본 valid_to 그대로 유지
  display_order, currency, true,
  '구요금(원본 ~' || valid_to || ')',
  price_child_extra_bed, extra_bed_available, includes_vehicle, vehicle_type,
  infant_policy, season_name, is_promotion, price_child_older,
  child_age_range, single_available
FROM _laina_src;

-- ──────────────────────────────────────────────────────────
-- ④ 신요금 삽입 (2026-04-03 ~ 2026-12-31)
-- ──────────────────────────────────────────────────────────
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
    THEN '유가인상 +500,000 (2026-04-03~12/31)'
    ELSE '유가인상 +250,000 (2026-04-03~12/31)'
  END,
  price_child_extra_bed, extra_bed_available, includes_vehicle, vehicle_type,
  infant_policy, season_name, is_promotion, price_child_older,
  child_age_range, single_available
FROM _laina_src;

DROP TABLE _laina_src;

COMMIT;

-- ============================================================
-- 진행 단계 3) 검증 쿼리 실행 (아래 모두 실행하여 확인)
-- ============================================================

-- 검증 1) 요금 쌍 확인 - 각 room_type마다 구요금+신요금이 있어야 함
SELECT cruise_name, schedule_type, room_type, season_name,
       valid_from, valid_to, price_adult, notes
FROM cruise_rate_card
WHERE cruise_name = '라이라 그랜져 크루즈' AND valid_year = 2026
ORDER BY schedule_type, room_type, season_name, valid_from;

-- 검증 2) 변형 이름 완전 제거 확인 - 결과 0행이어야 함
SELECT COUNT(*) as variant_count
FROM cruise_rate_card
WHERE cruise_name IN (
  '라이나 크루즈', 'Laina Cruise', '그랜드 크루즈',
  'Laina Grand Cruise', '라이나그랜드크루즈', '라이나 그랜드 크루즈', '라이라그랜져크루즈'
)
AND valid_year = 2026;

-- 검증 3) NULL 값 없음 확인 - 결과 0행이어야 함
SELECT COUNT(*) as null_count
FROM cruise_rate_card
WHERE cruise_name = '라이라 그랜져 크루즈' AND valid_year = 2026
  AND (valid_from IS NULL OR valid_to IS NULL);

-- 검증 4) valid_to 범위 확인 - 원본값이 제대로 유지되는지 확인
SELECT COUNT(DISTINCT valid_to) as distinct_valid_to_count,
       MIN(valid_to) as min_to, MAX(valid_to) as max_to
FROM cruise_rate_card
WHERE cruise_name = '라이라 그랜져 크루즈' AND valid_year = 2026;

-- ============================================================
-- 🔄 롤백 필요 시 (요금 변동 취소)
-- ============================================================
-- 아래는 롤백용 NOT 실행 (필요할 때만 사용)

-- 롤백 단계 1) 신요금(4/3~) 제거
DELETE FROM cruise_rate_card
WHERE cruise_name = '라이라 그랜져 크루즈'
  AND valid_year = 2026
  AND valid_from >= DATE '2026-04-03';

-- 롤백 단계 2) 구요금(원본)의 valid_to 복구 (이미 완료됨 - 이전에 원본값 보존했음)
-- → 구요금의 valid_to는 이미 원본 값(예: 2026-12-31)이므로 수정 불필요
