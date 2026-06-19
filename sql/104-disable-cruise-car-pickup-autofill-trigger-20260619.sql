-- pickup_datetime must remain NULL when users intentionally clear it,
-- especially for one-way dropoff rows.
-- Remove every known legacy trigger/function that auto-fills pickup_datetime.

BEGIN;

DROP TRIGGER IF EXISTS fill_pickup_datetime_before_insert ON public.reservation_cruise_car;
DROP TRIGGER IF EXISTS fill_pickup_datetime_before_update ON public.reservation_cruise_car;
DROP TRIGGER IF EXISTS trg_set_pickup_datetime_on_insert ON public.reservation_cruise_car;
DROP TRIGGER IF EXISTS trg_set_pickup_datetime_on_update ON public.reservation_cruise_car;
DROP TRIGGER IF EXISTS trg_sync_cruise_car_pickup_from_checkin ON public.reservation_cruise_car;
DROP TRIGGER IF EXISTS trg_propagate_cruise_checkin_to_car_pickup ON public.reservation_cruise;

DROP FUNCTION IF EXISTS public.fill_cruise_car_pickup_datetime();
DROP FUNCTION IF EXISTS public.set_pickup_datetime_on_insert();
DROP FUNCTION IF EXISTS public.set_pickup_datetime_on_update();
DROP FUNCTION IF EXISTS public.fn_sync_cruise_car_pickup_from_checkin();
DROP FUNCTION IF EXISTS public.fn_propagate_cruise_checkin_to_car_pickup();
DROP FUNCTION IF EXISTS public.fn_get_cruise_checkin_by_vehicle_reservation(uuid);

-- Existing one-way dropoff rows should keep pickup_datetime empty.
UPDATE public.reservation_cruise_car
SET return_datetime = COALESCE(return_datetime, pickup_datetime),
    pickup_datetime = NULL
WHERE way_type = '편도'
  AND one_way_direction = 'dropoff'
  AND pickup_datetime IS NOT NULL;

COMMIT;

-- Verification
-- SELECT trigger_name, event_object_table
-- FROM information_schema.triggers
-- WHERE event_object_schema = 'public'
--   AND event_object_table IN ('reservation_cruise_car', 'reservation_cruise')
-- ORDER BY event_object_table, trigger_name;
--
-- SELECT reservation_id, way_type, one_way_direction, pickup_datetime, return_datetime
-- FROM public.reservation_cruise_car
-- WHERE way_type = '편도' AND one_way_direction = 'dropoff'
-- ORDER BY updated_at DESC NULLS LAST
-- LIMIT 20;
