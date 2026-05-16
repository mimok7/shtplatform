'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import supabase from '@/lib/supabase';
import { fetchTableInBatches } from '../../lib/fetchInBatches';
import ManagerLayout from './_components/MobileReservationLayout';
import {
    Search,
    Edit3,
    Eye,
    Calendar,
    User,
    FileText,
    ArrowRight,
    CheckCircle,
    XCircle,
    Clock,
    AlertTriangle,
    Mail,
    Phone,
    Car,
    MapPin,
    Ship,
    Plane,
    Truck,
    Bus,
    Building,
    Trash2,
    Plus,
    Copy
} from 'lucide-react';

interface ServiceReservation {
    re_id: string;
    re_type: string;
    re_status: string;
    total_amount?: number;
    vehicleData?: any;
    serviceDetails?: any;
    hasFastTrack?: boolean;
    fastTrackWayTypes?: string[];
}

interface ReservationSummary {
    re_quote_id: string | null;
    re_created_at: string;
    total_amount?: number;
    users: {
        id?: string;
        name: string;
        email: string;
        phone: string;
    } | null;
    quote: {
        title: string;
        status: string;
    } | null;
    services: ServiceReservation[]; // 여러 서비스를 담는 배열
}

const RESERVATION_EDIT_SEARCH_CACHE_KEY = 'manager:reservation-edit:search-cache';

function ReservationEditContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const normalizeTypeFilter = (type?: string | null) => {
        if (!type) return 'all';
        return type === 'car_sht' ? 'sht' : type;
    };

    const [reservations, setReservations] = useState<ReservationSummary[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState(''); // 실제 필터링에 사용되는 검색어
    const [searchInput, setSearchInput] = useState(''); // 입력 필드 값
    const [hasSearched, setHasSearched] = useState(false);
    // URL 파라미터에서 초기값 설정 (렌더 시점에 바로 읽어 중복 useEffect 방지)
    const [statusFilter, setStatusFilter] = useState(() => searchParams.get('status') || 'all');
    const [typeFilter, setTypeFilter] = useState(() => normalizeTypeFilter(searchParams.get('type')));
    const [selectedReservation, setSelectedReservation] = useState<ReservationSummary | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const saveSearchCache = (
        nextSearchInput: string,
        nextSearchTerm: string,
        nextStatusFilter: string,
        nextTypeFilter: string,
        nextHasSearched: boolean
    ) => {
        if (typeof window === 'undefined') return;
        try {
            sessionStorage.setItem(
                RESERVATION_EDIT_SEARCH_CACHE_KEY,
                JSON.stringify({
                    searchInput: nextSearchInput,
                    searchTerm: nextSearchTerm,
                    statusFilter: nextStatusFilter,
                    typeFilter: nextTypeFilter,
                    hasSearched: nextHasSearched,
                })
            );
        } catch {
            // noop
        }
    };

    const clearSearchCache = () => {
        if (typeof window === 'undefined') return;
        try {
            sessionStorage.removeItem(RESERVATION_EDIT_SEARCH_CACHE_KEY);
        } catch {
            // noop
        }
    };

    // searchParams 변경 시 필터 동기화
    useEffect(() => {
        const type = searchParams.get('type');
        const status = searchParams.get('status');
        const userId = searchParams.get('user_id');
        setTypeFilter(normalizeTypeFilter(type));
        setStatusFilter(status || 'all');

        if (userId) {
            setSearchInput(userId);
            setSearchTerm(userId);
            setHasSearched(true);
            saveSearchCache(userId, userId, status || 'all', normalizeTypeFilter(type), true);
            void loadReservations(userId);
            return;
        }

        const quoteId = searchParams.get('quote_id');
        if (quoteId) {
            setSearchInput(quoteId);
            setSearchTerm(quoteId);
            setHasSearched(true);
            saveSearchCache(quoteId, quoteId, status || 'all', normalizeTypeFilter(type), true);
            void loadReservations(quoteId);
            return;
        }

        if (typeof window !== 'undefined') {
            try {
                const raw = sessionStorage.getItem(RESERVATION_EDIT_SEARCH_CACHE_KEY);
                if (raw) {
                    const cached = JSON.parse(raw);
                    const cachedTypeFilter = normalizeTypeFilter(cached?.typeFilter);
                    const cachedStatusFilter = cached?.statusFilter || 'all';
                    const cachedSearchInput = cached?.searchInput || '';
                    const cachedSearchTerm = cached?.searchTerm || '';
                    const cachedHasSearched = !!cached?.hasSearched;

                    setTypeFilter(cachedTypeFilter);
                    setStatusFilter(cachedStatusFilter);
                    setSearchInput(cachedSearchInput);
                    setSearchTerm(cachedSearchTerm);
                    setHasSearched(cachedHasSearched);

                    if (cachedHasSearched && cachedSearchTerm) {
                        void loadReservations(cachedSearchTerm);
                    }
                }
            } catch {
                // noop
            }
        }
    }, [searchParams]);

    const loadReservations = async (keywordRaw: string = searchTerm) => {
        try {
            console.log('🔄 예약 데이터 로드 시작 (배이스 테이블 조회)...');
            setLoading(true);

            // URL 파라미터에서 필터 추출
            const quoteId = searchParams.get('quote_id');
            const userId = searchParams.get('user_id');
            const keyword = keywordRaw.trim();

            const escapeIlike = (value: string) => value.replace(/[%_]/g, (m) => `\\${m}`);
            let searchOrConditions: string[] = [];

            if (userId) {
                searchOrConditions.push(`re_user_id.eq.${userId}`);
            }

            if (!quoteId && !userId && keyword) {
                const searchPattern = `%${escapeIlike(keyword)}%`;
                const [usersRes, quoteRes] = await Promise.all([
                    supabase
                        .from('users')
                        .select('id')
                        .or(`name.ilike.${searchPattern},email.ilike.${searchPattern}`)
                        .limit(500),
                    supabase
                        .from('quote')
                        .select('id')
                        .ilike('title', searchPattern)
                        .limit(500),
                ]);

                const matchedUserIds = (usersRes.data || []).map((u: any) => u.id).filter(Boolean);
                const matchedQuoteIds = (quoteRes.data || []).map((q: any) => q.id).filter(Boolean);
                const isUuid = /^[0-9a-fA-F-]{36}$/.test(keyword);

                if (matchedUserIds.length > 0) {
                    searchOrConditions.push(`re_user_id.in.(${matchedUserIds.join(',')})`);
                }
                if (matchedQuoteIds.length > 0) {
                    searchOrConditions.push(`re_quote_id.in.(${matchedQuoteIds.join(',')})`);
                }
                if (isUuid) {
                    searchOrConditions.push(`re_id.eq.${keyword}`);
                    searchOrConditions.push(`re_quote_id.eq.${keyword}`);
                    searchOrConditions.push(`re_user_id.eq.${keyword}`);
                }

                if (searchOrConditions.length === 0) {
                    setReservations([]);
                    return;
                }
            }

            if (!quoteId && !userId && !keyword) {
                setReservations([]);
                return;
            }

            // 1) reservation 테이블 조회
            const PAGE_SIZE = 1000;
            const baseRows: any[] = [];
            let offset = 0;

            while (true) {
                let pageQuery = supabase
                    .from('reservation')
                    .select('re_id, re_type, re_status, re_created_at, re_quote_id, re_user_id, total_amount')
                    .order('re_created_at', { ascending: false })
                    .range(offset, offset + PAGE_SIZE - 1);

                // 필터 적용
                if (quoteId) {
                    pageQuery = pageQuery.eq('re_quote_id', quoteId);
                }
                if (!quoteId && searchOrConditions.length > 0) {
                    pageQuery = pageQuery.or(searchOrConditions.join(','));
                }
                if (statusFilter !== 'all') {
                    pageQuery = pageQuery.eq('re_status', statusFilter);
                }
                if (typeFilter !== 'all') {
                    // 고객 다이렉트/기존 데이터와 호환되도록 타입 별칭까지 포함해 필터링
                    const typeAliases: Record<string, string[]> = {
                        cruise: ['cruise', 'room'],
                        car: ['car', 'vehicle'],
                        vehicle: ['car', 'vehicle'],
                        sht: ['sht', 'car_sht', 'reservation_car_sht'],
                        car_sht: ['sht', 'car_sht', 'reservation_car_sht'],
                        airport: ['airport'],
                        hotel: ['hotel'],
                        rentcar: ['rentcar'],
                        tour: ['tour'],
                        package: ['package'],
                    };
                    const dbTypeFilters = typeAliases[typeFilter] || [typeFilter];
                    pageQuery = pageQuery.in('re_type', dbTypeFilters);
                }

                const { data: pageRows, error: pageErr } = await pageQuery;
                if (pageErr) {
                    console.error('❌ reservation 조회 실패:', pageErr);
                    setReservations([]);
                    return;
                }

                if (!pageRows || pageRows.length === 0) {
                    break;
                }

                baseRows.push(...pageRows);

                if (pageRows.length < PAGE_SIZE) {
                    break;
                }

                offset += PAGE_SIZE;
            }

            if (!baseRows || baseRows.length === 0) {
                setReservations([]);
                return;
            }

            // 1.5) 사용자 정보 로드
            const userIds = Array.from(new Set(baseRows.map((r: any) => r.re_user_id).filter(Boolean)));
            console.log('📌 추출된 사용자 IDs:', userIds);

            let userMap: Record<string, any> = {};
            if (userIds.length > 0) {
                // phone 컬럼이 없어서 오류 발생함. id, name, email, phone_number 조회
                const usersData = await fetchTableInBatches('users', 'id', userIds as string[], 'id, name, email, phone_number');
                console.log('📌 조회된 사용자 데이터:', usersData);

                if (usersData) {
                    usersData.forEach((u: any) => {
                        userMap[u.id] = u;
                    });
                }
            }

            // 2) 각 서비스별 차량 데이터를 배치로 조회
            const reservationIds = baseRows.map((r: any) => r.re_id);
            let vehicleDataMap: Record<string, any> = {};

            if (reservationIds.length > 0) {
                // 크루즈 차량 데이터 (기존)
                const { data: cruiseCars, error: cruiseCarErr } = await supabase
                    .from('reservation_cruise_car')
                    .select('reservation_id, car_price_code, rentcar_price_code, way_type, route, vehicle_type, car_count, passenger_count, pickup_location, dropoff_location, pickup_datetime')
                    .in('reservation_id', reservationIds);

                if (!cruiseCarErr && cruiseCars) {
                    cruiseCars.forEach(car => {
                        vehicleDataMap[car.reservation_id] = {
                            ...car,
                            service_type: 'cruise',
                            vehicle_type_label: '크루즈 차량'
                        };
                    });
                }

                // 공항 차량 데이터 (reservation_airport에 car_count, passenger_count 등이 있음)
                const { data: airportCars, error: airportCarErr } = await supabase
                    .from('reservation_airport')
                    .select('reservation_id, ra_car_count, ra_passenger_count, ra_airport_location, ra_datetime')
                    .in('reservation_id', reservationIds);

                if (!airportCarErr && airportCars) {
                    airportCars.forEach(car => {
                        if (car.ra_car_count && car.ra_car_count > 0) {
                            vehicleDataMap[car.reservation_id] = {
                                reservation_id: car.reservation_id,
                                car_count: car.ra_car_count,
                                passenger_count: car.ra_passenger_count,
                                pickup_location: car.ra_airport_location,
                                pickup_datetime: car.ra_datetime,
                                service_type: 'airport',
                                vehicle_type: '공항 차량'
                            };
                        }
                    });
                }

                // 렌터카 차량 데이터
                const { data: rentcarCars, error: rentcarCarErr } = await supabase
                    .from('reservation_rentcar')
                    .select('reservation_id, way_type, car_count, passenger_count, pickup_location, destination, pickup_datetime')
                    .in('reservation_id', reservationIds);

                if (!rentcarCarErr && rentcarCars) {
                    rentcarCars.forEach(car => {
                        if (car.car_count && car.car_count > 0) {
                            vehicleDataMap[car.reservation_id] = {
                                reservation_id: car.reservation_id,
                                car_count: car.car_count,
                                passenger_count: car.passenger_count,
                                way_type: car.way_type,
                                pickup_location: car.pickup_location,
                                dropoff_location: car.destination,
                                pickup_datetime: car.pickup_datetime,
                                service_type: 'rentcar',
                                vehicle_type: '렌터카'
                            };
                        }
                    });
                }

                // 투어 차량 데이터
                const { data: tourCars, error: tourCarErr } = await supabase
                    .from('reservation_tour')
                    .select('reservation_id, tour_capacity, pickup_location, dropoff_location, usage_date')
                    .in('reservation_id', reservationIds);

                if (!tourCarErr && tourCars) {
                    tourCars.forEach(car => {
                        if (car.tour_capacity && car.tour_capacity > 0) {
                            vehicleDataMap[car.reservation_id] = {
                                reservation_id: car.reservation_id,
                                car_count: 1, // 투어는 보통 1대
                                passenger_count: car.tour_capacity,
                                pickup_location: car.pickup_location,
                                dropoff_location: car.dropoff_location,
                                pickup_datetime: car.usage_date,
                                service_type: 'tour',
                                vehicle_type: '투어 차량'
                            };
                        }
                    });
                }

                console.log('✅ 차량 데이터 로드 완료:', Object.keys(vehicleDataMap).length, '개 예약에 차량 데이터 있음');
            }

            // 2-b) 각 서비스별 전체 상세 데이터 배치 조회 (카드 통일 표시용)
            let serviceDetailsMap: Record<string, any> = {};
            const airportFastTrackMap = new Map<string, Set<string>>();
            if (reservationIds.length > 0) {
                const cruiseIds = baseRows.filter((r: any) => r.re_type === 'cruise').map((r: any) => r.re_id);
                const airportIds = baseRows.filter((r: any) => r.re_type === 'airport').map((r: any) => r.re_id);
                const hotelIds = baseRows.filter((r: any) => r.re_type === 'hotel').map((r: any) => r.re_id);
                const rentcarIds = baseRows.filter((r: any) => r.re_type === 'rentcar').map((r: any) => r.re_id);
                const tourIds = baseRows.filter((r: any) => r.re_type === 'tour').map((r: any) => r.re_id);
                const cruiseCarIds = baseRows.filter((r: any) => r.re_type === 'cruise_car' || r.re_type === 'vehicle').map((r: any) => r.re_id);
                const carShtIds = baseRows.filter((r: any) => r.re_type === 'car_sht' || r.re_type === 'sht').map((r: any) => r.re_id);
                const packageIds = baseRows.filter((r: any) => r.re_type === 'package').map((r: any) => r.re_id);

                const [cruiseRes, airportRes, hotelRes, rentcarRes, tourRes, cruiseCarRes, carShtRes, airportFastTrackRes] = await Promise.all([
                    cruiseIds.length ? supabase.from('reservation_cruise').select('*').in('reservation_id', cruiseIds) : { data: [], error: null },
                    airportIds.length ? supabase.from('reservation_airport').select('*').in('reservation_id', airportIds) : { data: [], error: null },
                    hotelIds.length ? supabase.from('reservation_hotel').select('*').in('reservation_id', hotelIds) : { data: [], error: null },
                    rentcarIds.length ? supabase.from('reservation_rentcar').select('*').in('reservation_id', rentcarIds) : { data: [], error: null },
                    tourIds.length ? supabase.from('reservation_tour').select('*').in('reservation_id', tourIds) : { data: [], error: null },
                    cruiseCarIds.length ? supabase.from('reservation_cruise_car').select('*').in('reservation_id', cruiseCarIds) : { data: [], error: null },
                    carShtIds.length ? supabase.from('reservation_car_sht').select('*').in('reservation_id', carShtIds) : { data: [], error: null },
                    airportIds.length ? supabase.from('reservation_airport_fasttrack').select('reservation_id, way_type').in('reservation_id', airportIds) : { data: [], error: null },
                ]);

                [cruiseRes, airportRes, hotelRes, rentcarRes, tourRes, cruiseCarRes, carShtRes].forEach((res: any) => {
                    if (res?.data) {
                        res.data.forEach((row: any) => {
                            serviceDetailsMap[row.reservation_id] = row;
                        });
                    }
                });

                (airportFastTrackRes?.data || []).forEach((row: any) => {
                    const reservationId = String(row.reservation_id || '');
                    if (!reservationId) return;
                    const wayType = String(row.way_type || '').toLowerCase();
                    if (!airportFastTrackMap.has(reservationId)) {
                        airportFastTrackMap.set(reservationId, new Set());
                    }
                    if (wayType) airportFastTrackMap.get(reservationId)?.add(wayType);
                });

                // 패키지 타입은 reservation 테이블 자체 데이터 사용
                packageIds.forEach((id: string) => {
                    const row = baseRows.find((r: any) => r.re_id === id);
                    if (row) {
                        serviceDetailsMap[id] = {
                            package_name: '패키지',
                            total_amount: row.total_amount,
                            re_adult_count: row.re_adult_count,
                            re_child_count: row.re_child_count,
                            re_infant_count: row.re_infant_count,
                        };
                    }
                });

                console.log('✅ 서비스 상세 데이터 로드 완료:', Object.keys(serviceDetailsMap).length, '개');
            }

            // 3) quote를 배치로 조회하여 맵 구성
            const quoteIds = baseRows.map((r: any) => r.re_quote_id).filter(Boolean);
            let quoteMap: Record<string, { title: string; status: string }> = {};
            if (quoteIds.length > 0) {
                const { data: quotes, error: quoteErr } = await supabase
                    .from('quote')
                    .select('id, title, status')
                    .in('id', quoteIds as string[]);
                if (!quoteErr && quotes) {
                    quoteMap = quotes.reduce((acc: Record<string, { title: string; status: string }>, q: any) => {
                        acc[q.id] = { title: q.title, status: q.status };
                        return acc;
                    }, {});
                } else if (quoteErr) {
                    console.warn('⚠️ 견적 배치 조회 오류:', quoteErr);
                }
            }

            // 4) 사용자(이메일)별로 그룹화하여 최종 머지
            const groupedByUser: Record<string, ReservationSummary> = {};

            baseRows.forEach((r: any) => {
                const groupKey = r.re_quote_id || r.re_id; // 견적 ID별로 그룹화, 없으면 개별 예약 ID 사용
                const userInfo = userMap[r.re_user_id] || {};

                if (!groupedByUser[groupKey]) {
                    const userName = userInfo.name || (userInfo.email ? userInfo.email.split('@')[0] : '정보 없음');

                    // 새로운 그룹 생성
                    groupedByUser[groupKey] = {
                        re_quote_id: r.re_quote_id,
                        re_created_at: r.re_created_at,
                        users: {
                            id: userInfo.id || r.re_user_id || undefined,
                            name: userName,
                            email: userInfo.email || '이메일 없음',
                            phone: userInfo.phone_number || '',
                        },
                        quote: r.re_quote_id && quoteMap[r.re_quote_id]
                            ? { title: quoteMap[r.re_quote_id].title, status: quoteMap[r.re_quote_id].status }
                            : null,
                        services: [],
                        total_amount: 0
                    };
                }

                // 서비스 추가
                groupedByUser[groupKey].total_amount = (groupedByUser[groupKey].total_amount || 0) + (r.total_amount || 0);
                groupedByUser[groupKey].services.push({
                    re_id: r.re_id,
                    re_type: r.re_type,
                    re_status: r.re_status,
                    total_amount: r.total_amount || 0,
                    vehicleData: vehicleDataMap[r.re_id] || null,
                    serviceDetails: serviceDetailsMap[r.re_id] || null,
                    hasFastTrack: r.re_type === 'airport' ? airportFastTrackMap.has(r.re_id) : false,
                    fastTrackWayTypes: r.re_type === 'airport'
                        ? Array.from(airportFastTrackMap.get(r.re_id) || []).sort()
                        : [],
                });
            });

            const merged: ReservationSummary[] = Object.values(groupedByUser);

            console.log('✅ 예약 데이터 로드/머지 완료:', merged.length, '개 그룹 (총', baseRows.length, '개 서비스)');
            setReservations(merged);
        } catch (error) {
            console.error('❌ 예약 목록 로드 실패:', error);
            setReservations([]);
        } finally {
            setLoading(false);
        }
    };

    const handleSearchClick = async () => {
        const keyword = searchInput.trim();
        const quoteId = searchParams.get('quote_id');

        if (!quoteId && !keyword) {
            setReservations([]);
            setSearchTerm('');
            setHasSearched(false);
            clearSearchCache();
            return;
        }

        setSearchTerm(keyword);
        setHasSearched(true);
        saveSearchCache(searchInput, keyword, statusFilter, typeFilter, true);
        await loadReservations(keyword);
    };

    // 예약 삭제
    const [deleting, setDeleting] = useState<string | null>(null);

    // 서비스별 단일 삭제 (해당 서비스 1건만)
    // - 자식 테이블 1개(reType 매핑) + reservation 본 행만 삭제
    // - 같은 견적의 다른 서비스 예약과 견적 자체는 유지
    const handleDeleteReservation = async (reId: string, reType: string) => {
        const confirmed = window.confirm(
            `이 ${getTypeLabel(reType)} 서비스 1건만 삭제합니다.\n\n같은 견적의 다른 서비스/견적은 유지됩니다.\n진행할까요?`
        );
        if (!confirmed) return;

        setDeleting(reId);
        try {
            const serviceTableMap: Record<string, string> = {
                cruise: 'reservation_cruise',
                airport: 'reservation_airport',
                hotel: 'reservation_hotel',
                tour: 'reservation_tour',
                rentcar: 'reservation_rentcar',
                car: 'reservation_cruise_car',
                car_sht: 'reservation_car_sht',
                sht: 'reservation_car_sht',
                package: 'reservation_package',
            };

            const serviceTable = serviceTableMap[reType];
            if (serviceTable) {
                const { error: childErr } = await supabase.from(serviceTable).delete().eq('reservation_id', reId);
                if (childErr) console.warn(`자식 테이블 ${serviceTable} 삭제 경고:`, childErr.message);
            }

            const { error } = await supabase.from('reservation').delete().eq('re_id', reId);
            if (error) throw error;

            alert('해당 서비스 예약 1건이 삭제되었습니다.');
            await loadReservations(searchTerm);
        } catch (error: any) {
            console.error('예약 삭제 실패:', error);
            alert('삭제 실패: ' + (error.message || '알 수 없는 오류'));
        } finally {
            setDeleting(null);
        }
    };



    const filteredReservations = reservations;

    const handleAddReservationForGroup = (reservation: ReservationSummary) => {
        if (reservation.re_quote_id) {
            router.push(`/reservation-edit/new?quote_id=${reservation.re_quote_id}`);
            return;
        }
        if (reservation.users?.id) {
            router.push(`/reservation-edit/new?user_id=${reservation.users.id}`);
            return;
        }
        router.push('/reservation-edit/new');
    };

    const handleCopyQuoteId = async (quoteId: string | null) => {
        if (!quoteId) return;
        try {
            await navigator.clipboard.writeText(quoteId);
            alert('견적 ID가 복사되었습니다.');
        } catch (error) {
            console.error('견적 ID 복사 실패:', error);
            alert('복사에 실패했습니다.');
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'approved':
                return <CheckCircle className="w-4 h-4 text-blue-500" />;
            case 'confirmed':
                return <CheckCircle className="w-4 h-4 text-green-500" />;
            case 'pending':
                return <Clock className="w-4 h-4 text-yellow-500" />;
            case 'processing':
                return <AlertTriangle className="w-4 h-4 text-blue-500" />;
            case 'cancelled':
                return <XCircle className="w-4 h-4 text-red-500" />;
            default:
                return <Clock className="w-4 h-4 text-gray-500" />;
        }
    };

    const getTypeLabel = (type: string) => {
        const typeMap: { [key: string]: string } = {
            'cruise': '🚢 크루즈',
            'hotel': '🏨 호텔',
            'airport': '✈️ 공항',
            'rentcar': '🚗 렌터카',
            'tour': '🚩 투어',
            'car': '🚗 크차',
            'vehicle': '🚗 크루즈 차량',
            'sht': '🚌 스하차량',
            'car_sht': '🚌 스하차량',
            'package': '📦 패키지'
        };
        return typeMap[type] || '❓ 기타';
    };

    const getStatusLabel = (status: string) => {
        const statusMap: { [key: string]: string } = {
            'pending': '대기중',
            'approved': '승인',
            'confirmed': '확정',
            'processing': '처리중',
            'cancelled': '취소됨',
            'completed': '완료'
        };
        return statusMap[status] || status;
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'approved': return 'text-blue-600';
            case 'confirmed': return 'text-green-600';
            case 'cancelled': return 'text-red-600';
            case 'pending': return 'text-yellow-600';
            case 'processing': return 'text-blue-600';
            case 'completed': return 'text-green-600';
            default: return 'text-gray-600';
        }
    };

    const getTypeIcon = (type: string) => {
        switch (type) {
            case 'cruise': return <span className="flex items-center gap-1"><Ship className="w-5 h-5 text-blue-600" /> 크루즈</span>;
            case 'airport': return <span className="flex items-center gap-1"><Plane className="w-5 h-5 text-green-600" /> 공항</span>;
            case 'hotel': return <span className="flex items-center gap-1"><Building className="w-5 h-5 text-purple-600" /> 호텔</span>;
            case 'tour': return <span className="flex items-center gap-1"><MapPin className="w-5 h-5 text-orange-600" /> 투어</span>;
            case 'rentcar': return <span className="flex items-center gap-1"><Car className="w-5 h-5 text-red-600" /> 렌터카</span>;
            case 'car': return <span className="flex items-center gap-1"><Car className="w-5 h-5 text-blue-600" /> 크차</span>;
            case 'vehicle': return <span className="flex items-center gap-1"><Car className="w-5 h-5 text-blue-600" /> 크루즈 차량</span>;
            case 'sht': return <span className="flex items-center gap-1"><Bus className="w-5 h-5 text-indigo-600" /> 스하차량</span>;
            case 'car_sht': return <span className="flex items-center gap-1"><Bus className="w-5 h-5 text-indigo-600" /> 스하차량</span>;
            case 'package': return <span className="flex items-center gap-1"><span className="w-5 h-5 text-purple-600">📦</span> 패키지</span>;
            default: return <span className="flex items-center gap-1"><Clock className="w-5 h-5 text-gray-600" /> 기타</span>;
        }
    };

    const getServiceSortOrder = (type: string): number => {
        const order: { [key: string]: number } = {
            'package': 0, // 패키지가 최상위
            'cruise': 1,
            'sht': 2,
            'car_sht': 2, // sht와 동일한 순서
            'car': 2, // 크루즈 차량
            'vehicle': 2, // sht와 동일한 순서
            'airport': 3,
            'tour': 4,
            'rentcar': 5,
            'hotel': 6
        };
        return order[type] || 999;
    };

    // 로딩 상태 처리
    if (loading) {
        return (
            <ManagerLayout title="📝 예약 수정" activeTab="reservation-edit">
                <div className="flex justify-center items-center h-64">
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
                        <p className="mt-4 text-gray-600">데이터 로드 중...</p>
                    </div>
                </div>
            </ManagerLayout>
        );
    }

    return (
        <ManagerLayout title="📝 예약 수정" activeTab="reservation-edit">
            <div className="space-y-6">
                {/* 검색 및 액션 */}
                <div className="bg-white rounded-lg shadow-sm p-6">
                    <div className="flex flex-wrap gap-4 items-center mb-4">
                        {/* 새 예약 추가 */}
                        <button
                            onClick={() => router.push('/reservation-edit/new')}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium whitespace-nowrap"
                        >
                            <Plus className="w-4 h-4" />
                            새 예약 추가
                        </button>

                        {/* 총 예약 개수 */}
                        <div className="text-sm text-gray-600 whitespace-nowrap">
                            총 {filteredReservations.length}개의 예약
                        </div>

                        {/* 검색 입력 및 검색 버튼 */}
                        <div className="flex gap-2 items-center">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                                <input
                                    type="text"
                                    placeholder="고객명, 이메일로 검색"
                                    value={searchInput}
                                    onChange={(e) => setSearchInput(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSearchClick()}
                                    className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-64"
                                />
                            </div>
                            <button
                                onClick={handleSearchClick}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium whitespace-nowrap"
                            >
                                검색
                            </button>
                        </div>

                        {/* 현재 검색 표시 및 검색 초기화 */}
                        {searchTerm && (
                            <div className="flex flex-wrap gap-2 items-center">
                                <span className="text-sm font-medium text-gray-600">현재 검색:</span>
                                <span className="inline-flex items-center gap-1 px-3 py-1 bg-gray-100 text-gray-800 text-sm rounded-full">
                                    검색: "{searchTerm}"
                                    <button
                                        onClick={() => {
                                            setSearchTerm('');
                                            setSearchInput('');
                                            clearSearchCache();
                                        }}
                                        className="ml-1 hover:bg-gray-200 rounded-full p-0.5 w-4 h-4 flex items-center justify-center"
                                        title="검색어 제거"
                                    >
                                        ×
                                    </button>
                                </span>
                                <button
                                    onClick={() => {
                                        setSearchTerm('');
                                        setSearchInput('');
                                        setHasSearched(false);
                                        clearSearchCache();
                                    }}
                                    className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 hover:bg-gray-100 rounded"
                                >
                                    검색 초기화
                                </button>
                            </div>
                        )}
                    </div>

                    {/* 예약 목록 카드 그리드 */}
                    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
                        {filteredReservations.length === 0 ? (
                            <div className="col-span-full text-center py-12">
                                <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                                <h3 className="text-lg font-medium text-gray-900 mb-2">예약이 없습니다</h3>
                                <p className="text-gray-600">
                                    {hasSearched
                                        ? '검색 조건에 맞는 예약이 없습니다.'
                                        : '검색어를 입력하고 검색 버튼을 눌러주세요.'
                                    }
                                </p>
                                <div className="mt-4">
                                    <button
                                        onClick={() => {
                                            setSearchTerm('');
                                            setSearchInput('');
                                            setHasSearched(false);
                                            clearSearchCache();
                                        }}
                                        className="text-blue-600 hover:text-blue-800 text-sm"
                                    >
                                        검색 초기화
                                    </button>
                                </div>
                            </div>
                        ) : (
                            filteredReservations.map((reservation) => {
                                const hasAirportFastTrack = reservation.services.some(
                                    (service) => service.re_type === 'airport' && service.hasFastTrack
                                );

                                return (
                                    <div key={reservation.re_quote_id || reservation.services[0]?.re_id} className="relative overflow-hidden bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
                                        {hasAirportFastTrack && (
                                            <div className="absolute -right-10 top-3 rotate-45 bg-rose-600 text-white text-[10px] font-bold px-10 py-1 z-10 shadow-sm">
                                                FAST TRACK
                                            </div>
                                        )}
                                        {/* 카드 헤더 */}
                                        <div className="p-4 border-b border-gray-100">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    {[...reservation.services]
                                                        .sort((a, b) => getServiceSortOrder(a.re_type) - getServiceSortOrder(b.re_type))
                                                        .map((service, idx) => (
                                                            <div key={idx} className="flex items-center gap-1 bg-white px-2 py-1 rounded text-sm font-medium border border-gray-100 shadow-sm">
                                                                {getTypeIcon(service.re_type)}
                                                            </div>
                                                        ))}
                                                </div>
                                            </div>
                                        </div>

                                        {/* 카드 본문 */}
                                        <div className="p-4 space-y-3">
                                            <div>
                                                <div className="text-xs text-gray-500 mt-1 break-all flex items-center gap-2">
                                                    <span>견적 ID: {reservation.re_quote_id || '-'}</span>
                                                    {reservation.re_quote_id && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleCopyQuoteId(reservation.re_quote_id)}
                                                            className="inline-flex items-center text-gray-400 hover:text-blue-600 transition-colors"
                                                            title="견적 ID 복사"
                                                            aria-label="견적 ID 복사"
                                                        >
                                                            <Copy className="w-3.5 h-3.5" />
                                                        </button>
                                                    )}
                                                </div>
                                                {reservation.total_amount && reservation.total_amount > 0 && (
                                                    <div className="mt-2 pt-2 border-t border-gray-100 flex justify-between items-center">
                                                        <span className="text-xs text-gray-500">총 결제 금액</span>
                                                        <span className="text-sm font-bold text-green-600">
                                                            {reservation.total_amount.toLocaleString()}동
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* 카드 푸터 */}
                                        <div className="p-4 border-t border-gray-100">
                                            <div className="flex flex-col gap-2">
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => handleAddReservationForGroup(reservation)}
                                                        className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 text-xs bg-green-100 text-green-700 rounded-md hover:bg-green-200 transition-colors"
                                                    >
                                                        <Plus className="w-3 h-3" />
                                                        새 예약 추가
                                                    </button>
                                                </div>
                                                {[...reservation.services]
                                                    .sort((a, b) => getServiceSortOrder(a.re_type) - getServiceSortOrder(b.re_type))
                                                    .map((service, idx) => (
                                                        <div key={idx} className="flex gap-2">
                                                            <button
                                                                onClick={() => {
                                                                    const editRoute = (service.re_type === 'car_sht' || service.re_type === 'sht')
                                                                        ? 'sht'
                                                                        : service.re_type === 'car'
                                                                            ? 'vehicle'
                                                                            : service.re_type;
                                                                    router.push(`/reservation-edit/${editRoute}?id=${service.re_id}`);
                                                                }}
                                                                className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 text-xs bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 transition-colors"
                                                            >
                                                                <Edit3 className="w-3 h-3" />
                                                                {getTypeLabel(service.re_type)} 수정
                                                                {service.re_type === 'airport' && service.hasFastTrack && (
                                                                    <span className="ml-1 px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 text-[10px] font-semibold">
                                                                        패스트랙
                                                                    </span>
                                                                )}
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeleteReservation(service.re_id, service.re_type)}
                                                                disabled={deleting === service.re_id}
                                                                className="inline-flex items-center justify-center gap-1 px-2 py-2 text-xs bg-red-100 text-red-700 rounded-md hover:bg-red-200 transition-colors disabled:opacity-50"
                                                                title="삭제"
                                                            >
                                                                <Trash2 className="w-3 h-3" />
                                                            </button>
                                                        </div>
                                                    ))}
                                            </div>
                                        </div>
                                    </div>
                                )
                            })
                        )}
                    </div>
                </div>

                {/* 예약 상세 정보 모달 */}
                {isModalOpen && selectedReservation && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                        <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
                            {/* 모달 헤더 */}
                            <div className="p-6 border-b border-gray-200">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="flex gap-1">
                                            {selectedReservation.services.map((service, idx) => (
                                                <div key={idx}>{getTypeIcon(service.re_type)}</div>
                                            ))}
                                        </div>
                                        <div>
                                            <h2 className="text-xl font-bold text-gray-900">
                                                예약 상세 정보 ({selectedReservation.services.length}개 서비스)
                                            </h2>
                                            <p className="text-sm text-gray-600">
                                                {selectedReservation.quote?.title || '제목 없음'}
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setIsModalOpen(false)}
                                        className="text-gray-400 hover:text-gray-600 text-2xl"
                                    >
                                        ×
                                    </button>
                                </div>
                            </div>

                            {/* 모달 본문 */}
                            <div className="p-6 space-y-6">
                                {/* 예약 기본 정보 */}
                                <div className="bg-white rounded-lg shadow-md p-6">
                                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                                        <FileText className="w-5 h-5 text-blue-600" />
                                        예약 기본 정보
                                    </h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div>
                                            <div className="space-y-2 text-sm">
                                                <div><span className="text-gray-600">서비스 개수:</span> <strong>{selectedReservation.services.length}개</strong></div>
                                                <div><span className="text-gray-600">서비스 타입:</span>
                                                    <div className="flex flex-wrap gap-1 mt-1">
                                                        {selectedReservation.services.map((service, idx) => (
                                                            <span key={idx} className="inline-block bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs">
                                                                {getTypeLabel(service.re_type)}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <Calendar className="w-4 h-4 text-gray-500" />
                                                    <span className="text-gray-600">생성일:</span>
                                                    <strong>{new Date(selectedReservation.re_created_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}</strong>
                                                </div>
                                                {selectedReservation.total_amount !== undefined && (
                                                    <div className="mt-4 pt-4 border-t border-gray-100 flex justify-between items-center">
                                                        <span className="text-lg font-semibold text-gray-700">총 예약 금액:</span>
                                                        <span className="text-2xl font-bold text-green-600">
                                                            {selectedReservation.total_amount.toLocaleString()}동
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* 여행 정보 */}
                            {selectedReservation.quote && (
                                <div className="bg-white rounded-lg shadow-md p-6">
                                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                                        <FileText className="w-6 h-6 text-purple-600" />
                                        연결된 견적 정보
                                    </h3>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div>
                                            <span className="text-gray-600 text-sm">견적 제목:</span>
                                            <p className="font-medium">{selectedReservation.quote.title}</p>
                                        </div>
                                        <div>
                                            <span className="text-gray-600 text-sm">견적 상태:</span>
                                            <p className="font-medium">{selectedReservation.quote.status}</p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* 서비스별 상세 정보 */}
                            {selectedReservation.services.map((service, idx) => (
                                <div key={idx} className="bg-white rounded-lg shadow-md p-6 border-l-4 border-blue-500">
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-lg font-semibold flex items-center gap-2">
                                            {getTypeIcon(service.re_type)}
                                            {getTypeLabel(service.re_type)} 서비스
                                        </h3>
                                    </div>

                                    <div className="space-y-3">
                                        <div className="text-sm">
                                            <span className="text-gray-600">예약 ID:</span>
                                            <span className="ml-2 font-mono text-xs bg-gray-100 px-2 py-1 rounded">
                                                {service.re_id.substring(0, 8)}...
                                            </span>
                                        </div>

                                        {service.vehicleData && (
                                            <div className="bg-white p-4 rounded-lg space-y-2 text-sm border border-gray-100 shadow-sm">
                                                <div className="font-semibold text-blue-900">차량/이동 정보</div>
                                                {service.vehicleData.car_price_code && (
                                                    <div><span className="text-gray-700">차량 코드:</span> <strong>{service.vehicleData.car_price_code}</strong></div>
                                                )}
                                                {service.vehicleData.rentcar_price_code && !service.vehicleData.car_price_code && (
                                                    <div><span className="text-gray-700">차량 코드:</span> <strong>{service.vehicleData.rentcar_price_code}</strong></div>
                                                )}
                                                {service.vehicleData.way_type && (
                                                    <div><span className="text-gray-700">이용 방식:</span> <strong>{service.vehicleData.way_type}</strong></div>
                                                )}
                                                {service.vehicleData.route && (
                                                    <div><span className="text-gray-700">경로:</span> <strong>{service.vehicleData.route}</strong></div>
                                                )}
                                                {service.vehicleData.vehicle_type && service.vehicleData.vehicle_type !== '차량' && (
                                                    <div><span className="text-gray-700">차종:</span> <strong>{service.vehicleData.vehicle_type}</strong></div>
                                                )}
                                                <div><span className="text-gray-700">차량 대수:</span> <strong>{service.vehicleData.car_count}대</strong></div>
                                                <div><span className="text-gray-700">승객 수:</span> <strong>{service.vehicleData.passenger_count}명</strong></div>
                                                <div className="flex items-center gap-1">
                                                    <MapPin className="w-4 h-4 text-gray-500" />
                                                    <span className="text-gray-700">출발:</span>
                                                    <strong>{service.vehicleData.pickup_location}</strong>
                                                </div>
                                                {service.vehicleData.dropoff_location && (
                                                    <div className="flex items-center gap-1">
                                                        <MapPin className="w-4 h-4 text-gray-500" />
                                                        <span className="text-gray-700">도착:</span>
                                                        <strong>{service.vehicleData.dropoff_location}</strong>
                                                    </div>
                                                )}
                                                {service.vehicleData.pickup_datetime && (
                                                    <div className="flex items-center gap-1">
                                                        <Calendar className="w-4 h-4 text-gray-500" />
                                                        <span className="text-gray-700">일시:</span>
                                                        <strong>{new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</strong>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        <div className="pt-2">
                                            <button
                                                onClick={() => {
                                                    setIsModalOpen(false);
                                                    router.push(`/reservation-edit/${service.re_type}?id=${service.re_id}`);
                                                }}
                                                className="w-full px-4 py-2 bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 transition-colors text-sm font-medium"
                                            >
                                                이 서비스 수정하기
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* 모달 푸터 */}
                        <div className="p-6 border-t border-gray-200 bg-gray-50">
                            <div className="flex justify-end gap-3">
                                <button
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                                >
                                    닫기
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </ManagerLayout>
    );
}

export default function ReservationEditPage() {
    return (
        <Suspense fallback={
            <ManagerLayout title="📝 예약 수정" activeTab="reservation-edit">
                <div className="flex justify-center items-center h-64">
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
                        <p className="mt-4 text-gray-600">페이지를 불러오는 중...</p>
                    </div>
                </div>
            </ManagerLayout>
        }>
            <ReservationEditContent />
        </Suspense>
    );
}
