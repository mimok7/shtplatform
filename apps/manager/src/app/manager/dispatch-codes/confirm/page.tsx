'use client';

import React, { useState, useEffect } from 'react';
import ManagerLayout from '@/components/ManagerLayout';
import supabase from '@/lib/supabase';
import { fetchTableInBatches } from '@/lib/fetchInBatches';
import { Search, Car, Users, Calendar, AlertCircle, CheckCircle, User, MapPin, Plane, Ship } from 'lucide-react';

interface VehicleReservation {
    reservation_id: string;
    re_user_id: string;
    re_quote_id: string;
    re_status: string;
    re_type?: string;
    re_created_at: string;
    service_type: 'airport' | 'rentcar' | 'cruise_car' | 'car_sht';
    dispatch_code?: string;
    pickup_confirmed_at?: string;
    dispatch_memo?: string;
    // 서비스별 날짜 필드
    service_date?: string;
    service_datetime?: string;
    // 기타 정보
    location?: string;
    passenger_count?: number;
    car_count?: number;
    vehicle_number?: string;
    sht_category?: string;
    car_type?: string;
    pickup_location?: string;
    dropoff_location?: string;
    users?: {
        name?: string;
        phone?: string;
        email?: string;
    };
    quote?: {
        title?: string;
        quote_id?: string;
    };
}

const ConfirmListPage = () => {
    const [reservations, setReservations] = useState<VehicleReservation[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // 필터 상태
    const [serviceFilter, setServiceFilter] = useState<'all' | 'airport' | 'rentcar' | 'cruise_car' | 'car_sht'>('all');
    const [confirmFilter, setConfirmFilter] = useState<'all' | 'confirmed' | 'unconfirmed'>('all');
    const [memoFilter, setMemoFilter] = useState<'all' | 'has_memo' | 'no_memo'>('all');
    const [dateFilter, setDateFilter] = useState<string>('');
    const [futureOnly, setFutureOnly] = useState<boolean>(true);
    const [useThreeDayWindow, setUseThreeDayWindow] = useState<boolean>(false);
    const [search, setSearch] = useState<string>('');

    // 로컬 YYYY-MM-DD 포맷터
    const formatLocalYMD = (input: string | Date) => {
        const d = typeof input === 'string' ? new Date(input) : input;
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    };

    // 차량 예약 데이터 로드 (service-tables 패턴 적용)
    const loadVehicleReservations = async () => {
        try {
            setLoading(true);
            setError(null);

            // 각 서비스별로 개별 조회 - 조인 없이 원시 데이터만 가져옴
            const [airportRes, rentcarRes, cruiseCarRes, carShtRes] = await Promise.all([
                supabase.from('reservation_airport').select('*'),
                supabase.from('reservation_rentcar').select('*'),
                supabase.from('reservation_cruise_car').select('*'),
                supabase.from('reservation_car_sht').select('*')
            ]);

            // 에러 체크
            if (airportRes.error) console.error('공항 쿼리 에러:', airportRes.error);
            if (rentcarRes.error) console.error('렌터카 쿼리 에러:', rentcarRes.error);
            if (cruiseCarRes.error) console.error('크루즈 차량 쿼리 에러:', cruiseCarRes.error);
            if (carShtRes.error) console.error('SHT차량 쿼리 에러:', carShtRes.error);

            // 모든 예약 ID 수집
            const allReservationIds = new Set<string>();
            const addIds = (data: any[] | null) => {
                data?.forEach(item => {
                    if (item.reservation_id) allReservationIds.add(item.reservation_id);
                });
            };
            addIds(airportRes.data);
            addIds(rentcarRes.data);
            addIds(cruiseCarRes.data);
            addIds(carShtRes.data);

            // 예약 정보, 사용자 정보, 견적 정보 맵 초기화
            let reservationMap: Record<string, any> = {};
            let userMap: Record<string, any> = {};
            let quoteMap: Record<string, any> = {};

            if (allReservationIds.size > 0) {
                const idList = Array.from(allReservationIds);

                // Reservation 정보 조회 (대량 IN URL 길이 초과 방지)
                const reservations = await fetchTableInBatches<any>(
                    'reservation',
                    're_id',
                    idList,
                    're_id, re_user_id, re_quote_id, re_status, re_type, re_created_at',
                    80
                );

                if (reservations && reservations.length > 0) {
                    reservationMap = Object.fromEntries(reservations.map(r => [r.re_id, r]));

                    const userIds = Array.from(new Set(reservations.map(r => r.re_user_id).filter(Boolean)));
                    const quoteIds = Array.from(new Set(reservations.map(r => r.re_quote_id).filter(Boolean)));

                    // Users 정보 조회 (대량 IN URL 길이 초과 방지)
                    if (userIds.length > 0) {
                        const users = await fetchTableInBatches<any>(
                            'users',
                            'id',
                            userIds,
                            'id, name, email, phone_number',
                            80
                        );
                        if (users && users.length > 0) {
                            userMap = Object.fromEntries(users.map(u => [u.id, u]));
                        }
                    }

                    // Quote 정보 조회 (대량 IN URL 길이 초과 방지)
                    if (quoteIds.length > 0) {
                        const quotes = await fetchTableInBatches<any>(
                            'quote',
                            'id',
                            quoteIds,
                            'id, title',
                            80
                        );
                        if (quotes && quotes.length > 0) {
                            quoteMap = Object.fromEntries(quotes.map(q => [q.id, q]));
                        }
                    }
                }
            }

            const merged: VehicleReservation[] = [];

            const processItem = (item: any, serviceType: 'airport' | 'rentcar' | 'cruise_car' | 'car_sht') => {
                const reservation = reservationMap[item.reservation_id];
                if (!reservation) {
                    return;
                }
                const user = userMap[reservation.re_user_id];
                const quote = reservation.re_quote_id ? quoteMap[reservation.re_quote_id] : null;

                // 필드 매핑
                let location = '';
                let serviceDateTime = '';
                let serviceDate = '';
                let carType = '';
                let pickupLoc = '';
                let dropoffLoc = '';

                if (serviceType === 'airport') {
                    location = item.ra_airport_location;
                    serviceDateTime = item.ra_datetime;
                    carType = '공항픽업 차량';
                } else if (serviceType === 'rentcar') {
                    location = item.destination || item.pickup_location || '목적지 미정';
                    serviceDateTime = item.pickup_datetime;
                    serviceDate = item.pickup_datetime ? formatLocalYMD(item.pickup_datetime) : '';
                    carType = '렌터카';
                } else if (serviceType === 'cruise_car') {
                    location = item.pickup_location;
                    serviceDateTime = item.pickup_datetime;
                    carType = '크루즈 전용차량';
                } else if (serviceType === 'car_sht') {
                    serviceDateTime = item.pickup_datetime;
                    serviceDate = item.pickup_datetime ? formatLocalYMD(item.pickup_datetime) : '';
                    pickupLoc = item.pickup_location;
                    dropoffLoc = item.dropoff_location;
                    if (item.sht_category?.toLowerCase() === 'pickup') location = pickupLoc || '승차위치 미정';
                    else location = dropoffLoc || '하차위치 미정';
                }

                merged.push({
                    reservation_id: item.reservation_id,
                    re_user_id: reservation.re_user_id,
                    re_quote_id: reservation.re_quote_id,
                    re_status: reservation.re_status,
                    re_type: reservation.re_type,
                    re_created_at: reservation.re_created_at,
                    service_type: serviceType,
                    dispatch_code: item.dispatch_code,
                    pickup_confirmed_at: item.pickup_confirmed_at,
                    dispatch_memo: item.dispatch_memo,
                    service_date: serviceDate || undefined,
                    service_datetime: serviceDateTime,
                    location: location,
                    passenger_count: item.passenger_count || item.ra_passenger_count,
                    car_count: item.car_count || item.ra_car_count,
                    vehicle_number: item.vehicle_number,
                    sht_category: item.sht_category,
                    car_type: carType,
                    pickup_location: pickupLoc,
                    dropoff_location: dropoffLoc,
                    users: user ? {
                        name: user.name,
                        email: user.email,
                        phone: user.phone_number
                    } : undefined,
                    quote: quote ? {
                        title: quote.title,
                        quote_id: reservation.re_quote_id
                    } : undefined
                });
            };

            airportRes.data?.forEach(item => processItem(item, 'airport'));
            rentcarRes.data?.forEach(item => processItem(item, 'rentcar'));
            cruiseCarRes.data?.forEach(item => processItem(item, 'cruise_car'));
            carShtRes.data?.forEach(item => processItem(item, 'car_sht'));

            console.log('🎯 최종 병합된 데이터:', merged.length, '건');
            setReservations(merged);

        } catch (err) {
            console.error('데이터 로드 오류:', err);
            setError('데이터를 불러오는 중 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };

    // 필터링된 예약 계산
    const filtered = reservations.filter(r => {
        // 서비스 타입 필터
        if (serviceFilter !== 'all' && r.service_type !== serviceFilter) return false;

        // 승차 확인 상태 필터
        if (confirmFilter === 'confirmed' && !r.pickup_confirmed_at) return false;
        if (confirmFilter === 'unconfirmed' && r.pickup_confirmed_at) return false;

        // 배차 메모 필터
        if (memoFilter === 'has_memo' && (!r.dispatch_memo || r.dispatch_memo.trim() === '')) return false;
        if (memoFilter === 'no_memo' && (r.dispatch_memo && r.dispatch_memo.trim() !== '')) return false;

        // 날짜 필터
        const serviceDate = r.service_date || (r.service_datetime ? formatLocalYMD(r.service_datetime) : null);
        if (dateFilter && serviceDate !== dateFilter) return false;

        // 오늘 이후만 보기
        if (futureOnly && serviceDate) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const itemDate = new Date(serviceDate);
            if (itemDate < today) return false;
        }

        // 3일 내 예약만 보기
        if (useThreeDayWindow && serviceDate) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const threeDaysLater = new Date(today);
            threeDaysLater.setDate(today.getDate() + 3);
            const itemDate = new Date(serviceDate);
            if (itemDate < today || itemDate > threeDaysLater) return false;
        }

        // 검색 필터
        if (search) {
            const q = search.toLowerCase();
            const name = r.users?.name?.toLowerCase() || '';
            const title = r.quote?.title?.toLowerCase() || '';
            const location = r.location?.toLowerCase() || '';
            const memo = r.dispatch_memo?.toLowerCase() || '';
            const quoteId = r.re_quote_id?.toLowerCase() || '';

            if (!name.includes(q) && !title.includes(q) && !location.includes(q) &&
                !memo.includes(q) && !quoteId.includes(q)) {
                return false;
            }
        }

        return true;
    });

    // 날짜별 그룹화 (service-tables 패턴)
    const groupByServiceDate = (data: VehicleReservation[]) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const groups: Record<string, VehicleReservation[]> = {};

        data.forEach(item => {
            const serviceDate = item.service_date || (item.service_datetime ? formatLocalYMD(item.service_datetime) : null);

            if (!serviceDate) {
                return; // 날짜가 없는 항목은 제외
            }

            const itemDateObj = new Date(serviceDate);
            const isToday = itemDateObj.getTime() === today.getTime();
            const isPast = itemDateObj < today;
            const isTomorrow = itemDateObj.getTime() === (new Date(today.getTime() + 86400000)).getTime();

            let displayDate = serviceDate;
            if (isToday) {
                displayDate = `${serviceDate} (오늘)`;
            } else if (isTomorrow) {
                displayDate = `${serviceDate} (내일)`;
            } else if (isPast) {
                displayDate = `${serviceDate} (과거)`;
            }

            if (!groups[displayDate]) {
                groups[displayDate] = [];
            }
            groups[displayDate].push(item);
        });

        // 날짜순 정렬
        const sortedEntries = Object.entries(groups).sort(([a], [b]) => {
            const dateA = new Date(a.split(' ')[0]);
            const dateB = new Date(b.split(' ')[0]);
            return dateA.getTime() - dateB.getTime();
        });

        return sortedEntries;
    };

    const grouped = groupByServiceDate(filtered);
    const rows = filtered;

    // 서비스 타입별 아이콘
    const getIcon = (serviceType: string) => {
        switch (serviceType) {
            case 'airport': return <Plane className="w-4 h-4" />;
            case 'rentcar': return <Car className="w-4 h-4" />;
            case 'cruise_car': return <Ship className="w-4 h-4" />;
            case 'car_sht': return <Car className="w-4 h-4" />;
            default: return <Car className="w-4 h-4" />;
        }
    };

    const getLabel = (serviceType: string) => {
        switch (serviceType) {
            case 'airport': return '공항';
            case 'rentcar': return '렌터카';
            case 'cruise_car': return '크루즈 차량';
            case 'car_sht': return '스하 차량';
            default: return '차량';
        }
    };

    // 페이지 로드 시 데이터 가져오기
    useEffect(() => {
        loadVehicleReservations();
    }, []);

    if (loading) {
        return (
            <ManagerLayout title="승차 확인/메모 목록" activeTab="dispatch-codes-confirm">
                <div className="flex justify-center items-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
                </div>
            </ManagerLayout>
        );
    }

    if (error) {
        return (
            <ManagerLayout title="승차 확인/메모 목록" activeTab="dispatch-codes-confirm">
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <div className="flex items-center">
                        <AlertCircle className="w-5 h-5 text-red-500 mr-2" />
                        <p className="text-red-700">{error}</p>
                    </div>
                </div>
            </ManagerLayout>
        );
    }

    // 서비스 필터 옵션
    const serviceOptions = [
        { key: 'all', label: '전체', icon: <Car className="w-4 h-4" />, color: 'bg-gray-100 text-gray-700' },
        { key: 'airport', label: '공항', icon: <Plane className="w-4 h-4" />, color: 'bg-blue-100 text-blue-700' },
        { key: 'rentcar', label: '렌터카', icon: <Car className="w-4 h-4" />, color: 'bg-green-100 text-green-700' },
        { key: 'cruise_car', label: '크루즈 차량', icon: <Ship className="w-4 h-4" />, color: 'bg-purple-100 text-purple-700' },
        { key: 'car_sht', label: '스하 차량', icon: <Car className="w-4 h-4" />, color: 'bg-orange-100 text-orange-700' }
    ];

    // 승차 확인 상태 필터 옵션
    const confirmOptions = [
        { key: 'all', label: '전체', color: 'bg-gray-100 text-gray-700' },
        { key: 'confirmed', label: '확인완료', color: 'bg-green-100 text-green-700' },
        { key: 'unconfirmed', label: '미확인', color: 'bg-orange-100 text-orange-700' }
    ];

    return (
        <ManagerLayout title="승차 확인/메모 목록" activeTab="dispatch-codes-confirm">
            <div className="space-y-6">
                {/* 통계 카드 */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-white rounded-lg shadow-sm p-4 border">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-600">전체</p>
                                <div className="text-2xl font-bold text-blue-700">{rows.length}건</div>
                            </div>
                            <Car className="w-8 h-8 text-blue-500" />
                        </div>
                    </div>
                    <div className="bg-white rounded-lg shadow-sm p-4 border">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-600">승차확인완료</p>
                                <div className="text-2xl font-bold text-green-700">{rows.filter(r => r.pickup_confirmed_at).length}건</div>
                            </div>
                            <CheckCircle className="w-8 h-8 text-green-500" />
                        </div>
                    </div>
                    <div className="bg-white rounded-lg shadow-sm p-4 border">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-600">미확인</p>
                                <div className="text-2xl font-bold text-orange-700">{rows.filter(r => !r.pickup_confirmed_at).length}건</div>
                            </div>
                            <AlertCircle className="w-8 h-8 text-orange-500" />
                        </div>
                    </div>
                    <div className="bg-white rounded-lg shadow-sm p-4 border">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-600">메모있음</p>
                                <div className="text-2xl font-bold text-purple-700">{rows.filter(r => (r.dispatch_memo || '').trim() !== '').length}건</div>
                            </div>
                            <User className="w-8 h-8 text-purple-500" />
                        </div>
                    </div>
                </div>

                {/* 필터 */}
                <div className="bg-white rounded-lg shadow-sm p-4 border space-y-4">
                    {/* 서비스 타입 필터 */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">서비스 타입</label>
                        <div className="flex flex-wrap gap-2">
                            {serviceOptions.map(option => (
                                <button
                                    key={option.key}
                                    onClick={() => setServiceFilter(option.key as any)}
                                    className={`flex items-center gap-1 px-3 py-1 rounded text-xs font-medium transition-colors ${serviceFilter === option.key ? option.color.replace('100', '200').replace('700', '800') : option.color
                                        }`}
                                >
                                    {option.icon}
                                    <span>{option.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* 승차 확인 상태 및 배차 메모 필터 */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* 승차 확인 상태 필터 */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">승차 확인 상태</label>
                            <div className="flex flex-wrap gap-2">
                                {confirmOptions.map(s => (
                                    <button
                                        key={s.key}
                                        onClick={() => setConfirmFilter(s.key as any)}
                                        className={`px-3 py-1 rounded text-xs font-medium transition-colors ${confirmFilter === s.key ? s.color.replace('100', '200').replace('700', '800') : s.color}`}>
                                        {s.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* 배차 메모 필터 */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">배차 메모</label>
                            <div className="flex flex-wrap gap-2">
                                {[
                                    { key: 'all', label: '전체', color: 'bg-gray-100 text-gray-700' },
                                    { key: 'has_memo', label: '메모있음', color: 'bg-yellow-100 text-yellow-700' },
                                    { key: 'no_memo', label: '메모없음', color: 'bg-gray-100 text-gray-700' }
                                ].map(option => (
                                    <button
                                        key={option.key}
                                        onClick={() => setMemoFilter(option.key as any)}
                                        className={`px-3 py-1 rounded text-xs font-medium transition-colors ${memoFilter === option.key ? option.color.replace('100', '200').replace('700', '800') : option.color}`}>
                                        {option.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* 날짜, 검색, 옵션, 초기화 - 모두 한 행 */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-2 border-t">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">날짜 필터</label>
                            <input
                                type="date"
                                value={dateFilter}
                                onChange={e => setDateFilter(e.target.value)}
                                className="w-full px-2 py-1 rounded border border-gray-200"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">검색</label>
                            <div className="relative">
                                <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="이름, 여행명, 위치, 메모"
                                    className="w-full pl-8 pr-2 py-1 rounded border border-gray-200 text-sm" />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">날짜 옵션</label>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => {
                                        if (futureOnly) {
                                            setFutureOnly(false);
                                        } else {
                                            setFutureOnly(true);
                                            setUseThreeDayWindow(false);
                                        }
                                    }}
                                    className={`px-2 py-1 rounded text-xs font-medium border transition-colors ${futureOnly ? 'bg-blue-600 text-white border-blue-600' : 'bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200'}`}
                                >
                                    오늘 이후
                                </button>

                                <button
                                    onClick={() => {
                                        if (useThreeDayWindow) {
                                            setUseThreeDayWindow(false);
                                        } else {
                                            setUseThreeDayWindow(true);
                                            setFutureOnly(false);
                                        }
                                    }}
                                    className={`px-2 py-1 rounded text-xs font-medium border transition-colors ${useThreeDayWindow ? 'bg-blue-600 text-white border-blue-600' : 'bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200'}`}
                                >
                                    3일 내
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">필터 초기화</label>
                            <button onClick={() => { setServiceFilter('all'); setConfirmFilter('all'); setMemoFilter('all'); setDateFilter(''); setFutureOnly(false); setUseThreeDayWindow(false); setSearch(''); }}
                                className="px-3 py-1 bg-gray-100 text-gray-700 rounded text-xs hover:bg-gray-200">
                                전체 초기화
                            </button>
                        </div>
                    </div>
                </div>

                {/* 결과 목록 */}
                <div className="bg-white rounded-lg shadow-sm border">
                    <div className="p-4 border-b">
                        <h2 className="text-lg font-semibold text-gray-800">승차 확인/메모 목록 ({filtered.length}건)</h2>
                    </div>

                    <div className="p-4">
                        {loading ? (
                            <div className="p-8 text-center">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                                <p className="mt-2 text-gray-600">데이터를 불러오는 중...</p>
                            </div>
                        ) : filtered.length === 0 ? (
                            <div className="p-8 text-center text-gray-500">
                                조건에 맞는 예약이 없습니다.
                            </div>
                        ) : (
                            <div className="space-y-6">
                                {grouped.map((group, groupIndex) => (
                                    <div key={`${group[0]}-${groupIndex}`} className="space-y-4">
                                        {/* 날짜 헤더 */}
                                        <div className="flex items-center">
                                            <Calendar className="w-5 h-5 text-gray-500 mr-2" />
                                            <h3 className="text-lg font-semibold text-gray-800">{group[0]}</h3>
                                            <span className="ml-2 px-2 py-1 bg-gray-100 text-gray-600 rounded text-sm">
                                                {group[1].length}건
                                            </span>
                                        </div>

                                        {/* 카드 그리드 */}
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
                                            {group[1].map(item => (
                                                <div key={item.reservation_id} className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                                                    {/* 예약 정보 섹션 */}
                                                    <div className="mb-3">
                                                        <div className="flex items-center gap-2 mb-2">
                                                            <User className="w-4 h-4 text-gray-400" />
                                                            <span className="text-sm font-medium text-gray-900">
                                                                {item.users?.name || '이름 없음'}
                                                            </span>
                                                            {item.re_type === 'package' && (
                                                                <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-700 text-xs rounded font-medium">📦 패키지</span>
                                                            )}
                                                            <div className="flex items-center gap-1 ml-auto">
                                                                {getIcon(item.service_type)}
                                                                <span className="text-xs text-gray-500">
                                                                    {getLabel(item.service_type)}
                                                                </span>
                                                            </div>
                                                        </div>
                                                        <div className="text-xs text-gray-500 mb-1">
                                                            {item.quote?.title || '제목 없음'}
                                                        </div>
                                                    </div>

                                                    {/* 차량 서비스 일정 섹션 */}
                                                    <div className="mb-3">
                                                        <div className="text-xs text-gray-600 mb-1">
                                                            {item.service_date || item.service_datetime ? (
                                                                <>
                                                                    <div className="font-medium">
                                                                        서비스 일시: {
                                                                            item.service_date || (
                                                                                item.service_datetime &&
                                                                                (item.service_type === 'rentcar' || item.service_type === 'car_sht'
                                                                                    ? formatLocalYMD(item.service_datetime)
                                                                                    : new Date(item.service_datetime).toLocaleString('ko-KR'))
                                                                            )
                                                                        }
                                                                    </div>
                                                                    {/* SHT 차량의 경우 상세 위치 정보 표시 */}
                                                                    {item.service_type === 'car_sht' ? (
                                                                        <div className="text-gray-500 space-y-1">
                                                                            {item.sht_category?.toLowerCase() === 'pickup' ? (
                                                                                <>
                                                                                    <div className="flex items-center gap-1">
                                                                                        <span className="text-xs px-1 py-0.5 rounded bg-green-50 text-green-700">픽업</span>
                                                                                        <MapPin className="w-3 h-3" />
                                                                                        승차: {item.pickup_location || '위치 미정'}
                                                                                    </div>
                                                                                </>
                                                                            ) : (
                                                                                <>
                                                                                    <div className="flex items-center gap-1">
                                                                                        <span className="text-xs px-1 py-0.5 rounded bg-red-50 text-red-700">드랍</span>
                                                                                        <MapPin className="w-3 h-3" />
                                                                                        하차: {item.dropoff_location || '위치 미정'}
                                                                                    </div>
                                                                                </>
                                                                            )}
                                                                        </div>
                                                                    ) : (
                                                                        <div className="text-gray-500 flex items-center gap-1">
                                                                            <MapPin className="w-3 h-3" />
                                                                            {item.location || '위치 미정'}
                                                                        </div>
                                                                    )}
                                                                    {item.car_type && (
                                                                        <div className="text-gray-500">
                                                                            차종: {item.car_type}
                                                                        </div>
                                                                    )}
                                                                    {item.vehicle_number && (
                                                                        <div className="text-gray-700 font-medium">
                                                                            차량번호: {item.vehicle_number}
                                                                        </div>
                                                                    )}
                                                                    {item.passenger_count && (
                                                                        <div className="text-gray-500">
                                                                            승객: {item.passenger_count}명
                                                                        </div>
                                                                    )}
                                                                    {/* SHT 차량만 차량 대수 표시 */}
                                                                    {item.service_type === 'car_sht' && item.car_count && (
                                                                        <div className="text-gray-500">
                                                                            차량: {item.car_count}대
                                                                        </div>
                                                                    )}
                                                                    {item.sht_category && (
                                                                        <div className="text-gray-500">
                                                                            카테고리: {item.sht_category}
                                                                        </div>
                                                                    )}
                                                                </>
                                                            ) : (
                                                                <span className="text-gray-400">일정 미정</span>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* 배차 코드 섹션 */}
                                                    <div className="mb-3">
                                                        <label className="block text-xs font-medium text-gray-700 mb-1">
                                                            배차 코드
                                                        </label>
                                                        <div className="flex items-center justify-between">
                                                            <div>
                                                                {item.dispatch_code ? (
                                                                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                                                        <CheckCircle className="w-3 h-3 mr-1" />
                                                                        {item.dispatch_code}
                                                                    </span>
                                                                ) : (
                                                                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                                                        <AlertCircle className="w-3 h-3 mr-1" />
                                                                        미발급
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* 승차 확인 상태 섹션 */}
                                                    <div className="mb-3">
                                                        <label className="block text-xs font-medium text-gray-700 mb-1">
                                                            승차 확인 상태
                                                        </label>
                                                        {item.pickup_confirmed_at ? (
                                                            <div className="bg-green-50 rounded p-2">
                                                                <div className="text-xs font-medium text-green-800">승차 확인 완료</div>
                                                                <div className="text-xs text-green-600">
                                                                    {new Date(item.pickup_confirmed_at).toLocaleString('ko-KR')}
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                                                                <AlertCircle className="w-3 h-3 mr-1" />
                                                                미확인
                                                            </span>
                                                        )}
                                                    </div>

                                                    {/* 배차 메모 섹션 */}
                                                    {item.dispatch_memo && item.dispatch_memo.trim() !== '' && (
                                                        <div className="mb-3">
                                                            <label className="block text-xs font-medium text-gray-700 mb-1">
                                                                배차 메모
                                                            </label>
                                                            <div className="bg-yellow-50 rounded p-2">
                                                                <div className="text-xs text-yellow-700 whitespace-pre-wrap">
                                                                    {item.dispatch_memo}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* 예약 상태 섹션 */}
                                                    <div className="flex items-center justify-between">
                                                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${item.re_status === 'confirmed'
                                                            ? 'bg-green-100 text-green-800'
                                                            : item.re_status === 'pending'
                                                                ? 'bg-yellow-100 text-yellow-800'
                                                                : 'bg-gray-100 text-gray-800'
                                                            }`}>
                                                            {item.re_status === 'confirmed' ? '예약확정' :
                                                                item.re_status === 'pending' ? '대기' :
                                                                    item.re_status === 'cancelled' ? '취소' :
                                                                        item.re_status}
                                                        </span>
                                                        <div className="text-xs text-gray-400">
                                                            {new Date(item.re_created_at).toLocaleDateString('ko-KR')}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </ManagerLayout>
    );
};

export default ConfirmListPage;