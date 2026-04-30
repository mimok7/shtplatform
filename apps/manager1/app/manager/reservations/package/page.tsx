'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabase';
import { fetchTableInBatches } from '@/lib/fetchInBatches';
import ManagerLayout from '@/components/ManagerLayout';
import {
    Package, Plus, Eye, User, Calendar, Mail, Search,
    Loader2, AlertCircle, RefreshCw, ChevronRight, CheckCircle2, Clock
} from 'lucide-react';
import PackageReservationDetailModal from '@/components/PackageReservationDetailModal';

interface PackageReservation {
    re_id: string;
    re_type: string;
    re_status: string;
    re_created_at: string;
    re_user_id: string;
    package_id: string;
    total_amount: number;
    re_adult_count: number;
    re_child_count: number;
    re_infant_count: number;
    users?: {
        id: string;
        name: string;
        email: string;
    };
    package_master?: {
        name: string;
        package_code: string;
    };
}

export default function PackageReservationsPage() {
    const router = useRouter();
    const [reservations, setReservations] = useState<PackageReservation[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');

    // 상세 보기용
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
    const [modalLoading, setModalLoading] = useState(false);
    const [modalUserInfo, setModalUserInfo] = useState<any>(null);
    const [modalServices, setModalServices] = useState<any[]>([]);

    useEffect(() => {
        loadPackageReservations();
    }, []);

    const loadPackageReservations = async () => {
        try {
            setLoading(true);

            // 1. 패키지 예약 기본 데이터 조회
            const { data: baseData, error: baseError } = await supabase
                .from('reservation')
                .select(`
                    re_id,
                    re_type,
                    re_status,
                    re_created_at,
                    re_user_id,
                    package_id,
                    total_amount,
                    re_adult_count,
                    re_child_count,
                    re_infant_count
                `)
                .eq('re_type', 'package')
                .order('re_created_at', { ascending: false });

            if (baseError) throw baseError;

            if (!baseData || baseData.length === 0) {
                setReservations([]);
                setLoading(false);
                return;
            }

            // 2. 관련 데이터 조회 (배치 방식)
            const userIds = Array.from(new Set(baseData.map(r => r.re_user_id).filter(Boolean))) as string[];
            const packageIds = Array.from(new Set(baseData.map(r => r.package_id).filter(Boolean))) as string[];

            const [userData, packageMasterData] = await Promise.all([
                userIds.length > 0
                    ? fetchTableInBatches<any>('users', 'id', userIds, 'id, name, email', 100)
                    : Promise.resolve([]),
                packageIds.length > 0
                    ? supabase.from('package_master').select('id, name, package_code').in('id', packageIds)
                    : Promise.resolve({ data: [] })
            ]);

            const userMap = new Map(userData.map((u: any) => [u.id, u]));
            const packageMap = new Map((packageMasterData.data || []).map((p: any) => [p.id, p]));

            // 3. 데이터 병합
            const enriched = baseData.map(r => ({
                ...r,
                users: userMap.get(r.re_user_id),
                package_master: packageMap.get(r.package_id)
            })) as PackageReservation[];

            setReservations(enriched);
        } catch (err) {
            console.error('패키지 예약 데이터 로드 실패:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleViewDetail = async (userId: string) => {
        setSelectedUserId(userId);
        setIsDetailModalOpen(true);
        setModalLoading(true);

        try {
            // 사용자 정보 조회
            const { data: userData, error: userError } = await supabase
                .from('users')
                .select('*')
                .eq('id', userId)
                .single();

            if (userError) throw userError;
            setModalUserInfo(userData);

            // 해당 사용자의 모든 패키지 예약 조회
            const { data: resData, error: resError } = await supabase
                .from('reservation')
                .select('re_id, re_type, re_status, re_created_at, package_id, total_amount, re_adult_count, re_child_count, re_infant_count')
                .eq('re_user_id', userId)
                .eq('re_type', 'package');

            if (resError) throw resError;

            const packageReservationIds = (resData || []).map((r: any) => r.re_id);
            const packageIds = Array.from(new Set((resData || []).map((r: any) => r.package_id).filter(Boolean)));

            if (packageReservationIds.length === 0) {
                setModalServices([]);
                return;
            }

            const { data: packageMasterData } = packageIds.length > 0
                ? await supabase
                    .from('package_master')
                    .select('id, name, package_code, description')
                    .in('id', packageIds)
                : { data: [] as any[] };

            const packageMasterMap = new Map((packageMasterData || []).map((p: any) => [p.id, p]));

            // 패키지에 포함된 모든 서비스 조회 (병렬)
            const [cruiseRes, airportRes, tourRes, hotelRes, rentcarRes, shtRes, packageDetailRes] = await Promise.all([
                supabase.from('reservation_cruise').select('*').in('reservation_id', packageReservationIds),
                supabase.from('reservation_airport').select('*').in('reservation_id', packageReservationIds),
                supabase.from('reservation_tour').select('*').in('reservation_id', packageReservationIds),
                supabase.from('reservation_hotel').select('*').in('reservation_id', packageReservationIds),
                supabase.from('reservation_rentcar').select('*').in('reservation_id', packageReservationIds),
                supabase.from('reservation_car_sht').select('*').in('reservation_id', packageReservationIds),
                supabase.from('reservation_package').select('*').in('reservation_id', packageReservationIds)
            ]);

            const cruiseData = cruiseRes.data || [];
            const airportData = airportRes.data || [];
            const tourData = tourRes.data || [];
            const hotelData = hotelRes.data || [];
            const rentcarData = rentcarRes.data || [];
            const shtData = shtRes.data || [];
            const packageDetailMap = new Map((packageDetailRes.data || []).map((row: any) => [row.reservation_id, row]));

            // 가격 코드로 추가 정보 조회
            const cruiseCodes = cruiseData.map((r: any) => r.room_price_code).filter(Boolean);
            const tourCodes = tourData.map((r: any) => r.tour_price_code).filter(Boolean);
            const airportCodes = airportData.map((r: any) => r.airport_price_code).filter(Boolean);
            const hotelCodes = hotelData.map((r: any) => r.hotel_price_code).filter(Boolean);
            const rentcarCodes = rentcarData.map((r: any) => r.rentcar_price_code).filter(Boolean);

            const [roomPrices, roomPricesByRoomType, tourPriceRows, airportPrices, hotelPrices, rentcarPrices] = await Promise.all([
                cruiseCodes.length > 0 ? supabase.from('cruise_rate_card').select('id, cruise_name, room_type').in('id', cruiseCodes) : Promise.resolve({ data: [] }),
                cruiseCodes.length > 0 ? supabase.from('cruise_rate_card').select('id, cruise_name, room_type').in('room_type', cruiseCodes) : Promise.resolve({ data: [] }),
                tourCodes.length > 0 ? supabase.from('tour_pricing').select('pricing_id, tour_id, price_per_person').in('pricing_id', tourCodes) : Promise.resolve({ data: [] }),
                airportCodes.length > 0 ? supabase.from('airport_price').select('airport_code, service_type, route, vehicle_type, price').in('airport_code', airportCodes) : Promise.resolve({ data: [] }),
                hotelCodes.length > 0 ? supabase.from('hotel_price').select('hotel_price_code, hotel_name, room_name, base_price').in('hotel_price_code', hotelCodes) : Promise.resolve({ data: [] }),
                rentcarCodes.length > 0 ? supabase.from('rentcar_price').select('rent_code, vehicle_type, way_type, route, price').in('rent_code', rentcarCodes) : Promise.resolve({ data: [] })
            ]);

            const tourIds = Array.from(new Set((tourPriceRows.data || []).map((row: any) => row.tour_id).filter(Boolean)));
            const { data: tourNameRows } = tourIds.length > 0
                ? await supabase.from('tour').select('tour_id, tour_name, tour_code').in('tour_id', tourIds)
                : { data: [] as any[] };

            const roomPriceMap = new Map<string, { id: string; cruise_name?: string; room_type?: string }>((roomPrices.data || []).map((r: any) => [r.id, r]));
            (roomPricesByRoomType.data || []).forEach((r: any) => {
                if (r?.room_type && !roomPriceMap.has(r.room_type)) roomPriceMap.set(r.room_type, r);
            });
            const tourById = new Map((tourNameRows || []).map((row: any) => [row.tour_id, row]));
            const tourPriceMap = new Map((tourPriceRows.data || []).map((row: any) => [row.pricing_id, { ...row, tour: tourById.get(row.tour_id) }]));
            const airportPriceRows = airportPrices.data || [];
            const hotelPriceMap = new Map((hotelPrices.data || []).map((r: any) => [r.hotel_price_code, r]));
            const rentcarPriceMap = new Map((rentcarPrices.data || []).map((r: any) => [r.rent_code, r]));
            const getAirportPrice = (item: any) => {
                const way = String(item.way_type || item.ra_way_type || '').toLowerCase();
                const serviceType = way.includes('pickup') || way.includes('entry') || way.includes('픽업') ? '픽업'
                    : way.includes('sending') || way.includes('sanding') || way.includes('exit') || way.includes('샌딩') ? '샌딩'
                        : '';
                return airportPriceRows.find((row: any) => row.airport_code === item.airport_price_code && (!serviceType || row.service_type === serviceType))
                    || airportPriceRows.find((row: any) => row.airport_code === item.airport_price_code);
            };

            // 서비스 데이터 매핑
            const services: any[] = [];

            // 패키지 메인 예약도 함께 표시
            (resData || []).forEach((pkg: any) => {
                const pkgMaster: any = packageMasterMap.get(pkg.package_id);
                const pkgDetail: any = packageDetailMap.get(pkg.re_id);
                services.push({
                    serviceType: 'package',
                    reservation_id: pkg.re_id,
                    re_status: pkg.re_status,
                    re_created_at: pkg.re_created_at,
                    package_name: pkgMaster?.name || '',
                    package_code: pkgMaster?.package_code || '',
                    package_description: pkgMaster?.description || '',
                    total_amount: pkg.total_amount,
                    re_adult_count: pkg.re_adult_count,
                    re_child_count: pkg.re_child_count,
                    re_infant_count: pkg.re_infant_count,
                    ...(pkgDetail || {}),
                });
            });

            // 크루즈 서비스
            cruiseData.forEach((item: any) => {
                const priceInfo = roomPriceMap.get(item.room_price_code);
                services.push({
                    serviceType: 'cruise',
                    isPackageService: true,
                    reservation_id: item.reservation_id,
                    cruise: priceInfo?.cruise_name || '크루즈',
                    roomType: priceInfo?.room_type || item.room_price_code,
                    checkin: item.checkin,
                    adult: item.guest_count,
                    child: item.child_count || 0,
                    totalPrice: item.room_total_price,
                    note: item.request_note
                });
            });

            // 공항 서비스
            airportData.forEach((item: any) => {
                const priceInfo = getAirportPrice(item);
                services.push({
                    serviceType: 'airport',
                    isPackageService: true,
                    reservation_id: item.reservation_id,
                    category: priceInfo?.service_type || '',
                    route: priceInfo?.route || '',
                    carType: priceInfo?.vehicle_type || '',
                    airportName: item.ra_airport_location,
                    accommodation_info: item.accommodation_info,
                    way_type: item.way_type,
                    flightNumber: item.ra_flight_number,
                    ra_datetime: item.ra_datetime,
                    passengerCount: item.ra_passenger_count,
                    carCount: item.ra_car_count,
                    luggageCount: item.ra_luggage_count,
                    pickupLocation: item.pickup_location,
                    dropoffLocation: item.dropoff_location,
                    totalPrice: item.total_price,
                    unitPrice: priceInfo?.price || item.unit_price,
                    dispatchCode: item.dispatch_code,
                    note: item.request_note
                });
            });

            // 투어 서비스
            tourData.forEach((item: any) => {
                const priceInfo = tourPriceMap.get(item.tour_price_code);
                services.push({
                    serviceType: 'tour',
                    isPackageService: true,
                    reservation_id: item.reservation_id,
                    tourName: priceInfo?.tour?.tour_name || item.tour_price_code,
                    tourDate: item.usage_date,
                    tourCapacity: item.tour_capacity,
                    pickupLocation: item.pickup_location,
                    dropoffLocation: item.dropoff_location,
                    adult: item.adult_count || 0,
                    child: item.child_count || 0,
                    infant: item.infant_count || 0,
                    passengerCount: item.passenger_count,
                    carCount: item.car_count,
                    totalPrice: item.total_price,
                    note: item.request_note
                });
            });

            // 호텔 서비스
            hotelData.forEach((item: any) => {
                const priceInfo: any = hotelPriceMap.get(item.hotel_price_code);
                services.push({
                    serviceType: 'hotel',
                    isPackageService: true,
                    reservation_id: item.reservation_id,
                    hotelName: priceInfo?.hotel_name || item.hotel_category,
                    roomType: priceInfo?.room_name || item.hotel_price_code,
                    checkinDate: item.checkin_date,
                    nights: item.room_count,
                    guestCount: item.guest_count,
                    totalPrice: item.total_price,
                    unitPrice: priceInfo?.base_price || item.unit_price,
                    note: item.request_note
                });
            });

            // 렌터카 서비스
            rentcarData.forEach((item: any) => {
                const priceInfo: any = rentcarPriceMap.get(item.rentcar_price_code);
                services.push({
                    serviceType: 'rentcar',
                    isPackageService: true,
                    reservation_id: item.reservation_id,
                    category: priceInfo?.way_type || item.way_type || '',
                    route: priceInfo?.route || item.route || '',
                    carType: priceInfo?.vehicle_type || item.vehicle_type || item.rentcar_price_code,
                    pickupDatetime: item.pickup_datetime,
                    pickupLocation: item.pickup_location,
                    dropoffLocation: item.destination || item.dropoff_location,
                    passengerCount: item.passenger_count,
                    carCount: item.car_count,
                    luggageCount: item.luggage_count,
                    totalPrice: item.total_price,
                    unitPrice: priceInfo?.price || item.unit_price,
                    dispatchCode: item.dispatch_code,
                    note: item.request_note
                });
            });

            // 스하차량 서비스
            shtData.forEach((item: any) => {
                services.push({
                    serviceType: 'sht',
                    isPackageService: true,
                    reservation_id: item.reservation_id,
                    category: item.sht_category,
                    usageDate: item.pickup_datetime || item.usage_date,
                    pickupLocation: item.pickup_location,
                    dropoffLocation: item.dropoff_location,
                    passengerCount: item.passenger_count,
                    carCount: item.car_count,
                    vehicleNumber: item.vehicle_number,
                    seatNumber: item.seat_number,
                    driverName: item.driver_name,
                    dispatchCode: item.dispatch_code,
                    totalPrice: item.car_total_price,
                    unitPrice: item.unit_price,
                    note: item.request_note
                });
            });

            // 날짜순 정렬
            services.sort((a, b) => {
                const getDate = (s: any) => {
                    if (s.checkin) return new Date(s.checkin);
                    if (s.ra_datetime) return new Date(s.ra_datetime);
                    if (s.tourDate) return new Date(s.tourDate);
                    if (s.usageDate) return new Date(s.usageDate);
                    if (s.pickupDatetime) return new Date(s.pickupDatetime);
                    if (s.checkinDate) return new Date(s.checkinDate);
                    return new Date(0);
                };
                return getDate(a).getTime() - getDate(b).getTime();
            });

            setModalServices(services);
        } catch (err) {
            console.error('사용자 상세 정보 로드 실패:', err);
        } finally {
            setModalLoading(false);
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'confirmed':
                return <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1 leading-none"><CheckCircle2 className="w-3 h-3" /> 확정</span>;
            case 'approved':
                return <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1 leading-none"><CheckCircle2 className="w-3 h-3" /> 승인</span>;
            case 'pending':
                return <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1 leading-none"><Clock className="w-3 h-3" /> 대기</span>;
            case 'cancelled':
                return <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1 leading-none">취소</span>;
            default:
                return <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1 leading-none">{status}</span>;
        }
    };

    const filteredReservations = reservations.filter(r => {
        const matchesStatus = statusFilter === 'all' || r.re_status === statusFilter;
        const searchStr = searchQuery.toLowerCase();
        const matchesSearch = !searchQuery ||
            r.users?.name?.toLowerCase().includes(searchStr) ||
            r.users?.email?.toLowerCase().includes(searchStr) ||
            r.package_master?.name?.toLowerCase().includes(searchStr) ||
            r.package_master?.package_code?.toLowerCase().includes(searchStr);
        return matchesStatus && matchesSearch;
    });

    return (
        <ManagerLayout title="패키지 예약 관리" activeTab="reservations-package">
            <div className="p-4 sm:p-6 space-y-6">
                {/* 헤더 및 컨트롤 */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                            <Package className="w-6 h-6 text-indigo-600" />
                            패키지 전용 예약 조회
                        </h2>
                        <p className="text-sm text-gray-500 mt-1">패키지 유형의 예약건만 필터링하여 관리합니다.</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={loadPackageReservations}
                            className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                            title="새로고침"
                        >
                            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                        <button
                            onClick={() => router.push('/manager/reservations/package/new')}
                            className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-all flex items-center gap-2 shadow-sm"
                        >
                            <Plus className="w-4 h-4" />
                            패키지 예약 등록
                        </button>
                    </div>
                </div>

                {/* 필터 및 검색 바 */}
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col md:flex-row gap-4">
                    <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="고객명, 이메일, 패키지명 검색..."
                            className="w-full pl-10 pr-4 py-2 bg-gray-50 border-none rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 transition-all"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <div className="flex gap-2">
                        {['all', 'pending', 'approved', 'confirmed', 'cancelled'].map((status) => (
                            <button
                                key={status}
                                onClick={() => setStatusFilter(status)}
                                className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all ${statusFilter === status
                                    ? 'bg-blue-600 text-white shadow'
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                    }`}
                            >
                                {status === 'all' ? '전체' : status === 'pending' ? '대기' : status === 'approved' ? '승인' : status === 'confirmed' ? '확정' : '취소'}
                            </button>
                        ))}
                    </div>
                </div>

                {/* 결과 목록 */}
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-gray-50 shadow-sm">
                        <Loader2 className="w-10 h-10 text-indigo-500 animate-spin mb-4" />
                        <p className="text-gray-500 font-medium">패키지 예약을 불러오고 있습니다...</p>
                    </div>
                ) : filteredReservations.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-gray-100 shadow-sm">
                        <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                            <Package className="w-8 h-8 text-gray-300" />
                        </div>
                        <p className="text-gray-500 font-medium">조회된 패키지 예약이 없습니다.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filteredReservations.map((r) => (
                            <div
                                key={r.re_id}
                                className="bg-white border border-gray-100 rounded-xl p-5 hover:shadow-lg hover:border-indigo-100 transition-all group"
                            >
                                <div className="flex justify-between items-start mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600 font-bold border border-indigo-100">
                                            {r.users?.name?.charAt(0) || 'U'}
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-gray-900 leading-tight">{r.users?.name || '정보 없음'}</h4>
                                            <div className="flex items-center gap-1 text-xs text-gray-400 mt-1">
                                                <Mail className="w-3 h-3" />
                                                {r.users?.email || '이메일 없음'}
                                            </div>
                                        </div>
                                    </div>
                                    {getStatusBadge(r.re_status)}
                                </div>

                                <div className="space-y-3 pt-3 border-t border-gray-50">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-semibold text-gray-400 flex items-center gap-1">
                                            <Package className="w-3 h-3" /> 패키지명
                                        </span>
                                        <span className="text-sm font-bold text-indigo-700">
                                            {r.package_master?.name || r.package_master?.package_code || '일반 패키지'}
                                        </span>
                                    </div>

                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-semibold text-gray-400 flex items-center gap-1">
                                            <User className="w-3 h-3" /> 구성
                                        </span>
                                        <span className="text-sm font-medium text-gray-700">
                                            성인 {r.re_adult_count || 0} / 아동 {r.re_child_count || 0}
                                        </span>
                                    </div>

                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-semibold text-gray-400 flex items-center gap-1">
                                            <Calendar className="w-3 h-3" /> 예약일
                                        </span>
                                        <span className="text-sm font-medium text-gray-700">
                                            {new Date(r.re_created_at).toLocaleDateString('ko-KR')}
                                        </span>
                                    </div>

                                    <div className="flex items-center justify-between bg-gray-50 p-2 rounded-lg mt-2">
                                        <span className="text-xs font-bold text-gray-500 text-xs">총 결제금액</span>
                                        <span className="text-base font-bold text-emerald-600">
                                            {r.total_amount?.toLocaleString() || 0}동
                                        </span>
                                    </div>
                                </div>

                                <button
                                    onClick={() => handleViewDetail(r.re_user_id)}
                                    className="w-full mt-4 py-2 bg-gray-900 text-white rounded-lg text-xs font-bold hover:bg-gray-800 transition-colors flex items-center justify-center gap-2 group-hover:bg-indigo-600"
                                >
                                    <Eye className="w-4 h-4" />
                                    전체 예약 상세 보기
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* 상세 모달 */}
            {isDetailModalOpen && selectedUserId && (
                <PackageReservationDetailModal
                    userInfo={modalUserInfo}
                    allUserServices={modalServices}
                    loading={modalLoading}
                    isOpen={isDetailModalOpen}
                    onClose={() => setIsDetailModalOpen(false)}
                />
            )}
        </ManagerLayout>
    );
}
