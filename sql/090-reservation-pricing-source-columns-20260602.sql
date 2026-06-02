-- 090-reservation-pricing-source-columns-20260602.sql
-- Goal:
--   Add explicit pricing source columns to reservation and backfill values.
--   Priority policy: manual_override > promotion > normal.
--
-- Notes:
--   - Idempotent script (safe to run multiple times).
--   - Includes lightweight backup table for rollback of affected columns.

BEGIN;

-- 0) Add columns first (required for safe backup SELECT on fresh schema)
ALTER TABLE public.reservation
  ADD COLUMN IF NOT EXISTS pricing_source text,
  ADD COLUMN IF NOT EXISTS pricing_source_reason text,
  ADD COLUMN IF NOT EXISTS pricing_rule_version text,
  ADD COLUMN IF NOT EXISTS pricing_resolved_at timestamp with time zone;

-- 1) Backup current values for safe rollback
CREATE TABLE IF NOT EXISTS public._backup_reservation_pricing_source_20260602 (
  re_id uuid PRIMARY KEY,
  pricing_source text,
  pricing_source_reason text,
  pricing_rule_version text,
  pricing_resolved_at timestamp with time zone,
  snapshotted_at timestamp with time zone NOT NULL DEFAULT now()
);

INSERT INTO public._backup_reservation_pricing_source_20260602 (
  re_id,
  pricing_source,
  pricing_source_reason,
  pricing_rule_version,
  pricing_resolved_at
)
SELECT
  r.re_id,
  r.pricing_source,
  r.pricing_source_reason,
  r.pricing_rule_version,
  r.pricing_resolved_at
FROM public.reservation r
WHERE NOT EXISTS (
  SELECT 1
  FROM public._backup_reservation_pricing_source_20260602 b
  WHERE b.re_id = r.re_id
);

-- 2) Backfill according to priority policy
--    manual_override > promotion > normal
UPDATE public.reservation r
SET
  pricing_source = CASE
    WHEN (
      COALESCE(r.manual_additional_fee, 0) <> 0
      OR (
        COALESCE(r.price_breakdown ->> 'additional_fee_manual', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
        AND (r.price_breakdown ->> 'additional_fee_manual')::numeric <> 0
      )
      OR (
        COALESCE(r.price_breakdown ->> 'discount_manual_amount', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
        AND (r.price_breakdown ->> 'discount_manual_amount')::numeric <> 0
      )
      OR EXISTS (
        SELECT 1
        FROM public.reservation_change_request c
        WHERE c.reservation_id = r.re_id
          AND c.status NOT IN ('rejected', 'cancelled')
      )
    ) THEN 'manual_override'
    WHEN (
      (
        r.price_breakdown ? 'promotion_code'
        AND NULLIF(TRIM(r.price_breakdown ->> 'promotion_code'), '') IS NOT NULL
      )
      OR (
        jsonb_typeof(r.price_breakdown -> 'applied_promotions') = 'array'
        AND jsonb_array_length(r.price_breakdown -> 'applied_promotions') > 0
      )
      OR EXISTS (
        SELECT 1
        FROM public.cruise_promotion_usage cpu
        WHERE cpu.reservation_id = r.re_id
          AND cpu.status IN ('reserved', 'confirmed')
      )
    ) THEN 'promotion'
    ELSE 'normal'
  END,
  pricing_source_reason = CASE
    WHEN (
      COALESCE(r.manual_additional_fee, 0) <> 0
      OR (
        COALESCE(r.price_breakdown ->> 'additional_fee_manual', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
        AND (r.price_breakdown ->> 'additional_fee_manual')::numeric <> 0
      )
      OR (
        COALESCE(r.price_breakdown ->> 'discount_manual_amount', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
        AND (r.price_breakdown ->> 'discount_manual_amount')::numeric <> 0
      )
    ) THEN 'manual_fee_or_discount'
    WHEN EXISTS (
      SELECT 1
      FROM public.reservation_change_request c
      WHERE c.reservation_id = r.re_id
        AND c.status NOT IN ('rejected', 'cancelled')
    ) THEN 'change_request_active'
    WHEN (
      r.price_breakdown ? 'promotion_code'
      AND NULLIF(TRIM(r.price_breakdown ->> 'promotion_code'), '') IS NOT NULL
    ) THEN 'promotion_code'
    WHEN (
      jsonb_typeof(r.price_breakdown -> 'applied_promotions') = 'array'
      AND jsonb_array_length(r.price_breakdown -> 'applied_promotions') > 0
    ) THEN 'applied_promotions'
    WHEN EXISTS (
      SELECT 1
      FROM public.cruise_promotion_usage cpu
      WHERE cpu.reservation_id = r.re_id
        AND cpu.status IN ('reserved', 'confirmed')
    ) THEN 'promotion_usage'
    ELSE 'default_normal'
  END,
  pricing_rule_version = COALESCE(r.pricing_rule_version, 'v1'),
  pricing_resolved_at = COALESCE(r.pricing_resolved_at, now())
;

-- 3) Defaults and constraints for new writes
ALTER TABLE public.reservation
  ALTER COLUMN pricing_source SET DEFAULT 'normal',
  ALTER COLUMN pricing_source_reason SET DEFAULT 'default_normal',
  ALTER COLUMN pricing_rule_version SET DEFAULT 'v1',
  ALTER COLUMN pricing_resolved_at SET DEFAULT now();

UPDATE public.reservation
SET pricing_source = 'normal'
WHERE pricing_source IS NULL OR pricing_source = '';

UPDATE public.reservation
SET pricing_source_reason = 'default_normal'
WHERE pricing_source_reason IS NULL OR pricing_source_reason = '';

UPDATE public.reservation
SET pricing_rule_version = 'v1'
WHERE pricing_rule_version IS NULL OR pricing_rule_version = '';

UPDATE public.reservation
SET pricing_resolved_at = now()
WHERE pricing_resolved_at IS NULL;

ALTER TABLE public.reservation
  ALTER COLUMN pricing_source SET NOT NULL,
  ALTER COLUMN pricing_source_reason SET NOT NULL,
  ALTER COLUMN pricing_rule_version SET NOT NULL,
  ALTER COLUMN pricing_resolved_at SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'reservation_pricing_source_chk'
      AND conrelid = 'public.reservation'::regclass
  ) THEN
    ALTER TABLE public.reservation
      ADD CONSTRAINT reservation_pricing_source_chk
      CHECK (pricing_source IN ('manual_override', 'promotion', 'normal'));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_reservation_pricing_source
  ON public.reservation (pricing_source);

-- 4) Future writes: enforce pricing source derivation at DB level
CREATE OR REPLACE FUNCTION public.set_reservation_pricing_source_cols()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  _has_manual boolean := false;
  _has_promo boolean := false;
BEGIN
  _has_manual := (
    COALESCE(NEW.manual_additional_fee, 0) <> 0
    OR (
      COALESCE(NEW.price_breakdown ->> 'additional_fee_manual', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
      AND (NEW.price_breakdown ->> 'additional_fee_manual')::numeric <> 0
    )
    OR (
      COALESCE(NEW.price_breakdown ->> 'discount_manual_amount', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
      AND (NEW.price_breakdown ->> 'discount_manual_amount')::numeric <> 0
    )
    OR EXISTS (
      SELECT 1
      FROM public.reservation_change_request c
      WHERE c.reservation_id = NEW.re_id
        AND c.status NOT IN ('rejected', 'cancelled')
    )
  );

  _has_promo := (
    (
      NEW.price_breakdown ? 'promotion_code'
      AND NULLIF(TRIM(NEW.price_breakdown ->> 'promotion_code'), '') IS NOT NULL
    )
    OR (
      jsonb_typeof(NEW.price_breakdown -> 'applied_promotions') = 'array'
      AND jsonb_array_length(NEW.price_breakdown -> 'applied_promotions') > 0
    )
    OR EXISTS (
      SELECT 1
      FROM public.cruise_promotion_usage cpu
      WHERE cpu.reservation_id = NEW.re_id
        AND cpu.status IN ('reserved', 'confirmed')
    )
  );

  IF _has_manual THEN
    NEW.pricing_source := 'manual_override';
    IF (
      COALESCE(NEW.manual_additional_fee, 0) <> 0
      OR (
        COALESCE(NEW.price_breakdown ->> 'additional_fee_manual', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
        AND (NEW.price_breakdown ->> 'additional_fee_manual')::numeric <> 0
      )
      OR (
        COALESCE(NEW.price_breakdown ->> 'discount_manual_amount', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
        AND (NEW.price_breakdown ->> 'discount_manual_amount')::numeric <> 0
      )
    ) THEN
      NEW.pricing_source_reason := 'manual_fee_or_discount';
    ELSE
      NEW.pricing_source_reason := 'change_request_active';
    END IF;
  ELSIF _has_promo THEN
    NEW.pricing_source := 'promotion';
    IF (
      NEW.price_breakdown ? 'promotion_code'
      AND NULLIF(TRIM(NEW.price_breakdown ->> 'promotion_code'), '') IS NOT NULL
    ) THEN
      NEW.pricing_source_reason := 'promotion_code';
    ELSIF (
      jsonb_typeof(NEW.price_breakdown -> 'applied_promotions') = 'array'
      AND jsonb_array_length(NEW.price_breakdown -> 'applied_promotions') > 0
    ) THEN
      NEW.pricing_source_reason := 'applied_promotions';
    ELSE
      NEW.pricing_source_reason := 'promotion_usage';
    END IF;
  ELSE
    NEW.pricing_source := 'normal';
    NEW.pricing_source_reason := 'default_normal';
  END IF;

  NEW.pricing_rule_version := COALESCE(NULLIF(NEW.pricing_rule_version, ''), 'v1');
  NEW.pricing_resolved_at := now();

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_set_reservation_pricing_source_cols ON public.reservation;

CREATE TRIGGER trg_set_reservation_pricing_source_cols
BEFORE INSERT OR UPDATE ON public.reservation
FOR EACH ROW
EXECUTE FUNCTION public.set_reservation_pricing_source_cols();

COMMIT;

-- Verification queries
-- SELECT pricing_source, COUNT(*) FROM public.reservation GROUP BY pricing_source ORDER BY pricing_source;
-- SELECT pricing_source_reason, COUNT(*) FROM public.reservation GROUP BY pricing_source_reason ORDER BY pricing_source_reason;
-- SELECT COUNT(*) AS null_source FROM public.reservation WHERE pricing_source IS NULL;

-- Rollback (if needed)
-- BEGIN;
-- UPDATE public.reservation r
-- SET
--   pricing_source = b.pricing_source,
--   pricing_source_reason = b.pricing_source_reason,
--   pricing_rule_version = b.pricing_rule_version,
--   pricing_resolved_at = b.pricing_resolved_at
-- FROM public._backup_reservation_pricing_source_20260602 b
-- WHERE b.re_id = r.re_id;
-- COMMIT;
