'use client';

import React, { useState, useEffect, useMemo } from 'react';
import ManagerLayout from '@/components/ManagerLayout';
import supabase from '@/lib/supabase';
import { Search, Car, Users, Calendar, AlertCircle, CheckCircle, User, MapPin, Plane, Ship, ChevronDown } from 'lucide-react';

interface VehicleReservation {
    id: string; // 각 서비스 테이블의 PK
    reservation_id: string;
    re_user_id: string;
    re_quote_id: string;
    re_status: string;
    re_created_at: string;
    re_type?: string; // 예약 타입 (cruise, package 등)
    service_type: 'airport' | 'rentcar' | 'cruise_car' | 'car_sht' | 'tour';
    dispatch_code?: string;
    // 서비스별 날짜 필드
    service_date?: string;
    service_datetime?: string;
    // 기타 정보
    location?: string;
    passenger_count?: number;
    car_count?: number;
    vehicle_number?: string;
    seat_number?: string;
    sht_category?: string;
    car_type?: string;
    pickup_location?: string;
    dropoff_location?: string;
    request_note?: string; // 요청사항 (패키지의 경우 차종 정보 포함)
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

const VehicleDispatchCodesPage = () => {
    const [reservations, setReservations] = useState<VehicleReservation[]>([]);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // 필터 상태
    const [serviceFilter, setServiceFilter] = useState<'all' | 'airport' | 'rentcar' | 'cruise_car' | 'car_sht' | 'tour' | 'all_except_car_sht'>('all');
    const [statusFilter, setStatusFilter] = useState<'all' | 'has_code' | 'no_code'>('all');
    const [dateFilter, setDateFilter] = useState<string>('');
    const [futureOnly, setFutureOnly] = useState<boolean>(true);
    const [searchTerm, setSearchTerm] = useState<string>('');

    // 편집 상태
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingCode, setEditingCode] = useState<string>('');

    // 로컬 YYYY-MM-DD 포맷터
    const formatLocalYMD = (input: string | Date) => {
        const d = typeof input === 'string' ? new Date(input) : input;
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    };

    // 통계 상태
    const [stats, setStats] = useState({
        total: 0,
        completed: 0, // 발급완료 (dispatch_code 있는 것)
        pending: 0,   // 미발급
        byType: {
            airport: 0,
            rentcar: 0,
            cruise_car: 0,
            car_sht: 0,
            tour: 0
        }
    });

    // 화면 표시 개수 (더보기 기능용)
    const [displayCount, setDisplayCount] = useState(100);

    // 차량 예약 데이터 로드 (service-tables 패턴 적용)
    const loadVehicleReservations = async () => {
        try {
            setLoading(true);
            setError(null);

            // 0. 정확한 통계 카운트 조회 (fetch 제한 없이 count만 조회)
            const [
                airportCount, rentcarCount, cruiseCarCount, carShtCount, tourCount,
                airportCompleted, rentcarCompleted, cruiseCarCompleted, carShtCompleted, tourCompleted
            ] = await Promise.all([
                supabase.from('reservation_airport').select('*', { count: 'exact', head: true }),
                supabase.from('reservation_rentcar').select('*', { count: 'exact', head: true }),
                supabase.from('reservation_cruise_car').select('*', { count: 'exact', head: true }),
                supabase.from('reservation_car_sht').select('*', { count: 'exact', head: true }),
                supabase.from('reservation_tour').select('*', { count: 'exact', head: true }),
                // 발급 완료 카운트 (dispatch_code is not null)
                supabase.from('reservation_airport').select('*', { count: 'exact', head: true }).not('dispatch_code', 'is', null),
                supabase.from('reservation_rentcar').select('*', { count: 'exact', head: true }).not('dispatch_code', 'is', null),
                supabase.from('reservation_cruise_car').select('*', { count: 'exact', head: true }).not('dispatch_code', 'is', null),
                supabase.from('reservation_car_sht').select('*', { count: 'exact', head: true }).not('dispatch_code', 'is', null),
                supabase.from('reservation_tour').select('*', { count: 'exact', head: true }).not('dispatch_code', 'is', null)
            ]);

            const statTotal = (airportCount.count || 0) + (rentcarCount.count || 0) + (cruiseCarCount.count || 0) + (carShtCount.count || 0) + (tourCount.count || 0);
            const statCompleted = (airportCompleted.count || 0) + (rentcarCompleted.count || 0) + (cruiseCarCompleted.count || 0) + (carShtCompleted.count || 0) + (tourCompleted.count || 0);

            setStats({
                total: statTotal,
                completed: statCompleted,
                pending: statTotal - statCompleted,
                byType: {
                    airport: airportCount.count || 0,
                    rentcar: rentcarCount.count || 0,
                    cruise_car: cruiseCarCount.count || 0,
                    car_sht: carShtCount.count || 0,
                    tour: tourCount.count || 0
                }
            });

            console.log('📊 통계 로드 완료:', statTotal);

            // 1. 각 서비스 테이블 개별 조회 (Joins 없이 Raw Data 조회)
            // Range를 늘려서 더 많은 데이터를 가져옴 (기본 1000 -> 5000)
            const FETCH_LIMIT = 4999;
            const [airportRes, rentcarRes, cruiseCarRes, carShtRes, tourRes] = await Promise.all([
                supabase.from('reservation_airport').select('*').range(0, FETCH_LIMIT),
                supabase.from('reservation_rentcar').select('*').range(0, FETCH_LIMIT),
                supabase.from('reservation_cruise_car').select('*').range(0, FETCH_LIMIT),
                supabase.from('reservation_car_sht').select('*').range(0, FETCH_LIMIT),
                supabase.from('reservation_tour').select('*').range(0, FETCH_LIMIT)
            ]);

            // 에러 로깅
            if (airportRes.error) console.error('공항 조회 에러:', airportRes.error);
            if (rentcarRes.error) console.error('렌트카 조회 에러:', rentcarRes.error);
            if (cruiseCarRes.error) console.error('크루즈카 조회 에러:', cruiseCarRes.error);
            if (carShtRes.error) console.error('SHT 조회 에러:', carShtRes.error);
            if (tourRes.error) console.error('투어 조회 에러:', tourRes.error);

            // 데이터 병합
            const allItems = [
                ...(airportRes.data || []).map(i => ({ ...i, _type: 'airport' })),
                ...(rentcarRes.data || []).map(i => ({ ...i, _type: 'rentcar' })),
                ...(cruiseCarRes.data || []).map(i => ({ ...i, _type: 'cruise_car' })),
                ...(carShtRes.data || []).map(i => ({ ...i, _type: 'car_sht' })),
                ...(tourRes.data || []).map(i => ({ ...i, _type: 'tour' }))
            ];

            console.log(`📋 총 ${allItems.length}건의 차량 데이터 로드됨 (최대 ${FETCH_LIMIT * 5}건 중)`);

            // 2. 관련된 Reservation ID 수집
            const reservationIds = Array.from(new Set(allItems.map(i => i.reservation_id).filter(Boolean)));

            // 3. Reservation 정보 조회 (배치)
            let reservationMap: Record<string, any> = {};
            if (reservationIds.length > 0) {
                // Reservation ID가 너무 많을 수 있으므로 청크로 나눔
                const ID_CHUNK_SIZE = 200;
                const idChunks = [];
                for (let i = 0; i < reservationIds.length; i += ID_CHUNK_SIZE) {
                    idChunks.push(reservationIds.slice(i, i + ID_CHUNK_SIZE));
                }

                for (const chunk of idChunks) {
                    const { data: reservations } = await supabase
                        .from('reservation')
                        .select('re_id, re_user_id, re_quote_id, re_status, re_created_at, re_type')
                        .in('re_id', chunk);

                    if (reservations) {
                        reservations.forEach(r => reservationMap[r.re_id] = r);
                    }
                }
            }

            // 4. User ID 및 Quote ID 수집
            const userIds = new Set<string>();
            const quoteIds = new Set<string>();

            Object.values(reservationMap).forEach((r: any) => {
                if (r.re_user_id) userIds.add(r.re_user_id);
                if (r.re_quote_id) quoteIds.add(r.re_quote_id);
            });

            // 5. User 정보 조회
            let userMap: Record<string, any> = {};
            if (userIds.size > 0) {
                const userArray = Array.from(userIds);
                const USER_CHUNK = 200;
                for (let i = 0; i < userArray.length; i += USER_CHUNK) {
                    const chunk = userArray.slice(i, i + USER_CHUNK);
                    const { data: users } = await supabase
                        .from('users')
                        .select('id, name, email, phone_number')
                        .in('id', chunk);
                    if (users) users.forEach(u => userMap[u.id] = u);
                }
            }

            // 6. Quote 정보 조회
            let quoteMap: Record<string, any> = {};
            if (quoteIds.size > 0) {
                const quoteArray = Array.from(quoteIds);
                const QUOTE_CHUNK = 200;
                for (let i = 0; i < quoteArray.length; i += QUOTE_CHUNK) {
                    const chunk = quoteArray.slice(i, i + QUOTE_CHUNK);
                    const { data: quotes } = await supabase
                        .from('quote')
                        .select('id, title')
                        .in('id', chunk);
                    if (quotes) quotes.forEach(q => quoteMap[q.id] = q);
                }
            }

            // 7. 최종 데이터 매핑
            const merged: VehicleReservation[] = allItems.map(item => {
                const r = reservationMap[item.reservation_id] || {};
                const user = r.re_user_id ? userMap[r.re_user_id] : undefined;
                const quote = r.re_quote_id ? quoteMap[r.re_quote_id] : undefined;

                // 공통 필드 매핑
                const base = {
                    id: item.id,
                    reservation_id: item.reservation_id || `orphaned-${item.id}`,
                    re_user_id: r.re_user_id || '',
                    re_quote_id: r.re_quote_id || '',
                    re_status: r.re_status || 'unknown',
                    re_created_at: r.re_created_at || item.created_at,
                    dispatch_code: item.dispatch_code,
                    quote: quote ? { title: quote.title, quote_id: quote.id } : undefined,
                    users: user ? {
                        name: user.name,
                        email: user.email,
                        phone: user.phone_number
                    } : undefined
                };

                // 서비스별 필드 매핑
                if (item._type === 'airport') {
                    return {
                        ...base,
                        service_type: 'airport',
                        service_datetime: item.ra_datetime,
                        location: item.ra_airport_location,
                        passenger_count: item.ra_passenger_count,
                        car_type: '공항 차량',
                        re_type: r.re_type,
                        request_note: item.request_note
                    };
                } else if (item._type === 'rentcar') {
                    return {
                        ...base,
                        service_type: 'rentcar',
                        service_date: item.pickup_datetime ? formatLocalYMD(item.pickup_datetime) : undefined,
                        service_datetime: item.pickup_datetime,
                        location: item.pickup_location || item.destination || '위치 미정',
                        passenger_count: item.passenger_count,
                        car_type: '렌터카',
                        re_type: r.re_type,
                        request_note: item.request_note
                    };
                } else if (item._type === 'cruise_car') {
                    return {
                        ...base,
                        service_type: 'cruise_car',
                        service_datetime: item.pickup_datetime,
                        location: item.pickup_location,
                        passenger_count: item.passenger_count,
                        car_type: '크루즈 차량',
                        re_type: r.re_type,
                        request_note: item.request_note
                    };
                } else if (item._type === 'car_sht') {
                    return {
                        ...base,
                        service_type: 'car_sht',
                        service_date: item.pickup_datetime ? formatLocalYMD(item.pickup_datetime) : undefined,
                        service_datetime: item.pickup_datetime,
                        vehicle_number: item.vehicle_number,
                        seat_number: item.seat_number,
                        sht_category: item.sht_category,
                        pickup_location: item.pickup_location,
                        dropoff_location: item.dropoff_location,
                        location: item.sht_category?.toLowerCase() === 'pickup'
                            ? item.pickup_location || '승차위치 미정'
                            : item.dropoff_location || '하차위치 미정',
                        re_type: r.re_type,
                        request_note: item.request_note
                    };
                } else { // tour
                    return {
                        ...base,
                        service_type: 'tour',
                        service_date: item.usage_date ? formatLocalYMD(item.usage_date) : undefined,
                        service_datetime: item.usage_date,
                        pickup_location: item.pickup_location,
                        dropoff_location: item.dropoff_location,
                        location: item.pickup_location || '픽업 위치 미정',
                        passenger_count: (item.adult_count || 0) + (item.child_count || 0),
                        car_type: '투어 차량',
                        re_type: r.re_type,
                        request_note: item.request_note
                    };
                }
            });

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
    const filteredReservations = useMemo(() => {
        let result = reservations;

        // 서비스 타입 필터
        if (serviceFilter === 'all_except_car_sht') {
            result = result.filter(r => r.service_type !== 'car_sht');
        } else if (serviceFilter !== 'all') {
            result = result.filter(r => r.service_type === serviceFilter);
        }

        // 배차 코드 상태 필터
        if (statusFilter === 'has_code') {
            result = result.filter(r => !!r.dispatch_code && r.dispatch_code.trim() !== '');
        } else if (statusFilter === 'no_code') {
            result = result.filter(r => !r.dispatch_code || r.dispatch_code.trim() === '');
        }

        // 날짜 필터 (특정 날짜)
        if (dateFilter) {
            result = result.filter(r => {
                const dateToCheck = r.service_type === 'car_sht'
                    ? r.service_date
                    : (r.service_datetime ? formatLocalYMD(r.service_datetime) : '');
                return dateToCheck === dateFilter;
            });
        }

        // 오늘 이후 보기 필터
        if (futureOnly) {
            const today = formatLocalYMD(new Date());
            result = result.filter(r => {
                // 날짜가 없으면(미정 등) 미래로 간주하여 표시할지, 과거로 뺄지 결정. 여기선 표시.
                const dateToCheck = r.service_type === 'car_sht'
                    ? r.service_date
                    : (r.service_datetime ? formatLocalYMD(r.service_datetime) : '');

                if (!dateToCheck) return true;
                return dateToCheck >= today;
            });
        }

        // 검색어 필터
        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            result = result.filter(r =>
                r.users?.name?.toLowerCase().includes(lower) ||
                r.users?.email?.toLowerCase().includes(lower) ||
                r.reservation_id?.toLowerCase().includes(lower) ||
                r.dispatch_code?.toLowerCase().includes(lower) ||
                r.quote?.title?.toLowerCase().includes(lower) ||
                r.location?.toLowerCase().includes(lower)
            );
        }

        // 정렬: 날짜 오름차순 (가까운 날짜부터)
        result.sort((a, b) => {
            const dateA = a.service_datetime || a.service_date || '9999-12-31';
            const dateB = b.service_datetime || b.service_date || '9999-12-31';
            return dateA.localeCompare(dateB);
        });

        return result;
    }, [reservations, serviceFilter, statusFilter, dateFilter, futureOnly, searchTerm]);

    const visibleReservations = filteredReservations.slice(0, displayCount);

    const handleLoadMore = () => {
        setDisplayCount(prev => prev + 100);
    };

    // 배차 코드 업데이트 (ID 기준)
    const updateDispatchCode = async (id: string, serviceType: string, newCode: string) => {
        try {
            const tableMap: Record<string, string> = {
                'airport': 'reservation_airport',
                'rentcar': 'reservation_rentcar',
                'cruise_car': 'reservation_cruise_car',
                'car_sht': 'reservation_car_sht',
                'tour': 'reservation_tour'
            };

            const tableName = tableMap[serviceType];
            if (!tableName) {
                console.error('알 수 없는 서비스 타입:', serviceType);
                alert('지원하지 않는 서비스 타입입니다.');
                return;
            }

            // 개별 ID로 업데이트 (1:N 문제 해결)
            const { error: updateError } = await supabase
                .from(tableName)
                .update({ dispatch_code: newCode.trim() || null })
                .eq('id', id);

            if (updateError) {
                console.error('배차 코드 업데이트 오류:', updateError);
                alert('배차 코드 업데이트에 실패했습니다.');
                return;
            }

            // 로컬 상태 업데이트
            setReservations(prev =>
                prev.map(r =>
                    r.id === id
                        ? { ...r, dispatch_code: newCode.trim() || undefined }
                        : r
                )
            );

            setEditingId(null);
            setEditingCode('');
            console.log('배차 코드 업데이트 완료:', id, '→', newCode);
        } catch (err) {
            console.error('배차 코드 업데이트 예외:', err);
            alert('배차 코드 업데이트 중 오류가 발생했습니다.');
        }
    };

    // 편집 시작
    const startEditing = (reservationId: string, currentCode: string = '') => {
        setEditingId(reservationId);
        setEditingCode(currentCode);
    };

    // 편집 취소
    const cancelEditing = () => {
        setEditingId(null);
        setEditingCode('');
    };

    // 날짜별 그룹화 (service-tables 패턴)
    const groupByServiceDateForVehicle = (data: VehicleReservation[]) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const groups: Record<string, VehicleReservation[]> = {};

        data.forEach(item => {
            const serviceDate = item.service_date || (item.service_datetime ? formatLocalYMD(item.service_datetime) : null);

            if (!serviceDate) {
                (groups['미정'] ||= []).push(item);
                return;
            }

            // 오늘 이후만 그룹화 (futureOnly가 false면 과거 데이터도 포함)
            if (!futureOnly || new Date(serviceDate) >= today) {
                (groups[serviceDate] ||= []).push(item);
            }
        });

        return Object.entries(groups)
            .sort(([a], [b]) => {
                if (a === '미정') return 1;
                if (b === '미정') return -1;
                return a.localeCompare(b);
            })
            .map(([date, reservations]) => ({
                date,
                reservations: reservations.sort((a, b) => {
                    // 차량 번호 있는 것 우선
                    if (a.vehicle_number && !b.vehicle_number) return -1;
                    if (!a.vehicle_number && b.vehicle_number) return 1;
                    return (a.vehicle_number || '').localeCompare(b.vehicle_number || '');
                })
            }));
    };

    // 컴포넌트 마운트시 데이터 로드
    useEffect(() => {
        loadVehicleReservations();
    }, []);

    const groupedData = groupByServiceDateForVehicle(visibleReservations);

    // 서비스 타입 아이콘 반환
    const getServiceIcon = (serviceType: string) => {
        switch (serviceType) {
            case 'airport': return <Plane className="w-4 h-4" />;
            case 'rentcar': return <Car className="w-4 h-4" />;
            case 'cruise_car': return <Ship className="w-4 h-4" />;
            case 'car_sht': return <Car className="w-4 h-4" />;
            case 'tour': return <MapPin className="w-4 h-4" />;
            default: return <Car className="w-4 h-4" />;
        }
    };

    // 서비스 타입 라벨 반환
    const getServiceLabel = (serviceType: string) => {
        switch (serviceType) {
            case 'airport': return '공항';
            case 'rentcar': return '렌터카';
            case 'cruise_car': return '크루즈카';
            case 'car_sht': return '스하차량';
            case 'tour': return '투어';
            default: return '차량';
        }
    };

    if (loading) {
        return (
            <ManagerLayout title="차량번호 관리" activeTab="dispatch-codes-vehicle">
                <div className="flex justify-center items-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
                    <p className="ml-4 text-gray-600">차량 예약 데이터를 불러오는 중...</p>
                </div>
            </ManagerLayout>
        );
    }

    return (
        <ManagerLayout title="차량번호 관리" activeTab="dispatch-codes-vehicle">
            <div className="space-y-6">
                {/* 헤더 및 통계 */}
                <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
                    <h1 className="text-xl font-bold mb-4">차량번호 관리</h1>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="bg-blue-50 rounded-lg p-4">
                            <div className="flex items-center gap-2">
                                <Car className="w-5 h-5 text-blue-600" />
                                <span className="text-sm text-blue-600">전체 차량 예약</span>
                            </div>
                            <div className="text-2xl font-bold text-blue-700 mt-1">
                                {stats.total}건
                            </div>
                        </div>

                        <div className="bg-green-50 rounded-lg p-4">
                            <div className="flex items-center gap-2">
                                <CheckCircle className="w-5 h-5 text-green-600" />
                                <span className="text-sm text-green-600">차량번호 지정완료</span>
                            </div>
                            <div className="text-2xl font-bold text-green-700 mt-1">
                                {stats.completed}건
                            </div>
                        </div>

                        <div className="bg-orange-50 rounded-lg p-4">
                            <div className="flex items-center gap-2">
                                <AlertCircle className="w-5 h-5 text-orange-600" />
                                <span className="text-sm text-orange-600">차량번호 미지정</span>
                            </div>
                            <div className="text-2xl font-bold text-orange-700 mt-1">
                                {stats.pending}건
                            </div>
                        </div>

                        <div className="bg-purple-50 rounded-lg p-4">
                            <div className="flex items-center gap-2">
                                <Users className="w-5 h-5 text-purple-600" />
                                <span className="text-sm text-purple-600">서비스별 분류</span>
                            </div>
                            <div className="text-sm text-purple-700 mt-1">
                                공항 {stats.byType.airport} / 렌터카 {stats.byType.rentcar} / 크루즈카 {stats.byType.cruise_car} / SHT {stats.byType.car_sht} / 투어 {stats.byType.tour}
                            </div>
                        </div>
                    </div>
                </div>

                {/* 필터 섹션 */}
                <div className="bg-white rounded-lg shadow-sm p-6">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        {/* 서비스 타입 필터 */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">서비스 타입</label>
                            <div className="flex flex-wrap gap-1">
                                {[
                                    { key: 'all', label: '전체', color: 'bg-gray-100 text-gray-700' },
                                    { key: 'airport', label: '공항', color: 'bg-blue-100 text-blue-700' },
                                    { key: 'rentcar', label: '렌터카', color: 'bg-green-100 text-green-700' },
                                    { key: 'cruise_car', label: '크루즈카', color: 'bg-purple-100 text-purple-700' },
                                    { key: 'car_sht', label: 'SHT', color: 'bg-orange-100 text-orange-700' },
                                    { key: 'tour', label: '투어', color: 'bg-pink-100 text-pink-700' },
                                    { key: 'all_except_car_sht', label: 'SHT 제외', color: 'bg-red-100 text-red-700' }
                                ].map(service => (
                                    <button
                                        key={service.key}
                                        onClick={() => setServiceFilter(service.key as any)}
                                        className={`px-2 py-1 rounded text-xs font-medium transition-colors ${serviceFilter === service.key
                                            ? service.color.replace('100', '200').replace('700', '800')
                                            : service.color
                                            }`}
                                    >
                                        {service.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* 배차 코드 상태 필터 */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">차량번호 상태</label>
                            <div className="flex gap-2">
                                {[
                                    { key: 'all', label: '전체', color: 'bg-gray-100 text-gray-700' },
                                    { key: 'has_code', label: '지정완료', color: 'bg-green-100 text-green-700' },
                                    { key: 'no_code', label: '미지정', color: 'bg-orange-100 text-orange-700' }
                                ].map(status => (
                                    <button
                                        key={status.key}
                                        onClick={() => setStatusFilter(status.key as any)}
                                        className={`px-3 py-1 rounded text-xs font-medium transition-colors ${statusFilter === status.key
                                            ? status.color.replace('100', '200').replace('700', '800')
                                            : status.color
                                            }`}
                                    >
                                        {status.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* 날짜 필터 */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">서비스 날짜</label>
                            <div className="relative">
                                <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    type="date"
                                    value={dateFilter}
                                    onChange={(e) => setDateFilter(e.target.value)}
                                    className="w-full pl-10 pr-3 py-2 border border-gray-200 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                />
                            </div>
                            <div className="mt-2 text-xs text-gray-600">
                                <button
                                    type="button"
                                    onClick={() => setFutureOnly(prev => !prev)}
                                    className={`px-2 py-1 rounded text-xs font-medium transition-colors focus:outline-none ${futureOnly ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}
                                >
                                    오늘 이후만 보기
                                </button>
                            </div>
                        </div>

                        {/* 검색 */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">검색</label>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="이름, 여행명, 배차코드, 견적ID 검색"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full pl-10 pr-3 py-2 border border-gray-200 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                />
                            </div>
                        </div>
                    </div>

                    {/* 필터 초기화 */}
                    {(serviceFilter !== 'all' || statusFilter !== 'all' || dateFilter || searchTerm || futureOnly) && (
                        <div className="mt-4 pt-4 border-t border-gray-200">
                            <button
                                onClick={() => {
                                    setServiceFilter('all');
                                    setStatusFilter('all');
                                    setDateFilter('');
                                    setFutureOnly(true);
                                    setSearchTerm('');
                                }}
                                className="text-sm text-blue-600 hover:text-blue-800"
                            >
                                모든 필터 초기화
                            </button>
                        </div>
                    )}
                </div>

                {/* 예약 목록 */}
                <div className="bg-white rounded-lg shadow-sm">
                    <div className="p-6 border-b border-gray-200">
                        <h2 className="text-lg font-semibold text-gray-800">
                            차량 예약 목록 ({filteredReservations.length}건)
                        </h2>
                    </div>

                    {error && (
                        <div className="p-6 bg-red-50 border-l-4 border-red-400">
                            <div className="flex items-center">
                                <AlertCircle className="w-5 h-5 text-red-400 mr-2" />
                                <p className="text-red-700">{error}</p>
                            </div>
                            <button
                                onClick={loadVehicleReservations}
                                className="mt-2 text-sm text-red-600 hover:text-red-800 underline"
                            >
                                다시 시도
                            </button>
                        </div>
                    )}

                    {filteredReservations.length === 0 ? (
                        <div className="p-12 text-center text-gray-500">
                            <Car className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                            <p>조건에 맞는 차량 예약이 없습니다.</p>
                        </div>
                    ) : (
                        <div className="p-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
                                {groupedData.map(group => (
                                    <React.Fragment key={`group-${group.date}`}>
                                        {/* 그룹 헤더 */}
                                        <div className="col-span-full">
                                            <div className="bg-gray-100 rounded-lg px-4 py-2 mb-4">
                                                <h3 className="text-sm font-semibold text-gray-700">
                                                    서비스 날짜 {group.date} · {group.reservations.length}건
                                                </h3>
                                            </div>
                                        </div>

                                        {/* 그룹 내 카드들 */}
                                        {group.reservations.map((reservation) => (
                                            <div key={reservation.reservation_id} className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                                                {/* 예약 정보 섹션 */}
                                                <div className="mb-3">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <User className="w-4 h-4 text-gray-400" />
                                                        <span className="text-sm font-medium text-gray-900">
                                                            {reservation.users?.name || '이름 없음'}
                                                        </span>
                                                        <div className="flex items-center gap-1 ml-auto">
                                                            {reservation.re_type === 'package' && (
                                                                <span className="text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">📦 패키지</span>
                                                            )}
                                                            {getServiceIcon(reservation.service_type)}
                                                            <span className="text-xs text-gray-500">
                                                                {getServiceLabel(reservation.service_type)}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <div className="text-xs text-gray-500 mb-1">
                                                        {reservation.quote?.title || '제목 없음'}
                                                    </div>
                                                    {/* 견적ID는 사용자 카드에서 제거됨 */}
                                                </div>

                                                {/* 차량 서비스 일정 섹션 */}
                                                <div className="mb-3">
                                                    <div className="text-xs text-gray-600 mb-1">
                                                        {reservation.service_date || reservation.service_datetime ? (
                                                            <>
                                                                <div className="font-medium">
                                                                    서비스 일시: {
                                                                        reservation.service_date || (
                                                                            reservation.service_datetime &&
                                                                            (reservation.service_type === 'rentcar' || reservation.service_type === 'car_sht'
                                                                                ? formatLocalYMD(reservation.service_datetime)
                                                                                : new Date(reservation.service_datetime).toLocaleString('ko-KR'))
                                                                        )
                                                                    }
                                                                </div>
                                                                {/* SHT 차량의 경우 상세 위치 정보 표시 */}
                                                                {reservation.service_type === 'car_sht' ? (
                                                                    <div className="text-gray-500 space-y-1">
                                                                        {reservation.sht_category?.toLowerCase() === 'pickup' ? (
                                                                            <>
                                                                                <div className="flex items-center gap-1">
                                                                                    <span className="text-xs px-1 py-0.5 rounded bg-green-50 text-green-700">픽업</span>
                                                                                    <MapPin className="w-3 h-3" />
                                                                                    승차: {reservation.pickup_location || '위치 미정'}
                                                                                </div>
                                                                            </>
                                                                        ) : (
                                                                            <>
                                                                                <div className="flex items-center gap-1">
                                                                                    <span className="text-xs px-1 py-0.5 rounded bg-red-50 text-red-700">드랍</span>
                                                                                    <MapPin className="w-3 h-3" />
                                                                                    하차: {reservation.dropoff_location || '위치 미정'}
                                                                                </div>
                                                                            </>
                                                                        )}
                                                                    </div>
                                                                ) : (
                                                                    <div className="text-gray-500 flex items-center gap-1">
                                                                        <MapPin className="w-3 h-3" />
                                                                        {reservation.location || '위치 미정'}
                                                                    </div>
                                                                )}
                                                                {/* 차종 정보 표시: 패키지는 request_note에서 (스하차량 제외), 일반은 car_type에서 */}
                                                                {reservation.re_type === 'package' && reservation.request_note && reservation.service_type !== 'car_sht' ? (
                                                                    <div className="text-purple-600 font-medium">
                                                                        🚗 {reservation.request_note}
                                                                    </div>
                                                                ) : reservation.car_type && (
                                                                    <div className="text-gray-500">
                                                                        차종: {reservation.car_type}
                                                                    </div>
                                                                )}
                                                                {reservation.vehicle_number && (
                                                                    <div className="text-gray-700 font-medium">
                                                                        차량번호: {reservation.vehicle_number}
                                                                    </div>
                                                                )}
                                                                {reservation.passenger_count && (
                                                                    <div className="text-gray-500">
                                                                        승객: {reservation.passenger_count}명
                                                                    </div>
                                                                )}
                                                                {/* SHT 차량만 차량 대수와 좌석번호 표시 */}
                                                                {reservation.service_type === 'car_sht' && reservation.car_count && (
                                                                    <div className="text-gray-500">
                                                                        차량: {reservation.car_count}대
                                                                    </div>
                                                                )}
                                                                {reservation.seat_number && (
                                                                    <div className="text-gray-500">
                                                                        좌석번호: {reservation.seat_number}
                                                                    </div>
                                                                )}
                                                            </>
                                                        ) : (
                                                            <span className="text-gray-400">일정 미정</span>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* 배차 코드 섹션 */}
                                                <div className="pt-4 border-t border-gray-100 mt-4">
                                                    <div className="text-xs font-medium text-green-800 mb-2">차량번호</div>

                                                    {editingId === reservation.id ? (
                                                        <div className="flex items-center gap-2">
                                                            <input
                                                                type="text"
                                                                value={editingCode}
                                                                onChange={(e) => setEditingCode(e.target.value)}
                                                                placeholder="차량번호 입력"
                                                                className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500"
                                                                autoFocus
                                                            />
                                                            <button
                                                                onClick={() => updateDispatchCode(reservation.id, reservation.service_type, editingCode)}
                                                                className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
                                                            >
                                                                저장
                                                            </button>
                                                            <button
                                                                onClick={cancelEditing}
                                                                className="px-2 py-1 bg-gray-400 text-white rounded text-xs hover:bg-gray-500"
                                                            >
                                                                취소
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center justify-between">
                                                            <div>
                                                                {reservation.dispatch_code ? (
                                                                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                                                        <CheckCircle className="w-3 h-3 mr-1" />
                                                                        {reservation.dispatch_code}
                                                                    </span>
                                                                ) : (
                                                                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                                                        <AlertCircle className="w-3 h-3 mr-1" />
                                                                        미지정
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <button
                                                                onClick={() => startEditing(reservation.id, reservation.dispatch_code || '')}
                                                                disabled={editingId !== null}
                                                                className="text-xs text-blue-600 hover:text-blue-900 disabled:text-gray-400"
                                                            >
                                                                {reservation.dispatch_code ? '수정' : '지정'}
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* 예약 상태 섹션 */}
                                                <div className="flex items-center justify-between">
                                                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${reservation.re_status === 'confirmed'
                                                        ? 'bg-green-100 text-green-800'
                                                        : reservation.re_status === 'pending'
                                                            ? 'bg-yellow-100 text-yellow-800'
                                                            : 'bg-gray-100 text-gray-800'
                                                        }`}>
                                                        {reservation.re_status}
                                                    </span>
                                                    <div className="text-xs text-gray-400">
                                                        {new Date(reservation.re_created_at).toLocaleDateString('ko-KR')}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </React.Fragment>
                                ))}
                            </div>

                            {/* 더보기 버튼 */}
                            {visibleReservations.length < filteredReservations.length && (
                                <div className="mt-8 text-center pb-4">
                                    <button
                                        onClick={handleLoadMore}
                                        className="inline-flex items-center px-6 py-3 border border-gray-300 shadow-sm text-sm font-medium rounded-full text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                                    >
                                        <ChevronDown className="w-4 h-4 mr-2" />
                                        더 보기 ({filteredReservations.length - visibleReservations.length}건 남음)
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </ManagerLayout>
    );
};

export default VehicleDispatchCodesPage;
