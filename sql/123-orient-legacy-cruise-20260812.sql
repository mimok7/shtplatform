-- 오리엔트 레거시 크루즈의 객실·시즌 요금·휴일 추가요금·안내·선착장 정보를 추가하는 스크립트
-- 근거: 2026-08-11 네이버 카페 게시글 13557.
-- 원문에 없는 객실 면적·사진·정원·상세 일정·일반 취소 위약금은 임의로 등록하지 않는다.

BEGIN;

-- 8개 객실의 2개 원문 시즌 요금. 연도 필터 호환을 위해 두 번째 시즌을 연도별로 나눈다.
WITH source_rows AS (
  SELECT *
  FROM (
    VALUES
      ('하롱 디럭스'::text, 'Halong Deluxe'::text, 3700000::numeric, 2800000::numeric, 3150000::numeric, 3700000::numeric, 6150000::numeric, 2026::integer, DATE '2026-08-01', DATE '2026-10-15', '2026 늦여름·가을'::text, 1::integer),
      ('하롱 디럭스'::text, 'Halong Deluxe'::text, 4325000::numeric, 3250000::numeric, 3700000::numeric, 4325000::numeric, 7100000::numeric, 2026::integer, DATE '2026-10-16', DATE '2026-12-31', '2026-2027 겨울·봄'::text, 1::integer),
      ('하롱 디럭스'::text, 'Halong Deluxe'::text, 4325000::numeric, 3250000::numeric, 3700000::numeric, 4325000::numeric, 7100000::numeric, 2027::integer, DATE '2027-01-01', DATE '2027-04-30', '2026-2027 겨울·봄'::text, 1::integer),
      ('파이포 디럭스'::text, 'Faifo Deluxe'::text, 3700000::numeric, 2800000::numeric, 3150000::numeric, 3700000::numeric, 6150000::numeric, 2026::integer, DATE '2026-08-01', DATE '2026-10-15', '2026 늦여름·가을'::text, 2::integer),
      ('파이포 디럭스'::text, 'Faifo Deluxe'::text, 4325000::numeric, 3250000::numeric, 3700000::numeric, 4325000::numeric, 7100000::numeric, 2026::integer, DATE '2026-10-16', DATE '2026-12-31', '2026-2027 겨울·봄'::text, 2::integer),
      ('파이포 디럭스'::text, 'Faifo Deluxe'::text, 4325000::numeric, 3250000::numeric, 3700000::numeric, 4325000::numeric, 7100000::numeric, 2027::integer, DATE '2027-01-01', DATE '2027-04-30', '2026-2027 겨울·봄'::text, 2::integer),
      ('파이포 스위트'::text, 'Faifo Suite'::text, 3975000::numeric, 3000000::numeric, 3375000::numeric, 3975000::numeric, 6600000::numeric, 2026::integer, DATE '2026-08-01', DATE '2026-10-15', '2026 늦여름·가을'::text, 3::integer),
      ('파이포 스위트'::text, 'Faifo Suite'::text, 4650000::numeric, 3475000::numeric, 3900000::numeric, 4650000::numeric, 7700000::numeric, 2026::integer, DATE '2026-10-16', DATE '2026-12-31', '2026-2027 겨울·봄'::text, 3::integer),
      ('파이포 스위트'::text, 'Faifo Suite'::text, 4650000::numeric, 3475000::numeric, 3900000::numeric, 4650000::numeric, 7700000::numeric, 2027::integer, DATE '2027-01-01', DATE '2027-04-30', '2026-2027 겨울·봄'::text, 3::integer),
      ('파이포 그랜드'::text, 'Faifo Grand'::text, 4850000::numeric, 3650000::numeric, 4125000::numeric, 4850000::numeric, 8000000::numeric, 2026::integer, DATE '2026-08-01', DATE '2026-10-15', '2026 늦여름·가을'::text, 4::integer),
      ('파이포 그랜드'::text, 'Faifo Grand'::text, 5675000::numeric, 4250000::numeric, 4825000::numeric, 5675000::numeric, 9300000::numeric, 2026::integer, DATE '2026-10-16', DATE '2026-12-31', '2026-2027 겨울·봄'::text, 4::integer),
      ('파이포 그랜드'::text, 'Faifo Grand'::text, 5675000::numeric, 4250000::numeric, 4825000::numeric, 5675000::numeric, 9300000::numeric, 2027::integer, DATE '2027-01-01', DATE '2027-04-30', '2026-2027 겨울·봄'::text, 4::integer),
      ('파이포 레전드'::text, 'Faifo Legend'::text, 6350000::numeric, 4775000::numeric, 5375000::numeric, 6350000::numeric, 10400000::numeric, 2026::integer, DATE '2026-08-01', DATE '2026-10-15', '2026 늦여름·가을'::text, 5::integer),
      ('파이포 레전드'::text, 'Faifo Legend'::text, 7425000::numeric, 5575000::numeric, 6325000::numeric, 7425000::numeric, 12100000::numeric, 2026::integer, DATE '2026-10-16', DATE '2026-12-31', '2026-2027 겨울·봄'::text, 5::integer),
      ('파이포 레전드'::text, 'Faifo Legend'::text, 7425000::numeric, 5575000::numeric, 6325000::numeric, 7425000::numeric, 12100000::numeric, 2027::integer, DATE '2027-01-01', DATE '2027-04-30', '2026-2027 겨울·봄'::text, 5::integer),
      ('사이공 스위트'::text, 'Saigon Suite'::text, 4425000::numeric, 3325000::numeric, 3750000::numeric, 4425000::numeric, 7300000::numeric, 2026::integer, DATE '2026-08-01', DATE '2026-10-15', '2026 늦여름·가을'::text, 6::integer),
      ('사이공 스위트'::text, 'Saigon Suite'::text, 5150000::numeric, 3875000::numeric, 4400000::numeric, 5150000::numeric, 8450000::numeric, 2026::integer, DATE '2026-10-16', DATE '2026-12-31', '2026-2027 겨울·봄'::text, 6::integer),
      ('사이공 스위트'::text, 'Saigon Suite'::text, 5150000::numeric, 3875000::numeric, 4400000::numeric, 5150000::numeric, 8450000::numeric, 2027::integer, DATE '2027-01-01', DATE '2027-04-30', '2026-2027 겨울·봄'::text, 6::integer),
      ('사이공 그랜드'::text, 'Saigon Grand'::text, 4850000::numeric, 3650000::numeric, 4125000::numeric, 4850000::numeric, 8000000::numeric, 2026::integer, DATE '2026-08-01', DATE '2026-10-15', '2026 늦여름·가을'::text, 7::integer),
      ('사이공 그랜드'::text, 'Saigon Grand'::text, 5700000::numeric, 4275000::numeric, 4850000::numeric, 5700000::numeric, 9300000::numeric, 2026::integer, DATE '2026-10-16', DATE '2026-12-31', '2026-2027 겨울·봄'::text, 7::integer),
      ('사이공 그랜드'::text, 'Saigon Grand'::text, 5700000::numeric, 4275000::numeric, 4850000::numeric, 5700000::numeric, 9300000::numeric, 2027::integer, DATE '2027-01-01', DATE '2027-04-30', '2026-2027 겨울·봄'::text, 7::integer),
      ('사이공 레거시'::text, 'Saigon Legacy'::text, 9000000::numeric, 6750000::numeric, 7650000::numeric, 9000000::numeric, 14700000::numeric, 2026::integer, DATE '2026-08-01', DATE '2026-10-15', '2026 늦여름·가을'::text, 8::integer),
      ('사이공 레거시'::text, 'Saigon Legacy'::text, 10700000::numeric, 7925000::numeric, 8950000::numeric, 10700000::numeric, 17200000::numeric, 2026::integer, DATE '2026-10-16', DATE '2026-12-31', '2026-2027 겨울·봄'::text, 8::integer),
      ('사이공 레거시'::text, 'Saigon Legacy'::text, 10700000::numeric, 7925000::numeric, 8950000::numeric, 10700000::numeric, 17200000::numeric, 2027::integer, DATE '2027-01-01', DATE '2027-04-30', '2026-2027 겨울·봄'::text, 8::integer)
  ) AS v (
    room_type, room_type_en, price_adult, price_child, price_child_extra_bed,
    price_extra_bed, price_single, valid_year, valid_from, valid_to, season_name, display_order
  )
)
INSERT INTO public.cruise_rate_card (
  cruise_name, schedule_type, room_type, room_type_en,
  price_adult, price_child, price_infant, price_extra_bed, price_single,
  valid_year, valid_from, valid_to, display_order, currency, is_active, notes,
  price_child_extra_bed, extra_bed_available, includes_vehicle, vehicle_type,
  infant_policy, season_name, is_promotion, price_child_older,
  child_age_range, single_available
)
SELECT
  '오리엔트 레거시 크루즈'::text,
  '1N2D'::text,
  source.room_type,
  source.room_type_en,
  source.price_adult,
  source.price_child,
  1500000::numeric,
  source.price_extra_bed,
  source.price_single,
  source.valid_year,
  source.valid_from,
  source.valid_to,
  source.display_order,
  'VND'::text,
  true::boolean,
  '성인 2인 기준 1인당 요금. 5~11세는 아동요금이며 12세부터 성인요금. 일부 원문 표에는 아동 엑스트라 연령이 5~10세로 표기됨. 성인 1인+아동 1인 사용 시 아동도 성인요금 적용. 승선 5일 전부터 신규 예약 불가. 선착장 이동차량 불포함.'::text,
  source.price_child_extra_bed,
  true::boolean,
  false::boolean,
  NULL::text,
  '성인 2인+5세 미만 아동 1인은 무료. 5세 미만 아동 2인 동반 시 두 번째 유아에 1,500,000동 추가. 가격 계산기가 첫 유아를 제외한 인원에 price_infant를 적용한다.'::text,
  source.season_name,
  false::boolean,
  source.price_child,
  '5-11세'::text,
  true::boolean
FROM source_rows AS source
WHERE NOT EXISTS (
  SELECT 1
  FROM public.cruise_rate_card AS existing
  WHERE existing.cruise_name = '오리엔트 레거시 크루즈'
    AND existing.schedule_type = '1N2D'
    AND existing.room_type = source.room_type
    AND existing.valid_year = source.valid_year
    AND existing.valid_from = source.valid_from
    AND existing.valid_to = source.valid_to
)
RETURNING
  cruise_name, room_type, valid_from, valid_to,
  price_adult, price_child, price_child_extra_bed, price_extra_bed, price_single;

-- 목록과 상세 화면에 노출할 객실 안내. 확인되지 않은 물리 속성은 NULL로 유지한다.
WITH source_rows AS (
  SELECT *
  FROM (
    VALUES
      ('ORIENT-LEGACY-HALONG-DELUXE'::text, '하롱 디럭스'::text, 3700000::numeric, 1::integer),
      ('ORIENT-LEGACY-FAIFO-DELUXE'::text, '파이포 디럭스'::text, 3700000::numeric, 2::integer),
      ('ORIENT-LEGACY-FAIFO-SUITE'::text, '파이포 스위트'::text, 3975000::numeric, 3::integer),
      ('ORIENT-LEGACY-FAIFO-GRAND'::text, '파이포 그랜드'::text, 4850000::numeric, 4::integer),
      ('ORIENT-LEGACY-FAIFO-LEGEND'::text, '파이포 레전드'::text, 6350000::numeric, 5::integer),
      ('ORIENT-LEGACY-SAIGON-SUITE'::text, '사이공 스위트'::text, 4425000::numeric, 6::integer),
      ('ORIENT-LEGACY-SAIGON-GRAND'::text, '사이공 그랜드'::text, 4850000::numeric, 7::integer),
      ('ORIENT-LEGACY-SAIGON-LEGACY'::text, '사이공 레거시'::text, 9000000::numeric, 8::integer)
  ) AS v(cruise_code, room_name, base_price, display_order)
)
INSERT INTO public.cruise_info (
  cruise_code, name, description, duration, features, base_price, category,
  cruise_name, room_name, room_description, bed_type, max_adults, max_guests,
  has_balcony, is_vip, has_butler, is_recommended, connecting_available,
  extra_bed_available, special_amenities, warnings, cancellation_policy,
  inclusions, exclusions, star_rating, facilities, display_order
)
SELECT
  source.cruise_code,
  'ORIENT LEGACY CRUISE'::text,
  '란하베이를 운항하는 6성급 오리엔트 레거시 크루즈 1박 2일 상품.'::text,
  '1박 2일'::text,
  '["웰컴 드링크", "미네랄 워터", "객실 과일·차·커피", "태극권", "오징어 낚시", "쿠킹클래스", "외부 투어", "카약·뱀부보트", "총 4회 식사"]'::jsonb,
  source.base_price,
  '오버나이트 크루즈'::text,
  '오리엔트 레거시 크루즈'::text,
  source.room_name,
  '성인 2인 기준 객실. 추가 성인 1인은 엑스트라베드 요금이 적용된다. 객실당 5세 미만 아동 2인 또는 5세 이상 아동 2인까지 요금 산출이 가능하며, 5세 이상 아동 2인 중 1인은 엑스트라베드가 필수다.'::text,
  NULL::text,
  NULL::integer,
  NULL::integer,
  NULL::boolean,
  false::boolean,
  NULL::boolean,
  false::boolean,
  NULL::boolean,
  true::boolean,
  '더블베드 크기 2m × 2.2m, 싱글·엑스트라베드 크기 1m × 2.2m. 개별 객실의 침대 구성과 커넥팅 가능 여부는 원문 미제공.'::text,
  '성인 1인 단독 사용 시 싱글차지 적용. 성인 1인+5~11세 아동 1인 사용 시 아동도 성인요금 적용. 승선 5일 전부터 신규 예약 불가.'::text,
  '[{"condition":"승선코드 발급 후 3일 내 잔금 미결제","penalty":"부킹 취소 및 예약금 50% 중 10% 위약금 공제"},{"condition":"정부 명령·기상 악화·최소 승선인원 미달·크루즈 단독 임대 등으로 결항","penalty":"날짜 변경 또는 전액 환불. 날짜 변경에 따른 호텔 위약금은 보상하지 않음"}]'::jsonb,
  '웰컴 드링크, 1인당 미네랄 워터 1병, 객실 내 제철과일·차·커피, 선내 프로그램, 일정표의 외부 투어, 카약·뱀부보트, 영어·베트남어 가이드, 개별 냉난방 객실, 인피니티풀·GYM 등 부대시설, 점심·파인다이닝 디너·조식·브런치 총 4회 식사, 세금, 선상 안전보험'::text,
  '선착장 이동차량, 별도 주문 음료·주류, 스파·마사지 등 유료시설, 외부 주류·음료 콜키지, 항공권, 개인 여행자보험, 기타 포함사항에 없는 항목'::text,
  '6성급'::text,
  '["인피니티풀", "GYM", "레스토랑", "스파·마사지 유료", "태극권", "오징어 낚시", "쿠킹클래스"]'::jsonb,
  source.display_order
FROM source_rows AS source
WHERE NOT EXISTS (
  SELECT 1
  FROM public.cruise_info AS existing
  WHERE existing.cruise_code = source.cruise_code
)
RETURNING cruise_code, cruise_name, room_name, category, base_price, star_rating, display_order;

-- 2026년 12월 24일과 31일의 할인 적용 추가요금.
WITH source_rows AS (
  SELECT *
  FROM (
    VALUES
      (DATE '2026-12-24', '크리스마스 이브'::text),
      (DATE '2026-12-31', '연말연시'::text)
  ) AS v(holiday_date, holiday_name)
)
INSERT INTO public.cruise_holiday_surcharge (
  cruise_name, schedule_type, holiday_date, holiday_date_end, holiday_name,
  surcharge_per_person, surcharge_type, valid_year, is_confirmed,
  currency, notes, surcharge_child
)
SELECT
  '오리엔트 레거시 크루즈'::text,
  '1N2D'::text,
  source.holiday_date,
  NULL::date,
  source.holiday_name,
  1600000::numeric,
  'per_person'::text,
  2026::integer,
  true::boolean,
  'VND'::text,
  '원문 표기 성인 2,000,000동 → 1,600,000동, 아동 1,000,000동 → 800,000동 중 화살표 뒤 할인 적용가를 저장.'::text,
  800000::numeric
FROM source_rows AS source
WHERE NOT EXISTS (
  SELECT 1
  FROM public.cruise_holiday_surcharge AS existing
  WHERE existing.cruise_name = '오리엔트 레거시 크루즈'
    AND existing.schedule_type = '1N2D'
    AND existing.holiday_date = source.holiday_date
    AND existing.holiday_date_end IS NULL
    AND existing.valid_year = 2026::integer
)
RETURNING holiday_name, holiday_date, surcharge_per_person, surcharge_child, currency;

-- 체크인 장소와 원문 안내 링크.
WITH source_rows AS (
  SELECT
    'Orient Legacy Cruise'::text AS en_name,
    '오리엔트 레거시 크루즈'::text AS kr_name,
    '라레지나 선착장. Google Maps에서 LA REGINA 검색. 개별 이동 시 오전 11:00까지 도착.'::text AS pier_location,
    'https://maps.app.goo.gl/Vi4HDD8NEaYD5b536'::text AS pier_map_url,
    'https://cafe.naver.com/stayhalong/13557'::text AS tour_schedule_url,
    '크루즈 셔틀은 라레지나 크루즈 선착장 앞에서 하차. 체크인 시 스테이하롱이 전달한 부킹코드 바우처 제시. 여권과 별도 예약확인서는 필요하지 않음. 약도는 원문 게시 시점 기준 업데이트 준비 중.'::text AS details
)
INSERT INTO public.cruise_location (
  en_name, kr_name, pier_location, pier_map_url, tour_schedule_url, details
)
SELECT
  source.en_name, source.kr_name, source.pier_location,
  source.pier_map_url, source.tour_schedule_url, source.details
FROM source_rows AS source
WHERE NOT EXISTS (
  SELECT 1
  FROM public.cruise_location AS existing
  WHERE existing.kr_name = source.kr_name
)
RETURNING kr_name, pier_location, pier_map_url, tour_schedule_url;

-- 각 시즌 요금 행에 공통 포함사항을 연결한다.
WITH rate_cards AS (
  SELECT id
  FROM public.cruise_rate_card
  WHERE cruise_name = '오리엔트 레거시 크루즈'
    AND schedule_type = '1N2D'
    AND is_active IS TRUE
    AND (
      (valid_year = 2026::integer AND valid_from = DATE '2026-08-01' AND valid_to = DATE '2026-10-15')
      OR (valid_year = 2026::integer AND valid_from = DATE '2026-10-16' AND valid_to = DATE '2026-12-31')
      OR (valid_year = 2027::integer AND valid_from = DATE '2027-01-01' AND valid_to = DATE '2027-04-30')
    )
), inclusion_rows AS (
  SELECT *
  FROM (
    VALUES
      (1::integer, '웰컴 드링크'::text),
      (2::integer, '1인당 미네랄 워터 1병'::text),
      (3::integer, '객실 내 제철과일 세트 및 차·커피'::text),
      (4::integer, '태극권·오징어 낚시·쿠킹클래스 등 선내 프로그램'::text),
      (5::integer, '일정표의 외부 투어 및 카약·뱀부보트'::text),
      (6::integer, '영어 및 베트남어 투어 가이드'::text),
      (7::integer, '개별 냉난방 객실'::text),
      (8::integer, '인피니티풀·GYM 등 부대시설'::text),
      (9::integer, '점심·파인다이닝 디너·조식·브런치 총 4회 식사'::text),
      (10::integer, '부가세 및 베트남 법령상 세금'::text),
      (11::integer, '선상 안전보험'::text)
  ) AS v(display_order, inclusion_text)
), source_rows AS (
  SELECT rate_cards.id AS rate_card_id, inclusion_rows.inclusion_text, inclusion_rows.display_order
  FROM rate_cards
  CROSS JOIN inclusion_rows
)
INSERT INTO public.cruise_rate_card_inclusions (
  rate_card_id, inclusion_text, display_order
)
SELECT source.rate_card_id, source.inclusion_text, source.display_order
FROM source_rows AS source
WHERE NOT EXISTS (
  SELECT 1
  FROM public.cruise_rate_card_inclusions AS existing
  WHERE existing.rate_card_id = source.rate_card_id
    AND existing.inclusion_text = source.inclusion_text
)
RETURNING rate_card_id, inclusion_text, display_order;

-- 실행 결과 요약과 저장 행을 표 형태로 확인한다.
SELECT
  (SELECT COUNT(*) FROM public.cruise_rate_card WHERE cruise_name = '오리엔트 레거시 크루즈' AND schedule_type = '1N2D') AS rate_card_rows,
  (SELECT COUNT(*) FROM public.cruise_info WHERE cruise_name = '오리엔트 레거시 크루즈') AS cruise_info_rows,
  (SELECT COUNT(*) FROM public.cruise_holiday_surcharge WHERE cruise_name = '오리엔트 레거시 크루즈' AND schedule_type = '1N2D') AS holiday_surcharge_rows,
  (SELECT COUNT(*) FROM public.cruise_location WHERE kr_name = '오리엔트 레거시 크루즈') AS cruise_location_rows,
  (SELECT COUNT(*) FROM public.cruise_rate_card_inclusions AS inclusion JOIN public.cruise_rate_card AS rate ON rate.id = inclusion.rate_card_id WHERE rate.cruise_name = '오리엔트 레거시 크루즈' AND rate.schedule_type = '1N2D') AS rate_inclusion_rows;

SELECT
  room_type, season_name, valid_from, valid_to,
  price_adult, price_child, price_child_extra_bed, price_extra_bed, price_single,
  infant_policy, is_active
FROM public.cruise_rate_card
WHERE cruise_name = '오리엔트 레거시 크루즈'
  AND schedule_type = '1N2D'
ORDER BY display_order, valid_from;

SELECT cruise_code, room_name, base_price, star_rating, room_area, room_image, capacity
FROM public.cruise_info
WHERE cruise_name = '오리엔트 레거시 크루즈'
ORDER BY display_order, cruise_code;

SELECT holiday_name, holiday_date, surcharge_per_person, surcharge_child, currency
FROM public.cruise_holiday_surcharge
WHERE cruise_name = '오리엔트 레거시 크루즈'
  AND schedule_type = '1N2D'
ORDER BY holiday_date;

SELECT kr_name, pier_location, pier_map_url, tour_schedule_url
FROM public.cruise_location
WHERE kr_name = '오리엔트 레거시 크루즈';

COMMIT;
