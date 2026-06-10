-- ============================================================
-- 095: reservation_cruise_car 편도 방향 보조 컬럼 추가 및 지정 데이터 백필
-- 목적:
--   1. 기존 컬럼 구조는 유지
--   2. 편도 방향 판별용 보조 컬럼만 추가
--   3. 확인 완료된 일부 데이터에 대해 방향값 직접 반영
--
-- 권장 사용:
--   - pickup   : 승선일 기준 픽업 편도
--   - dropoff  : 하선/종료일 기준 드롭 편도
--   - mismatch : 체크인/종료일과 불일치하여 수동 확인 필요
-- ============================================================

ALTER TABLE reservation_cruise_car
ADD COLUMN IF NOT EXISTS one_way_direction text NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'reservation_cruise_car_one_way_direction_check'
    ) THEN
        ALTER TABLE reservation_cruise_car
        ADD CONSTRAINT reservation_cruise_car_one_way_direction_check
        CHECK (one_way_direction IS NULL OR one_way_direction IN ('pickup', 'dropoff', 'mismatch'));
    END IF;
END $$;

COMMENT ON COLUMN reservation_cruise_car.one_way_direction IS
'편도 방향 보조값. pickup=승선일 픽업, dropoff=하선/종료일 드롭, mismatch=수동 확인 필요';

-- ============================================================
-- 지정 데이터 반영
-- 기준: reservation_id + vehicle_type + pickup_datetime + route
-- ============================================================

UPDATE reservation_cruise_car
SET one_way_direction = 'dropoff'
WHERE reservation_id = 'ac3307a8-87a2-4f10-9a5f-76a67523b47a'
  AND vehicle_type = '9인승 리무진'
  AND pickup_datetime = DATE '2026-12-24'
  AND route = '하노이 - 하롱베이'
  AND way_type = '편도';

UPDATE reservation_cruise_car
SET one_way_direction = 'pickup'
WHERE reservation_id = '54732ab4-e1f2-4e75-b6bb-bb0d70afc73f'
  AND vehicle_type = '11인승 리무진'
  AND pickup_datetime = DATE '2026-11-02'
  AND route = '하노이 - 하롱베이'
  AND way_type = '편도';

UPDATE reservation_cruise_car
SET one_way_direction = 'dropoff'
WHERE reservation_id = '9c4adcca-4853-4210-aa95-7ffa9d9e75ef'
  AND vehicle_type = '11인승 리무진'
  AND pickup_datetime = DATE '2026-10-15'
  AND route = '하노이 - 하롱베이'
  AND way_type = '편도';

UPDATE reservation_cruise_car
SET one_way_direction = 'dropoff'
WHERE reservation_id = '9c4adcca-4853-4210-aa95-7ffa9d9e75ef'
  AND vehicle_type = 'SUV'
  AND pickup_datetime = DATE '2026-10-15'
  AND route = '하노이 - 하롱베이'
  AND way_type = '편도';

UPDATE reservation_cruise_car
SET one_way_direction = 'pickup'
WHERE reservation_id = '3c1d81b7-f4ec-4e74-9750-289cf543a605'
  AND vehicle_type = '크루즈 셔틀 리무진'
  AND pickup_datetime = DATE '2026-10-12'
  AND route = '하노이 - 하롱베이'
  AND way_type = '편도';

UPDATE reservation_cruise_car
SET one_way_direction = 'pickup'
WHERE reservation_id = '6e55bf10-93fb-4028-925f-8d3f73766f6f'
  AND vehicle_type = '11인승 리무진'
  AND pickup_datetime = DATE '2026-10-11'
  AND route = '하노이 - 하롱베이'
  AND way_type = '편도';

UPDATE reservation_cruise_car
SET one_way_direction = 'pickup'
WHERE reservation_id = 'f650e29d-8ed0-4206-8b35-dc032c52f527'
  AND vehicle_type = '11인승 리무진'
  AND pickup_datetime = DATE '2026-10-06'
  AND route = '하롱베이 - 하이퐁(옌프)'
  AND way_type = '편도';

UPDATE reservation_cruise_car
SET one_way_direction = 'dropoff'
WHERE reservation_id = '6d018b30-3717-46e6-b9b5-b09b4dba3bf6'
  AND vehicle_type = '9인승 리무진'
  AND pickup_datetime = DATE '2026-10-06'
  AND route = '하노이 - 하롱베이'
  AND way_type = '편도';

UPDATE reservation_cruise_car
SET one_way_direction = 'pickup'
WHERE reservation_id = '6d018b30-3717-46e6-b9b5-b09b4dba3bf6'
  AND vehicle_type = '9인승 리무진'
  AND pickup_datetime = DATE '2026-10-05'
  AND route = '하롱베이 - 닌빈'
  AND way_type = '편도';

UPDATE reservation_cruise_car
SET one_way_direction = 'pickup'
WHERE reservation_id = 'a64326a0-fa02-42f2-906f-6b0841a39e22'
  AND vehicle_type = 'SUV'
  AND pickup_datetime = DATE '2026-07-22'
  AND route = '하노이 - 하롱베이'
  AND way_type = '편도';

UPDATE reservation_cruise_car
SET one_way_direction = 'pickup'
WHERE reservation_id = '71529844-7bc4-4243-8420-3b0cc99554d4'
  AND vehicle_type = '9인승 리무진'
  AND pickup_datetime = DATE '2026-07-06'
  AND route = '하노이 - 하롱베이'
  AND way_type = '편도';

UPDATE reservation_cruise_car
SET one_way_direction = 'pickup'
WHERE reservation_id = '3cd61b7f-04c4-462c-9199-21a5bf0e06dc'
  AND vehicle_type = '11인승 리무진'
  AND pickup_datetime = DATE '2026-06-29'
  AND route = '하노이 - 하롱베이'
  AND way_type = '편도';

-- ============================================================
-- 검증 쿼리
-- ============================================================

-- SELECT
--   reservation_id,
--   vehicle_type,
--   route,
--   pickup_datetime,
--   one_way_direction
-- FROM reservation_cruise_car
-- WHERE reservation_id IN (
--   'ac3307a8-87a2-4f10-9a5f-76a67523b47a',
--   '54732ab4-e1f2-4e75-b6bb-bb0d70afc73f',
--   '9c4adcca-4853-4210-aa95-7ffa9d9e75ef',
--   '3c1d81b7-f4ec-4e74-9750-289cf543a605',
--   '6e55bf10-93fb-4028-925f-8d3f73766f6f',
--   'f650e29d-8ed0-4206-8b35-dc032c52f527',
--   '6d018b30-3717-46e6-b9b5-b09b4dba3bf6',
--   'a64326a0-fa02-42f2-906f-6b0841a39e22',
--   '71529844-7bc4-4243-8420-3b0cc99554d4',
--   '3cd61b7f-04c4-462c-9199-21a5bf0e06dc'
-- )
-- ORDER BY pickup_datetime, reservation_id, vehicle_type;

-- 기대값 요약
-- ac3307a8-87a2-4f10-9a5f-76a67523b47a / 9인승 리무진 / 2026-12-24 / dropoff
-- 54732ab4-e1f2-4e75-b6bb-bb0d70afc73f / 11인승 리무진 / 2026-11-02 / pickup
-- 9c4adcca-4853-4210-aa95-7ffa9d9e75ef / 11인승 리무진 / 2026-10-15 / dropoff
-- 9c4adcca-4853-4210-aa95-7ffa9d9e75ef / SUV / 2026-10-15 / dropoff
-- 3c1d81b7-f4ec-4e74-9750-289cf543a605 / 크루즈 셔틀 리무진 / 2026-10-12 / pickup
-- 6e55bf10-93fb-4028-925f-8d3f73766f6f / 11인승 리무진 / 2026-10-11 / pickup
-- f650e29d-8ed0-4206-8b35-dc032c52f527 / 11인승 리무진 / 2026-10-06 / pickup
-- 6d018b30-3717-46e6-b9b5-b09b4dba3bf6 / 9인승 리무진 / 2026-10-06 / dropoff
-- 6d018b30-3717-46e6-b9b5-b09b4dba3bf6 / 9인승 리무진 / 2026-10-05 / pickup
-- a64326a0-fa02-42f2-906f-6b0841a39e22 / SUV / 2026-07-22 / pickup
-- 71529844-7bc4-4243-8420-3b0cc99554d4 / 9인승 리무진 / 2026-07-06 / pickup
-- 3cd61b7f-04c4-462c-9199-21a5bf0e06dc / 11인승 리무진 / 2026-06-29 / pickup
