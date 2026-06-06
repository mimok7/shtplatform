-- ============================================================
-- 093: 프로그램 수정 요청 테이블
-- 생성일: 2026-06-06
-- 목적:
--   - 모바일 첫 메뉴의 "프로그램 수정" 페이지에서
--     앱명 / 수정요청페이지 URL / 내용 / 계정 / 신청일시 / 완료일시를 저장
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.program_update_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_name TEXT NOT NULL,
  request_url TEXT NULL,
  content TEXT NOT NULL,
  account TEXT NULL,
  requested_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.program_update_requests
  ADD COLUMN IF NOT EXISTS request_url TEXT NULL;

COMMENT ON TABLE public.program_update_requests IS '모바일 앱 프로그램 수정 요청/완료 기록';
COMMENT ON COLUMN public.program_update_requests.app_name IS '대상 앱명';
COMMENT ON COLUMN public.program_update_requests.request_url IS '수정 요청 대상 페이지 URL';
COMMENT ON COLUMN public.program_update_requests.content IS '수정 내용';
COMMENT ON COLUMN public.program_update_requests.account IS '요청 계정 또는 처리 계정';
COMMENT ON COLUMN public.program_update_requests.requested_at IS '신청일시';
COMMENT ON COLUMN public.program_update_requests.completed_at IS '완료일시';

CREATE INDEX IF NOT EXISTS idx_program_update_requests_requested_at
  ON public.program_update_requests(requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_program_update_requests_app_name
  ON public.program_update_requests(app_name, requested_at DESC);

CREATE OR REPLACE FUNCTION public.set_program_update_requests_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_program_update_requests_updated_at
  ON public.program_update_requests;

CREATE TRIGGER trg_program_update_requests_updated_at
BEFORE UPDATE ON public.program_update_requests
FOR EACH ROW
EXECUTE FUNCTION public.set_program_update_requests_updated_at();

ALTER TABLE public.program_update_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "program_update_requests_select_authenticated"
  ON public.program_update_requests;
CREATE POLICY "program_update_requests_select_authenticated"
  ON public.program_update_requests
  FOR SELECT
  TO authenticated
  USING (TRUE);

DROP POLICY IF EXISTS "program_update_requests_insert_authenticated"
  ON public.program_update_requests;
CREATE POLICY "program_update_requests_insert_authenticated"
  ON public.program_update_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (TRUE);

DROP POLICY IF EXISTS "program_update_requests_update_authenticated"
  ON public.program_update_requests;
CREATE POLICY "program_update_requests_update_authenticated"
  ON public.program_update_requests
  FOR UPDATE
  TO authenticated
  USING (TRUE)
  WITH CHECK (TRUE);

GRANT SELECT, INSERT, UPDATE ON public.program_update_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.program_update_requests TO service_role;

COMMIT;

-- 검증 예시
-- SELECT * FROM public.program_update_requests ORDER BY requested_at DESC;
