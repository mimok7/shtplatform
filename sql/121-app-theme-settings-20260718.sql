-- 스테이하롱 앱별 계절 테마 설정과 관리자 변경 권한을 추가하는 SQL

BEGIN;

CREATE TABLE IF NOT EXISTS public.app_theme_settings (
  app_id text PRIMARY KEY,
  theme_id text NOT NULL DEFAULT 'default'::text,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT app_theme_settings_app_id_check
    CHECK (
      app_id IN (
        'admin',
        'customer',
        'customer1',
        'manager',
        'manager1',
        'mobile',
        'partner',
        'quote',
        'cancel'
      )
    ),
  CONSTRAINT app_theme_settings_theme_id_check
    CHECK (
      theme_id IN (
        'default',
        'spring',
        'summer',
        'autumn',
        'winter',
        'christmas'
      )
    )
);

ALTER TABLE public.app_theme_settings ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON TABLE public.app_theme_settings TO anon, authenticated;
GRANT INSERT, UPDATE ON TABLE public.app_theme_settings TO authenticated;

DROP POLICY IF EXISTS app_theme_settings_public_select
  ON public.app_theme_settings;
CREATE POLICY app_theme_settings_public_select
  ON public.app_theme_settings
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS app_theme_settings_admin_insert
  ON public.app_theme_settings;
CREATE POLICY app_theme_settings_admin_insert
  ON public.app_theme_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.users AS app_user
      WHERE app_user.id = (SELECT auth.uid())
        AND app_user.role = 'admin'
    )
  );

DROP POLICY IF EXISTS app_theme_settings_admin_update
  ON public.app_theme_settings;
CREATE POLICY app_theme_settings_admin_update
  ON public.app_theme_settings
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.users AS app_user
      WHERE app_user.id = (SELECT auth.uid())
        AND app_user.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.users AS app_user
      WHERE app_user.id = (SELECT auth.uid())
        AND app_user.role = 'admin'
    )
  );

WITH source_rows AS (
  SELECT *
  FROM (
    VALUES
      ('admin'::text, 'default'::text),
      ('customer'::text, 'default'::text),
      ('customer1'::text, 'default'::text),
      ('manager'::text, 'default'::text),
      ('manager1'::text, 'default'::text),
      ('mobile'::text, 'default'::text),
      ('partner'::text, 'default'::text),
      ('quote'::text, 'default'::text),
      ('cancel'::text, 'default'::text)
  ) AS rows(app_id, theme_id)
),
inserted_rows AS (
  INSERT INTO public.app_theme_settings (
    app_id,
    theme_id
  )
  SELECT
    source_rows.app_id,
    source_rows.theme_id
  FROM source_rows
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.app_theme_settings AS existing
    WHERE existing.app_id = source_rows.app_id
  )
  RETURNING
    app_id,
    theme_id,
    updated_at
)
SELECT
  app_id,
  theme_id,
  updated_at
FROM inserted_rows
ORDER BY app_id;

COMMIT;

SELECT
  app_id,
  theme_id,
  updated_by,
  updated_at
FROM public.app_theme_settings
ORDER BY app_id;
