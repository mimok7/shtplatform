-- =========================================================
-- 096: reservation_change_cruise_car 누락 컬럼 추가
-- 목적:
--   - reservation_cruise_car 변경이력 저장 시 사용하는 컬럼을
--     reservation_change_cruise_car에도 동일하게 보강
--   - PostgREST schema cache 기준 INSERT 400(PGRST204) 방지
-- 대상 컬럼:
--   - pickup_time
--   - return_time
--   - one_way_direction
-- =========================================================

ALTER TABLE public.reservation_change_cruise_car
ADD COLUMN IF NOT EXISTS pickup_time time NULL;

ALTER TABLE public.reservation_change_cruise_car
ADD COLUMN IF NOT EXISTS return_time time NULL;

ALTER TABLE public.reservation_change_cruise_car
ADD COLUMN IF NOT EXISTS one_way_direction text NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'reservation_change_cruise_car_one_way_direction_check'
    ) THEN
        ALTER TABLE public.reservation_change_cruise_car
        ADD CONSTRAINT reservation_change_cruise_car_one_way_direction_check
        CHECK (
            one_way_direction IS NULL
            OR one_way_direction IN ('pickup', 'dropoff', 'mismatch')
        );
    END IF;
END $$;

COMMENT ON COLUMN public.reservation_change_cruise_car.pickup_time IS
'크루즈 차량 변경 요청의 픽업 시간';

COMMENT ON COLUMN public.reservation_change_cruise_car.return_time IS
'크루즈 차량 변경 요청의 리턴 시간';

COMMENT ON COLUMN public.reservation_change_cruise_car.one_way_direction IS
'크루즈 차량 변경 요청의 편도 방향 보조값. pickup=승선일 픽업, dropoff=하선/종료일 드롭, mismatch=수동 확인 필요';

-- 참고:
-- PostgREST schema cache가 즉시 갱신되지 않는 환경이면
-- Supabase Dashboard 또는 NOTIFY pgrst, 'reload schema'; 로 캐시 갱신 필요
