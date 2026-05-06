CREATE OR REPLACE FUNCTION public.admin_get_manager_notification_status()
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  name TEXT,
  nickname TEXT,
  role TEXT,
  preferred_device_id TEXT,
  preferred_device_label TEXT,
  preference_updated_at TIMESTAMPTZ,
  app_name TEXT,
  tab_id TEXT,
  device_id TEXT,
  device_label TEXT,
  is_leader BOOLEAN,
  last_seen TIMESTAMPTZ,
  is_active BOOLEAN
)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT
    u.id AS user_id,
    u.email::TEXT AS email,
    u.name::TEXT AS name,
    u.nickname::TEXT AS nickname,
    u.role::TEXT AS role,
    pref.preferred_device_id::TEXT AS preferred_device_id,
    pref.preferred_device_label::TEXT AS preferred_device_label,
    pref.updated_at AS preference_updated_at,
    presence.app_name::TEXT AS app_name,
    presence.tab_id::TEXT AS tab_id,
    presence.device_id::TEXT AS device_id,
    presence.device_label::TEXT AS device_label,
    COALESCE(presence.is_leader, FALSE) AS is_leader,
    presence.last_seen,
    (presence.last_seen >= NOW() - INTERVAL '90 seconds') AS is_active
  FROM public.users u
  LEFT JOIN public.manager_notification_receiver_preferences pref
    ON pref.user_id = u.id
  LEFT JOIN public.manager_notification_presence presence
    ON presence.user_id = u.id
    AND presence.last_seen >= NOW() - INTERVAL '90 seconds'
  WHERE u.role IN ('manager', 'admin')
    AND (SELECT auth.uid() IN (
      SELECT admin_user.id
      FROM public.users admin_user
      WHERE admin_user.role = 'admin'
    ))
  ORDER BY
    CASE WHEN presence.last_seen IS NULL THEN 1 ELSE 0 END,
    presence.last_seen DESC NULLS LAST,
    u.email ASC;
$$;

REVOKE ALL ON FUNCTION public.admin_get_manager_notification_status() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_get_manager_notification_status() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_manager_notification_status() TO authenticated;
