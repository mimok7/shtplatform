-- 공항 예약 테이블에 차종(vehicle_type) 컬럼 추가
-- Supabase Dashboard → SQL Editor에서 실행

ALTER TABLE reservation_airport
  ADD COLUMN IF NOT EXISTS vehicle_type text NULL;

COMMENT ON COLUMN reservation_airport.vehicle_type IS '차종 (예: 4인승 세단, 7인승 미니밴, 16인승 미니버스 등)';
