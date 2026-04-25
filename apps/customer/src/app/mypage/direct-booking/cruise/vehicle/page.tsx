'use client';

import { useState, useEffect, Suspense, useMemo, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import supabase from '../../../../../lib/supabase';
import { refreshAuthBeforeSubmit } from '../../../../../lib/authHelpers';
import { useLoadingTimeout } from '../../../../../hooks/useLoadingTimeout';
import { hasInvalidLocationChars, normalizeLocationEnglishUpper } from '../../../../../lib/locationInput';
import ShtCarSeatMap from '../../../../../components/ShtCarSeatMap';

type VehicleRow = {
    car_type: string;
    car_category: string;
    car_code: string;
    route: string;
    count: number;
    custom_price?: number;
};

const carCategoryHardcoded = ['편도', '당일왕복', '다른날왕복'];

const isShtVehicleType = (vehicleType?: string) =>
    !!vehicleType && vehicleType.includes('스테이하롱 셔틀 리무진');

const shouldAutoSoloSht = (vehicleType?: string, wayType?: string) =>
    isShtVehicleType(vehicleType) && (wayType === '편도' || wayType === '당일왕복');

const toVehicleDisplayType = (vehicleType?: string) => {
    if (!vehicleType) return '';
    return vehicleType === '스테이하롱 셔틀 리무진 단독'
        ? '스테이하롱 셔틀 리무진'
        : vehicleType;
};

function CruiseVehicleContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const reservationId = searchParams.get('reservationId');
    const quoteId = searchParams.get('quoteId');

    const [user, setUser] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [pageError, setPageError] = useState<string>('');

    // 크루즈 정보 (rentcar 필터 + 자동 차량 결정용)
    const [cruiseName, setCruiseName] = useState('');
    const [schedule, setSchedule] = useState('');
    const [checkin, setCheckin] = useState('');
    const [selectedRoomType, setSelectedRoomType] = useState('');
    const [selectedRateCardPromotion, setSelectedRateCardPromotion] = useState(false);

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

    const [carTypeOptions, setCarTypeOptions] = useState<string[]>([]);
    const [routeOptions, setRouteOptions] = useState<string[]>([]);
    const [selectedCarCategory, setSelectedCarCategory] = useState('');
    const [selectedRoute, setSelectedRoute] = useState('');

    const [isShtCarModalOpen, setIsShtCarModalOpen] = useState(false);
    const [isModalReadOnly, setIsModalReadOnly] = useState(false);
    const [selectedShtSeat, setSelectedShtSeat] = useState<{ vehicle: string; seat: string; category: string } | null>(null);

    useLoadingTimeout(loading, setLoading);

    // 일정에 따라 사용 가능한 차량 카테고리 필터링
    const getAvailableCarCategories = useMemo(() => {
        const isMultiDay = schedule && ['1박2일', '2박3일'].includes(schedule);
        return carCategoryHardcoded.filter(cat => !(isMultiDay && cat === '당일왕복'));
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

    const applyCruiseFilterToRentcarQuery = useCallback((query: any) => {
        const name = (cruiseName || '').trim();
        if (!name) return query.eq('cruise', '공통');
        return query.in('cruise', ['공통', name]);
    }, [cruiseName]);

    const loadRouteOptions = useCallback(async (wayType: string) => {
        if (!wayType) return;
        try {
            let query = supabase
                .from('rentcar_price')
                .select('route')
                .eq('way_type', wayType)
                .like('route', '%하롱베이%');
            query = applyCruiseFilterToRentcarQuery(query);
            const { data, error } = await query.order('route');
            if (error) throw error;
            const uniqueRoutes = [...new Set((data || []).map((d: any) => d.route).filter(Boolean))] as string[];
            setRouteOptions(uniqueRoutes);
        } catch (error) {
            console.error('차량 경로 옵션 조회 실패:', error);
            setRouteOptions([]);
        }
    }, [applyCruiseFilterToRentcarQuery]);

    const loadCarTypeOptions = useCallback(async (wayType?: string, route?: string) => {
        const wt = wayType || selectedCarCategory;
        const rt = route !== undefined ? route : selectedRoute;
        try {
            let query = supabase
                .from('rentcar_price')
                .select('vehicle_type')
                .eq('way_type', wt);
            if (rt) query = query.eq('route', rt);
            else query = query.like('route', '%하롱베이%');
            query = applyCruiseFilterToRentcarQuery(query);
            const { data, error } = await query.order('vehicle_type');
            if (error) throw error;
            let uniqueCarTypes = [...new Set((data || []).map((d: any) => d.vehicle_type).filter(Boolean))] as string[];
            uniqueCarTypes = uniqueCarTypes.filter(t => !/스테이하롱 셔틀 리무진 [ABC]/.test(t));
            setCarTypeOptions(uniqueCarTypes);
        } catch (error) {
            console.error('차량타입 옵션 조회 실패:', error);
        }
    }, [selectedCarCategory, selectedRoute, applyCruiseFilterToRentcarQuery]);

    const getCarCode = useCallback(async (carType: string, carCategory: string, route?: string): Promise<string> => {
        try {
            const effectiveRoute = route || selectedRoute;
            let query = supabase
                .from('rentcar_price')
                .select('rent_code')
                .eq('way_type', carCategory)
                .eq('vehicle_type', carType);
            if (effectiveRoute) query = query.eq('route', effectiveRoute);
            query = applyCruiseFilterToRentcarQuery(query);
            const { data, error } = await query.limit(1);
            if (error) throw error;
            return data?.[0]?.rent_code || '';
        } catch (error) {
            console.error('rent_code 조회 실패:', error);
            return '';
        }
    }, [selectedRoute, applyCruiseFilterToRentcarQuery]);

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

    const handleShtSeatSelect = useCallback((seatInfo: { vehicle: string; seat: string; category: string }) => {
        setSelectedShtSeat(seatInfo);
        if (!seatInfo.seat) return;
        const seats = seatInfo.seat.split(',').map(s => s.trim().toUpperCase());
        const isAll = seats.includes('ALL');
        const seatCount = isAll ? 10 : seats.length;

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
                        .single();
                    totalFetchedPrice = soloData?.price || 5400000;
                } else {
                    const seatTypes = new Set<string>();
                    seats.forEach(seat => {
                        if (seat.startsWith('A')) seatTypes.add('A');
                        else if (seat.startsWith('B')) seatTypes.add('B');
                        else if (seat.startsWith('C')) seatTypes.add('C');
                    });
                    for (const seatType of seatTypes) {
                        const typePattern = seatType === 'A' ? '%스테이하롱 셔틀 리무진 A%'
                            : seatType === 'B' ? '%스테이하롱 셔틀 리무진 B%'
                                : '%스테이하롱 셔틀 리무진 C%';
                        const { data: typeData } = await supabase
                            .from('rentcar_price')
                            .select('price')
                            .like('vehicle_type', typePattern)
                            .not('vehicle_type', 'like', '%단독%')
                            .eq('way_type', selectedCarCategory || '당일왕복')
                            .limit(1)
                            .single();
                        if (typeData?.price) {
                            const sc = seats.filter(s => s.startsWith(seatType)).length;
                            totalFetchedPrice += typeData.price * sc;
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
                if (!reservationId) {
                    setPageError('예약 정보가 없습니다. 크루즈 예약 페이지로 돌아가세요.');
                    return;
                }

                const { data: { session } } = await supabase.auth.getSession();
                if (cancelled) return;
                if (session?.user) setUser(session.user);

                // 크루즈 예약 조회
                const { data: reservation, error: resError } = await supabase
                    .from('reservation')
                    .select('re_id, re_user_id, re_quote_id, re_type, reservation_date')
                    .eq('re_id', reservationId)
                    .maybeSingle();

                if (cancelled) return;
                if (resError || !reservation) {
                    setPageError('예약 정보를 찾을 수 없습니다.');
                    return;
                }

                if (reservation.reservation_date) setCheckin(reservation.reservation_date);

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

                        if (vehicleRes.re_type === 'sht') {
                            const { data: shtData } = await supabase
                                .from('reservation_car_sht')
                                .select('*')
                                .eq('reservation_id', vehicleRes.re_id)
                                .limit(1)
                                .maybeSingle();
                            if (shtData) {
                                if (shtData.vehicle_number || shtData.seat_number) {
                                    setSelectedShtSeat({
                                        vehicle: shtData.vehicle_number || '',
                                        seat: shtData.seat_number || '',
                                        category: 'roundtrip'
                                    });
                                }
                                const { data: rentcarData } = await supabase
                                    .from('rentcar_price')
                                    .select('way_type, route, vehicle_type')
                                    .eq('rent_code', shtData.car_price_code)
                                    .maybeSingle();
                                setVehicleForm([{
                                    car_type: rentcarData?.vehicle_type || '스테이하롱 셔틀 리무진',
                                    car_category: rentcarData?.way_type || '당일왕복',
                                    route: rentcarData?.route || '',
                                    car_code: shtData.car_price_code || '',
                                    count: shtData.passenger_count || 1
                                }]);
                                setSelectedCarCategory(rentcarData?.way_type || '당일왕복');
                                setSelectedRoute(rentcarData?.route || '');
                                if (shtData.pickup_location) setPickupLocation(shtData.pickup_location);
                                if (shtData.dropoff_location) setDropoffLocation(shtData.dropoff_location);
                            }
                        } else {
                            const { data: carData } = await supabase
                                .from('reservation_cruise_car')
                                .select('*')
                                .eq('reservation_id', vehicleRes.re_id)
                                .limit(1)
                                .maybeSingle();
                            if (carData) {
                                const code = carData.rentcar_price_code || carData.car_price_code;
                                const { data: rentcarData } = await supabase
                                    .from('rentcar_price')
                                    .select('way_type, route, vehicle_type')
                                    .eq('rent_code', code)
                                    .maybeSingle();
                                setVehicleForm([{
                                    car_type: carData.vehicle_type || rentcarData?.vehicle_type || '',
                                    car_category: carData.way_type || rentcarData?.way_type || '',
                                    route: carData.route || rentcarData?.route || '',
                                    car_code: code || '',
                                    count: carData.car_count || carData.passenger_count || 1
                                }]);
                                if (carData.way_type || rentcarData?.way_type) {
                                    setSelectedCarCategory(carData.way_type || rentcarData?.way_type || '');
                                }
                                if (carData.route || rentcarData?.route) {
                                    setSelectedRoute(carData.route || rentcarData?.route || '');
                                }
                                if (carData.pickup_location) setPickupLocation(carData.pickup_location);
                                if (carData.dropoff_location) setDropoffLocation(carData.dropoff_location);
                            }
                        }
                    } else {
                        // 호환: 크루즈 reservation_id로 직접 검색
                        const { data: carData } = await supabase
                            .from('reservation_cruise_car')
                            .select('*')
                            .eq('reservation_id', reservationId)
                            .limit(1)
                            .maybeSingle();
                        if (carData) {
                            const code = carData.rentcar_price_code || carData.car_price_code;
                            const { data: rentcarData } = await supabase
                                .from('rentcar_price')
                                .select('way_type, route, vehicle_type')
                                .eq('rent_code', code)
                                .maybeSingle();
                            setVehicleForm([{
                                car_type: carData.vehicle_type || rentcarData?.vehicle_type || '',
                                car_category: carData.way_type || rentcarData?.way_type || '',
                                route: carData.route || rentcarData?.route || '',
                                car_code: code || '',
                                count: carData.car_count || carData.passenger_count || 1
                            }]);
                            if (carData.way_type || rentcarData?.way_type) setSelectedCarCategory(carData.way_type || rentcarData?.way_type || '');
                            if (carData.route || rentcarData?.route) setSelectedRoute(carData.route || rentcarData?.route || '');
                            if (carData.pickup_location) setPickupLocation(carData.pickup_location);
                            if (carData.dropoff_location) setDropoffLocation(carData.dropoff_location);
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
    }, [reservationId]);

    // ── 차량 타입 로드 ──
    useEffect(() => {
        if (selectedCarCategory && selectedRoute) {
            loadCarTypeOptions();
        } else {
            setCarTypeOptions([]);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedCarCategory, selectedRoute]);

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

    // ── 차량 예약 저장 ──
    const persistVehicle = async (): Promise<boolean> => {
        if (!user || !reservationId) {
            alert('로그인 또는 예약 정보가 없습니다.');
            return false;
        }
        if (!vehicleForm[0]?.car_type) {
            alert('차량을 선택해주세요.');
            return false;
        }
        if (hasShtSeatRequiredVehicle && !selectedShtSeat?.seat) {
            alert('스하차량은 좌석 선택이 필수입니다. 좌석도를 열어 좌석을 선택하고 "좌석 선택 완료"를 눌러주세요.');
            setIsModalReadOnly(false);
            setIsShtCarModalOpen(true);
            return false;
        }

        let carCode = vehicleForm[0].car_code;
        if (!carCode) {
            carCode = await getCarCode(vehicleForm[0].car_type, vehicleForm[0].car_category, vehicleForm[0].route || selectedRoute);
        }
        if (!carCode) {
            alert('선택한 차량의 가격 정보를 찾을 수 없습니다.');
            return false;
        }

        const { data: carPriceData } = await supabase
            .from('rentcar_price')
            .select('*')
            .eq('rent_code', carCode)
            .maybeSingle();
        if (!carPriceData) {
            alert('차량 가격 정보를 찾을 수 없습니다.');
            return false;
        }

        const carType = vehicleForm[0].car_type || '';
        const inputCount = vehicleForm[0].count || 1;
        const isSht = carType.includes('스테이하롱 셔틀 리무진');
        const isShuttle = (carType.includes('셔틀') || carType.includes('크루즈 셔틀 리무진')) && !carType.includes('스테이하롱 셔틀 리무진 단독');
        const vehicleReservationType = isSht ? 'sht' : 'car';

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

        if (isSht) {
            const customTotalPrice = (vehicleForm[0] as any).custom_price;
            const totalPrice = customTotalPrice !== undefined ? customTotalPrice : ((carPriceData.price || 0) * inputCount);
            const pickupDate = checkin ? new Date(checkin) : null;
            const pickupDateISO = pickupDate ? pickupDate.toISOString() : null;
            let dropoffDateISO: string | null = null;
            if (pickupDate) {
                const dropoffDate = new Date(pickupDate);
                dropoffDate.setDate(dropoffDate.getDate() + 1);
                dropoffDateISO = dropoffDate.toISOString();
            }
            const baseData = {
                reservation_id: vehicleReId,
                vehicle_number: selectedShtSeat?.vehicle || null,
                seat_number: selectedShtSeat?.seat || null,
                car_price_code: carPriceData?.rent_code || 'C013',
                passenger_count: inputCount,
                unit_price: Math.round(totalPrice / (inputCount || 1))
            };
            await supabase.from('reservation_car_sht').insert({
                ...baseData,
                usage_date: pickupDateISO,
                sht_category: 'Pickup',
                pickup_location: pickupLocation || null,
                dropoff_location: pierLocation,
                car_total_price: totalPrice
            });
            await supabase.from('reservation_car_sht').insert({
                ...baseData,
                usage_date: dropoffDateISO,
                sht_category: 'Drop-off',
                pickup_location: pierLocation,
                dropoff_location: dropoffLocation || null,
                car_total_price: 0
            });
            await supabase.from('reservation').update({ total_amount: totalPrice }).eq('re_id', vehicleReId);
        } else {
            const totalPrice = (carPriceData.price || 0) * inputCount;
            const carCat = vehicleForm[0]?.car_category || selectedCarCategory || '';
            let returnDatetime: string | null = null;
            if (carCat === '당일왕복') {
                returnDatetime = checkin || null;
            } else if (carCat === '다른날왕복' && checkin) {
                const rd = new Date(checkin);
                rd.setDate(rd.getDate() + (schedule === '2박3일' ? 2 : 1));
                returnDatetime = rd.toISOString().split('T')[0];
            }
            await supabase.from('reservation_cruise_car').insert({
                reservation_id: vehicleReId,
                car_price_code: carPriceData.rent_code,
                rentcar_price_code: carPriceData.rent_code,
                way_type: carPriceData.way_type || vehicleForm[0]?.car_category || null,
                route: carPriceData.route || vehicleForm[0]?.route || null,
                vehicle_type: carPriceData.vehicle_type || vehicleForm[0]?.car_type || null,
                rental_type: carPriceData.rental_type || null,
                car_count: isShuttle ? 0 : inputCount,
                passenger_count: isShuttle ? inputCount : 0,
                pickup_datetime: checkin || null,
                pickup_location: pickupLocation || null,
                dropoff_location: dropoffLocation || null,
                return_datetime: returnDatetime,
                unit_price: carPriceData.price || 0,
                car_total_price: totalPrice
            });
            await supabase.from('reservation').update({ total_amount: totalPrice }).eq('re_id', vehicleReId);
        }
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
            alert('차량 예약이 저장되었습니다!');
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

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="bg-sky-600 text-white p-6">
                <div className="container mx-auto">
                    <h1 className="text-2xl font-bold mb-2">🚗 차량 선택</h1>
                    <p className="text-sky-100">
                        {cruiseName ? `${cruiseName} · ` : ''}{schedule}{checkin ? ` · ${checkin}` : ''}
                    </p>
                </div>
            </div>

            <div className="container mx-auto px-4 py-6">
                <div className="max-w-4xl mx-auto">
                    <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-lg p-6">
                        <h2 className="text-xl font-bold text-gray-800 mb-4">📝 차량 예약</h2>

                        <div className="bg-blue-50 rounded-lg p-4 mb-4 border border-blue-200">
                            <p className="text-blue-700 text-sm">
                                크루즈 예약이 저장되었습니다. 추가로 필요한 차량을 선택해주세요. 차량이 필요 없으시면 "건너뛰기"를 누르세요.
                            </p>
                        </div>

                        <div className="space-y-4">
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
                                <h4 className="text-sm font-medium text-gray-700">차량 선택 정보</h4>
                                {vehicleForm.some(v => isShtVehicleType(v.car_type) && v.count > 0) && (
                                    isShtExclusiveCruise ? (
                                        <span className="px-3 py-1 bg-orange-100 text-orange-700 border border-orange-300 rounded text-sm font-medium">
                                            🔒 단독 예약 자동 적용
                                        </span>
                                    ) : (
                                        !isParadiseLegacyB && (
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

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">이용방식</label>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                    {getAvailableCarCategories.map(category => (
                                        <button
                                            key={category}
                                            type="button"
                                            onClick={async () => {
                                                setSelectedCarCategory(category);
                                                setSelectedRoute('');
                                                setCarTypeOptions([]);
                                                const updatedVehicleForm = vehicleForm.map(v => ({
                                                    ...v,
                                                    car_category: category,
                                                    route: '',
                                                    car_type: '',
                                                    car_code: ''
                                                }));
                                                setVehicleForm(updatedVehicleForm);
                                                await loadRouteOptions(category);
                                            }}
                                            className={`px-4 py-2 border rounded-lg transition-colors ${selectedCarCategory === category
                                                ? 'bg-blue-500 text-white border-blue-500'
                                                : 'bg-gray-50 border-gray-300 hover:bg-gray-100 text-gray-700'
                                                }`}
                                        >
                                            {category}
                                        </button>
                                    ))}
                                </div>
                            </div>

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

                                        <div>
                                            <label className="block text-sm font-medium text-gray-600 mb-1">차량타입</label>
                                            <select
                                                value={vehicle.car_type}
                                                onChange={async (e) => {
                                                    const selectedCarType = e.target.value;
                                                    const selectedWayType = vehicle.car_category || selectedCarCategory;
                                                    const normalizedCarType = shouldAutoSoloSht(selectedCarType, selectedWayType)
                                                        ? '스테이하롱 셔틀 리무진 단독'
                                                        : selectedCarType;
                                                    handleVehicleChange(vehicleIndex, 'car_type', normalizedCarType);
                                                    if (normalizedCarType && vehicle.car_category) {
                                                        const code = await getCarCode(normalizedCarType, vehicle.car_category, vehicle.route || selectedRoute);
                                                        handleVehicleChange(vehicleIndex, 'car_code', code);
                                                    }
                                                    if (
                                                        isShtVehicleType(normalizedCarType)
                                                        && !normalizedCarType.includes('단독')
                                                        && !shouldAutoSoloSht(normalizedCarType, selectedWayType)
                                                        && !isShtExclusiveCruise
                                                    ) {
                                                        setIsModalReadOnly(false);
                                                        setIsShtCarModalOpen(true);
                                                    }
                                                }}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-green-500"
                                                disabled={!vehicle.car_category || !vehicle.route}
                                            >
                                                <option value="">
                                                    {!vehicle.car_category ? '이용방식을 먼저 선택하세요' : (!vehicle.route ? '경로를 먼저 선택하세요' : '차량타입 선택')}
                                                </option>
                                                {carTypeOptions.map(carType => (
                                                    <option key={carType} value={carType}>{toVehicleDisplayType(carType)}</option>
                                                ))}
                                            </select>
                                        </div>

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

                            {vehicleForm.length < 3 && (
                                <button
                                    type="button"
                                    onClick={handleAddVehicle}
                                    className="w-full border-2 border-dashed border-green-300 rounded-lg p-4 text-green-600 hover:border-green-400 hover:text-green-700 transition-colors"
                                >
                                    + 차량 추가 (최대 3개)
                                </button>
                            )}

                            {/* 픽업/드롭오프 */}
                            <div className="space-y-4">
                                <h3 className="text-lg font-semibold text-gray-800">📍 픽업/드롭오프 장소</h3>
                                <p className="text-sm text-red-500">
                                    * 편도시 픽업 장소, 드롭오프 장소 중에 하나만 입력하세요
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                                </div>
                                {locationInputError && (
                                    <p className="text-sm text-red-500">{locationInputError}</p>
                                )}
                            </div>
                        </div>

                        <div className="flex justify-end gap-4 mt-6">
                            <button
                                type="button"
                                onClick={handleSkip}
                                className="px-6 py-3 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
                            >
                                건너뛰기
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
        </div>
    );
}

export default function CruiseVehiclePage() {
    return (
        <Suspense fallback={<div className="flex justify-center items-center h-48">로딩 중...</div>}>
            <CruiseVehicleContent />
        </Suspense>
    );
}
