DROP POLICY IF EXISTS manager_notification_receiver_preferences_select_own ON public.manager_notification_receiver_preferences;
CREATE POLICY manager_notification_receiver_preferences_select_own
  ON public.manager_notification_receiver_preferences
  FOR SELECT
  TO authenticated
  USING (
    (user_id = auth.uid() AND EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
      AND u.role IN ('manager', 'admin')
    ))
    OR (SELECT auth.uid() IN (
      SELECT u.id
      FROM public.users u
      WHERE u.role = 'admin'
    ))
  );

DROP POLICY IF EXISTS manager_notification_receiver_preferences_insert_own ON public.manager_notification_receiver_preferences;
CREATE POLICY manager_notification_receiver_preferences_insert_own
  ON public.manager_notification_receiver_preferences
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (user_id = auth.uid() AND EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
      AND u.role IN ('manager', 'admin')
    ))
    OR (SELECT auth.uid() IN (
      SELECT u.id
      FROM public.users u
      WHERE u.role = 'admin'
    ))
  );

DROP POLICY IF EXISTS manager_notification_receiver_preferences_update_own ON public.manager_notification_receiver_preferences;
CREATE POLICY manager_notification_receiver_preferences_update_own
  ON public.manager_notification_receiver_preferences
  FOR UPDATE
  TO authenticated
  USING (
    (user_id = auth.uid() AND EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
      AND u.role IN ('manager', 'admin')
    ))
    OR (SELECT auth.uid() IN (
      SELECT u.id
      FROM public.users u
      WHERE u.role = 'admin'
    ))
  )
  WITH CHECK (
    (user_id = auth.uid() AND EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
      AND u.role IN ('manager', 'admin')
    ))
    OR (SELECT auth.uid() IN (
      SELECT u.id
      FROM public.users u
      WHERE u.role = 'admin'
    ))
  );

DROP POLICY IF EXISTS manager_notification_receiver_preferences_delete_own ON public.manager_notification_receiver_preferences;
CREATE POLICY manager_notification_receiver_preferences_delete_own
  ON public.manager_notification_receiver_preferences
  FOR DELETE
  TO authenticated
  USING (
    (user_id = auth.uid() AND EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
      AND u.role IN ('manager', 'admin')
    ))
    OR (SELECT auth.uid() IN (
      SELECT u.id
      FROM public.users u
      WHERE u.role = 'admin'
    ))
  );
