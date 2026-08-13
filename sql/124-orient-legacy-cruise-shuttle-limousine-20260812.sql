-- 오리엔트 레거시 크루즈 1박2일 왕복 셔틀 리무진의 2026·2027년 요금을 추가하는 스크립트
-- 기준: 사용자 요청에 따른 다른날왕복 1,000,000동. 편도 요금은 미제공이므로 등록하지 않는다.

BEGIN;

WITH source_rows AS (
  SELECT *
  FROM (
    VALUES
      (
        'CRUISE_SHUTTLE_ORIENT_LEGACY_2WAY'::text,
        '오리엔트 레거시 크루즈'::text,
        '크루즈'::text,
        '크루즈 셔틀 리무진'::text,
        '하노이 - 하롱베이'::text,
        '하노이'::text,
        '하롱베이'::text,
        '다른날왕복'::text,
        1000000::integer,
        11::integer,
        NULL::integer,
        '공유차량'::text,
        2026::integer,
        '오리엔트 레거시 크루즈'::text,
        '크루즈 셔틀 리무진'::text,
        '11인승 리무진 | 오리엔트 레거시 크루즈 1박2일 다른날왕복 셔틀'::text,
        true::boolean
      ),
      (
        'CRUISE_SHUTTLE_ORIENT_LEGACY_2WAY_2027'::text,
        '오리엔트 레거시 크루즈'::text,
        '크루즈'::text,
        '크루즈 셔틀 리무진'::text,
        '하노이 - 하롱베이'::text,
        '하노이'::text,
        '하롱베이'::text,
        '다른날왕복'::text,
        1000000::integer,
        11::integer,
        NULL::integer,
        '공유차량'::text,
        2027::integer,
        '오리엔트 레거시 크루즈'::text,
        '크루즈 셔틀 리무진'::text,
        '11인승 리무진 | 오리엔트 레거시 크루즈 1박2일 다른날왕복 셔틀'::text,
        true::boolean
      )
  ) AS v(
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
  vehicle_type,
  route,
  way_type,
  price,
  capacity,
  rental_type,
  year,
  cruise,
  is_active;

COMMIT;

SELECT
  rent_code,
  category,
  vehicle_type,
  route,
  route_from,
  route_to,
  way_type,
  price,
  capacity,
  rental_type,
  year,
  cruise,
  memo,
  is_active
FROM public.rentcar_price
WHERE rent_code IN (
  'CRUISE_SHUTTLE_ORIENT_LEGACY_2WAY',
  'CRUISE_SHUTTLE_ORIENT_LEGACY_2WAY_2027'
)
ORDER BY year, rent_code;
