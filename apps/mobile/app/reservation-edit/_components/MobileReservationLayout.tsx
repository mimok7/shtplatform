'use client';
import React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

/**
 * 모바일 예약 수정 공통 레이아웃
 * - manager1의 ManagerLayout(사이드바)을 헤더만 있는 모바일 셸로 대체
 * - 기능은 동일, UI만 모바일 최적화 (text-xs, max-w-screen-md)
 *
 * manager1 호환 시그니처: <ManagerLayout title="..." activeTab="..."> ... </ManagerLayout>
 */
export default function MobileReservationLayout({
    title,
    children,
    activeTab,
}: {
    title?: string;
    children: React.ReactNode;
    activeTab?: string;
}) {
    return (
        <div className="min-h-screen bg-slate-50 pb-20 overflow-x-hidden text-xs">
            <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200">
                <div className="mx-auto flex items-center justify-between px-2 py-2">
                    <Link href="/reservation-edit" className="flex items-center gap-1 text-slate-600 active:text-slate-900">
                        <ArrowLeft className="w-5 h-5" />
                        <span className="text-xs">목록</span>
                    </Link>
                    <h1 className="text-xs font-semibold text-slate-800 truncate max-w-[60%]">
                        {title || '예약 수정'}
                    </h1>
                    <Link href="/" className="text-xs text-blue-600 active:text-blue-800">홈</Link>
                </div>
            </header>
            <div className="w-full min-w-0 px-1 py-2 overflow-x-hidden">
                {children}
            </div>
        </div>
    );
}
