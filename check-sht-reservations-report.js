const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://jkhookaflhibrcafmlxn.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpraG9va2FmbGhpYnJjYWZtbHhuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTgzMjgzMCwiZXhwIjoyMDY3NDA4ODMwfQ.KmBE7PA-ns2_HLbq8rhZe-hOeRlKoZ_phawRCvtGPSE';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
  console.log('=== Checking SHT Vehicle Database ===');

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
  const normalRoundTrips = []; // Other round trips
  const multipleRows = []; // More than 2 rows

  for (const resId in grouped) {
    const rows = grouped[resId];
    const customer = customerMap[resId] || { customer_name: 'Unknown', customer_email: 'Unknown', customer_phone: 'Unknown', re_status: 'Unknown' };

    if (rows.length === 1) {
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
      } else {
        normalRoundTrips.push({
          reservation_id: resId,
          customer_name: customer.customer_name,
          status: customer.re_status,
          row1: { sht_category: row1.sht_category, price: row1.car_total_price },
          row2: { sht_category: row2.sht_category, price: row2.car_total_price }
        });
      }
    } else {
      multipleRows.push({
        reservation_id: resId,
        customer_name: customer.customer_name,
        status: customer.re_status,
        rowCount: rows.length,
        rows: rows.map(r => ({ id: r.id, category: r.sht_category, price: r.car_total_price }))
      });
    }
  }

  // Generate Markdown report
  let report = `# SHT 차량 예약 데이터 점검 보고서\n\n`;
  report += `* 생성 시간: ${new Date().toLocaleString('ko-KR')}\n`;
  report += `* 전체 예약 건수 (SHT 차량): ${Object.keys(grouped).length} 건\n\n`;

  report += `## 요약\n`;
  report += `1. **편도(왕복 아님) 예약 (데이터가 1개만 존재)**: ${notRoundTrips.length} 건\n`;
  report += `2. **왕복 예약 중 양쪽(픽업/드롭)에 모두 가격이 입력된 건**: ${roundTripsBothPrices.length} 건\n`;
  report += `3. **정상 왕복 예약 (한쪽에만 가격이 입력되거나 합산 관리되는 건 등)**: ${normalRoundTrips.length} 건\n`;
  if (multipleRows.length > 0) {
    report += `4. **이상 데이터 (3개 이상의 행 존재)**: ${multipleRows.length} 건\n`;
  }
  report += `\n---\n\n`;

  report += `## 1. 편도(왕복 아님) 예약 리스트 (${notRoundTrips.length} 건)\n`;
  if (notRoundTrips.length === 0) {
    report += `* 편도 예약 건이 없습니다.\n`;
  } else {
    report += `| 예약 ID | 고객명 | 연락처 | 상태 | 구분 | 날짜 | 출발지 | 도착지 | 차량 총 가격 | 단가 |\n`;
    report += `|---|---|---|---|---|---|---|---|---|---|\n`;
    for (const item of notRoundTrips) {
      report += `| \`${item.reservation_id}\` | ${item.customer_name} | ${item.customer_phone || '-'} | ${item.status} | ${item.sht_category} | ${item.pickup_datetime || '-'} | ${item.pickup_location || '-'} | ${item.dropoff_location || '-'} | ${item.car_total_price || 0} | ${item.unit_price || 0} |\n`;
    }
  }
  report += `\n---\n\n`;

  report += `## 2. 왕복 예약 중 양쪽(픽업/드롭)에 모두 가격이 입력된 리스트 (${roundTripsBothPrices.length} 건)\n`;
  if (roundTripsBothPrices.length === 0) {
    report += `* 해당 데이터가 없습니다.\n`;
  } else {
    for (const item of roundTripsBothPrices) {
      report += `### 예약 ID: \`${item.reservation_id}\` (고객명: ${item.customer_name}, 상태: ${item.status})\n`;
      report += `* **행 1 (${item.row1.sht_category})**: ID \`${item.row1.id}\`, 날짜: ${item.row1.pickup_datetime || '-'}, 출발: ${item.row1.pickup_location || '-'}, 도착: ${item.row1.dropoff_location || '-'}, 가격: **${item.row1.car_total_price}**\n`;
      report += `* **행 2 (${item.row2.sht_category})**: ID \`${item.row2.id}\`, 날짜: ${item.row2.pickup_datetime || '-'}, 출발: ${item.row2.pickup_location || '-'}, 도착: ${item.row2.dropoff_location || '-'}, 가격: **${item.row2.car_total_price}**\n\n`;
    }
  }

  if (multipleRows.length > 0) {
    report += `\n---\n\n## 3. 이상 데이터 (3개 이상의 행 존재) 리스트 (${multipleRows.length} 건)\n`;
    for (const item of multipleRows) {
      report += `### 예약 ID: \`${item.reservation_id}\` (고객명: ${item.customer_name}, 상태: ${item.status}, 행 개수: ${item.rowCount})\n`;
      for (const row of item.rows) {
        report += `* 행 ID: \`${row.id}\`, 구분: ${row.category}, 가격: ${row.price}\n`;
      }
      report += `\n`;
    }
  }

  const outputPath = path.join(__dirname, 'check-results-report.md');
  fs.writeFileSync(outputPath, report, 'utf8');
  console.log(`Report generated successfully at: ${outputPath}`);
}

run().catch(console.error);
