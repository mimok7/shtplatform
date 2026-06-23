const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://jkhookaflhibrcafmlxn.supabase.co';
const SERVICE_ROLE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpraG9va2FmbGhpYnJjYWZtbHhuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTgzMjgzMCwiZXhwIjoyMDY3NDA4ODMwfQ.KmBE7PA-ns2_HLbq8rhZe-hOeRlKoZ_phawRCvtGPSE';

const client = createClient(SUPABASE_URL, SERVICE_ROLE);

async function executeSQL() {
  console.log('🚀 Executing RLS policy SQL...\n');

  const sqlFile = path.join(__dirname, 'sql', '101-ticket-price-rls-policies-20260619.sql');
  let sql;

  try {
    sql = fs.readFileSync(sqlFile, 'utf-8');
  } catch (err) {
    console.log('Could not read SQL file, using inline SQL\n');
    sql = `
      ALTER TABLE public.ticket_price ENABLE ROW LEVEL SECURITY;
      
      DROP POLICY IF EXISTS "Allow all users to read ticket_price" ON public.ticket_price;
      CREATE POLICY "Allow all users to read ticket_price"
        ON public.ticket_price
        FOR SELECT
        USING (true);
      
      DROP POLICY IF EXISTS "Allow service_role to manage ticket_price" ON public.ticket_price;
      CREATE POLICY "Allow service_role to manage ticket_price"
        ON public.ticket_price
        FOR ALL
        USING (true)
        WITH CHECK (true);
    `;
  }

  try {
    // Note: Supabase JS client doesn't support executing raw SQL directly
    // We need to use the SQL Editor API or create RPCs
    // For now, let's try an alternative approach
    
    console.log('⚠️  Note: Supabase JS client cannot execute raw SQL directly.');
    console.log('You must run this SQL in the Supabase SQL Editor:\n');
    console.log(sql);
    console.log('\n📝 To execute:');
    console.log('1. Go to: https://supabase.com/dashboard/project/jkhookaflhibrcafmlxn/sql');
    console.log('2. Create a new query');
    console.log('3. Paste the SQL above');
    console.log('4. Click Run\n');

  } catch (err) {
    console.error('Error:', err.message);
  }
}

async function verifyAfterManual() {
  console.log('\n✅ Once you\'ve run the SQL manually, test with:');
  console.log('   node test-ticket-price.js\n');
}

executeSQL().catch(console.error);
verifyAfterManual().catch(console.error);
