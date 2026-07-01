-- ============================================================================
-- 015-athena-premium-cruise-2n3d-rate-card.sql
-- 아테나 프리미엄 크루즈 2박 3일 요금표 추가 (2026, 2027)
-- ============================================================================
-- 크루즈명: 아테나 프리미엄 (6성급)
-- 일정: 2박 3일 (2N3D)
-- 요금: 1박 2일 요금의 2배
-- 적용 기간: 2026년 6월 20일 ~ 2026년 12월 31일, 2027년 1월 1일 ~ 2027년 12월 31일

BEGIN;

-- ============================================================================
-- 2026년 아테나 프리미엄 크루즈 2N3D 요금 데이터 (6월 20일 ~ 12월 31일)
-- ============================================================================

-- 1. 아테나 오션뷰 (1박 5,175,000 → 2박 10,350,000)
INSERT INTO cruise_rate_card (cruise_name, schedule_type, room_type, price_adult, price_child, price_extra_bed, price_single, valid_year, valid_from, valid_to, currency, is_active, notes)
VALUES 
  ('아테나 프리미엄', '2N3D', 'Athena Ocean View', 10350000, 7800000, 10350000, 17800000, 2026, '2026-06-20', '2026-12-31', 'VND', true, '아테나 오션뷰 (2박 3일)');

-- 2. 이그제큐티브 발코니 (1박 5,700,000 → 2박 11,400,000)
INSERT INTO cruise_rate_card (cruise_name, schedule_type, room_type, price_adult, price_child, price_extra_bed, price_single, valid_year, valid_from, valid_to, currency, is_active, notes)
VALUES 
  ('아테나 프리미엄', '2N3D', 'Executive Balcony', 11400000, 8600000, 11400000, 19600000, 2026, '2026-06-20', '2026-12-31', 'VND', true, '이그제큐티브 발코니 (2박 3일)');

-- 3. 트리플 발코니 (1박 5,700,000 → 2박 11,400,000 / 엑스트라, 싱글차지 불가)
INSERT INTO cruise_rate_card (cruise_name, schedule_type, room_type, price_adult, price_child, extra_bed_available, valid_year, valid_from, valid_to, currency, is_active, notes)
VALUES 
  ('아테나 프리미엄', '2N3D', 'Triple Balcony', 11400000, 8600000, false, 2026, '2026-06-20', '2026-12-31', 'VND', true, '트리플 발코니 (2박 3일, 엑스트라/싱글차지 불가)');

-- 4. 커넥팅 발코니 (1박 5,450,000 → 2박 10,900,000 / 싱글차지 불가)
INSERT INTO cruise_rate_card (cruise_name, schedule_type, room_type, price_adult, price_child, price_extra_bed, valid_year, valid_from, valid_to, currency, is_active, notes)
VALUES 
  ('아테나 프리미엄', '2N3D', 'Connecting Balcony', 10900000, 8200000, 10900000, 2026, '2026-06-20', '2026-12-31', 'VND', true, '커넥팅 발코니 (2박 3일, 싱글차지 불가)');

-- 5. 프리미엄 발코니 (1박 6,750,000 → 2박 13,500,000)
INSERT INTO cruise_rate_card (cruise_name, schedule_type, room_type, price_adult, price_child, price_extra_bed, price_single, valid_year, valid_from, valid_to, currency, is_active, notes)
VALUES 
  ('아테나 프리미엄', '2N3D', 'Premium Balcony', 13500000, 10150000, 13500000, 23200000, 2026, '2026-06-20', '2026-12-31', 'VND', true, '프리미엄 발코니 (2박 3일)');

-- 6. 캡틴 뷰 스위트 (1박 12,000,000 → 2박 24,000,000 / VIP)
INSERT INTO cruise_rate_card (cruise_name, schedule_type, room_type, price_adult, price_child, price_extra_bed, price_single, valid_year, valid_from, valid_to, currency, is_active, notes)
VALUES 
  ('아테나 프리미엄', '2N3D', 'Captain View Suite (VIP)', 24000000, 18000000, 24000000, 41000000, 2026, '2026-06-20', '2026-12-31', 'VND', true, '캡틴 뷰 스위트 (2박 3일, VIP)');

-- 7. 엘리트 스위트 (1박 14,500,000 → 2박 29,000,000 / VIP)
INSERT INTO cruise_rate_card (cruise_name, schedule_type, room_type, price_adult, price_child, price_extra_bed, price_single, valid_year, valid_from, valid_to, currency, is_active, notes)
VALUES 
  ('아테나 프리미엄', '2N3D', 'Elite Suite (VIP)', 29000000, 21800000, 29000000, 49500000, 2026, '2026-06-20', '2026-12-31', 'VND', true, '엘리트 스위트 (2박 3일, VIP)');

-- 8. 임페리얼 아테나 (1박 47,000,000 → 2박 94,000,000 / VIP)
INSERT INTO cruise_rate_card (cruise_name, schedule_type, room_type, price_adult, price_child, price_extra_bed, price_single, valid_year, valid_from, valid_to, currency, is_active, notes)
VALUES 
  ('아테나 프리미엄', '2N3D', 'Imperial Athena (VIP)', 94000000, 70400000, 94000000, 146000000, 2026, '2026-06-20', '2026-12-31', 'VND', true, '임페리얼 아테나 (2박 3일, VIP)');

-- ============================================================================
-- 2027년 아테나 프리미엄 크루즈 2N3D 요금 데이터 (1월 1일 ~ 12월 31일)
-- 2026년과 동일한 요금 적용
-- ============================================================================

-- 1. 아테나 오션뷰 (1박 5,175,000 → 2박 10,350,000)
INSERT INTO cruise_rate_card (cruise_name, schedule_type, room_type, price_adult, price_child, price_extra_bed, price_single, valid_year, valid_from, valid_to, currency, is_active, notes)
VALUES 
  ('아테나 프리미엄', '2N3D', 'Athena Ocean View', 10350000, 7800000, 10350000, 17800000, 2027, '2027-01-01', '2027-12-31', 'VND', true, '아테나 오션뷰 (2박 3일)');

-- 2. 이그제큐티브 발코니 (1박 5,700,000 → 2박 11,400,000)
INSERT INTO cruise_rate_card (cruise_name, schedule_type, room_type, price_adult, price_child, price_extra_bed, price_single, valid_year, valid_from, valid_to, currency, is_active, notes)
VALUES 
  ('아테나 프리미엄', '2N3D', 'Executive Balcony', 11400000, 8600000, 11400000, 19600000, 2027, '2027-01-01', '2027-12-31', 'VND', true, '이그제큐티브 발코니 (2박 3일)');

-- 3. 트리플 발코니 (1박 5,700,000 → 2박 11,400,000 / 엑스트라, 싱글차지 불가)
INSERT INTO cruise_rate_card (cruise_name, schedule_type, room_type, price_adult, price_child, extra_bed_available, valid_year, valid_from, valid_to, currency, is_active, notes)
VALUES 
  ('아테나 프리미엄', '2N3D', 'Triple Balcony', 11400000, 8600000, false, 2027, '2027-01-01', '2027-12-31', 'VND', true, '트리플 발코니 (2박 3일, 엑스트라/싱글차지 불가)');

-- 4. 커넥팅 발코니 (1박 5,450,000 → 2박 10,900,000 / 싱글차지 불가)
INSERT INTO cruise_rate_card (cruise_name, schedule_type, room_type, price_adult, price_child, price_extra_bed, valid_year, valid_from, valid_to, currency, is_active, notes)
VALUES 
  ('아테나 프리미엄', '2N3D', 'Connecting Balcony', 10900000, 8200000, 10900000, 2027, '2027-01-01', '2027-12-31', 'VND', true, '커넥팅 발코니 (2박 3일, 싱글차지 불가)');

-- 5. 프리미엄 발코니 (1박 6,750,000 → 2박 13,500,000)
INSERT INTO cruise_rate_card (cruise_name, schedule_type, room_type, price_adult, price_child, price_extra_bed, price_single, valid_year, valid_from, valid_to, currency, is_active, notes)
VALUES 
  ('아테나 프리미엄', '2N3D', 'Premium Balcony', 13500000, 10150000, 13500000, 23200000, 2027, '2027-01-01', '2027-12-31', 'VND', true, '프리미엄 발코니 (2박 3일)');

-- 6. 캡틴 뷰 스위트 (1박 12,000,000 → 2박 24,000,000 / VIP)
INSERT INTO cruise_rate_card (cruise_name, schedule_type, room_type, price_adult, price_child, price_extra_bed, price_single, valid_year, valid_from, valid_to, currency, is_active, notes)
VALUES 
  ('아테나 프리미엄', '2N3D', 'Captain View Suite (VIP)', 24000000, 18000000, 24000000, 41000000, 2027, '2027-01-01', '2027-12-31', 'VND', true, '캡틴 뷰 스위트 (2박 3일, VIP)');

-- 7. 엘리트 스위트 (1박 14,500,000 → 2박 29,000,000 / VIP)
INSERT INTO cruise_rate_card (cruise_name, schedule_type, room_type, price_adult, price_child, price_extra_bed, price_single, valid_year, valid_from, valid_to, currency, is_active, notes)
VALUES 
  ('아테나 프리미엄', '2N3D', 'Elite Suite (VIP)', 29000000, 21800000, 29000000, 49500000, 2027, '2027-01-01', '2027-12-31', 'VND', true, '엘리트 스위트 (2박 3일, VIP)');

-- 8. 임페리얼 아테나 (1박 47,000,000 → 2박 94,000,000 / VIP)
INSERT INTO cruise_rate_card (cruise_name, schedule_type, room_type, price_adult, price_child, price_extra_bed, price_single, valid_year, valid_from, valid_to, currency, is_active, notes)
VALUES 
  ('아테나 프리미엄', '2N3D', 'Imperial Athena (VIP)', 94000000, 70400000, 94000000, 146000000, 2027, '2027-01-01', '2027-12-31', 'VND', true, '임페리얼 아테나 (2박 3일, VIP)');

COMMIT;

-- ============================================================================
-- 검증 쿼리 (SELECT하여 입력 데이터 확인)
-- ============================================================================
-- 아테나 프리미엄 2N3D 크루즈 데이터 확인 (2026, 2027 총 16개)
-- SELECT COUNT(*) FROM cruise_rate_card WHERE cruise_name = '아테나 프리미엄' AND schedule_type = '2N3D';
-- SELECT cruise_name, schedule_type, room_type, valid_year, price_adult, price_child FROM cruise_rate_card WHERE cruise_name = '아테나 프리미엄' AND schedule_type = '2N3D' ORDER BY valid_year, room_type;
