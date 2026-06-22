const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://jkhookaflhibrcafmlxn.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpraG9va2FmbGhpYnJjYWZtbHhuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTgzMjgzMCwiZXhwIjoyMDY3NDA4ODMwfQ.KmBE7PA-ns2_HLbq8rhZe-hOeRlKoZ_phawRCvtGPSE';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const TODAY_STR = '2026-06-22'; // Local time is 2026-06-22

async function run() {
  console.log(`=== Filtering Double-Priced SHT Reservations after ${TODAY_STR} (Direct Join) ===`);

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
    .select('re_id, total_amount, price_breakdown, re_created_at, re_user_id, re_status')
    .in('re_id', targetIds);

  if (resErr) {
    console.error('Error fetching from reservation table:', resErr);
    return;
  }

  const resMap = {};
  for (const r of resRows) {
    resMap[r.re_id] = r;
  }

  // Fetch all users directly
  const userIds = resRows.map(r => r.re_user_id).filter(Boolean);
  const { data: userRows, error: usersErr } = await supabase
    .from('users')
    .select('id, name, email, phone_number')
    .in('id', userIds);

  const userMap = {};
  if (!usersErr && userRows) {
    for (const u of userRows) {
      userMap[u.id] = u;
    }
  } else if (usersErr) {
    console.error('Error fetching users:', usersErr);
  }

  const futureList = [];
  for (const item of bothPrices) {
    const res = resMap[item.resId];
    if (!res) continue;

    const user = userMap[res.re_user_id] || { name: 'Unknown', phone_number: '', email: '' };

    // Determine the latest usage date (pickup_datetime)
    const dates = item.rows.map(r => r.pickup_datetime).filter(Boolean);
    const maxDate = dates.length > 0 ? dates.sort().reverse()[0] : '';

    // Check if maxDate is after today (>= TODAY_STR)
    if (maxDate && maxDate >= TODAY_STR) {
      futureList.push({
        reservation_id: item.resId,
        customer_name: user.name,
        customer_phone: user.phone_number || '',
        customer_email: user.email || '',
        status: res.re_status || 'Unknown',
        pickup_datetime: item.rows.find(r => r.sht_category.toLowerCase().includes('pick'))?.pickup_datetime || item.rows[0].pickup_datetime,
        dropoff_datetime: item.rows.find(r => r.sht_category.toLowerCase().includes('drop') || r.sht_category.toLowerCase().includes('send'))?.pickup_datetime || item.rows[1].pickup_datetime,
        pickup_location: item.rows.find(r => r.sht_category.toLowerCase().includes('pick'))?.pickup_location || item.rows[0].pickup_location,
        dropoff_location: item.rows.find(r => r.sht_category.toLowerCase().includes('drop') || r.sht_category.toLowerCase().includes('send'))?.dropoff_location || item.rows[1].dropoff_location,
        pickup_price: parseFloat(item.rows.find(r => r.sht_category.toLowerCase().includes('pick'))?.car_total_price || item.rows[0].car_total_price),
        dropoff_price: parseFloat(item.rows.find(r => r.sht_category.toLowerCase().includes('drop') || r.sht_category.toLowerCase().includes('send'))?.car_total_price || item.rows[1].car_total_price),
        total_amount: res.total_amount,
        maxDate
      });
    }
  }

  // Sort futureList by usage date
  futureList.sort((a, b) => a.maxDate.localeCompare(b.maxDate));

  // Output formatting
  console.log(`\nFiltered ${futureList.length} future reservations:`);
  for (const item of futureList) {
    console.log(`- 예약자명: ${item.customer_name}`);
    console.log(`  연락처: ${item.customer_phone} / 이메일: ${item.customer_email}`);
    console.log(`  예약 ID: ${item.reservation_id}`);
    console.log(`  상태: ${item.status}`);
    console.log(`  픽업일: ${item.pickup_datetime} (${item.pickup_location}) -> 가격: ${item.pickup_price.toLocaleString()}원`);
    console.log(`  드롭일: ${item.dropoff_datetime} (${item.dropoff_location}) -> 가격: ${item.dropoff_price.toLocaleString()}원`);
    console.log(`  메인 총액: ${item.total_amount.toLocaleString()}원`);
    console.log('----------------------------------------------------');
  }
}

run().catch(console.error);
