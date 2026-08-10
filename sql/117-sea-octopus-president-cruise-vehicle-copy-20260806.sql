-- 씨옥토퍼스 프레지던트 크루즈 전용 셔틀 리무진을 복제하는 스크립트
-- 공통 차량은 앱에서 cruise='공통'으로 자동 조회하므로 복제하지 않는다.
-- 원본 셔틀이 비활성 상태여도 가격 기준으로 복제하며, 프레지던트용 행은 활성으로 등록한다.

BEGIN;

-- 실행 전후 확인용. 공통 차량은 프레지던트 크루즈에도 자동으로 표시된다.
SELECT
  CASE
    WHEN cruise = '공통' THEN '공통 차량'
    WHEN cruise = '씨옥토퍼스 크루즈' THEN '씨옥토퍼스 전용 차량'
    ELSE '기타 차량'
  END AS vehicle_scope,
  rent_code,
  vehicle_type,
  route,
  way_type,
  price,
  capacity,
  year,
  cruise,
  is_active
FROM public.rentcar_price
WHERE cruise IN ('공통', '씨옥토퍼스 크루즈')
ORDER BY vehicle_scope, year, rent_code;

WITH source_rows AS (
  SELECT
    (source.rent_code || '_PRESIDENT')::text AS rent_code,
    '씨옥토퍼스 프레지던트 크루즈'::text AS category,
    source.car_category_code::text,
    source.vehicle_type::text,
    CASE
      WHEN source.route IS NULL THEN NULL::text
      ELSE REPLACE(source.route, '씨옥토퍼스 크루즈', '씨옥토퍼스 프레지던트 크루즈')::text
    END AS route,
    source.route_from::text,
    source.route_to::text,
    source.way_type::text,
    source.price::integer AS price,
    source.capacity::integer AS capacity,
    source.duration_hours::integer AS duration_hours,
    source.rental_type::text,
    source.year::integer AS year,
    '씨옥토퍼스 프레지던트 크루즈'::text AS cruise,
    CASE
      WHEN source.memo IS NULL THEN NULL::text
      ELSE REPLACE(source.memo, '씨옥토퍼스 크루즈', '씨옥토퍼스 프레지던트 크루즈')::text
    END AS memo,
    CASE
      WHEN source.description IS NULL THEN NULL::text
      ELSE REPLACE(source.description, '씨옥토퍼스 크루즈', '씨옥토퍼스 프레지던트 크루즈')::text
    END AS description,
    true AS is_active
  FROM public.rentcar_price AS source
  WHERE source.cruise = '씨옥토퍼스 크루즈'
    AND source.vehicle_type ILIKE '%크루즈 셔틀 리무진%'
    AND NULLIF(BTRIM(source.rent_code), '') IS NOT NULL
)
INSERT INTO public.rentcar_price (
  rent_code,
  category,
  car_category_code,
  vehicle_type,
  route,
  route_from,
  route_to,
  way_type,
  price,
  capacity,
  duration_hours,
  rental_type,
  year,
  cruise,
  memo,
  description,
  is_active
)
SELECT
  source.rent_code,
  source.category,
  source.car_category_code,
  source.vehicle_type,
  source.route,
  source.route_from,
  source.route_to,
  source.way_type,
  source.price,
  source.capacity,
  source.duration_hours,
  source.rental_type,
  source.year,
  source.cruise,
  source.memo,
  source.description,
  source.is_active
FROM source_rows AS source
WHERE NOT EXISTS (
  SELECT 1
  FROM public.rentcar_price AS existing
  WHERE existing.rent_code = source.rent_code
)
RETURNING
  rent_code,
  category,
  vehicle_type,
  route,
  way_type,
  price,
  capacity,
  year,
  cruise,
  is_active;

-- 프레지던트 전용 셔틀이 활성 상태로 생성됐는지 확인한다.
SELECT
  rent_code,
  category,
  vehicle_type,
  route,
  way_type,
  price,
  capacity,
  year,
  cruise,
  is_active
FROM public.rentcar_price
WHERE cruise = '씨옥토퍼스 프레지던트 크루즈'
  AND vehicle_type ILIKE '%크루즈 셔틀 리무진%'
ORDER BY year, rent_code;

COMMIT;