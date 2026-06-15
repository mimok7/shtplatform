BEGIN;

-- Legacy Victorious rate-card UUIDs were restored so historical reservations
-- can keep resolving their original room_price_code values.
-- They must stay out of current/new price searches, so keep them inactive.
UPDATE public.cruise_rate_card
SET
  is_active = false,
  notes = CONCAT(
    COALESCE(notes, ''),
    CASE
      WHEN COALESCE(notes, '') ILIKE '%[legacy-reservation-only]%' THEN ''
      ELSE ' [legacy-reservation-only]'
    END
  ),
  updated_at = now()
WHERE id IN (
  '9792f760-db35-4801-ae47-5564127001cc',
  '7010fee7-8a09-4503-b5d5-7fc320357279',
  '95d378be-c6e5-44aa-a8a4-1ff577bcb975',
  '91eb5fd7-9e50-45ce-9e87-07ba5370c03b'
);

COMMIT;
