-- =============================================================
-- 094: 프로그램 수정 신청/완료 알림 설정
-- 생성일: 2026-06-06
-- 목적:
--   1) admin/reservation-settings 에 프로그램 수정 신청/완료 이벤트 노출
--   2) 모바일 알림 기본 허용 설정 생성
-- =============================================================

BEGIN;

INSERT INTO public.notification_apps (app_name, app_label, description, sort_order)
VALUES ('admin', '어드민 앱', '관리자 전용 앱', 5)
ON CONFLICT (app_name) DO UPDATE SET
  app_label = EXCLUDED.app_label,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order;

INSERT INTO public.notification_event_types (
  event_key,
  event_label,
  description,
  default_title,
  default_body,
  default_url,
  default_priority,
  is_active,
  sort_order
)
VALUES
  (
    'program_update_requested',
    '프로그램 수정 신청',
    '프로그램 수정 요청이 새로 등록될 때 모바일 알림에 표시되는 알림',
    '프로그램 수정 신청',
    '새 프로그램 수정 요청이 등록되었습니다.',
    'https://newmobile.stayhalong.com/program-updates',
    'high',
    TRUE,
    270
  ),
  (
    'program_update_completed',
    '프로그램 수정 완료',
    '프로그램 수정 요청이 완료 처리될 때 모바일 알림에 표시되는 알림',
    '프로그램 수정 완료',
    '프로그램 수정 요청이 완료되었습니다.',
    'https://newmobile.stayhalong.com/program-updates',
    'normal',
    TRUE,
    271
  )
ON CONFLICT (event_key) DO UPDATE SET
  event_label = EXCLUDED.event_label,
  description = EXCLUDED.description,
  default_title = EXCLUDED.default_title,
  default_body = EXCLUDED.default_body,
  default_url = EXCLUDED.default_url,
  default_priority = EXCLUDED.default_priority,
  is_active = EXCLUDED.is_active,
  sort_order = EXCLUDED.sort_order;

INSERT INTO public.notification_app_event_settings (app_name, event_key, enabled)
VALUES
  ('mobile', 'program_update_requested', TRUE),
  ('mobile', 'program_update_completed', TRUE),
  ('admin', 'program_update_requested', FALSE),
  ('admin', 'program_update_completed', FALSE),
  ('manager', 'program_update_requested', FALSE),
  ('manager', 'program_update_completed', FALSE),
  ('manager1', 'program_update_requested', FALSE),
  ('manager1', 'program_update_completed', FALSE),
  ('partner', 'program_update_requested', FALSE),
  ('partner', 'program_update_completed', FALSE),
  ('quote', 'program_update_requested', FALSE),
  ('quote', 'program_update_completed', FALSE),
  ('customer', 'program_update_requested', FALSE),
  ('customer', 'program_update_completed', FALSE)
ON CONFLICT (app_name, event_key) DO UPDATE SET
  enabled = EXCLUDED.enabled,
  updated_at = NOW();

COMMIT;

-- 검증 예시
-- SELECT event_key, event_label, default_url
-- FROM public.notification_event_types
-- WHERE event_key LIKE 'program_update_%';
--
-- SELECT app_name, event_key, enabled
-- FROM public.notification_app_event_settings
-- WHERE event_key LIKE 'program_update_%'
-- ORDER BY app_name, event_key;
