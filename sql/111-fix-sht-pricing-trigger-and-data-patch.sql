-- SHT 차량 예약의 하드코딩 요금을 제거하고 단가 및 총금액 계산을 동기화하는 트리거 스크립트
BEGIN;

-- 1. fn_compute_sht_row_total 함수 수정 (하드코딩 제거, 순수 단가 곱 연산)
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
  v_effective_unit numeric := COALESCE(NULLIF(p_unit_price, 0), 0);
  v_effective_count integer := GREATEST(
    COALESCE(NULLIF(p_passenger_count, 0), 0),
    COALESCE(NULLIF(p_car_count, 0), 0),
    public.fn_count_sht_seats(p_seat_number)
  );
BEGIN
  -- 렌트카 가격 테이블에서 조회되어 전달된 단가와 승객(좌석) 수의 곱만을 반환 (하드코딩 없음)
  RETURN v_effective_unit * v_effective_count;
END;
$$;

-- 2. BEFORE 트리거 함수 수정 (저장 전 자동 합계 계산 강제화 및 왕복 보정)
CREATE OR REPLACE FUNCTION public.fn_normalize_reservation_car_sht_pricing()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_price numeric;
  v_inferred_count integer;
  v_is_round_trip boolean;
BEGIN
  -- 단가 누락 시 단가 코드(car_price_code)를 사용해 rentcar_price 테이블에서 실시간 조회하여 보정
  IF NEW.car_price_code IS NOT NULL AND COALESCE(NEW.unit_price, 0) = 0 THEN
    SELECT price INTO v_price FROM public.rentcar_price WHERE rent_code = NEW.car_price_code LIMIT 1;
    IF COALESCE(v_price, 0) > 0 THEN
      NEW.unit_price := v_price;
    END IF;
  END IF;

  -- 승객 수 누락 시 좌석 수 기준 보정
  v_inferred_count := public.fn_count_sht_seats(NEW.seat_number);
  IF COALESCE(NEW.passenger_count, 0) = 0 AND v_inferred_count > 0 THEN
    NEW.passenger_count := v_inferred_count;
  END IF;

  IF COALESCE(NEW.car_count, 0) = 0 THEN
    NEW.car_count := 1;
  END IF;

  -- 왕복 코드 감지
  v_is_round_trip := (NEW.car_price_code ILIKE '%2way%' OR NEW.car_price_code ILIKE '%round%' OR NEW.car_price_code ILIKE '%왕복%');

  -- 왕복이면서 드롭오프(샌딩) 행인 경우 금액을 0으로 강제 (이중 부과 방지)
  IF (NEW.sht_category ILIKE '%drop%' OR NEW.sht_category ILIKE '%sending%' OR NEW.sht_category ILIKE '%샌딩%')
     AND v_is_round_trip THEN
    NEW.unit_price := 0;
    NEW.car_total_price := 0;
  ELSE
    -- 그 외의 경우 (픽업 또는 편도) 저장 전 자동 합계 재계산 설정
    NEW.car_total_price := public.fn_compute_sht_row_total(
      NEW.seat_number,
      NEW.unit_price,
      NEW.passenger_count,
      NEW.car_count
    );
  END IF;

  RETURN NEW;
END;
$$;

-- 3. 김미목 고객의 예약(28083a11-5adb-4327-ab8f-333625f11e71) 데이터 보정 패치
-- 업데이트 시간을 갱신하여 BEFORE 트리거가 실행되도록 유도 (단가 850,000동 * 2인 = 1,700,000동 자동 연산)
UPDATE public.reservation_car_sht
SET updated_at = NOW()
WHERE reservation_id = '28083a11-5adb-4327-ab8f-333625f11e71';

-- 메인 예약 테이블(reservation) 총액 재계산 함수 명시적 실행
SELECT public.recompute_reservation_total('28083a11-5adb-4327-ab8f-333625f11e71');

COMMIT;
