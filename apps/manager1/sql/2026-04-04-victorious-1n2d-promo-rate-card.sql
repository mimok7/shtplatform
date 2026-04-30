BEGIN;

-- ============================================================
-- 빅토리어스 크루즈 1박2일 2026 그랜드 오픈 프로모션 요금 반영
-- 기준: 카페매니저 1:1 채팅 공지(2026-04-03)
-- 적용 정책: 탑승일 기준
-- 대상: cruise_rate_card (1N2D), cruise_holiday_surcharge (특정일 추가요금)
-- ============================================================

-- 1) 기존 2026년 1N2D 요금 삭제 후 공지 요금으로 재등록
DELETE FROM cruise_rate_card
WHERE cruise_name = '빅토리어스 크루즈'
  AND schedule_type = '1N2D'
  AND valid_year = 2026;

-- <2026-04-30 ~ 2026-09-30>
INSERT INTO cruise_rate_card (
  cruise_name, schedule_type, room_type,
  price_adult, price_child, price_child_older, price_infant,
  price_extra_bed, price_single,
  extra_bed_available, single_available,
  valid_year, valid_from, valid_to,
  currency, is_active, notes
)
VALUES
  ('빅토리어스 크루즈', '1N2D', '주니어 오션 스위트',         4050000, 2000000, 3050000, 0, 4050000,  6650000, true,  true, 2026, DATE '2026-04-30', DATE '2026-09-30', 'VND', true, '2026 그랜드 오픈 프로모션 (4/30~9/30)'),
  ('빅토리어스 크루즈', '1N2D', '시니어 발코니 스위트',       4600000, 2300000, 3450000, 0, 4600000,  7800000, true,  true, 2026, DATE '2026-04-30', DATE '2026-09-30', 'VND', true, '2026 그랜드 오픈 프로모션 (4/30~9/30)'),
  ('빅토리어스 크루즈', '1N2D', '엘리트 발코니 스위트',       5950000, 3000000, 4450000, 0, 5950000, 10200000, true,  true, 2026, DATE '2026-04-30', DATE '2026-09-30', 'VND', true, '2026 그랜드 오픈 프로모션 (4/30~9/30)'),
  ('빅토리어스 크루즈', '1N2D', '이그제큐티브 테라스 스위트', 7750000, 3850000, 5750000, 0, 7750000, 12900000, true,  true, 2026, DATE '2026-04-30', DATE '2026-09-30', 'VND', true, '2026 그랜드 오픈 프로모션 (4/30~9/30)'),
  ('빅토리어스 크루즈', '1N2D', 'VIP 오션 스위트',           8900000, 4400000, 6600000, 0, 8900000, 14900000, true,  true, 2026, DATE '2026-04-30', DATE '2026-09-30', 'VND', true, '2026 그랜드 오픈 프로모션 (4/30~9/30)'),
  ('빅토리어스 크루즈', '1N2D', 'VIP 허니문 스위트',        10200000,    NULL,    NULL, 0,    NULL, 17100000, false, true, 2026, DATE '2026-04-30', DATE '2026-09-30', 'VND', true, '2026 그랜드 오픈 프로모션 (4/30~9/30) - 엑스트라베드 불가');

-- <2026-10-01 ~ 2026-12-31>
INSERT INTO cruise_rate_card (
  cruise_name, schedule_type, room_type,
  price_adult, price_child, price_child_older, price_infant,
  price_extra_bed, price_single,
  extra_bed_available, single_available,
  valid_year, valid_from, valid_to,
  currency, is_active, notes
)
VALUES
  ('빅토리어스 크루즈', '1N2D', '주니어 오션 스위트',         4600000, 2300000, 3400000, 0, 4600000,  7600000, true,  true, 2026, DATE '2026-10-01', DATE '2026-12-31', 'VND', true, '2026 그랜드 오픈 프로모션 (10/1~12/31)'),
  ('빅토리어스 크루즈', '1N2D', '시니어 발코니 스위트',       5200000, 2600000, 3850000, 0, 5200000,  8500000, true,  true, 2026, DATE '2026-10-01', DATE '2026-12-31', 'VND', true, '2026 그랜드 오픈 프로모션 (10/1~12/31)'),
  ('빅토리어스 크루즈', '1N2D', '엘리트 발코니 스위트',       6600000, 3250000, 4850000, 0, 6600000, 10900000, true,  true, 2026, DATE '2026-10-01', DATE '2026-12-31', 'VND', true, '2026 그랜드 오픈 프로모션 (10/1~12/31)'),
  ('빅토리어스 크루즈', '1N2D', '이그제큐티브 테라스 스위트', 8300000, 4100000, 6150000, 0, 8300000, 13900000, true,  true, 2026, DATE '2026-10-01', DATE '2026-12-31', 'VND', true, '2026 그랜드 오픈 프로모션 (10/1~12/31)'),
  ('빅토리어스 크루즈', '1N2D', 'VIP 오션 스위트',           9400000, 4700000, 7000000, 0, 9400000, 15700000, true,  true, 2026, DATE '2026-10-01', DATE '2026-12-31', 'VND', true, '2026 그랜드 오픈 프로모션 (10/1~12/31)'),
  ('빅토리어스 크루즈', '1N2D', 'VIP 허니문 스위트',        10600000,    NULL,    NULL, 0,    NULL, 17800000, false, true, 2026, DATE '2026-10-01', DATE '2026-12-31', 'VND', true, '2026 그랜드 오픈 프로모션 (10/1~12/31) - 엑스트라베드 불가');

-- 유아 정책 문구 반영 (객실당 유아 1-4세 1인 무료)
UPDATE cruise_rate_card
SET infant_policy = '객실당 유아(1-4세) 1인 무료'
WHERE cruise_name = '빅토리어스 크루즈'
  AND schedule_type = '1N2D'
  AND valid_year = 2026;

-- 2) 특정일/기간 추가요금 반영 (성인 1,550,000 / 아동 800,000)
DELETE FROM cruise_holiday_surcharge
WHERE cruise_name = '빅토리어스 크루즈'
  AND schedule_type = '1N2D'
  AND valid_year = 2026
  AND holiday_name LIKE '2026 카페공지 특별할증%';

INSERT INTO cruise_holiday_surcharge (
  cruise_name, schedule_type,
  holiday_date, holiday_date_end, holiday_name,
  surcharge_per_person, surcharge_child,
  surcharge_type, valid_year, is_confirmed, currency, notes
)
VALUES
  ('빅토리어스 크루즈', '1N2D', DATE '2026-04-30', DATE '2026-05-01', '2026 카페공지 특별할증 4/30-5/1', 1550000, 800000, 'per_person', 2026, true, 'VND', '카페공지: 성인 155만동 / 아동 80만동'),
  ('빅토리어스 크루즈', '1N2D', DATE '2026-12-24', NULL,              '2026 카페공지 특별할증 12/24',    1550000, 800000, 'per_person', 2026, true, 'VND', '카페공지: 성인 155만동 / 아동 80만동'),
  ('빅토리어스 크루즈', '1N2D', DATE '2026-12-30', DATE '2027-01-03', '2026 카페공지 특별할증 12/30-1/3', 1550000, 800000, 'per_person', 2026, true, 'VND', '카페공지: 성인 155만동 / 아동 80만동');

COMMIT;

-- ============================================================
-- 검증 쿼리
-- ============================================================
-- 1) 요금표 확인
-- SELECT cruise_name, schedule_type, room_type, valid_from, valid_to,
--        price_adult, price_child, price_child_older, price_extra_bed, price_single, price_infant
-- FROM cruise_rate_card
-- WHERE cruise_name = '빅토리어스 크루즈'
--   AND schedule_type = '1N2D'
--   AND valid_year = 2026
-- ORDER BY valid_from, room_type;

-- 2) 휴일 추가요금 확인
-- SELECT cruise_name, schedule_type, holiday_date, holiday_date_end,
--        surcharge_per_person, surcharge_child, holiday_name
-- FROM cruise_holiday_surcharge
-- WHERE cruise_name = '빅토리어스 크루즈'
--   AND schedule_type = '1N2D'
--   AND valid_year = 2026
-- ORDER BY holiday_date;
