const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const ACTIVE_USAGE_STATUSES = ['reserved', 'confirmed'];
const EXCLUDED_RESERVATION_STATUSES = new Set(['cancelled', 'completed']);

const TARGET_PROMOTIONS = [
  {
    code: 'GP-VOUCHER-2026-100TEAMS',
    label: '그랜드 파이어니스 바우처 프로모션',
  },
  {
    code: 'LYRA-GRANZER-1N2D-VOUCHER-2026-30',
    label: '라이라 그랜져 1박2일 바우처 프로모션',
  },
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseEnvFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const env = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = line.slice(0, eqIdx).trim();
    const value = line.slice(eqIdx + 1).trim();
    env[key] = value;
  }
  return env;
}

function toDateOnly(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function inDateRange(target, from, to) {
  if (!target) return false;
  if (from && target < from) return false;
  if (to && target > to) return false;
  return true;
}

function keyForRate(scheduleType, roomType) {
  return `${String(scheduleType || '').trim()}||${String(roomType || '').trim()}`;
}

async function fetchPromotionRates(supabase, promotionId) {
  const { data, error } = await supabase
    .from('cruise_promotion_rate')
    .select('schedule_type, room_type, checkin_from, checkin_to')
    .eq('promotion_id', promotionId);

  if (error) throw error;

  const index = new Map();
  for (const row of data || []) {
    const key = keyForRate(row.schedule_type, row.room_type);
    const item = {
      scheduleType: String(row.schedule_type || '').trim(),
      roomType: String(row.room_type || '').trim(),
      checkinFrom: toDateOnly(row.checkin_from),
      checkinTo: toDateOnly(row.checkin_to),
    };
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(item);
  }
  return index;
}

async function fetchExistingUsageByReservation(supabase, promotionId, reservationIds) {
  if (!reservationIds.length) return new Set();
  const { data, error } = await supabase
    .from('cruise_promotion_usage')
    .select('reservation_id')
    .eq('promotion_id', promotionId)
    .in('status', ACTIVE_USAGE_STATUSES)
    .in('reservation_id', reservationIds);

  if (error) throw error;

  return new Set((data || []).map((row) => String(row.reservation_id || '').trim()).filter(Boolean));
}

async function findCandidates(supabase, promo) {
  const promoBookingFrom = toDateOnly(promo.booking_from);
  const promoBookingTo = toDateOnly(promo.booking_to);
  const promoCheckinFrom = toDateOnly(promo.checkin_from);
  const promoCheckinTo = toDateOnly(promo.checkin_to);

  const rateIndex = await fetchPromotionRates(supabase, promo.id);

  const { data: cruiseRows, error: cruiseError } = await supabase
    .from('reservation_cruise')
    .select('id, reservation_id, room_price_code, checkin, created_at')
    .gte('checkin', promo.checkin_from)
    .lte('checkin', promo.checkin_to);
  if (cruiseError) throw cruiseError;

  const roomPriceCodes = Array.from(
    new Set(
      (cruiseRows || [])
        .map((r) => String(r.room_price_code || '').trim())
        .filter((v) => UUID_RE.test(v))
    )
  );
  const reservationIds = Array.from(new Set((cruiseRows || []).map((r) => String(r.reservation_id || '').trim()).filter(Boolean)));

  const [{ data: rateCards, error: rateError }, { data: reservations, error: reservationError }] = await Promise.all([
    roomPriceCodes.length
      ? supabase
          .from('cruise_rate_card')
          .select('id, cruise_name, schedule_type, room_type, is_active, valid_year, valid_from, valid_to')
          .in('id', roomPriceCodes)
      : Promise.resolve({ data: [], error: null }),
    reservationIds.length
      ? supabase
          .from('reservation')
          .select('re_id, re_status, re_created_at, re_user_id, re_type')
          .in('re_id', reservationIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (rateError) throw rateError;
  if (reservationError) throw reservationError;

  const rateCardMap = new Map((rateCards || []).map((row) => [String(row.id || '').trim(), row]));
  const reservationMap = new Map((reservations || []).map((row) => [String(row.re_id || '').trim(), row]));

  const filtered = [];

  for (const rc of cruiseRows || []) {
    const reservationId = String(rc.reservation_id || '').trim();
    const roomCode = String(rc.room_price_code || '').trim();
    const checkinDate = toDateOnly(rc.checkin);
    if (!reservationId || !roomCode || !checkinDate) continue;
    if (!UUID_RE.test(roomCode)) continue;

    const reservation = reservationMap.get(reservationId);
    if (!reservation) continue;
    if (String(reservation.re_type || '').trim() !== 'cruise') continue;

    const status = String(reservation.re_status || '').toLowerCase();
    if (EXCLUDED_RESERVATION_STATUSES.has(status)) continue;

    const bookingDate = toDateOnly(reservation.re_created_at);
    if (!inDateRange(bookingDate, promoBookingFrom, promoBookingTo)) continue;
    if (!inDateRange(checkinDate, promoCheckinFrom, promoCheckinTo)) continue;

    const rateCard = rateCardMap.get(roomCode);
    if (!rateCard) continue;
    if (rateCard.is_active === false) continue;
    if (String(rateCard.cruise_name || '').trim() !== String(promo.cruise_name || '').trim()) continue;

    const validFrom = toDateOnly(rateCard.valid_from);
    const validTo = toDateOnly(rateCard.valid_to);
    if (validFrom || validTo) {
      if (!inDateRange(checkinDate, validFrom, validTo)) continue;
    }

    const rateKey = keyForRate(rateCard.schedule_type, rateCard.room_type);
    const rateWindows = rateIndex.get(rateKey) || [];
    const matchedWindow = rateWindows.some((w) => inDateRange(checkinDate, w.checkinFrom, w.checkinTo));
    if (!matchedWindow) continue;

    filtered.push({
      reservationId,
      reservationCruiseId: String(rc.id || '').trim() || null,
      userId: String(reservation.re_user_id || '').trim() || null,
      reStatus: status,
      bookingDate: reservation.re_created_at,
      checkin: rc.checkin,
      roomPriceCode: roomCode,
      scheduleType: String(rateCard.schedule_type || '').trim(),
      roomType: String(rateCard.room_type || '').trim(),
      cruiseName: String(rateCard.cruise_name || '').trim(),
    });
  }

  const existingUsage = await fetchExistingUsageByReservation(
    supabase,
    promo.id,
    filtered.map((r) => r.reservationId)
  );

  const candidates = filtered
    .filter((r) => !existingUsage.has(r.reservationId))
    .sort((a, b) => new Date(a.bookingDate).getTime() - new Date(b.bookingDate).getTime());

  return {
    candidates,
    alreadyAppliedCount: filtered.length - candidates.length,
    totalMatched: filtered.length,
  };
}

async function countUsed(supabase, promotionId) {
  const { count, error } = await supabase
    .from('cruise_promotion_usage')
    .select('id', { count: 'exact', head: true })
    .eq('promotion_id', promotionId)
    .in('status', ACTIVE_USAGE_STATUSES);
  if (error) throw error;
  return Number(count || 0);
}

async function applyPromotion(supabase, promo, candidates) {
  const usedBefore = await countUsed(supabase, promo.id);
  const quotaTotal = Number(promo.quota_total || 0);
  const remaining = Math.max(quotaTotal - usedBefore, 0);
  const toApply = candidates.slice(0, remaining);

  let inserted = 0;
  let skippedDuplicates = 0;
  const errors = [];

  for (const row of toApply) {
    const payload = {
      promotion_id: promo.id,
      reservation_id: row.reservationId,
      reservation_cruise_id: row.reservationCruiseId,
      user_id: row.userId,
      status: 'confirmed',
      metadata: {
        source: 'script:check-and-apply-cruise-promotions',
        promotion_code: promo.code,
        applied_at: new Date().toISOString(),
      },
    };

    const { error } = await supabase.from('cruise_promotion_usage').insert(payload);
    if (error) {
      if (error.code === '23505') {
        skippedDuplicates += 1;
        continue;
      }
      errors.push({ reservationId: row.reservationId, message: error.message, code: error.code || null });
      continue;
    }
    inserted += 1;
  }

  const usedAfter = await countUsed(supabase, promo.id);

  return {
    usedBefore,
    usedAfter,
    quotaTotal,
    remainingBefore: Math.max(quotaTotal - usedBefore, 0),
    remainingAfter: Math.max(quotaTotal - usedAfter, 0),
    attempted: toApply.length,
    inserted,
    skippedDuplicates,
    errors,
  };
}

async function main() {
  const envPath = path.join(process.cwd(), 'apps', 'manager1', '.env.local');
  if (!fs.existsSync(envPath)) {
    throw new Error(`env file not found: ${envPath}`);
  }

  const env = parseEnvFile(envPath);
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in apps/manager1/.env.local');
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const codes = TARGET_PROMOTIONS.map((p) => p.code);
  const { data: promos, error: promoError } = await supabase
    .from('cruise_promotion')
    .select('id, code, name, cruise_name, booking_from, booking_to, checkin_from, checkin_to, quota_total, is_active')
    .in('code', codes)
    .eq('is_active', true);

  if (promoError) throw promoError;

  const promoMap = new Map((promos || []).map((p) => [p.code, p]));

  const report = [];

  for (const target of TARGET_PROMOTIONS) {
    const promo = promoMap.get(target.code);
    if (!promo) {
      report.push({
        code: target.code,
        label: target.label,
        found: false,
      });
      continue;
    }

    const scan = await findCandidates(supabase, promo);
    const apply = await applyPromotion(supabase, promo, scan.candidates);

    report.push({
      code: target.code,
      label: target.label,
      found: true,
      promotion: promo,
      scan,
      apply,
      sampleCandidates: scan.candidates.slice(0, 20),
    });
  }

  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), report }, null, 2));
}

main().catch((err) => {
  console.error('[check-and-apply-cruise-promotions] failed:', err?.message || err);
  process.exit(1);
});
