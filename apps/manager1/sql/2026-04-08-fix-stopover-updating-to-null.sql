-- 2026-04-08
-- 목적: 예약 공항, 렌트카 테이블에서 경유지 필드에 'Updating' 값을 NULL로 변경
-- 대상: 
--   - reservation_airport.ra_stopover_location
--   - reservation_rentcar.via_location, return_via_location

BEGIN;

-- =========================================================
-- 1) reservation_airport 테이블 - ra_stopover_location
-- =========================================================
UPDATE public.reservation_airport
SET ra_stopover_location = NULL
WHERE TRIM(ra_stopover_location) = 'Updating' 
   OR LOWER(TRIM(COALESCE(ra_stopover_location, ''))) = 'updating';

-- 검증: 'Updating' 값이 모두 제거되었는지 확인
SELECT COUNT(*) as airport_stopover_remaining
FROM public.reservation_airport
WHERE LOWER(TRIM(COALESCE(ra_stopover_location, ''))) = 'updating';

-- =========================================================
-- 2) reservation_rentcar 테이블 - via_location, return_via_location
-- =========================================================
UPDATE public.reservation_rentcar
SET 
  via_location = CASE WHEN LOWER(TRIM(COALESCE(via_location, ''))) = 'updating' THEN NULL ELSE via_location END,
  return_via_location = CASE WHEN LOWER(TRIM(COALESCE(return_via_location, ''))) = 'updating' THEN NULL ELSE return_via_location END
WHERE LOWER(TRIM(COALESCE(via_location, ''))) = 'updating' 
   OR LOWER(TRIM(COALESCE(return_via_location, ''))) = 'updating';

-- 검증: 'Updating' 값이 모두 제거되었는지 확인
SELECT 
  (SELECT COUNT(*) FROM public.reservation_rentcar WHERE LOWER(TRIM(COALESCE(via_location, ''))) = 'updating') as rentcar_via_remaining,
  (SELECT COUNT(*) FROM public.reservation_rentcar WHERE LOWER(TRIM(COALESCE(return_via_location, ''))) = 'updating') as rentcar_return_via_remaining;

COMMIT;
