-- ========================================
-- 🎯 완전 자동화된 예약-결제 금액 동기화 시스템
-- ========================================
-- 
-- 📋 이 스크립트의 기능:
-- 1. 예약 서비스(크루즈, 공항, 호텔 등) 금액 변경
-- 2. → 예약 총금액(reservation.total_amount) 자동 계산
-- 3. → 결제 금액(reservation_payment.amount) 자동 동기화
--
-- 🚀 사용법: 이 전체 스크립트를 SQL Runner에서 한번에 실행하세요.
-- ========================================

-- 🔍 설치 전 상태 확인
DO $$
DECLARE
  v_has_total_amount BOOLEAN;
  v_has_functions BOOLEAN;
  v_total_reservations INTEGER;
  v_total_payments INTEGER;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '🔍 ===== 시스템 현재 상태 확인 =====';
  
  -- total_amount 컬럼 확인
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'reservation' AND column_name = 'total_amount'
  ) INTO v_has_total_amount;
  
  -- 함수 존재 확인
  SELECT EXISTS (
    SELECT 1 FROM information_schema.routines 
    WHERE routine_name = 'recompute_reservation_total'
  ) INTO v_has_functions;
  
  -- 데이터 현황
  SELECT COUNT(*) INTO v_total_reservations FROM reservation;
  SELECT COUNT(*) INTO v_total_payments FROM reservation_payment;
  
  RAISE NOTICE '📊 total_amount 컬럼: %', CASE WHEN v_has_total_amount THEN '✅ 존재' ELSE '❌ 없음' END;
  RAISE NOTICE '🔧 자동계산 함수: %', CASE WHEN v_has_functions THEN '✅ 존재' ELSE '❌ 없음' END;
  RAISE NOTICE '📋 총 예약: %개', v_total_reservations;
  RAISE NOTICE '💳 총 결제: %개', v_total_payments;
  RAISE NOTICE '';
END;
$$;

-- ========================================
-- 🚀 1단계: 예약 총금액 자동계산 시스템
-- ========================================

-- 1-1. reservation 테이블에 총금액 컬럼 추가
ALTER TABLE reservation
ADD COLUMN IF NOT EXISTS total_amount NUMERIC(14,2) NOT NULL DEFAULT 0;

-- 1-2. 특정 예약의 총금액 재계산 함수
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
      -- 크루즈 객실
      COALESCE( (SELECT SUM(
                  CASE 
                    WHEN COALESCE(room_total_price, 0) > 0 THEN room_total_price
                    ELSE COALESCE(unit_price, 0) * COALESCE(guest_count, 1)
                  END
                 ) 
                 FROM reservation_cruise 
                 WHERE reservation_id = p_reservation_id), 0 )
    -- 크루즈 차량
    + COALESCE( (SELECT SUM(COALESCE(car_total_price, 0)) 
                 FROM reservation_cruise_car 
                 WHERE reservation_id = p_reservation_id), 0 )
    -- 공항 서비스
    + COALESCE( (SELECT SUM(
                  CASE 
                    WHEN COALESCE(total_price, 0) > 0 THEN total_price
                    ELSE COALESCE(unit_price, 0) * COALESCE(ra_car_count, 1)
                  END
                 ) 
                 FROM reservation_airport 
                 WHERE reservation_id = p_reservation_id), 0 )
    -- 호텔 서비스
    + COALESCE( (SELECT SUM(COALESCE(total_price, 0)) 
                 FROM reservation_hotel 
                 WHERE reservation_id = p_reservation_id), 0 )
    -- 투어 서비스
    + COALESCE( (SELECT SUM(COALESCE(total_price, 0)) 
                 FROM reservation_tour 
                 WHERE reservation_id = p_reservation_id), 0 )
    -- 렌터카 서비스
    + COALESCE( (SELECT SUM(
                  CASE 
                    WHEN COALESCE(total_price, 0) > 0 THEN total_price
                    ELSE COALESCE(unit_price, 0) * COALESCE(car_count, 1)
                  END
                 ) 
                 FROM reservation_rentcar 
                 WHERE reservation_id = p_reservation_id), 0 )
    -- 스하 차량 서비스
    + COALESCE( (SELECT SUM(COALESCE(car_total_price, 0))
                 FROM reservation_car_sht
                 WHERE reservation_id = p_reservation_id), 0 )
  INTO v_total;

  -- reservation 테이블의 total_amount 업데이트
  UPDATE reservation
  SET total_amount = COALESCE(v_total, 0)
  WHERE re_id = p_reservation_id;
END;
$$;

-- 1-3. 서비스 테이블 변경시 자동으로 총금액 재계산하는 트리거 함수
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

-- 1-4. 각 서비스 테이블에 트리거 연결
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

-- 스하 차량 서비스
DROP TRIGGER IF EXISTS trg_reservation_car_sht_total ON reservation_car_sht;
CREATE TRIGGER trg_reservation_car_sht_total
AFTER INSERT OR UPDATE OR DELETE ON reservation_car_sht
FOR EACH ROW EXECUTE FUNCTION trg_after_service_change_update_total();

-- ========================================
-- 💰 2단계: 결제 금액 자동 동기화 시스템  
-- ========================================

-- 2-1. 예약 총금액 변경시 결제 금액 자동 업데이트 함수
CREATE OR REPLACE FUNCTION sync_payment_amount_with_reservation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- reservation.total_amount가 변경되었을 때만 실행
  IF OLD.total_amount IS DISTINCT FROM NEW.total_amount THEN
    -- 해당 예약의 결제 정보가 있으면 금액 동기화
    UPDATE reservation_payment 
    SET amount = NEW.total_amount,
        updated_at = NOW()
    WHERE reservation_id = NEW.re_id 
      AND payment_status IN ('pending', 'processing'); -- 완료된 결제는 변경하지 않음
  END IF;
  
  RETURN NEW;
END;
$$;

-- 2-2. reservation 테이블에 결제 동기화 트리거 연결
DROP TRIGGER IF EXISTS trg_sync_payment_amount ON reservation;
CREATE TRIGGER trg_sync_payment_amount
AFTER UPDATE ON reservation
FOR EACH ROW 
WHEN (OLD.total_amount IS DISTINCT FROM NEW.total_amount)
EXECUTE FUNCTION sync_payment_amount_with_reservation();

-- ========================================
-- 🔧 3단계: 유틸리티 함수들
-- ========================================

-- 3-1. 모든 예약의 총금액 일괄 재계산 함수
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
  
  RETURN QUERY 
  SELECT re_id, reservation.total_amount 
  FROM reservation 
  ORDER BY total_amount DESC;
END;
$$;

-- 3-2. 결제 동기화 상태 확인 함수
CREATE OR REPLACE FUNCTION check_payment_amount_sync()
RETURNS TABLE(
  reservation_id UUID,
  reservation_total NUMERIC(14,2),
  payment_amount NUMERIC(12,0),
  is_synced BOOLEAN,
  difference NUMERIC(14,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    res.re_id as reservation_id,
    res.total_amount as reservation_total,
    rp.amount as payment_amount,
    (res.total_amount = rp.amount) as is_synced,
    (res.total_amount - rp.amount) as difference
  FROM reservation res
  JOIN reservation_payment rp ON res.re_id = rp.reservation_id
  WHERE rp.payment_status IN ('pending', 'processing')
  ORDER BY ABS(res.total_amount - rp.amount) DESC;
END;
$$;

-- 3-3. 모든 결제 금액 수동 동기화 함수
CREATE OR REPLACE FUNCTION sync_all_payment_amounts()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_updated INTEGER := 0;
BEGIN
  -- 모든 미완료 결제의 금액을 예약 총금액으로 동기화
  UPDATE reservation_payment 
  SET amount = reservation.total_amount,
      updated_at = NOW()
  FROM reservation
  WHERE reservation_payment.reservation_id = reservation.re_id
    AND reservation_payment.payment_status IN ('pending', 'processing')
    AND reservation_payment.amount != reservation.total_amount;
  
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  
  RETURN v_updated;
END;
$$;

-- ========================================
-- 🔄 4단계: 기존 데이터 백필 및 동기화
-- ========================================

-- 4-1. 모든 예약의 총금액 재계산
DO $$
DECLARE
  r RECORD;
  v_count INTEGER := 0;
BEGIN
  RAISE NOTICE '🔄 기존 예약 데이터 총금액 재계산 시작...';
  
  FOR r IN SELECT re_id FROM reservation LOOP
    PERFORM recompute_reservation_total(r.re_id);
    v_count := v_count + 1;
  END LOOP;
  
  RAISE NOTICE '✅ 총 %개 예약의 총금액이 재계산되었습니다.', v_count;
END;
$$;

-- 4-2. 모든 결제 금액 동기화
DO $$
DECLARE
  v_updated INTEGER;
BEGIN
  RAISE NOTICE '🔄 기존 결제 데이터 금액 동기화 시작...';
  
  SELECT sync_all_payment_amounts() INTO v_updated;
  
  RAISE NOTICE '✅ 총 %개 결제의 금액이 동기화되었습니다.', v_updated;
END;
$$;

-- ========================================
-- 📊 5단계: 최종 설치 상태 확인
-- ========================================

DO $$
DECLARE
  v_total_reservations INTEGER;
  v_with_amount INTEGER;
  v_total_payments INTEGER;
  v_synced_payments INTEGER;
  v_avg_amount NUMERIC(12,2);
BEGIN
  -- 예약 현황
  SELECT COUNT(*) INTO v_total_reservations FROM reservation;
  SELECT COUNT(*) INTO v_with_amount FROM reservation WHERE total_amount > 0;
  SELECT AVG(total_amount) INTO v_avg_amount FROM reservation WHERE total_amount > 0;
  
  -- 결제 현황
  SELECT COUNT(*) INTO v_total_payments 
  FROM reservation_payment 
  WHERE payment_status IN ('pending', 'processing');
  
  SELECT COUNT(*) INTO v_synced_payments 
  FROM reservation_payment rp
  JOIN reservation res ON rp.reservation_id = res.re_id
  WHERE rp.payment_status IN ('pending', 'processing')
    AND rp.amount = res.total_amount;
  
  RAISE NOTICE '';
  RAISE NOTICE '🎉 ===== 설치 완료! =====';
  RAISE NOTICE '';
  RAISE NOTICE '📊 예약 총금액 시스템:';
  RAISE NOTICE '   - 총 예약: %개', v_total_reservations;
  RAISE NOTICE '   - 금액 계산됨: %개', v_with_amount;
  RAISE NOTICE '   - 평균 금액: %동', COALESCE(v_avg_amount, 0);
  RAISE NOTICE '';
  RAISE NOTICE '💳 결제 동기화 시스템:';
  RAISE NOTICE '   - 총 활성 결제: %개', v_total_payments;
  RAISE NOTICE '   - 동기화됨: %개', v_synced_payments;
  RAISE NOTICE '';
  RAISE NOTICE '✨ 자동화 완료! 이제 다음이 자동으로 동작합니다:';
  RAISE NOTICE '   1️⃣ 서비스 금액 변경 → 예약 총금액 자동 계산';
  RAISE NOTICE '   2️⃣ 예약 총금액 변경 → 결제 금액 자동 동기화';
  RAISE NOTICE '';
  RAISE NOTICE '🔍 유용한 관리 명령어:';
  RAISE NOTICE '   - 동기화 상태 확인: SELECT * FROM check_payment_amount_sync();';
  RAISE NOTICE '   - 수동 총금액 재계산: SELECT * FROM recompute_all_reservation_totals();';
  RAISE NOTICE '   - 수동 결제 동기화: SELECT sync_all_payment_amounts();';
  RAISE NOTICE '';
END;
$$;
