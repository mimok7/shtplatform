-- ============================================================
-- 088: 예약 취소 요청 환불 계좌정보 컬럼 추가 (2026.05.29)
-- ------------------------------------------------------------
-- 목적: 취소 신청 시 은행명/계좌번호/예금주를 입력받아 저장
-- 방식: 비파괴 ALTER TABLE ... ADD COLUMN IF NOT EXISTS
-- ============================================================

ALTER TABLE public.reservation_cancellation_request
    ADD COLUMN IF NOT EXISTS refund_bank_name text NULL,
    ADD COLUMN IF NOT EXISTS refund_account_number text NULL,
    ADD COLUMN IF NOT EXISTS refund_account_holder text NULL;

COMMENT ON COLUMN public.reservation_cancellation_request.refund_bank_name
    IS '환불 은행명';
COMMENT ON COLUMN public.reservation_cancellation_request.refund_account_number
    IS '환불 계좌번호';
COMMENT ON COLUMN public.reservation_cancellation_request.refund_account_holder
    IS '환불 예금주';

-- 롤백 가이드(필요 시 수동 실행)
-- ALTER TABLE public.reservation_cancellation_request DROP COLUMN IF EXISTS refund_bank_name;
-- ALTER TABLE public.reservation_cancellation_request DROP COLUMN IF EXISTS refund_account_number;
-- ALTER TABLE public.reservation_cancellation_request DROP COLUMN IF EXISTS refund_account_holder;
