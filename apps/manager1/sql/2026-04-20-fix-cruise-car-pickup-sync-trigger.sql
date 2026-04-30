-- ============================================================================
-- Fix: Sync reservation_cruise_car.pickup_datetime from reservation_cruise.checkin
-- Date: 2026-04-20
-- Scope:
--   1) Backfill NULL pickup dates using quote-based linkage
--   2) Fill NULL return_datetime by way_type rules
--   3) Trigger on reservation_cruise_car INSERT/UPDATE for NULL-only autofill
--   4) Trigger on reservation_cruise.checkin UPDATE for NULL-only propagation
--
-- Important:
--   - This script avoids CURRENT_DATE fallback.
--   - This script uses reservation.re_quote_id linkage, not only reservation_id direct join.
-- ============================================================================

BEGIN;

-- 0) Helper: resolve cruise checkin by vehicle reservation id through quote linkage
CREATE OR REPLACE FUNCTION public.fn_get_cruise_checkin_by_vehicle_reservation(
  p_vehicle_reservation_id uuid
)
RETURNS date
LANGUAGE sql
STABLE
AS $$
  SELECT rc.checkin
  FROM reservation rv
  JOIN reservation rcr
    ON rcr.re_quote_id = rv.re_quote_id
   AND rcr.re_type = 'cruise'
  JOIN reservation_cruise rc
    ON rc.reservation_id = rcr.re_id
  WHERE rv.re_id = p_vehicle_reservation_id
  ORDER BY rcr.re_created_at DESC NULLS LAST
  LIMIT 1
$$;

-- 1) Backfill NULL pickup rows only (existing non-NULL values are preserved)
WITH resolved AS (
  SELECT
    rv.re_id AS vehicle_reservation_id,
    rc.checkin AS cruise_checkin
  FROM reservation rv
  JOIN reservation rcr
    ON rcr.re_quote_id = rv.re_quote_id
   AND rcr.re_type = 'cruise'
  JOIN reservation_cruise rc
    ON rc.reservation_id = rcr.re_id
)
UPDATE reservation_cruise_car rcc
SET pickup_datetime = resolved.cruise_checkin
FROM resolved
WHERE rcc.reservation_id = resolved.vehicle_reservation_id
  AND rcc.pickup_datetime IS NULL;

-- 1b) Backfill NULL return_datetime by way_type
--   - 편도: keep NULL
--   - 당일왕복: same day as pickup_datetime
--   - 다른날왕복: next day from pickup_datetime
UPDATE reservation_cruise_car rcc
SET return_datetime = CASE
  WHEN rcc.way_type = '당일왕복' THEN rcc.pickup_datetime
  WHEN rcc.way_type = '다른날왕복' THEN rcc.pickup_datetime + 1
  ELSE NULL
END
WHERE rcc.return_datetime IS NULL
  AND rcc.pickup_datetime IS NOT NULL
  AND rcc.way_type IN ('당일왕복', '다른날왕복');

-- 2) NULL-only autofill on reservation_cruise_car writes
CREATE OR REPLACE FUNCTION public.fn_sync_cruise_car_pickup_from_checkin()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_checkin date;
BEGIN
  -- pickup_datetime: fill only when NULL
  IF NEW.pickup_datetime IS NULL THEN
    v_checkin := public.fn_get_cruise_checkin_by_vehicle_reservation(NEW.reservation_id);

    IF v_checkin IS NULL THEN
      RAISE EXCEPTION
        'Cannot resolve cruise checkin for reservation_id=% while syncing pickup_datetime',
        NEW.reservation_id;
    END IF;

    NEW.pickup_datetime := v_checkin;
  END IF;

  -- return_datetime: fill only when NULL
  --   - 편도: keep NULL
  --   - 당일왕복: same day
  --   - 다른날왕복: next day
  IF NEW.return_datetime IS NULL THEN
    IF NEW.way_type = '당일왕복' THEN
      NEW.return_datetime := NEW.pickup_datetime;
    ELSIF NEW.way_type = '다른날왕복' THEN
      NEW.return_datetime := NEW.pickup_datetime + 1;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_cruise_car_pickup_from_checkin ON public.reservation_cruise_car;
CREATE TRIGGER trg_sync_cruise_car_pickup_from_checkin
BEFORE INSERT OR UPDATE OF reservation_id, pickup_datetime, return_datetime, way_type
ON public.reservation_cruise_car
FOR EACH ROW
EXECUTE FUNCTION public.fn_sync_cruise_car_pickup_from_checkin();

-- 3) Propagate checkin updates to linked reservation_cruise_car rows (NULL-only)
CREATE OR REPLACE FUNCTION public.fn_propagate_cruise_checkin_to_car_pickup()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.checkin IS DISTINCT FROM OLD.checkin THEN
    UPDATE reservation_cruise_car rcc
    SET pickup_datetime = COALESCE(rcc.pickup_datetime, NEW.checkin),
        return_datetime = CASE
          WHEN rcc.return_datetime IS NOT NULL THEN rcc.return_datetime
          WHEN rcc.way_type = '당일왕복' THEN COALESCE(rcc.pickup_datetime, NEW.checkin)
          WHEN rcc.way_type = '다른날왕복' THEN COALESCE(rcc.pickup_datetime, NEW.checkin) + 1
          ELSE NULL
        END
    FROM reservation rcr, reservation rv
    WHERE rcr.re_id = NEW.reservation_id
      AND rv.re_quote_id = rcr.re_quote_id
      AND rcc.reservation_id = rv.re_id
      AND (
        rcc.pickup_datetime IS NULL
        OR (
          rcc.return_datetime IS NULL
          AND rcc.way_type IN ('당일왕복', '다른날왕복')
        )
      );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_propagate_cruise_checkin_to_car_pickup ON public.reservation_cruise;
CREATE TRIGGER trg_propagate_cruise_checkin_to_car_pickup
AFTER UPDATE OF checkin
ON public.reservation_cruise
FOR EACH ROW
EXECUTE FUNCTION public.fn_propagate_cruise_checkin_to_car_pickup();

COMMIT;

-- Optional verification queries:
--
-- 1) Remaining mismatches
-- SELECT COUNT(*) AS mismatch_count
-- FROM reservation_cruise_car rcc
-- JOIN reservation rv ON rv.re_id = rcc.reservation_id
-- JOIN reservation rcr ON rcr.re_quote_id = rv.re_quote_id AND rcr.re_type = 'cruise'
-- JOIN reservation_cruise rc ON rc.reservation_id = rcr.re_id
-- WHERE rcc.pickup_datetime IS DISTINCT FROM rc.checkin;
--
-- 2) Trigger list
-- SELECT trigger_name, event_manipulation, action_timing, event_object_table, action_statement
-- FROM information_schema.triggers
-- WHERE event_object_schema = 'public'
--   AND event_object_table IN ('reservation_cruise_car', 'reservation_cruise')
-- ORDER BY event_object_table, trigger_name;
