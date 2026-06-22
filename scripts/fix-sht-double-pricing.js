const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://jkhookaflhibrcafmlxn.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpraG9va2FmbGhpYnJjYWZtbHhuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTgzMjgzMCwiZXhwIjoyMDY3NDA4ODMwfQ.KmBE7PA-ns2_HLbq8rhZe-hOeRlKoZ_phawRCvtGPSE';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
  console.log('=== SHT Double Pricing Auto Fix Script ===');
  
  const shouldApply = process.argv.includes('--apply');
  if (!shouldApply) {
    console.log('⚠️ DRY RUN MODE. Use "node scripts/fix-sht-double-pricing.js --apply" to apply changes to the DB.\n');
  } else {
    console.log('🚀 APPLY MODE. Writing changes to Supabase...\n');
  }

  // 1. Fetch all reservation_car_sht rows
  const { data: allRows, error: rowsErr } = await supabase
    .from('reservation_car_sht')
    .select('*');
    
  if (rowsErr) {
    console.error('Error fetching reservation_car_sht:', rowsErr);
    return;
  }

  // Group rows by reservation_id
  const grouped = {};
  for (const row of allRows) {
    if (!grouped[row.reservation_id]) {
      grouped[row.reservation_id] = [];
    }
    grouped[row.reservation_id].push(row);
  }

  const targets = [];
  for (const resId in grouped) {
    const rows = grouped[resId];
    if (rows.length === 2) {
      const row1 = rows[0];
      const row2 = rows[1];
      
      const price1 = parseFloat(row1.car_total_price || 0);
      const price2 = parseFloat(row2.car_total_price || 0);

      if (price1 > 0 && price2 > 0) {
        // Find which one is drop-off (or sending/샌딩)
        let dropoffRow = null;
        let pickupRow = null;

        const isDrop1 = String(row1.sht_category || '').toLowerCase().includes('drop') || String(row1.sht_category || '').toLowerCase().includes('sending');
        const isDrop2 = String(row2.sht_category || '').toLowerCase().includes('drop') || String(row2.sht_category || '').toLowerCase().includes('sending');

        if (isDrop1 && !isDrop2) {
          dropoffRow = row1;
          pickupRow = row2;
        } else if (isDrop2 && !isDrop1) {
          dropoffRow = row2;
          pickupRow = row1;
        } else {
          // If we cannot distinguish by name, fallback to row2 as dropoff
          dropoffRow = row2;
          pickupRow = row1;
        }

        targets.push({
          reservation_id: resId,
          pickup: pickupRow,
          dropoff: dropoffRow
        });
      }
    }
  }

  console.log(`Found ${targets.length} reservations with double pricing.`);

  for (const t of targets) {
    console.log(`Reservation: ${t.reservation_id}`);
    console.log(`  Pickup:  Row ID: ${t.pickup.id}, Category: ${t.pickup.sht_category}, Price: ${t.pickup.car_total_price}`);
    console.log(`  Dropoff: Row ID: ${t.dropoff.id}, Category: ${t.dropoff.sht_category}, Price: ${t.dropoff.car_total_price} => Set to 0`);
    
    if (shouldApply) {
      // 1. Set dropoff price to 0
      const { error: updateErr } = await supabase
        .from('reservation_car_sht')
        .update({ car_total_price: 0 })
        .eq('id', t.dropoff.id);

      if (updateErr) {
        console.error(`  ❌ Error updating dropoff row ${t.dropoff.id}:`, updateErr);
        continue;
      }
      console.log(`  ✅ Dropoff row updated to 0.`);

      // 2. Call recompute_reservation_total
      const { error: rpcErr } = await supabase
        .rpc('recompute_reservation_total', { p_reservation_id: t.reservation_id });

      if (rpcErr) {
        // Fallback: If rpc doesn't exist or fails, we can trigger recompute by editing/saving via Supabase
        console.error(`  ⚠️ RPC recompute_reservation_total failed for ${t.reservation_id}:`, rpcErr.message);
        console.log(`  🔄 Attempting direct SQL recompute fallback via SELECT rpc...`);
        
        // Let's run a raw query fallback by updating the reservation manually
        const newTotal = parseFloat(t.pickup.car_total_price);
        const { error: resUpdateErr } = await supabase
          .from('reservation')
          .update({ total_amount: newTotal })
          .eq('re_id', t.reservation_id);
        
        if (resUpdateErr) {
          console.error(`  ❌ Direct update of total_amount failed:`, resUpdateErr);
        } else {
          console.log(`  ✅ Direct update of total_amount to ${newTotal} succeeded.`);
        }
      } else {
        console.log(`  ✅ Reservation total recomputed successfully.`);
      }
    }
    console.log('---');
  }

  console.log('\nDone.');
}

run().catch(console.error);
