'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabase';
import ManagerLayout from '@/components/ManagerLayout';
import {
    BarChart3,
    TrendingUp,
    Users,
    Calendar,
    Ship,
    Plane,
    Building,
    MapPin,
    Car,
    ArrowLeft,
    RefreshCw
} from 'lucide-react';

interface AnalyticsData {
    totalReservations: number;
    totalCustomers: number;
    statusBreakdown: {
        pending: number;
        approved: number;
        confirmed: number;
        cancelled: number;
    };
    typeBreakdown: {
        [key: string]: number;
    };
    monthlyTrend: {
        month: string;
        count: number;
    }[];
    recentActivity: {
        date: string;
        count: number;
    }[];
}

export default function ReservationAnalyticsPage() {
    const router = useRouter();
    const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedPeriod, setSelectedPeriod] = useState<'7d' | '30d' | '3m' | '1y'>('30d');

    useEffect(() => {
        loadAnalytics();
    }, [selectedPeriod]);

    const loadAnalytics = async () => {
        try {
            setLoading(true);

            // 기간에 따른 날짜 계산
            const now = new Date();
            const startDate = new Date();
            switch (selectedPeriod) {
                case '7d':
                    startDate.setDate(now.getDate() - 7);
                    break;
                case '30d':
                    startDate.setDate(now.getDate() - 30);
                    break;
                case '3m':
                    startDate.setMonth(now.getMonth() - 3);
                    break;
                case '1y':
                    startDate.setFullYear(now.getFullYear() - 1);
                    break;
            }

            // 예약 데이터 조회
            const { data: reservations, error: reservationError } = await supabase
                .from('reservation')
                .select(`
          re_id,
          re_type,
          re_status,
          re_created_at,
          re_user_id
        `)
                .gte('re_created_at', startDate.toISOString());

            if (reservationError) {
                throw reservationError;
            }

            // 고유 고객 수 계산
            const uniqueCustomers = new Set(reservations?.map(r => r.re_user_id) || []).size;

            // 상태별 분류
            const statusBreakdown = {
                pending: reservations?.filter(r => r.re_status === 'pending').length || 0,
                approved: reservations?.filter(r => r.re_status === 'approved').length || 0,
                confirmed: reservations?.filter(r => r.re_status === 'confirmed').length || 0,
                cancelled: reservations?.filter(r => r.re_status === 'cancelled').length || 0,
            };

            // 타입별 분류
            const typeBreakdown: { [key: string]: number } = {};
            reservations?.forEach(r => {
                typeBreakdown[r.re_type] = (typeBreakdown[r.re_type] || 0) + 1;
            });

            // 월별 트렌드 (최근 6개월)
            const monthlyTrend: { month: string; count: number; }[] = [];
            for (let i = 5; i >= 0; i--) {
                const monthStart = new Date();
                monthStart.setMonth(monthStart.getMonth() - i);
                monthStart.setDate(1);
                monthStart.setHours(0, 0, 0, 0);

                const monthEnd = new Date(monthStart);
                monthEnd.setMonth(monthEnd.getMonth() + 1);

                const count = reservations?.filter(r => {
                    const created = new Date(r.re_created_at);
                    return created >= monthStart && created < monthEnd;
                }).length || 0;

                monthlyTrend.push({
                    month: monthStart.toLocaleDateString('ko-KR', { year: 'numeric', month: 'short' }),
                    count
                });
            }

            // 최근 7일간 활동
            const recentActivity: { date: string; count: number; }[] = [];
            for (let i = 6; i >= 0; i--) {
                const date = new Date();
                date.setDate(date.getDate() - i);
                date.setHours(0, 0, 0, 0);

                const nextDate = new Date(date);
                nextDate.setDate(nextDate.getDate() + 1);

                const count = reservations?.filter(r => {
                    const created = new Date(r.re_created_at);
                    return created >= date && created < nextDate;
                }).length || 0;

                recentActivity.push({
                    date: date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }),
                    count
                });
            }

            setAnalytics({
                totalReservations: reservations?.length || 0,
                totalCustomers: uniqueCustomers,
                statusBreakdown,
                typeBreakdown,
                monthlyTrend,
                recentActivity
            });

            setError(null);

        } catch (error) {
            console.error('분석 데이터 로드 실패:', error);
            setError('분석 데이터를 불러오는 중 오류가 발생했습니다.');

            // 테스트 데이터 설정
            setAnalytics({
                totalReservations: 42,
                totalCustomers: 28,
                statusBreakdown: {
                    pending: 15,
                    approved: 0,
                    confirmed: 22,
                    cancelled: 5
                },
                typeBreakdown: {
                    cruise: 18,
                    airport: 10,
                    hotel: 8,
                    tour: 4,
                    rentcar: 2
                },
                monthlyTrend: [
                    { month: '3월', count: 8 },
                    { month: '4월', count: 12 },
                    { month: '5월', count: 15 },
                    { month: '6월', count: 18 },
                    { month: '7월', count: 22 },
                    { month: '8월', count: 25 }
                ],
                recentActivity: [
                    { date: '8/3', count: 2 },
                    { date: '8/4', count: 1 },
                    { date: '8/5', count: 3 },
                    { date: '8/6', count: 0 },
                    { date: '8/7', count: 4 },
                    { date: '8/8', count: 2 },
                    { date: '8/9', count: 1 }
                ]
            });
        } finally {
            setLoading(false);
        }
    };

    const getTypeIcon = (type: string) => {
        switch (type) {
            case 'cruise': return <Ship className="w-5 h-5 text-blue-600" />;
            case 'airport': return <Plane className="w-5 h-5 text-green-600" />;
            case 'hotel': return <Building className="w-5 h-5 text-purple-600" />;
            case 'tour': return <MapPin className="w-5 h-5 text-orange-600" />;
            case 'rentcar': return <Car className="w-5 h-5 text-red-600" />;
            default: return null;
        }
    };

    const getTypeName = (type: string) => {
        switch (type) {
            case 'cruise': return '크루즈';
            case 'airport': return '공항';
            case 'hotel': return '호텔';
            case 'tour': return '투어';
            case 'rentcar': return '렌터카';
            default: return type;
        }
    };

    if (loading) {
        return (
            <ManagerLayout title="예약 분석" activeTab="reservations-analytics">
                <div className="flex justify-center items-center h-64">
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
                        <p className="mt-4 text-gray-600">분석 데이터를 불러오는 중...</p>
                    </div>
                </div>
            </ManagerLayout>
        );
    }

    return (
        <ManagerLayout title="예약 분석" activeTab="reservations-analytics">
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
                                <BarChart3 className="w-7 h-7 text-blue-600" />
                                예약 분석 대시보드
                            </h1>
                            <p className="text-gray-600 mt-1">예약 현황과 트렌드를 분석합니다.</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        {/* 기간 선택 */}
                        <select
                            value={selectedPeriod}
                            onChange={(e) => setSelectedPeriod(e.target.value as any)}
                            className="px-3 py-2 border border-gray-300 rounded-lg"
                        >
                            <option value="7d">최근 7일</option>
                            <option value="30d">최근 30일</option>
                            <option value="3m">최근 3개월</option>
                            <option value="1y">최근 1년</option>
                        </select>

                        <button
                            onClick={loadAnalytics}
                            className="p-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                            title="새로고침"
                        >
                            <RefreshCw className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {error && (
                    <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
                        ⚠️ {error}
                    </div>
                )}

                {analytics && (
                    <>
                        {/* 주요 지표 */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                            <div className="bg-white rounded-lg shadow-md p-6">
                                <div className="flex items-center gap-3">
                                    <div className="p-3 bg-blue-100 rounded-lg">
                                        <BarChart3 className="w-6 h-6 text-blue-600" />
                                    </div>
                                    <div>
                                        <p className="text-sm text-gray-600">총 예약</p>
                                        <p className="text-2xl font-bold text-gray-800">{analytics.totalReservations}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white rounded-lg shadow-md p-6">
                                <div className="flex items-center gap-3">
                                    <div className="p-3 bg-green-100 rounded-lg">
                                        <Users className="w-6 h-6 text-green-600" />
                                    </div>
                                    <div>
                                        <p className="text-sm text-gray-600">고객 수</p>
                                        <p className="text-2xl font-bold text-gray-800">{analytics.totalCustomers}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white rounded-lg shadow-md p-6">
                                <div className="flex items-center gap-3">
                                    <div className="p-3 bg-yellow-100 rounded-lg">
                                        <TrendingUp className="w-6 h-6 text-yellow-600" />
                                    </div>
                                    <div>
                                        <p className="text-sm text-gray-600">대기중</p>
                                        <p className="text-2xl font-bold text-gray-800">{analytics.statusBreakdown.pending}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white rounded-lg shadow-md p-6">
                                <div className="flex items-center gap-3">
                                    <div className="p-3 bg-blue-100 rounded-lg">
                                        <TrendingUp className="w-6 h-6 text-blue-600" />
                                    </div>
                                    <div>
                                        <p className="text-sm text-gray-600">승인</p>
                                        <p className="text-2xl font-bold text-gray-800">{analytics.statusBreakdown.approved}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white rounded-lg shadow-md p-6">
                                <div className="flex items-center gap-3">
                                    <div className="p-3 bg-green-100 rounded-lg">
                                        <Calendar className="w-6 h-6 text-green-600" />
                                    </div>
                                    <div>
                                        <p className="text-sm text-gray-600">확정</p>
                                        <p className="text-2xl font-bold text-gray-800">{analytics.statusBreakdown.confirmed}</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* 차트 섹션 */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                            {/* 예약 상태 분포 */}
                            <div className="bg-white rounded-lg shadow-md p-6">
                                <h3 className="text-lg font-semibold mb-4">예약 상태 분포</h3>
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className="w-4 h-4 bg-yellow-500 rounded"></div>
                                            <span>대기중</span>
                                        </div>
                                        <span className="font-medium">{analytics.statusBreakdown.pending}건</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className="w-4 h-4 bg-blue-500 rounded"></div>
                                            <span>승인</span>
                                        </div>
                                        <span className="font-medium">{analytics.statusBreakdown.approved}건</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className="w-4 h-4 bg-green-500 rounded"></div>
                                            <span>확정</span>
                                        </div>
                                        <span className="font-medium">{analytics.statusBreakdown.confirmed}건</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className="w-4 h-4 bg-red-500 rounded"></div>
                                            <span>취소</span>
                                        </div>
                                        <span className="font-medium">{analytics.statusBreakdown.cancelled}건</span>
                                    </div>
                                </div>
                            </div>

                            {/* 서비스 타입별 분포 */}
                            <div className="bg-white rounded-lg shadow-md p-6">
                                <h3 className="text-lg font-semibold mb-4">서비스 타입별 예약</h3>
                                <div className="space-y-3">
                                    {Object.entries(analytics.typeBreakdown).map(([type, count]) => (
                                        <div key={type} className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                {getTypeIcon(type)}
                                                <span>{getTypeName(type)}</span>
                                            </div>
                                            <span className="font-medium">{count}건</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* 시간별 트렌드 */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                            {/* 월별 트렌드 */}
                            <div className="bg-white rounded-lg shadow-md p-6">
                                <h3 className="text-lg font-semibold mb-4">월별 예약 트렌드</h3>
                                <div className="space-y-3">
                                    {analytics.monthlyTrend.map((item, index) => (
                                        <div key={index} className="flex items-center gap-3">
                                            <div className="w-12 text-sm text-gray-600">{item.month}</div>
                                            <div className="flex-1 bg-gray-200 rounded-full h-2">
                                                <div
                                                    className="bg-blue-500 h-2 rounded-full"
                                                    style={{
                                                        width: `${Math.max(5, (item.count / Math.max(...analytics.monthlyTrend.map(m => m.count))) * 100)}%`
                                                    }}
                                                ></div>
                                            </div>
                                            <div className="w-8 text-sm font-medium text-right">{item.count}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* 최근 7일 활동 */}
                            <div className="bg-white rounded-lg shadow-md p-6">
                                <h3 className="text-lg font-semibold mb-4">최근 7일 예약 활동</h3>
                                <div className="space-y-3">
                                    {analytics.recentActivity.map((item, index) => (
                                        <div key={index} className="flex items-center gap-3">
                                            <div className="w-8 text-sm text-gray-600">{item.date}</div>
                                            <div className="flex-1 bg-gray-200 rounded-full h-2">
                                                <div
                                                    className="bg-green-500 h-2 rounded-full"
                                                    style={{
                                                        width: `${Math.max(5, (item.count / Math.max(...analytics.recentActivity.map(a => a.count))) * 100)}%`
                                                    }}
                                                ></div>
                                            </div>
                                            <div className="w-8 text-sm font-medium text-right">{item.count}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </ManagerLayout>
    );
}
