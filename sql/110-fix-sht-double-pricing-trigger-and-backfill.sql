-- ============================================================================
-- 110-fix-sht-double-pricing-trigger-and-backfill.sql
-- SHT 왕복 이중 금액(Double Pricing) 방지를 위한 recompute_reservation_total 함수 보완
-- ============================================================================

BEGIN;

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
            -- [추가 보완] SHT 차량 예약에서 왕복(2WAY/ROUND/왕복) 코드이면서 드롭오프(Drop-off/sending/샌딩)인 행은 중복 청구 방지를 위해 금액을 0으로 강제 합산
            WHEN (rcs.sht_category ILIKE '%drop%' OR rcs.sht_category ILIKE '%sending%' OR rcs.sht_category ILIKE '%샌딩%')
                 AND (rcs.car_price_code ILIKE '%2way%' OR rcs.car_price_code ILIKE '%round%' OR rcs.car_price_code ILIKE '%왕복%') THEN 0

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

COMMIT;
