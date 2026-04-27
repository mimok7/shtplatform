'use client';

import React, { useState, useEffect } from 'react';
import ManagerLayout from '@/components/ManagerLayout';
import { Calendar, Car, FileSpreadsheet, RefreshCw, Search, X } from 'lucide-react';

interface SHCReservation {
    orderId: string;
    carType: string;
    carCode: string;
    carCount: number;
    passengerCount: number;
    pickupDatetime: string;
    pickupLocation: string;
    dropoffLocation: string;
    unitPrice: number;
    totalPrice: number;
    email: string;
}

export default function ScheduleOldPage() {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<SHCReservation[]>([]);
    const [filteredData, setFilteredData] = useState<SHCReservation[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [dateFilter, setDateFilter] = useState<'all' | 'past' | 'future'>('all');

    useEffect(() => {
        loadGoogleSheetsData();
    }, []);

    useEffect(() => {
        applyFilters();
    }, [data, searchTerm, dateFilter]);

    const loadGoogleSheetsData = async () => {
        try {
            setLoading(true);
            setError(null);

            const response = await fetch('/api/schedule/google-sheets');
            const result = await response.json();

            if (!result.success) {
                throw new Error(result.error || '데이터를 불러오는데 실패했습니다.');
            }

            setData(result.data || []);
        } catch (err: any) {
            console.error('❌ Google Sheets 데이터 로드 실패:', err);
            setError(err.message || '데이터를 불러오는 중 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };

    const applyFilters = () => {
        let filtered = [...data];

        // 검색 필터
        if (searchTerm) {
            filtered = filtered.filter(item =>
                item.orderId.toLowerCase().includes(searchTerm.toLowerCase()) ||
                item.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                item.pickupLocation.toLowerCase().includes(searchTerm.toLowerCase()) ||
                item.dropoffLocation.toLowerCase().includes(searchTerm.toLowerCase()) ||
                item.carType.toLowerCase().includes(searchTerm.toLowerCase())
            );
        }

        // 날짜 필터
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (dateFilter !== 'all') {
            filtered = filtered.filter(item => {
                const pickupDate = parseDate(item.pickupDatetime);
                if (!pickupDate) return false;

                if (dateFilter === 'past') {
                    return pickupDate < today;
                } else if (dateFilter === 'future') {
                    return pickupDate >= today;
                }
                return true;
            });
        }

        // 날짜순 정렬 (최신순)
        filtered.sort((a, b) => {
            const dateA = parseDate(a.pickupDatetime);
            const dateB = parseDate(b.pickupDatetime);
            if (!dateA || !dateB) return 0;
            return dateB.getTime() - dateA.getTime();
        });

        setFilteredData(filtered);
    };

    const parseDate = (dateStr: string): Date | null => {
        if (!dateStr) return null;

        // "YYYY. MM. DD" 형식 처리
        if (dateStr.includes('. ')) {
            const parts = dateStr.split('. ').map(p => p.trim());
            if (parts.length >= 3) {
                const [year, month, day] = parts;
                return new Date(`${year}-${month.padStart(2, '0')}-${day.split(' ')[0].padStart(2, '0')}`);
            }
        }

        // "YYYY-MM-DD" 형식
        if (dateStr.includes('-')) {
            return new Date(dateStr.split(' ')[0]);
        }

        return new Date(dateStr);
    };

    const formatDate = (dateStr: string): string => {
        const date = parseDate(dateStr);
        if (!date || isNaN(date.getTime())) return dateStr;

        return date.toLocaleDateString('ko-KR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            weekday: 'short'
        });
    };

    const formatPrice = (price: number): string => {
        return price.toLocaleString('ko-KR') + '동';
    };

    const isPastDate = (dateStr: string): boolean => {
        const date = parseDate(dateStr);
        if (!date) return false;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        return date < today;
    };

    if (loading) {
        return (
            <ManagerLayout title="예약 일정 - OLD" activeTab="schedule">
                <div className="flex justify-center items-center h-64">
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto"></div>
                        <p className="mt-4 text-gray-600">Google Sheets 데이터를 불러오는 중...</p>
                    </div>
                </div>
            </ManagerLayout>
        );
    }

    return (
        <ManagerLayout title="예약 일정 - OLD" activeTab="schedule">
            <div className="space-y-6">

                {/* 탭 네비게이션 */}
                <div className="bg-white rounded-lg shadow-md p-4">
                    <div className="flex gap-2">
                        <button
                            onClick={() => window.location.href = '/manager/schedule'}
                            className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 transition-colors"
                        >
                            현재 일정 (Supabase)
                        </button>
                        <button
                            onClick={() => window.location.href = '/manager/schedule/old'}
                            className="px-6 py-3 bg-green-500 text-white rounded-lg font-medium hover:bg-green-600 transition-colors"
                        >
                            📁 OLD (Google Sheets)
                        </button>
                    </div>
                </div>

                {/* 헤더 */}
                <div className="bg-white rounded-lg shadow-md p-6">
                    <div className="flex justify-between items-center">
                        <div>
                            <h3 className="text-lg font-semibold flex items-center gap-2">
                                <FileSpreadsheet className="w-6 h-6 text-green-600" />
                                과거 차량 예약 이력 (Google Sheets)
                            </h3>
                            <p className="text-sm text-gray-600 mt-1">
                                SH_C 시트의 원본 데이터를 실시간으로 조회합니다. (읽기 전용)
                            </p>
                        </div>
                        <button
                            onClick={loadGoogleSheetsData}
                            disabled={loading}
                            className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:bg-gray-400 transition-colors flex items-center gap-2"
                        >
                            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                            새로고침
                        </button>
                    </div>
                </div>

                {/* 에러 메시지 */}
                {error && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                        <p className="text-red-700 flex items-center gap-2">
                            <span className="font-semibold">오류:</span>
                            {error}
                        </p>
                    </div>
                )}

                {/* 통계 카드 */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                        <div className="flex items-center gap-2 mb-2">
                            <FileSpreadsheet className="w-5 h-5 text-blue-600" />
                            <span className="text-sm font-medium text-blue-800">전체 예약</span>
                        </div>
                        <div className="text-2xl font-bold text-blue-900">
                            {data.length}건
                        </div>
                        <div className="text-xs text-blue-700 mt-1">
                            총 금액: {formatPrice(data.reduce((sum, r) => sum + r.totalPrice, 0))}
                        </div>
                    </div>

                    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                        <div className="flex items-center gap-2 mb-2">
                            <Calendar className="w-5 h-5 text-gray-600" />
                            <span className="text-sm font-medium text-gray-800">지난 예약</span>
                        </div>
                        <div className="text-2xl font-bold text-gray-900">
                            {data.filter(r => isPastDate(r.pickupDatetime)).length}건
                        </div>
                        <div className="text-xs text-gray-700 mt-1">
                            이미 완료된 예약
                        </div>
                    </div>

                    <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                        <div className="flex items-center gap-2 mb-2">
                            <Calendar className="w-5 h-5 text-green-600" />
                            <span className="text-sm font-medium text-green-800">예정 예약</span>
                        </div>
                        <div className="text-2xl font-bold text-green-900">
                            {data.filter(r => !isPastDate(r.pickupDatetime)).length}건
                        </div>
                        <div className="text-xs text-green-700 mt-1">
                            아직 사용 가능
                        </div>
                    </div>
                </div>

                {/* 필터 및 검색 */}
                <div className="bg-white rounded-lg shadow-md p-6">
                    <div className="flex flex-col md:flex-row gap-4 items-end justify-between">
                        {/* 날짜 필터 */}
                        <div className="flex-1">
                            <h4 className="text-md font-semibold mb-3">기간 필터</h4>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setDateFilter('all')}
                                    className={`px-4 py-2 rounded-lg text-sm transition-colors ${dateFilter === 'all'
                                            ? 'bg-blue-500 text-white'
                                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                        }`}
                                >
                                    전체 ({data.length})
                                </button>
                                <button
                                    onClick={() => setDateFilter('past')}
                                    className={`px-4 py-2 rounded-lg text-sm transition-colors ${dateFilter === 'past'
                                            ? 'bg-gray-500 text-white'
                                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                        }`}
                                >
                                    지난 예약 ({data.filter(r => isPastDate(r.pickupDatetime)).length})
                                </button>
                                <button
                                    onClick={() => setDateFilter('future')}
                                    className={`px-4 py-2 rounded-lg text-sm transition-colors ${dateFilter === 'future'
                                            ? 'bg-green-500 text-white'
                                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                        }`}
                                >
                                    예정 예약 ({data.filter(r => !isPastDate(r.pickupDatetime)).length})
                                </button>
                            </div>
                        </div>

                        {/* 검색 */}
                        <div className="flex-1 md:max-w-md">
                            <h4 className="text-md font-semibold mb-3">검색</h4>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="주문ID, 이메일, 위치, 차량 검색..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                                />
                                {searchTerm && (
                                    <button
                                        onClick={() => setSearchTerm('')}
                                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                            {searchTerm && (
                                <p className="text-sm text-gray-500 mt-1">
                                    "{searchTerm}" 검색 결과: {filteredData.length}건
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                {/* 데이터 테이블 */}
                <div className="bg-white rounded-lg shadow-md">
                    <div className="p-6 border-b">
                        <h3 className="text-lg font-semibold flex items-center gap-2">
                            <Car className="w-6 h-6 text-blue-600" />
                            차량 예약 목록 ({filteredData.length}건)
                        </h3>
                    </div>

                    {filteredData.length === 0 ? (
                        <div className="p-8 text-center">
                            <Car className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-lg font-medium text-gray-600 mb-2">
                                {searchTerm
                                    ? `"${searchTerm}"로 검색된 예약이 없습니다`
                                    : dateFilter === 'past'
                                        ? '지난 예약이 없습니다'
                                        : dateFilter === 'future'
                                            ? '예정된 예약이 없습니다'
                                            : '예약 데이터가 없습니다'}
                            </h3>
                            {searchTerm && (
                                <button
                                    onClick={() => setSearchTerm('')}
                                    className="mt-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 text-sm"
                                >
                                    검색 초기화
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-green-800 uppercase tracking-wider">
                                            주문 ID
                                        </th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-green-800 uppercase tracking-wider">
                                            승차일시
                                        </th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-green-800 uppercase tracking-wider">
                                            차량 정보
                                        </th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-green-800 uppercase tracking-wider">
                                            위치
                                        </th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-green-800 uppercase tracking-wider">
                                            인원/차량
                                        </th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-green-800 uppercase tracking-wider">
                                            금액
                                        </th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-green-800 uppercase tracking-wider">
                                            상태
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {filteredData.map((reservation, index) => {
                                        const isPast = isPastDate(reservation.pickupDatetime);
                                        return (
                                            <tr
                                                key={`${reservation.orderId}-${index}`}
                                                className={`hover:bg-gray-50 transition-colors ${isPast ? 'bg-gray-50 opacity-60' : 'bg-white'
                                                    }`}
                                            >
                                                {/* 주문 ID */}
                                                <td className="px-4 py-3 whitespace-nowrap">
                                                    <div className="text-sm font-mono text-gray-600">
                                                        {reservation.orderId}
                                                    </div>
                                                    <div className="text-xs text-gray-400 truncate max-w-[150px]">
                                                        {reservation.email}
                                                    </div>
                                                </td>

                                                {/* 승차일시 */}
                                                <td className="px-4 py-3 whitespace-nowrap">
                                                    <div className="text-sm font-medium text-gray-900">
                                                        {formatDate(reservation.pickupDatetime)}
                                                    </div>
                                                </td>

                                                {/* 차량 정보 */}
                                                <td className="px-4 py-3">
                                                    <div className="text-sm">
                                                        <div className="font-medium text-gray-900">{reservation.carType}</div>
                                                        <div className="text-xs text-gray-500">코드: {reservation.carCode}</div>
                                                    </div>
                                                </td>

                                                {/* 위치 */}
                                                <td className="px-4 py-3">
                                                    <div className="text-sm space-y-1">
                                                        <div className="text-gray-900 truncate max-w-[200px]" title={reservation.pickupLocation}>
                                                            📍 {reservation.pickupLocation || '-'}
                                                        </div>
                                                        {reservation.dropoffLocation && (
                                                            <div className="text-gray-600 truncate max-w-[200px]" title={reservation.dropoffLocation}>
                                                                → {reservation.dropoffLocation}
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>

                                                {/* 인원/차량 */}
                                                <td className="px-4 py-3 whitespace-nowrap">
                                                    <div className="text-sm text-gray-900">
                                                        👥 {reservation.passengerCount}명
                                                    </div>
                                                    <div className="text-xs text-gray-500">
                                                        🚗 {reservation.carCount}대
                                                    </div>
                                                </td>

                                                {/* 금액 */}
                                                <td className="px-4 py-3 whitespace-nowrap">
                                                    <div className="text-sm">
                                                        <div className="font-bold text-blue-600">
                                                            {formatPrice(reservation.totalPrice)}
                                                        </div>
                                                        <div className="text-xs text-gray-500">
                                                            단가: {formatPrice(reservation.unitPrice)}
                                                        </div>
                                                    </div>
                                                </td>

                                                {/* 상태 */}
                                                <td className="px-4 py-3 whitespace-nowrap">
                                                    <span
                                                        className={`px-2 py-1 rounded-full text-xs font-medium ${isPast
                                                                ? 'bg-gray-200 text-gray-700'
                                                                : 'bg-green-100 text-green-800'
                                                            }`}
                                                    >
                                                        {isPast ? '완료' : '예정'}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>

                            {/* 테이블 푸터 */}
                            <div className="bg-gray-100 px-4 py-3 border-t border-gray-200">
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-gray-600">
                                        총 <span className="font-bold text-gray-900">{filteredData.length}</span>건
                                    </span>
                                    <span className="text-gray-600">
                                        총 금액: <span className="font-bold text-blue-600">
                                            {formatPrice(filteredData.reduce((sum, r) => sum + r.totalPrice, 0))}
                                        </span>
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* 안내 메시지 */}
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                        <FileSpreadsheet className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                        <div className="text-sm text-yellow-800">
                            <p className="font-semibold mb-1">📌 안내사항</p>
                            <ul className="list-disc list-inside space-y-1">
                                <li>이 데이터는 Google Sheets(SH_C)에서 실시간으로 조회됩니다.</li>
                                <li>읽기 전용이며 수정할 수 없습니다.</li>
                                <li>승차일시가 지난 예약은 회색으로 표시됩니다.</li>
                                <li>새로운 예약은 현재 시스템(Supabase)을 사용하세요.</li>
                            </ul>
                        </div>
                    </div>
                </div>

            </div>
        </ManagerLayout>
    );
}
