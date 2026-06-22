const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://jkhookaflhibrcafmlxn.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpraG9va2FmbGhpYnJjYWZtbHhuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTgzMjgzMCwiZXhwIjoyMDY3NDA4ODMwfQ.KmBE7PA-ns2_HLbq8rhZe-hOeRlKoZ_phawRCvtGPSE';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function backup() {
  console.log('=== Database Backup Script ===');
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(__dirname, '..', 'sql', 'backup');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  // 1. Backup reservation_car_sht
  console.log('Fetching reservation_car_sht...');
  const { data: shtData, error: shtErr } = await supabase
    .from('reservation_car_sht')
    .select('*');
    
  if (shtErr) {
    throw new Error(`Failed to fetch reservation_car_sht: ${shtErr.message}`);
  }
  
  const shtBackupPath = path.join(backupDir, `reservation_car_sht_${timestamp}.json`);
  fs.writeFileSync(shtBackupPath, JSON.stringify(shtData, null, 2), 'utf8');
  console.log(`Saved reservation_car_sht backup to ${shtBackupPath}`);

  // 2. Backup reservation
  console.log('Fetching reservation...');
  const { data: resData, error: resErr } = await supabase
    .from('reservation')
    .select('*');
    
  if (resErr) {
    throw new Error(`Failed to fetch reservation: ${resErr.message}`);
  }
  
  const resBackupPath = path.join(backupDir, `reservation_${timestamp}.json`);
  fs.writeFileSync(resBackupPath, JSON.stringify(resData, null, 2), 'utf8');
  console.log(`Saved reservation backup to ${resBackupPath}`);
  
  console.log('=== Backup Complete! ===');
}

backup().catch(err => {
  console.error('Backup failed:', err);
  process.exit(1);
});
