-- 2026-04-26
-- 목적: reservation_car_sht의 pickup/dropoff가 '선착장'인 기존 행을
--       최신 cruise_location.pier_location 값으로 일괄 보정
-- 주의: room_price_code(text) = cruise_rate_card.id(uuid) 타입 불일치 방지를 위해 id::text 비교 사용

BEGIN;

UPDATE public.reservation_car_sht rcs
SET
  pickup_location = CASE
    WHEN btrim(COALESCE(rcs.pickup_location, '')) = '선착장' THEN m.pier_location
    ELSE rcs.pickup_location
  END,
  dropoff_location = CASE
    WHEN btrim(COALESCE(rcs.dropoff_location, '')) = '선착장' THEN m.pier_location
    ELSE rcs.dropoff_location
  END
FROM (
  SELECT DISTINCT
    r_target.re_id AS reservation_id,
    btrim(cl.pier_location) AS pier_location
  FROM public.reservation r_target
  JOIN public.reservation r_cruise
    ON r_cruise.re_quote_id = r_target.re_quote_id
   AND r_cruise.re_type = 'cruise'
  JOIN public.reservation_cruise rc
    ON rc.reservation_id = r_cruise.re_id
  JOIN public.cruise_rate_card crc
    ON crc.id::text = btrim(rc.room_price_code)
  JOIN public.cruise_location cl
    ON lower(btrim(cl.kr_name)) = lower(btrim(crc.cruise_name))
    OR lower(btrim(cl.en_name)) = lower(btrim(crc.cruise_name))
  WHERE cl.pier_location IS NOT NULL
    AND btrim(cl.pier_location) <> ''
) m
WHERE rcs.reservation_id = m.reservation_id
  AND (
    btrim(COALESCE(rcs.pickup_location, '')) = '선착장'
    OR btrim(COALESCE(rcs.dropoff_location, '')) = '선착장'
  );

COMMIT;

-- 검증용
-- SELECT COUNT(*) FROM public.reservation_car_sht
-- WHERE btrim(COALESCE(pickup_location, '')) = '선착장'
--    OR btrim(COALESCE(dropoff_location, '')) = '선착장';
