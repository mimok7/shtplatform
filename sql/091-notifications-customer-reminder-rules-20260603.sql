-- ============================================================
-- 091: 고객 사전알림 DB 저장 + 푸시 이벤트 키 추가
-- 생성일: 2026-06-03
-- 목적:
--   1) customer_reminder_rules 테이블 신설 (JSON 대체)
--   2) customer_pre_reminder 이벤트 키 추가
--   3) 앱별 이벤트 허용 설정(customer=true) 시드
-- 적용: Supabase Dashboard -> SQL Editor
-- ============================================================

BEGIN;

-- 1) 고객 사전알림 규칙 테이블
CREATE TABLE IF NOT EXISTS public.customer_reminder_rules (
  id TEXT PRIMARY KEY,
  service_type TEXT NOT NULL CHECK (service_type IN ('cruise', 'airport', 'rentcar', 'hotel', 'tour', 'ticket', 'package')),
  date_basis TEXT NOT NULL CHECK (date_basis IN ('checkin', 'pickup', 'dropoff', 'rentcar_pickup', 'rentcar_return', 'usage', 'start')),
  label TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  days_before INTEGER NOT NULL DEFAULT 3 CHECK (days_before >= 0 AND days_before <= 30),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 100,
  updated_by UUID NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_reminder_rules_enabled_sort
  ON public.customer_reminder_rules(enabled, sort_order);

-- 2) 기존 JSON 기본값에 맞춘 규칙 시드
INSERT INTO public.customer_reminder_rules (
  id, service_type, date_basis, label, enabled, days_before, title, body, sort_order, updated_at, created_at
)
VALUES
  (
    'cruise_checkin',
    'cruise',
    'checkin',
    '크루즈 체크인 안내',
    TRUE,
    3,
    '🚢 크루즈 체크인 {days}일 전 안내',
    '{date} 체크인 예정입니다. 예약 정보를 다시 확인해 주세요.',
    10,
    NOW(),
    NOW()
  ),
  (
    'airport_service',
    'airport',
    'pickup',
    '공항 픽업/샌딩 안내',
    TRUE,
    3,
    '✈️ 공항 서비스 {days}일 전 안내',
    '{date} 공항 서비스 이용 예정입니다. 항공편/미팅포인트를 확인해 주세요.',
    20,
    NOW(),
    NOW()
  ),
  (
    'rentcar_service',
    'rentcar',
    'rentcar_pickup',
    '렌트카 이용 안내',
    TRUE,
    3,
    '🚗 렌트카 이용 {days}일 전 안내',
    '{date} 차량 이용 예정입니다. 승차 위치를 확인해 주세요.',
    30,
    NOW(),
    NOW()
  ),
  (
    'hotel_checkin',
    'hotel',
    'checkin',
    '호텔 체크인 안내',
    TRUE,
    3,
    '🏨 호텔 체크인 {days}일 전 안내',
    '{date} 체크인 예정입니다. 숙소 정보를 확인해 주세요.',
    40,
    NOW(),
    NOW()
  ),
  (
    'tour_service',
    'tour',
    'usage',
    '투어 이용 안내',
    TRUE,
    3,
    '🎫 투어 이용 {days}일 전 안내',
    '{date} 투어 이용 예정입니다. 픽업 시간을 확인해 주세요.',
    50,
    NOW(),
    NOW()
  ),
  (
    'ticket_service',
    'ticket',
    'usage',
    '티켓 이용 안내',
    TRUE,
    3,
    '🎟️ 티켓 이용 {days}일 전 안내',
    '{date} 티켓 사용 예정입니다. 사용처와 시간을 확인해 주세요.',
    60,
    NOW(),
    NOW()
  ),
  (
    'package_service',
    'package',
    'start',
    '패키지 일정 안내',
    TRUE,
    3,
    '📦 패키지 일정 {days}일 전 안내',
    '{date} 패키지 일정이 시작됩니다. 전체 일정을 확인해 주세요.',
    70,
    NOW(),
    NOW()
  )
ON CONFLICT (id) DO NOTHING;

-- 3) 푸시 이벤트 키 추가 (고객 사전알림 공통 키)
INSERT INTO public.notification_event_types (
  event_key,
  event_label,
  description,
  default_title,
  default_body,
  default_url,
  default_priority,
  is_active,
  sort_order,
  updated_at
)
VALUES (
  'customer_pre_reminder',
  '고객 사전알림',
  '고객 예약 서비스 일정 N일 전 사전안내 푸시',
  '서비스 일정 안내',
  '예약하신 서비스 일정이 가까워졌습니다.',
  '/mypage/notifications',
  'normal',
  TRUE,
  310,
  NOW()
)
ON CONFLICT (event_key) DO UPDATE
SET
  event_label = EXCLUDED.event_label,
  description = EXCLUDED.description,
  default_title = EXCLUDED.default_title,
  default_body = EXCLUDED.default_body,
  default_url = EXCLUDED.default_url,
  default_priority = EXCLUDED.default_priority,
  is_active = EXCLUDED.is_active,
  sort_order = EXCLUDED.sort_order,
  updated_at = NOW();

-- 4) 앱별 허용 설정: customer만 기본 허용
INSERT INTO public.notification_app_event_settings (
  app_name,
  event_key,
  enabled,
  updated_at,
  created_at
)
SELECT
  app.app_name,
  'customer_pre_reminder',
  CASE WHEN app.app_name = 'customer' THEN TRUE ELSE FALSE END,
  NOW(),
  NOW()
FROM public.notification_apps app
ON CONFLICT (app_name, event_key) DO UPDATE
SET
  enabled = EXCLUDED.enabled,
  updated_at = NOW();

-- 5) dedupe 성능 인덱스 보강
CREATE INDEX IF NOT EXISTS idx_notification_dispatch_log_event_dedupe
  ON public.notification_dispatch_log(event_key, dedupe_key, created_at DESC);

COMMIT;

-- ============================================================
-- 검증 쿼리
-- ============================================================
-- SELECT * FROM public.customer_reminder_rules ORDER BY sort_order;
-- SELECT event_key, event_label, is_active
-- FROM public.notification_event_types
-- WHERE event_key = 'customer_pre_reminder';
-- SELECT app_name, enabled
-- FROM public.notification_app_event_settings
-- WHERE event_key = 'customer_pre_reminder'
-- ORDER BY app_name;
