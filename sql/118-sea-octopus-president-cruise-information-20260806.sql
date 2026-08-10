-- 씨옥토퍼스 프레지던트 크루즈의 안내·당일 상품·선착장 지도·요금별 포함사항을 추가하고 누락 정보를 점검하는 스크립트
-- 근거: 2026-08-05 네이버 카페 게시글. 원문에 없는 객실 면적·사진·정원·취소 규정은 임의로 등록하지 않는다.

BEGIN;

DO $$
DECLARE
  rate_count integer;
BEGIN
  SELECT COUNT(*)
  INTO rate_count
  FROM public.cruise_rate_card
  WHERE cruise_name = '씨옥토퍼스 프레지던트 크루즈'
    AND schedule_type = 'DAY'
    AND is_active IS TRUE
    AND (
      (valid_year = 2026::integer AND valid_from = DATE '2026-08-01' AND valid_to = DATE '2026-12-31')
      OR (valid_year = 2027::integer AND valid_from = DATE '2027-01-01' AND valid_to = DATE '2027-12-31')
    );

  IF rate_count <> 4 THEN
    RAISE EXCEPTION '요금표 4행이 필요합니다. 현재 %행입니다. 116 요금 SQL을 먼저 실행하세요.', rate_count;
  END IF;
END $$;

-- 당일 투어 상품 안내. 숙박 객실 정보는 원문 미제공이므로 단일 당일 상품으로만 등록한다.
WITH source_rows AS (
  SELECT
    'SOP-DAY-TOUR'::text AS cruise_code,
    'SEA OCTOPUS PRESIDENT CRUISE'::text AS name,
    '하롱베이 5성급 씨옥토퍼스 프레지던트 크루즈 당일 투어. 하노이 왕복 셔틀 포함 또는 티켓 단독으로 이용 가능.'::text AS description,
    '당일'::text AS duration,
    '["웰컴드링크", "조식", "점심식사", "카약 또는 뱀부보트", "애프터눈티 세트", "크루즈 직원 영어 가이드", "선상안전보험"]'::jsonb AS features,
    1300000::numeric AS base_price,
    '데이크루즈'::text AS category,
    '씨옥토퍼스 프레지던트 크루즈'::text AS cruise_name,
    '당일 투어 상품'::text AS room_name,
    '객실 숙박이 아닌 당일 투어 상품입니다. 원문에 객실 면적·사진·정원 정보가 없어 별도 객실 안내는 등록하지 않습니다.'::text AS room_description,
    1::integer AS max_adults,
    1::integer AS max_guests,
    false AS has_balcony,
    false AS is_vip,
    false AS has_butler,
    true AS is_recommended,
    false AS connecting_available,
    false AS extra_bed_available,
    'VIP 라운지는 별도 결제. 객실 면적·사진·정원은 원문 미제공.'::text AS special_amenities,
    '서호 지역 픽업 또는 드랍은 편도·팀당 약 500,000동 추가. 차량은 9인승 또는 11인승 리무진의 잔여 좌석 이용. 투어 일정은 기상·관광지·투어 인원 사정에 따라 변경될 수 있음.'::text AS warnings,
    '[{"day":1,"title":"당일 일정","schedule":[{"time":"06:00","activity":"하노이 호안끼엠 지역 호텔 픽업"},{"time":"08:30","activity":"하롱베이 도착 및 승선 안내"},{"time":"09:00","activity":"크루즈 승선 및 웰컴드링크"},{"time":"오전","activity":"외부 투어 프로그램 및 카약 또는 뱀부보트"},{"time":"점심","activity":"점심식사"},{"time":"오후","activity":"애프터눈티 세트"},{"time":"19:00","activity":"하노이 복귀 및 도착"}]}]'::jsonb AS itinerary,
    '웰컴드링크, 조식, 점심식사, 외부 투어 프로그램, 카약 또는 뱀부보트, 애프터눈티 세트, 크루즈 직원 영어 가이드, 선상안전보험'::text AS inclusions,
    '음료 및 주류, 항공권 및 호텔 숙박, VIP 라운지, 서호 지역 픽업 또는 드랍 추가요금'::text AS exclusions,
    '5성급'::text AS star_rating,
    '["레스토랑", "외부 투어 프로그램", "카약 또는 뱀부보트", "애프터눈티", "VIP 라운지 별도 결제"]'::jsonb AS facilities,
    1::integer AS display_order
)
INSERT INTO public.cruise_info (
  cruise_code, name, description, duration, features, base_price, category, cruise_name,
  room_name, room_description, max_adults, max_guests, has_balcony, is_vip, has_butler,
  is_recommended, connecting_available, extra_bed_available, special_amenities, warnings,
  itinerary, inclusions, exclusions, star_rating, facilities, display_order
)
SELECT
  cruise_code, name, description, duration, features, base_price, category, cruise_name,
  room_name, room_description, max_adults, max_guests, has_balcony, is_vip, has_butler,
  is_recommended, connecting_available, extra_bed_available, special_amenities, warnings,
  itinerary, inclusions, exclusions, star_rating, facilities, display_order
FROM source_rows AS source
WHERE NOT EXISTS (
  SELECT 1
  FROM public.cruise_info AS existing
  WHERE existing.cruise_code = source.cruise_code
)
RETURNING cruise_code, cruise_name, room_name, category, base_price, star_rating;

-- 원문 지도 링크만 등록한다. 선착장 주소는 원문에 없으므로 NULL 유지.
WITH source_rows AS (
  SELECT
    'Sea Octopus President Cruise'::text AS en_name,
    '씨옥토퍼스 프레지던트 크루즈'::text AS kr_name,
    NULL::text AS pier_location,
    'https://maps.app.goo.gl/Libu7Qim8ctiLGoG8'::text AS pier_map_url,
    'https://cafe.naver.com/f-e/cafes/31003053/articles/13478?boardtype=L&menuid=807&referrerAllArticles=false'::text AS tour_schedule_url,
    '개별 이동 시 08:20까지 28번 씨옥토퍼스 크루즈 체크인 포인트에서 체크인. 셔틀 이용 시 바로 승선 안내.'::text AS details
)
INSERT INTO public.cruise_location (en_name, kr_name, pier_location, pier_map_url, tour_schedule_url, details)
SELECT en_name, kr_name, pier_location, pier_map_url, tour_schedule_url, details
FROM source_rows AS source
WHERE NOT EXISTS (
  SELECT 1
  FROM public.cruise_location AS existing
  WHERE existing.kr_name = source.kr_name
)
RETURNING kr_name, pier_location, pier_map_url, tour_schedule_url;

-- 2026·2027 요금표 각 행에 포함사항을 연결한다.
WITH rate_cards AS (
  SELECT id
  FROM public.cruise_rate_card
  WHERE cruise_name = '씨옥토퍼스 프레지던트 크루즈'
    AND schedule_type = 'DAY'
    AND is_active IS TRUE
    AND (
      (valid_year = 2026::integer AND valid_from = DATE '2026-08-01' AND valid_to = DATE '2026-12-31')
      OR (valid_year = 2027::integer AND valid_from = DATE '2027-01-01' AND valid_to = DATE '2027-12-31')
    )
), inclusion_rows AS (
  SELECT *
  FROM (
    VALUES
      (1::integer, '웰컴드링크'::text),
      (2::integer, '조식'::text),
      (3::integer, '점심식사'::text),
      (4::integer, '외부 투어 프로그램 일체'::text),
      (5::integer, '카약 또는 뱀부보트'::text),
      (6::integer, '애프터눈티 세트'::text),
      (7::integer, '크루즈 직원 영어 가이드'::text),
      (8::integer, '선상안전보험'::text)
  ) AS v(display_order, inclusion_text)
), source_rows AS (
  SELECT rate_cards.id AS rate_card_id, inclusion_rows.inclusion_text, inclusion_rows.display_order
  FROM rate_cards
  CROSS JOIN inclusion_rows
)
INSERT INTO public.cruise_rate_card_inclusions (rate_card_id, inclusion_text, display_order)
SELECT rate_card_id, inclusion_text, display_order
FROM source_rows AS source
WHERE NOT EXISTS (
  SELECT 1
  FROM public.cruise_rate_card_inclusions AS existing
  WHERE existing.rate_card_id = source.rate_card_id
    AND existing.inclusion_text = source.inclusion_text
)
RETURNING rate_card_id, inclusion_text, display_order;

-- 등록 현황과 원문 미제공 항목을 함께 점검한다.
SELECT
  (SELECT COUNT(*) FROM public.cruise_info WHERE cruise_name = '씨옥토퍼스 프레지던트 크루즈') AS cruise_info_rows,
  (SELECT COUNT(*) FROM public.cruise_location WHERE kr_name = '씨옥토퍼스 프레지던트 크루즈') AS cruise_location_rows,
  (SELECT COUNT(*) FROM public.cruise_rate_card WHERE cruise_name = '씨옥토퍼스 프레지던트 크루즈' AND schedule_type = 'DAY') AS rate_card_rows,
  (SELECT COUNT(*) FROM public.cruise_rate_card_inclusions AS cri JOIN public.cruise_rate_card AS crc ON crc.id = cri.rate_card_id WHERE crc.cruise_name = '씨옥토퍼스 프레지던트 크루즈') AS rate_inclusion_rows,
  (SELECT COUNT(*) FROM public.cruise_tour_options WHERE cruise_name = '씨옥토퍼스 프레지던트 크루즈') AS tour_option_rows;

SELECT
  cruise_code,
  cruise_name,
  room_name,
  room_area,
  room_image,
  capacity,
  cancellation_policy,
  CASE
    WHEN room_area IS NULL AND room_image IS NULL AND capacity IS NULL AND cancellation_policy IS NULL
      THEN '원문 미제공 정보. 객실 면적·사진·정원·취소 규정 확인 후 별도 보완 필요.'
    ELSE '등록 정보 확인 필요.'
  END AS review_note
FROM public.cruise_info
WHERE cruise_name = '씨옥토퍼스 프레지던트 크루즈'
ORDER BY display_order, cruise_code;

COMMIT;