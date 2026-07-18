-- 앱별 테마 글씨 크기 설정을 저장하는 컬럼을 추가한다.

BEGIN;

ALTER TABLE public.app_theme_settings
  ADD COLUMN IF NOT EXISTS typography jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.app_theme_settings
  DROP CONSTRAINT IF EXISTS app_theme_settings_typography_object_check;
ALTER TABLE public.app_theme_settings
  ADD CONSTRAINT app_theme_settings_typography_object_check
  CHECK (jsonb_typeof(typography) = 'object');

COMMIT;

SELECT
  app_id,
  theme_id,
  typography,
  updated_by,
  updated_at
FROM public.app_theme_settings
ORDER BY app_id;
