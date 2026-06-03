-- 박선형 예약 상태 즉시 복구 쿼리
-- 적용: 2026-06-03
-- 목적: completed 상태를 confirmed로 복구 (샌딩이 아직 남아있으므로)

-- ============================================================================
-- 1. 현재 상태 확인
-- ============================================================================

SELECT 
  re_id,
  re_user_id,
  re_type,
  re_status,
  re_created_at,
  re_update_at,
  total_amount,
  payment_status
FROM reservation
WHERE re_id = '9e076e91-42d8-46ef-b23b-962f981d1285';

-- 예상 결과:
-- re_id: 9e076e91-42d8-46ef-b23b-962f981d1285
-- re_status: completed ← 이것을 confirmed로 변경해야 함

-- ============================================================================
-- 2. 서비스별 일시 확인
-- ============================================================================

SELECT 
  way_type,
  ra_datetime,
  ra_airport_location,
  ra_flight_number,
  ra_passenger_count,
  ra_is_processed
FROM reservation_airport
WHERE reservation_id = '9e076e91-42d8-46ef-b23b-962f981d1285'
ORDER BY way_type;

-- 예상 결과:
-- [1] way_type: pickup, ra_datetime: 2026-05-28 12:15 (이미 지남)
-- [2] way_type: sending, ra_datetime: 2026-06-03 ... (오늘! 아직 미실행)

-- ============================================================================
-- 3. 상태 변경: completed → confirmed
-- ============================================================================

-- ⚠️ 이 쿼리를 실행하여 상태를 복구하세요
BEGIN TRANSACTION;

UPDATE reservation
SET 
  re_status = 'confirmed',
  re_update_at = NOW()
WHERE re_id = '9e076e91-42d8-46ef-b23b-962f981d1285'
  AND re_type = 'airport'
  AND re_status = 'completed';

-- 확인
SELECT 
  re_id,
  re_status,
  re_update_at
FROM reservation
WHERE re_id = '9e076e91-42d8-46ef-b23b-962f981d1285';

-- 결과가 올바르면 COMMIT
-- COMMIT;

-- 결과가 잘못되면 ROLLBACK
-- ROLLBACK;

-- ============================================================================
-- 4. 변경 이유 로그 추가 (선택)
-- ============================================================================

-- 만약 변경 이유를 기록하고 싶다면:
-- INSERT INTO reservation_audit_log (
--   reservation_id, 
--   status_before, 
--   status_after, 
--   reason, 
--   changed_at
-- ) VALUES (
--   '9e076e91-42d8-46ef-b23b-962f981d1285',
--   'completed',
--   'in_progress',
--   '샌딩 서비스가 아직 오늘 예정중이므로 상태 복구',
--   NOW()
-- );

-- ============================================================================
-- 5. 최종 검증
-- ============================================================================

SELECT 
  r.re_id,
  r.re_status,
  r.re_update_at,
  u.name,
  u.email,
  -- 픽업 정보
  (SELECT ra_datetime FROM reservation_airport WHERE reservation_id = r.re_id AND way_type = 'pickup') as pickup_datetime,
  -- 샌딩 정보
  (SELECT ra_datetime FROM reservation_airport WHERE reservation_id = r.re_id AND way_type = 'sending') as sending_datetime
FROM reservation r
LEFT JOIN users u ON u.id = r.re_user_id
WHERE r.re_id = '9e076e91-42d8-46ef-b23b-962f981d1285';

-- 예상 최종 결과:
-- re_status: in_progress ✅
-- pickup_datetime: 2026-05-28 (지난 날짜)
-- sending_datetime: 2026-06-03 (오늘) ← 아직 미실행

-- ============================================================================
-- 6. 향후 처리 방법
-- ============================================================================

-- 오늘(2026-06-03) 샌딩이 완료되면 다음 쿼리 실행:
/*
UPDATE reservation
SET re_status = 'completed'
WHERE re_id = '9e076e91-42d8-46ef-b23b-962f981d1285';
*/

-- 또는 새로운 함수 사용 (090 SQL 적용 후):
/*
SELECT * FROM complete_sending(
  (SELECT id FROM reservation_airport 
   WHERE reservation_id = '9e076e91-42d8-46ef-b23b-962f981d1285' 
   AND way_type = 'sending' LIMIT 1)
);
*/

-- ============================================================================
-- END OF RECOVERY SCRIPT
-- ============================================================================
