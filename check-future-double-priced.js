const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://jkhookaflhibrcafmlxn.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpraG9va2FmbGhpYnJjYWZtbHhuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTgzMjgzMCwiZXhwIjoyMDY3NDA4ODMwfQ.KmBE7PA-ns2_HLbq8rhZe-hOeRlKoZ_phawRCvtGPSE';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const TODAY_STR = '2026-06-22'; // Local time is 2026-06-22

async function run() {
  console.log(`=== Filtering Double-Priced SHT Reservations after ${TODAY_STR} ===`);

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

  // Find double-priced ones
  const bothPrices = [];
  for (const resId in grouped) {
    const rows = grouped[resId];
    if (rows.length === 2) {
      const p1 = parseFloat(rows[0].car_total_price || 0);
      const p2 = parseFloat(rows[1].car_total_price || 0);
      if (p1 > 0 && p2 > 0) {
        bothPrices.push({ resId, rows });
      }
    }
  }

  const targetIds = bothPrices.map(x => x.resId);

  // Fetch reservations detail
  const { data: resRows, error: resErr } = await supabase
    .from('reservation')
    .select('re_id, total_amount, price_breakdown, re_created_at, re_user_id')
    .in('re_id', targetIds);

  if (resErr) {
    console.error('Error fetching from reservation table:', resErr);
    return;
  }

  const resMap = {};
  for (const r of resRows) {
    resMap[r.re_id] = r;
  }

  // Fetch managers details
  const { data: mgrRows, error: mgrErr } = await supabase
    .from('manager_reservations')
    .select('re_id, customer_name, customer_email, customer_phone, re_status')
    .in('re_id', targetIds);

  if (mgrErr) {
    console.error('Error fetching from manager_reservations table:', mgrErr);
    return;
  }

  const mgrMap = {};
  for (const m of mgrRows) {
    mgrMap[m.re_id] = m;
  }

  // Fetch users info just in case
  const { data: users, error: usersErr } = await supabase
    .from('users')
    .select('id, name, email, phone_number');
    
  const userMap = {};
  if (!usersErr && users) {
    for (const u of users) {
      userMap[u.id] = u;
    }
  }

  console.log(`Analyzing ${bothPrices.length} double-priced cases...`);

  const futureList = [];
  for (const item of bothPrices) {
    const mgr = mgrMap[item.resId] || {};
    const res = resMap[item.resId] || {};

    // Get user details from users table if mgr is Unknown or missing
    let name = mgr.customer_name || 'Unknown';
    let phone = mgr.customer_phone || '';
    let email = mgr.customer_email || '';
    
    if ((name === 'Unknown' || !name) && res.re_user_id && userMap[res.re_user_id]) {
      name = userMap[res.re_user_id].name || name;
      phone = userMap[res.re_user_id].phone_number || phone;
      email = userMap[res.re_user_id].email || email;
    }

    // Determine the latest usage date (pickup_datetime)
    const dates = item.rows.map(r => r.pickup_datetime).filter(Boolean);
    const maxDate = dates.length > 0 ? dates.sort().reverse()[0] : '';

    // Check if maxDate is after today (>= TODAY_STR)
    if (maxDate && maxDate >= TODAY_STR) {
      futureList.push({
        reservation_id: item.resId,
        customer_name: name,
        customer_phone: phone,
        customer_email: email,
        status: mgr.re_status || 'Unknown',
        pickup_datetime: item.rows[0].pickup_datetime,
        dropoff_datetime: item.rows[1].pickup_datetime,
        pickup_location: item.rows[0].pickup_location,
        dropoff_location: item.rows[1].dropoff_location,
        pickup_price: parseFloat(item.rows[0].car_total_price),
        dropoff_price: parseFloat(item.rows[1].car_total_price),
        total_amount: res.total_amount,
        maxDate
      });
    }
  }

  // Sort futureList by usage date
  futureList.sort((a, b) => a.maxDate.localeCompare(b.maxDate));

  console.log(`\nFiltered ${futureList.length} future reservations:`);
  console.log(JSON.stringify(futureList, null, 2));
}

run().catch(console.error);
