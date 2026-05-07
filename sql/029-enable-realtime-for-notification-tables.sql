-- 029-enable-realtime-for-notification-tables.sql
-- 작성일: 2026-05-07
-- 목적: 알림 제어 시스템(/admin/notification-control)이 정확하게 작동하기 위해
--       supabase_realtime publication 에 필요한 4개 테이블을 등록한다.
--
-- 누락 시 증상:
--  - admin이 ON/OFF를 변경해도 매니저 앱이 즉시 반영하지 못함
--  - 새 예약이 들어와도 매니저 앱에서 실시간 알림이 발생하지 않음
--  - admin 페이지에서 매니저 접속 현황이 갱신되지 않음
--  - 알림 수신 기기 변경이 매니저 앱에 즉시 적용되지 않음
--
-- 멱등(idempotent): 이미 등록된 테이블은 NOTICE 만 표시되고 오류 없이 통과한다.

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notification_runtime_settings;
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'notification_runtime_settings already in supabase_realtime';
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.manager_notification_receiver_preferences;
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'manager_notification_receiver_preferences already in supabase_realtime';
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.manager_notification_presence;
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'manager_notification_presence already in supabase_realtime';
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.reservation;
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'reservation already in supabase_realtime';
  END;
END
$$;

-- 검증 쿼리:
-- SELECT tablename FROM pg_publication_tables
-- WHERE pubname = 'supabase_realtime'
--   AND tablename IN (
--     'notification_runtime_settings',
--     'manager_notification_presence',
--     'manager_notification_receiver_preferences',
--     'reservation'
--   );
