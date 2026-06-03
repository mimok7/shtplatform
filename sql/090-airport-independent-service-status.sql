-- Phase: Airport 예약 상태 관리 개선
-- 목표: 픽업, 드롭오프(샌딩) 등 차량 서비스를 독립적으로 처리
-- 날짜: 2026-06-03

-- ============================================================================
-- 1. 현재 reservation_airport 스키마 확인
-- ============================================================================
-- SELECT column_name, data_type FROM information_schema.columns 
-- WHERE table_name = 'reservation_airport' ORDER BY ordinal_position;

-- ============================================================================
-- 2. reservation_airport 테이블 수정 - 서비스별 상태 컬럼 추가
-- ============================================================================

ALTER TABLE reservation_airport
ADD COLUMN IF NOT EXISTS ra_pickup_status VARCHAR(50) DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS ra_sending_status VARCHAR(50) DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS ra_service_completed_at TIMESTAMP WITH TIME ZONE;

-- 상태 값: pending, confirmed, in_progress, completed, cancelled

-- ============================================================================
-- 3. 기존 ra_is_processed 데이터를 새 컬럼으로 마이그레이션
-- ============================================================================

UPDATE reservation_airport
SET 
  ra_pickup_status = CASE 
    WHEN way_type = 'pickup' AND ra_is_processed::text IN ('true', '1', 't') THEN 'completed'
    WHEN way_type = 'pickup' AND ra_is_processed::text IN ('false', '0', 'f') THEN 'pending'
    ELSE 'pending'
  END,
  ra_sending_status = CASE 
    WHEN way_type = 'sending' AND ra_is_processed::text IN ('true', '1', 't') THEN 'completed'
    WHEN way_type = 'sending' AND ra_is_processed::text IN ('false', '0', 'f') THEN 'pending'
    ELSE 'pending'
  END
WHERE ra_is_processed IS NOT NULL;

-- ============================================================================
-- 4. 함수: Reservation 상태를 자동으로 계산 (모든 서비스 완료 확인)
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_reservation_status(p_reservation_id UUID)
RETURNS VARCHAR AS $$
DECLARE
  v_total_services INT;
  v_completed_services INT;
  v_pending_services INT;
  v_cancelled_services INT;
BEGIN
  -- 각 상태별 서비스 개수 집계
  SELECT 
    COUNT(*),
    COALESCE(SUM(CASE WHEN ra_pickup_status = 'completed' AND way_type = 'pickup' THEN 1 ELSE 0 END), 0) +
    COALESCE(SUM(CASE WHEN ra_sending_status = 'completed' AND way_type = 'sending' THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN (way_type = 'pickup' AND ra_pickup_status = 'pending') OR 
                          (way_type = 'sending' AND ra_sending_status = 'pending') THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN (way_type = 'pickup' AND ra_pickup_status = 'cancelled') OR 
                          (way_type = 'sending' AND ra_sending_status = 'cancelled') THEN 1 ELSE 0 END), 0)
  INTO v_total_services, v_completed_services, v_pending_services, v_cancelled_services
  FROM reservation_airport
  WHERE reservation_id = p_reservation_id;

  -- 상태 판단 로직
  IF v_total_services = 0 THEN
    RETURN 'pending';
  ELSIF v_completed_services = v_total_services THEN
    RETURN 'completed';  -- 모든 서비스 완료
  ELSIF v_pending_services = v_total_services THEN
    RETURN 'pending';    -- 모든 서비스 대기 중
  ELSIF v_cancelled_services = v_total_services THEN
    RETURN 'cancelled';  -- 모든 서비스 취소
  ELSE
    RETURN 'confirmed'; -- 일부 완료, 일부 대기 (진행 중)
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 5. 트리거: reservation_airport 수정 시 reservation 상태 자동 업데이트
-- ============================================================================

CREATE OR REPLACE FUNCTION update_reservation_status_on_airport_change()
RETURNS TRIGGER AS $$
BEGIN
  -- reservation_airport의 상태가 변경되면
  -- reservation 테이블의 상태도 함께 업데이트
  UPDATE reservation
  SET 
    re_status = calculate_reservation_status(NEW.reservation_id),
    re_update_at = NOW()
  WHERE re_id = NEW.reservation_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 기존 트리거 삭제 (있으면)
DROP TRIGGER IF EXISTS trg_update_reservation_on_airport_change ON reservation_airport;

-- 새 트리거 생성
CREATE TRIGGER trg_update_reservation_on_airport_change
AFTER INSERT OR UPDATE ON reservation_airport
FOR EACH ROW
EXECUTE FUNCTION update_reservation_status_on_airport_change();

-- ============================================================================
-- 6. 픽업 완료 처리 프로시저 (독립적)
-- ============================================================================

CREATE OR REPLACE FUNCTION complete_pickup(p_airport_id UUID, p_notes TEXT DEFAULT NULL)
RETURNS TABLE(
  success BOOLEAN,
  message TEXT,
  reservation_id UUID,
  new_status VARCHAR
) AS $$
DECLARE
  v_reservation_id UUID;
  v_old_status VARCHAR;
  v_new_status VARCHAR;
BEGIN
  -- 픽업 라인 확인
  SELECT reservation_id INTO v_reservation_id
  FROM reservation_airport
  WHERE id = p_airport_id AND way_type = 'pickup';
  
  IF v_reservation_id IS NULL THEN
    RETURN QUERY SELECT false, 'Pick-up record not found', NULL::UUID, NULL::VARCHAR;
    RETURN;
  END IF;
  
  -- 픽업 상태 업데이트
  UPDATE reservation_airport
  SET ra_pickup_status = 'completed',
      ra_service_completed_at = NOW()
  WHERE id = p_airport_id;
  
  -- 새로운 전체 상태 계산
  v_new_status := calculate_reservation_status(v_reservation_id);
  
  RETURN QUERY SELECT true, 'Pick-up completed successfully', v_reservation_id, v_new_status;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 7. 샌딩(드롭오프) 완료 처리 프로시저 (독립적)
-- ============================================================================

CREATE OR REPLACE FUNCTION complete_sending(p_airport_id UUID, p_notes TEXT DEFAULT NULL)
RETURNS TABLE(
  success BOOLEAN,
  message TEXT,
  reservation_id UUID,
  new_status VARCHAR
) AS $$
DECLARE
  v_reservation_id UUID;
  v_new_status VARCHAR;
BEGIN
  -- 샌딩 라인 확인
  SELECT reservation_id INTO v_reservation_id
  FROM reservation_airport
  WHERE id = p_airport_id AND way_type = 'sending';
  
  IF v_reservation_id IS NULL THEN
    RETURN QUERY SELECT false, 'Sending record not found', NULL::UUID, NULL::VARCHAR;
    RETURN;
  END IF;
  
  -- 샌딩 상태 업데이트
  UPDATE reservation_airport
  SET ra_sending_status = 'completed',
      ra_service_completed_at = NOW()
  WHERE id = p_airport_id;
  
  -- 새로운 전체 상태 계산
  v_new_status := calculate_reservation_status(v_reservation_id);
  
  RETURN QUERY SELECT true, 'Sending completed successfully', v_reservation_id, v_new_status;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 8. 현재 예약 상태 조회 뷰
-- ============================================================================

CREATE OR REPLACE VIEW v_airport_reservation_status AS
SELECT 
  r.re_id,
  r.re_type,
  r.re_status,
  r.re_created_at,
  r.re_update_at,
  r.total_amount,
  r.payment_status,
  -- 픽업 정보
  (SELECT ra_pickup_status FROM reservation_airport 
   WHERE reservation_id = r.re_id AND way_type = 'pickup' LIMIT 1) as pickup_status,
  (SELECT ra_datetime FROM reservation_airport 
   WHERE reservation_id = r.re_id AND way_type = 'pickup' LIMIT 1) as pickup_datetime,
  -- 샌딩 정보
  (SELECT ra_sending_status FROM reservation_airport 
   WHERE reservation_id = r.re_id AND way_type = 'sending' LIMIT 1) as sending_status,
  (SELECT ra_datetime FROM reservation_airport 
   WHERE reservation_id = r.re_id AND way_type = 'sending' LIMIT 1) as sending_datetime,
  -- 모든 서비스 상태
  ARRAY_AGG(
    JSON_BUILD_OBJECT(
      'way_type', ra.way_type,
      'status', CASE 
        WHEN ra.way_type = 'pickup' THEN ra.ra_pickup_status 
        WHEN ra.way_type = 'sending' THEN ra.ra_sending_status 
      END,
      'datetime', ra.ra_datetime,
      'is_processed', ra.ra_is_processed
    ) ORDER BY ra.way_type
  ) as services
FROM reservation r
LEFT JOIN reservation_airport ra ON ra.reservation_id = r.re_id
WHERE r.re_type = 'airport'
GROUP BY r.re_id, r.re_type, r.re_status, r.re_created_at, r.re_update_at, 
         r.total_amount, r.payment_status;

-- ============================================================================
-- 9. 테스트 및 검증 쿼리
-- ============================================================================

-- 박선형 예약 상태 확인
SELECT *
FROM v_airport_reservation_status
WHERE re_id = '9e076e91-42d8-46ef-b23b-962f981d1285';

-- 모든 Airport 예약 상태 보기
SELECT 
  re_id,
  re_status,
  pickup_status,
  pickup_datetime,
  sending_status,
  sending_datetime
FROM v_airport_reservation_status
ORDER BY re_created_at DESC;

-- ============================================================================
-- 10. 기존 'completed' 상태 복구 및 재계산
-- ============================================================================

-- 박선형 예약을 'confirmed'로 복구 (샌딩이 아직 남아있으므로)
UPDATE reservation
SET re_status = 'confirmed',
    re_update_at = NOW()
WHERE re_id = '9e076e91-42d8-46ef-b23b-962f981d1285'
  AND re_type = 'airport'
  AND re_status = 'completed';

-- 확인
SELECT 
  re_id,
  re_status,
  re_update_at,
  (SELECT COUNT(*) FROM reservation_airport WHERE reservation_id = re_id AND way_type = 'pickup') as pickup_count,
  (SELECT COUNT(*) FROM reservation_airport WHERE reservation_id = re_id AND way_type = 'sending') as sending_count
FROM reservation
WHERE re_id = '9e076e91-42d8-46ef-b23b-962f981d1285';

-- ============================================================================
-- 11. 사용 예시: 픽업 완료 처리
-- ============================================================================

-- 픽업 완료 (이 쿼리 실행 후 reservation 상태가 자동 업데이트됨)
/*
SELECT * FROM complete_pickup(
  (SELECT id FROM reservation_airport 
   WHERE reservation_id = '9e076e91-42d8-46ef-b23b-962f981d1285' 
   AND way_type = 'pickup' LIMIT 1)
);
*/

-- ============================================================================
-- 12. 사용 예시: 샌딩 완료 처리 (오늘)
-- ============================================================================

-- 샌딩 완료 (이 쿼리 실행 후 reservation 상태가 자동으로 'completed'로 변경됨)
/*
SELECT * FROM complete_sending(
  (SELECT id FROM reservation_airport 
   WHERE reservation_id = '9e076e91-42d8-46ef-b23b-962f981d1285' 
   AND way_type = 'sending' LIMIT 1)
);
*/

-- ============================================================================
-- 13. 향후 계획: 자동화 작업
-- ============================================================================

-- 매일 오전 9시에 실행: 오늘이 픽업/드롭 날짜인 예약을 'confirmed' 상태로 확인
-- 또는 픽업/드롭 시간이 지나면 'in_progress'로 자동 변경 등

-- ============================================================================
-- END OF SCRIPT
-- ============================================================================
