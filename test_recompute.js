const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://jkhookaflhibrcafmlxn.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpraG9va2FmbGhpYnJjYWZtbHhuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTgzMjgzMCwiZXhwIjoyMDY3NDA4ODMwfQ.KmBE7PA-ns2_HLbq8rhZe-hOeRlKoZ_phawRCvtGPSE';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
  const resId = '28083a11-5adb-4327-ab8f-333625f11e71';
  console.log(`Calling recompute_reservation_total for reservation ${resId}...`);
  
  const { data, error } = await supabase.rpc('recompute_reservation_total', { p_reservation_id: resId });
  if (error) {
    console.error('Error calling RPC recompute_reservation_total:', error);
    return;
  }
  console.log('RPC called successfully, result:', data);

  const { data: resRow } = await supabase
    .from('reservation')
    .select('re_id, total_amount, price_breakdown')
    .eq('re_id', resId)
    .single();

  console.log('Updated Reservation row:', JSON.stringify(resRow, null, 2));
}

run().catch(console.error);
