-- ============================================================================
-- 109-fix-sht-pricing-and-total-trigger-20260622.sql
-- SHT 저장 누락 보정 및 reservation.total_amount 재계산 보완
-- ============================================================================
-- 목적:
--   1. reservation_car_sht 저장 시 단가/인원 기본값을 최대한 정규화
--   2. 기존에 0으로 저장된 SHT 금액을 안전하게 백필
--   3. reservation.total_amount 재계산 함수에 SHT 합계를 정확히 반영
--
-- 주의:
--   - 왕복 분리 저장처럼 한 행은 0원, 다른 행은 실금액인 경우가 존재할 수 있으므로
--     같은 reservation_id에 이미 금액이 있는 sibling 행이 있으면 0원을 유지한다.
--   - 좌석 문자열(A/B/C/ALL)은 좌석 규칙으로, 숫자 seat_number는 인원수로 해석한다.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_count_sht_seats(p_seat_number text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    CASE
      WHEN COALESCE(BTRIM(p_seat_number), '') = '' THEN 0
      WHEN BTRIM(p_seat_number) ~ '^[0-9]+$' THEN BTRIM(p_seat_number)::integer
      ELSE COALESCE((
        SELECT COUNT(*)
        FROM regexp_split_to_table(BTRIM(p_seat_number), E'[,;\\s]+') AS seat
        WHERE BTRIM(seat) <> ''
      ), 0)
    END
$$;

CREATE OR REPLACE FUNCTION public.fn_compute_sht_row_total(
  p_seat_number text,
  p_unit_price numeric,
  p_passenger_count integer,
  p_car_count integer
)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_clean text := COALESCE(BTRIM(p_seat_number), '');
  v_total numeric := 0;
  v_effective_unit numeric := COALESCE(NULLIF(p_unit_price, 0), 0);
  v_effective_count integer := GREATEST(
    COALESCE(NULLIF(p_passenger_count, 0), 0),
    COALESCE(NULLIF(p_car_count, 0), 0),
    public.fn_count_sht_seats(p_seat_number)
  );
BEGIN
  IF v_clean = '' THEN
    RETURN v_effective_unit * v_effective_count;
  END IF;

  IF UPPER(v_clean) = 'ALL' THEN
    RETURN 4900000;
  END IF;

  IF v_clean ~ '^[0-9]+$' THEN
    RETURN v_effective_unit * v_clean::integer;
  END IF;

  SELECT COALESCE(SUM(
    CASE
      WHEN UPPER(BTRIM(seat)) = 'ALL' THEN 4900000
      WHEN UPPER(BTRIM(seat)) LIKE 'A%' THEN 490000
      WHEN UPPER(BTRIM(seat)) LIKE 'B%' THEN 350000
      WHEN UPPER(BTRIM(seat)) LIKE 'C%' THEN 590000
      ELSE 0
    END
  ), 0)
  INTO v_total
  FROM regexp_split_to_table(v_clean, E'[,;\\s]+') AS seat
  WHERE BTRIM(seat) <> '';

  IF v_total > 0 THEN
    RETURN v_total;
  END IF;

  RETURN v_effective_unit * v_effective_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_normalize_reservation_car_sht_pricing()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_price numeric;
  v_inferred_count integer;
BEGIN
  IF NEW.car_price_code IS NOT NULL
     AND COALESCE(NEW.unit_price, 0) = 0 THEN
    SELECT price
    INTO v_price
    FROM public.rentcar_price
    WHERE rent_code = NEW.car_price_code
    LIMIT 1;

    IF COALESCE(v_price, 0) > 0 THEN
      NEW.unit_price := v_price;
    END IF;
  END IF;

  v_inferred_count := public.fn_count_sht_seats(NEW.seat_number);

  IF COALESCE(NEW.passenger_count, 0) = 0
     AND v_inferred_count > 0 THEN
    NEW.passenger_count := v_inferred_count;
  END IF;

  IF COALESCE(NEW.car_count, 0) = 0 THEN
    NEW.car_count := 1;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_reservation_car_sht_pricing ON public.reservation_car_sht;

CREATE TRIGGER trg_normalize_reservation_car_sht_pricing
BEFORE INSERT OR UPDATE ON public.reservation_car_sht
FOR EACH ROW
EXECUTE FUNCTION public.fn_normalize_reservation_car_sht_pricing();

CREATE OR REPLACE FUNCTION public.recompute_reservation_total(p_reservation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total numeric(14,2) := 0;
BEGIN
  SELECT
      COALESCE((
        SELECT SUM(
          CASE
            WHEN COALESCE(room_total_price, 0) > 0 THEN room_total_price
            ELSE COALESCE(unit_price, 0) * COALESCE(guest_count, 1)
          END
        )
        FROM public.reservation_cruise
        WHERE reservation_id = p_reservation_id
      ), 0)
    + COALESCE((
        SELECT SUM(COALESCE(car_total_price, 0))
        FROM public.reservation_cruise_car
        WHERE reservation_id = p_reservation_id
      ), 0)
    + COALESCE((
        SELECT SUM(
          CASE
            WHEN COALESCE(total_price, 0) > 0 THEN total_price
            ELSE COALESCE(unit_price, 0) * COALESCE(ra_car_count, 1)
          END
        )
        FROM public.reservation_airport
        WHERE reservation_id = p_reservation_id
      ), 0)
    + COALESCE((
        SELECT SUM(COALESCE(total_price, 0))
        FROM public.reservation_hotel
        WHERE reservation_id = p_reservation_id
      ), 0)
    + COALESCE((
        SELECT SUM(COALESCE(total_price, 0))
        FROM public.reservation_tour
        WHERE reservation_id = p_reservation_id
      ), 0)
    + COALESCE((
        SELECT SUM(
          CASE
            WHEN COALESCE(total_price, 0) > 0 THEN total_price
            ELSE COALESCE(unit_price, 0) * COALESCE(car_count, 1)
          END
        )
        FROM public.reservation_rentcar
        WHERE reservation_id = p_reservation_id
      ), 0)
    + COALESCE((
        SELECT SUM(
          CASE
            WHEN COALESCE(rcs.car_total_price, 0) <> 0 THEN COALESCE(rcs.car_total_price, 0)
            WHEN EXISTS (
              SELECT 1
              FROM public.reservation_car_sht sibling
              WHERE sibling.reservation_id = rcs.reservation_id
                AND sibling.id <> rcs.id
                AND COALESCE(sibling.car_total_price, 0) <> 0
            ) THEN 0
            ELSE public.fn_compute_sht_row_total(
              rcs.seat_number,
              COALESCE(NULLIF(rcs.unit_price, 0), rp.price),
              rcs.passenger_count,
              rcs.car_count
            )
          END
        )
        FROM public.reservation_car_sht rcs
        LEFT JOIN public.rentcar_price rp
          ON rp.rent_code = rcs.car_price_code
        WHERE rcs.reservation_id = p_reservation_id
      ), 0)
  INTO v_total;

  UPDATE public.reservation
  SET total_amount = COALESCE(v_total, 0)
  WHERE re_id = p_reservation_id;
END;
$$;

WITH normalized_rows AS (
  SELECT
    rcs.id,
    COALESCE(NULLIF(rcs.unit_price, 0), rp.price, 0) AS resolved_unit_price,
    CASE
      WHEN COALESCE(rcs.passenger_count, 0) > 0 THEN rcs.passenger_count
      ELSE public.fn_count_sht_seats(rcs.seat_number)
    END AS resolved_passenger_count,
    CASE
      WHEN COALESCE(rcs.car_count, 0) > 0 THEN rcs.car_count
      ELSE 1
    END AS resolved_car_count
  FROM public.reservation_car_sht rcs
  LEFT JOIN public.rentcar_price rp
    ON rp.rent_code = rcs.car_price_code
)
UPDATE public.reservation_car_sht rcs
SET
  unit_price = CASE
    WHEN COALESCE(rcs.unit_price, 0) = 0 AND nr.resolved_unit_price > 0 THEN nr.resolved_unit_price
    ELSE rcs.unit_price
  END,
  passenger_count = CASE
    WHEN COALESCE(rcs.passenger_count, 0) = 0 AND nr.resolved_passenger_count > 0 THEN nr.resolved_passenger_count
    ELSE rcs.passenger_count
  END,
  car_count = CASE
    WHEN COALESCE(rcs.car_count, 0) = 0 THEN nr.resolved_car_count
    ELSE rcs.car_count
  END
FROM normalized_rows nr
WHERE nr.id = rcs.id;

WITH backfill_targets AS (
  SELECT
    rcs.id,
    public.fn_compute_sht_row_total(
      rcs.seat_number,
      COALESCE(NULLIF(rcs.unit_price, 0), rp.price),
      COALESCE(NULLIF(rcs.passenger_count, 0), public.fn_count_sht_seats(rcs.seat_number)),
      COALESCE(NULLIF(rcs.car_count, 0), 1)
    ) AS derived_total
  FROM public.reservation_car_sht rcs
  LEFT JOIN public.rentcar_price rp
    ON rp.rent_code = rcs.car_price_code
  WHERE COALESCE(rcs.car_total_price, 0) = 0
    AND NOT EXISTS (
      SELECT 1
      FROM public.reservation_car_sht sibling
      WHERE sibling.reservation_id = rcs.reservation_id
        AND sibling.id <> rcs.id
        AND COALESCE(sibling.car_total_price, 0) <> 0
    )
)
UPDATE public.reservation_car_sht rcs
SET car_total_price = bt.derived_total
FROM backfill_targets bt
WHERE bt.id = rcs.id
  AND COALESCE(bt.derived_total, 0) > 0;

SELECT public.recompute_reservation_total(re_id)
FROM public.reservation
WHERE re_id IN (
  SELECT DISTINCT reservation_id
  FROM public.reservation_car_sht
);

COMMIT;

-- ============================================================================
-- 검증 쿼리
-- ============================================================================
-- SELECT reservation_id, seat_number, passenger_count, unit_price, car_total_price
-- FROM public.reservation_car_sht
-- ORDER BY created_at DESC
-- LIMIT 50;
--
-- SELECT re_id, re_type, total_amount
-- FROM public.reservation
-- WHERE re_type IN ('sht', 'car', 'sht_car', 'car_sht', 'package')
-- ORDER BY re_created_at DESC
-- LIMIT 50;
