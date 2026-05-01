-- ===============================================================
-- quote 테이블 트리거 오류 수정
-- 오류 1: column "quote_id" does not exist (PATCH /rest/v1/quote 시)
-- 오류 2: ERROR 42809 - "array_agg" is an aggregate function
-- 원인: DB 트리거에 집계함수(array_agg) 또는 quote_id 컬럼 참조 오류
--
-- Supabase Dashboard → SQL Editor에서 각 STEP을 개별 실행하세요
-- ===============================================================

-- ---------------------------------------------------------------
-- [STEP 1] quote 테이블 트리거 전체 목록 확인
-- ---------------------------------------------------------------
SELECT
  t.trigger_name,
  t.event_manipulation,
  t.action_timing,
  t.action_statement,
  t.action_orientation
FROM information_schema.triggers t
WHERE t.event_object_table = 'quote'
  AND t.trigger_schema = 'public'
ORDER BY t.trigger_name;

-- ---------------------------------------------------------------
-- [STEP 2] pg_trigger로 트리거 함수명 확인 (더 상세)
-- ---------------------------------------------------------------
SELECT
  tg.tgname AS trigger_name,
  p.proname AS function_name,
  p.prokind AS kind  -- 'f'=일반함수, 'a'=집계함수(이것이 문제!)
FROM pg_trigger tg
JOIN pg_proc p ON tg.tgfoid = p.oid
JOIN pg_class c ON tg.tgrelid = c.oid
WHERE c.relname = 'quote'
  AND NOT tg.tgisinternal;

-- ---------------------------------------------------------------
-- [STEP 3] 집계 함수(array_agg)를 트리거로 등록한 트리거 찾기
--   prokind = 'a' 이면 집계 함수 → 트리거 함수로 사용 불가 → 삭제 필요
-- ---------------------------------------------------------------
SELECT
  tg.tgname AS trigger_name,
  p.proname AS function_name,
  CASE p.prokind
    WHEN 'f' THEN '일반함수 (정상)'
    WHEN 'a' THEN '집계함수 (오류 원인!)'
    WHEN 'w' THEN '윈도우함수 (오류 원인!)'
    ELSE p.prokind::text
  END AS function_type
FROM pg_trigger tg
JOIN pg_proc p ON tg.tgfoid = p.oid
JOIN pg_class c ON tg.tgrelid = c.oid
WHERE c.relname = 'quote'
  AND NOT tg.tgisinternal
  AND p.prokind <> 'f';  -- 집계/윈도우 함수만 표시

-- ---------------------------------------------------------------
-- [STEP 4] 긴급 조치: quote 테이블 사용자 트리거만 비활성화
--   TRIGGER ALL → 시스템 트리거 포함이라 권한 오류(42501) 발생
--   TRIGGER USER → 사용자 정의 트리거만 비활성화 (권한 OK)
-- ---------------------------------------------------------------
ALTER TABLE quote DISABLE TRIGGER USER;

-- ---------------------------------------------------------------
-- [STEP 5] STEP 2/3 결과에서 문제 트리거명 확인 후 DROP
--   집계함수가 등록된 트리거는 수정이 불가 → 삭제 후 재생성 필요
--   [트리거명] 을 실제 이름으로 교체하여 실행:
-- ---------------------------------------------------------------
-- DROP TRIGGER IF EXISTS [트리거명] ON public.quote;

-- ---------------------------------------------------------------
-- [STEP 6] 올바른 트리거 함수 재생성 예시
--   array_agg → 일반 INSERT 방식으로 교체
-- ---------------------------------------------------------------
-- CREATE OR REPLACE FUNCTION public.handle_quote_status_change()
-- RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
-- BEGIN
--   IF NEW.status IS DISTINCT FROM OLD.status THEN
--     INSERT INTO business_notifications
--       (notification_id, business_type, department, required_action)
--     VALUES
--       (NEW.id, 'quote', '영업', '견적 상태 변경: ' || NEW.status);
--   END IF;
--   RETURN NEW;
-- END;
-- $$;

-- CREATE TRIGGER trg_quote_status_change
-- AFTER UPDATE OF status ON public.quote
-- FOR EACH ROW EXECUTE FUNCTION public.handle_quote_status_change();

-- ---------------------------------------------------------------
-- [STEP 7] 수정 완료 후 트리거 재활성화
-- ---------------------------------------------------------------
-- ALTER TABLE quote ENABLE TRIGGER USER;


