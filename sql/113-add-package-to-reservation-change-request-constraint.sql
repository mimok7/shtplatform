-- reservation_change_request 테이블의 re_type 제약 조건에 package 서비스 타입을 추가하는 마이그레이션 SQL
ALTER TABLE public.reservation_change_request 
  DROP CONSTRAINT IF EXISTS reservation_change_request_re_type_check;

ALTER TABLE public.reservation_change_request 
  ADD CONSTRAINT reservation_change_request_re_type_check 
  CHECK (re_type IN ('airport', 'car_sht', 'cruise', 'cruise_car', 'hotel', 'rentcar', 'tour', 'package'));

-- reservation_change_package 테이블 RLS 활성화 및 정책 추가
ALTER TABLE public.reservation_change_package ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reservation_change_package_insert_auth ON public.reservation_change_package;
CREATE POLICY reservation_change_package_insert_auth ON public.reservation_change_package
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS reservation_change_package_select_auth ON public.reservation_change_package;
CREATE POLICY reservation_change_package_select_auth ON public.reservation_change_package
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.reservation_change_request r
      WHERE r.id = request_id AND r.requester_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('manager', 'admin')
    )
  );

-- recompute_reservation_total 함수 수정 (패키지 예약의 경우 자동 금액 덮어쓰기 방지)
CREATE OR REPLACE FUNCTION recompute_reservation_total(p_reservation_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total NUMERIC(14,2) := 0;
  v_re_type TEXT;
BEGIN
  -- 예약 타입 조회
  SELECT re_type INTO v_re_type 
  FROM reservation 
  WHERE re_id = p_reservation_id;

  -- 패키지 예약('package')인 경우 총 금액 자동 재계산을 스킵합니다. (프론트엔드 할인/추가금 반영액 보존)
  IF v_re_type = 'package' THEN
    RAISE NOTICE '예약 % 은 패키지 예약이므로 자동 재계산을 스킵합니다.', p_reservation_id;
    RETURN;
  END IF;

  -- 각 서비스별 금액 합산
  SELECT
      -- 크루즈 객실: unit_price × guest_count 또는 room_total_price
      COALESCE( (SELECT SUM(
                  CASE 
                    WHEN COALESCE(room_total_price, 0) > 0 THEN room_total_price
                    ELSE COALESCE(unit_price, 0) * COALESCE(guest_count, 1)
                  END
                 ) 
                 FROM reservation_cruise 
                 WHERE reservation_id = p_reservation_id), 0 )
    -- 크루즈 차량: car_total_price 직접 사용
    + COALESCE( (SELECT SUM(COALESCE(car_total_price, 0)) 
                 FROM reservation_cruise_car 
                 WHERE reservation_id = p_reservation_id), 0 )
    -- 공항 서비스: unit_price × ra_car_count 또는 total_price
    + COALESCE( (SELECT SUM(
                  CASE 
                    WHEN COALESCE(total_price, 0) > 0 THEN total_price
                    ELSE COALESCE(unit_price, 0) * COALESCE(ra_car_count, 1)
                  END
                 ) 
                 FROM reservation_airport 
                 WHERE reservation_id = p_reservation_id), 0 )
    -- 호텔 서비스: total_price 직접 사용
    + COALESCE( (SELECT SUM(COALESCE(total_price, 0)) 
                 FROM reservation_hotel 
                 WHERE reservation_id = p_reservation_id), 0 )
    -- 투어 서비스: total_price 직접 사용
    + COALESCE( (SELECT SUM(COALESCE(total_price, 0)) 
                 FROM reservation_tour 
                 WHERE reservation_id = p_reservation_id), 0 )
    -- 렌터카 서비스: unit_price × car_count 또는 total_price
    + COALESCE( (SELECT SUM(
                  CASE 
                    WHEN COALESCE(total_price, 0) > 0 THEN total_price
                    ELSE COALESCE(unit_price, 0) * COALESCE(car_count, 1)
                  END
                 ) 
                 FROM reservation_rentcar 
                 WHERE reservation_id = p_reservation_id), 0 )
    -- 스하 차량 서비스: car_total_price 직접 사용
    + COALESCE( (SELECT SUM(COALESCE(car_total_price, 0))
                 FROM reservation_car_sht
                 WHERE reservation_id = p_reservation_id), 0 )
  INTO v_total;

  -- reservation 테이블의 total_amount 업데이트
  UPDATE reservation
  SET total_amount = COALESCE(v_total, 0)
  WHERE re_id = p_reservation_id;
  
  RAISE NOTICE '예약 % 총금액이 %동으로 업데이트됨', p_reservation_id, v_total;
END;
$$;
