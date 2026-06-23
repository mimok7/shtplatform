// @supabase/supabase-js 를 사용해 데이터베이스 조회하는 스크립트
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://jkhookaflhibrcafmlxn.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpraG9va2FmbGhpYnJjYWZtbHhuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTgzMjgzMCwiZXhwIjoyMDY3NDA4ODMwfQ.KmBE7PA-ns2_HLbq8rhZe-hOeRlKoZ_phawRCvtGPSE';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function run() {
  const targetReservationId = '380b5381-3852-49a1-b187-9179365426a1';
  console.log(`🔄 Fetching reservation_change_request for ${targetReservationId}...`);
  const { data: requestData, error: requestError } = await supabase
    .from('reservation_change_request')
    .select('*')
    .eq('reservation_id', targetReservationId);

  if (requestError) {
    console.error('❌ Request fetch failed:', requestError);
  } else {
    console.log('=== RESERVATION CHANGE REQUESTS ===');
    console.log(JSON.stringify(requestData, null, 2));
  }

  console.log(`🔄 Fetching reservation_change_package for ${targetReservationId}...`);
  const { data: packageData, error: packageError } = await supabase
    .from('reservation_change_package')
    .select('*')
    .eq('reservation_id', targetReservationId);

  if (packageError) {
    console.error('❌ Package fetch failed:', packageError);
  } else {
    console.log('=== RESERVATION CHANGE PACKAGES ===');
    console.log(JSON.stringify(packageData, null, 2));
  }
}

run().catch(console.error);






