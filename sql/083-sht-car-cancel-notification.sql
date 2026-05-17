-- =============================================================
-- 083: SHT car cancel notification setup
-- 목적:
-- 1) 어드민 예약설정에 "스하차량 취소 알림" 신규 이벤트 등록
-- 2) 관리자/매니저/매니저1/모바일 앱 기본 허용 매핑 생성
-- 3) admin 앱이 푸시 수신 대상이 되도록 notification_apps에 admin 추가
-- 실행: Supabase Dashboard -> SQL Editor
-- =============================================================

-- 0) admin 앱 등록 (notification_apps 에 누락된 경우 추가)
INSERT INTO public.notification_apps (app_name, app_label, description, sort_order)
VALUES ('admin', '어드민 앱', '관리자 전용 앱', 5)
ON CONFLICT (app_name) DO UPDATE SET
  app_label = EXCLUDED.app_label,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order;

-- 1) 신규 알림 유형 등록
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
VALUES (
  'sht_car_cancel',
  '스하차량 취소',
  '스하차량(reservation_car_sht) 행이 취소/삭제될 때 발송되는 알림',
  '스하차량 취소 알림',
  '스하차량 예약이 취소되었습니다. 좌석 배정을 확인해 주세요.',
  'https://manager.staycruise.kr/manager/sht-car',
  'high',
  TRUE,
  61
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

-- 2) 기본 허용 매핑 (운영 앱들)
INSERT INTO public.notification_app_event_settings (app_name, event_key, enabled)
SELECT app_name, 'sht_car_cancel', TRUE
FROM public.notification_apps
WHERE app_name IN ('admin', 'manager', 'manager1', 'mobile')
ON CONFLICT (app_name, event_key) DO UPDATE SET
  enabled = EXCLUDED.enabled,
  updated_at = NOW();

-- 3) admin 앱이 기존 이벤트들도 받을 수 있도록 누락 매핑 채우기 (enabled=TRUE 기본)
INSERT INTO public.notification_app_event_settings (app_name, event_key, enabled)
SELECT 'admin', event.event_key, TRUE
FROM public.notification_event_types event
ON CONFLICT (app_name, event_key) DO NOTHING;
