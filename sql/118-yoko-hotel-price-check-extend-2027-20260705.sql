-- db.csv 기준 hotel_price를 점검하고 2026 연장 및 2027 연간 요금을 추가하는 스크립트.
-- ============================================================================
-- 118-yoko-hotel-price-check-extend-2027-20260705.sql
-- db.csv 참조 테이블/컬럼
--   - hotel_price(hotel_price_code, hotel_code, hotel_name, room_type, room_name,
--     room_category, occupancy_max, include_breakfast, base_price,
--     extra_person_price, child_policy, season_name, start_date, end_date,
--     weekday_type, notes)
-- 목적
--   1) 요코 호텔 가격 중 8월(또는 그 이전) 종료 항목 점검.
--   2) 2026 미종료 항목을 2026-12-31까지 연장.
--   3) 2026 기준으로 2027-01-01~2027-12-31 연간 요금 생성.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 0) 사전 점검: db.csv 기준 hotel_price 테이블 존재 확인
-- ============================================================================
DO $$
BEGIN
  IF to_regclass('public.hotel_price') IS NULL THEN
    RAISE EXCEPTION 'public.hotel_price 테이블이 없습니다. db.csv 기준 스키마를 먼저 확인하세요.';
  END IF;
END $$;

-- ============================================================================
-- 0-1) 가시성 점검/보정: hotel_price.hotel_code 와 hotel_info.hotel_code 매칭 정규화
--      원인: 화면은 hotel_price.hotel_code -> hotel_info.hotel_code 직접 매칭
--      보정: hotel_info의 실제 요코 코드(예: YOKO, YOKO_*)로 정규화
-- ============================================================================
DO $$
DECLARE
  v_target_code text;
BEGIN
  SELECT hi.hotel_code
  INTO v_target_code
  FROM public.hotel_info hi
  WHERE hi.hotel_code = 'YOKO'
     OR hi.hotel_code ILIKE 'YOKO%'
     OR hi.hotel_name ILIKE '%요코%'
     OR hi.hotel_name ILIKE '%yoko%'
  ORDER BY CASE WHEN hi.hotel_code = 'YOKO' THEN 0 ELSE 1 END, hi.hotel_code
  LIMIT 1;

  IF v_target_code IS NULL THEN
    INSERT INTO public.hotel_info (
      hotel_code, hotel_name, product_type, active, currency, notes
    )
    VALUES (
      'YOKO', 'Yoko Onsen Resort', 'HOTEL', true, 'VND', '자동 생성: 요코 호텔 가격 FK 보정'
    )
    ON CONFLICT (hotel_code) DO NOTHING;

    v_target_code := 'YOKO';
  END IF;

  UPDATE public.hotel_price hp
  SET hotel_code = v_target_code
  WHERE (
      hp.hotel_code = 'YOKO'
      OR hp.hotel_code ILIKE 'YOKO%'
      OR hp.hotel_name ILIKE '%요코%'
      OR hp.hotel_name ILIKE '%yoko%'
    )
    AND hp.hotel_code <> v_target_code;
END $$;

SELECT
  hp.hotel_code,
  COUNT(*)::int AS rows,
  CASE WHEN hi.hotel_code IS NULL THEN 'UNMATCHED' ELSE 'MATCHED' END AS info_match
FROM public.hotel_price hp
LEFT JOIN public.hotel_info hi ON hi.hotel_code = hp.hotel_code
WHERE hp.hotel_code = 'YOKO' OR hp.hotel_code ILIKE 'YOKO%'
GROUP BY hp.hotel_code, hi.hotel_code
ORDER BY hp.hotel_code;

SELECT
  hp.hotel_code,
  COUNT(*)::int AS rows,
  CASE WHEN hi.hotel_code IS NULL THEN 'UNMATCHED' ELSE 'MATCHED' END AS info_match
FROM public.hotel_price hp
LEFT JOIN public.hotel_info hi ON hi.hotel_code = hp.hotel_code
WHERE hp.hotel_code = 'YOKO' OR hp.hotel_code ILIKE 'YOKO%'
GROUP BY hp.hotel_code, hi.hotel_code
ORDER BY hp.hotel_code;

-- ============================================================================
-- 1) 점검: 요코 호텔 2026 가격 중 8월(또는 그 이전) 종료 항목
-- ============================================================================
WITH yoko_2026 AS (
  SELECT hp.*
  FROM public.hotel_price hp
  WHERE (
      hp.hotel_code = 'YOKO'
      OR hp.hotel_code ILIKE 'YOKO%'
      OR hp.hotel_name ILIKE '%요코%'
      OR hp.hotel_name ILIKE '%yoko%'
    )
    AND hp.start_date <= DATE '2026-12-31'
    AND hp.end_date >= DATE '2026-01-01'
)
SELECT
  hotel_code,
  hotel_name,
  room_type,
  room_name,
  weekday_type,
  MIN(start_date) AS min_start_date,
  MAX(end_date) AS max_end_date,
  COUNT(*)::int AS row_count
FROM yoko_2026
GROUP BY hotel_code, hotel_name, room_type, room_name, weekday_type
HAVING MAX(end_date) <= DATE '2026-08-31'
ORDER BY hotel_code, room_type, room_name, weekday_type;

-- ============================================================================
-- 2) 2026-12-31까지 연장
--    규칙: 동일 (hotel_code, room_type, room_name, weekday_type) 그룹의
--          최신 2026 행 end_date가 12/31 이전이면 +1일~12/31 구간 추가
-- ============================================================================
WITH latest_2026 AS (
  SELECT
    hp.*,
    ROW_NUMBER() OVER (
      PARTITION BY
        hp.hotel_code,
        hp.room_type,
        hp.room_name,
        COALESCE(hp.weekday_type, 'ALL')
      ORDER BY hp.end_date DESC, hp.start_date DESC, hp.created_at DESC
    ) AS rn
  FROM public.hotel_price hp
  WHERE (
      hp.hotel_code = 'YOKO'
      OR hp.hotel_code ILIKE 'YOKO%'
      OR hp.hotel_name ILIKE '%요코%'
      OR hp.hotel_name ILIKE '%yoko%'
    )
    AND hp.start_date <= DATE '2026-12-31'
    AND hp.end_date >= DATE '2026-01-01'
),
source_rows AS (
  SELECT
    (
      COALESCE(NULLIF(l.hotel_price_code, ''), l.hotel_code || '_' || l.room_type)
      || '_EXT2026_'
      || SUBSTRING(MD5(
          l.hotel_code || '|' || l.room_type || '|' || l.room_name || '|' || COALESCE(l.weekday_type, 'ALL') || '|' || (l.end_date + INTERVAL '1 day')::date::text || '|2026-12-31'
        ) FROM 1 FOR 8)
    )::text AS hotel_price_code,
    l.hotel_code,
    l.hotel_name,
    l.room_type,
    l.room_name,
    l.room_category,
    l.occupancy_max,
    l.include_breakfast,
    l.base_price,
    l.extra_person_price,
    l.child_policy,
    COALESCE(l.season_name, '2026 연장') || ' (연장)' AS season_name,
    (l.end_date + INTERVAL '1 day')::date AS start_date,
    DATE '2026-12-31' AS end_date,
    COALESCE(l.weekday_type, 'ALL') AS weekday_type,
    CASE
      WHEN l.notes IS NULL THEN '2026-12-31까지 자동 연장'
      ELSE l.notes || ' / 2026-12-31 연장'
    END AS notes
  FROM latest_2026 l
  WHERE l.rn = 1
    AND l.end_date < DATE '2026-12-31'
    AND (l.end_date + INTERVAL '1 day')::date <= DATE '2026-12-31'
),
inserted_2026 AS (
  INSERT INTO public.hotel_price (
    hotel_price_code,
    hotel_code,
    hotel_name,
    room_type,
    room_name,
    room_category,
    occupancy_max,
    include_breakfast,
    base_price,
    extra_person_price,
    child_policy,
    season_name,
    start_date,
    end_date,
    weekday_type,
    notes
  )
  SELECT
    s.hotel_price_code,
    s.hotel_code,
    s.hotel_name,
    s.room_type,
    s.room_name,
    s.room_category,
    s.occupancy_max,
    s.include_breakfast,
    s.base_price,
    s.extra_person_price,
    s.child_policy,
    s.season_name,
    s.start_date,
    s.end_date,
    s.weekday_type,
    s.notes
  FROM source_rows s
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.hotel_price e
    WHERE e.hotel_code = s.hotel_code
      AND e.room_type = s.room_type
      AND e.room_name = s.room_name
      AND COALESCE(e.weekday_type, 'ALL') = COALESCE(s.weekday_type, 'ALL')
      AND e.start_date = s.start_date
      AND e.end_date = s.end_date
  )
  RETURNING hotel_price_code
)
SELECT 'extended_2026'::text AS action, COUNT(*)::int AS inserted_count
FROM inserted_2026;

-- ============================================================================
-- 3) 2027 연간 요금 생성
--    규칙: 2026 대표행(우선순위: 12/31 포함 > end_date 최신)을 기준으로
--          2027-01-01~2027-12-31 1행 생성
-- ============================================================================
WITH source_2026 AS (
  SELECT
    hp.*,
    ROW_NUMBER() OVER (
      PARTITION BY
        hp.hotel_code,
        hp.room_type,
        hp.room_name,
        COALESCE(hp.weekday_type, 'ALL')
      ORDER BY
        CASE WHEN DATE '2026-12-31' BETWEEN hp.start_date AND hp.end_date THEN 0 ELSE 1 END,
        hp.end_date DESC,
        hp.start_date DESC,
        hp.created_at DESC
    ) AS rn
  FROM public.hotel_price hp
  WHERE (
      hp.hotel_code = 'YOKO'
      OR hp.hotel_code ILIKE 'YOKO%'
      OR hp.hotel_name ILIKE '%요코%'
      OR hp.hotel_name ILIKE '%yoko%'
    )
    AND hp.start_date <= DATE '2026-12-31'
    AND hp.end_date >= DATE '2026-01-01'
),
source_rows AS (
  SELECT
    (
      COALESCE(NULLIF(s.hotel_price_code, ''), s.hotel_code || '_' || s.room_type)
      || '_2027_'
      || SUBSTRING(MD5(
          s.hotel_code || '|' || s.room_type || '|' || s.room_name || '|' || COALESCE(s.weekday_type, 'ALL') || '|2027-01-01|2027-12-31'
        ) FROM 1 FOR 8)
    )::text AS hotel_price_code,
    s.hotel_code,
    s.hotel_name,
    s.room_type,
    s.room_name,
    s.room_category,
    s.occupancy_max,
    s.include_breakfast,
    s.base_price,
    s.extra_person_price,
    s.child_policy,
    CASE
      WHEN s.season_name IS NULL THEN '2027 연간 (2026 기준)'
      WHEN POSITION('2026' IN s.season_name) > 0 THEN REPLACE(s.season_name, '2026', '2027')
      ELSE s.season_name || ' (2027 연간)'
    END AS season_name,
    DATE '2027-01-01' AS start_date,
    DATE '2027-12-31' AS end_date,
    COALESCE(s.weekday_type, 'ALL') AS weekday_type,
    CASE
      WHEN s.notes IS NULL THEN '2026 요금 기준 2027 연간 복제'
      WHEN POSITION('2026' IN s.notes) > 0 THEN REPLACE(s.notes, '2026', '2027')
      ELSE s.notes || ' / 2027 연간(2026 기준)'
    END AS notes
  FROM source_2026 s
  WHERE s.rn = 1
),
inserted_2027 AS (
  INSERT INTO public.hotel_price (
    hotel_price_code,
    hotel_code,
    hotel_name,
    room_type,
    room_name,
    room_category,
    occupancy_max,
    include_breakfast,
    base_price,
    extra_person_price,
    child_policy,
    season_name,
    start_date,
    end_date,
    weekday_type,
    notes
  )
  SELECT
    s.hotel_price_code,
    s.hotel_code,
    s.hotel_name,
    s.room_type,
    s.room_name,
    s.room_category,
    s.occupancy_max,
    s.include_breakfast,
    s.base_price,
    s.extra_person_price,
    s.child_policy,
    s.season_name,
    s.start_date,
    s.end_date,
    s.weekday_type,
    s.notes
  FROM source_rows s
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.hotel_price e
    WHERE e.hotel_code = s.hotel_code
      AND e.room_type = s.room_type
      AND e.room_name = s.room_name
      AND COALESCE(e.weekday_type, 'ALL') = COALESCE(s.weekday_type, 'ALL')
      AND e.start_date = DATE '2027-01-01'
      AND e.end_date = DATE '2027-12-31'
  )
  RETURNING hotel_price_code
)
SELECT 'copied_2027'::text AS action, COUNT(*)::int AS inserted_count
FROM inserted_2027;

-- ============================================================================
-- 4) 결과 확인
-- ============================================================================
-- 4-1. 2026 미연장 항목 (0건 기대)
WITH yoko_2026 AS (
  SELECT hp.*
  FROM public.hotel_price hp
  WHERE (
      hp.hotel_code = 'YOKO'
      OR hp.hotel_code ILIKE 'YOKO%'
      OR hp.hotel_name ILIKE '%요코%'
      OR hp.hotel_name ILIKE '%yoko%'
    )
    AND hp.start_date <= DATE '2026-12-31'
    AND hp.end_date >= DATE '2026-01-01'
)
SELECT
  hotel_code,
  hotel_name,
  room_type,
  room_name,
  weekday_type,
  MAX(end_date) AS max_end_date
FROM yoko_2026
GROUP BY hotel_code, hotel_name, room_type, room_name, weekday_type
HAVING MAX(end_date) < DATE '2026-12-31'
ORDER BY hotel_code, room_type, room_name, weekday_type;

-- 4-2. 2027 연간 확인
SELECT
  hotel_price_code,
  hotel_code,
  hotel_name,
  room_type,
  room_name,
  base_price,
  start_date,
  end_date,
  weekday_type
FROM public.hotel_price
WHERE (
    hotel_code = 'YOKO'
  OR hotel_code ILIKE 'YOKO%'
    OR hotel_name ILIKE '%요코%'
    OR hotel_name ILIKE '%yoko%'
  )
  AND start_date = DATE '2027-01-01'
  AND end_date = DATE '2027-12-31'
ORDER BY hotel_code, room_type, room_name, weekday_type;

COMMIT;
