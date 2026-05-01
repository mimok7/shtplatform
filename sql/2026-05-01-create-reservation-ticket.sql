-- ============================================================================
-- ticket direct booking: dedicated detail table
-- date: 2026-05-01
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.reservation_ticket (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL REFERENCES public.reservation(re_id) ON DELETE CASCADE,
  ticket_type text NOT NULL DEFAULT 'other',
  ticket_name text,
  program_selection text,
  ticket_quantity integer NOT NULL DEFAULT 1,
  usage_date date NOT NULL,
  shuttle_required boolean NOT NULL DEFAULT false,
  pickup_location text,
  dropoff_location text,
  ticket_details text,
  special_requests text,
  unit_price numeric NOT NULL DEFAULT 0,
  total_price numeric NOT NULL DEFAULT 0,
  request_note text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT reservation_ticket_reservation_id_unique UNIQUE (reservation_id),
  CONSTRAINT reservation_ticket_quantity_check CHECK (ticket_quantity > 0),
  CONSTRAINT reservation_ticket_type_check CHECK (ticket_type IN ('dragon', 'other'))
);

CREATE INDEX IF NOT EXISTS idx_reservation_ticket_reservation_id ON public.reservation_ticket(reservation_id);
CREATE INDEX IF NOT EXISTS idx_reservation_ticket_usage_date ON public.reservation_ticket(usage_date);
CREATE INDEX IF NOT EXISTS idx_reservation_ticket_type ON public.reservation_ticket(ticket_type);

-- Existing ticket rows were previously saved in reservation_tour.
INSERT INTO public.reservation_ticket (
  reservation_id,
  ticket_type,
  ticket_name,
  program_selection,
  ticket_quantity,
  usage_date,
  shuttle_required,
  pickup_location,
  dropoff_location,
  ticket_details,
  special_requests,
  unit_price,
  total_price,
  request_note,
  created_at,
  updated_at
)
SELECT
  rt.reservation_id,
  CASE
    WHEN COALESCE(rt.request_note, '') ILIKE '%[프로그램]%' THEN 'other'
    ELSE 'dragon'
  END AS ticket_type,
  NULL::text AS ticket_name,
  NULLIF(TRIM((regexp_match(COALESCE(rt.request_note, ''), '\\[프로그램\\]\\s*([^\\r\\n]+)'))[1]), '') AS program_selection,
  COALESCE(rt.tour_capacity, 1) AS ticket_quantity,
  rt.usage_date,
  (COALESCE(rt.request_note, '') ILIKE '%[셔틀] 신청함%') AS shuttle_required,
  rt.pickup_location,
  rt.dropoff_location,
  NULLIF(TRIM((regexp_match(COALESCE(rt.request_note, ''), '\\[상세내용\\]\\s*([^\\r\\n]+)'))[1]), '') AS ticket_details,
  NULLIF(TRIM((regexp_match(COALESCE(rt.request_note, ''), '\\[요청사항\\]\\s*([^\\r\\n]+)'))[1]), '') AS special_requests,
  COALESCE(rt.unit_price, 0) AS unit_price,
  COALESCE(rt.total_price, 0) AS total_price,
  rt.request_note,
  COALESCE(rt.created_at, now()) AS created_at,
  COALESCE(rt.created_at, now()) AS updated_at
FROM public.reservation_tour rt
JOIN public.reservation r ON r.re_id = rt.reservation_id
WHERE r.re_type = 'ticket'
  AND NOT EXISTS (
    SELECT 1
    FROM public.reservation_ticket t
    WHERE t.reservation_id = rt.reservation_id
  );

ALTER TABLE public.reservation_ticket ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reservation_ticket_owner_all ON public.reservation_ticket;
CREATE POLICY reservation_ticket_owner_all ON public.reservation_ticket
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.reservation r
      WHERE r.re_id = reservation_ticket.reservation_id
        AND r.re_user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.reservation r
      WHERE r.re_id = reservation_ticket.reservation_id
        AND r.re_user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS reservation_ticket_manager_all ON public.reservation_ticket;
CREATE POLICY reservation_ticket_manager_all ON public.reservation_ticket
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = (SELECT auth.uid())
        AND u.role IN ('manager', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = (SELECT auth.uid())
        AND u.role IN ('manager', 'admin')
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reservation_ticket TO authenticated;
