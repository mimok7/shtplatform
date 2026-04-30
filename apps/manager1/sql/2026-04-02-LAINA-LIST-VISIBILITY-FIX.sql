-- ============================================================
-- 라이라 그랜져 크루즈 목록 노출 보정 SQL (2026)
-- 목적:
-- 1) 크루즈 목록에서 라이라가 사라지는 문제 즉시 복구
-- 2) 변형 이름 정규화 + 활성화 + 유효기간 보정
-- 3) 기존 데이터는 최대한 보존하며 노출 조건만 회복
-- ============================================================

-- [진단 1] 현재 상태 확인
SELECT
  cruise_name,
  schedule_type,
  room_type,
  valid_from,
  valid_to,
  is_active,
  price_adult,
  notes,
  id
FROM cruise_rate_card
WHERE (
  cruise_name ILIKE '%라이라%'
  OR cruise_name ILIKE '%라이나%'
  OR cruise_name ILIKE '%laina%'
  OR cruise_name ILIKE '%그랜드 크루즈%'
)
AND valid_year = 2026
ORDER BY cruise_name, schedule_type, room_type, valid_from;

BEGIN;

-- 1) 변형 이름 -> 정규 이름 통일 + 활성화
UPDATE cruise_rate_card
SET
  cruise_name = '라이라 그랜져 크루즈',
  is_active = true
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

-- 2) 보류(원복) 상태에서 잘못 축소된 valid_to 보정
--    (구요금 구간이 4/2로 잘려 목록에서 탈락하는 케이스 복구)
UPDATE cruise_rate_card
SET valid_to = DATE '2026-12-31'
WHERE cruise_name = '라이라 그랜져 크루즈'
  AND valid_year = 2026
  AND (valid_from IS NULL OR valid_from < DATE '2026-04-03')
  AND valid_to = DATE '2026-04-02';

-- 3) valid_from/valid_to NULL 보정 (목록 필터 안전)
UPDATE cruise_rate_card
SET
  valid_from = COALESCE(valid_from, DATE '2026-01-01'),
  valid_to = COALESCE(valid_to, DATE '2026-12-31')
WHERE cruise_name = '라이라 그랜져 크루즈'
  AND valid_year = 2026
  AND (valid_from IS NULL OR valid_to IS NULL);

COMMIT;

-- [검증 1] 목록 노출 조건 체크 (is_active + 유효기간)
SELECT
  cruise_name,
  schedule_type,
  room_type,
  valid_from,
  valid_to,
  is_active,
  price_adult,
  notes
FROM cruise_rate_card
WHERE cruise_name = '라이라 그랜져 크루즈'
  AND valid_year = 2026
  AND is_active = true
ORDER BY schedule_type, room_type, valid_from;

-- [검증 2] 특정 체크인일(문제 재현일) 노출 여부 확인
SELECT
  cruise_name,
  schedule_type,
  room_type,
  price_adult,
  valid_from,
  valid_to
FROM cruise_rate_card
WHERE cruise_name = '라이라 그랜져 크루즈'
  AND valid_year = 2026
  AND is_active = true
  AND valid_from <= DATE '2026-05-31'
  AND valid_to >= DATE '2026-05-31'
ORDER BY schedule_type, room_type, valid_from;

-- [검증 3] 변형 이름 잔존 여부 (0이어야 정상)
SELECT COUNT(*) AS variant_name_count
FROM cruise_rate_card
WHERE cruise_name IN (
  '라이나 그랜드 크루즈',
  '라이나 크루즈',
  'Laina Cruise',
  'Laina Grand Cruise',
  '그랜드 크루즈',
  '라이나그랜드크루즈',
  '라이라그랜져크루즈'
)
AND valid_year = 2026;
