const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://jkhookaflhibrcafmlxn.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpraG9va2FmbGhpYnJjYWZtbHhuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTgzMjgzMCwiZXhwIjoyMDY3NDA4ODMwfQ.KmBE7PA-ns2_HLbq8rhZe-hOeRlKoZ_phawRCvtGPSE';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
  console.log('--- Checking rentcar_price table for SHT ---');
  const { data, error } = await supabase
    .from('rentcar_price')
    .select('rent_code, category, vehicle_type, way_type, route, price')
    .or('rent_code.ilike.%sht%,vehicle_type.ilike.%셔틀%,vehicle_type.ilike.%리무진%');
  
  console.log('Results:', data ? data.slice(0, 20) : null, error);
}

run().catch(console.error);
