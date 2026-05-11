-- =============================================================================
-- Phase: 예약 수정 변경 추적 (reservation_change_*) 스키마 보강
-- 작성일: 2026-05-11
-- 목적: 매니저 예약 수정에서 모든 필드를 change_* 테이블에 기록 가능하도록
--       누락 컬럼 및 누락 테이블(reservation_change_package)을 추가
-- 안전: IF NOT EXISTS / DO 블록 사용 → 재실행 가능 (idempotent)
-- =============================================================================

-- 1) reservation_change_airport: 누락 컬럼 보강
ALTER TABLE public.reservation_change_airport
    ADD COLUMN IF NOT EXISTS vehicle_type text,
    ADD COLUMN IF NOT EXISTS ra_is_processed text;

-- 2) reservation_change_package 신규 테이블 (reservation_package 미러)
CREATE TABLE IF NOT EXISTS public.reservation_change_package (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    request_id uuid NOT NULL,
    reservation_id uuid NOT NULL,
    package_id uuid,
    adult_count integer DEFAULT 1,
    child_extra_bed integer DEFAULT 0,
    child_no_extra_bed integer DEFAULT 0,
    infant_free integer DEFAULT 0,
    infant_tour integer DEFAULT 0,
    infant_extra_bed integer DEFAULT 0,
    infant_seat integer DEFAULT 0,
    airport_vehicle character varying,
    ninh_binh_vehicle character varying,
    hanoi_vehicle character varying,
    cruise_vehicle character varying,
    sht_pickup_vehicle character varying,
    sht_pickup_seat character varying,
    sht_dropoff_vehicle character varying,
    sht_dropoff_seat character varying,
    adult_price integer,
    child_extra_bed_price integer,
    child_no_extra_bed_price integer,
    infant_tour_price integer,
    infant_extra_bed_price integer,
    infant_seat_price integer,
    total_price integer,
    request_note text,
    accommodation_info text,
    usage_date date,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- FK는 reservation_change_request 가 존재할 때만 시도 (이미 같은 패턴)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = 'reservation_change_request')
       AND NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                       WHERE table_schema = 'public'
                         AND table_name = 'reservation_change_package'
                         AND constraint_name = 'reservation_change_package_request_id_fkey') THEN
        ALTER TABLE public.reservation_change_package
            ADD CONSTRAINT reservation_change_package_request_id_fkey
            FOREIGN KEY (request_id) REFERENCES public.reservation_change_request(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 인덱스 (read-overlay 시 reservation_id + request_id 기반 조회 가속)
CREATE INDEX IF NOT EXISTS idx_rc_package_reservation_id
    ON public.reservation_change_package (reservation_id);
CREATE INDEX IF NOT EXISTS idx_rc_package_request_id
    ON public.reservation_change_package (request_id);

CREATE INDEX IF NOT EXISTS idx_rc_request_reservation_status
    ON public.reservation_change_request (reservation_id, status, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_rc_cruise_reservation_id ON public.reservation_change_cruise (reservation_id);
CREATE INDEX IF NOT EXISTS idx_rc_cruise_request_id ON public.reservation_change_cruise (request_id);
CREATE INDEX IF NOT EXISTS idx_rc_cruise_car_reservation_id ON public.reservation_change_cruise_car (reservation_id);
CREATE INDEX IF NOT EXISTS idx_rc_cruise_car_request_id ON public.reservation_change_cruise_car (request_id);
CREATE INDEX IF NOT EXISTS idx_rc_airport_reservation_id ON public.reservation_change_airport (reservation_id);
CREATE INDEX IF NOT EXISTS idx_rc_airport_request_id ON public.reservation_change_airport (request_id);
CREATE INDEX IF NOT EXISTS idx_rc_hotel_reservation_id ON public.reservation_change_hotel (reservation_id);
CREATE INDEX IF NOT EXISTS idx_rc_hotel_request_id ON public.reservation_change_hotel (request_id);
CREATE INDEX IF NOT EXISTS idx_rc_tour_reservation_id ON public.reservation_change_tour (reservation_id);
CREATE INDEX IF NOT EXISTS idx_rc_tour_request_id ON public.reservation_change_tour (request_id);
CREATE INDEX IF NOT EXISTS idx_rc_rentcar_reservation_id ON public.reservation_change_rentcar (reservation_id);
CREATE INDEX IF NOT EXISTS idx_rc_rentcar_request_id ON public.reservation_change_rentcar (request_id);
CREATE INDEX IF NOT EXISTS idx_rc_car_sht_reservation_id ON public.reservation_change_car_sht (reservation_id);
CREATE INDEX IF NOT EXISTS idx_rc_car_sht_request_id ON public.reservation_change_car_sht (request_id);

-- 적용 후 db.csv 동기화는 운영 절차에 따라 별도 진행
