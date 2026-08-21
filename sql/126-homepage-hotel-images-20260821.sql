-- 홈페이지 호텔 대표·호텔·객실 이미지를 저장하는 테이블을 추가한다.

BEGIN;

CREATE TABLE IF NOT EXISTS public.homepage_hotel_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection text NOT NULL CHECK (collection IN ('hotel_import', 'hotel_gallery', 'room_gallery')),
  hotel_code text NOT NULL,
  hotel_price_code text,
  source_url text,
  source_image_url text,
  image_name text,
  image_url text NOT NULL,
  storage_bucket text,
  storage_path text,
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT homepage_hotel_images_room_collection_ck
    CHECK (
      (collection = 'room_gallery' AND hotel_price_code IS NOT NULL)
      OR (collection IN ('hotel_import', 'hotel_gallery') AND hotel_price_code IS NULL)
    ),
  UNIQUE (collection, image_url)
);

CREATE INDEX IF NOT EXISTS homepage_hotel_images_hotel_lookup_idx
  ON public.homepage_hotel_images (hotel_code, collection, sort_order);

CREATE INDEX IF NOT EXISTS homepage_hotel_images_room_lookup_idx
  ON public.homepage_hotel_images (hotel_price_code, collection, sort_order)
  WHERE hotel_price_code IS NOT NULL;

ALTER TABLE public.homepage_hotel_images ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.homepage_hotel_images FROM anon, authenticated;

COMMIT;

-- 적용 확인.
SELECT
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'homepage_hotel_images'
ORDER BY ordinal_position;

SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'homepage_hotel_images'
ORDER BY indexname;

SELECT
  hotel_code,
  hotel_price_code,
  collection,
  COUNT(*) AS image_count,
  COUNT(*) FILTER (WHERE is_primary) AS primary_image_count
FROM public.homepage_hotel_images
GROUP BY hotel_code, hotel_price_code, collection
ORDER BY hotel_code, hotel_price_code NULLS FIRST, collection;