'use client';
// 매니저1과 동일한 패키지 예약 정보를 모바일 단일 열로 표시하는 상세 모달

import { useEffect, useMemo, useState } from 'react';
import {
  Building,
  Car,
  CheckCircle,
  Clock,
  MapPin,
  Package,
  Plane,
  Ship,
  Ticket,
  X,
} from 'lucide-react';
import supabase from '@/lib/supabase';
import { toKstDateLabel, toKstDateTimeParts } from '@/lib/dateKst';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  userName: string;
  items: any[];
  loading?: boolean;
};

const firstFilled = (...values: any[]) => values.find((value) => value !== null && value !== undefined && value !== '');
const toNumber = (...values: any[]) => {
  const value = firstFilled(...values);
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
};
const formatMoney = (value: any) => `${Number(value || 0).toLocaleString('ko-KR')}동`;
const isCodeLike = (value: any) => {
  const raw = String(value || '').trim();
  return /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(raw) || /^[A-Z]{1,6}[-_][A-Z0-9_-]{2,}$/i.test(raw);
};
const humanize = (value: any, fallback = '-') => {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  if (/^updating$/i.test(raw)) return '미정';
  return raw;
};
const humanizeName = (value: any, fallback: string) => (
  isCodeLike(value) ? fallback : humanize(value, fallback)
);
const normalizeType = (value: any) => {
  const raw = String(value || '').replace(/^package_/, '');
  if (raw === 'car_sht' || raw === 'reservation_car_sht') return 'sht';
  if (raw === 'car') return 'vehicle';
  return raw || 'service';
};
const formatNote = (value: any) => String(value || '')
  .replace(/\[\s*/g, '')
  .replace(/\s*\]/g, '')
  .replace(/UPDATING/gi, '미정')
  .trim();
const formatDateTime = (value: any, dateValue?: any, timeValue?: any) => {
  const rawValue = String(value || '').trim();
  const rawDate = String(dateValue || '').trim();
  const rawTime = String(timeValue || '').trim();
  const merged = /[T\s]\d{1,2}:\d{2}/.test(rawValue)
    ? rawValue
    : [rawValue || rawDate, rawTime].filter(Boolean).join('T');
  if (!merged) return '-';
  const parts = toKstDateTimeParts(merged);
  if (!parts.date) return humanize(merged);
  return `${toKstDateLabel(parts.date)}${parts.time ? ` ${parts.time}` : ''}`;
};
const getServiceDate = (service: any) => firstFilled(
  service.checkin,
  service.checkinDate,
  service.checkin_date,
  service.tourDate,
  service.usageDate,
  service.usage_date,
  service.ra_datetime,
  service.pickupDatetime,
  service.pickup_datetime,
  service.pickupDate,
  service.re_created_at,
) || '';
const getStatusLabel = (status: any) => ({
  confirmed: '확정',
  approved: '승인',
  completed: '완료',
  pending: '대기',
  cancelled: '취소',
}[String(status || '').toLowerCase()] || String(status || '-'));
const getWayLabel = (value: any) => {
  const raw = String(value || '').toLowerCase();
  if (raw.includes('pickup') || raw.includes('entry') || raw.includes('픽업')) return '픽업';
  if (raw.includes('sending') || raw.includes('sanding') || raw.includes('exit') || raw.includes('샌딩')) return '샌딩';
  if (raw.includes('drop')) return '드롭';
  return humanize(value);
};
const extractCruiseInfo = (note: any) => {
  const text = formatNote(note);
  const line = text.split('\n').map((value) => value.trim()).find((value) => value.startsWith('객실:'));
  const raw = line?.replace(/^객실:\s*/, '').trim() || '';
  if (!raw) return {};
  const tokens = raw.split(/\s+/).filter(Boolean);
  const roomIndex = tokens.findIndex((token) => /(스위트|캐빈|룸|디럭스|베란다|씨뷰|오션|패밀리)/.test(token));
  if (roomIndex > 0) {
    return { cruiseName: tokens.slice(0, roomIndex).join(' '), roomType: tokens.slice(roomIndex).join(' ') };
  }
  return { roomType: raw };
};

const serviceMeta: Record<string, { label: string; Icon: typeof Ship; color: string }> = {
  cruise: { label: '크루즈', Icon: Ship, color: 'text-blue-700' },
  airport: { label: '공항', Icon: Plane, color: 'text-emerald-700' },
  hotel: { label: '호텔', Icon: Building, color: 'text-orange-700' },
  tour: { label: '투어', Icon: MapPin, color: 'text-violet-700' },
  ticket: { label: '티켓', Icon: Ticket, color: 'text-teal-700' },
  rentcar: { label: '렌터카', Icon: Car, color: 'text-rose-700' },
  vehicle: { label: '크루즈 차량', Icon: Car, color: 'text-cyan-700' },
  sht: { label: '스하 차량', Icon: Car, color: 'text-indigo-700' },
};

function InfoRow({ label, value, right = false }: { label: string; value: any; right?: boolean }) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  return (
    <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-2 text-[13px] leading-5">
      <span className="font-bold text-blue-700">{label}</span>
      <span className={`min-w-0 break-words text-gray-800 ${right ? 'text-right font-semibold' : ''}`}>{value}</span>
    </div>
  );
}

export default function PackageReservationDetailModal({
  isOpen,
  onClose,
  userName,
  items,
  loading = false,
}: Props) {
  const [packageDetailMap, setPackageDetailMap] = useState<Record<string, any>>({});
  const [nameMaps, setNameMaps] = useState<Record<string, Record<string, any>>>({});

  const packageRootsRaw = useMemo(
    () => items.filter((item) => normalizeType(item?.serviceType || item?.re_type) === 'package'),
    [items],
  );
  const packageRootIds = useMemo(
    () => Array.from(new Set(
      packageRootsRaw.map((item) => String(item?.reservation_id || item?.re_id || '')).filter(Boolean),
    )),
    [packageRootsRaw],
  );
  const packageIdSet = useMemo(() => new Set(packageRootIds), [packageRootIds]);

  useEffect(() => {
    if (!isOpen || packageRootIds.length === 0) {
      setPackageDetailMap({});
      return;
    }
    let cancelled = false;
    const loadPackageDetails = async () => {
      const { data: details } = await supabase
        .from('reservation_package')
        .select('*')
        .in('reservation_id', packageRootIds);
      const packageIds = Array.from(new Set([
        ...packageRootsRaw.map((root) => root.package_id),
        ...(details || []).map((detail: any) => detail.package_id),
      ].filter(Boolean)));
      const { data: masters } = packageIds.length > 0
        ? await supabase
          .from('package_master')
          .select('id, name, package_code, description, base_price, price_child_extra_bed, price_child_no_extra_bed, price_infant_tour, price_infant_extra_bed, price_infant_seat')
          .in('id', packageIds)
        : { data: [] };
      if (cancelled) return;
      const masterMap = new Map((masters || []).map((master: any) => [String(master.id), master]));
      setPackageDetailMap(Object.fromEntries(packageRootIds.map((reservationId) => {
        const root = packageRootsRaw.find((item) => String(item?.reservation_id || item?.re_id) === reservationId) || {};
        const detail = (details || []).find((item: any) => String(item.reservation_id) === reservationId) || {};
        return [reservationId, {
          ...detail,
          package_master: masterMap.get(String(detail.package_id || root.package_id || '')) || root.package_master,
        }];
      })));
    };
    void loadPackageDetails();
    return () => { cancelled = true; };
  }, [isOpen, packageRootIds, packageRootsRaw]);

  const includedServices = useMemo(() => {
    const seen = new Set<string>();
    return items
      .filter((item) => {
        const type = normalizeType(item?.serviceType || item?.re_type);
        if (type === 'package') return false;
        const reservationId = String(item?.reservation_id || item?.re_id || '');
        return item?.isPackageService || packageIdSet.has(reservationId);
      })
      .map((item) => ({ ...item, serviceType: normalizeType(item?.serviceType || item?.re_type) }))
      .filter((item) => {
        const key = [
          item.reservation_id || item.re_id,
          item.serviceType,
          getServiceDate(item),
          item.tour_price_code || item.room_price_code || item.airport_price_code || item.rentcar_price_code || '',
          item.pickup_location || '',
          item.dropoff_location || item.destination || '',
        ].join('|');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => String(getServiceDate(a)).localeCompare(String(getServiceDate(b))));
  }, [items, packageIdSet]);

  useEffect(() => {
    if (!isOpen || includedServices.length === 0) {
      setNameMaps({});
      return;
    }
    let cancelled = false;
    const codes = (type: string, key: string) => Array.from(new Set(
      includedServices
        .filter((item) => item.serviceType === type)
        .map((item) => String(item?.[key] || '').trim())
        .filter(Boolean),
    ));
    const loadNames = async () => {
      const cruiseCodes = codes('cruise', 'room_price_code');
      const airportCodes = codes('airport', 'airport_price_code');
      const hotelCodes = codes('hotel', 'hotel_price_code');
      const tourCodes = codes('tour', 'tour_price_code');
      const rentCodes = Array.from(new Set([
        ...codes('rentcar', 'rentcar_price_code'),
        ...codes('vehicle', 'car_price_code'),
        ...codes('vehicle', 'rentcar_price_code'),
      ]));
      const [cruiseById, cruiseByType, airports, hotels, tourPrices, rentcars] = await Promise.all([
        cruiseCodes.length ? supabase.from('cruise_rate_card').select('id, cruise_name, room_type').in('id', cruiseCodes) : { data: [] },
        cruiseCodes.length ? supabase.from('cruise_rate_card').select('id, cruise_name, room_type').in('room_type', cruiseCodes) : { data: [] },
        airportCodes.length ? supabase.from('airport_price').select('airport_code, service_type, route, vehicle_type').in('airport_code', airportCodes) : { data: [] },
        hotelCodes.length ? supabase.from('hotel_price').select('hotel_price_code, hotel_name, room_name').in('hotel_price_code', hotelCodes) : { data: [] },
        tourCodes.length ? supabase.from('tour_pricing').select('pricing_id, tour:tour_id(tour_name)').in('pricing_id', tourCodes) : { data: [] },
        rentCodes.length ? supabase.from('rentcar_price').select('rent_code, vehicle_type, way_type, route').in('rent_code', rentCodes) : { data: [] },
      ]);
      if (cancelled) return;
      const mapRows = (rows: any[], keys: string[]) => Object.fromEntries(
        (rows || []).flatMap((row) => keys.map((key) => [String(row[key] || ''), row]).filter(([key]) => key)),
      );
      setNameMaps({
        cruise: mapRows([...(cruiseById.data || []), ...(cruiseByType.data || [])], ['id', 'room_type']),
        airport: mapRows(airports.data || [], ['airport_code']),
        hotel: mapRows(hotels.data || [], ['hotel_price_code']),
        tour: mapRows(tourPrices.data || [], ['pricing_id']),
        rentcar: mapRows(rentcars.data || [], ['rent_code']),
      });
    };
    void loadNames();
    return () => { cancelled = true; };
  }, [includedServices, isOpen]);

  const packageRoots = useMemo(() => packageRootsRaw.map((root) => {
    const reservationId = String(root?.reservation_id || root?.re_id || '');
    const detail = packageDetailMap[reservationId] || {};
    const master = root.package_master || detail.package_master || {};
    const merged = { ...detail, ...root };
    const adultCount = toNumber(merged.re_adult_count, merged.adult_count);
    const childExtraBed = toNumber(merged.child_extra_bed);
    const childNoExtraBed = toNumber(merged.child_no_extra_bed);
    const infantTour = toNumber(merged.infant_tour);
    const infantExtraBed = toNumber(merged.infant_extra_bed);
    const infantSeat = toNumber(merged.infant_seat);
    const adultPrice = toNumber(merged.adult_price, master.base_price);
    const childExtraBedPrice = toNumber(merged.child_extra_bed_price, master.price_child_extra_bed);
    const childNoExtraBedPrice = toNumber(merged.child_no_extra_bed_price, master.price_child_no_extra_bed);
    const infantTourPrice = toNumber(merged.infant_tour_price, master.price_infant_tour);
    const infantExtraBedPrice = toNumber(merged.infant_extra_bed_price, master.price_infant_extra_bed);
    const infantSeatPrice = toNumber(merged.infant_seat_price, master.price_infant_seat);
    const calculatedTotal =
      (adultCount * adultPrice)
      + (childExtraBed * childExtraBedPrice)
      + (childNoExtraBed * childNoExtraBedPrice)
      + (infantTour * infantTourPrice)
      + (infantExtraBed * infantExtraBedPrice)
      + (infantSeat * infantSeatPrice);
    const explicitTotal = toNumber(merged.total_amount || merged.total_price || merged.totalPrice);
    return {
      ...merged,
      reservationId,
      packageName: firstFilled(merged.package_name, master.name, merged.package_code, '패키지'),
      packageDescription: firstFilled(merged.package_description, master.description),
      totalAmount: explicitTotal > 0 ? explicitTotal : calculatedTotal,
      adultCount,
      childCount: toNumber(merged.re_child_count, merged.child_count),
      infantCount: toNumber(merged.re_infant_count, merged.infant_count),
      childExtraBed,
      childNoExtraBed,
      infantTour,
      infantExtraBed,
      infantSeat,
      adultPrice,
      childExtraBedPrice,
      childNoExtraBedPrice,
      infantTourPrice,
      infantExtraBedPrice,
      infantSeatPrice,
    };
  }), [packageDetailMap, packageRootsRaw]);

  const totalAmount = packageRoots.reduce((sum, root) => sum + Number(root.totalAmount || 0), 0);
  const firstItem = packageRoots[0] || items[0] || {};
  const userInfo = {
    name: userName || firstItem.customerName || firstItem.users?.name || '-',
    englishName: firstItem.customerEnglishName || firstItem.users?.english_name || '',
    email: firstItem.email || firstItem.users?.email || '',
    phone: firstItem.phone || firstItem.phone_number || firstItem.users?.phone || '',
    quoteTitle: firstItem.quote_title || firstItem.quote?.title || '',
  };

  const getTourName = (service: any) => (
    nameMaps.tour?.[service.tour_price_code]?.tour?.tour_name
    || service.tourName
    || service.tour_name
    || humanizeName(service.tour_price_code, '투어 프로그램')
  );
  const getServiceTitle = (service: any) => {
    const type = service.serviceType;
    if (type === 'cruise') {
      const noteInfo: any = extractCruiseInfo(service.note || service.request_note);
      return noteInfo.cruiseName
        || nameMaps.cruise?.[service.room_price_code]?.cruise_name
        || service.cruiseName
        || service.cruise
        || '크루즈 프로그램';
    }
    if (type === 'airport') {
      const wayType = getWayLabel(service.category || service.way_type || service.ra_way_type);
      return `${wayType === '-' ? '공항' : wayType} · ${humanize(service.ra_airport_location || service.airportName, '공항 이동')}`;
    }
    if (type === 'hotel') return nameMaps.hotel?.[service.hotel_price_code]?.hotel_name || service.hotelName || service.hotel_category || '호텔';
    if (type === 'tour') return getTourName(service);
    if (type === 'ticket') return service.ticketName || service.ticket_name || service.program_selection || '티켓';
    const rentInfo = nameMaps.rentcar?.[service.rentcar_price_code || service.car_price_code];
    return rentInfo?.vehicle_type || service.carType || service.vehicle_type || service.sht_category || '차량 서비스';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end bg-black/55 sm:items-center sm:justify-center sm:p-4" role="dialog" aria-modal="true" aria-label="패키지 예약 통합 상세">
      <div className="flex max-h-[94dvh] w-full flex-col overflow-hidden border border-gray-200 bg-white sm:max-w-xl">
        <header className="flex shrink-0 items-start justify-between border-b border-gray-200 px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-indigo-800">
              <Package className="h-5 w-5" />
              <h2 className="text-base font-extrabold tracking-tight">패키지 예약 통합 상세</h2>
            </div>
            <div className="mt-2 space-y-0.5 text-xs text-gray-600">
              <p className="font-bold text-gray-900">{userInfo.name}{userInfo.englishName ? ` · ${userInfo.englishName}` : ''}</p>
              {userInfo.email && <p>{userInfo.email}</p>}
              {userInfo.phone && <p>{userInfo.phone}</p>}
              <p>행복여행: {userInfo.quoteTitle || '-'}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="grid h-11 w-11 shrink-0 place-items-center border border-gray-200 text-gray-600" aria-label="닫기">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="overflow-y-auto bg-[#f4f4ed] p-3 pb-8">
          {loading ? (
            <div className="border border-gray-300 bg-white p-8 text-center text-sm text-gray-500">패키지 예약 상세를 불러오는 중...</div>
          ) : (
            <div className="space-y-5">
              <section className="grid grid-cols-4 gap-1.5">
                <div className="col-span-1 border border-indigo-200 bg-indigo-50 p-2">
                  <p className="text-[10px] font-bold leading-4 text-indigo-700">패키지 예약</p>
                  <p className="text-lg font-extrabold text-indigo-950">{packageRoots.length}건</p>
                </div>
                <div className="col-span-1 border border-blue-200 bg-blue-50 p-2">
                  <p className="text-[10px] font-bold leading-4 text-blue-700">포함 서비스</p>
                  <p className="text-lg font-extrabold text-blue-950">{includedServices.length}건</p>
                </div>
                <div className="col-span-2 border border-emerald-200 bg-emerald-50 p-2 text-right">
                  <p className="text-[10px] font-bold leading-4 text-emerald-700">패키지 총액 합계</p>
                  <p className="break-words text-base font-extrabold text-emerald-950">{formatMoney(totalAmount)}</p>
                </div>
              </section>

              <section className="space-y-2">
                <h3 className="text-xs font-extrabold uppercase tracking-[0.12em] text-[#062f33]">패키지 예약 목록</h3>
                {packageRoots.map((pkg, index) => {
                  const additionalItems = Array.isArray(pkg.price_breakdown_additional_items)
                    ? pkg.price_breakdown_additional_items
                    : (Array.isArray(pkg.price_breakdown?.additional_fee_items) ? pkg.price_breakdown.additional_fee_items : []);
                  const people = [
                    pkg.adultCount > 0 && `성인 ${pkg.adultCount}`,
                    pkg.childCount > 0 && `아동 ${pkg.childCount}`,
                    pkg.infantCount > 0 && `유아 ${pkg.infantCount}`,
                  ].filter(Boolean).join(', ');
                  const priceRows = [
                    [pkg.adultCount, pkg.adultPrice, '성인'],
                    [pkg.childExtraBed, pkg.childExtraBedPrice, '아동(엑베)'],
                    [pkg.childNoExtraBed, pkg.childNoExtraBedPrice, '아동(베드없음)'],
                    [pkg.infantTour, pkg.infantTourPrice, '유아(투어)'],
                    [pkg.infantExtraBed, pkg.infantExtraBedPrice, '유아(엑베)'],
                    [pkg.infantSeat, pkg.infantSeatPrice, '유아(좌석)'],
                  ].filter(([count, price]) => Number(count) > 0 && Number(price) > 0);
                  return (
                    <article key={pkg.reservationId || index} className="border border-indigo-200 bg-white p-3">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="min-w-0 break-words text-sm font-extrabold text-indigo-950">{pkg.packageName}</h4>
                        <span className="shrink-0 border border-indigo-200 bg-indigo-50 px-2 py-1 text-[11px] font-bold text-indigo-800">
                          {getStatusLabel(pkg.re_status || pkg.status)}
                        </span>
                      </div>
                      {pkg.packageDescription && <p className="mt-1 text-xs leading-5 text-gray-600">{pkg.packageDescription}</p>}
                      <div className="mt-3 space-y-1.5 border-t border-gray-100 pt-2">
                        <InfoRow label="예약일" value={formatDateTime(pkg.re_created_at)} />
                        {people && <InfoRow label="인원" value={people} />}
                        <InfoRow label="총액 (단일요금)" value={formatMoney(pkg.totalAmount)} right />
                      </div>
                      {(priceRows.length > 0 || additionalItems.length > 0) && (
                        <div className="mt-3 space-y-1 border-t border-indigo-100 pt-2 text-xs">
                          {priceRows.map(([count, price, label]) => (
                            <div key={String(label)} className="flex justify-between gap-2">
                              <span className="text-gray-600">{label} {formatMoney(price)} × {count}명</span>
                              <span className="text-right font-semibold text-gray-900">{formatMoney(Number(count) * Number(price))}</span>
                            </div>
                          ))}
                          {additionalItems.map((item: any, itemIndex: number) => (
                            <div key={`${item.name}-${itemIndex}`} className="flex justify-between gap-2 bg-yellow-100 px-1.5 py-1 font-bold text-yellow-950">
                              <span>{item.name}</span>
                              <span>{formatMoney(item.amount)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </article>
                  );
                })}
              </section>

              <section className="space-y-2">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-indigo-700" />
                  <h3 className="text-xs font-extrabold uppercase tracking-[0.12em] text-[#062f33]">패키지 포함 서비스 전체 내역</h3>
                </div>
                {includedServices.length === 0 ? (
                  <div className="border border-dashed border-gray-400 bg-white p-5 text-center text-xs text-gray-500">표시할 패키지 포함 서비스가 없습니다.</div>
                ) : includedServices.map((service, index) => {
                  const type = service.serviceType;
                  const meta = serviceMeta[type] || { label: '서비스', Icon: Clock, color: 'text-gray-700' };
                  const Icon = meta.Icon;
                  const cruiseInfo: any = type === 'cruise' ? extractCruiseInfo(service.note || service.request_note) : {};
                  const cruiseName = cruiseInfo.cruiseName || nameMaps.cruise?.[service.room_price_code]?.cruise_name || service.cruiseName || service.cruise;
                  const roomType = cruiseInfo.roomType || nameMaps.cruise?.[service.room_price_code]?.room_type || service.roomType || service.room_price_code;
                  const hotelName = nameMaps.hotel?.[service.hotel_price_code]?.hotel_name || service.hotelName || service.hotel_category;
                  const hotelRoom = nameMaps.hotel?.[service.hotel_price_code]?.room_name || service.roomType || service.hotel_price_code;
                  const rentInfo = nameMaps.rentcar?.[service.rentcar_price_code || service.car_price_code] || {};
                  const airportInfo = nameMaps.airport?.[service.airport_price_code] || {};
                  const wayType = getWayLabel(service.category || service.way_type || service.ra_way_type || airportInfo.service_type);
                  const pickup = type === 'airport'
                    ? null
                    : firstFilled(service.pickupLocation, service.pickup_location);
                  const dropoff = type === 'airport'
                    ? null
                    : firstFilled(service.dropoffLocation, service.dropoff_location, service.destination);
                  const airportTransferLocation = firstFilled(
                    service.accommodation_info,
                    wayType === '픽업' ? service.dropoff_location : service.pickup_location,
                    '미정',
                  );
                  const people = [
                    toNumber(service.adult, service.adult_count) > 0 && `성인 ${toNumber(service.adult, service.adult_count)}`,
                    toNumber(service.child, service.child_count) > 0 && `아동 ${toNumber(service.child, service.child_count)}`,
                    toNumber(service.infant, service.infant_count) > 0 && `유아 ${toNumber(service.infant, service.infant_count)}`,
                  ].filter(Boolean).join(', ');
                  return (
                    <article key={`${service.reservation_id || service.re_id}-${type}-${index}`} className="border border-gray-300 bg-white p-3">
                      <div className="flex items-start justify-between gap-2 border-b border-gray-100 pb-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <Icon className={`h-4 w-4 ${meta.color}`} />
                            <span className="text-xs font-extrabold text-blue-700">{meta.label}</span>
                          </div>
                          <h4 className="mt-1 break-words text-sm font-bold text-gray-950">{getServiceTitle(service)}</h4>
                        </div>
                        <span className="shrink-0 border border-gray-200 px-2 py-1 text-[10px] font-bold text-gray-700">
                          {getStatusLabel(service.re_status || service.status)}
                        </span>
                      </div>
                      <div className="mt-2 space-y-1.5">
                        <InfoRow label="일정" value={formatDateTime(getServiceDate(service), service.pickup_date, service.pickup_time)} />
                        {firstFilled(service.returnDatetime, service.return_datetime, service.return_date, service.return_time) && (
                          <InfoRow label="리턴 일정" value={formatDateTime(service.returnDatetime || service.return_datetime, service.return_date, service.return_time)} />
                        )}
                        {type === 'cruise' && <InfoRow label="크루즈" value={humanizeName(cruiseName, '크루즈 프로그램')} />}
                        {type === 'cruise' && <InfoRow label="객실타입" value={humanizeName(roomType, '객실 타입 확정 예정')} />}
                        {type === 'tour' && <InfoRow label="투어명" value={getTourName(service)} />}
                        {type === 'ticket' && <InfoRow label="티켓명" value={getServiceTitle(service)} />}
                        {type === 'ticket' && toNumber(service.ticketQuantity, service.ticket_quantity) > 0 && <InfoRow label="수량" value={`${toNumber(service.ticketQuantity, service.ticket_quantity)}매`} />}
                        {type === 'hotel' && <InfoRow label="호텔명" value={humanizeName(hotelName, '호텔')} />}
                        {type === 'hotel' && <InfoRow label="객실타입" value={humanizeName(hotelRoom, '객실 타입 확정 예정')} />}
                        {(service.category || service.way_type || service.ra_way_type) && <InfoRow label="구분" value={wayType} />}
                        <InfoRow label="경로" value={service.route || airportInfo.route || rentInfo.route} />
                        <InfoRow label="차량타입" value={service.carType || service.vehicle_type || airportInfo.vehicle_type || rentInfo.vehicle_type} />
                        {type === 'airport' && <InfoRow label="공항명" value={humanize(service.airportName || service.ra_airport_location, '미정')} />}
                        {type === 'airport' && <InfoRow label={wayType === '샌딩' ? '승차 위치' : '하차 위치'} value={humanize(airportTransferLocation, '미정')} />}
                        {pickup && <InfoRow label="픽업" value={humanize(pickup, '미정')} />}
                        {dropoff && <InfoRow label="드롭" value={humanize(dropoff, '미정')} />}
                        <InfoRow label="항공편" value={service.flightNumber || service.ra_flight_number} />
                        {toNumber(service.passengerCount, service.ra_passenger_count, service.passenger_count) > 0 && <InfoRow label="탑승 인원" value={`${toNumber(service.passengerCount, service.ra_passenger_count, service.passenger_count)}명`} />}
                        {toNumber(service.carCount, service.ra_car_count, service.car_count) > 0 && <InfoRow label="차량수" value={`${toNumber(service.carCount, service.ra_car_count, service.car_count)}대`} />}
                        {toNumber(service.luggageCount, service.ra_luggage_count, service.luggage_count) > 0 && <InfoRow label="수하물" value={`${toNumber(service.luggageCount, service.ra_luggage_count, service.luggage_count)}개`} />}
                        {toNumber(service.guestCount, service.guest_count) > 0 && <InfoRow label="투숙 인원" value={`${toNumber(service.guestCount, service.guest_count)}명`} />}
                        {toNumber(service.tourCapacity, service.tour_capacity) > 0 && <InfoRow label="투어 인원" value={`${toNumber(service.tourCapacity, service.tour_capacity)}명`} />}
                        <InfoRow label="차량번호" value={service.vehicleNumber || service.vehicle_number} />
                        <InfoRow label="좌석" value={service.seatNumber || service.seat_number} />
                        <InfoRow label="기사" value={service.driverName || service.driver_name} />
                        <InfoRow label="배차코드" value={service.dispatchCode || service.dispatch_code} />
                        {people && <InfoRow label="인원 구성" value={people} />}
                      </div>
                      <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-2 text-xs">
                        <span className="font-bold text-blue-700">금액</span>
                        <span className="border border-indigo-200 bg-indigo-50 px-2 py-1 font-bold text-indigo-800">패키지 포함</span>
                      </div>
                      {formatNote(service.note || service.request_note) && (
                        <div className="mt-2 whitespace-pre-line bg-gray-50 p-2 text-xs leading-5 text-gray-700">
                          <span className="font-bold text-blue-700">비고. </span>{formatNote(service.note || service.request_note)}
                        </div>
                      )}
                    </article>
                  );
                })}
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
