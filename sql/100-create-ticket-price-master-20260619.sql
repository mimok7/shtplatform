-- Ticket price master table for products like Dragon Pearl Cave
-- Source basis: Naver cafe price sheet (official/card/krw) provided by user

BEGIN;

CREATE TABLE IF NOT EXISTS public.ticket_price (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_price_code text NOT NULL UNIQUE,
  ticket_type text NOT NULL,
  ticket_name text NOT NULL,
  price_item text NOT NULL,
  official_price_vnd numeric NOT NULL DEFAULT 0,
  stay_card_price_vnd numeric NOT NULL DEFAULT 0,
  stay_krw_price_krw numeric NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  valid_from date NOT NULL DEFAULT CURRENT_DATE,
  valid_to date NULL,
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ticket_price_item_chk CHECK (price_item IN ('adult', 'child_under_1_2m', 'shuttle'))
);

CREATE INDEX IF NOT EXISTS idx_ticket_price_active
  ON public.ticket_price (ticket_type, is_active, valid_from, valid_to);

CREATE OR REPLACE FUNCTION public.set_ticket_price_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ticket_price_updated_at ON public.ticket_price;
CREATE TRIGGER trg_ticket_price_updated_at
BEFORE UPDATE ON public.ticket_price
FOR EACH ROW
EXECUTE FUNCTION public.set_ticket_price_updated_at();

ALTER TABLE public.reservation_ticket
  ADD COLUMN IF NOT EXISTS ticket_price_code text NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'reservation_ticket_ticket_price_code_fkey'
      AND conrelid = 'public.reservation_ticket'::regclass
  ) THEN
    ALTER TABLE public.reservation_ticket
      ADD CONSTRAINT reservation_ticket_ticket_price_code_fkey
      FOREIGN KEY (ticket_price_code)
      REFERENCES public.ticket_price(ticket_price_code)
      ON UPDATE CASCADE
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_reservation_ticket_price_code
  ON public.reservation_ticket (ticket_price_code);

INSERT INTO public.ticket_price (
  ticket_price_code,
  ticket_type,
  ticket_name,
  price_item,
  official_price_vnd,
  stay_card_price_vnd,
  stay_krw_price_krw,
  sort_order,
  valid_from,
  notes
)
VALUES
  (
    'DPC_ADULT',
    'dragon',
    '드래곤펄 케이브',
    'adult',
    1450000,
    1350000,
    1300000,
    1,
    DATE '2026-06-19',
    '성인 1인당 요금'
  ),
  (
    'DPC_CHILD',
    'dragon',
    '드래곤펄 케이브',
    'child_under_1_2m',
    365000,
    350000,
    330000,
    2,
    DATE '2026-06-19',
    '아동 (신장 1.2m 미만)'
  ),
  (
    'DPC_SHUTTLE',
    'dragon',
    '드래곤펄 케이브 셔틀',
    'shuttle',
    330000,
    300000,
    250000,
    3,
    DATE '2026-06-19',
    '하롱국제크루즈 선착장-드래곤펄 케이브 셔틀 차량'
  )
ON CONFLICT (ticket_price_code) DO UPDATE
SET
  ticket_type = EXCLUDED.ticket_type,
  ticket_name = EXCLUDED.ticket_name,
  price_item = EXCLUDED.price_item,
  official_price_vnd = EXCLUDED.official_price_vnd,
  stay_card_price_vnd = EXCLUDED.stay_card_price_vnd,
  stay_krw_price_krw = EXCLUDED.stay_krw_price_krw,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  valid_from = EXCLUDED.valid_from,
  notes = EXCLUDED.notes,
  updated_at = now();

CREATE OR REPLACE VIEW public.ticket_price_active_v AS
SELECT
  tp.ticket_price_code,
  tp.ticket_type,
  tp.ticket_name,
  tp.price_item,
  tp.official_price_vnd,
  tp.stay_card_price_vnd,
  tp.stay_krw_price_krw,
  tp.valid_from,
  tp.valid_to,
  tp.sort_order
FROM public.ticket_price tp
WHERE tp.is_active = true
  AND tp.valid_from <= CURRENT_DATE
  AND (tp.valid_to IS NULL OR tp.valid_to >= CURRENT_DATE)
ORDER BY tp.ticket_type, tp.sort_order;

COMMIT;
