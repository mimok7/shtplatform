'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
    X,
    Users,
    Package,
    Calendar,
    CheckCircle,
    AlertCircle,
    XCircle,
    Ship,
    Plane,
    Building,
    MapPin,
    Car,
    Clock,
} from 'lucide-react';
import supabase from '@/lib/supabase';

interface PackageReservationDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    userInfo: any;
    allUserServices: any[];
    loading: boolean;
}

function formatKst(value?: string | null): string {
    if (!value) return '-';
    const raw = String(value).trim();
    if (!raw) return '-';

    const hasTimezone = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(raw);
    if (!hasTimezone) {
        return raw.replace('T', ' ').slice(0, 16);
    }

    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return raw;

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

function formatKstMerged(value?: any, dateValue?: any, timeValue?: any): string {
    const rawValue = String(value ?? '').trim();
    const rawDate = String(dateValue ?? '').trim();
    const rawTime = String(timeValue ?? '').trim();

    const merged = (() => {
        if (rawValue) {
            const normalized = rawValue.replace(' ', 'T');
            const hasTime = /T\d{2}:\d{2}/.test(normalized) || /\d{2}:\d{2}/.test(normalized);
            if (hasTime || (!rawDate && !rawTime)) return rawValue;
        }
        if (rawDate && rawTime) return `${rawDate}T${rawTime}`;
        return rawValue || rawDate || rawTime;
    })();

    return formatKst(merged || null);
}

function isUuidLike(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isCodeLike(value: any): boolean {
    const raw = String(value || '').trim();
    if (!raw) return false;
    if (isUuidLike(raw)) return true;
    if (/^[A-Z]{1,6}[-_][A-Z0-9_-]{2,}$/i.test(raw)) return true;
    if (/^[A-Z]_[0-9]{2}_[0-9]{2}_[0-9]{5,}$/i.test(raw)) return true;
    return false;
}

function humanizeText(value: any, fallback = '-'): string {
    const raw = String(value || '').trim();
    if (!raw) return fallback;
    if (/^updating$/i.test(raw)) return '미정';
    return raw;
}

function humanizeWayType(value: any): string {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return '-';
    if (raw.includes('pickup') || raw.includes('entry') || raw.includes('픽업')) return '픽업';
    if (raw.includes('sending') || raw.includes('sanding') || raw.includes('exit') || raw.includes('샌딩')) return '샌딩';
    if (raw.includes('dropoff') || raw.includes('drop') || raw.includes('드롭')) return '드롭';
    return humanizeText(value);
}

function humanizeServiceName(value: any, fallbackLabel: string): string {
    const raw = String(value || '').trim();
    if (!raw) return fallbackLabel;
    if (isCodeLike(raw)) return fallbackLabel;
    return humanizeText(raw, fallbackLabel);
}

function getTourDisplayName(service: any): string {
    const directName = service.tourDbName || service.tourName || service.tour_name || service.tour?.tour_name;
    if (directName && !isCodeLike(directName)) return humanizeText(directName, '투어 프로그램');

    const note = formatNote(service.note || service.request_note);
    const noteTour = note.match(/투어\s*[:：]\s*([^\n]+)/)?.[1]
        || note.match(/\[(닌빈|하노이)[^\]]*투어[^\]]*\]/)?.[0];
    if (noteTour) return humanizeText(noteTour.replace(/[\[\]]/g, ''), '투어 프로그램');
    if (note) return humanizeText(note, '투어 프로그램');

    const joined = `${service.route || ''} ${service.category || ''} ${service.pickupLocation || service.pickup_location || ''} ${service.dropoffLocation || service.dropoff_location || service.destination || ''} ${note}`;
    if (/닌빈|ninh/i.test(joined)) return '닌빈 투어';
    if (/하노이|hanoi/i.test(joined)) return '하노이 오후 투어';

    if (directName) return humanizeServiceName(directName, '투어 프로그램');
    return '투어 프로그램';
}

function formatAmount(value: any): string {
    const amount = Number(value || 0);
    const safeAmount = Number.isFinite(amount) ? amount : 0;
    return `${safeAmount.toLocaleString()}동`;
}

function firstFilled(...values: any[]): any {
    return values.find((value) => value !== null && value !== undefined && value !== '');
}

function toAmount(...values: any[]): number {
    const value = firstFilled(...values);
    const parsed = Number(value || 0);
    return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeServiceType(type: any): string {
    const raw = String(type || '').trim();
    const withoutPackage = raw.startsWith('package_') ? raw.replace(/^package_/, '') : raw;
    if (withoutPackage === 'car_sht' || withoutPackage === 'reservation_car_sht') return 'sht';
    if (withoutPackage === 'car') return 'vehicle';
    return withoutPackage || 'service';
}

function formatNote(value: any): string {
    const raw = String(value || '').trim();
    if (!raw) return '';

    return raw
        .replace(/\[\s*/g, '')
        .replace(/\s*\]/g, '')
        .replace(/UPDATING/gi, '미정')
        .trim();
}

function extractCruiseInfoFromNote(note: any): { cruiseName?: string; roomType?: string } {
    const text = formatNote(note);
    if (!text) return {};

    const line = text
        .split('\n')
        .map((v) => v.trim())
        .find((v) => v.startsWith('객실:'));

    if (!line) return {};

    const value = line.replace(/^객실:\s*/, '').trim();
    if (!value) return {};

    const tokens = value.split(/\s+/).filter(Boolean);
    if (tokens.length < 2) return { roomType: value };

    const roomKeywordIndex = tokens.findIndex((t) => /(스위트|캐빈|룸|디럭스|베란다|씨뷰|오션|패밀리)/.test(t));

    if (roomKeywordIndex > 0) {
        const cruiseName = tokens.slice(0, roomKeywordIndex).join(' ').trim();
        const roomType = tokens.slice(roomKeywordIndex).join(' ').trim();
        return { cruiseName, roomType };
    }

    if (tokens.length >= 3) {
        return {
            cruiseName: tokens.slice(0, 2).join(' ').trim(),
            roomType: tokens.slice(2).join(' ').trim(),
        };
    }

    return { roomType: value };
}

function getServiceDateValue(service: any): string {
    return String(
        service.checkin ||
        service.checkinDate ||
        service.checkin_date ||
        service.tourDate ||
        service.usage_date ||
        service.usageDate ||
        service.ra_datetime ||
        service.pickup_datetime ||
        service.pickupDatetime ||
        service.return_datetime ||
        service.returnDatetime ||
        service.re_created_at ||
        ''
    ).trim();
}

function getTimeValue(value: string): number {
    if (!value) return Number.MAX_SAFE_INTEGER;
    const hasTimezone = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(value);
    const normalized = hasTimezone ? value : value.replace(' ', 'T');
    const d = new Date(normalized);
    const t = d.getTime();
    return Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : t;
}

function getDateKey(value: string): string {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const m = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];

    const d = new Date(raw.replace(' ', 'T'));
    if (Number.isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 10);
}

function getAirportOrderWeight(service: any): number {
    const type = humanizeWayType(service.category || service.way_type);
    if (type === '픽업') return 0;
    if (type === '샌딩') return 1;
    return 9;
}

function getPackageStepWeight(service: any): number {
    const type = service?.serviceType || '';
    if (type === 'airport') {
        return getAirportOrderWeight(service) === 0 ? 10 : 90;
    }
    if (type === 'tour') {
        const name = getTourDisplayName(service);
        if (/닌빈|ninh/i.test(name)) return 20;
        if (/하노이|hanoi/i.test(name)) return 70;
        return 25;
    }
    if (type === 'sht') {
        const category = String(service.category || service.sht_category || '').toLowerCase();
        if (category.includes('pickup') || category.includes('픽업')) return 30;
        if (category.includes('drop') || category.includes('드롭')) return 60;
        return 50;
    }
    if (type === 'cruise') return 40;
    if (type === 'hotel') return 80;
    return 99;
}

function getAirportDisplayLocations(service: any): { pickup: string; sending: string } {
    const wayType = humanizeWayType(service.category || service.way_type);
    const airport = humanizeText(service.airportName || service.ra_airport_location || service.airport_location, '미정');
    const stay = humanizeText(service.accommodation_info || service.ra_accommodation_info, '');
    const pickupRaw = humanizeText(service.pickupLocation || service.pickup_location || stay, '');
    const dropRaw = humanizeText(service.dropoffLocation || service.destination || service.dropoff_location || stay, '');

    if (wayType === '픽업') {
        return {
            pickup: pickupRaw !== '-' && pickupRaw ? pickupRaw : airport,
            sending: dropRaw !== '-' && dropRaw ? dropRaw : '미정',
        };
    }

    if (wayType === '샌딩') {
        return {
            pickup: pickupRaw !== '-' && pickupRaw ? pickupRaw : '미정',
            sending: dropRaw !== '-' && dropRaw ? dropRaw : airport,
        };
    }

    return {
        pickup: pickupRaw !== '-' && pickupRaw ? pickupRaw : '미정',
        sending: dropRaw !== '-' && dropRaw ? dropRaw : '미정',
    };
}

function getStatusBadge(status?: string) {
    const s = String(status || '').toLowerCase();
    if (s === 'confirmed') return <span className="flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full"><CheckCircle className="w-3 h-3" />확정</span>;
    if (s === 'approved') return <span className="flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full"><CheckCircle className="w-3 h-3" />승인</span>;
    if (s === 'completed') return <span className="flex items-center gap-1 text-xs font-medium text-gray-700 bg-gray-100 px-2 py-0.5 rounded-full"><CheckCircle className="w-3 h-3" />완료</span>;
    if (s === 'pending') return <span className="flex items-center gap-1 text-xs font-medium text-yellow-700 bg-yellow-100 px-2 py-0.5 rounded-full"><AlertCircle className="w-3 h-3" />대기</span>;
    if (s === 'cancelled') return <span className="flex items-center gap-1 text-xs font-medium text-red-700 bg-red-100 px-2 py-0.5 rounded-full"><XCircle className="w-3 h-3" />취소</span>;
    return <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{status || '-'}</span>;
}

function getServiceIcon(type: string) {
    switch (type) {
        case 'cruise':
            return <Ship className="w-4 h-4 text-blue-600" />;
        case 'airport':
            return <Plane className="w-4 h-4 text-green-600" />;
        case 'hotel':
            return <Building className="w-4 h-4 text-orange-600" />;
        case 'tour':
            return <MapPin className="w-4 h-4 text-purple-600" />;
        case 'rentcar':
        case 'vehicle':
        case 'car':
        case 'sht':
            return <Car className="w-4 h-4 text-indigo-600" />;
        default:
            return <Clock className="w-4 h-4 text-gray-500" />;
    }
}

function getServiceLabel(type: string) {
    const map: Record<string, string> = {
        package: '패키지',
        cruise: '크루즈',
        airport: '공항',
        hotel: '호텔',
        tour: '투어',
        ticket: '티켓',
        rentcar: '렌터카',
        vehicle: '크루즈 차량',
        car: '크루즈 차량',
        sht: '스하차량',
    };
    return map[type] || type;
}

function normalizePackageRoot(pkg: any): any {
    const service = pkg?.service || {};
    const packageMaster = pkg?.package_master || service?.package_master || {};
    const adultCount = toAmount(pkg?.re_adult_count, pkg?.adult_count, pkg?.adult, service?.re_adult_count);
    const childExtraBed = toAmount(pkg?.child_extra_bed);
    const childNoExtraBed = toAmount(pkg?.child_no_extra_bed);
    const infantTour = toAmount(pkg?.infant_tour);
    const infantExtraBed = toAmount(pkg?.infant_extra_bed);
    const infantSeat = toAmount(pkg?.infant_seat);
    const adultPrice = toAmount(pkg?.adult_price, packageMaster?.base_price);
    const childExtraBedPrice = toAmount(pkg?.child_extra_bed_price, packageMaster?.price_child_extra_bed);
    const childNoExtraBedPrice = toAmount(pkg?.child_no_extra_bed_price, packageMaster?.price_child_no_extra_bed);
    const infantTourPrice = toAmount(pkg?.infant_tour_price, packageMaster?.price_infant_tour);
    const infantExtraBedPrice = toAmount(pkg?.infant_extra_bed_price, packageMaster?.price_infant_extra_bed);
    const infantSeatPrice = toAmount(pkg?.infant_seat_price, packageMaster?.price_infant_seat);
    const explicitTotalPrice = toAmount(pkg?.total_amount, pkg?.total_price, pkg?.totalPrice, service?.total_amount, service?.totalPrice);
    const calculatedPackagePrice =
        (adultCount * adultPrice) +
        (childExtraBed * childExtraBedPrice) +
        (childNoExtraBed * childNoExtraBedPrice) +
        (infantTour * infantTourPrice) +
        (infantExtraBed * infantExtraBedPrice) +
        (infantSeat * infantSeatPrice);
    return {
        ...pkg,
        serviceType: 'package',
        re_id: firstFilled(pkg?.re_id, pkg?.reservation_id, service?.re_id),
        reservation_id: firstFilled(pkg?.reservation_id, pkg?.re_id, service?.re_id),
        re_status: firstFilled(pkg?.re_status, pkg?.status, service?.re_status, service?.status),
        re_created_at: firstFilled(pkg?.re_created_at, service?.re_created_at, pkg?.created_at),
        package_name: firstFilled(pkg?.package_name, packageMaster?.name, pkg?.name),
        package_code: firstFilled(pkg?.package_code, packageMaster?.package_code),
        package_description: firstFilled(pkg?.package_description, packageMaster?.description, pkg?.description),
        packageTotalAmount: explicitTotalPrice > 0 ? explicitTotalPrice : calculatedPackagePrice,
        adultCount,
        childCount: toAmount(pkg?.re_child_count, pkg?.child_count, pkg?.child, service?.re_child_count),
        infantCount: toAmount(pkg?.re_infant_count, pkg?.infant_count, pkg?.infant, service?.re_infant_count),
        childExtraBed,
        childNoExtraBed,
        infantFree: toAmount(pkg?.infant_free),
        infantTour,
        infantExtraBed,
        infantSeat,
        adultPrice,
        childExtraBedPrice,
        childNoExtraBedPrice,
        infantTourPrice,
        infantExtraBedPrice,
        infantSeatPrice,
        airportVehicle: firstFilled(pkg?.airport_vehicle),
        ninhBinhVehicle: firstFilled(pkg?.ninh_binh_vehicle),
        hanoiVehicle: firstFilled(pkg?.hanoi_vehicle),
        cruiseVehicle: firstFilled(pkg?.cruise_vehicle),
        shtPickupVehicle: firstFilled(pkg?.sht_pickup_vehicle),
        shtPickupSeat: firstFilled(pkg?.sht_pickup_seat),
        shtDropoffVehicle: firstFilled(pkg?.sht_dropoff_vehicle),
        shtDropoffSeat: firstFilled(pkg?.sht_dropoff_seat),
    };
}

function normalizePackageService(service: any): any {
    const base = service?.service || {};
    const type = normalizeServiceType(service?.serviceType || service?.re_type || base?.re_type);
    if (type === 'package') return normalizePackageRoot(service);

    const roomInfo = service?.roomPriceInfo || service?.room_price_info || {};
    const airportInfo = service?.airportPriceInfo || service?.airport_price_info || {};
    const hotelInfo = service?.hotelPriceInfo || service?.hotel_price_info || {};
    const tourInfo = service?.tourPriceInfo || service?.tour_price_info || {};
    const rentInfo = service?.rentcarPriceInfo || service?.rentcar_price_info || service?.carPriceInfo || {};

    return {
        ...service,
        serviceType: type,
        isPackageService: true,
        re_status: firstFilled(service?.re_status, service?.status, base?.re_status, base?.status),
        re_created_at: firstFilled(service?.re_created_at, base?.re_created_at),
        checkin: firstFilled(service?.checkin, service?.checkin_date),
        checkinDate: firstFilled(service?.checkinDate, service?.checkin_date),
        tourDate: firstFilled(service?.tourDate, service?.usage_date, service?.usageDate),
        usageDate: firstFilled(service?.usageDate, service?.usage_date, service?.pickup_datetime),
        pickupDatetime: firstFilled(service?.pickupDatetime, service?.pickup_datetime, service?.ra_datetime),
        pickupDate: firstFilled(service?.pickupDate, service?.pickup_date),
        pickupTime: firstFilled(service?.pickupTime, service?.pickup_time),
        returnDatetime: firstFilled(service?.returnDatetime, service?.return_datetime),
        returnDate: firstFilled(service?.returnDate, service?.return_date),
        returnTime: firstFilled(service?.returnTime, service?.return_time),
        cruise: firstFilled(service?.cruise, service?.cruiseName, roomInfo?.cruise_name),
        cruiseName: firstFilled(service?.cruiseName, service?.cruise, roomInfo?.cruise_name),
        roomType: firstFilled(service?.roomType, roomInfo?.room_type, service?.room_price_code, hotelInfo?.room_name, service?.hotel_price_code),
        hotelName: firstFilled(service?.hotelName, hotelInfo?.hotel_name, service?.hotel_category),
        tourName: firstFilled(service?.tourName, service?.tour_name, tourInfo?.tour?.tour_name, service?.tour_price_code),
        category: firstFilled(service?.category, service?.way_type, service?.sht_category, airportInfo?.service_type, rentInfo?.way_type),
        route: firstFilled(service?.route, airportInfo?.route, rentInfo?.route),
        carType: firstFilled(service?.carType, service?.vehicle_type, airportInfo?.vehicle_type, rentInfo?.vehicle_type, service?.rentcar_price_code),
        airportName: firstFilled(service?.airportName, service?.ra_airport_location, service?.airport_location),
        pickupLocation: firstFilled(service?.pickupLocation, service?.pickup_location),
        dropoffLocation: firstFilled(service?.dropoffLocation, service?.dropoff_location, service?.destination),
        flightNumber: firstFilled(service?.flightNumber, service?.ra_flight_number),
        passengerCount: firstFilled(service?.passengerCount, service?.ra_passenger_count, service?.passenger_count),
        carCount: firstFilled(service?.carCount, service?.ra_car_count, service?.car_count),
        luggageCount: firstFilled(service?.luggageCount, service?.ra_luggage_count, service?.luggage_count),
        guestCount: firstFilled(service?.guestCount, service?.guest_count),
        tourCapacity: firstFilled(service?.tourCapacity, service?.tour_capacity),
        vehicleNumber: firstFilled(service?.vehicleNumber, service?.vehicle_number),
        seatNumber: firstFilled(service?.seatNumber, service?.seat_number),
        driverName: firstFilled(service?.driverName, service?.driver_name),
        dispatchCode: firstFilled(service?.dispatchCode, service?.dispatch_code),
        adult: toAmount(service?.adult, service?.adult_count, service?.guest_count, base?.re_adult_count),
        child: toAmount(service?.child, service?.child_count, base?.re_child_count),
        infant: toAmount(service?.infant, service?.infant_count, base?.re_infant_count),
        unitAmount: toAmount(service?.unitPrice, service?.unit_price, airportInfo?.price, hotelInfo?.base_price, tourInfo?.price_per_person, rentInfo?.price),
        serviceTotalAmount: toAmount(service?.totalPrice, service?.total_price, service?.room_total_price, service?.car_total_price, service?.total_amount),
        note: firstFilled(service?.note, service?.request_note),
    };
}

export default function PackageReservationDetailModal({
    isOpen,
    onClose,
    userInfo,
    allUserServices,
    loading,
}: PackageReservationDetailModalProps) {
    const [packageDetailMap, setPackageDetailMap] = useState<Record<string, any>>({});
    const [tourNameMap, setTourNameMap] = useState<Record<string, string>>({});

    const packageRootIds = useMemo(() => {
        const list = Array.isArray(allUserServices) ? allUserServices : [];
        return Array.from(new Set(
            list
                .filter((s) => s?.serviceType === 'package' || s?.re_type === 'package')
                .map((s) => String(s?.reservation_id || s?.re_id || '').trim())
                .filter(Boolean)
        )).sort();
    }, [allUserServices]);

    useEffect(() => {
        if (!isOpen || packageRootIds.length === 0) {
            setPackageDetailMap({});
            return;
        }

        let cancelled = false;
        const loadPackageDetails = async () => {
            const { data: packageDetails, error } = await supabase
                .from('reservation_package')
                .select('*')
                .in('reservation_id', packageRootIds);

            if (cancelled || error) return;

            const packageIds = Array.from(new Set(
                [
                    ...(Array.isArray(allUserServices) ? allUserServices : []).map((s: any) => s?.package_id),
                    ...(packageDetails || []).map((detail: any) => detail?.package_id),
                ].filter(Boolean)
            ));

            const { data: packageMasters } = packageIds.length > 0
                ? await supabase
                    .from('package_master')
                    .select('id, name, package_code, description, base_price, price_child_extra_bed, price_child_no_extra_bed, price_infant_tour, price_infant_extra_bed, price_infant_seat')
                    .in('id', packageIds)
                : { data: [] as any[] };

            if (cancelled) return;

            const masterMap = new Map((packageMasters || []).map((pkg: any) => [pkg.id, pkg]));
            const nextMap: Record<string, any> = {};

            (packageDetails || []).forEach((detail: any) => {
                const reservationId = String(detail?.reservation_id || '').trim();
                if (!reservationId) return;
                nextMap[reservationId] = {
                    ...detail,
                    package_master: masterMap.get(detail?.package_id),
                };
            });

            packageRootIds.forEach((reservationId) => {
                const root = (Array.isArray(allUserServices) ? allUserServices : []).find((s: any) => String(s?.reservation_id || s?.re_id || '').trim() === reservationId);
                if (!root) return;
                nextMap[reservationId] = {
                    ...(nextMap[reservationId] || {}),
                    package_master: nextMap[reservationId]?.package_master || masterMap.get(root?.package_id),
                };
            });

            setPackageDetailMap(nextMap);
        };

        loadPackageDetails();
        return () => {
            cancelled = true;
        };
    }, [allUserServices, isOpen, packageRootIds]);

    useEffect(() => {
        if (!isOpen) {
            setTourNameMap({});
            return;
        }

        const tourServices = (Array.isArray(allUserServices) ? allUserServices : [])
            .filter((service: any) => service?.serviceType === 'tour' || service?.re_type === 'tour');
        const tourPriceCodes = Array.from(new Set(
            tourServices
                .map((service: any) => String(service?.tour_price_code || '').trim())
                .filter(Boolean)
        ));
        const directTourIds = Array.from(new Set(
            tourServices
                .map((service: any) => String(service?.tour_id || '').trim())
                .filter(Boolean)
        ));
        if (tourPriceCodes.length === 0 && directTourIds.length === 0) {
            setTourNameMap({});
            return;
        }

        let cancelled = false;
        const loadTourNames = async () => {
            const { data: priceRows, error: priceError } = tourPriceCodes.length > 0
                ? await supabase
                    .from('tour_pricing')
                    .select('pricing_id, tour_id')
                    .in('pricing_id', tourPriceCodes)
                : { data: [] as any[], error: null };
            if (cancelled || priceError) return;

            const tourIds = Array.from(new Set([
                ...directTourIds,
                ...(priceRows || []).map((price: any) => String(price?.tour_id || '').trim()).filter(Boolean),
            ]));
            const { data: tourRows, error: tourError } = tourIds.length > 0
                ? await supabase
                    .from('tour')
                    .select('tour_id, tour_name')
                    .in('tour_id', tourIds)
                : { data: [] as any[], error: null };

            if (cancelled || tourError) return;
            const namesByTourId = new Map<string, string>(
                (tourRows || []).map((tour: any) => [String(tour?.tour_id), String(tour?.tour_name || '').trim()])
            );
            const nextMap: Record<string, string> = {};
            (priceRows || []).forEach((price: any) => {
                const name = namesByTourId.get(String(price?.tour_id)) || '';
                if (price?.pricing_id && name) nextMap[String(price.pricing_id)] = name;
            });
            directTourIds.forEach((tourId) => {
                const name = namesByTourId.get(tourId) || '';
                if (name) nextMap[`tour:${tourId}`] = name;
            });
            setTourNameMap(nextMap);
        };

        void loadTourNames();
        return () => {
            cancelled = true;
        };
    }, [allUserServices, isOpen]);

    const filteredServices = useMemo(() => {
        const list = Array.isArray(allUserServices) ? allUserServices : [];
        const packageReservationIds = new Set(
            list
                .filter((s) => s?.serviceType === 'package' || s?.re_type === 'package')
                .map((s) => String(s?.reservation_id || s?.re_id || '').trim())
                .filter(Boolean)
        );
        const hasPackageScoped = packageReservationIds.size > 0 || list.some((s) => s?.isPackageService);
        const scoped = hasPackageScoped
            ? list.filter((s) => {
                const reservationId = String(s?.reservation_id || s?.re_id || '').trim();
                return s?.serviceType === 'package' || s?.re_type === 'package' || s?.isPackageService || packageReservationIds.has(reservationId);
            })
            : list;
        return scoped.map(normalizePackageService).map((service) => ({
            ...service,
            tourDbName: service?.serviceType === 'tour'
                ? tourNameMap[String(service?.tour_price_code || '')]
                    || tourNameMap[`tour:${String(service?.tour_id || '')}`]
                : undefined,
        }));
    }, [allUserServices, tourNameMap]);

    const packageRoots = useMemo(
        () => filteredServices
            .filter((s) => s?.serviceType === 'package')
            .map((pkg) => {
                const reservationId = String(pkg?.reservation_id || pkg?.re_id || '').trim();
                const detail = reservationId ? packageDetailMap[reservationId] : null;
                return normalizePackageRoot({
                    ...(detail || {}),
                    ...pkg,
                    package_master: pkg?.package_master || detail?.package_master,
                });
            }),
        [filteredServices, packageDetailMap]
    );

    const packageRootRows = useMemo(() => {
        const map = new Map<string, any>();
        packageRoots.forEach((pkg, idx) => {
            const key = String(pkg?.re_id || pkg?.reservation_id || `pkg-${idx}`);
            if (!map.has(key)) map.set(key, pkg);
        });
        return Array.from(map.values());
    }, [packageRoots]);

    const packageServices = useMemo(() => {
        const nonPackage = filteredServices.filter((s) => s?.serviceType !== 'package');

        // 모든 서비스의 중복 제거 (reservation_id + serviceType + 주요 식별자 조합)
        const seen = new Set<string>();
        const deduped = nonPackage.filter((s) => {
            const reservationId = String(s?.reservation_id || s?.re_id || '');
            const serviceType = String(s?.serviceType || '');
            
            // 각 서비스 타입별 고유 식별자 생성
            let uniqueKey = `${reservationId}|${serviceType}`;
            
            if (serviceType === 'tour') {
                // 투어: 날짜 + 투어명 + 픽업/드롭
                const rawName = getTourDisplayName(s);
                uniqueKey += `|${String(s?.tourDate || '')}|${rawName}|${String(s?.pickupLocation || s?.pickup_location || '')}|${String(s?.dropoffLocation || s?.destination || s?.dropoff_location || '')}`;
            } else if (serviceType === 'airport') {
                // 공항: 날짜 + 구분 (픽업/샌딩)
                uniqueKey += `|${String(s?.ra_datetime || '')}|${String(s?.category || s?.way_type || '')}`;
            } else if (serviceType === 'cruise') {
                // 크루즈: 체크인 날짜
                uniqueKey += `|${String(s?.checkin || '')}`;
            } else if (serviceType === 'hotel') {
                // 호텔: 체크인 날짜 + 호텔명
                uniqueKey += `|${String(s?.checkinDate || '')}|${String(s?.hotelName || '')}`;
            } else if (serviceType === 'rentcar') {
                // 렌트카: 픽업 날짜시간
                uniqueKey += `|${String(s?.pickupDatetime || '')}`;
            } else if (serviceType === 'sht') {
                // 스하: 사용 날짜 + 분류
                uniqueKey += `|${String(s?.usageDate || '')}|${String(s?.category || '')}`;
            }
            
            if (seen.has(uniqueKey)) return false;
            seen.add(uniqueKey);
            return true;
        });

        const pickupAirportDate = [...deduped]
            .filter((s) => s?.serviceType === 'airport' && humanizeWayType(s?.category || s?.way_type) === '픽업')
            .map((s) => getDateKey(getServiceDateValue(s)))
            .filter(Boolean)
            .sort()[0] || '';

        const filteredByPickupTourRule = deduped.filter((s) => {
            if (s?.serviceType !== 'tour') return true;
            const tourDateKey = getDateKey(getServiceDateValue(s));
            return !(pickupAirportDate && tourDateKey === pickupAirportDate);
        });

        // 날짜순 정렬 + 같은 날짜 공항은 픽업 먼저, 샌딩 나중
        return [...filteredByPickupTourRule].sort((a, b) => {
            const ta = getTimeValue(getServiceDateValue(a));
            const tb = getTimeValue(getServiceDateValue(b));
            const dateA = getServiceDateValue(a).slice(0, 10);
            const dateB = getServiceDateValue(b).slice(0, 10);
            if (dateA && dateB && dateA === dateB) {
                const stepDiff = getPackageStepWeight(a) - getPackageStepWeight(b);
                if (stepDiff !== 0) return stepDiff;
            }
            if (ta !== tb) return ta - tb;

            const stepDiff = getPackageStepWeight(a) - getPackageStepWeight(b);
            if (stepDiff !== 0) return stepDiff;

            if (a?.serviceType === 'airport' && b?.serviceType === 'airport') {
                return getAirportOrderWeight(a) - getAirportOrderWeight(b);
            }

            return 0;
        });
    }, [filteredServices]);

    const totalAmount = useMemo(
        () => packageRootRows.reduce((sum, p) => sum + Number(p?.packageTotalAmount || 0), 0),
        [packageRootRows]
    );

    const displayTotalAmount = totalAmount;

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                <div className="bg-white border-b border-gray-100 px-6 py-4 shrink-0 flex justify-between items-start">
                    <div className="flex-1">
                        <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                            <Package className="w-6 h-6 text-indigo-600" />
                            패키지 예약 통합 상세
                        </h2>
                        {userInfo && (
                            <div className="mt-3 bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-200 rounded-lg p-3">
                                <div className="flex flex-wrap items-center gap-3 text-sm text-gray-700">
                                    <span className="font-semibold text-gray-900 flex items-center gap-1">
                                        <Users className="w-4 h-4 text-indigo-600" />
                                        {userInfo.name || '-'}
                                    </span>
                                    <span>{userInfo.email || '-'}</span>
                                    <span>{userInfo.phone || userInfo.phone_number || '-'}</span>
                                    <span>행복여행: {userInfo.quote_title || '-'}</span>
                                </div>
                            </div>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-500 hover:text-gray-700 p-2 hover:bg-gray-100 rounded-lg"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {loading ? (
                        <div className="text-center py-10 text-gray-500">패키지 예약 상세를 불러오는 중...</div>
                    ) : (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3">
                                    <div className="text-xs text-indigo-700">패키지 예약 건수</div>
                                    <div className="text-xl font-bold text-indigo-900">{packageRootRows.length}건</div>
                                </div>
                                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                                    <div className="text-xs text-blue-700">포함 서비스 건수</div>
                                    <div className="text-xl font-bold text-blue-900">{packageServices.length}건</div>
                                </div>
                                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                                    <div className="text-xs text-emerald-700">패키지 총액 합계 (예약 단위 단일요금)</div>
                                    <div className="text-xl font-bold text-emerald-900">{formatAmount(displayTotalAmount)}</div>
                                </div>
                            </div>

                            {packageRootRows.length > 0 && (
                                <div className="space-y-3">
                                    <h3 className="text-sm font-semibold text-gray-800">패키지 예약 목록</h3>
                                    {packageRootRows.map((pkg, idx) => {
                                        // 수동 추가요금 항목 (price_breakdown.additional_fee_items)
                                        const additionalItems: Array<{key?: string; name: string; amount: number}> =
                                            Array.isArray(pkg.price_breakdown_additional_items)
                                            ? pkg.price_breakdown_additional_items
                                            : [];
                                        const manualAdditionalFee = Number(pkg.manual_additional_fee || 0);

                                        // 생일이벤트 여부: price_breakdown_additional_items에 생일이벤트 항목이 있거나
                                        // cruise 서비스의 birthday_event === true인 경우
                                        const hasBirthdayEvent =
                                            additionalItems.some((item) => /생일/i.test(item.name || '')) ||
                                            filteredServices.some(
                                                (s) =>
                                                    String(s.reservation_id || s.re_id || '').trim() === String(pkg.re_id || pkg.reservation_id || '').trim() &&
                                                    s.serviceType === 'cruise' &&
                                                    s.birthday_event === true
                                            );

                                        const knownSubtotal =
                                            (Number(pkg.childExtraBed || 0) * Number(pkg.childExtraBedPrice || 0)) +
                                            (Number(pkg.childNoExtraBed || 0) * Number(pkg.childNoExtraBedPrice || 0)) +
                                            (Number(pkg.infantTour || 0) * Number(pkg.infantTourPrice || 0)) +
                                            (Number(pkg.infantExtraBed || 0) * Number(pkg.infantExtraBedPrice || 0)) +
                                            (Number(pkg.infantSeat || 0) * Number(pkg.infantSeatPrice || 0)) +
                                            manualAdditionalFee;
                                        const remainingForAdult = Math.max(0, Number(pkg.packageTotalAmount || 0) - knownSubtotal);
                                        const displayAdultPrice = Number(pkg.adultPrice || 0) > 0
                                            ? Number(pkg.adultPrice || 0)
                                            : (Number(pkg.adultCount || 0) > 0 ? Math.round(remainingForAdult / Number(pkg.adultCount || 1)) : 0);

                                        return (
                                        <div key={`${pkg.re_id || pkg.reservation_id || idx}`} className="border border-indigo-100 rounded-lg p-3 bg-indigo-50/40">
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <div className="font-semibold text-indigo-800">
                                                    {pkg.package_name || pkg.package_code || '패키지'}
                                                </div>
                                                {getStatusBadge(pkg.re_status || pkg.service?.re_status)}
                                            </div>
                                            <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-gray-700">
                                                <div>예약일: {formatKst(pkg.re_created_at || pkg.service?.re_created_at)}</div>
                                                {(pkg.adultCount > 0 || pkg.childCount > 0 || pkg.infantCount > 0) && (
                                                    <div>
                                                        인원: {[
                                                            pkg.adultCount > 0 && `성인 ${pkg.adultCount}`,
                                                            pkg.childCount > 0 && `아동 ${pkg.childCount}`,
                                                            pkg.infantCount > 0 && `유아 ${pkg.infantCount}`,
                                                        ].filter(Boolean).join(', ')}
                                                    </div>
                                                )}
                                                <div className="font-semibold text-emerald-700">총액 (단일요금): {formatAmount(pkg.packageTotalAmount)}</div>
                                            </div>
                                            <div className="mt-2 bg-white border border-indigo-100 rounded p-2 text-xs space-y-1">
                                                {pkg.adultCount > 0 && displayAdultPrice > 0 && (
                                                    <div className="flex justify-between">
                                                        <span className="text-gray-600">성인 {displayAdultPrice.toLocaleString()}동 × {pkg.adultCount}명</span>
                                                        <span className="font-medium text-gray-800">{(displayAdultPrice * pkg.adultCount).toLocaleString()}동</span>
                                                    </div>
                                                )}
                                                {/* 수동 추가요금 항목 (노란색) */}
                                                {additionalItems.length > 0 && additionalItems.map((item, i) => (
                                                    <div key={i} className="flex justify-between bg-yellow-100 px-1 py-0.5 rounded font-semibold text-yellow-950">
                                                        <span>{item.name} {Number(item.amount || 0).toLocaleString()}동</span>
                                                        <span>{Number(item.amount || 0).toLocaleString()}동</span>
                                                    </div>
                                                ))}
                                                {/* 수동요금 항목이 없지만 hasBirthdayEvent인 경우 (크루즈 birthday_event) */}
                                                {hasBirthdayEvent && additionalItems.length === 0 && (
                                                    <div className="flex justify-between bg-yellow-100 px-1 py-0.5 rounded font-semibold text-yellow-950">
                                                        <span>생일 이벤트 1,000,000동 × 1명</span>
                                                        <span>1,000,000동</span>
                                                    </div>
                                                )}
                                                {pkg.childExtraBed > 0 && pkg.childExtraBedPrice > 0 && (
                                                    <div className="flex justify-between">
                                                        <span className="text-gray-600">아동(엑베) {pkg.childExtraBedPrice.toLocaleString()}동 × {pkg.childExtraBed}명</span>
                                                        <span className="font-medium text-gray-800">{(pkg.childExtraBedPrice * pkg.childExtraBed).toLocaleString()}동</span>
                                                    </div>
                                                )}
                                                {pkg.childNoExtraBed > 0 && pkg.childNoExtraBedPrice > 0 && (
                                                    <div className="flex justify-between">
                                                        <span className="text-gray-600">아동(베드없음) {pkg.childNoExtraBedPrice.toLocaleString()}동 × {pkg.childNoExtraBed}명</span>
                                                        <span className="font-medium text-gray-800">{(pkg.childNoExtraBedPrice * pkg.childNoExtraBed).toLocaleString()}동</span>
                                                    </div>
                                                )}
                                                {pkg.infantTour > 0 && pkg.infantTourPrice > 0 && (
                                                    <div className="flex justify-between">
                                                        <span className="text-gray-600">유아(투어) {pkg.infantTourPrice.toLocaleString()}동 × {pkg.infantTour}명</span>
                                                        <span className="font-medium text-gray-800">{(pkg.infantTourPrice * pkg.infantTour).toLocaleString()}동</span>
                                                    </div>
                                                )}
                                                {pkg.infantExtraBed > 0 && pkg.infantExtraBedPrice > 0 && (
                                                    <div className="flex justify-between">
                                                        <span className="text-gray-600">유아(엑베) {pkg.infantExtraBedPrice.toLocaleString()}동 × {pkg.infantExtraBed}명</span>
                                                        <span className="font-medium text-gray-800">{(pkg.infantExtraBedPrice * pkg.infantExtraBed).toLocaleString()}동</span>
                                                    </div>
                                                )}
                                                {pkg.infantSeat > 0 && pkg.infantSeatPrice > 0 && (
                                                    <div className="flex justify-between">
                                                        <span className="text-gray-600">유아(좌석) {pkg.infantSeatPrice.toLocaleString()}동 × {pkg.infantSeat}명</span>
                                                        <span className="font-medium text-gray-800">{(pkg.infantSeatPrice * pkg.infantSeat).toLocaleString()}동</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        );
                                    })}
                                </div>
                            )}

                            <div className="space-y-3">
                                <h3 className="text-sm font-semibold text-gray-800">패키지 포함 서비스 전체 내역</h3>
                                {packageServices.length === 0 && (
                                    <div className="text-sm text-gray-500 border border-dashed border-gray-300 rounded-lg p-4">
                                        표시할 패키지 포함 서비스가 없습니다.
                                    </div>
                                )}
                                {packageServices.map((service, idx) => {
                                    const type = service.serviceType || 'service';
                                    const cruiseFromNote = type === 'cruise' ? extractCruiseInfoFromNote(service.note) : {};
                                    const cruiseNameValue = cruiseFromNote.cruiseName || service.cruiseName || service.cruise;
                                    const roomTypeValue = cruiseFromNote.roomType || service.roomType;
                                    const airportLocations = type === 'airport' ? getAirportDisplayLocations(service) : null;
                                    const hasTourNameSource = type === 'tour' || !!(service.tourName || service.tour_name || service.tour?.tour_name);
                                    const unitAmount = Number(service.unitAmount || 0);
                                    return (
                                        <div key={`${service.reservation_id || service.re_id || type}-${idx}`} className="border border-gray-200 rounded-lg p-3 bg-white">
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                                                    {getServiceIcon(type)}
                                                    <span>{getServiceLabel(type)}</span>
                                                </div>
                                                {getStatusBadge(service.re_status || service.service?.re_status)}
                                            </div>

                                            <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-gray-700">
                                                {(service.checkin || service.checkinDate || service.tourDate || service.usageDate || service.ra_datetime || service.pickupDatetime || service.pickupDate || service.pickupTime) && (
                                                    <div>
                                                        <Calendar className="inline w-4 h-4 mr-1 text-gray-500" />
                                                        일정: {formatKstMerged(service.checkin || service.checkinDate || service.tourDate || service.usageDate || service.ra_datetime || service.pickupDatetime, service.pickupDate || service.pickup_date, service.pickupTime || service.pickup_time)}
                                                    </div>
                                                )}
                                                {(service.returnDatetime || service.returnDate || service.returnTime || service.return_date || service.return_time) && (
                                                    <div>리턴 일정: {formatKstMerged(service.returnDatetime || service.return_datetime, service.returnDate || service.return_date, service.returnTime || service.return_time)}</div>
                                                )}
                                                {cruiseNameValue && <div>크루즈: {humanizeServiceName(cruiseNameValue, '크루즈 프로그램')}</div>}
                                                {roomTypeValue && <div>객실타입: {humanizeServiceName(roomTypeValue, '객실 타입 확정 예정')}</div>}
                                                {hasTourNameSource && <div>투어명: {getTourDisplayName(service)}</div>}
                                                {service.hotelName && <div>호텔명: {humanizeServiceName(service.hotelName, '호텔')}</div>}
                                                {(service.category || service.way_type) && <div>구분: {humanizeWayType(service.category || service.way_type)}</div>}
                                                {service.route && <div>경로: {humanizeText(service.route)}</div>}
                                                {service.carType && <div>차량타입: {humanizeServiceName(service.carType, '차량 배정 예정')}</div>}
                                                {type === 'airport' ? (
                                                    <>
                                                        <div>공항명: {humanizeText(service.airportName || service.ra_airport_location, '미정')}</div>
                                                        {humanizeWayType(service.category || service.way_type) === '픽업' ? (
                                                            <div>하차 위치: {airportLocations?.sending || '미정'}</div>
                                                        ) : (
                                                            <div>승차 위치: {airportLocations?.pickup || '미정'}</div>
                                                        )}
                                                    </>
                                                ) : (
                                                    <>
                                                        {(service.pickupLocation || service.pickup_location) && <div>픽업: {humanizeText(service.pickupLocation || service.pickup_location, '미정')}</div>}
                                                        {(service.dropoffLocation || service.destination || service.dropoff_location) && <div>드롭: {humanizeText(service.dropoffLocation || service.destination || service.dropoff_location, '미정')}</div>}
                                                    </>
                                                )}
                                                {service.flightNumber && <div>항공편: {humanizeText(service.flightNumber)}</div>}
                                                {type !== 'airport' && service.passengerCount != null && <div>탑승 인원: {service.passengerCount}명</div>}
                                                {service.carCount != null && <div>차량수: {service.carCount}대</div>}
                                                {service.luggageCount != null && <div>수하물: {service.luggageCount}개</div>}
                                                {service.guestCount != null && <div>투숙 인원: {service.guestCount}명</div>}
                                                {type !== 'tour' && service.tourCapacity != null && <div>투어 인원: {service.tourCapacity}명</div>}
                                                {service.vehicleNumber && <div>차량번호: {humanizeText(service.vehicleNumber)}</div>}
                                                {service.seatNumber && <div>좌석: {humanizeText(service.seatNumber)}</div>}
                                                {service.driverName && <div>기사: {humanizeText(service.driverName)}</div>}
                                                {service.dispatchCode && <div>배차코드: {humanizeText(service.dispatchCode)}</div>}
                                                {type !== 'sht' && type !== 'airport' && type !== 'tour' && (service.adult != null || service.child != null || service.infant != null) && (
                                                    <div>인원 구성: 성인 {service.adult || 0}, 아동 {service.child || 0}, 유아 {service.infant || 0}</div>
                                                )}
                                            </div>

                                            <div className="mt-2 pt-2 border-t border-gray-100">
                                                <div className="flex justify-between items-center">
                                                    <span className="text-gray-500 text-sm">금액</span>
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700">패키지 포함</span>
                                                </div>
                                            </div>

                                            {formatNote(service.note || service.request_note) && (
                                                <div className="mt-2 text-xs text-gray-600 bg-gray-50 p-2 rounded whitespace-pre-line">
                                                    비고: {formatNote(service.note || service.request_note)}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
