-- ============================================================================
-- Migration: Auto-fill pickup_datetime from reservation_cruise.checkin
-- Purpose: Ensure reservation_cruise_car.pickup_datetime is never NULL
-- ============================================================================

-- Step 0: Diagnose NULL values (optional - for debugging)
-- SELECT COUNT(*) as null_count FROM reservation_cruise_car WHERE pickup_datetime IS NULL;

-- Step 1: Fill existing NULL values with corresponding checkin dates
-- Use COALESCE to handle any edge cases
UPDATE reservation_cruise_car
SET pickup_datetime = (
  SELECT rc.checkin
  FROM reservation_cruise rc
  WHERE rc.reservation_id = reservation_cruise_car.reservation_id
  LIMIT 1
)
WHERE pickup_datetime IS NULL
  AND EXISTS (
    SELECT 1 FROM reservation_cruise rc
    WHERE rc.reservation_id = reservation_cruise_car.reservation_id
  );

-- Step 1b: Verify remaining NULLs and set default date if orphaned
-- For any reservation_cruise_car rows without matching reservation_cruise, use the current date
UPDATE reservation_cruise_car
SET pickup_datetime = CURRENT_DATE
WHERE pickup_datetime IS NULL;

-- Step 2: Add NOT NULL constraint to pickup_datetime
ALTER TABLE reservation_cruise_car
ALTER COLUMN pickup_datetime SET NOT NULL;

-- Step 3: Create trigger for INSERT - auto-fill if NULL
CREATE OR REPLACE FUNCTION set_pickup_datetime_on_insert()
RETURNS TRIGGER AS $$
BEGIN
  -- If pickup_datetime is NULL, fetch checkin from reservation_cruise
  IF NEW.pickup_datetime IS NULL THEN
    NEW.pickup_datetime := COALESCE(
      (SELECT rc.checkin 
       FROM reservation_cruise rc 
       WHERE rc.reservation_id = NEW.reservation_id 
       LIMIT 1),
      CURRENT_DATE
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_pickup_datetime_on_insert ON reservation_cruise_car;
CREATE TRIGGER trg_set_pickup_datetime_on_insert
BEFORE INSERT ON reservation_cruise_car
FOR EACH ROW
EXECUTE FUNCTION set_pickup_datetime_on_insert();

-- Step 4: Create trigger for UPDATE - auto-fill if being set to NULL
CREATE OR REPLACE FUNCTION set_pickup_datetime_on_update()
RETURNS TRIGGER AS $$
BEGIN
  -- If attempting to update pickup_datetime to NULL, fetch from reservation_cruise
  IF NEW.pickup_datetime IS NULL AND OLD.pickup_datetime IS NOT NULL THEN
    NEW.pickup_datetime := COALESCE(
      (SELECT rc.checkin 
       FROM reservation_cruise rc 
       WHERE rc.reservation_id = NEW.reservation_id 
       LIMIT 1),
      OLD.pickup_datetime
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_pickup_datetime_on_update ON reservation_cruise_car;
CREATE TRIGGER trg_set_pickup_datetime_on_update
BEFORE UPDATE ON reservation_cruise_car
FOR EACH ROW
EXECUTE FUNCTION set_pickup_datetime_on_update();

-- ============================================================================
-- Verification: Check results
-- ============================================================================
-- SELECT 
--   rcc.id,
--   rcc.reservation_id,
--   rcc.pickup_datetime,
--   rc.checkin,
--   CASE WHEN rcc.pickup_datetime = rc.checkin THEN '✓ OK' ELSE '✗ MISMATCH' END AS status
-- FROM reservation_cruise_car rcc
-- LEFT JOIN reservation_cruise rc ON rcc.reservation_id = rc.reservation_id
-- WHERE rcc.pickup_datetime IS NULL
-- LIMIT 10;
