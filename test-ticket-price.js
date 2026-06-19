const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://jkhookaflhibrcafmlxn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpraG9va2FmbGhpYnJjYWZtbHhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE4MzI4MzAsImV4cCI6MjA2NzQwODgzMH0.gyl-bSYT3VHSB-9T8yxMHrAIHaLg2KdbA2qCq6pMtWI';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function test() {
  console.log('🔍 Checking ticket_price table...\n');

  // Check if table exists and has data
  const { data, error, status } = await supabase
    .from('ticket_price')
    .select('*')
    .eq('is_active', true)
    .limit(5);

  console.log(`Status: ${status}`);
  console.log(`Error: ${error ? error.message : 'None'}`);
  console.log(`Data count: ${data ? data.length : 'N/A'}`);
  
  if (data && data.length > 0) {
    console.log('\n✅ Sample records:');
    data.forEach((row, idx) => {
      console.log(`\n[${idx}]`);
      console.log(`  ticket_type: ${row.ticket_type}`);
      console.log(`  price_item: ${row.price_item}`);
      console.log(`  official_price_vnd: ${row.official_price_vnd}`);
      console.log(`  valid_from: ${row.valid_from}`);
      console.log(`  valid_to: ${row.valid_to}`);
    });
  } else {
    console.log('\n❌ No active ticket_price records found!');
  }

  // Also check total count
  const { count, error: countError } = await supabase
    .from('ticket_price')
    .select('*', { count: 'exact' });

  console.log(`\n📊 Total records in ticket_price: ${count}`);

  // Check dragon type specifically
  const { data: dragonData } = await supabase
    .from('ticket_price')
    .select('*')
    .eq('ticket_type', 'dragon')
    .eq('is_active', true);

  console.log(`\n🐉 Dragon ticket_price records: ${dragonData ? dragonData.length : 0}`);
  if (dragonData && dragonData.length > 0) {
    console.log('Sample dragon record:');
    console.log(JSON.stringify(dragonData[0], null, 2));
  }
}

test().catch(console.error);
