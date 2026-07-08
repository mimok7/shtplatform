const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://jkhookaflhibrcafmlxn.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpraG9va2FmbGhpYnJjYWZtbHhuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTgzMjgzMCwiZXhwIjoyMDY3NDA4ODMwfQ.KmBE7PA-ns2_HLbq8rhZe-hOeRlKoZ_phawRCvtGPSE';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
  console.log('=== confirmation_status 테이블 전체 목록 조회 ===');
  const { data: list, error: err } = await supabase
    .from('confirmation_status')
    .select('*')
    .order('created_at', { ascending: false });

  if (err) {
    console.error('조회 실패:', err);
    return;
  }

  console.log(`총 레코드 개수: ${list.length}`);
  for (const row of list) {
    console.log(`ID: ${row.id}`);
    console.log(`  예약 ID: ${row.reservation_id}`);
    console.log(`  견적 ID: ${row.quote_id}`);
    console.log(`  상태 (status): ${row.status}`);
    console.log(`  생성일 (generated_at): ${row.generated_at}`);
    console.log(`  발송일 (sent_at): ${row.sent_at}`);
    console.log(`  이메일: ${row.email_sent_to}`);
  }
}

run().catch(console.error);
