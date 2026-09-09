/*
 * 운영 중인 공개 크루즈·호텔 카탈로그를 홈페이지 수신 API에 작은 단위로 전송한다.
 * 관리자 화면의 전송 버튼과 같은 비밀키를 사용하며, 환경변수 값은 출력하지 않는다.
 */
const fs = require('node:fs');
const { createClient } = require('@supabase/supabase-js');

for (const line of fs.readFileSync('apps/admin/.env.local', 'utf8').split(/\r?\n/)) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
}

const sourceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sourceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const configuredTargetUrl = process.env.HOMEPAGE_SYNC_URL;
const targetUrl = process.env.HOMEPAGE_SYNC_URL_PRODUCTION
  || (configuredTargetUrl && !/localhost|127\.0\.0\.1/i.test(configuredTargetUrl)
    ? configuredTargetUrl
    : 'https://stayhalong.com/api/platform/sync');
const sharedSecret = process.env.HOMEPAGE_SYNC_SECRET;

if (!sourceUrl || !sourceKey || !targetUrl || !sharedSecret) {
  throw new Error('플랫폼 서비스 연결 또는 홈페이지 동기화 환경변수가 설정되지 않았습니다.');
}

const database = createClient(sourceUrl, sourceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const catalogs = [
  'cruise_info', 'cruise_rate_card', 'hotel_info', 'hotel_price',
  'homepage_cruise_content', 'homepage_cruise_itineraries', 'homepage_cruise_tags',
  'homepage_cruise_cabin_overrides', 'homepage_cruise_images', 'homepage_hotel_images',
  'homepage_catalog_product_overrides', 'homepage_catalog_price_overrides',
];
const batchSize = 100;

function sourceId(table, row, index) {
  if (table === 'homepage_cruise_content') return row.cruise_name;
  if (table === 'homepage_cruise_tags') return `${row.cruise_name || ''}:${row.tag || index}`;
  if (table === 'homepage_cruise_cabin_overrides') return `${row.cruise_name || ''}:${row.room_name || index}`;
  if (table === 'homepage_catalog_product_overrides') return `${row.service_type || ''}:${row.source_key || index}`;
  if (table === 'homepage_catalog_price_overrides') return `${row.source_table || ''}:${row.source_id || index}`;
  return row.id || row.option_id || row.pricing_id || row.schedule_id || row.inclusion_id
    || row.hotel_price_code || row.hotel_code || row.tour_id || row.rent_code || index;
}

async function fetchRows(table) {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await database.from(table).select('*').range(offset, offset + 999);
    if (error) throw new Error(`${table} 조회 실패: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < 1000) return rows;
  }
}

async function send(payload) {
  const response = await fetch(targetUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${sharedSecret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok) throw new Error(result.error || `홈페이지 응답 오류 (${response.status})`);
  return result;
}

async function main() {
  const startedAt = new Date().toISOString();
  const counts = {};
  for (const table of catalogs) {
    const rows = await fetchRows(table);
    counts[table] = rows.length;
    for (let offset = 0; offset < rows.length; offset += batchSize) {
      const batch = rows.slice(offset, offset + batchSize).map((row, index) => ({
        ...row,
        __source_id: String(sourceId(table, row, offset + index)),
      }));
      await send({ source: 'sht-platform', trigger: 'manual', syncStartedAt: startedAt, partial: true, catalogs: { [table]: batch } });
    }
  }
  const result = await send({ source: 'sht-platform', trigger: 'manual', syncStartedAt: startedAt, partial: true, finalize: true, catalogs: {} });
  console.log(JSON.stringify({ received: result.received, transformed: result.transformed, cruiseV2: result.cruiseV2, hotelImagesV2: result.hotelImagesV2, counts }));
}

main().catch((error) => {
  console.error(error.cause?.message || error.message || error);
  process.exitCode = 1;
});
