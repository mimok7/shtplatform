-- RLS Policies for ticket_price table
-- Enable RLS if not already enabled
ALTER TABLE public.ticket_price ENABLE ROW LEVEL SECURITY;

-- Policy 1: Allow all users (anon and authenticated) to SELECT
DROP POLICY IF EXISTS "Allow all users to read ticket_price" ON public.ticket_price;
CREATE POLICY "Allow all users to read ticket_price"
  ON public.ticket_price
  FOR SELECT
  USING (true);

-- Policy 2: Allow service_role to manage all operations
DROP POLICY IF EXISTS "Allow service_role to manage ticket_price" ON public.ticket_price;
CREATE POLICY "Allow service_role to manage ticket_price"
  ON public.ticket_price
  FOR ALL
  USING (true)
  WITH CHECK (true);
