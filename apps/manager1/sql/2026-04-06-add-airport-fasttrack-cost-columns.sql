-- 2026-04-06-add-airport-fasttrack-cost-columns.sql
-- reservation_airport_fasttrack에 패스트랙 비용 저장 컬럼을 추가합니다.

BEGIN;

ALTER TABLE public.reservation_airport_fasttrack
  ADD COLUMN IF NOT EXISTS unit_price_usd numeric(12,2),
  ADD COLUMN IF NOT EXISTS total_price_usd numeric(12,2),
  ADD COLUMN IF NOT EXISTS usd_to_krw_rate numeric(12,4),
  ADD COLUMN IF NOT EXISTS total_price_krw integer;

-- 기본 단가(1인당 25 USD) 백필
UPDATE public.reservation_airport_fasttrack
SET unit_price_usd = 25
WHERE unit_price_usd IS NULL;

-- 저장된 단가가 있는 행은 합계를 함께 보정
UPDATE public.reservation_airport_fasttrack
SET total_price_usd = COALESCE(total_price_usd, unit_price_usd)
WHERE total_price_usd IS NULL
  AND unit_price_usd IS NOT NULL;

COMMIT;
