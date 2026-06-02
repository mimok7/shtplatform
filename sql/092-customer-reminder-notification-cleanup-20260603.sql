-- ============================================================
-- 092: 고객 사전알림 데이터 5일 보관 후 정리 쿼리
-- 생성일: 2026-06-03
-- 목적:
--   - notifications(category=customer_reminder) 5일 초과 데이터 삭제
--   - notification_dispatch_log(event_key=customer_pre_reminder) 5일 초과 데이터 삭제
-- 적용: Supabase Dashboard -> SQL Editor (수동 실행용)
-- ============================================================

BEGIN;

-- 1) 정리 성능 보강 인덱스
CREATE INDEX IF NOT EXISTS idx_notifications_category_created_at
  ON public.notifications(category, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_dispatch_log_event_created_at
  ON public.notification_dispatch_log(event_key, created_at DESC);

-- 2) 삭제 대상 집계 (검증)
-- SELECT COUNT(*) AS target_notifications
-- FROM public.notifications
-- WHERE category = 'customer_reminder'
--   AND created_at < NOW() - INTERVAL '5 days';
--
-- SELECT COUNT(*) AS target_dispatch_logs
-- FROM public.notification_dispatch_log
-- WHERE event_key = 'customer_pre_reminder'
--   AND created_at < NOW() - INTERVAL '5 days';

-- 3) 삭제 실행
DELETE FROM public.notifications
WHERE category = 'customer_reminder'
  AND created_at < NOW() - INTERVAL '5 days';

DELETE FROM public.notification_dispatch_log
WHERE event_key = 'customer_pre_reminder'
  AND created_at < NOW() - INTERVAL '5 days';

COMMIT;

-- ============================================================
-- 참고:
--   - notifications 삭제 시 notification_reads는 FK ON DELETE CASCADE로 함께 정리됨
--   - 자동 실행은 admin 앱 크론(/api/cron/customer-reminder-cleanup)에서 수행
-- ============================================================
