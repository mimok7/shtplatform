#!/usr/bin/env node
'use strict';

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const isApply = process.argv.includes('--apply');

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Environment variables required:');
  console.error('   NEXT_PUBLIC_SUPABASE_URL');
  console.error('   SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function isPickupCategory(raw) {
  const v = String(raw || '').toLowerCase().replace(/\s+/g, '');
  if (!v) return true;
  if (v.includes('drop') || v.includes('샌딩') || v.includes('sending') || v.includes('send')) return false;
  return true;
}

function splitSeatNumbers(seatText) {
  const raw = String(seatText || '').trim();
  if (!raw) return [];
  if (raw.toUpperCase() === 'ALL') {
    return ['ALL_1', 'ALL_2', 'ALL_3', 'ALL_4', 'ALL_5', 'ALL_6', 'ALL_7', 'ALL_8', 'ALL_9', 'ALL_10', 'ALL_11'];
  }

  return raw
    .split(/[,/\s]+/)
    .map((v) => v.trim().toUpperCase())
    .filter(Boolean);
}

function parseBodyField(message, field) {
  const m = String(message || '').match(new RegExp(`${field}\\s*:\\s*([^|\\n]+)`, 'i'));
  return (m?.[1] || '').trim();
}

function fallbackNameFromEmail(email) {
  const value = String(email || '').trim();
  if (!value.includes('@')) return '-';
  return value.split('@')[0] || '-';
}

function buildBody(data) {
  const seats = data.seatList.slice(0, 8).join(', ');
  const seatSuffix = data.seatList.length > 8 ? ' 외' : '';
  const bookerNames = data.bookers.map((b) => b.name).filter(Boolean);
  const previewBookers = bookerNames.slice(0, 3).join(', ');
  const bookerExtra = bookerNames.length > 3 ? ` 외 ${bookerNames.length - 3}건` : '';
  const previewEmails = data.emails.slice(0, 3).join(', ');
  const emailExtra = data.emails.length > 3 ? ` 외 ${data.emails.length - 3}건` : '';

  return [
    `픽업일: ${data.pickupDate}`,
    `차량: ${data.vehicleNumber}`,
    `좌석: ${data.seatCount}석 (${seats}${seatSuffix})`,
    `예약자: ${previewBookers || '-'}${bookerExtra}`,
    `예약자 이메일: ${previewEmails || '-'}${emailExtra}`,
  ].join(' | ');
}

async function fetchCancelNotifications() {
  const pageSize = 1000;
  let from = 0;
  const rows = [];

  while (true) {
    const { data, error } = await supabase
      .from('notifications')
      .select('id, title, subcategory, message, metadata, target_id, target_table, created_at')
      .or('title.eq.스하차량 취소 위험 알림,subcategory.eq.스하차량 취소 알림')
      .order('created_at', { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) throw error;

    if (!data || data.length === 0) break;
    rows.push(...data);

    if (data.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

async function backfill() {
  console.log('🔧 Backfill: sht-car cancel notifications');
  console.log(`Mode: ${isApply ? 'APPLY' : 'DRY-RUN'}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const notifications = await fetchCancelNotifications();
  console.log(`대상 알림 수: ${notifications.length}`);

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const n of notifications) {
    try {
      const metadata = n.metadata || {};
      const pickupDate = metadata.pickupDate || parseBodyField(n.message, '픽업일');
      const vehicleNumber = metadata.vehicleNumber || parseBodyField(n.message, '차량');

      if (!pickupDate || !vehicleNumber) {
        skipped += 1;
        continue;
      }

      const { data: seatRows, error: seatError } = await supabase
        .from('reservation_car_sht')
        .select('reservation_id, seat_number, pickup_datetime, vehicle_number, sht_category')
        .eq('pickup_datetime', pickupDate)
        .eq('vehicle_number', vehicleNumber);

      if (seatError) throw seatError;

      const filteredRows = (seatRows || []).filter((r) => isPickupCategory(r.sht_category));
      const reservationIds = Array.from(new Set(filteredRows.map((r) => r.reservation_id).filter(Boolean)));

      const seatSet = new Set();
      for (const row of filteredRows) {
        for (const seat of splitSeatNumbers(row.seat_number)) {
          seatSet.add(seat);
        }
      }

      let reUserRows = [];
      if (reservationIds.length > 0) {
        const { data: reservationRows, error: reservationError } = await supabase
          .from('reservation')
          .select('re_id, re_user_id')
          .in('re_id', reservationIds);
        if (reservationError) throw reservationError;
        reUserRows = reservationRows || [];
      }

      const userIds = Array.from(new Set(reUserRows.map((r) => r.re_user_id).filter(Boolean)));

      const userById = new Map();
      if (userIds.length > 0) {
        const { data: usersById, error: usersByIdError } = await supabase
          .from('users')
          .select('id, name, email')
          .in('id', userIds);

        if (usersByIdError) throw usersByIdError;
        for (const u of usersById || []) {
          userById.set(u.id, { name: String(u.name || '').trim(), email: String(u.email || '').trim() });
        }
      }

      const oldEmails = Array.isArray(metadata.emails)
        ? metadata.emails.map((e) => String(e).trim()).filter(Boolean)
        : [];

      const allEmails = Array.from(new Set([
        ...oldEmails,
        ...Array.from(userById.values()).map((u) => u.email).filter(Boolean),
      ]));

      const usersByEmail = new Map();
      if (allEmails.length > 0) {
        const { data: emailRows, error: emailError } = await supabase
          .from('users')
          .select('email, name')
          .in('email', allEmails);

        if (emailError) throw emailError;
        for (const row of emailRows || []) {
          const email = String(row.email || '').trim();
          if (!email) continue;
          usersByEmail.set(email, String(row.name || '').trim());
        }
      }

      const bookers = [];
      const seen = new Set();

      for (const r of reUserRows) {
        const user = userById.get(r.re_user_id);
        if (!user || !user.email) continue;
        const name = user.name || usersByEmail.get(user.email) || fallbackNameFromEmail(user.email);
        const key = `${name}::${user.email}`;
        if (seen.has(key)) continue;
        seen.add(key);
        bookers.push({ name, email: user.email });
      }

      for (const email of allEmails) {
        const name = usersByEmail.get(email) || fallbackNameFromEmail(email);
        const key = `${name}::${email}`;
        if (seen.has(key)) continue;
        seen.add(key);
        bookers.push({ name, email });
      }

      const newMetadata = {
        ...metadata,
        eventKey: 'sht_car_cancel',
        pickupDate,
        vehicleNumber,
        seatCount: seatSet.size,
        seatList: Array.from(seatSet).sort(),
        reservationIds,
        emails: allEmails,
        bookers,
      };

      const newMessage = buildBody({
        pickupDate,
        vehicleNumber,
        seatCount: seatSet.size,
        seatList: Array.from(seatSet).sort(),
        reservationIds,
        emails: allEmails,
        bookers,
      });

      if (isApply) {
        const { error: updateError } = await supabase
          .from('notifications')
          .update({
            metadata: newMetadata,
            message: newMessage,
            target_table: 'reservation_car_sht',
            target_id: `${pickupDate}:${vehicleNumber}`,
            updated_at: new Date().toISOString(),
          })
          .eq('id', n.id);

        if (updateError) throw updateError;
      }

      updated += 1;
    } catch (err) {
      failed += 1;
      console.error(`❌ 실패 (${n.id}):`, err.message || err);
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`완료: updated=${updated}, skipped=${skipped}, failed=${failed}, mode=${isApply ? 'APPLY' : 'DRY-RUN'}`);
  console.log("실제 반영하려면: node scripts/backfill-sht-car-cancel-notifications.js --apply");
}

backfill().catch((err) => {
  console.error('❌ Backfill error:', err.message || err);
  process.exit(1);
});
