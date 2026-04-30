-- 012-add-ra-airport-name.sql
-- Add ra_airport_name column to reservation_airport and backfill existing rows

BEGIN;

-- Add column if it doesn't exist
ALTER TABLE public.reservation_airport
  ADD COLUMN IF NOT EXISTS ra_airport_name text;

-- Column comment
COMMENT ON COLUMN public.reservation_airport.ra_airport_name IS
  '선택된 공항명 (airport_name.code 또는 사용자 입력), NULL 허용';

-- Backfill: prefer accommodation_info, then ra_airport_location
UPDATE public.reservation_airport
SET ra_airport_name = COALESCE(NULLIF(TRIM(accommodation_info),''), NULLIF(TRIM(ra_airport_location),''))
WHERE ra_airport_name IS NULL;

COMMIT;
