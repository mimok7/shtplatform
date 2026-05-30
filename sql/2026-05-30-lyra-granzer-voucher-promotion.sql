-- Lyra Granzer voucher promotion layer
-- Existing cruise_rate_card rows are not updated or deleted by this migration.
-- Run after 2026-05-30-grand-pioneers-voucher-promotion.sql.

ALTER TABLE public.cruise_promotion_rate ADD COLUMN IF NOT EXISTS checkin_from DATE;
ALTER TABLE public.cruise_promotion_rate ADD COLUMN IF NOT EXISTS checkin_to DATE;
ALTER TABLE public.cruise_promotion_rate ADD COLUMN IF NOT EXISTS price_infant NUMERIC(15, 0);
ALTER TABLE public.cruise_promotion_rate ADD COLUMN IF NOT EXISTS price_single NUMERIC(15, 0);

UPDATE public.cruise_promotion_rate pr
SET checkin_from = p.checkin_from,
    checkin_to = p.checkin_to
FROM public.cruise_promotion p
WHERE pr.promotion_id = p.id
  AND (pr.checkin_from IS NULL OR pr.checkin_to IS NULL);

ALTER TABLE public.cruise_promotion_rate ALTER COLUMN checkin_from SET NOT NULL;
ALTER TABLE public.cruise_promotion_rate ALTER COLUMN checkin_to SET NOT NULL;

ALTER TABLE public.cruise_promotion_rate DROP CONSTRAINT IF EXISTS cruise_promotion_rate_unique;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'cruise_promotion_rate_unique'
      AND conrelid = 'public.cruise_promotion_rate'::regclass
  ) THEN
    ALTER TABLE public.cruise_promotion_rate
      ADD CONSTRAINT cruise_promotion_rate_unique
      UNIQUE (promotion_id, schedule_type, room_type, checkin_from, checkin_to);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_cruise_promotion_rate_lookup
  ON public.cruise_promotion_rate(promotion_id, schedule_type, room_type, checkin_from, checkin_to);

CREATE OR REPLACE FUNCTION public.get_applicable_cruise_rate_cards(
  p_schedule_type TEXT,
  p_checkin_date DATE,
  p_cruise_name TEXT DEFAULT NULL,
  p_room_type TEXT DEFAULT NULL,
  p_booking_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  id UUID,
  cruise_name TEXT,
  schedule_type TEXT,
  room_type TEXT,
  room_type_en TEXT,
  price_adult NUMERIC,
  price_child NUMERIC,
  price_infant NUMERIC,
  price_extra_bed NUMERIC,
  price_single NUMERIC,
  valid_year INTEGER,
  valid_from DATE,
  valid_to DATE,
  display_order INTEGER,
  currency TEXT,
  is_active BOOLEAN,
  notes TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  price_child_extra_bed NUMERIC,
  extra_bed_available BOOLEAN,
  includes_vehicle BOOLEAN,
  vehicle_type TEXT,
  infant_policy TEXT,
  season_name TEXT,
  is_promotion BOOLEAN,
  price_child_older NUMERIC,
  child_age_range TEXT,
  single_available BOOLEAN,
  promotion_code TEXT,
  promotion_name TEXT,
  promotion_quota_remaining INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT rc.*
    FROM public.cruise_rate_card rc
    WHERE rc.schedule_type = p_schedule_type
      AND rc.valid_year = EXTRACT(YEAR FROM p_checkin_date)::INTEGER
      AND rc.is_active = true
      AND (p_cruise_name IS NULL OR rc.cruise_name = p_cruise_name)
      AND (p_room_type IS NULL OR rc.room_type = p_room_type)
      AND (
        (rc.valid_from IS NULL AND rc.valid_to IS NULL)
        OR (rc.valid_from <= p_checkin_date AND rc.valid_to >= p_checkin_date)
      )
  )
  SELECT
    b.id,
    b.cruise_name,
    b.schedule_type,
    b.room_type,
    b.room_type_en,
    COALESCE(ap.price_adult, b.price_adult) AS price_adult,
    COALESCE(ap.price_child, b.price_child) AS price_child,
    COALESCE(ap.price_infant, b.price_infant) AS price_infant,
    COALESCE(ap.price_extra_bed, b.price_extra_bed) AS price_extra_bed,
    COALESCE(ap.price_single, b.price_single) AS price_single,
    b.valid_year,
    b.valid_from,
    b.valid_to,
    b.display_order,
    b.currency,
    b.is_active,
    CASE WHEN ap.promotion_id IS NOT NULL THEN concat_ws(E'\n', b.notes, ap.name) ELSE b.notes END AS notes,
    b.created_at,
    b.updated_at,
    COALESCE(ap.price_child_extra_bed, b.price_child_extra_bed) AS price_child_extra_bed,
    b.extra_bed_available,
    b.includes_vehicle,
    b.vehicle_type,
    b.infant_policy,
    CASE WHEN ap.promotion_id IS NOT NULL THEN ap.name ELSE b.season_name END AS season_name,
    CASE WHEN ap.promotion_id IS NOT NULL THEN true ELSE b.is_promotion END AS is_promotion,
    b.price_child_older,
    b.child_age_range,
    b.single_available,
    ap.code AS promotion_code,
    ap.name AS promotion_name,
    ap.remaining AS promotion_quota_remaining
  FROM base b
  LEFT JOIN LATERAL (
    SELECT
      p.id AS promotion_id,
      p.code,
      p.name,
      pr.price_adult,
      pr.price_child,
      pr.price_infant,
      pr.price_extra_bed,
      pr.price_child_extra_bed,
      pr.price_single,
      p.quota_total - COUNT(u.id)::INTEGER AS remaining
    FROM public.cruise_promotion p
    JOIN public.cruise_promotion_rate pr ON pr.promotion_id = p.id
    LEFT JOIN public.cruise_promotion_usage u
      ON u.promotion_id = p.id
     AND u.status IN ('reserved', 'confirmed')
    WHERE p.is_active = true
      AND p.cruise_name = b.cruise_name
      AND pr.schedule_type = b.schedule_type
      AND pr.room_type = b.room_type
      AND p_checkin_date BETWEEN pr.checkin_from AND pr.checkin_to
      AND p_booking_date >= p.booking_from
      AND (p.booking_to IS NULL OR p_booking_date <= p.booking_to)
      AND p_checkin_date BETWEEN p.checkin_from AND p.checkin_to
    GROUP BY p.id, p.code, p.name, p.quota_total, pr.price_adult, pr.price_child, pr.price_infant, pr.price_extra_bed, pr.price_child_extra_bed, pr.price_single
    HAVING p.quota_total - COUNT(u.id)::INTEGER > 0
    ORDER BY p.booking_from DESC, p.created_at DESC
    LIMIT 1
  ) ap ON true
  ORDER BY
    CASE WHEN ap.promotion_id IS NOT NULL THEN 0 ELSE 1 END,
    COALESCE(ap.price_adult, b.price_adult),
    b.display_order;
$$;

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
  'LYRA-GRANZER-1N2D-VOUCHER-2026-30',
  '라이라 그랜져 1박2일 바우처 프로모션',
  '라이라 그랜져 크루즈',
  '2026-05-27',
  NULL,
  '2026-05-01',
  '2026-10-31',
  30,
  true,
  '선착순 30팀 한정. 2026년 5/6/7/8/9/10월 승선 요금. 차량 이용 시 50% 할인은 앱 저장 로직에서 함께 적용.'
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
  SELECT id FROM public.cruise_promotion WHERE code = 'LYRA-GRANZER-1N2D-VOUCHER-2026-30'
), periods AS (
  SELECT * FROM (VALUES
    ('LOW', '2026-05-01'::DATE, '2026-06-30'::DATE),
    ('LOW', '2026-09-01'::DATE, '2026-09-30'::DATE),
    ('PEAK', '2026-07-01'::DATE, '2026-08-31'::DATE),
    ('OCT', '2026-10-01'::DATE, '2026-10-31'::DATE)
  ) AS p(season_key, checkin_from, checkin_to)
), rates AS (
  SELECT * FROM (VALUES
    ('LOW', '오아시스 스위트 (1층)', 5000000::NUMERIC, 2500000::NUMERIC, 1500000::NUMERIC, 3750000::NUMERIC, NULL::NUMERIC, 8500000::NUMERIC),
    ('LOW', '하모니 스위트 (2층)', 5350000::NUMERIC, 2700000::NUMERIC, 1605000::NUMERIC, 4050000::NUMERIC, NULL::NUMERIC, 9150000::NUMERIC),
    ('LOW', '스카이 스위트 (3층)', 5900000::NUMERIC, 2950000::NUMERIC, 1770000::NUMERIC, 4450000::NUMERIC, NULL::NUMERIC, 10100000::NUMERIC),
    ('LOW', '스카이 테라스 스위트 (3층)', 8280000::NUMERIC, 4150000::NUMERIC, 2484000::NUMERIC, 6200000::NUMERIC, NULL::NUMERIC, 14080000::NUMERIC),
    ('LOW', '오아시스 패밀리 스위트 (1층/4인)', 4500000::NUMERIC, NULL::NUMERIC, 1350000::NUMERIC, NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC),
    ('LOW', '하모니 패밀리 스위트 (2층/4~5인)', 4850000::NUMERIC, NULL::NUMERIC, 1455000::NUMERIC, NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC),
    ('LOW', '스카이 패밀리 스위트 (3층/4인)', 5300000::NUMERIC, NULL::NUMERIC, 1590000::NUMERIC, NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC),
    ('LOW', '스카이 테라스 패밀리 스위트 (3층/4명)', 5850000::NUMERIC, NULL::NUMERIC, 1755000::NUMERIC, NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC),
    ('LOW', '듀플렉스 패밀리 스위트 (3-4층/4인)', 6450000::NUMERIC, NULL::NUMERIC, 1935000::NUMERIC, NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC),
    ('LOW', '라 스위트 드 LYRA (2층)', 10650000::NUMERIC, 5320000::NUMERIC, 3195000::NUMERIC, NULL::NUMERIC, NULL::NUMERIC, 18050000::NUMERIC),
    ('LOW', '오너스 스위트', 20700000::NUMERIC, 10350000::NUMERIC, 6210000::NUMERIC, NULL::NUMERIC, NULL::NUMERIC, 35190000::NUMERIC),
    ('PEAK', '오아시스 스위트 (1층)', 5450000::NUMERIC, 2725000::NUMERIC, 1635000::NUMERIC, 4100000::NUMERIC, NULL::NUMERIC, 9265000::NUMERIC),
    ('PEAK', '하모니 스위트 (2층)', 5850000::NUMERIC, 2925000::NUMERIC, 1755000::NUMERIC, 4390000::NUMERIC, NULL::NUMERIC, 9945000::NUMERIC),
    ('PEAK', '스카이 스위트 (3층)', 6450000::NUMERIC, 3225000::NUMERIC, 1935000::NUMERIC, 4390000::NUMERIC, NULL::NUMERIC, 10965000::NUMERIC),
    ('PEAK', '스카이 테라스 스위트 (3층)', 9000000::NUMERIC, 4500000::NUMERIC, 2700000::NUMERIC, 6750000::NUMERIC, NULL::NUMERIC, 15300000::NUMERIC),
    ('PEAK', '오아시스 패밀리 스위트 (1층/4인)', 4900000::NUMERIC, NULL::NUMERIC, 1470000::NUMERIC, NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC),
    ('PEAK', '하모니 패밀리 스위트 (2층/4~5인)', 5250000::NUMERIC, NULL::NUMERIC, 1575000::NUMERIC, NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC),
    ('PEAK', '스카이 패밀리 스위트 (3층/4인)', 5775000::NUMERIC, NULL::NUMERIC, 1732500::NUMERIC, NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC),
    ('PEAK', '스카이 테라스 패밀리 스위트 (3층/4명)', 6375000::NUMERIC, NULL::NUMERIC, 1912500::NUMERIC, NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC),
    ('PEAK', '듀플렉스 패밀리 스위트 (3-4층/4인)', 7000000::NUMERIC, NULL::NUMERIC, 2100000::NUMERIC, NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC),
    ('PEAK', '라 스위트 드 LYRA (2층)', 11550000::NUMERIC, 5775000::NUMERIC, 3465000::NUMERIC, NULL::NUMERIC, NULL::NUMERIC, 19635000::NUMERIC),
    ('PEAK', '오너스 스위트', 22500000::NUMERIC, 11250000::NUMERIC, 6750000::NUMERIC, NULL::NUMERIC, NULL::NUMERIC, 38250000::NUMERIC),
    ('OCT', '오아시스 스위트 (1층)', 5520000::NUMERIC, 2750000::NUMERIC, 1656000::NUMERIC, 4150000::NUMERIC, NULL::NUMERIC, 9400000::NUMERIC),
    ('OCT', '하모니 스위트 (2층)', 5950000::NUMERIC, 2970000::NUMERIC, 1785000::NUMERIC, 4450000::NUMERIC, NULL::NUMERIC, 10100000::NUMERIC),
    ('OCT', '스카이 스위트 (3층)', 6550000::NUMERIC, 3250000::NUMERIC, 1965000::NUMERIC, 4900000::NUMERIC, NULL::NUMERIC, 11100000::NUMERIC),
    ('OCT', '스카이 테라스 스위트 (3층)', 9100000::NUMERIC, 4550000::NUMERIC, 2730000::NUMERIC, 6850000::NUMERIC, NULL::NUMERIC, 13650000::NUMERIC),
    ('OCT', '오아시스 패밀리 스위트 (1층/4인)', 4950000::NUMERIC, NULL::NUMERIC, 1485000::NUMERIC, NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC),
    ('OCT', '하모니 패밀리 스위트 (2층/4~5인)', 5350000::NUMERIC, NULL::NUMERIC, 1605000::NUMERIC, NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC),
    ('OCT', '스카이 패밀리 스위트 (3층/4인)', 5900000::NUMERIC, NULL::NUMERIC, 1770000::NUMERIC, NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC),
    ('OCT', '스카이 테라스 패밀리 스위트 (3층/4명)', 6450000::NUMERIC, NULL::NUMERIC, 1935000::NUMERIC, NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC),
    ('OCT', '듀플렉스 패밀리 스위트 (3-4층/4인)', 7100000::NUMERIC, NULL::NUMERIC, 2130000::NUMERIC, NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC),
    ('OCT', '라 스위트 드 LYRA (2층)', 11730000::NUMERIC, 5865000::NUMERIC, 3519000::NUMERIC, NULL::NUMERIC, NULL::NUMERIC, 19950000::NUMERIC),
    ('OCT', '오너스 스위트', 22850000::NUMERIC, 11450000::NUMERIC, 6855000::NUMERIC, NULL::NUMERIC, NULL::NUMERIC, 38850000::NUMERIC)
  ) AS r(season_key, room_type, price_adult, price_child, price_infant, price_extra_bed, price_child_extra_bed, price_single)
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
SELECT promo.id, '1N2D', rates.room_type, periods.checkin_from, periods.checkin_to,
       rates.price_adult, rates.price_child, rates.price_infant, rates.price_extra_bed, rates.price_child_extra_bed, rates.price_single
FROM promo
JOIN rates ON true
JOIN periods ON periods.season_key = rates.season_key
ON CONFLICT (promotion_id, schedule_type, room_type, checkin_from, checkin_to) DO UPDATE SET
  price_adult = EXCLUDED.price_adult,
  price_child = EXCLUDED.price_child,
  price_infant = EXCLUDED.price_infant,
  price_extra_bed = EXCLUDED.price_extra_bed,
  price_child_extra_bed = EXCLUDED.price_child_extra_bed,
  price_single = EXCLUDED.price_single,
  updated_at = now();

SELECT
  pr.checkin_from,
  pr.checkin_to,
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
WHERE p.code = 'LYRA-GRANZER-1N2D-VOUCHER-2026-30'
ORDER BY pr.checkin_from, pr.room_type;