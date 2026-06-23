const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://jkhookaflhibrcafmlxn.supabase.co';
const SERVICE_ROLE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpraG9va2FmbGhpYnJjYWZtbHhuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTgzMjgzMCwiZXhwIjoyMDY3NDA4ODMwfQ.KmBE7PA-ns2_HLbq8rhZe-hOeRlKoZ_phawRCvtGPSE';

const client = createClient(SUPABASE_URL, SERVICE_ROLE);

async function run() {
  console.log('🚀 Running database migration via exec_sql RPC...');
  
  const sqlFile = path.join(__dirname, 'sql', '111-fix-sht-pricing-trigger-and-data-patch.sql');
  const sqlContent = fs.readFileSync(sqlFile, 'utf-8');

  const { data, error } = await client.rpc('exec_sql', { sql: sqlContent });
  
  if (error) {
    console.error('❌ Migration failed:', error);
  } else {
    console.log('✅ Migration executed successfully!', data);
  }
}

run().catch(console.error);
