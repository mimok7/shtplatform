ALTER TABLE public.reservation_cruise_car
  ALTER COLUMN pickup_datetime DROP NOT NULL;

GRANT SELECT ON public.cruise_promotion TO authenticated;

DROP POLICY IF EXISTS cruise_promotion_authenticated_read_active ON public.cruise_promotion;
CREATE POLICY cruise_promotion_authenticated_read_active
  ON public.cruise_promotion FOR SELECT
  TO authenticated
  USING (is_active = true);
