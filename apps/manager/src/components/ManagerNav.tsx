'use client';
import React from 'react';
import Link from 'next/link';

interface ManagerNavProps {
    activeTab?: string;
    embedded?: boolean; // 헤더 내부 포함 여부
}

export default function ManagerNav({ activeTab, embedded = false }: ManagerNavProps) {
    const managerTabs = [
        { id: 'analytics', label: '분석 대시보드', path: '/manager/analytics', icon: '📊' },
        { id: 'quotes', label: '견적 관리', path: '/manager/quotes', icon: '📋' },
        { id: 'reservations', label: '예약 관리', path: '/manager/reservations', icon: '🎫' },
        { id: 'reservation-details', label: '예약상세', path: '/manager/reservation-details', icon: '📝' },
        { id: 'service-tables', label: '서비스별 조회', path: '/manager/service-tables', icon: '🔍' },
        { id: 'payments', label: '결제 관리', path: '/manager/payments', icon: '💳' },
        { id: 'confirmation', label: '예약확인서', path: '/manager/confirmation', icon: '📄' },
        { id: 'customer-send', label: '고객 발송 관리', path: '/customer/send-management', icon: '📧' },
        { id: 'schedule', label: '일정 관리', path: '/manager/schedule', icon: '📅' },
        { id: 'customers', label: '고객 관리', path: '/manager/customers', icon: '👥' },
        { id: 'services', label: '서비스 관리', path: '/manager/services', icon: '🛠️' },
        { id: 'pricing', label: '가격 관리', path: '/manager/pricing', icon: '💰' },
        { id: 'notifications', label: '알림 관리', path: '/manager/notifications', icon: '🔔' },
        { id: 'dashboard', label: '대시보드', path: '/manager/dashboard', icon: '🏠' },
    ];

    const containerClasses = embedded
        ? 'border-t border-b border-gray-200'
        : 'sticky top-16 z-40 shadow border-b border-gray-200';

    return (
        <nav className={`bg-white ${containerClasses}`}>
            <div className="w-full px-2">
                <div className="flex space-x-1 overflow-x-auto scrollbar-thin scrollbar-thumb-gray-300">
                    {managerTabs.map((tab) => (
                        <Link
                            key={tab.id}
                            href={tab.path}
                            className={`flex items-center space-x-1 px-2 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${activeTab === tab.id
                                    ? 'border-blue-500 text-blue-600 bg-blue-50'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                                }`}
                        >
                            <span className="text-sm">{tab.icon}</span>
                            <span>{tab.label}</span>
                        </Link>
                    ))}
                </div>
            </div>
        </nav>
    );
}
