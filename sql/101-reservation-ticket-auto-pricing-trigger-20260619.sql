-- Auto pricing trigger for reservation_ticket
-- - Auto-assign ticket_price_code from ticket_type + ticket_price_item
-- - Auto-calculate unit_price/total_price by price_channel

BEGIN;

ALTER TABLE public.reservation_ticket
  ADD COLUMN IF NOT EXISTS ticket_price_item text;

ALTER TABLE public.reservation_ticket
  ADD COLUMN IF NOT EXISTS price_channel text;

ALTER TABLE public.reservation_ticket
  ALTER COLUMN ticket_price_item SET DEFAULT 'adult';

ALTER TABLE public.reservation_ticket
  ALTER COLUMN price_channel SET DEFAULT 'card';

UPDATE public.reservation_ticket
SET
  ticket_price_item = COALESCE(
    NULLIF(ticket_price_item, ''),
    CASE
      WHEN shuttle_required = true THEN 'shuttle'
      WHEN COALESCE(ticket_name, '') ILIKE '%아동%'
        OR COALESCE(program_selection, '') ILIKE '%아동%'
        OR COALESCE(ticket_details, '') ILIKE '%아동%'
        OR COALESCE(ticket_details, '') ILIKE '%1.2m%'
      THEN 'child_under_1_2m'
      ELSE 'adult'
    END
  ),
  price_channel = COALESCE(NULLIF(lower(price_channel), ''), 'card')
WHERE ticket_price_item IS NULL
   OR price_channel IS NULL
   OR ticket_price_item = ''
   OR price_channel = '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'reservation_ticket_price_item_chk'
      AND conrelid = 'public.reservation_ticket'::regclass
  ) THEN
    ALTER TABLE public.reservation_ticket
      ADD CONSTRAINT reservation_ticket_price_item_chk
      CHECK (ticket_price_item IN ('adult', 'child_under_1_2m', 'shuttle'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'reservation_ticket_price_channel_chk'
      AND conrelid = 'public.reservation_ticket'::regclass
  ) THEN
    ALTER TABLE public.reservation_ticket
      ADD CONSTRAINT reservation_ticket_price_channel_chk
      CHECK (price_channel IN ('official', 'card', 'krw'));
  END IF;
END $$;

ALTER TABLE public.reservation_ticket
  ALTER COLUMN ticket_price_item SET NOT NULL;

ALTER TABLE public.reservation_ticket
  ALTER COLUMN price_channel SET NOT NULL;

CREATE OR REPLACE FUNCTION public.normalize_reservation_ticket_price_item(
  p_ticket_price_item text,
  p_shuttle_required boolean,
  p_ticket_name text,
  p_program_selection text,
  p_ticket_details text
)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_item text;
BEGIN
  v_item := lower(COALESCE(NULLIF(p_ticket_price_item, ''), ''));

  IF v_item IN ('adult', 'child_under_1_2m', 'shuttle') THEN
    RETURN v_item;
  END IF;

  IF COALESCE(p_shuttle_required, false) = true THEN
    RETURN 'shuttle';
  END IF;

  IF COALESCE(p_ticket_name, '') ILIKE '%아동%'
     OR COALESCE(p_program_selection, '') ILIKE '%아동%'
     OR COALESCE(p_ticket_details, '') ILIKE '%아동%'
     OR COALESCE(p_ticket_details, '') ILIKE '%1.2m%'
  THEN
    RETURN 'child_under_1_2m';
  END IF;

  RETURN 'adult';
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_reservation_ticket_auto_pricing()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_item text;
  v_channel text;
  v_effective_date date;
  v_price_code text;
  v_ticket_name text;
  v_official numeric;
  v_card numeric;
  v_krw numeric;
  v_unit numeric;
BEGIN
  v_item := public.normalize_reservation_ticket_price_item(
    NEW.ticket_price_item,
    NEW.shuttle_required,
    NEW.ticket_name,
    NEW.program_selection,
    NEW.ticket_details
  );

  NEW.ticket_price_item := v_item;
  v_channel := lower(COALESCE(NULLIF(NEW.price_channel, ''), 'card'));
  NEW.price_channel := v_channel;
  v_effective_date := COALESCE(NEW.usage_date, CURRENT_DATE);

  IF NEW.ticket_price_code IS NULL OR NEW.ticket_price_code = '' THEN
    SELECT tp.ticket_price_code
    INTO v_price_code
    FROM public.ticket_price tp
    WHERE tp.is_active = true
      AND tp.ticket_type = NEW.ticket_type
      AND tp.price_item = v_item
      AND tp.valid_from <= v_effective_date
      AND (tp.valid_to IS NULL OR tp.valid_to >= v_effective_date)
    ORDER BY tp.valid_from DESC, tp.sort_order ASC
    LIMIT 1;

    NEW.ticket_price_code := v_price_code;
  END IF;

  IF NEW.ticket_price_code IS NOT NULL AND NEW.ticket_price_code <> '' THEN
    SELECT
      tp.ticket_name,
      tp.official_price_vnd,
      tp.stay_card_price_vnd,
      tp.stay_krw_price_krw
    INTO
      v_ticket_name,
      v_official,
      v_card,
      v_krw
    FROM public.ticket_price tp
    WHERE tp.ticket_price_code = NEW.ticket_price_code;

    IF FOUND THEN
      v_unit := CASE v_channel
        WHEN 'official' THEN COALESCE(v_official, 0)
        WHEN 'krw' THEN COALESCE(v_krw, 0)
        ELSE COALESCE(v_card, 0)
      END;

      NEW.unit_price := v_unit;
      NEW.total_price := v_unit * COALESCE(NEW.ticket_quantity, 1);

      IF NEW.ticket_name IS NULL OR NEW.ticket_name = '' THEN
        NEW.ticket_name := v_ticket_name;
      END IF;
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reservation_ticket_auto_pricing ON public.reservation_ticket;
CREATE TRIGGER trg_reservation_ticket_auto_pricing
BEFORE INSERT OR UPDATE OF
  ticket_type,
  ticket_price_item,
  ticket_price_code,
  price_channel,
  usage_date,
  ticket_quantity,
  shuttle_required,
  ticket_name,
  program_selection,
  ticket_details
ON public.reservation_ticket
FOR EACH ROW
EXECUTE FUNCTION public.apply_reservation_ticket_auto_pricing();

WITH matched AS (
  SELECT
    rt.id,
    COALESCE(
      NULLIF(rt.ticket_price_code, ''),
      (
        SELECT tp.ticket_price_code
        FROM public.ticket_price tp
        WHERE tp.ticket_type = rt.ticket_type
          AND tp.price_item = public.normalize_reservation_ticket_price_item(
            rt.ticket_price_item,
            rt.shuttle_required,
            rt.ticket_name,
            rt.program_selection,
            rt.ticket_details
          )
          AND tp.is_active = true
          AND tp.valid_from <= COALESCE(rt.usage_date, CURRENT_DATE)
          AND (tp.valid_to IS NULL OR tp.valid_to >= COALESCE(rt.usage_date, CURRENT_DATE))
        ORDER BY tp.valid_from DESC, tp.sort_order ASC
        LIMIT 1
      )
    ) AS resolved_code,
    public.normalize_reservation_ticket_price_item(
      rt.ticket_price_item,
      rt.shuttle_required,
      rt.ticket_name,
      rt.program_selection,
      rt.ticket_details
    ) AS resolved_item,
    COALESCE(NULLIF(lower(rt.price_channel), ''), 'card') AS resolved_channel,
    COALESCE(rt.ticket_quantity, 1) AS qty
  FROM public.reservation_ticket rt
), repriced AS (
  SELECT
    m.id,
    m.resolved_code,
    m.resolved_item,
    m.resolved_channel,
    CASE m.resolved_channel
      WHEN 'official' THEN COALESCE(tp.official_price_vnd, 0)
      WHEN 'krw' THEN COALESCE(tp.stay_krw_price_krw, 0)
      ELSE COALESCE(tp.stay_card_price_vnd, 0)
    END AS next_unit,
    CASE m.resolved_channel
      WHEN 'official' THEN COALESCE(tp.official_price_vnd, 0) * m.qty
      WHEN 'krw' THEN COALESCE(tp.stay_krw_price_krw, 0) * m.qty
      ELSE COALESCE(tp.stay_card_price_vnd, 0) * m.qty
    END AS next_total
  FROM matched m
  LEFT JOIN public.ticket_price tp
    ON tp.ticket_price_code = m.resolved_code
)
UPDATE public.reservation_ticket rt
SET
  ticket_price_item = r.resolved_item,
  price_channel = r.resolved_channel,
  ticket_price_code = r.resolved_code,
  unit_price = COALESCE(r.next_unit, rt.unit_price),
  total_price = COALESCE(r.next_total, rt.total_price),
  updated_at = now()
FROM repriced r
WHERE rt.id = r.id
  AND (
    rt.ticket_price_item IS DISTINCT FROM r.resolved_item
    OR rt.price_channel IS DISTINCT FROM r.resolved_channel
    OR rt.ticket_price_code IS DISTINCT FROM r.resolved_code
    OR (r.next_unit IS NOT NULL AND rt.unit_price IS DISTINCT FROM r.next_unit)
    OR (r.next_total IS NOT NULL AND rt.total_price IS DISTINCT FROM r.next_total)
  );

COMMIT;
