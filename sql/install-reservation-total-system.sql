-- ========================================
-- 🎯 예약 총금액 자동계산 시스템 설치 스크립트
-- ========================================
-- 이 스크립트를 Supabase SQL Editor 또는 SQL Runner에서 실행하세요.

-- 🔍 1단계: 현재 시스템 상태 확인
DO $$
BEGIN
    -- total_amount 컬럼 존재 여부 확인
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'reservation' AND column_name = 'total_amount'
    ) THEN
        RAISE NOTICE '✅ total_amount 컬럼이 이미 존재합니다.';
    ELSE
        RAISE NOTICE '❌ total_amount 컬럼이 없습니다. 설치가 필요합니다.';
    END IF;

    -- 자동계산 함수 존재 여부 확인
    IF EXISTS (
        SELECT 1 FROM information_schema.routines 
        WHERE routine_name = 'recompute_reservation_total'
    ) THEN
        RAISE NOTICE '✅ 자동계산 함수가 이미 존재합니다.';
    ELSE
        RAISE NOTICE '❌ 자동계산 함수가 없습니다. 설치가 필요합니다.';
    END IF;
END $$;

-- 🚀 2단계: 시스템 설치
-- reservation 테이블에 총금액 컬럼 추가
ALTER TABLE reservation
ADD COLUMN IF NOT EXISTS total_amount NUMERIC(14,2) NOT NULL DEFAULT 0;

-- 특정 예약의 총금액 재계산 함수
CREATE OR REPLACE FUNCTION recompute_reservation_total(p_reservation_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total NUMERIC(14,2) := 0;
BEGIN
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

-- 서비스 테이블 변경시 자동으로 총금액 재계산하는 트리거 함수
CREATE OR REPLACE FUNCTION trg_after_service_change_update_total()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_reservation_id UUID;
BEGIN
  -- INSERT/UPDATE 시 NEW, DELETE 시 OLD에서 reservation_id 추출
  IF TG_OP IN ('INSERT','UPDATE') THEN
    v_reservation_id := NEW.reservation_id;
  ELSE
    v_reservation_id := OLD.reservation_id;
  END IF;

  -- 총금액 재계산 실행
  PERFORM recompute_reservation_total(v_reservation_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- 🔗 3단계: 각 서비스 테이블에 트리거 연결
-- 크루즈 객실
DROP TRIGGER IF EXISTS trg_reservation_cruise_total ON reservation_cruise;
CREATE TRIGGER trg_reservation_cruise_total
AFTER INSERT OR UPDATE OR DELETE ON reservation_cruise
FOR EACH ROW EXECUTE FUNCTION trg_after_service_change_update_total();

-- 크루즈 차량
DROP TRIGGER IF EXISTS trg_reservation_cruise_car_total ON reservation_cruise_car;
CREATE TRIGGER trg_reservation_cruise_car_total
AFTER INSERT OR UPDATE OR DELETE ON reservation_cruise_car
FOR EACH ROW EXECUTE FUNCTION trg_after_service_change_update_total();

-- 공항 서비스
DROP TRIGGER IF EXISTS trg_reservation_airport_total ON reservation_airport;
CREATE TRIGGER trg_reservation_airport_total
AFTER INSERT OR UPDATE OR DELETE ON reservation_airport
FOR EACH ROW EXECUTE FUNCTION trg_after_service_change_update_total();

-- 호텔 서비스
DROP TRIGGER IF EXISTS trg_reservation_hotel_total ON reservation_hotel;
CREATE TRIGGER trg_reservation_hotel_total
AFTER INSERT OR UPDATE OR DELETE ON reservation_hotel
FOR EACH ROW EXECUTE FUNCTION trg_after_service_change_update_total();

-- 투어 서비스
DROP TRIGGER IF EXISTS trg_reservation_tour_total ON reservation_tour;
CREATE TRIGGER trg_reservation_tour_total
AFTER INSERT OR UPDATE OR DELETE ON reservation_tour
FOR EACH ROW EXECUTE FUNCTION trg_after_service_change_update_total();

-- 렌터카 서비스
DROP TRIGGER IF EXISTS trg_reservation_rentcar_total ON reservation_rentcar;
CREATE TRIGGER trg_reservation_rentcar_total
AFTER INSERT OR UPDATE OR DELETE ON reservation_rentcar
FOR EACH ROW EXECUTE FUNCTION trg_after_service_change_update_total();

-- 일반 차량 서비스
DROP TRIGGER IF EXISTS trg_reservation_car_sht_total ON reservation_car_sht;
CREATE TRIGGER trg_reservation_car_sht_total
AFTER INSERT OR UPDATE OR DELETE ON reservation_car_sht
FOR EACH ROW EXECUTE FUNCTION trg_after_service_change_update_total();

-- 🔄 4단계: 기존 데이터 백필 (모든 예약의 총금액 일괄 계산)
DO $$
DECLARE
  r RECORD;
  v_count INTEGER := 0;
BEGIN
  FOR r IN SELECT re_id FROM reservation LOOP
    PERFORM recompute_reservation_total(r.re_id);
    v_count := v_count + 1;
  END LOOP;
  RAISE NOTICE '✅ 총 %개 예약의 총금액이 재계산되었습니다.', v_count;
END;
$$;

-- 🔧 5단계: 유틸리티 함수 생성
-- 모든 예약의 총금액 일괄 재계산 함수
CREATE OR REPLACE FUNCTION recompute_all_reservation_totals()
RETURNS TABLE(reservation_id UUID, total_amount NUMERIC(14,2))
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  r RECORD;
  v_count INTEGER := 0;
BEGIN
  FOR r IN SELECT re_id FROM reservation LOOP
    PERFORM recompute_reservation_total(r.re_id);
    v_count := v_count + 1;
  END LOOP;
  
  RAISE NOTICE '✅ 총 %개 예약의 총금액이 재계산되었습니다.', v_count;
  
  RETURN QUERY 
  SELECT re_id, reservation.total_amount 
  FROM reservation 
  ORDER BY total_amount DESC;
END;
$$;

-- 📊 6단계: 설치 완료 확인
DO $$
DECLARE
  v_total_reservations INTEGER;
  v_with_amount INTEGER;
  v_without_amount INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_total_reservations FROM reservation;
  SELECT COUNT(*) INTO v_with_amount FROM reservation WHERE total_amount > 0;
  SELECT COUNT(*) INTO v_without_amount FROM reservation WHERE total_amount = 0;
  
  RAISE NOTICE '';
  RAISE NOTICE '🎉 예약 총금액 자동계산 시스템 설치 완료!';
  RAISE NOTICE '📊 예약 현황:';
  RAISE NOTICE '   - 총 예약: %개', v_total_reservations;
  RAISE NOTICE '   - 금액 계산됨: %개', v_with_amount;
  RAISE NOTICE '   - 금액 미계산: %개', v_without_amount;
  RAISE NOTICE '';
  RAISE NOTICE '✨ 이제 서비스 금액이 변경되면 예약 총금액이 자동으로 업데이트됩니다!';
END;
$$;
