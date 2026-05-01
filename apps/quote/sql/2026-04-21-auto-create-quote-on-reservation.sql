-- 2026-04-21-auto-create-quote-on-reservation.sql
-- 목적:
-- 1) reservation INSERT 시 re_quote_id가 비어있으면 자동으로 draft quote를 생성/재사용
-- 2) 생성/재사용된 quote.id를 reservation.re_quote_id에 자동 설정
--
-- 적용 방법:
-- - Supabase SQL Editor에서 이 파일을 1회 실행
-- - 이후 예약 생성 API/프론트 코드에서 re_quote_id를 넘기지 않아도 자동 연결됨

BEGIN;

-- 사용자별 draft quote 조회/생성 함수
CREATE OR REPLACE FUNCTION public.fn_get_or_create_draft_quote(p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_quote_id uuid;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required';
  END IF;

  -- quote.user_id는 auth.users(id)를 참조하므로, 인증 사용자가 없으면 생성 스킵
  IF NOT EXISTS (
    SELECT 1
    FROM auth.users au
    WHERE au.id = p_user_id
  ) THEN
    RETURN NULL;
  END IF;

  -- quote.user_id FK 보장을 위해 users 행을 선행 보정
  INSERT INTO public.users (id, role, status, created_at, updated_at)
  VALUES (p_user_id, 'member', 'active', now(), now())
  ON CONFLICT (id) DO UPDATE
  SET
    updated_at = EXCLUDED.updated_at,
    role = CASE
      WHEN users.role = 'guest' THEN 'member'
      ELSE users.role
    END,
    status = COALESCE(users.status, 'active');

  -- 동시성 제어: 동일 사용자의 동시 요청에서 중복 draft 생성 방지
  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text));

  SELECT q.id
    INTO v_quote_id
  FROM public.quote q
  WHERE q.user_id = p_user_id
    AND q.status = 'draft'
  ORDER BY q.created_at DESC NULLS LAST
  LIMIT 1;

  IF v_quote_id IS NOT NULL THEN
    RETURN v_quote_id;
  END IF;

  BEGIN
    INSERT INTO public.quote (user_id, title, status)
    VALUES (p_user_id, '자동 생성 견적', 'draft')
    RETURNING id INTO v_quote_id;
  EXCEPTION
    WHEN unique_violation THEN
      -- 유니크 제약이 있는 환경에서 경합 발생 시 재조회
      SELECT q.id
        INTO v_quote_id
      FROM public.quote q
      WHERE q.user_id = p_user_id
        AND q.status = 'draft'
      ORDER BY q.created_at DESC NULLS LAST
      LIMIT 1;
  END;

  IF v_quote_id IS NULL THEN
    RAISE EXCEPTION 'failed to get/create draft quote for user %', p_user_id;
  END IF;

  RETURN v_quote_id;
END;
$$;

-- reservation INSERT 전 re_quote_id 자동 설정 트리거 함수
CREATE OR REPLACE FUNCTION public.fn_set_reservation_quote_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_quote_id uuid;
BEGIN
  IF NEW.re_quote_id IS NULL THEN
    v_quote_id := public.fn_get_or_create_draft_quote(NEW.re_user_id);
    IF v_quote_id IS NOT NULL THEN
      NEW.re_quote_id := v_quote_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_reservation_quote_id ON public.reservation;
CREATE TRIGGER trg_set_reservation_quote_id
BEFORE INSERT ON public.reservation
FOR EACH ROW
EXECUTE FUNCTION public.fn_set_reservation_quote_id();

-- 기존 데이터 보정(선택): re_quote_id가 NULL인 행만 안전하게 채움
UPDATE public.reservation r
SET re_quote_id = public.fn_get_or_create_draft_quote(r.re_user_id)
WHERE r.re_quote_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM auth.users au
    WHERE au.id = r.re_user_id
  )
  AND r.re_user_id IS NOT NULL;

-- PostgREST 스키마 캐시 리로드
NOTIFY pgrst, 'reload schema';

COMMIT;

-- 검증 쿼리(필요 시 수동 실행)
-- 1) 트리거 확인
-- SELECT trigger_name, event_manipulation, action_timing
-- FROM information_schema.triggers
-- WHERE event_object_table = 'reservation'
--   AND trigger_name = 'trg_set_reservation_quote_id';
--
-- 2) 미연결 예약 확인 (0건이어야 정상)
-- SELECT COUNT(*) AS null_quote_reservations
-- FROM public.reservation
-- WHERE re_quote_id IS NULL;
