const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://jkhookaflhibrcafmlxn.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpraG9va2FmbGhpYnJjYWZtbHhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE4MzI4MzAsImV4cCI6MjA2NzQwODgzMH0.gyl-bSYT3VHSB-9T8yxMHrAIHaLg2KdbA2qCq6pMtWI';
const SERVICE_ROLE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpraG9va2FmbGhpYnJjYWZtbHhuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTgzMjgzMCwiZXhwIjoyMDY3NDA4ODMwfQ.KmBE7PA-ns2_HLbq8rhZe-hOeRlKoZ_phawRCvtGPSE';

async function compareAccess() {
  console.log('🔍 Comparing ANON vs SERVICE_ROLE access to ticket_price\n');

  // Test 1: ANON Key
  const anonClient = createClient(SUPABASE_URL, ANON_KEY);
  const { data: anonData, error: anonError } = await anonClient
    .from('ticket_price')
    .select('*')
    .eq('is_active', true);

  console.log('ANON Key:');
  console.log(`  Status: ${anonError ? '❌ Error' : '✅ Success'}`);
  if (anonError) {
    console.log(`  Error: ${anonError.message}`);
    console.log(`  Code: ${anonError.code}`);
  } else {
    console.log(`  Records: ${anonData?.length || 0}`);
  }

  // Test 2: SERVICE_ROLE Key
  const serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: serviceData, error: serviceError } = await serviceClient
    .from('ticket_price')
    .select('*')
    .eq('is_active', true);

  console.log('\nSERVICE_ROLE Key:');
  console.log(`  Status: ${serviceError ? '❌ Error' : '✅ Success'}`);
  if (serviceError) {
    console.log(`  Error: ${serviceError.message}`);
  } else {
    console.log(`  Records: ${serviceData?.length || 0}`);
    if (serviceData && serviceData.length > 0) {
      console.log(`  Sample: ${serviceData[0].ticket_price_code} - ${serviceData[0].ticket_name}`);
    }
  }

  // Test 3: Check RLS info
  console.log('\n📋 Checking RLS policies...');
  const { data: rls } = await serviceClient
    .rpc('get_table_rls_info', { table_name: 'public.ticket_price' })
    .catch(() => ({ data: null }));

  if (rls) {
    console.log('RLS Info:', rls);
  } else {
    console.log('Cannot retrieve RLS info via RPC');
  }
}

compareAccess().catch(console.error);
