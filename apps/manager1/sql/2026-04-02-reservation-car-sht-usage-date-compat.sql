-- ============================================================
-- reservation_car_sht usage_date 호환성 패치
-- 작성일: 2026-04-02
-- 목적:
--   1) 구버전 코드가 사용하는 usage_date 컬럼 호환 제공
--   2) 신버전 pickup_datetime 컬럼과 자동 동기화
--   3) 재실행 안전(idempotent)
-- ============================================================

BEGIN;

-- 1) usage_date 컬럼 추가 (없으면 생성)
ALTER TABLE reservation_car_sht
ADD COLUMN IF NOT EXISTS usage_date date;

-- 2) 기존 데이터 백필 (pickup_datetime -> usage_date)
UPDATE reservation_car_sht
SET usage_date = (pickup_datetime AT TIME ZONE 'Asia/Seoul')::date
WHERE usage_date IS NULL
  AND pickup_datetime IS NOT NULL;

-- 3) 동기화 함수 생성
CREATE OR REPLACE FUNCTION fn_sync_reservation_car_sht_usage_date()
RETURNS TRIGGER AS $$
BEGIN
  -- pickup_datetime만 있는 경우 usage_date를 채움
  IF NEW.usage_date IS NULL AND NEW.pickup_datetime IS NOT NULL THEN
    NEW.usage_date := (NEW.pickup_datetime AT TIME ZONE 'Asia/Seoul')::date;
  END IF;

  -- usage_date만 있는 경우 pickup_datetime를 KST 09:00 기준으로 채움
  IF NEW.pickup_datetime IS NULL AND NEW.usage_date IS NOT NULL THEN
    NEW.pickup_datetime := (NEW.usage_date::text || 'T09:00:00+09:00')::timestamptz;
  END IF;

  -- 둘 다 있는 경우 pickup_datetime 기준으로 usage_date 정규화
  IF NEW.pickup_datetime IS NOT NULL THEN
    NEW.usage_date := (NEW.pickup_datetime AT TIME ZONE 'Asia/Seoul')::date;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4) 트리거 재생성
DROP TRIGGER IF EXISTS trg_sync_reservation_car_sht_usage_date ON reservation_car_sht;

CREATE TRIGGER trg_sync_reservation_car_sht_usage_date
BEFORE INSERT OR UPDATE ON reservation_car_sht
FOR EACH ROW
EXECUTE FUNCTION fn_sync_reservation_car_sht_usage_date();

-- 5) 조회 성능용 인덱스
CREATE INDEX IF NOT EXISTS idx_reservation_car_sht_usage_date
ON reservation_car_sht (usage_date);

COMMIT;

-- ============================================================
-- 검증 쿼리
-- ============================================================
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'reservation_car_sht'
--   AND column_name IN ('usage_date', 'pickup_datetime');

-- SELECT reservation_id, usage_date, pickup_datetime
-- FROM reservation_car_sht
-- ORDER BY pickup_datetime DESC NULLS LAST
-- LIMIT 20;
