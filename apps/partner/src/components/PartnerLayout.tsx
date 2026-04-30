'use client';

import React from 'react';
import PartnerSidebar from './PartnerSidebar';
import Spinner from './Spinner';
import { useAuth } from '@/hooks/useAuth';

interface Props {
    children: React.ReactNode;
    title?: string;
    requiredRoles?: string[];
}

export default function PartnerLayout({ children, title, requiredRoles }: Props) {
    const { loading, user } = useAuth(requiredRoles, '/partner/login');

    if (loading) return <Spinner label="권한 확인 중..." />;
    if (!user) return <Spinner label="로그인 페이지로 이동 중..." />;

    return (
        <div className="flex min-h-screen">
            <PartnerSidebar />
            <div className="flex-1 bg-gradient-to-br from-blue-50 to-indigo-100">
                <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                    {title && (
                        <div className="mb-4">
                            <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
                        </div>
                    )}
                    {children}
                </main>
            </div>
        </div>
    );
}
