-- reservation_ticket split count pricing migration
-- 2026-06-19
-- 목적:
-- 1) 성인/아동/셔틀 인원 컬럼 추가
-- 2) 자동 가격 트리거를 분리 인원 기반으로 재계산

BEGIN;

ALTER TABLE public.reservation_ticket
  ADD COLUMN IF NOT EXISTS adult_count integer;

ALTER TABLE public.reservation_ticket
  ADD COLUMN IF NOT EXISTS child_count integer;

ALTER TABLE public.reservation_ticket
  ADD COLUMN IF NOT EXISTS shuttle_count integer;

UPDATE public.reservation_ticket
SET
  adult_count = COALESCE(
    adult_count,
    CASE
      WHEN ticket_price_item = 'child_under_1_2m' THEN 0
      WHEN ticket_price_item = 'shuttle' THEN 0
      ELSE GREATEST(COALESCE(ticket_quantity, 1), 0)
    END
  ),
  child_count = COALESCE(
    child_count,
    CASE
      WHEN ticket_price_item = 'child_under_1_2m' THEN GREATEST(COALESCE(ticket_quantity, 1), 0)
      ELSE 0
    END
  ),
  shuttle_count = COALESCE(
    shuttle_count,
    CASE
      WHEN COALESCE(shuttle_required, false) = true THEN GREATEST(COALESCE(ticket_quantity, 1), 0)
      ELSE 0
    END
  );

ALTER TABLE public.reservation_ticket
  ALTER COLUMN adult_count SET DEFAULT 1;

ALTER TABLE public.reservation_ticket
  ALTER COLUMN child_count SET DEFAULT 0;

ALTER TABLE public.reservation_ticket
  ALTER COLUMN shuttle_count SET DEFAULT 0;

ALTER TABLE public.reservation_ticket
  ALTER COLUMN adult_count SET NOT NULL;

ALTER TABLE public.reservation_ticket
  ALTER COLUMN child_count SET NOT NULL;

ALTER TABLE public.reservation_ticket
  ALTER COLUMN shuttle_count SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'reservation_ticket_adult_count_nonneg_chk'
      AND conrelid = 'public.reservation_ticket'::regclass
  ) THEN
    ALTER TABLE public.reservation_ticket
      ADD CONSTRAINT reservation_ticket_adult_count_nonneg_chk
      CHECK (adult_count >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'reservation_ticket_child_count_nonneg_chk'
      AND conrelid = 'public.reservation_ticket'::regclass
  ) THEN
    ALTER TABLE public.reservation_ticket
      ADD CONSTRAINT reservation_ticket_child_count_nonneg_chk
      CHECK (child_count >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'reservation_ticket_shuttle_count_nonneg_chk'
      AND conrelid = 'public.reservation_ticket'::regclass
  ) THEN
    ALTER TABLE public.reservation_ticket
      ADD CONSTRAINT reservation_ticket_shuttle_count_nonneg_chk
      CHECK (shuttle_count >= 0);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.apply_reservation_ticket_auto_pricing()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_channel text;
  v_effective_date date;
  v_adult_count integer;
  v_child_count integer;
  v_shuttle_count integer;
  v_ticket_quantity integer;

  v_adult_code text;
  v_adult_name text;
  v_adult_official numeric;
  v_adult_card numeric;
  v_adult_krw numeric;

  v_child_code text;
  v_child_name text;
  v_child_official numeric;
  v_child_card numeric;
  v_child_krw numeric;

  v_shuttle_code text;
  v_shuttle_name text;
  v_shuttle_official numeric;
  v_shuttle_card numeric;
  v_shuttle_krw numeric;

  v_adult_unit numeric;
  v_child_unit numeric;
  v_shuttle_unit numeric;
  v_total numeric;
BEGIN
  v_channel := lower(COALESCE(NULLIF(NEW.price_channel, ''), 'card'));
  NEW.price_channel := v_channel;
  v_effective_date := COALESCE(NEW.usage_date, CURRENT_DATE);

  v_adult_count := GREATEST(COALESCE(NEW.adult_count, 0), 0);
  v_child_count := GREATEST(COALESCE(NEW.child_count, 0), 0);

  IF v_adult_count = 0 AND v_child_count = 0 THEN
    IF COALESCE(NEW.ticket_price_item, 'adult') = 'child_under_1_2m' THEN
      v_child_count := GREATEST(COALESCE(NEW.ticket_quantity, 1), 0);
    ELSE
      v_adult_count := GREATEST(COALESCE(NEW.ticket_quantity, 1), 0);
    END IF;
  END IF;

  v_ticket_quantity := v_adult_count + v_child_count;

  IF COALESCE(NEW.shuttle_required, false) THEN
    v_shuttle_count := GREATEST(COALESCE(NEW.shuttle_count, v_ticket_quantity), 0);
  ELSE
    v_shuttle_count := 0;
  END IF;

  SELECT tp.ticket_price_code, tp.ticket_name, tp.official_price_vnd, tp.stay_card_price_vnd, tp.stay_krw_price_krw
  INTO v_adult_code, v_adult_name, v_adult_official, v_adult_card, v_adult_krw
  FROM public.ticket_price tp
  WHERE tp.is_active = true
    AND tp.ticket_type = NEW.ticket_type
    AND tp.price_item = 'adult'
    AND tp.valid_from <= v_effective_date
    AND (tp.valid_to IS NULL OR tp.valid_to >= v_effective_date)
  ORDER BY tp.valid_from DESC, tp.sort_order ASC
  LIMIT 1;

  SELECT tp.ticket_price_code, tp.ticket_name, tp.official_price_vnd, tp.stay_card_price_vnd, tp.stay_krw_price_krw
  INTO v_child_code, v_child_name, v_child_official, v_child_card, v_child_krw
  FROM public.ticket_price tp
  WHERE tp.is_active = true
    AND tp.ticket_type = NEW.ticket_type
    AND tp.price_item = 'child_under_1_2m'
    AND tp.valid_from <= v_effective_date
    AND (tp.valid_to IS NULL OR tp.valid_to >= v_effective_date)
  ORDER BY tp.valid_from DESC, tp.sort_order ASC
  LIMIT 1;

  SELECT tp.ticket_price_code, tp.ticket_name, tp.official_price_vnd, tp.stay_card_price_vnd, tp.stay_krw_price_krw
  INTO v_shuttle_code, v_shuttle_name, v_shuttle_official, v_shuttle_card, v_shuttle_krw
  FROM public.ticket_price tp
  WHERE tp.is_active = true
    AND tp.ticket_type = NEW.ticket_type
    AND tp.price_item = 'shuttle'
    AND tp.valid_from <= v_effective_date
    AND (tp.valid_to IS NULL OR tp.valid_to >= v_effective_date)
  ORDER BY tp.valid_from DESC, tp.sort_order ASC
  LIMIT 1;

  v_adult_unit := CASE v_channel
    WHEN 'official' THEN COALESCE(v_adult_official, 0)
    WHEN 'krw' THEN COALESCE(v_adult_krw, 0)
    ELSE COALESCE(v_adult_card, 0)
  END;

  v_child_unit := CASE v_channel
    WHEN 'official' THEN COALESCE(v_child_official, 0)
    WHEN 'krw' THEN COALESCE(v_child_krw, 0)
    ELSE COALESCE(v_child_card, 0)
  END;

  v_shuttle_unit := CASE v_channel
    WHEN 'official' THEN COALESCE(v_shuttle_official, 0)
    WHEN 'krw' THEN COALESCE(v_shuttle_krw, 0)
    ELSE COALESCE(v_shuttle_card, 0)
  END;

  v_total := (v_adult_unit * v_adult_count)
    + (v_child_unit * v_child_count)
    + (CASE WHEN COALESCE(NEW.shuttle_required, false) THEN v_shuttle_unit * v_shuttle_count ELSE 0 END);

  NEW.adult_count := v_adult_count;
  NEW.child_count := v_child_count;
  NEW.shuttle_count := v_shuttle_count;
  NEW.ticket_quantity := v_ticket_quantity;
  NEW.total_price := v_total;
  NEW.unit_price := CASE WHEN v_ticket_quantity > 0 THEN v_total / v_ticket_quantity ELSE 0 END;

  IF v_adult_count > 0 THEN
    NEW.ticket_price_item := 'adult';
    NEW.ticket_price_code := v_adult_code;
    IF NEW.ticket_name IS NULL OR NEW.ticket_name = '' THEN NEW.ticket_name := v_adult_name; END IF;
  ELSIF v_child_count > 0 THEN
    NEW.ticket_price_item := 'child_under_1_2m';
    NEW.ticket_price_code := v_child_code;
    IF NEW.ticket_name IS NULL OR NEW.ticket_name = '' THEN NEW.ticket_name := v_child_name; END IF;
  ELSIF v_shuttle_count > 0 THEN
    NEW.ticket_price_item := 'shuttle';
    NEW.ticket_price_code := v_shuttle_code;
    IF NEW.ticket_name IS NULL OR NEW.ticket_name = '' THEN NEW.ticket_name := v_shuttle_name; END IF;
  ELSE
    NEW.ticket_price_item := 'adult';
    NEW.ticket_price_code := COALESCE(v_adult_code, NEW.ticket_price_code);
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
  adult_count,
  child_count,
  shuttle_count,
  shuttle_required,
  ticket_name,
  program_selection,
  ticket_details
ON public.reservation_ticket
FOR EACH ROW
EXECUTE FUNCTION public.apply_reservation_ticket_auto_pricing();

UPDATE public.reservation_ticket
SET
  adult_count = adult_count,
  child_count = child_count,
  shuttle_count = shuttle_count,
  updated_at = now();

COMMIT;
