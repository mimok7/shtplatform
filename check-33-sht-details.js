const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://jkhookaflhibrcafmlxn.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpraG9va2FmbGhpYnJjYWZtbHhuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTgzMjgzMCwiZXhwIjoyMDY3NDA4ODMwfQ.KmBE7PA-ns2_HLbq8rhZe-hOeRlKoZ_phawRCvtGPSE';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
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

  // Fetch from reservation
  const { data: resRows, error: resErr } = await supabase
    .from('reservation')
    .select('re_id, total_amount, price_breakdown')
    .in('re_id', targetIds);

  if (resErr) {
    console.error('Error fetching from reservation table:', resErr);
    return;
  }

  const resMap = {};
  for (const r of resRows) {
    resMap[r.re_id] = r;
  }

  // Fetch from manager_reservations
  const { data: mgrRows, error: mgrErr } = await supabase
    .from('manager_reservations')
    .select('re_id, customer_name, customer_email, customer_phone')
    .in('re_id', targetIds);

  if (mgrErr) {
    console.error('Error fetching from manager_reservations table:', mgrErr);
    return;
  }

  const mgrMap = {};
  for (const m of mgrRows) {
    mgrMap[m.re_id] = m;
  }

  let report = `# 33건의 양쪽 금액 입력된 스하차량 상세 내역\n\n`;
  for (const { resId, rows } of bothPrices) {
    const mgr = mgrMap[resId] || {};
    const res = resMap[resId] || {};
    report += `### 예약 ID: \`${resId}\` (고객명: ${mgr.customer_name || 'Unknown'})\n`;
    report += `* **메인 예약 총액 (total_amount)**: ${res.total_amount ? res.total_amount.toLocaleString() : '0'}원\n`;
    report += `* **상세 가격 정보 (price_breakdown)**: \`${JSON.stringify(res.price_breakdown)}\`\n`;
    report += `* **행 1 (${rows[0].sht_category})**: ID: \`${rows[0].id}\`, 코드: \`${rows[0].car_price_code}\`, 금액: ${rows[0].car_total_price ? rows[0].car_total_price.toLocaleString() : 0}원, 좌석: \`${rows[0].seat_number || '-'}\`\n`;
    report += `* **행 2 (${rows[1].sht_category})**: ID: \`${rows[1].id}\`, 코드: \`${rows[1].car_price_code}\`, 금액: ${rows[1].car_total_price ? rows[1].car_total_price.toLocaleString() : 0}원, 좌석: \`${rows[1].seat_number || '-'}\`\n\n`;
  }

  fs.writeFileSync('check-33-details.md', report, 'utf8');
  console.log('check-33-details.md generated successfully.');
}

run().catch(console.error);
