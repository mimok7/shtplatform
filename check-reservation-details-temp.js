const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://jkhookaflhibrcafmlxn.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpraG9va2FmbGhpYnJjYWZtbHhuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTgzMjgzMCwiZXhwIjoyMDY3NDA4ODMwfQ.KmBE7PA-ns2_HLbq8rhZe-hOeRlKoZ_phawRCvtGPSE';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
  const targetIds = [
    '87883ab9-583b-449e-b711-69dd81bcef3f',
    '49d7036b-cbd7-4264-8e76-8d34bacc3fdb',
    '08fbbb5b-8fc2-4c58-b191-af7d6b6c1545',
    '3bb9eac4-63af-4c8b-95a7-bca4237f7d39',
    'ab5aeb80-0e4f-43ba-9db1-062f96bb837d'
  ];

  console.log('=== Checking Main Reservation Total Amounts ===');
  const { data: resRows, error } = await supabase
    .from('reservation')
    .select('re_id, total_amount, price_breakdown, manual_additional_fee')
    .in('re_id', targetIds);

  if (error) {
    console.error('Error fetching reservations:', error);
    return;
  }

  for (const r of resRows) {
    console.log(`Reservation ID: ${r.re_id}`);
    console.log(`Total Amount: ${r.total_amount}`);
    console.log(`Price Breakdown:`, JSON.stringify(r.price_breakdown, null, 2));
    console.log('---');
  }
}

run().catch(console.error);
