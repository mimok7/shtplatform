"use client";
// 렌터카 탭 그룹화 데이터 (조건부 렌더링 직전, 모든 함수/filteredData 선언 이후)
// 렌터카 탭 그룹화 데이터 (조건부 렌더링 직전)
// 렌터카 픽업일시 기준 그룹화 함수 (오늘 이후만)
const groupRentcarByPickupDatetime = (data: ServiceData[]) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const groups: Record<string, ServiceData[]> = {};
    data.forEach(item => {
        if (!item.pickup_datetime) return;
        const dt = new Date(item.pickup_datetime);
        if (dt < today) return;
        const dateKey = dt.toISOString().slice(0, 10);
        if (!groups[dateKey]) groups[dateKey] = [];
        groups[dateKey].push(item);
    });
    const sortedKeys = Object.keys(groups).sort((a, b) => a.localeCompare(b));
    return sortedKeys.map(key => ({
        groupKey: key,
        date: key,
        items: groups[key]
    }));
};


// 투어 usage_date 기준 그룹화 함수 (오늘 이후만)
const groupTourByUsageDate = (data: ServiceData[]) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const filtered = data.filter(item => {
        if (!item.usage_date) return false;
        const usage = new Date(item.usage_date);
        return usage >= today;
    });
    const groups: Record<string, ServiceData[]> = {};
    filtered.forEach(item => {
        const date = item.usage_date ? new Date(item.usage_date).toISOString().slice(0, 10) : '미지정';
        if (!groups[date]) groups[date] = [];
        groups[date].push(item);
    });
    const sortedKeys = Object.keys(groups).sort((a, b) => a.localeCompare(b));
    return sortedKeys.map(date => ({
        groupKey: date,
        date,
        items: groups[date]
    }));
};

// 호텔 checkin_date 기준 그룹화 함수 (오늘 이후만)
const groupHotelByCheckinDate = (data: ServiceData[]) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const filtered = data.filter(item => {
        if (!item.checkin_date) return false;
        const checkin = new Date(item.checkin_date);
        return checkin >= today;
    });
    const groups: Record<string, ServiceData[]> = {};
    filtered.forEach(item => {
        const date = item.checkin_date ? new Date(item.checkin_date).toISOString().slice(0, 10) : '미지정';
        if (!groups[date]) groups[date] = [];
        groups[date].push(item);
    });
    const sortedKeys = Object.keys(groups).sort((a, b) => a.localeCompare(b));
    return sortedKeys.map(date => ({
        groupKey: date,
        date,
        items: groups[date]
    }));
};

import React, { useState, useEffect } from 'react';
import ManagerLayout from '../../../components/ManagerLayout';
import UserReservationDetailModal from '../../../components/UserReservationDetailModal';
import supabase from '../../../lib/supabase';
import { fetchTableInBatches, fetchServiceByReservationIds } from '../../../lib/fetchInBatches';
import { buildServiceMap } from '../../../lib/serviceMaps';
import {
    Ship,
    Plane,
    Building,
    MapPin,
    Car,
    Calendar,
    Search,
    Eye,
    User,
    Package,
    Trash2
} from 'lucide-react';

interface ServiceData {
    id: string;
    [key: string]: any;
}

interface RoomPriceInfo {
    room_code: string;
    name: string;
}

export default function ManagerServiceTablesPage() {
    const DELETE_ALLOWED_EMAIL = 'kys@hyojacho.es.kr';
    // 기간 필터 상태
    const [period, setPeriod] = useState<'7' | '15' | '30' | 'all'>('7');
    const periodOptions = [
        { label: '7일', value: '7' },
        { label: '15일', value: '15' },
        { label: '30일', value: '30' },
        { label: '전체', value: 'all' }
    ];
    const [activeTab, setActiveTab] = useState('cruise');
    const [serviceData, setServiceData] = useState<ServiceData[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [loadError, setLoadError] = useState<string | null>(null);
    const [selectedItem, setSelectedItem] = useState<ServiceData | null>(null);
    const [currentUserEmail, setCurrentUserEmail] = useState('');
    const [deletingReservationId, setDeletingReservationId] = useState<string | null>(null);

    // DB 예약 상세 모달 상태
    const [isDBModalOpen, setIsDBModalOpen] = useState(false);
    const [dbUserInfo, setDbUserInfo] = useState<any>(null);
    const [dbUserServices, setDbUserServices] = useState<any[]>([]);
    const [dbModalLoading, setDbModalLoading] = useState(false);
    // 보기 스타일: 테이블 / 카드
    const [viewStyle, setViewStyle] = useState<'table' | 'card'>('table');
    // ...existing code...
    // 호텔 checkin_date 기준 그룹화 (오늘 이후만)
    const [roomPriceMap, setRoomPriceMap] = useState<Record<string, { cruise: string; room_type: string; name: string }>>({});
    const [carPriceMap, setCarPriceMap] = useState<Record<string, { car_type?: string }>>({});
    // 상태: 공항 가격 테이블 맵 추가
    const [airportPriceMap, setAirportPriceMap] = useState<Record<string, { category?: string; route?: string; car_type?: string }>>({});
    // 상태: 투어 가격 맵 추가
    const [tourPriceStateMap, setTourPriceStateMap] = useState<Record<string, { tour_name?: string; tour_type?: string }>>({});
    // 상태: 패키지 마스터 맵 추가
    const [packageMasterMap, setPackageMasterMap] = useState<Record<string, { name: string; package_code: string }>>({});

    const canDeleteReservation = currentUserEmail.toLowerCase() === DELETE_ALLOWED_EMAIL;

    useEffect(() => {
        let mounted = true;
        supabase.auth.getUser().then(({ data }) => {
            if (!mounted) return;
            setCurrentUserEmail(data?.user?.email || '');
        });
        return () => {
            mounted = false;
        };
    }, []);

    const serviceTabs = [
        { id: 'cruise', label: '크루즈', icon: <Ship className="w-4 h-4" />, color: 'blue' },
        { id: 'cruise_car', label: '크루즈 차량', icon: <Car className="w-4 h-4" />, color: 'cyan' },
        { id: 'sht_car', label: '스하 차량', icon: <Car className="w-4 h-4" />, color: 'teal' },
        { id: 'airport', label: '공항서비스', icon: <Plane className="w-4 h-4" />, color: 'green' },
        { id: 'hotel', label: '호텔', icon: <Building className="w-4 h-4" />, color: 'purple' },
        { id: 'tour', label: '투어', icon: <MapPin className="w-4 h-4" />, color: 'orange' },
        { id: 'rentcar', label: '렌터카', icon: <Car className="w-4 h-4" />, color: 'red' },
        { id: 'package', label: '패키지', icon: <Package className="w-4 h-4" />, color: 'indigo' },
        { id: 'fasttrack', label: '패스트랙', icon: <Plane className="w-4 h-4" />, color: 'emerald' }
    ];

    // 서비스별 데이터 로드 (중첩 embed 회피: 서비스 → 예약 → 사용자 순으로 별도 조회 후 병합)
    const loadServiceData = async (serviceType: string) => {
        // 기간 필터 계산
        let dateFilterCol = '';
        if (serviceType === 'cruise') dateFilterCol = 'checkin';
        else if (serviceType === 'cruise_car') dateFilterCol = 'pickup_datetime';
        else if (serviceType === 'hotel') dateFilterCol = 'checkin_date';
        else if (serviceType === 'airport') dateFilterCol = 'ra_datetime';
        // (렌더링 return 직전, 상태 선언 이후에 위치)
        // ...existing code...
        // 호텔 탭일 때만 그룹화 데이터 사용
        else if (serviceType === 'rentcar') dateFilterCol = 'pickup_datetime';
        else if (serviceType === 'tour') dateFilterCol = 'tour_date';
        else if (serviceType === 'sht_car') dateFilterCol = 'usage_date';
        else if (serviceType === 'package') dateFilterCol = 're_created_at';
        else if (serviceType === 'fasttrack') dateFilterCol = 'created_at';
        setLoading(true);
        setLoadError(null);
        try {
            let tableName = '';
            // 서비스별 기본 정렬 키 후보
            const orderCandidates: string[] = [];

            switch (serviceType) {
                case 'cruise':
                    tableName = 'reservation_cruise';
                    orderCandidates.push('created_at', 'checkin', 'id');
                    break;
                case 'cruise_car':
                    tableName = 'reservation_cruise_car';
                    orderCandidates.push('created_at', 'id');
                    break;
                case 'sht_car':
                    tableName = 'reservation_car_sht';
                    orderCandidates.push('created_at', 'id');
                    break;
                case 'airport':
                    tableName = 'reservation_airport';
                    orderCandidates.push('ra_datetime', 'created_at', 'id');
                    break;
                case 'hotel':
                    tableName = 'reservation_hotel';
                    orderCandidates.push('checkin_date', 'created_at', 'id');
                    break;
                case 'tour':
                    tableName = 'reservation_tour';
                    orderCandidates.push('created_at', 'id');
                    break;
                case 'rentcar':
                    tableName = 'reservation_rentcar';
                    orderCandidates.push('pickup_datetime', 'created_at', 'id');
                    break;
                case 'package':
                    tableName = 'reservation';
                    orderCandidates.push('re_created_at', 're_id');
                    break;
                case 'fasttrack':
                    tableName = 'reservation_airport_fasttrack';
                    orderCandidates.push('created_at', 'id');
                    break;
                default:
                    return;
            }

            // 1) 서비스 행만 먼저 조회
            let serviceRows: any[] = [];
            let lastError: any = null;
            for (const col of orderCandidates) {
                let query = supabase.from(tableName).select('*').order(col as any, { ascending: false });

                // 패키지 탭인 경우 re_type = 'package' 필터 추가
                if (serviceType === 'package') {
                    query = query.eq('re_type', 'package').not('package_id', 'is', null);
                }

                // 오늘~6일 뒤까지만(gte 오늘, lte 오늘+6일)
                let dateFrom: Date | null = null;
                let dateTo: Date | null = null;
                if (period !== 'all') {
                    dateFrom = new Date();
                    dateFrom.setHours(0, 0, 0, 0);
                    dateTo = new Date(dateFrom);
                    dateTo.setDate(dateFrom.getDate() + parseInt(period, 10) - 1);
                    dateTo.setHours(23, 59, 59, 999);
                }
                if (dateFilterCol && dateFrom && dateTo) {
                    query = query.gte(dateFilterCol, dateFrom.toISOString().slice(0, 10)).lte(dateFilterCol, dateTo.toISOString().slice(0, 10));
                }
                const { data, error } = await query;
                if (!error) {
                    serviceRows = data || [];
                    lastError = null;
                    break;
                } else {
                    lastError = error;
                    console.warn(`[${serviceType}] 정렬 실패: '${col}' → 다음 후보로 진행`);
                }
            }
            if (!serviceRows.length && lastError) {
                // 마지막으로 정렬 없이 재시도
                let query = supabase.from(tableName).select('*');
                let dateFrom: Date | null = null;
                let dateTo: Date | null = null;
                if (period !== 'all') {
                    dateFrom = new Date();
                    dateFrom.setHours(0, 0, 0, 0);
                    dateTo = new Date(dateFrom);
                    dateTo.setDate(dateFrom.getDate() + parseInt(period, 10) - 1);
                    dateTo.setHours(23, 59, 59, 999);
                }
                if (dateFilterCol && dateFrom && dateTo) {
                    query = query.gte(dateFilterCol, dateFrom.toISOString().slice(0, 10)).lte(dateFilterCol, dateTo.toISOString().slice(0, 10));
                }
                const { data, error } = await query;
                if (error) {
                    setLoadError(error.message || '데이터 로딩 실패');
                    setServiceData([]);
                    setLoading(false);
                    return;
                }
                serviceRows = data || [];
            }

            if (serviceRows.length === 0) {
                setServiceData([]);
                setLoading(false);
                return;
            }

            // 2) 예약 정보 일괄 조회
            const reservationIds = Array.from(new Set(serviceRows.map(r => r.reservation_id || r.re_id).filter(Boolean)));
            let reservationMap: Record<string, any> = {};
            if (reservationIds.length) {
                // 패키지 탭인 경우 이미 reservation 정보를 가지고 있으므로 생략하거나 보정 가능
                if (serviceType === 'package') {
                    reservationMap = serviceRows.reduce((acc, r) => {
                        acc[r.re_id] = r;
                        return acc;
                    }, {} as Record<string, any>);
                } else {
                    const reservations = await fetchTableInBatches('reservation', 're_id', reservationIds, 're_id, re_user_id, re_type, re_status, re_created_at', 100);
                    reservationMap = (reservations as any[]).reduce((acc, r) => {
                        acc[r.re_id] = r;
                        return acc;
                    }, {} as Record<string, any>);
                }
            }

            // 3) 사용자 정보 일괄 조회 (예약에서 사용자ID 수집)
            const userIds = Array.from(new Set(Object.values(reservationMap).map((r: any) => r.re_user_id).filter(Boolean)));
            let userMap: Record<string, any> = {};
            if (userIds.length) {
                const users = await fetchTableInBatches('users', 'id', userIds as string[], 'id, name, email, phone_number', 100);
                userMap = (users as any[]).reduce((acc, u) => {
                    acc[u.id] = {
                        id: u.id,
                        name: u.name || (u.email ? u.email.split('@')[0] : '사용자'),
                        email: u.email,
                        phone: u.phone_number || '',
                    };
                    return acc;
                }, {} as Record<string, any>);
            }

            // 3-1) 패스트랙 탭 보강: reservation_airport 정보(공항명/위치) 매핑
            let airportReservationMap: Record<string, any> = {};
            if (serviceType === 'fasttrack') {
                const airportReservationIds = Array.from(new Set(serviceRows.map(r => r.reservation_airport_id).filter(Boolean)));
                if (airportReservationIds.length) {
                    const airportRows = await fetchTableInBatches(
                        'reservation_airport',
                        'id',
                        airportReservationIds,
                        'id, ra_airport_name, ra_airport_location',
                        100
                    );
                    airportReservationMap = (airportRows as any[]).reduce((acc, row) => {
                        acc[row.id] = row;
                        return acc;
                    }, {} as Record<string, any>);
                }
            }

            // 4) 병합: 각 서비스 행에 reservation, users 연결
            const merged = serviceRows.map(row => {
                const resId = row.reservation_id || row.re_id;
                const res = reservationMap[resId];
                const user = res ? userMap[res.re_user_id] : undefined;
                const airportDetail = row.reservation_airport_id ? airportReservationMap[row.reservation_airport_id] : undefined;
                return {
                    ...row,
                    airport_name: airportDetail?.ra_airport_name || airportDetail?.ra_airport_location || '-',
                    ra_airport_location: airportDetail?.ra_airport_location || '-',
                    reservation: res ? { ...res, users: user } : undefined
                } as ServiceData;
            });

            setServiceData(merged);
        } catch (error) {
            console.error('서비스 데이터 로딩 실패:', error);
            setLoadError((error as any)?.message || '데이터 로딩 실패');
            setServiceData([]);
        } finally {
            setLoading(false);
        }
    };

    // 탭/기간 변경시 데이터 로드
    useEffect(() => {
        loadServiceData(activeTab);
    }, [activeTab, period]);

    // 객실 가격 테이블(cruise_rate_card)에서 객실명, 크루즈, 객실타입 맵 로드
    // 모든 가격 맵을 한 번에 병렬로 로드 (성능 최적화)
    useEffect(() => {
        async function fetchAllPriceMaps() {
            const [roomRes, carRes, airportRes, packageRes, tourRes] = await Promise.all([
                supabase.from('cruise_rate_card').select('id, cruise_name, room_type').eq('is_active', true),
                supabase.from('rentcar_price').select('rent_code, vehicle_type'),
                supabase.from('airport_price').select('airport_code, service_type, route, vehicle_type'),
                supabase.from('package_master').select('id, name, package_code'),
                supabase.from('tour').select('tour_code, tour_name, category, tour_id').eq('is_active', true)
            ]);

            // Room Price Map
            if (!roomRes.error && roomRes.data) {
                const map: Record<string, { cruise: string; room_type: string; name: string }> = {};
                roomRes.data.forEach((row: any) => {
                    if (row.id) {
                        map[row.id] = {
                            cruise: row.cruise_name || '-',
                            room_type: row.room_type || '-',
                            name: '-'
                        };
                    }
                });
                setRoomPriceMap(map);
            }

            // Car Price Map
            if (!carRes.error && carRes.data) {
                const map: Record<string, { car_type?: string }> = {};
                carRes.data.forEach((row: any) => {
                    if (row.rent_code) {
                        map[row.rent_code] = { car_type: row.vehicle_type || '-' };
                    }
                });
                setCarPriceMap(map);
            }

            // Airport Price Map
            if (!airportRes.error && airportRes.data) {
                const map: Record<string, { category?: string; route?: string; car_type?: string }> = {};
                airportRes.data.forEach((row: any) => {
                    if (row.airport_code) {
                        map[row.airport_code] = {
                            category: row.service_type || '-',
                            route: row.route || '-',
                            car_type: row.vehicle_type || '-'
                        };
                    }
                });
                setAirportPriceMap(map);
            }

            // Package Master Map
            if (!packageRes.error && packageRes.data) {
                const map: Record<string, { name: string; package_code: string }> = {};
                packageRes.data.forEach((row: any) => {
                    if (row.id) {
                        map[row.id] = { name: row.name, package_code: row.package_code };
                    }
                });
                setPackageMasterMap(map);
            }

            // Tour Price Map
            if (!tourRes.error && tourRes.data) {
                const map: Record<string, { tour_name?: string; tour_type?: string }> = {};
                tourRes.data.forEach((row: any) => {
                    if (row.tour_code) {
                        map[row.tour_code] = {
                            tour_name: row.tour_name || '-',
                            tour_type: row.tour_type || '-'
                        };
                    }
                });
                setTourPriceStateMap(map);
            }
        }
        fetchAllPriceMaps();
    }, []);

    // 검색 필터링
    const filteredData = serviceData.filter(item => {
        if (activeTab === 'sht_car') {
            // 오늘 이후 사용일자만 표시 (usage_date가 오늘 이후)
            if (!item.usage_date) return false;
            const usageDate = new Date(item.usage_date);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            if (usageDate < today) return false;
        }

        if (!searchTerm) return true;

        const searchLower = searchTerm.toLowerCase();
        const userName = item.reservation?.users?.name?.toLowerCase() || '';
        const userEmail = item.reservation?.users?.email?.toLowerCase() || '';
        const reservationId = item.reservation?.re_id?.toLowerCase() || '';

        return userName.includes(searchLower) ||
            userEmail.includes(searchLower) ||
            reservationId.includes(searchLower);
    });

    // 크루즈 체크인별 그룹화 함수 (오늘 이후만)
    const groupCruiseByCheckin = (data: ServiceData[]) => {
        // 오늘 이후(오늘 포함) 체크인만
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const filtered = data.filter(item => {
            if (!item.checkin) return false;
            const checkinDate = new Date(item.checkin);
            return checkinDate >= today;
        });

        // 체크인 날짜별 그룹화 (오름차순)
        const groups: Record<string, ServiceData[]> = {};
        filtered.forEach(item => {
            const date = item.checkin ? new Date(item.checkin).toISOString().slice(0, 10) : '미지정';
            if (!groups[date]) groups[date] = [];
            groups[date].push(item);
        });

        const sortedKeys = Object.keys(groups).sort((a, b) => a.localeCompare(b));
        return sortedKeys.map(key => ({
            groupKey: key,
            date: key,
            items: groups[key]
        }));
    };

    // 크루즈 탭일 때만 그룹화 데이터 사용
    const isCruiseTab = activeTab === 'cruise';
    const groupedCruise = isCruiseTab ? groupCruiseByCheckin(serviceData) : [];

    // 서비스별 테이블 컬럼 정의
    const getTableColumns = (serviceType: string) => {
        switch (serviceType) {
            case 'cruise':
                return [
                    { key: 'reservation.users.name', label: '고객명', width: 'w-32' },
                    { key: 'reservation.users.email', label: '이메일', width: 'w-48' },
                    { key: 'checkin', label: '체크인', width: 'w-32', type: 'date' },
                    { key: 'room_price_code', label: '객실코드', width: 'w-32' },
                    { key: 'cruise_name', label: '크루즈', width: 'w-40' }, // 크루즈명
                    { key: 'room_type_name', label: '객실타입', width: 'w-40' }, // 객실타입명
                    { key: 'room_name', label: '구분', width: 'w-40' }, // 객실명 추가
                    { key: 'guest_count', label: '인원', width: 'w-20' },
                    { key: 'room_total_price', label: '총금액', width: 'w-32', type: 'price' },
                    { key: 'reservation.re_status', label: '상태', width: 'w-24', type: 'status' }
                ];
            case 'cruise_car':
                return [
                    { key: 'reservation.users.name', label: '고객명', width: 'w-32' },
                    { key: 'reservation.users.email', label: '이메일', width: 'w-48' },
                    { key: 'car_price_code', label: '차량코드', width: 'w-32' },
                    { key: 'car_type_name', label: '차량명', width: 'w-32' }, // 차량명(차량타입) 추가
                    { key: 'pickup_location', label: '픽업장소', width: 'w-40' },
                    { key: 'dropoff_location', label: '드롭장소', width: 'w-40' },
                    { key: 'pickup_datetime', label: '픽업일시', width: 'w-40', type: 'datetime' },
                    { key: 'unit_price', label: '단가', width: 'w-32', type: 'price' },
                    { key: 'reservation.re_status', label: '상태', width: 'w-24', type: 'status' }
                ];
            case 'sht_car':
                return [

                    { key: 'usage_date', label: '사용일자', width: 'w-32', type: 'date' }, // 사용일자(usage_date)
                    { key: 'sht_category', label: '카테고리', width: 'w-24' }, // 카테고리(sht_category)
                    { key: 'vehicle_number', label: '차량번호', width: 'w-32' },
                    { key: 'seat_number', label: '좌석번호', width: 'w-20' },
                    { key: 'reservation.users.name', label: '고객명', width: 'w-32' },
                    { key: 'reservation.users.email', label: '이메일', width: 'w-48' },
                    { key: 'reservation.re_status', label: '상태', width: 'w-24', type: 'status' }
                ];
            case 'airport':
                return [
                    { key: 'reservation.users.name', label: '고객명', width: 'w-32' },
                    { key: 'reservation.users.email', label: '이메일', width: 'w-48' },
                    { key: 'airport_price_code', label: '코드', width: 'w-32' }, // 공항 가격 코드 추가
                    { key: 'service_type', label: '구분', width: 'w-24' }, // 서비스타입
                    { key: 'route', label: '경로', width: 'w-40' },   // 경로
                    { key: 'vehicle_type', label: '차량', width: 'w-32' }, // 차량타입
                    { key: 'ra_airport_location', label: '공항', width: 'w-42' },
                    { key: 'ra_datetime', label: '일시', width: 'w-60', type: 'datetime' },
                    { key: 'ra_passenger_count', label: '승객', width: 'w-10' },
                    { key: 'ra_car_count', label: '차량', width: 'w-10' },
                    { key: 'total_price', label: '총금액', width: 'w-32', type: 'price' },
                    { key: 'reservation.re_status', label: '상태', width: 'w-24', type: 'status' }
                ];
            case 'hotel':
                return [
                    { key: 'reservation.users.name', label: '고객명', width: 'w-32' },
                    { key: 'reservation.users.email', label: '이메일', width: 'w-48' },
                    { key: 'checkin_date', label: '체크인', width: 'w-32', type: 'date' },
                    { key: 'guest_count', label: '인원', width: 'w-20' },
                    { key: 'room_count', label: '객실수', width: 'w-20' },
                    { key: 'hotel_category', label: '호텔등급', width: 'w-32' },
                    { key: 'total_price', label: '총금액', width: 'w-32', type: 'price' },
                    { key: 'reservation.re_status', label: '상태', width: 'w-24', type: 'status' }
                ];
            case 'tour':
                return [
                    { key: 'reservation.users.name', label: '고객명', width: 'w-32' },
                    { key: 'reservation.users.email', label: '이메일', width: 'w-48' },
                    { key: 'tour_price_code', label: '투어코드', width: 'w-32' },
                    { key: 'tour_capacity', label: '참가인원', width: 'w-24' },
                    { key: 'pickup_location', label: '픽업장소', width: 'w-40' },
                    { key: 'usage_date', label: '사용일자', width: 'w-32', type: 'date' },
                    { key: 'total_price', label: '총금액', width: 'w-32', type: 'price' },
                    { key: 'reservation.re_status', label: '상태', width: 'w-24', type: 'status' }
                ];
            case 'rentcar':
                return [
                    { key: 'reservation.users.name', label: '고객명', width: 'w-32' },
                    { key: 'reservation.users.email', label: '이메일', width: 'w-48' },
                    { key: 'pickup_datetime', label: '픽업일시', width: 'w-40', type: 'datetime' },
                    { key: 'passenger_count', label: '승객수', width: 'w-20' },
                    { key: 'pickup_location', label: '픽업장소', width: 'w-40' },
                    { key: 'destination', label: '목적지', width: 'w-40' },
                    { key: 'return_datetime', label: '리턴일시', width: 'w-40', type: 'datetime' },
                    { key: 'return_pickup_location', label: '리턴픽업', width: 'w-40' },
                    { key: 'return_destination', label: '리턴목적지', width: 'w-40' },
                    { key: 'total_price', label: '총금액', width: 'w-32', type: 'price' },
                    { key: 'reservation.re_status', label: '상태', width: 'w-24', type: 'status' }
                ];
            case 'package':
                return [
                    { key: 'reservation.re_id', label: '예약ID', width: 'w-24' },
                    { key: 'reservation.users.name', label: '고객명', width: 'w-32' },
                    { key: 'package_name', label: '패키지명', width: 'w-48' },
                    { key: 'pax_count', label: '인원', width: 'w-20' },
                    { key: 'total_amount', label: '총금액', width: 'w-32', type: 'price' },
                    { key: 'reservation.re_status', label: '상태', width: 'w-24', type: 'status' }
                ];
            case 'fasttrack':
                return [
                    { key: 'reservation.re_id', label: '예약ID', width: 'w-24' },
                    { key: 'reservation.users.name', label: '고객명', width: 'w-32' },
                    { key: 'way_type', label: '구분', width: 'w-20' },
                    { key: 'airport_name', label: '공항명', width: 'w-40' },
                    { key: 'applicant_name', label: '신청자', width: 'w-32' },
                    { key: 'applicant_order', label: '순번', width: 'w-20' },
                    { key: 'total_price_usd', label: '패스트랙금액(USD)', width: 'w-28' },
                    { key: 'total_price_krw', label: '패스트랙금액(KRW)', width: 'w-32' },
                    { key: 'created_at', label: '신청일시', width: 'w-40', type: 'datetime' },
                    { key: 'reservation.re_status', label: '상태', width: 'w-24', type: 'status' }
                ];
            default:
                return [];
        }
    };

    // 값 포맷팅 (크루즈명, 객실타입명, 객실명 처리)
    const formatValue = (value: any, type?: string, row?: any, columnKey?: string) => {
        // 패키지 서비스 매핑
        if (columnKey === 'package_name') {
            const pkgId = row?.package_id;
            return pkgId && packageMasterMap[pkgId] ? packageMasterMap[pkgId].name : (row?.package_code || '-');
        }

        // 공항 서비스 매핑 - airport_price_code로 airport_price 테이블 검색
        if (columnKey === 'service_type') {
            const code = row?.airport_price_code;
            return code && airportPriceMap[code] ? airportPriceMap[code].category : '-';
        }
        if (columnKey === 'route') {
            const code = row?.airport_price_code;
            return code && airportPriceMap[code] ? airportPriceMap[code].route : '-';
        }
        if (columnKey === 'vehicle_type') {
            const code = row?.airport_price_code;
            return code && airportPriceMap[code] ? airportPriceMap[code].car_type : '-';
        }
        if (columnKey === 'way_type') {
            const way = String(value || '').toLowerCase();
            if (way === 'pickup') return '픽업';
            if (way === 'sending') return '샌딩';
            return value || '-';
        }
        if (columnKey === 'total_price_usd') {
            if (value === null || value === undefined || value === '') return '-';
            return `${Number(value).toLocaleString()}$`;
        }
        if (columnKey === 'total_price_krw') {
            if (value === null || value === undefined || value === '') return '-';
            return `${Number(value).toLocaleString()}원`;
        }

        // 차량 서비스 매핑
        if (columnKey === 'car_type_name') {
            const code = row?.car_price_code;
            return code && carPriceMap[code] ? carPriceMap[code].car_type : '-';
        }

        // 크루즈 서비스 매핑 (room_price_code → cruise_rate_card 테이블에서 반드시 가져오기)
        const fetchRoomPriceFallback = async (code: string) => {
            if (!code) return '미지정';
            const { data, error } = await supabase
                .from('cruise_rate_card')
                .select('cruise_name, room_type')
                .eq('id', code)
                .single();
            if (error || !data) return code;
            return {
                cruise: data.cruise_name || code,
                room_type: data.room_type || code,
                name: '-'
            };
        };

        if (columnKey === 'cruise_name' || columnKey === 'room_type_name' || columnKey === 'room_name') {
            const code = row?.room_price_code;
            if (!code) return '미지정';
            if (roomPriceMap[code]) {
                if (columnKey === 'cruise_name') return roomPriceMap[code].cruise || code;
                if (columnKey === 'room_type_name') return roomPriceMap[code].room_type || code;
                if (columnKey === 'room_name') return roomPriceMap[code].name || code;
            }
            // 동적으로 fallback fetch (비동기)
            // SSR/CSR 환경에 따라 Promise 반환 허용 (UI에서 await 처리 필요)
            if (typeof window !== 'undefined') {
                // 클라이언트에서만 fetch
                fetchRoomPriceFallback(code).then(fallback => {
                    if (typeof fallback === 'string') return; // 실패시 코드 그대로
                    // fallback 값으로 강제 렌더링 트리거 (임시)
                    setRoomPriceMap(prev => ({ ...prev, [code]: fallback }));
                });
            }
            return code;
        }

        if (!value && value !== 0) return '-';

        switch (type) {
            case 'date':
                return new Date(value).toLocaleDateString('ko-KR');
            case 'datetime':
                return new Date(value).toLocaleString('ko-KR');
            case 'price':
                return `${value.toLocaleString()}원`;
            case 'status':
                return getStatusBadge(value);
            default:
                return value;
        }
    };

    // 상태 배지
    const getStatusBadge = (status: string) => {
        const statusConfig = {
            'confirmed': { bg: 'bg-green-100', text: 'text-green-800', label: '확정' },
            'approved': { bg: 'bg-blue-100', text: 'text-blue-800', label: '승인' },
            'pending': { bg: 'bg-yellow-100', text: 'text-yellow-800', label: '대기중' },
            'cancelled': { bg: 'bg-red-100', text: 'text-red-800', label: '취소' }
        };

        const config = statusConfig[status as keyof typeof statusConfig] ||
            { bg: 'bg-gray-100', text: 'text-gray-800', label: status };

        return (
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
                {config.label}
            </span>
        );
    };

    // 서비스 아이콘 by 탭 id
    const getServiceIcon = (id: string) => {
        switch (id) {
            case 'cruise': return <Ship className="w-5 h-5 text-blue-600" />;
            case 'cruise_car': return <Car className="w-5 h-5 text-cyan-600" />;
            case 'sht_car': return <Car className="w-5 h-5 text-teal-600" />;
            case 'airport': return <Plane className="w-5 h-5 text-green-600" />;
            case 'hotel': return <Building className="w-5 h-5 text-purple-600" />;
            case 'tour': return <MapPin className="w-5 h-5 text-orange-600" />;
            case 'rentcar': return <Car className="w-5 h-5 text-red-600" />;
            case 'package': return <Package className="w-5 h-5 text-indigo-600" />;
            case 'fasttrack': return <Plane className="w-5 h-5 text-emerald-600" />;
            default: return <Calendar className="w-5 h-5 text-gray-600" />;
        }
    };

    // 카드 렌더링
    const renderServiceCard = (item: any, serviceType: string) => {
        // 공통 필드
        const userName = item?.reservation?.users?.name || (item?.reservation?.users?.email?.split('@')[0]) || '사용자';
        const userEmail = item?.reservation?.users?.email || '';
        const status = item?.reservation?.re_status || 'pending';

        // 서비스별 주요 라인/라벨
        let title = '';
        let sub = '';
        let whenStr = '';
        let extra: string | null = null;

        if (serviceType === 'cruise') {
            const code = item.room_price_code;
            const cruiseName = code && roomPriceMap[code]?.cruise;
            const roomType = code && roomPriceMap[code]?.room_type;
            title = [cruiseName, roomType].filter(Boolean).join(' / ') || (code || '크루즈');
            sub = (code && roomPriceMap[code]?.name) || '';
            whenStr = item.checkin ? new Date(item.checkin).toLocaleDateString('ko-KR') : '';
            extra = item.room_total_price ? `${item.room_total_price.toLocaleString()}동` : null;
        } else if (serviceType === 'cruise_car') {
            const code = item.car_price_code;
            const carType = code && carPriceMap[code]?.car_type;
            title = carType || (code || '차량');
            sub = [item.pickup_location, item.dropoff_location].filter(Boolean).join(' → ');
            whenStr = item.pickup_datetime ? new Date(item.pickup_datetime).toLocaleString('ko-KR') : '';
            extra = item.unit_price ? `${item.unit_price.toLocaleString()}동` : null;
        } else if (serviceType === 'sht_car') {
            title = item.sht_category || item.vehicle_number || '스하 차량';
            sub = item.vehicle_number ? `차량번호 ${item.vehicle_number}${item.seat_number ? ` · 좌석 ${item.seat_number}` : ''}` : (item.seat_number ? `좌석 ${item.seat_number}` : '');
            whenStr = item.usage_date ? new Date(item.usage_date).toLocaleDateString('ko-KR') : '';
        } else if (serviceType === 'airport') {
            const code = item.airport_price_code;
            const cat = code && airportPriceMap[code]?.category;
            const route = code && airportPriceMap[code]?.route;
            // 공항 서비스명: 카테고리(픽업/샌딩) 기반으로 표시
            const categoryLabel = cat?.includes('픽업') ? '픽업' : cat?.includes('샌딩') ? '샌딩' : cat;
            title = categoryLabel ? `공항(${categoryLabel})` : '공항';
            sub = item.ra_airport_location || '';
            whenStr = item.ra_datetime ? new Date(item.ra_datetime).toLocaleString('ko-KR') : '';
            extra = [item.ra_passenger_count ? `${item.ra_passenger_count}명` : null, item.ra_car_count ? `${item.ra_car_count}대` : null].filter(Boolean).join(' · ') || null;
        } else if (serviceType === 'hotel') {
            title = item.hotel_category || '호텔';
            sub = [item.room_count ? `${item.room_count}객실` : null, item.guest_count ? `${item.guest_count}명` : null].filter(Boolean).join(' · ');
            whenStr = item.checkin_date ? new Date(item.checkin_date).toLocaleDateString('ko-KR') : '';
            extra = item.total_price ? `${item.total_price.toLocaleString()}동` : null;
        } else if (serviceType === 'tour') {
            const tourCode = item.tour_price_code;
            const tourName = tourCode && tourPriceStateMap[tourCode]?.tour_name;
            const tourType = tourCode && tourPriceStateMap[tourCode]?.tour_type;
            // 투어명 표시: 투어명이 있으면 사용, 없으면 투어타입, 없으면 '투어'
            title = tourName || tourType || '투어';
            sub = [item.pickup_location, item.dropoff_location].filter(Boolean).join(' → ');
            const d = (item.usage_date || item.tour_date);
            whenStr = d ? new Date(d).toLocaleDateString('ko-KR') : '';
            extra = item.total_price ? `${item.total_price.toLocaleString()}동` : null;
        } else if (serviceType === 'rentcar') {
            title = '렌터카';
            const pickupRoute = [item.pickup_location, item.destination].filter(Boolean).join(' → ');
            const returnRoute = [item.return_pickup_location, item.return_destination].filter(Boolean).join(' → ');
            sub = [
                pickupRoute ? `픽업경로: ${pickupRoute}` : null,
                returnRoute ? `리턴경로: ${returnRoute}` : null,
            ].filter(Boolean).join(' | ');
            const pickupText = item.pickup_datetime ? `픽업: ${new Date(item.pickup_datetime).toLocaleString('ko-KR')}` : null;
            const returnText = item.return_datetime ? `리턴: ${new Date(item.return_datetime).toLocaleString('ko-KR')}` : null;
            whenStr = [pickupText, returnText].filter(Boolean).join(' | ');
            extra = [item.passenger_count ? `${item.passenger_count}명` : null, item.total_price ? `${item.total_price.toLocaleString()}동` : null].filter(Boolean).join(' · ') || null;
        } else if (serviceType === 'package') {
            const pkgId = item.package_id;
            title = (pkgId && packageMasterMap[pkgId]?.name) || item.package_code || '패키지';
            sub = `인원: ${[item.re_adult_count ? `성인 ${item.re_adult_count}` : null, item.re_child_count ? `아동 ${item.re_child_count}` : null].filter(Boolean).join(' ')}`;
            whenStr = item.re_created_at ? new Date(item.re_created_at).toLocaleDateString('ko-KR') : '';
            extra = item.total_amount ? `${item.total_amount.toLocaleString()}동` : null;
        } else if (serviceType === 'fasttrack') {
            const way = String(item.way_type || '').toLowerCase();
            const wayLabel = way === 'pickup' ? '픽업' : way === 'sending' ? '샌딩' : (item.way_type || '구분없음');
            title = `패스트랙(${wayLabel})`;
            sub = item.applicant_name ? `${item.applicant_name}${item.applicant_order ? ` · ${item.applicant_order}번` : ''}` : '신청자 미입력';
            whenStr = item.created_at ? new Date(item.created_at).toLocaleString('ko-KR') : '';
            extra = [item.airport_name, item.reservation?.re_id].filter(Boolean).join(' · ') || null;
        }

        // 패키지 여부 확인
        const isPackage = item?.reservation?.re_type === 'package';

        return (
            <div key={item.id || `${serviceType}-${item.reservation?.re_id || Math.random()}`} className="bg-gray-50 border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-all p-3 flex flex-col h-full">
                <div className="flex items-center gap-2 mb-2 pb-1 border-b border-gray-100">
                    <div className="flex items-center justify-center w-9 h-9 rounded-full bg-gray-50 border border-gray-200">
                        {getServiceIcon(serviceType)}
                    </div>
                    <h5 className="font-bold text-sm flex-1 truncate text-gray-800">{title || serviceType}</h5>
                    {isPackage && (
                        <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-700 text-xs rounded font-medium">📦</span>
                    )}
                    <div className="flex items-center gap-2">
                        {getStatusBadge(status)}
                        <button
                            onClick={() => handleViewDetails(item)}
                            className="bg-blue-500 text-white py-0.5 px-2 rounded text-xs hover:bg-blue-600 transition-colors"
                        >상세</button>
                        {canDeleteReservation && (
                            <button
                                onClick={() => handleDeleteReservation(item)}
                                disabled={deletingReservationId === getReservationIdFromItem(item)}
                                className="bg-red-500 text-white py-0.5 px-2 rounded text-xs hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                삭제
                            </button>
                        )}
                    </div>
                </div>
                <div className="flex flex-col gap-1 text-sm text-gray-700 mt-1">
                    <div className="flex items-center gap-2"><span className="font-semibold text-green-800 text-xs">고객</span><span className="text-sm">{userName}</span></div>
                    <div className="flex items-center gap-2"><span className="font-semibold text-green-800 text-xs">이메일</span><span className="text-sm">{userEmail || '-'}</span></div>
                    {whenStr && (
                        <div className="flex items-center gap-2 mt-1">
                            <Calendar className="w-4 h-4 text-gray-400" />
                            <span className="text-sm">{whenStr}</span>
                        </div>
                    )}
                    {sub && (<div className="flex items-center gap-2"><span className="text-sm">{sub}</span></div>)}
                    {extra && (<div className="flex items-center gap-2"><span className="text-xs text-gray-500">{extra}</span></div>)}
                </div>
            </div>
        );
    };

    // 중첩 객체 값 가져오기
    const getNestedValue = (obj: any, path: string) => {
        return path.split('.').reduce((o, p) => o?.[p], obj);
    };

    // 상세 정보 표시를 위한 매핑 함수 수정
    const getEnhancedServiceDetails = (item: ServiceData, serviceType: string) => {
        const details: Record<string, any> = { ...item };

        switch (serviceType) {
            case 'cruise':
                const roomCode = item.room_price_code;
                if (roomCode && roomPriceMap[roomCode]) {
                    details['크루즈명'] = roomPriceMap[roomCode].cruise;
                    details['객실타입'] = roomPriceMap[roomCode].room_type;
                    details['객실구분'] = roomPriceMap[roomCode].name;
                }
                break;

            case 'cruise_car':
                const carCode = item.car_price_code;
                if (carCode && carPriceMap[carCode]) {
                    details['차량타입'] = carPriceMap[carCode].car_type;
                }
                break;

            case 'airport':
                const airportCode = item.airport_price_code;
                if (airportCode && airportPriceMap[airportCode]) {
                    details['공항카테고리'] = airportPriceMap[airportCode].category;
                    details['공항경로'] = airportPriceMap[airportCode].route;
                    details['공항차량타입'] = airportPriceMap[airportCode].car_type;
                }
                break;
        }

        return details;
    };

    // 상세 보기 - 사용자 ID를 가져와서 UserReservationDetailModal 열기
    const handleViewDetails = (item: ServiceData) => {
        const userId = item.reservation?.re_user_id || item.reservation?.users?.id;
        if (userId) {
            loadAllUserReservations(userId);
        } else {
            alert('사용자 정보를 찾을 수 없습니다.');
        }
    };

    const getReservationIdFromItem = (item: ServiceData) => {
        return item?.reservation?.re_id || item?.reservation_id || item?.re_id || null;
    };

    const handleDeleteReservation = async (item: ServiceData) => {
        if (!canDeleteReservation) {
            alert('삭제 권한이 없습니다.');
            return;
        }

        const reservationId = getReservationIdFromItem(item);
        if (!reservationId) {
            alert('예약 ID를 찾을 수 없습니다.');
            return;
        }

        const ok = window.confirm(`예약 건을 삭제하시겠습니까?\n예약 ID: ${reservationId}`);
        if (!ok) return;

        try {
            setDeletingReservationId(reservationId);

            const detailDeleteTasks = [
                { label: 'reservation_cruise', table: 'reservation_cruise' },
                { label: 'reservation_cruise_car', table: 'reservation_cruise_car' },
                { label: 'reservation_car_sht', table: 'reservation_car_sht' },
                { label: 'reservation_airport', table: 'reservation_airport' },
                { label: 'reservation_hotel', table: 'reservation_hotel' },
                { label: 'reservation_tour', table: 'reservation_tour' },
                { label: 'reservation_rentcar', table: 'reservation_rentcar' },
            ] as const;

            // 상세 테이블 먼저 삭제 후 메인 reservation 삭제
            const detailDeleteResults = await Promise.all(
                detailDeleteTasks.map(async ({ label, table }) => {
                    const { data, error } = await supabase
                        .from(table)
                        .delete()
                        .eq('reservation_id', reservationId)
                        .select('reservation_id');

                    if (error) {
                        throw new Error(`${label} 삭제 실패: ${error.message}`);
                    }

                    return { label, count: data?.length || 0 };
                })
            );

            const { data: reservationDeleted, error: reservationDeleteError } = await supabase
                .from('reservation')
                .delete()
                .eq('re_id', reservationId)
                .select('re_id');

            if (reservationDeleteError) throw reservationDeleteError;
            const mainReservationDeleteCount = reservationDeleted?.length || 0;

            const summary = [
                ...detailDeleteResults,
                { label: 'reservation', count: mainReservationDeleteCount }
            ]
                .map(r => `- ${r.label}: ${r.count}건`)
                .join('\n');

            setServiceData(prev => prev.filter(row => getReservationIdFromItem(row) !== reservationId));
            alert(`예약이 삭제되었습니다.\n\n삭제 결과\n${summary}`);
            await loadServiceData(activeTab);
        } catch (error) {
            console.error('예약 삭제 실패:', error);
            alert('예약 삭제 중 오류가 발생했습니다.');
        } finally {
            setDeletingReservationId(null);
        }
    };

    const renderRowActions = (
        item: ServiceData,
        detailClassName: string,
        detailTitle = '상세 보기'
    ) => {
        const reservationId = getReservationIdFromItem(item);
        const isDeleting = !!reservationId && deletingReservationId === reservationId;

        return (
            <div className="flex items-center justify-center gap-2">
                <button
                    onClick={() => handleViewDetails(item)}
                    className={detailClassName}
                    title={detailTitle}
                >
                    <Eye className="w-4 h-4" />
                </button>
                {canDeleteReservation && (
                    <button
                        onClick={() => handleDeleteReservation(item)}
                        disabled={isDeleting}
                        className="text-red-600 hover:text-red-900 p-1 rounded hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="예약 삭제"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                )}
            </div>
        );
    };

    // 사용자 ID로 모든 DB 예약 조회
    const loadAllUserReservations = async (userId: string) => {
        if (!userId) return;

        try {
            setDbModalLoading(true);
            setIsDBModalOpen(true);

            // 1. 사용자 정보 조회
            const { data: userData, error: userError } = await supabase
                .from('users')
                .select('*')
                .eq('id', userId)
                .single();

            if (userError) throw userError;
            setDbUserInfo(userData);

            // 2. 사용자의 모든 예약 ID 조회
            const { data: reservations, error: resError } = await supabase
                .from('reservation')
                .select('re_id, re_type, re_status, re_created_at')
                .eq('re_user_id', userId)
                .order('re_created_at', { ascending: false });

            if (resError) throw resError;

            const reservationIds = reservations.map(r => r.re_id);

            if (reservationIds.length === 0) {
                setDbUserServices([]);
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
            const cruiseCodes = (cruiseRes as any[] || []).map(r => r.room_price_code).filter(Boolean);
            const tourCodes = (tourRes as any[] || []).map(r => r.tour_price_code).filter(Boolean);
            const hotelCodes = (hotelRes as any[] || []).map(r => r.hotel_price_code).filter(Boolean);
            const rentCodes = (rentcarRes as any[] || []).map(r => r.rentcar_price_code).filter(Boolean);

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
            const getReservationAdditional = (reservationId: string) => {
                const reservation = reservationMap.get(reservationId) as any;
                return {
                    reservation_manual_additional_fee: Number(reservation?.manual_additional_fee || 0),
                    reservation_manual_additional_fee_detail: String(reservation?.manual_additional_fee_detail || '').trim(),
                };
            };

            const allServices = [
                ...(cruiseRes as any[] || []).map((r: any) => {
                    const info: any = roomPriceMap.get(r.room_price_code);
                    return {
                        ...r,
                        ...getReservationAdditional(r.reservation_id),
                        serviceType: 'cruise',
                        status: (reservationMap.get(r.reservation_id) as any)?.re_status,
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
                ...(cruiseCarRes as any[] || []).map((r: any) => ({
                    ...r,
                    ...getReservationAdditional(r.reservation_id),
                    serviceType: 'vehicle',
                    status: (reservationMap.get(r.reservation_id) as any)?.re_status,
                    pickupDatetime: r.pickup_datetime,
                    pickupLocation: r.pickup_location,
                    dropoffLocation: r.dropoff_location,
                    passengerCount: r.passenger_count,
                    note: r.request_note,
                    unitPrice: r.unit_price,
                    totalPrice: r.car_total_price
                })),
                ...(airportRes as any[] || []).map((r: any) => ({
                    ...r,
                    ...getReservationAdditional(r.reservation_id),
                    serviceType: 'airport',
                    status: (reservationMap.get(r.reservation_id) as any)?.re_status,
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
                ...(hotelRes as any[] || []).map((r: any) => {
                    const info: any = hotelPriceMap.get(r.hotel_price_code);
                    return {
                        ...r,
                        ...getReservationAdditional(r.reservation_id),
                        serviceType: 'hotel',
                        status: (reservationMap.get(r.reservation_id) as any)?.re_status,
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
                ...(tourRes as any[] || []).map((r: any) => {
                    const info: any = tourPriceMap.get(r.tour_price_code);
                    return {
                        ...r,
                        ...getReservationAdditional(r.reservation_id),
                        serviceType: 'tour',
                        status: (reservationMap.get(r.reservation_id) as any)?.re_status,
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
                ...(rentcarRes as any[] || []).map((r: any) => {
                    const info: any = rentPriceMap.get(r.rentcar_price_code);
                    return {
                        ...r,
                        ...getReservationAdditional(r.reservation_id),
                        serviceType: 'rentcar',
                        status: (reservationMap.get(r.reservation_id) as any)?.re_status,
                        carType: info?.vehicle_type || r.rentcar_price_code,
                        pickupDatetime: r.pickup_datetime,
                        pickupLocation: r.pickup_location,
                        destination: r.destination,
                        return_datetime: r.return_datetime,
                        return_pickup_location: r.return_pickup_location,
                        return_destination: r.return_destination,
                        requestNote: r.request_note,
                        note: r.request_note,
                        unitPrice: info?.price || r.unit_price,
                        totalPrice: r.total_price
                    };
                }),
                ...(carShtRes as any[] || []).map((r: any) => ({
                    ...r,
                    ...getReservationAdditional(r.reservation_id),
                    serviceType: 'sht',
                    status: (reservationMap.get(r.reservation_id) as any)?.re_status,
                    category: r.sht_category,
                    usageDate: r.usage_date,
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

            setDbUserServices(allServices);

        } catch (error) {
            console.error('사용자 예약 정보 조회 실패:', error);
            setDbUserServices([]);
        } finally {
            setDbModalLoading(false);
        }
    };

    // ServiceData를 ReservationDetailModal에서 사용할 수 있는 형태로 변환
    const convertToReservationFormat = (item: ServiceData) => {
        if (!item) return null;

        // 기본 예약 정보 구조
        const reservation = {
            // 기본 예약 정보
            re_id: item.reservation?.re_id || item.id,
            re_quote_id: item.reservation?.re_quote_id || '',
            re_type: activeTab, // 현재 탭을 서비스 타입으로 사용
            re_status: item.reservation?.re_status || 'pending',
            re_created_at: item.reservation?.re_created_at || item.created_at || new Date().toISOString(),
            re_updated_at: item.reservation?.re_updated_at || item.updated_at,

            // 고객 정보 (users 테이블에서)
            customer_name: item.reservation?.users?.name ||
                item.reservation?.users?.email?.split('@')[0] ||
                '사용자',
            customer_phone: item.reservation?.users?.phone_number ||
                item.reservation?.users?.phone ||
                '정보 없음',
            customer_email: item.reservation?.users?.email || '정보 없음',

            // 서비스별 상세 정보
            service_details: null as any
        };

        // 서비스 타입별 상세 정보 설정
        switch (activeTab) {
            case 'cruise':
                reservation.service_details = {
                    room_price_code: item.room_price_code,
                    guest_count: item.guest_count,
                    checkin: item.checkin,
                    room_total_price: item.room_total_price,
                    unit_price: item.unit_price,
                    boarding_assist: item.boarding_assist,
                    request_note: item.request_note,
                    created_at: item.created_at,
                    // 가격 테이블 정보
                    room_price_info: roomPriceMap[item.room_price_code] || {},
                    cruise_name: roomPriceMap[item.room_price_code]?.cruise || '',
                    room_name: roomPriceMap[item.room_price_code]?.name || '',
                    room_type: roomPriceMap[item.room_price_code]?.room_type || ''
                };
                break;

            case 'cruise_car':
            case 'sht_car':
            case 'car':
                reservation.service_details = {
                    car_price_code: item.car_price_code,
                    vehicle_number: item.vehicle_number,
                    seat_number: item.seat_number,
                    color_label: item.color_label,
                    unit_price: item.unit_price,
                    total_price: item.total_price,
                    request_note: item.request_note,
                    created_at: item.created_at
                };
                break;

            case 'airport':
                reservation.service_details = {
                    ra_airport_location: item.ra_airport_location,
                    ra_flight_number: item.ra_flight_number,
                    ra_datetime: item.ra_datetime,
                    airport_price_code: item.airport_price_code,
                    ra_passenger_count: item.ra_passenger_count,
                    ra_car_count: item.ra_car_count,
                    ra_luggage_count: item.ra_luggage_count,
                    unit_price: item.unit_price,
                    total_price: item.total_price,
                    ra_is_processed: item.ra_is_processed,
                    ra_stopover_location: item.ra_stopover_location,
                    ra_stopover_wait_minutes: item.ra_stopover_wait_minutes,
                    request_note: item.request_note,
                    created_at: item.created_at
                };
                break;

            case 'hotel':
                reservation.service_details = {
                    checkin_date: item.checkin_date,
                    hotel_category: item.hotel_category,
                    hotel_price_code: item.hotel_price_code,
                    schedule: item.schedule,
                    breakfast_service: item.breakfast_service,
                    guest_count: item.guest_count,
                    room_count: item.room_count,
                    total_price: item.total_price,
                    request_note: item.request_note,
                    created_at: item.created_at
                };
                break;

            case 'tour':
                reservation.service_details = {
                    tour_price_code: item.tour_price_code,
                    tour_capacity: item.tour_capacity,
                    pickup_location: item.pickup_location,
                    dropoff_location: item.dropoff_location,
                    total_price: item.total_price,
                    request_note: item.request_note,
                    created_at: item.created_at
                };
                break;

            case 'rentcar':
                reservation.service_details = {
                    rentcar_price_code: item.rentcar_price_code,
                    rentcar_count: item.rentcar_count,
                    car_count: item.car_count,
                    unit_price: item.unit_price,
                    pickup_datetime: item.pickup_datetime,
                    passenger_count: item.passenger_count,
                    pickup_location: item.pickup_location,
                    destination: item.destination,
                    via_location: item.via_location,
                    via_waiting: item.via_waiting,
                    luggage_count: item.luggage_count,
                    total_price: item.total_price,
                    request_note: item.request_note,
                    created_at: item.created_at
                };
                break;

            case 'package':
                reservation.service_details = {
                    package_id: item.package_id,
                    package_code: item.package_code,
                    package_name: (item.package_id && packageMasterMap[item.package_id]?.name) || item.package_code || '패키지',
                    re_adult_count: item.re_adult_count,
                    re_child_count: item.re_child_count,
                    re_infant_count: item.re_infant_count,
                    total_amount: item.total_amount,
                    re_status: item.re_status,
                    created_at: item.re_created_at
                };
                break;

            default:
                reservation.service_details = { ...item };
                break;
        }

        return reservation;
    };

    const currentTab = serviceTabs.find(tab => tab.id === activeTab);

    if (loading) {
        return (
            <ManagerLayout title="서비스별 조회" activeTab="service-tables">
                <div className="flex justify-center items-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
                    <p className="mt-4 text-gray-600">데이터를 불러오는 중...</p>
                </div>
            </ManagerLayout>
        );
    }

    // sht_car(스하차량) usage_date(사용일자) 기준 그룹화 (카테고리 무시)
    const groupShtCarByUsageDate = (data: ServiceData[]) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const filtered = data.filter(item => {
            if (!item.usage_date) return false;
            const usageDate = new Date(item.usage_date);
            return usageDate >= today;
        });
        const groups: Record<string, ServiceData[]> = {};
        filtered.forEach(item => {
            const date = item.usage_date ? new Date(item.usage_date).toISOString().slice(0, 10) : '미지정';
            if (!groups[date]) groups[date] = [];
            groups[date].push(item);
        });
        const sortedKeys = Object.keys(groups).sort((a, b) => a.localeCompare(b));
        return sortedKeys.map(date => ({
            groupKey: date,
            date,
            items: groups[date]
        }));
    };

    // sht_car 탭일 때만 그룹화 데이터 사용
    const isShtCarTab = activeTab === 'sht_car';
    const groupedShtCar = isShtCarTab ? groupShtCarByUsageDate(filteredData) : [];
    // 렌터카 탭 그룹화 데이터 (조건부 렌더링 직전, 모든 함수/filteredData 선언 이후)
    const isRentcarTab = activeTab === 'rentcar';
    const groupedRentcar = isRentcarTab ? groupRentcarByPickupDatetime(filteredData) : [];

    // 크루즈 차량 픽업일시 기준 그룹화 함수
    const groupCruiseCarByPickupDatetime = (data: ServiceData[]) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const groups: Record<string, ServiceData[]> = {};
        data.forEach(item => {
            if (!item.pickup_datetime) return;
            const dt = new Date(item.pickup_datetime);
            if (dt < today) return;
            const dateKey = dt.toISOString().slice(0, 10);
            if (!groups[dateKey]) groups[dateKey] = [];
            groups[dateKey].push(item);
        });
        const sortedKeys = Object.keys(groups).sort((a, b) => a.localeCompare(b));
        return sortedKeys.map(key => ({
            groupKey: key,
            date: key,
            items: groups[key]
        }));
    };

    // 공항서비스 일시별 그룹화 함수
    const groupAirportByDatetime = (data: ServiceData[]) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const filtered = data.filter(item => {
            if (!item.ra_datetime) return false;
            const dt = new Date(item.ra_datetime);
            return dt >= today;
        });
        const groups: Record<string, ServiceData[]> = {};
        filtered.forEach(item => {
            const date = item.ra_datetime ? new Date(item.ra_datetime).toISOString().slice(0, 10) : '미지정';
            if (!groups[date]) groups[date] = [];
            groups[date].push(item);
        });
        const sortedKeys = Object.keys(groups).sort((a, b) => a.localeCompare(b));
        return sortedKeys.map(key => ({
            groupKey: key,
            date: key,
            items: groups[key]
        }));
    };


    // 크루즈 차량/공항서비스 탭 그룹화 데이터
    const isCruiseCarTab = activeTab === 'cruise_car';
    const groupedCruiseCar = isCruiseCarTab ? groupCruiseCarByPickupDatetime(filteredData) : [];
    const isAirportTab = activeTab === 'airport';
    const groupedAirport = isAirportTab ? groupAirportByDatetime(filteredData) : [];


    // 호텔 탭 그룹화 데이터 (렌더링 직전에서 항상 정의)
    const isHotelTab = activeTab === 'hotel';
    const groupedHotel = isHotelTab ? groupHotelByCheckinDate(filteredData) : [];

    // 투어 탭 그룹화 데이터 (렌더링 직전에서 항상 정의)
    const isTourTab = activeTab === 'tour';
    const groupedTour = isTourTab ? groupTourByUsageDate(filteredData) : [];

    return (
        <ManagerLayout title="서비스별 조회" activeTab="service-tables">
            {/* 기간 필터 버튼 (오른쪽 정렬) */}
            <div className="flex justify-between mb-4">
                <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-600">보기:</span>
                    <div className="inline-flex rounded-lg overflow-hidden border border-gray-200">
                        <button onClick={() => setViewStyle('table')} className={`px-3 py-1 text-sm ${viewStyle === 'table' ? 'bg-blue-500 text-white' : 'bg-white text-gray-700'}`}>테이블</button>
                        <button onClick={() => setViewStyle('card')} className={`px-3 py-1 text-sm ${viewStyle === 'card' ? 'bg-blue-500 text-white' : 'bg-white text-gray-700'}`}>카드</button>
                    </div>
                </div>
                <div className="flex gap-2">
                    {periodOptions.map(opt => (
                        <button
                            key={opt.value}
                            className={`px-3 py-1 rounded text-xs border ${period === opt.value ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-blue-500 border-blue-200'} transition`}
                            onClick={() => setPeriod(opt.value as any)}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            </div>
            <div className="space-y-4">
                {/* 서비스 탭 메뉴 */}
                <div className="mb-4">
                    <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg">
                        {serviceTabs.map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={
                                    `flex items-center space-x-2 px-4 py-2 rounded-md text-sm font-medium transition-all ` +
                                    (activeTab === tab.id
                                        ? 'bg-blue-600 text-white shadow-md'
                                        : 'text-gray-600 hover:text-gray-900 hover:bg-white')
                                }
                            >
                                {tab.icon}
                                <span className="ml-2">{tab.label}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* 서비스 데이터 테이블 */}
                <div className="bg-white rounded-lg shadow overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-200">
                        <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                            {currentTab?.icon}
                            <span className="ml-2">{currentTab?.label} 예약 목록</span>
                        </h3>
                    </div>
                    {/* 조건부 테이블 렌더링 */}
                    {isCruiseTab ? (
                        groupedCruise.length === 0 && !loadError ? (
                            <div className="p-8 text-center">
                                <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                                <h3 className="text-lg font-medium text-gray-600 mb-2">데이터가 없습니다</h3>
                                <p className="text-gray-500">검색 조건을 변경해보세요.</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
                                {groupedCruise.slice(0, groupedCruise.length).map(group => (
                                    <div key={group.groupKey} className="mb-8">
                                        <div className="bg-blue-50 px-4 py-2 rounded-t-lg flex items-center gap-4">
                                            <Calendar className="w-4 h-4 text-blue-600" />
                                            <span className="font-semibold text-blue-900">{group.date}</span>
                                            <span className="ml-2 text-xs text-gray-500">총 {group.items.length}건</span>
                                        </div>
                                        {viewStyle === 'table' ? (
                                            <table className="w-full divide-y divide-gray-200">
                                                <thead className="bg-gray-50 sticky top-0 z-10">
                                                    <tr>
                                                        {getTableColumns('cruise').map((column) => (
                                                            <th
                                                                key={column.key}
                                                                className={`px-6 py-3 text-left text-xs font-medium text-green-800 uppercase tracking-wider ${column.width} bg-gray-50`}
                                                            >
                                                                {column.label}
                                                            </th>
                                                        ))}
                                                        <th className="px-6 py-3 text-center text-xs font-medium text-green-800 uppercase tracking-wider w-20 bg-gray-50">
                                                            상세
                                                        </th>
                                                    </tr>
                                                </thead>
                                                <tbody className="bg-white divide-y divide-gray-200">
                                                    {group.items.map((item, index) => (
                                                        <tr key={item.id || index} className="hover:bg-gray-50">
                                                            {getTableColumns('cruise').map((column) => (
                                                                <td
                                                                    key={column.key}
                                                                    className={`px-6 py-4 text-sm text-gray-900 ${column.width}`}
                                                                >
                                                                    {formatValue(
                                                                        getNestedValue(item, column.key),
                                                                        column.type,
                                                                        item,
                                                                        column.key
                                                                    )}
                                                                </td>
                                                            ))}
                                                            <td className="px-6 py-4 text-center">
                                                                {renderRowActions(item, 'text-blue-600 hover:text-blue-900 p-1 rounded hover:bg-blue-50')}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        ) : (
                                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 p-4 bg-white border-t">
                                                {group.items.map((item: any) => renderServiceCard(item, 'cruise'))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )
                    ) : isCruiseCarTab ? (
                        groupedCruiseCar.length === 0 && !loadError ? (
                            <div className="p-8 text-center">
                                <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                                <h3 className="text-lg font-medium text-gray-600 mb-2">데이터가 없습니다</h3>
                                <p className="text-gray-500">검색 조건을 변경해보세요.</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
                                {groupedCruiseCar.map(group => (
                                    <div key={group.groupKey} className="mb-8">
                                        <div className="bg-cyan-50 px-4 py-2 rounded-t-lg flex items-center gap-4">
                                            <Calendar className="w-4 h-4 text-cyan-600" />
                                            <span className="font-semibold text-cyan-900">{group.date}</span>
                                            <span className="ml-2 text-xs text-gray-500">총 {group.items.length}건</span>
                                        </div>
                                        {viewStyle === 'table' ? (
                                            <table className="w-full divide-y divide-gray-200">
                                                <thead className="bg-gray-50 sticky top-0 z-10">
                                                    <tr>
                                                        {getTableColumns('cruise_car').map((column) => (
                                                            <th
                                                                key={column.key}
                                                                className={`px-6 py-3 text-left text-xs font-medium text-green-800 uppercase tracking-wider ${column.width} bg-gray-50`}
                                                            >
                                                                {column.label}
                                                            </th>
                                                        ))}
                                                        <th className="px-6 py-3 text-center text-xs font-medium text-green-800 uppercase tracking-wider w-20 bg-gray-50">
                                                            상세
                                                        </th>
                                                    </tr>
                                                </thead>
                                                <tbody className="bg-white divide-y divide-gray-200">
                                                    {group.items.map((item, index) => (
                                                        <tr key={item.id || index} className="hover:bg-gray-50">
                                                            {getTableColumns('cruise_car').map((column) => (
                                                                <td
                                                                    key={column.key}
                                                                    className={`px-6 py-4 text-sm text-gray-900 ${column.width}`}
                                                                >
                                                                    {formatValue(
                                                                        getNestedValue(item, column.key),
                                                                        column.type,
                                                                        item,
                                                                        column.key
                                                                    )}
                                                                </td>
                                                            ))}
                                                            <td className="px-6 py-4 text-center">
                                                                {renderRowActions(item, 'text-cyan-600 hover:text-cyan-900 p-1 rounded hover:bg-cyan-50')}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        ) : (
                                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 p-4 bg-white border-t">
                                                {group.items.map((item: any) => renderServiceCard(item, 'cruise_car'))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )
                    ) : isShtCarTab ? (
                        groupedShtCar.length === 0 && !loadError ? (
                            <div className="p-8 text-center">
                                <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                                <h3 className="text-lg font-medium text-gray-600 mb-2">데이터가 없습니다</h3>
                                <p className="text-gray-500">검색 조건을 변경해보세요.</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
                                {groupedShtCar.map(group => (
                                    <div key={group.groupKey} className="mb-8">
                                        <div className="bg-teal-50 px-4 py-2 rounded-t-lg flex items-center gap-4">
                                            <Calendar className="w-4 h-4 text-teal-600" />
                                            <span className="font-semibold text-teal-900">{group.date}</span>
                                            <span className="ml-2 text-xs text-gray-500">총 {group.items.length}건</span>
                                        </div>
                                        {viewStyle === 'table' ? (
                                            <table className="w-full divide-y divide-gray-200">
                                                <thead className="bg-gray-50 sticky top-0 z-10">
                                                    <tr>
                                                        {getTableColumns('sht_car').map((column) => (
                                                            <th
                                                                key={column.key}
                                                                className={`px-6 py-3 text-left text-xs font-medium text-green-800 uppercase tracking-wider ${column.width} bg-gray-50`}
                                                            >
                                                                {column.label}
                                                            </th>
                                                        ))}
                                                        <th className="px-6 py-3 text-center text-xs font-medium text-green-800 uppercase tracking-wider w-20 bg-gray-50">
                                                            상세
                                                        </th>
                                                    </tr>
                                                </thead>
                                                <tbody className="bg-white divide-y divide-gray-200">
                                                    {group.items.map((item, index) => (
                                                        <tr key={item.id || index} className="hover:bg-gray-50">
                                                            {getTableColumns('sht_car').map((column) => (
                                                                <td
                                                                    key={column.key}
                                                                    className={`px-6 py-4 text-sm text-gray-900 ${column.width}`}
                                                                >
                                                                    {formatValue(
                                                                        getNestedValue(item, column.key),
                                                                        column.type,
                                                                        item,
                                                                        column.key
                                                                    )}
                                                                </td>
                                                            ))}
                                                            <td className="px-6 py-4 text-center">
                                                                {renderRowActions(item, 'text-teal-600 hover:text-teal-900 p-1 rounded hover:bg-teal-50')}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        ) : (
                                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 p-4 bg-white border-t">
                                                {group.items.map((item: any) => renderServiceCard(item, 'sht_car'))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )
                    ) : isRentcarTab ? (
                        groupedRentcar.length === 0 && !loadError ? (
                            <div className="p-8 text-center">
                                <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                                <h3 className="text-lg font-medium text-gray-600 mb-2">데이터가 없습니다</h3>
                                <p className="text-gray-500">검색 조건을 변경해보세요.</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
                                {groupedRentcar.map(group => (
                                    <div key={group.groupKey} className="mb-8">
                                        <div className="bg-red-50 px-4 py-2 rounded-t-lg flex items-center gap-4">
                                            <Calendar className="w-4 h-4 text-red-600" />
                                            <span className="font-semibold text-red-900">{group.date}</span>
                                            <span className="ml-2 text-xs text-gray-500">총 {group.items.length}건</span>
                                        </div>
                                        {viewStyle === 'table' ? (
                                            <table className="w-full divide-y divide-gray-200">
                                                <thead className="bg-gray-50 sticky top-0 z-10">
                                                    <tr>
                                                        {getTableColumns('rentcar').map((column) => (
                                                            <th
                                                                key={column.key}
                                                                className={`px-6 py-3 text-left text-xs font-medium text-green-800 uppercase tracking-wider ${column.width} bg-gray-50`}
                                                            >
                                                                {column.label}
                                                            </th>
                                                        ))}
                                                        <th className="px-6 py-3 text-center text-xs font-medium text-green-800 uppercase tracking-wider w-20 bg-gray-50">
                                                            상세
                                                        </th>
                                                    </tr>
                                                </thead>
                                                <tbody className="bg-white divide-y divide-gray-200">
                                                    {group.items.map((item, index) => (
                                                        <tr key={item.id || index} className="hover:bg-gray-50">
                                                            {getTableColumns('rentcar').map((column) => (
                                                                <td
                                                                    key={column.key}
                                                                    className={`px-6 py-4 text-sm text-gray-900 ${column.width}`}
                                                                >
                                                                    {formatValue(
                                                                        getNestedValue(item, column.key),
                                                                        column.type,
                                                                        item,
                                                                        column.key
                                                                    )}
                                                                </td>
                                                            ))}
                                                            <td className="px-6 py-4 text-center">
                                                                {renderRowActions(item, 'text-red-600 hover:text-red-900 p-1 rounded hover:bg-red-50')}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        ) : (
                                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 p-4 bg-white border-t">
                                                {group.items.map((item: any) => renderServiceCard(item, 'rentcar'))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )
                    ) : isTourTab ? (
                        groupedTour.length === 0 && !loadError ? (
                            <div className="p-8 text-center">
                                <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                                <h3 className="text-lg font-medium text-gray-600 mb-2">데이터가 없습니다</h3>
                                <p className="text-gray-500">검색 조건을 변경해보세요.</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
                                {groupedTour.map(group => (
                                    <div key={group.groupKey} className="mb-8">
                                        <div className="bg-orange-50 px-4 py-2 rounded-t-lg flex items-center gap-4">
                                            <Calendar className="w-4 h-4 text-orange-600" />
                                            <span className="font-semibold text-orange-900">{group.date}</span>
                                            <span className="ml-2 text-xs text-gray-500">총 {group.items.length}건</span>
                                        </div>
                                        {viewStyle === 'table' ? (
                                            <table className="w-full divide-y divide-gray-200">
                                                <thead className="bg-gray-50 sticky top-0 z-10">
                                                    <tr>
                                                        {getTableColumns('tour').map((column) => (
                                                            <th
                                                                key={column.key}
                                                                className={`px-6 py-3 text-left text-xs font-medium text-green-800 uppercase tracking-wider ${column.width} bg-gray-50`}
                                                            >
                                                                {column.label}
                                                            </th>
                                                        ))}
                                                        <th className="px-6 py-3 text-center text-xs font-medium text-green-800 uppercase tracking-wider w-20 bg-gray-50">
                                                            상세
                                                        </th>
                                                    </tr>
                                                </thead>
                                                <tbody className="bg-white divide-y divide-gray-200">
                                                    {group.items.map((item, index) => (
                                                        <tr key={item.id || index} className="hover:bg-gray-50">
                                                            {getTableColumns('tour').map((column) => (
                                                                <td
                                                                    key={column.key}
                                                                    className={`px-6 py-4 text-sm text-gray-900 ${column.width}`}
                                                                >
                                                                    {formatValue(
                                                                        getNestedValue(item, column.key),
                                                                        column.type,
                                                                        item,
                                                                        column.key
                                                                    )}
                                                                </td>
                                                            ))}
                                                            <td className="px-6 py-4 text-center">
                                                                {renderRowActions(item, 'text-orange-600 hover:text-orange-900 p-1 rounded hover:bg-orange-50')}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        ) : (
                                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 p-4 bg-white border-t">
                                                {group.items.map((item: any) => renderServiceCard(item, 'tour'))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )
                    ) : isHotelTab ? (
                        groupedHotel.length === 0 && !loadError ? (
                            <div className="p-8 text-center">
                                <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                                <h3 className="text-lg font-medium text-gray-600 mb-2">데이터가 없습니다</h3>
                                <p className="text-gray-500">검색 조건을 변경해보세요.</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
                                {groupedHotel.map(group => (
                                    <div key={group.groupKey} className="mb-8">
                                        <div className="bg-purple-50 px-4 py-2 rounded-t-lg flex items-center gap-4">
                                            <Calendar className="w-4 h-4 text-purple-600" />
                                            <span className="font-semibold text-purple-900">{group.date}</span>
                                            <span className="ml-2 text-xs text-gray-500">총 {group.items.length}건</span>
                                        </div>
                                        {viewStyle === 'table' ? (
                                            <table className="w-full divide-y divide-gray-200">
                                                <thead className="bg-gray-50 sticky top-0 z-10">
                                                    <tr>
                                                        {getTableColumns('hotel').map((column) => (
                                                            <th
                                                                key={column.key}
                                                                className={`px-6 py-3 text-left text-xs font-medium text-green-800 uppercase tracking-wider ${column.width} bg-gray-50`}
                                                            >
                                                                {column.label}
                                                            </th>
                                                        ))}
                                                        <th className="px-6 py-3 text-center text-xs font-medium text-green-800 uppercase tracking-wider w-20 bg-gray-50">
                                                            상세
                                                        </th>
                                                    </tr>
                                                </thead>
                                                <tbody className="bg-white divide-y divide-gray-200">
                                                    {group.items.map((item, index) => (
                                                        <tr key={item.id || index} className="hover:bg-gray-50">
                                                            {getTableColumns('hotel').map((column) => (
                                                                <td
                                                                    key={column.key}
                                                                    className={`px-6 py-4 text-sm text-gray-900 ${column.width}`}
                                                                >
                                                                    {formatValue(
                                                                        getNestedValue(item, column.key),
                                                                        column.type,
                                                                        item,
                                                                        column.key
                                                                    )}
                                                                </td>
                                                            ))}
                                                            <td className="px-6 py-4 text-center">
                                                                {renderRowActions(item, 'text-purple-600 hover:text-purple-900 p-1 rounded hover:bg-purple-50')}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        ) : (
                                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 p-4 bg-white border-t">
                                                {group.items.map((item: any) => renderServiceCard(item, 'hotel'))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )
                    ) : isAirportTab ? (
                        groupedAirport.length === 0 && !loadError ? (
                            <div className="p-8 text-center">
                                <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                                <h3 className="text-lg font-medium text-gray-600 mb-2">데이터가 없습니다</h3>
                                <p className="text-gray-500">검색 조건을 변경해보세요.</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
                                {groupedAirport.map(group => (
                                    <div key={group.groupKey} className="mb-8">
                                        <div className="bg-green-50 px-4 py-2 rounded-t-lg flex items-center gap-4">
                                            <Calendar className="w-4 h-4 text-green-600" />
                                            <span className="font-semibold text-green-900">{group.date}</span>
                                            <span className="ml-2 text-xs text-gray-500">총 {group.items.length}건</span>
                                        </div>
                                        {viewStyle === 'table' ? (
                                            <table className="w-full divide-y divide-gray-200">
                                                <thead className="bg-gray-50 sticky top-0 z-10">
                                                    <tr>
                                                        {getTableColumns('airport').map((column) => (
                                                            <th
                                                                key={column.key}
                                                                className={`px-6 py-3 text-left text-xs font-medium text-green-800 uppercase tracking-wider ${column.width} bg-gray-50`}
                                                            >
                                                                {column.label}
                                                            </th>
                                                        ))}
                                                        <th className="px-6 py-3 text-center text-xs font-medium text-green-800 uppercase tracking-wider w-20 bg-gray-50">
                                                            상세
                                                        </th>
                                                    </tr>
                                                </thead>
                                                <tbody className="bg-white divide-y divide-gray-200">
                                                    {group.items.map((item, index) => (
                                                        <tr key={item.id || index} className="hover:bg-gray-50">
                                                            {getTableColumns('airport').map((column) => (
                                                                <td
                                                                    key={column.key}
                                                                    className={`px-6 py-4 text-sm text-gray-900 ${column.width}`}
                                                                >
                                                                    {formatValue(
                                                                        getNestedValue(item, column.key),
                                                                        column.type,
                                                                        item,
                                                                        column.key
                                                                    )}
                                                                </td>
                                                            ))}
                                                            <td className="px-6 py-4 text-center">
                                                                {renderRowActions(item, 'text-green-600 hover:text-green-900 p-1 rounded hover:bg-green-50')}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        ) : (
                                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 p-4 bg-white border-t">
                                                {group.items.map((item: any) => renderServiceCard(item, 'airport'))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )
                    ) : (
                        filteredData.length === 0 && !loadError ? (
                            <div className="p-8 text-center">
                                <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                                <h3 className="text-lg font-medium text-gray-600 mb-2">데이터가 없습니다</h3>
                                <p className="text-gray-500">검색 조건을 변경해보세요.</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
                                {viewStyle === 'table' ? (
                                    <table className="w-full divide-y divide-gray-200">
                                        <thead className="bg-gray-50 sticky top-0 z-10">
                                            <tr>
                                                {getTableColumns(activeTab).map((column) => (
                                                    <th
                                                        key={column.key}
                                                        className={`px-6 py-3 text-left text-xs font-medium text-green-800 uppercase tracking-wider ${column.width} bg-gray-50`}
                                                    >
                                                        {column.label}
                                                    </th>
                                                ))}
                                                <th className="px-6 py-3 text-center text-xs font-medium text-green-800 uppercase tracking-wider w-20 bg-gray-50">
                                                    상세
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-200">
                                            {filteredData.map((item, index) => (
                                                <tr key={item.id || index} className="hover:bg-gray-50">
                                                    {getTableColumns(activeTab).map((column) => (
                                                        <td
                                                            key={column.key}
                                                            className={`px-6 py-4 text-sm text-gray-900 ${column.width}`}
                                                        >
                                                            {formatValue(getNestedValue(item, column.key), column.type, item, column.key)}
                                                        </td>
                                                    ))}
                                                    <td className="px-6 py-4 text-center">
                                                        {renderRowActions(item, 'text-blue-600 hover:text-blue-900 p-1 rounded hover:bg-blue-50')}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 p-4 bg-white">
                                        {filteredData.map((item: any) => renderServiceCard(item, activeTab))}
                                    </div>
                                )}
                            </div>
                        )
                    )}
                </div>

                {/* 사용자 예약 상세 모달 */}
                <UserReservationDetailModal
                    isOpen={isDBModalOpen}
                    onClose={() => setIsDBModalOpen(false)}
                    userInfo={dbUserInfo}
                    allUserServices={dbUserServices}
                    loading={dbModalLoading}
                />
            </div>
        </ManagerLayout>
    );
}
