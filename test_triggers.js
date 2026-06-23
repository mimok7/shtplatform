const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://jkhookaflhibrcafmlxn.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpraG9va2FmbGhpYnJjYWZtbHhuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTgzMjgzMCwiZXhwIjoyMDY3NDA4ODMwfQ.KmBE7PA-ns2_HLbq8rhZe-hOeRlKoZ_phawRCvtGPSE';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
  console.log('Querying triggers on reservation_car_sht...');
  
  // We can query pg_trigger and pg_class to get triggers on reservation_car_sht
  const query = `
    SELECT 
      t.tgname AS trigger_name,
      proc.proname AS function_name,
      CASE t.tgenabled
        WHEN 'O' THEN 'enabled'
        WHEN 'D' THEN 'disabled'
        ELSE 'other'
      END AS status
    FROM pg_trigger t
    JOIN pg_class cl ON t.tgrelid = cl.oid
    JOIN pg_namespace ns ON cl.relnamespace = ns.oid
    JOIN pg_proc proc ON t.tgfoid = proc.oid
    WHERE cl.relname = 'reservation_car_sht'
      AND ns.nspname = 'public';
  `;

  // We don't have direct SQL client, but we can call supabase.rpc or write a test script that executes SQL using a postgres connection if available.
  // Wait, let's check if there is an RPC we can use, or if pg_rpc is available.
  // Since we can't run raw SQL directly through supabase REST API unless there is an RPC, let's search if there is any RPC.
  // Wait! Let's check the database schema in sql/db-schema.json or packages/db or packages/ui.
  // Actually, we can check if there are any other triggers on reservation_car_sht by grepping the SQL files in sql/ directory.
  // We already grepped the sql/ folder for 'TRIGGER' and saw only:
  // - trg_reservation_car_sht_total
  // - trg_normalize_reservation_car_sht_pricing
}

run().catch(console.error);
