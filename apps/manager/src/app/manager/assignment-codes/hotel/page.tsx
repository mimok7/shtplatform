'use client';

import React, { useState, useEffect, useMemo } from 'react';
import ManagerLayout from '@/components/ManagerLayout';
import supabase from '@/lib/supabase';
import { Search, Hotel, Users, Calendar, AlertCircle, CheckCircle, User } from 'lucide-react';

interface HotelReservation {
    reservation_id: string;
    re_user_id: string;
    re_quote_id: string;
    re_status: string;
    re_created_at: string;
    assignment_code?: string;
    checkin_date?: string;
    hotel_price_code?: string;
    room_count?: number;
    guest_count?: number;
    hotel_category?: string;
    breakfast_service?: string;
    request_note?: string;
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

const HotelAssignmentCodesPage = () => {
    const [reservations, setReservations] = useState<HotelReservation[]>([]);
    const [filteredReservations, setFilteredReservations] = useState<HotelReservation[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // 필터 상태
    const [statusFilter, setStatusFilter] = useState<'all' | 'has_code' | 'no_code'>('all');
    const [dateFilter, setDateFilter] = useState<string>('');
    const [futureOnly, setFutureOnly] = useState<boolean>(true);
    const [searchTerm, setSearchTerm] = useState<string>('');

    // 편집 상태
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingCode, setEditingCode] = useState<string>('');

    // 호텔 예약 데이터 로드 (reservation_hotel 기준)
    const loadHotelReservations = async () => {
        try {
            setLoading(true);
            setError(null);

            // 1) reservation_hotel 테이블 직접 조회 (소스 오브 트루스)
            const { data: hotelRows, error: hotelErr } = await supabase
                .from('reservation_hotel')
                .select('*')
                .order('checkin_date', { ascending: true });

            if (hotelErr) {
                console.error('호텔 예약 목록 조회 오류:', hotelErr);
                setError('호텔 예약 목록을 불러오지 못했습니다.');
                setReservations([]);
                return;
            }

            if (!hotelRows || hotelRows.length === 0) {
                setReservations([]);
                return;
            }

            console.log(`📋 호텔 데이터 로드됨: ${hotelRows.length}건`);

            // 2) 관련 ID 수집
            const reservationIds = hotelRows.map(r => r.reservation_id).filter(Boolean);

            // 3) 관련 데이터 배치 조회
            let reservationMap: Record<string, any> = {};
            let userMap: Record<string, any> = {};
            let quoteMap: Record<string, any> = {};
            let hotelPriceMap: Record<string, any> = {};

            // Hotel Price Codes 수집
            const priceCodes = hotelRows.map(r => r.hotel_price_code).filter(Boolean);

            if (priceCodes.length > 0) {
                const { data: priceRows } = await supabase
                    .from('hotel_price')
                    .select('*')
                    .in('hotel_price_code', priceCodes);

                if (priceRows) {
                    hotelPriceMap = priceRows.reduce((acc: any, row: any) => {
                        acc[row.hotel_price_code] = row;
                        return acc;
                    }, {});
                }
            }

            if (reservationIds.length > 0) {
                // Reservation 테이블 조회 (re_ 접두사 사용)
                const { data: resRows } = await supabase
                    .from('reservation')
                    .select('re_id, re_user_id, re_quote_id, re_status, re_created_at')
                    .in('re_id', reservationIds);

                if (resRows) {
                    reservationMap = resRows.reduce((acc: any, row: any) => {
                        acc[row.re_id] = row;
                        return acc;
                    }, {});

                    const userIds = resRows.map(r => r.re_user_id).filter(Boolean);
                    const quoteIds = resRows.map(r => r.re_quote_id).filter(Boolean);

                    // Users 테이블 조회
                    if (userIds.length > 0) {
                        const { data: userRows } = await supabase
                            .from('users')
                            .select('id, name, email, phone_number')
                            .in('id', userIds);

                        if (userRows) {
                            userMap = userRows.reduce((acc: any, row: any) => {
                                acc[row.id] = row;
                                return acc;
                            }, {});
                        }
                    }

                    // Quotes 테이블 조회
                    if (quoteIds.length > 0) {
                        const { data: quoteRows } = await supabase
                            .from('quote')
                            .select('id, title')
                            .in('id', quoteIds);

                        if (quoteRows) {
                            quoteMap = quoteRows.reduce((acc: any, row: any) => {
                                acc[row.id] = row;
                                return acc;
                            }, {});
                        }
                    }
                }

                // [Fallback] 고아 레코드(Reservation 없음) 처리
                // 1. reservation_id가 User ID일 가능성을 염두에 두고 Users 테이블 조회
                const orphanIds = reservationIds.filter(id => !reservationMap[id]);
                if (orphanIds.length > 0) {
                    const { data: fallbackUsers } = await supabase
                        .from('users')
                        .select('id, name, email, phone_number')
                        .in('id', orphanIds);

                    if (fallbackUsers && fallbackUsers.length > 0) {
                        fallbackUsers.forEach((u: any) => {
                            // User Map에 추가
                            userMap[u.id] = u;
                            // 가짜 Reservation 생성하여 연결 (ID가 User ID 역할)
                            reservationMap[u.id] = {
                                re_id: u.id,
                                re_user_id: u.id,
                                re_status: 'unknown_orphan',
                                re_created_at: new Date().toISOString()
                            };
                        });
                        console.log(`⚠️ Orphaned Reservations Fixed via User Lookup: ${fallbackUsers.length}건`);
                    }
                }
            }

            // 4) 데이터 병합
            const merged: HotelReservation[] = hotelRows.map((h: any) => {
                const res = reservationMap[h.reservation_id] || {};
                const user = res.re_user_id ? userMap[res.re_user_id] : undefined;
                const quote = res.re_quote_id ? quoteMap[res.re_quote_id] : undefined;
                const priceInfo = h.hotel_price_code ? hotelPriceMap[h.hotel_price_code] : undefined;

                // 호텔명 결정: reservation_hotel.hotel_category -> hotel_price.hotel_name
                const hotelName = h.hotel_category || priceInfo?.hotel_name || priceInfo?.hotel_code || '호텔명 미정';

                // 객실명 결정: hotel_price.room_name -> hotel_price.room_category
                const roomName = priceInfo?.room_name || priceInfo?.room_category || undefined;

                return {
                    reservation_id: h.reservation_id || h.id,
                    re_user_id: res.re_user_id,
                    re_quote_id: res.re_quote_id,
                    re_status: res.re_status || 'unknown',
                    re_created_at: res.re_created_at || h.created_at,
                    assignment_code: h.assignment_code,
                    checkin_date: h.checkin_date,
                    hotel_price_code: h.hotel_price_code,
                    room_count: h.room_count,
                    guest_count: h.guest_count,
                    hotel_category: hotelName,
                    breakfast_service: h.breakfast_service,
                    request_note: h.request_note,
                    room_name: roomName,
                    users: user ? {
                        name: user.name,
                        email: user.email,
                        phone: user.phone_number
                    } : undefined,
                    quote: quote ? { title: quote.title, quote_id: res.re_quote_id } : undefined
                };
            });

            setReservations(merged);
        } catch (err) {
            console.error('예상치 못한 오류:', err);
            setError('데이터 로드 중 예상치 못한 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };

    // 필터링 로직
    useEffect(() => {
        let filtered = [...reservations];

        // 호텔 코드 상태 필터
        if (statusFilter === 'has_code') {
            filtered = filtered.filter(r => r.assignment_code && r.assignment_code.trim() !== '');
        } else if (statusFilter === 'no_code') {
            filtered = filtered.filter(r => !r.assignment_code || r.assignment_code.trim() === '');
        }

        // 날짜 필터 (체크인 날짜 기준)
        if (dateFilter) {
            filtered = filtered.filter(r => {
                if (!r.checkin_date) return false;
                const checkinDate = new Date(r.checkin_date).toISOString().split('T')[0];
                return checkinDate === dateFilter;
            });
        }

        // 오늘 이후만 보기
        if (futureOnly) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            filtered = filtered.filter(r => {
                if (!r.checkin_date) return false;
                const d = new Date(r.checkin_date);
                d.setHours(0, 0, 0, 0);
                return d >= today;
            });
        }

        // 검색 필터
        if (searchTerm) {
            const q = searchTerm.toLowerCase();
            filtered = filtered.filter(r =>
                r.users?.name?.toLowerCase().includes(q) ||
                r.quote?.title?.toLowerCase().includes(q) ||
                r.hotel_category?.toLowerCase().includes(q) ||
                r.assignment_code?.toLowerCase().includes(q) ||
                r.re_quote_id?.toLowerCase().includes(q)
            );
        }

        // 체크인 기준 정렬
        filtered.sort((a, b) => (a.checkin_date || '').localeCompare(b.checkin_date || ''));

        setFilteredReservations(filtered);
    }, [reservations, statusFilter, dateFilter, searchTerm, futureOnly]);

    // 호텔 코드 업데이트
    const updateAssignmentCode = async (reservationId: string, newCode: string) => {
        try {
            const { error: updateError } = await supabase
                .from('reservation_hotel')
                .update({ assignment_code: newCode.trim() || null })
                .eq('reservation_id', reservationId);

            if (updateError) {
                console.error('호텔 코드 업데이트 오류:', updateError);
                alert('호텔 코드 업데이트에 실패했습니다.');
                return;
            }

            // 로컬 상태 업데이트
            setReservations(prev =>
                prev.map(r =>
                    r.reservation_id === reservationId
                        ? { ...r, assignment_code: newCode.trim() || undefined }
                        : r
                )
            );

            setEditingId(null);
            setEditingCode('');
            console.log('호텔 코드 업데이트 완료:', reservationId, '→', newCode);
        } catch (err) {
            console.error('호텔 코드 업데이트 예외:', err);
            alert('호텔 코드 업데이트 중 오류가 발생했습니다.');
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

    // 컴포넌트 마운트시 데이터 로드
    useEffect(() => {
        loadHotelReservations();
    }, []);

    // 체크인 기준 그룹화 메모
    const groupedByCheckin = useMemo(() => {
        const map: Record<string, HotelReservation[]> = {};
        for (const r of filteredReservations) {
            const key = r.checkin_date ? r.checkin_date.slice(0, 10) : '미정';
            (map[key] ||= []).push(r);
        }
        return Object.entries(map)
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([date, items]) => ({ date, items }));
    }, [filteredReservations]);

    if (loading) {
        return (
            <ManagerLayout title="호텔 코드 관리" activeTab="assignment-codes-hotel">
                <div className="flex justify-center items-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
                    <p className="ml-4 text-gray-600">호텔 예약 데이터를 불러오는 중...</p>
                </div>
            </ManagerLayout>
        );
    }

    return (
        <ManagerLayout title="호텔 코드 관리" activeTab="assignment-codes-hotel">
            <div className="space-y-6">
                {/* 헤더 및 통계 */}
                <div className="bg-white rounded-lg shadow-sm p-6">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="flex items-center gap-3">
                            <Hotel className="w-6 h-6 text-blue-600" />
                            <h1 className="text-xl font-bold text-gray-800">호텔 코드 관리</h1>
                        </div>
                        {/*
                                // 1. Get the hotel row
                                const { data: hRows } = await supabase.from('reservation_hotel').select('*').limit(1);
                                if (!hRows || hRows.length === 0) return alert('No hotel data');
                                const h = hRows[0];

                                // 2. Get reservation
                                const { data: rRows } = await supabase.from('reservation').select('*').eq('id', h.reservation_id);
                                const r = rRows?.[0];

                                // 3. Get User
                                let u = null;
                                if (r?.user_id) {
                                    const { data: uRows } = await supabase.from('users').select('*').eq('id', r.user_id);
                                    u = uRows?.[0];
                                }

                                alert(`
                                    H_ID: ${h.reservation_id}
                                    H_Category: ${h.hotel_category}
                                    H_PriceCode: ${h.hotel_price_code}
                                    
                                    R_Found: ${!!r}
                                    R_UserId: ${r?.user_id}
                                    R_QuoteId: ${r?.quote_id}
                                    
                                    U_Found: ${!!u}
                                    U_Name: ${u?.name}
                                `);
                                console.log('Debug Hotel:', h, 'Res:', r, 'User:', u);
                            }}
                        */}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-blue-50 rounded-lg p-4">
                            <div className="flex items-center gap-2">
                                <Hotel className="w-5 h-5 text-blue-600" />
                                <span className="text-sm text-blue-600">전체 호텔 예약</span>
                            </div>
                            <div className="text-2xl font-bold text-blue-700 mt-1">
                                {reservations.length}건
                            </div>
                        </div>

                        <div className="bg-green-50 rounded-lg p-4">
                            <div className="flex items-center gap-2">
                                <CheckCircle className="w-5 h-5 text-green-600" />
                                <span className="text-sm text-green-600">호텔 코드 발급완료</span>
                            </div>
                            <div className="text-2xl font-bold text-green-700 mt-1">
                                {reservations.filter(r => r.assignment_code && r.assignment_code.trim() !== '').length}건
                            </div>
                        </div>

                        <div className="bg-orange-50 rounded-lg p-4">
                            <div className="flex items-center gap-2">
                                <AlertCircle className="w-5 h-5 text-orange-600" />
                                <span className="text-sm text-orange-600">호텔 코드 미발급</span>
                            </div>
                            <div className="text-2xl font-bold text-orange-700 mt-1">
                                {reservations.filter(r => !r.assignment_code || r.assignment_code.trim() === '').length}건
                            </div>
                        </div>
                    </div>
                </div>

                {/* 필터 섹션 */}
                <div className="bg-white rounded-lg shadow-sm p-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* 호텔 코드 상태 필터 */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">호텔 코드 상태</label>
                            <div className="flex gap-2">
                                {[
                                    { key: 'all', label: '전체', color: 'bg-gray-100 text-gray-700' },
                                    { key: 'has_code', label: '발급완료', color: 'bg-green-100 text-green-700' },
                                    { key: 'no_code', label: '미발급', color: 'bg-orange-100 text-orange-700' }
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
                            <label className="block text-sm font-medium text-gray-700 mb-2">체크인 날짜</label>
                            <div className="relative">
                                <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    type="date"
                                    value={dateFilter}
                                    onChange={(e) => setDateFilter(e.target.value)}
                                    className="w-full pl-10 pr-3 py-2 border border-gray-200 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                />
                            </div>
                            <label className="mt-2 flex items-center gap-2 text-xs text-gray-600">
                                <input
                                    type="checkbox"
                                    checked={futureOnly}
                                    onChange={(e) => setFutureOnly(e.target.checked)}
                                />
                                오늘 이후만 보기
                            </label>
                        </div>

                        {/* 검색 */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">검색</label>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="이름, 여행명, 호텔코드, 견적ID 검색"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full pl-10 pr-3 py-2 border border-gray-200 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                />
                            </div>
                        </div>
                    </div>

                    {/* 필터 초기화 */}
                    {(statusFilter !== 'all' || dateFilter || searchTerm || futureOnly) && (
                        <div className="mt-4 pt-4 border-t border-gray-200">
                            <button
                                onClick={() => {
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
                            호텔 예약 목록 ({filteredReservations.length}건)
                        </h2>
                    </div>

                    {error && (
                        <div className="p-6 bg-red-50 border-l-4 border-red-400">
                            <div className="flex items-center">
                                <AlertCircle className="w-5 h-5 text-red-400 mr-2" />
                                <p className="text-red-700">{error}</p>
                            </div>
                            <button
                                onClick={loadHotelReservations}
                                className="mt-2 text-sm text-red-600 hover:text-red-800 underline"
                            >
                                다시 시도
                            </button>
                        </div>
                    )}

                    {filteredReservations.length === 0 ? (
                        <div className="p-12 text-center text-gray-500">
                            <Hotel className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                            <p>조건에 맞는 호텔 예약이 없습니다.</p>
                        </div>
                    ) : (
                        <div className="p-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
                                {groupedByCheckin.map(group => (
                                    <React.Fragment key={`group-${group.date}`}>
                                        {/* 그룹 헤더 */}
                                        <div className="col-span-full">
                                            <div className="bg-gray-100 rounded-lg px-4 py-2 mb-4">
                                                <h3 className="text-sm font-semibold text-gray-700">
                                                    체크인 {group.date} · {group.items.length}건
                                                </h3>
                                            </div>
                                        </div>

                                        {/* 그룹 내 카드들 */}
                                        {group.items.map((reservation) => (
                                            <div key={reservation.reservation_id} className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                                                {/* 예약 정보 섹션 */}
                                                <div className="mb-3">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <User className="w-4 h-4 text-gray-400" />
                                                        <span className="text-sm font-medium text-gray-900">
                                                            {reservation.users?.name || '이름 없음'}
                                                        </span>
                                                    </div>
                                                    <div className="text-xs text-gray-500 mb-1">
                                                        {reservation.quote?.title || '제목 없음'}
                                                    </div>
                                                    {/* 견적ID는 사용자 카드에서 제거됨 */}
                                                </div>

                                                {/* 호텔 일정 섹션 */}
                                                <div className="mb-3">
                                                    <div className="text-xs text-gray-600 mb-1">
                                                        {reservation.checkin_date ? (
                                                            <>
                                                                <div className="font-medium">
                                                                    체크인: {new Date(reservation.checkin_date).toLocaleDateString('ko-KR')}
                                                                </div>
                                                                <div className="text-gray-900 font-medium mt-1">
                                                                    호텔명: {reservation.hotel_category || '호텔명 미정'}
                                                                </div>
                                                                {(reservation as any).room_name && (
                                                                    <div className="text-gray-800 font-medium">
                                                                        객실명: {(reservation as any).room_name}
                                                                    </div>
                                                                )}
                                                                <div className="text-gray-500">
                                                                    객실: {reservation.room_count || 0}개 / 투숙객: {reservation.guest_count || 0}명
                                                                </div>
                                                                {reservation.breakfast_service && (
                                                                    <div className="text-gray-500">
                                                                        조식: {reservation.breakfast_service}
                                                                    </div>
                                                                )}
                                                            </>
                                                        ) : (
                                                            <span className="text-gray-400">일정 미정</span>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* 호텔 코드 섹션 */}
                                                <div className="mb-3">
                                                    <label className="block text-xs font-medium text-gray-700 mb-1">
                                                        호텔 코드
                                                    </label>
                                                    {editingId === reservation.reservation_id ? (
                                                        <div className="flex items-center gap-2">
                                                            <input
                                                                type="text"
                                                                value={editingCode}
                                                                onChange={(e) => setEditingCode(e.target.value)}
                                                                placeholder="배정 코드 입력"
                                                                className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500"
                                                                autoFocus
                                                            />
                                                            <button
                                                                onClick={() => updateAssignmentCode(reservation.reservation_id, editingCode)}
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
                                                                {reservation.assignment_code ? (
                                                                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                                                        <CheckCircle className="w-3 h-3 mr-1" />
                                                                        {reservation.assignment_code}
                                                                    </span>
                                                                ) : (
                                                                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                                                        <AlertCircle className="w-3 h-3 mr-1" />
                                                                        미발급
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <button
                                                                onClick={() => startEditing(reservation.reservation_id, reservation.assignment_code || '')}
                                                                disabled={editingId !== null}
                                                                className="text-xs text-blue-600 hover:text-blue-900 disabled:text-gray-400"
                                                            >
                                                                {reservation.assignment_code ? '수정' : '발급'}
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
                        </div>
                    )}
                </div>
            </div>
        </ManagerLayout>
    );
};

export default HotelAssignmentCodesPage;
