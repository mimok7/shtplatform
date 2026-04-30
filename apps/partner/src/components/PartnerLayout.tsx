'use client';

import React, { useState } from 'react';
import { Menu, Sparkles } from 'lucide-react';
import PartnerSidebar from './PartnerSidebar';
import BottomTabBar from './BottomTabBar';
import Spinner from './Spinner';
import { useAuth } from '@/hooks/useAuth';

interface Props {
    children: React.ReactNode;
    title?: string;
    subtitle?: string;
    requiredRoles?: string[];
    headerActions?: React.ReactNode;
}

export default function PartnerLayout({ children, title, subtitle, requiredRoles, headerActions }: Props) {
    const { loading, user, profile } = useAuth(requiredRoles, '/partner/login');
    const [sidebarOpen, setSidebarOpen] = useState(false);

    if (loading) return <Spinner label="권한 확인 중..." />;
    if (!user) return <Spinner label="로그인 페이지로 이동 중..." />;

    const role = profile?.role || 'member';

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
            <div className="flex">
                <PartnerSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

                <div className="flex-1 min-w-0 flex flex-col min-h-screen">
                    {/* 모바일 상단 헤더 */}
                    <header className="lg:hidden sticky top-0 z-20 bg-white/90 backdrop-blur-xl border-b border-gray-200">
                        <div className="flex items-center justify-between px-4 py-3">
                            <button
                                onClick={() => setSidebarOpen(true)}
                                className="p-2 -ml-2 rounded-lg hover:bg-gray-100 text-gray-700"
                                aria-label="메뉴 열기"
                            >
                                <Menu className="w-5 h-5" />
                            </button>
                            <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                                    <Sparkles className="w-4 h-4 text-white" />
                                </div>
                                <span className="text-sm font-bold text-gray-900">제휴 시스템</span>
                            </div>
                            <div className="w-9" />
                        </div>
                    </header>

                    {/* 본문 */}
                    <main className="flex-1 px-4 sm:px-6 lg:px-10 py-5 lg:py-8 pb-24 lg:pb-8 max-w-7xl w-full mx-auto">
                        {(title || headerActions) && (
                            <div className="mb-5 lg:mb-7 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
                                <div>
                                    {title && (
                                        <h1 className="text-xl lg:text-2xl font-bold text-gray-900 tracking-tight">
                                            {title}
                                        </h1>
                                    )}
                                    {subtitle && (
                                        <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
                                    )}
                                </div>
                                {headerActions && <div className="flex gap-2 flex-wrap">{headerActions}</div>}
                            </div>
                        )}
                        {children}
                    </main>
                </div>
            </div>

            <BottomTabBar role={role} />
        </div>
    );
}
