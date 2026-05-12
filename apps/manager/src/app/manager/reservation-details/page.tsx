// @ts-nocheck
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import ManagerLayout from '../../../components/ManagerLayout';
import supabase from '../../../lib/supabase';
import { fetchServiceByReservationIds } from '../../../lib/fetchInBatches';
import { buildServiceMap, buildCruiseMap } from '../../../lib/serviceMaps';
import {
    openCentralReservationDetailModal,
    setCentralReservationDetailModalLoading,
    updateCentralReservationDetailModal,
} from '../../../contexts/reservationDetailModalEvents';
import {
    Calendar,
    Ship,
    Plane,
    Building,
    MapPin,
    Car,
    Search,
    Eye,
    Mail,
    FileText,
    LayoutGrid,
    Table,
} from 'lucide-react';

export default function ManagerReservationDetailsPage() {
    const [reservations, setReservations] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('pending');
    const [typeFilter, setTypeFilter] = useState('all');
    const [dateFilter, setDateFilter] = useState('3days'); // 기본값: 3일

    const [viewMode, setViewMode] = useState<'card' | 'table'>('card'); // 뷰 모드 추가

    useEffect(() => {
        loadReservationDetails();
    }, [dateFilter]); // dateFilter 변경시 다시 로딩

    // 날짜 필터에 따른 시작 날짜 계산
    const getStartDate = () => {
        const now = new Date();
        switch (dateFilter) {
            case '3days':
                const threeDaysAgo = new Date(now);
                threeDaysAgo.setDate(now.getDate() - 3);
                return threeDaysAgo.toISOString();
            case '7days':
                const sevenDaysAgo = new Date(now);
                sevenDaysAgo.setDate(now.getDate() - 7);
                return sevenDaysAgo.toISOString();
            case '15days':
                const fifteenDaysAgo = new Date(now);
                fifteenDaysAgo.setDate(now.getDate() - 15);
                return fifteenDaysAgo.toISOString();
            case 'all':
            default:
                return null; // 전체 조회
        }
    };

    // 날짜 범위 표시 텍스트
    const getDateRangeText = () => {
        switch (dateFilter) {
            case '3days':
                return '최근 3일';
            case '7days':
                return '최근 7일';
            case '15days':
                return '최근 15일';
            case 'all':
                return '전체 기간';
            default:
                return '전체 기간';
        }
    };

    const loadReservationDetails = useCallback(async () => {
        try {
            setLoading(true);

            // 날짜 필터 적용
            const startDate = getStartDate();
            let query = supabase
                .from('reservation')
                .select('*')
                .order('re_created_at', { ascending: false });

            // 날짜 필터가 있으면 적용
            if (startDate) {
                query = query.gte('re_created_at', startDate);
            }

            // 1) reservations 조회
            const { data: reservations, error: reservationsError } = await query;

            if (reservationsError) {
                console.error('reservations 조회 실패:', reservationsError);
                setReservations([]);
                setLoading(false);
                return;
            }

            console.log(`📅 [${dateFilter}] 조회된 예약 개수:`, reservations?.length || 0);

            if (!reservations || reservations.length === 0) {
                setReservations([]);
                setLoading(false);
                return;
            }

            // 2) 사용자 정보 일괄 조회 (service-tables와 동일한 방식, URL 길이 제한 해결)
            const userIds = Array.from(new Set(reservations.map((r: any) => r.re_user_id).filter(Boolean)));
            console.log('🔍 [DEBUG] userIds:', userIds.length, userIds.slice(0, 5));

            let userMap: Record<string, any> = {};
            if (userIds.length) {
                let allUsers: any[] = [];

                // URL 길이 제한을 위해 100개씩 배치로 나누어 조회
                const batchSize = 100;
                for (let i = 0; i < userIds.length; i += batchSize) {
                    const batchIds = userIds.slice(i, i + batchSize);
                    const { data: batchUsers, error: batchError } = await supabase
                        .from('users')
                        .select('id, name, email, phone_number')
                        .in('id', batchIds);

                    if (batchError) {
                        console.warn(`배치 ${i / batchSize + 1} 사용자 조회 실패:`, batchError.message);
                    } else if (batchUsers) {
                        allUsers.push(...batchUsers);
                    }
                }

                console.log('🔍 [DEBUG] users query result:', {
                    userCount: allUsers.length || 0,
                    totalUserIds: userIds.length,
                    sampleUsers: allUsers.slice(0, 3)
                });

                if (allUsers.length > 0) {
                    userMap = allUsers.reduce((acc, u) => {
                        acc[u.id] = {
                            id: u.id,
                            name: u.name || (u.email ? u.email.split('@')[0] : '사용자'),
                            email: u.email,
                            phone: u.phone_number || '',
                        };
                        return acc;
                    }, {} as Record<string, any>);

                    console.log('🔍 [DEBUG] userMap created:', {
                        userMapSize: Object.keys(userMap).length,
                        sampleUserMap: Object.values(userMap).slice(0, 3)
                    });
                }
            }

            // 3) 서비스 상세 정보 조회
            const cruiseIds = reservations.filter((r) => r.re_type === 'cruise').map((r) => r.re_id);
            const shtCarIds = reservations.filter((r) => r.re_type === 'sht').map((r) => r.re_id);
            const airportIds = reservations.filter((r) => r.re_type === 'airport').map((r) => r.re_id);
            const hotelIds = reservations.filter((r) => r.re_type === 'hotel').map((r) => r.re_id);
            const tourIds = reservations.filter((r) => r.re_type === 'tour').map((r) => r.re_id);
            const rentcarIds = reservations.filter((r) => r.re_type === 'rentcar').map((r) => r.re_id);
            const carIds = reservations.filter((r) => r.re_type === 'car').map((r) => r.re_id);

            // 크루즈 데이터 배치 조회 (URL 길이 제한 해결 - 배치 크기 50으로 축소)
            let allCruiseData: any[] = [];
            let allCruiseCarData: any[] = [];
            if (cruiseIds.length > 0) {
                const batchSize = 50; // URL 길이 제한으로 인해 50개씩 처리
                console.log(`🔄 [배치 처리] 총 ${cruiseIds.length}개를 ${Math.ceil(cruiseIds.length / batchSize)}개 배치로 조회`);

                for (let i = 0; i < cruiseIds.length; i += batchSize) {
                    const batchIds = cruiseIds.slice(i, i + batchSize);
                    console.log(`📦 [배치 ${Math.floor(i / batchSize) + 1}] ${batchIds.length}개 조회 중...`);

                    try {
                        const [cruiseBatch, cruiseCarBatch] = await Promise.all([
                            supabase.from('reservation_cruise').select('*').in('reservation_id', batchIds),
                            supabase.from('reservation_cruise_car').select('*').in('reservation_id', batchIds)
                        ]);

                        if (cruiseBatch.error) {
                            console.error(`❌ 크루즈 배치 ${Math.floor(i / batchSize) + 1} 에러:`, cruiseBatch.error);
                        } else if (cruiseBatch.data) {
                            console.log(`✅ 크루즈 배치 ${Math.floor(i / batchSize) + 1}: ${cruiseBatch.data.length}개 조회 성공`);
                            allCruiseData.push(...cruiseBatch.data);
                        }

                        if (cruiseCarBatch.error) {
                            console.error(`❌ 차량 배치 ${Math.floor(i / batchSize) + 1} 에러:`, cruiseCarBatch.error);
                        } else if (cruiseCarBatch.data) {
                            allCruiseCarData.push(...cruiseCarBatch.data);
                        }
                    } catch (error) {
                        console.error(`❌ 배치 ${Math.floor(i / batchSize) + 1} 처리 중 예외 발생:`, error);
                    }
                }

                console.log(`✅ [배치 완료] 크루즈: ${allCruiseData.length}개, 차량: ${allCruiseCarData.length}개`);
            }

            const cruiseRes = { data: allCruiseData, error: null };
            const cruiseCarRes = { data: allCruiseCarData, error: null };

            // 서비스별 데이터 조회 (price 테이블 조인 포함)
            const [shtCarRes, airportRes, hotelRes, tourRes, rentcarRes, carRes] = await Promise.all([
                // FK 중첩 조인 금지: reservation_car_sht -> car_price_code 관계가 스키마 캐시에 없을 수 있어 단순 조회 사용
                shtCarIds.length ? fetchServiceByReservationIds('reservation_car_sht', shtCarIds, '*', 80) : Promise.resolve([]),
                airportIds.length ? fetchServiceByReservationIds('reservation_airport', airportIds, '*, airport_price:airport_price_code(airport_car_type)', 80) : Promise.resolve([]),
                hotelIds.length ? fetchServiceByReservationIds('reservation_hotel', hotelIds, '*, hotel_price:hotel_price_code(hotel_name, room_name)', 80) : Promise.resolve([]),
                tourIds.length ? fetchServiceByReservationIds('reservation_tour', tourIds, '*, tour_pricing:tour_price_code(vehicle_type, tour:tour_id(tour_name))', 80) : Promise.resolve([]),
                // FK 중첩 조인 금지: reservation_rentcar -> rentcar_price_code 관계가 스키마 캐시에 없을 수 있어 단순 조회 사용
                rentcarIds.length ? fetchServiceByReservationIds('reservation_rentcar', rentcarIds, '*', 80) : Promise.resolve([]),
                // FK 중첩 조인 금지: reservation_car_sht -> car_price_code 관계가 스키마 캐시에 없을 수 있어 단순 조회 사용
                carIds.length ? fetchServiceByReservationIds('reservation_car_sht', carIds, '*', 80) : Promise.resolve([]),
            ]);

            // 서비스별 맵 생성
            const cruiseMap = buildCruiseMap(cruiseRes.data || []);
            const cruiseCarMap = buildServiceMap(cruiseCarRes.data || cruiseCarRes || []);
            const shtCarMap = buildServiceMap(shtCarRes.data || shtCarRes || []);
            const airportMap = buildServiceMap(airportRes.data || airportRes || []);
            const hotelMap = buildServiceMap(hotelRes.data || hotelRes || []);
            const tourMap = buildServiceMap(tourRes.data || tourRes || []);
            const rentcarMap = buildServiceMap(rentcarRes.data || rentcarRes || []);
            const carMap = buildServiceMap(carRes.data || carRes || []);

            // 🔍 크루즈 데이터 디버그
            console.log('🚢 [DEBUG] 크루즈 데이터 요약:', {
                cruiseCount: (cruiseRes.data || []).length,
                sample: (cruiseRes.data || []).slice(0, 2)
            });

            // 4) 데이터 병합
            const detailedReservations = reservations.map((reservation, index) => {
                let serviceDetails: any = null;
                let cruiseCarDetails: any = null;

                switch (reservation.re_type) {
                    case 'cruise':
                        serviceDetails = cruiseMap.get(reservation.re_id) || null;
                        cruiseCarDetails = cruiseCarMap.get(reservation.re_id) || null;
                        break;
                    case 'sht':
                        serviceDetails = shtCarMap.get(reservation.re_id) || null;
                        break;
                    case 'airport':
                        serviceDetails = airportMap.get(reservation.re_id) || null;
                        break;
                    case 'hotel':
                        serviceDetails = hotelMap.get(reservation.re_id) || null;
                        break;
                    case 'tour':
                        serviceDetails = tourMap.get(reservation.re_id) || null;
                        break;
                    case 'rentcar':
                        serviceDetails = rentcarMap.get(reservation.re_id) || null;
                        break;
                    case 'car':
                        serviceDetails = carMap.get(reservation.re_id) || null;
                        break;
                }

                // service-tables와 동일한 방식으로 사용자 정보 연결
                const user = userMap[reservation.re_user_id];

                // 첫 3개 예약에 대해서만 디버그 로그
                if (index < 3) {
                    console.log('🔍 [DEBUG] reservation mapping:', {
                        reservationId: reservation.re_id.slice(0, 8),
                        reType: reservation.re_type,
                        userId: reservation.re_user_id,
                        userFound: !!user,
                        userName: user?.name,
                        userEmail: user?.email,
                        serviceDetails: serviceDetails,
                        hasServiceDetails: !!serviceDetails,
                        cruiseName: serviceDetails?.cruise_name,
                        roomType: serviceDetails?.room_type,
                        roomGrade: serviceDetails?.room_grade,
                        guestCount: serviceDetails?.guest_count
                    });
                }

                return {
                    ...reservation,
                    users: user || undefined,
                    service_details: serviceDetails,
                    cruise_car_details: cruiseCarDetails,
                };
            });

            // 크루즈 차량을 별도 카드로 생성
            const expandedReservations: any[] = [];
            let cruiseCarCount = 0;

            detailedReservations.forEach(reservation => {
                // 기본 예약 추가
                expandedReservations.push(reservation);

                // 크루즈 예약에 차량 데이터가 있으면 별도 카드로 추가
                if (reservation.re_type === 'cruise' && reservation.cruise_car_details) {
                    cruiseCarCount++;
                    console.log(`🚗 [DEBUG] 크루즈 차량 카드 생성:`, {
                        reservationId: reservation.re_id.slice(0, 8),
                        carDetails: !!reservation.cruise_car_details,
                        carData: reservation.cruise_car_details
                    });

                    expandedReservations.push({
                        ...reservation,
                        re_type: 'cruise_car',
                        service_details: reservation.cruise_car_details,
                        cruise_car_details: undefined, // 중복 방지
                        is_cruise_car_item: true // 구분용 플래그
                    });
                }
            });

            console.log(`📊 [DEBUG] 예약 데이터 확장 완료:`, {
                originalCount: detailedReservations.length,
                expandedCount: expandedReservations.length,
                cruiseCarCount: cruiseCarCount
            });

            setReservations(expandedReservations);
        } catch (error) {
            console.error('예약 상세 정보 로딩 실패:', error);
            setReservations([]);
        } finally {
            setLoading(false);
        }
    }, [dateFilter]); // dateFilter 의존성 추가

    const getServiceIcon = (type: string) => {
        switch (type) {
            case 'cruise':
                return <Ship className="w-5 h-5 text-blue-600" />;
            case 'cruise_car':
                return <Car className="w-5 h-5 text-cyan-600" />;
            case 'sht':
                return <Car className="w-5 h-5 text-cyan-600" />;
            case 'airport':
                return <Plane className="w-5 h-5 text-green-600" />;
            case 'hotel':
                return <Building className="w-5 h-5 text-purple-600" />;
            case 'tour':
                return <MapPin className="w-5 h-5 text-orange-600" />;
            case 'rentcar':
                return <Car className="w-5 h-5 text-red-600" />;
            case 'car':
                return <Car className="w-5 h-5 text-amber-600" />;
            default:
                return <FileText className="w-5 h-5 text-gray-600" />;
        }
    };

    const getServiceName = (type: string) => {
        switch (type) {
            case 'cruise':
                return '크루즈';
            case 'cruise_car':
                return '크루즈 차량';
            case 'sht':
                return '스하차량';
            case 'airport':
                return '공항 픽업/드롭';
            case 'hotel':
                return '호텔';
            case 'tour':
                return '투어';
            case 'rentcar':
                return '렌터카';
            case 'car':
                return '크루즈 차량';
            case 'package':
                return '패키지';
            default:
                return '패키지';
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'pending':
                return 'bg-yellow-100 text-yellow-800';
            case 'confirmed':
                return 'bg-green-100 text-green-800';
            case 'cancelled':
                return 'bg-red-100 text-red-800';
            case 'completed':
                return 'bg-blue-100 text-blue-800';
            default:
                return 'bg-gray-100 text-gray-800';
        }
    };

    const getStatusText = (status: string) => {
        switch (status) {
            case 'pending':
                return '대기';
            case 'confirmed':
                return '확정';
            case 'cancelled':
                return '취소';
            case 'completed':
                return '완료';
            default:
                return status;
        }
    };

    // 날짜별 그룹화 (생성일 기준)
    const getReservationDate = (reservation: any) => {
        return new Date(reservation.re_created_at);
    };

    const groupByReservationDate = (items: any[]) => {
        const groups: Record<string, any[]> = {};
        items.forEach(item => {
            const date = getReservationDate(item).toISOString().slice(0, 10);
            if (!groups[date]) groups[date] = [];
            groups[date].push(item);
        });

        const sortedKeys = Object.keys(groups).sort((a, b) => b.localeCompare(a)); // 최신 순
        return sortedKeys.map(key => ({
            date: key,
            items: groups[key]
        }));
    };

    const handleViewDetails = (reservation: any) => {
        // users.id가 있으면 DB 예약 상세보기, 없으면 기존 모달
        if (reservation.users?.id) {
            loadAllUserReservations(reservation.users.id);
        }
    };

    // 사용자 ID로 모든 DB 예약 조회
    const loadAllUserReservations = async (userId: string) => {
        if (!userId) return;

        try {
            openCentralReservationDetailModal({ userInfo: null, allUserServices: [], loading: true });

            // 1. 사용자 정보 조회
            const { data: userData, error: userError } = await supabase
                .from('users')
                .select('*')
                .eq('id', userId)
                .single();

            if (userError) throw userError;
            updateCentralReservationDetailModal({ userInfo: userData });

            // 2. 사용자의 모든 예약 ID 조회
            const { data: reservations, error: resError } = await supabase
                .from('reservation')
                .select('re_id, re_type, re_status, re_created_at, total_amount, price_breakdown, re_adult_count, re_child_count, re_infant_count, package_id')
                .eq('re_user_id', userId)
                .order('re_created_at', { ascending: false });

            if (resError) throw resError;

            const reservationIds = reservations.map(r => r.re_id);

            if (reservationIds.length === 0) {
                updateCentralReservationDetailModal({ allUserServices: [], loading: false });
                return;
            }

            // 3. 각 서비스 테이블에서 상세 정보 조회
            const [cruiseRes, airportRes, hotelRes, rentcarRes, tourRes, cruiseCarRes, carShtRes] = await Promise.all([
                fetchServiceByReservationIds('reservation_cruise', reservationIds, '*', 80),
                fetchServiceByReservationIds('reservation_airport', reservationIds, '*', 80),
                fetchServiceByReservationIds('reservation_hotel', reservationIds, '*', 80),
                fetchServiceByReservationIds('reservation_rentcar', reservationIds, '*', 80),
                fetchServiceByReservationIds('reservation_tour', reservationIds, '*', 80),
                fetchServiceByReservationIds('reservation_cruise_car', reservationIds, '*', 80),
                fetchServiceByReservationIds('reservation_car_sht', reservationIds, '*', 80)
            ]);

            // 4. 추가 정보 조회 (가격/상품명 등)
            const cruiseCodes = (cruiseRes.data || cruiseRes || []).map((r: any) => r.room_price_code).filter(Boolean);
            const tourCodes = (tourRes.data || tourRes || []).map((r: any) => r.tour_price_code).filter(Boolean);
            const hotelCodes = (hotelRes.data || hotelRes || []).map((r: any) => r.hotel_price_code).filter(Boolean);
            const rentCodes = (rentcarRes.data || rentcarRes || []).map((r: any) => r.rentcar_price_code).filter(Boolean);

            const [roomPrices, tourPrices, hotelPrices, rentPrices] = await Promise.all([
                cruiseCodes.length > 0 ? supabase.from('cruise_rate_card').select('id, cruise_name, room_type').in('id', cruiseCodes) : Promise.resolve({ data: [] }),
                tourCodes.length > 0 ? supabase.from('tour_pricing').select('pricing_id, price_per_person, tour:tour_id(tour_name, tour_code)').in('pricing_id', tourCodes) : Promise.resolve({ data: [] }),
                hotelCodes.length > 0 ? supabase.from('hotel_price').select('hotel_price_code, base_price, hotel_name, room_name').in('hotel_price_code', hotelCodes) : Promise.resolve({ data: [] }),
                rentCodes.length > 0 ? supabase.from('rentcar_price').select('rent_code, vehicle_type, price').in('rent_code', rentCodes) : Promise.resolve({ data: [] })
            ]);

            const roomPriceMap = new Map((roomPrices.data || []).map((r: any) => [r.id, r]));
            const tourPriceMap = new Map((tourPrices.data || []).map((r: any) => [r.pricing_id, r]));
            const hotelPriceMap = new Map((hotelPrices.data || []).map((r: any) => [r.hotel_price_code, r]));
            const rentPriceMap = new Map((rentPrices.data || []).map((r: any) => [r.rent_code, r]));

            // 5. 데이터 매핑
            const reservationMap = new Map(reservations.map((r: any) => [r.re_id, r]));

            const allServices = [
                ...reservations.filter((r: any) => r.re_type === 'package').map((r: any) => ({
                    ...r,
                    serviceType: 'package',
                    reservation_id: r.re_id,
                    status: r.re_status,
                    totalPrice: r.total_amount,
                    adult: r.re_adult_count || 0,
                    child: r.re_child_count || 0,
                    infant: r.re_infant_count || 0,
                })),
                ...(cruiseRes.data || cruiseRes || []).map((r: any) => {
                    const info = roomPriceMap.get(r.room_price_code);
                    return {
                        ...r,
                        serviceType: 'cruise',
                        status: reservationMap.get(r.reservation_id)?.re_status,
                        cruise: info?.cruise_name || '크루즈',
                        roomType: info?.room_type || r.room_price_code,
                        checkin: r.checkin,
                        adult: r.guest_count,
                        child: r.child_count || 0,
                        note: r.request_note,
                        unitPrice: r.unit_price,
                        totalPrice: r.room_total_price,
                        paymentMethod: '정보 없음'
                    };
                }),
                ...(cruiseCarRes.data || cruiseCarRes || []).map((r: any) => ({
                    ...r,
                    serviceType: 'vehicle',
                    status: reservationMap.get(r.reservation_id)?.re_status,
                    pickupDatetime: r.pickup_datetime,
                    pickupLocation: r.pickup_location,
                    dropoffLocation: r.dropoff_location,
                    passengerCount: r.passenger_count,
                    note: r.request_note,
                    unitPrice: r.unit_price,
                    totalPrice: r.car_total_price
                })),
                ...(airportRes.data || airportRes || []).map((r: any) => ({
                    ...r,
                    serviceType: 'airport',
                    status: reservationMap.get(r.reservation_id)?.re_status,
                    date: r.ra_datetime ? new Date(r.ra_datetime).toLocaleDateString() : '',
                    time: r.ra_datetime ? new Date(r.ra_datetime).toLocaleTimeString() : '',
                    airportName: r.ra_airport_location,
                    destination: r.ra_stopover_location,
                    flightNumber: r.ra_flight_number,
                    passengerCount: r.ra_passenger_count,
                    carCount: r.ra_car_count,
                    note: r.request_note,
                    unitPrice: r.unit_price,
                    totalPrice: r.total_price
                })),
                ...(hotelRes.data || hotelRes || []).map((r: any) => {
                    const info = hotelPriceMap.get(r.hotel_price_code);
                    return {
                        ...r,
                        serviceType: 'hotel',
                        status: reservationMap.get(r.reservation_id)?.re_status,
                        hotelName: info?.hotel_info?.hotel_name || r.hotel_category,
                        roomType: info?.room_type?.room_name || r.hotel_price_code,
                        checkinDate: r.checkin_date,
                        nights: r.room_count,
                        guestCount: r.guest_count,
                        note: r.request_note,
                        unitPrice: info?.base_price || r.unit_price,
                        totalPrice: r.total_price
                    };
                }),
                ...(tourRes.data || tourRes || []).map((r: any) => {
                    const info = tourPriceMap.get(r.tour_price_code);
                    return {
                        ...r,
                        serviceType: 'tour',
                        status: reservationMap.get(r.reservation_id)?.re_status,
                        tourName: info?.tour?.tour_name || r.tour_price_code,
                        tourDate: r.usage_date,
                        tourCapacity: r.tour_capacity,
                        pickupLocation: r.pickup_location,
                        dropoffLocation: r.dropoff_location,
                        carCount: r.car_count,
                        passengerCount: r.passenger_count,
                        note: r.request_note,
                        unitPrice: info?.price_per_person || r.unit_price,
                        totalPrice: r.total_price
                    };
                }),
                ...(rentcarRes.data || rentcarRes || []).map((r: any) => {
                    const info = rentPriceMap.get(r.rentcar_price_code);
                    return {
                        ...r,
                        serviceType: 'rentcar',
                        status: reservationMap.get(r.reservation_id)?.re_status,
                        carType: info?.vehicle_type || r.rentcar_price_code,
                        pickupDatetime: r.pickup_datetime,
                        pickupLocation: r.pickup_location,
                        destination: r.destination,
                        requestNote: r.request_note,
                        note: r.request_note,
                        unitPrice: info?.price || r.unit_price,
                        totalPrice: r.total_price
                    };
                }),
                ...(carShtRes.data || carShtRes || []).map((r: any) => ({
                    ...r,
                    serviceType: 'sht',
                    status: reservationMap.get(r.reservation_id)?.re_status,
                    category: r.sht_category,
                    usageDate: r.pickup_datetime,
                    vehicleNumber: r.vehicle_number,
                    seatNumber: r.seat_number,
                    driverName: r.driver_name,
                    pickupLocation: r.pickup_location,
                    dropoffLocation: r.dropoff_location,
                    note: r.request_note,
                    unitPrice: r.unit_price,
                    totalPrice: r.car_total_price
                }))
            ];

            updateCentralReservationDetailModal({ userInfo: userData, allUserServices: allServices });

        } catch (error) {
            console.error('사용자 예약 정보 조회 실패:', error);
            updateCentralReservationDetailModal({ allUserServices: [] });
        } finally {
            setCentralReservationDetailModalLoading(false);
        }
    };

    // 필터링된 예약 목록
    const filteredReservations = reservations.filter(reservation => {
        // 상태 필터
        if (statusFilter !== 'all' && reservation.re_status !== statusFilter) {
            return false;
        }

        // 타입 필터 (디버그 로그 추가)
        if (typeFilter !== 'all' && reservation.re_type !== typeFilter) {
            if (typeFilter === 'cruise_car' && reservation.re_type === 'cruise_car') {
                console.log(`🔍 [FILTER DEBUG] cruise_car 매칭:`, {
                    typeFilter,
                    reservationType: reservation.re_type,
                    reservationId: reservation.re_id.slice(0, 8)
                });
            }
            return false;
        }

        // 검색어 필터
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            const userName = reservation.users?.name?.toLowerCase() || '';
            const userEmail = reservation.users?.email?.toLowerCase() || '';
            const reservationId = reservation.re_id.toLowerCase();

            if (!userName.includes(query) && !userEmail.includes(query) && !reservationId.includes(query)) {
                return false;
            }
        }

        return true;
    });

    // 타입별 개수 디버그 로그
    React.useEffect(() => {
        const typeCounts = reservations.reduce((acc, r) => {
            acc[r.re_type] = (acc[r.re_type] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        console.log(`📊 [DEBUG] 전체 예약 타입별 개수:`, typeCounts);
        console.log(`🔍 [DEBUG] 현재 필터: 상태=${statusFilter}, 타입=${typeFilter}`);
        console.log(`📋 [DEBUG] 필터링 결과: ${filteredReservations.length}건`);
    }, [reservations, statusFilter, typeFilter, filteredReservations.length]);

    if (loading) {
        return (
            <ManagerLayout title="예약 상세 정보" activeTab="reservation-details">
                <div className="flex items-center justify-center h-64">
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                        <p className="text-gray-600">예약 정보를 불러오는 중...</p>
                    </div>
                </div>
            </ManagerLayout>
        );
    }

    return (
        <ManagerLayout title="예약 상세 정보" activeTab="reservation-details">
            <div className="space-y-6">
                {/* 현재 필터 상태 및 통계 */}
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2">
                        <div>
                            <h2 className="text-lg font-semibold text-gray-800">
                                {getDateRangeText()} 예약 현황
                            </h2>
                            <p className="text-sm text-gray-600">
                                총 {reservations.length}건의 예약 • 필터링 결과 {filteredReservations.length}건
                            </p>
                        </div>
                        <div className="text-sm text-gray-500">
                            마지막 업데이트: {new Date().toLocaleTimeString('ko-KR')}
                        </div>
                    </div>
                </div>

                {/* 검색 및 필터 */}
                <div className="bg-white rounded-lg shadow-md p-6">
                    <div className="flex flex-col md:flex-row gap-4">
                        {/* 검색 */}
                        <div className="flex-1">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                                <input
                                    type="text"
                                    placeholder="고객명, 이메일, 예약ID로 검색..."
                                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </div>
                        </div>

                        {/* 날짜 필터 */}
                        <div className="flex flex-wrap gap-2">
                            <span className="text-sm font-medium text-gray-700 px-2 py-1">조회 기간:</span>
                            {[
                                { value: '3days', label: '3일', color: 'bg-blue-50 text-blue-700 border-blue-200', active: 'bg-blue-500 text-white border-blue-700' },
                                { value: '7days', label: '7일', color: 'bg-green-50 text-green-700 border-green-200', active: 'bg-green-500 text-white border-green-700' },
                                { value: '15days', label: '15일', color: 'bg-purple-50 text-purple-700 border-purple-200', active: 'bg-purple-500 text-white border-purple-700' },
                                { value: 'all', label: '전체', color: 'bg-gray-100 text-gray-700 border-gray-300', active: 'bg-gray-500 text-white border-gray-700' },
                            ].map((item) => (
                                <button
                                    key={item.value}
                                    type="button"
                                    className={`px-3 py-1 rounded text-xs font-semibold border transition-all duration-150 whitespace-nowrap text-center min-w-[50px]
                                        ${dateFilter === item.value ? item.active : item.color}
                                    `}
                                    onClick={() => setDateFilter(item.value)}
                                >
                                    {item.label}
                                </button>
                            ))}
                        </div>

                        {/* 상태 필터 */}
                        <div className="flex flex-wrap gap-2">
                            <span className="text-sm font-medium text-gray-700 px-2 py-1">상태:</span>
                            {[
                                { value: 'all', label: '전체', color: 'bg-gray-100 text-gray-700 border-gray-300', active: 'bg-gray-500 text-white border-gray-700' },
                                { value: 'pending', label: '대기', color: 'bg-yellow-50 text-yellow-700 border-yellow-200', active: 'bg-yellow-500 text-white border-yellow-700' },
                                { value: 'confirmed', label: '확정', color: 'bg-green-50 text-green-700 border-green-200', active: 'bg-green-500 text-white border-green-700' },
                                { value: 'cancelled', label: '취소', color: 'bg-red-50 text-red-700 border-red-200', active: 'bg-red-500 text-white border-red-700' },
                                { value: 'completed', label: '완료', color: 'bg-blue-50 text-blue-700 border-blue-200', active: 'bg-blue-500 text-white border-blue-700' },
                            ].map((item) => (
                                <button
                                    key={item.value}
                                    type="button"
                                    className={`px-3 py-1 rounded text-xs font-semibold border transition-all duration-150 whitespace-nowrap text-center min-w-[60px]
                                        ${statusFilter === item.value ? item.active : item.color}
                                    `}
                                    onClick={() => setStatusFilter(item.value)}
                                >
                                    {item.label}
                                </button>
                            ))}
                        </div>

                        {/* 타입 필터 */}
                        <div className="flex flex-wrap gap-2">
                            <span className="text-sm font-medium text-gray-700 px-2 py-1">서비스:</span>
                            {[
                                { value: 'all', label: '전체', color: 'bg-gray-100 text-gray-700 border-gray-300', active: 'bg-gray-500 text-white border-gray-700' },
                                { value: 'cruise', label: '크루즈', color: 'bg-blue-50 text-blue-700 border-blue-200', active: 'bg-blue-500 text-white border-blue-700' },
                                { value: 'cruise_car', label: '크루즈 차량', color: 'bg-cyan-50 text-cyan-700 border-cyan-200', active: 'bg-cyan-500 text-white border-cyan-700' },
                                { value: 'sht', label: '스하차량', color: 'bg-cyan-50 text-cyan-700 border-cyan-200', active: 'bg-cyan-500 text-white border-cyan-700' },
                                { value: 'airport', label: '공항', color: 'bg-green-50 text-green-700 border-green-200', active: 'bg-green-500 text-white border-green-700' },
                                { value: 'hotel', label: '호텔', color: 'bg-purple-50 text-purple-700 border-purple-200', active: 'bg-purple-500 text-white border-purple-700' },
                                { value: 'tour', label: '투어', color: 'bg-orange-50 text-orange-700 border-orange-200', active: 'bg-orange-500 text-white border-orange-700' },
                                { value: 'rentcar', label: '렌터카', color: 'bg-red-50 text-red-700 border-red-200', active: 'bg-red-500 text-white border-red-700' },
                                { value: 'package', label: '패키지', color: 'bg-indigo-50 text-indigo-700 border-indigo-200', active: 'bg-indigo-500 text-white border-indigo-700' },
                            ].map((item) => (
                                <button
                                    key={item.value}
                                    type="button"
                                    className={`px-3 py-1 rounded text-xs font-semibold border transition-all duration-150 whitespace-nowrap text-center min-w-[60px]
                                        ${typeFilter === item.value ? item.active : item.color}
                                    `}
                                    onClick={() => setTypeFilter(item.value)}
                                >
                                    {item.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* 예약 목록 */}
                <div className="bg-white rounded-lg shadow-md">
                    <div className="p-6 border-b">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-semibold flex items-center gap-2">
                                <FileText className="w-6 h-6 text-blue-600" />
                                예약 목록 ({filteredReservations.length}건)
                            </h3>

                            {/* 뷰 모드 토글 */}
                            <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
                                <button
                                    onClick={() => setViewMode('card')}
                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${viewMode === 'card'
                                        ? 'bg-white text-blue-600 shadow-sm'
                                        : 'text-gray-600 hover:text-gray-900'
                                        }`}
                                >
                                    <LayoutGrid className="w-4 h-4" />
                                    카드
                                </button>
                                <button
                                    onClick={() => setViewMode('table')}
                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${viewMode === 'table'
                                        ? 'bg-white text-blue-600 shadow-sm'
                                        : 'text-gray-600 hover:text-gray-900'
                                        }`}
                                >
                                    <Table className="w-4 h-4" />
                                    테이블
                                </button>
                            </div>
                        </div>
                    </div>

                    {filteredReservations.length === 0 ? (
                        <div className="p-8 text-center">
                            <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-lg font-medium text-gray-600 mb-2">예약 정보가 없습니다</h3>
                            <p className="text-gray-500">검색 조건을 변경해보세요.</p>
                        </div>
                    ) : viewMode === 'table' ? (
                        /* 테이블 뷰 - 날짜별 그룹화 */
                        (() => {
                            const groups = groupByReservationDate(filteredReservations);
                            return (
                                <div className="space-y-6">
                                    {groups.map((g: any) => (
                                        <div key={g.date}>
                                            {/* 날짜 헤더 */}
                                            <div className="bg-blue-50 px-4 py-2 rounded-t-lg flex items-center gap-4">
                                                <Calendar className="w-4 h-4 text-blue-600" />
                                                <span className="font-semibold text-blue-900">{new Date(g.date).toLocaleDateString('ko-KR')}</span>
                                                <span className="ml-2 text-xs text-gray-500">총 {g.items.length}건</span>
                                            </div>

                                            {/* 테이블 */}
                                            <div className="overflow-x-auto">
                                                <table className="w-full">
                                                    <thead className="bg-gray-50 border-b">
                                                        <tr>
                                                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                                                서비스
                                                            </th>
                                                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                                                상태
                                                            </th>
                                                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                                                고객명
                                                            </th>
                                                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                                                크루즈명
                                                            </th>
                                                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                                                객실타입
                                                            </th>
                                                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                                                객실등급
                                                            </th>
                                                            <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                                                인원
                                                            </th>
                                                            <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                                                작업
                                                            </th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="bg-white divide-y divide-gray-200">
                                                        {g.items.map((reservation: any) => (
                                                            <tr key={reservation.re_id} className="hover:bg-gray-50 transition-colors">
                                                                <td className="px-4 py-3 whitespace-nowrap">
                                                                    <div className="flex items-center gap-2">
                                                                        {getServiceIcon(reservation.re_type)}
                                                                        <span className="text-sm font-medium text-gray-900">
                                                                            {getServiceName(reservation.re_type)}
                                                                        </span>
                                                                        {reservation.re_type === 'package' && (
                                                                            <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-700 text-xs rounded font-medium">📦</span>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                                <td className="px-4 py-3 whitespace-nowrap">
                                                                    <span
                                                                        className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(
                                                                            reservation.re_status
                                                                        )}`}
                                                                    >
                                                                        {getStatusText(reservation.re_status)}
                                                                    </span>
                                                                </td>
                                                                <td className="px-4 py-3 whitespace-nowrap">
                                                                    <div className="text-sm font-medium text-gray-900">
                                                                        {reservation.users?.name || '이름 없음'}
                                                                    </div>
                                                                </td>
                                                                {/* 크루즈 전용 컬럼들 */}
                                                                {reservation.re_type === 'cruise' && reservation.service_details ? (
                                                                    <>
                                                                        <td className="px-4 py-3">
                                                                            <div className="text-sm text-gray-900 font-medium">
                                                                                {reservation.service_details.cruise_name || '-'}
                                                                            </div>
                                                                        </td>
                                                                        <td className="px-4 py-3">
                                                                            <div className="text-sm text-gray-900">
                                                                                {reservation.service_details.room_type || '-'}
                                                                            </div>
                                                                        </td>
                                                                        <td className="px-4 py-3">
                                                                            <div className="text-sm text-gray-900">
                                                                                {reservation.service_details.room_grade || '-'}
                                                                            </div>
                                                                        </td>
                                                                        <td className="px-4 py-3 text-center">
                                                                            <div className="text-sm font-semibold text-gray-900">
                                                                                {reservation.service_details.guest_count ? `${reservation.service_details.guest_count}명` : '-'}
                                                                            </div>
                                                                        </td>
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <td className="px-4 py-3">
                                                                            <div className="text-sm text-gray-400">-</div>
                                                                        </td>
                                                                        <td className="px-4 py-3">
                                                                            <div className="text-sm text-gray-400">-</div>
                                                                        </td>
                                                                        <td className="px-4 py-3">
                                                                            <div className="text-sm text-gray-400">-</div>
                                                                        </td>
                                                                        <td className="px-4 py-3 text-center">
                                                                            <div className="text-sm text-gray-400">-</div>
                                                                        </td>
                                                                    </>
                                                                )}
                                                                <td className="px-4 py-3 text-center whitespace-nowrap">
                                                                    <button
                                                                        type="button"
                                                                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"
                                                                        onClick={() => handleViewDetails(reservation)}
                                                                    >
                                                                        <Eye className="w-3.5 h-3.5" />
                                                                        상세
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            );
                        })()
                    ) : (
                        /* 카드 뷰 (기존) */
                        (() => {
                            const groups = groupByReservationDate(filteredReservations);
                            return (
                                <div className="space-y-6 p-6">
                                    {groups.map((g: any) => (
                                        <div key={g.date}>
                                            <div className="bg-blue-50 px-4 py-2 rounded-t-lg flex items-center gap-4">
                                                <Calendar className="w-4 h-4 text-blue-600" />
                                                <span className="font-semibold text-blue-900">{new Date(g.date).toLocaleDateString('ko-KR')}</span>
                                                <span className="ml-2 text-xs text-gray-500">총 {g.items.length}건</span>
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mt-4">
                                                {g.items.map((reservation: any) => (
                                                    <div key={reservation.re_id} className="border rounded-lg p-4 bg-white hover:shadow-md transition-all">
                                                        <div className="flex items-start justify-between">
                                                            <div className="flex items-start gap-3 flex-1">
                                                                {getServiceIcon(reservation.re_type)}
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="flex items-center gap-2 mb-2">
                                                                        <h4 className="font-semibold text-sm">
                                                                            {getServiceName(reservation.re_type)}
                                                                        </h4>
                                                                        {reservation.re_type === 'package' && (
                                                                            <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-700 text-xs rounded font-medium">📦 패키지</span>
                                                                        )}
                                                                        <span
                                                                            className={`px-2 py-1 rounded-full text-xs ${getStatusColor(
                                                                                reservation.re_status,
                                                                            )}`}
                                                                        >
                                                                            {getStatusText(reservation.re_status)}
                                                                        </span>
                                                                    </div>

                                                                    <div className="space-y-1 text-xs text-gray-600">
                                                                        <div className="flex items-center gap-1">
                                                                            <span className="font-medium">고객:</span>
                                                                            <span className="text-sm font-semibold text-gray-800">
                                                                                {reservation.users?.name || '이름 없음'}
                                                                            </span>
                                                                        </div>

                                                                        {/* 서비스별 상세 정보 - 강조 박스 */}
                                                                        {reservation.service_details && (
                                                                            <div className="bg-blue-50 border border-blue-200 rounded p-2 mt-2 space-y-1">
                                                                                {/* 크루즈 */}
                                                                                {reservation.re_type === 'cruise' && (
                                                                                    <>
                                                                                        {reservation.service_details.cruise_name && (
                                                                                            <div className="flex items-center gap-1">
                                                                                                <span className="font-semibold text-blue-700">🚢 크루즈:</span>
                                                                                                <span className="text-blue-900 font-medium">{reservation.service_details.cruise_name}</span>
                                                                                            </div>
                                                                                        )}
                                                                                        {reservation.service_details.room_type && (
                                                                                            <div className="flex items-center gap-1">
                                                                                                <span className="font-medium text-blue-700">🛏️ 객실:</span>
                                                                                                <span className="text-blue-900">{reservation.service_details.room_type}</span>
                                                                                            </div>
                                                                                        )}
                                                                                        {reservation.service_details.room_grade && (
                                                                                            <div className="flex items-center gap-1">
                                                                                                <span className="font-medium text-blue-700">📋 구분:</span>
                                                                                                <span className="text-blue-900">{reservation.service_details.room_grade}</span>
                                                                                            </div>
                                                                                        )}
                                                                                        {reservation.service_details.guest_count && (
                                                                                            <div className="flex items-center gap-1">
                                                                                                <span className="font-medium text-blue-700">👥 인원:</span>
                                                                                                <span className="text-blue-900 font-semibold">{reservation.service_details.guest_count}명</span>
                                                                                            </div>
                                                                                        )}
                                                                                    </>
                                                                                )}

                                                                                {/* 공항 */}
                                                                                {reservation.re_type === 'airport' && (
                                                                                    <>
                                                                                        {reservation.service_details.ra_airport_location && (
                                                                                            <div className="flex items-center gap-1">
                                                                                                <span className="font-semibold text-blue-700">✈️ 장소:</span>
                                                                                                <span className="text-blue-900 font-medium">{reservation.service_details.ra_airport_location}</span>
                                                                                            </div>
                                                                                        )}
                                                                                        {reservation.service_details.airport_price?.airport_car_type && (
                                                                                            <div className="flex items-center gap-1">
                                                                                                <span className="font-medium text-blue-700">🚗 차량:</span>
                                                                                                <span className="text-blue-900">{reservation.service_details.airport_price.airport_car_type}</span>
                                                                                            </div>
                                                                                        )}
                                                                                        {reservation.service_details.ra_datetime && (
                                                                                            <div className="flex items-center gap-1">
                                                                                                <span className="font-medium text-blue-700">📅 일시:</span>
                                                                                                <span className="text-blue-900">{new Date(reservation.service_details.ra_datetime).toLocaleString('ko-KR')}</span>
                                                                                            </div>
                                                                                        )}
                                                                                        {reservation.service_details.ra_passenger_count && (
                                                                                            <div className="flex items-center gap-1">
                                                                                                <span className="font-medium text-blue-700">👥 승객:</span>
                                                                                                <span className="text-blue-900 font-semibold">{reservation.service_details.ra_passenger_count}명</span>
                                                                                            </div>
                                                                                        )}
                                                                                    </>
                                                                                )}

                                                                                {/* 호텔 */}
                                                                                {reservation.re_type === 'hotel' && (
                                                                                    <>
                                                                                        {reservation.service_details.hotel_price?.hotel_name && (
                                                                                            <div className="flex items-center gap-1">
                                                                                                <span className="font-semibold text-blue-700">🏨 호텔:</span>
                                                                                                <span className="text-blue-900 font-medium">{reservation.service_details.hotel_price.hotel_name}</span>
                                                                                            </div>
                                                                                        )}
                                                                                        {reservation.service_details.hotel_price?.room_name && (
                                                                                            <div className="flex items-center gap-1">
                                                                                                <span className="font-medium text-blue-700">🛏️ 객실:</span>
                                                                                                <span className="text-blue-900">{reservation.service_details.hotel_price.room_name}</span>
                                                                                            </div>
                                                                                        )}
                                                                                        {reservation.service_details.checkin_date && (
                                                                                            <div className="flex items-center gap-1">
                                                                                                <span className="font-medium text-blue-700">📅 체크인:</span>
                                                                                                <span className="text-blue-900">{new Date(reservation.service_details.checkin_date).toLocaleDateString('ko-KR')}</span>
                                                                                            </div>
                                                                                        )}
                                                                                        {reservation.service_details.guest_count && (
                                                                                            <div className="flex items-center gap-1">
                                                                                                <span className="font-medium text-blue-700">👥 인원:</span>
                                                                                                <span className="text-blue-900 font-semibold">{reservation.service_details.guest_count}명</span>
                                                                                            </div>
                                                                                        )}
                                                                                    </>
                                                                                )}

                                                                                {/* 투어 */}
                                                                                {reservation.re_type === 'tour' && (
                                                                                    <>
                                                                                        {reservation.service_details.pickup_location && (
                                                                                            <div className="flex items-center gap-1">
                                                                                                <span className="font-semibold text-blue-700">📍 픽업지:</span>
                                                                                                <span className="text-blue-900 font-medium">{reservation.service_details.pickup_location}</span>
                                                                                            </div>
                                                                                        )}
                                                                                        {reservation.service_details.tour_pricing?.vehicle_type && (
                                                                                            <div className="flex items-center gap-1">
                                                                                                <span className="font-medium text-blue-700">🚗 차량:</span>
                                                                                                <span className="text-blue-900">{reservation.service_details.tour_pricing.vehicle_type}</span>
                                                                                            </div>
                                                                                        )}
                                                                                        {reservation.service_details.usage_date && (
                                                                                            <div className="flex items-center gap-1">
                                                                                                <span className="font-medium text-blue-700">📅 날짜:</span>
                                                                                                <span className="text-blue-900">{new Date(reservation.service_details.usage_date).toLocaleDateString('ko-KR')}</span>
                                                                                            </div>
                                                                                        )}
                                                                                        {reservation.service_details.tour_capacity && (
                                                                                            <div className="flex items-center gap-1">
                                                                                                <span className="font-medium text-blue-700">👥 인원:</span>
                                                                                                <span className="text-blue-900 font-semibold">{reservation.service_details.tour_capacity}명</span>
                                                                                            </div>
                                                                                        )}
                                                                                    </>
                                                                                )}

                                                                                {/* 렌터카 */}
                                                                                {reservation.re_type === 'rentcar' && (
                                                                                    <>
                                                                                        {reservation.service_details.pickup_location && (
                                                                                            <div className="flex items-center gap-1">
                                                                                                <span className="font-semibold text-blue-700">📍 픽업지:</span>
                                                                                                <span className="text-blue-900 font-medium">{reservation.service_details.pickup_location}</span>
                                                                                            </div>
                                                                                        )}
                                                                                        {reservation.service_details.rentcar_price?.vehicle_type && (
                                                                                            <div className="flex items-center gap-1">
                                                                                                <span className="font-medium text-blue-700">🚗 차량:</span>
                                                                                                <span className="text-blue-900">{reservation.service_details.rentcar_price.vehicle_type}</span>
                                                                                            </div>
                                                                                        )}
                                                                                        {reservation.service_details.destination && (
                                                                                            <div className="flex items-center gap-1">
                                                                                                <span className="font-medium text-blue-700">🎯 목적지:</span>
                                                                                                <span className="text-blue-900">{reservation.service_details.destination}</span>
                                                                                            </div>
                                                                                        )}
                                                                                        {reservation.service_details.pickup_datetime && (
                                                                                            <div className="flex items-center gap-1">
                                                                                                <span className="font-medium text-blue-700">📅 일시:</span>
                                                                                                <span className="text-blue-900">{new Date(reservation.service_details.pickup_datetime).toLocaleString('ko-KR')}</span>
                                                                                            </div>
                                                                                        )}
                                                                                    </>
                                                                                )}

                                                                                {/* 스하차량 */}
                                                                                {reservation.re_type === 'sht' && (
                                                                                    <>
                                                                                        {reservation.service_details.sht_category && (
                                                                                            <div className="flex items-center gap-1">
                                                                                                <span className="font-semibold text-blue-700">📦 카테고리:</span>
                                                                                                <span className="text-blue-900 font-medium">{reservation.service_details.sht_category}</span>
                                                                                            </div>
                                                                                        )}
                                                                                        {reservation.service_details.vehicle_number && (
                                                                                            <div className="flex items-center gap-1">
                                                                                                <span className="font-semibold text-blue-700">🚗 차량번호:</span>
                                                                                                <span className="text-blue-900 font-medium">{reservation.service_details.vehicle_number}</span>
                                                                                            </div>
                                                                                        )}
                                                                                        {reservation.service_details.seat_number && (
                                                                                            <div className="flex items-center gap-1">
                                                                                                <span className="font-medium text-blue-700">💺 좌석번호:</span>
                                                                                                <span className="text-blue-900">{reservation.service_details.seat_number}</span>
                                                                                            </div>
                                                                                        )}
                                                                                        {reservation.service_details.usage_date && (
                                                                                            <div className="flex items-center gap-1">
                                                                                                <span className="font-medium text-blue-700">📅 사용일:</span>
                                                                                                <span className="text-blue-900">{new Date(reservation.service_details.usage_date).toLocaleDateString('ko-KR')}</span>
                                                                                            </div>
                                                                                        )}
                                                                                    </>
                                                                                )}
                                                                            </div>
                                                                        )}

                                                                        <div className="flex items-center gap-1 mt-2">
                                                                            <Calendar className="w-3 h-3" />
                                                                            <span>{new Date(reservation.re_created_at).toLocaleDateString('ko-KR')}</span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            <button
                                                                type="button"
                                                                className="text-xs px-2 py-1 border rounded bg-gray-50 hover:bg-gray-100 flex items-center gap-1"
                                                                onClick={() => handleViewDetails(reservation)}
                                                            >
                                                                <Eye className="w-3 h-3" />
                                                                상세보기
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            );
                        })()
                    )}
                </div>
            </div>
        </ManagerLayout>
    );
}
