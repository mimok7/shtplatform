-- 2026-04-26
-- 목적: reservation_car_sht의 pickup/dropoff가 '선착장'인 경우
--       같은 quote의 cruise_name을 통해 cruise_location.pier_location으로 자동 치환
-- 원칙: cruise_location 매칭 실패 시 '선착장' 그대로 유지
-- 안전: 예외 발생 시에도 입력값을 그대로 유지(오류 전파 방지)

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_fill_sht_pier_location()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_pier text;
BEGIN
  -- 선착장 키워드가 없으면 그대로 통과
  IF btrim(COALESCE(NEW.pickup_location, '')) <> '선착장'
     AND btrim(COALESCE(NEW.dropoff_location, '')) <> '선착장' THEN
    RETURN NEW;
  END IF;

  -- 같은 quote의 cruise 예약을 따라 선착장 매핑 시도
  SELECT cl.pier_location
    INTO v_pier
  FROM public.reservation r_target
  JOIN public.reservation r_cruise
    ON r_cruise.re_quote_id = r_target.re_quote_id
   AND r_cruise.re_type = 'cruise'
  JOIN public.reservation_cruise rc
    ON rc.reservation_id = r_cruise.re_id
  JOIN public.cruise_rate_card crc
    ON crc.id = rc.room_price_code
  LEFT JOIN public.cruise_location cl
    ON cl.kr_name = crc.cruise_name
    OR cl.en_name = crc.cruise_name
  WHERE r_target.re_id = NEW.reservation_id
    AND cl.pier_location IS NOT NULL
    AND btrim(cl.pier_location) <> ''
  LIMIT 1;

  -- 매칭 성공 시에만 치환, 실패 시 '선착장' 유지
  IF v_pier IS NOT NULL AND btrim(v_pier) <> '' THEN
    IF btrim(COALESCE(NEW.pickup_location, '')) = '선착장' THEN
      NEW.pickup_location := v_pier;
    END IF;
    IF btrim(COALESCE(NEW.dropoff_location, '')) = '선착장' THEN
      NEW.dropoff_location := v_pier;
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- 어떤 오류가 나도 입력값은 유지하고 저장은 계속 진행
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fill_sht_pier_location ON public.reservation_car_sht;

CREATE TRIGGER trg_fill_sht_pier_location
BEFORE INSERT OR UPDATE OF pickup_location, dropoff_location, reservation_id
ON public.reservation_car_sht
FOR EACH ROW
EXECUTE FUNCTION public.fn_fill_sht_pier_location();

COMMIT;
