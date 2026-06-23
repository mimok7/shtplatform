const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://jkhookaflhibrcafmlxn.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpraG9va2FmbGhpYnJjYWZtbHhuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTgzMjgzMCwiZXhwIjoyMDY3NDA4ODMwfQ.KmBE7PA-ns2_HLbq8rhZe-hOeRlKoZ_phawRCvtGPSE';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function insertTicketPriceData() {
  console.log('🚀 Inserting ticket_price data...\n');

  const data = [
    {
      ticket_price_code: 'DPC_ADULT',
      ticket_type: 'dragon',
      ticket_name: '드래곤펄 케이브',
      price_item: 'adult',
      official_price_vnd: 1450000,
      stay_card_price_vnd: 1350000,
      stay_krw_price_krw: 1300000,
      sort_order: 1,
      valid_from: '2026-06-19',
      notes: '성인 1인당 요금',
      is_active: true
    },
    {
      ticket_price_code: 'DPC_CHILD',
      ticket_type: 'dragon',
      ticket_name: '드래곤펄 케이브',
      price_item: 'child_under_1_2m',
      official_price_vnd: 365000,
      stay_card_price_vnd: 350000,
      stay_krw_price_krw: 330000,
      sort_order: 2,
      valid_from: '2026-06-19',
      notes: '아동 (신장 1.2m 미만)',
      is_active: true
    },
    {
      ticket_price_code: 'DPC_SHUTTLE',
      ticket_type: 'dragon',
      ticket_name: '드래곤펄 케이브 셔틀',
      price_item: 'shuttle',
      official_price_vnd: 330000,
      stay_card_price_vnd: 300000,
      stay_krw_price_krw: 250000,
      sort_order: 3,
      valid_from: '2026-06-19',
      notes: '하롱국제크루즈 선착장-드래곤펄 케이브 셔틀 차량',
      is_active: true
    }
  ];

  try {
    const { data: insertedData, error } = await supabase
      .from('ticket_price')
      .upsert(data, { onConflict: 'ticket_price_code' });

    if (error) {
      console.error('❌ Error:', error.message);
      return;
    }

    console.log('✅ Data inserted successfully!');
    console.log(`📊 ${insertedData.length} records inserted/updated\n`);

    // Verify
    const { data: verifyData } = await supabase
      .from('ticket_price')
      .select('*')
      .eq('is_active', true);

    console.log(`✓ Verification: ${verifyData.length} active records found`);
    verifyData.forEach(row => {
      console.log(`  - ${row.ticket_price_code}: ${row.ticket_name} (${row.price_item})`);
    });

  } catch (err) {
    console.error('❌ Fatal error:', err.message);
  }
}

insertTicketPriceData();
