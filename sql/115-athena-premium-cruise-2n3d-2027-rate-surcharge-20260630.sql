-- 아테나 프리미엄 크루즈 2박3일 2027년 요금 + 휴일 추가요금표 (2026-06-30)
-- 요청: 
--   1. 2박3일 기본 요금표 추가 (1N2D × 2배)
--   2. 27년 전체 기간 적용 (2027-01-01 ~ 2027-12-31)
--   3. 객실명 한글 정규화
--   4. 크루즈명: "아테나 프리미엄 크루즈"로 통일
-- 대상 테이블: cruise_rate_card, cruise_holiday_surcharge

BEGIN;

-- ============================================================
-- 1단계: 기존 데이터 정규화 (크루즈명 + 객실명 한글화)
-- ============================================================
UPDATE public.cruise_rate_card
SET
  cruise_name = '아테나 프리미엄 크루즈',
  room_type = CASE room_type
    WHEN 'Athena Ocean View' THEN '아테나 오션뷰'
    WHEN 'Executive Balcony' THEN '이그제큐티브 발코니'
    WHEN 'Triple Balcony' THEN '트리플 발코니'
    WHEN 'Connecting Balcony' THEN '커넥팅 발코니'
    WHEN 'Premium Balcony' THEN '프리미엄 발코니'
    WHEN 'Captain View Suite (VIP)' THEN '캡틴 뷰 스위트'
    WHEN 'Elite Suite (VIP)' THEN '엘리트 스위트'
    WHEN 'Imperial Athena (VIP)' THEN '임페리얼 아테나'
    ELSE room_type
  END,
  updated_at = now()
WHERE cruise_name IN (
    '아테나 프리미엄',
    '아테나 프리미엄 크루즈',
    '아테네 프리미엄',
    '아테네 프리미엄 크루즈'
  )
  AND schedule_type = '1N2D'
  AND valid_year IN (2026, 2027);

-- ============================================================
-- 2단계: 아테나 프리미엄 크루즈 2N3D 요금표 삽입 (2027년)
-- 기준: 1N2D × 2배 (1N2D 2026년 요금 기준)
-- 적용 기간: 2027-01-01 ~ 2027-12-31
-- ============================================================

INSERT INTO public.cruise_rate_card (
  cruise_name,
  schedule_type,
  room_type,
  room_type_en,
  price_adult,
  price_child,
  price_child_older,
  price_infant,
  price_extra_bed,
  price_child_extra_bed,
  price_single,
  extra_bed_available,
  single_available,
  valid_year,
  valid_from,
  valid_to,
  display_order,
  currency,
  is_active,
  notes,
  includes_vehicle,
  vehicle_type,
  infant_policy,
  season_name,
  is_promotion,
  child_age_range,
  created_at,
  updated_at
)
VALUES
  -- 1. 아테나 오션뷰 (1N2D: 5,175,000 → 2N3D: 10,350,000)
  (
    '아테나 프리미엄 크루즈',
    '2N3D',
    '아테나 오션뷰',
    'Athena Ocean View',
    10350000,
    7800000,
    NULL,
    0,
    10350000,
    NULL,
    17800000,
    true,
    true,
    2027,
    DATE '2027-01-01',
    DATE '2027-12-31',
    0,
    'VND',
    true,
    '2027년 2박3일 요금 (1N2D × 2배)',
    false,
    NULL,
    NULL,
    NULL,
    false,
    NULL,
    now(),
    now()
  ),
  -- 2. 이그제큐티브 발코니 (1N2D: 5,700,000 → 2N3D: 11,400,000)
  (
    '아테나 프리미엄 크루즈',
    '2N3D',
    '이그제큐티브 발코니',
    'Executive Balcony',
    11400000,
    8600000,
    NULL,
    0,
    11400000,
    NULL,
    19600000,
    true,
    true,
    2027,
    DATE '2027-01-01',
    DATE '2027-12-31',
    1,
    'VND',
    true,
    '2027년 2박3일 요금 (1N2D × 2배)',
    false,
    NULL,
    NULL,
    NULL,
    false,
    NULL,
    now(),
    now()
  ),
  -- 3. 트리플 발코니 (1N2D: 5,700,000 → 2N3D: 11,400,000 / 엑스트라·싱글차지 불가)
  (
    '아테나 프리미엄 크루즈',
    '2N3D',
    '트리플 발코니',
    'Triple Balcony',
    11400000,
    8600000,
    NULL,
    0,
    NULL,
    NULL,
    NULL,
    false,
    false,
    2027,
    DATE '2027-01-01',
    DATE '2027-12-31',
    2,
    'VND',
    true,
    '2027년 2박3일 요금 (1N2D × 2배) - 엑스트라/싱글차지 불가',
    false,
    NULL,
    NULL,
    NULL,
    false,
    NULL,
    now(),
    now()
  ),
  -- 4. 커넥팅 발코니 (1N2D: 5,450,000 → 2N3D: 10,900,000 / 싱글차지 불가)
  (
    '아테나 프리미엄 크루즈',
    '2N3D',
    '커넥팅 발코니',
    'Connecting Balcony',
    10900000,
    8200000,
    NULL,
    0,
    10900000,
    NULL,
    NULL,
    true,
    false,
    2027,
    DATE '2027-01-01',
    DATE '2027-12-31',
    3,
    'VND',
    true,
    '2027년 2박3일 요금 (1N2D × 2배) - 싱글차지 불가',
    false,
    NULL,
    NULL,
    NULL,
    false,
    NULL,
    now(),
    now()
  ),
  -- 5. 프리미엄 발코니 (1N2D: 6,750,000 → 2N3D: 13,500,000)
  (
    '아테나 프리미엄 크루즈',
    '2N3D',
    '프리미엄 발코니',
    'Premium Balcony',
    13500000,
    10150000,
    NULL,
    0,
    13500000,
    NULL,
    23200000,
    true,
    true,
    2027,
    DATE '2027-01-01',
    DATE '2027-12-31',
    4,
    'VND',
    true,
    '2027년 2박3일 요금 (1N2D × 2배)',
    false,
    NULL,
    NULL,
    NULL,
    false,
    NULL,
    now(),
    now()
  ),
  -- 6. 캡틴 뷰 스위트 (VIP) (1N2D: 12,000,000 → 2N3D: 24,000,000)
  (
    '아테나 프리미엄 크루즈',
    '2N3D',
    '캡틴 뷰 스위트',
    'Captain View Suite (VIP)',
    24000000,
    18000000,
    NULL,
    0,
    24000000,
    NULL,
    41000000,
    true,
    true,
    2027,
    DATE '2027-01-01',
    DATE '2027-12-31',
    5,
    'VND',
    true,
    '2027년 2박3일 요금 (1N2D × 2배) - VIP',
    false,
    NULL,
    NULL,
    NULL,
    false,
    NULL,
    now(),
    now()
  ),
  -- 7. 엘리트 스위트 (VIP) (1N2D: 14,500,000 → 2N3D: 29,000,000)
  (
    '아테나 프리미엄 크루즈',
    '2N3D',
    '엘리트 스위트',
    'Elite Suite (VIP)',
    29000000,
    21800000,
    NULL,
    0,
    29000000,
    NULL,
    49500000,
    true,
    true,
    2027,
    DATE '2027-01-01',
    DATE '2027-12-31',
    6,
    'VND',
    true,
    '2027년 2박3일 요금 (1N2D × 2배) - VIP',
    false,
    NULL,
    NULL,
    NULL,
    false,
    NULL,
    now(),
    now()
  ),
  -- 8. 임페리얼 아테나 (VIP) (1N2D: 47,000,000 → 2N3D: 94,000,000)
  (
    '아테나 프리미엄 크루즈',
    '2N3D',
    '임페리얼 아테나',
    'Imperial Athena (VIP)',
    94000000,
    70400000,
    NULL,
    0,
    94000000,
    NULL,
    146000000,
    true,
    true,
    2027,
    DATE '2027-01-01',
    DATE '2027-12-31',
    7,
    'VND',
    true,
    '2027년 2박3일 요금 (1N2D × 2배) - VIP 최고급',
    false,
    NULL,
    NULL,
    NULL,
    false,
    NULL,
    now(),
    now()
  );

-- ============================================================
-- 3단계: 2N3D 휴일 추가요금 데이터 (선택사항)
-- 참고: 1N2D 추가요금이 없으므로 기본 추가요금 설정
-- 필요시 매니저 협의 후 추가 가능
-- ============================================================

-- 기존 1N2D 추가요금이 없으므로 기본 설정 값 없음
-- 필요시 아래 주석 라인 활성화:
--
-- INSERT INTO public.cruise_holiday_surcharge (
--   cruise_name,
--   schedule_type,
--   holiday_date,
--   holiday_date_end,
--   holiday_name,
--   surcharge_per_person,
--   surcharge_child,
--   surcharge_type,
--   valid_year,
--   is_confirmed,
--   currency,
--   notes,
--   created_at,
--   updated_at
-- )
-- VALUES
--   ('아테나 프리미엄 크루즈', '2N3D', DATE '2027-12-24', NULL,              '크리스마스 이브',    1000000, 500000, 'per_person', 2027, false, 'VND', '매니저 확인 필요',  now(), now()),
--   ('아테나 프리미엄 크루즈', '2N3D', DATE '2027-12-30', DATE '2028-01-03', '연말연초 특별 기간', 1000000, 500000, 'per_person', 2027, false, 'VND', '매니저 확인 필요',  now(), now());

-- ============================================================
-- 4단계: 크루즈명 정규화 (holiday_surcharge)
-- ============================================================
UPDATE public.cruise_holiday_surcharge
SET
  cruise_name = '아테나 프리미엄 크루즈',
  updated_at = now()
WHERE cruise_name IN (
  '아테나 프리미엄',
  '아테나 프리미엄 크루즈',
  '아테네 프리미엄',
  '아테네 프리미엄 크루즈'
)
  AND schedule_type = '1N2D';

COMMIT;

-- ============================================================
-- 검증 쿼리
-- ============================================================
-- 1) 2N3D 2027년 요금표 확인
-- SELECT
--   cruise_name,
--   schedule_type,
--   room_type,
--   price_adult,
--   price_child,
--   price_extra_bed,
--   price_single,
--   valid_from,
--   valid_to,
--   valid_year
-- FROM public.cruise_rate_card
-- WHERE cruise_name = '아테나 프리미엄 크루즈'
--   AND schedule_type = '2N3D'
--   AND valid_year = 2027
-- ORDER BY display_order, room_type;

-- 2) 1N2D vs 2N3D 가격 비교 (2N3D = 1N2D × 2 확인)
-- SELECT
--   '1N2D' as schedule_type,
--   room_type,
--   price_adult as price_adult,
--   price_child as price_child
-- FROM public.cruise_rate_card
-- WHERE cruise_name = '아테나 프리미엄 크루즈'
--   AND schedule_type = '1N2D'
--   AND valid_year = 2026
-- UNION ALL
-- SELECT
--   '2N3D' as schedule_type,
--   room_type,
--   price_adult,
--   price_child
-- FROM public.cruise_rate_card
-- WHERE cruise_name = '아테나 프리미엄 크루즈'
--   AND schedule_type = '2N3D'
--   AND valid_year = 2027
-- ORDER BY room_type, schedule_type;

-- 3) 객실명 한글화 확인 (영문이 있으면 안 됨)
-- SELECT DISTINCT room_type
-- FROM public.cruise_rate_card
-- WHERE cruise_name = '아테나 프리미엄 크루즈'
-- ORDER BY room_type;

-- 4) 크루즈명 통일 확인
-- SELECT DISTINCT cruise_name
-- FROM public.cruise_rate_card
-- WHERE cruise_name LIKE '아테나%' OR cruise_name LIKE '아테네%'
-- ORDER BY cruise_name;
