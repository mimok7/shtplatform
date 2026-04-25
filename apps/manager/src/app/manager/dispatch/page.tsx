"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabase';
import { Car, Ship, BarChart3, ArrowRight, Plane, RefreshCw } from 'lucide-react';
import ManagerLayout from '@/components/ManagerLayout';

export default function DispatchHubPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({
        sht_today: 0, cruise_today: 0, airport_today: 0, rentcar_today: 0,
        sht_total: 0, cruise_total: 0, airport_total: 0, rentcar_total: 0
    });

    useEffect(() => {
        (async () => {
            try {
                const today = new Date().toISOString().split('T')[0];
                const todayStart = `${today} 00:00:00`;
                const todayEnd = `${today} 23:59:59`;

                // 차량 통계 (뷰 의존 제거: 실제 테이블 기반 집계)
                const [
                    { count: shtTodayCount },
                    { count: shtTotalCount },
                    { count: cruiseTodayCount },
                    { count: cruiseTotalCount },
                ] = await Promise.all([
                    supabase
                        .from('reservation_car_sht')
                        .select('id', { count: 'exact', head: true })
                        .gte('pickup_datetime', todayStart)
                        .lte('pickup_datetime', todayEnd),
                    supabase
                        .from('reservation_car_sht')
                        .select('id', { count: 'exact', head: true }),
                    supabase
                        .from('reservation_cruise_car')
                        .select('id', { count: 'exact', head: true })
                        .gte('pickup_datetime', todayStart)
                        .lte('pickup_datetime', todayEnd),
                    supabase
                        .from('reservation_cruise_car')
                        .select('id', { count: 'exact', head: true }),
                ]);

                // 공항 서비스 통계
                const { data: airportToday } = await supabase
                    .from('reservation_airport')
                    .select('id')
                    .gte('ra_datetime', todayStart)
                    .lte('ra_datetime', todayEnd);
                const { data: airportTotal } = await supabase.from('reservation_airport').select('id');

                // 렌트카 서비스 통계
                const { data: rentcarToday } = await supabase
                    .from('reservation_rentcar')
                    .select('id')
                    .gte('pickup_datetime', todayStart)
                    .lte('pickup_datetime', todayEnd);
                const { data: rentcarTotal } = await supabase.from('reservation_rentcar').select('id');

                setStats({
                    sht_today: shtTodayCount || 0,
                    cruise_today: cruiseTodayCount || 0,
                    airport_today: airportToday?.length || 0,
                    rentcar_today: rentcarToday?.length || 0,
                    sht_total: shtTotalCount || 0,
                    cruise_total: cruiseTotalCount || 0,
                    airport_total: airportTotal?.length || 0,
                    rentcar_total: rentcarTotal?.length || 0
                });
            } catch (err) {
                console.error('loadStats error', err);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    if (loading) return <div className="min-h-screen flex items-center justify-center">로딩 중...</div>;

    return (
        <ManagerLayout title="배차 관리 센터" activeTab="dispatch">
            <div className="space-y-6">
                {/* 오늘 배차 현황 */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div className="bg-white rounded-lg shadow-sm border p-6">
                        <div className="flex items-center gap-3">
                            <div className="p-3 bg-orange-100 rounded-lg">
                                <Car className="w-6 h-6 text-orange-600" />
                            </div>
                            <div>
                                <p className="text-sm text-gray-600">스하차량 오늘</p>
                                <p className="text-xl font-bold text-gray-800">{stats.sht_today}건</p>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-lg shadow-sm border p-6">
                        <div className="flex items-center gap-3">
                            <div className="p-3 bg-purple-100 rounded-lg">
                                <Ship className="w-6 h-6 text-purple-600" />
                            </div>
                            <div>
                                <p className="text-sm text-gray-600">크루즈 차량 오늘</p>
                                <p className="text-xl font-bold text-gray-800">{stats.cruise_today}건</p>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-lg shadow-sm border p-6">
                        <div className="flex items-center gap-3">
                            <div className="p-3 bg-blue-100 rounded-lg">
                                <Plane className="w-6 h-6 text-blue-600" />
                            </div>
                            <div>
                                <p className="text-sm text-gray-600">공항서비스 오늘</p>
                                <p className="text-xl font-bold text-gray-800">{stats.airport_today}건</p>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-lg shadow-sm border p-6">
                        <div className="flex items-center gap-3">
                            <div className="p-3 bg-green-100 rounded-lg">
                                <Car className="w-6 h-6 text-green-600" />
                            </div>
                            <div>
                                <p className="text-sm text-gray-600">렌트카 오늘</p>
                                <p className="text-xl font-bold text-gray-800">{stats.rentcar_today}건</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 전체 배차 누적 */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div className="bg-white rounded-lg shadow-sm border p-6">
                        <div className="flex items-center gap-3">
                            <div className="p-3 bg-orange-50 rounded-lg">
                                <Car className="w-6 h-6 text-orange-500" />
                            </div>
                            <div>
                                <p className="text-sm text-gray-600">스하차량 누적</p>
                                <p className="text-xl font-bold text-gray-800">{stats.sht_total}건</p>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-lg shadow-sm border p-6">
                        <div className="flex items-center gap-3">
                            <div className="p-3 bg-purple-50 rounded-lg">
                                <Ship className="w-6 h-6 text-purple-500" />
                            </div>
                            <div>
                                <p className="text-sm text-gray-600">크루즈 차량 누적</p>
                                <p className="text-xl font-bold text-gray-800">{stats.cruise_total}건</p>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-lg shadow-sm border p-6">
                        <div className="flex items-center gap-3">
                            <div className="p-3 bg-blue-50 rounded-lg">
                                <Plane className="w-6 h-6 text-blue-500" />
                            </div>
                            <div>
                                <p className="text-sm text-gray-600">공항서비스 누적</p>
                                <p className="text-xl font-bold text-gray-800">{stats.airport_total}건</p>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-lg shadow-sm border p-6">
                        <div className="flex items-center gap-3">
                            <div className="p-3 bg-green-50 rounded-lg">
                                <Car className="w-6 h-6 text-green-500" />
                            </div>
                            <div>
                                <p className="text-sm text-gray-600">렌트카 누적</p>
                                <p className="text-xl font-bold text-gray-800">{stats.rentcar_total}건</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 배차 관리 섹션 */}
                <div className="bg-white rounded-lg shadow-sm border p-6">
                    <h3 className="text-base font-semibold mb-4">배차 관리</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <button
                            onClick={() => router.push('/manager/dispatch/sht-car')}
                            className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                            <div className="flex items-center space-x-3">
                                <div className="p-2 bg-orange-100 rounded-lg">
                                    <Car className="w-5 h-5 text-orange-600" />
                                </div>
                                <div className="text-left">
                                    <div className="font-medium text-gray-900">스하차량 배차</div>
                                    <div className="text-sm text-gray-500">스테이하롱 차량 배차 관리</div>
                                </div>
                            </div>
                            <ArrowRight className="w-5 h-5 text-gray-400" />
                        </button>

                        <button
                            onClick={() => router.push('/manager/dispatch/cruise-car')}
                            className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                            <div className="flex items-center space-x-3">
                                <div className="p-2 bg-purple-100 rounded-lg">
                                    <Ship className="w-5 h-5 text-purple-600" />
                                </div>
                                <div className="text-left">
                                    <div className="font-medium text-gray-900">크루즈 차량 배차</div>
                                    <div className="text-sm text-gray-500">크루즈 선착장 차량 배차 관리</div>
                                </div>
                            </div>
                            <ArrowRight className="w-5 h-5 text-gray-400" />
                        </button>

                        <button
                            onClick={() => router.push('/manager/dispatch/airport')}
                            className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                            <div className="flex items-center space-x-3">
                                <div className="p-2 bg-blue-100 rounded-lg">
                                    <Plane className="w-5 h-5 text-blue-600" />
                                </div>
                                <div className="text-left">
                                    <div className="font-medium text-gray-900">공항 서비스 배차</div>
                                    <div className="text-sm text-gray-500">공항 픽업/샌딩 서비스 관리</div>
                                </div>
                            </div>
                            <ArrowRight className="w-5 h-5 text-gray-400" />
                        </button>

                        <button
                            onClick={() => router.push('/manager/dispatch/rentcar')}
                            className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                            <div className="flex items-center space-x-3">
                                <div className="p-2 bg-green-100 rounded-lg">
                                    <Car className="w-5 h-5 text-green-600" />
                                </div>
                                <div className="text-left">
                                    <div className="font-medium text-gray-900">렌트카 서비스 배차</div>
                                    <div className="text-sm text-gray-500">렌터카 픽업/드랍 서비스 관리</div>
                                </div>
                            </div>
                            <ArrowRight className="w-5 h-5 text-gray-400" />
                        </button>
                    </div>
                </div>
            </div>
        </ManagerLayout>
    );
}