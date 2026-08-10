-- 2026년 8월 6일 공항 픽업·샌딩 요금의 이력 보존 및 최신 요금 추가 스크립트
-- 실행 전제: 첨부 카페 게시글의 5개 차량군은 기존 차종 순서와 금액 패턴으로 매핑했습니다.
-- 승용차, SUV, 대형 SUV, 9인승 리무진, 11인승 리무진 순서입니다.
-- 16인승·25인승 미니버스는 첨부 요금표에 금액이 없어 이번 변경 대상에서 제외합니다.

BEGIN;

-- 기간별 요금 이력과 출처를 보존하기 위한 최소 컬럼입니다.
ALTER TABLE public.airport_price
  ADD COLUMN IF NOT EXISTS valid_from date,
  ADD COLUMN IF NOT EXISTS valid_to date,
  ADD COLUMN IF NOT EXISTS source_reference text,
  ADD COLUMN IF NOT EXISTS source_vehicle_group text;

COMMENT ON COLUMN public.airport_price.valid_from IS '해당 요금의 적용 시작일입니다.';
COMMENT ON COLUMN public.airport_price.valid_to IS '해당 요금의 적용 종료일입니다.';
COMMENT ON COLUMN public.airport_price.source_reference IS '요금의 원문 출처입니다.';
COMMENT ON COLUMN public.airport_price.source_vehicle_group IS '원문 요금표의 차량군 순번입니다.';

-- 첨부 요금표 5개 차량군 × 6개 목적지 × 픽업·샌딩을 전개합니다.
CREATE TABLE IF NOT EXISTS public.airport_price_source_20260806 (
  airport_code text PRIMARY KEY,
  service_type text NOT NULL,
  vehicle_type text NOT NULL,
  vehicle_examples text,
  recommended_capacity integer,
  max_capacity integer,
  route text NOT NULL,
  route_from text NOT NULL,
  route_to text NOT NULL,
  duration text,
  price integer NOT NULL,
  source_vehicle_group text NOT NULL,
  valid_year integer NOT NULL,
  valid_from date NOT NULL,
  valid_to date NOT NULL,
  source_reference text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

WITH vehicle_rows (
  vehicle_type, vehicle_examples, recommended_capacity, max_capacity, code_suffix, source_vehicle_group
) AS (
  VALUES
    ('승용차'::text, '세단'::text, 2::integer, 3::integer, 'SEDAN'::text, '원문 차량군 1'::text),
    ('SUV'::text, 'SUV'::text, 3::integer, 5::integer, 'SUV'::text, '원문 차량군 2'::text),
    ('대형 SUV'::text, '대형 SUV'::text, 3::integer, 5::integer, 'LSUV'::text, '원문 차량군 3'::text),
    ('9인승 리무진'::text, '9인승 리무진'::text, 4::integer, 8::integer, 'LIM9'::text, '원문 차량군 4'::text),
    ('11인승 리무진'::text, '11인승 리무진'::text, 6::integer, 10::integer, 'LIM11'::text, '원문 차량군 5'::text)
),
route_rows (
  route_suffix, route_to, duration, sedan_price, suv_price, large_suv_price, lim9_price, lim11_price
) AS (
  VALUES
    ('HN'::text, '하노이 시내'::text, '40분'::text, 350000::integer, 450000::integer, 750000::integer, 1000000::integer, 1250000::integer),
    ('HP'::text, '하이퐁'::text, '2시간'::text, 1250000::integer, 1450000::integer, 1850000::integer, 2650000::integer, 2850000::integer),
    ('HL'::text, '하롱베이'::text, '2시간 30분~3시간'::text, 1500000::integer, 1600000::integer, 1850000::integer, 2900000::integer, 3200000::integer),
    ('YK'::text, '요코온센 리조트'::text, '3시간~3시간 30분'::text, 1750000::integer, 2000000::integer, 2200000::integer, 3200000::integer, 3500000::integer),
    ('NB'::text, '닌빈/땀꼭'::text, '2시간 10분~2시간 30분'::text, 1300000::integer, 1500000::integer, 1750000::integer, 2750000::integer, 3100000::integer),
    ('SP'::text, '사파'::text, '4시간 40분~5시간 10분'::text, 2600000::integer, 2800000::integer, 3500000::integer, 4500000::integer, 4800000::integer)
),
base_rows AS (
  SELECT
    v.vehicle_type,
    v.vehicle_examples,
    v.recommended_capacity,
    v.max_capacity,
    v.code_suffix,
    v.source_vehicle_group,
    r.route_suffix,
    r.route_to,
    r.duration,
    CASE v.code_suffix
      WHEN 'SEDAN' THEN r.sedan_price
      WHEN 'SUV' THEN r.suv_price
      WHEN 'LSUV' THEN r.large_suv_price
      WHEN 'LIM9' THEN r.lim9_price
      WHEN 'LIM11' THEN r.lim11_price
    END::integer AS price
  FROM vehicle_rows v
  CROSS JOIN route_rows r
),
source_rows AS (
  SELECT
    format('AP-PU-%s-%s-20260806', code_suffix, route_suffix)::text AS airport_code,
    '픽업'::text AS service_type,
    vehicle_type, vehicle_examples, recommended_capacity, max_capacity,
    format('하노이 공항 - %s', route_to)::text AS route,
    '하노이 공항'::text AS route_from, route_to, duration, price,
    source_vehicle_group
  FROM base_rows
  UNION ALL
  SELECT
    format('AP-SD-%s-%s-20260806', code_suffix, route_suffix)::text AS airport_code,
    '샌딩'::text AS service_type,
    vehicle_type, vehicle_examples, recommended_capacity, max_capacity,
    format('%s - 하노이 공항', route_to)::text AS route,
    route_to AS route_from, '하노이 공항'::text AS route_to, duration, price,
    source_vehicle_group
  FROM base_rows
)
INSERT INTO public.airport_price_source_20260806 (
  airport_code, service_type, vehicle_type, vehicle_examples, recommended_capacity, max_capacity,
  route, route_from, route_to, duration, price, source_vehicle_group,
  valid_year, valid_from, valid_to, source_reference
)
SELECT
  airport_code, service_type, vehicle_type, vehicle_examples, recommended_capacity, max_capacity,
  route, route_from, route_to, duration, price::integer, source_vehicle_group,
  2026::integer, DATE '2026-08-06', DATE '9999-12-31',
  '네이버 카페 공항 픽업·샌딩 서비스 게시글 8609, 2026-08-06 확인'::text
FROM source_rows
WHERE NOT EXISTS (
  SELECT 1
  FROM public.airport_price_source_20260806 existing_source
  WHERE existing_source.airport_code = source_rows.airport_code
)
RETURNING airport_code, service_type, vehicle_type, route_from, route_to, price;

-- 기존 5개 차종의 2026년 활성 요금은 삭제하지 않고, 새 요금 시작 전날까지의 이력으로 보존합니다.
WITH source_rows AS (
  SELECT * FROM public.airport_price_source_20260806
), closed_rows AS (
  UPDATE public.airport_price ap
  SET
    valid_from = COALESCE(ap.valid_from, DATE '2026-01-01'),
    valid_to = DATE '2026-08-05',
    is_active = false,
    updated_at = now()
  WHERE ap.year = 2026::integer
    AND ap.is_active = true
    AND ap.vehicle_type IN ('승용차', 'SUV', '대형 SUV', '9인승 리무진', '11인승 리무진')
    AND ap.source_reference IS DISTINCT FROM '네이버 카페 공항 픽업·샌딩 서비스 게시글 8609, 2026-08-06 확인'
    AND EXISTS (
      SELECT 1
      FROM source_rows s
      WHERE s.service_type = ap.service_type
        AND s.vehicle_type = ap.vehicle_type
        AND s.route_from = ap.route_from
        AND s.route_to = ap.route_to
    )
  RETURNING ap.id, ap.airport_code, ap.service_type, ap.vehicle_type, ap.route_from, ap.route_to, ap.price, ap.valid_to
)
SELECT * FROM closed_rows ORDER BY service_type, vehicle_type, route_to;

-- 새 요금은 별도 코드와 적용기간으로 추가합니다. 같은 스크립트를 재실행해도 중복되지 않습니다.
WITH source_rows AS (
  SELECT * FROM public.airport_price_source_20260806
), inserted_rows AS (
  INSERT INTO public.airport_price (
    airport_code, service_type, vehicle_type, vehicle_examples,
    recommended_capacity, max_capacity, route, route_from, route_to, duration,
    price, year, valid_from, valid_to, source_reference, source_vehicle_group, is_active
  )
  SELECT
    s.airport_code, s.service_type, s.vehicle_type, s.vehicle_examples,
    s.recommended_capacity, s.max_capacity, s.route, s.route_from, s.route_to, s.duration,
    s.price::integer, s.valid_year::integer, s.valid_from::date, s.valid_to::date,
    s.source_reference, s.source_vehicle_group, true
  FROM source_rows s
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.airport_price ap
    WHERE ap.airport_code = s.airport_code
  )
  RETURNING airport_code, service_type, vehicle_type, route_from, route_to, price, valid_from, valid_to
)
SELECT * FROM inserted_rows ORDER BY service_type, vehicle_type, route_to;

-- 실행 결과 확인입니다. 새 요금은 60행이며, 기존 5개 차종의 이전 요금은 비활성 이력으로 남아야 합니다.
SELECT
  service_type AS "서비스",
  vehicle_type AS "차량",
  route_from || ' → ' || route_to AS "구간",
  price AS "편도요금(VND)",
  valid_from AS "시작일",
  valid_to AS "종료일",
  is_active AS "활성"
FROM public.airport_price
WHERE source_reference = '네이버 카페 공항 픽업·샌딩 서비스 게시글 8609, 2026-08-06 확인'
ORDER BY service_type, vehicle_type, route_from, route_to;

SELECT
  vehicle_type AS "차량",
  COUNT(*) FILTER (WHERE is_active) AS "활성행",
  COUNT(*) FILTER (WHERE NOT is_active) AS "이력행"
FROM public.airport_price
WHERE year = 2026::integer
GROUP BY vehicle_type
ORDER BY vehicle_type;


COMMIT;
