-- ================================================================
-- 드래곤 펄 레스토랑 메인 메뉴 옵션 추가
-- 2026-05-23
-- 대상: is_cruise_addon = true 인 모든 투어 (드래곤 펄 레스토랑 계열)
-- ================================================================

-- [1] 현재 드래곤 펄 투어 목록 확인 (실행 전 참고용)
-- SELECT tour_id, tour_name, tour_code, is_cruise_addon
-- FROM tour
-- WHERE is_cruise_addon = true AND is_active = true
-- ORDER BY tour_name;

-- ================================================================
-- [2] 기존 메뉴 옵션 중복 방지를 위해 먼저 확인
-- ================================================================
-- SELECT tao.option_name, t.tour_name
-- FROM tour_addon_options tao
-- JOIN tour t ON t.tour_id = tao.tour_id
-- WHERE t.is_cruise_addon = true
-- ORDER BY t.tour_name, tao.order_seq;

-- ================================================================
-- [3] 랍스터 메뉴 옵션 추가
-- ================================================================
INSERT INTO tour_addon_options (
    option_id,
    tour_id,
    option_name,
    option_category,
    description,
    price,
    price_type,
    price_currency,
    is_required,
    is_available,
    order_seq,
    created_at,
    updated_at
)
SELECT
    gen_random_uuid(),
    t.tour_id,
    '랍스터',
    'meal'::option_category,
    '신선한 랍스터 구이 요리',
    0,
    'per_person'::price_type,
    'VND',
    false,
    true,
    1,
    NOW(),
    NOW()
FROM tour t
WHERE t.is_cruise_addon = true
  AND t.is_active = true
  AND NOT EXISTS (
      SELECT 1 FROM tour_addon_options tao
      WHERE tao.tour_id = t.tour_id
        AND tao.option_name = '랍스터'
  );

-- ================================================================
-- [4] 생선요리 메뉴 옵션 추가
-- ================================================================
INSERT INTO tour_addon_options (
    option_id,
    tour_id,
    option_name,
    option_category,
    description,
    price,
    price_type,
    price_currency,
    is_required,
    is_available,
    order_seq,
    created_at,
    updated_at
)
SELECT
    gen_random_uuid(),
    t.tour_id,
    '생선요리',
    'meal'::option_category,
    '신선한 생선 구이/찜 요리',
    0,
    'per_person'::price_type,
    'VND',
    false,
    true,
    2,
    NOW(),
    NOW()
FROM tour t
WHERE t.is_cruise_addon = true
  AND t.is_active = true
  AND NOT EXISTS (
      SELECT 1 FROM tour_addon_options tao
      WHERE tao.tour_id = t.tour_id
        AND tao.option_name = '생선요리'
  );

-- ================================================================
-- [5] 추가 결과 확인
-- ================================================================
SELECT
    t.tour_name,
    tao.option_name,
    tao.option_category,
    tao.description,
    tao.price,
    tao.is_available,
    tao.order_seq
FROM tour_addon_options tao
JOIN tour t ON t.tour_id = tao.tour_id
WHERE t.is_cruise_addon = true
  AND tao.option_category = 'meal'
ORDER BY t.tour_name, tao.order_seq;
