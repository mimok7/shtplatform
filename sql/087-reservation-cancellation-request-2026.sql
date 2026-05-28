-- ============================================================
-- 087: 예약 취소 요청 도메인 분리 테이블 (2026.05.28)
-- ------------------------------------------------------------
-- Phase10 지침 준수: 비파괴(CREATE IF NOT EXISTS), 백업/롤백 절차 포함
-- 변경 요약:
--   1) reservation_cancellation_request : 취소 신청/처리 메인 테이블
--   2) reservation_cancellation_access  : 비밀번호 분실 대응용 단회 토큰 테이블
--   3) 조회 인덱스 및 트리거(updated_at)
--   4) RLS: member 본인만 / manager·admin 전체
-- ============================================================

-- ─────────────────────────────────────────────
-- [백업 절차] 적용 전 운영 DB에서 아래 명령으로 스냅샷 권장
--   pg_dump --schema-only --table=public.reservation > backup_reservation_schema_20260528.sql
--   기존 임시 운영 데이터는 reservation_change_request(re_type='cancellation') 에 존재할 수 있으므로
--   필요 시 별도 SELECT INTO 백업:
--   CREATE TABLE IF NOT EXISTS _backup_change_request_cancellation_20260528 AS
--   SELECT * FROM public.reservation_change_request WHERE re_type = 'cancellation';
-- ─────────────────────────────────────────────

-- 1) 메인 테이블 ----------------------------------------------
CREATE TABLE IF NOT EXISTS public.reservation_cancellation_request (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    reservation_id uuid NOT NULL,
    requester_user_id uuid NULL,                 -- 비로그인(토큰) 신청 허용
    requester_email text NULL,                   -- 비로그인 신청 시 본인확인용
    requester_phone text NULL,
    cancellation_type text NOT NULL DEFAULT 'full'
        CHECK (cancellation_type IN ('full','partial')),
    cancel_reason_category text NOT NULL DEFAULT 'other'
        CHECK (cancel_reason_category IN ('natural_disaster','change_of_mind','other')),
    cancel_reason_detail text NULL,
    cancel_targets jsonb NULL,                   -- [{service_type,row_id,label}]
    status text NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','approved','rejected','cancelled')),
    result_status text NOT NULL DEFAULT 'requested'
        CHECK (result_status IN ('requested','executed','rejected','failed')),
    manager_note text NULL,
    reviewed_by uuid NULL,
    reviewed_at timestamptz NULL,
    executed_at timestamptz NULL,
    execution_summary jsonb NULL,
    submitted_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- FK (없으면 추가 — 운영 DB 상태에 맞춰 IF NOT EXISTS 패턴)
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'reservation_cancellation_request_reservation_fk'
    ) THEN
        ALTER TABLE public.reservation_cancellation_request
            ADD CONSTRAINT reservation_cancellation_request_reservation_fk
            FOREIGN KEY (reservation_id) REFERENCES public.reservation(re_id) ON DELETE CASCADE;
    END IF;
END $$;

-- 2) 단회 토큰 테이블 (비밀번호 분실 대응) ---------------------
CREATE TABLE IF NOT EXISTS public.reservation_cancellation_access (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    reservation_id uuid NOT NULL,
    token_hash text NOT NULL,                    -- 토큰 원문은 절대 저장 금지
    purpose text NOT NULL DEFAULT 'cancel'
        CHECK (purpose IN ('cancel','verify')),
    issued_by uuid NULL,                          -- 매니저 발급 시 매니저 ID
    issued_to_email text NULL,
    issued_to_phone text NULL,
    expires_at timestamptz NOT NULL,
    used_at timestamptz NULL,
    used_ip text NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uidx_rca_token_hash
    ON public.reservation_cancellation_access (token_hash);

CREATE INDEX IF NOT EXISTS idx_rca_reservation_expires
    ON public.reservation_cancellation_access (reservation_id, expires_at);

-- 3) 인덱스 ---------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_rcr_status_submitted_at
    ON public.reservation_cancellation_request (status, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_rcr_reservation_status
    ON public.reservation_cancellation_request (reservation_id, status, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_rcr_requester
    ON public.reservation_cancellation_request (requester_user_id, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_rcr_reason_category
    ON public.reservation_cancellation_request (cancel_reason_category, submitted_at DESC);

-- 4) updated_at 트리거 ---------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at_timestamp()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rcr_set_updated_at ON public.reservation_cancellation_request;
CREATE TRIGGER trg_rcr_set_updated_at
BEFORE UPDATE ON public.reservation_cancellation_request
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

-- 5) RLS ------------------------------------------------------
ALTER TABLE public.reservation_cancellation_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservation_cancellation_access ENABLE ROW LEVEL SECURITY;

-- 정책: member 본인만 SELECT/INSERT, manager·admin 전체 권한
DROP POLICY IF EXISTS rcr_select_self_or_manager ON public.reservation_cancellation_request;
CREATE POLICY rcr_select_self_or_manager
ON public.reservation_cancellation_request
FOR SELECT
USING (
    requester_user_id = auth.uid()
    OR EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid() AND u.role IN ('manager','admin')
    )
);

DROP POLICY IF EXISTS rcr_insert_self ON public.reservation_cancellation_request;
CREATE POLICY rcr_insert_self
ON public.reservation_cancellation_request
FOR INSERT
WITH CHECK (
    requester_user_id = auth.uid()
    OR auth.uid() IS NULL  -- 토큰 기반 비로그인 신청 허용(서비스 키로 처리)
);

DROP POLICY IF EXISTS rcr_update_manager_only ON public.reservation_cancellation_request;
CREATE POLICY rcr_update_manager_only
ON public.reservation_cancellation_request
FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid() AND u.role IN ('manager','admin')
    )
);

-- 토큰 테이블은 매니저/서비스 키 전용
DROP POLICY IF EXISTS rca_manager_all ON public.reservation_cancellation_access;
CREATE POLICY rca_manager_all
ON public.reservation_cancellation_access
FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid() AND u.role IN ('manager','admin')
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid() AND u.role IN ('manager','admin')
    )
);

-- ─────────────────────────────────────────────
-- [롤백 절차]
--   DROP POLICY IF EXISTS rcr_select_self_or_manager ON public.reservation_cancellation_request;
--   DROP POLICY IF EXISTS rcr_insert_self ON public.reservation_cancellation_request;
--   DROP POLICY IF EXISTS rcr_update_manager_only ON public.reservation_cancellation_request;
--   DROP POLICY IF EXISTS rca_manager_all ON public.reservation_cancellation_access;
--   DROP TRIGGER IF EXISTS trg_rcr_set_updated_at ON public.reservation_cancellation_request;
--   DROP TABLE IF EXISTS public.reservation_cancellation_access;
--   DROP TABLE IF EXISTS public.reservation_cancellation_request;
-- ─────────────────────────────────────────────
