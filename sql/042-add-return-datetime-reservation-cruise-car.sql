-- ============================================================
-- 042: reservation_cruise_car 테이블 컬럼 추가
-- 목적: 크루즈 일반 차량 예약에서 픽업/리턴 날짜와 시간 저장 지원
--       기존 코드에서 INSERT 중이나 DB에 없을 수 있는 컬럼들 보완
-- ============================================================

-- 기존 코드에서 이미 INSERT하지만 db.csv에 누락된 컬럼들
ALTER TABLE reservation_cruise_car ADD COLUMN IF NOT EXISTS pickup_time time NULL;
ALTER TABLE reservation_cruise_car ADD COLUMN IF NOT EXISTS return_time time NULL;
ALTER TABLE reservation_cruise_car ADD COLUMN IF NOT EXISTS way_type text NULL;
ALTER TABLE reservation_cruise_car ADD COLUMN IF NOT EXISTS route text NULL;
ALTER TABLE reservation_cruise_car ADD COLUMN IF NOT EXISTS vehicle_type text NULL;
ALTER TABLE reservation_cruise_car ADD COLUMN IF NOT EXISTS rental_type text NULL;
ALTER TABLE reservation_cruise_car ADD COLUMN IF NOT EXISTS rentcar_price_code text NULL;

-- 검증 쿼리 (실행 후 확인용)
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'reservation_cruise_car'
-- ORDER BY ordinal_position;
