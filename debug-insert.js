const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://jkhookaflhibrcafmlxn.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpraG9va2FmbGhpYnJjYWZtbHhuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTgzMjgzMCwiZXhwIjoyMDY3NDA4ODMwfQ.KmBE7PA-ns2_HLbq8rhZe-hOeRlKoZ_phawRCvtGPSE';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function debugInsert() {
  console.log('🔍 Debugging ticket_price insert...\n');

  // First check if table exists
  console.log('Attempting insert to ticket_price table...');

  // Try simple insert
  const { data, error, status } = await supabase
    .from('ticket_price')
    .insert({
      ticket_price_code: 'TEST_001',
      ticket_type: 'dragon',
      ticket_name: 'Test Ticket',
      price_item: 'adult',
      official_price_vnd: 100,
      stay_card_price_vnd: 90,
      stay_krw_price_krw: 80,
      sort_order: 1,
      is_active: true,
      valid_from: '2026-06-19'
    });

  console.log(`\nInsert attempt:`);
  console.log(`Status: ${status}`);
  if (error) {
    console.log(`❌ Error: ${error.message}`);
    console.log(`Error details:`, JSON.stringify(error, null, 2));
  } else {
    console.log(`✅ Success! Data:`, data);
  }

  // Check count
  const { count, error: countError } = await supabase
    .from('ticket_price')
    .select('*', { count: 'exact', head: true });

  console.log(`\nRecord count: ${count}`);
}

debugInsert().catch(console.error);
