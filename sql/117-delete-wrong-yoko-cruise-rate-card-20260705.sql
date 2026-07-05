-- 요코 호텔 작업 중 오적재된 cruise_rate_card 행을 백업 후 삭제하는 스크립트.
-- ============================================================================
-- 117-delete-wrong-yoko-cruise-rate-card-20260705.sql
-- db.csv 참조 테이블: cruise_rate_card
-- 목적
--   1) 요코 관련으로 잘못 들어간 크루즈 요금 행만 선별.
--   2) 삭제 전 백업 테이블에 저장.
--   3) 삭제 결과와 잔여 건수 확인.
-- ============================================================================

BEGIN;

-- 백업 테이블 생성(최초 1회)
CREATE TABLE IF NOT EXISTS public._backup_117_wrong_yoko_cruise_rate_card_20260705 AS
SELECT *
FROM public.cruise_rate_card
WHERE 1 = 0;

WITH wrong_rows AS (
  SELECT *
  FROM public.cruise_rate_card
  WHERE valid_year IN (2026, 2027)
    AND (cruise_name ILIKE '%요코%' OR cruise_name ILIKE '%yoko%')
    AND (
      notes ILIKE '%2026-12-31 연장%'
      OR notes ILIKE '%2027 연간(2026 기준)%'
      OR notes ILIKE '%2026 요금 기준 2027 연간 복제%'
    )
),
backed_up AS (
  INSERT INTO public._backup_117_wrong_yoko_cruise_rate_card_20260705
  SELECT w.*
  FROM wrong_rows w
  WHERE NOT EXISTS (
    SELECT 1
    FROM public._backup_117_wrong_yoko_cruise_rate_card_20260705 b
    WHERE b.id = w.id
  )
  RETURNING id
),
deleted AS (
  DELETE FROM public.cruise_rate_card c
  USING wrong_rows w
  WHERE c.id = w.id
  RETURNING c.id
)
SELECT
  (SELECT COUNT(*)::int FROM wrong_rows) AS target_count,
  (SELECT COUNT(*)::int FROM backed_up) AS backup_count,
  (SELECT COUNT(*)::int FROM deleted) AS deleted_count;

-- 잔여 오적재 건수 확인(0 기대)
SELECT COUNT(*)::int AS remaining_wrong_rows
FROM public.cruise_rate_card
WHERE valid_year IN (2026, 2027)
  AND (cruise_name ILIKE '%요코%' OR cruise_name ILIKE '%yoko%')
  AND (
    notes ILIKE '%2026-12-31 연장%'
    OR notes ILIKE '%2027 연간(2026 기준)%'
    OR notes ILIKE '%2026 요금 기준 2027 연간 복제%'
  );

COMMIT;
