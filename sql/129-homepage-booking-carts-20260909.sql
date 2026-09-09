-- 홈페이지 예약 선택 초안을 플랫폼 DB에 비공개로 보관한다.

BEGIN;

CREATE TABLE IF NOT EXISTS public.homepage_booking_carts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (btrim(status) <> ''),
  items jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(items) = 'array'),
  item_count integer NOT NULL DEFAULT 0 CHECK (item_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS homepage_booking_carts_user_updated_idx
  ON public.homepage_booking_carts (platform_user_id, updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS homepage_booking_carts_one_per_user_idx
  ON public.homepage_booking_carts (platform_user_id);

ALTER TABLE public.homepage_booking_carts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.homepage_booking_carts FROM anon, authenticated;

COMMIT;

-- 적용 확인.
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'homepage_booking_carts'
ORDER BY ordinal_position;

SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'homepage_booking_carts'
ORDER BY indexname;

SELECT
  tablename,
  rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename = 'homepage_booking_carts';
