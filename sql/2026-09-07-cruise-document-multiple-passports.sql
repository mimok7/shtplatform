-- Allow one reservation owner to upload a passport image for every traveller.
-- Existing rows remain valid; passport documents continue to be deleted by the
-- existing checkout-date cleanup job.

BEGIN;

DROP INDEX IF EXISTS public.idx_cruise_document_passport_user;

ALTER TABLE public.cruise_document
  ADD COLUMN IF NOT EXISTS traveler_name text;

-- Passport scans are sensitive personal data. A customer must only be able to
-- access their own documents; managers and admins retain their existing work
-- flow for issuing boarding-code images.
DROP POLICY IF EXISTS cruise_document_select ON public.cruise_document;
DROP POLICY IF EXISTS cruise_document_insert ON public.cruise_document;
DROP POLICY IF EXISTS cruise_document_update ON public.cruise_document;
DROP POLICY IF EXISTS cruise_document_delete ON public.cruise_document;

CREATE POLICY cruise_document_select ON public.cruise_document
  FOR SELECT TO authenticated
  USING (
    user_id = (select auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = (select auth.uid())
        AND u.role IN ('manager', 'admin')
    )
  );

CREATE POLICY cruise_document_insert ON public.cruise_document
  FOR INSERT TO authenticated
  WITH CHECK (
    (document_type <> 'passport' OR reservation_id IS NOT NULL)
    AND (
      user_id = (select auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = (select auth.uid())
          AND u.role IN ('manager', 'admin')
      )
    )
  );

CREATE POLICY cruise_document_update ON public.cruise_document
  FOR UPDATE TO authenticated
  USING (
    user_id = (select auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = (select auth.uid())
        AND u.role IN ('manager', 'admin')
    )
  )
  WITH CHECK (
    user_id = (select auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = (select auth.uid())
        AND u.role IN ('manager', 'admin')
    )
  );

CREATE POLICY cruise_document_delete ON public.cruise_document
  FOR DELETE TO authenticated
  USING (
    user_id = (select auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = (select auth.uid())
        AND u.role IN ('manager', 'admin')
    )
  );

COMMIT;

-- Verification query:
-- SELECT indexname FROM pg_indexes
-- WHERE schemaname = 'public' AND tablename = 'cruise_document'
--   AND indexname = 'idx_cruise_document_passport_user';
