'use client';

import React, { useState, useEffect } from 'react';
import { X, Ship, Plane, Building, MapPin, Car, Users, Wallet, Calendar, Clock, CheckCircle, AlertCircle, XCircle, Package, FileText } from 'lucide-react';
import supabase from '@/lib/supabase';
import ShtCarSeatMap from '@/components/ShtCarSeatMap';
import { getReservationStoredAmount } from '@sht/domain/reservation';
import { fetchPromotionSequenceMap } from '@/lib/promotionSequence';

interface UserReservationDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    userInfo: any;
    allUserServices: any[];
    loading: boolean;
}

// 시간 표시는 항상 KST 기준으로 통일 (수동 +8/+9 보정 금지)
function formatDatetimeOffset(value: any, dateValue?: any, timeValue?: any): string {
    const rawValue = String(value ?? '').trim();
    const rawDate = String(dateValue ?? '').trim();
    const rawTime = String(timeValue ?? '').trim();
    const raw = (() => {
        if (rawValue) {
            const normalized = rawValue.replace(' ', 'T');
            const hasTime = /T\d{2}:\d{2}/.test(normalized) || /\d{2}:\d{2}/.test(normalized);
            if (hasTime || (!rawDate && !rawTime)) return rawValue;
        }
        if (rawDate && rawTime) return `${rawDate}T${rawTime}`;
        return rawValue || rawDate || rawTime;
    })();

    if (!raw) return '-';

    const hasTimezone = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(raw);

    // timezone 정보가 없는 문자열은 값 자체를 KST 시각으로 간주해 그대로 표시
    if (!hasTimezone) {
        const normalized = raw.replace(' ', 'T');
        const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
        if (match) {
            const [, year, month, day, hourStr, minute] = match;
            const hour24 = Number(hourStr);
            const ampm = hour24 >= 12 ? '오후' : '오전';
            const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
            const hour12Text = String(hour12).padStart(2, '0');
            return `${year}. ${month}. ${day}. ${ampm} ${hour12Text}:${minute}`;
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

function formatCruiseScheduleLabel(value: any): string {
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
}

const isInfantSurchargeText = (text: string): boolean => {
    return /유아|infant|2세\s*미만|3번째|2인째/i.test(text || '');
};

const getChargeableInfantCountFromText = (infantCount: number, text: string): number => {
    if (/3번째/.test(text)) return Math.max(0, infantCount - 2);
    if (/2인째/.test(text)) return Math.max(0, infantCount - 1);
    return Math.max(0, infantCount);
};

const normalizeCruisePriceBreakdown = (pb: any, infantCount: number) => {
    if (!pb || !Array.isArray(pb.surcharges)) return pb;

    const normalizedSurcharges = pb.surcharges.map((s: any) => {
        const label = String(s?.holiday_name || '');
        if (!isInfantSurchargeText(label)) return s;

        const chargeableInfants = getChargeableInfantCountFromText(infantCount, label);
        const unit = Number(s?.surcharge_adult ?? s?.surcharge_child ?? 0);
        return {
            ...s,
            adult_count: 0,
            child_count: 0,
            infant_count: chargeableInfants,
            total: unit * chargeableInfants,
        };
    });

    const surchargeTotal = normalizedSurcharges
        .filter((s: any) => s?.is_confirmed !== false)
        .reduce((sum: number, s: any) => sum + Number(s?.total || 0), 0);

    const subtotal = Number(pb?.subtotal || 0);
    const optionTotal = Number(pb?.options_total ?? pb?.option_total ?? 0);

    const computedGrandTotal = subtotal + surchargeTotal + optionTotal;

    return {
        ...pb,
        surcharges: normalizedSurcharges,
        surcharge_total: surchargeTotal,
        grand_total: Number.isFinite(Number(pb?.grand_total)) ? Number(pb.grand_total) : computedGrandTotal,
    };
};

const formatSignedAmount = (amount: number): string => `${amount > 0 ? '+' : ''}${amount.toLocaleString()}동`;

const getServicePriceBreakdown = (service: any) => (
    service?.priceBreakdown
    || service?.price_breakdown
    || service?.reservation_price_breakdown
    || service?.reservation?.price_breakdown
    || null
);

const normalizePricingSource = (value: any): 'manual_override' | 'promotion' | 'normal' => {
    const v = String(value || '').trim().toLowerCase();
    if (v === 'manual_override' || v === 'promotion' || v === 'normal') return v;
    return 'normal';
};

const getServicePricingSource = (service: any): 'manual_override' | 'promotion' | 'normal' => {
    return normalizePricingSource(
        service?._pricingSource
        || service?.pricing_source
        || service?.reservation?.pricing_source,
    );
};

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

const getFilteredNoteText = (note: any): string => {
    if (!note) return '';

    const sanitizedNote = String(note)
        .replace(/\[CHILD_OLDER_COUNTS:[^\]]*\]\s*/gi, '')
        .replace(/\[옵션\s*\d+\][\s\S]*?(?=\n|$)/g, (match) => {
            const hasNewline = match.includes('\n');
            return hasNewline ? '\n' : '';
        })
        .trim();

    const hiddenLinePattern = /^(?:비고\s*:\s*)?(?:\[(?:객실|구성|옵션)\s*\d+\]|(?:객실|구성)\s*\d+\b)/

    const lines = sanitizedNote
        .split('\n')
        .map((line) => line.replace(/\u00A0/g, ' ').trim())
        .filter(Boolean)
        .filter((line) => !hiddenLinePattern.test(line));
    return lines.join('\n').trim();
};

const renderServiceNote = (note: any) => {
    const filteredNote = getFilteredNoteText(note);
    if (!filteredNote) return null;
    return <div className="text-gray-500 text-xs mt-1 bg-gray-50 p-1 rounded whitespace-pre-line">비고: {filteredNote}</div>;
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

const getTicketDisplayQuantity = (service: any): number => {
    const explicitQuantity = Number(service?.ticketQuantity ?? service?.ticket_quantity ?? 0);
    if (explicitQuantity > 0) return explicitQuantity;

    const peopleQuantity = Number(service?.adult_count ?? 0) + Number(service?.child_count ?? 0);
    if (peopleQuantity > 0) return peopleQuantity;

    const shuttleQuantity = Number(service?.shuttle_count ?? 0);
    if (shuttleQuantity > 0) return shuttleQuantity;

    return 0;
};

const getTicketDisplayTotal = (service: any): number => {
    const reservationAmount = getReservationTotalAmount(service);
    if (reservationAmount !== null) return reservationAmount;

    const storedTotal = Number(service?.totalPrice ?? service?.total_price ?? 0);
    if (storedTotal > 0) return storedTotal;

    const quantity = getTicketDisplayQuantity(service);
    const unitPrice = Number(service?.unitPrice ?? service?.unit_price ?? 0);
    if (quantity > 0 && unitPrice > 0) return quantity * unitPrice;

    return 0;
};

const getShtPriceLineLabel = (service: any): string => {
    const priceCode = String(service?.car_price_code || service?.rentcar_price_code || '').trim().toUpperCase();
    if (priceCode.includes('_SOLO_')) return '단독';
    if (priceCode.includes('_A_')) return 'A 좌석';
    if (priceCode.includes('_B_')) return 'BC 좌석';

    const seats = String(service?.seatNumber || service?.seat_number || '')
        .split(/[,;\s]+/)
        .map((seat) => seat.trim().toUpperCase())
        .filter(Boolean);

    if (seats.length > 0 && seats.every((seat) => seat.startsWith('A'))) return 'A 좌석';
    if (seats.length > 0 && seats.every((seat) => seat.startsWith('B') || seat.startsWith('C'))) return 'BC 좌석';
    return '좌석';
};

const buildShtPriceLines = (services: any[]) => {
    return services
        .map((service) => {
            const unitPrice = Number(service?.unitPrice ?? service?.unit_price ?? 0);
            const total = Number(service?.totalPrice ?? service?.car_total_price ?? 0);
            const seats = String(service?.seatNumber || service?.seat_number || '')
                .split(/[,;\s]+/)
                .map((seat) => seat.trim())
                .filter(Boolean);
            const quantity = seats.includes('ALL')
                ? 1
                : Math.max(seats.length, Number(service?.passenger_count || 0), total > 0 && unitPrice > 0 ? Math.round(total / unitPrice) : 0);

            return {
                label: getShtPriceLineLabel(service),
                quantity,
                unitPrice,
                total,
            };
        })
        .filter((line) => line.quantity > 0 || line.total >= 0);
};

const aggregateDisplayServices = (services: any[]) => {
    const aggregated: any[] = [];
    const shtGroupMap = new Map<string, any>();

    services.forEach((service) => {
        if (service?.serviceType !== 'sht') {
            aggregated.push(service);
            return;
        }

        const category = String(service?.category || service?.sht_category || '').trim().toLowerCase();
        const usageDate = String(service?.usageDate || service?.usage_date || '').trim();
        const vehicleNumber = String(service?.vehicleNumber || service?.vehicle_number || '').trim();
        const pickupLocation = String(service?.pickupLocation || service?.pickup_location || '').trim();
        const dropoffLocation = String(service?.dropoffLocation || service?.dropoff_location || '').trim();
        const reservationId = String(service?.reservation_id || service?.reservationId || '').trim();
        const status = String(service?.status || service?.re_status || service?.reservation_status || '').trim().toLowerCase();
        const pricingSource = getServicePricingSource(service);
        const groupingKey = [
            reservationId,
            usageDate,
            category,
            vehicleNumber,
            pickupLocation,
            dropoffLocation,
            status,
            pricingSource,
        ].join('::');

        const existing = shtGroupMap.get(groupingKey);
        if (!existing) {
            const sourceRows = [service];
            const seatNumbers = String(service?.seatNumber || service?.seat_number || '')
                .split(/[,;\s]+/)
                .map((seat) => seat.trim())
                .filter(Boolean);

            const aggregatedService = {
                ...service,
                seatNumber: seatNumbers.join(','),
                totalPrice: Number(service?.totalPrice ?? service?.car_total_price ?? 0),
                unitPrice: 0,
                shtPriceLines: buildShtPriceLines(sourceRows),
                _sourceRows: sourceRows,
            };
            shtGroupMap.set(groupingKey, aggregatedService);
            aggregated.push(aggregatedService);
            return;
        }

        existing._sourceRows.push(service);
        const mergedSeats = [
            ...String(existing.seatNumber || '').split(/[,;\s]+/).map((seat) => seat.trim()).filter(Boolean),
            ...String(service?.seatNumber || service?.seat_number || '').split(/[,;\s]+/).map((seat) => seat.trim()).filter(Boolean),
        ];
        existing.seatNumber = Array.from(new Set(mergedSeats)).join(',');
        existing.totalPrice = existing._sourceRows.reduce((sum: number, row: any) => sum + Number(row?.totalPrice ?? row?.car_total_price ?? 0), 0);
        existing.unitPrice = 0;
        existing.shtPriceLines = buildShtPriceLines(existing._sourceRows);
    });

    return aggregated;
};

const getTicketDisplayLines = (service: any): Array<{ label: string; quantity: number; unitPrice: number; total: number; quantityUnit: string }> => {
    const pb = getServicePriceBreakdown(service);
    const lineItems = Array.isArray(pb?.line_items) ? pb.line_items : [];

    if (lineItems.length > 0) {
        return lineItems.map((item: any) => {
            const rawLabel = String(item?.label || '');
            const label = rawLabel.includes('성인')
                ? '성인요금'
                : rawLabel.includes('아동')
                    ? '아동요금'
                    : rawLabel.includes('셔틀')
                        ? '셔틀요금'
                        : '티켓요금';
            return {
                label,
                quantity: Number(item?.quantity || 0),
                unitPrice: Number(item?.unit_price || 0),
                total: Number(item?.total || 0),
                quantityUnit: '명',
            };
        }).filter((line) => line.quantity > 0 && line.total >= 0);
    }

    const total = getTicketDisplayTotal(service);
    const adultCount = Math.max(0, Number(service?.adultCount ?? service?.adult_count ?? 0));
    const childCount = Math.max(0, Number(service?.childCount ?? service?.child_count ?? 0));
    const shuttleCount = service?.shuttle_required ? Math.max(0, Number(service?.shuttleCount ?? service?.shuttle_count ?? 0)) : 0;
    const genericQuantity = getTicketDisplayQuantity(service);

    const buckets = [
        adultCount > 0 ? { label: '성인요금', quantity: adultCount, quantityUnit: '명' } : null,
        childCount > 0 ? { label: '아동요금', quantity: childCount, quantityUnit: '명' } : null,
        shuttleCount > 0 ? { label: '셔틀요금', quantity: shuttleCount, quantityUnit: '명' } : null,
    ].filter(Boolean) as Array<{ label: string; quantity: number; quantityUnit: string }>;

    if (buckets.length === 1 && total > 0) {
        const bucket = buckets[0];
        const unitPrice = bucket.quantity > 0 ? Math.round(total / bucket.quantity) : 0;
        return [{ ...bucket, unitPrice, total }];
    }

    const fallbackUnitPrice = Number(service?.unitPrice ?? service?.unit_price ?? 0);
    if (fallbackUnitPrice > 0 && genericQuantity > 0 && total > 0) {
        return [{
            label: '티켓요금',
            quantity: genericQuantity,
            unitPrice: Math.round(total / genericQuantity),
            total,
            quantityUnit: '매',
        }];
    }

    return [];
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

const pickChangeDetailRow = (service: any, rows: any[]): any => {
    if (!rows || rows.length === 0) return null;

    const type = String(service?.serviceType || '').toLowerCase();

    // SHT: rows.length 체크 전에 먼저 처리 — category 정확 매칭, 불일치 시 null(폴백 금지)
    if (type === 'sht') {
        const serviceCategoryRaw = String(service?.sht_category || '').toLowerCase();
        const matched = rows.find((r: any) => {
            const rowCategoryRaw = String(r?.sht_category || '').toLowerCase();
            return rowCategoryRaw === serviceCategoryRaw;
        });
        return matched || null;
    }

    if (rows.length === 1) return rows[0];

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

export default function UserReservationDetailModal({
    isOpen,
    onClose,
    userInfo,
    allUserServices,
    loading,
}: UserReservationDetailModalProps) {
    const [sortMode, setSortMode] = useState<'date' | 'type'>('type');
    const [enrichedServices, setEnrichedServices] = useState<any[]>([]);
    const [isEnriching, setIsEnriching] = useState(false);
    const [isShtSeatModalOpen, setIsShtSeatModalOpen] = useState(false);
    const [selectedShtService, setSelectedShtService] = useState<any>(null);

    // 서비스 데이터 보강 (가격 테이블 정보 추가)
    useEffect(() => {
        if (!isOpen || !allUserServices || allUserServices.length === 0) {
            setEnrichedServices(allUserServices || []);
            return;
        }

        const enrichServicesData = async () => {
            setIsEnriching(true);
            try {
                // 1. 각 서비스별 price_code 수집
                const airportCodes = allUserServices
                    .filter(s => s.serviceType === 'airport' && s.airport_price_code)
                    .map(s => s.airport_price_code);
                const cruiseCodes = allUserServices
                    .filter(s => s.serviceType === 'cruise' && s.room_price_code)
                    .map(s => s.room_price_code);
                const hotelCodes = allUserServices
                    .filter(s => s.serviceType === 'hotel' && s.hotel_price_code)
                    .map(s => s.hotel_price_code);
                const rentCodes = allUserServices
                    .filter(
                        s => (s.serviceType === 'rentcar' && s.rentcar_price_code)
                            || ((s.serviceType === 'vehicle' || s.serviceType === 'car') && (s.rentcar_price_code || s.car_price_code)),
                    )
                    .map(s => String(s.rentcar_price_code || s.car_price_code || '').trim())
                    .filter(Boolean);
                const tourCodes = allUserServices
                    .filter(s => s.serviceType === 'tour' && s.tour_price_code)
                    .map(s => s.tour_price_code);
                const reservationIds = Array.from(new Set(
                    allUserServices
                        .flatMap((s: any) => [
                            s?.reservation_id,
                            s?.reservationId,
                            s?.reservation?.re_id,
                            s?.re_id,
                        ])
                        .map((id) => String(id || '').trim())
                        .filter(Boolean)
                ));

                // 크루즈 서비스의 프로모션 코드 수집
                // 2. 가격 테이블 조회
                const [cruiseRates, airportPrices, hotelPrices, rentPrices, tourPrices, reservationRows, changeRequests, cruiseCarDirections] = await Promise.all([
                    cruiseCodes.length > 0
                        ? supabase.from('cruise_rate_card').select('id, cruise_name, room_type, schedule_type, price_adult, price_child, price_child_older, price_child_extra_bed, price_infant, price_extra_bed, price_single').in('id', cruiseCodes)
                        : Promise.resolve({ data: [] }),
                    airportCodes.length > 0
                        ? supabase.from('airport_price').select('airport_code, service_type, route, vehicle_type').in('airport_code', airportCodes)
                        : Promise.resolve({ data: [] }),
                    hotelCodes.length > 0
                        ? supabase.from('hotel_price').select('hotel_price_code, hotel_name, room_type, room_name').in('hotel_price_code', hotelCodes)
                        : Promise.resolve({ data: [] }),
                    rentCodes.length > 0
                        ? supabase.from('rentcar_price').select('rent_code, vehicle_type, way_type, route, price, capacity').in('rent_code', rentCodes)
                        : Promise.resolve({ data: [] }),
                    tourCodes.length > 0
                        ? supabase.from('tour_pricing').select('pricing_id, price_per_person, vehicle_type, tour:tour_id(tour_name, tour_code)').in('pricing_id', tourCodes)
                        : Promise.resolve({ data: [] }),
                    reservationIds.length > 0
                        ? supabase
                            .from('reservation')
                            .select('re_id, total_amount, manual_additional_fee, manual_additional_fee_detail, price_breakdown, pricing_source')
                            .in('re_id', reservationIds)
                        : Promise.resolve({ data: [] }),
                    reservationIds.length > 0
                        ? supabase
                            .from('reservation_change_request')
                            .select('id, reservation_id, re_type, status, submitted_at, snapshot_data')
                            .in('reservation_id', reservationIds)
                            .not('status', 'in', '(rejected,cancelled)')
                            .order('submitted_at', { ascending: false })
                        : Promise.resolve({ data: [] }),
                    reservationIds.length > 0
                        ? supabase
                            .from('reservation_cruise_car')
                            .select('reservation_id, one_way_direction, way_type, created_at')
                            .in('reservation_id', reservationIds)
                            .order('created_at', { ascending: true })
                        : Promise.resolve({ data: [] }),
                ]);

                // 3. Map 생성
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
                    if (rawCode) {
                        rentPriceMap.set(rawCode, row);
                    }
                    if (upperCode && upperCode !== rawCode) {
                        rentPriceMap.set(upperCode, row);
                    }
                }
                const tourPriceMap = new Map((tourPrices.data || []).map((r: any) => [r.pricing_id, r]));
                const reservationMap = new Map((reservationRows.data || []).map((r: any) => [r.re_id, r]));


                const promoReservationIds = reservationIds.filter((reservationId) => {
                    const reservationInfo: any = reservationMap.get(reservationId);
                    return normalizePricingSource(reservationInfo?.pricing_source) === 'promotion';
                });

                let promotionSequenceMap = new Map<string, number>();
                if (promoReservationIds.length > 0) {
                    try {
                        promotionSequenceMap = await fetchPromotionSequenceMap(promoReservationIds);
                    } catch (seqErr) {
                        console.warn('프로모션 순번 조회 실패:', seqErr);
                    }
                }

                const latestChangeMap = new Map<string, any>();
                for (const req of (changeRequests.data || []) as any[]) {
                    const reservationId = String(req?.reservation_id || '').trim();
                    if (!reservationId || latestChangeMap.has(reservationId)) continue;
                    latestChangeMap.set(reservationId, req);
                }

                const requestIdsByReType = new Map<string, Set<string>>();
                for (const row of latestChangeMap.values()) {
                    const reType = String(row?.re_type || '').toLowerCase();
                    const requestId = String(row?.id || '').trim();
                    if (!reType || !requestId) continue;
                    if (!requestIdsByReType.has(reType)) requestIdsByReType.set(reType, new Set());
                    requestIdsByReType.get(reType)!.add(requestId);
                }

                const detailEntries = Array.from(requestIdsByReType.entries())
                    .map(([reType, idSet]) => {
                        const tableName = CHANGE_TABLE_BY_TYPE[reType];
                        const ids = Array.from(idSet);
                        if (!tableName || ids.length === 0) return null;
                        return [
                            reType,
                            supabase.from(tableName).select('*').in('request_id', ids),
                        ] as const;
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

                const missingHotelCodes = Array.from(new Set(
                    Array.from(changeDetailByRequestId.values())
                        .flatMap((rows) => rows || [])
                        .map((row: any) => String(row?.hotel_price_code || '').trim())
                        .filter(Boolean)
                )).filter((code) => !hotelPriceMap.has(code));

                if (missingHotelCodes.length > 0) {
                    const { data: missingHotelPrices } = await supabase
                        .from('hotel_price')
                        .select('hotel_price_code, hotel_name, room_type, room_name')
                        .in('hotel_price_code', missingHotelCodes);

                    for (const row of missingHotelPrices || []) {
                        if (row?.hotel_price_code) {
                            hotelPriceMap.set(row.hotel_price_code, row);
                        }
                    }
                }

                console.log('🔍 Modal - Airport Price Map:', airportPriceMap);
                console.log('🚗 Modal - Rent Price Map:', rentPriceMap);
                console.log('🗺️ Modal - Tour Price Map:', tourPriceMap);

                // 4. 서비스 데이터 보강
                const enriched = allUserServices.map(service => {
                    const reservationId = String(service.reservation_id || service.reservationId || '').trim();
                    const promoSeqFromMap = reservationId ? promotionSequenceMap.get(reservationId) : undefined;
                    const applyPromoSequence = (value: any) => {
                        if (!value || !promoSeqFromMap) return value;
                        const existingSeq = Number((value as any)?.promotion_sequence || 0);
                        if (existingSeq > 0) return value;
                        return { ...value, promotion_sequence: promoSeqFromMap };
                    };
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
                            _pricingSource: normalizePricingSource(reservationInfo?.pricing_source),
                            _hasChange: !!latestChange,
                            _changeStatus: latestChange?.status || null,
                        }
                        : {
                            ...service,
                            _pricingSource: 'normal',
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
                        note: mergedWithChange.note || mergedWithChange.request_note || '',
                    };

                    const normalizedService = {
                        ...baseService,
                        promotion_sequence: Number(baseService?.promotion_sequence || promoSeqFromMap || 0) || null,
                        price_breakdown: applyPromoSequence(baseService?.price_breakdown),
                        priceBreakdown: applyPromoSequence(baseService?.priceBreakdown),
                        reservation_price_breakdown: applyPromoSequence(baseService?.reservation_price_breakdown),
                        reservation: baseService?.reservation
                            ? {
                                ...baseService.reservation,
                                price_breakdown: applyPromoSequence(baseService.reservation?.price_breakdown),
                            }
                            : baseService?.reservation,
                    };

                    if (normalizedService.serviceType === 'airport' && normalizedService.airport_price_code) {
                        const priceInfo: any = airportPriceMap.get(normalizedService.airport_price_code);
                        return {
                            ...normalizedService,
                            route: priceInfo?.route || service.route || '-',
                            carType: priceInfo?.vehicle_type || normalizedService.carType || '-',
                            category: priceInfo?.service_type || normalizedService.category || '-',
                            flightNumber: normalizedService.flightNumber || normalizedService.ra_flight_number || '-',
                            passengerCount: Number(normalizedService.passengerCount ?? normalizedService.ra_passenger_count ?? 0),
                            carCount: Number(normalizedService.carCount ?? normalizedService.ra_car_count ?? 0),
                            stopover: normalizedService.stopover || normalizedService.ra_stopover_location || '-',
                        };
                    }
                    if (normalizedService.serviceType === 'cruise' && normalizedService.room_price_code) {
                        const roomInfo: any = roomPriceMap.get(String(normalizedService.room_price_code || '').trim());
                        return {
                            ...normalizedService,
                            cruiseName: roomInfo?.cruise_name || normalizedService.cruiseName || normalizedService.cruise || '-',
                            cruise: roomInfo?.cruise_name || normalizedService.cruise || '-',
                            roomType: roomInfo?.room_type || normalizedService.roomType || normalizedService.room_price_code || '-',
                            scheduleType: normalizedService.scheduleType || normalizedService.schedule_type || roomInfo?.schedule_type || normalizedService.schedule_days || normalizedService.days || normalizedService.nights || '',
                            paymentMethod: normalizedService.paymentMethod || normalizedService.payment_method || normalizedService.reservation?.payment_method || '-',
                            priceAdult: Number(normalizedService.priceAdult ?? roomInfo?.price_adult ?? 0),
                            priceChild: Number(normalizedService.priceChild ?? roomInfo?.price_child ?? 0),
                            priceChildOlder: Number(normalizedService.priceChildOlder ?? roomInfo?.price_child_older ?? roomInfo?.price_child ?? 0),
                            priceChildExtraBed: Number(normalizedService.priceChildExtraBed ?? roomInfo?.price_child_extra_bed ?? 0),
                            priceInfant: Number(normalizedService.priceInfant ?? roomInfo?.price_infant ?? 0),
                            priceExtraBed: Number(normalizedService.priceExtraBed ?? roomInfo?.price_extra_bed ?? 0),
                            priceSingle: Number(normalizedService.priceSingle ?? roomInfo?.price_single ?? 0),
                        };
                    }
                    if (normalizedService.serviceType === 'vehicle' || normalizedService.serviceType === 'car') {
                        const vehicleCode = String(normalizedService.rentcar_price_code || normalizedService.car_price_code || '').trim();
                        const vehiclePriceInfo: any = vehicleCode
                            ? (rentPriceMap.get(vehicleCode) || rentPriceMap.get(vehicleCode.toUpperCase()))
                            : null;
                        return {
                            ...normalizedService,
                            carCategory: normalizedService.carCategory || normalizedService.way_type || normalizedService.category || vehiclePriceInfo?.way_type || '-',
                            carType: normalizedService.carType || normalizedService.vehicle_type || vehiclePriceInfo?.vehicle_type || '-',
                            route: normalizedService.route || vehiclePriceInfo?.route || '-',
                            passengerCount: Number(normalizedService.passengerCount ?? normalizedService.passenger_count ?? 0),
                            pickupDatetime: normalizedService.pickupDatetime || normalizedService.pickup_datetime || '-',
                            pickupDate: normalizedService.pickupDate || normalizedService.pickup_date || null,
                            pickupTime: normalizedService.pickupTime || normalizedService.pickup_time || null,
                            returnDatetime: normalizedService.returnDatetime || normalizedService.return_datetime || null,
                            returnDate: normalizedService.returnDate || normalizedService.return_date || null,
                            returnTime: normalizedService.returnTime || normalizedService.return_time || null,
                            pickupLocation: normalizedService.pickupLocation || normalizedService.pickup_location || '-',
                            dropoffLocation: normalizedService.dropoffLocation || normalizedService.dropoff_location || '-',
                            totalPrice: Number(normalizedService.totalPrice ?? normalizedService.car_total_price ?? 0),
                        };
                    }
                    if (normalizedService.serviceType === 'rentcar' && normalizedService.rentcar_price_code) {
                        const rentCode = String(normalizedService.rentcar_price_code || '').trim();
                        const priceInfo: any = rentPriceMap.get(rentCode) || rentPriceMap.get(rentCode.toUpperCase());
                        return {
                            ...normalizedService,
                            route: priceInfo?.route || normalizedService.route || '-',
                            carType: priceInfo?.vehicle_type || normalizedService.vehicle_type || normalizedService.carType || '-',
                            category: priceInfo?.way_type || normalizedService.category || '-',
                            carCount: Number(normalizedService.carCount ?? normalizedService.car_count ?? 0),
                            passengerCount: Number(normalizedService.passengerCount ?? normalizedService.passenger_count ?? 0),
                            luggageCount: Number(normalizedService.luggageCount ?? normalizedService.luggage_count ?? 0),
                            pickupDatetime: normalizedService.pickupDatetime || normalizedService.pickup_datetime || null,
                            pickupLocation: normalizedService.pickupLocation || normalizedService.pickup_location || '-',
                            dropoffLocation: normalizedService.dropoffLocation || normalizedService.dropoff_location || normalizedService.destination || '-',
                        };
                    }
                    if (normalizedService.serviceType === 'hotel') {
                        const priceInfo: any = hotelPriceMap.get(normalizedService.hotel_price_code);
                        const scheduleRaw = String(normalizedService.schedule ?? '').trim();
                        const scheduleNights = Number.parseInt(scheduleRaw, 10);
                        const roomCount = Number(normalizedService.roomCount ?? normalizedService.room_count ?? 0);
                        const normalizedNights = Number.isFinite(scheduleNights)
                            ? scheduleNights
                            : Number(normalizedService.nights ?? normalizedService.days ?? normalizedService.room_count ?? 0);
                        const reservationTotalAmount = getReservationTotalAmount(normalizedService);
                        const resolvedTotalPrice = Number(
                            normalizedService.totalPrice
                            ?? normalizedService.total_price
                            ?? reservationTotalAmount
                            ?? 0
                        );
                        const resolvedUnitPrice = Number(
                            normalizedService.unitPrice
                            ?? normalizedService.unit_price
                            ?? (resolvedTotalPrice > 0 && normalizedNights > 0 && roomCount > 0
                                ? Math.round(resolvedTotalPrice / (normalizedNights * roomCount))
                                : 0)
                        );
                        return {
                            ...normalizedService,
                            hotelName: priceInfo?.hotel_name || normalizedService.hotelName || normalizedService.hotel_name || normalizedService.hotel_category || '-',
                            roomType: priceInfo?.room_name || priceInfo?.room_type || normalizedService.roomType || normalizedService.room_type || '-',
                            checkinDate: normalizedService.checkinDate || normalizedService.checkin_date || '-',
                            schedule: scheduleRaw,
                            days: normalizedNights,
                            nights: normalizedNights,
                            guestCount: Number(normalizedService.guestCount ?? normalizedService.guest_count ?? 0),
                            roomCount,
                            adultCount: Number(normalizedService.adultCount ?? normalizedService.adult_count ?? 0),
                            childCount: Number(normalizedService.childCount ?? normalizedService.child_count ?? 0),
                            infantCount: Number(normalizedService.infantCount ?? normalizedService.infant_count ?? 0),
                            unitPrice: resolvedUnitPrice,
                            totalPrice: resolvedTotalPrice,
                        };
                    }
                    if (normalizedService.serviceType === 'tour') {
                        const priceInfo: any = tourPriceMap.get(normalizedService.tour_price_code);
                        return {
                            ...normalizedService,
                            carType: priceInfo?.vehicle_type || normalizedService.carType || normalizedService.vehicle_type || '-',
                            tourName: priceInfo?.tour?.tour_name || normalizedService.tourName || normalizedService.tour_name || '-',
                            tourDate: normalizedService.tourDate || normalizedService.usage_date || normalizedService.usageDate || '-',
                            tourCapacity: Number(normalizedService.tourCapacity ?? normalizedService.tour_capacity ?? 0),
                            pickupLocation: normalizedService.pickupLocation || normalizedService.pickup_location || '-',
                            dropoffLocation: normalizedService.dropoffLocation || normalizedService.dropoff_location || '-',
                            totalPrice: Number(normalizedService.totalPrice ?? normalizedService.total_price ?? 0),
                            unitPrice: Number(normalizedService.unitPrice ?? normalizedService.unit_price ?? priceInfo?.price_per_person ?? 0),
                        };
                    }
                    if (normalizedService.serviceType === 'ticket') {
                        const reservationTotalAmount = getReservationTotalAmount(normalizedService);
                        const ticketQuantity = getTicketDisplayQuantity(normalizedService);
                        const resolvedTotalPrice = reservationTotalAmount
                            ?? Number(normalizedService.totalPrice ?? normalizedService.total_price ?? 0);
                        const derivedUnitPrice = resolvedTotalPrice > 0 && ticketQuantity > 0
                            ? Math.round(resolvedTotalPrice / ticketQuantity)
                            : 0;
                        const resolvedUnitPrice = Number(
                            normalizedService.unitPrice
                            ?? (derivedUnitPrice > 0 ? derivedUnitPrice : null)
                            ?? normalizedService.unit_price
                            ?? 0
                        );

                        return {
                            ...normalizedService,
                            ticketName: normalizedService.ticketName || normalizedService.ticket_name || normalizedService.program_selection || '-',
                            usageDate: normalizedService.usageDate || normalizedService.usage_date || '-',
                            ticketQuantity: ticketQuantity,
                            totalPrice: resolvedTotalPrice,
                            unitPrice: resolvedUnitPrice,
                        };
                    }
                    if (normalizedService.serviceType === 'sht') {
                        return {
                            ...normalizedService,
                            usageDate: normalizedService.usageDate || normalizedService.usage_date || normalizedService.pickupDatetime || normalizedService.pickup_datetime || null,
                            pickupDatetime: normalizedService.pickupDatetime || normalizedService.pickup_datetime || null,
                            category: String(normalizedService.sht_category || normalizedService.category || '-'),
                            vehicleNumber: normalizedService.vehicleNumber || normalizedService.vehicle_number || normalizedService.dispatch_code || '-',
                            seatNumber: normalizedService.seatNumber || normalizedService.seat_number || '-',
                            pickupLocation: normalizedService.pickupLocation || normalizedService.pickup_location || '-',
                            dropoffLocation: normalizedService.dropoffLocation || normalizedService.dropoff_location || '-',
                            totalPrice: Number(normalizedService.totalPrice ?? normalizedService.car_total_price ?? 0),
                            unitPrice: Number(normalizedService.unitPrice ?? normalizedService.unit_price ?? 0),
                        };
                    }
                    return normalizedService;
                });

                setEnrichedServices(enriched);
            } catch (error) {
                console.error('❌ 서비스 데이터 보강 실패:', error);
                setEnrichedServices(allUserServices);
            } finally {
                setIsEnriching(false);
            }
        };

        enrichServicesData();
    }, [isOpen, allUserServices]); if (!isOpen) return null;

    const getServiceIcon = (serviceType: string) => {
        switch (serviceType) {
            case 'cruise': return <Ship className="w-5 h-5 text-blue-600" />;
            case 'vehicle':
            case 'car': return <Car className="w-5 h-5 text-purple-600" />;
            case 'airport': return <Plane className="w-5 h-5 text-green-600" />;
            case 'hotel': return <Building className="w-5 h-5 text-orange-600" />;
            case 'tour': return <MapPin className="w-5 h-5 text-pink-600" />;
            case 'ticket': return <FileText className="w-5 h-5 text-teal-600" />;
            case 'rentcar': return <Car className="w-5 h-5 text-indigo-600" />;
            case 'sht': return <Car className="w-5 h-5 text-blue-500" />;
            case 'package': return <Package className="w-5 h-5 text-indigo-600" />;
            default: return <Users className="w-5 h-5 text-gray-600" />;
        }
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
            package: '패키지'
        };
        return labels[serviceType] || '서비스';
    };

    const getStatusBadge = (status: string) => {
        if (status === 'confirmed') return <span className="flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full"><CheckCircle className="w-3 h-3" />확정</span>;
        if (status === 'completed') return <span className="flex items-center gap-1 text-xs font-medium text-gray-700 bg-gray-100 px-2 py-0.5 rounded-full"><CheckCircle className="w-3 h-3" />완료</span>;
        if (status === 'pending') return <span className="flex items-center gap-1 text-sm font-semibold text-red-700 bg-red-100 px-3 py-1 rounded-full"><AlertCircle className="w-4 h-4" />대기(결제전)</span>;
        if (status === 'approved') return <span className="flex items-center gap-1 text-sm font-semibold text-amber-800 bg-amber-100 px-3 py-1 rounded-full"><CheckCircle className="w-4 h-4" />승인(결제완료)</span>;
        if (status === 'cancelled') return <span className="flex items-center gap-1 text-xs font-medium text-red-700 bg-red-100 px-2 py-0.5 rounded-full"><XCircle className="w-3 h-3" />취소</span>;
        return <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{status}</span>;
    };

    const getResolvedServiceStatus = (service: any) => {
        const rawStatus = service?.status || service?.re_status || service?.reservation_status || service?.reservation?.re_status || '';
        return String(rawStatus).trim().toLowerCase();
    };

    const renderPricingBadge = (service: any) => {
        const pricingSource = getServicePricingSource(service);
        if (pricingSource === 'manual_override') {
            return (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full whitespace-nowrap">
                    수정 요금 적용 ({getChangeStatusLabel(service?._changeStatus)})
                </span>
            );
        }
        if (pricingSource === 'normal') {
            return (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-700 bg-gray-100 px-2 py-0.5 rounded-full whitespace-nowrap">
                    정상 요금
                </span>
            );
        }
        return null;
    };

    const getDateStr = (service: any) => {
        let dateStr = '';
        if (service.checkin) dateStr = service.checkin;
        else if (service.pickupDatetime) dateStr = service.pickupDatetime.split('T')[0];
        else if (service.date) dateStr = service.date;
        else if (service.checkinDate) dateStr = service.checkinDate;
        else if (service.tourDate) dateStr = service.tourDate;
        else if (service.usageDate) dateStr = service.usageDate.split('T')[0];
        else if (service.pickup_datetime) dateStr = String(service.pickup_datetime).split('T')[0];
        return dateStr;
    };

    const getAirportSortOrder = (service: any) => {
        const value = String(service?.category || service?.way_type || '').toLowerCase();
        if (value.includes('pickup') || value.includes('픽업')) return 0;
        if (value.includes('sending') || value.includes('샌딩')) return 1;
        return 9;
    };

    const isShtDropoffCategory = (value: any) => {
        const normalized = String(value || '').toLowerCase();
        return normalized.includes('drop') || normalized.includes('드롭') || normalized.includes('도롭') || normalized.includes('샌딩');
    };

    const compareServices = (a: any, b: any) => {
        const dateA = getDateStr(a) || '9999-99-99';
        const dateB = getDateStr(b) || '9999-99-99';
        const dateCompare = dateA.localeCompare(dateB);
        if (dateCompare !== 0) return dateCompare;

        const isAirportA = a?.serviceType === 'airport';
        const isAirportB = b?.serviceType === 'airport';
        if (isAirportA && isAirportB) {
            return getAirportSortOrder(a) - getAirportSortOrder(b);
        }

        return 0;
    };

    const getSortedGroups = () => {
        // 중복 제거 제거: 모든 서비스를 표시 (공항 픽업/샌딩, 렌터카 픽업/드롭 등)
        const allServices = aggregateDisplayServices(enrichedServices || []);

        if (sortMode === 'date') {
            const groups: Record<string, any[]> = {};
            allServices.forEach(service => {
                const date = getDateStr(service);
                const key = date || '기타';
                if (!groups[key]) groups[key] = [];
                groups[key].push(service);
            });

            // 날짜 오름차순 정렬
            const sortedKeys = Object.keys(groups).sort((a, b) => {
                if (a === '기타') return 1;
                if (b === '기타') return -1;
                return new Date(a).getTime() - new Date(b).getTime();
            });

            return sortedKeys.map(key => ({
                title: key === '기타' ? '날짜 미정' : new Date(key).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }),
                originalKey: key,
                items: groups[key].sort(compareServices)
            }));
        } else {
            // 종류별 정렬
            const typeOrder = ['cruise', 'vehicle', 'sht', 'airport', 'tour', 'ticket', 'rentcar', 'hotel'];
            const groups: Record<string, any[]> = {};

            allServices.forEach(service => {
                const type = service.serviceType;
                if (!groups[type]) groups[type] = [];
                groups[type].push(service);
            });

            const sortedTypes = Object.keys(groups).sort((a, b) => {
                const indexA = typeOrder.indexOf(a);
                const indexB = typeOrder.indexOf(b);
                const valA = indexA === -1 ? 999 : indexA;
                const valB = indexB === -1 ? 999 : indexB;
                return valA - valB;
            });

            return sortedTypes.map(type => ({
                title: getServiceLabel(type),
                originalKey: type,
                items: groups[type].sort(compareServices)
            }));
        }
    };

    const sortedGroups = getSortedGroups();
    const modalTitle = userInfo?.modal_title || '예약 통합 상세';
    const childBirthDates = Array.isArray(userInfo?.child_birth_dates)
        ? userInfo.child_birth_dates.filter((date: unknown): date is string => typeof date === 'string' && date.trim().length > 0)
        : [];

    const openShtSeatModal = (service: any) => {
        setSelectedShtService(service);
        setIsShtSeatModalOpen(true);
    };

    const handleShtSeatSelected = (seatInfo: { vehicle: string; seat: string; category: string; usageDate?: string }) => {
        if (!selectedShtService) return;

        setEnrichedServices(prev => prev.map(service => {
            if (service !== selectedShtService && service.reservation_id !== selectedShtService.reservation_id) {
                return service;
            }

            if (service.serviceType !== 'sht') return service;

            return {
                ...service,
                vehicleNumber: seatInfo.vehicle,
                seatNumber: seatInfo.seat,
                category: seatInfo.category,
                usageDate: seatInfo.usageDate || service.usageDate,
            };
        }));
    };

    const renderServiceContent = (service: any) => {
        const type = service.serviceType;
        const isPackageService = service.isPackageService;
        const manualAdditionalFee = getManualAdditionalFee(service);
        const manualAdditionalFeeDetail = getManualAdditionalFeeDetail(service);

        return (
            <div className="flex flex-col gap-1 text-sm text-gray-700 mt-2">
                {isPackageService && (
                    <div className="mb-1">
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-full">
                            <Package className="w-3 h-3" />패키지 포함
                        </span>
                    </div>
                )}
                {type === 'cruise' && (
                    <>
                        {(() => {
                            const rawPb = service.priceBreakdown || service.price_breakdown || service.reservation_price_breakdown || service.reservation?.price_breakdown || null;
                            const adultCountRaw = service.adult ?? service.adult_count ?? service.re_adult_count ?? service.reservation?.re_adult_count;
                            const childCountRaw = service.child ?? service.child_count ?? service.re_child_count ?? service.reservation?.re_child_count;
                            const childOlderCountRaw = service.childOlderCount ?? service.child_older_count;
                            const infantCountRaw = service.infant ?? service.infant_count ?? service.re_infant_count ?? service.reservation?.re_infant_count;
                            const singleCountRaw = service.singleCount ?? service.single_count;
                            const childExtraBedCountRaw = service.childExtraBedCount ?? service.child_extra_bed_count;
                            const extraBedCountRaw = service.extraBedCount ?? service.extra_bed_count;

                            const adultCount = Number(adultCountRaw ?? 0);
                            const childCount = Number(childCountRaw ?? 0);
                            const childOlderCount = Number(childOlderCountRaw ?? 0);
                            const infantCount = Number(infantCountRaw ?? 0);
                            const singleCount = Number(singleCountRaw ?? 0);
                            const childExtraBedCount = Number(childExtraBedCountRaw ?? 0);
                            const extraBedCount = Number(extraBedCountRaw ?? 0);

                            // pb: surcharge 정규화 전용. count/unit/total은 roomPb(방별 breakdown) 기준 — 모바일과 동일
                            const pb = normalizeCruisePriceBreakdown(rawPb, infantCount);
                            const roomPb = getCruiseRoomPriceBreakdown(service);
                            const cruiseTotal = getCruiseDisplayTotal(service);

                            // entry(roomPb[key])가 있으면 그 count 우선(0 포함). 없으면 서비스 필드 폴백.
                            const resolveCount = (entry: any, rawCount: any) => {
                                if (entry !== undefined && entry !== null) {
                                    const v = entry?.count;
                                    if (v !== undefined && v !== null) return Number(v);
                                    return 0;
                                }
                                return Number(rawCount ?? 0);
                            };

                            const makeCruiseLine = (
                                label: string,
                                entry: any,
                                count: number,
                                fallbackUnit: number,
                            ) => {
                                if (count <= 0) return null;
                                const unit = Number(entry?.unit_price ?? fallbackUnit ?? 0);
                                const totalFromBreakdown = Number(entry?.total ?? 0);
                                const total = totalFromBreakdown > 0 ? totalFromBreakdown : (unit * count);
                                return { label, value: { count, unit_price: unit, total } };
                            };

                            // 프로모션 정보 추출
                            const pricingSource = getServicePricingSource(service);
                            const isPromotionPricing = pricingSource === 'promotion';
                            const promoSeqRaw = rawPb?.promotion_sequence ?? service?.promotion_sequence ?? service?.reservation?.price_breakdown?.promotion_sequence;
                            const promoSeqNum = Number(promoSeqRaw || 0);
                            const promoSeq = Number.isFinite(promoSeqNum) && promoSeqNum > 0 ? promoSeqNum : null;

                            // rooms[]가 없는 예약(packages/domain 방식)은 rawPb 최상위 필드에 단가 저장
                            const pbAdult = roomPb?.adult ?? rawPb?.adult ?? null;
                            const pbChild = roomPb?.child ?? rawPb?.child ?? null;
                            const pbChildOlder = roomPb?.child_older ?? rawPb?.child_older ?? null;
                            const pbChildExtraBed = roomPb?.child_extra_bed ?? rawPb?.child_extra_bed ?? null;
                            const pbInfant = roomPb?.infant ?? rawPb?.infant ?? null;
                            const pbExtraBed = roomPb?.extra_bed ?? rawPb?.extra_bed ?? null;
                            const pbSingle = roomPb?.single ?? rawPb?.single ?? null;

                            const adultLineCount = resolveCount(pbAdult, adultCount);
                            const childLineCount = resolveCount(pbChild, childCount);
                            const childOlderLineCount = resolveCount(pbChildOlder, childOlderCount);
                            const childExtraBedLineCount = resolveCount(pbChildExtraBed, childExtraBedCount);
                            const infantLineCount = resolveCount(pbInfant, infantCount);
                            const extraBedLineCount = resolveCount(pbExtraBed, extraBedCount);
                            const singleLineCount = resolveCount(pbSingle, singleCount);

                            const cruiseLines = [
                                makeCruiseLine('성인', pbAdult, adultLineCount, Number(service.unitPrice || service.priceAdult || 0)),
                                makeCruiseLine('아동(5~7)', pbChild, childLineCount, Number(service.priceChild || 0)),
                                makeCruiseLine('아동(8~11)', pbChildOlder, childOlderLineCount, Number(service.priceChildOlder || service.priceChild || 0)),
                                makeCruiseLine('아동엑베', pbChildExtraBed, childExtraBedLineCount, Number(service.priceChildExtraBed || 0)),
                                makeCruiseLine('유아', pbInfant, infantLineCount, Number(service.priceInfant || 0)),
                                makeCruiseLine('엑스트라베드', pbExtraBed, extraBedLineCount, Number(service.priceExtraBed || 0)),
                                makeCruiseLine('싱글차액', pbSingle, singleLineCount, Number(service.priceSingle || 0)),
                            ].filter(Boolean) as Array<{ label: string; value: any }>;

                            return (
                                <>
                                    {isPromotionPricing && (
                                        <div className="flex flex-wrap items-center gap-1.5 mb-2">
                                            <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700 border border-red-100">
                                                {promoSeq ? `🎁 프로모션 ${promoSeq} 번째` : '🎁 프로모션 적용'}
                                            </span>
                                        </div>
                                    )}
                                    <div className="bg-blue-50 rounded-lg p-3 mb-2 border border-blue-100">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                                            <div><strong>크루즈명:</strong> <span className="font-semibold text-blue-800">{service.cruiseName || service.cruise || '크루즈'}</span></div>
                                            <div><strong>객실타입:</strong> {service.roomType}</div>
                                            <div><strong>객실수:</strong> {service.room_count || service.roomCount || 0}실</div>
                                            <div><strong>체크인:</strong> {service.checkin}</div>
                                            <div><strong>일정:</strong> {formatCruiseScheduleLabel(service.scheduleType || service.schedule_type || service.schedule_days || service.days || service.nights)}</div>
                                            <div><strong>결제방식:</strong> {service.paymentMethod}</div>
                                            <div><strong>성인:</strong> {adultCount}명</div>
                                            <div><strong>아동:</strong> {childCount}명</div>
                                            {infantCount > 0 && <div><strong>유아:</strong> {infantCount}명</div>}
                                            {childExtraBedCount > 0 && <div><strong>아동엑베:</strong> {childExtraBedCount}명</div>}
                                            {extraBedCount > 0 && <div><strong>엑스트라베드:</strong> {extraBedCount}개</div>}
                                            {singleCount > 0 && <div><strong>싱글:</strong> {singleCount}명</div>}
                                        </div>
                                    </div>
                                    {/* 카테고리별 요금 내역 */}
                                    <div className="border-t border-gray-100 pt-2 mt-1 space-y-1">
                                        <div className="text-xs font-semibold text-green-800 mb-1">요금 내역</div>
                                        {cruiseLines.map((line, idx) => {
                                                const lineCount = Number(line.value?.count || 0);
                                                const rawTotal = Number(line.value?.total || 0);
                                                const rawUnit = Number(line.value?.unit_price);
                                                const fallbackUnitByLabel: Record<string, number> = {
                                                    성인: Number(pbAdult?.unit_price || service.unitPrice || service.priceAdult || 0),
                                                    '아동(5~7)': Number(pbChild?.unit_price || service.priceChild || 0),
                                                    '아동(8~11)': Number(pbChildOlder?.unit_price || service.priceChildOlder || service.priceChild || 0),
                                                    아동엑베: Number(pbChildExtraBed?.unit_price || service.priceChildExtraBed || 0),
                                                    유아: Number(pbInfant?.unit_price || service.priceInfant || 0),
                                                    엑스트라베드: Number(pbExtraBed?.unit_price || service.priceExtraBed || 0),
                                                    싱글차액: Number(pbSingle?.unit_price || service.priceSingle || 0),
                                                };
                                                const lineUnit = Number.isFinite(rawUnit) && rawUnit > 0
                                                    ? rawUnit
                                                    : Number(fallbackUnitByLabel[line.label] || 0);
                                                const lineTotal = rawTotal > 0 ? rawTotal : lineUnit * lineCount;
                                                return (
                                                    <div key={`${line.label}-${idx}`} className="flex justify-between text-sm">
                                                        <span className="text-gray-600">{line.label} {lineUnit.toLocaleString()}동 × {lineCount}명</span>
                                                        <span className="font-medium">{lineTotal.toLocaleString()}동</span>
                                                    </div>
                                                );
                                            })}

                                        {(pb?.surcharge_total || 0) > 0 && (
                                            <div className="flex justify-between text-sm">
                                                <span className="text-gray-600">성수기/공휴일 추가요금</span>
                                                <span className="font-medium">{Number(pb.surcharge_total || 0).toLocaleString()}동</span>
                                            </div>
                                        )}
                                        {Number(pb?.options_total ?? pb?.option_total ?? 0) > 0 && (
                                            <div className="flex justify-between text-sm">
                                                <span className="text-gray-600">선택 옵션 합계</span>
                                                <span className="font-medium">{Number(pb?.options_total ?? pb?.option_total ?? 0).toLocaleString()}동</span>
                                            </div>
                                        )}
                                        {Array.isArray(pb?.additional_fee_items) && pb.additional_fee_items.map((item: any, idx: number) => {
                                            const amount = Number(item?.amount || 0);
                                            if (!amount) return null;
                                            return (
                                                <div key={`adj-${idx}`} className="flex justify-between text-sm">
                                                    <span className={amount > 0 ? 'text-orange-700' : 'text-indigo-700'}>{item?.name || '추가내역'}</span>
                                                    <span className="font-medium">{formatSignedAmount(amount)}</span>
                                                </div>
                                            );
                                        })}
                                        {Number(pb?.additional_fee_manual || 0) !== 0 && (
                                            <div className="flex justify-between text-sm">
                                                <span className={Number(pb.additional_fee_manual) > 0 ? 'text-orange-700' : 'text-indigo-700'}>
                                                    {Number(pb.additional_fee_manual) > 0 ? '직접 추가요금' : '직접 차감'}
                                                </span>
                                                <span className="font-medium">{formatSignedAmount(Number(pb.additional_fee_manual || 0))}</span>
                                            </div>
                                        )}
                                        {Number(pb?.discount_amount || 0) > 0 && (
                                            <div className="flex justify-between text-sm">
                                                <span className="text-indigo-700">할인요금{Number(pb?.discount_rate || 0) > 0 ? ` (${pb.discount_rate}%)` : ''}</span>
                                                <span className="font-medium">-{Number(pb.discount_amount || 0).toLocaleString()}동</span>
                                            </div>
                                        )}
                                    </div>
                                    <div className="border-t border-gray-200 pt-1 mt-1 flex justify-between items-center">
                                        <span className="text-gray-500 font-medium">총 금액</span>
                                        <span className="font-bold text-blue-600 text-base">{cruiseTotal.toLocaleString()}동</span>
                                    </div>
                                    {renderServiceNote(service.note)}
                                </>
                            );
                        })()}
                    </>
                )}
                {(type === 'vehicle' || type === 'car') && (
                    <>
                        <div>구분: {service.carCategory || service.way_type || service.category || '-'}</div>
                        <div>차량타입: {service.carType || '-'}</div>
                        <div>경로: {service.route || '-'}</div>
                        <div>총인원수: {service.passengerCount || 0}명</div>
                        <div>픽업일시: {formatDatetimeOffset(service.pickupDatetime || service.pickup_datetime, service.pickupDate || service.pickup_date, service.pickupTime || service.pickup_time)}</div>
                        {(service.returnDatetime || service.return_datetime || service.returnDate || service.return_date) && (
                            <div>드랍일시: <span className="font-medium text-orange-700">{formatDatetimeOffset(service.returnDatetime || service.return_datetime, service.returnDate || service.return_date, service.returnTime || service.return_time)}</span></div>
                        )}
                        <div>픽업위치: {service.pickupLocation || '-'}</div>
                        <div>드랍위치: {service.dropoffLocation || '-'}</div>
                        {service.vehicleNumber && <div>차량번호: {service.vehicleNumber}</div>}
                        {service.totalPrice && (
                            <div className="border-t border-gray-100 pt-1 mt-1 flex justify-between items-center">
                                <span className="text-gray-500">총 금액</span>
                                <span className="font-bold text-blue-600">{Number(service.totalPrice || 0).toLocaleString()}동</span>
                            </div>
                        )}
                        {renderServiceNote(service.note)}
                    </>
                )}
                {type === 'airport' && (
                    <>
                        {(() => {
                            const airportTypeRaw = String(service.category || service.way_type || '').toLowerCase();
                            const isPickup = airportTypeRaw.includes('pickup') || airportTypeRaw.includes('픽업');
                            const isSending = airportTypeRaw.includes('sending') || airportTypeRaw.includes('샌딩');
                            // 변경: 공항 위치는 ra_airport_location에서 가져오기
                            const airportDisplay = service.ra_airport_location || '-';
                            // 변경: 하차위치/승차위치는 accommodation_info에서 가져오기
                            const dropoffDisplay = service.accommodation_info || '-';

                            return (
                                <div className="bg-green-50 rounded-lg p-3 mb-2 border border-green-100">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                                        <div><strong>구분:</strong> {service.category || service.way_type || '-'}</div>
                                        <div><strong>경로:</strong> {service.route || '-'}</div>
                                        <div><strong>차량:</strong> {service.carType || '-'}</div>
                                        <div><strong>일시:</strong> {service.ra_datetime ? formatDatetimeOffset(service.ra_datetime) : '-'}</div>
                                        <div><strong>항공편:</strong> {service.flightNumber || service.ra_flight_number || '-'}</div>
                                        <div><strong>공항:</strong> {airportDisplay}</div>
                                        <div><strong>하차위치:</strong> {dropoffDisplay}</div>
                                        {/* 변경: 목적지 → 경유지로 변경 */}
                                        {service.stopover && <div><strong>경유지:</strong> {service.stopover}</div>}
                                        {service.passengerCount && <div><strong>인원:</strong> {service.passengerCount}명</div>}
                                    </div>
                                </div>
                            );
                        })()}
                        {(service.unitPrice || service.totalPrice) && (
                            <div className="border-t border-gray-100 pt-2 mt-1 space-y-1">
                                {service.unitPrice > 0 && (
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-600">{Number(service.unitPrice).toLocaleString()}동 × {service.carCount || 1}대</span>
                                        <span className="font-medium">{(Number(service.unitPrice) * (service.carCount || 1)).toLocaleString()}동</span>
                                    </div>
                                )}
                                <div className="flex justify-between items-center border-t border-gray-200 pt-1">
                                    <span className="text-gray-500 font-medium">총 금액</span>
                                    <span className="font-bold text-blue-600">{Number(service.totalPrice || 0).toLocaleString()}동</span>
                                </div>
                            </div>
                        )}
                        {renderServiceNote(service.note)}
                    </>
                )}
                {type === 'hotel' && (
                    <>
                        {(() => {
                            const scheduleRaw = String(service.schedule || '').trim();
                            const parsedNights = Number.parseInt(scheduleRaw, 10);
                            const nights = Number.isFinite(parsedNights)
                                ? parsedNights
                                : Number(service.nights || service.days || 0);
                            const roomCount = Number(service.roomCount ?? service.room_count ?? 0);
                            const totalPrice = Number(service.totalPrice || service.total_price || 0);
                            const unitPrice = Number(
                                service.unitPrice
                                || service.unit_price
                                || (totalPrice > 0 && nights > 0 && roomCount > 0
                                    ? Math.round(totalPrice / (nights * roomCount))
                                    : 0)
                            );
                            return (
                        <div className="bg-orange-50 rounded-lg p-3 mb-2 border border-orange-100">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                                <div><strong>호텔명:</strong> <span className="font-semibold text-orange-800">{service.hotelName}</span></div>
                                <div><strong>객실타입:</strong> {service.roomType}</div>
                                <div><strong>체크인:</strong> {service.checkinDate}</div>
                                <div><strong>객실수:</strong> {roomCount}실</div>
                                {service.checkinDate && nights > 0 ? (
                                    <>
                                        <div><strong>체크아웃:</strong> {(() => {
                                            const checkin = new Date(service.checkinDate);
                                            const checkout = new Date(checkin);
                                            checkout.setDate(checkout.getDate() + nights);
                                            return checkout.toISOString().split('T')[0];
                                        })()}</div>
                                        <div><strong>숙박일정:</strong> {(() => {
                                            return `${nights}박 ${nights + 1}일`;
                                        })()}</div>
                                    </>
                                ) : null}
                                <div><strong>인원:</strong> {service.guestCount}명</div>
                            </div>
                        </div>
                            );
                        })()}
                        {(service.unitPrice || service.unit_price || service.totalPrice || service.total_price) && (
                            <div className="border-t border-gray-100 pt-2 mt-1 space-y-1">
                                {(() => {
                                    const nights = Number(service.nights || service.days || 0);
                                    const roomCount = Number(service.roomCount ?? service.room_count ?? 0);
                                    const totalPrice = Number(service.totalPrice || service.total_price || 0);
                                    const unitPrice = Number(
                                        service.unitPrice
                                        || service.unit_price
                                        || (totalPrice > 0 && nights > 0 && roomCount > 0
                                            ? Math.round(totalPrice / (nights * roomCount))
                                            : 0)
                                    );
                                    return unitPrice > 0 && roomCount > 0 ? (
                                        <div className="flex justify-between text-sm">
                                            <span className="text-gray-600">
                                                {unitPrice.toLocaleString()}동 × {roomCount}실{nights > 0 ? ` × ${nights}박` : ''}
                                            </span>
                                            <span className="font-medium">{totalPrice.toLocaleString()}동</span>
                                        </div>
                                    ) : null;
                                })()}
                                <div className="flex justify-between items-center border-t border-gray-200 pt-1">
                                    <span className="text-gray-500 font-medium">총 금액</span>
                                    <span className="font-bold text-blue-600">{Number(service.totalPrice || service.total_price || 0).toLocaleString()}동</span>
                                </div>
                            </div>
                        )}
                        {renderServiceNote(service.note)}
                    </>
                )}
                {type === 'tour' && (
                    <>
                        <div className="bg-purple-50 rounded-lg p-3 mb-2 border border-purple-100">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                                <div><strong>투어명:</strong> <span className="font-semibold text-purple-800">{service.tourName}</span></div>
                                {service.tourDate && <div><strong>투어일자:</strong> {service.tourDate}</div>}
                                {service.tourCapacity && <div><strong>인원수:</strong> {service.tourCapacity}명</div>}
                                {service.carCount && <div><strong>차량:</strong> {service.carCount}대</div>}
                                <div><strong>픽업장소:</strong> {service.pickupLocation}</div>
                                {service.dropoffLocation && <div><strong>드랍장소:</strong> {service.dropoffLocation}</div>}
                            </div>
                        </div>
                        {(service.unitPrice || service.totalPrice) && (
                            <div className="border-t border-gray-100 pt-2 mt-1 space-y-1">
                                {service.unitPrice > 0 && (service.tourCapacity || 0) > 0 && (
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-600">1인 {Number(service.unitPrice).toLocaleString()}동 × {service.tourCapacity}명</span>
                                        <span className="font-medium">{(Number(service.unitPrice) * (service.tourCapacity || 1)).toLocaleString()}동</span>
                                    </div>
                                )}
                                <div className="flex justify-between items-center border-t border-gray-200 pt-1">
                                    <span className="text-gray-500 font-medium">총 금액</span>
                                    <span className="font-bold text-blue-600">{Number(service.totalPrice || 0).toLocaleString()}동</span>
                                </div>
                            </div>
                        )}
                        {renderServiceNote(service.note)}
                    </>
                )}
                {type === 'ticket' && (
                    <>
                        <div className="bg-teal-50 rounded-lg p-3 mb-2 border border-teal-100">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                                <div><strong>티켓명:</strong> <span className="font-semibold text-teal-800">{service.ticketName || service.ticket_name || service.program_selection || '-'}</span></div>
                                <div><strong>이용일자:</strong> {service.usageDate || service.usage_date || '-'}</div>
                                <div><strong>수량:</strong> {Number(service.ticketQuantity || service.ticket_quantity || 0)}매</div>
                                <div><strong>셔틀:</strong> {service.shuttle_required ? '신청함' : '신청 안함'}</div>
                                <div><strong>픽업장소:</strong> {service.pickupLocation || service.pickup_location || '-'}</div>
                                <div><strong>하차장소:</strong> {service.dropoffLocation || service.dropoff_location || '-'}</div>
                            </div>
                        </div>
                        {(service.unitPrice || service.totalPrice || service.total_price) && (
                            <div className="border-t border-gray-100 pt-2 mt-1 space-y-1">
                                {getTicketDisplayLines(service).map((line, index) => (
                                    <div key={`${line.label}-${index}`} className="flex justify-between text-sm">
                                        <span className="text-gray-600">{line.label} {line.unitPrice.toLocaleString()}동 × {line.quantity}{line.quantityUnit}</span>
                                        <span className="font-medium">{line.total.toLocaleString()}동</span>
                                    </div>
                                ))}
                                <div className="flex justify-between items-center border-t border-gray-200 pt-1">
                                    <span className="text-gray-500 font-medium">총 금액</span>
                                    <span className="font-bold text-blue-600">{getTicketDisplayTotal(service).toLocaleString()}동</span>
                                </div>
                            </div>
                        )}
                        {renderServiceNote(service.note || service.request_note || service.requestNote)}
                    </>
                )}
                {type === 'rentcar' && (
                    <>
                        {/* 차량 기본 정보 */}
                        <div className="bg-red-50 rounded-lg p-3 mb-2 border border-red-100">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                                <div><strong>차량 타입:</strong> <span className="font-semibold">{service.carType || '-'}{service.capacity && <span className="text-xs font-normal text-gray-500 ml-1">({service.capacity}인승)</span>}</span></div>
                                {service.route && <div><strong>경로:</strong> {service.route}</div>}
                                {(service.category || service.way_type) && <div><strong>이용방식:</strong> {service.category || service.way_type}</div>}
                                {service.carCount != null && <div><strong>차량 수:</strong> {service.carCount}대</div>}
                                {service.passengerCount != null && <div><strong>탑승 인원:</strong> {service.passengerCount}명</div>}
                                {service.luggageCount != null && Number(service.luggageCount) > 0 && <div><strong>수하물:</strong> {service.luggageCount}개</div>}
                                {service.dispatchCode && <div><strong>차량번호:</strong> {service.dispatchCode}</div>}
                            </div>
                        </div>

                        {/* 픽업 정보 */}
                        {(service.pickupDatetime || service.pickup_datetime || service.pickupLocation || service.pickup_location || service.destination || service.dropoffLocation || service.dropoff_location) && (
                            <div className="mt-1 p-2 bg-blue-50 rounded-lg border border-blue-100">
                                <div className="text-xs font-bold text-blue-700 mb-1">📍 픽업</div>
                                {(service.pickupDatetime || service.pickup_datetime) && (
                                    <div className="text-xs">일시: <span className="font-medium">{formatDatetimeOffset(service.pickupDatetime || service.pickup_datetime, service.pickupDate || service.pickup_date, service.pickupTime || service.pickup_time)}</span></div>
                                )}
                                {(service.pickupLocation || service.pickup_location) && (
                                    <div className="text-xs">픽업장소: <span className="font-medium">{service.pickupLocation || service.pickup_location}</span></div>
                                )}
                                {(service.destination || service.dropoffLocation || service.dropoff_location) && (
                                    <div className="text-xs">드롭장소: <span className="font-medium">{service.destination || service.dropoffLocation || service.dropoff_location}</span></div>
                                )}
                            </div>
                        )}

                        {/* 픽업 경유 정보 */}
                        {(service.viaLocation || service.via_location || service.viaWaiting || service.via_waiting) && (
                            <div className="mt-1 p-2 bg-yellow-50 rounded-lg border border-yellow-100">
                                <div className="text-xs font-bold text-yellow-700 mb-1">🔄 픽업 경유</div>
                                {(service.viaLocation || service.via_location) && <div className="text-xs">경유지: <span className="font-medium">{service.viaLocation || service.via_location}</span></div>}
                                {(service.viaWaiting || service.via_waiting) && <div className="text-xs">대기: <span className="font-medium">{service.viaWaiting || service.via_waiting}</span></div>}
                            </div>
                        )}

                        {/* 리턴 정보 - 일시가 있을 때만 표시 */}
                        {(service.returnDatetime || service.return_datetime) && (
                            <div className="mt-1 p-2 bg-green-50 rounded-lg border border-green-100">
                                <div className="text-xs font-bold text-green-700 mb-1">🎯 리턴</div>
                                {(service.returnDatetime || service.return_datetime) && (
                                    <div className="text-xs">일시: <span className="font-medium">{formatDatetimeOffset(service.returnDatetime || service.return_datetime, service.returnDate || service.return_date, service.returnTime || service.return_time)}</span></div>
                                )}
                                {(service.returnPickupLocation || service.return_pickup_location) && (
                                    <div className="text-xs">픽업장소: <span className="font-medium">{service.returnPickupLocation || service.return_pickup_location}</span></div>
                                )}
                                {(service.returnDestination || service.return_destination) && (
                                    <div className="text-xs">드롭장소: <span className="font-medium">{service.returnDestination || service.return_destination}</span></div>
                                )}
                            </div>
                        )}

                        {/* 리턴 경유 정보 - 리턴 일시가 있을 때만 표시 */}
                        {(service.returnDatetime || service.return_datetime) && (service.returnViaLocation || service.return_via_location || service.returnViaWaiting || service.return_via_waiting) && (
                            <div className="mt-1 p-2 bg-amber-50 rounded-lg border border-amber-100">
                                <div className="text-xs font-bold text-amber-700 mb-1">🔄 리턴 경유</div>
                                {(service.returnViaLocation || service.return_via_location) && <div className="text-xs">경유지: <span className="font-medium">{service.returnViaLocation || service.return_via_location}</span></div>}
                                {(service.returnViaWaiting || service.return_via_waiting) && <div className="text-xs">대기: <span className="font-medium">{service.returnViaWaiting || service.return_via_waiting}</span></div>}
                            </div>
                        )}

                        {/* 금액 */}
                        {(service.unitPrice || service.totalPrice) && (
                            <div className="border-t border-gray-100 pt-2 mt-1 space-y-1">
                                {service.unitPrice > 0 && (
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-600">{Number(service.unitPrice).toLocaleString()}동 × {service.carCount || 1}대</span>
                                        <span className="font-medium">{(Number(service.unitPrice) * (service.carCount || 1)).toLocaleString()}동</span>
                                    </div>
                                )}
                                <div className="flex justify-between items-center border-t border-gray-200 pt-1">
                                    <span className="text-gray-500 font-medium">총 금액</span>
                                    <span className="font-bold text-blue-600">{Number(service.totalPrice || 0).toLocaleString()}동</span>
                                </div>
                            </div>
                        )}

                        {/* 요청사항 */}
                        {renderServiceNote(service.note)}
                    </>
                )}
                {type === 'sht' && (
                    <>
                        <div className="bg-indigo-50 rounded-lg p-3 mb-2 border border-indigo-100">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                                <div><strong>사용일:</strong> {service.usageDate ? formatDateOnlyKst(service.usageDate) : '-'}</div>
                                <div><strong>구분:</strong> {service.category || '-'}</div>
                                <div><strong>차량번호:</strong> {service.vehicleNumber}</div>
                                {service.seatNumber && <div><strong>좌석:</strong> {service.seatNumber}</div>}
                                <div><strong>픽업장소:</strong> {service.pickupLocation || '-'}</div>
                                <div><strong>드롭장소:</strong> {service.dropoffLocation || '-'}</div>
                            </div>
                        </div>
                        {(() => {
                            const isShtDropoff = isShtDropoffCategory(service.category || service.sht_category);
                            const priceLines = Array.isArray(service.shtPriceLines) && service.shtPriceLines.length > 0
                                ? service.shtPriceLines
                                : buildShtPriceLines([service]);
                            const displayAmt = isShtDropoff ? 0 : Number(service.totalPrice || 0);
                            return (
                                <div className={Array.isArray(service.shtPriceLines) && service.shtPriceLines.length > 0 ? 'hidden' : 'border-t border-gray-100 pt-1 mt-1 flex justify-between items-center'}>
                                    <span className="text-gray-500">총 금액</span>
                                    <span className="font-bold text-blue-600">
                                        {displayAmt.toLocaleString()}동
                                        {isShtDropoff && <span className="text-xs text-gray-400 ml-1">(왕복요금은 픽업에 포함)</span>}
                                    </span>
                                </div>
                            );
                        })()}
                        {Array.isArray(service.shtPriceLines) && service.shtPriceLines.length > 0 && (
                            <div className="border-t border-gray-100 pt-2 mt-1 space-y-1">
                                <div className="text-xs font-semibold text-green-800 mb-1">요금 내역</div>
                                {service.shtPriceLines.map((line: any, idx: number) => (
                                    <div key={`${line.label}-${idx}`} className="flex justify-between text-sm">
                                        <span className="text-gray-600">{line.label} {Number(line.unitPrice || 0).toLocaleString()}동 × {line.quantity}석</span>
                                        <span className="font-medium">{Number(line.total || 0).toLocaleString()}동</span>
                                    </div>
                                ))}
                                <div className="flex justify-between items-center border-t border-gray-200 pt-1">
                                    <span className="text-gray-500 font-medium">총 합계</span>
                                    <span className="font-bold text-blue-600">
                                        {isShtDropoffCategory(service.category || service.sht_category) ? '0동' : `${Number(service.totalPrice || 0).toLocaleString()}동`}
                                        {isShtDropoffCategory(service.category || service.sht_category) && <span className="text-xs text-gray-400 ml-1">(왕복요금은 픽업에 포함)</span>}
                                    </span>
                                </div>
                            </div>
                        )}
                        {renderServiceNote(service.note)}
                    </>
                )}
                {type === 'package' && (
                    <>
                        <div className="font-bold text-indigo-700">{service.package_name || service.package_code}</div>
                        <div>인원: 성인 {service.re_adult_count || 0} / 아동 {service.re_child_count || 0}</div>
                        <div>등록일: {service.re_created_at ? new Date(service.re_created_at).toLocaleDateString() : '-'}</div>
                        <div className="border-t border-gray-100 pt-1 mt-1 flex justify-between items-center">
                            <span className="text-gray-500 font-medium">패키지 총액</span>
                            <span className="font-bold text-indigo-600">{Number(service.total_amount || 0).toLocaleString()}동</span>
                        </div>
                    </>
                )}
                {!isPackageService && !(type === 'sht' && isShtDropoffCategory(service.category || service.sht_category)) && (manualAdditionalFee !== 0 || manualAdditionalFeeDetail) && (
                    <div className="border-t border-rose-100 pt-2 mt-2 space-y-1 text-xs bg-rose-50/70 rounded p-2">
                        <div className="flex justify-between items-center">
                            <span className="text-rose-700 font-medium">추가/차감 내역</span>
                            <span className="font-bold text-rose-700">{formatSignedAmount(manualAdditionalFee)}</span>
                        </div>
                        {manualAdditionalFeeDetail && (
                            <div className="text-rose-800 whitespace-pre-line">추가내역: {manualAdditionalFeeDetail}</div>
                        )}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                {/* 헤더 */}
                <div className="bg-white border-b border-gray-100 px-6 py-4 shrink-0">
                    <div className="flex justify-between items-start">
                        <div className="flex-1">
                            <h2 className="text-2xl font-bold text-gray-900">{modalTitle}</h2>

                            {/* 예약자 정보 카드 */}
                            {userInfo && (
                                <div className="mt-3 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-3">
                                    <div className="flex items-center gap-2 mb-1">
                                        <Users className="w-4 h-4 text-blue-600" />
                                        <span className="text-xs font-semibold text-blue-700">예약자 정보</span>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-3 text-sm text-gray-700">
                                        <span className="font-semibold text-gray-900">
                                            {userInfo.name}
                                            <span className="text-gray-500 font-normal ml-1">({userInfo.english_name || '-'})</span>
                                        </span>
                                        {userInfo.nickname && (
                                            <>
                                                <span className="w-1 h-1 bg-gray-300 rounded-full"></span>
                                                <span>{userInfo.nickname}</span>
                                            </>
                                        )}
                                        <span className="w-1 h-1 bg-gray-300 rounded-full"></span>
                                        <span>{userInfo.email}</span>
                                        <span className="w-1 h-1 bg-gray-300 rounded-full"></span>
                                        <span>{userInfo.phone}</span>
                                        {allUserServices?.length > 0 && allUserServices[0]?.paymentMethod && (
                                            <>
                                                <span className="w-1 h-1 bg-gray-300 rounded-full"></span>
                                                <span className="text-blue-700 font-medium">결제: {allUserServices?.[0]?.paymentMethod}</span>
                                            </>
                                        )}
                                    </div>
                                    {childBirthDates.length > 0 && (
                                        <div className="mt-2 pt-2 border-t border-blue-100 text-sm text-gray-700">
                                            <span className="font-medium text-gray-900 mr-2">아동 생년월일</span>
                                            <div className="flex flex-wrap gap-2 mt-1">
                                                {childBirthDates.map((date, index) => (
                                                    <span
                                                        key={`${date}-${index}`}
                                                        className="inline-flex items-center rounded-full bg-white px-2.5 py-1 text-xs font-medium text-blue-700 border border-blue-200"
                                                    >
                                                        아동 {index + 1}: {date}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                        <button
                            title="닫기"
                            onClick={onClose}
                            className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400 hover:text-gray-600 ml-4"
                        >
                            <X className="w-6 h-6" />
                        </button>
                    </div>

                    {/* 정렬 버튼 */}
                    <div className="flex gap-2 mt-4">
                        <button
                            onClick={() => setSortMode('date')}
                            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${sortMode === 'date' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                        >
                            일자별
                        </button>
                        <button
                            onClick={() => setSortMode('type')}
                            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${sortMode === 'type' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                        >
                            종류별
                        </button>
                    </div>
                </div>

                {/* 본문 (스크롤 영역) + 푸터 통합 */}
                <div className="flex-1 overflow-y-auto bg-gray-50 p-6 flex flex-col">
                    {(loading || isEnriching) ? (
                        <div className="flex flex-col items-center justify-center h-64">
                            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mb-4"></div>
                            <p className="text-gray-500">{isEnriching ? '서비스 정보를 불러오는 중...' : '데이터를 불러오는 중입니다...'}</p>
                        </div>
                    ) : (enrichedServices?.length || 0) === 0 ? (
                        <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                            <Calendar className="w-12 h-12 mb-3 opacity-20" />
                            <p>예약 내역이 없습니다.</p>
                        </div>
                    ) : (
                        <div className="space-y-8 flex-1">
                            {sortedGroups.map((group) => {
                                const showGroupHeader = !(sortMode === 'type' && group.items.length === 1);
                                return (
                                <div key={group.originalKey} className={showGroupHeader ? 'relative pl-4 sm:pl-0' : ''}>
                                    {/* 그룹 헤더 */}
                                    {showGroupHeader && (
                                    <div className="sticky top-0 z-10 flex items-center mb-4 bg-gray-50 py-2">
                                        {sortMode === 'date' ? (
                                            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-600 font-bold text-xs ring-4 ring-gray-50 mr-3">
                                                {group.originalKey === '기타' ? '?' : new Date(group.originalKey).getDate()}
                                            </div>
                                        ) : (
                                            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-white text-gray-600 ring-4 ring-gray-50 mr-3 border border-gray-100">
                                                {getServiceIcon(group.originalKey)}
                                            </div>
                                        )}
                                        <h3 className="text-lg font-bold text-gray-800">
                                            {group.title}
                                        </h3>
                                        <span className="ml-2 text-xs font-medium text-green-800 bg-white px-2 py-0.5 rounded border border-gray-200">
                                            {group.items.length}건
                                        </span>
                                    </div>
                                    )}

                                    {/* 해당 그룹의 서비스 목록 */}
                                    <div className={showGroupHeader ? 'space-y-3 pl-4 border-l-2 border-gray-200 ml-4' : 'space-y-3'}>
                                        {group.items.map((service: any, idx: number) => {
                                            const resolvedStatus = getResolvedServiceStatus(service);
                                            return (
                                            <div key={`${service.reservation_id}-${service.serviceType}-${idx}`} className={`rounded-lg border p-4 hover:shadow-md transition-shadow relative group ${resolvedStatus === 'pending' ? 'bg-gray-50 border-gray-200' : 'bg-white border-gray-200'}`}>
                                                <div className="flex items-start justify-between mb-2">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <div className={`p-1.5 rounded-lg ${service.serviceType === 'cruise' ? 'bg-blue-50' :
                                                            service.serviceType === 'hotel' ? 'bg-orange-50' :
                                                                'bg-gray-50'
                                                            }`}>
                                                            {getServiceIcon(service.serviceType)}
                                                        </div>
                                                        <span className="font-bold text-gray-800">
                                                            {getServiceLabel(service.serviceType)}
                                                            {service.serviceType === 'rentcar' && service.category && (
                                                                <span className="text-sm font-normal text-blue-600 ml-1">({service.category})</span>
                                                            )}
                                                            {service.serviceType === 'rentcar' && service.way_type && (
                                                                <span className="text-sm font-normal text-green-600 ml-1">({service.way_type})</span>
                                                            )}
                                                            {service.serviceType === 'airport' && service.category && (
                                                                <span className="text-sm font-normal text-blue-600 ml-1">({service.category})</span>
                                                            )}
                                                            {service.serviceType === 'airport' && service.way_type && (
                                                                <span className="text-sm font-normal text-green-600 ml-1">({service.way_type})</span>
                                                            )}
                                                            {service.serviceType === 'sht' && (
                                                                <span className="text-sm font-normal text-blue-600 ml-1">(왕복)</span>
                                                            )}
                                                        </span>
                                                        {renderPricingBadge(service)}
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        {service.serviceType === 'sht' && (
                                                            <button
                                                                type="button"
                                                                onClick={() => openShtSeatModal(service)}
                                                                className="rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
                                                            >
                                                                좌석 수정
                                                            </button>
                                                        )}
                                                        {getStatusBadge(resolvedStatus)}
                                                    </div>
                                                </div>

                                                {renderServiceContent(service)}

                                                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <span className="text-[10px] text-gray-300">#{service.reservation_id}</span>
                                                </div>
                                            </div>
                                        )})}
                                    </div>
                                </div>
                            )})}
                        </div>
                    )}

                    {/* 푸터 - 스크롤 영역 내부로 이동 */}
                    <div className="mt-8 pt-6 border-t border-gray-200">
                        {/* 서비스별 금액 카드 */}
                        {(enrichedServices?.length || 0) > 0 && (
                            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4 mb-4">
                                <h4 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-1.5">
                                    <Wallet className="w-4 h-4 text-blue-600" />
                                    예상 총 금액
                                </h4>
                                {(() => {
                                    // 총 금액 집계
                                    const additionalFeeByReservation = new Map<string, number>();
                                    const reservationTotalByReservation = new Map<string, number>();
                                    let rowFallbackTotal = 0;
                                    (enrichedServices || []).forEach((s: any) => {
                                        const t = s.serviceType;
                                        // SHT Drop-off 행은 집계 제외 (왕복요금은 픽업에만 포함)
                                        if (t === 'sht' && isShtDropoffCategory(s.category || s.sht_category)) return;

                                        const reservationId = String(s.reservation_id || s.reservationId || '').trim();
                                        if (reservationId && !additionalFeeByReservation.has(reservationId)) {
                                            additionalFeeByReservation.set(reservationId, getManualAdditionalFee(s));
                                        }
                                        // 이미 집계된 예약 ID는 건너맜
                                        if (reservationId && reservationTotalByReservation.has(reservationId)) return;

                                        // 크루즈는 변경 데이터가 반영된 getCruiseDisplayTotal 우선
                                        let rowTotal: number;
                                        if (t === 'cruise') {
                                            rowTotal = getCruiseDisplayTotal(s);
                                        } else {
                                            const reservationTotalAmount = getReservationTotalAmount(s);
                                            rowTotal = reservationTotalAmount !== null
                                                ? reservationTotalAmount
                                                : Number(s.room_total_price || s.totalPrice || s.total_amount || 0);
                                        }

                                        if (reservationId) {
                                            reservationTotalByReservation.set(reservationId, rowTotal);
                                        } else if (Number.isFinite(rowTotal)) {
                                            rowFallbackTotal += rowTotal;
                                        }
                                    });
                                    const additionalFeeTotal = Array.from(additionalFeeByReservation.values()).reduce((sum, fee) => sum + Number(fee || 0), 0);
                                    const reservationGrandTotal = Array.from(reservationTotalByReservation.values()).reduce((sum, total) => sum + Number(total || 0), 0);
                                    const displayGrandTotal = reservationGrandTotal + rowFallbackTotal;

                                    return (
                                        <div className="space-y-1">
                                            <div className="flex justify-between items-center">
                                                <span className="text-sm font-bold text-gray-900">합계</span>
                                                <span className="text-lg font-bold text-blue-600">{displayGrandTotal.toLocaleString()}동</span>
                                            </div>
                                            {additionalFeeTotal !== 0 && (
                                                <div className="flex justify-between items-center text-xs">
                                                    <span className="text-rose-700 font-medium">예약 추가/차감 합계</span>
                                                    <span className="font-bold text-rose-700">{formatSignedAmount(additionalFeeTotal)}</span>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })()}
                            </div>
                        )}
                        <div className="flex justify-between items-center">
                            <div className="text-sm text-gray-500">
                                총 <span className="font-bold text-gray-900">{allUserServices?.length || 0}</span>건의 예약
                            </div>
                            <button
                                onClick={onClose}
                                className="px-6 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors font-medium"
                            >
                                닫기
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {isShtSeatModalOpen && selectedShtService && (
                <ShtCarSeatMap
                    isOpen={isShtSeatModalOpen}
                    onClose={() => {
                        setIsShtSeatModalOpen(false);
                        setSelectedShtService(null);
                    }}
                    usageDate={selectedShtService.usageDate || selectedShtService.pickupDatetime || selectedShtService.pickup_datetime || undefined}
                    vehicleNumber={selectedShtService.vehicleNumber || undefined}
                    initialCategory={isShtDropoffCategory(selectedShtService.category || selectedShtService.sht_category) ? 'dropoff' : 'pickup'}
                    saveToDb
                    reservationId={selectedShtService.reservation_id || undefined}
                    pickupLocation={selectedShtService.pickupLocation || undefined}
                    dropoffLocation={selectedShtService.dropoffLocation || undefined}
                    onSeatSelect={handleShtSeatSelected}
                />
            )}
        </div>
    );
}
