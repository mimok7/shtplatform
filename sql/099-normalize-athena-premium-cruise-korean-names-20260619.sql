-- ============================================================================
-- 아테나 프리미엄 크루즈 명칭/객실명 한글 정규화
-- ============================================================================
-- 목적:
--   - cruise_rate_card의 크루즈명을 '아테나 프리미엄 크루즈'로 통일
--   - cruise_rate_card.room_type의 영문 객실명을 한글명으로 통일
--   - cruise_info.cruise_name / room_name도 같은 기준으로 정리
--
-- 비고:
--   - 앱 내부에는 '아테나 프리미엄 크루즈' exact match 비교가 이미 존재하므로
--     최종 표기는 '아테나 프리미엄 크루즈'로 고정한다.
--   - 사용자 입력 오타 가능성을 고려해 '아테네 프리미엄*' 표기도 함께 흡수한다.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. cruise_rate_card 정규화
-- ============================================================================
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
  );

-- ============================================================================
-- 2. cruise_info 정규화
-- ============================================================================
UPDATE public.cruise_info
SET
  cruise_name = '아테나 프리미엄 크루즈',
  room_name = CASE
    WHEN cruise_code = 'ATHE-OV' THEN '아테나 오션뷰'
    WHEN cruise_code = 'ATHE-EB' THEN '이그제큐티브 발코니'
    WHEN cruise_code = 'ATHE-TB' THEN '트리플 발코니'
    WHEN cruise_code = 'ATHE-CB' THEN '커넥팅 발코니'
    WHEN cruise_code = 'ATHE-PB' THEN '프리미엄 발코니'
    WHEN cruise_code = 'ATHE-CV' THEN '캡틴 뷰 스위트'
    WHEN cruise_code = 'ATHE-ES' THEN '엘리트 스위트'
    ELSE CASE room_name
      WHEN 'Athena Ocean View' THEN '아테나 오션뷰'
      WHEN 'Executive Balcony' THEN '이그제큐티브 발코니'
      WHEN 'Triple Balcony' THEN '트리플 발코니'
      WHEN 'Connecting Balcony' THEN '커넥팅 발코니'
      WHEN 'Premium Balcony' THEN '프리미엄 발코니'
      WHEN 'Captain View Suite (VIP)' THEN '캡틴 뷰 스위트'
      WHEN 'Elite Suite (VIP)' THEN '엘리트 스위트'
      WHEN 'Imperial Athena (VIP)' THEN '임페리얼 아테나'
      ELSE room_name
    END
  END,
  updated_at = now()
WHERE cruise_name IN (
    '아테나 프리미엄',
    '아테나 프리미엄 크루즈',
    '아테네 프리미엄',
    '아테네 프리미엄 크루즈'
  )
   OR cruise_code LIKE 'ATHE-%';

-- ============================================================================
-- 3. 연관 테이블의 cruise_name 표기 통일
-- ============================================================================
UPDATE public.cruise_holiday_surcharge
SET cruise_name = '아테나 프리미엄 크루즈', updated_at = now()
WHERE cruise_name IN (
  '아테나 프리미엄',
  '아테나 프리미엄 크루즈',
  '아테네 프리미엄',
  '아테네 프리미엄 크루즈'
);

UPDATE public.cruise_promotion
SET cruise_name = '아테나 프리미엄 크루즈', updated_at = now()
WHERE cruise_name IN (
  '아테나 프리미엄',
  '아테나 프리미엄 크루즈',
  '아테네 프리미엄',
  '아테네 프리미엄 크루즈'
);

UPDATE public.cruise_tour_options
SET cruise_name = '아테나 프리미엄 크루즈', updated_at = CURRENT_TIMESTAMP
WHERE cruise_name IN (
  '아테나 프리미엄',
  '아테나 프리미엄 크루즈',
  '아테네 프리미엄',
  '아테네 프리미엄 크루즈'
);

COMMIT;

-- 검증 쿼리
-- SELECT cruise_name, room_type, price_adult, price_child, price_extra_bed, price_single
-- FROM public.cruise_rate_card
-- WHERE cruise_name = '아테나 프리미엄 크루즈'
-- ORDER BY display_order, room_type;

-- SELECT cruise_code, cruise_name, room_name
-- FROM public.cruise_info
-- WHERE cruise_name = '아테나 프리미엄 크루즈'
-- ORDER BY display_order, cruise_code;