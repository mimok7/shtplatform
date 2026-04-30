BEGIN;

ALTER TABLE public.reservation
ADD COLUMN IF NOT EXISTS manual_additional_fee numeric NOT NULL DEFAULT 0;

ALTER TABLE public.reservation
ADD COLUMN IF NOT EXISTS manual_additional_fee_detail text;

COMMENT ON COLUMN public.reservation.manual_additional_fee IS 'Manager-entered extra amount added on top of the calculated reservation total.';

COMMENT ON COLUMN public.reservation.manual_additional_fee_detail IS 'Manager-entered memo describing why the additional fee was applied.';

UPDATE public.reservation
SET manual_additional_fee = COALESCE((price_breakdown ->> 'additional_fee')::numeric, 0)
WHERE price_breakdown ? 'additional_fee'
  AND COALESCE(manual_additional_fee, 0) = 0;

UPDATE public.reservation
SET manual_additional_fee_detail = COALESCE(price_breakdown ->> 'additional_fee_detail', price_breakdown ->> 'additional_fee_note')
WHERE manual_additional_fee_detail IS NULL
  AND (
    price_breakdown ? 'additional_fee_detail'
    OR price_breakdown ? 'additional_fee_note'
  );

COMMIT;