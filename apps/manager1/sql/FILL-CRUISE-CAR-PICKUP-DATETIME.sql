-- ═══════════════════════════════════════════════════════════════════════════════
-- reservation_cruise_car.pickup_datetime 자동 채우기
-- ═══════════════════════════════════════════════════════════════════════════════
-- 목적: 
--   1. 새 데이터 삽입 시 pickup_datetime이 NULL이면 reservation_cruise.checkin 값 복사
--   2. 기존 NULL 데이터도 모두 채우기
-- 
-- 작성: 2026-04-16
-- ═══════════════════════════════════════════════════════════════════════════════

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 1️⃣ 기존 데이터 일괄 업데이트 (NULL → checkin 값)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

UPDATE reservation_cruise_car rcc
SET pickup_datetime = rc.checkin
FROM reservation_cruise rc
WHERE rcc.reservation_id = rc.reservation_id
  AND rcc.pickup_datetime IS NULL
  AND rc.checkin IS NOT NULL;

-- 확인 쿼리: 업데이트된 행 수 확인
-- SELECT COUNT(*) as updated_rows FROM reservation_cruise_car WHERE pickup_datetime IS NOT NULL;

---

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 2️⃣ 트리거 생성: 신규 데이터 저장 시 자동 채우기
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- 트리거 함수 생성
CREATE OR REPLACE FUNCTION fill_cruise_car_pickup_datetime()
RETURNS TRIGGER AS $$
BEGIN
  -- pickup_datetime이 NULL인 경우, reservation_cruise의 checkin 값으로 채우기
  IF NEW.pickup_datetime IS NULL THEN
    SELECT checkin INTO NEW.pickup_datetime
    FROM reservation_cruise
    WHERE reservation_id = NEW.reservation_id
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 트리거 삭제 (기존 트리거 있으면 먼저 삭제)
DROP TRIGGER IF EXISTS fill_pickup_datetime_before_insert ON reservation_cruise_car;

-- 트리거 생성: INSERT 전 자동 실행
CREATE TRIGGER fill_pickup_datetime_before_insert
BEFORE INSERT ON reservation_cruise_car
FOR EACH ROW
EXECUTE FUNCTION fill_cruise_car_pickup_datetime();

---

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3️⃣ UPDATE 시에도 트리거 적용 (선택사항)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 기존 NULL을 유지하고 싶으면 이 섹션 제외
-- NULL 값이 UPDATE될 때도 자동으로 checkin 값으로 채우고 싶으면 실행

DROP TRIGGER IF EXISTS fill_pickup_datetime_before_update ON reservation_cruise_car;

CREATE TRIGGER fill_pickup_datetime_before_update
BEFORE UPDATE ON reservation_cruise_car
FOR EACH ROW
WHEN (NEW.pickup_datetime IS NULL AND OLD.pickup_datetime IS NULL)
EXECUTE FUNCTION fill_cruise_car_pickup_datetime();

---

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 4️⃣ 검증 쿼리
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- 현재 상황 확인
SELECT 
  COUNT(*) as total_rows,
  COUNT(CASE WHEN pickup_datetime IS NULL THEN 1 END) as null_count,
  COUNT(CASE WHEN pickup_datetime IS NOT NULL THEN 1 END) as filled_count
FROM reservation_cruise_car;

-- 상세 확인: 아직도 NULL인 행들 (reservation_cruise 연결 확인)
SELECT 
  rcc.reservation_id,
  rcc.pickup_datetime,
  rc.checkin,
  rc.reservation_id as cruise_reservation_id
FROM reservation_cruise_car rcc
LEFT JOIN reservation_cruise rc ON rcc.reservation_id = rc.reservation_id
WHERE rcc.pickup_datetime IS NULL
LIMIT 20;

-- 신규 데이터 테스트 (트리거 동작 확인)
-- 다음 쿼리로 테스트 가능:
-- INSERT INTO reservation_cruise_car (reservation_id, vehicle_number, seat_number)
-- VALUES ('test-uuid', '1', 'A1')
-- 
-- 결과 확인:
-- SELECT pickup_datetime FROM reservation_cruise_car WHERE reservation_id = 'test-uuid'
-- → pickup_datetime이 자동으로 reservation_cruise.checkin 값으로 채워져있어야 함

---

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 5️⃣ 트리거 제거 (필요시)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- DROP TRIGGER IF EXISTS fill_pickup_datetime_before_insert ON reservation_cruise_car;
-- DROP TRIGGER IF EXISTS fill_pickup_datetime_before_update ON reservation_cruise_car;
-- DROP FUNCTION IF EXISTS fill_cruise_car_pickup_datetime();

---

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 📝 사용 가이드
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 
-- 1️⃣ 실행 순서:
--    Step 1: 기존 데이터 업데이트 (섹션 1 실행)
--    Step 2: 트리거 생성 (섹션 2, 3 실행)
--    Step 3: 검증 (섹션 4 실행)
-- 
-- 2️⃣ 동작 원리:
--    - 새 데이터 INSERT: pickup_datetime이 명시적으로 들어오지 않거나 NULL이면
--      → 자동으로 해당 reservation_cruise의 checkin 값으로 채워짐
--    - 기존 NULL 데이터: UPDATE 쿼리로 일괄 처리 완료
-- 
-- 3️⃣ 주의사항:
--    - 트리거는 INSERT에만 적용 (UPDATE 시에는 별도 섹션 3 필요)
--    - pickup_datetime이 명시적으로 값이 들어오면 트리거 무시 (의도한 값 사용)
--    - reservation_cruise.checkin이 NULL이면 pickup_datetime도 NULL 유지
-- 
-- 4️⃣ 테스트 방법:
--    - 임시 데이터로 INSERT 테스트: pickup_datetime 없이 삽입하면 자동 채워짐 확인
--    - 확인: SELECT pickup_datetime FROM reservation_cruise_car WHERE ... 조회
-- 
-- 5️⃣ 문제 발생 시 롤백:
--    - 기존 업데이트 취소: 백업에서 복구 또는 UPDATE 반복 (NULL로 되돌리기)
--    - 트리거 제거: 섹션 5의 DROP 명령 실행
--
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
