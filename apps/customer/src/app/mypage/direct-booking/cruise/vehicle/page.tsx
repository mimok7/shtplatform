'use client';

import { useState, useEffect, Suspense, useMemo, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import supabase from '../../../../../lib/supabase';
import { refreshAuthBeforeSubmit } from '../../../../../lib/authHelpers';
import { useLoadingTimeout } from '../../../../../hooks/useLoadingTimeout';
import { hasInvalidLocationChars, normalizeLocationEnglishUpper } from '../../../../../lib/locationInput';
import PageWrapper from '../../../../../components/PageWrapper';
import ShtCarSeatMap from '../../../../../components/ShtCarSeatMap';

type VehicleRow = {
    car_type: string;
    car_category: string;
    car_code: string;
    route: string;
    count: number;
    custom_price?: number;
};

type VehicleServiceType = 'cruise_shuttle' | 'private_rental';

type CruiseReservationOption = {
    reservationId: string;
    quoteId: string | null;
    cruiseName: string;
    checkin: string;
    schedule: string;
    roomTypes: string[];
    guestCount: number;
};

type OtherDayUsageOption = 'before_boarding' | 'after_disembark' | '';

type OtherDayRoundTripForm = {
    usageOption: OtherDayUsageOption;
    rideDate: string;
    rideTime: string;
    ridePickupLocation: string;
    rideDropoffLocation: string;
    postCruiseDropoffLocation: string;
    embarkPickupHotel: string;
};

const carCategoryHardcoded = ['편도', '당일왕복', '일정왕복', '다른날왕복'];

const isShtVehicleType = (vehicleType?: string) =>
    !!vehicleType && vehicleType.includes('스테이하롱 셔틀 리무진');

// 편도 선택 시 SHT 차량은 자동으로 단독 변형 사용 (좌석 선택 불필요)
// 당일왕복/다른날왕복 SHT는 좌석 선택 모달을 거치도록 변경
const shouldAutoSoloSht = (vehicleType?: string, wayType?: string) =>
    isShtVehicleType(vehicleType) && wayType === '편도';

const toVehicleDisplayType = (vehicleType?: string) => {
    if (!vehicleType) return '';
    return vehicleType === '스테이하롱 셔틀 리무진 단독'
        ? '스테이하롱 셔틀 리무진'
        : vehicleType;
};

type ShtSeatBucket = 'A' | 'B' | 'ALL';

const getShtSeatBucket = (seat: string): ShtSeatBucket | null => {
    const normalizedSeat = String(seat || '').trim().toUpperCase();
    if (!normalizedSeat) return null;
    if (normalizedSeat === 'ALL') return 'ALL';
    if (normalizedSeat.startsWith('A')) return 'A';
    if (normalizedSeat.startsWith('B') || normalizedSeat.startsWith('C')) return 'B';
    return null;
};

const splitShtSeatsByBucket = (seatValue?: string | null): Array<{ bucket: ShtSeatBucket; seats: string[] }> => {
    const seats = String(seatValue || '')
        .split(/[,;\s]+/)
        .map((seat) => seat.trim().toUpperCase())
        .filter(Boolean);

    if (seats.includes('ALL')) {
        return [{ bucket: 'ALL', seats: ['ALL'] }];
    }

    const grouped = new Map<ShtSeatBucket, string[]>();
    seats.forEach((seat) => {
        const bucket = getShtSeatBucket(seat);
        if (!bucket) return;
        const current = grouped.get(bucket) || [];
        current.push(seat);
        grouped.set(bucket, current);
    });

    return Array.from(grouped.entries()).map(([bucket, groupedSeats]) => ({ bucket, seats: groupedSeats }));
};

const getShtVehicleTypeByBucket = (bucket: ShtSeatBucket) => {
    if (bucket === 'ALL') return '스테이하롱 셔틀 리무진 단독';
    if (bucket === 'A') return '스테이하롱 셔틀 리무진 A';
    return '스테이하롱 셔틀 리무진 B';
};

const getShtPriceCodeForBucket = (baseCode: string, bucket: ShtSeatBucket) => {
    const normalizedBaseCode = String(baseCode || '').trim().toUpperCase();
    const token = bucket === 'ALL' ? 'SOLO' : bucket;

    if (normalizedBaseCode.startsWith('SHT_LIMO_')) {
        return normalizedBaseCode.replace(/SHT_LIMO_(SOLO|A|B)_/, `SHT_LIMO_${token}_`);
    }

    return normalizedBaseCode;
};

const buildShtReservationRows = async (params: {
    reservationId: string;
    seatValue?: string | null;
    vehicleNumber?: string | null;
    baseCode: string;
    fallbackUnitPrice: number;
    requestNote?: string | null;
    usageDate: string | null;
    shtCategory: 'Pickup' | 'Drop-off';
    pickupLocation: string | null;
    dropoffLocation: string | null;
    totalPriceOverride?: number;
}) => {
    const seatGroups = splitShtSeatsByBucket(params.seatValue);
    if (seatGroups.length === 0) return [];

    const candidateCodes = seatGroups.map((group) => getShtPriceCodeForBucket(params.baseCode, group.bucket));
    const { data: priceRows } = await supabase
        .from('rentcar_price')
        .select('rent_code, price')
        .in('rent_code', candidateCodes);

    const priceMap = new Map<string, number>();
    (priceRows || []).forEach((row: any) => {
        const rentCode = String(row?.rent_code || '').trim().toUpperCase();
        if (!rentCode) return;
        priceMap.set(rentCode, Number(row?.price || 0));
    });

    const breakdown = seatGroups.map((group) => {
        const carPriceCode = getShtPriceCodeForBucket(params.baseCode, group.bucket);
        const storedUnitPrice = priceMap.get(carPriceCode) || params.fallbackUnitPrice;
        const passengerCount = group.bucket === 'ALL' ? 10 : group.seats.length;
        const computedTotalPrice = group.bucket === 'ALL'
            ? storedUnitPrice
            : storedUnitPrice * group.seats.length;

        return {
            bucket: group.bucket,
            seats: group.seats,
            price_code: carPriceCode,
            unit_price: storedUnitPrice,
            quantity: passengerCount,
            total_price: computedTotalPrice
        };
    });

    const allSeats = seatGroups.flatMap((group) => group.seats);
    const totalPassengerCount = breakdown.reduce((sum, item) => sum + item.quantity, 0);
    const totalComputedPrice = breakdown.reduce((sum, item) => sum + item.total_price, 0);
    const carTotalPrice = params.totalPriceOverride ?? totalComputedPrice;

    const firstItem = breakdown[0];

    return [{
        reservation_id: params.reservationId,
        vehicle_number: params.vehicleNumber || null,
        seat_number: allSeats.join(','),
        car_price_code: firstItem.price_code,
        passenger_count: totalPassengerCount,
        unit_price: (carTotalPrice > 0 && totalPassengerCount > 0) ? Math.round(carTotalPrice / totalPassengerCount) : firstItem.unit_price,
        request_note: params.requestNote || null,
        usage_date: params.usageDate,
        sht_category: params.shtCategory,
        pickup_location: params.pickupLocation,
        dropoff_location: params.dropoffLocation,
        car_total_price: carTotalPrice,
        seat_pricing_breakdown: breakdown
    }];
};

const LYRA_GRANZER_VEHICLE_DISCOUNT_CODE = 'LYRA-GRANZER-1N2D-VOUCHER-2026-30';
const GRAND_PIONEERS_VEHICLE_DISCOUNT_CODE = 'GP-VERANDA-UP-VEHICLE-50-2026-05-30';
const VEHICLE_DISCOUNT_RATE = 0.5;

const normalizeRoomTypeKey = (value?: string) => (value || '').toLowerCase().replace(/\s+/g, '');

const isGrandPioneersVehicleDiscountRoom = (roomType?: string) => {
    const key = normalizeRoomTypeKey(roomType);
    if (!key) return false;
    return [
        'verandasuite',
        'executivesuite',
        'theessencesuite',
        'essencesuite',
        'oceaniasuite',
        'theoceaniasuite',
        'theownerssuite',
        'theownssuite',
        '베란다스위트',
        '이그제큐티브스위트',
        '더에센스스위트',
        '에센스스위트',
        '오세아니아스위트',
        '더오셔니아스위트',
        '더오너스스위트',
        '오너스스위트',
    ].some((eligibleKey) => key.includes(eligibleKey));
};

const OTHER_DAY_NOTE_PREFIX = '[OTHER_DAY_ROUNDTRIP]';

const createEmptyOtherDayRoundTripForm = (): OtherDayRoundTripForm => ({
    usageOption: '',
    rideDate: '',
    rideTime: '',
    ridePickupLocation: '',
    rideDropoffLocation: '',
    postCruiseDropoffLocation: '',
    embarkPickupHotel: '',
});

const isMultiDayCruiseSchedule = (value?: string) => {
    const raw = String(value || '').trim().toUpperCase();
    return raw === '1박2일'.toUpperCase() || raw === '2박3일'.toUpperCase() || raw === '1N2D' || raw === '2N3D';
};

const isDayTripCruiseSchedule = (value?: string) => {
    const raw = String(value || '').trim().toUpperCase();
    return raw === '당일' || raw === 'DAY';
};

const getScheduleReturnOffsetDays = (value?: string) => {
    const raw = String(value || '').trim().toUpperCase();
    if (raw === '2박3일'.toUpperCase() || raw === '2N3D') return 2;
    if (raw === '당일'.toUpperCase() || raw === 'DAY') return 0;
    return 1;
};

const isOtherDayStyleCategory = (value?: string) =>
    value === '다른날왕복' || value === '일정왕복';

const isCustomOtherDayRoundTripCategory = (value?: string) =>
    value === '다른날왕복';

const isScheduleRoundTripCategory = (value?: string) =>
    value === '일정왕복';

const getLookupWayType = (value?: string) =>
    value === '일정왕복' ? '다른날왕복' : value || '';

const getEffectiveOtherDayUsageOption = (
    category: string,
    form: OtherDayRoundTripForm | Partial<OtherDayRoundTripForm>
): OtherDayUsageOption => {
    if (category === '일정왕복') return 'before_boarding';
    return (form.usageOption as OtherDayUsageOption) || '';
};

const combineDateAndTime = (date?: string | null, time?: string | null) => {
    if (!date) return null;
    if (!time) return date;
    return `${date}T${time}:00`;
};

const formatDateForInput = (value?: string | null) => {
    if (!value) return '';
    return String(value).split('T')[0] || '';
};

const extractTimeFromDateTime = (value?: string | null) => {
    if (!value) return '';
    const match = String(value).match(/T(\d{2}:\d{2})/);
    return match?.[1] || '';
};

const extractDateFromDateTime = (value?: string | null) => {
    if (!value) return '';
    return String(value).split('T')[0] || '';
};

const isDateWithinRange = (target?: string | null, from?: string | null, to?: string | null) => {
    const value = String(target || '').trim();
    if (!value) return false;
    if (from && value < from) return false;
    if (to && value > to) return false;
    return true;
};

const getOneWayDirectionFromCruiseCar = (row: any): 'pickup' | 'dropoff' => {
    if (row?.one_way_direction === 'dropoff') return 'dropoff';
    return 'pickup';
};

const getCruiseCarRideDate = (row: any) => {
    const direction = getOneWayDirectionFromCruiseCar(row);
    return direction === 'dropoff'
        ? (row?.return_datetime || null)
        : (row?.pickup_datetime || null);
};

const getCruiseCarRideTime = (row: any) => {
    const direction = getOneWayDirectionFromCruiseCar(row);
    return direction === 'dropoff'
        ? (row?.return_time || null)
        : (row?.pickup_time || null);
};

const buildOtherDayRequestNote = (form: OtherDayRoundTripForm) => {
    if (!form.usageOption) return '';

    const lines = [
        OTHER_DAY_NOTE_PREFIX,
        `usageOption=${form.usageOption}`,
        `rideDate=${form.rideDate || ''}`,
        `rideTime=${form.rideTime || ''}`,
        `ridePickupLocation=${form.ridePickupLocation || ''}`,
        `rideDropoffLocation=${form.rideDropoffLocation || ''}`,
        `postCruiseDropoffLocation=${form.postCruiseDropoffLocation || ''}`,
        `embarkPickupHotel=${form.embarkPickupHotel || ''}`,
    ];

    return lines.join('\n');
};

const parseOtherDayRequestNote = (note?: string | null): Partial<OtherDayRoundTripForm> | null => {
    if (!note || !String(note).includes(OTHER_DAY_NOTE_PREFIX)) return null;

    const parsed: Partial<OtherDayRoundTripForm> = {};
    for (const line of String(note).split('\n')) {
        const [rawKey, ...rest] = line.split('=');
        const value = rest.join('=').trim();
        switch (rawKey.trim()) {
            case 'usageOption':
                if (value === 'before_boarding' || value === 'after_disembark') {
                    parsed.usageOption = value;
                }
                break;
            case 'rideDate':
                parsed.rideDate = value;
                break;
            case 'rideTime':
                parsed.rideTime = value;
                break;
            case 'ridePickupLocation':
                parsed.ridePickupLocation = value;
                break;
            case 'rideDropoffLocation':
                parsed.rideDropoffLocation = value;
                break;
            case 'postCruiseDropoffLocation':
                parsed.postCruiseDropoffLocation = value;
                break;
            case 'embarkPickupHotel':
                parsed.embarkPickupHotel = value;
                break;
            default:
                break;
        }
    }

    return parsed;
};

function CruiseVehicleContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const reservationId = searchParams.get('reservationId');
    const quoteId = searchParams.get('quoteId');

    const [user, setUser] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [pageError, setPageError] = useState<string>('');
    const [cruiseOptions, setCruiseOptions] = useState<CruiseReservationOption[]>([]);

    // 크루즈 정보 (rentcar 필터 + 자동 차량 결정용)
    const [cruiseName, setCruiseName] = useState('');
    const [schedule, setSchedule] = useState('');
    const [checkin, setCheckin] = useState('');
    const [selectedRoomType, setSelectedRoomType] = useState('');
    const [selectedRoomTypes, setSelectedRoomTypes] = useState<string[]>([]);
    const [selectedRateCardPromotion, setSelectedRateCardPromotion] = useState(false);
    const [cruisePromotionCode, setCruisePromotionCode] = useState('');
    const [applyGrandPioneersVehicleDiscount, setApplyGrandPioneersVehicleDiscount] = useState(false);
    const [grandPioneersVehiclePromotionActive, setGrandPioneersVehiclePromotionActive] = useState(false);

    // 기존 차량 예약 ID
    const [existingVehicleReservationId, setExistingVehicleReservationId] = useState<string | null>(null);

    // 차량 폼 상태
    const [vehicleForm, setVehicleForm] = useState<VehicleRow[]>([{
        car_type: '',
        car_category: '',
        car_code: '',
        route: '',
        count: 1
    }]);
    const [pickupLocation, setPickupLocation] = useState('');
    const [dropoffLocation, setDropoffLocation] = useState('');
    const [locationInputError, setLocationInputError] = useState('');
    // 편도 방향: 'pickup' (선착장으로 픽업) 또는 'dropoff' (선착장에서 드롭)
    const [pyongdoDirection, setPyongdoDirection] = useState<'pickup' | 'dropoff' | ''>('');
    const [oneWayRideDate, setOneWayRideDate] = useState('');
    const [oneWayRideTime, setOneWayRideTime] = useState('');
    const [otherDayRoundTripForm, setOtherDayRoundTripForm] = useState<OtherDayRoundTripForm>(createEmptyOtherDayRoundTripForm());

    const [carTypeOptions, setCarTypeOptions] = useState<string[]>([]);
    const [routeOptions, setRouteOptions] = useState<string[]>([]);
    const [vehicleServiceType, setVehicleServiceType] = useState<VehicleServiceType | null>(null);
    const [hasCruiseShuttle, setHasCruiseShuttle] = useState(false);
    const [selectedCarCategory, setSelectedCarCategory] = useState('');
    const [selectedRoute, setSelectedRoute] = useState('');

    const [isShtCarModalOpen, setIsShtCarModalOpen] = useState(false);
    const [isModalReadOnly, setIsModalReadOnly] = useState(false);
    const [selectedShtSeat, setSelectedShtSeat] = useState<{ vehicle: string; seat: string; category: string } | null>(null);

    useLoadingTimeout(loading, setLoading);

    const loadCruiseReservationOptions = useCallback(async (userId: string) => {
        let reservationQuery = supabase
            .from('reservation')
            .select('re_id, re_quote_id')
            .eq('re_user_id', userId)
            .eq('re_type', 'cruise')
            .order('re_created_at', { ascending: false });

        if (quoteId) {
            reservationQuery = reservationQuery.eq('re_quote_id', quoteId);
        }

        const { data: reservations, error: reservationError } = await reservationQuery;
        if (reservationError) throw reservationError;

        const reservationIds = (reservations || []).map((row: any) => row.re_id).filter(Boolean);
        if (reservationIds.length === 0) {
            setCruiseOptions([]);
            return;
        }

        const { data: cruiseRows, error: cruiseError } = await supabase
            .from('reservation_cruise')
            .select('reservation_id, room_price_code, checkin, guest_count')
            .in('reservation_id', reservationIds);

        if (cruiseError) throw cruiseError;

        const priceCodeIds = [...new Set((cruiseRows || []).map((row: any) => row.room_price_code).filter(Boolean))];
        let rateCardMap = new Map<string, any>();

        if (priceCodeIds.length > 0) {
            const { data: rateCards } = await supabase
                .from('cruise_rate_card')
                .select('id, cruise_name, room_type, schedule_type')
                .in('id', priceCodeIds);
            rateCardMap = new Map((rateCards || []).map((row: any) => [String(row.id), row]));
        }

        const rowsByReservation = new Map<string, any[]>();
        (cruiseRows || []).forEach((row: any) => {
            const current = rowsByReservation.get(row.reservation_id) || [];
            current.push(row);
            rowsByReservation.set(row.reservation_id, current);
        });

        const nextOptions: CruiseReservationOption[] = (reservations || []).map((reservation: any) => {
            const rows = rowsByReservation.get(reservation.re_id) || [];
            const rateCards = rows
                .map((row: any) => rateCardMap.get(String(row.room_price_code)))
                .filter(Boolean);
            const firstRateCard = rateCards[0];
            const firstRow = rows[0];

            return {
                reservationId: reservation.re_id,
                quoteId: reservation.re_quote_id || null,
                cruiseName: firstRateCard?.cruise_name || '크루즈 정보 없음',
                checkin: firstRow?.checkin || '',
                schedule: firstRateCard?.schedule_type || '',
                roomTypes: [...new Set(rateCards.map((card: any) => String(card.room_type || '').trim()).filter(Boolean))],
                guestCount: rows.reduce((sum: number, row: any) => sum + Number(row.guest_count || 0), 0),
            };
        });

        setCruiseOptions(nextOptions);
    }, [quoteId]);

    // 일정에 따라 사용 가능한 차량 카테고리 필터링
    const getAvailableCarCategories = useMemo(() => {
        const isMultiDay = isMultiDayCruiseSchedule(schedule);
        return carCategoryHardcoded.filter((cat) => {
            if (isMultiDay) return cat !== '당일왕복';
            return cat !== '일정왕복';
        });
    }, [schedule]);

    const isShtExclusiveCruise = useMemo(() => {
        return cruiseName.includes('엠바사더') || cruiseName === '아테나 프리미엄 크루즈';
    }, [cruiseName]);

    const isParadiseLegacyB = useMemo(() => {
        return cruiseName === '파라다이스 레거시 크루즈' && (selectedRoomType || '').includes('B');
    }, [cruiseName, selectedRoomType]);

    const isFullPromoOrLegacyC = useMemo(() => {
        const roomType = (selectedRoomType || '').trim();
        const isFullPromo = selectedRateCardPromotion && roomType.includes('FULL');
        const isLegacy = cruiseName === '파라다이스 레거시 크루즈';
        const isLegacyC = isLegacy && /C$/.test(roomType) && !roomType.includes('B');
        return isFullPromo || isLegacyC;
    }, [selectedRateCardPromotion, selectedRoomType, cruiseName]);

    const grandPioneersVehicleDiscountEligible = useMemo(() => {
        const isGrandPioneers = cruiseName.includes('그랜드 파이어니스') || cruiseName.toLowerCase().includes('grand pioneers');
        const roomTypes = selectedRoomTypes.length > 0 ? selectedRoomTypes : [selectedRoomType];
        return isGrandPioneers && roomTypes.some(isGrandPioneersVehicleDiscountRoom);
    }, [cruiseName, selectedRoomType, selectedRoomTypes]);

    const canApplyGrandPioneersVehicleDiscount = useMemo(() => {
        return grandPioneersVehicleDiscountEligible && grandPioneersVehiclePromotionActive;
    }, [grandPioneersVehicleDiscountEligible, grandPioneersVehiclePromotionActive]);

    useEffect(() => {
        if (!canApplyGrandPioneersVehicleDiscount && applyGrandPioneersVehicleDiscount) {
            setApplyGrandPioneersVehicleDiscount(false);
        }
    }, [canApplyGrandPioneersVehicleDiscount, applyGrandPioneersVehicleDiscount]);

    useEffect(() => {
        let cancelled = false;

        const loadGrandPioneersVehiclePromotion = async () => {
            try {
                const today = new Date().toISOString().slice(0, 10);
                const { data, error } = await supabase
                    .from('cruise_promotion')
                    .select('is_active, booking_from, booking_to, checkin_from, checkin_to, notes, name')
                    .eq('code', GRAND_PIONEERS_VEHICLE_DISCOUNT_CODE)
                    .maybeSingle();

                if (cancelled) return;
                if (error) throw error;

                const bookingActive = !!data?.is_active && isDateWithinRange(today, data?.booking_from, data?.booking_to);
                const checkinActive = !!checkin && isDateWithinRange(checkin, data?.checkin_from, data?.checkin_to);
                setGrandPioneersVehiclePromotionActive(bookingActive && checkinActive);
            } catch (error) {
                console.error('그랜드 파이어니스 차량 프로모션 조회 실패:', error);
                if (!cancelled) {
                    setGrandPioneersVehiclePromotionActive(false);
                }
            }
        };

        loadGrandPioneersVehiclePromotion();
        return () => {
            cancelled = true;
        };
    }, [checkin]);

    const hasShtSeatRequiredVehicle = useMemo(
        () => vehicleForm.some(v =>
            isShtVehicleType(v.car_type)
            && !v.car_type?.includes('단독')
            && !shouldAutoSoloSht(v.car_type, v.car_category || selectedCarCategory)
            && v.count > 0
        ),
        [vehicleForm, selectedCarCategory]
    );

    const handleLocationInput = (field: 'pickup' | 'dropoff', value: string) => {
        const sanitized = normalizeLocationEnglishUpper(value);
        if (field === 'pickup') setPickupLocation(sanitized);
        else setDropoffLocation(sanitized);
        setLocationInputError(hasInvalidLocationChars(value) ? '영문으로 입력해 주세요 ^^' : '');
    };

    const handleOtherDayRoundTripInput = (field: keyof OtherDayRoundTripForm, value: string) => {
        const sanitized = field.toLowerCase().includes('location') || field.toLowerCase().includes('hotel')
            ? normalizeLocationEnglishUpper(value)
            : value;
        setOtherDayRoundTripForm((prev) => ({ ...prev, [field]: sanitized }));
        setLocationInputError(hasInvalidLocationChars(value) ? '영문으로 입력해 주세요 ^^' : '');
    };

    const getOneWayAutoRideDate = useCallback((direction: 'pickup' | 'dropoff') => {
        if (!checkin) return '';
        const baseDate = new Date(checkin);
        if (Number.isNaN(baseDate.getTime())) return '';
        if (direction === 'dropoff') {
            baseDate.setDate(baseDate.getDate() + getScheduleReturnOffsetDays(schedule));
        }
        return formatDateForInput(baseDate.toISOString());
    }, [checkin, schedule]);

    const applyOneWayAutoRideDate = useCallback((direction: 'pickup' | 'dropoff') => {
        const autoDate = getOneWayAutoRideDate(direction);
        if (!autoDate) {
            alert('체크인 정보가 없어 자동입력할 수 없습니다.');
            return;
        }
        setOneWayRideDate(autoDate);
    }, [getOneWayAutoRideDate]);

    const applyCruiseFilterToRentcarQuery = useCallback((query: any) => {
        const name = (cruiseName || '').trim();
        if (!name) return query.eq('cruise', '공통');
        return query.in('cruise', ['공통', name]);
    }, [cruiseName]);

    const applyVehicleServiceFilter = useCallback((query: any) => {
        if (vehicleServiceType === 'cruise_shuttle') {
            return query
                .ilike('vehicle_type', '%셔틀%')
                .eq('cruise', cruiseName);
        }
        if (vehicleServiceType === 'private_rental') {
            return query.eq('rental_type', '단독대여');
        }
        return query;
    }, [cruiseName, vehicleServiceType]);

    const loadRouteOptions = useCallback(async (wayType: string) => {
        if (!wayType) return;
        try {
            let query = supabase
                .from('rentcar_price')
                .select('route')
                .eq('way_type', getLookupWayType(wayType))
                .like('route', '%하롱베이%');
            query = applyVehicleServiceFilter(query);
            query = applyCruiseFilterToRentcarQuery(query);
            const { data, error } = await query.order('route');
            if (error) throw error;
            const uniqueRoutes = [...new Set((data || []).map((d: any) => d.route).filter(Boolean))] as string[];
            setRouteOptions(uniqueRoutes);
        } catch (error) {
            console.error('차량 경로 옵션 조회 실패:', error);
            setRouteOptions([]);
        }
    }, [applyCruiseFilterToRentcarQuery, applyVehicleServiceFilter]);

    const loadCarTypeOptions = useCallback(async (wayType?: string, route?: string) => {
        const wt = wayType || selectedCarCategory;
        const rt = route !== undefined ? route : selectedRoute;
        try {
            let query = supabase
                .from('rentcar_price')
                .select('vehicle_type')
                .eq('way_type', getLookupWayType(wt));
            if (rt) query = query.eq('route', rt);
            else query = query.like('route', '%하롱베이%');
            query = applyVehicleServiceFilter(query);
            query = applyCruiseFilterToRentcarQuery(query);
            const { data, error } = await query.order('vehicle_type');
            if (error) throw error;
            const rawTypes = [...new Set((data || []).map((d: any) => d.vehicle_type).filter(Boolean))] as string[];
            // SHT 변형(A/B/C/단독)은 표시 옵션에서 제외 (스테이하롱 셔틀 리무진 숨김 처리 - 2026.06.30)
            // 단, 당일 크루즈는 스테이하롱 셔틀 리무진 운영 안 함 → 제외
            const hasSht = rawTypes.some(t => isShtVehicleType(t));
            let uniqueCarTypes = rawTypes.filter(t => !isShtVehicleType(t));
            // 스테이하롱 셔틀 리무진 숨김 처리: 아래 조건문 비활성화 (차량 드롭다운에서 제외)
            // if (hasSht && !isDayTripCruiseSchedule(schedule)) uniqueCarTypes.push('스테이하롱 셔틀 리무진');
            // 패키지 셔틀 리무진은 패키지 가능한 객실(FULL 프로모션 / 파라다이스 레거시 B,C)에서만 노출
            const packageEligible = isFullPromoOrLegacyC || isParadiseLegacyB;
            if (!packageEligible) {
                uniqueCarTypes = uniqueCarTypes.filter(t => t !== '패키지 셔틀 리무진');
            }
            // 정렬 (안정적 표시)
            uniqueCarTypes.sort();
            setCarTypeOptions(uniqueCarTypes);
        } catch (error) {
            console.error('차량타입 옵션 조회 실패:', error);
        }
    }, [selectedCarCategory, selectedRoute, applyCruiseFilterToRentcarQuery, applyVehicleServiceFilter, cruiseName, isFullPromoOrLegacyC, isParadiseLegacyB, schedule]);

    const getCarCode = useCallback(async (carType: string, carCategory: string, route?: string): Promise<string> => {
        try {
            const effectiveRoute = route || selectedRoute;
            // 통합 SHT 라벨('스테이하롱 셔틀 리무진')은 DB에 없으므로 like 검색으로 대표 코드 1건 조회
            const isAggregatedSht = carType === '스테이하롱 셔틀 리무진';
            let query = supabase
                .from('rentcar_price')
                .select('rent_code')
                .eq('way_type', getLookupWayType(carCategory));
            if (isAggregatedSht) {
                query = query.like('vehicle_type', '%스테이하롱 셔틀 리무진%');
            } else {
                query = query.eq('vehicle_type', carType);
            }
            if (effectiveRoute) query = query.eq('route', effectiveRoute);
            query = applyVehicleServiceFilter(query);
            query = applyCruiseFilterToRentcarQuery(query);
            const { data, error } = await query.limit(1);
            if (error) throw error;
            return data?.[0]?.rent_code || '';
        } catch (error) {
            console.error('rent_code 조회 실패:', error);
            return '';
        }
    }, [selectedRoute, applyCruiseFilterToRentcarQuery, applyVehicleServiceFilter]);

    const handleAddVehicle = () => {
        if (vehicleForm.length < 6) {
            setVehicleForm([...vehicleForm, {
                car_type: '',
                car_category: selectedCarCategory || '',
                route: selectedRoute || '',
                car_code: '',
                count: 1
            }]);
        }
    };

    const handleRemoveVehicle = (index: number) => {
        if (vehicleForm.length > 1) {
            setVehicleForm(vehicleForm.filter((_, i) => i !== index));
        }
    };

    const handleVehicleChange = useCallback((index: number, field: string, value: any) => {
        const newVehicleForm = [...vehicleForm];
        (newVehicleForm[index] as any)[field] = value;
        if (field === 'car_category') {
            (newVehicleForm[index] as any).route = '';
            (newVehicleForm[index] as any).car_type = '';
            (newVehicleForm[index] as any).car_code = '';
        }
        if (field === 'route') {
            (newVehicleForm[index] as any).car_type = '';
            (newVehicleForm[index] as any).car_code = '';
        }
        setVehicleForm(newVehicleForm);
    }, [vehicleForm]);

    const selectVehicleServiceType = (nextType: VehicleServiceType) => {
        setVehicleServiceType(nextType);
        setSelectedRoute('');
        setRouteOptions([]);
        setCarTypeOptions([]);
        setSelectedShtSeat(null);
        setVehicleForm([{
            car_type: '',
            car_category: selectedCarCategory,
            car_code: '',
            route: '',
            count: 1
        }]);
    };

    const handleShtSeatSelect = useCallback((seatInfo: { vehicle: string; seat: string; category: string }) => {
        setSelectedShtSeat(seatInfo);
        if (!seatInfo.seat) return;
        const seatGroups = splitShtSeatsByBucket(seatInfo.seat);
        const isAll = seatGroups.some((group) => group.bucket === 'ALL');
        const seatCount = isAll
            ? 10
            : seatGroups.reduce((sum, group) => sum + group.seats.length, 0);

        const fetchShtPrices = async () => {
            try {
                let totalFetchedPrice = 0;
                if (isAll) {
                    const { data: soloData } = await supabase
                        .from('rentcar_price')
                        .select('price')
                        .like('vehicle_type', '%스테이하롱 셔틀 리무진 단독%')
                        .eq('way_type', selectedCarCategory || '당일왕복')
                        .limit(1)
                        .maybeSingle();
                    totalFetchedPrice = soloData?.price || 5400000;
                } else {
                    for (const group of seatGroups) {
                        const typePattern = `%${getShtVehicleTypeByBucket(group.bucket)}%`;
                        const { data: typeData } = await supabase
                            .from('rentcar_price')
                            .select('price')
                            .like('vehicle_type', typePattern)
                            .not('vehicle_type', 'like', '%단독%')
                            .eq('way_type', selectedCarCategory || '당일왕복')
                            .limit(1)
                            .maybeSingle();
                        if (typeData?.price) {
                            totalFetchedPrice += typeData.price * group.seats.length;
                        }
                    }
                }
                setVehicleForm(prev => {
                    const newForm = [...prev];
                    if (newForm[0]) {
                        (newForm[0] as any).custom_price = totalFetchedPrice;
                        newForm[0].count = seatCount;
                    }
                    return newForm;
                });
            } catch (error) {
                console.error('SHT 가격 조회 실패:', error);
                setVehicleForm(prev => {
                    const newForm = [...prev];
                    if (newForm[0]) newForm[0].count = seatCount;
                    return newForm;
                });
            }
        };
        fetchShtPrices();
    }, [selectedCarCategory]);

    // ── 초기 로드: 크루즈 예약 + 기존 차량 예약 ──
    useEffect(() => {
        let cancelled = false;
        const init = async () => {
            try {
                const { data: { user: currentUser } } = await supabase.auth.getUser();
                if (cancelled) return;
                if (currentUser) {
                    setUser(currentUser);
                } else {
                    setPageError('로그인이 필요합니다.');
                    return;
                }

                if (!reservationId) {
                    await loadCruiseReservationOptions(currentUser.id);
                    return;
                }

                // 크루즈 예약 조회
                const { data: reservation, error: resError } = await supabase
                    .from('reservation')
                    .select('re_id, re_user_id, re_quote_id, re_type, reservation_date, price_breakdown')
                    .eq('re_id', reservationId)
                    .maybeSingle();

                if (cancelled) return;
                if (resError || !reservation) {
                    setPageError('예약 정보를 찾을 수 없습니다.');
                    return;
                }

                if (reservation.reservation_date) setCheckin(reservation.reservation_date);
                const priceBreakdown = (reservation as any).price_breakdown || {};
                setCruisePromotionCode(priceBreakdown.promotion_code || '');
                const breakdownRoomTypes: string[] = Array.isArray(priceBreakdown.room_selections)
                    ? priceBreakdown.room_selections
                        .map((room: any) => room?.room_type)
                        .filter((roomType: unknown): roomType is string => typeof roomType === 'string' && roomType.trim().length > 0)
                    : [];
                setSelectedRoomTypes([...new Set<string>(breakdownRoomTypes)]);

                const appliedPromotions: string[] = Array.isArray(priceBreakdown.applied_promotions)
                    ? priceBreakdown.applied_promotions.map((code: any) => String(code || '').trim()).filter(Boolean)
                    : [];
                const hasGrandPioneersPromotion =
                    String(priceBreakdown.promotion_code || '').trim() === GRAND_PIONEERS_VEHICLE_DISCOUNT_CODE
                    || appliedPromotions.includes(GRAND_PIONEERS_VEHICLE_DISCOUNT_CODE);
                if (hasGrandPioneersPromotion) {
                    setApplyGrandPioneersVehicleDiscount(true);
                }

                // reservation_cruise 상세
                const { data: cruiseData } = await supabase
                    .from('reservation_cruise')
                    .select('*')
                    .eq('reservation_id', reservationId)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                if (cruiseData?.checkin) setCheckin(cruiseData.checkin);

                if (cruiseData?.room_price_code) {
                    const { data: rateCard } = await supabase
                        .from('cruise_rate_card')
                        .select('cruise_name, room_type, schedule_type, is_promotion')
                        .eq('id', cruiseData.room_price_code)
                        .maybeSingle();
                    if (rateCard) {
                        setCruiseName(rateCard.cruise_name || '');
                        setSchedule(rateCard.schedule_type || '');
                        setSelectedRoomType(rateCard.room_type || '');
                        setSelectedRoomTypes((prev) => [...new Set<string>([...prev, rateCard.room_type].filter((roomType): roomType is string => typeof roomType === 'string' && roomType.trim().length > 0))]);
                        setSelectedRateCardPromotion(!!rateCard.is_promotion);
                    }
                }

                // 같은 견적의 기존 차량 예약 조회
                const effectiveQuoteId = quoteId || reservation.re_quote_id;
                if (effectiveQuoteId) {
                    const { data: vehicleReservations } = await supabase
                        .from('reservation')
                        .select('re_id, re_type')
                        .eq('re_user_id', reservation.re_user_id)
                        .eq('re_quote_id', effectiveQuoteId)
                        .in('re_type', ['car', 'sht'])
                        .order('re_created_at', { ascending: false })
                        .limit(1);

                    const vehicleRes = vehicleReservations?.[0];
                    if (vehicleRes) {
                        setExistingVehicleReservationId(vehicleRes.re_id);

                        // SHT 차량 모든 행 조회
                        const { data: shtRows } = await supabase
                            .from('reservation_car_sht')
                            .select('*')
                            .eq('reservation_id', vehicleRes.re_id);
                        // 일반 차량 모든 행 조회
                        const { data: carRows } = await supabase
                            .from('reservation_cruise_car')
                            .select('*')
                            .eq('reservation_id', vehicleRes.re_id);

                        const loadedVehicles: VehicleRow[] = [];
                        let firstShtSeat: { vehicle: string; seat: string } | null = null;
                        let firstPickup = '';
                        let firstDropoff = '';
                        let firstWayType = '';
                        let firstRoute = '';
                        let firstRideDate = '';
                        let firstRideTime = '';
                        let parsedOtherDay: Partial<OtherDayRoundTripForm> | null = null;

                        // SHT: Pickup 행 또는 편도 단일 행만 사용 (Drop-off는 동일 차량의 보조 행)
                        const shtPickupRows = (shtRows || []).filter((row: any) => row.sht_category !== 'Drop-off');
                        for (const sht of shtPickupRows) {
                            const { data: rentcarData } = await supabase
                                .from('rentcar_price')
                                .select('way_type, route, vehicle_type')
                                .eq('rent_code', sht.car_price_code)
                                .maybeSingle();
                            loadedVehicles.push({
                                car_type: rentcarData?.vehicle_type || '스테이하롱 셔틀 리무진',
                                car_category: rentcarData?.way_type || '당일왕복',
                                route: rentcarData?.route || '',
                                car_code: sht.car_price_code || '',
                                count: sht.passenger_count || 1
                            });
                            if (!firstShtSeat && (sht.vehicle_number || sht.seat_number)) {
                                firstShtSeat = { vehicle: sht.vehicle_number || '', seat: sht.seat_number || '' };
                            }
                            if (!firstWayType) firstWayType = rentcarData?.way_type || '당일왕복';
                            if (!firstRoute) firstRoute = rentcarData?.route || '';
                            if (!firstPickup && sht.pickup_location) firstPickup = sht.pickup_location;
                            if (!firstDropoff && sht.dropoff_location) firstDropoff = sht.dropoff_location;
                        }

                        // 일반 차량
                        let firstOneWayDirection: 'pickup' | 'dropoff' | '' = '';
                        for (const carData of (carRows || [])) {
                            const code = carData.rentcar_price_code || carData.car_price_code;
                            const { data: rentcarData } = await supabase
                                .from('rentcar_price')
                                .select('way_type, route, vehicle_type')
                                .eq('rent_code', code)
                                .maybeSingle();
                            loadedVehicles.push({
                                car_type: carData.vehicle_type || rentcarData?.vehicle_type || '',
                                car_category: carData.way_type || rentcarData?.way_type || '',
                                route: carData.route || rentcarData?.route || '',
                                car_code: code || '',
                                count: carData.car_count || carData.passenger_count || 1
                            });
                            if (!firstWayType) firstWayType = carData.way_type || rentcarData?.way_type || '';
                            if (!firstRoute) firstRoute = carData.route || rentcarData?.route || '';
                            if (!firstPickup && carData.pickup_location) firstPickup = carData.pickup_location;
                            if (!firstDropoff && carData.dropoff_location) firstDropoff = carData.dropoff_location;
                            const rideDate = getCruiseCarRideDate(carData);
                            const rideTime = getCruiseCarRideTime(carData);
                            if (!firstRideDate && rideDate) firstRideDate = extractDateFromDateTime(rideDate);
                            if (!firstRideTime && rideTime) firstRideTime = extractTimeFromDateTime(rideTime) || String(rideTime || '');
                            if (!firstOneWayDirection && (carData.way_type || rentcarData?.way_type || '') === '편도') {
                                firstOneWayDirection = getOneWayDirectionFromCruiseCar(carData);
                            }
                            if (!parsedOtherDay && carData.request_note) parsedOtherDay = parseOtherDayRequestNote(carData.request_note);
                        }

                        if (loadedVehicles.length > 0) {
                            setVehicleForm(loadedVehicles);
                            if (firstWayType) setSelectedCarCategory(firstWayType);
                            if (firstWayType === '편도') {
                                setPyongdoDirection(firstOneWayDirection || 'pickup');
                                setOneWayRideDate(firstRideDate || '');
                                setOneWayRideTime(firstRideTime || '');
                            }
                            if (firstRoute) setSelectedRoute(firstRoute);
                            if (firstPickup) setPickupLocation(firstPickup);
                            if (firstDropoff) setDropoffLocation(firstDropoff);
                            if (isOtherDayStyleCategory(firstWayType)) {
                                setOtherDayRoundTripForm({
                                    ...createEmptyOtherDayRoundTripForm(),
                                    usageOption: getEffectiveOtherDayUsageOption(firstWayType, parsedOtherDay || createEmptyOtherDayRoundTripForm()),
                                    rideDate: firstRideDate,
                                    rideTime: firstRideTime,
                                    ridePickupLocation: firstPickup,
                                    rideDropoffLocation: firstDropoff,
                                    ...(parsedOtherDay || {}),
                                });
                            }
                            if (firstShtSeat) {
                                setSelectedShtSeat({ vehicle: firstShtSeat.vehicle, seat: firstShtSeat.seat, category: 'roundtrip' });
                            }
                        }
                    } else {
                        // 호환: 크루즈 reservation_id로 직접 검색
                        const { data: carRows } = await supabase
                            .from('reservation_cruise_car')
                            .select('*')
                            .eq('reservation_id', reservationId);
                        if (carRows && carRows.length > 0) {
                            const loaded: VehicleRow[] = [];
                            let firstWayType = '';
                            let firstRoute = '';
                            let firstPickup = '';
                            let firstDropoff = '';
                            let firstRideDate = '';
                            let firstRideTime = '';
                            let firstOneWayDirection: 'pickup' | 'dropoff' | '' = '';
                            let parsedOtherDay: Partial<OtherDayRoundTripForm> | null = null;
                            for (const carData of carRows) {
                                const code = carData.rentcar_price_code || carData.car_price_code;
                                const { data: rentcarData } = await supabase
                                    .from('rentcar_price')
                                    .select('way_type, route, vehicle_type')
                                    .eq('rent_code', code)
                                    .maybeSingle();
                                loaded.push({
                                    car_type: carData.vehicle_type || rentcarData?.vehicle_type || '',
                                    car_category: carData.way_type || rentcarData?.way_type || '',
                                    route: carData.route || rentcarData?.route || '',
                                    car_code: code || '',
                                    count: carData.car_count || carData.passenger_count || 1
                                });
                                if (!firstWayType) firstWayType = carData.way_type || rentcarData?.way_type || '';
                                if (!firstRoute) firstRoute = carData.route || rentcarData?.route || '';
                                if (!firstPickup && carData.pickup_location) firstPickup = carData.pickup_location;
                                if (!firstDropoff && carData.dropoff_location) firstDropoff = carData.dropoff_location;
                                const rideDate = getCruiseCarRideDate(carData);
                                const rideTime = getCruiseCarRideTime(carData);
                                if (!firstRideDate && rideDate) firstRideDate = extractDateFromDateTime(rideDate);
                                if (!firstRideTime && rideTime) firstRideTime = extractTimeFromDateTime(rideTime) || String(rideTime || '');
                                if (!firstOneWayDirection && (carData.way_type || rentcarData?.way_type || '') === '편도') {
                                    firstOneWayDirection = getOneWayDirectionFromCruiseCar(carData);
                                }
                                if (!parsedOtherDay && carData.request_note) parsedOtherDay = parseOtherDayRequestNote(carData.request_note);
                            }
                            setVehicleForm(loaded);
                            if (firstWayType) setSelectedCarCategory(firstWayType);
                            if (firstWayType === '편도') {
                                setPyongdoDirection(firstOneWayDirection || 'pickup');
                                setOneWayRideDate(firstRideDate || '');
                                setOneWayRideTime(firstRideTime || '');
                            }
                            if (firstRoute) setSelectedRoute(firstRoute);
                            if (firstPickup) setPickupLocation(firstPickup);
                            if (firstDropoff) setDropoffLocation(firstDropoff);
                            if (isOtherDayStyleCategory(firstWayType)) {
                                setOtherDayRoundTripForm({
                                    ...createEmptyOtherDayRoundTripForm(),
                                    usageOption: getEffectiveOtherDayUsageOption(firstWayType, parsedOtherDay || createEmptyOtherDayRoundTripForm()),
                                    rideDate: firstRideDate,
                                    rideTime: firstRideTime,
                                    ridePickupLocation: firstPickup,
                                    rideDropoffLocation: firstDropoff,
                                    ...(parsedOtherDay || {}),
                                });
                            }
                        }
                    }
                }
            } catch (err) {
                console.error('초기 로드 오류:', err);
                setPageError('초기 로드 중 오류가 발생했습니다.');
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        init();

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
            if (cancelled) return;
            if (session?.user) setUser(session.user);
        });

        return () => {
            cancelled = true;
            try { subscription?.unsubscribe?.(); } catch { /* noop */ }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [reservationId, loadCruiseReservationOptions]);

    // ── 크루즈사 운영 셔틀 존재 여부 ──
    useEffect(() => {
        let cancelled = false;
        const loadCruiseShuttleAvailability = async () => {
            if (!cruiseName) {
                setHasCruiseShuttle(false);
                return;
            }
            const { data, error } = await supabase
                .from('rentcar_price')
                .select('rent_code')
                .eq('cruise', cruiseName)
                .ilike('vehicle_type', '%셔틀%')
                .limit(1);
            if (cancelled) return;
            if (error) {
                console.error('크루즈 셔틀 조회 실패:', error);
                setHasCruiseShuttle(false);
                return;
            }
            setHasCruiseShuttle((data || []).length > 0);
        };
        loadCruiseShuttleAvailability();
        return () => { cancelled = true; };
    }, [cruiseName]);

    // ── 이용방식 변경 시 경로 옵션 자동 로드 (페이지 복귀 포함) ──
    useEffect(() => {
        if (selectedCarCategory && vehicleServiceType) {
            loadRouteOptions(selectedCarCategory);
        } else if (!vehicleServiceType) {
            setRouteOptions([]);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedCarCategory, cruiseName, vehicleServiceType]);

    // ── 차량 타입 로드 ──
    useEffect(() => {
        if (selectedCarCategory && selectedRoute && vehicleServiceType) {
            loadCarTypeOptions();
        } else {
            setCarTypeOptions([]);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedCarCategory, selectedRoute, cruiseName, vehicleServiceType, isFullPromoOrLegacyC, isParadiseLegacyB]);

    // ── 크루즈사 셔틀은 조회된 차량 타입을 자동 선택 ──
    useEffect(() => {
        if (vehicleServiceType !== 'cruise_shuttle' || !selectedCarCategory || !selectedRoute || carTypeOptions.length === 0) {
            return;
        }

        const shuttleType = carTypeOptions[0];
        const applyCruiseShuttle = async () => {
            const carCode = await getCarCode(shuttleType, selectedCarCategory, selectedRoute);
            setVehicleForm((prev) => [{
                car_type: shuttleType,
                car_category: selectedCarCategory,
                route: selectedRoute,
                car_code: carCode,
                count: prev[0]?.count || 1,
            }]);
        };

        applyCruiseShuttle();
    }, [vehicleServiceType, selectedCarCategory, selectedRoute, carTypeOptions, getCarCode]);

    // ── 단독 자동 처리 ──
    useEffect(() => {
        if (!isShtExclusiveCruise) return;
        const hasSht = vehicleForm.some(v => v.car_type?.includes('스테이하롱 셔틀 리무진') && v.count > 0);
        if (!hasSht) return;
        handleShtSeatSelect({ vehicle: 'Vehicle 1', seat: 'ALL', category: 'roundtrip' });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isShtExclusiveCruise, vehicleForm.map(v => v.car_type).join(',')]);

    // ── 프로모션/레거시 자동 차량 ──
    useEffect(() => {
        if (!cruiseName || !selectedRoomType) return;
        if (!isFullPromoOrLegacyC && !isParadiseLegacyB) return;
        // 이미 차량이 선택되었거나 기존 예약이 있으면 건너뜀
        if (vehicleForm[0]?.car_type) return;
        const autoSelect = async () => {
            const defaultWayType = '당일왕복';
            const defaultRoute = '하노이-하롱베이';
            const carType = isParadiseLegacyB ? '스테이하롱 셔틀 리무진' : '패키지 셔틀 리무진';
            const code = await getCarCode(carType, defaultWayType, defaultRoute);
            setSelectedCarCategory(defaultWayType);
            setSelectedRoute(defaultRoute);
            setVehicleForm([{
                car_type: carType,
                car_category: defaultWayType,
                route: defaultRoute,
                car_code: code,
                count: 1
            }]);
        };
        autoSelect();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isFullPromoOrLegacyC, isParadiseLegacyB, cruiseName, selectedRoomType]);

    // ── 차량 예약 저장 (다중 차량 지원) ──
    const persistVehicle = async (): Promise<boolean> => {
        if (!user || !reservationId) {
            alert('로그인 또는 예약 정보가 없습니다.');
            return false;
        }
        if (!vehicleServiceType && !isFullPromoOrLegacyC && !isParadiseLegacyB) {
            alert('차량 유형을 선택해주세요.');
            return false;
        }
        const validVehicles = vehicleForm.filter(v => v.car_type && v.count > 0);
        if (validVehicles.length === 0) {
            alert('차량을 선택해주세요.');
            return false;
        }
        if (hasShtSeatRequiredVehicle && !selectedShtSeat?.seat) {
            alert('스하차량은 좌석 선택이 필수입니다. 좌석도를 열어 좌석을 선택하고 "좌석 선택 완료"를 눌러주세요.');
            setIsModalReadOnly(false);
            setIsShtCarModalOpen(true);
            return false;
        }
        if (selectedCarCategory === '편도' && !pyongdoDirection) {
            alert('편도 방향(픽업/드롭)을 선택해주세요.');
            return false;
        }
        if (selectedCarCategory === '편도') {
            if (!oneWayRideDate) {
                alert(pyongdoDirection === 'dropoff' ? '드롭 일자를 입력해주세요.' : '픽업 일자를 입력해주세요.');
                return false;
            }
        }
        if (isCustomOtherDayRoundTripCategory(selectedCarCategory)) {
            const effectiveUsageOption = getEffectiveOtherDayUsageOption(selectedCarCategory, otherDayRoundTripForm);
            if (selectedCarCategory === '다른날왕복' && !effectiveUsageOption) {
                alert('다른날 왕복 이용 유형을 선택해주세요.');
                return false;
            }
            if (!otherDayRoundTripForm.rideDate || !otherDayRoundTripForm.rideTime) {
                alert('차량 승차 일자와 시간을 입력해주세요.');
                return false;
            }
            if (!otherDayRoundTripForm.ridePickupLocation || !otherDayRoundTripForm.rideDropoffLocation) {
                alert('차량 승차/하차 장소를 입력해주세요.');
                return false;
            }
            if (effectiveUsageOption === 'before_boarding' && !otherDayRoundTripForm.postCruiseDropoffLocation) {
                alert('하선 후 드랍 장소를 입력해주세요.');
                return false;
            }
            if (effectiveUsageOption === 'after_disembark' && !otherDayRoundTripForm.embarkPickupHotel) {
                alert('승선 시 픽업 호텔을 입력해주세요.');
                return false;
            }
        }

        // 각 차량의 가격/코드를 미리 조회
        type ResolvedVehicle = {
            row: VehicleRow;
            carCode: string;
            priceData: any;
            isSht: boolean;
            isShuttle: boolean;
        };
        const resolved: ResolvedVehicle[] = [];
        for (const v of validVehicles) {
            let carCode = v.car_code;
            if (!carCode) {
                carCode = await getCarCode(v.car_type, v.car_category || selectedCarCategory, v.route || selectedRoute);
            }
            if (!carCode) {
                alert(`선택한 차량(${v.car_type})의 가격 정보를 찾을 수 없습니다.`);
                return false;
            }
            const { data: carPriceData } = await supabase
                .from('rentcar_price')
                .select('*')
                .eq('rent_code', carCode)
                .maybeSingle();
            if (!carPriceData) {
                alert(`차량 가격 정보를 찾을 수 없습니다. (${v.car_type})`);
                return false;
            }
            const isSht = (v.car_type || '').includes('스테이하롱 셔틀 리무진');
            const isShuttle = ((v.car_type || '').includes('셔틀') || (v.car_type || '').includes('크루즈 셔틀 리무진')) && !(v.car_type || '').includes('스테이하롱 셔틀 리무진 단독');
            resolved.push({ row: v, carCode, priceData: carPriceData, isSht, isShuttle });
        }

        const oneWayRideDateValue = oneWayRideDate || null;
        const oneWayRideTimeValue = oneWayRideTime || null;

        const getVehicleDiscountRate = (r: ResolvedVehicle) => {
            if (cruisePromotionCode === LYRA_GRANZER_VEHICLE_DISCOUNT_CODE) return VEHICLE_DISCOUNT_RATE;
            const vehicleType = [r.row.car_type, r.priceData?.vehicle_type, r.priceData?.rental_type].filter(Boolean).join(' ');
            const eligibleGrandPioneersVehicle = r.isSht
                || r.isShuttle
                || vehicleType.includes('셔틀')
                || vehicleType.includes('리무진')
                || vehicleType.includes('단독')
                || r.priceData?.rental_type === '단독대여';
            return canApplyGrandPioneersVehicleDiscount && applyGrandPioneersVehicleDiscount && eligibleGrandPioneersVehicle
                ? VEHICLE_DISCOUNT_RATE
                : 0;
        };

        const getVehicleDiscountNote = (r: ResolvedVehicle) => {
            const discountRate = getVehicleDiscountRate(r);
            if (discountRate <= 0) return null;
            return cruisePromotionCode === LYRA_GRANZER_VEHICLE_DISCOUNT_CODE
                ? '라이라 그랜져 차량 50% 할인 적용'
                : `${GRAND_PIONEERS_VEHICLE_DISCOUNT_CODE}: 그랜드 파이어니스 베란다 스위트 이상 차량 50% 지원 적용`;
        };

        const getVehicleTotalPrice = (r: ResolvedVehicle, count: number) => {
            const customPrice = (r.row as any).custom_price;
            if (customPrice !== undefined) return customPrice;
            const originalTotal = (Number(r.priceData.price || 0)) * count;
            const discountRate = getVehicleDiscountRate(r);
            return discountRate > 0 ? Math.round(originalTotal * (1 - discountRate)) : originalTotal;
        };

        // 전체 차량 합계 가격
        const grandTotal = resolved.reduce((sum, r) => {
            const total = getVehicleTotalPrice(r, r.row.count || 1);
            return sum + total;
        }, 0);

        const otherDayPickupDatetime = combineDateAndTime(otherDayRoundTripForm.rideDate, otherDayRoundTripForm.rideTime);
        const effectiveOtherDayUsageOption = getEffectiveOtherDayUsageOption(selectedCarCategory, otherDayRoundTripForm);
        const otherDayRequestNote = buildOtherDayRequestNote({
            ...otherDayRoundTripForm,
            usageOption: effectiveOtherDayUsageOption,
        } as OtherDayRoundTripForm);

        // re_type 결정: SHT 차량이 하나라도 있으면 sht, 아니면 car
        const vehicleReservationType = resolved.some(r => r.isSht) ? 'sht' : 'car';

        // 크루즈 선착장
        let pierLocation = '선착장';
        const { data: cruiseLocationData } = await supabase
            .from('cruise_location')
            .select('pier_location')
            .eq('kr_name', cruiseName)
            .maybeSingle();
        if (cruiseLocationData?.pier_location) pierLocation = cruiseLocationData.pier_location;

        // 차량 예약 (신규 또는 업데이트)
        let vehicleReId = existingVehicleReservationId;
        if (vehicleReId) {
            await supabase.from('reservation').update({
                re_type: vehicleReservationType,
                total_amount: 0
            }).eq('re_id', vehicleReId);
            await supabase.from('reservation_car_sht').delete().eq('reservation_id', vehicleReId);
            await supabase.from('reservation_cruise_car').delete().eq('reservation_id', vehicleReId);
        } else {
            const { data: vehicleReservation, error: vehicleResError } = await supabase
                .from('reservation')
                .insert({
                    re_user_id: user.id,
                    re_quote_id: quoteId || null,
                    re_type: vehicleReservationType,
                    re_status: 'pending',
                    re_created_at: new Date().toISOString(),
                    total_amount: 0
                })
                .select()
                .single();
            if (vehicleResError) throw vehicleResError;
            vehicleReId = vehicleReservation.re_id;
            setExistingVehicleReservationId(vehicleReId);
        }

        // 각 차량별로 상세 행 삽입
        for (const r of resolved) {
            const inputCount = r.row.count || 1;
            const totalPrice = getVehicleTotalPrice(r, inputCount);
            const unitPrice = Math.round(totalPrice / (inputCount || 1));
            const discountNote = getVehicleDiscountNote(r);

            if (r.isSht) {
                const pickupDateSource = isCustomOtherDayRoundTripCategory(selectedCarCategory)
                    ? otherDayRoundTripForm.rideDate
                    : checkin;
                const pickupDate = pickupDateSource ? new Date(pickupDateSource) : null;
                const pickupDateISO = pickupDate ? pickupDate.toISOString() : null;
                const mergedShtNote = [discountNote, isCustomOtherDayRoundTripCategory(selectedCarCategory) ? otherDayRequestNote : null]
                    .filter(Boolean)
                    .join('\n');
                const baseCode = r.priceData?.rent_code || r.carCode || 'C013';

                if (selectedCarCategory === '편도') {
                    const isPickupDir = pyongdoDirection === 'pickup';
                    const oneWayRows = await buildShtReservationRows({
                        reservationId: vehicleReId,
                        seatValue: selectedShtSeat?.seat,
                        vehicleNumber: selectedShtSeat?.vehicle,
                        baseCode,
                        fallbackUnitPrice: unitPrice,
                        requestNote: mergedShtNote || null,
                        usageDate: pickupDateISO,
                        shtCategory: isPickupDir ? 'Pickup' : 'Drop-off',
                        pickupLocation: isPickupDir ? (pickupLocation || null) : pierLocation,
                        dropoffLocation: isPickupDir ? pierLocation : (dropoffLocation || null)
                    });
                    if (oneWayRows.length > 0) {
                        await supabase.from('reservation_car_sht').insert(oneWayRows);
                    }
                } else {
                    let dropoffDateISO: string | null = null;
                    if (pickupDate) {
                        if (selectedCarCategory === '당일왕복') {
                            dropoffDateISO = pickupDate.toISOString();
                        } else {
                            const dropoffDate = new Date(pickupDate);
                            dropoffDate.setDate(dropoffDate.getDate() + getScheduleReturnOffsetDays(schedule));
                            dropoffDateISO = dropoffDate.toISOString();
                        }
                    }
                    if (selectedCarCategory === '다른날왕복' && effectiveOtherDayUsageOption === 'after_disembark') {
                        const pickupRows = await buildShtReservationRows({
                            reservationId: vehicleReId,
                            seatValue: selectedShtSeat?.seat,
                            vehicleNumber: selectedShtSeat?.vehicle,
                            baseCode,
                            fallbackUnitPrice: unitPrice,
                            requestNote: mergedShtNote || null,
                            usageDate: checkin || null,
                            shtCategory: 'Pickup',
                            pickupLocation: otherDayRoundTripForm.embarkPickupHotel || null,
                            dropoffLocation: pierLocation,
                            totalPriceOverride: 0
                        });
                        if (pickupRows.length > 0) {
                            await supabase.from('reservation_car_sht').insert(pickupRows);
                        }
                        const dropoffRows = await buildShtReservationRows({
                            reservationId: vehicleReId,
                            seatValue: selectedShtSeat?.seat,
                            vehicleNumber: selectedShtSeat?.vehicle,
                            baseCode,
                            fallbackUnitPrice: unitPrice,
                            requestNote: mergedShtNote || null,
                            usageDate: pickupDateISO,
                            shtCategory: 'Drop-off',
                            pickupLocation: otherDayRoundTripForm.ridePickupLocation || null,
                            dropoffLocation: otherDayRoundTripForm.rideDropoffLocation || null
                        });
                        if (dropoffRows.length > 0) {
                            await supabase.from('reservation_car_sht').insert(dropoffRows);
                        }
                    } else {
                        const pickupRows = await buildShtReservationRows({
                            reservationId: vehicleReId,
                            seatValue: selectedShtSeat?.seat,
                            vehicleNumber: selectedShtSeat?.vehicle,
                            baseCode,
                            fallbackUnitPrice: unitPrice,
                            requestNote: mergedShtNote || null,
                            usageDate: pickupDateISO,
                            shtCategory: 'Pickup',
                            pickupLocation: isCustomOtherDayRoundTripCategory(selectedCarCategory)
                                ? (otherDayRoundTripForm.ridePickupLocation || null)
                                : (pickupLocation || null),
                            dropoffLocation: isCustomOtherDayRoundTripCategory(selectedCarCategory)
                                ? (otherDayRoundTripForm.rideDropoffLocation || pierLocation)
                                : pierLocation
                        });
                        if (pickupRows.length > 0) {
                            await supabase.from('reservation_car_sht').insert(pickupRows);
                        }
                        const dropoffRows = await buildShtReservationRows({
                            reservationId: vehicleReId,
                            seatValue: selectedShtSeat?.seat,
                            vehicleNumber: selectedShtSeat?.vehicle,
                            baseCode,
                            fallbackUnitPrice: unitPrice,
                            requestNote: mergedShtNote || null,
                            usageDate: dropoffDateISO,
                            shtCategory: 'Drop-off',
                            pickupLocation: pierLocation,
                            dropoffLocation: isCustomOtherDayRoundTripCategory(selectedCarCategory)
                                ? (otherDayRoundTripForm.postCruiseDropoffLocation || null)
                                : (dropoffLocation || null),
                            totalPriceOverride: 0
                        });
                        if (dropoffRows.length > 0) {
                            await supabase.from('reservation_car_sht').insert(dropoffRows);
                        }
                    }
                }
            } else {
                const carCat = r.row.car_category || selectedCarCategory || '';
                const otherDayUsageOption = isCustomOtherDayRoundTripCategory(carCat)
                    ? getEffectiveOtherDayUsageOption(carCat, otherDayRoundTripForm)
                    : '';
                const otherDayDirection: 'pickup' | 'dropoff' = otherDayUsageOption === 'after_disembark' ? 'dropoff' : 'pickup';
                let returnDatetime: string | null = null;
                let finalPickupDatetime: string | null = checkin || null;
                let finalPickupLocation: string | null = pickupLocation || null;
                let finalDropoffLocation: string | null = dropoffLocation || null;
                let finalRequestNote: string | null = discountNote;
                let pickupTime: string | null = null;
                let returnTime: string | null = null;

                if (carCat === '당일왕복') {
                    returnDatetime = checkin || null;
                } else if (isCustomOtherDayRoundTripCategory(carCat)) {
                    finalPickupLocation = otherDayRoundTripForm.ridePickupLocation || null;
                    finalDropoffLocation = otherDayRoundTripForm.rideDropoffLocation || null;

                    if (otherDayUsageOption === 'before_boarding') {
                        finalPickupDatetime = otherDayPickupDatetime;
                        if (checkin) {
                            const rd = new Date(checkin);
                            rd.setDate(rd.getDate() + getScheduleReturnOffsetDays(schedule));
                            returnDatetime = rd.toISOString().split('T')[0];
                        }
                    } else {
                        finalPickupDatetime = null;
                        returnDatetime = otherDayPickupDatetime;
                    }

                    finalRequestNote = [discountNote, otherDayRequestNote].filter(Boolean).join('\n');
                    pickupTime = otherDayRoundTripForm.rideTime || null;
                } else if (isScheduleRoundTripCategory(carCat)) {
                    finalPickupDatetime = checkin || null;
                    if (checkin) {
                        const rd = new Date(checkin);
                        rd.setDate(rd.getDate() + getScheduleReturnOffsetDays(schedule));
                        returnDatetime = rd.toISOString().split('T')[0];
                    }
                } else if (carCat === '편도') {
                    const isPickupDir = pyongdoDirection === 'pickup';
                    if (isPickupDir) {
                        finalPickupDatetime = oneWayRideDateValue;
                        pickupTime = oneWayRideTimeValue;
                        returnDatetime = null;
                        returnTime = null;
                    } else {
                        finalPickupDatetime = null;
                        pickupTime = null;
                        returnDatetime = oneWayRideDateValue;
                        returnTime = oneWayRideTimeValue;
                        finalPickupDatetime = null;
                    }
                }

                await supabase.from('reservation_cruise_car').insert({
                    reservation_id: vehicleReId,
                    car_price_code: r.priceData.rent_code,
                    rentcar_price_code: r.priceData.rent_code,
                    way_type: carCat === '일정왕복'
                        ? '일정왕복'
                        : (r.priceData.way_type || r.row.car_category || null),
                    route: r.priceData.route || r.row.route || null,
                    vehicle_type: r.priceData.vehicle_type || r.row.car_type || null,
                    rental_type: r.priceData.rental_type || null,
                    car_count: r.isShuttle ? 0 : inputCount,
                    passenger_count: r.isShuttle ? inputCount : 0,
                    pickup_datetime: finalPickupDatetime,
                    pickup_location: finalPickupLocation,
                    dropoff_location: finalDropoffLocation,
                    pickup_time: pickupTime,
                    return_time: returnTime,
                    return_datetime: returnDatetime,
                    one_way_direction: carCat === '편도'
                        ? (pyongdoDirection === 'dropoff' ? 'dropoff' : 'pickup')
                        : (carCat === '다른날왕복' ? otherDayDirection : null),
                    unit_price: unitPrice,
                    car_total_price: totalPrice,
                    request_note: finalRequestNote
                });
            }
        }

        await supabase.from('reservation').update({ total_amount: grandTotal }).eq('re_id', vehicleReId);
        return true;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setLoading(true);
            const { user: freshUser, error: authError } = await refreshAuthBeforeSubmit();
            if (authError || !freshUser) {
                alert('세션이 만료되었습니다. 페이지를 새로고침 해주세요.');
                return;
            }
            const ok = await persistVehicle();
            if (!ok) return;
            alert('예약 신청이 완료되었습니다.\n카카오 채널로 연락주세요.\n담당자의 안내에 따라 결제를 진행하셔야 예약이 완료됩니다.\n\n※ 신청서 제출 후 24시간 이내에 카카오톡 채널로 연락주지 않으시면, 신청서는 삭제됩니다.\n\n카카오채널 - http://pf.kakao.com/_zvsxaG/chat');
            router.push('/mypage/direct-booking?completed=cruise');
        } catch (error) {
            console.error('차량 예약 저장 오류:', error);
            alert('차량 예약 저장 중 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };

    const handleSkip = () => {
        router.push('/mypage/direct-booking?completed=cruise');
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50">
                <div className="flex flex-col justify-center items-center h-48">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
                    <p className="mt-4 text-gray-600">로딩 중...</p>
                </div>
            </div>
        );
    }

    if (pageError) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-xl shadow p-6 max-w-md w-full text-center">
                    <p className="text-red-600 mb-4">{pageError}</p>
                    <button
                        type="button"
                        onClick={() => router.push('/mypage/direct-booking/cruise')}
                        className="px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700"
                    >
                        크루즈 예약으로 돌아가기
                    </button>
                </div>
            </div>
        );
    }

    if (!reservationId) {
        return (
            <PageWrapper title="📝 차량 예약">
                <div className="w-full space-y-4">
                    <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                        <p className="text-blue-700 text-sm">
                            차량을 추가할 크루즈 예약을 먼저 선택해 주세요.
                        </p>
                    </div>

                    {cruiseOptions.length === 0 ? (
                        <div className="bg-white rounded-xl shadow p-6 text-center space-y-4">
                            <p className="text-gray-600">추가 가능한 크루즈 예약이 없습니다.</p>
                            <button
                                type="button"
                                onClick={() => router.push('/mypage/direct-booking/cruise')}
                                className="px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700"
                            >
                                크루즈 예약하러 가기
                            </button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-3">
                            {cruiseOptions.map((option) => (
                                <button
                                    key={option.reservationId}
                                    type="button"
                                    onClick={() => {
                                        const nextQuoteId = option.quoteId || quoteId || '';
                                        const nextUrl = nextQuoteId
                                            ? `/mypage/direct-booking/cruise/vehicle?reservationId=${option.reservationId}&quoteId=${nextQuoteId}`
                                            : `/mypage/direct-booking/cruise/vehicle?reservationId=${option.reservationId}`;
                                        router.push(nextUrl);
                                    }}
                                    className="bg-white border border-slate-300 rounded-lg p-4 hover:shadow-md transition text-left"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <h3 className="text-base font-semibold text-slate-900">{option.cruiseName}</h3>
                                            <p className="text-sm text-slate-500 mt-1">
                                                체크인 {option.checkin || '-'} · {option.schedule || '일정 미상'}
                                            </p>
                                            <p className="text-sm text-slate-600 mt-1">
                                                객실 {option.roomTypes.join(', ') || '-'} · 인원 {option.guestCount || 0}명
                                            </p>
                                        </div>
                                        <span className="text-xs px-2 py-1 rounded-full bg-indigo-100 text-indigo-700">
                                            차량 추가
                                        </span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </PageWrapper>
        );
    }

    return (
        <PageWrapper title="📝 차량 예약">
            <div className="w-full">
                <form onSubmit={handleSubmit} className="space-y-4">

                        <div className="space-y-4 flex flex-col">
                            {/* 차량 자동 선택 안내 */}
                            {isFullPromoOrLegacyC && (
                                <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
                                    <div className="flex items-center gap-2 text-sm text-orange-700">
                                        <span>🎁</span>
                                        <span>선택하신 객실에 <strong>패키지 셔틀 리무진 왕복</strong>이 자동 선택됩니다.</span>
                                    </div>
                                </div>
                            )}
                            {isParadiseLegacyB && (
                                <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
                                    <div className="flex items-center justify-between gap-2 text-sm text-orange-700">
                                        <div className="flex items-center gap-2">
                                            <span>🎁</span>
                                            <span>선택하신 객실에 <strong>스테이하롱 셔틀 리무진 왕복</strong>이 자동 선택됩니다.(원하는 좌석을 선택 하세요)</span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => { setIsModalReadOnly(false); setIsShtCarModalOpen(true); }}
                                            className="px-3 py-1 bg-blue-600 text-white rounded border border-blue-700 text-sm hover:bg-blue-700 transition-colors shadow-sm whitespace-nowrap"
                                            disabled={!checkin}
                                        >
                                            🚐 좌석 선택
                                        </button>
                                    </div>
                                </div>
                            )}

                            <div className="mb-4 flex justify-between items-center">
                                <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                                    <span>🚗</span>
                                    차량 선택 정보
                                </h3>
                                {vehicleForm.some(v => isShtVehicleType(v.car_type) && v.count > 0) && (
                                    isShtExclusiveCruise ? (
                                        <span className="px-3 py-1 bg-orange-100 text-orange-700 border border-orange-300 rounded text-sm font-medium">
                                            🔒 단독 예약 자동 적용
                                        </span>
                                    ) : (
                                        // 편도 자동 단독 또는 레거시B 자동 처리는 좌석 선택 버튼 노출하지 않음
                                        hasShtSeatRequiredVehicle && !isParadiseLegacyB && (
                                            <button
                                                type="button"
                                                onClick={() => { setIsModalReadOnly(false); setIsShtCarModalOpen(true); }}
                                                className="px-3 py-1 bg-blue-600 text-white rounded border border-blue-700 text-sm hover:bg-blue-700 transition-colors shadow-sm"
                                                disabled={!checkin}
                                            >
                                                🚐 스하차량 좌석도 선택
                                            </button>
                                        )
                                    )
                                )}
                            </div>

                            {hasShtSeatRequiredVehicle && (
                                <div className={`mb-3 text-sm px-3 py-2 rounded border ${selectedShtSeat?.seat
                                    ? 'bg-green-50 text-green-700 border-green-200'
                                    : 'bg-red-50 text-red-700 border-red-200'
                                    }`}>
                                    {selectedShtSeat?.seat
                                        ? `✅ 좌석 선택 완료: ${selectedShtSeat.vehicle} / ${selectedShtSeat.seat}`
                                        : '⚠️ 스하차량 좌석이 아직 저장되지 않았습니다. 좌석도에서 선택 후 "좌석 선택 완료"를 눌러주세요.'}
                                </div>
                            )}

                            <fieldset>
                                <legend className="block text-sm font-medium text-gray-700 mb-2">차량 유형</legend>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    <label
                                        htmlFor="cruise-shuttle"
                                        className={`flex min-h-11 items-center gap-3 border px-3 py-3 cursor-pointer transition-colors ${vehicleServiceType === 'cruise_shuttle'
                                            ? 'border-blue-500 bg-blue-50 text-blue-800'
                                            : hasCruiseShuttle
                                                ? 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                                                : 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed'
                                            }`}
                                    >
                                        <input
                                            id="cruise-shuttle"
                                            type="checkbox"
                                            checked={vehicleServiceType === 'cruise_shuttle'}
                                            onChange={() => selectVehicleServiceType('cruise_shuttle')}
                                            disabled={!hasCruiseShuttle}
                                            className="h-4 w-4"
                                        />
                                        <span>
                                            <span className="block font-semibold">크루즈사 운영 셔틀 리무진</span>
                                        </span>
                                    </label>
                                    <label
                                        htmlFor="private-rental"
                                        className={`flex min-h-11 items-center gap-3 border px-3 py-3 cursor-pointer transition-colors ${vehicleServiceType === 'private_rental'
                                            ? 'border-blue-500 bg-blue-50 text-blue-800'
                                            : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                                            }`}
                                    >
                                        <input
                                            id="private-rental"
                                            type="checkbox"
                                            checked={vehicleServiceType === 'private_rental'}
                                            onChange={() => selectVehicleServiceType('private_rental')}
                                            className="h-4 w-4"
                                        />
                                        <span>
                                            <span className="block font-semibold">기사 포함 단독 렌트카</span>
                                        </span>
                                    </label>
                                </div>
                                {!hasCruiseShuttle && cruiseName && (
                                    <p className="mt-2 text-xs text-gray-500">{cruiseName}은 현재 등록된 크루즈사 운영 셔틀 요금이 없습니다.</p>
                                )}
                            </fieldset>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">이용방식</label>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                    {getAvailableCarCategories.map(category => (
                                        <button
                                            key={category}
                                            type="button"
                                            onClick={async () => {
                                                if (!vehicleServiceType) return;
                                                setSelectedCarCategory(category);
                                                setSelectedRoute('');
                                                setCarTypeOptions([]);
                                                // 편도 방향 초기화 (편도가 아닌 경우)
                                                if (category !== '편도') setPyongdoDirection('');
                                                if (!isCustomOtherDayRoundTripCategory(category)) {
                                                    setOtherDayRoundTripForm(createEmptyOtherDayRoundTripForm());
                                                }
                                                const updatedVehicleForm = vehicleForm.map(v => ({
                                                    ...v,
                                                    car_category: category,
                                                    route: '',
                                                    car_type: '',
                                                    car_code: ''
                                                }));
                                                setVehicleForm(updatedVehicleForm);
                                            }}
                                            disabled={!vehicleServiceType}
                                            className={`px-4 py-2 border rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${selectedCarCategory === category
                                                ? 'bg-blue-500 text-white border-blue-500'
                                                : 'bg-gray-50 border-gray-300 hover:bg-gray-100 text-gray-700'
                                                }`}
                                        >
                                            {category}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* 편도 선택 시 방향 선택 */}
                            {selectedCarCategory === '편도' && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">편도 방향</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setPyongdoDirection('pickup');
                                                const autoDate = getOneWayAutoRideDate('pickup');
                                                if (autoDate) setOneWayRideDate(autoDate);
                                            }}
                                            className={`px-4 py-2 border rounded-lg transition-colors ${pyongdoDirection === 'pickup'
                                                ? 'bg-blue-500 text-white border-blue-500'
                                                : 'bg-gray-50 border-gray-300 hover:bg-gray-100 text-gray-700'
                                                }`}
                                        >
                                            픽업 (입국/호텔 → 선착장)
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setPyongdoDirection('dropoff');
                                                const autoDate = getOneWayAutoRideDate('dropoff');
                                                if (autoDate) setOneWayRideDate(autoDate);
                                            }}
                                            className={`px-4 py-2 border rounded-lg transition-colors ${pyongdoDirection === 'dropoff'
                                                ? 'bg-blue-500 text-white border-blue-500'
                                                : 'bg-gray-50 border-gray-300 hover:bg-gray-100 text-gray-700'
                                                }`}
                                        >
                                            드롭 (선착장 → 공항/호텔)
                                        </button>
                                    </div>
                                </div>
                            )}

                            {selectedCarCategory === '편도' && pyongdoDirection && (
                                <div className="space-y-3">
                                    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-sm text-blue-700">
                                        <span>
                                            {pyongdoDirection === 'dropoff'
                                                ? '드롭 선택 시 하선 일정 기준 날짜를 자동입력할 수 있습니다.'
                                                : '픽업 선택 시 체크인 날짜를 바로 자동입력할 수 있습니다.'}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => applyOneWayAutoRideDate(pyongdoDirection)}
                                            disabled={!checkin}
                                            className="px-3 py-1 rounded-md border border-blue-300 bg-white text-blue-700 hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {pyongdoDirection === 'dropoff' ? '드롭일자 자동입력' : '체크인일자 자동입력'}
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-1 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                {pyongdoDirection === 'dropoff' ? '드롭 일자' : '픽업 일자'}
                                            </label>
                                            <input
                                                type="date"
                                                value={oneWayRideDate}
                                                onChange={(e) => setOneWayRideDate(e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {isScheduleRoundTripCategory(selectedCarCategory) && (
                                <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-sm text-blue-700">
                                    일정왕복은 승차일자/하차일자가 체크인일과 일정 기준으로 자동 입력됩니다.
                                </div>
                            )}

                            {isCustomOtherDayRoundTripCategory(selectedCarCategory) && (
                                <div className="order-3 space-y-4 border border-blue-200 bg-blue-50 rounded-lg p-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">다른날 왕복 이용 유형</label>
                                        <div className="grid grid-cols-2 gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setOtherDayRoundTripForm((prev) => ({ ...prev, usageOption: 'before_boarding' }))}
                                                className={`px-4 py-3 border rounded-lg text-sm text-center leading-snug whitespace-normal break-words transition-colors ${otherDayRoundTripForm.usageOption === 'before_boarding'
                                                    ? 'bg-blue-500 text-white border-blue-500'
                                                    : 'bg-white border-blue-200 text-gray-700 hover:bg-blue-100'
                                                    }`}
                                            >
                                                <span className="block">승선일 이전</span>
                                                <span className="block">차량 이용</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setOtherDayRoundTripForm((prev) => ({ ...prev, usageOption: 'after_disembark' }))}
                                                className={`px-4 py-3 border rounded-lg text-sm text-center leading-snug whitespace-normal break-words transition-colors ${otherDayRoundTripForm.usageOption === 'after_disembark'
                                                    ? 'bg-blue-500 text-white border-blue-500'
                                                    : 'bg-white border-blue-200 text-gray-700 hover:bg-blue-100'
                                                    }`}
                                            >
                                                <span className="block">하선일 이후</span>
                                                <span className="block">차량 이용</span>
                                            </button>
                                        </div>
                                    </div>

                                    {otherDayRoundTripForm.usageOption && (
                                        <div className="space-y-4">
                                            {otherDayRoundTripForm.usageOption === 'before_boarding' && (
                                                <div className="rounded-lg bg-white/70 p-3 text-sm text-gray-700">
                                                    승선 전 차량 이용 정보를 입력하고, 하선 후 드랍 장소를 추가로 입력해 주세요.
                                                </div>
                                            )}
                                            {otherDayRoundTripForm.usageOption === 'after_disembark' && (
                                                <div className="rounded-lg bg-white/70 p-3 text-sm text-gray-700">
                                                    승선 시 픽업 호텔을 입력한 뒤, 하선 후 차량 이용 정보를 입력해 주세요.
                                                </div>
                                            )}

                                            {otherDayRoundTripForm.usageOption === 'after_disembark' && (
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-2">승선 시 픽업 호텔</label>
                                                    <input
                                                        type="text"
                                                        value={otherDayRoundTripForm.embarkPickupHotel}
                                                        onChange={(e) => handleOtherDayRoundTripInput('embarkPickupHotel', e.target.value)}
                                                        placeholder="영문 대문자로 입력해 주세요"
                                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                    />
                                                </div>
                                            )}

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-2">차량 승차 일자</label>
                                                    <input
                                                        type="date"
                                                        value={otherDayRoundTripForm.rideDate}
                                                        onChange={(e) => handleOtherDayRoundTripInput('rideDate', e.target.value)}
                                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-2">차량 승차 시간</label>
                                                    <input
                                                        type="time"
                                                        value={otherDayRoundTripForm.rideTime}
                                                        onChange={(e) => handleOtherDayRoundTripInput('rideTime', e.target.value)}
                                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                    />
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-2">승차장소</label>
                                                    <input
                                                        type="text"
                                                        value={otherDayRoundTripForm.ridePickupLocation}
                                                        onChange={(e) => handleOtherDayRoundTripInput('ridePickupLocation', e.target.value)}
                                                        placeholder="영문 대문자로 입력해 주세요"
                                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-2">하차장소</label>
                                                    <input
                                                        type="text"
                                                        value={otherDayRoundTripForm.rideDropoffLocation}
                                                        onChange={(e) => handleOtherDayRoundTripInput('rideDropoffLocation', e.target.value)}
                                                        placeholder="영문 대문자로 입력해 주세요"
                                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                    />
                                                </div>
                                            </div>

                                            {otherDayRoundTripForm.usageOption === 'before_boarding' && (
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-2">하선 후 드랍 장소</label>
                                                    <input
                                                        type="text"
                                                        value={otherDayRoundTripForm.postCruiseDropoffLocation}
                                                        onChange={(e) => handleOtherDayRoundTripInput('postCruiseDropoffLocation', e.target.value)}
                                                        placeholder="영문 대문자로 입력해 주세요"
                                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                    />
                                                </div>
                                    )}
                                        </div>
                                    )}
                                    {locationInputError && (
                                        <p className="text-sm text-red-500">{locationInputError}</p>
                                    )}
                                </div>
                            )}

                            <div className="order-2 space-y-4">
                            {vehicleForm.map((vehicle, vehicleIndex) => (
                                <div key={vehicleIndex} className="border border-green-200 rounded-lg p-4 bg-green-50">
                                    <div className="flex items-center justify-between mb-3">
                                        <h4 className="font-semibold text-gray-800">차량 {vehicleIndex + 1}</h4>
                                        {vehicleForm.length > 1 && (
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveVehicle(vehicleIndex)}
                                                className="text-red-600 hover:text-red-800 text-sm"
                                            >
                                                삭제
                                            </button>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                        {selectedCarCategory && (
                                            <div>
                                                <label className="block text-sm font-medium text-gray-600 mb-1">경로</label>
                                                <select
                                                    value={vehicle.route || ''}
                                                    onChange={async (e) => {
                                                        const selectedRouteValue = e.target.value;
                                                        setSelectedRoute(selectedRouteValue);
                                                        handleVehicleChange(vehicleIndex, 'route', selectedRouteValue);
                                                        if (selectedCarCategory && selectedRouteValue) {
                                                            await loadCarTypeOptions(selectedCarCategory, selectedRouteValue);
                                                        }
                                                    }}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-green-500"
                                                    disabled={!vehicle.car_category}
                                                >
                                                    <option value="">경로 선택</option>
                                                    {routeOptions.map(route => (
                                                        <option key={route} value={route}>{route}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}

                                        {vehicleServiceType !== 'cruise_shuttle' && (
                                            <div>
                                                <label className="block text-sm font-medium text-gray-600 mb-1">차량타입</label>
                                                <select
                                                    value={isShtVehicleType(vehicle.car_type) ? '스테이하롱 셔틀 리무진' : vehicle.car_type}
                                                    onChange={async (e) => {
                                                        const rawCarType = e.target.value;
                                                        const selectedWayType = vehicle.car_category || selectedCarCategory;
                                                        // SHT가 옵션 값에 단독/A/B/C 변형으로 들어와도 일반 SHT로 1차 정규화
                                                        const baseCarType = isShtVehicleType(rawCarType)
                                                            ? '스테이하롱 셔틀 리무진'
                                                            : rawCarType;
                                                        // 편도+SHT만 자동 단독 변형
                                                        const normalizedCarType = shouldAutoSoloSht(baseCarType, selectedWayType)
                                                            ? '스테이하롱 셔틀 리무진 단독'
                                                            : baseCarType;
                                                        handleVehicleChange(vehicleIndex, 'car_type', normalizedCarType);
                                                        if (normalizedCarType && selectedWayType) {
                                                            const code = await getCarCode(normalizedCarType, selectedWayType, vehicle.route || selectedRoute);
                                                            handleVehicleChange(vehicleIndex, 'car_code', code);
                                                        }
                                                        // 당일왕복/다른날왕복 + 일반 SHT → 좌석 선택 모달 자동 오픈 (필수)
                                                        const isShtRoundTrip = isShtVehicleType(normalizedCarType)
                                                            && !normalizedCarType.includes('단독')
                                                            && (selectedWayType === '당일왕복' || selectedWayType === '다른날왕복' || selectedWayType === '일정왕복')
                                                            && !isShtExclusiveCruise;
                                                        if (isShtRoundTrip) {
                                                            setIsModalReadOnly(false);
                                                            setSelectedShtSeat(null);
                                                            // 비동기 setState 후 안정적으로 모달이 열리도록 다음 tick에 호출
                                                            setTimeout(() => setIsShtCarModalOpen(true), 0);
                                                        }
                                                    }}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-green-500"
                                                    disabled={!vehicleServiceType || !vehicle.car_category || !vehicle.route}
                                                >
                                                    <option value="">
                                                        {!vehicleServiceType ? '차량 유형을 먼저 선택하세요' : (!vehicle.car_category ? '이용방식을 먼저 선택하세요' : (!vehicle.route ? '경로를 먼저 선택하세요' : '차량타입 선택'))}
                                                    </option>
                                                    {carTypeOptions.map(carType => (
                                                        <option key={carType} value={carType}>{toVehicleDisplayType(carType)}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}

                                        <div>
                                            <label className="block text-sm font-medium text-gray-600 mb-1">
                                                {vehicle.car_type && ((vehicle.car_type.includes('셔틀') || vehicle.car_type.includes('크루즈 셔틀 리무진')) && !vehicle.car_type.includes('스테이하롱 셔틀 리무진 단독'))
                                                    ? '인원수'
                                                    : '차량수'
                                                }
                                            </label>
                                            <input
                                                type="number" min="0"
                                                value={vehicle.count || ''}
                                                placeholder="수량 입력"
                                                onChange={(e) => {
                                                    const inputValue = parseInt(e.target.value);
                                                    if (e.target.value === '' || inputValue >= 0) {
                                                        handleVehicleChange(vehicleIndex, 'count', inputValue || 0);
                                                    }
                                                }}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-green-500"
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}

                            {vehicleServiceType !== 'cruise_shuttle' && vehicleForm.length < 6 && (
                                <button
                                    type="button"
                                    onClick={handleAddVehicle}
                                    className="w-full border-2 border-dashed border-green-300 rounded-lg p-4 text-green-600 hover:border-green-400 hover:text-green-700 transition-colors"
                                >
                                    + 차량 추가 (최대 6대)
                                </button>
                            )}
                            </div>

                            {/* 픽업/드롭오프 */}
                            {!isCustomOtherDayRoundTripCategory(selectedCarCategory) && (
                            <div className="space-y-4">
                                <h3 className="text-lg font-semibold text-gray-800">📍 픽업/드롭오프 장소</h3>
                                {selectedCarCategory === '편도' && !pyongdoDirection && (
                                    <p className="text-sm text-orange-600">* 위에서 편도 방향(픽업/드롭)을 먼저 선택해주세요.</p>
                                )}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* 픽업 장소: 왕복 또는 편도-pickup 일 때만 표시 */}
                                    {(selectedCarCategory !== '편도' || pyongdoDirection === 'pickup') && (
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">픽업 장소</label>
                                            <input
                                                type="text"
                                                value={pickupLocation}
                                                onChange={(e) => handleLocationInput('pickup', e.target.value)}
                                                placeholder="영문 대문자로 입력해 주세요"
                                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>
                                    )}
                                    {/* 드롭 장소: 왕복 또는 편도-dropoff 일 때만 표시 */}
                                    {(selectedCarCategory !== '편도' || pyongdoDirection === 'dropoff') && (
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">드롭오프 장소</label>
                                            <input
                                                type="text"
                                                value={dropoffLocation}
                                                onChange={(e) => handleLocationInput('dropoff', e.target.value)}
                                                placeholder="영문 대문자로 입력해 주세요"
                                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>
                                    )}
                                </div>
                                {locationInputError && (
                                    <p className="text-sm text-red-500">{locationInputError}</p>
                                )}
                            </div>
                            )}
                        </div>

                        <div className="flex justify-end gap-4 mt-6">
                            <button
                                type="button"
                                onClick={handleSkip}
                                className="px-6 py-3 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
                            >
                                취소
                            </button>
                            <button
                                type="submit"
                                disabled={loading || !vehicleForm[0]?.car_type}
                                className="px-6 py-3 bg-sky-600 text-white rounded-lg hover:bg-sky-700 disabled:bg-gray-400"
                            >
                                {loading ? '저장 중...' : '차량 예약 완료'}
                            </button>
                        </div>
                    </form>
                </div>

            {isShtCarModalOpen && (
                <ShtCarSeatMap
                    isOpen={isShtCarModalOpen}
                    onClose={() => setIsShtCarModalOpen(false)}
                    usageDate={checkin}
                    onSeatSelect={handleShtSeatSelect}
                    readOnly={isModalReadOnly}
                    requiredSeats={vehicleForm.find(v => v.car_type?.includes('스테이하롱 셔틀 리무진'))?.count || 1}
                    preventCloseWithoutSave={true}
                />
            )}
        </PageWrapper>
    );
}

export default function CruiseVehiclePage() {
    return (
        <Suspense fallback={<div className="flex justify-center items-center h-48">로딩 중...</div>}>
            <CruiseVehicleContent />
        </Suspense>
    );
}
