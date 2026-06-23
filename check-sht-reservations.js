const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://jkhookaflhibrcafmlxn.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpraG9va2FmbGhpYnJjYWZtbHhuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTgzMjgzMCwiZXhwIjoyMDY3NDA4ODMwfQ.KmBE7PA-ns2_HLbq8rhZe-hOeRlKoZ_phawRCvtGPSE';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
  console.log('=== Checking SHT Vehicle Database (reservation_car_sht) ===');

  // 1. Fetch all reservation_car_sht rows
  const { data: allRows, error: rowsErr } = await supabase
    .from('reservation_car_sht')
    .select('*');
    
  if (rowsErr) {
    console.error('Error fetching reservation_car_sht:', rowsErr);
    return;
  }

  // 2. Fetch all manager_reservations to get customer details easily
  const { data: managers, error: mgrErr } = await supabase
    .from('manager_reservations')
    .select('re_id, customer_name, customer_email, customer_phone, re_status');
    
  if (mgrErr) {
    console.error('Error fetching manager_reservations:', mgrErr);
    return;
  }

  const customerMap = {};
  for (const mgr of managers) {
    customerMap[mgr.re_id] = mgr;
  }

  // Group rows by reservation_id
  const grouped = {};
  for (const row of allRows) {
    if (!grouped[row.reservation_id]) {
      grouped[row.reservation_id] = [];
    }
    grouped[row.reservation_id].push(row);
  }

  const notRoundTrips = []; // Reservations with only 1 row
  const roundTripsBothPrices = []; // Reservations with 2 rows where both have prices > 0

  for (const resId in grouped) {
    const rows = grouped[resId];
    const customer = customerMap[resId] || { customer_name: 'Unknown', customer_email: 'Unknown', customer_phone: 'Unknown', re_status: 'Unknown' };

    if (rows.length === 1) {
      // 1. Not round-trip (only has 1 row)
      const row = rows[0];
      notRoundTrips.push({
        reservation_id: resId,
        customer_name: customer.customer_name,
        customer_phone: customer.customer_phone,
        status: customer.re_status,
        sht_category: row.sht_category,
        pickup_location: row.pickup_location,
        dropoff_location: row.dropoff_location,
        pickup_datetime: row.pickup_datetime,
        car_total_price: row.car_total_price,
        unit_price: row.unit_price
      });
    } else if (rows.length === 2) {
      // 2. Round-trip (has 2 rows)
      // Check if BOTH have prices > 0
      const row1 = rows[0];
      const row2 = rows[1];
      
      const price1 = parseFloat(row1.car_total_price || 0);
      const price2 = parseFloat(row2.car_total_price || 0);

      if (price1 > 0 && price2 > 0) {
        roundTripsBothPrices.push({
          reservation_id: resId,
          customer_name: customer.customer_name,
          customer_phone: customer.customer_phone,
          status: customer.re_status,
          row1: {
            id: row1.id,
            sht_category: row1.sht_category,
            pickup_datetime: row1.pickup_datetime,
            pickup_location: row1.pickup_location,
            dropoff_location: row1.dropoff_location,
            car_total_price: row1.car_total_price
          },
          row2: {
            id: row2.id,
            sht_category: row2.sht_category,
            pickup_datetime: row2.pickup_datetime,
            pickup_location: row2.pickup_location,
            dropoff_location: row2.dropoff_location,
            car_total_price: row2.car_total_price
          }
        });
      }
    }
  }

  console.log(`\nFound ${notRoundTrips.length} reservations that are NOT round-trips (only 1 row).`);
  console.log(`Found ${roundTripsBothPrices.length} round-trip reservations with prices in both rows.`);

  // Let's write output details
  if (notRoundTrips.length > 0) {
    console.log('\n--- Sample of reservations that are NOT round-trips (up to 10) ---');
    console.log(JSON.stringify(notRoundTrips.slice(0, 10), null, 2));
  }

  if (roundTripsBothPrices.length > 0) {
    console.log('\n--- Round-trip reservations with prices in both rows ---');
    console.log(JSON.stringify(roundTripsBothPrices, null, 2));
  }
}

run().catch(console.error);
