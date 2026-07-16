-- 씨스타 크루즈 셔틀 리무진의 2026·2027년 요금을 추가하는 SQL

BEGIN;

WITH source_rows AS (
  SELECT *
  FROM (
    VALUES
      (
        'CRUISE_SHUTTLE_SEASTARS_1WAY'::text,
        '씨스타 크루즈'::text,
        '크루즈'::text,
        '크루즈 셔틀 리무진'::text,
        '하노이 - 하롱베이'::text,
        '하노이'::text,
        '하롱베이'::text,
        '편도'::text,
        500000::integer,
        11::integer,
        NULL::integer,
        '공유차량'::text,
        2026::integer,
        '씨스타 크루즈'::text,
        '크루즈 셔틀 리무진'::text,
        '11인승 리무진 | 씨스타 크루즈 편도 셔틀'::text,
        true::boolean
      ),
      (
        'CRUISE_SHUTTLE_SEASTARS_2WAY'::text,
        '씨스타 크루즈'::text,
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
        '씨스타 크루즈'::text,
        '크루즈 셔틀 리무진'::text,
        '11인승 리무진 | 씨스타 크루즈 다른날왕복 셔틀'::text,
        true::boolean
      ),
      (
        'CRUISE_SHUTTLE_SEASTARS_1WAY_2027'::text,
        '씨스타 크루즈'::text,
        '크루즈'::text,
        '크루즈 셔틀 리무진'::text,
        '하노이 - 하롱베이'::text,
        '하노이'::text,
        '하롱베이'::text,
        '편도'::text,
        500000::integer,
        11::integer,
        NULL::integer,
        '공유차량'::text,
        2027::integer,
        '씨스타 크루즈'::text,
        '크루즈 셔틀 리무진'::text,
        '11인승 리무진 | 씨스타 크루즈 편도 셔틀'::text,
        true::boolean
      ),
      (
        'CRUISE_SHUTTLE_SEASTARS_2WAY_2027'::text,
        '씨스타 크루즈'::text,
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
        '씨스타 크루즈'::text,
        '크루즈 셔틀 리무진'::text,
        '11인승 리무진 | 씨스타 크루즈 다른날왕복 셔틀'::text,
        true::boolean
      )
  ) AS rows(
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
),
inserted_rows AS (
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
    source_rows.rent_code,
    source_rows.category,
    source_rows.car_category_code,
    source_rows.vehicle_type,
    source_rows.route,
    source_rows.route_from,
    source_rows.route_to,
    source_rows.way_type,
    source_rows.price,
    source_rows.capacity,
    source_rows.duration_hours,
    source_rows.rental_type,
    source_rows.year,
    source_rows.cruise,
    source_rows.memo,
    source_rows.description,
    source_rows.is_active
  FROM source_rows
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.rentcar_price AS existing
    WHERE existing.rent_code = source_rows.rent_code
  )
  RETURNING
    rent_code,
    category,
    vehicle_type,
    way_type,
    price,
    year,
    cruise
)
SELECT
  rent_code,
  category,
  vehicle_type,
  way_type,
  price,
  year,
  cruise
FROM inserted_rows
ORDER BY year, rent_code;

COMMIT;

SELECT
  rent_code,
  category,
  vehicle_type,
  route,
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
  'CRUISE_SHUTTLE_SEASTARS_1WAY',
  'CRUISE_SHUTTLE_SEASTARS_2WAY',
  'CRUISE_SHUTTLE_SEASTARS_1WAY_2027',
  'CRUISE_SHUTTLE_SEASTARS_2WAY_2027'
)
ORDER BY year, rent_code;
