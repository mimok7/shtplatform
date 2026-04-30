"use client";

import React, { useState, useEffect, useMemo } from 'react';

import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabase';
import ManagerLayout from '@/components/ManagerLayout';
import UserReservationDetailModal from '@/components/UserReservationDetailModal';
import PackageReservationDetailModal from '@/components/PackageReservationDetailModal';
import {
    CheckSquare,
    Square,
    ArrowLeft,
    RefreshCw,
    CheckCircle,
    XCircle,
    Clock,
    Edit,
    Trash2,
    AlertTriangle,
    Users,
    Eye,
    X,
    Ship,
    Plane,
    Building,
    MapPin,
    Car,
    Bus,
    Package
} from 'lucide-react';

interface ServiceReservation {
    re_id: string;
    re_type: string;
    re_status: string;
}

interface ReservationItem {
    re_quote_id: string | null;
    re_created_at: string;
    re_update_at: string | null;
    users: {
        id: string;
        name: string;
        email: string;
        phone: string;
        english_name?: string;
        child_birth_dates?: string[] | null;
    } | null;
    quote: {
        title: string;
    } | null;
    services: ServiceReservation[];
}

type BulkAction = 'delete' | 'status_update' | '';
type SortType = 'date' | 'name';

const STATUS_LABELS: Record<string, string> = {
    pending: '대기',
    approved: '승인',
    confirmed: '확정',
    completed: '완료',
    cancelled: '취소',
};

const normalizeReservationStatus = (status?: string) => {
    const value = (status || '').trim().toLowerCase();
    const statusMap: Record<string, string> = {
        pending: 'pending',
        '대기': 'pending',
        '대기중': 'pending',
        approved: 'approved',
        '승인': 'approved',
        confirmed: 'confirmed',
        '확정': 'confirmed',
        completed: 'completed',
        '완료': 'completed',
        cancelled: 'cancelled',
        canceled: 'cancelled',
        '취소': 'cancelled',
        '취소됨': 'cancelled',
    };
    return statusMap[value] || value;
};


export default function BulkReservationPage() {
    const router = useRouter();
    const [reservations, setReservations] = useState<ReservationItem[]>([]);
    const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'confirmed' | 'cancelled' | 'completed'>('pending');
    const [serviceFilter, setServiceFilter] = useState<string>('all');
    const [bulkAction, setBulkAction] = useState<BulkAction>('');
    const [newStatus, setNewStatus] = useState<string>('');
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [searchTrigger, setSearchTrigger] = useState<number>(0); // 검색 버튼 클릭용
    const [showBulkActionPanel, setShowBulkActionPanel] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalUserInfo, setModalUserInfo] = useState<any>(null);
    const [modalUserServices, setModalUserServices] = useState<any[]>([]);
    const [modalLoading, setModalLoading] = useState(false);
    const [reservationDetails, setReservationDetails] = useState<any>(null);
    const [modalKey, setModalKey] = useState(0); // 🔧 모달 열릴 때마다 증가 → 컴포넌트 완전 리마운트
    const [sortType, setSortType] = useState<SortType>('date'); // 정렬 타입
    const [userEmail, setUserEmail] = useState<string | null>(null); // 현재 사용자 이메일

    const totalServiceCount = useMemo(
        () => reservations.reduce((sum, r) => sum + r.services.length, 0),
        [reservations]
    );

    // 현재 사용자 이메일 로드
    useEffect(() => {
        const loadCurrentUser = async () => {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (user?.email) {
                    setUserEmail(user.email);
                }
            } catch (error) {
                console.error('사용자 정보 로드 실패:', error);
            }
        };
        loadCurrentUser();
    }, []);

    useEffect(() => {
        loadReservations();
    }, [filter, serviceFilter, searchTrigger, sortType]);

    // 권한 확인 변수
    const emailLower = (userEmail || '').toLowerCase();
    const canChangeStatus = emailLower === 'kys@hyojacho.es.kr' || emailLower === 'kjh@hyojacho.es.kr';

    const loadReservations = async () => {
        try {
            setLoading(true);

            // 1) 예약 데이터 조회 (기본 컬럼만)
            // DB 레벨 필터링: Supabase 기본 1000행 제한 대응
            // 필터 없이 전체 조회 시 1691건 중 1000건만 반환되어 데이터 누락 발생
            const typeMap: Record<string, string[]> = {
                cruise: ['cruise'],
                airport: ['airport'],
                hotel: ['hotel'],
                tour: ['tour'],
                rentcar: ['rentcar'],
                vehicle: ['car'],
                sht: ['sht', 'car_sht', 'reservation_car_sht'],
                package: ['package'],
            };
            const matchTypes = serviceFilter === 'all' ? null : (typeMap[serviceFilter] || [serviceFilter]);
            const PAGE_SIZE = 1000;
            const MAX_PAGES = 100;
            const rows: any[] = [];

            // 상태/타입을 먼저 DB 레벨에서 필터링하고, range 페이지 조회로 누락 없이 수집
            for (let page = 0; page < MAX_PAGES; page++) {
                const from = page * PAGE_SIZE;
                const to = from + PAGE_SIZE - 1;

                let pageQuery = supabase
                    .from('reservation')
                    .select('re_id, re_type, re_status, re_created_at, re_update_at, re_quote_id, re_user_id')
                    .neq('re_type', 'car_sht')
                    .order('re_created_at', { ascending: false })
                    .order('re_id', { ascending: false })
                    .range(from, to);

                if (filter !== 'all') {
                    pageQuery = pageQuery.eq('re_status', filter);
                }
                if (matchTypes) {
                    pageQuery = pageQuery.in('re_type', matchTypes);
                }

                const { data: pageRows, error: pageError } = await pageQuery;
                if (pageError) throw pageError;

                const chunk = pageRows || [];
                rows.push(...chunk);

                if (chunk.length < PAGE_SIZE) {
                    break;
                }
            }


            // 2) robust 사용자/견적 정보 매핑 (reservations/page.tsx 참고)
            const userIds = Array.from(new Set(rows.map((r: any) => r.re_user_id).filter(Boolean)));
            const quoteIds = Array.from(new Set(rows.map((r: any) => r.re_quote_id).filter(Boolean)));

            // 사용자 정보 robust하게 조회 및 맵 생성
            // 사용자 정보 청크 조회
            let usersData: any[] = [];
            if (userIds.length > 0) {
                const CHUNK_SIZE = 20;
                const chunks = [];
                for (let i = 0; i < userIds.length; i += CHUNK_SIZE) {
                    chunks.push(userIds.slice(i, i + CHUNK_SIZE));
                }
                const results = await Promise.all(chunks.map(async (chunk) => {
                    const { data } = await supabase
                        .from('users')
                        .select('id, name, email, phone_number, english_name, child_birth_dates')
                        .in('id', chunk);
                    return data || [];
                }));
                usersData = results.flat();
            }

            // robust userMap
            const userMap = new Map<string, { id: string; name: string; email: string; phone_number: string; english_name?: string; child_birth_dates?: string[] | null }>();
            usersData.forEach((u: any) => {
                if (u && u.id) {
                    userMap.set(u.id, {
                        id: u.id,
                        name: u.name || u.email?.split('@')[0] || `사용자_${u.id.substring(0, 8)}`,
                        email: u.email || '이메일 없음',
                        phone_number: u.phone_number || '',
                        english_name: u.english_name || undefined,
                        child_birth_dates: Array.isArray(u.child_birth_dates) ? u.child_birth_dates : [],
                    });
                }
            });

            // 견적 정보
            let quotesById: Record<string, any> = {};
            if (quoteIds.length > 0) {
                const CHUNK_SIZE = 20;
                const chunks = [];
                for (let i = 0; i < quoteIds.length; i += CHUNK_SIZE) {
                    chunks.push(quoteIds.slice(i, i + CHUNK_SIZE));
                }
                const results = await Promise.all(chunks.map(async (chunk) => {
                    const { data } = await supabase
                        .from('quote')
                        .select('id, title')
                        .in('id', chunk);
                    return data || [];
                }));
                const quotesData = results.flat();
                quotesData.forEach((q: any) => { quotesById[q.id] = q; });
            }

            // robust 최종 목록 구성
            let rawList = rows.map((r: any) => {
                // robust 사용자 정보
                let userInfo = r.re_user_id ? userMap.get(r.re_user_id) : null;
                let finalUserInfo: { id: string; name: string; email: string; phone: string; english_name?: string; child_birth_dates?: string[] | null } | null = null;

                if (userInfo) {
                    finalUserInfo = {
                        id: userInfo.id,
                        name: userInfo.name,
                        email: userInfo.email,
                        phone: (userInfo as any).phone_number || '',
                        english_name: (userInfo as any).english_name,
                        child_birth_dates: Array.isArray((userInfo as any).child_birth_dates) ? (userInfo as any).child_birth_dates : [],
                    };
                } else if (r.re_user_id) {
                    // 실시간 fallback 조회
                    finalUserInfo = {
                        id: r.re_user_id,
                        name: `데이터 없음_${r.re_user_id.substring(0, 8)}`,
                        email: '조회 실패',
                        phone: '',
                    };
                }

                return {
                    re_id: r.re_id,
                    re_type: r.re_type,
                    re_status: r.re_status,
                    re_created_at: r.re_created_at,
                    re_update_at: r.re_update_at ?? null,
                    re_quote_id: r.re_quote_id,
                    users: finalUserInfo,
                    quote: r.re_quote_id ? (quotesById[r.re_quote_id] || null) : null,
                };
            });

            // 추가 보정: 일부 예약에서 quote가 누락된 경우
            const missingQuoteIds = Array.from(new Set(rawList.filter(it => it.re_quote_id && !it.quote).map(it => it.re_quote_id!)));
            if (missingQuoteIds.length > 0) {
                try {
                    const CHUNK_SIZE = 20;
                    const chunks = [];
                    for (let i = 0; i < missingQuoteIds.length; i += CHUNK_SIZE) {
                        chunks.push(missingQuoteIds.slice(i, i + CHUNK_SIZE));
                    }
                    const results = await Promise.all(chunks.map(async (chunk) => {
                        const { data } = await supabase
                            .from('quote')
                            .select('id, title')
                            .in('id', chunk);
                        return data || [];
                    }));
                    const moreQuotes = results.flat();
                    (moreQuotes || []).forEach((q: any) => { quotesById[q.id] = q; });
                    rawList = rawList.map(it => ({ ...it, quote: it.re_quote_id ? (it.quote || quotesById[it.re_quote_id] || null) : null }));
                } catch (e) {
                    // 무시하고 기존 rawList 사용
                }
            }

            // 사용자(이메일)별로 그룹화
            const groupedByUser: Record<string, ReservationItem> = {};

            rawList.forEach((r: any) => {
                const groupKey = r.re_quote_id || r.re_id; // 예약 견적 ID별로 그룹화, 없으면 예약 ID 사용

                if (!groupedByUser[groupKey]) {
                    // 새로운 그룹 생성
                    groupedByUser[groupKey] = {
                        re_quote_id: r.re_quote_id,
                        re_created_at: r.re_created_at,
                        re_update_at: r.re_update_at ?? null,
                        users: r.users,
                        quote: r.quote,
                        services: []
                    };
                } else {
                    // 가장 최근 업데이트 시각 유지
                    const cur = groupedByUser[groupKey].re_update_at || '';
                    const inc = r.re_update_at || '';
                    if (inc > cur) groupedByUser[groupKey].re_update_at = inc;
                }

                // 서비스 추가
                groupedByUser[groupKey].services.push({
                    re_id: r.re_id,
                    re_type: r.re_type,
                    re_status: r.re_status
                });
            });

            let list: ReservationItem[] = Object.values(groupedByUser);

            // DB 레벨에서 이미 필터링되었으므로 빈 그룹만 제거
            list = list.filter((item) => item.services.length > 0);

            // 정렬 (업데이트일 기준)
            list.sort((a, b) => {
                if (sortType === 'date') {
                    const dateA = new Date(a.re_update_at || a.re_created_at).getTime();
                    const dateB = new Date(b.re_update_at || b.re_created_at).getTime();
                    return dateB - dateA;
                } else {
                    const nameA = (a.users?.name || '').toLowerCase();
                    const nameB = (b.users?.name || '').toLowerCase();
                    if (nameA < nameB) return -1;
                    if (nameA > nameB) return 1;
                    const dateA = new Date(a.re_update_at || a.re_created_at).getTime();
                    const dateB = new Date(b.re_update_at || b.re_created_at).getTime();
                    return dateB - dateA;
                }
            });

            // 이름/이메일 통합 검색 필터
            const q = searchQuery.trim().toLowerCase();
            if (q) {
                list = list.filter(item => {
                    const user = item.users;
                    return (
                        (user?.name && user.name.toLowerCase().includes(q)) ||
                        (user?.email && user.email.toLowerCase().includes(q)) ||
                        (item.quote?.title && item.quote.title.toLowerCase().includes(q)) ||
                        (item.services.some(s => s.re_id.toLowerCase().includes(q))) ||
                        (item.re_quote_id && item.re_quote_id.toLowerCase().includes(q))
                    );
                });
            }

            const totalFilteredServices = list.reduce((sum, item) => sum + item.services.length, 0);
            console.log('✅ 예약 데이터 로드/머지 완료:', list.length, '개 그룹 (필터 후', totalFilteredServices, '개 서비스 / 원본', rows.length, '개 서비스)');
            setReservations(list);
            setSelectedItems(new Set()); // 선택 초기화
            setError(null);

        } catch (error) {
            console.error('예약 목록 로드 실패:', error);
            setError('예약 목록을 불러오는 중 오류가 발생했습니다.');
            setReservations([]);
            setSelectedItems(new Set());
        } finally {
            setLoading(false);
        }
    };

    const handleSelectAll = () => {
        const allServiceIds = reservations.flatMap(r => r.services.map(s => s.re_id));
        const allSelected = allServiceIds.every(id => selectedItems.has(id));

        if (allSelected) {
            setSelectedItems(new Set());
        } else {
            setSelectedItems(new Set(allServiceIds));
        }
    };

    const handleSelectItem = (id: string) => {
        const newSelected = new Set(selectedItems);
        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }
        setSelectedItems(newSelected);
    };

    const handleViewDetails = async (reservation: ReservationItem) => {
        // 🔧 이전 모달 데이터 초기화 (stale 데이터 표시 방지)
        setReservationDetails(null);
        setModalUserServices([]);
        setModalKey(prev => prev + 1); // 🔧 모달 key 증가 → 컴포넌트 리마운트
        setModalLoading(true);
        setIsModalOpen(true);

        // 사용자 정보 설정
        setModalUserInfo({
            name: reservation.users?.name || '',
            email: reservation.users?.email || '',
            phone: reservation.users?.phone || '',
            english_name: reservation.users?.english_name || '',
            child_birth_dates: reservation.users?.child_birth_dates || [],
            quote_title: reservation.quote?.title || '여행명 없음',
            created_at: reservation.re_created_at
        });

        try {
            // 🔧 서비스 목록을 DB에서 최신으로 재조회 (state의 stale 데이터 대신 DB 직접 조회)
            let freshServices: ServiceReservation[] = reservation.services;
            if (reservation.re_quote_id) {
                const { data: freshRows } = await supabase
                    .from('reservation')
                    .select('re_id, re_type, re_status')
                    .eq('re_quote_id', reservation.re_quote_id)
                    .neq('re_type', 'car_sht');
                if (freshRows && freshRows.length > 0) {
                    freshServices = freshRows as ServiceReservation[];
                }
            }

            const allServiceIds = freshServices.map(s => s.re_id);
            if (allServiceIds.length === 0) {
                setModalUserServices([]);
                setReservationDetails({});
                setModalLoading(false);
                return;
            }

            // reservation 마스터 정보를 함께 로드해 total_amount/price_breakdown 기준으로 표시를 통일
            const { data: reservationMasters } = await supabase
                .from('reservation')
                .select('re_id, re_status, total_amount, price_breakdown, re_adult_count, re_child_count, re_infant_count')
                .in('re_id', allServiceIds);

            const reservationMasterMap = new Map((reservationMasters || []).map((row: any) => [row.re_id, row]));

            // 1. 필요한 모든 서비스 테이블에서 병렬 조회
            // 🔧 freshServices 사용 (DB에서 재조회한 최신 목록)
            const cruiseIds = freshServices.filter(s => s.re_type === 'cruise').map(s => s.re_id);
            const carIds = freshServices.filter(s => s.re_type === 'car').map(s => s.re_id);
            const airportIds = freshServices.filter(s => s.re_type === 'airport').map(s => s.re_id);
            const hotelIds = freshServices.filter(s => s.re_type === 'hotel').map(s => s.re_id);
            const rentcarIds = freshServices.filter(s => s.re_type === 'rentcar').map(s => s.re_id);
            const tourIds = freshServices.filter(s => s.re_type === 'tour').map(s => s.re_id);
            const shtIds = freshServices.filter(s => ['sht', 'car_sht', 'reservation_car_sht'].includes(s.re_type)).map(s => s.re_id);
            const packageIds = freshServices.filter(s => s.re_type === 'package').map(s => s.re_id);
            // 크루즈 차량 조회 대상: cruise reservation_id + car reservation_id
            const allCruiseCarQueryIds = [...cruiseIds, ...carIds];

            const [
                cruiseRes,
                cruiseCarRes, // 크루즈 차량
                airportRes,
                hotelRes,
                rentcarRes,
                tourRes,
                shtRes,
                // 패키지 예약은 package_id로 연결된 모든 서비스를 가져옴
                packageMainRes
            ] = await Promise.all([
                cruiseIds.length > 0 ? supabase.from('reservation_cruise').select('*').in('reservation_id', cruiseIds) : Promise.resolve({ data: [] }),
                allCruiseCarQueryIds.length > 0 ? supabase.from('reservation_cruise_car').select('*').in('reservation_id', allCruiseCarQueryIds) : Promise.resolve({ data: [] }),
                airportIds.length > 0 ? supabase.from('reservation_airport').select('*').in('reservation_id', airportIds) : Promise.resolve({ data: [] }),
                hotelIds.length > 0 ? supabase.from('reservation_hotel').select('*').in('reservation_id', hotelIds) : Promise.resolve({ data: [] }),
                rentcarIds.length > 0 ? supabase.from('reservation_rentcar').select('*').in('reservation_id', rentcarIds) : Promise.resolve({ data: [] }),
                tourIds.length > 0 ? supabase.from('reservation_tour').select('*').in('reservation_id', tourIds) : Promise.resolve({ data: [] }),
                shtIds.length > 0 ? supabase.from('reservation_car_sht').select('*').in('reservation_id', shtIds) : Promise.resolve({ data: [] }),
                packageIds.length > 0 ? supabase.from('reservation').select('*, package_master:package_id(id, package_code, name, description)').in('re_id', packageIds) : Promise.resolve({ data: [] })
            ]);

            // 패키지 예약인 경우, 패키지에 속한 서비스도 조회
            let packageCruiseData: any[] = [];
            let packageAirportData: any[] = [];
            let packageTourData: any[] = [];
            let packageHotelData: any[] = [];
            let packageRentcarData: any[] = [];
            let packageShtData: any[] = [];
            let packageDetailData: any[] = [];

            if (packageIds.length > 0) {
                const [pkgCruise, pkgAirport, pkgTour, pkgHotel, pkgRentcar, pkgSht, pkgDetail] = await Promise.all([
                    supabase.from('reservation_cruise').select('*').in('reservation_id', packageIds),
                    supabase.from('reservation_airport').select('*').in('reservation_id', packageIds),
                    supabase.from('reservation_tour').select('*').in('reservation_id', packageIds),
                    supabase.from('reservation_hotel').select('*').in('reservation_id', packageIds),
                    supabase.from('reservation_rentcar').select('*').in('reservation_id', packageIds),
                    supabase.from('reservation_car_sht').select('*').in('reservation_id', packageIds),
                    supabase.from('reservation_package').select('*').in('reservation_id', packageIds)
                ]);
                packageCruiseData = pkgCruise.data || [];
                packageAirportData = pkgAirport.data || [];
                packageTourData = pkgTour.data || [];
                packageHotelData = pkgHotel.data || [];
                packageRentcarData = pkgRentcar.data || [];
                packageShtData = pkgSht.data || [];
                packageDetailData = pkgDetail.data || [];
            }

            // 2. 가격/코드 정보 조회 (필요 시)
            const cruiseData = cruiseRes.data || [];
            const tourData = tourRes.data || [];
            const hotelData = hotelRes.data || [];
            const rentCarData = rentcarRes.data || [];
            const airportData = airportRes.data || [];

            const cruiseCodes = [...cruiseData, ...packageCruiseData].map((r: any) => r.room_price_code).filter(Boolean);
            const tourCodes = [...tourData, ...packageTourData].map((r: any) => r.tour_price_code).filter(Boolean);
            const hotelCodes = [...hotelData, ...packageHotelData].map((r: any) => r.hotel_price_code).filter(Boolean);
            const rentCodes = [...rentCarData, ...packageRentcarData].map((r: any) => r.rentcar_price_code).filter(Boolean);
            const airportCodes = [...airportData, ...packageAirportData].map((r: any) => r.airport_price_code).filter(Boolean);
            const cruiseCarData = cruiseCarRes.data || [];
            // car_price_code에는 rentcar_price.rent_code 값이 저장됨
            const cruiseCarCodes = cruiseCarData.map((c: any) => c.rentcar_price_code || c.car_price_code).filter(Boolean);

            const [roomPrices, roomPricesByRoomType, tourPriceRows, hotelPrices, rentPrices, airportPrices, carPrices] = await Promise.all([
                cruiseCodes.length > 0 ? supabase.from('cruise_rate_card').select('id, cruise_name, room_type, price_adult, price_child, price_infant, price_extra_bed, price_single, price_child_extra_bed').in('id', cruiseCodes) : Promise.resolve({ data: [] }),
                cruiseCodes.length > 0 ? supabase.from('cruise_rate_card').select('id, cruise_name, room_type, price_adult, price_child, price_infant, price_extra_bed, price_single, price_child_extra_bed').in('room_type', cruiseCodes) : Promise.resolve({ data: [] }),
                tourCodes.length > 0 ? supabase.from('tour_pricing').select('pricing_id, tour_id, price_per_person').in('pricing_id', tourCodes) : Promise.resolve({ data: [] }),
                hotelCodes.length > 0 ? supabase.from('hotel_price').select('hotel_price_code, base_price, hotel_name, room_name').in('hotel_price_code', hotelCodes) : Promise.resolve({ data: [] }),
                rentCodes.length > 0 ? supabase.from('rentcar_price').select('rent_code, vehicle_type, way_type, route, price').in('rent_code', rentCodes) : Promise.resolve({ data: [] }),
                airportCodes.length > 0 ? supabase.from('airport_price').select('airport_code, service_type, route, vehicle_type, price').in('airport_code', airportCodes) : Promise.resolve({ data: [] }),
                // 크루즈 차량 코드는 rentcar_price.rent_code 기준
                cruiseCarCodes.length > 0 ? supabase.from('rentcar_price').select('rent_code, vehicle_type, way_type, route, price, category').in('rent_code', cruiseCarCodes) : Promise.resolve({ data: [] })
            ]);

            const tourIdsForName = Array.from(new Set((tourPriceRows.data || []).map((row: any) => row.tour_id).filter(Boolean)));
            const { data: tourNameRows } = tourIdsForName.length > 0
                ? await supabase.from('tour').select('tour_id, tour_name, tour_code').in('tour_id', tourIdsForName)
                : { data: [] as any[] };

            const roomPriceMap = new Map((roomPrices.data || []).map((r: any) => [r.id, r]));
            (roomPricesByRoomType.data || []).forEach((r: any) => {
                if (r?.room_type && !roomPriceMap.has(r.room_type)) {
                    roomPriceMap.set(r.room_type, r);
                }
            });
            const tourById = new Map((tourNameRows || []).map((row: any) => [row.tour_id, row]));
            const tourPriceMap = new Map((tourPriceRows.data || []).map((row: any) => [row.pricing_id, { ...row, tour: tourById.get(row.tour_id) }]));
            const hotelPriceMap = new Map((hotelPrices.data || []).map((r: any) => [r.hotel_price_code, r]));
            const rentPriceMap = new Map((rentPrices.data || []).map((r: any) => [r.rent_code, r]));
            const airportPriceMap = new Map((airportPrices.data || []).map((r: any) => [r.airport_code, r]));
            const carPriceMap = new Map((carPrices.data || []).map((r: any) => [r.rent_code, r]));
            const packageDetailMap = new Map(packageDetailData.map((r: any) => [r.reservation_id, r]));
            const getAirportPriceInfo = (row: any) => {
                const rows = airportPrices.data || [];
                const way = String(row?.way_type || row?.ra_way_type || '').toLowerCase();
                const serviceType = way.includes('pickup') || way.includes('entry') || way.includes('픽업') ? '픽업'
                    : way.includes('sending') || way.includes('sanding') || way.includes('exit') || way.includes('샌딩') ? '샌딩'
                        : '';
                return rows.find((price: any) => price.airport_code === row.airport_price_code && (!serviceType || price.service_type === serviceType))
                    || rows.find((price: any) => price.airport_code === row.airport_price_code);
            };

            // 3. 데이터 구조화 (UserReservationDetailModal과 호환되게)
            // reservationDetails 상태는 flattenedServices useMemo에서 다시 평탄화되므로,
            // 여기서는 타입별로 그룹화해서 넣어주면 됨.
            const allDetails: Record<string, any[]> = {};

            // 헬퍼: base service info 찾기 (🔧 freshServices 사용)
            const getServiceBase = (reId: string) => {
                const base: any = freshServices.find(s => s.re_id === reId) || null;
                const master: any = reservationMasterMap.get(reId) || null;
                return {
                    ...(base || {}),
                    ...(master || {}),
                };
            };

            // Cruise
            if (cruiseData.length > 0) {
                allDetails['cruise'] = cruiseData.map((r: any) => {
                    const priceInfo = roomPriceMap.get(r.room_price_code);
                    const carInfo = (cruiseCarRes.data || []).filter((c: any) => c.reservation_id === r.reservation_id);
                    const serviceBase = getServiceBase(r.reservation_id);
                    return {
                        service: serviceBase,
                        ...r,
                        total_amount: serviceBase?.total_amount ?? null,
                        price_breakdown: serviceBase?.price_breakdown ?? null,
                        re_adult_count: serviceBase?.re_adult_count ?? null,
                        re_child_count: serviceBase?.re_child_count ?? null,
                        re_infant_count: serviceBase?.re_infant_count ?? null,
                        roomPriceInfo: priceInfo,
                        cars: carInfo // 크루즈 차량 정보 포함
                    };
                });
            }

            // Cruise Car (크루즈 차량) - 별도 서비스로 표시
            if (cruiseCarData.length > 0) {
                allDetails['vehicle'] = cruiseCarData.map((r: any) => {
                    const code = r.rentcar_price_code || r.car_price_code;
                    const priceInfo = carPriceMap.get(code);
                    // SHT 차량 매칭
                    const shtDetail = (shtRes.data || []).find((s: any) => s.reservation_id === r.reservation_id) || null;
                    return {
                        service: getServiceBase(r.reservation_id),
                        ...r,
                        carPriceInfo: priceInfo,
                        shtDetail
                    };
                });
            }

            // car 타입 예약 중 reservation_cruise_car에 데이터가 없는 경우 기본 정보로 표시 (누락 방지)
            if (carIds.length > 0) {
                const representedIds = new Set((allDetails['vehicle'] || []).map((r: any) => r.reservation_id));
                const missingCarIds = carIds.filter((id: string) => !representedIds.has(id));
                if (missingCarIds.length > 0) {
                    const fallbackItems = missingCarIds.map((id: string) => ({
                        service: getServiceBase(id),
                        reservation_id: id,
                        carPriceInfo: null,
                        shtDetail: null,
                    }));
                    allDetails['vehicle'] = [...(allDetails['vehicle'] || []), ...fallbackItems];
                }
            }

            // Airport
            if (airportData.length > 0) {
                allDetails['airport'] = airportData.map((r: any) => {
                    const priceInfo = getAirportPriceInfo(r) || airportPriceMap.get(r.airport_price_code);
                    return {
                        service: getServiceBase(r.reservation_id),
                        ...r,
                        airportPriceInfo: priceInfo
                    };
                });
            }

            // Hotel
            if (hotelData.length > 0) {
                allDetails['hotel'] = hotelData.map((r: any) => {
                    const priceInfo = hotelPriceMap.get(r.hotel_price_code);
                    return {
                        service: getServiceBase(r.reservation_id),
                        ...r,
                        hotelPriceInfo: priceInfo
                    };
                });
            }

            // Rentcar
            if (rentCarData.length > 0) {
                allDetails['rentcar'] = rentCarData.map((r: any) => {
                    const priceInfo = rentPriceMap.get(r.rentcar_price_code);
                    return {
                        service: getServiceBase(r.reservation_id),
                        ...r,
                        rentcarPriceInfo: priceInfo
                    };
                });
            }

            // Tour
            if (tourData.length > 0) {
                allDetails['tour'] = tourData.map((r: any) => {
                    const priceInfo = tourPriceMap.get(r.tour_price_code);
                    return {
                        service: getServiceBase(r.reservation_id),
                        ...r,
                        tourPriceInfo: priceInfo
                    };
                });
            }

            // SHT (스하차량)
            const shtData = shtRes.data || [];
            if (shtData.length > 0) {
                allDetails['sht'] = shtData.map((r: any) => ({
                    service: getServiceBase(r.reservation_id),
                    ...r
                }));
            }

            // 패키지 예약 처리
            const packageMainData = packageMainRes.data || [];
            if (packageMainData.length > 0 || packageCruiseData.length > 0 || packageAirportData.length > 0 || packageTourData.length > 0 || packageShtData.length > 0) {
                // 패키지 마스터 정보
                allDetails['package'] = packageMainData.map((r: any) => ({
                    service: getServiceBase(r.re_id),
                    ...r,
                    package_name: r.package_master?.name || '',
                    package_code: r.package_master?.package_code || '',
                    package_description: r.package_master?.description || '',
                    ...(packageDetailMap.get(r.re_id) || {})
                }));

                // 패키지에 속한 서비스들 추가
                if (packageCruiseData.length > 0) {
                    allDetails['package_cruise'] = packageCruiseData.map((r: any) => {
                        const priceInfo = roomPriceMap.get(r.room_price_code);
                        return {
                            service: getServiceBase(r.reservation_id),
                            ...r,
                            roomPriceInfo: priceInfo,
                            isPackageService: true
                        };
                    });
                }
                if (packageAirportData.length > 0) {
                    allDetails['package_airport'] = packageAirportData.map((r: any) => {
                        const priceInfo = getAirportPriceInfo(r) || airportPriceMap.get(r.airport_price_code);
                        return {
                            service: getServiceBase(r.reservation_id),
                            ...r,
                            airportPriceInfo: priceInfo,
                            isPackageService: true
                        };
                    });
                }
                if (packageTourData.length > 0) {
                    allDetails['package_tour'] = packageTourData.map((r: any) => {
                        const priceInfo = tourPriceMap.get(r.tour_price_code);
                        return {
                            service: getServiceBase(r.reservation_id),
                            ...r,
                            tourPriceInfo: priceInfo,
                            isPackageService: true
                        };
                    });
                }
                if (packageHotelData.length > 0) {
                    allDetails['package_hotel'] = packageHotelData.map((r: any) => {
                        const priceInfo = hotelPriceMap.get(r.hotel_price_code);
                        return {
                            service: getServiceBase(r.reservation_id),
                            ...r,
                            hotelPriceInfo: priceInfo,
                            isPackageService: true
                        };
                    });
                }
                if (packageRentcarData.length > 0) {
                    allDetails['package_rentcar'] = packageRentcarData.map((r: any) => {
                        const priceInfo = rentPriceMap.get(r.rentcar_price_code);
                        return {
                            service: getServiceBase(r.reservation_id),
                            ...r,
                            rentcarPriceInfo: priceInfo,
                            isPackageService: true
                        };
                    });
                }
                if (packageShtData.length > 0) {
                    allDetails['package_sht'] = packageShtData.map((r: any) => ({
                        service: getServiceBase(r.reservation_id),
                        ...r,
                        isPackageService: true,
                    }));
                }
            }

            setReservationDetails(allDetails);

            // 모달에 전달할 flattened list를 위해 (기존 흐름 유지)
            // 단, 여기서는 setModalUserServices는 단순 re_id 리스트가 아니라 full enriched object가 필요할 수도 있지만,
            // UserReservationDetailModal은 flattenedServices(== reservationDetails 기반)를 사용하도록 page.tsx가 수정되었음.
            // 따라서 setModalUserServices는 크게 중요하지 않거나, 참조용으로만 쓰임.
            // 하지만 기존 로직 호환성을 위해...
            setModalUserServices(reservation.services); // 기본 서비스 리스트만 설정해둠

        } catch (error) {
            console.error('예약 상세 정보 로드 실패:', error);
            setReservationDetails({ error: '상세 정보를 불러올 수 없습니다.' });
        } finally {
            setModalLoading(false);
        }
    };

    const closeDetailsModal = () => {
        setIsModalOpen(false);
        setModalUserInfo(null);
        setModalUserServices([]);
        setReservationDetails(null);
    };

    // 서비스별 금액 계산 함수 (total_amount가 없을 때 사용)
    const calculateServiceAmount = async (reservationId: string, reservationType: string): Promise<number> => {
        let total = 0;
        try {
            if (reservationType === 'cruise') {
                const { data } = await supabase.from('reservation_cruise').select('room_total_price, room_price_code, guest_count').eq('reservation_id', reservationId);
                for (const r of (data || [])) {
                    if (r.room_total_price && Number(r.room_total_price) > 0) { total += Number(r.room_total_price); }
                    else if (r.room_price_code) {
                        const { data: p } = await supabase.from('cruise_rate_card').select('price_adult').eq('id', r.room_price_code).maybeSingle();
                        if (p?.price_adult) total += Number(p.price_adult) * (Number(r.guest_count) || 1);
                    }
                }
            }
            if (reservationType === 'vehicle' || reservationType === 'cruise' || reservationType === 'car') {
                const { data } = await supabase.from('reservation_cruise_car').select('car_total_price, car_price_code, rentcar_price_code, car_count').eq('reservation_id', reservationId);
                for (const r of (data || [])) {
                    if (r.car_total_price && Number(r.car_total_price) > 0) { total += Number(r.car_total_price); }
                    else if (r.rentcar_price_code || r.car_price_code) {
                        const priceCode = r.rentcar_price_code || r.car_price_code;
                        const { data: p } = await supabase.from('rentcar_price').select('price').eq('rent_code', priceCode).maybeSingle();
                        if (p?.price) total += Number(p.price) * (Number(r.car_count) || 1);
                    }
                }
            }
            if (reservationType === 'sht' || reservationType === 'car_sht') {
                const { data } = await supabase.from('reservation_car_sht').select('car_total_price, unit_price, car_count, car_price_code').eq('reservation_id', reservationId);
                for (const r of (data || [])) {
                    if (r.car_total_price && Number(r.car_total_price) > 0) { total += Number(r.car_total_price); }
                    else if (r.unit_price && Number(r.unit_price) > 0) { total += Number(r.unit_price) * (Number(r.car_count) || 1); }
                    else if (r.car_price_code) {
                        const { data: p } = await supabase.from('rentcar_price').select('price').eq('rent_code', r.car_price_code).maybeSingle();
                        if (p?.price) total += Number(p.price) * (Number(r.car_count) || 1);
                    }
                }
            }
            if (reservationType === 'airport') {
                const { data } = await supabase.from('reservation_airport').select('total_price, airport_price_code, ra_passenger_count').eq('reservation_id', reservationId);
                for (const r of (data || [])) {
                    if (r.total_price && Number(r.total_price) > 0) { total += Number(r.total_price); }
                    else if (r.airport_price_code) {
                        const { data: p } = await supabase.from('airport_price').select('price').eq('airport_code', r.airport_price_code).maybeSingle();
                        if (p?.price) total += Number(p.price) * (Number(r.ra_passenger_count) || 1);
                    }
                }
            }
            if (reservationType === 'hotel') {
                const { data } = await supabase.from('reservation_hotel').select('total_price, hotel_price_code, room_count').eq('reservation_id', reservationId);
                for (const r of (data || [])) {
                    if (r.total_price && Number(r.total_price) > 0) { total += Number(r.total_price); }
                    else if (r.hotel_price_code) {
                        const { data: p } = await supabase.from('hotel_price').select('base_price').eq('hotel_price_code', r.hotel_price_code).maybeSingle();
                        if (p?.base_price) total += Number(p.base_price) * (Number(r.room_count) || 1);
                    }
                }
            }
            if (reservationType === 'rentcar') {
                const { data } = await supabase.from('reservation_rentcar').select('total_price, rentcar_price_code, rental_days, rentcar_count').eq('reservation_id', reservationId);
                for (const r of (data || [])) {
                    if (r.total_price && Number(r.total_price) > 0) { total += Number(r.total_price); }
                    else if (r.rentcar_price_code) {
                        const { data: p } = await supabase.from('rentcar_price').select('price').eq('rent_code', r.rentcar_price_code).maybeSingle();
                        if (p?.price) total += Number(p.price) * (Number(r.rental_days) || 1) * (Number(r.rentcar_count) || 1);
                    }
                }
            }
            if (reservationType === 'tour') {
                const { data } = await supabase.from('reservation_tour').select('total_price, tour_price_code, tour_capacity').eq('reservation_id', reservationId);
                for (const r of (data || [])) {
                    if (r.total_price && Number(r.total_price) > 0) { total += Number(r.total_price); }
                    else if (r.tour_price_code) {
                        const { data: p } = await supabase.from('tour_pricing').select('price_per_person').eq('pricing_id', r.tour_price_code).maybeSingle();
                        if (p?.price_per_person) total += Number(p.price_per_person) * (Number(r.tour_capacity) || 1);
                    }
                }
            }
        } catch (err) {
            console.error('서비스 금액 계산 오류:', reservationId, err);
        }
        return total;
    };

    // 결제 레코드 생성 함수 (확정 처리 시 호출)
    const createPaymentRecords = async (reservationIds: string[]) => {
        try {
            // 1. 해당 예약들의 상세 정보 조회
            const CHUNK = 100;
            let allReservations: any[] = [];
            for (let i = 0; i < reservationIds.length; i += CHUNK) {
                const chunk = reservationIds.slice(i, i + CHUNK);
                const { data } = await supabase
                    .from('reservation')
                    .select('re_id, re_user_id, re_quote_id, re_type, total_amount')
                    .in('re_id', chunk);
                allReservations = allReservations.concat(data || []);
            }

            // 2. 이미 결제 레코드가 있는 예약 제외
            const existingResIds = new Set<string>();
            for (let i = 0; i < reservationIds.length; i += CHUNK) {
                const chunk = reservationIds.slice(i, i + CHUNK);
                const { data } = await supabase
                    .from('reservation_payment')
                    .select('reservation_id')
                    .in('reservation_id', chunk);
                (data || []).forEach(p => existingResIds.add(p.reservation_id));
            }

            const newReservations = allReservations.filter(r => !existingResIds.has(r.re_id));
            if (newReservations.length === 0) {
                console.log('📋 결제 레코드 생성 대상 없음 (모두 이미 존재)');
                return 0;
            }

            // 3. total_amount가 0인 예약은 금액 계산
            for (const reservation of newReservations) {
                if (!reservation.total_amount || Number(reservation.total_amount) === 0) {
                    const calculated = await calculateServiceAmount(reservation.re_id, reservation.re_type);
                    if (calculated > 0) {
                        await supabase.from('reservation').update({ total_amount: calculated }).eq('re_id', reservation.re_id);
                        reservation.total_amount = calculated;
                    }
                }
            }

            // 4. 개별 결제 레코드 생성
            const paymentRecords = newReservations.map(r => ({
                id: crypto.randomUUID(),
                reservation_id: r.re_id,
                quote_id: r.re_quote_id || null,
                user_id: r.re_user_id,
                amount: Number(r.total_amount) || 0,
                payment_method: 'BANK',
                payment_status: 'pending',
                memo: `자동 생성 - ${r.re_type} | ${r.re_quote_id ? `견적 ${r.re_quote_id}` : `개별예약 ${String(r.re_id).slice(0, 8)}`} (${new Date().toLocaleDateString()})`,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }));

            // 5. 배치 삽입
            for (let i = 0; i < paymentRecords.length; i += CHUNK) {
                const chunk = paymentRecords.slice(i, i + CHUNK);
                const { error } = await supabase.from('reservation_payment').insert(chunk);
                if (error) {
                    console.error('결제 레코드 삽입 오류:', error);
                    throw error;
                }
            }

            console.log(`✅ ${paymentRecords.length}개 결제 레코드 생성 완료`);
            return paymentRecords.length;
        } catch (err) {
            console.error('결제 레코드 생성 실패:', err);
            throw err;
        }
    };

    const handleStepProgressAction = async () => {
        if (selectedItems.size === 0) {
            alert('처리할 항목을 선택해주세요.');
            return;
        }

        if (!confirm(`선택한 ${selectedItems.size}건에 대해 단계 처리(대기→승인, 승인→확정)를 진행하시겠습니까?`)) {
            return;
        }

        setProcessing(true);
        setError(null);

        try {
            const selectedIds = Array.from(selectedItems);
            const statusById = new Map(
                reservations.flatMap((item) => item.services.map((service) => [service.re_id, service.re_status] as const))
            );

            const pendingIds = selectedIds.filter((id) => normalizeReservationStatus(statusById.get(id)) === 'pending');
            const approvedIds = selectedIds.filter((id) => normalizeReservationStatus(statusById.get(id)) === 'approved');

            if (pendingIds.length === 0 && approvedIds.length === 0) {
                alert('선택 항목 중 단계 처리 가능한 상태(대기/승인)가 없습니다.');
                return;
            }

            const BATCH_SIZE = 100;

            for (let i = 0; i < pendingIds.length; i += BATCH_SIZE) {
                const batch = pendingIds.slice(i, i + BATCH_SIZE);
                const { data, error } = await supabase
                    .from('reservation')
                    .update({ re_status: 'approved' })
                    .in('re_id', batch)
                    .select('re_id');
                if (error) {
                    throw new Error(`대기→승인 처리 실패: ${error.message}`);
                }
                if ((data?.length || 0) === 0) {
                    throw new Error('대기→승인 처리 실패: 변경된 예약이 없습니다. 권한(RLS) 또는 선택 항목을 확인해주세요.');
                }
            }

            for (let i = 0; i < approvedIds.length; i += BATCH_SIZE) {
                const batch = approvedIds.slice(i, i + BATCH_SIZE);
                const { data, error } = await supabase
                    .from('reservation')
                    .update({ re_status: 'confirmed' })
                    .in('re_id', batch)
                    .select('re_id');
                if (error) {
                    throw new Error(`승인→확정 처리 실패: ${error.message}`);
                }
                if ((data?.length || 0) === 0) {
                    throw new Error('승인→확정 처리 실패: 변경된 예약이 없습니다. 권한(RLS) 또는 선택 항목을 확인해주세요.');
                }
            }

            let paymentMsg = '';
            const progressedIds = [...pendingIds, ...approvedIds];

            // 상태 변경 로그는 DB 트리거(trg_reservation_status_change)가 자동 기록

            if (progressedIds.length > 0) {
                try {
                    const createdCount = await createPaymentRecords(progressedIds);
                    if (createdCount > 0) {
                        paymentMsg = `\n💰 ${createdCount}개의 결제 레코드가 자동 생성되었습니다.`;
                    }
                } catch (paymentError) {
                    console.error('결제 레코드 생성 중 오류:', paymentError);
                    paymentMsg = '\n⚠️ 결제 레코드 생성 중 일부 오류가 발생했습니다. 결제 관리 페이지에서 확인해주세요.';
                }
            }

            alert(`단계 처리 완료\n- 대기→승인: ${pendingIds.length}건\n- 승인→확정: ${approvedIds.length}건${paymentMsg}`);
            setSelectedItems(new Set());
            await loadReservations();
        } catch (error: any) {
            console.error('🛠️ Step Progress Error:', error);
            setError(`처리 중 오류가 발생했습니다: ${error.message || '알 수 없는 오류'}`);
            alert(`처리 중 오류가 발생했습니다: ${error.message || '알 수 없는 오류'}`);
        } finally {
            setProcessing(false);
        }
    };

    const handleBulkAction = async (actionOverride?: BulkAction) => {
        // actionOverride가 문자열이 아닌 경우(예: MouseEvent) 무시
        const action: BulkAction = (typeof actionOverride === 'string' ? actionOverride : null) || bulkAction;
        if (!action) {
            alert('작업을 선택해주세요.');
            return;
        }
        if (action === 'status_update' && !newStatus) {
            alert('새 상태를 선택해주세요.');
            return;
        }
        const targetStatus = normalizeReservationStatus(newStatus);

        if (selectedItems.size === 0) {
            alert('처리할 항목을 선택해주세요.');
            return;
        }

        const actionText = {
            delete: '삭제',
            status_update: `${STATUS_LABELS[targetStatus] || '상태'} 변경`
        }[action] || '처리';

        if (!confirm(`선택한 ${selectedItems.size}건의 예약을 ${actionText} 처리하시겠습니까?`)) {
            return;
        }

        setProcessing(true);
        setError(null);

        try {
            const selectedIds = Array.from(selectedItems);
            const statusById = new Map(
                reservations.flatMap((item) => item.services.map((service) => [service.re_id, service.re_status] as const))
            );
            console.log(`🚀 Bulk Action: ${action}, Count: ${selectedIds.length}`, selectedIds);

            // Supabase/PostgREST URL 길이 제한을 피하기 위해 배치를 100개씩나눔
            const BATCH_SIZE = 100;
            const batches = [];
            for (let i = 0; i < selectedIds.length; i += BATCH_SIZE) {
                batches.push(selectedIds.slice(i, i + BATCH_SIZE));
            }

            console.log(`📦 Chunking into ${batches.length} batches (size: ${BATCH_SIZE})`);

            for (let i = 0; i < batches.length; i++) {
                const batch = batches[i];
                console.log(`⏳ Processing batch ${i + 1}/${batches.length}...`);

                let result;

                switch (action) {
                    case 'delete':
                        {
                            const detailTables = [
                                'reservation_payment',
                                'reservation_cruise',
                                'reservation_cruise_car',
                                'reservation_car_sht',
                                'reservation_airport',
                                'reservation_hotel',
                                'reservation_tour',
                                'reservation_rentcar',
                            ] as const;

                            for (const table of detailTables) {
                                const { error: detailError } = await supabase
                                    .from(table)
                                    .delete()
                                    .in('reservation_id', batch);
                                if (detailError) {
                                    throw new Error(`${table} 삭제 실패: ${detailError.message}`);
                                }
                            }

                            result = await supabase
                                .from('reservation')
                                .delete()
                                .in('re_id', batch)
                                .select('re_id');
                        }
                        break;

                    case 'status_update':
                        result = await supabase
                            .from('reservation')
                            .update({ re_status: targetStatus })
                            .in('re_id', batch)
                            .select('re_id');
                        break;

                    default:
                        throw new Error(`알 수 없는 액션: ${action}`);
                }

                if (result?.error) {
                    throw new Error(`배치 ${i + 1} 처리 실패: ${result.error.message}`);
                }

                if ((result?.data?.length || 0) === 0) {
                    throw new Error(`배치 ${i + 1} 처리 실패: 변경된 예약이 없습니다. 권한(RLS) 또는 선택 항목을 확인해주세요.`);
                }
            }

            console.log(`✅ Bulk Action Success: ${action}`);

            // 상태 변경 로그는 DB 트리거(trg_reservation_status_change)가 자동 기록

            // 상태 변경에서 승인/확정으로 바뀐 경우 결제 레코드 자동 생성
            let paymentMsg = '';
            if (action === 'status_update' && (targetStatus === 'approved' || targetStatus === 'confirmed')) {
                try {
                    const createdCount = await createPaymentRecords(selectedIds);
                    if (createdCount > 0) {
                        paymentMsg = `\n💰 ${createdCount}개의 결제 레코드가 자동 생성되었습니다.`;
                    }
                } catch (paymentError) {
                    console.error('결제 레코드 생성 중 오류:', paymentError);
                    paymentMsg = '\n⚠️ 결제 레코드 생성 중 일부 오류가 발생했습니다. 결제 관리 페이지에서 확인해주세요.';
                }
            }

            alert(`${selectedItems.size}건의 예약이 성공적으로 ${actionText} 처리되었습니다.${paymentMsg}`);
            setSelectedItems(new Set());
            await loadReservations(); // 목록 새로고침

        } catch (error: any) {
            console.error('🛠️ Bulk Action Error:', error);
            setError(`처리 중 오류가 발생했습니다: ${error.message || '알 수 없는 오류'}`);
            alert(`처리 중 오류가 발생했습니다: ${error.message || '알 수 없는 오류'}`);
        } finally {
            setProcessing(false);
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'approved': return <Clock className="w-4 h-4 text-blue-600" />;
            case 'confirmed': return <CheckCircle className="w-4 h-4 text-green-600" />;
            case 'completed': return <CheckCircle className="w-4 h-4 text-gray-600" />;
            case 'cancelled': return <XCircle className="w-4 h-4 text-red-600" />;
            default: return <Clock className="w-4 h-4 text-yellow-600" />;
        }
    };

    const getStatusText = (status: string) => {
        switch (status) {
            case 'pending': return '대기중';
            case 'approved': return '승인';
            case 'confirmed': return '확정';
            case 'completed': return '완료';
            case 'cancelled': return '취소됨';
            default: return status;
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'approved': return 'bg-blue-100 text-blue-800';
            case 'confirmed': return 'bg-green-100 text-green-800';
            case 'completed': return 'bg-gray-100 text-gray-800';
            case 'cancelled': return 'bg-red-100 text-red-800';
            default: return 'bg-yellow-100 text-yellow-800';
        }
    };

    const getTypeIcon = (type: string) => {
        switch (type) {
            case 'cruise': return <Ship className="w-3.5 h-3.5 text-blue-600" />;
            case 'airport': return <Plane className="w-3.5 h-3.5 text-green-600" />;
            case 'hotel': return <Building className="w-3.5 h-3.5 text-purple-600" />;
            case 'tour': return <MapPin className="w-3.5 h-3.5 text-orange-600" />;
            case 'rentcar': return <Car className="w-3.5 h-3.5 text-red-600" />;
            case 'car':
            case 'vehicle': return <Car className="w-3.5 h-3.5 text-blue-600" />;
            case 'sht':
            case 'car_sht':
            case 'reservation_car_sht':
                return <Bus className="w-3.5 h-3.5 text-indigo-600" />;
            case 'package': return <Package className="w-3.5 h-3.5 text-pink-600" />;
            default: return <Clock className="w-3.5 h-3.5 text-gray-600" />;
        }
    };

    const getTypeName = (type: string) => {
        switch (type) {
            case 'cruise': return '크루즈';
            case 'airport': return '공항';
            case 'hotel': return '호텔';
            case 'tour': return '투어';
            case 'rentcar': return '렌터카';
            case 'car':
            case 'vehicle': return '크루즈 차량';
            case 'sht':
            case 'car_sht':
            case 'reservation_car_sht':
                return '스하차량';
            case 'package': return '패키지';
            default: return type;
        }
    };

    const getTypeBadgeStyle = (type: string) => {
        switch (type) {
            case 'cruise': return 'bg-blue-100 text-blue-800';
            case 'airport': return 'bg-green-100 text-green-800';
            case 'hotel': return 'bg-purple-100 text-purple-800';
            case 'tour': return 'bg-orange-100 text-orange-800';
            case 'rentcar': return 'bg-red-100 text-red-800';
            case 'car':
            case 'vehicle': return 'bg-cyan-100 text-cyan-800';
            case 'sht':
            case 'car_sht':
            case 'reservation_car_sht':
                return 'bg-indigo-100 text-indigo-800';
            case 'package': return 'bg-pink-100 text-pink-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    const flattenedServices = useMemo(() => {
        if (!reservationDetails || reservationDetails.error) return [];
        return Object.entries(reservationDetails).flatMap(([type, items]) => {
            if (!Array.isArray(items)) return [];
            return items.map((item: any) => {
                // item is the enriched object from handleViewDetails
                // 패키지 서비스 타입 정규화: package_cruise -> cruise 등
                let normalizedType = type;
                const isPackageService = type.startsWith('package_');
                if (isPackageService) {
                    normalizedType = type.replace('package_', '');
                }

                const mapped = {
                    ...item,
                    serviceType: normalizedType === 'car_sht' || normalizedType === 'reservation_car_sht' ? 'sht'
                        : normalizedType === 'car' ? 'vehicle'
                            : normalizedType,
                    isPackageService: isPackageService || item.isPackageService,
                    // Common fields
                    pickupLocation: item.pickup_location,
                    dropoffLocation: item.dropoff_location,
                    note: item.request_note || item.note,
                };

                // Specific Mappings based on type to match UserReservationDetailModal expectations
                if (normalizedType === 'cruise') {
                    // reservation_cruise 실제 인원 (마스터 re_adult_count보다 우선)
                    const adultCount = item.adult_count ?? item.re_adult_count ?? item.service?.re_adult_count ?? 0;
                    const childCount = item.child_count ?? item.re_child_count ?? item.service?.re_child_count ?? 0;
                    const infantCount = item.infant_count ?? item.re_infant_count ?? item.service?.re_infant_count ?? 0;
                    const extraBedCount = item.extra_bed_count || 0;
                    const singleCount = item.single_count || 0;
                    const childExtraBedCount = item.child_extra_bed_count || 0;

                    // price_breakdown count 교정: 예약 수정 시 pb가 갱신 안 될 수 있으므로 실제 인원으로 재계산
                    let pb = item.price_breakdown || item.service?.price_breakdown || null;
                    if (pb) {
                        const uA = item.roomPriceInfo?.price_adult || pb.adult?.unit_price || 0;
                        const uC = item.roomPriceInfo?.price_child || pb.child?.unit_price || 0;
                        const uI = item.roomPriceInfo?.price_infant || pb.infant?.unit_price || 0;
                        const uE = item.roomPriceInfo?.price_extra_bed || pb.extra_bed?.unit_price || 0;
                        const uS = item.roomPriceInfo?.price_single || pb.single?.unit_price || 0;
                        const uCE = item.roomPriceInfo?.price_child_extra_bed || pb.child_extra_bed?.unit_price || 0;
                        const tA = uA * adultCount;
                        const tC = uC * childCount;
                        const tI = uI * infantCount;
                        const tE = uE * extraBedCount;
                        const tS = uS * singleCount;
                        const tCE = uCE * childExtraBedCount;
                        const subtotal = tA + tC + tI + tE + tS + tCE;
                        pb = {
                            ...pb,
                            adult: adultCount > 0 ? { ...(pb.adult || {}), unit_price: uA, count: adultCount, total: tA } : null,
                            child: childCount > 0 ? { ...(pb.child || {}), unit_price: uC, count: childCount, total: tC } : null,
                            infant: infantCount > 0 ? { ...(pb.infant || {}), unit_price: uI, count: infantCount, total: tI } : null,
                            extra_bed: extraBedCount > 0 ? { ...(pb.extra_bed || {}), unit_price: uE, count: extraBedCount, total: tE } : null,
                            single: singleCount > 0 ? { ...(pb.single || {}), unit_price: uS, count: singleCount, total: tS } : null,
                            child_extra_bed: childExtraBedCount > 0 ? { ...(pb.child_extra_bed || {}), unit_price: uCE, count: childExtraBedCount, total: tCE } : null,
                            subtotal,
                            grand_total: subtotal + (pb.surcharge_total || 0) + (pb.option_total || 0),
                        };
                    }

                    mapped.cruise = item.roomPriceInfo?.cruise_name || '크루즈';
                    mapped.cruiseName = item.roomPriceInfo?.cruise_name || '크루즈';
                    mapped.roomType = item.roomPriceInfo?.room_type || item.room_price_code;
                    mapped.unitPrice = item.unit_price;
                    mapped.totalPrice = item.room_total_price ?? item.total_amount; // room_total_price 우선
                    mapped.priceBreakdown = pb;
                    mapped.paymentMethod = item.roomPriceInfo?.payment || item.payment_method || '정보 없음';
                    mapped.adult = adultCount;
                    mapped.child = childCount;
                    mapped.infant = infantCount;
                    mapped.childExtraBedCount = childExtraBedCount;
                    mapped.extraBedCount = extraBedCount;
                    mapped.singleCount = singleCount;
                    mapped.priceAdult = item.roomPriceInfo?.price_adult || 0;
                    mapped.priceChild = item.roomPriceInfo?.price_child || 0;
                    mapped.priceInfant = item.roomPriceInfo?.price_infant || 0;
                    mapped.priceExtraBed = item.roomPriceInfo?.price_extra_bed || 0;
                    mapped.priceSingle = item.roomPriceInfo?.price_single || 0;
                    mapped.priceChildExtraBed = item.roomPriceInfo?.price_child_extra_bed || 0;
                    mapped.guest_count = item.guest_count;
                    mapped.checkin = item.checkin;
                    // cars is already in item.cars
                } else if (normalizedType === 'airport') {
                    const rawWayType = String(item.way_type || item.ra_way_type || item.airportPriceInfo?.service_type || '').toLowerCase();
                    const isPickup = rawWayType.includes('pickup') || rawWayType.includes('픽업');
                    const airportLocation = item.ra_airport_location || item.airport_location || '';
                    const accommodationInfo = item.accommodation_info || item.ra_accommodation_info || item.ra_stopover_location || '';

                    mapped.category = item.airportPriceInfo?.service_type || '';
                    mapped.route = item.airportPriceInfo?.route || '';
                    mapped.carType = item.airportPriceInfo?.vehicle_type || '';
                    mapped.airportName = item.ra_airport_location;
                    mapped.destination = item.ra_stopover_location;
                    mapped.pickupLocation = isPickup ? airportLocation : accommodationInfo;
                    mapped.dropoffLocation = isPickup ? accommodationInfo : airportLocation;
                    mapped.flightNumber = item.ra_flight_number;
                    mapped.passengerCount = item.ra_passenger_count;
                    mapped.carCount = item.ra_car_count;
                    mapped.ra_datetime = item.ra_datetime;
                    mapped.unitPrice = item.airportPriceInfo?.price || item.unit_price || 0;
                    mapped.totalPrice = item.total_price;
                    mapped.way_type = item.way_type;
                } else if (normalizedType === 'hotel') {
                    mapped.hotelName = item.hotelPriceInfo?.hotel_name || item.hotel_category;
                    mapped.roomType = item.hotelPriceInfo?.room_name || item.hotel_price_code;
                    mapped.unitPrice = item.hotelPriceInfo?.base_price || item.unit_price;
                    mapped.totalPrice = item.total_price;
                    mapped.checkinDate = item.checkin_date;
                    mapped.nights = item.room_count;
                    mapped.guestCount = item.guest_count;
                } else if (normalizedType === 'tour') {
                    mapped.tourName = item.tourPriceInfo?.tour?.tour_name || item.tour_price_code;
                    mapped.unitPrice = item.tourPriceInfo?.price_per_person || item.unit_price;
                    mapped.totalPrice = item.total_price;
                    mapped.tourDate = item.usage_date;
                    mapped.tourCapacity = item.tour_capacity;
                    mapped.carCount = item.car_count;
                    mapped.passengerCount = item.passenger_count;
                    mapped.adult = item.adult_count || 0;
                    mapped.child = item.child_count || 0;
                    mapped.infant = item.infant_count || 0;
                } else if (normalizedType === 'rentcar') {
                    mapped.carType = item.rentcarPriceInfo?.vehicle_type || item.vehicle_type || item.rentcar_price_code;
                    mapped.route = item.rentcarPriceInfo?.route || item.route || '';
                    mapped.category = item.rentcarPriceInfo?.way_type || item.way_type || '';
                    mapped.way_type = item.rentcarPriceInfo?.way_type || item.way_type || '';
                    mapped.capacity = item.rentcarPriceInfo?.capacity || item.capacity || null;
                    // 픽업 정보
                    mapped.pickupDatetime = item.pickup_datetime;
                    mapped.pickupLocation = item.pickup_location;
                    mapped.destination = item.destination;
                    // 픽업 경유
                    mapped.viaLocation = item.via_location;
                    mapped.viaWaiting = item.via_waiting;
                    // 샌딩 정보
                    mapped.returnDatetime = item.return_datetime;
                    mapped.returnPickupLocation = item.return_pickup_location;
                    mapped.returnDestination = item.return_destination;
                    // 샌딩 경유
                    mapped.returnViaLocation = item.return_via_location;
                    mapped.returnViaWaiting = item.return_via_waiting;
                    // 기타
                    mapped.unitPrice = item.rentcarPriceInfo?.price || item.unit_price || 0;
                    mapped.totalPrice = item.total_price;
                    mapped.carCount = item.car_count || 1;
                    mapped.passengerCount = item.passenger_count;
                    mapped.luggageCount = item.luggage_count;
                    mapped.dispatchCode = item.dispatch_code;
                    mapped.note = item.request_note || item.note;
                } else if (normalizedType === 'vehicle' || normalizedType === 'car') {
                    mapped.pickupDatetime = item.pickup_datetime;
                    mapped.pickupLocation = item.pickup_location;
                    mapped.dropoffLocation = item.dropoff_location;
                    mapped.passengerCount = item.passenger_count;
                    mapped.totalPrice = item.car_total_price;
                    mapped.unitPrice = item.carPriceInfo?.price || 0;
                    // rentcar_price 기반: way_type → 구분, vehicle_type → 차량타입, route → 경로
                    // 폴백: reservation_cruise_car에 직접 저장된 way_type, vehicle_type, route 사용
                    mapped.carCategory = item.carPriceInfo?.way_type || item.carPriceInfo?.category || item.way_type || '';
                    mapped.carType = item.carPriceInfo?.vehicle_type || item.vehicle_type || '';
                    mapped.route = item.carPriceInfo?.route || item.route || '';
                    mapped.cruiseName = item.carPriceInfo?.cruise || '';
                    mapped.vehicleNumber = item.shtDetail?.vehicle_number || '';
                    mapped.seatNumber = item.shtDetail?.seat_number || '';
                } else if (normalizedType === 'sht' || normalizedType === 'car_sht' || normalizedType === 'reservation_car_sht') {
                    mapped.totalPrice = item.car_total_price;
                    mapped.usageDate = item.usage_date;
                    mapped.category = item.sht_category || '';
                    mapped.vehicleNumber = item.vehicle_number;
                    mapped.seatNumber = item.seat_number;
                    mapped.driverName = item.driver_name;
                } else if (normalizedType === 'package') {
                    // 패키지 메인 정보
                    mapped.package_name = item.package_name || item.package_master?.name || '';
                    mapped.package_code = item.package_code || item.package_master?.package_code || '';
                    mapped.package_description = item.package_description || item.package_master?.description || '';
                    mapped.total_amount = item.total_amount;
                    mapped.re_adult_count = item.re_adult_count;
                    mapped.re_child_count = item.re_child_count;
                    mapped.re_infant_count = item.re_infant_count;
                    mapped.re_created_at = item.re_created_at;
                }

                return mapped;
            });
        });
    }, [reservationDetails]);

    const hasPackageDetails = useMemo(
        () => flattenedServices.some((s: any) => s?.serviceType === 'package' || s?.isPackageService),
        [flattenedServices]
    );

    const groupedReservations = useMemo(() => {
        const STATUS_ORDER = ['pending', 'approved', 'confirmed', 'completed', 'cancelled'];
        const STATUS_COLORS: Record<string, { bg: string; text: string; border: string; dot: string }> = {
            pending: { bg: 'bg-yellow-50', text: 'text-yellow-800', border: 'border-yellow-300', dot: 'bg-yellow-400' },
            approved: { bg: 'bg-blue-50', text: 'text-blue-800', border: 'border-blue-300', dot: 'bg-blue-400' },
            confirmed: { bg: 'bg-green-50', text: 'text-green-800', border: 'border-green-300', dot: 'bg-green-400' },
            completed: { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-300', dot: 'bg-gray-400' },
            cancelled: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-300', dot: 'bg-red-400' },
        };
        const byStatus: Record<string, ReservationItem[]> = {};
        for (const r of reservations) {
            const repStatus = r.services[0]?.re_status || 'pending';
            if (!byStatus[repStatus]) byStatus[repStatus] = [];
            byStatus[repStatus].push(r);
        }
        return STATUS_ORDER.filter(s => byStatus[s]?.length > 0).map(status => {
            const items = byStatus[status];
            const colors = STATUS_COLORS[status] || STATUS_COLORS.pending;
            const byDate: Record<string, ReservationItem[]> = {};
            for (const r of items) {
                const raw = r.re_update_at || r.re_created_at || '';
                const dateKey = raw
                    ? new Date(raw).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
                    : '날짜없음';
                if (!byDate[dateKey]) byDate[dateKey] = [];
                byDate[dateKey].push(r);
            }
            const dateGroups = Object.keys(byDate)
                .sort((a, b) => b.localeCompare(a))
                .map(date => ({
                    date,
                    items: byDate[date].sort((a, b) => {
                        const ta = new Date(a.re_update_at || a.re_created_at || 0).getTime();
                        const tb = new Date(b.re_update_at || b.re_created_at || 0).getTime();
                        return tb - ta;
                    }),
                }));
            return { status, colors, dateGroups };
        });
    }, [reservations]);

    if (loading) {
        return (
            <ManagerLayout title=" 처리" activeTab="reservations">
                <div className="flex justify-center items-center h-64">
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
                        <p className="mt-4 text-gray-600">예약 목록을 불러오는 중...</p>
                    </div>
                </div>
            </ManagerLayout>
        );
    }

    return (
        <ManagerLayout title="예약  처리" activeTab="reservations">
            <div className="space-y-6">

                {/* 헤더 */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => router.push('/manager/reservations')}
                            className="p-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                        <div>
                            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                                <Edit className="w-7 h-7 text-green-600" />
                                예약 변경 및 처리
                            </h1>
                            <p className="text-gray-600 mt-1">여러 예약을 변경하거나 처리합니다.</p>
                        </div>
                    </div>

                    <button
                        onClick={loadReservations}
                        className="p-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                        title="새로고림"
                    >
                        <RefreshCw className="w-5 h-5" />
                    </button>
                </div>

                {error && (
                    <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
                        ⚠️ {error}
                    </div>
                )}

                {/* 필터 및 작업 컨트롤 */}
                <div className="space-y-2">

                    {/* 녹색 카드: 필터 + 처리버튼 + 검색 */}
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                        <div className="flex flex-row items-end gap-2 flex-wrap md:gap-3">
                            <div className="min-w-[90px] flex-1 md:flex-none">
                                <label className="block text-xs font-medium text-emerald-700 mb-1">정렬</label>
                                <select
                                    value={sortType}
                                    onChange={(e) => setSortType(e.target.value as SortType)}
                                    className="px-3 py-2 border border-emerald-200 rounded-lg min-w-[100px] bg-white text-sm"
                                >
                                    <option value="date">예약일순</option>
                                    <option value="name">고객명순</option>
                                </select>
                            </div>
                            <div className="min-w-[90px] flex-1 md:flex-none">
                                <label className="block text-xs font-medium text-emerald-700 mb-1">상태</label>
                                <select
                                    value={filter}
                                    onChange={(e) => setFilter(e.target.value as any)}
                                    className="px-3 py-2 border border-emerald-200 rounded-lg min-w-[100px] bg-white text-sm"
                                >
                                    <option value="all">전체</option>
                                    <option value="pending">대기중</option>
                                    <option value="approved">승인</option>
                                    <option value="confirmed">확정</option>
                                    <option value="completed">완료</option>
                                    <option value="cancelled">취소</option>
                                </select>
                            </div>
                            <div className="min-w-[90px] flex-1 md:flex-none">
                                <label className="block text-xs font-medium text-emerald-700 mb-1">서비스</label>
                                <select
                                    value={serviceFilter}
                                    onChange={(e) => setServiceFilter(e.target.value)}
                                    className="px-3 py-2 border border-emerald-200 rounded-lg min-w-[100px] bg-white text-sm"
                                >
                                    <option value="all">전체</option>
                                    <option value="cruise">크루즈</option>
                                    <option value="airport">공항</option>
                                    <option value="hotel">호텔</option>
                                    <option value="tour">투어</option>
                                    <option value="rentcar">렌터카</option>
                                    <option value="vehicle">크루즈 차량</option>
                                    <option value="sht">스하차량</option>
                                    <option value="package">패키지</option>
                                </select>
                            </div>

                            <button
                                onClick={handleStepProgressAction}
                                disabled={selectedItems.size === 0 || processing}
                                className={`px-3 py-2 rounded text-xs font-medium transition-colors whitespace-nowrap self-end w-full md:w-auto ${selectedItems.size === 0
                                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                    : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                    }`}
                            >
                                {processing ? '처리중...' : selectedItems.size === 0 ? '항목선택' : `${selectedItems.size}건 처리`}
                            </button>

                            <form
                                onSubmit={e => { e.preventDefault(); setSearchTrigger(v => v + 1); }}
                                className="flex gap-2 items-end w-full md:w-auto"
                            >
                                <div>
                                    <label className="block text-xs font-medium text-emerald-700 mb-1">이름/이메일</label>
                                    <input
                                        type="text"
                                        value={searchQuery}
                                        onChange={e => setSearchQuery(e.target.value)}
                                        placeholder="이름 또는 이메일"
                                        className="px-3 py-2 border border-emerald-200 rounded-lg w-full min-w-[140px] bg-white text-sm"
                                    />
                                </div>
                                <button
                                    type="submit"
                                    className="px-3 py-2 rounded bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 transition-colors whitespace-nowrap self-end"
                                >검색</button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowBulkActionPanel((prev) => {
                                            const next = !prev;
                                            if (!next) {
                                                setBulkAction('');
                                                setNewStatus('');
                                            }
                                            return next;
                                        });
                                    }}
                                    disabled={!canChangeStatus}
                                    className={`px-3 py-2 rounded text-xs font-medium transition-colors whitespace-nowrap self-end ${!canChangeStatus
                                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                        : showBulkActionPanel
                                            ? 'bg-blue-600 text-white hover:bg-blue-700'
                                            : 'bg-white text-blue-700 border border-blue-300 hover:bg-blue-50'
                                        }`}
                                    title={!canChangeStatus ? '상태변경 권한이 없습니다' : ''}
                                >
                                    {showBulkActionPanel ? '상태변경 닫기' : '상태변경'}
                                </button>
                            </form>

                            <p className="text-xs text-emerald-800 self-end whitespace-nowrap md:ml-1 w-full md:w-auto">
                                총 {reservations.length} / {totalServiceCount} / 선택 {selectedItems.size}
                            </p>
                        </div>
                    </div>

                    {showBulkActionPanel && (
                        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                            <div className="flex flex-row flex-wrap items-end gap-2 md:gap-3">
                                <div className="flex-1 min-w-[120px]">
                                    <label className="block text-xs font-medium text-blue-700 mb-1">작업</label>
                                    <select
                                        value={bulkAction}
                                        onChange={(e) => setBulkAction(e.target.value as BulkAction)}
                                        className="px-3 py-2 border border-blue-200 rounded-lg min-w-[120px] bg-white text-sm"
                                    >
                                        <option value="">-- 선택 --</option>
                                        <option value="status_update">상태 변경</option>
                                        <option value="delete">삭제</option>
                                    </select>
                                </div>

                                <div className="flex-1 min-w-[120px]">
                                    <label className="block text-xs font-medium text-blue-700 mb-1">새 상태</label>
                                    <select
                                        value={newStatus}
                                        onChange={(e) => setNewStatus(e.target.value)}
                                        disabled={bulkAction !== 'status_update'}
                                        className="px-3 py-2 border border-blue-200 rounded-lg min-w-[120px] bg-white text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                        <option value="">-- 선택 --</option>
                                        <option value="pending">대기</option>
                                        <option value="approved">승인</option>
                                        <option value="confirmed">확정</option>
                                        <option value="completed">완료</option>
                                        <option value="cancelled">취소</option>
                                    </select>
                                </div>

                                <button
                                    onClick={() => handleBulkAction()}
                                    disabled={!bulkAction || selectedItems.size === 0 || processing}
                                    className={`px-3 py-2 rounded text-xs font-medium transition-colors whitespace-nowrap self-end w-full md:w-auto ${!bulkAction || selectedItems.size === 0
                                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                        : bulkAction === 'delete'
                                            ? 'bg-red-500 hover:bg-red-600 text-white'
                                            : 'bg-blue-500 hover:bg-blue-600 text-white'
                                        }`}
                                >
                                    {processing ? '처리중...' :
                                        !bulkAction ? '작업 선택' :
                                            bulkAction === 'delete' ? `${selectedItems.size}건 삭제` : `${selectedItems.size}건 상태변경`}
                                </button>

                                {bulkAction === 'delete' && selectedItems.size > 0 && (
                                    <div className="flex items-center gap-1 text-red-600 text-xs self-end">
                                        <AlertTriangle className="w-4 h-4" />
                                        <span>삭제된 예약은 복구 불가</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* 예약 목록 */}
                <div className="bg-white rounded-lg shadow-md">
                    <div className="p-6 border-b">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-semibold">예약 목록</h3>
                            <button
                                onClick={handleSelectAll}
                                className="flex items-center gap-2 px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                            >
                                {(() => {
                                    const allServiceIds = reservations.flatMap(r => r.services.map(s => s.re_id));
                                    const allSelected = allServiceIds.length > 0 && allServiceIds.every(id => selectedItems.has(id));
                                    return allSelected ? (
                                        <CheckSquare className="w-4 h-4" />
                                    ) : (
                                        <Square className="w-4 h-4" />
                                    );
                                })()}
                                전체 선택
                            </button>
                        </div>
                    </div>

                    {reservations.length === 0 ? (
                        <div className="p-8 text-center">
                            <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-lg font-medium text-gray-600 mb-2">
                                {filter === 'all' ? '예약이 없습니다' : `${getStatusText(filter)} 예약이 없습니다`}
                            </h3>
                        </div>
                    ) : (
                        <div className="max-h-[70vh] overflow-y-auto">
                            {groupedReservations.map(({ status, colors, dateGroups }) => (
                                <div key={status}>
                                    {/* 상태 헤더 */}
                                    <div className={`sticky top-0 z-10 flex items-center gap-2 px-4 py-2 border-b ${colors.bg} ${colors.border}`}>
                                        <span className={`w-2.5 h-2.5 rounded-full inline-block ${colors.dot}`} />
                                        <span className={`text-sm font-semibold ${colors.text}`}>{getStatusText(status)}</span>
                                        <span className={`text-xs ${colors.text} opacity-60`}>({dateGroups.reduce((s, dg) => s + dg.items.length, 0)}건)</span>
                                    </div>
                                    {dateGroups.map(({ date, items: dateItems }) => (
                                        <div key={date}>
                                            {/* 날짜 헤더 */}
                                            <div className="px-4 py-1.5 bg-gray-50 border-b border-gray-200 text-xs text-gray-500 font-medium">
                                                {date === '날짜없음' ? '날짜 없음' : (() => {
                                                    const d = new Date(date + 'T00:00:00');
                                                    return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
                                                })()} <span className="text-gray-400">({dateItems.length}건)</span>
                                            </div>
                                            {/* 카드 그리드 */}
                                            <div className="p-4 grid grid-cols-1 md:grid-cols-4 gap-4">
                                                {dateItems.map((reservation) => {
                                                    const allServiceIds = reservation.services.map(s => s.re_id);
                                                    const isSelected = allServiceIds.some(id => selectedItems.has(id));
                                                    return (
                                                        <div
                                                            key={reservation.re_quote_id || reservation.services[0]?.re_id}
                                                            className={`p-4 bg-white rounded-lg shadow-sm transition-all transform ${isSelected ? 'ring-2 ring-blue-300' : 'border border-gray-100'} hover:shadow-md hover:-translate-y-0.5`}
                                                        >
                                                            <div className="flex items-start gap-2">
                                                                <button
                                                                    onClick={() => {
                                                                        const newSelected = new Set(selectedItems);
                                                                        if (isSelected) {
                                                                            allServiceIds.forEach(id => newSelected.delete(id));
                                                                        } else {
                                                                            allServiceIds.forEach(id => newSelected.add(id));
                                                                        }
                                                                        setSelectedItems(newSelected);
                                                                    }}
                                                                    className="p-1 hover:bg-gray-100 rounded mt-1"
                                                                    aria-label="선택"
                                                                >
                                                                    {isSelected ? (
                                                                        <CheckSquare className="w-5 h-5 text-blue-600" />
                                                                    ) : (
                                                                        <Square className="w-5 h-5 text-gray-400" />
                                                                    )}
                                                                </button>
                                                                <div className="flex-1 min-h-[120px]">
                                                                    <div className="flex items-start justify-between gap-3 mb-3">
                                                                        <div className="min-w-0">
                                                                            <div className="flex flex-wrap gap-1 mb-2">
                                                                                {reservation.services.map((service, idx) => (
                                                                                    <span key={idx} className={`text-xs px-2 py-0.5 rounded flex items-center gap-1 font-medium ${getTypeBadgeStyle(service.re_type)}`}>
                                                                                        {getTypeIcon(service.re_type)}
                                                                                        {getTypeName(service.re_type)}
                                                                                        <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] ${getStatusColor(service.re_status)}`}>
                                                                                            {getStatusText(service.re_status)}
                                                                                        </span>
                                                                                    </span>
                                                                                ))}
                                                                            </div>
                                                                            <div className="mt-1 text-sm space-y-1">
                                                                                <div className="text-sm text-gray-700 truncate">
                                                                                    <span className="text-xs text-gray-500">고객명:</span>
                                                                                    <span className="ml-2 font-semibold text-base text-gray-900">{reservation.users?.name || 'N/A'}</span>
                                                                                </div>
                                                                                <div className="text-sm text-gray-600 truncate">
                                                                                    <span className="text-xs text-gray-500">여행명:</span>
                                                                                    <span className="ml-2 italic">{reservation.quote?.title || 'N/A'}</span>
                                                                                </div>
                                                                                <div className="text-sm text-gray-600 truncate">
                                                                                    <span className="text-xs text-gray-500">이메일:</span>
                                                                                    <span className="ml-2 text-xs text-gray-600 italic">{reservation.users?.email || 'N/A'}</span>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                        <div className="text-right flex flex-col items-end gap-2">
                                                                            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                                                                                {reservation.services.length}개 서비스
                                                                            </span>
                                                                            <button
                                                                                onClick={() => handleViewDetails(reservation)}
                                                                                className="p-1.5 hover:bg-blue-50 rounded-full transition-colors"
                                                                                title="상세보기"
                                                                            >
                                                                                <Eye className="w-4 h-4 text-blue-600" />
                                                                            </button>
                                                                            <button
                                                                                onClick={() => router.push(`/manager/reservation-edit?quote_id=${reservation.re_quote_id}`)}
                                                                                className="p-1.5 hover:bg-green-50 rounded-full transition-colors"
                                                                                title="수정하기"
                                                                            >
                                                                                <Edit className="w-4 h-4 text-green-600" />
                                                                            </button>
                                                                            <div className="text-xs text-gray-400">
                                                                                {new Date(reservation.re_update_at || reservation.re_created_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                    <div className="grid grid-cols-1 gap-1 text-sm text-gray-600">
                                                                        <div className="text-sm text-gray-500">
                                                                            <span className="text-xs text-gray-500">영문이름:</span>
                                                                            <span className="ml-2 text-gray-700">{reservation.users?.english_name || (reservation.users?.email ? reservation.users.email.split('@')[0] : 'N/A')}</span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* 상세보기 모달 */}
                {isModalOpen && modalUserInfo && (
                    hasPackageDetails ? (
                        <PackageReservationDetailModal
                            key={modalKey}
                            isOpen={isModalOpen}
                            onClose={closeDetailsModal}
                            userInfo={modalUserInfo}
                            allUserServices={flattenedServices}
                            loading={modalLoading}
                        />
                    ) : (
                        <UserReservationDetailModal
                            key={modalKey}
                            isOpen={isModalOpen}
                            onClose={closeDetailsModal}
                            userInfo={modalUserInfo}
                            allUserServices={flattenedServices}
                            loading={modalLoading}
                        />
                    )
                )}
            </div >
        </ManagerLayout >
    );
}

