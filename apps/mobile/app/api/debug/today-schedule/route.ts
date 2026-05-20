import { NextResponse } from 'next/server';
import supabase from '@/lib/supabase';

// KST 기준 오늘의 날짜 (YYYY-MM-DD)
const getKstTodayString = (): string => {
  const now = new Date();
  // shift to KST by adding 9 hours
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getFullYear();
  const m = String(kst.getMonth() + 1).padStart(2, '0');
  const d = String(kst.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

// Convert KST date (YYYY-MM-DD) to UTC range for timestamp comparisons
const kstDateToUtcRange = (kstDate: string) => {
  const [y, m, d] = kstDate.split('-').map(Number);
  // KST midnight in UTC = YYYY-MM-DDT00:00:00 KST -> UTC = -9h
  const startKst = Date.UTC(y, m - 1, d, 0, 0, 0);
  const startUtcMs = startKst - 9 * 60 * 60 * 1000;
  const endUtcMs = startUtcMs + 24 * 60 * 60 * 1000 - 1;
  return { startIso: new Date(startUtcMs).toISOString(), endIso: new Date(endUtcMs).toISOString() };
};

export async function GET() {
  try {
    const todayKst = getKstTodayString();
    const { startIso, endIso } = kstDateToUtcRange(todayKst);

    // date type comparisons (direct equality) and timestamp-range comparisons
    const [
      { data: cruiseRows },
      { data: cruiseCarRows },
      { data: airportRows },
      { data: hotelRows },
      { data: tourRows },
      { data: ticketRows },
      { data: rentcarRows }
    ] = await Promise.all([
      supabase.from('reservation_cruise').select('*').eq('checkin', todayKst),
      supabase.from('reservation_cruise_car').select('*').gte('pickup_datetime', startIso).lte('pickup_datetime', endIso),
      supabase.from('reservation_airport').select('*').gte('ra_datetime', startIso).lte('ra_datetime', endIso),
      supabase.from('reservation_hotel').select('*').eq('checkin_date', todayKst),
      supabase.from('reservation_tour').select('*').eq('usage_date', todayKst),
      supabase.from('reservation_ticket').select('*').eq('usage_date', todayKst),
      supabase.from('reservation_rentcar').select('*').gte('pickup_datetime', startIso).lte('pickup_datetime', endIso),
    ]);

    // Build a flat list of service entries with reservation id and type
    const entries: any[] = [];
    (cruiseRows || []).forEach((r: any) => entries.push({ service: 'cruise', reservation_id: r.reservation_id, id: r.id, date: r.checkin }));
    (cruiseCarRows || []).forEach((r: any) => entries.push({ service: 'cruise_car', reservation_id: r.reservation_id, id: r.id, date: r.pickup_datetime }));
    (airportRows || []).forEach((r: any) => entries.push({ service: 'airport', reservation_id: r.reservation_id, id: r.id, date: r.ra_datetime }));
    (hotelRows || []).forEach((r: any) => entries.push({ service: 'hotel', reservation_id: r.reservation_id, id: r.id, date: r.checkin_date }));
    (tourRows || []).forEach((r: any) => entries.push({ service: 'tour', reservation_id: r.reservation_id, id: r.id, date: r.usage_date }));
    (ticketRows || []).forEach((r: any) => entries.push({ service: 'ticket', reservation_id: r.reservation_id, id: r.id, date: r.usage_date }));
    (rentcarRows || []).forEach((r: any) => entries.push({ service: 'rentcar', reservation_id: r.reservation_id, id: r.id, date: r.pickup_datetime, return_datetime: r.return_datetime }));

    // Unique reservation IDs represented among today's services
    const reservationIdSet = new Set(entries.map(e => e.reservation_id).filter(Boolean));

    return NextResponse.json({
      todayKst,
      startIso,
      endIso,
      totalEntries: entries.length,
      uniqueReservations: Array.from(reservationIdSet),
      entries,
    });
  } catch (err: any) {
    console.error('DEBUG API error', err);
    return NextResponse.json({ error: String(err.message || err) }, { status: 500 });
  }
}
