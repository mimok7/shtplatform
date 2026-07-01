BEGIN;

-- =============================================
-- 1. 입력값 영역
-- =============================================
WITH source_rows AS (
  SELECT *
  FROM (
    VALUES
      -- cruise_name, schedule_type, room_type, room_type_en,
      -- price_adult, price_child, price_infant, price_extra_bed, price_single,
      -- valid_year, valid_from, valid_to, display_order, season_name, notes
      ('바야 소울 크루즈', '1N2D', '소울 레거시 스위트', 'Soul Legacy Suite', 
       13050000::numeric, 3850000::numeric, NULL::numeric, 9700000::numeric, 20700000::numeric, 
       2026, DATE '2026-01-01', DATE '2026-12-31', 1, '기본요금', 
       '80m2, 2층, 슈퍼 킹베드 | 성인 1인+아동 1인 시 아동도 성인요금 적용 | 성인 2인+아동 2인 객실 1개 사용 불가')
  ) AS v(
    cruise_name, schedule_type, room_type, room_type_en,
    price_adult, price_child, price_infant, price_extra_bed, price_single,
    valid_year, valid_from, valid_to, display_order, season_name, notes
  )
),
inserted AS (
  INSERT INTO public.cruise_rate_card (
    cruise_name, schedule_type, room_type, room_type_en,
    price_adult, price_child, price_infant, price_extra_bed, price_single,
    valid_year, valid_from, valid_to, display_order, season_name, notes,
    currency, is_active
  )
  SELECT
    s.cruise_name, s.schedule_type, s.room_type, s.room_type_en,
    s.price_adult, s.price_child, s.price_infant, s.price_extra_bed, s.price_single,
    s.valid_year, s.valid_from, s.valid_to, s.display_order, s.season_name, s.notes,
    'VND', true
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
-- =============================================
-- 2. 실행 즉시 추가된 행 표
-- =============================================
SELECT
  id,
  cruise_name AS "크루즈",
  schedule_type AS "일정",
  room_type AS "객실",
  room_type_en AS "객실(영문)",
  price_adult AS "성인요금",
  price_child AS "아동요금",
  price_infant AS "유아요금",
  price_extra_bed AS "엑스트라베드",
  price_single AS "싱글차지",
  valid_year AS "적용연도",
  valid_from AS "시작일",
  valid_to AS "종료일",
  display_order AS "정렬순서",
  season_name AS "요금제",
  notes AS "비고",
  created_at AS "생성시각"
FROM inserted
ORDER BY display_order;

-- =============================================
-- 3. 참고 요약 표(이번 실행 건수)
-- =============================================
SELECT COUNT(*) AS inserted_count FROM inserted;

COMMIT;
