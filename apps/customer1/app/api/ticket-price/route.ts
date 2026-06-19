import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
);

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('ticket_price')
      .select('ticket_price_code,ticket_type,ticket_name,price_item,official_price_vnd,stay_card_price_vnd,stay_krw_price_krw,valid_from,valid_to,sort_order')
      .eq('is_active', true)
      .order('ticket_type', { ascending: true })
      .order('sort_order', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('Error in ticket-price API:', error);
    return NextResponse.json({ error: 'Failed to fetch ticket prices' }, { status: 500 });
  }
}
