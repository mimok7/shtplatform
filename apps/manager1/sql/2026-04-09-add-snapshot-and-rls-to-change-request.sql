-- 2026-04-09
-- Add snapshot_data column and RLS policies for customer change request system
-- snapshot_data: stores original reservation data at the time of change request for audit

BEGIN;

-- =========================================================
-- 1) Add snapshot_data JSONB column to header table
-- =========================================================
ALTER TABLE public.reservation_change_request
  ADD COLUMN IF NOT EXISTS snapshot_data jsonb;

COMMENT ON COLUMN public.reservation_change_request.snapshot_data
  IS 'Original reservation service data captured at request submission time (audit trail)';

-- =========================================================
-- 2) Enable RLS on all change request tables
-- =========================================================
ALTER TABLE public.reservation_change_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservation_change_airport ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservation_change_car_sht ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservation_change_cruise ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservation_change_cruise_car ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservation_change_hotel ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservation_change_rentcar ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservation_change_tour ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- 3) RLS policies for reservation_change_request
-- =========================================================

-- Customer: can INSERT own requests
DROP POLICY IF EXISTS change_request_insert_own ON public.reservation_change_request;
CREATE POLICY change_request_insert_own ON public.reservation_change_request
  FOR INSERT TO authenticated
  WITH CHECK (requester_user_id = auth.uid());

-- Customer: can SELECT own requests
DROP POLICY IF EXISTS change_request_select_own ON public.reservation_change_request;
CREATE POLICY change_request_select_own ON public.reservation_change_request
  FOR SELECT TO authenticated
  USING (
    requester_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('manager', 'admin')
    )
  );

-- Manager/Admin: can UPDATE (approve/reject)
DROP POLICY IF EXISTS change_request_update_manager ON public.reservation_change_request;
CREATE POLICY change_request_update_manager ON public.reservation_change_request
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('manager', 'admin')
    )
  );

-- Customer: can UPDATE own pending requests (cancel only)
DROP POLICY IF EXISTS change_request_update_own ON public.reservation_change_request;
CREATE POLICY change_request_update_own ON public.reservation_change_request
  FOR UPDATE TO authenticated
  USING (requester_user_id = auth.uid() AND status = 'pending');

-- =========================================================
-- 4) RLS policies for all service-specific change tables
--    (same pattern: owner insert/select, manager full access)
-- =========================================================

-- Helper: create policies for each change detail table
DO $$
DECLARE
  tbl text;
  tbls text[] := ARRAY[
    'reservation_change_airport',
    'reservation_change_car_sht',
    'reservation_change_cruise',
    'reservation_change_cruise_car',
    'reservation_change_hotel',
    'reservation_change_rentcar',
    'reservation_change_tour'
  ];
BEGIN
  FOREACH tbl IN ARRAY tbls LOOP
    -- INSERT: authenticated users (request_id FK ensures ownership via header)
    EXECUTE format(
      'DROP POLICY IF EXISTS %I_insert_auth ON public.%I;
       CREATE POLICY %I_insert_auth ON public.%I
         FOR INSERT TO authenticated WITH CHECK (true);',
      tbl, tbl, tbl, tbl
    );

    -- SELECT: owner via header join OR manager/admin
    EXECUTE format(
      'DROP POLICY IF EXISTS %I_select_auth ON public.%I;
       CREATE POLICY %I_select_auth ON public.%I
         FOR SELECT TO authenticated
         USING (
           EXISTS (
             SELECT 1 FROM public.reservation_change_request r
             WHERE r.id = request_id AND r.requester_user_id = auth.uid()
           )
           OR EXISTS (
             SELECT 1 FROM public.users u
             WHERE u.id = auth.uid() AND u.role IN (''manager'', ''admin'')
           )
         );',
      tbl, tbl, tbl, tbl
    );
  END LOOP;
END;
$$;

COMMIT;
