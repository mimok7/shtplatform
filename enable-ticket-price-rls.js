const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://jkhookaflhibrcafmlxn.supabase.co';
const SERVICE_ROLE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpraG9va2FmbGhpYnJjYWZtbHhuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTgzMjgzMCwiImV4cCI6MjA2NzQwODgzMH0.KmBE7PA-ns2_HLbq8rhZe-hOeRlKoZ_phawRCvtGPSE';

const client = createClient(SUPABASE_URL, SERVICE_ROLE);

async function addRlsPolicy() {
  console.log('🔧 Adding RLS policy to ticket_price table...\n');

  try {
    // Create a policy that allows all authenticated users to read
    const result = await client.rpc('create_ticket_price_rls_policy', {});
    console.log('✅ RLS policy created');
  } catch (err) {
    console.log('RPC not available, trying SQL directly...');
    
    // Fallback: use SQL directly
    const { error } = await client.rpc('exec_sql', {
      sql: `
        -- Enable RLS if not already enabled
        ALTER TABLE public.ticket_price ENABLE ROW LEVEL SECURITY;
        
        -- Create policy for anon/authenticated users to SELECT
        DROP POLICY IF EXISTS "Allow all users to read ticket_price" ON public.ticket_price;
        CREATE POLICY "Allow all users to read ticket_price"
          ON public.ticket_price
          FOR SELECT
          USING (true);
        
        -- Create policy for authenticated users to manage
        DROP POLICY IF EXISTS "Allow authenticated to manage ticket_price" ON public.ticket_price;
        CREATE POLICY "Allow authenticated to manage ticket_price"
          ON public.ticket_price
          FOR ALL
          USING (auth.uid() IS NOT NULL)
          WITH CHECK (auth.uid() IS NOT NULL);
      `
    });

    if (error) {
      console.log('RPC also failed:', error.message);
    }
  }
}

async function verifySql() {
  console.log('Attempting direct SQL via Supabase query...\n');

  // This won't work from client, but let's see what error we get
  try {
    const { data, error } = await client
      .from('pg_stat_statements') // random table to test
      .select('query')
      .limit(1);
    
    console.log('Got response:', error ? error.message : 'data exists');
  } catch (err) {
    console.log('Expected error:', err.message);
  }
}

async function checkCurrentPolicies() {
  console.log('\n📋 Checking current RLS status...\n');
  
  // We can't query RLS info directly from the client, but we can test
  const anonClient = createClient(SUPABASE_URL, 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpraG9va2FmbGhpYnJjYWZtbHhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE4MzI4MzAsImV4cCI6MjA2NzQwODgzMH0.gyl-bSYT3VHSB-9T8yxMHrAIHaLg2KdbA2qCq6pMtWI');
  
  const { data, error } = await anonClient
    .from('ticket_price')
    .select('*')
    .limit(1);

  if (error) {
    console.log(`❌ ANON access still blocked: ${error.message}`);
  } else {
    console.log(`✅ ANON access works! Records found: ${data?.length || 0}`);
  }
}

async function main() {
  await addRlsPolicy();
  await verifySql();
  await checkCurrentPolicies();
}

main().catch(console.error);
