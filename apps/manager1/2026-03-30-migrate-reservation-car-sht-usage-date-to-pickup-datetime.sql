BEGIN;

-- 1) Copy usage_date into pickup_datetime when pickup_datetime is empty.
UPDATE reservation_car_sht
SET pickup_datetime = usage_date::date
WHERE pickup_datetime IS NULL
  AND usage_date IS NOT NULL;

-- 2) Remove old index on usage_date if it exists.
DROP INDEX IF EXISTS idx_res_car_sht_usage_date;
DROP INDEX IF EXISTS reservation_car_sht_usage_date_idx;

-- 3) Drop legacy column.
ALTER TABLE reservation_car_sht
DROP COLUMN IF EXISTS usage_date;

-- 4) Ensure index on pickup_datetime.
CREATE INDEX IF NOT EXISTS idx_res_car_sht_pickup_datetime
  ON reservation_car_sht (pickup_datetime);

COMMIT;
