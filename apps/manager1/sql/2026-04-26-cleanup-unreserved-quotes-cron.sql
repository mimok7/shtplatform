-- =============================================================
-- 견적 자동 정리 (예약 미연결 + 1개월 경과 견적 삭제)
-- 실행 시각: 매일 KST 02:30 (UTC 17:30)
-- 대상: reservation.re_quote_id 에 연결되지 않은 quote 중
--       created_at <= now() - INTERVAL '1 month'
-- 동작: quote_item → 각 서비스 테이블(airport/hotel/rentcar/tour/room/car/cruise)
--       → quote_item → quote 순서로 삭제
-- =============================================================

-- 1) 확장 활성화 (Supabase는 pg_cron 사용 가능)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2) 정리 함수 생성 (또는 교체)
CREATE OR REPLACE FUNCTION public.cleanup_unreserved_quotes()
RETURNS TABLE(deleted_quote_count integer, deleted_item_count integer, deleted_service_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_quote_ids       uuid[];
    v_quote_count     integer := 0;
    v_item_count      integer := 0;
    v_service_count   integer := 0;
    v_tmp             integer := 0;
BEGIN
    -- 2-1. 삭제 대상 견적 ID 수집 (예약 미연결 + 1개월 경과)
    SELECT COALESCE(array_agg(q.id), ARRAY[]::uuid[])
      INTO v_quote_ids
    FROM public.quote q
    WHERE q.created_at <= (now() - INTERVAL '1 month')
      AND NOT EXISTS (
            SELECT 1
              FROM public.reservation r
             WHERE r.re_quote_id = q.id
        );

    IF array_length(v_quote_ids, 1) IS NULL THEN
        RAISE NOTICE '[cleanup_unreserved_quotes] 대상 견적 없음';
        deleted_quote_count := 0;
        deleted_item_count := 0;
        deleted_service_count := 0;
        RETURN NEXT;
        RETURN;
    END IF;

    RAISE NOTICE '[cleanup_unreserved_quotes] 대상 견적 % 건', array_length(v_quote_ids, 1);

    -- 2-2. quote_item에 연결된 서비스 테이블 행 삭제
    --      (quote_item.service_type 별로 service_ref_id 묶어서 일괄 삭제)

    -- airport
    WITH del AS (
        DELETE FROM public.airport
         WHERE id IN (
                SELECT qi.service_ref_id
                  FROM public.quote_item qi
                 WHERE qi.quote_id = ANY(v_quote_ids)
                   AND qi.service_type = 'airport'
            )
        RETURNING 1
    ) SELECT count(*)::int INTO v_tmp FROM del;
    v_service_count := v_service_count + v_tmp;

    -- hotel
    WITH del AS (
        DELETE FROM public.hotel
         WHERE id IN (
                SELECT qi.service_ref_id
                  FROM public.quote_item qi
                 WHERE qi.quote_id = ANY(v_quote_ids)
                   AND qi.service_type = 'hotel'
            )
        RETURNING 1
    ) SELECT count(*)::int INTO v_tmp FROM del;
    v_service_count := v_service_count + v_tmp;

    -- rentcar
    WITH del AS (
        DELETE FROM public.rentcar
         WHERE id IN (
                SELECT qi.service_ref_id
                  FROM public.quote_item qi
                 WHERE qi.quote_id = ANY(v_quote_ids)
                   AND qi.service_type = 'rentcar'
            )
        RETURNING 1
    ) SELECT count(*)::int INTO v_tmp FROM del;
    v_service_count := v_service_count + v_tmp;

    -- tour
    WITH del AS (
        DELETE FROM public.tour
         WHERE id IN (
                SELECT qi.service_ref_id
                  FROM public.quote_item qi
                 WHERE qi.quote_id = ANY(v_quote_ids)
                   AND qi.service_type = 'tour'
            )
        RETURNING 1
    ) SELECT count(*)::int INTO v_tmp FROM del;
    v_service_count := v_service_count + v_tmp;

    -- room (크루즈 객실)
    WITH del AS (
        DELETE FROM public.room
         WHERE id IN (
                SELECT qi.service_ref_id
                  FROM public.quote_item qi
                 WHERE qi.quote_id = ANY(v_quote_ids)
                   AND qi.service_type = 'room'
            )
        RETURNING 1
    ) SELECT count(*)::int INTO v_tmp FROM del;
    v_service_count := v_service_count + v_tmp;

    -- car (크루즈 차량)
    WITH del AS (
        DELETE FROM public.car
         WHERE id IN (
                SELECT qi.service_ref_id
                  FROM public.quote_item qi
                 WHERE qi.quote_id = ANY(v_quote_ids)
                   AND qi.service_type = 'car'
            )
        RETURNING 1
    ) SELECT count(*)::int INTO v_tmp FROM del;
    v_service_count := v_service_count + v_tmp;

    -- cruise (크루즈 메타 정보)
    WITH del AS (
        DELETE FROM public.cruise
         WHERE id IN (
                SELECT qi.service_ref_id
                  FROM public.quote_item qi
                 WHERE qi.quote_id = ANY(v_quote_ids)
                   AND qi.service_type = 'cruise'
            )
        RETURNING 1
    ) SELECT count(*)::int INTO v_tmp FROM del;
    v_service_count := v_service_count + v_tmp;

    -- 2-3. quote_item 삭제
    WITH del AS (
        DELETE FROM public.quote_item
         WHERE quote_id = ANY(v_quote_ids)
        RETURNING 1
    ) SELECT count(*)::int INTO v_item_count FROM del;

    -- 2-4. quote 본체 삭제
    WITH del AS (
        DELETE FROM public.quote
         WHERE id = ANY(v_quote_ids)
        RETURNING 1
    ) SELECT count(*)::int INTO v_quote_count FROM del;

    RAISE NOTICE '[cleanup_unreserved_quotes] quote=% item=% service=% 삭제 완료',
        v_quote_count, v_item_count, v_service_count;

    deleted_quote_count := v_quote_count;
    deleted_item_count := v_item_count;
    deleted_service_count := v_service_count;
    RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.cleanup_unreserved_quotes() IS
'예약과 연결되지 않은 1개월 경과 견적과 그에 속한 서비스/quote_item을 일괄 삭제. pg_cron 야간 배치용.';

-- 3) 권한: cron 실행 계정(postgres)에서 호출 가능하도록
REVOKE ALL ON FUNCTION public.cleanup_unreserved_quotes() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_unreserved_quotes() TO postgres;

-- 4) 기존 동일 작업이 등록되어 있으면 제거 (재실행 안전)
DO $$
DECLARE
    v_jobid bigint;
BEGIN
    FOR v_jobid IN
        SELECT jobid FROM cron.job WHERE jobname = 'cleanup_unreserved_quotes_daily'
    LOOP
        PERFORM cron.unschedule(v_jobid);
    END LOOP;
END;
$$;

-- 5) 매일 KST 02:30 (= UTC 17:30) 자동 실행 등록
SELECT cron.schedule(
    'cleanup_unreserved_quotes_daily',
    '30 17 * * *',
    $$ SELECT public.cleanup_unreserved_quotes(); $$
);

-- =============================================================
-- 검증 쿼리 (수동 실행용 - 주석 처리)
-- =============================================================
-- 1) 등록된 cron 작업 확인
-- SELECT jobid, jobname, schedule, command, active
--   FROM cron.job
--  WHERE jobname = 'cleanup_unreserved_quotes_daily';
--
-- 2) 수동 실행 테스트
-- SELECT * FROM public.cleanup_unreserved_quotes();
--
-- 3) 최근 실행 로그
-- SELECT job_pid, status, return_message, start_time, end_time
--   FROM cron.job_run_details
--  WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'cleanup_unreserved_quotes_daily')
--  ORDER BY start_time DESC
--  LIMIT 10;
--
-- 4) 삭제 예정 견적 미리보기
-- SELECT q.id, q.title, q.created_at
--   FROM public.quote q
--  WHERE q.created_at <= (now() - INTERVAL '1 month')
--    AND NOT EXISTS (SELECT 1 FROM public.reservation r WHERE r.re_quote_id = q.id);
