-- ============================================================================
-- 레거시 옌뜨, MGALLERY 호텔 객실 요금 및 얼리버드 규칙 (2026-08-21 원문 기준)
-- ============================================================================
-- 선행 실행: 125-legacy-yen-tu-mgallery-hotel-20260821.sql
--
-- 적용 기준
--   * 일반요금: 예약일 기준 체크인 0~29일 전
--   * 얼리버드: 예약일 기준 체크인 30일 전 이상 (정확히 30일 전 포함)
--   * 일~금과 토요일은 별도 요금
--   * 조식 포함, 엑스트라베드 금액은 원문 그대로 반영
--
-- 요금 조회 예시
--   select * from public.get_legacy_yentu_price(
--     'SUPERIOR_FOREST_VIEW', date '2026-10-10', date '2026-09-10'
--   ); -- 30일 전 예약이므로 얼리버드
-- ============================================================================

BEGIN;

ALTER TABLE public.hotel_price
  ADD COLUMN IF NOT EXISTS booking_advance_days_min integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS booking_advance_days_max integer;

ALTER TABLE public.hotel_price
  DROP CONSTRAINT IF EXISTS hotel_price_booking_advance_days_ck;

ALTER TABLE public.hotel_price
  ADD CONSTRAINT hotel_price_booking_advance_days_ck
  CHECK (
    booking_advance_days_min >= 0
    AND (booking_advance_days_max IS NULL OR booking_advance_days_max >= booking_advance_days_min)
  );

CREATE INDEX IF NOT EXISTS hotel_price_booking_advance_lookup_idx
  ON public.hotel_price (hotel_code, room_type, start_date, end_date, booking_advance_days_min);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.hotel_info WHERE hotel_code = 'LEGACY_YENTU') THEN
    RAISE EXCEPTION 'LEGACY_YENTU 호텔이 없습니다. 125-legacy-yen-tu-mgallery-hotel-20260821.sql을 먼저 실행하세요.';
  END IF;
END $$;

-- 125에서 만든 가격 문의 행을 실제 요금 행으로 교체한다.
DELETE FROM public.hotel_price
WHERE hotel_code = 'LEGACY_YENTU';

INSERT INTO public.hotel_price (
  hotel_price_code, hotel_code, hotel_name, room_type, room_name, room_category,
  occupancy_max, include_breakfast, base_price, extra_person_price, child_policy,
  season_name, start_date, end_date, weekday_type,
  booking_advance_days_min, booking_advance_days_max, notes
) VALUES
-- 슈페리어 포레스트뷰
('LEGACY_YENTU_SUPERIOR_FOREST_STD_SUN_FRI_2026', 'LEGACY_YENTU', '레거시 옌뜨, MGALLERY 호텔', 'SUPERIOR_FOREST_VIEW', '슈페리어 포레스트뷰 객실', 'STANDARD', NULL, true, 3750000, 1950000, NULL, '2026 일반요금 · 일~금', DATE '2026-01-01', DATE '2026-12-31', '일,월,화,수,목,금', 0, 29, '조식 포함. 포레스트 뷰, VIP 웰컴 어메니티 세트. 체크인 30일 전 미만 예약 적용.'),
('LEGACY_YENTU_SUPERIOR_FOREST_STD_SAT_2026',     'LEGACY_YENTU', '레거시 옌뜨, MGALLERY 호텔', 'SUPERIOR_FOREST_VIEW', '슈페리어 포레스트뷰 객실', 'STANDARD', NULL, true, 4750000, 1950000, NULL, '2026 일반요금 · 토',    DATE '2026-01-01', DATE '2026-12-31', '토',                 0, 29, '조식 포함. 포레스트 뷰, VIP 웰컴 어메니티 세트. 체크인 30일 전 미만 예약 적용.'),
('LEGACY_YENTU_SUPERIOR_FOREST_EB_SUN_FRI_2026',  'LEGACY_YENTU', '레거시 옌뜨, MGALLERY 호텔', 'SUPERIOR_FOREST_VIEW', '슈페리어 포레스트뷰 객실', 'STANDARD', NULL, true, 3375000, 1755000, NULL, '2026 얼리버드 · 일~금', DATE '2026-01-01', DATE '2026-12-31', '일,월,화,수,목,금', 30, NULL, '조식 포함. 포레스트 뷰, VIP 웰컴 어메니티 세트. 체크인 30일 전 이상 예약 적용.'),
('LEGACY_YENTU_SUPERIOR_FOREST_EB_SAT_2026',      'LEGACY_YENTU', '레거시 옌뜨, MGALLERY 호텔', 'SUPERIOR_FOREST_VIEW', '슈페리어 포레스트뷰 객실', 'STANDARD', NULL, true, 4275000, 1755000, NULL, '2026 얼리버드 · 토',    DATE '2026-01-01', DATE '2026-12-31', '토',                 30, NULL, '조식 포함. 포레스트 뷰, VIP 웰컴 어메니티 세트. 체크인 30일 전 이상 예약 적용.'),
-- 슈페리어 빌리지뷰
('LEGACY_YENTU_SUPERIOR_VILLAGE_STD_SUN_FRI_2026', 'LEGACY_YENTU', '레거시 옌뜨, MGALLERY 호텔', 'SUPERIOR_VILLAGE_VIEW', '슈페리어 빌리지뷰 객실', 'STANDARD', NULL, true, 4050000, 1950000, NULL, '2026 일반요금 · 일~금', DATE '2026-01-01', DATE '2026-12-31', '일,월,화,수,목,금', 0, 29, '조식 포함. 넓은 정원 뷰. 체크인 30일 전 미만 예약 적용.'),
('LEGACY_YENTU_SUPERIOR_VILLAGE_STD_SAT_2026',     'LEGACY_YENTU', '레거시 옌뜨, MGALLERY 호텔', 'SUPERIOR_VILLAGE_VIEW', '슈페리어 빌리지뷰 객실', 'STANDARD', NULL, true, 5050000, 1950000, NULL, '2026 일반요금 · 토',    DATE '2026-01-01', DATE '2026-12-31', '토',                 0, 29, '조식 포함. 넓은 정원 뷰. 체크인 30일 전 미만 예약 적용.'),
('LEGACY_YENTU_SUPERIOR_VILLAGE_EB_SUN_FRI_2026',  'LEGACY_YENTU', '레거시 옌뜨, MGALLERY 호텔', 'SUPERIOR_VILLAGE_VIEW', '슈페리어 빌리지뷰 객실', 'STANDARD', NULL, true, 3645000, 1755000, NULL, '2026 얼리버드 · 일~금', DATE '2026-01-01', DATE '2026-12-31', '일,월,화,수,목,금', 30, NULL, '조식 포함. 넓은 정원 뷰. 체크인 30일 전 이상 예약 적용.'),
('LEGACY_YENTU_SUPERIOR_VILLAGE_EB_SAT_2026',      'LEGACY_YENTU', '레거시 옌뜨, MGALLERY 호텔', 'SUPERIOR_VILLAGE_VIEW', '슈페리어 빌리지뷰 객실', 'STANDARD', NULL, true, 4545000, 1755000, NULL, '2026 얼리버드 · 토',    DATE '2026-01-01', DATE '2026-12-31', '토',                 30, NULL, '조식 포함. 넓은 정원 뷰. 체크인 30일 전 이상 예약 적용.'),
-- 디럭스 포레스트뷰
('LEGACY_YENTU_DELUXE_FOREST_STD_SUN_FRI_2026', 'LEGACY_YENTU', '레거시 옌뜨, MGALLERY 호텔', 'DELUXE_FOREST_VIEW', '디럭스 포레스트뷰 객실', 'STANDARD', NULL, true, 4250000, 1950000, NULL, '2026 일반요금 · 일~금', DATE '2026-01-01', DATE '2026-12-31', '일,월,화,수,목,금', 0, 29, '조식 포함. 포레스트 뷰, VIP 웰컴 어메니티 세트. 체크인 30일 전 미만 예약 적용.'),
('LEGACY_YENTU_DELUXE_FOREST_STD_SAT_2026',     'LEGACY_YENTU', '레거시 옌뜨, MGALLERY 호텔', 'DELUXE_FOREST_VIEW', '디럭스 포레스트뷰 객실', 'STANDARD', NULL, true, 5250000, 1950000, NULL, '2026 일반요금 · 토',    DATE '2026-01-01', DATE '2026-12-31', '토',                 0, 29, '조식 포함. 포레스트 뷰, VIP 웰컴 어메니티 세트. 체크인 30일 전 미만 예약 적용.'),
('LEGACY_YENTU_DELUXE_FOREST_EB_SUN_FRI_2026',  'LEGACY_YENTU', '레거시 옌뜨, MGALLERY 호텔', 'DELUXE_FOREST_VIEW', '디럭스 포레스트뷰 객실', 'STANDARD', NULL, true, 3825000, 1755000, NULL, '2026 얼리버드 · 일~금', DATE '2026-01-01', DATE '2026-12-31', '일,월,화,수,목,금', 30, NULL, '조식 포함. 포레스트 뷰, VIP 웰컴 어메니티 세트. 체크인 30일 전 이상 예약 적용.'),
('LEGACY_YENTU_DELUXE_FOREST_EB_SAT_2026',      'LEGACY_YENTU', '레거시 옌뜨, MGALLERY 호텔', 'DELUXE_FOREST_VIEW', '디럭스 포레스트뷰 객실', 'STANDARD', NULL, true, 4725000, 1755000, NULL, '2026 얼리버드 · 토',    DATE '2026-01-01', DATE '2026-12-31', '토',                 30, NULL, '조식 포함. 포레스트 뷰, VIP 웰컴 어메니티 세트. 체크인 30일 전 이상 예약 적용.'),
-- 디럭스 빌리지뷰
('LEGACY_YENTU_DELUXE_VILLAGE_STD_SUN_FRI_2026', 'LEGACY_YENTU', '레거시 옌뜨, MGALLERY 호텔', 'DELUXE_VILLAGE_VIEW', '디럭스 빌리지뷰 객실', 'STANDARD', NULL, true, 4550000, 1950000, NULL, '2026 일반요금 · 일~금', DATE '2026-01-01', DATE '2026-12-31', '일,월,화,수,목,금', 0, 29, '조식 포함. 넓은 정원 뷰. 체크인 30일 전 미만 예약 적용.'),
('LEGACY_YENTU_DELUXE_VILLAGE_STD_SAT_2026',     'LEGACY_YENTU', '레거시 옌뜨, MGALLERY 호텔', 'DELUXE_VILLAGE_VIEW', '디럭스 빌리지뷰 객실', 'STANDARD', NULL, true, 5550000, 1950000, NULL, '2026 일반요금 · 토',    DATE '2026-01-01', DATE '2026-12-31', '토',                 0, 29, '조식 포함. 넓은 정원 뷰. 체크인 30일 전 미만 예약 적용.'),
('LEGACY_YENTU_DELUXE_VILLAGE_EB_SUN_FRI_2026',  'LEGACY_YENTU', '레거시 옌뜨, MGALLERY 호텔', 'DELUXE_VILLAGE_VIEW', '디럭스 빌리지뷰 객실', 'STANDARD', NULL, true, 4095000, 1755000, NULL, '2026 얼리버드 · 일~금', DATE '2026-01-01', DATE '2026-12-31', '일,월,화,수,목,금', 30, NULL, '조식 포함. 넓은 정원 뷰. 체크인 30일 전 이상 예약 적용.'),
('LEGACY_YENTU_DELUXE_VILLAGE_EB_SAT_2026',      'LEGACY_YENTU', '레거시 옌뜨, MGALLERY 호텔', 'DELUXE_VILLAGE_VIEW', '디럭스 빌리지뷰 객실', 'STANDARD', NULL, true, 4995000, 1755000, NULL, '2026 얼리버드 · 토',    DATE '2026-01-01', DATE '2026-12-31', '토',                 30, NULL, '조식 포함. 넓은 정원 뷰. 체크인 30일 전 이상 예약 적용.'),
-- 디럭스 가든 POOL뷰
('LEGACY_YENTU_DELUXE_POOL_STD_SUN_FRI_2026', 'LEGACY_YENTU', '레거시 옌뜨, MGALLERY 호텔', 'DELUXE_POOL_VIEW', '디럭스 POOL 뷰 객실', 'STANDARD', NULL, true, 5250000, 1950000, NULL, '2026 일반요금 · 일~금', DATE '2026-01-01', DATE '2026-12-31', '일,월,화,수,목,금', 0, 29, '조식 포함. 가든 POOL 뷰, VIP 웰컴 어메니티 세트 및 AM웰니스 센터 2인 30분 클렌징 테라피. 체크인 30일 전 미만 예약 적용.'),
('LEGACY_YENTU_DELUXE_POOL_STD_SAT_2026',     'LEGACY_YENTU', '레거시 옌뜨, MGALLERY 호텔', 'DELUXE_POOL_VIEW', '디럭스 POOL 뷰 객실', 'STANDARD', NULL, true, 6250000, 1950000, NULL, '2026 일반요금 · 토',    DATE '2026-01-01', DATE '2026-12-31', '토',                 0, 29, '조식 포함. 가든 POOL 뷰, VIP 웰컴 어메니티 세트 및 AM웰니스 센터 2인 30분 클렌징 테라피. 체크인 30일 전 미만 예약 적용.'),
('LEGACY_YENTU_DELUXE_POOL_EB_SUN_FRI_2026',  'LEGACY_YENTU', '레거시 옌뜨, MGALLERY 호텔', 'DELUXE_POOL_VIEW', '디럭스 POOL 뷰 객실', 'STANDARD', NULL, true, 4725000, 1755000, NULL, '2026 얼리버드 · 일~금', DATE '2026-01-01', DATE '2026-12-31', '일,월,화,수,목,금', 30, NULL, '조식 포함. 가든 POOL 뷰, VIP 웰컴 어메니티 세트 및 AM웰니스 센터 2인 30분 클렌징 테라피. 체크인 30일 전 이상 예약 적용.'),
('LEGACY_YENTU_DELUXE_POOL_EB_SAT_2026',      'LEGACY_YENTU', '레거시 옌뜨, MGALLERY 호텔', 'DELUXE_POOL_VIEW', '디럭스 POOL 뷰 객실', 'STANDARD', NULL, true, 5625000, 1755000, NULL, '2026 얼리버드 · 토',    DATE '2026-01-01', DATE '2026-12-31', '토',                 30, NULL, '조식 포함. 가든 POOL 뷰, VIP 웰컴 어메니티 세트 및 AM웰니스 센터 2인 30분 클렌징 테라피. 체크인 30일 전 이상 예약 적용.'),
-- 주니어 스위트 포레스트뷰
('LEGACY_YENTU_JUNIOR_SUITE_FOREST_STD_SUN_FRI_2026', 'LEGACY_YENTU', '레거시 옌뜨, MGALLERY 호텔', 'JUNIOR_SUITE_FOREST_VIEW', '주니어 스위트 포레스트뷰 객실', 'SUITE', NULL, true, 5750000, 1950000, NULL, '2026 일반요금 · 일~금', DATE '2026-01-01', DATE '2026-12-31', '일,월,화,수,목,금', 0, 29, '조식 포함. 객실 내 조식 요청, 가능 시 얼리 체크인/레이트 체크아웃, 무료 미니바(주류 제외), 애프터눈 티, 1박당 세탁 5벌, AM 웰리스 센터 2인 60분 클렌징 테라피 포함. 체크인 30일 전 미만 예약 적용.'),
('LEGACY_YENTU_JUNIOR_SUITE_FOREST_STD_SAT_2026',     'LEGACY_YENTU', '레거시 옌뜨, MGALLERY 호텔', 'JUNIOR_SUITE_FOREST_VIEW', '주니어 스위트 포레스트뷰 객실', 'SUITE', NULL, true, 6750000, 1950000, NULL, '2026 일반요금 · 토',    DATE '2026-01-01', DATE '2026-12-31', '토',                 0, 29, '조식 포함. 객실 특전은 일~금 요금 행과 동일. 체크인 30일 전 미만 예약 적용.'),
('LEGACY_YENTU_JUNIOR_SUITE_FOREST_EB_SUN_FRI_2026',  'LEGACY_YENTU', '레거시 옌뜨, MGALLERY 호텔', 'JUNIOR_SUITE_FOREST_VIEW', '주니어 스위트 포레스트뷰 객실', 'SUITE', NULL, true, 5175000, 1755000, NULL, '2026 얼리버드 · 일~금', DATE '2026-01-01', DATE '2026-12-31', '일,월,화,수,목,금', 30, NULL, '조식 포함. 객실 특전은 일반요금과 동일. 체크인 30일 전 이상 예약 적용.'),
('LEGACY_YENTU_JUNIOR_SUITE_FOREST_EB_SAT_2026',      'LEGACY_YENTU', '레거시 옌뜨, MGALLERY 호텔', 'JUNIOR_SUITE_FOREST_VIEW', '주니어 스위트 포레스트뷰 객실', 'SUITE', NULL, true, 6075000, 1755000, NULL, '2026 얼리버드 · 토',    DATE '2026-01-01', DATE '2026-12-31', '토',                 30, NULL, '조식 포함. 객실 특전은 일반요금과 동일. 체크인 30일 전 이상 예약 적용.'),
-- 주니어 스위트 가든 POOL뷰
('LEGACY_YENTU_JUNIOR_SUITE_POOL_STD_SUN_FRI_2026', 'LEGACY_YENTU', '레거시 옌뜨, MGALLERY 호텔', 'JUNIOR_SUITE_POOL_VIEW', '주니어 스위트 POOL 뷰 객실', 'SUITE', NULL, true, 6950000, 1950000, NULL, '2026 일반요금 · 일~금', DATE '2026-01-01', DATE '2026-12-31', '일,월,화,수,목,금', 0, 29, '조식 포함. 객실 내 조식 요청, 가능 시 얼리 체크인/레이트 체크아웃, 무료 미니바(주류 제외), 애프터눈 티, 1박당 세탁 5벌, AM 웰리스 센터 2인 60분 클렌징 테라피 포함. 체크인 30일 전 미만 예약 적용.'),
('LEGACY_YENTU_JUNIOR_SUITE_POOL_STD_SAT_2026',     'LEGACY_YENTU', '레거시 옌뜨, MGALLERY 호텔', 'JUNIOR_SUITE_POOL_VIEW', '주니어 스위트 POOL 뷰 객실', 'SUITE', NULL, true, 7950000, 1950000, NULL, '2026 일반요금 · 토',    DATE '2026-01-01', DATE '2026-12-31', '토',                 0, 29, '조식 포함. 객실 특전은 일~금 요금 행과 동일. 체크인 30일 전 미만 예약 적용.'),
('LEGACY_YENTU_JUNIOR_SUITE_POOL_EB_SUN_FRI_2026',  'LEGACY_YENTU', '레거시 옌뜨, MGALLERY 호텔', 'JUNIOR_SUITE_POOL_VIEW', '주니어 스위트 POOL 뷰 객실', 'SUITE', NULL, true, 6255000, 1755000, NULL, '2026 얼리버드 · 일~금', DATE '2026-01-01', DATE '2026-12-31', '일,월,화,수,목,금', 30, NULL, '조식 포함. 객실 특전은 일반요금과 동일. 체크인 30일 전 이상 예약 적용.'),
('LEGACY_YENTU_JUNIOR_SUITE_POOL_EB_SAT_2026',      'LEGACY_YENTU', '레거시 옌뜨, MGALLERY 호텔', 'JUNIOR_SUITE_POOL_VIEW', '주니어 스위트 POOL 뷰 객실', 'SUITE', NULL, true, 7155000, 1755000, NULL, '2026 얼리버드 · 토',    DATE '2026-01-01', DATE '2026-12-31', '토',                 30, NULL, '조식 포함. 객실 특전은 일반요금과 동일. 체크인 30일 전 이상 예약 적용.');

CREATE OR REPLACE FUNCTION public.get_legacy_yentu_price(
  p_room_type text,
  p_checkin_date date,
  p_booking_date date DEFAULT current_date
)
RETURNS TABLE (
  hotel_price_code text,
  room_name text,
  base_price numeric,
  extra_person_price numeric,
  season_name text,
  booking_advance_days integer
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    hp.hotel_price_code,
    hp.room_name,
    hp.base_price,
    hp.extra_person_price,
    hp.season_name,
    (p_checkin_date - p_booking_date)::integer AS booking_advance_days
  FROM public.hotel_price AS hp
  WHERE hp.hotel_code = 'LEGACY_YENTU'
    AND hp.room_type = p_room_type
    AND p_checkin_date BETWEEN hp.start_date AND hp.end_date
    AND (p_checkin_date - p_booking_date) >= hp.booking_advance_days_min
    AND (hp.booking_advance_days_max IS NULL OR (p_checkin_date - p_booking_date) <= hp.booking_advance_days_max)
    AND hp.weekday_type = CASE WHEN EXTRACT(DOW FROM p_checkin_date) = 6 THEN '토' ELSE '일,월,화,수,목,금' END
  ORDER BY hp.booking_advance_days_min DESC, hp.base_price
  LIMIT 1;
$$;

COMMIT;

-- 검증: 2026-10-10은 토요일. 2026-09-10 예약은 정확히 30일 전이므로 얼리버드가 선택되어야 한다.
SELECT * FROM public.get_legacy_yentu_price('SUPERIOR_FOREST_VIEW', DATE '2026-10-10', DATE '2026-09-10');

-- 일반요금 검증: 29일 전 예약이므로 일반요금이 선택되어야 한다.
SELECT * FROM public.get_legacy_yentu_price('SUPERIOR_FOREST_VIEW', DATE '2026-10-10', DATE '2026-09-11');
