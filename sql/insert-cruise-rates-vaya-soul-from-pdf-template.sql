-- 바야 소울 크루즈 2026/2027 요금표를 추가하는 스크립트
-- 규칙
-- 1) 2026년 1N2D는 원문 요금을 그대로 사용한다.
-- 2) 2027년 1N2D는 2026년과 동일하게 1월 1일부터 추가한다.
-- 3) 2N3D는 같은 객실의 1N2D 요금 x2로 추가한다.

BEGIN;

WITH base_1n2d_2026 AS (
  SELECT *
  FROM (
    VALUES
      ('바야 소울 크루즈'::text, '시그니처 (30m2)'::text, NULL::text, 6500000::numeric, 3850000::numeric, NULL::numeric, 4850000::numeric, 10200000::numeric, 1::integer, '기본요금'::text, '출처: 네이버 카페 10/31, 아동(6-12세), 커넥팅룸 제공됨'::text),
      ('바야 소울 크루즈'::text, '심포니 스위트 (46m2)'::text, NULL::text, 8950000::numeric, 3850000::numeric, NULL::numeric, 6600000::numeric, 14100000::numeric, 2::integer, '기본요금'::text, '출처: 네이버 카페 11/31, 아동(6-12세), 커넥팅룸 없음'::text),
      ('바야 소울 크루즈'::text, '호라이즌 스위트 (52m2)'::text, NULL::text, 11000000::numeric, 3850000::numeric, NULL::numeric, 8250000::numeric, 17400000::numeric, 3::integer, '기본요금'::text, '출처: 네이버 카페 12/31~13/31, 아동(6-12세), 커넥팅룸 없음'::text),
      ('바야 소울 크루즈'::text, '소울 레거시 스위트 (80m2)'::text, NULL::text, 13050000::numeric, 3850000::numeric, NULL::numeric, 9700000::numeric, 20700000::numeric, 4::integer, '기본요금'::text, '출처: 네이버 카페 14/31, 아동(6-12세), 커넥팅룸 없음'::text)
  ) AS v(
    cruise_name,
    room_type,
    room_type_en,
    price_adult,
    price_child,
    price_infant,
    price_extra_bed,
    price_single,
    display_order,
    season_name,
    notes
  )
),
target_years AS (
  SELECT 2026::integer AS valid_year
  UNION ALL
  SELECT 2027::integer AS valid_year
),
target_schedules AS (
  SELECT '1N2D'::text AS schedule_type, 1::numeric AS price_multiplier
  UNION ALL
  SELECT '2N3D'::text AS schedule_type, 2::numeric AS price_multiplier
),
source_rows AS (
  SELECT
    b.cruise_name,
    s.schedule_type,
    b.room_type,
    b.room_type_en,
    (b.price_adult * s.price_multiplier)::numeric AS price_adult,
    CASE WHEN b.price_child IS NULL THEN NULL ELSE (b.price_child * s.price_multiplier)::numeric END AS price_child,
    CASE WHEN b.price_infant IS NULL THEN NULL ELSE (b.price_infant * s.price_multiplier)::numeric END AS price_infant,
    CASE WHEN b.price_extra_bed IS NULL THEN NULL ELSE (b.price_extra_bed * s.price_multiplier)::numeric END AS price_extra_bed,
    CASE WHEN b.price_single IS NULL THEN NULL ELSE (b.price_single * s.price_multiplier)::numeric END AS price_single,
    y.valid_year,
    make_date(y.valid_year, 1, 1) AS valid_from,
    make_date(y.valid_year, 12, 31) AS valid_to,
    b.display_order,
    b.season_name,
    CASE
      WHEN s.schedule_type = '2N3D' THEN b.notes || ' / 2N3D는 1N2D x2 적용'
      ELSE b.notes || ' / 2027년은 2026년 동일요금 적용'
    END AS notes
  FROM base_1n2d_2026 b
  CROSS JOIN target_years y
  CROSS JOIN target_schedules s
),
inserted AS (
  INSERT INTO public.cruise_rate_card (
    cruise_name,
    schedule_type,
    room_type,
    room_type_en,
    price_adult,
    price_child,
    price_infant,
    price_extra_bed,
    price_single,
    valid_year,
    valid_from,
    valid_to,
    display_order,
    season_name,
    notes
  )
  SELECT
    s.cruise_name,
    s.schedule_type,
    s.room_type,
    s.room_type_en,
    s.price_adult,
    s.price_child,
    s.price_infant,
    s.price_extra_bed,
    s.price_single,
    s.valid_year,
    s.valid_from,
    s.valid_to,
    s.display_order,
    s.season_name,
    s.notes
  FROM source_rows s
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.cruise_rate_card c
    WHERE c.cruise_name = s.cruise_name
      AND c.schedule_type = s.schedule_type
      AND c.room_type = s.room_type
      AND c.valid_year = s.valid_year
      AND c.valid_from IS NOT DISTINCT FROM s.valid_from
      AND c.valid_to IS NOT DISTINCT FROM s.valid_to
      AND c.season_name IS NOT DISTINCT FROM s.season_name
  )
  RETURNING
    id,
    cruise_name,
    schedule_type,
    room_type,
    room_type_en,
    price_adult,
    price_child,
    price_infant,
    price_extra_bed,
    price_single,
    valid_year,
    valid_from,
    valid_to,
    display_order,
    season_name,
    notes,
    created_at
)
SELECT
  id,
  cruise_name AS "크루즈",
  valid_year AS "연도",
  schedule_type AS "일정",
  room_type AS "객실",
  TO_CHAR(price_adult, 'FM999,999,999,999') AS "성인요금(동)",
  TO_CHAR(price_child, 'FM999,999,999,999') AS "아동요금(동)",
  TO_CHAR(price_extra_bed, 'FM999,999,999,999') AS "엑스트라베드(동)",
  TO_CHAR(price_single, 'FM999,999,999,999') AS "싱글차지(동)",
  valid_from AS "시작일",
  valid_to AS "종료일",
  display_order AS "정렬순서",
  season_name AS "요금제",
  COUNT(*) OVER () AS "inserted_count",
  created_at AS "생성시각"
FROM inserted
ORDER BY valid_year, schedule_type, display_order;

COMMIT;

/*
-- 실행 후 누적 확인용
SELECT
  cruise_name,
  valid_year,
  schedule_type,
  room_type,
  price_adult,
  price_child,
  price_extra_bed,
  price_single,
  valid_from,
  valid_to,
  display_order,
  season_name
FROM public.cruise_rate_card
WHERE cruise_name = '바야 소울 크루즈'
  AND valid_year IN (2026, 2027)
  AND schedule_type IN ('1N2D', '2N3D')
ORDER BY valid_year, schedule_type, display_order;
*/
