"use client";
import React, { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';

interface ManagerSidebarProps {
    activeTab?: string;
    userEmail?: string;
    onLogout?: () => void;
    userRole?: string;
    onClose?: () => void;
}

interface NavItemProps {
    icon: string;
    label: string;
    path: string;
    isActive: boolean;
    onClick: () => void;
}

function NavItem({ icon, label, path, isActive, onClick }: NavItemProps) {
    return (
        <button
            onClick={onClick}
            className={`w-full flex items-center px-2.5 py-2 text-xs leading-tight rounded-md transition-colors italic ${isActive
                ? 'bg-blue-100 text-blue-700 font-medium'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-700'
                }`}
        >
            <span className="mr-2">{icon}</span>
            <span className="truncate">{label}</span>
        </button>
    );
}

export default function ManagerSidebar({ activeTab, userEmail, onLogout, userRole, onClose }: ManagerSidebarProps) {
    const router = useRouter();
    const pathname = usePathname();
    const emailLower = (userEmail || '').toLowerCase();
    const canSeeCafeGuide = emailLower.startsWith('kys@') || emailLower.startsWith('kjh@');

    // pathname 우선으로 활성 탭 결정 (서브 경로 우선 매핑)
    const derivedTab = (() => {
        if (!pathname) return null;
        if (pathname.startsWith('/manager/reservations/analytics')) return 'reservations-analytics';
        if (pathname.startsWith('/manager/reservations/bulk')) return 'reservations-bulk';
        if (pathname.startsWith('/manager/cafe-guide')) return 'cafe-guide';
        if (pathname.startsWith('/manager/reservation-edit/approval')) return 'reservation-edit-approval';
        if (pathname.startsWith('/manager/reservations/package')) return 'reservations-package';
        if (pathname === '/manager/reservations') return 'reservations';
        if (pathname === '/manager/payment-processing') return 'payment-processing';
        if (pathname === '/manager/payments') return 'payments';
        if (pathname === '/manager/confirmation') return 'confirmation';
        return null;
    })();

    const isActiveTab = (key: string) => {
        if (derivedTab) return derivedTab === key;
        if (activeTab) return activeTab === key;
        return false;
    };

    // 경로에서 활성 그룹 판단
    const getGroupFromPath = (path: string): string => {
        if (path.startsWith('/manager/reservations')) return 'reservations';
        if (path.startsWith('/manager/reservation-edit')) return 'edits';
        if (path.startsWith('/manager/quotes')) return 'quotes';
        if (path.startsWith('/manager/payment')) return 'payments';
        if (path.startsWith('/manager/dispatch') || path.startsWith('/manager/boarding-code') || path.startsWith('/manager/assignment-codes') || path.startsWith('/manager/cruise-car-dates') || path.startsWith('/manager/schedule/sheet-edit')) return 'edits';
        if (path.startsWith('/manager/notifications') || path.startsWith('/manager/customers') || path.startsWith('/manager/exchange-rate') || path.startsWith('/manager/additional-fee-management') || path.startsWith('/manager/cruise-info') || path.startsWith('/manager/cruise-room')) return 'tools';
        if (path.startsWith('/manager/schedule') || path.startsWith('/manager/service-tables') || path.startsWith('/manager/reservation-details') || path.startsWith('/manager/sht-car')) return 'reservations';
        if (path.startsWith('/manager/confirmation')) return 'payments';
        if (path.startsWith('/manager/passport')) return 'edits';
        if (path.startsWith('/manager/cafe-guide')) return 'reports';
        if (path.startsWith('/manager/analytics') || path.startsWith('/manager/reports')) return 'reports';
        return 'reservations';
    };

    const handleNavigation = (path: string) => {
        router.push(path);
        // 모바일에서 메뉴 선택 후 사이드바 닫기
        if (onClose) {
            onClose();
        }
    };

    const [openGroup, setOpenGroup] = useState<string | null>(null);

    React.useEffect(() => {
        if (userRole === 'dispatcher') {
            setOpenGroup('dispatcherReports');
            return;
        }
        // 최초 1회만 현재 경로 기준으로 그룹을 열고, 이후에는 사용자가 선택한 그룹을 유지
        setOpenGroup((prev) => prev ?? getGroupFromPath(pathname));
    }, [pathname, userRole]);

    const toggleGroup = (key: string) => {
        // 같은 그룹 재클릭 시 닫지 않고 유지, 다른 그룹 선택 시에만 전환
        setOpenGroup(key);
    };

    const GroupCard = ({
        groupKey,
        title,
        icon,
        borderClass,
        headerClass,
        children,
    }: {
        groupKey: string;
        title: string;
        icon: string;
        borderClass: string;
        headerClass: string;
        children: React.ReactNode;
    }) => (
        <div className={`bg-white rounded-md shadow-sm border ${borderClass}`}>
            <button
                type="button"
                onClick={() => toggleGroup(groupKey)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-t-md border-b ${headerClass}`}
            >
                <h3 className="text-xs font-semibold flex items-center text-blue-600">
                    <span className="mr-2">{icon}</span>
                    {title}
                </h3>
                <span className="text-xs text-gray-500">{openGroup === groupKey ? '▾' : '▸'}</span>
            </button>
            {openGroup === groupKey && (
                <div className="p-2 space-y-1">
                    {children}
                </div>
            )}
        </div>
    );

    return (
        <div className="h-screen w-40 lg:w-40 bg-gray-50 border-r border-gray-200 flex flex-col">
            {/* 로고/타이틀 */}
            <div className="h-14 flex items-center justify-between px-3 border-b border-gray-200 bg-white">
                <h1 className="text-base font-bold text-gray-800 truncate">스테이하롱 매니저</h1>
                {/* 모바일 닫기 버튼 */}
                {onClose && (
                    <button
                        onClick={onClose}
                        className="lg:hidden p-1 rounded-md hover:bg-gray-100 text-gray-600"
                        aria-label="메뉴 닫기"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                )}
            </div>

            {/* 스크롤 가능한 네비게이션 */}
            <div className="flex-1 overflow-y-auto p-2">
                <div className="space-y-2">
                    {/* dispatcher 역할일 때는 리포트만 표시 */}
                    {userRole === 'dispatcher' ? (
                        <GroupCard
                            groupKey="dispatcherReports"
                            title="배차 리포트"
                            icon="📝"
                            borderClass="border-indigo-100"
                            headerClass="bg-indigo-50 border-indigo-100 text-indigo-700"
                        >
                            <NavItem
                                icon="🚐"
                                label="스하 차량"
                                path="/manager/reports/sht-car"
                                isActive={activeTab === 'reports-sht-car'}
                                onClick={() => handleNavigation('/manager/reports/sht-car')}
                            />
                            <NavItem
                                icon="🚢"
                                label="크루즈 차량"
                                path="/manager/reports/cruise-car"
                                isActive={activeTab === 'reports-cruise-car'}
                                onClick={() => handleNavigation('/manager/reports/cruise-car')}
                            />
                        </GroupCard>
                    ) : (
                        <div className="grid grid-cols-1 gap-2">
                            <GroupCard
                                groupKey="quotes"
                                title="견적 관리"
                                icon="📊"
                                borderClass="border-blue-100"
                                headerClass="bg-blue-50 border-blue-100 text-blue-700"
                            >
                                <NavItem
                                    icon="📑"
                                    label="견적 목록"
                                    path="/manager/quotes"
                                    isActive={activeTab === 'quotes'}
                                    onClick={() => handleNavigation('/manager/quotes')}
                                />
                                <NavItem
                                    icon="✍️"
                                    label="자료 입력"
                                    path="/manager/quotes/cruise"
                                    isActive={activeTab === 'quotes-cruise'}
                                    onClick={() => handleNavigation('/manager/quotes/cruise')}
                                />
                                <NavItem
                                    icon="📋"
                                    label="전체 검색"
                                    path="/manager/quotes/comprehensive"
                                    isActive={activeTab === 'quotes-comprehensive'}
                                    onClick={() => handleNavigation('/manager/quotes/comprehensive')}
                                />
                            </GroupCard>

                            <GroupCard
                                groupKey="reservations"
                                title="예약 조회"
                                icon="🔍"
                                borderClass="border-green-100"
                                headerClass="bg-green-50 border-green-100 text-green-700"
                            >
                                <NavItem
                                    icon="🆕"
                                    label="신/구 구분"
                                    path="/manager/schedule/new"
                                    isActive={activeTab === 'schedule-new'}
                                    onClick={() => handleNavigation('/manager/schedule/new')}
                                />
                                <NavItem
                                    icon="⚡"
                                    label="예약 처리"
                                    path="/manager/reservations/bulk"
                                    isActive={isActiveTab('reservations-bulk')}
                                    onClick={() => handleNavigation('/manager/reservations/bulk')}
                                />
                                {false && <NavItem
                                    icon="👤"
                                    label="고객별"
                                    path="/manager/reservations"
                                    isActive={isActiveTab('reservations')}
                                    onClick={() => handleNavigation('/manager/reservations')}
                                />}
                                {false && <NavItem
                                    icon="📅"
                                    label="일정별"
                                    path="/manager/schedule"
                                    isActive={activeTab === 'schedule'}
                                    onClick={() => handleNavigation('/manager/schedule')}
                                />}
                                {false && <NavItem
                                    icon="📊"
                                    label="종류별"
                                    path="/manager/service-tables"
                                    isActive={activeTab === 'service-tables'}
                                    onClick={() => handleNavigation('/manager/service-tables')}
                                />}
                                {false && <NavItem
                                    icon="📆"
                                    label="예약일별"
                                    path="/manager/reservation-details"
                                    isActive={activeTab === 'reservation-details'}
                                    onClick={() => handleNavigation('/manager/reservation-details')}
                                />}
                                <NavItem
                                    icon="🚐"
                                    label="스하 차량"
                                    path="/manager/sht-car"
                                    isActive={activeTab === 'sht-car'}
                                    onClick={() => handleNavigation('/manager/sht-car')}
                                />
                                <NavItem
                                    icon="📦"
                                    label="패키지"
                                    path="/manager/reservations/package"
                                    isActive={isActiveTab('reservations-package')}
                                    onClick={() => handleNavigation('/manager/reservations/package')}
                                />
                            </GroupCard>

                            <GroupCard
                                groupKey="edits"
                                title="수정 / 배정"
                                icon="✏️"
                                borderClass="border-orange-100"
                                headerClass="bg-orange-50 border-orange-100 text-orange-700"
                            >
                                <NavItem
                                    icon="✏️"
                                    label="예약 수정"
                                    path="/manager/reservation-edit"
                                    isActive={activeTab === 'reservation-edit'}
                                    onClick={() => handleNavigation('/manager/reservation-edit')}
                                />
                                <NavItem
                                    icon="�️"
                                    label="시트 수정"
                                    path="/manager/schedule/sheet-edit"
                                    isActive={activeTab === 'schedule-sheet-edit'}
                                    onClick={() => handleNavigation('/manager/schedule/sheet-edit')}
                                />
                                <NavItem
                                    icon="🛡️"
                                    label="수정 승인"
                                    path="/manager/reservation-edit/approval"
                                    isActive={isActiveTab('reservation-edit-approval')}
                                    onClick={() => handleNavigation('/manager/reservation-edit/approval')}
                                />
                                <NavItem
                                    icon="🛂"
                                    label="여권 관리"
                                    path="/manager/passport-management"
                                    isActive={activeTab === 'passport-management'}
                                    onClick={() => handleNavigation('/manager/passport-management')}
                                />
                                <NavItem
                                    icon="🚢"
                                    label="승선 코드"
                                    path="/manager/boarding-code"
                                    isActive={activeTab === 'boarding-code'}
                                    onClick={() => handleNavigation('/manager/boarding-code')}
                                />
                                <NavItem
                                    icon="🚗"
                                    label="차량 코드"
                                    path="/manager/dispatch-codes/vehicle"
                                    isActive={activeTab === 'dispatch-codes-vehicle'}
                                    onClick={() => handleNavigation('/manager/dispatch-codes/vehicle')}
                                />
                                <NavItem
                                    icon="🚐"
                                    label="차량 배차"
                                    path="/manager/dispatch"
                                    isActive={activeTab === 'dispatch'}
                                    onClick={() => handleNavigation('/manager/dispatch')}
                                />
                                <NavItem
                                    icon="✅"
                                    label="승차 확인"
                                    path="/manager/dispatch-codes/confirm"
                                    isActive={activeTab === 'dispatch-codes-confirm'}
                                    onClick={() => handleNavigation('/manager/dispatch-codes/confirm')}
                                />
                                <NavItem
                                    icon="🏨"
                                    label="호텔 코드"
                                    path="/manager/assignment-codes/hotel"
                                    isActive={activeTab === 'assignment-codes-hotel'}
                                    onClick={() => handleNavigation('/manager/assignment-codes/hotel')}
                                />
                                <NavItem
                                    icon="📅"
                                    label="크차 일자"
                                    path="/manager/cruise-car-dates"
                                    isActive={activeTab === 'cruise-car-dates'}
                                    onClick={() => handleNavigation('/manager/cruise-car-dates')}
                                />
                            </GroupCard>

                            <GroupCard
                                groupKey="payments"
                                title="결제 관련"
                                icon="💰"
                                borderClass="border-purple-100"
                                headerClass="bg-purple-50 border-purple-100 text-purple-700"
                            >
                                <NavItem
                                    icon="📝"
                                    label="결제 처리"
                                    path="/manager/payment-processing"
                                    isActive={isActiveTab('payment-processing')}
                                    onClick={() => handleNavigation('/manager/payment-processing')}
                                />
                                <NavItem
                                    icon="💳"
                                    label="현황 처리"
                                    path="/manager/payments"
                                    isActive={isActiveTab('payments')}
                                    onClick={() => handleNavigation('/manager/payments')}
                                />
                                <NavItem
                                    icon="📄"
                                    label="예약 확인서"
                                    path="/manager/confirmation"
                                    isActive={isActiveTab('confirmation')}
                                    onClick={() => handleNavigation('/manager/confirmation')}
                                />
                            </GroupCard>

                            <GroupCard
                                groupKey="reports"
                                title="리포트"
                                icon="📝"
                                borderClass="border-indigo-100"
                                headerClass="bg-indigo-50 border-indigo-100 text-indigo-700"
                            >
                                <NavItem
                                    icon="�"
                                    label="통계 조회"
                                    path="/manager/analytics"
                                    isActive={activeTab === 'analytics'}
                                    onClick={() => handleNavigation('/manager/analytics')}
                                />
                                {canSeeCafeGuide && (
                                    <NavItem
                                        icon="📣"
                                        label="카페 안내"
                                        path="/manager/cafe-guide"
                                        isActive={isActiveTab('cafe-guide')}
                                        onClick={() => handleNavigation('/manager/cafe-guide')}
                                    />
                                )}
                                <NavItem
                                    icon="🚐"
                                    label="스하 차량"
                                    path="/manager/reports/sht-car"
                                    isActive={activeTab === 'reports-sht-car'}
                                    onClick={() => handleNavigation('/manager/reports/sht-car')}
                                />
                                <NavItem
                                    icon="🚢"
                                    label="크루즈 차량"
                                    path="/manager/reports/cruise-car"
                                    isActive={activeTab === 'reports-cruise-car'}
                                    onClick={() => handleNavigation('/manager/reports/cruise-car')}
                                />
                            </GroupCard>

                            <GroupCard
                                groupKey="tools"
                                title="관리 도구"
                                icon="⚙️"
                                borderClass="border-gray-100"
                                headerClass="bg-gray-50 border-gray-100 text-gray-700"
                            >
                                <NavItem
                                    icon="🔔"
                                    label="알림 관리"
                                    path="/manager/notifications"
                                    isActive={activeTab === 'notifications'}
                                    onClick={() => handleNavigation('/manager/notifications')}
                                />
                                <NavItem
                                    icon="👥"
                                    label="고객 관리"
                                    path="/manager/customers"
                                    isActive={activeTab === 'customers'}
                                    onClick={() => handleNavigation('/manager/customers')}
                                />
                                <NavItem
                                    icon="💱"
                                    label="환율 관리"
                                    path="/manager/exchange-rate"
                                    isActive={activeTab === 'exchange-rate'}
                                    onClick={() => handleNavigation('/manager/exchange-rate')}
                                />
                                <NavItem
                                    icon="💸"
                                    label="추가 요금"
                                    path="/manager/additional-fee-management"
                                    isActive={activeTab === 'additional-fee-management'}
                                    onClick={() => handleNavigation('/manager/additional-fee-management')}
                                />
                                <NavItem
                                    icon="🚢"
                                    label="크루즈정보"
                                    path="/manager/cruise-info"
                                    isActive={activeTab === 'cruise-info'}
                                    onClick={() => handleNavigation('/manager/cruise-info')}
                                />
                                <NavItem
                                    icon="🛏️"
                                    label="크루즈룸"
                                    path="/manager/cruise-room"
                                    isActive={activeTab === 'cruise-room'}
                                    onClick={() => handleNavigation('/manager/cruise-room')}
                                />
                            </GroupCard>
                        </div>
                    )}
                </div>
            </div>

            {/* 하단 사용자 정보 */}
            <div className="border-t border-gray-200 p-2 bg-white">
                <div className="flex items-center justify-between">
                    <div className="flex items-center min-w-0 flex-1">
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-gray-700 truncate">
                                {userEmail || '매니저'}
                            </p>
                            <p className="text-xs text-gray-500">{userRole === 'dispatcher' ? '배차 담당' : '매니저'}</p>
                        </div>
                    </div>
                    {onLogout && (
                        <button
                            onClick={onLogout}
                            className="ml-2 px-2.5 py-1.5 text-sm font-semibold rounded-md bg-red-100 text-red-700 hover:bg-red-200 hover:text-red-800 transition-colors border border-red-200"
                            title="로그아웃"
                        >
                            🚪 로그아웃
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
