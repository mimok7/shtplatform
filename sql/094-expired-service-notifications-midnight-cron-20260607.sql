-- =============================================================
-- 사용일 경과 알림 자동 정리 크론
-- 생성일: 2026-06-07
-- 실행 시각: 매일 KST 00:00 (UTC 15:00)
--
-- 목적:
--   - 체크인/픽업/드롭/사용일 등이 지난 알림을 notifications 테이블에서 자동 삭제
--   - 관련 notification_dispatch_log 도 함께 정리
--   - 원본 payment_notifications 의 지난 알림도 함께 정리
--
-- 참고:
--   - "시간이 지나면 자동 삭제"는 일반 DB 트리거만으로 처리할 수 없음
--   - 시각 경과 기반 작업은 pg_cron 같은 스케줄러가 필요함
-- =============================================================

-- 1) 확장 활성화
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2) metadata / payload 에서 서비스 기준일 추출 함수
CREATE OR REPLACE FUNCTION public.extract_notification_service_date(payload jsonb)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_text text;
BEGIN
    IF payload IS NULL THEN
        RETURN NULL;
    END IF;

    v_text := COALESCE(
        payload->>'serviceDate',
        payload->>'service_date',
        payload->>'notification_date',
        payload->>'usageDate',
        payload->>'usage_date',
        payload->>'checkin_date',
        payload->>'pickup_date',
        payload->>'dropoff_date'
    );

    IF v_text IS NULL OR btrim(v_text) = '' THEN
        RETURN NULL;
    END IF;

    IF v_text ~ '^\d{4}-\d{2}-\d{2}$' THEN
        RETURN v_text::date;
    END IF;

    IF v_text ~ '^\d{4}-\d{2}-\d{2}T' THEN
        RETURN (v_text::timestamptz AT TIME ZONE 'Asia/Seoul')::date;
    END IF;

    RETURN NULL;
EXCEPTION
    WHEN others THEN
        RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.extract_notification_service_date(jsonb) IS
'알림 metadata/payload 에서 서비스 기준일(checkin/pickup/dropoff/usage/serviceDate 등)을 date 로 추출한다.';

-- 3) 정리 함수
CREATE OR REPLACE FUNCTION public.cleanup_expired_service_notifications()
RETURNS TABLE(
    deleted_notification_count integer,
    deleted_dispatch_log_count integer,
    deleted_payment_notification_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_notification_ids uuid[];
    v_dispatch_ids uuid[];
    v_payment_notification_ids uuid[];
BEGIN
    SELECT COALESCE(array_agg(n.id), ARRAY[]::uuid[])
      INTO v_notification_ids
    FROM public.notifications n
    WHERE public.extract_notification_service_date(n.metadata) IS NOT NULL
      AND public.extract_notification_service_date(n.metadata) < CURRENT_DATE;

    SELECT COALESCE(array_agg(d.id), ARRAY[]::uuid[])
      INTO v_dispatch_ids
    FROM public.notification_dispatch_log d
    WHERE public.extract_notification_service_date(d.payload) IS NOT NULL
      AND public.extract_notification_service_date(d.payload) < CURRENT_DATE;

    SELECT COALESCE(array_agg(pn.id), ARRAY[]::uuid[])
      INTO v_payment_notification_ids
    FROM public.payment_notifications pn
    WHERE pn.notification_date IS NOT NULL
      AND pn.notification_date < CURRENT_DATE;

    IF array_length(v_notification_ids, 1) IS NULL THEN
        deleted_notification_count := 0;
    ELSE
        WITH del AS (
            DELETE FROM public.notifications
             WHERE id = ANY(v_notification_ids)
            RETURNING 1
        )
        SELECT count(*)::int
          INTO deleted_notification_count
        FROM del;
    END IF;

    IF array_length(v_dispatch_ids, 1) IS NULL THEN
        deleted_dispatch_log_count := 0;
    ELSE
        WITH del AS (
            DELETE FROM public.notification_dispatch_log
             WHERE id = ANY(v_dispatch_ids)
            RETURNING 1
        )
        SELECT count(*)::int
          INTO deleted_dispatch_log_count
        FROM del;
    END IF;

    IF array_length(v_payment_notification_ids, 1) IS NULL THEN
        deleted_payment_notification_count := 0;
    ELSE
        WITH del AS (
            DELETE FROM public.payment_notifications
             WHERE id = ANY(v_payment_notification_ids)
            RETURNING 1
        )
        SELECT count(*)::int
          INTO deleted_payment_notification_count
        FROM del;
    END IF;

    RAISE NOTICE '[cleanup_expired_service_notifications] notifications=% dispatch_logs=% payment_notifications=% 삭제 완료',
        deleted_notification_count,
        deleted_dispatch_log_count,
        deleted_payment_notification_count;

    RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.cleanup_expired_service_notifications() IS
'사용일(체크인/픽업/드롭/서비스일 등)이 지난 notifications, dispatch log, payment_notifications 를 자정 배치로 정리한다.';

-- 4) 권한
REVOKE ALL ON FUNCTION public.extract_notification_service_date(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cleanup_expired_service_notifications() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.extract_notification_service_date(jsonb) TO postgres;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_service_notifications() TO postgres;

-- 5) 기존 동일 작업 제거
DO $$
DECLARE
    v_jobid bigint;
BEGIN
    FOR v_jobid IN
        SELECT jobid
          FROM cron.job
         WHERE jobname = 'cleanup_expired_service_notifications_daily'
    LOOP
        PERFORM cron.unschedule(v_jobid);
    END LOOP;
END;
$$;

-- 6) 매일 KST 00:00 (= UTC 15:00) 실행 등록
SELECT cron.schedule(
    'cleanup_expired_service_notifications_daily',
    '0 15 * * *',
    $$ SELECT * FROM public.cleanup_expired_service_notifications(); $$
);

-- =============================================================
-- 검증/수동 실행용
-- =============================================================
-- 1) 등록된 작업 확인
-- SELECT jobid, jobname, schedule, command, active
--   FROM cron.job
--  WHERE jobname = 'cleanup_expired_service_notifications_daily';
--
-- 2) 삭제 대상 미리보기
-- SELECT id, title, category, metadata, created_at
--   FROM public.notifications
--  WHERE public.extract_notification_service_date(metadata) IS NOT NULL
--    AND public.extract_notification_service_date(metadata) < CURRENT_DATE
--  ORDER BY created_at DESC;
--
-- SELECT id, reservation_id, notification_type, notification_date, is_sent
--   FROM public.payment_notifications
--  WHERE notification_date < CURRENT_DATE
--  ORDER BY notification_date DESC;
--
-- 3) 즉시 수동 실행
-- SELECT * FROM public.cleanup_expired_service_notifications();
--
-- 4) 최근 실행 로그 확인
-- SELECT job_pid, status, return_message, start_time, end_time
--   FROM cron.job_run_details
--  WHERE jobid = (
--        SELECT jobid
--          FROM cron.job
--         WHERE jobname = 'cleanup_expired_service_notifications_daily'
--      )
--  ORDER BY start_time DESC
--  LIMIT 20;
