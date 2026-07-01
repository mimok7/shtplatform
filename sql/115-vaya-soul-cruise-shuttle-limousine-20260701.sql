-- 바야 소울 크루즈 셔틀 리무진 가격을 rentcar_price에 추가하는 스크립트
-- 기준: 편도 800,000동 / 왕복(다른날왕복) 1,000,000동

BEGIN;

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
  v.rent_code,
  v.category,
  v.car_category_code,
  v.vehicle_type,
  v.route,
  v.route_from,
  v.route_to,
  v.way_type,
  v.price,
  v.capacity,
  v.duration_hours,
  v.rental_type,
  v.year,
  v.cruise,
  v.memo,
  v.description,
  v.is_active
FROM (
  VALUES
    (
      'CRUISE_SHUTTLE_VAYA_SOUL_1WAY',
      '바야 소울 크루즈',
      '크루즈',
      '크루즈 셔틀 리무진',
      '하노이 - 하롱베이',
      '하노이',
      '하롱베이',
      '편도',
      800000,
      11,
      NULL::integer,
      '공유차량',
      2026,
      '바야 소울 크루즈',
      '크루즈 셔틀 리무진',
      '11인승 리무진 | 바야 소울 크루즈 편도 셔틀',
      true
    ),
    (
      'CRUISE_SHUTTLE_VAYA_SOUL_2WAY',
      '바야 소울 크루즈',
      '크루즈',
      '크루즈 셔틀 리무진',
      '하노이 - 하롱베이',
      '하노이',
      '하롱베이',
      '다른날왕복',
      1000000,
      11,
      NULL::integer,
      '공유차량',
      2026,
      '바야 소울 크루즈',
      '크루즈 셔틀 리무진',
      '11인승 리무진 | 바야 소울 크루즈 다른날왕복 셔틀',
      true
    ),
    (
      'CRUISE_SHUTTLE_VAYA_SOUL_1WAY_2027',
      '바야 소울 크루즈',
      '크루즈',
      '크루즈 셔틀 리무진',
      '하노이 - 하롱베이',
      '하노이',
      '하롱베이',
      '편도',
      800000,
      11,
      NULL::integer,
      '공유차량',
      2027,
      '바야 소울 크루즈',
      '크루즈 셔틀 리무진',
      '11인승 리무진 | 바야 소울 크루즈 편도 셔틀',
      true
    ),
    (
      'CRUISE_SHUTTLE_VAYA_SOUL_2WAY_2027',
      '바야 소울 크루즈',
      '크루즈',
      '크루즈 셔틀 리무진',
      '하노이 - 하롱베이',
      '하노이',
      '하롱베이',
      '다른날왕복',
      1000000,
      11,
      NULL::integer,
      '공유차량',
      2027,
      '바야 소울 크루즈',
      '크루즈 셔틀 리무진',
      '11인승 리무진 | 바야 소울 크루즈 다른날왕복 셔틀',
      true
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
WHERE NOT EXISTS (
  SELECT 1
  FROM public.rentcar_price rp
  WHERE rp.rent_code = v.rent_code
);

COMMIT;

-- 추가 결과 확인
SELECT
  rent_code,
  category,
  vehicle_type,
  route,
  way_type,
  price,
  year,
  cruise,
  is_active
FROM public.rentcar_price
WHERE rent_code IN (
  'CRUISE_SHUTTLE_VAYA_SOUL_1WAY',
  'CRUISE_SHUTTLE_VAYA_SOUL_2WAY',
  'CRUISE_SHUTTLE_VAYA_SOUL_1WAY_2027',
  'CRUISE_SHUTTLE_VAYA_SOUL_2WAY_2027'
)
ORDER BY year, rent_code;
