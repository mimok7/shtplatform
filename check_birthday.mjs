// 수동 추가요금 확인 스크립트
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://jkhookaflhibrcafmlxn.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpraG9va2FmbGhpYnJjYWZtbHhuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTgzMjgzMCwiZXhwIjoyMDY3NDA4ODMwfQ.KmBE7PA-ns2_HLbq8rhZe-hOeRlKoZ_phawRCvtGPSE'
);

const { data: res } = await supabase
  .from('reservation')
  .select('re_id, total_amount, manual_additional_fee, manual_additional_fee_detail, price_breakdown')
  .eq('re_id', '380b5381-3852-49a1-b187-9179365426a1')
  .single();

console.log('reservation:');
console.log('  total_amount:', res?.total_amount);
console.log('  manual_additional_fee:', res?.manual_additional_fee);
console.log('  manual_additional_fee_detail:', JSON.stringify(res?.manual_additional_fee_detail, null, 2));
console.log('  price_breakdown.additional_fee:', res?.price_breakdown?.additional_fee);
console.log('  price_breakdown.additional_fee_items:', JSON.stringify(res?.price_breakdown?.additional_fee_items, null, 2));
console.log('  price_breakdown.grand_total:', res?.price_breakdown?.grand_total);
