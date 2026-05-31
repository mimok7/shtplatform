import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Building,
  Calendar,
  Car,
  CheckCircle,
  Clock,
  FileText,
  MapPin,
  Package,
  Plane,
  Ship,
  Trash2,
  User,
  Users,
  Wallet,
  X,
  XCircle,
} from 'lucide-react';
import supabase from '@/lib/supabase';
import { getReservationStoredAmount } from '@sht/domain/reservation';
import { fetchPromotionSequenceMap, hasPromotionBreakdown } from '@/lib/promotionSequence';

type SortMode = 'date' | 'type';

const CHANGE_TABLE_BY_TYPE: Record<string, string> = {
  cruise: 'reservation_change_cruise',
  cruise_car: 'reservation_change_cruise_car',
  airport: 'reservation_change_airport',
  hotel: 'reservation_change_hotel',
  tour: 'reservation_change_tour',
  rentcar: 'reservation_change_rentcar',
  car_sht: 'reservation_change_car_sht',
  sht: 'reservation_change_car_sht',
  package: 'reservation_change_package',
};

const SERVICE_TO_CHANGE_TYPE: Record<string, string> = {
  cruise: 'cruise',
  vehicle: 'cruise_car',
  car: 'cruise_car',
  airport: 'airport',
  hotel: 'hotel',
  tour: 'tour',
  rentcar: 'rentcar',
  sht: 'car_sht',
  package: 'package',
  ticket: 'ticket',
};

const CHANGE_CHILDREN_BY_RETYPE: Record<string, string[]> = {
  cruise: ['cruise', 'cruise_car'],
  cruise_car: ['cruise_car'],
  airport: ['airport'],
  hotel: ['hotel'],
  tour: ['tour'],
  rentcar: ['rentcar'],
  car_sht: ['car_sht'],
  sht: ['car_sht'],
  package: ['package'],
};

const formatMoney = (value: number): string => `${Number(value || 0).toLocaleString('ko-KR')}동`;
const formatSignedAmount = (amount: number): string => `${amount > 0 ? '+' : ''}${Number(amount || 0).toLocaleString()}동`;

const formatCruiseScheduleLabel = (value: any): string => {
  const raw = String(value ?? '').trim();
  if (!raw) return '-';

  const normalized = raw.toUpperCase();
  const match = normalized.match(/^(\d+)N(\d+)D$/);
  if (match) return `${match[1]}박 ${match[2]}일`;
  if (/^\d+$/.test(raw)) {
    const nights = Number(raw);
    if (Number.isFinite(nights) && nights > 0) return `${nights}박 ${nights + 1}일`;
  }
  return raw;
};

const calcUnitPrice = (total: any, qty: any): number => {
  const t = Number(total || 0);
  const q = Number(qty || 0);
  if (t <= 0 || q <= 0) return 0;
  return Math.round(t / q);
};

const formatLinePrice = (label: string, unitPrice: number, count: number, unitLabel: string): string | null => {
  if (!unitPrice || !count) return null;
  return `${label} ${formatMoney(unitPrice)} × ${count}${unitLabel}`;
};

const pickNumber = (...candidates: any[]): number => {
  for (const candidate of candidates) {
    const parsed = Number(candidate);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

const getServicePriceBreakdown = (service: any) => (
  service?.priceBreakdown
  || service?.price_breakdown
  || service?.reservation_price_breakdown
  || service?.reservation?.price_breakdown
  || null
);

const getCruiseRoomPriceBreakdown = (service: any) => {
  const pb = getServicePriceBreakdown(service);
  const rooms = Array.isArray(pb?.rooms) ? pb.rooms : [];
  if (rooms.length === 0) return null;

  const roomCode = String(service?.room_price_code || '').trim();
  const checkin = String(service?.checkin || '').trim();

  const exactMatched = rooms.find((room: any) => {
    const targetCode = String(room?.room_price_code || '').trim();
    const targetCheckin = String(room?.checkin || '').trim();
    return targetCode === roomCode && (!checkin || targetCheckin === checkin);
  });
  if (exactMatched) return exactMatched;

  const roomCodeMatched = rooms.find((room: any) => String(room?.room_price_code || '').trim() === roomCode);
  if (roomCodeMatched) return roomCodeMatched;

  return rooms[0] || null;
};

const getCruiseDisplayTotal = (service: any): number => {
  const rawPb = getServicePriceBreakdown(service);

  // 1. price_breakdown.grand_total 우선 (예약수정 저장 시 옵션 포함 최신값)
  const pbGrandTotal = Number(rawPb?.grand_total);
  if (Number.isFinite(pbGrandTotal) && pbGrandTotal > 0) return pbGrandTotal;

  // 2. roomTotal + options_total + surcharge + additionalFee - discount 직접 계산
  const roomPb = getCruiseRoomPriceBreakdown(service);
  const roomPbTotal = Number(roomPb?.total);
  const roomTotal = roomPbTotal > 0 ? roomPbTotal : Number(service?.room_total_price || 0);

  if (roomTotal > 0) {
    const optionTotal = Number(rawPb?.options_total ?? rawPb?.option_total ?? 0);
    const surchargeTotal = Number(rawPb?.surcharge_total || 0);
    const additionalFee = Number((rawPb?.additional_fee_manual ?? rawPb?.adjustment_total ?? rawPb?.additional_fee) || 0);
    const discountAmount = Number(rawPb?.discount_amount || 0);

    const computedTotal = roomTotal + optionTotal + surchargeTotal + additionalFee - discountAmount;
    if (computedTotal > 0) return computedTotal;
    return roomTotal;
  }

  // 3. reservation.total_amount 폴백
  const reservationAmount = getReservationStoredAmount({
    total_amount: service?.reservation_total_amount
      ?? service?.reservationTotalAmount
      ?? service?.reservation?.total_amount,
    price_breakdown: service?.reservation_price_breakdown
      ?? service?.reservation?.price_breakdown
      ?? null,
  });
  if (reservationAmount > 0) return reservationAmount;

  return Number(service?.totalPrice || service?.total_amount || 0);
};

const getAmountSummaryLines = (service: any, type: string): string[] => {
  if (type === 'cruise') {
    const roomPb = getCruiseRoomPriceBreakdown(service);
    const unitFromPb = (key: string) => pickNumber(
      roomPb?.category_unit_prices?.[key],
      roomPb?.[key]?.unit_price,
    );
    const countFromPb = (key: string) => pickNumber(roomPb?.[key]?.count);

    const adultUnit = pickNumber(unitFromPb('adult'), service.priceAdult, service.price_adult, service.unit_price);
    const childUnit = pickNumber(unitFromPb('child'), service.priceChild, service.price_child);
    const childOlderUnit = pickNumber(unitFromPb('child_older'), service.priceChildOlder, service.price_child_older, service.price_child);
    const infantUnit = pickNumber(unitFromPb('infant'), service.priceInfant, service.price_infant);
    const childExtraBedUnit = pickNumber(unitFromPb('child_extra_bed'), service.priceChildExtraBed, service.price_child_extra_bed);
    const extraBedUnit = pickNumber(unitFromPb('extra_bed'), service.priceExtraBed, service.price_extra_bed);
    const singleUnit = pickNumber(unitFromPb('single'), service.priceSingle, service.price_single);

    const adultCount = pickNumber(countFromPb('adult'), service.adult_count, service.adult);
    const childCount = pickNumber(countFromPb('child'), service.child_count, service.child);
    const childOlderCount = pickNumber(countFromPb('child_older'), service.child_older_count);
    const infantCount = pickNumber(countFromPb('infant'), service.infant_count, service.toddler);
    const childExtraBedCount = pickNumber(countFromPb('child_extra_bed'), service.child_extra_bed_count);
    const extraBedCount = pickNumber(countFromPb('extra_bed'), service.extra_bed_count);
    const singleCount = pickNumber(countFromPb('single'), service.single_count);

    const lines = [
      formatLinePrice('성인', adultUnit, adultCount, '명'),
      formatLinePrice('아동(5~7)', childUnit, childCount, '명'),
      formatLinePrice('아동(8~11)', childOlderUnit, childOlderCount, '명'),
      formatLinePrice('유아', infantUnit, infantCount, '명'),
      formatLinePrice('아동 엑스트라', childExtraBedUnit, childExtraBedCount, '명'),
      formatLinePrice('엑스트라', extraBedUnit, extraBedCount, '개'),
      formatLinePrice('싱글', singleUnit, singleCount, '명'),
    ].filter(Boolean) as string[];
    // 선택 옵션 (price_breakdown.options)
    const rawPb = getServicePriceBreakdown(service);
    const pbOptions = Array.isArray(rawPb?.options) ? rawPb.options : [];
    for (const opt of pbOptions) {
      const qty = Number(opt?.quantity) || 1;
      const price = Number(opt?.price) || 0;
      const total = Number(opt?.total) || price * qty;
      const name = String(opt?.name || '').trim();
      if (name && (total > 0 || price > 0)) {
        lines.push(qty > 1 ? `${name} ${formatMoney(price)} × ${qty}개` : `${name} +${formatMoney(price)}`);
      }
    }
    // 성수기/공휴일 추가요금
    const surchargeTotal = Number(rawPb?.surcharge_total || 0);
    if (surchargeTotal > 0) lines.push(`성수기/공휴일 추가요금 +${formatMoney(surchargeTotal)}`);
    // 할인요금
    const discountAmount = Number(rawPb?.discount_amount || 0);
    if (discountAmount > 0) {
      const discountRate = Number(rawPb?.discount_rate || 0);
      lines.push(`할인요금${discountRate > 0 ? ` (${discountRate}%)` : ''} -${formatMoney(discountAmount)}`);
    }
    const cruiseDisplayTotal = getCruiseDisplayTotal(service);
    if (lines.length === 0 && cruiseDisplayTotal > 0) {
      return [`총액 ${formatMoney(cruiseDisplayTotal)}`];
    }
    return lines;
  }

  if (type === 'vehicle' || type === 'car') {
    const qty = Number(service.car_count || service.carCount || service.passenger_count || service.passengerCount || 0);
    const unit = Number(service.unit_price || service.unitPrice || calcUnitPrice(service.car_total_price || service.totalPrice, qty));
    const line = formatLinePrice('차량', unit, qty, Number(service.car_count || service.carCount || 0) > 0 ? '대' : '명');
    return line ? [line] : (Number(service.car_total_price || service.totalPrice || 0) > 0 ? [`총액 ${formatMoney(Number(service.car_total_price || service.totalPrice || 0))}`] : []);
  }

  if (type === 'airport') {
    const pax = Number(service.ra_passenger_count || service.passengerCount || 0);
    const cars = Number(service.ra_car_count || service.carCount || 0);
    const qty = pax > 0 ? pax : cars;
    const unitLabel = pax > 0 ? '명' : '대';
    const unit = Number(service.unit_price || service.unitPrice || calcUnitPrice(service.total_price || service.totalPrice, qty));
    const line = formatLinePrice('공항', unit, qty, unitLabel);
    return line ? [line] : (Number(service.total_price || service.totalPrice || 0) > 0 ? [`총액 ${formatMoney(Number(service.total_price || service.totalPrice || 0))}`] : []);
  }

  if (type === 'hotel') {
    const rooms = Number(service.room_count || service.roomCount || 0);
    const guests = Number(service.guest_count || service.guestCount || 0);
    const qty = rooms > 0 ? rooms : guests;
    const unit = Number(service.unit_price || service.unitPrice || calcUnitPrice(service.total_price || service.totalPrice, qty));
    const scheduleRaw = String(service.schedule || '').trim();
    const scheduleNights = Number.parseInt(scheduleRaw, 10);
    const nights = Number.isFinite(scheduleNights)
      ? scheduleNights
      : Number(service.nights || service.days || 0);
    const baseLine = formatLinePrice('호텔', unit, qty, rooms > 0 ? '객실' : '명');
    const line = baseLine && nights > 0 ? `${baseLine} × ${nights}박` : baseLine;
    return line ? [line] : (Number(service.total_price || service.totalPrice || 0) > 0 ? [`총액 ${formatMoney(Number(service.total_price || service.totalPrice || 0))}`] : []);
  }

  if (type === 'tour') {
    const qty = Number(service.tour_capacity || service.tourCapacity || 0);
    const unit = Number(service.unit_price || service.unitPrice || calcUnitPrice(service.total_price || service.totalPrice, qty));
    const line = formatLinePrice('투어', unit, qty, '명');
    return line ? [line] : (Number(service.total_price || service.totalPrice || 0) > 0 ? [`총액 ${formatMoney(Number(service.total_price || service.totalPrice || 0))}`] : []);
  }

  if (type === 'ticket') {
    const qty = Number(service.ticket_quantity || service.ticketQuantity || 0);
    const unit = Number(service.unit_price || service.unitPrice || calcUnitPrice(service.total_price || service.totalPrice, qty));
    const line = formatLinePrice('티켓', unit, qty, '매');
    return line ? [line] : (Number(service.total_price || service.totalPrice || 0) > 0 ? [`총액 ${formatMoney(Number(service.total_price || service.totalPrice || 0))}`] : []);
  }

  if (type === 'rentcar') {
    const qty = Number(service.car_count || service.carCount || 0);
    const unit = Number(service.unit_price || service.unitPrice || calcUnitPrice(service.total_price || service.totalPrice, qty));
    const line = formatLinePrice('렌터카', unit, qty, '대');
    return line ? [line] : (Number(service.total_price || service.totalPrice || 0) > 0 ? [`총액 ${formatMoney(Number(service.total_price || service.totalPrice || 0))}`] : []);
  }

  if (type === 'sht') {
    return Number(service.car_total_price || service.totalPrice || 0) > 0
      ? [`총액 ${formatMoney(Number(service.car_total_price || service.totalPrice || 0))}`]
      : [];
  }

  return [];
};

type CruiseAmountRow = { label: string; amount: number };
type CruiseRoomLineDraft = { label: string; count: number; unitLabel: string; fallbackUnit: number; rawUnit: number; rawTotal: number };

const getCruiseAmountRows = (service: any): CruiseAmountRow[] => {
  const rawPb = getServicePriceBreakdown(service);
  const roomPb = getCruiseRoomPriceBreakdown(service);
  const cruiseTotal = getCruiseDisplayTotal(service);

  // manager1과 동일: roomPb entry가 있으면 그 count 우선, 없으면 서비스 필드 폴백
  const resolveCount = (entry: any, ...fallbacks: any[]): number => {
    if (entry !== undefined && entry !== null) {
      const v = entry?.count;
      if (v !== undefined && v !== null) return Number(v);
      return 0;
    }
    for (const f of fallbacks) {
      const n = Number(f ?? 0);
      if (n > 0) return n;
    }
    return 0;
  };

  const adultCount = resolveCount(roomPb?.adult, service.adult, service.adult_count, service.re_adult_count, service.reservation?.re_adult_count);
  const childCount = resolveCount(roomPb?.child, service.child, service.child_count, service.re_child_count, service.reservation?.re_child_count);
  const childOlderCount = resolveCount(roomPb?.child_older, service.childOlderCount, service.child_older_count);
  const infantCount = resolveCount(roomPb?.infant, service.infant, service.infant_count, service.re_infant_count, service.reservation?.re_infant_count);
  const singleCount = resolveCount(roomPb?.single, service.singleCount, service.single_count);
  const childExtraBedCount = resolveCount(roomPb?.child_extra_bed, service.childExtraBedCount, service.child_extra_bed_count);
  const extraBedCount = resolveCount(roomPb?.extra_bed, service.extraBedCount, service.extra_bed_count);

  // manager1과 동일: count > 0이면 라인 생성. unit은 total/count 역산 → rawUnit → fallbackUnit 순서
  const makeLine = (
    label: string,
    entry: any,
    count: number,
    fallbackUnit: number,
    unitLabel = '명',
  ): CruiseAmountRow | null => {
    if (count <= 0) return null;
    const rawUnit = Number(entry?.unit_price ?? 0);
    const rawTotal = Number(entry?.total ?? 0);
    const unit = rawTotal > 0 && count > 0
      ? Math.round(rawTotal / count)
      : (rawUnit > 0 ? rawUnit : fallbackUnit);
    const amount = rawTotal > 0 ? rawTotal : unit * count;
    const labelStr = unit > 0
      ? `${label} ${formatMoney(unit)} × ${count}${unitLabel}`
      : `${label} ${count}${unitLabel}`;
    return { label: labelStr, amount };
  };

  const draftLines: CruiseRoomLineDraft[] = [
    { label: '성인', count: adultCount, unitLabel: '명', fallbackUnit: Number(service.unitPrice || service.priceAdult || 0), rawUnit: Number(roomPb?.adult?.unit_price ?? 0), rawTotal: Number(roomPb?.adult?.total ?? 0) },
    { label: '아동(5~7)', count: childCount, unitLabel: '명', fallbackUnit: Number(service.priceChild || 0), rawUnit: Number(roomPb?.child?.unit_price ?? 0), rawTotal: Number(roomPb?.child?.total ?? 0) },
    { label: '아동(8~11)', count: childOlderCount, unitLabel: '명', fallbackUnit: Number(service.priceChildOlder || service.priceChild || 0), rawUnit: Number(roomPb?.child_older?.unit_price ?? 0), rawTotal: Number(roomPb?.child_older?.total ?? 0) },
    { label: '아동엑베', count: childExtraBedCount, unitLabel: '명', fallbackUnit: Number(service.priceChildExtraBed || 0), rawUnit: Number(roomPb?.child_extra_bed?.unit_price ?? 0), rawTotal: Number(roomPb?.child_extra_bed?.total ?? 0) },
    { label: '유아', count: infantCount, unitLabel: '명', fallbackUnit: Number(service.priceInfant || 0), rawUnit: Number(roomPb?.infant?.unit_price ?? 0), rawTotal: Number(roomPb?.infant?.total ?? 0) },
    { label: '엑스트라베드', count: extraBedCount, unitLabel: '개', fallbackUnit: Number(service.priceExtraBed || 0), rawUnit: Number(roomPb?.extra_bed?.unit_price ?? 0), rawTotal: Number(roomPb?.extra_bed?.total ?? 0) },
    { label: '싱글차액', count: singleCount, unitLabel: '명', fallbackUnit: Number(service.priceSingle || 0), rawUnit: Number(roomPb?.single?.unit_price ?? 0), rawTotal: Number(roomPb?.single?.total ?? 0) },
  ].filter((line) => line.count > 0);

  const optionTotal = Number(rawPb?.options_total ?? rawPb?.option_total ?? 0);
  const surchargeTotal = Number(rawPb?.surcharge_total || 0);
  const additionalFeeTotal = Number(rawPb?.additional_fee_manual ?? rawPb?.adjustment_total ?? rawPb?.additional_fee ?? 0);
  const discountTotal = Number(rawPb?.discount_amount || 0);
  const targetRoomTotal = cruiseTotal - optionTotal - surchargeTotal - additionalFeeTotal + discountTotal;

  const promoCode = rawPb?.promotion_code || null;
  const promoApplied = Array.isArray(rawPb?.applied_promotions) ? rawPb.applied_promotions : [];
  const hasPromo = !!promoCode || promoApplied.length > 0;

  const rawRoomTotal = draftLines.reduce((sum, line) => {
    const fallbackTotal = line.rawUnit > 0 ? line.rawUnit * line.count : line.fallbackUnit * line.count;
    return sum + (line.rawTotal > 0 ? line.rawTotal : fallbackTotal);
  }, 0);

  const shouldScalePromoLines = hasPromo
    && draftLines.length > 0
    && targetRoomTotal > 0
    && rawRoomTotal > 0
    && Math.abs(rawRoomTotal - targetRoomTotal) >= 1;

  const scaledTotals = (() => {
    if (!shouldScalePromoLines) return [] as number[];
    const ratio = targetRoomTotal / rawRoomTotal;
    let assigned = 0;
    return draftLines.map((line, idx) => {
      const fallbackTotal = line.rawUnit > 0 ? line.rawUnit * line.count : line.fallbackUnit * line.count;
      const baseTotal = line.rawTotal > 0 ? line.rawTotal : fallbackTotal;
      if (idx === draftLines.length - 1) return Math.max(0, Math.round(targetRoomTotal - assigned));
      const scaled = Math.max(0, Math.round(baseTotal * ratio));
      assigned += scaled;
      return scaled;
    });
  })();

  const rows: CruiseAmountRow[] = [];
  draftLines.forEach((line, idx) => {
    const baseTotal = line.rawTotal > 0
      ? line.rawTotal
      : ((line.rawUnit > 0 ? line.rawUnit : line.fallbackUnit) * line.count);
    const displayTotal = scaledTotals[idx] ?? baseTotal;
    const displayUnit = line.count > 0 && displayTotal > 0
      ? Math.round(displayTotal / line.count)
      : (line.rawUnit > 0 ? line.rawUnit : line.fallbackUnit);
    const labelStr = displayUnit > 0
      ? `${line.label} ${formatMoney(displayUnit)} × ${line.count}${line.unitLabel}`
      : `${line.label} ${line.count}${line.unitLabel}`;
    rows.push({ label: labelStr, amount: displayTotal });
  });

  if (optionTotal > 0) rows.push({ label: '선택 옵션 합계', amount: optionTotal });
  if (surchargeTotal > 0) rows.push({ label: '성수기/공휴일 추가요금', amount: surchargeTotal });

  const discountAmount = Number(rawPb?.discount_amount || 0);
  if (discountAmount > 0) {
    const discountRate = Number(rawPb?.discount_rate || 0);
    rows.push({ label: `할인요금${discountRate > 0 ? ` (${discountRate}%)` : ''}`, amount: -discountAmount });
  }

  if (rows.length === 0) {
    if (cruiseTotal > 0) rows.push({ label: '총액', amount: cruiseTotal });
  }

  return rows;
};

function formatDatetimeOffset(value: any): string {
  if (!value) return '-';
  const raw = String(value).trim();
  if (!raw) return '-';
  const hasTimezone = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(raw);
  if (!hasTimezone) {
    const normalized = raw.replace(' ', 'T');
    const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    if (match) {
      const [, year, month, day, hourStr, minute] = match;
      const hour24 = Number(hourStr);
      const ampm = hour24 >= 12 ? '오후' : '오전';
      const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
      return `${year}. ${month}. ${day}. ${ampm} ${String(hour12).padStart(2, '0')}:${minute}`;
    }
    return raw;
  }
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  return d.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function formatDateOnlyKst(value: any): string {
  if (!value) return '-';
  const raw = String(value).trim();
  if (!raw) return '-';
  const hasTimezone = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(raw);
  if (!hasTimezone) {
    const normalized = raw.replace(' ', 'T');
    const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[1]}. ${match[2]}. ${match[3]}.`;
    return raw;
  }
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  return d.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' });
}

const getFilteredNoteText = (note: any): string => {
  if (!note) return '';
  const sanitized = String(note)
    .replace(/\[CHILD_OLDER_COUNTS:[^\]]*\]\s*/gi, '')
    .replace(/\[옵션\s*\d+\][\s\S]*?(?=\n|$)/g, (m) => (m.includes('\n') ? '\n' : ''))
    .trim();
  const hiddenLinePattern = /^(?:비고\s*:\s*)?(?:\[(?:객실|구성|옵션)\s*\d+\]|(?:객실|구성)\s*\d+\b)/;
  return sanitized
    .split('\n')
    .map((line) => line.replace(/\u00A0/g, ' ').trim())
    .filter(Boolean)
    .filter((line) => !hiddenLinePattern.test(line))
    .join('\n')
    .trim();
};

const getServiceType = (item: any) => {
  if (item?.serviceType) return String(item.serviceType).toLowerCase();
  // re_type을 폴백으로 사용 (page.tsx에서 serviceType 미설정 시 안전망)
  if (item?.re_type) {
    const rt = String(item.re_type).toLowerCase();
    return rt === 'car_sht' ? 'sht' : rt;
  }
  if (item.cruise && item.checkin) return 'cruise';
  if (item.boardingDate && item.vehicleNumber) return 'vehicle';
  const hasAirportHint = !!(item.tripType || item.route || item.airportName || item.flightNumber || item.placeName);
  if (hasAirportHint && (item.date || item.time || item.airportName)) return 'airport';
  if (item.hotelName && (item.checkinDate || item.checkin_date)) return 'hotel';
  if (item.tourName && (item.startDate || item.tourDate || item.usage_date)) return 'tour';
  if (item.ticketName || item.ticketQuantity) return 'ticket';
  if (item.pickupDate && item.usagePeriod) return 'rentcar';
  if (item.rentcar_price_code || item.rentcarPriceCode) return 'rentcar';
  if (item.pickupDatetime && !item.boardingDate && !item.pickupDate) return 'car';
  return 'unknown';
};

const getManualAdditionalFee = (service: any): number => {
  const raw = service?.manual_additional_fee
    ?? service?.manualAdditionalFee
    ?? service?.reservation_manual_additional_fee
    ?? service?.reservation?.manual_additional_fee
    ?? service?.priceBreakdown?.adjustment_total
    ?? service?.price_breakdown?.adjustment_total
    ?? service?.reservation_price_breakdown?.adjustment_total
    ?? service?.reservation?.price_breakdown?.adjustment_total
    ?? service?.priceBreakdown?.additional_fee
    ?? service?.price_breakdown?.additional_fee
    ?? service?.reservation_price_breakdown?.additional_fee
    ?? service?.reservation?.price_breakdown?.additional_fee
    ?? 0;
  const parsed = Number(raw || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getManualAdditionalFeeDetail = (service: any): string => {
  const raw = service?.manual_additional_fee_detail
    ?? service?.manualAdditionalFeeDetail
    ?? service?.reservation_manual_additional_fee_detail
    ?? service?.reservation?.manual_additional_fee_detail
    ?? service?.priceBreakdown?.additional_fee_detail
    ?? service?.price_breakdown?.additional_fee_detail
    ?? '';
  return String(raw || '').trim();
};

const getReservationTotalAmount = (service: any): number | null => {
  const amount = getReservationStoredAmount({
    total_amount: service?.reservation_total_amount
      ?? service?.reservationTotalAmount
      ?? service?.reservation?.total_amount,
    price_breakdown: service?.reservation_price_breakdown
      ?? service?.reservation?.price_breakdown
      ?? null,
  });
  return amount > 0 ? amount : null;
};

const hasReservationPricingOverride = (service: any, manualAdditionalFee: number, manualAdditionalFeeDetail: string): boolean => {
  return manualAdditionalFee !== 0
    || !!manualAdditionalFeeDetail
    || !!service?.reservation_price_breakdown
    || !!service?.reservation?.price_breakdown;
};

const getChangeStatusLabel = (status: any): string => {
  const value = String(status || '').toLowerCase();
  if (value === 'approved') return '승인';
  if (value === 'pending') return '대기';
  if (value === 'completed') return '완료';
  if (value === 'confirmed') return '확정';
  return status ? String(status) : '수정';
};

const pickChangeDetailRow = (service: any, rows: any[]): any => {
  if (!rows || rows.length === 0) return null;
  if (rows.length === 1) return rows[0];

  const type = String(service?.serviceType || '').toLowerCase();
  if (type === 'cruise') {
    const roomCode = String(service?.room_price_code || '').trim();
    const checkin = String(service?.checkin || '').trim();
    const matched = rows.find((r: any) =>
      String(r?.room_price_code || '').trim() === roomCode
      && String(r?.checkin || '').trim() === checkin,
    );
    if (matched) return matched;
  }

  if (type === 'airport') {
    const dt = String(service?.ra_datetime || '').trim();
    const flight = String(service?.ra_flight_number || service?.flightNumber || '').trim();
    const matched = rows.find((r: any) =>
      String(r?.ra_datetime || '').trim() === dt
      || (flight && String(r?.ra_flight_number || '').trim() === flight),
    );
    if (matched) return matched;
  }

  return rows[0];
};

const getServiceLabel = (serviceType: string) => {
  const labels: Record<string, string> = {
    cruise: '크루즈',
    vehicle: '크루즈 차량',
    car: '크루즈 차량',
    airport: '공항',
    hotel: '호텔',
    tour: '투어',
    ticket: '티켓',
    rentcar: '렌터카',
    sht: '스하차량',
    package: '패키지',
  };
  return labels[serviceType] || '서비스';
};

const getServiceIcon = (serviceType: string) => {
  switch (serviceType) {
    case 'cruise': return <Ship className="h-4 w-4 text-blue-600" />;
    case 'vehicle':
    case 'car': return <Car className="h-4 w-4 text-purple-600" />;
    case 'airport': return <Plane className="h-4 w-4 text-green-600" />;
    case 'hotel': return <Building className="h-4 w-4 text-orange-600" />;
    case 'tour': return <MapPin className="h-4 w-4 text-pink-600" />;
    case 'ticket': return <FileText className="h-4 w-4 text-teal-600" />;
    case 'rentcar': return <Car className="h-4 w-4 text-indigo-600" />;
    case 'sht': return <Car className="h-4 w-4 text-blue-500" />;
    case 'package': return <Package className="h-4 w-4 text-indigo-600" />;
    default: return <Users className="h-4 w-4 text-gray-600" />;
  }
};

const getStatusBadge = (status: string) => {
  if (status === 'confirmed') return <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-700 whitespace-nowrap"><CheckCircle className="h-3 w-3" />확정</span>;
  if (status === 'completed') return <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-700 whitespace-nowrap"><CheckCircle className="h-3 w-3" />완료</span>;
  if (status === 'pending') return <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-[11px] font-medium text-yellow-700 whitespace-nowrap"><AlertCircle className="h-3 w-3" />대기</span>;
  if (status === 'cancelled') return <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700 whitespace-nowrap"><XCircle className="h-3 w-3" />취소</span>;
  return <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500 whitespace-nowrap">{status || '-'}</span>;
};

const getDateStr = (service: any) => {
  if (service?.checkin) return String(service.checkin);
  if (service?.pickupDatetime) return String(service.pickupDatetime).split('T')[0];
  if (service?.ra_datetime) return String(service.ra_datetime).split('T')[0];
  if (service?.date) return String(service.date);
  if (service?.checkinDate) return String(service.checkinDate);
  if (service?.tourDate) return String(service.tourDate);
  if (service?.usageDate) return String(service.usageDate).split('T')[0];
  if (service?.pickup_datetime) return String(service.pickup_datetime).split('T')[0];
  return '';
};

const getAirportSortOrder = (service: any) => {
  const value = String(service?.category || service?.way_type || '').toLowerCase();
  if (value.includes('pickup') || value.includes('픽업')) return 0;
  if (value.includes('sending') || value.includes('샌딩')) return 1;
  return 9;
};

const getShtSortOrder = (service: any) => {
  const value = String(service?.category || service?.sht_category || '').toLowerCase();
  if (value.includes('pickup') || value.includes('픽업')) return 0;
  if (value.includes('drop') || value.includes('드롭') || value.includes('도롭') || value.includes('샌딩')) return 1;
  return 9;
};

const formatNonZeroCount = (value: any, suffix: string): string | null => {
  const count = Number(value ?? 0);
  if (!Number.isFinite(count) || count <= 0) return null;
  return `${count}${suffix}`;
};

const getAirportDirectionBadge = (service: any): string | null => {
  const value = String(service?.category || service?.way_type || service?.tripType || '').toLowerCase();
  if (value.includes('pickup') || value.includes('픽업')) return '픽업';
  if (value.includes('sending') || value.includes('샌딩')) return '샌딩';
  return null;
};

const getShtDirectionBadge = (service: any): string | null => {
  const value = String(service?.category || service?.sht_category || '').toLowerCase();
  if (value.includes('pickup') || value.includes('픽업')) return '픽업';
  if (value.includes('drop') || value.includes('드롭') || value.includes('도롭') || value.includes('샌딩')) return '드롭';
  return null;
};

const getDirectionBadgeClassName = (badge: string | null): string => {
  if (badge === '픽업') return 'bg-emerald-100 text-emerald-700';
  if (badge === '드롭') return 'bg-orange-100 text-orange-700';
  if (badge === '샌딩') return 'bg-violet-100 text-violet-700';
  return 'bg-sky-100 text-sky-700';
};

const shouldHideDuplicateShuttleVehicle = (service: any): boolean => {
  const type = String(service?.serviceType || '').toLowerCase();
  if (type !== 'vehicle' && type !== 'car') return false;
  const carType = String(service?.carType || service?.vehicle_type || '').toLowerCase();
  return carType.includes('스테이하롱 셔틀 리무진') || carType.includes('스테이하롱 셔툴 리무진');
};

const formatCompactDatetime = (value: any): string => {
  if (!value) return '-';
  const raw = String(value).trim();
  if (!raw) return '-';
  const normalized = raw.replace('T', ' ');
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]} ${match[4]}:${match[5]}`;
  return raw;
};

const compareServices = (a: any, b: any) => {
  const dateA = getDateStr(a) || '9999-99-99';
  const dateB = getDateStr(b) || '9999-99-99';
  const dateCompare = dateA.localeCompare(dateB);
  if (dateCompare !== 0) return dateCompare;
  const isAirportA = a?.serviceType === 'airport';
  const isAirportB = b?.serviceType === 'airport';
  if (isAirportA && isAirportB) return getAirportSortOrder(a) - getAirportSortOrder(b);
  const isShtA = a?.serviceType === 'sht';
  const isShtB = b?.serviceType === 'sht';
  if (isShtA && isShtB) return getShtSortOrder(a) - getShtSortOrder(b);
  return 0;
};

function DetailLine({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === undefined || value === null || value === '' || value === '-') return null;
  return (
    <div className="py-0.5 text-xs leading-relaxed text-gray-900 break-words">
      <span className="font-semibold text-blue-700">{label}: </span>
      <span className="font-medium text-gray-900">{value}</span>
    </div>
  );
}

function ServiceCard({
  service,
  onDeleteService,
  deletingReservationId,
}: {
  service: any;
  onDeleteService?: (service: any) => void | Promise<void>;
  deletingReservationId?: string | null;
}) {
  const type = String(service?.serviceType || '').toLowerCase();
  const reservationId = String(service?.reservation_id || service?.reservationId || service?.re_id || '').trim();
  const airportDirectionBadge = type === 'airport' ? getAirportDirectionBadge(service) : null;
  const shtDirectionBadge = type === 'sht' ? getShtDirectionBadge(service) : null;
  const titleBadge = airportDirectionBadge || shtDirectionBadge;
  const canDelete = !!onDeleteService && !!reservationId;
  const isDeleting = !!deletingReservationId && deletingReservationId === reservationId;
  const amountSummaryLines = type === 'cruise' ? [] : getAmountSummaryLines(service, type);
  const cruiseAmountRows = type === 'cruise' ? getCruiseAmountRows(service) : [];
  const manualAdditionalFee = getManualAdditionalFee(service);
  const manualAdditionalFeeDetail = getManualAdditionalFeeDetail(service);
  const additionalFeeItems = (() => {
    const pb = getServicePriceBreakdown(service);
    return (Array.isArray(pb?.additional_fee_items) ? pb.additional_fee_items : [])
      .filter((item: any) => Number(item?.amount || 0) !== 0);
  })();
  const isPackageService = !!service?.isPackageService;
  const shtCategory = String(service?.category || '').toLowerCase();
  const isShtDropoff = type === 'sht' && (
    shtCategory.includes('drop')
    || shtCategory.includes('드롭')
    || shtCategory.includes('도롭')
    || shtCategory.includes('샌딩')
  );

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          {getServiceIcon(type)}
          <span className="truncate whitespace-nowrap text-sm font-semibold text-gray-800">{getServiceLabel(type)}</span>
          {titleBadge && (
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${getDirectionBadgeClassName(titleBadge)}`}>
              {titleBadge}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {getStatusBadge(String(service?.status || ''))}
          {canDelete && (
            <button
              type="button"
              onClick={() => onDeleteService?.(service)}
              disabled={isDeleting}
              className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Trash2 className="h-3 w-3" />
              {isDeleting ? '삭제중' : '삭제'}
            </button>
          )}
        </div>
      </div>

      {service?._hasChange && (
        <div className="mb-1 inline-flex items-center rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-700">
          수정 내용 반영 ({getChangeStatusLabel(service?._changeStatus)})
        </div>
      )}

      {type === 'cruise' && (() => {
        const _rawPb = getServicePriceBreakdown(service);
        const _promoCode = _rawPb?.promotion_code || null;
        const _promoApplied = Array.isArray(_rawPb?.applied_promotions) ? _rawPb.applied_promotions : [];
        const _promoSeqRaw = _rawPb?.promotion_sequence ?? service?.promotion_sequence ?? service?.reservation?.price_breakdown?.promotion_sequence;
        const _promoSeqNum = Number(_promoSeqRaw || 0);
        const _promoSeq = Number.isFinite(_promoSeqNum) && _promoSeqNum > 0 ? _promoSeqNum : null;
        const _hasPromo = !!_promoCode || _promoApplied.length > 0;
        return _hasPromo ? (
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700 border border-red-100">
              {_promoSeq ? `🎁 프로모션 ${_promoSeq} 번째` : '🎁 프로모션 적용'}
            </span>
          </div>
        ) : null;
      })()}

      {type === 'cruise' && (
        <div className="space-y-0.5">
          <DetailLine label="체크인" value={service.checkin || '-'} />
          <DetailLine label="일정" value={formatCruiseScheduleLabel(service.scheduleType || service.schedule_type || service.schedule_days || service.days || service.nights)} />
          <DetailLine label="크루즈명" value={service.cruiseName || service.cruise || '-'} />
          <DetailLine label="객실타입" value={service.roomType || '-'} />
          <DetailLine label="구분" value={service.category || '-'} />
          <DetailLine label="객실수" value={formatNonZeroCount(service.room_count || service.roomCount, '실')} />
          <DetailLine label="성인" value={formatNonZeroCount(service.adult ?? service.adult_count, '명')} />
          <DetailLine label="아동" value={formatNonZeroCount(service.child ?? service.child_count, '명')} />
          <DetailLine label="유아" value={formatNonZeroCount(service.infant ?? service.infant_count ?? service.toddler, '명')} />
          <DetailLine label="총 금액" value={<span className="font-bold text-blue-700">{formatMoney(getCruiseDisplayTotal(service))}</span>} />
        </div>
      )}

      {(type === 'vehicle' || type === 'car') && (
        <div className="space-y-0.5">
          <DetailLine label="일시" value={service.pickupDatetime ? formatDateOnlyKst(service.pickupDatetime) : '-'} />
          <DetailLine label="구분" value={service.carCategory || service.way_type || service.category || '-'} />
          <DetailLine label="차량타입" value={service.carType || '-'} />
          <DetailLine label="총인원수" value={formatNonZeroCount(service.passengerCount, '명')} />
          <DetailLine label="차량수" value={formatNonZeroCount(service.car_count || service.carCount, '대')} />
          <DetailLine label="픽업위치" value={service.pickupLocation || '-'} />
          <DetailLine label="드랍위치" value={service.dropoffLocation || service.destination || '-'} />
          <DetailLine label="총 금액" value={<span className="font-bold text-blue-700">{formatMoney(Number(service.totalPrice || service.car_total_price || 0))}</span>} />
        </div>
      )}

      {type === 'airport' && (
        <div className="space-y-0.5">
          {(() => {
            const airportName = service.ra_airport_location || service.airportName || '-';
            const cityName = service.placeName || service.location_name || service.accommodation_info || service.pickupLocation || service.dropoffLocation || '-';
            const directionBadge = getAirportDirectionBadge(service);
            return (
              <>
                <DetailLine label="일시" value={service.ra_datetime ? formatCompactDatetime(service.ra_datetime) : `${service.date || '-'} ${service.time || ''}`.trim()} />
                <DetailLine label="공항" value={airportName} />
                <DetailLine label="항공편" value={service.flightNumber || service.ra_flight_number || '-'} />
                <DetailLine label="경로" value={service.route || '-'} />
                <DetailLine label="차량" value={service.carType || service.vehicleType || service.vehicle_type || '-'} />
                <DetailLine label="인원" value={formatNonZeroCount(service.passengerCount ?? service.ra_passenger_count, '명')} />
                <DetailLine label="차량수" value={formatNonZeroCount(service.carCount ?? service.ra_car_count, '대')} />
                <DetailLine label={directionBadge === '샌딩' ? '샌딩위치' : '픽업위치'} value={cityName} />
                <DetailLine label="총 금액" value={<span className="font-bold text-blue-700">{formatMoney(Number(service.totalPrice || service.total_price || 0))}</span>} />
              </>
            );
          })()}
        </div>
      )}

      {type === 'hotel' && (
        <div className="space-y-0.5">
          {(() => {
            const scheduleRaw = String(service.schedule || '').trim();
            const parsedNights = Number.parseInt(scheduleRaw, 10);
            const nights = Number.isFinite(parsedNights)
              ? parsedNights
              : Number(service.nights || service.days || 0);
            return (
              <>
          <DetailLine label="체크인" value={service.checkinDate || service.checkin_date || '-'} />
          <DetailLine label="숙박일정" value={nights > 0 ? `${nights}박 ${nights + 1}일` : '-'} />
          <DetailLine label="호텔명" value={service.hotelName || service.hotel_name || service.hotel_category || '-'} />
          <DetailLine label="객실명" value={service.roomName || service.room_name || null} />
          <DetailLine label="객실수" value={formatNonZeroCount(service.roomCount ?? service.room_count, '실')} />
          <DetailLine label="인원" value={formatNonZeroCount(service.guestCount ?? service.guest_count, '명')} />
          <DetailLine label="총 금액" value={<span className="font-bold text-blue-700">{formatMoney(Number(service.totalPrice || service.total_price || 0))}</span>} />
              </>
            );
          })()}
        </div>
      )}

      {type === 'tour' && (
        <div className="space-y-0.5">
          <DetailLine label="투어명" value={service.tourName || service.tour_name || '-'} />
          <DetailLine label="종류" value={service.tourType || service.tour_type || '-'} />
          <DetailLine label="시작일" value={service.startDate || service.tourDate || service.usage_date || '-'} />
          <DetailLine label="종료일" value={service.endDate || service.startDate || service.tourDate || service.usage_date || '-'} />
          <DetailLine label="인원수" value={formatNonZeroCount(service.tourCapacity ?? service.tour_capacity ?? service.participants, '명')} />
          <DetailLine label="픽업" value={service.pickupLocation || service.pickup_location || '-'} />
          <DetailLine label="드롭" value={service.dropoffLocation || service.dropoff_location || '-'} />
          <DetailLine label="메모" value={service.memo || service.note || service.request_note || '-'} />
          <DetailLine label="총 금액" value={<span className="font-bold text-blue-700">{formatMoney(Number(service.totalPrice || service.total_price || 0))}</span>} />
        </div>
      )}

      {type === 'ticket' && (
        <div className="space-y-0.5">
          <DetailLine label="티켓명" value={service.ticketName || service.ticket_name || service.program_selection || '-'} />
          <DetailLine label="유형" value={service.ticketType || service.ticket_type || '-'} />
          <DetailLine label="이용일자" value={service.usageDate || service.usage_date || '-'} />
          <DetailLine label="수량" value={`${Number(service.ticketQuantity || service.ticket_quantity || 0)}매`} />
          <DetailLine label="셔틀" value={service.shuttle_required ? '신청함' : '신청 안함'} />
          <DetailLine label="픽업장소" value={service.pickupLocation || service.pickup_location || '-'} />
          <DetailLine label="하차장소" value={service.dropoffLocation || service.dropoff_location || '-'} />
          <DetailLine label="총 금액" value={<span className="font-bold text-blue-700">{formatMoney(Number(service.totalPrice || service.total_price || 0))}</span>} />
        </div>
      )}

      {type === 'rentcar' && (
        <div className="space-y-0.5">
          <DetailLine label="차량 타입" value={service.carType || '-'} />
          <DetailLine label="경로" value={service.route || '-'} />
          <DetailLine label="이용방식" value={service.category || service.way_type || '-'} />
          <DetailLine label="차량 수" value={`${Number(service.carCount ?? service.car_count ?? 0)}대`} />
          <DetailLine label="탑승 인원" value={`${Number(service.passengerCount ?? service.passenger_count ?? 0)}명`} />
          <DetailLine label="수하물" value={Number(service.luggageCount ?? service.luggage_count ?? 0) > 0 ? `${Number(service.luggageCount ?? service.luggage_count)}개` : '-'} />
          <DetailLine label="차량번호" value={service.dispatchCode || service.dispatch_code || '-'} />
          <DetailLine label="픽업 시간" value={service.pickupDatetime || service.pickup_datetime ? formatDatetimeOffset(service.pickupDatetime || service.pickup_datetime) : '-'} />
          <DetailLine label="픽업장소" value={service.pickupLocation || service.pickup_location || '-'} />
          <DetailLine label="드롭장소" value={service.destination || service.dropoffLocation || service.dropoff_location || '-'} />
          <DetailLine label="경유지" value={service.viaLocation || service.via_location || '-'} />
          <DetailLine label="대기" value={service.viaWaiting || service.via_waiting || '-'} />
          <DetailLine label="리턴 시간" value={service.returnDatetime || service.return_datetime ? formatDatetimeOffset(service.returnDatetime || service.return_datetime) : '-'} />
          <DetailLine label="리턴 픽업" value={service.returnPickupLocation || service.return_pickup_location || '-'} />
          <DetailLine label="리턴 드롭" value={service.returnDestination || service.return_destination || '-'} />
          <DetailLine label="리턴 경유" value={service.returnViaLocation || service.return_via_location || '-'} />
          <DetailLine label="리턴 대기" value={service.returnViaWaiting || service.return_via_waiting || '-'} />
          <DetailLine label="총 금액" value={<span className="font-bold text-blue-700">{formatMoney(Number(service.totalPrice || service.total_price || 0))}</span>} />
        </div>
      )}

      {type === 'sht' && (
        <div className="space-y-0.5">
          <DetailLine label="승차일" value={service.usageDate ? formatDateOnlyKst(service.usageDate) : '-'} />
          <DetailLine label="차량번호" value={service.vehicleNumber || service.vehicle_number || '-'} />
          <DetailLine label="좌석" value={service.seatNumber || service.seat_number || '-'} />
          <DetailLine label="픽업장소" value={service.pickupLocation || service.pickup_location || '-'} />
          <DetailLine label="드롭장소" value={service.dropoffLocation || service.dropoff_location || '-'} />
          <DetailLine label="단가" value={formatMoney(Number(service.unitPrice || service.unit_price || 0))} />
          <DetailLine label="총 금액" value={<span className="font-bold text-blue-700">{formatMoney(Number(service.totalPrice || service.car_total_price || 0))}</span>} />
        </div>
      )}

      {type === 'package' && (
        <div className="space-y-0.5">
          <DetailLine label="패키지" value={service.package_name || service.package_code || '-'} />
          <DetailLine label="인원" value={`성인 ${Number(service.re_adult_count || 0)} / 아동 ${Number(service.re_child_count || 0)}`} />
          <DetailLine label="등록일" value={service.re_created_at ? formatDateOnlyKst(service.re_created_at) : '-'} />
          <DetailLine label="패키지 총액" value={<span className="font-bold text-indigo-700">{formatMoney(getReservationStoredAmount(service))}</span>} />
        </div>
      )}

      {type === 'cruise' && cruiseAmountRows.length > 0 && (
        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2">
          <div className="mb-1 text-[11px] font-semibold text-blue-700 whitespace-nowrap">요금 내역</div>
          <div className="space-y-1">
            {cruiseAmountRows.map((row, idx) => (
              <div key={`cruise-amt-${idx}`} className="flex items-center justify-between text-[11px]">
                <span className="text-amber-900">{row.label}</span>
                <span className={`font-semibold ${row.amount < 0 ? 'text-indigo-700' : 'text-amber-900'}`}>
                  {row.amount < 0 ? `-${formatMoney(-row.amount)}` : formatMoney(row.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      {type !== 'cruise' && amountSummaryLines.length > 0 && (
        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2">
          <div className="mb-1 text-[11px] font-semibold text-blue-700 whitespace-nowrap">요금 내역</div>
          <div className="space-y-0.5">
            {amountSummaryLines.map((line, idx) => (
              <div key={`${type}-amount-${idx}`} className="text-[11px] text-amber-900">{line}</div>
            ))}
          </div>
        </div>
      )}

      {!isPackageService && !isShtDropoff && (additionalFeeItems.length > 0 || manualAdditionalFee !== 0 || manualAdditionalFeeDetail) && (
        <div className="mt-2 rounded bg-rose-50/70 p-2 text-[11px]">
          <div className="mb-1 text-[11px] font-semibold text-blue-700 whitespace-nowrap">추가/차감</div>
          {additionalFeeItems.length > 0 ? (
            <div className="space-y-0.5">
              {additionalFeeItems.map((item: any, idx: number) => (
                <div key={idx} className="flex items-center justify-between">
                  <span className="text-rose-800">{item?.name || '추가내역'}</span>
                  <span className="font-semibold text-rose-700">{formatSignedAmount(Number(item?.amount || 0))}</span>
                </div>
              ))}
            </div>
          ) : (
            <>
              {manualAdditionalFee !== 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-rose-800">{manualAdditionalFeeDetail || '합계'}</span>
                  <span className="font-semibold text-rose-700">{formatSignedAmount(manualAdditionalFee)}</span>
                </div>
              )}
              {manualAdditionalFeeDetail && manualAdditionalFee === 0 && (
                <div className="whitespace-pre-line text-rose-700">{manualAdditionalFeeDetail}</div>
              )}
            </>
          )}
        </div>
      )}

      {getFilteredNoteText(service.note || service.request_note || service.requestNote || '') && (
        <div className="mt-2 rounded bg-gray-50 p-2 text-[11px] text-gray-700 whitespace-pre-line">
          <span className="font-semibold text-blue-700">비고: </span>{getFilteredNoteText(service.note || service.request_note || service.requestNote || '')}
        </div>
      )}
    </div>
  );
}

export default function ReservationDetailModal({
  isOpen,
  onClose,
  onEdit,
  onProcess,
  onGenerateConfirmation,
  onDeleteService,
  processLabel,
  processDisabled,
  processLoading,
  item,
  items,
  modalTitle,
}: {
  isOpen: boolean;
  onClose: () => void;
  onEdit?: (item: any) => void;
  onProcess?: () => void;
  onGenerateConfirmation?: () => void;
  onDeleteService?: (service: any) => Promise<void> | void;
  processLabel?: string;
  processDisabled?: boolean;
  processLoading?: boolean;
  item: any;
  items?: any[];
  modalTitle?: string;
}) {
  const [sortMode, setSortMode] = useState<SortMode>('type');
  const [enrichedServices, setEnrichedServices] = useState<any[]>([]);
  const [isEnriching, setIsEnriching] = useState(false);
  const [deletingReservationId, setDeletingReservationId] = useState<string | null>(null);

  const groupedItems = useMemo(() => {
    if (!item) return [];
    const base = items && items.length > 0 ? items : [item];
    return base.map((s: any) => ({ ...s, serviceType: getServiceType(s) }));
  }, [item, items]);

  const visibleServices = useMemo(
    () => (enrichedServices || []).filter((service) => !shouldHideDuplicateShuttleVehicle(service)),
    [enrichedServices],
  );

  useEffect(() => {
    if (!isOpen || groupedItems.length === 0) {
      setEnrichedServices(groupedItems);
      return;
    }

    const enrich = async () => {
      setIsEnriching(true);
      try {
        const airportCodes = groupedItems.filter((s) => s.serviceType === 'airport' && s.airport_price_code).map((s) => s.airport_price_code);
        const cruiseCodes = groupedItems.filter((s) => s.serviceType === 'cruise' && s.room_price_code).map((s) => s.room_price_code);
        const hotelCodes = groupedItems.filter((s) => s.serviceType === 'hotel' && s.hotel_price_code).map((s) => s.hotel_price_code);
        const rentCodes = groupedItems
          .filter(
            (s) =>
              (s.serviceType === 'rentcar' && s.rentcar_price_code) ||
              ((s.serviceType === 'vehicle' || s.serviceType === 'car') && (s.rentcar_price_code || s.car_price_code)),
          )
          .map((s) => String(s.rentcar_price_code || s.car_price_code || '').trim())
          .filter(Boolean);
        const tourCodes = groupedItems.filter((s) => s.serviceType === 'tour' && s.tour_price_code).map((s) => s.tour_price_code);
        const reservationIds = Array.from(new Set(groupedItems
          .flatMap((s) => [s?.reservation_id, s?.reservationId, s?.reservation?.re_id, s?.re_id])
          .map((id) => String(id || '').trim())
          .filter(Boolean)));

        const [cruiseRates, airportPrices, hotelPrices, rentPrices, tourPrices, reservationRows, changeRequests] = await Promise.all([
          cruiseCodes.length > 0
            ? supabase
              .from('cruise_rate_card')
              .select('id, cruise_name, room_type, schedule_type, price_adult, price_child, price_child_older, price_child_extra_bed, price_infant, price_extra_bed, price_single')
              .in('id', cruiseCodes)
            : Promise.resolve({ data: [] }),
          airportCodes.length > 0 ? supabase.from('airport_price').select('airport_code, service_type, route, vehicle_type').in('airport_code', airportCodes) : Promise.resolve({ data: [] }),
          hotelCodes.length > 0 ? supabase.from('hotel_price').select('hotel_price_code, hotel_name, room_type, room_name').in('hotel_price_code', hotelCodes) : Promise.resolve({ data: [] }),
          rentCodes.length > 0 ? supabase.from('rentcar_price').select('rent_code, vehicle_type, way_type, route, price, capacity').in('rent_code', rentCodes) : Promise.resolve({ data: [] }),
          tourCodes.length > 0 ? supabase.from('tour_pricing').select('pricing_id, price_per_person, vehicle_type, min_guests, max_guests, tour:tour_id(tour_name, tour_code)').in('pricing_id', tourCodes) : Promise.resolve({ data: [] }),
          reservationIds.length > 0 ? supabase.from('reservation').select('re_id, total_amount, manual_additional_fee, manual_additional_fee_detail, price_breakdown').in('re_id', reservationIds) : Promise.resolve({ data: [] }),
          reservationIds.length > 0
            ? supabase
              .from('reservation_change_request')
              .select('id, reservation_id, re_type, status, submitted_at, snapshot_data')
              .in('reservation_id', reservationIds)
              .not('status', 'in', '(rejected,cancelled)')
              .order('submitted_at', { ascending: false })
            : Promise.resolve({ data: [] }),
        ]);

        const roomPriceMap = new Map<string, any>();
        for (const row of cruiseRates.data || []) {
          const id = String(row?.id || '').trim();
          const roomType = String(row?.room_type || '').trim();
          if (id) roomPriceMap.set(id, row);
          if (roomType && !roomPriceMap.has(roomType)) roomPriceMap.set(roomType, row);
        }
        const airportPriceMap = new Map((airportPrices.data || []).map((r: any) => [r.airport_code, r]));
        const hotelPriceMap = new Map((hotelPrices.data || []).map((r: any) => [r.hotel_price_code, r]));
        const rentPriceMap = new Map<string, any>();
        for (const row of rentPrices.data || []) {
          const rawCode = String(row?.rent_code || '').trim();
          const upperCode = rawCode.toUpperCase();
          if (rawCode) rentPriceMap.set(rawCode, row);
          if (upperCode && upperCode !== rawCode) rentPriceMap.set(upperCode, row);
        }
        const tourPriceMap = new Map((tourPrices.data || []).map((r: any) => [r.pricing_id, r]));
        const reservationMap = new Map((reservationRows.data || []).map((r: any) => [r.re_id, r]));

        const promoReservationIds = reservationIds.filter((reservationId) => {
          const reservationPb = reservationMap.get(reservationId)?.price_breakdown;
          if (hasPromotionBreakdown(reservationPb)) return true;
          return groupedItems.some((s: any) => {
            const rid = String(s?.reservation_id || s?.reservationId || s?.reservation?.re_id || s?.re_id || '').trim();
            return rid === reservationId && hasPromotionBreakdown(getServicePriceBreakdown(s));
          });
        });

        let promotionSequenceMap = new Map<string, number>();
        if (promoReservationIds.length > 0) {
          try {
            promotionSequenceMap = await fetchPromotionSequenceMap(promoReservationIds);
          } catch (seqErr) {
            console.warn('모바일 프로모션 순번 조회 실패:', seqErr);
          }
        }

        const latestChangeMap = new Map<string, any>();
        for (const req of (changeRequests.data || []) as any[]) {
          const reservationId = String(req?.reservation_id || '').trim();
          if (!reservationId || latestChangeMap.has(reservationId)) continue;
          latestChangeMap.set(reservationId, req);
        }

        const requestIdsByReType = new Map<string, string[]>();
        for (const row of latestChangeMap.values()) {
          const reType = String(row?.re_type || '').toLowerCase();
          const requestId = String(row?.id || '').trim();
          if (!reType || !requestId) continue;
          if (!requestIdsByReType.has(reType)) requestIdsByReType.set(reType, []);
          requestIdsByReType.get(reType)?.push(requestId);
        }

        const detailEntries = Array.from(requestIdsByReType.entries())
          .map(([reType, ids]) => {
            const tableName = CHANGE_TABLE_BY_TYPE[reType];
            if (!tableName || ids.length === 0) return null;
            return [reType, supabase.from(tableName).select('*').in('request_id', ids)] as const;
          })
          .filter(Boolean) as Array<readonly [string, any]>;

        const detailResults = await Promise.all(detailEntries.map(([, query]) => query));
        const changeDetailByRequestId = new Map<string, any[]>();
        for (const result of detailResults as any[]) {
          for (const row of (result?.data || []) as any[]) {
            const requestId = String(row?.request_id || '').trim();
            if (!requestId) continue;
            const current = changeDetailByRequestId.get(requestId) || [];
            current.push(row);
            changeDetailByRequestId.set(requestId, current);
          }
        }

        const enriched = groupedItems.map((service) => {
          const reservationId = String(service.reservation_id || service.reservationId || '').trim();
          const promoSeqFromMap = reservationId ? promotionSequenceMap.get(reservationId) : undefined;
          const reservationInfo: any = reservationId ? reservationMap.get(reservationId) : null;
          const latestChange = reservationId ? latestChangeMap.get(reservationId) : null;
          const snapshot = latestChange?.snapshot_data || null;

          const serviceWithReservation = reservationInfo
            ? {
              ...service,
              reservation_total_amount: snapshot?.total_amount ?? reservationInfo.total_amount,
              reservation_manual_additional_fee: snapshot?.manual_additional_fee ?? reservationInfo.manual_additional_fee,
              reservation_manual_additional_fee_detail: snapshot?.manual_additional_fee_detail ?? reservationInfo.manual_additional_fee_detail,
              reservation_price_breakdown: snapshot?.price_breakdown ?? reservationInfo.price_breakdown,
              reservation: {
                ...(service?.reservation || {}),
                ...reservationInfo,
                total_amount: snapshot?.total_amount ?? reservationInfo.total_amount,
                manual_additional_fee: snapshot?.manual_additional_fee ?? reservationInfo.manual_additional_fee,
                manual_additional_fee_detail: snapshot?.manual_additional_fee_detail ?? reservationInfo.manual_additional_fee_detail,
                price_breakdown: snapshot?.price_breakdown ?? reservationInfo.price_breakdown,
              },
              _hasChange: !!latestChange,
              _changeStatus: latestChange?.status || null,
            }
            : {
              ...service,
              _hasChange: !!latestChange,
              _changeStatus: latestChange?.status || null,
            };

          const changeType = SERVICE_TO_CHANGE_TYPE[String(serviceWithReservation.serviceType || '').toLowerCase()];
          const applicableChildren = CHANGE_CHILDREN_BY_RETYPE[String(latestChange?.re_type || '').toLowerCase()] || [];
          const canOverlay = !!latestChange && !!changeType && applicableChildren.includes(changeType);
          const changeRows = canOverlay ? (changeDetailByRequestId.get(String(latestChange?.id || '')) || []) : [];
          const matchedChange = pickChangeDetailRow(serviceWithReservation, changeRows);
          const mergedWithChange = matchedChange
            ? {
              ...serviceWithReservation,
              ...matchedChange,
              _hasChange: true,
              _changeStatus: latestChange?.status || null,
            }
            : serviceWithReservation;

          const baseService = {
            ...mergedWithChange,
            note: mergedWithChange.note || mergedWithChange.request_note || mergedWithChange.requestNote || '',
          };

          if (promoSeqFromMap) {
            baseService.promotion_sequence = Number(baseService.promotion_sequence || promoSeqFromMap) || null;
            if (baseService.price_breakdown && !baseService.price_breakdown.promotion_sequence) {
              baseService.price_breakdown = { ...baseService.price_breakdown, promotion_sequence: promoSeqFromMap };
            }
            if (baseService.priceBreakdown && !baseService.priceBreakdown.promotion_sequence) {
              baseService.priceBreakdown = { ...baseService.priceBreakdown, promotion_sequence: promoSeqFromMap };
            }
            if (baseService.reservation_price_breakdown && !baseService.reservation_price_breakdown.promotion_sequence) {
              baseService.reservation_price_breakdown = { ...baseService.reservation_price_breakdown, promotion_sequence: promoSeqFromMap };
            }
            if (baseService.reservation?.price_breakdown && !baseService.reservation.price_breakdown.promotion_sequence) {
              baseService.reservation = {
                ...baseService.reservation,
                price_breakdown: { ...baseService.reservation.price_breakdown, promotion_sequence: promoSeqFromMap },
              };
            }
          }

          if (baseService.serviceType === 'airport' && baseService.airport_price_code) {
            const priceInfo: any = airportPriceMap.get(baseService.airport_price_code);
            return {
              ...baseService,
              route: priceInfo?.route || baseService.route || '-',
              carType: priceInfo?.vehicle_type || baseService.carType || '-',
              category: priceInfo?.service_type || baseService.category || '-',
              flightNumber: baseService.flightNumber || baseService.ra_flight_number || '-',
              passengerCount: Number(baseService.passengerCount ?? baseService.ra_passenger_count ?? 0),
              carCount: Number(baseService.carCount ?? baseService.ra_car_count ?? 0),
              stopover: baseService.stopover || baseService.ra_stopover_location || '-',
            };
          }

          if (baseService.serviceType === 'cruise' && baseService.room_price_code) {
            const roomInfo: any = roomPriceMap.get(String(baseService.room_price_code || '').trim());
            return {
              ...baseService,
              cruiseName: roomInfo?.cruise_name || baseService.cruiseName || baseService.cruise || '-',
              cruise: roomInfo?.cruise_name || baseService.cruise || '-',
              roomType: roomInfo?.room_type || baseService.roomType || baseService.room_price_code || '-',
              scheduleType: baseService.scheduleType || baseService.schedule_type || roomInfo?.schedule_type || baseService.schedule_days || baseService.days || baseService.nights || '',
              paymentMethod: baseService.paymentMethod || baseService.payment_method || baseService.reservation?.payment_method || '-',
              priceAdult: Number(baseService.priceAdult ?? baseService.price_adult ?? roomInfo?.price_adult ?? 0),
              priceChild: Number(baseService.priceChild ?? baseService.price_child ?? roomInfo?.price_child ?? 0),
              priceChildOlder: Number(baseService.priceChildOlder ?? baseService.price_child_older ?? roomInfo?.price_child_older ?? roomInfo?.price_child ?? 0),
              priceChildExtraBed: Number(baseService.priceChildExtraBed ?? baseService.price_child_extra_bed ?? roomInfo?.price_child_extra_bed ?? 0),
              priceInfant: Number(baseService.priceInfant ?? baseService.price_infant ?? roomInfo?.price_infant ?? 0),
              priceExtraBed: Number(baseService.priceExtraBed ?? baseService.price_extra_bed ?? roomInfo?.price_extra_bed ?? 0),
              priceSingle: Number(baseService.priceSingle ?? baseService.price_single ?? roomInfo?.price_single ?? 0),
            };
          }

          if (baseService.serviceType === 'vehicle' || baseService.serviceType === 'car') {
            const vehicleCode = String(baseService.rentcar_price_code || baseService.car_price_code || '').trim();
            const vehiclePriceInfo: any = vehicleCode
              ? rentPriceMap.get(vehicleCode) || rentPriceMap.get(vehicleCode.toUpperCase())
              : null;
            return {
              ...baseService,
              carCategory: baseService.carCategory || baseService.way_type || baseService.category || vehiclePriceInfo?.way_type || '-',
              carType: baseService.carType || baseService.vehicle_type || vehiclePriceInfo?.vehicle_type || baseService.car_price_code || '-',
              route: baseService.route || vehiclePriceInfo?.route || '-',
              passengerCount: Number(baseService.passengerCount ?? baseService.passenger_count ?? 0),
              pickupDatetime: baseService.pickupDatetime || baseService.pickup_datetime || '-',
              pickupLocation: baseService.pickupLocation || baseService.pickup_location || '-',
              dropoffLocation: baseService.dropoffLocation || baseService.dropoff_location || '-',
              totalPrice: Number(baseService.totalPrice ?? baseService.car_total_price ?? 0),
            };
          }

          if (baseService.serviceType === 'rentcar' && baseService.rentcar_price_code) {
            const rentCode = String(baseService.rentcar_price_code || '').trim();
            const priceInfo: any = rentPriceMap.get(rentCode) || rentPriceMap.get(rentCode.toUpperCase());
            return {
              ...baseService,
              route: priceInfo?.route || baseService.route || '-',
              carType: priceInfo?.vehicle_type || baseService.vehicle_type || baseService.carType || '-',
              category: priceInfo?.way_type || baseService.category || '-',
              carCount: Number(baseService.carCount ?? baseService.car_count ?? 0),
              passengerCount: Number(baseService.passengerCount ?? baseService.passenger_count ?? 0),
              luggageCount: Number(baseService.luggageCount ?? baseService.luggage_count ?? 0),
              pickupDatetime: baseService.pickupDatetime || baseService.pickup_datetime || null,
              pickupLocation: baseService.pickupLocation || baseService.pickup_location || '-',
              dropoffLocation: baseService.dropoffLocation || baseService.dropoff_location || baseService.destination || '-',
            };
          }

          if (baseService.serviceType === 'hotel') {
            const priceInfo: any = hotelPriceMap.get(baseService.hotel_price_code);
            const rawHotelName = String(baseService.hotelName || baseService.hotel_name || '').trim() || null;
            const scheduleRaw = String(baseService.schedule ?? '').trim();
            const scheduleNights = Number.parseInt(scheduleRaw, 10);
            const normalizedNights = Number.isFinite(scheduleNights)
              ? scheduleNights
              : Number(baseService.nights ?? baseService.days ?? baseService.room_count ?? 0);
            return {
              ...baseService,
              hotelName: priceInfo?.hotel_name || baseService.hotelName || baseService.hotel_name || baseService.hotel_category || '-',
              hotelNameRaw: rawHotelName,
              roomName: priceInfo?.room_name || baseService.roomName || baseService.room_name || null,
              roomType: priceInfo?.room_name || priceInfo?.room_type || baseService.roomType || baseService.room_type || '-',
              checkinDate: baseService.checkinDate || baseService.checkin_date || '-',
              schedule: scheduleRaw,
              days: normalizedNights,
              nights: normalizedNights,
              guestCount: Number(baseService.guestCount ?? baseService.guest_count ?? 0),
              roomCount: Number(baseService.roomCount ?? baseService.room_count ?? 0),
              totalPrice: Number(baseService.totalPrice ?? baseService.total_price ?? 0),
            };
          }

          if (baseService.serviceType === 'tour') {
            const priceInfo: any = tourPriceMap.get(baseService.tour_price_code);
            const enrichedTourType = (() => {
              if (baseService.tourType && !/^[0-9a-f-]{36}$/i.test(String(baseService.tourType))) return baseService.tourType;
              if (!priceInfo) return baseService.tourType || null;
              const vt = String(priceInfo.vehicle_type || '').trim();
              const min = Number(priceInfo.min_guests || 0);
              const max = Number(priceInfo.max_guests || 0);
              if (vt && min > 0) return `${vt} (${min}~${max}인)`;
              if (vt) return vt;
              if (min > 0) return `${min}~${max}인`;
              return null;
            })();
            return {
              ...baseService,
              carType: priceInfo?.vehicle_type || baseService.carType || baseService.vehicle_type || '-',
              tourName: priceInfo?.tour?.tour_name || baseService.tourName || baseService.tour_name || '-',
              tourType: enrichedTourType,
              tourDate: baseService.tourDate || baseService.usage_date || baseService.usageDate || '-',
              tourCapacity: Number(baseService.tourCapacity ?? baseService.tour_capacity ?? 0),
              pickupLocation: baseService.pickupLocation || baseService.pickup_location || '-',
              dropoffLocation: baseService.dropoffLocation || baseService.dropoff_location || '-',
              totalPrice: Number(baseService.totalPrice ?? baseService.total_price ?? 0),
              unitPrice: Number(baseService.unitPrice ?? baseService.unit_price ?? priceInfo?.price_per_person ?? 0),
            };
          }

          if (baseService.serviceType === 'sht') {
            return {
              ...baseService,
              usageDate: baseService.usageDate || baseService.usage_date || baseService.pickupDatetime || baseService.pickup_datetime || null,
              pickupDatetime: baseService.pickupDatetime || baseService.pickup_datetime || null,
              category: baseService.category || baseService.sht_category || '-',
              vehicleNumber: baseService.vehicleNumber || baseService.vehicle_number || baseService.dispatch_code || '-',
              seatNumber: baseService.seatNumber || baseService.seat_number || '-',
              pickupLocation: baseService.pickupLocation || baseService.pickup_location || '-',
              dropoffLocation: baseService.dropoffLocation || baseService.dropoff_location || '-',
              totalPrice: Number(baseService.totalPrice ?? baseService.car_total_price ?? 0),
              unitPrice: Number(baseService.unitPrice ?? baseService.unit_price ?? 0),
            };
          }

          return baseService;
        });

        setEnrichedServices(enriched);
      } catch (error) {
        console.error('모바일 예약 상세 보강 실패:', error);
        setEnrichedServices(groupedItems);
      } finally {
        setIsEnriching(false);
      }
    };

    enrich();
  }, [groupedItems, isOpen]);

  if (!isOpen || !item) return null;

  const userName = item?.customerName || item?.name || '-';
  const userEnglishName = item?.customerEnglishName || item?.english_name || '-';
  const userPhone = item?.phone || item?.phone_number || '-';
  const userNickname = item?.nickname || '';
  const childBirthDates = Array.isArray(item?.child_birth_dates)
    ? item.child_birth_dates.filter((d: unknown) => typeof d === 'string' && d.trim().length > 0)
    : [];
  const reservationDateSource = item?.re_created_at || item?.created_at || groupedItems?.[0]?.reservation?.re_created_at || null;
  const reservationDateText = formatDateOnlyKst(reservationDateSource);
  const groupKey = item?.source === 'sh'
    ? `주문번호 ${item?.orderId || '-'}`
    : `견적ID ${item?.quoteId || item?.re_quote_id || item?.quote_id || '-'}`;

  const sortedGroups = (() => {
    const list = visibleServices;
    if (sortMode === 'date') {
      const groups: Record<string, any[]> = {};
      list.forEach((service) => {
        const key = getDateStr(service) || '기타';
        if (!groups[key]) groups[key] = [];
        groups[key].push(service);
      });
      const sortedKeys = Object.keys(groups).sort((a, b) => {
        if (a === '기타') return 1;
        if (b === '기타') return -1;
        return new Date(a).getTime() - new Date(b).getTime();
      });
      return sortedKeys.map((key) => ({
        key,
        title: key === '기타' ? '날짜 미정' : formatDateOnlyKst(key),
        items: groups[key].sort(compareServices),
      }));
    }

    const order = ['cruise', 'vehicle', 'car', 'sht', 'airport', 'tour', 'ticket', 'rentcar', 'hotel', 'package'];
    const groups: Record<string, any[]> = {};
    list.forEach((service) => {
      const type = String(service?.serviceType || '').toLowerCase() || 'unknown';
      if (!groups[type]) groups[type] = [];
      groups[type].push(service);
    });
    const sortedTypes = Object.keys(groups).sort((a, b) => {
      const ai = order.indexOf(a);
      const bi = order.indexOf(b);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
    return sortedTypes.map((type) => ({
      key: type,
      title: getServiceLabel(type),
      items: groups[type].sort(compareServices),
    }));
  })();

  const totalAmount = (() => {
    const reservationTotals = new Map<string, number>();
    let rowFallbackTotal = 0;

    for (const current of visibleServices) {
      const reservationId = String(current?.reservation_id || current?.reservationId || '').trim();
      const serviceType = String(current?.serviceType || '').toLowerCase();

      // 크루즈는 price_breakdown 기반 계산 우선 사용 (DB total_amount는 옵션이 누락된 경우가 있음)
      if (serviceType === 'cruise') {
        const cruiseTotal = getCruiseDisplayTotal(current);
        if (cruiseTotal > 0) {
          if (reservationId && !reservationTotals.has(reservationId)) {
            reservationTotals.set(reservationId, cruiseTotal);
          } else if (!reservationId) {
            rowFallbackTotal += cruiseTotal;
          }
          continue;
        }
      }

      const reservationTotal = getReservationTotalAmount(current);

      if (reservationId && reservationTotal !== null && reservationTotal > 0) {
        if (!reservationTotals.has(reservationId)) {
          reservationTotals.set(reservationId, reservationTotal);
        }
        continue;
      }

      const rowTotal = serviceType === 'cruise'
        ? getCruiseDisplayTotal(current)
        : Number(current?.totalAmount ?? current?.total_amount ?? current?.amount ?? current?.totalPrice ?? current?.total_price ?? current?.room_total_price ?? current?.car_total_price ?? 0);
      if (Number.isFinite(rowTotal)) {
        rowFallbackTotal += rowTotal;
      }
    }

    const reservationTotalSum = Array.from(reservationTotals.values()).reduce((sum, value) => sum + value, 0);
    return reservationTotalSum + rowFallbackTotal;
  })();

  const handleDeleteService = async (service: any) => {
    if (!onDeleteService) return;
    const reservationId = String(service?.reservation_id || service?.reservationId || service?.re_id || '').trim();
    if (!reservationId) return;
    setDeletingReservationId(reservationId);
    try {
      await onDeleteService(service);
    } finally {
      setDeletingReservationId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center pt-0 sm:items-start sm:pt-2">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="relative max-h-[95vh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:max-h-[90vh] sm:w-[96%] sm:max-w-2xl sm:rounded-xl">
        <div className="border-b bg-white px-3 py-2.5 sm:px-4">
          <div className="mb-2 flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 whitespace-nowrap">
                <h2 className="truncate text-base font-semibold text-gray-900">{modalTitle || '예약 통합 상세'}</h2>
                {item.source === 'sh' && <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[11px] font-medium text-gray-700">Old</span>}
                {item.source === 'new' && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700">New</span>}
                <span className="text-xs text-gray-500">연결 서비스 {visibleServices.length}건</span>
              </div>
            </div>
            <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-gray-100">
              <X className="h-5 w-5 text-gray-500" />
            </button>
          </div>

          <div className="rounded-lg border border-blue-200 bg-blue-50 p-2 text-xs text-gray-700">
            <div className="mb-1 flex items-center gap-1 text-blue-700">
              <User className="h-3.5 w-3.5" />
              <span className="font-semibold whitespace-nowrap">예약자 정보</span>
            </div>
            <div className="space-y-0.5">
              <div className="text-xs leading-relaxed text-gray-900"><span className="font-semibold text-blue-700">이름: </span><span className="font-medium text-gray-900">{userName} ({userEnglishName})</span></div>
              {userNickname && <div className="text-xs leading-relaxed text-gray-900"><span className="font-semibold text-blue-700">닉네임: </span><span className="font-medium text-gray-900">{userNickname}</span></div>}
              <div className="text-xs leading-relaxed text-gray-900"><span className="font-semibold text-blue-700">이메일: </span><span className="font-medium text-gray-900">{item?.email || '-'}</span></div>
              <div className="text-xs leading-relaxed text-gray-900"><span className="font-semibold text-blue-700">전화번호: </span><span className="font-medium text-gray-900">{userPhone}</span></div>
              <div className="text-xs leading-relaxed text-gray-900"><span className="font-semibold text-blue-700">예약일: </span><span className="font-medium text-gray-900">{reservationDateText}</span></div>
            </div>
            {childBirthDates.length > 0 && (
              <div className="mt-1.5 border-t border-blue-100 pt-1.5">
                <p className="mb-1 text-[11px] font-medium text-blue-700 whitespace-nowrap">아동 생년월일</p>
                <div className="flex flex-wrap gap-1">
                  {childBirthDates.map((date: string, index: number) => (
                    <span
                      key={`${date}-${index}`}
                      className="rounded-full border border-blue-200 bg-white px-2 py-0.5 text-[11px] text-blue-700 whitespace-nowrap"
                    >
                      아동 {index + 1}: {date}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="mt-2 flex gap-1.5">
            <button
              onClick={() => setSortMode('date')}
              className={`h-8 rounded-full px-3 text-xs font-medium whitespace-nowrap ${sortMode === 'date' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}
            >
              일자별
            </button>
            <button
              onClick={() => setSortMode('type')}
              className={`h-8 rounded-full px-3 text-xs font-medium whitespace-nowrap ${sortMode === 'type' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}
            >
              종류별
            </button>
          </div>
        </div>

        <div className="bg-gray-50 px-2 py-2">
          {isEnriching ? (
            <div className="flex h-48 flex-col items-center justify-center gap-2">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />
              <p className="text-xs text-gray-500">서비스 정보를 불러오는 중...</p>
            </div>
          ) : sortedGroups.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center gap-2 text-gray-400">
              <Calendar className="h-8 w-8" />
              <p className="text-xs">예약 내역이 없습니다.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sortedGroups.map((group) => (
                <div key={group.key} className="rounded-lg border border-gray-200 bg-white p-2.5">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex min-w-0 items-center gap-1.5">
                      {sortMode === 'date' ? <Clock className="h-4 w-4 text-gray-500" /> : getServiceIcon(group.key)}
                      <h3 className="truncate whitespace-nowrap text-sm font-semibold text-gray-800">{group.title}</h3>
                    </div>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600 whitespace-nowrap">{group.items.length}건</span>
                  </div>
                  <div className="space-y-2">
                    {group.items.map((service, idx) => (
                      <ServiceCard
                        key={`${service?.reservation_id || service?.reservationId || 'service'}-${idx}`}
                        service={service}
                        onDeleteService={onDeleteService ? handleDeleteService : undefined}
                        deletingReservationId={deletingReservationId}
                      />
                    ))}
                  </div>
                </div>
              ))}

              <div className="rounded-lg border border-blue-200 bg-blue-50 p-2.5">
                <div className="mb-1 flex items-center gap-1 text-blue-700">
                  <Wallet className="h-4 w-4" />
                  <span className="text-xs font-semibold whitespace-nowrap">예상 총 금액</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-blue-700">합계</span>
                  <span className="text-sm font-bold text-blue-700">{formatMoney(totalAmount)}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="border-t bg-white px-3 py-2.5">
          <div className={`grid gap-2 ${onProcess && onGenerateConfirmation ? 'grid-cols-3' : onProcess || onGenerateConfirmation ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <button
              type="button"
              onClick={() => onEdit?.(item)}
              disabled={!onEdit}
              className="h-12 w-full rounded-lg bg-blue-600 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300 whitespace-nowrap"
            >
              수정
            </button>
            {onProcess && (
              <button
                type="button"
                onClick={onProcess}
                disabled={!!processDisabled}
                className="h-12 w-full rounded-lg bg-green-600 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-300 whitespace-nowrap"
              >
                {processLoading ? '처리중...' : (processLabel || '처리')}
              </button>
            )}
            {onGenerateConfirmation && (
              <button
                type="button"
                onClick={onGenerateConfirmation}
                className="h-12 w-full rounded-lg bg-violet-600 text-sm font-semibold text-white transition-colors hover:bg-violet-700 whitespace-nowrap"
              >
                확인서 생성
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
