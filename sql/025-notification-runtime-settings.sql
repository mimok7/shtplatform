CREATE TABLE IF NOT EXISTS public.notification_runtime_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value_bool BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.notification_runtime_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notification_runtime_settings_select_authenticated ON public.notification_runtime_settings;
CREATE POLICY notification_runtime_settings_select_authenticated
  ON public.notification_runtime_settings
  FOR SELECT
  TO authenticated
  USING (TRUE);

DROP POLICY IF EXISTS notification_runtime_settings_admin_insert ON public.notification_runtime_settings;
CREATE POLICY notification_runtime_settings_admin_insert
  ON public.notification_runtime_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT auth.uid() IN (
      SELECT u.id
      FROM public.users u
      WHERE u.role = 'admin'
    ))
  );

DROP POLICY IF EXISTS notification_runtime_settings_admin_update ON public.notification_runtime_settings;
CREATE POLICY notification_runtime_settings_admin_update
  ON public.notification_runtime_settings
  FOR UPDATE
  TO authenticated
  USING (
    (SELECT auth.uid() IN (
      SELECT u.id
      FROM public.users u
      WHERE u.role = 'admin'
    ))
  )
  WITH CHECK (
    (SELECT auth.uid() IN (
      SELECT u.id
      FROM public.users u
      WHERE u.role = 'admin'
    ))
  );

DROP POLICY IF EXISTS notification_runtime_settings_admin_delete ON public.notification_runtime_settings;
CREATE POLICY notification_runtime_settings_admin_delete
  ON public.notification_runtime_settings
  FOR DELETE
  TO authenticated
  USING (
    (SELECT auth.uid() IN (
      SELECT u.id
      FROM public.users u
      WHERE u.role = 'admin'
    ))
  );

INSERT INTO public.notification_runtime_settings (setting_key, setting_value_bool)
VALUES ('reservation_realtime_enabled', TRUE)
ON CONFLICT (setting_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.manager_notification_presence (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  app_name TEXT NOT NULL,
  tab_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  device_label TEXT,
  is_leader BOOLEAN NOT NULL DEFAULT FALSE,
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, app_name, tab_id)
);

CREATE INDEX IF NOT EXISTS idx_manager_notification_presence_last_seen
  ON public.manager_notification_presence(last_seen DESC);

ALTER TABLE public.manager_notification_presence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS manager_notification_presence_select ON public.manager_notification_presence;
CREATE POLICY manager_notification_presence_select
  ON public.manager_notification_presence
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR (SELECT auth.uid() IN (
      SELECT u.id
      FROM public.users u
      WHERE u.role = 'admin'
    ))
  );

DROP POLICY IF EXISTS manager_notification_presence_insert ON public.manager_notification_presence;
CREATE POLICY manager_notification_presence_insert
  ON public.manager_notification_presence
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR (SELECT auth.uid() IN (
      SELECT u.id
      FROM public.users u
      WHERE u.role = 'admin'
    ))
  );

DROP POLICY IF EXISTS manager_notification_presence_update ON public.manager_notification_presence;
CREATE POLICY manager_notification_presence_update
  ON public.manager_notification_presence
  FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR (SELECT auth.uid() IN (
      SELECT u.id
      FROM public.users u
      WHERE u.role = 'admin'
    ))
  )
  WITH CHECK (
    user_id = auth.uid()
    OR (SELECT auth.uid() IN (
      SELECT u.id
      FROM public.users u
      WHERE u.role = 'admin'
    ))
  );

DROP POLICY IF EXISTS manager_notification_presence_delete ON public.manager_notification_presence;
CREATE POLICY manager_notification_presence_delete
  ON public.manager_notification_presence
  FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR (SELECT auth.uid() IN (
      SELECT u.id
      FROM public.users u
      WHERE u.role = 'admin'
    ))
  );
