-- 빅토리어스 크루즈 2박3일 요금표 추가 (2026-06-30)
-- 요청: 26년 1박2일 × 2배 = 2박3일 요금 / 27년도 26년 그대로 1월1일부터 시작
-- 대상 테이블: cruise_rate_card, cruise_holiday_surcharge

BEGIN;

-- ============================================================
-- 1단계: 빅토리어스 크루즈 2N3D 요금표 삽입 (2026년)
-- 기준: 2026년 1N2D × 2배 (각 객실당 가격 2배)
-- ============================================================

-- <2026-04-30 ~ 2026-09-30 - S1 시즌>
INSERT INTO cruise_rate_card (
  cruise_name, schedule_type, room_type,
  price_adult, price_child, price_child_older, price_infant,
  price_extra_bed, price_single,
  extra_bed_available, single_available,
  valid_year, valid_from, valid_to,
  currency, is_active, notes
)
VALUES
  ('빅토리어스 크루즈', '2N3D', '주니어 오션 스위트',         8200000, 4100000, 6200000, 0, 8200000, 13500000, true,  true, 2026, DATE '2026-04-30', DATE '2026-09-30', 'VND', true, '2026년 2박3일 요금 (1N2D × 2배)'),
  ('빅토리어스 크루즈', '2N3D', '시니어 발코니 스위트',       9400000, 4700000, 7000000, 0, 9400000, 15800000, true,  true, 2026, DATE '2026-04-30', DATE '2026-09-30', 'VND', true, '2026년 2박3일 요금 (1N2D × 2배)'),
  ('빅토리어스 크루즈', '2N3D', '엘리트 발코니 스위트',      12200000, 6100000, 9000000, 0, 12200000, 20600000, true,  true, 2026, DATE '2026-04-30', DATE '2026-09-30', 'VND', true, '2026년 2박3일 요금 (1N2D × 2배)'),
  ('빅토리어스 크루즈', '2N3D', '이그제큐티브 테라스 스위트', 15700000, 7800000, 11600000, 0, 15700000, 26000000, true,  true, 2026, DATE '2026-04-30', DATE '2026-09-30', 'VND', true, '2026년 2박3일 요금 (1N2D × 2배)'),
  ('빅토리어스 크루즈', '2N3D', 'VIP 오션 스위트',           18000000, 9000000, 13300000, 0, 18000000, 30000000, true,  true, 2026, DATE '2026-04-30', DATE '2026-09-30', 'VND', true, '2026년 2박3일 요금 (1N2D × 2배)'),
  ('빅토리어스 크루즈', '2N3D', 'VIP 허니문 스위트',        20600000, 10400000, 15200000, 0, 20600000, 34400000, true,  true, 2026, DATE '2026-04-30', DATE '2026-09-30', 'VND', true, '2026년 2박3일 요금 (1N2D × 2배)');

-- <2026-10-01 ~ 2026-12-31 - S2 시즌>
INSERT INTO cruise_rate_card (
  cruise_name, schedule_type, room_type,
  price_adult, price_child, price_child_older, price_infant,
  price_extra_bed, price_single,
  extra_bed_available, single_available,
  valid_year, valid_from, valid_to,
  currency, is_active, notes
)
VALUES
  ('빅토리어스 크루즈', '2N3D', '주니어 오션 스위트',         9300000, 4700000, 6900000, 0, 9300000, 15400000, true,  true, 2026, DATE '2026-10-01', DATE '2026-12-31', 'VND', true, '2026년 2박3일 요금 (1N2D × 2배)'),
  ('빅토리어스 크루즈', '2N3D', '시니어 발코니 스위트',      10500000, 5300000, 7800000, 0, 10500000, 17200000, true,  true, 2026, DATE '2026-10-01', DATE '2026-12-31', 'VND', true, '2026년 2박3일 요금 (1N2D × 2배)'),
  ('빅토리어스 크루즈', '2N3D', '엘리트 발코니 스위트',      13300000, 6600000, 9800000, 0, 13300000, 22000000, true,  true, 2026, DATE '2026-10-01', DATE '2026-12-31', 'VND', true, '2026년 2박3일 요금 (1N2D × 2배)'),
  ('빅토리어스 크루즈', '2N3D', '이그제큐티브 테라스 스위트', 16800000, 8300000, 12400000, 0, 16800000, 28000000, true,  true, 2026, DATE '2026-10-01', DATE '2026-12-31', 'VND', true, '2026년 2박3일 요금 (1N2D × 2배)'),
  ('빅토리어스 크루즈', '2N3D', 'VIP 오션 스위트',           19000000, 9500000, 14100000, 0, 19000000, 31600000, true,  true, 2026, DATE '2026-10-01', DATE '2026-12-31', 'VND', true, '2026년 2박3일 요금 (1N2D × 2배)'),
  ('빅토리어스 크루즈', '2N3D', 'VIP 허니문 스위트',        21400000, 10800000, 15900000, 0, 21400000, 35800000, true,  true, 2026, DATE '2026-10-01', DATE '2026-12-31', 'VND', true, '2026년 2박3일 요금 (1N2D × 2배)');

-- ============================================================
-- 2단계: 빅토리어스 크루즈 2N3D 요금표 삽입 (2027년)
-- 기준: 2026년 2N3D와 동일 / 2027-01-01 부터 시작
-- ============================================================

-- <2027-01-01 ~ 2027-12-31 - 연간 통합 요금>
INSERT INTO cruise_rate_card (
  cruise_name, schedule_type, room_type,
  price_adult, price_child, price_child_older, price_infant,
  price_extra_bed, price_single,
  extra_bed_available, single_available,
  valid_year, valid_from, valid_to,
  currency, is_active, notes
)
VALUES
  ('빅토리어스 크루즈', '2N3D', '주니어 오션 스위트',         8200000, 4100000, 6200000, 0, 8200000, 13500000, true,  true, 2027, DATE '2027-01-01', DATE '2027-12-31', 'VND', true, '2027년 2박3일 요금 (26년 유가 유지)'),
  ('빅토리어스 크루즈', '2N3D', '시니어 발코니 스위트',       9400000, 4700000, 7000000, 0, 9400000, 15800000, true,  true, 2027, DATE '2027-01-01', DATE '2027-12-31', 'VND', true, '2027년 2박3일 요금 (26년 유가 유지)'),
  ('빅토리어스 크루즈', '2N3D', '엘리트 발코니 스위트',      12200000, 6100000, 9000000, 0, 12200000, 20600000, true,  true, 2027, DATE '2027-01-01', DATE '2027-12-31', 'VND', true, '2027년 2박3일 요금 (26년 유가 유지)'),
  ('빅토리어스 크루즈', '2N3D', '이그제큐티브 테라스 스위트', 15700000, 7800000, 11600000, 0, 15700000, 26000000, true,  true, 2027, DATE '2027-01-01', DATE '2027-12-31', 'VND', true, '2027년 2박3일 요금 (26년 유가 유지)'),
  ('빅토리어스 크루즈', '2N3D', 'VIP 오션 스위트',           18000000, 9000000, 13300000, 0, 18000000, 30000000, true,  true, 2027, DATE '2027-01-01', DATE '2027-12-31', 'VND', true, '2027년 2박3일 요금 (26년 유가 유지)'),
  ('빅토리어스 크루즈', '2N3D', 'VIP 허니문 스위트',        20600000, 10400000, 15200000, 0, 20600000, 34400000, true,  true, 2027, DATE '2027-01-01', DATE '2027-12-31', 'VND', true, '2027년 2박3일 요금 (26년 유가 유지)');

-- ============================================================
-- 3단계: 유아 정책 반영
-- ============================================================
UPDATE cruise_rate_card
SET infant_policy = '객실당 유아(1-4세) 1인 무료'
WHERE cruise_name = '빅토리어스 크루즈'
  AND schedule_type = '2N3D'
  AND valid_year IN (2026, 2027);

-- ============================================================
-- 4단계: 휴일 추가요금 반영 (2N3D)
-- 기준: 1N2D × 2배 = 성인 310만동 / 아동 160만동
-- ============================================================

INSERT INTO cruise_holiday_surcharge (
  cruise_name, schedule_type,
  holiday_date, holiday_date_end, holiday_name,
  surcharge_per_person, surcharge_child,
  surcharge_type, valid_year, is_confirmed, currency, notes
)
VALUES
  ('빅토리어스 크루즈', '2N3D', DATE '2026-04-30', DATE '2026-05-01', '2026 카페공지 특별할증 4/30-5/1', 3100000, 1600000, 'per_person', 2026, true, 'VND', '카페공지: 성인 310만동 / 아동 160만동'),
  ('빅토리어스 크루즈', '2N3D', DATE '2026-12-24', NULL,              '2026 카페공지 특별할증 12/24',    3100000, 1600000, 'per_person', 2026, true, 'VND', '카페공지: 성인 310만동 / 아동 160만동'),
  ('빅토리어스 크루즈', '2N3D', DATE '2026-12-30', DATE '2027-01-03', '2026 카페공지 특별할증 12/30-1/3', 3100000, 1600000, 'per_person', 2026, true, 'VND', '카페공지: 성인 310만동 / 아동 160만동'),
  ('빅토리어스 크루즈', '2N3D', DATE '2027-04-30', DATE '2027-05-01', '2027 카페공지 특별할증 4/30-5/1', 3100000, 1600000, 'per_person', 2027, true, 'VND', '카페공지: 성인 310만동 / 아동 160만동'),
  ('빅토리어스 크루즈', '2N3D', DATE '2027-12-24', NULL,              '2027 카페공지 특별할증 12/24',    3100000, 1600000, 'per_person', 2027, true, 'VND', '카페공지: 성인 310만동 / 아동 160만동'),
  ('빅토리어스 크루즈', '2N3D', DATE '2027-12-30', DATE '2028-01-03', '2027 카페공지 특별할증 12/30-1/3', 3100000, 1600000, 'per_person', 2027, true, 'VND', '카페공지: 성인 310만동 / 아동 160만동');

COMMIT;

-- ============================================================
-- 검증 쿼리
-- ============================================================
-- 1) 2N3D 요금표 확인
-- SELECT cruise_name, schedule_type, room_type, valid_from, valid_to,
--        price_adult, price_child, price_child_older, price_extra_bed, price_single
-- FROM cruise_rate_card
-- WHERE cruise_name = '빅토리어스 크루즈'
--   AND schedule_type = '2N3D'
--   AND valid_year IN (2026, 2027)
-- ORDER BY valid_year, valid_from, room_type;

-- 2) 2N3D 휴일 추가요금 확인
-- SELECT cruise_name, schedule_type, holiday_date, holiday_date_end,
--        surcharge_per_person, surcharge_child, holiday_name
-- FROM cruise_holiday_surcharge
-- WHERE cruise_name = '빅토리어스 크루즈'
--   AND schedule_type = '2N3D'
--   AND valid_year IN (2026, 2027)
-- ORDER BY valid_year, holiday_date;

-- 3) 1N2D vs 2N3D 가격 비교 (2N3D = 1N2D × 2 확인)
-- SELECT 
--   '1N2D' as schedule_type,
--   room_type, valid_from, valid_to, valid_year,
--   price_adult, price_child, price_single
-- FROM cruise_rate_card
-- WHERE cruise_name = '빅토리어스 크루즈' AND schedule_type = '1N2D' AND valid_year = 2026
-- UNION ALL
-- SELECT 
--   '2N3D' as schedule_type,
--   room_type, valid_from, valid_to, valid_year,
--   price_adult, price_child, price_single
-- FROM cruise_rate_card
-- WHERE cruise_name = '빅토리어스 크루즈' AND schedule_type = '2N3D' AND valid_year = 2026
-- ORDER BY room_type, schedule_type;
