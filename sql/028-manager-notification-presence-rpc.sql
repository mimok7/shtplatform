CREATE OR REPLACE FUNCTION public.upsert_manager_notification_presence(
  p_app_name TEXT,
  p_tab_id TEXT,
  p_device_id TEXT,
  p_device_label TEXT,
  p_is_leader BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = v_user_id
      AND u.role IN ('manager', 'admin')
  ) THEN
    RAISE EXCEPTION 'not_manager_or_admin';
  END IF;

  INSERT INTO public.manager_notification_presence (
    user_id,
    app_name,
    tab_id,
    device_id,
    device_label,
    is_leader,
    last_seen
  ) VALUES (
    v_user_id,
    p_app_name,
    p_tab_id,
    p_device_id,
    p_device_label,
    COALESCE(p_is_leader, FALSE),
    NOW()
  )
  ON CONFLICT (user_id, app_name, tab_id)
  DO UPDATE SET
    device_id = EXCLUDED.device_id,
    device_label = EXCLUDED.device_label,
    is_leader = EXCLUDED.is_leader,
    last_seen = NOW();
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_manager_notification_presence(
  p_app_name TEXT,
  p_tab_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  DELETE FROM public.manager_notification_presence
  WHERE user_id = v_user_id
    AND app_name = p_app_name
    AND tab_id = p_tab_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_manager_notification_presence(TEXT, TEXT, TEXT, TEXT, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_manager_notification_presence(TEXT, TEXT, TEXT, TEXT, BOOLEAN) FROM anon;
GRANT EXECUTE ON FUNCTION public.upsert_manager_notification_presence(TEXT, TEXT, TEXT, TEXT, BOOLEAN) TO authenticated;

REVOKE ALL ON FUNCTION public.delete_manager_notification_presence(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_manager_notification_presence(TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_manager_notification_presence(TEXT, TEXT) TO authenticated;
