'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabase';
import { Car, Ship, Calendar, BarChart3, Users, Settings, ArrowRight } from 'lucide-react';

export default function DispatchHubPage() {
    const router = useRouter();
    const [user, setUser] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({
        sht_today: 0,
        cruise_today: 0,
        sht_total: 0,
        cruise_total: 0
    });

    useEffect(() => {
        checkAuth();
    }, []);

    useEffect(() => {
        if (user) {
            loadStats();
        }
    }, [user]);

    const checkAuth = async () => {
        try {
            const { data: { user: authUser }, error } = await supabase.auth.getUser();
            if (error || !authUser) {
                router.push('/login');
                return;
            }

            const { data: profile } = await supabase
                .from('users')
                .select('role')
                .eq('id', authUser.id)
                .single();

            if (!profile || profile.role !== 'dispatcher') {
                alert('배차 담당자 권한이 필요합니다.');
                router.push('/');
                return;
            }

            setUser(authUser);
        } catch (error) {
            console.error('인증 오류:', error);
            router.push('/login');
        } finally {
            setLoading(false);
        }
    };

    const loadStats = async () => {
        const today = new Date().toISOString().split('T')[0];

        try {
            // SHT 차량 통계
            const { data: shtToday } = await supabase
                .from('vw_manager_sht_car_report')
                .select('id')
                .eq('usage_date', today);

            const { data: shtTotal } = await supabase
                .from('vw_manager_sht_car_report')
                .select('id');

            // 크루즈 차량 통계
            const { data: cruiseToday } = await supabase
                .from('vw_manager_cruise_car_report')
                .select('id')
                .eq('usage_date', today);

            const { data: cruiseTotal } = await supabase
                .from('vw_manager_cruise_car_report')
                .select('id');

            setStats({
                sht_today: shtToday?.length || 0,
                cruise_today: cruiseToday?.length || 0,
                sht_total: shtTotal?.length || 0,
                cruise_total: cruiseTotal?.length || 0
            });
        } catch (error) {
            console.error('통계 로드 오류:', error);
        }
    };

    const formatDate = () => {
        return new Date().toLocaleDateString('ko-KR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            weekday: 'long'
        });
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                    <p className="text-gray-600">로딩 중...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {/* 헤더 */}
            <div className="bg-white shadow-sm border-b">
                <div className="px-4 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                            <BarChart3 className="w-6 h-6 text-blue-600" />
                            <h1 className="text-xl font-semibold text-gray-900">배차 관리 센터</h1>
                        </div>
                        <button
                            onClick={() => router.push('/')}
                            className="text-gray-600 hover:text-gray-900"
                        >
                            <Settings className="w-5 h-5" />
                        </button>
                    </div>
                    <div className="mt-2">
                        <p className="text-sm text-gray-600">{formatDate()}</p>
                    </div>
                </div>
            </div>

            {/* 통계 카드 */}
            <div className="px-4 py-6">
                <div className="grid grid-cols-2 gap-4 mb-6">
                    {/* 오늘 배차 현황 */}
                    <div className="bg-white rounded-lg p-4 shadow-sm border">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-medium text-gray-700">오늘 배차</h3>
                            <Calendar className="w-4 h-4 text-gray-400" />
                        </div>
                        <div className="space-y-2">
                            <div className="flex justify-between items-center">
                                <span className="text-xs text-gray-600">스하차량</span>
                                <span className="text-sm font-semibold text-blue-600">{stats.sht_today}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-xs text-gray-600">크루즈차량</span>
                                <span className="text-sm font-semibold text-purple-600">{stats.cruise_today}</span>
                            </div>
                            <div className="pt-2 border-t">
                                <div className="flex justify-between items-center">
                                    <span className="text-xs font-medium text-gray-700">총 배차</span>
                                    <span className="text-lg font-bold text-gray-900">
                                        {stats.sht_today + stats.cruise_today}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 전체 배차 현황 */}
                    <div className="bg-white rounded-lg p-4 shadow-sm border">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-medium text-gray-700">전체 배차</h3>
                            <Users className="w-4 h-4 text-gray-400" />
                        </div>
                        <div className="space-y-2">
                            <div className="flex justify-between items-center">
                                <span className="text-xs text-gray-600">스하차량</span>
                                <span className="text-sm font-semibold text-blue-600">{stats.sht_total}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-xs text-gray-600">크루즈차량</span>
                                <span className="text-sm font-semibold text-purple-600">{stats.cruise_total}</span>
                            </div>
                            <div className="pt-2 border-t">
                                <div className="flex justify-between items-center">
                                    <span className="text-xs font-medium text-gray-700">총 배차</span>
                                    <span className="text-lg font-bold text-gray-900">
                                        {stats.sht_total + stats.cruise_total}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 배차 관리 메뉴 */}
                <div className="space-y-4">
                    <h2 className="text-lg font-semibold text-gray-900">배차 관리</h2>

                    <div className="space-y-3">
                        {/* 스하차량 배차 */}
                        <button
                            onClick={() => router.push('/dispatch/sht-car')}
                            className="w-full bg-white rounded-lg p-4 shadow-sm border hover:shadow-md transition-shadow"
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-4">
                                    <div className="bg-blue-100 p-3 rounded-lg">
                                        <Car className="w-6 h-6 text-blue-600" />
                                    </div>
                                    <div className="text-left">
                                        <h3 className="text-base font-medium text-gray-900">스하차량 배차</h3>
                                        <p className="text-sm text-gray-600">픽업/드랍 서비스 배차 관리</p>
                                        <div className="flex items-center space-x-4 mt-1">
                                            <span className="text-xs text-blue-600">
                                                오늘: {stats.sht_today}건
                                            </span>
                                            <span className="text-xs text-gray-500">
                                                전체: {stats.sht_total}건
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <ArrowRight className="w-5 h-5 text-gray-400" />
                            </div>
                        </button>

                        {/* 크루즈차량 배차 */}
                        <button
                            onClick={() => router.push('/dispatch/cruise-car')}
                            className="w-full bg-white rounded-lg p-4 shadow-sm border hover:shadow-md transition-shadow"
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-4">
                                    <div className="bg-purple-100 p-3 rounded-lg">
                                        <Ship className="w-6 h-6 text-purple-600" />
                                    </div>
                                    <div className="text-left">
                                        <h3 className="text-base font-medium text-gray-900">크루즈차량 배차</h3>
                                        <p className="text-sm text-gray-600">크루즈 연계 차량 배차 관리</p>
                                        <div className="flex items-center space-x-4 mt-1">
                                            <span className="text-xs text-purple-600">
                                                오늘: {stats.cruise_today}건
                                            </span>
                                            <span className="text-xs text-gray-500">
                                                전체: {stats.cruise_total}건
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <ArrowRight className="w-5 h-5 text-gray-400" />
                            </div>
                        </button>
                    </div>
                </div>

                {/* 빠른 액션 */}
                <div className="mt-8">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">빠른 액션</h2>
                    <div className="grid grid-cols-2 gap-3">
                        <button
                            onClick={() => router.push('/dispatch/sht-car')}
                            className="bg-blue-50 rounded-lg p-3 text-center border border-blue-200 hover:bg-blue-100 transition-colors"
                        >
                            <Car className="w-5 h-5 text-blue-600 mx-auto mb-1" />
                            <div className="text-xs font-medium text-blue-800">스하 오늘 배차</div>
                            <div className="text-lg font-bold text-blue-600">{stats.sht_today}</div>
                        </button>

                        <button
                            onClick={() => router.push('/dispatch/cruise-car')}
                            className="bg-purple-50 rounded-lg p-3 text-center border border-purple-200 hover:bg-purple-100 transition-colors"
                        >
                            <Ship className="w-5 h-5 text-purple-600 mx-auto mb-1" />
                            <div className="text-xs font-medium text-purple-800">크루즈 오늘 배차</div>
                            <div className="text-lg font-bold text-purple-600">{stats.cruise_today}</div>
                        </button>
                    </div>
                </div>

                {/* 안내 메시지 */}
                <div className="mt-8 bg-gray-100 rounded-lg p-4">
                    <div className="flex items-start space-x-3">
                        <div className="bg-gray-200 rounded-full p-1">
                            <BarChart3 className="w-4 h-4 text-gray-600" />
                        </div>
                        <div>
                            <h4 className="text-sm font-medium text-gray-800 mb-1">배차 관리 안내</h4>
                            <p className="text-xs text-gray-600 leading-relaxed">
                                스하차량과 크루즈차량 배차를 각각 별도 페이지에서 관리할 수 있습니다.
                                각 서비스별 특성에 맞는 전용 인터페이스를 제공합니다.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}