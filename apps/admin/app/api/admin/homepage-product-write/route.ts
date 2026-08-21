import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import serviceSupabase from '@/lib/serviceSupabase';
import { pushHomepageCatalog } from '@/lib/homepageSync';

export const dynamic = 'force-dynamic';

type Values = Record<string, unknown>;
type Source = Record<string, string | null | undefined>;

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function number(value: unknown) {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

async function operator(request: NextRequest) {
  if (!serviceSupabase) return null;
  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return null;
  const { data: auth } = await serviceSupabase.auth.getUser(token);
  if (!auth.user) return null;
  const { data } = await serviceSupabase.from('users').select('role').eq('id', auth.user.id).maybeSingle();
  return data?.role === 'admin' || data?.role === 'manager' ? { id: auth.user.id, role: data.role } : null;
}

async function syncHomepage() {
  try {
    return { synced: true, syncResult: await pushHomepageCatalog('manual') };
  } catch (error: unknown) {
    const message = errorMessage(error, '홈페이지 동기화에 실패했습니다.');
    // eslint-disable-next-line no-console
    console.error('[homepage-product-write] sync failed', message);
    return { synced: false, syncWarning: message };
  }
}

async function mergeOverride(table: string, keys: Values, values: Values) {
  if (!serviceSupabase) throw new Error('플랫폼 DB 연결 정보가 없습니다.');
  let query = serviceSupabase.from(table).select('values');
  for (const [key, value] of Object.entries(keys)) query = query.eq(key, value);
  const { data: current, error: readError } = await query.maybeSingle();
  if (readError) throw readError;
  const row = { ...keys, values: { ...((current?.values as Values) || {}), ...values }, updated_at: new Date().toISOString() };
  const { error } = await serviceSupabase.from(table).upsert(row);
  if (error) throw error;
}

async function updateCruise(source: Source, values: Values) {
  if (!serviceSupabase || !source.cruiseName) throw new Error('크루즈 원본을 확인해 주세요.');
  const content = {
    cruise_name: source.cruiseName,
    name_ko: text(values.name_ko) || source.cruiseName,
    name_en: text(values.name_en),
    description: text(values.description),
    category: text(values.category),
    star_rating: number(values.star_rating),
    hero_image: text(values.hero_image),
    is_active: Boolean(values.is_active),
    updated_at: new Date().toISOString(),
  };
  const coreUpdates: Values = { updated_at: content.updated_at };
  if (Object.hasOwn(values, 'name_en') && content.name_en) coreUpdates.name = content.name_en;
  if (Object.hasOwn(values, 'description')) coreUpdates.description = content.description;
  if (Object.hasOwn(values, 'category')) coreUpdates.category = content.category;
  if (Object.hasOwn(values, 'star_rating')) coreUpdates.star_rating = content.star_rating;
  if (Object.hasOwn(values, 'hero_image')) coreUpdates.cruise_image = content.hero_image;
  const [contentResult, coreResult] = await Promise.all([
    serviceSupabase.from('homepage_cruise_content').upsert(content, { onConflict: 'cruise_name' }),
    serviceSupabase.from('cruise_info').update(coreUpdates).eq('cruise_name', source.cruiseName),
  ]);
  if (contentResult.error || coreResult.error) throw contentResult.error || coreResult.error;
}

async function updateCabin(source: Source, values: Values) {
  if (!serviceSupabase || !source.cruiseName || !source.roomName) throw new Error('객실 원본을 확인해 주세요.');
  await mergeOverride('homepage_cruise_cabin_overrides', { cruise_name: source.cruiseName, room_name: source.roomName }, values);
  const updates: Values = {
    room_image: text(values.image_url), room_area: text(values.room_area_text),
    bed_type: text(values.bed_type), max_adults: number(values.max_adults), max_guests: number(values.max_guests),
    has_balcony: Boolean(values.has_balcony), is_vip: Boolean(values.is_vip), has_butler: Boolean(values.has_butler),
    is_recommended: Boolean(values.is_recommended), connecting_available: Boolean(values.connecting_available),
    extra_bed_available: Boolean(values.extra_bed_available), facilities: text(values.facilities),
    special_amenities: text(values.special_amenities), updated_at: new Date().toISOString(),
  };
  const { error } = await serviceSupabase.from('cruise_info').update(updates).eq('cruise_name', source.cruiseName).eq('room_name', source.roomName);
  if (error) throw error;
}

async function createCabin(source: Source, values: Values) {
  if (!serviceSupabase || !source.cruiseName) throw new Error('크루즈 원본을 확인해 주세요.');
  const { data: template, error: readError } = await serviceSupabase.from('cruise_info').select('*').eq('cruise_name', source.cruiseName).limit(1).single();
  if (readError || !template) throw readError || new Error('복사할 크루즈 원본이 없습니다.');
  const row: Values = { ...template };
  for (const key of ['id', 'created_at', 'updated_at']) delete row[key];
  row.cruise_code = `WEB-${randomUUID().slice(0, 12).toUpperCase()}`;
  row.room_name = text(values.name_ko);
  row.room_image = null;
  row.room_images = [];
  row.max_adults = number(values.max_adults);
  row.max_guests = number(values.max_guests);
  row.created_at = new Date().toISOString();
  row.updated_at = row.created_at;
  const { error } = await serviceSupabase.from('cruise_info').insert(row);
  if (error) throw error;
  await mergeOverride('homepage_cruise_cabin_overrides', { cruise_name: source.cruiseName, room_name: row.room_name }, values);
}

async function createRateOnlyCruise(source: Source, values: Values) {
  if (!serviceSupabase || !source.cruiseName) throw new Error('크루즈 원본을 확인해 주세요.');
  const { data: existing, error: readError } = await serviceSupabase.from('cruise_info').select('id').eq('cruise_name', source.cruiseName).limit(1);
  if (readError) throw readError;
  if (!existing?.length) {
    const { error } = await serviceSupabase.from('cruise_info').insert({
      cruise_code: `WEB-${randomUUID().slice(0, 12).toUpperCase()}`,
      name: source.cruiseName,
      cruise_name: source.cruiseName,
      room_name: '객실 정보 입력 필요',
      max_adults: 2,
      max_guests: 2,
      cruise_images: [],
      room_images: [],
    });
    if (error) throw error;
  }
  await updateCruise(source, { ...values, name_ko: source.cruiseName, is_active: false });
  await mergeOverride('homepage_cruise_cabin_overrides', { cruise_name: source.cruiseName, room_name: '객실 정보 입력 필요' }, { is_active: false });
}

function rangeDates(value: unknown) {
  const match = String(value || '').match(/^\[(\d{4}-\d{2}-\d{2}),(\d{4}-\d{2}-\d{2})\)$/);
  if (!match) return {};
  const end = new Date(`${match[2]}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() - 1);
  return { valid_from: match[1], valid_to: end.toISOString().slice(0, 10) };
}

async function updateRate(source: Source, values: Values) {
  if (!serviceSupabase || !source.sourceId) throw new Error('요금 원본을 확인해 주세요.');
  const updates = {
    ...rangeDates(values.valid_during), price_adult: number(values.price_adult), price_child: number(values.price_child),
    price_infant: number(values.price_infant), price_single: number(values.price_single), price_extra_bed: number(values.price_extra_bed),
    season_name: text(values.season_name), single_available: Boolean(values.single_available),
    extra_bed_available: Boolean(values.extra_bed_available), is_active: Boolean(values.is_active), updated_at: new Date().toISOString(),
  };
  const { error } = await serviceSupabase.from('cruise_rate_card').update(updates).eq('id', source.sourceId);
  if (error) throw error;
}

async function updateCatalogProduct(source: Source, values: Values) {
  if (!serviceSupabase || !source.serviceType || !source.sourceKey) throw new Error('상품 원본을 확인해 주세요.');
  await mergeOverride('homepage_catalog_product_overrides', { service_type: source.serviceType, source_key: source.sourceKey }, values);
  const now = new Date().toISOString();
  let result: { error: { message: string } | null } | null = null;
  if (source.serviceType === 'hotel') result = await serviceSupabase.from('hotel_info').update({ hotel_name: text(values.name_ko), active: Boolean(values.is_active), updated_at: now }).eq('hotel_code', source.sourceKey);
  if (source.serviceType === 'tour') result = await serviceSupabase.from('tour').update({ tour_name: text(values.name_ko), description: text(values.description), category: text(values.category), image_url: text(values.image_url), is_active: Boolean(values.is_active), updated_at: now }).eq('tour_id', source.sourceKey);
  if (source.serviceType === 'vehicle') result = await serviceSupabase.from('rentcar_price').update({ description: text(values.description), category: text(values.category), is_active: Boolean(values.is_active), updated_at: now }).eq('rent_code', source.sourceKey);
  if (source.serviceType === 'cruise') await updateCruise({ cruiseName: source.sourceKey }, { ...values, name_ko: values.name_ko || source.sourceKey });
  if (result?.error) throw result.error;
}

async function updateCatalogDetails(source: Source, values: Values) {
  if (!source.serviceType || !source.sourceKey) throw new Error('상품 원본을 확인해 주세요.');
  await mergeOverride('homepage_catalog_product_overrides', { service_type: source.serviceType, source_key: source.sourceKey }, values);
}

async function updateCatalogPrice(source: Source, values: Values) {
  if (!serviceSupabase || !source.sourceTable || !source.sourceId) throw new Error('요금 원본을 확인해 주세요.');
  await mergeOverride('homepage_catalog_price_overrides', { source_table: source.sourceTable, source_id: source.sourceId }, values);
  const table = source.sourceTable;
  const key = table === 'hotel_price' ? 'hotel_price_code' : table === 'tour_pricing' ? 'pricing_id' : 'id';
  const priceColumn = table === 'hotel_price' ? 'base_price' : table === 'tour_pricing' ? 'price_per_person' : table === 'cruise_rate_card' ? 'price_adult' : 'price';
  const allowed = new Set(['hotel_price', 'tour_pricing', 'cruise_rate_card', 'airport_price', 'rentcar_price']);
  if (!allowed.has(table)) return;
  const updates: Values = { [priceColumn]: number(values.price_amount), updated_at: new Date().toISOString() };
  if (table !== 'hotel_price') updates.is_active = Boolean(values.is_active);
  const { error } = await serviceSupabase.from(table).update(updates).eq(key, source.sourceId);
  if (error) throw error;
}

async function updateItinerary(source: Source, values: Values) {
  if (!serviceSupabase || !source.cruiseName || !source.scheduleType) throw new Error('일정 원본을 확인해 주세요.');
  const { error } = await serviceSupabase.from('homepage_cruise_itineraries').upsert({
    cruise_name: source.cruiseName, schedule_type: source.scheduleType, description: text(values.description),
    is_active: Boolean(values.is_active), updated_at: new Date().toISOString(),
  }, { onConflict: 'cruise_name,schedule_type' });
  if (error) throw error;
}

async function updateTag(source: Source, values: Values) {
  if (!serviceSupabase || !source.cruiseName || !text(values.tag) || !text(values.evidence)) throw new Error('추천 태그 원본을 확인해 주세요.');
  const { error } = await serviceSupabase.from('homepage_cruise_tags').upsert({
    cruise_name: source.cruiseName, tag: text(values.tag), evidence: text(values.evidence),
    is_active: Boolean(values.is_active), updated_at: new Date().toISOString(),
  }, { onConflict: 'cruise_name,tag' });
  if (error) throw error;
}

async function refreshCoreImages(cruiseName: string, roomName?: string | null) {
  if (!serviceSupabase) throw new Error('플랫폼 DB 연결 정보가 없습니다.');
  let query = serviceSupabase.from('homepage_cruise_images').select('image_url,is_primary,sort_order').eq('cruise_name', cruiseName);
  query = roomName ? query.eq('room_name', roomName) : query.is('room_name', null);
  const { data, error } = await query.order('is_primary', { ascending: false }).order('sort_order');
  if (error) throw error;
  const urls = [...new Set((data || []).map((row) => row.image_url).filter(Boolean))];
  const updates = roomName ? { room_image: urls[0] || null, room_images: urls } : { cruise_image: urls[0] || null, cruise_images: urls };
  let update = serviceSupabase.from('cruise_info').update({ ...updates, updated_at: new Date().toISOString() }).eq('cruise_name', cruiseName);
  if (roomName) update = update.eq('room_name', roomName);
  const { error: updateError } = await update;
  if (updateError) throw updateError;
  if (!roomName) {
    const { error: contentError } = await serviceSupabase.from('homepage_cruise_content').update({ hero_image: urls[0] || null, updated_at: new Date().toISOString() }).eq('cruise_name', cruiseName);
    if (contentError) throw contentError;
  }
}

async function upsertImage(source: Source, values: Values) {
  if (!serviceSupabase) throw new Error('플랫폼 DB 연결 정보가 없습니다.');
  if (source.serviceType && source.sourceKey) {
    await mergeOverride('homepage_catalog_product_overrides', { service_type: source.serviceType, source_key: source.sourceKey }, { image_url: values.imageUrl });
    return;
  }
  if (!source.cruiseName || !text(values.imageUrl) || !text(values.collection)) throw new Error('이미지 원본을 확인해 주세요.');
  const row = {
    id: text(values.id) || randomUUID(), collection: text(values.collection), cruise_name: source.cruiseName,
    room_name: source.roomName || null, source_url: text(values.sourceUrl), source_image_url: text(values.sourceImageUrl),
    image_name: text(values.imageName), image_url: text(values.imageUrl), storage_bucket: text(values.storageBucket),
    storage_path: text(values.storagePath), sort_order: number(values.sortOrder) || 0, is_primary: Boolean(values.isPrimary),
    updated_at: new Date().toISOString(),
  };
  if (row.is_primary) {
    let clear = serviceSupabase.from('homepage_cruise_images').update({ is_primary: false, updated_at: row.updated_at }).eq('cruise_name', source.cruiseName);
    clear = source.roomName ? clear.eq('room_name', source.roomName) : clear.is('room_name', null);
    const { error } = await clear;
    if (error) throw error;
  }
  const { error } = await serviceSupabase.from('homepage_cruise_images').upsert(row, { onConflict: 'collection,image_url' });
  if (error) throw error;
  if (source.roomName || row.is_primary) await refreshCoreImages(source.cruiseName, source.roomName);
}

async function upsertImages(source: Source, values: Values) {
  if (!serviceSupabase || !source.cruiseName || !Array.isArray(values.images)) throw new Error('가져온 이미지 원본을 확인해 주세요.');
  const rows = values.images.map((item) => item as Values).map((item) => ({
    id: text(item.id) || randomUUID(), collection: text(item.collection) || 'cafe_import', cruise_name: source.cruiseName,
    room_name: text(item.roomName), source_url: text(item.sourceUrl), source_image_url: text(item.sourceImageUrl),
    image_name: text(item.imageName), image_url: text(item.imageUrl), storage_bucket: text(item.storageBucket),
    storage_path: text(item.storagePath), sort_order: number(item.sortOrder) || 0, is_primary: Boolean(item.isPrimary),
    updated_at: new Date().toISOString(),
  })).filter((row) => row.image_url);
  if (!rows.length) return;
  for (const roomName of [...new Set(rows.filter((row) => row.is_primary).map((row) => row.room_name || ''))]) {
    let clear = serviceSupabase.from('homepage_cruise_images').update({ is_primary: false, updated_at: new Date().toISOString() }).eq('cruise_name', source.cruiseName);
    clear = roomName ? clear.eq('room_name', roomName) : clear.is('room_name', null);
    const { error: clearError } = await clear;
    if (clearError) throw clearError;
  }
  const { error } = await serviceSupabase.from('homepage_cruise_images').upsert(rows, { onConflict: 'collection,image_url' });
  if (error) throw error;
  const rooms = [...new Set(rows.filter((row) => row.room_name).map((row) => row.room_name as string))];
  for (const room of rooms) await refreshCoreImages(source.cruiseName, room);
  if (rows.some((row) => !row.room_name && row.is_primary)) await refreshCoreImages(source.cruiseName, null);
}

async function upsertHotelImages(source: Source, values: Values) {
  if (!serviceSupabase || source.serviceType !== 'hotel' || !source.sourceKey || !Array.isArray(values.images)) throw new Error('호텔 이미지 원본을 확인해 주세요.');
  const allowedCollections = new Set(['hotel_import', 'hotel_gallery', 'room_gallery']);
  const rows = values.images.map((item) => item as Values).map((item) => ({
    id: text(item.id) || randomUUID(), collection: text(item.collection) || 'hotel_import', hotel_code: source.sourceKey,
    hotel_price_code: text(item.hotelPriceCode), source_url: text(item.sourceUrl), source_image_url: text(item.sourceImageUrl),
    image_name: text(item.imageName), image_url: text(item.imageUrl), storage_bucket: text(item.storageBucket),
    storage_path: text(item.storagePath), sort_order: number(item.sortOrder) || 0, is_primary: Boolean(item.isPrimary),
    updated_at: new Date().toISOString(),
  })).filter((row) => row.image_url && allowedCollections.has(row.collection));
  if (!rows.length) return;
  if (rows.some((row) => (row.collection === 'room_gallery') !== Boolean(row.hotel_price_code))) throw new Error('호텔 객실 이미지 저장 대상이 올바르지 않습니다.');
  const roomCodes = [...new Set(rows.filter((row) => row.collection === 'room_gallery').map((row) => row.hotel_price_code as string))];
  if (roomCodes.length) {
    const { data: rooms, error: roomsError } = await serviceSupabase.from('hotel_price').select('hotel_price_code,hotel_code').in('hotel_price_code', roomCodes);
    if (roomsError) throw roomsError;
    if ((rooms || []).length !== roomCodes.length || (rooms || []).some((room) => room.hotel_code !== source.sourceKey)) throw new Error('선택한 호텔에 속한 객실만 이미지 저장 대상으로 지정할 수 있습니다.');
  }
  for (const row of rows.filter((item) => item.is_primary)) {
    let clear = serviceSupabase.from('homepage_hotel_images').update({ is_primary: false, updated_at: row.updated_at }).eq('hotel_code', source.sourceKey).eq('collection', row.collection);
    clear = row.collection === 'room_gallery' ? clear.eq('hotel_price_code', row.hotel_price_code) : clear.is('hotel_price_code', null);
    const { error } = await clear;
    if (error) throw error;
  }
  const { error } = await serviceSupabase.from('homepage_hotel_images').upsert(rows, { onConflict: 'collection,image_url' });
  if (error) throw error;
  const hero = rows.find((row) => row.collection === 'hotel_import' && row.is_primary);
  if (hero) await mergeOverride('homepage_catalog_product_overrides', { service_type: 'hotel', source_key: source.sourceKey }, { image_url: hero.image_url });
}

async function setPrimaryImage(source: Source) {
  if (!serviceSupabase || !source.imageId) throw new Error('이미지 원본을 확인해 주세요.');
  const { data: image, error: readError } = await serviceSupabase.from('homepage_cruise_images').select('id,cruise_name,room_name').eq('id', source.imageId).maybeSingle();
  if (readError || !image) throw readError || new Error('이미지 원본을 찾을 수 없습니다.');
  let clear = serviceSupabase.from('homepage_cruise_images').update({ is_primary: false, updated_at: new Date().toISOString() }).eq('cruise_name', image.cruise_name);
  clear = image.room_name ? clear.eq('room_name', image.room_name) : clear.is('room_name', null);
  const { error: clearError } = await clear;
  if (clearError) throw clearError;
  const { error } = await serviceSupabase.from('homepage_cruise_images').update({ is_primary: true, updated_at: new Date().toISOString() }).eq('id', image.id);
  if (error) throw error;
  await refreshCoreImages(image.cruise_name, image.room_name);
}

async function removeImage(source: Source) {
  if (!serviceSupabase || !source.imageId) throw new Error('이미지 원본을 확인해 주세요.');
  const { data: image, error: readError } = await serviceSupabase.from('homepage_cruise_images').select('id,cruise_name,room_name,is_primary').eq('id', source.imageId).maybeSingle();
  if (readError || !image) throw readError || new Error('이미지 원본을 찾을 수 없습니다.');
  const { error } = await serviceSupabase.from('homepage_cruise_images').delete().eq('id', image.id);
  if (error) throw error;
  if (image.is_primary) {
    let replacementQuery = serviceSupabase.from('homepage_cruise_images').select('id').eq('cruise_name', image.cruise_name).order('sort_order').limit(1);
    replacementQuery = image.room_name ? replacementQuery.eq('room_name', image.room_name) : replacementQuery.is('room_name', null);
    const { data: replacement, error: replacementError } = await replacementQuery.maybeSingle();
    if (replacementError) throw replacementError;
    if (replacement) {
      const { error: primaryError } = await serviceSupabase.from('homepage_cruise_images').update({ is_primary: true, updated_at: new Date().toISOString() }).eq('id', replacement.id);
      if (primaryError) throw primaryError;
    }
  }
  await refreshCoreImages(image.cruise_name, image.room_name);
}

async function mutate(action: string, source: Source, values: Values) {
  if (action === 'updateCruise') return updateCruise(source, values);
  if (action === 'updateCabin') return updateCabin(source, values);
  if (action === 'createCabin') return createCabin(source, values);
  if (action === 'updateRate') return updateRate(source, values);
  if (action === 'updateItinerary') return updateItinerary(source, values);
  if (action === 'upsertCruiseTag') return updateTag(source, values);
  if (action === 'updateCatalogProduct') return updateCatalogProduct(source, values);
  if (action === 'updateCatalogDetails') return updateCatalogDetails(source, values);
  if (action === 'updateCatalogPrice') return updateCatalogPrice(source, values);
  if (action === 'createRateOnlyCruise') return createRateOnlyCruise(source, values);
  if (action === 'upsertImage') return upsertImage(source, values);
  if (action === 'upsertImages') return upsertImages(source, values);
  if (action === 'upsertHotelImages') return upsertHotelImages(source, values);
  if (action === 'setPrimaryImage') return setPrimaryImage(source);
  if (action === 'removeImage') return removeImage(source);
  throw new Error('지원하지 않는 홈페이지 상품 작업입니다.');
}

export async function PATCH(request: NextRequest) {
  if (!(await operator(request))) return NextResponse.json({ error: '플랫폼 관리자 권한이 필요합니다.' }, { status: 403 });
  if (!serviceSupabase) return NextResponse.json({ error: '플랫폼 DB 연결 정보가 없습니다.' }, { status: 503 });
  try {
    const body = await request.json();
    await mutate(String(body.action || ''), body.source || {}, body.values || {});
    return NextResponse.json({ ok: true, ...(await syncHomepage()) });
  } catch (error: unknown) {
    const message = errorMessage(error, '플랫폼 상품을 저장하지 못했습니다.');
    return NextResponse.json({ error: message }, { status: /확인해|지원하지/.test(message) ? 400 : 500 });
  }
}
