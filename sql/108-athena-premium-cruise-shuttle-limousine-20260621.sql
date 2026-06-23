-- ============================================================================
-- 108-athena-premium-cruise-shuttle-limousine-20260621.sql
-- 아테나 프리미엄 크루즈 셔틀 리무진 가격 추가
-- ============================================================================
-- 목적:
--   1. rentcar_price 테이블에 아테나 프리미엄 크루즈 전용 셔틀 리무진 가격 추가
--   2. reservation_cruise_car 는 해당 rent_code(rentcar_price_code)를 참조하도록 사용
--   3. 재실행 시 중복 INSERT가 발생하지 않도록 처리
--
-- 가정:
--   - 구간은 기존 크루즈 셔틀 패턴과 동일하게 '하노이 - 하롱베이'로 등록
--   - 편도 550,000 VND / 다른날왕복 1,000,000 VND
--   - 셔틀 리무진이므로 rental_type 은 '단독대여'가 아닌 '공유차량'으로 저장
--   - 1박2일 크루즈 일정이므로 왕복 차량은 '당일왕복'이 아니라 '다른날왕복'으로 저장
--   - 2026 / 2027 동일 기준 데이터로 등록
-- ============================================================================

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
      'CRUISE_SHUTTLE_ATHENA_PREMIUM_1WAY',
      '아테나 프리미엄 크루즈',
      '크루즈',
      '크루즈 셔틀 리무진',
      '하노이 - 하롱베이',
      '하노이',
      '하롱베이',
      '편도',
      550000,
      11,
      NULL::integer,
      '공유차량',
      2026,
      '아테나 프리미엄 크루즈',
      '크루즈 셔틀 리무진',
      '11인승 리무진 | 아테나 프리미엄 크루즈 편도 셔틀',
      true
    ),
    (
      'CRUISE_SHUTTLE_ATHENA_PREMIUM_2WAY',
      '아테나 프리미엄 크루즈',
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
      '아테나 프리미엄 크루즈',
      '크루즈 셔틀 리무진',
      '11인승 리무진 | 아테나 프리미엄 크루즈 다른날왕복 셔틀',
      true
    ),
    (
      'CRUISE_SHUTTLE_ATHENA_PREMIUM_1WAY_2027',
      '아테나 프리미엄 크루즈',
      '크루즈',
      '크루즈 셔틀 리무진',
      '하노이 - 하롱베이',
      '하노이',
      '하롱베이',
      '편도',
      550000,
      11,
      NULL::integer,
      '공유차량',
      2027,
      '아테나 프리미엄 크루즈',
      '크루즈 셔틀 리무진',
      '11인승 리무진 | 아테나 프리미엄 크루즈 편도 셔틀',
      true
    ),
    (
      'CRUISE_SHUTTLE_ATHENA_PREMIUM_2WAY_2027',
      '아테나 프리미엄 크루즈',
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
      '아테나 프리미엄 크루즈',
      '크루즈 셔틀 리무진',
      '11인승 리무진 | 아테나 프리미엄 크루즈 다른날왕복 셔틀',
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

-- ============================================================================
-- 검증 쿼리
-- ============================================================================

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
  'CRUISE_SHUTTLE_ATHENA_PREMIUM_1WAY',
  'CRUISE_SHUTTLE_ATHENA_PREMIUM_2WAY',
  'CRUISE_SHUTTLE_ATHENA_PREMIUM_1WAY_2027',
  'CRUISE_SHUTTLE_ATHENA_PREMIUM_2WAY_2027'
)
ORDER BY year, rent_code;
