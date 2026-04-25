"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabase';
import { Car, Ship, BarChart3, ArrowRight, Plane } from 'lucide-react';

export default function DispatchHubPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({
        sht_today: 0, cruise_today: 0, airport_today: 0, rentcar_today: 0,
        sht_total: 0, cruise_total: 0, airport_total: 0, rentcar_total: 0
    });

    const handleLogout = async () => {
        try {
            const { error } = await supabase.auth.signOut();
            if (error) {
                console.error('로그아웃 오류:', error);
                alert('로그아웃 중 오류가 발생했습니다.');
                return;
            }
            alert('로그아웃되었습니다.');
            router.push('/login');
        } catch (err) {
            console.error('로그아웃 처리 실패:', err);
            alert('로그아웃 처리에 실패했습니다.');
        }
    };

    useEffect(() => {
        (async () => {
            try {
                const today = new Date().toISOString().split('T')[0];
                const todayStart = `${today} 00:00:00`;
                const todayEnd = `${today} 23:59:59`;

                // 기존 차량 통계
                const { data: shtToday } = await supabase.from('vw_manager_sht_car_report').select('id').eq('usage_date', today);
                const { data: shtTotal } = await supabase.from('vw_manager_sht_car_report').select('id');
                const { data: cruiseToday } = await supabase.from('vw_manager_cruise_car_report').select('id').eq('usage_date', today);
                const { data: cruiseTotal } = await supabase.from('vw_manager_cruise_car_report').select('id');

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
                    sht_today: shtToday?.length || 0,
                    cruise_today: cruiseToday?.length || 0,
                    airport_today: airportToday?.length || 0,
                    rentcar_today: rentcarToday?.length || 0,
                    sht_total: shtTotal?.length || 0,
                    cruise_total: cruiseTotal?.length || 0,
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
        <div className="min-h-screen bg-gray-50">
            <div className="bg-white shadow-sm border-b">
                <div className="px-4 py-4 flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                        <BarChart3 className="w-6 h-6 text-blue-600" />
                        <h1 className="text-xl font-semibold">배차 관리 센터</h1>
                    </div>
                    <button
                        onClick={handleLogout}
                        className="px-3 py-1.5 rounded-md bg-red-500 text-white text-sm hover:bg-red-600 shadow-sm hover:shadow"
                    >
                        로그아웃
                    </button>
                </div>
            </div>

            <div className="px-4 py-6">
                <div className="grid grid-cols-1 gap-4">
                    <div className="bg-white rounded-lg p-4 shadow-sm border">
                        <h3 className="text-sm font-medium mb-3">오늘 배차 현황</h3>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                            <div className="flex items-center justify-between">
                                <span className="text-gray-600">스하차량</span>
                                <span className="font-medium">{stats.sht_today}건</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-gray-600">크루즈차량</span>
                                <span className="font-medium">{stats.cruise_today}건</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-gray-600">공항서비스</span>
                                <span className="font-medium">{stats.airport_today}건</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-gray-600">렌트카</span>
                                <span className="font-medium">{stats.rentcar_today}건</span>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-lg p-4 shadow-sm border">
                        <h3 className="text-sm font-medium mb-3">전체 배차 누적</h3>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                            <div className="flex items-center justify-between">
                                <span className="text-gray-600">스하차량</span>
                                <span className="font-medium">{stats.sht_total}건</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-gray-600">크루즈차량</span>
                                <span className="font-medium">{stats.cruise_total}건</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-gray-600">공항서비스</span>
                                <span className="font-medium">{stats.airport_total}건</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-gray-600">렌트카</span>
                                <span className="font-medium">{stats.rentcar_total}건</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="mt-6 space-y-3">
                    <button onClick={() => router.push('/dispatch/sht-car')} className="w-full bg-white rounded-lg p-4 shadow-sm border flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                            <Car className="w-5 h-5 text-orange-600" />
                            <span>스하차량 배차 보기</span>
                        </div>
                        <ArrowRight className="w-4 h-4 text-gray-400" />
                    </button>
                    <button onClick={() => router.push('/dispatch/cruise-car')} className="w-full bg-white rounded-lg p-4 shadow-sm border flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                            <Ship className="w-5 h-5 text-purple-600" />
                            <span>크루즈차량 배차 보기</span>
                        </div>
                        <ArrowRight className="w-4 h-4 text-gray-400" />
                    </button>
                    <button onClick={() => router.push('/dispatch/airport')} className="w-full bg-white rounded-lg p-4 shadow-sm border flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                            <Plane className="w-5 h-5 text-blue-600" />
                            <span>공항 서비스 배차 보기</span>
                        </div>
                        <ArrowRight className="w-4 h-4 text-gray-400" />
                    </button>
                    <button onClick={() => router.push('/dispatch/rentcar')} className="w-full bg-white rounded-lg p-4 shadow-sm border flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                            <Car className="w-5 h-5 text-green-600" />
                            <span>렌트카 서비스 배차 보기</span>
                        </div>
                        <ArrowRight className="w-4 h-4 text-gray-400" />
                    </button>
                </div>
            </div>
        </div>
    );
}