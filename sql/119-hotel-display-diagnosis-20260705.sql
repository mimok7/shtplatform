-- 고객앱 호텔 미표시 원인 진단용 쿼리 (실행 후 결과 확인)
-- 실행 시 READ ONLY — BEGIN/COMMIT 없음, 데이터 변경 없음

-- ============================================================================
-- 1) hotel_price 전체 현황: 오늘(2026-07-05) 기준으로 유효한 행 있는지
-- ============================================================================
SELECT
  hotel_code,
  hotel_name,
  COUNT(*) AS row_count,
  MIN(start_date) AS min_start,
  MAX(end_date) AS max_end
FROM public.hotel_price
WHERE start_date <= CURRENT_DATE
  AND end_date >= CURRENT_DATE
GROUP BY hotel_code, hotel_name
ORDER BY hotel_name;

-- ============================================================================
-- 2) hotel_price 전체 날짜 범위 요약 (오늘 날짜 커버 여부)
-- ============================================================================
SELECT
  MIN(start_date) AS earliest_start,
  MAX(end_date)   AS latest_end,
  COUNT(*)        AS total_rows,
  SUM(CASE WHEN start_date <= CURRENT_DATE AND end_date >= CURRENT_DATE THEN 1 ELSE 0 END) AS rows_covering_today
FROM public.hotel_price;

-- ============================================================================
-- 3) hotel_info 현황: active 상태 확인
-- ============================================================================
SELECT
  hotel_code,
  hotel_name,
  product_type,
  active,
  created_at
FROM public.hotel_info
ORDER BY active DESC, hotel_name;

-- ============================================================================
-- 4) hotel_price → hotel_info 매칭 현황
--    (코드 불일치로 인한 JOIN 실패 탐지)
-- ============================================================================
SELECT
  hp.hotel_code,
  hp.hotel_name,
  COUNT(*) AS price_rows,
  hi.hotel_code AS info_code,
  hi.hotel_name AS info_name,
  hi.active AS info_active
FROM public.hotel_price hp
LEFT JOIN public.hotel_info hi ON hi.hotel_code = hp.hotel_code
GROUP BY hp.hotel_code, hp.hotel_name, hi.hotel_code, hi.hotel_name, hi.active
ORDER BY hp.hotel_name;

-- ============================================================================
-- 5) 2026-07-05(오늘) 기준 호텔 목록 시뮬레이션 (앱 쿼리와 동일)
-- ============================================================================
SELECT DISTINCT
  hotel_code,
  hotel_name
FROM public.hotel_price
WHERE start_date <= '2026-07-05'
  AND end_date   >= '2026-07-05'
ORDER BY hotel_name;
