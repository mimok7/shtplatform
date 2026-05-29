-- ============================================================
-- 089: 예약 취소 - 환불 완료(completed) 워크플로우 추가 (2026.05.29)
-- ------------------------------------------------------------
-- 비파괴 변경 (Phase10 지침 준수):
--   1) reservation_cancellation_request.status CHECK 제약에 'completed' 추가
--   2) result_status CHECK 제약에 'refunded' 추가
--   3) 환불 처리 메타 컬럼 추가
--        - refund_amount       numeric NULL  (환불 금액)
--        - refund_payment_id   uuid    NULL  (생성된 reservation_payments.id 참조)
--        - refund_completed_at timestamptz NULL
--        - refund_completed_by uuid    NULL  (매니저 user_id)
-- ============================================================

-- [백업 권장]
--   pg_dump --schema-only --table=public.reservation_cancellation_request \
--     > backup_rcr_schema_20260529.sql
--   CREATE TABLE IF NOT EXISTS _backup_rcr_20260529 AS
--   SELECT * FROM public.reservation_cancellation_request;

-- 1) status CHECK 재정의 ----------------------------------------------------
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.reservation_cancellation_request'::regclass
          AND conname = 'reservation_cancellation_request_status_check'
    ) THEN
        ALTER TABLE public.reservation_cancellation_request
            DROP CONSTRAINT reservation_cancellation_request_status_check;
    END IF;
END $$;

ALTER TABLE public.reservation_cancellation_request
    ADD CONSTRAINT reservation_cancellation_request_status_check
    CHECK (status IN ('pending','approved','rejected','cancelled','completed'));

-- 2) result_status CHECK 재정의 ---------------------------------------------
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.reservation_cancellation_request'::regclass
          AND conname = 'reservation_cancellation_request_result_status_check'
    ) THEN
        ALTER TABLE public.reservation_cancellation_request
            DROP CONSTRAINT reservation_cancellation_request_result_status_check;
    END IF;
END $$;

ALTER TABLE public.reservation_cancellation_request
    ADD CONSTRAINT reservation_cancellation_request_result_status_check
    CHECK (result_status IN ('requested','executed','rejected','failed','refunded'));

-- 3) 환불 처리 메타 컬럼 ----------------------------------------------------
ALTER TABLE public.reservation_cancellation_request
    ADD COLUMN IF NOT EXISTS refund_amount       numeric NULL,
    ADD COLUMN IF NOT EXISTS refund_payment_id   uuid    NULL,
    ADD COLUMN IF NOT EXISTS refund_completed_at timestamptz NULL,
    ADD COLUMN IF NOT EXISTS refund_completed_by uuid    NULL;

COMMENT ON COLUMN public.reservation_cancellation_request.refund_amount       IS '환불 금액(원)';
COMMENT ON COLUMN public.reservation_cancellation_request.refund_payment_id   IS 'reservation_payments 환불 행 ID';
COMMENT ON COLUMN public.reservation_cancellation_request.refund_completed_at IS '환불 완료 일시';
COMMENT ON COLUMN public.reservation_cancellation_request.refund_completed_by IS '환불 처리 매니저 user_id';

-- 4) 조회 인덱스 (completed 필터 지원) --------------------------------------
CREATE INDEX IF NOT EXISTS idx_rcr_refund_completed_at
    ON public.reservation_cancellation_request (refund_completed_at DESC)
    WHERE refund_completed_at IS NOT NULL;

-- ============================================================
-- [롤백 절차]
-- ALTER TABLE public.reservation_cancellation_request
--     DROP COLUMN IF EXISTS refund_amount,
--     DROP COLUMN IF EXISTS refund_payment_id,
--     DROP COLUMN IF EXISTS refund_completed_at,
--     DROP COLUMN IF EXISTS refund_completed_by;
-- DROP INDEX IF EXISTS idx_rcr_refund_completed_at;
-- (status/result_status CHECK는 원복하지 않아도 무해)
-- ============================================================
