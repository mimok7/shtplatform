-- 요코온센 관련 잘못 반영된 요금 데이터를 즉시 복구하는 롤백 스크립트.
-- 목적
-- 1) 117에서 삭제된 cruise_rate_card 행을 백업 테이블에서 복구.
-- 2) 118/120/121에서 추가된 hotel_price 연장/2027 행 제거.
-- 3) 삭제 전 반드시 122 백업 테이블 생성.
-- 주의
-- - 121의 "직접 UPDATE(end_date)"는 원본 end_date를 별도 보관하지 않아 완전 역복구 불가.
-- - 완전한 시점 복구가 필요하면 Supabase PITR(시점 복구) 사용.

BEGIN;

-- ============================================================================
-- 0) 롤백 대상 백업 생성
-- ============================================================================
CREATE TABLE IF NOT EXISTS public._backup_122_rollback_target_hotel_price_20260705 AS
SELECT *
FROM public.hotel_price
WHERE 1 = 0;

INSERT INTO public._backup_122_rollback_target_hotel_price_20260705
SELECT hp.*
FROM public.hotel_price hp
WHERE (
    hp.hotel_price_code LIKE '%_EXT2026_%'
    OR hp.hotel_price_code LIKE '%_2027_%'
    OR hp.notes ILIKE '%2026-12-31 자동 연장%'
    OR hp.notes ILIKE '%2026-12-31 연장%'
    OR hp.notes ILIKE '%2026 요금 기준 2027 연간 복제%'
    OR hp.notes ILIKE '%2027 연간(2026 기준)%'
    OR hp.notes ILIKE '%직접 연장 (121)%'
)
AND NOT EXISTS (
  SELECT 1
  FROM public._backup_122_rollback_target_hotel_price_20260705 b
  WHERE b.hotel_price_code = hp.hotel_price_code
);

-- ============================================================================
-- 1) cruise_rate_card 복구 (117 백업 테이블 기준)
-- ============================================================================
WITH restored AS (
  INSERT INTO public.cruise_rate_card
  SELECT b.*
  FROM public._backup_117_wrong_yoko_cruise_rate_card_20260705 b
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.cruise_rate_card c
    WHERE c.id = b.id
  )
  RETURNING id
)
SELECT COUNT(*)::int AS restored_cruise_rows
FROM restored;

-- ============================================================================
-- 2) hotel_price 삽입분/연장분 제거 (118/120/121 생성분)
-- ============================================================================
WITH deleted AS (
  DELETE FROM public.hotel_price hp
  WHERE (
      hp.hotel_price_code LIKE '%_EXT2026_%'
      OR hp.hotel_price_code LIKE '%_2027_%'
      OR hp.notes ILIKE '%2026 요금 기준 2027 연간 복제%'
      OR hp.notes ILIKE '%2027 연간(2026 기준)%'
      OR hp.notes ILIKE '%2026-12-31 자동 연장%'
      OR hp.notes ILIKE '%2026-12-31 연장%'
    )
  RETURNING hp.hotel_price_code, hp.hotel_code, hp.hotel_name
)
SELECT
  hotel_code,
  hotel_name,
  COUNT(*)::int AS deleted_rows
FROM deleted
GROUP BY hotel_code, hotel_name
ORDER BY hotel_name;

-- ============================================================================
-- 3) 121 직접 UPDATE 대상 안내 (수동/PITR 필요)
-- ============================================================================
SELECT
  hotel_code,
  hotel_name,
  room_type,
  room_name,
  start_date,
  end_date,
  notes
FROM public.hotel_price
WHERE notes ILIKE '%직접 연장 (121)%'
ORDER BY hotel_name, room_type, room_name, start_date;

COMMIT;
