'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import supabase from '@/lib/supabase';
import ManagerLayout from '@/components/ManagerLayout';

interface EditStats {
    totalReservations: number;
    pendingEdits: number;
    approvedCount: number;
    completedToday: number;
    needsAttention: number;
}

export default function ReservationEditMainPage() {
    const router = useRouter();
    const [stats, setStats] = useState<EditStats>({
        totalReservations: 0,
        pendingEdits: 0,
        approvedCount: 0,
        completedToday: 0,
        needsAttention: 0
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadStats();
    }, []);

    // checkAuth 제거됨 - useAuth 훅 사용

    const loadStats = async () => {
        try {
            // 예약 통계 조회
            const { data: reservations, error } = await supabase
                .from('reservation')
                .select('re_id, re_status, re_created_at')
                .order('re_created_at', { ascending: false });

            if (error) throw error;

            const today = new Date().toISOString().split('T')[0];

            setStats({
                totalReservations: reservations?.length || 0,
                pendingEdits: reservations?.filter(r => r.re_status === 'pending').length || 0,
                approvedCount: reservations?.filter(r => r.re_status === 'approved').length || 0,
                completedToday: reservations?.filter(r =>
                    r.re_created_at?.split('T')[0] === today && r.re_status === 'confirmed'
                ).length || 0,
                needsAttention: reservations?.filter(r =>
                    ['cancelled', 'refund_requested'].includes(r.re_status)
                ).length || 0
            });
        } catch (error) {
            console.error('통계 로드 실패:', error);
        } finally {
            setLoading(false);
        }
    };

    const menuItems = [
        {
            title: '예약 수정 목록',
            description: '모든 예약의 상세 정보를 조회하고 수정합니다',
            href: '/manager/reservation-edit',
            icon: '✏️',
            color: 'bg-blue-500',
            stats: `${stats.totalReservations}건`
        },
        {
            title: '예약 일괄 처리',
            description: '여러 예약을 한번에 처리하고 상태를 업데이트합니다',
            href: '/manager/reservations/bulk',
            icon: '🗂️',
            color: 'bg-green-500',
            stats: `${stats.pendingEdits}건 대기`
        },
        {
            title: '예약 일정 관리',
            description: '캘린더 형태로 예약 일정을 관리합니다',
            href: '/manager/schedule',
            icon: '📅',
            color: 'bg-purple-500',
            stats: `오늘 ${stats.completedToday}건`
        },
        {
            title: '예약 확인서 발급',
            description: '고객용 예약 확인서를 생성하고 발송합니다',
            href: '/manager/confirmation',
            icon: '📄',
            color: 'bg-orange-500',
            stats: '확인서 발급'
        },
        {
            title: '예약 상세 조회',
            description: '개별 예약의 상세 정보와 히스토리를 확인합니다',
            href: '/manager/reservations',
            icon: '🔍',
            color: 'bg-teal-500',
            stats: '고객별 조회'
        },
        {
            title: '주의사항 예약',
            description: '취소/환불 요청 등 주의가 필요한 예약들을 관리합니다',
            href: '/manager/reservation-details',
            icon: '⚠️',
            color: 'bg-red-500',
            stats: `${stats.needsAttention}건 주의`
        }
    ];

    if (loading) {
        return (
            <ManagerLayout title="예약 수정 관리" activeTab="reservation-edit-main">
                <div className="flex justify-center items-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
                    <p className="ml-4 text-gray-600">로딩 중...</p>
                </div>
            </ManagerLayout>
        );
    }

    return (
        <ManagerLayout title="예약 수정 관리" activeTab="reservation-edit-main">
            <div className="space-y-6">
                {/* 통계 카드 */}
                <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                    <div className="bg-white rounded-lg shadow-sm p-6">
                        <div className="flex items-center">
                            <div className="p-2 bg-blue-100 rounded-lg">
                                <span className="text-blue-600 text-xl">📊</span>
                            </div>
                            <div className="ml-4">
                                <p className="text-sm font-medium text-gray-600">전체 예약</p>
                                <p className="text-2xl font-bold text-gray-900">{stats.totalReservations}</p>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-lg shadow-sm p-6">
                        <div className="flex items-center">
                            <div className="p-2 bg-yellow-100 rounded-lg">
                                <span className="text-yellow-600 text-xl">⏳</span>
                            </div>
                            <div className="ml-4">
                                <p className="text-sm font-medium text-gray-600">수정 대기</p>
                                <p className="text-2xl font-bold text-gray-900">{stats.pendingEdits}</p>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-lg shadow-sm p-6">
                        <div className="flex items-center">
                            <div className="p-2 bg-blue-100 rounded-lg">
                                <span className="text-blue-600 text-xl">✔️</span>
                            </div>
                            <div className="ml-4">
                                <p className="text-sm font-medium text-gray-600">승인</p>
                                <p className="text-2xl font-bold text-gray-900">{stats.approvedCount}</p>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-lg shadow-sm p-6">
                        <div className="flex items-center">
                            <div className="p-2 bg-green-100 rounded-lg">
                                <span className="text-green-600 text-xl">✅</span>
                            </div>
                            <div className="ml-4">
                                <p className="text-sm font-medium text-gray-600">오늘 완료</p>
                                <p className="text-2xl font-bold text-gray-900">{stats.completedToday}</p>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-lg shadow-sm p-6">
                        <div className="flex items-center">
                            <div className="p-2 bg-red-100 rounded-lg">
                                <span className="text-red-600 text-xl">⚠️</span>
                            </div>
                            <div className="ml-4">
                                <p className="text-sm font-medium text-gray-600">주의 필요</p>
                                <p className="text-2xl font-bold text-gray-900">{stats.needsAttention}</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 예약 수정 메뉴 그리드 */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {menuItems.map((item, index) => (
                        <Link
                            key={index}
                            href={item.href}
                            className="group bg-white rounded-lg shadow-sm hover:shadow-md transition-all duration-200 p-6 border hover:border-blue-200"
                        >
                            <div className="flex items-start space-x-4">
                                <div className={`w-12 h-12 ${item.color} rounded-lg flex items-center justify-center text-white text-xl group-hover:scale-110 transition-transform duration-200`}>
                                    {item.icon}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors duration-200">
                                        {item.title}
                                    </h3>
                                    <p className="text-sm text-gray-600 mt-1 leading-relaxed">
                                        {item.description}
                                    </p>
                                    <div className="mt-3 flex items-center justify-between">
                                        <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded-full">
                                            {item.stats}
                                        </span>
                                        <span className="text-blue-400 group-hover:text-blue-600 transition-colors duration-200">
                                            →
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>

                {/* 빠른 액션 */}
                <div className="bg-white rounded-lg shadow-sm p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">빠른 액션</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Link
                            href="/manager/reservations?status=pending"
                            className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors duration-200"
                        >
                            <div className="flex items-center space-x-3">
                                <span className="text-2xl">⏰</span>
                                <div>
                                    <p className="font-medium text-gray-900">대기 중인 예약</p>
                                    <p className="text-sm text-gray-600">즉시 처리 필요</p>
                                </div>
                            </div>
                            <span className="text-blue-600 font-semibold">{stats.pendingEdits}건</span>
                        </Link>

                        <Link
                            href="/manager/reservations?status=cancelled"
                            className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:border-red-300 hover:bg-red-50 transition-colors duration-200"
                        >
                            <div className="flex items-center space-x-3">
                                <span className="text-2xl">❌</span>
                                <div>
                                    <p className="font-medium text-gray-900">취소 요청</p>
                                    <p className="text-sm text-gray-600">환불 처리 필요</p>
                                </div>
                            </div>
                            <span className="text-red-600 font-semibold">{stats.needsAttention}건</span>
                        </Link>

                        <Link
                            href="/manager/schedule"
                            className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:border-green-300 hover:bg-green-50 transition-colors duration-200"
                        >
                            <div className="flex items-center space-x-3">
                                <span className="text-2xl">📅</span>
                                <div>
                                    <p className="font-medium text-gray-900">오늘 일정</p>
                                    <p className="text-sm text-gray-600">캘린더 보기</p>
                                </div>
                            </div>
                            <span className="text-green-600 font-semibold">일정 확인</span>
                        </Link>
                    </div>
                </div>

                {/* 최근 활동 */}
                <div className="bg-white rounded-lg shadow-sm p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">최근 수정 활동</h3>
                    <div className="space-y-3">
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <div className="flex items-center space-x-3">
                                <span className="text-green-600">✅</span>
                                <div>
                                    <p className="text-sm font-medium">크루즈 예약 확정</p>
                                    <p className="text-xs text-gray-600">5분 전</p>
                                </div>
                            </div>
                            <span className="text-xs text-gray-500">#RE001234</span>
                        </div>

                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <div className="flex items-center space-x-3">
                                <span className="text-blue-600">✏️</span>
                                <div>
                                    <p className="text-sm font-medium">호텔 예약 정보 수정</p>
                                    <p className="text-xs text-gray-600">15분 전</p>
                                </div>
                            </div>
                            <span className="text-xs text-gray-500">#RE001235</span>
                        </div>

                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <div className="flex items-center space-x-3">
                                <span className="text-red-600">❌</span>
                                <div>
                                    <p className="text-sm font-medium">공항픽업 취소 처리</p>
                                    <p className="text-xs text-gray-600">1시간 전</p>
                                </div>
                            </div>
                            <span className="text-xs text-gray-500">#RE001236</span>
                        </div>
                    </div>
                </div>
            </div>
        </ManagerLayout>
    );
}
