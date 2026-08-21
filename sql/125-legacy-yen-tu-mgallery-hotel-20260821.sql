-- ============================================================================
-- 레거시 옌뜨, MGALLERY 호텔 (2026-08-21 원문 기준)
-- ============================================================================
-- 기준 자료:
--   "[제휴호텔] 레거시 옌뜨, MGALLERY 호텔" 카페 게시글 원문
--
-- 원문에 객실별 금액, 정원, 침대 구성, 면적, 전화번호, 등급은 없습니다.
-- 따라서 추정값을 넣지 않았습니다. 플랫폼의 hotel_price.base_price NOT NULL
-- 제약을 충족하기 위해 기존 문의형 객실 처리와 같이 base_price는 0으로 두고,
-- 각 객실의 notes에 "가격은 현재 정리 중..." 원문을 보존했습니다.
-- 실제 금액 수령 후 base_price만 갱신하면 됩니다.
-- ============================================================================

BEGIN;

-- 재실행 시 이 호텔의 기본·객실 행만 교체합니다.
DELETE FROM hotel_price
WHERE hotel_code = 'LEGACY_YENTU';

DELETE FROM hotel_info
WHERE hotel_code = 'LEGACY_YENTU';

INSERT INTO hotel_info (
  hotel_code,
  hotel_name,
  product_type,
  location,
  check_in_time,
  check_out_time,
  currency,
  notes,
  active
) VALUES (
  'LEGACY_YENTU',
  '레거시 옌뜨, MGALLERY 호텔',
  'HOTEL',
  '옌뜨산',
  TIME '15:00:00',
  TIME '12:00:00',
  'VND',
  '조식포함. 본 리조트/호텔 상품은 조식이 포함되어 있는 요금상품 입니다. 당사를 통한 예약 시 Welless Center 스파, 사우나 등 15% 할인이 제공됩니다. 조식 프로그램, 디너 코스 프로그램, 빌리지 야간 공연 프로그램, 수영장 및 GYM, YOGA 프로그램. 객실당/1박당 2,000,000동의 디파짓(보증금)이 부과됩니다. 객실 내는 금연구역이며 흡연 적발 시 5,000,000동의 청소비가 부과됩니다. 객실 카드 분실 시 분실카드 1개당 200,000동이 부과됩니다. 체크인 일자 21일 전까지 취소 시 객실당 200,000동의 위약금이 적용되며, 체크인 일자 21일 이내부터는 일체의 환불 및 취소가 불가합니다. 체크인 일자 21일 이내 또는 숙박기간 중 숙박기간 단축의 경우 환불이 불가합니다. 체크인 일자 21일 이내의 경우 날짜변경은 호텔 객실 상황에 따라 적용됩니다. 호텔 체크인 시 스테이하롱으로 받은 "부킹코드" 및 "여권"을 함께 제시해야 합니다. 베트남의 외국인 임시거주등록 절차를 위해 직원들이 여권을 사진으로 촬영할 수 있습니다. 모든 예약은 카카오채널을 통한 정확한 상담 진행 후 전달드리는 예약신청서 작성 WEB에서 신청할 수 있습니다. 본 상품은 원화송금 결제로만 진행되며 신용카드 결제를 원하는 경우 카드결제수수료+세금으로 5%가 추가됩니다.',
  true
);

-- 가격은 원문에 없으므로 0은 "가격 문의" 상태를 의미합니다.
INSERT INTO hotel_price (
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
) VALUES
(
  'LEGACY_YENTU_SUPERIOR_FOREST_2026',
  'LEGACY_YENTU',
  '레거시 옌뜨, MGALLERY 호텔',
  'SUPERIOR_FOREST_VIEW',
  '슈페리어 포레스트뷰 객실',
  'STANDARD',
  NULL,
  true,
  0,
  NULL,
  NULL,
  '가격 문의',
  DATE '2026-01-01',
  DATE '2026-12-31',
  'ALL',
  '산과 나무가 보이는 뷰. 포레스트 뷰 객실: VIP 웰컴 어메니티 세트 제공. 가격은 현재 정리중에 있어서, 채널로 문의주시면 안내드리겠습니다^^'
),
(
  'LEGACY_YENTU_SUPERIOR_VILLAGE_2026',
  'LEGACY_YENTU',
  '레거시 옌뜨, MGALLERY 호텔',
  'SUPERIOR_VILLAGE_VIEW',
  '슈페리어 빌리지뷰 객실',
  'STANDARD',
  NULL,
  true,
  0,
  NULL,
  NULL,
  '가격 문의',
  DATE '2026-01-01',
  DATE '2026-12-31',
  'ALL',
  '넓은 정원이 펼쳐지는 객실. 가격은 현재 정리중에 있어서, 채널로 문의주시면 안내드리겠습니다^^'
),
(
  'LEGACY_YENTU_DELUXE_FOREST_2026',
  'LEGACY_YENTU',
  '레거시 옌뜨, MGALLERY 호텔',
  'DELUXE_FOREST_VIEW',
  '디럭스 포레스트뷰 객실',
  'STANDARD',
  NULL,
  true,
  0,
  NULL,
  NULL,
  '가격 문의',
  DATE '2026-01-01',
  DATE '2026-12-31',
  'ALL',
  '산과 나무가 보이는 뷰. 포레스트 뷰 객실: VIP 웰컴 어메니티 세트 제공. 가격은 현재 정리중에 있어서, 채널로 문의주시면 안내드리겠습니다^^'
),
(
  'LEGACY_YENTU_DELUXE_VILLAGE_2026',
  'LEGACY_YENTU',
  '레거시 옌뜨, MGALLERY 호텔',
  'DELUXE_VILLAGE_VIEW',
  '디럭스 빌리지뷰 객실',
  'STANDARD',
  NULL,
  true,
  0,
  NULL,
  NULL,
  '가격 문의',
  DATE '2026-01-01',
  DATE '2026-12-31',
  'ALL',
  '넓은 정원이 펼쳐지는 객실. 가격은 현재 정리중에 있어서, 채널로 문의주시면 안내드리겠습니다^^'
),
(
  'LEGACY_YENTU_DELUXE_POOL_2026',
  'LEGACY_YENTU',
  '레거시 옌뜨, MGALLERY 호텔',
  'DELUXE_POOL_VIEW',
  '디럭스 POOL 뷰 객실',
  'STANDARD',
  NULL,
  true,
  0,
  NULL,
  NULL,
  '가격 문의',
  DATE '2026-01-01',
  DATE '2026-12-31',
  'ALL',
  '수영장쪽 뷰가 보여지는 객실. 가든풀 뷰 객실: VIP 웰컴 어메니티 세트 제공 + AM웰니스 센터 2인 30분 클렌징 테라피. 가격은 현재 정리중에 있어서, 채널로 문의주시면 안내드리겠습니다^^'
),
(
  'LEGACY_YENTU_JUNIOR_SUITE_FOREST_2026',
  'LEGACY_YENTU',
  '레거시 옌뜨, MGALLERY 호텔',
  'JUNIOR_SUITE_FOREST_VIEW',
  '주니어 스위트 포레스트뷰 객실',
  'SUITE',
  NULL,
  true,
  0,
  NULL,
  NULL,
  '가격 문의',
  DATE '2026-01-01',
  DATE '2026-12-31',
  'ALL',
  '산과 나무가 보이는 뷰. 객실 특전: 고객 요청 시 객실 내 조식 제공, 얼리 체크인 및 레이트 체크아웃 무료제공(가능 여부에 따라), 무료 미니바(주류제외), 객실 내 애프터눈 티, 1박당 5벌의 무료 세탁 서비스(드라이클리닝 불포함), AM 웰리스 센터 2인 60분 클렌징 테라피 무료이용. 가격은 현재 정리중에 있어서, 채널로 문의주시면 안내드리겠습니다^^'
),
(
  'LEGACY_YENTU_JUNIOR_SUITE_POOL_2026',
  'LEGACY_YENTU',
  '레거시 옌뜨, MGALLERY 호텔',
  'JUNIOR_SUITE_POOL_VIEW',
  '주니어 스위트 POOL 뷰 객실',
  'SUITE',
  NULL,
  true,
  0,
  NULL,
  NULL,
  '가격 문의',
  DATE '2026-01-01',
  DATE '2026-12-31',
  'ALL',
  '수영장쪽이 보여지는 뷰. 객실 특전: 고객 요청 시 객실 내 조식 제공, 얼리 체크인 및 레이트 체크아웃 무료제공(가능 여부에 따라), 무료 미니바(주류제외), 객실 내 애프터눈 티, 1박당 5벌의 무료 세탁 서비스(드라이클리닝 불포함), AM 웰리스 센터 2인 60분 클렌징 테라피 무료이용. 가격은 현재 정리중에 있어서, 채널로 문의주시면 안내드리겠습니다^^'
),
(
  'LEGACY_YENTU_PRESIDENTIAL_SUITE_2026',
  'LEGACY_YENTU',
  '레거시 옌뜨, MGALLERY 호텔',
  'PRESIDENTIAL_SUITE',
  '프레지덴셜 스위트',
  'SUITE',
  NULL,
  true,
  0,
  NULL,
  NULL,
  '가격 문의',
  DATE '2026-01-01',
  DATE '2026-12-31',
  'ALL',
  '수영장이 보이는 뷰. 가격은 현재 정리중에 있어서, 채널로 문의주시면 안내드리겠습니다^^'
);

COMMIT;

-- 검증
-- SELECT * FROM hotel_info WHERE hotel_code = 'LEGACY_YENTU';
-- SELECT hotel_price_code, room_name, base_price, notes
-- FROM hotel_price
-- WHERE hotel_code = 'LEGACY_YENTU'
-- ORDER BY room_name;
