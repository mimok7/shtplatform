-- ============================================================
-- 093: 지난 고객 사전알림 즉시 정리
-- 생성일: 2026-06-07
-- 목적:
--   - 서비스일이 지난 customer_reminder 알림 즉시 삭제
--   - 같은 serviceDate 기준 dispatch log도 함께 정리
-- 참고:
--   - "시간이 지나면 자동 삭제"는 DB 트리거만으로는 처리되지 않음
--   - 자정 경과 정리는 크론/스케줄러가 함께 필요
-- ============================================================

BEGIN;

DELETE FROM public.notifications
WHERE category = 'customer_reminder'
  AND COALESCE(metadata->>'serviceDate', '') ~ '^\d{4}-\d{2}-\d{2}$'
  AND (metadata->>'serviceDate') < CURRENT_DATE::text;

DELETE FROM public.notification_dispatch_log
WHERE event_key = 'customer_pre_reminder'
  AND COALESCE(payload->>'serviceDate', '') ~ '^\d{4}-\d{2}-\d{2}$'
  AND (payload->>'serviceDate') < CURRENT_DATE::text;

COMMIT;
