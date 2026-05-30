-- Grand Pioneers promotion room-name fix
-- Purpose: align GP-VOUCHER-2026-100TEAMS with current cruise_rate_card exact-match keys.
-- This migration does not update or delete base cruise_rate_card rows.

BEGIN;

INSERT INTO public.cruise_promotion (
  code,
  name,
  cruise_name,
  booking_from,
  booking_to,
  checkin_from,
  checkin_to,
  quota_total,
  is_active,
  notes
) VALUES (
  'GP-VOUCHER-2026-100TEAMS',
  '그랜드 파이어니스 바우처 프로모션',
  '그랜드 파이어니스',
  DATE '2026-05-23',
  NULL,
  DATE '2026-06-01',
  DATE '2026-12-31',
  100,
  true,
  '선착순 100팀 한정. 기존 cruise_rate_card 데이터는 변경하지 않고 프로모션 레이어로 적용. room_type은 기존 한글 객실명과 exact match.'
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  cruise_name = EXCLUDED.cruise_name,
  booking_from = EXCLUDED.booking_from,
  booking_to = EXCLUDED.booking_to,
  checkin_from = EXCLUDED.checkin_from,
  checkin_to = EXCLUDED.checkin_to,
  quota_total = EXCLUDED.quota_total,
  is_active = EXCLUDED.is_active,
  notes = EXCLUDED.notes,
  updated_at = now();

WITH promo AS (
  SELECT id
  FROM public.cruise_promotion
  WHERE code = 'GP-VOUCHER-2026-100TEAMS'
), fixed_rates AS (
  SELECT * FROM (VALUES
    ('1N2D', '오션발코니 스위트', DATE '2026-06-01', DATE '2026-12-31',  5025000::NUMERIC, 3000000::NUMERIC, NULL::NUMERIC,  4500000::NUMERIC, 4025000::NUMERIC, NULL::NUMERIC),
    ('1N2D', '베란다 스위트',       DATE '2026-06-01', DATE '2026-12-31',  6000000::NUMERIC, 3000000::NUMERIC, NULL::NUMERIC,  5400000::NUMERIC, 4025000::NUMERIC, NULL::NUMERIC),
    ('2N3D', '오션발코니 스위트', DATE '2026-06-01', DATE '2026-12-31',  9600000::NUMERIC, 5700000::NUMERIC, NULL::NUMERIC,  8650000::NUMERIC, 7700000::NUMERIC, NULL::NUMERIC),
    ('2N3D', '베란다 스위트',       DATE '2026-06-01', DATE '2026-12-31', 11500000::NUMERIC, 5700000::NUMERIC, NULL::NUMERIC, 10350000::NUMERIC, 7700000::NUMERIC, NULL::NUMERIC)
  ) AS r(schedule_type, room_type, checkin_from, checkin_to, price_adult, price_child, price_infant, price_extra_bed, price_child_extra_bed, price_single)
)
INSERT INTO public.cruise_promotion_rate (
  promotion_id,
  schedule_type,
  room_type,
  checkin_from,
  checkin_to,
  price_adult,
  price_child,
  price_infant,
  price_extra_bed,
  price_child_extra_bed,
  price_single
)
SELECT
  promo.id,
  fixed_rates.schedule_type,
  fixed_rates.room_type,
  fixed_rates.checkin_from,
  fixed_rates.checkin_to,
  fixed_rates.price_adult,
  fixed_rates.price_child,
  fixed_rates.price_infant,
  fixed_rates.price_extra_bed,
  fixed_rates.price_child_extra_bed,
  fixed_rates.price_single
FROM promo
CROSS JOIN fixed_rates
ON CONFLICT (promotion_id, schedule_type, room_type, checkin_from, checkin_to) DO UPDATE SET
  price_adult = EXCLUDED.price_adult,
  price_child = EXCLUDED.price_child,
  price_infant = EXCLUDED.price_infant,
  price_extra_bed = EXCLUDED.price_extra_bed,
  price_child_extra_bed = EXCLUDED.price_child_extra_bed,
  price_single = EXCLUDED.price_single,
  updated_at = now();

WITH promo AS (
  SELECT id
  FROM public.cruise_promotion
  WHERE code = 'GP-VOUCHER-2026-100TEAMS'
)
DELETE FROM public.cruise_promotion_rate pr
USING promo
WHERE pr.promotion_id = promo.id
  AND pr.room_type IN ('Ocean Balcony Suite', 'Veranda Suite');

COMMIT;

-- Verification: every row should return has_base_rate_card = true.
SELECT
  p.code,
  p.cruise_name,
  pr.schedule_type,
  pr.room_type,
  EXISTS (
    SELECT 1
    FROM public.cruise_rate_card rc
    WHERE rc.cruise_name = p.cruise_name
      AND rc.schedule_type = pr.schedule_type
      AND rc.room_type = pr.room_type
      AND rc.valid_year = 2026
      AND rc.is_active = true
      AND (
        (rc.valid_from IS NULL AND rc.valid_to IS NULL)
        OR (rc.valid_from <= pr.checkin_to AND rc.valid_to >= pr.checkin_from)
      )
  ) AS has_base_rate_card
FROM public.cruise_promotion p
JOIN public.cruise_promotion_rate pr ON pr.promotion_id = p.id
WHERE p.code = 'GP-VOUCHER-2026-100TEAMS'
ORDER BY pr.schedule_type, pr.room_type;

-- Diagnostic: should return zero rows after the fix.
SELECT
  p.code,
  p.cruise_name,
  pr.schedule_type,
  pr.room_type
FROM public.cruise_promotion p
JOIN public.cruise_promotion_rate pr ON pr.promotion_id = p.id
WHERE p.code = 'GP-VOUCHER-2026-100TEAMS'
  AND NOT EXISTS (
    SELECT 1
    FROM public.cruise_rate_card rc
    WHERE rc.cruise_name = p.cruise_name
      AND rc.schedule_type = pr.schedule_type
      AND rc.room_type = pr.room_type
      AND rc.valid_year = 2026
      AND rc.is_active = true
      AND (
        (rc.valid_from IS NULL AND rc.valid_to IS NULL)
        OR (rc.valid_from <= pr.checkin_to AND rc.valid_to >= pr.checkin_from)
      )
  )
ORDER BY pr.schedule_type, pr.room_type;