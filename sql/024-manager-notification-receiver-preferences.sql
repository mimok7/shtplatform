CREATE TABLE IF NOT EXISTS public.manager_notification_receiver_preferences (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  preferred_device_id text NOT NULL,
  preferred_device_label text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.manager_notification_receiver_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS manager_notification_receiver_preferences_select_own ON public.manager_notification_receiver_preferences;
CREATE POLICY manager_notification_receiver_preferences_select_own
  ON public.manager_notification_receiver_preferences
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
      AND u.role IN ('manager', 'admin')
    )
  );

DROP POLICY IF EXISTS manager_notification_receiver_preferences_insert_own ON public.manager_notification_receiver_preferences;
CREATE POLICY manager_notification_receiver_preferences_insert_own
  ON public.manager_notification_receiver_preferences
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
      AND u.role IN ('manager', 'admin')
    )
  );

DROP POLICY IF EXISTS manager_notification_receiver_preferences_update_own ON public.manager_notification_receiver_preferences;
CREATE POLICY manager_notification_receiver_preferences_update_own
  ON public.manager_notification_receiver_preferences
  FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
      AND u.role IN ('manager', 'admin')
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
      AND u.role IN ('manager', 'admin')
    )
  );

DROP POLICY IF EXISTS manager_notification_receiver_preferences_delete_own ON public.manager_notification_receiver_preferences;
CREATE POLICY manager_notification_receiver_preferences_delete_own
  ON public.manager_notification_receiver_preferences
  FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
      AND u.role IN ('manager', 'admin')
    )
  );