-- 2026-04-08
-- Create temp tables for customer reservation edit requests (7 services)
-- Flow: customer submits change request -> manager approves -> apply to reservation_* tables

BEGIN;

-- =========================================================
-- 0) Header table: one row per change request
-- =========================================================
CREATE TABLE IF NOT EXISTS public.reservation_change_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL REFERENCES public.reservation(re_id) ON DELETE CASCADE,
  re_type text NOT NULL CHECK (re_type IN ('airport', 'car_sht', 'cruise', 'cruise_car', 'hotel', 'rentcar', 'tour')),
  requester_user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  customer_note text,
  manager_note text,
  submitted_at timestamp with time zone NOT NULL DEFAULT now(),
  reviewed_at timestamp with time zone,
  reviewed_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reservation_change_request_reservation_id
  ON public.reservation_change_request (reservation_id);

CREATE INDEX IF NOT EXISTS idx_reservation_change_request_status
  ON public.reservation_change_request (status);

CREATE INDEX IF NOT EXISTS idx_reservation_change_request_requester
  ON public.reservation_change_request (requester_user_id);

-- One pending request per reservation + service type
CREATE UNIQUE INDEX IF NOT EXISTS uq_reservation_change_request_pending
  ON public.reservation_change_request (reservation_id, re_type)
  WHERE status = 'pending';

CREATE OR REPLACE FUNCTION public.fn_touch_reservation_change_request_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_reservation_change_request_updated_at ON public.reservation_change_request;
CREATE TRIGGER trg_touch_reservation_change_request_updated_at
BEFORE UPDATE ON public.reservation_change_request
FOR EACH ROW
EXECUTE FUNCTION public.fn_touch_reservation_change_request_updated_at();

-- =========================================================
-- 1) reservation_airport temp
-- =========================================================
CREATE TABLE IF NOT EXISTS public.reservation_change_airport (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.reservation_change_request(id) ON DELETE CASCADE,
  reservation_id uuid NOT NULL REFERENCES public.reservation(re_id) ON DELETE CASCADE,
  airport_price_code text,
  ra_airport_location text,
  ra_flight_number text,
  ra_datetime timestamp with time zone,
  ra_stopover_location text,
  ra_stopover_wait_minutes integer,
  ra_car_count integer,
  ra_passenger_count integer,
  ra_luggage_count integer,
  request_note text,
  unit_price numeric,
  total_price numeric,
  dispatch_code text,
  pickup_confirmed_at timestamp with time zone,
  dispatch_memo text,
  way_type text,
  accommodation_info text,
  ra_airport_name text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (request_id, reservation_id)
);

CREATE INDEX IF NOT EXISTS idx_reservation_change_airport_request_id
  ON public.reservation_change_airport (request_id);

-- =========================================================
-- 2) reservation_car_sht temp
-- =========================================================
CREATE TABLE IF NOT EXISTS public.reservation_change_car_sht (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.reservation_change_request(id) ON DELETE CASCADE,
  reservation_id uuid NOT NULL REFERENCES public.reservation(re_id) ON DELETE CASCADE,
  vehicle_number text,
  seat_number text,
  sht_category text,
  dispatch_code text,
  pickup_confirmed_at timestamp with time zone,
  dispatch_memo text,
  car_price_code text,
  car_count integer,
  passenger_count integer,
  pickup_datetime date,
  pickup_location text,
  dropoff_location text,
  car_total_price numeric,
  request_note text,
  unit_price numeric,
  accommodation_info text,
  usage_date date,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (request_id, reservation_id)
);

CREATE INDEX IF NOT EXISTS idx_reservation_change_car_sht_request_id
  ON public.reservation_change_car_sht (request_id);

-- =========================================================
-- 3) reservation_cruise temp
-- =========================================================
CREATE TABLE IF NOT EXISTS public.reservation_change_cruise (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.reservation_change_request(id) ON DELETE CASCADE,
  reservation_id uuid NOT NULL REFERENCES public.reservation(re_id) ON DELETE CASCADE,
  room_price_code text,
  checkin date,
  guest_count integer,
  unit_price numeric,
  room_total_price numeric,
  request_note text,
  boarding_code text,
  boarding_assist boolean,
  room_count integer,
  adult_count integer,
  child_count integer,
  infant_count integer,
  accommodation_info text,
  child_extra_bed_count integer,
  extra_bed_count integer,
  single_count integer,
  connecting_room boolean,
  birthday_event boolean,
  birthday_name text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (request_id, reservation_id)
);

CREATE INDEX IF NOT EXISTS idx_reservation_change_cruise_request_id
  ON public.reservation_change_cruise (request_id);

-- =========================================================
-- 4) reservation_cruise_car temp
-- =========================================================
CREATE TABLE IF NOT EXISTS public.reservation_change_cruise_car (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.reservation_change_request(id) ON DELETE CASCADE,
  reservation_id uuid NOT NULL REFERENCES public.reservation(re_id) ON DELETE CASCADE,
  car_price_code text,
  car_count integer,
  passenger_count integer,
  pickup_datetime date,
  pickup_location text,
  dropoff_location text,
  car_total_price numeric,
  request_note text,
  unit_price numeric,
  dispatch_code text,
  pickup_confirmed_at timestamp with time zone,
  dispatch_memo text,
  rentcar_price_code text,
  way_type text,
  route text,
  vehicle_type text,
  rental_type text,
  return_datetime date,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (request_id, reservation_id)
);

CREATE INDEX IF NOT EXISTS idx_reservation_change_cruise_car_request_id
  ON public.reservation_change_cruise_car (request_id);

-- =========================================================
-- 5) reservation_hotel temp
-- =========================================================
CREATE TABLE IF NOT EXISTS public.reservation_change_hotel (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.reservation_change_request(id) ON DELETE CASCADE,
  reservation_id uuid NOT NULL REFERENCES public.reservation(re_id) ON DELETE CASCADE,
  schedule text,
  room_count integer,
  checkin_date date,
  breakfast_service text,
  hotel_category text,
  guest_count integer,
  total_price numeric,
  hotel_price_code text,
  request_note text,
  unit_price numeric,
  assignment_code text,
  adult_count integer,
  child_count integer,
  infant_count integer,
  accommodation_info text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (request_id, reservation_id)
);

CREATE INDEX IF NOT EXISTS idx_reservation_change_hotel_request_id
  ON public.reservation_change_hotel (request_id);

-- =========================================================
-- 6) reservation_rentcar temp
-- =========================================================
CREATE TABLE IF NOT EXISTS public.reservation_change_rentcar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.reservation_change_request(id) ON DELETE CASCADE,
  reservation_id uuid NOT NULL REFERENCES public.reservation(re_id) ON DELETE CASCADE,
  rentcar_price_code text,
  rentcar_count integer,
  unit_price numeric,
  car_count integer,
  passenger_count integer,
  pickup_datetime timestamp with time zone,
  pickup_location text,
  destination text,
  via_location text,
  via_waiting text,
  luggage_count integer,
  total_price numeric,
  request_note text,
  dispatch_code text,
  pickup_confirmed_at timestamp with time zone,
  dispatch_memo text,
  way_type text,
  return_datetime timestamp with time zone,
  return_pickup_location text,
  return_destination text,
  return_via_location text,
  return_via_waiting text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (request_id, reservation_id)
);

CREATE INDEX IF NOT EXISTS idx_reservation_change_rentcar_request_id
  ON public.reservation_change_rentcar (request_id);

-- =========================================================
-- 7) reservation_tour temp
-- =========================================================
CREATE TABLE IF NOT EXISTS public.reservation_change_tour (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.reservation_change_request(id) ON DELETE CASCADE,
  reservation_id uuid NOT NULL REFERENCES public.reservation(re_id) ON DELETE CASCADE,
  tour_price_code text,
  tour_capacity integer,
  pickup_location text,
  dropoff_location text,
  total_price numeric,
  request_note text,
  usage_date date,
  unit_price numeric,
  adult_count integer,
  child_count integer,
  infant_count integer,
  accommodation_info text,
  dispatch_code text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (request_id, reservation_id)
);

CREATE INDEX IF NOT EXISTS idx_reservation_change_tour_request_id
  ON public.reservation_change_tour (request_id);

COMMIT;
