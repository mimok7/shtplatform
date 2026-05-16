-- =============================================================
-- 081: App push notification settings and event type templates
-- =============================================================
-- Run in Supabase Dashboard -> SQL Editor
-- Created: 2026-05-16

CREATE TABLE IF NOT EXISTS public.notification_apps (
  app_name TEXT PRIMARY KEY,
  app_label TEXT NOT NULL,
  description TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 100,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.notification_event_types (
  event_key TEXT PRIMARY KEY,
  event_label TEXT NOT NULL,
  description TEXT,
  default_title TEXT,
  default_body TEXT,
  default_url TEXT,
  default_priority TEXT NOT NULL DEFAULT 'normal'
    CHECK (default_priority IN ('low', 'normal', 'high', 'urgent')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 100,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.notification_app_event_settings (
  app_name TEXT NOT NULL REFERENCES public.notification_apps(app_name) ON DELETE CASCADE,
  event_key TEXT NOT NULL REFERENCES public.notification_event_types(event_key) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (app_name, event_key)
);

CREATE INDEX IF NOT EXISTS idx_notification_apps_enabled
  ON public.notification_apps(enabled);

CREATE INDEX IF NOT EXISTS idx_notification_event_types_active
  ON public.notification_event_types(is_active);

CREATE INDEX IF NOT EXISTS idx_notification_app_event_settings_event
  ON public.notification_app_event_settings(event_key, enabled);

ALTER TABLE public.notification_apps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_event_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_app_event_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notification_apps_admin_select ON public.notification_apps;
CREATE POLICY notification_apps_admin_select
  ON public.notification_apps
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
      AND u.role = 'admin'
    )
  );

DROP POLICY IF EXISTS notification_apps_admin_write ON public.notification_apps;
CREATE POLICY notification_apps_admin_write
  ON public.notification_apps
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
      AND u.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
      AND u.role = 'admin'
    )
  );

DROP POLICY IF EXISTS notification_event_types_admin_select ON public.notification_event_types;
CREATE POLICY notification_event_types_admin_select
  ON public.notification_event_types
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
      AND u.role = 'admin'
    )
  );

DROP POLICY IF EXISTS notification_event_types_admin_write ON public.notification_event_types;
CREATE POLICY notification_event_types_admin_write
  ON public.notification_event_types
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
      AND u.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
      AND u.role = 'admin'
    )
  );

DROP POLICY IF EXISTS notification_app_event_settings_admin_select ON public.notification_app_event_settings;
CREATE POLICY notification_app_event_settings_admin_select
  ON public.notification_app_event_settings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
      AND u.role = 'admin'
    )
  );

DROP POLICY IF EXISTS notification_app_event_settings_admin_write ON public.notification_app_event_settings;
CREATE POLICY notification_app_event_settings_admin_write
  ON public.notification_app_event_settings
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
      AND u.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
      AND u.role = 'admin'
    )
  );

INSERT INTO public.notification_apps (app_name, app_label, description, sort_order)
VALUES
  ('customer', '고객 앱', '고객 마이페이지 및 예약 확인용 앱', 10),
  ('manager', '매니저 앱', '운영 매니저 앱', 20),
  ('manager1', '매니저1 앱', '신규 운영 매니저 앱', 30),
  ('partner', '파트너 앱', '제휴/파트너용 앱', 40),
  ('mobile', '모바일 앱', '모바일 전용 앱', 50),
  ('quote', '견적 앱', '견적 전용 앱', 60)
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
  sort_order
)
VALUES
  ('reservation_realtime', '예약 실시간', '예약 생성 시 운영 앱에 즉시 표시되는 알림', '새 예약이 접수되었습니다', '새 예약이 들어왔습니다.', 'https://staycruise.kr/manager/reservations', 'high', 10),
  ('checkin_reminder', '체크인 리마인더', '체크인 임박 예약 안내', '체크인 예정 알림', '체크인 예정 예약을 확인해 주세요.', 'https://staycruise.kr/manager/notifications', 'normal', 20),
  ('payment_due', '결제기한', '결제 예정일 도래 안내', '결제 예정 알림', '결제 예정 건을 확인해 주세요.', 'https://staycruise.kr/manager/payments', 'high', 30),
  ('payment_overdue', '결제연체', '결제 기한 초과 안내', '결제 연체 알림', '결제 연체 건을 확인해 주세요.', 'https://staycruise.kr/manager/payments', 'urgent', 40),
  ('manual_customer', '수동 고객알림', '관리자가 고객에게 직접 발송하는 알림', '알림이 도착했습니다', '스테이하롱에서 보낸 알림입니다.', 'https://staycruise.kr/mypage/notifications', 'normal', 50)
ON CONFLICT (event_key) DO UPDATE SET
  event_label = EXCLUDED.event_label,
  description = EXCLUDED.description,
  default_title = EXCLUDED.default_title,
  default_body = EXCLUDED.default_body,
  default_url = EXCLUDED.default_url,
  default_priority = EXCLUDED.default_priority,
  sort_order = EXCLUDED.sort_order;

INSERT INTO public.notification_app_event_settings (app_name, event_key, enabled)
SELECT app.app_name, event.event_key, TRUE
FROM public.notification_apps app
CROSS JOIN public.notification_event_types event
ON CONFLICT (app_name, event_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.admin_get_push_subscription_app_counts()
RETURNS TABLE (
  app_name TEXT,
  total_count BIGINT,
  active_count BIGINT
)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT
    COALESCE(ps.app_name, 'unknown')::TEXT AS app_name,
    COUNT(*)::BIGINT AS total_count,
    COUNT(*) FILTER (WHERE ps.is_active IS TRUE)::BIGINT AS active_count
  FROM public.push_subscriptions ps
  WHERE EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
    AND u.role = 'admin'
  )
  GROUP BY COALESCE(ps.app_name, 'unknown')
  ORDER BY COALESCE(ps.app_name, 'unknown');
$$;

REVOKE ALL ON FUNCTION public.admin_get_push_subscription_app_counts() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_get_push_subscription_app_counts() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_push_subscription_app_counts() TO authenticated;
