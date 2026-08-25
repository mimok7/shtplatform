-- 레거시 옌뜨, MGALLERY 호텔 프레지덴셜 스위트 요금 추가 (2026-08-25)
-- ============================================================================
-- 선행 실행: 125-legacy-yen-tu-mgallery-hotel-20260821.sql,
--            127-legacy-yentu-mgallery-rates-earlybird-20260821.sql
--
-- 127번 요금 교체 시 PRESIDENTIAL_SUITE 행이 누락되어 hotel_price에서
-- 사라진 상태였습니다. 원문에 없던 실제 금액(12,300,000동)을 반영해
-- 단일 요금 행으로 등록합니다.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.hotel_info WHERE hotel_code = 'LEGACY_YENTU') THEN
    RAISE EXCEPTION 'LEGACY_YENTU 호텔이 없습니다. 125-legacy-yen-tu-mgallery-hotel-20260821.sql을 먼저 실행하세요.';
  END IF;
END $$;

WITH source_rows AS (
  SELECT *
  FROM (VALUES (
    'LEGACY_YENTU_PRESIDENTIAL_SUITE_2026'::text,
    'LEGACY_YENTU'::text,
    '레거시 옌뜨, MGALLERY 호텔'::text,
    'PRESIDENTIAL_SUITE'::text,
    '프레지덴셜 스위트'::text,
    'SUITE'::text,
    true::boolean,
    12300000::numeric,
    NULL::numeric,
    NULL::text,
    '2026 일반요금'::text,
    DATE '2026-01-01',
    DATE '2026-12-31',
    'ALL'::text,
    0::integer,
    NULL::integer,
    '수영장이 보이는 뷰. 조식 포함.'::text
  )) AS v(
    hotel_price_code, hotel_code, hotel_name, room_type, room_name, room_category,
    include_breakfast, base_price, extra_person_price, child_policy,
    season_name, start_date, end_date, weekday_type,
    booking_advance_days_min, booking_advance_days_max, notes
  )
)
INSERT INTO public.hotel_price (
  hotel_price_code, hotel_code, hotel_name, room_type, room_name, room_category,
  include_breakfast, base_price, extra_person_price, child_policy,
  season_name, start_date, end_date, weekday_type,
  booking_advance_days_min, booking_advance_days_max, notes
)
SELECT
  s.hotel_price_code, s.hotel_code, s.hotel_name, s.room_type, s.room_name, s.room_category,
  s.include_breakfast, s.base_price, s.extra_person_price, s.child_policy,
  s.season_name, s.start_date, s.end_date, s.weekday_type,
  s.booking_advance_days_min, s.booking_advance_days_max, s.notes
FROM source_rows s
WHERE NOT EXISTS (
  SELECT 1 FROM public.hotel_price hp WHERE hp.hotel_price_code = s.hotel_price_code
)
RETURNING *;

COMMIT;

-- 검증: 프레지덴셜 스위트 요금 등록 확인
SELECT hotel_price_code, room_type, room_name, base_price, weekday_type, notes
FROM public.hotel_price
WHERE hotel_code = 'LEGACY_YENTU' AND room_type = 'PRESIDENTIAL_SUITE';
