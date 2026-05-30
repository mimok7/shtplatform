-- Grand Pioneers voucher promotion layer
-- Existing cruise_rate_card rows are not updated or deleted by this migration.

CREATE TABLE IF NOT EXISTS public.cruise_promotion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  cruise_name TEXT NOT NULL,
  booking_from DATE NOT NULL,
  booking_to DATE,
  checkin_from DATE NOT NULL,
  checkin_to DATE NOT NULL,
  quota_total INTEGER NOT NULL CHECK (quota_total > 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cruise_promotion_rate (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id UUID NOT NULL REFERENCES public.cruise_promotion(id) ON DELETE CASCADE,
  schedule_type TEXT NOT NULL,
  room_type TEXT NOT NULL,
  checkin_from DATE NOT NULL,
  checkin_to DATE NOT NULL,
  price_adult NUMERIC(15, 0) NOT NULL,
  price_child NUMERIC(15, 0),
  price_infant NUMERIC(15, 0),
  price_extra_bed NUMERIC(15, 0),
  price_child_extra_bed NUMERIC(15, 0),
  price_single NUMERIC(15, 0),
  currency TEXT NOT NULL DEFAULT 'VND',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT cruise_promotion_rate_unique UNIQUE (promotion_id, schedule_type, room_type, checkin_from, checkin_to)
);

CREATE TABLE IF NOT EXISTS public.cruise_promotion_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id UUID NOT NULL REFERENCES public.cruise_promotion(id) ON DELETE CASCADE,
  quote_id UUID,
  reservation_id UUID,
  reservation_cruise_id UUID,
  user_id UUID,
  status TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'confirmed', 'cancelled', 'expired')),
  used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

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

CREATE INDEX IF NOT EXISTS idx_cruise_promotion_active_window
  ON public.cruise_promotion(cruise_name, is_active, booking_from, checkin_from, checkin_to);

CREATE INDEX IF NOT EXISTS idx_cruise_promotion_rate_lookup
  ON public.cruise_promotion_rate(promotion_id, schedule_type, room_type, checkin_from, checkin_to);

CREATE INDEX IF NOT EXISTS idx_cruise_promotion_usage_count
  ON public.cruise_promotion_usage(promotion_id, status, used_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cruise_promotion_usage_quote_active
  ON public.cruise_promotion_usage(promotion_id, quote_id)
  WHERE quote_id IS NOT NULL AND status IN ('reserved', 'confirmed');

CREATE UNIQUE INDEX IF NOT EXISTS idx_cruise_promotion_usage_reservation_active
  ON public.cruise_promotion_usage(promotion_id, reservation_id)
  WHERE reservation_id IS NOT NULL AND status IN ('reserved', 'confirmed');

ALTER TABLE public.cruise_promotion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cruise_promotion_rate ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cruise_promotion_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cruise_promotion_manager_admin_all ON public.cruise_promotion;
CREATE POLICY cruise_promotion_manager_admin_all
  ON public.cruise_promotion FOR ALL
  TO authenticated
  USING ((SELECT auth.uid() IN (SELECT u.id FROM public.users u WHERE u.role IN ('manager', 'admin'))))
  WITH CHECK ((SELECT auth.uid() IN (SELECT u.id FROM public.users u WHERE u.role IN ('manager', 'admin'))));

DROP POLICY IF EXISTS cruise_promotion_rate_manager_admin_all ON public.cruise_promotion_rate;
CREATE POLICY cruise_promotion_rate_manager_admin_all
  ON public.cruise_promotion_rate FOR ALL
  TO authenticated
  USING ((SELECT auth.uid() IN (SELECT u.id FROM public.users u WHERE u.role IN ('manager', 'admin'))))
  WITH CHECK ((SELECT auth.uid() IN (SELECT u.id FROM public.users u WHERE u.role IN ('manager', 'admin'))));

DROP POLICY IF EXISTS cruise_promotion_usage_manager_admin_all ON public.cruise_promotion_usage;
CREATE POLICY cruise_promotion_usage_manager_admin_all
  ON public.cruise_promotion_usage FOR ALL
  TO authenticated
  USING ((SELECT auth.uid() IN (SELECT u.id FROM public.users u WHERE u.role IN ('manager', 'admin'))))
  WITH CHECK ((SELECT auth.uid() IN (SELECT u.id FROM public.users u WHERE u.role IN ('manager', 'admin'))));

DROP POLICY IF EXISTS cruise_promotion_usage_user_read_own ON public.cruise_promotion_usage;
CREATE POLICY cruise_promotion_usage_user_read_own
  ON public.cruise_promotion_usage FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

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

CREATE OR REPLACE FUNCTION public.claim_cruise_promotion_usage(
  p_promotion_code TEXT,
  p_quote_id UUID DEFAULT NULL,
  p_reservation_id UUID DEFAULT NULL,
  p_reservation_cruise_id UUID DEFAULT NULL,
  p_user_id UUID DEFAULT auth.uid(),
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  claimed BOOLEAN,
  promotion_id UUID,
  quota_total INTEGER,
  used_count INTEGER,
  remaining_count INTEGER,
  reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_promotion public.cruise_promotion%ROWTYPE;
  v_existing public.cruise_promotion_usage%ROWTYPE;
  v_used_count INTEGER;
BEGIN
  SELECT * INTO v_promotion
  FROM public.cruise_promotion
  WHERE code = p_promotion_code AND is_active = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::UUID, 0, 0, 0, 'promotion_not_found';
    RETURN;
  END IF;

  IF p_quote_id IS NOT NULL THEN
    SELECT * INTO v_existing
    FROM public.cruise_promotion_usage
    WHERE promotion_id = v_promotion.id
      AND quote_id = p_quote_id
      AND status IN ('reserved', 'confirmed')
    LIMIT 1;

    IF FOUND THEN
      IF p_reservation_id IS NOT NULL AND v_existing.reservation_id IS NULL THEN
        UPDATE public.cruise_promotion_usage
        SET reservation_id = p_reservation_id,
            reservation_cruise_id = COALESCE(p_reservation_cruise_id, reservation_cruise_id),
            status = 'confirmed',
            metadata = COALESCE(metadata, '{}'::jsonb) || COALESCE(p_metadata, '{}'::jsonb),
            updated_at = now()
        WHERE id = v_existing.id;
      END IF;

      SELECT COUNT(*)::INTEGER INTO v_used_count
      FROM public.cruise_promotion_usage
      WHERE promotion_id = v_promotion.id AND status IN ('reserved', 'confirmed');

      RETURN QUERY SELECT true, v_promotion.id, v_promotion.quota_total, v_used_count,
        GREATEST(v_promotion.quota_total - v_used_count, 0),
        CASE WHEN p_reservation_id IS NOT NULL THEN 'confirmed_existing_claim' ELSE 'already_claimed' END;
      RETURN;
    END IF;
  END IF;

  IF p_reservation_id IS NOT NULL THEN
    SELECT * INTO v_existing
    FROM public.cruise_promotion_usage
    WHERE promotion_id = v_promotion.id
      AND reservation_id = p_reservation_id
      AND status IN ('reserved', 'confirmed')
    LIMIT 1;

    IF FOUND THEN
      SELECT COUNT(*)::INTEGER INTO v_used_count
      FROM public.cruise_promotion_usage
      WHERE promotion_id = v_promotion.id AND status IN ('reserved', 'confirmed');

      RETURN QUERY SELECT true, v_promotion.id, v_promotion.quota_total, v_used_count,
        GREATEST(v_promotion.quota_total - v_used_count, 0), 'already_claimed';
      RETURN;
    END IF;
  END IF;

  SELECT COUNT(*)::INTEGER INTO v_used_count
  FROM public.cruise_promotion_usage
  WHERE promotion_id = v_promotion.id AND status IN ('reserved', 'confirmed');

  IF v_used_count >= v_promotion.quota_total THEN
    RETURN QUERY SELECT false, v_promotion.id, v_promotion.quota_total, v_used_count, 0, 'quota_exhausted';
    RETURN;
  END IF;

  INSERT INTO public.cruise_promotion_usage (
    promotion_id,
    quote_id,
    reservation_id,
    reservation_cruise_id,
    user_id,
    status,
    metadata
  ) VALUES (
    v_promotion.id,
    p_quote_id,
    p_reservation_id,
    p_reservation_cruise_id,
    p_user_id,
    CASE WHEN p_reservation_id IS NOT NULL THEN 'confirmed' ELSE 'reserved' END,
    COALESCE(p_metadata, '{}'::jsonb)
  );

  v_used_count := v_used_count + 1;

  RETURN QUERY SELECT true, v_promotion.id, v_promotion.quota_total, v_used_count,
    GREATEST(v_promotion.quota_total - v_used_count, 0), 'claimed';
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_applicable_cruise_rate_cards(TEXT, DATE, TEXT, TEXT, DATE) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_cruise_promotion_usage(TEXT, UUID, UUID, UUID, UUID, JSONB) TO authenticated;

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
  '그랜드 파이어니스 크루즈',
  '2026-05-23',
  NULL,
  '2026-06-01',
  '2026-12-31',
  100,
  true,
  '선착순 100팀 한정. 기존 cruise_rate_card 데이터는 변경하지 않고 프로모션 레이어로 적용.'
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
  SELECT id FROM public.cruise_promotion WHERE code = 'GP-VOUCHER-2026-100TEAMS'
), rates AS (
  SELECT * FROM (VALUES
    ('1N2D', 'Ocean Balcony Suite', '2026-06-01'::DATE, '2026-12-31'::DATE, 5025000::NUMERIC, 3000000::NUMERIC, NULL::NUMERIC, 4500000::NUMERIC, 4025000::NUMERIC, NULL::NUMERIC),
    ('1N2D', 'Veranda Suite',       '2026-06-01'::DATE, '2026-12-31'::DATE, 6000000::NUMERIC, 3000000::NUMERIC, NULL::NUMERIC, 5400000::NUMERIC, 4025000::NUMERIC, NULL::NUMERIC),
    ('2N3D', 'Ocean Balcony Suite', '2026-06-01'::DATE, '2026-12-31'::DATE, 9600000::NUMERIC, 5700000::NUMERIC, NULL::NUMERIC, 8650000::NUMERIC, 7700000::NUMERIC, NULL::NUMERIC),
    ('2N3D', 'Veranda Suite',       '2026-06-01'::DATE, '2026-12-31'::DATE, 11500000::NUMERIC, 5700000::NUMERIC, NULL::NUMERIC, 10350000::NUMERIC, 7700000::NUMERIC, NULL::NUMERIC)
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
SELECT promo.id, rates.schedule_type, rates.room_type, rates.checkin_from, rates.checkin_to, rates.price_adult, rates.price_child, rates.price_infant, rates.price_extra_bed, rates.price_child_extra_bed, rates.price_single
FROM promo CROSS JOIN rates
ON CONFLICT (promotion_id, schedule_type, room_type, checkin_from, checkin_to) DO UPDATE SET
  price_adult = EXCLUDED.price_adult,
  price_child = EXCLUDED.price_child,
  price_infant = EXCLUDED.price_infant,
  price_extra_bed = EXCLUDED.price_extra_bed,
  price_child_extra_bed = EXCLUDED.price_child_extra_bed,
  price_single = EXCLUDED.price_single,
  updated_at = now();

SELECT
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
        OR (rc.valid_from <= p.checkin_to AND rc.valid_to >= p.checkin_from)
      )
  ) AS has_base_rate_card
FROM public.cruise_promotion p
JOIN public.cruise_promotion_rate pr ON pr.promotion_id = p.id
WHERE p.code = 'GP-VOUCHER-2026-100TEAMS'
ORDER BY pr.schedule_type, pr.room_type;