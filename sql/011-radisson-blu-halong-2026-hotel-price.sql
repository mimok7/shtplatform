-- ============================================================================
-- 호텔 요금표 추가: Radisson Blu Hotel, Ha Long Bay (2026)
-- ============================================================================
-- 목적:
--   - 현재 앱이 직접 조회하는 legacy hotel_info / hotel_price 테이블에
--     래디슨 블루 하롱 호텔 가격표를 즉시 반영한다.
--
-- 기준 자료:
--   - 네이버 카페 게시글 "[제휴호텔] 하롱베이 5성급 래디슨 블루 하롱 호텔"
--   - 게시일: 2026-06-17
--
-- 주의:
--   - 이 파일은 v3(room_type/pricing_model) 경유 없이 legacy 테이블에 직접 적재한다.
--   - 재실행 가능하도록 기존 동일 hotel_code 데이터를 먼저 삭제한다.
--   - 시즌/프로모션 변동 가능성이 있으므로 start/end_date는 2026 연간 기준으로 넣고
--     상세 변동 사항은 notes / child_policy에 명시한다.
-- ============================================================================

BEGIN;

DELETE FROM hotel_price
WHERE hotel_code = 'RADBLUHL';

DELETE FROM hotel_info
WHERE hotel_code = 'RADBLUHL';

INSERT INTO hotel_info (
  hotel_code,
  hotel_name,
  product_type,
  location,
  star_rating,
  phone,
  currency,
  notes,
  active
) VALUES (
  'RADBLUHL',
  '래디슨 블루 하롱 호텔',
  'HOTEL',
  '하롱베이 바이짜이',
  5,
  '+84 203 3699 999',
  'VND',
  '2025년 5월 오픈. 스테이하롱 제휴호텔. 빈펄 리조트 및 하롱베이 전망, 조식 포함, 수영장/GYM 이용 포함.',
  true
);

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
  'RADBLUHL_DELUXE_LAKE_2026',
  'RADBLUHL',
  '래디슨 블루 하롱 호텔',
  'DELUXE_LAKE',
  '디럭스 레이크 뷰',
  'STANDARD',
  2,
  true,
  1700000,
  860000,
  '6세 미만 엑스트라 미사용 시 무료 / 6-11세 엑스트라 미사용 시 1인 550000동 / 11세 이상 성인요금 적용',
  '2026 일반요금',
  DATE '2026-01-01',
  DATE '2026-12-31',
  'ALL',
  '41m2, 킹/트윈 선택 가능, 레이크뷰, 욕조/스탠딩샤워 제공, 발코니 없음, 베이뷰 커넥팅 가능. 비수기 및 수시 프로모션에 따라 변동 가능.'
),
(
  'RADBLUHL_DELUXE_OCEAN_2026',
  'RADBLUHL',
  '래디슨 블루 하롱 호텔',
  'DELUXE_OCEAN',
  '디럭스 오션 뷰',
  'STANDARD',
  2,
  true,
  1900000,
  860000,
  '6세 미만 엑스트라 미사용 시 무료 / 6-11세 엑스트라 미사용 시 1인 550000동 / 11세 이상 성인요금 적용',
  '2026 일반요금',
  DATE '2026-01-01',
  DATE '2026-12-31',
  'ALL',
  '41m2, 킹/트윈 선택 가능, 오션뷰, 욕조/스탠딩샤워 제공, 발코니 없음, 베이뷰 커넥팅 가능. 비수기 및 수시 프로모션에 따라 변동 가능.'
),
(
  'RADBLUHL_EXECUTIVE_2026',
  'RADBLUHL',
  '래디슨 블루 하롱 호텔',
  'EXECUTIVE_OCEAN',
  '이그제큐티브',
  'EXECUTIVE',
  2,
  true,
  3100000,
  NULL,
  '6세 미만 엑스트라 미사용 시 무료 / 6-11세 엑스트라 미사용 시 1인 550000동 / 11세 이상 성인요금 적용 / 엑스트라 베드는 별도문의',
  '2026 일반요금',
  DATE '2026-01-01',
  DATE '2026-12-31',
  'ALL',
  '51m2, 킹/트윈 선택 가능, 오션뷰, 욕조/스탠딩샤워 제공, 발코니 없음, 커넥팅 불가. 비수기 및 수시 프로모션에 따라 변동 가능.'
),
(
  'RADBLUHL_FAMILY_2026',
  'RADBLUHL',
  '래디슨 블루 하롱 호텔',
  'FAMILY_OCEAN',
  '패밀리룸',
  'FAMILY',
  2,
  true,
  2400000,
  860000,
  '6세 미만 엑스트라 미사용 시 무료 / 6-11세 엑스트라 미사용 시 1인 550000동 / 11세 이상 성인요금 적용',
  '2026 일반요금',
  DATE '2026-01-01',
  DATE '2026-12-31',
  'ALL',
  '51m2, 킹베드, 오션뷰, 욕실 발코니, 욕조/스탠딩샤워 제공, 커넥팅 불가. 비수기 및 수시 프로모션에 따라 변동 가능.'
),
(
  'RADBLUHL_1BED_LAKE_2026',
  'RADBLUHL',
  '래디슨 블루 하롱 호텔',
  'ONE_BED_SUITE_LAKE',
  '1베드룸 스위트 레이크뷰',
  'SUITE',
  2,
  true,
  3900000,
  NULL,
  '6세 미만 엑스트라 미사용 시 무료 / 6-11세 엑스트라 미사용 시 1인 550000동 / 11세 이상 성인요금 적용 / 엑스트라 베드는 별도문의',
  '2026 일반요금',
  DATE '2026-01-01',
  DATE '2026-12-31',
  'ALL',
  '78m2, 킹베드, 레이크뷰, 욕조/스탠딩샤워 제공, 발코니 없음, 커넥팅 불가. 비수기 및 수시 프로모션에 따라 변동 가능.'
),
(
  'RADBLUHL_1BED_OCEAN_2026',
  'RADBLUHL',
  '래디슨 블루 하롱 호텔',
  'ONE_BED_SUITE_OCEAN',
  '1베드룸 스위트 오션뷰',
  'SUITE',
  2,
  true,
  4400000,
  NULL,
  '6세 미만 엑스트라 미사용 시 무료 / 6-11세 엑스트라 미사용 시 1인 550000동 / 11세 이상 성인요금 적용 / 엑스트라 베드는 별도문의',
  '2026 일반요금',
  DATE '2026-01-01',
  DATE '2026-12-31',
  'ALL',
  '78m2, 킹베드, 오션뷰, 욕조/스탠딩샤워 제공, 발코니 없음, 커넥팅 불가. 비수기 및 수시 프로모션에 따라 변동 가능.'
),
(
  'RADBLUHL_1BED_PANORAMIC_2026',
  'RADBLUHL',
  '래디슨 블루 하롱 호텔',
  'ONE_BED_PANORAMIC',
  '1베드룸 파노라믹 뷰',
  'SUITE',
  2,
  true,
  6250000,
  NULL,
  '6세 미만 엑스트라 미사용 시 무료 / 6-11세 엑스트라 미사용 시 1인 550000동 / 11세 이상 성인요금 적용 / 엑스트라 베드는 별도문의',
  '2026 일반요금',
  DATE '2026-01-01',
  DATE '2026-12-31',
  'ALL',
  '116m2, 킹베드, 오션뷰+레이크뷰, 욕조/스탠딩샤워 제공, 발코니 없음, 커넥팅 불가. 비수기 및 수시 프로모션에 따라 변동 가능.'
),
(
  'RADBLUHL_2BED_SUITE_2026',
  'RADBLUHL',
  '래디슨 블루 하롱 호텔',
  'TWO_BED_SUITE_OCEAN',
  '2베드룸 스위트 오션뷰',
  'SUITE',
  4,
  true,
  11300000,
  NULL,
  '6세 미만 엑스트라 미사용 시 무료 / 6-11세 엑스트라 미사용 시 1인 550000동 / 11세 이상 성인요금 적용 / 엑스트라 베드는 별도문의',
  '2026 일반요금',
  DATE '2026-01-01',
  DATE '2026-12-31',
  'ALL',
  '116m2, 트윈베드+킹베드, 오션뷰 표기 기준 적재, 욕조/스탠딩샤워 제공, 발코니 없음, 커넥팅 불가. 게시글 본문에는 레이크뷰 설명이 함께 있어 운영 확인 권장.'
),
(
  'RADBLUHL_PRESIDENTIAL_2026',
  'RADBLUHL',
  '래디슨 블루 하롱 호텔',
  'PRESIDENTIAL_SUITE',
  '프레지덴셜 스위트',
  'SUITE',
  6,
  true,
  41800000,
  NULL,
  '6세 미만 엑스트라 미사용 시 무료 / 6-11세 엑스트라 미사용 시 1인 550000동 / 11세 이상 성인요금 적용 / 엑스트라 베드는 별도문의',
  '2026 일반요금',
  DATE '2026-01-01',
  DATE '2026-12-31',
  'ALL',
  '280m2, 킹베드, 오션뷰+레이크뷰, 성인 6인 기준, 욕조/스탠딩샤워 제공, 발코니 없음, 커넥팅 불가. 비수기 및 수시 프로모션에 따라 변동 가능.'
);

COMMIT;

-- 검증 예시
-- SELECT * FROM hotel_info WHERE hotel_code = 'RADBLUHL';
-- SELECT hotel_price_code, hotel_name, room_name, base_price
-- FROM hotel_price
-- WHERE hotel_code = 'RADBLUHL'
-- ORDER BY base_price;