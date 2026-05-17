-- =============================================================
-- 082: SHT car low-seat warning notification setup
-- 목적:
-- 1) 예약설정(notification_event_types)에 신규 알림 유형 추가
-- 2) 관리자/매니저/모바일 앱 기본 허용 매핑 생성
-- 3) 중복 발송 방지를 위한 dispatch 로그 테이블 생성
-- =============================================================

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
  'sht_car_low_seat_warning',
  '스하차량 취소 알림',
  '픽업일 5일 전 기준 차량 좌석이 1~4석인 건을 운영자에게 알림',
  '스하차량 취소 위험 알림',
  '픽업일 5일 전 기준 5석 미만 차량이 있습니다. 확인해 주세요.',
  'https://manager.staycruise.kr/manager/reservations',
  'high',
  TRUE,
  60
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

INSERT INTO public.notification_app_event_settings (
  app_name,
  event_key,
  enabled
)
SELECT app_name, 'sht_car_low_seat_warning', TRUE
FROM public.notification_apps
WHERE app_name IN ('manager', 'manager1', 'mobile')
ON CONFLICT (app_name, event_key) DO UPDATE SET
  enabled = EXCLUDED.enabled,
  updated_at = NOW();

CREATE TABLE IF NOT EXISTS public.notification_dispatch_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key TEXT NOT NULL,
  dedupe_key TEXT NOT NULL,
  payload JSONB,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_key, dedupe_key)
);

CREATE INDEX IF NOT EXISTS idx_notification_dispatch_log_event_sent
  ON public.notification_dispatch_log(event_key, sent_at DESC);
