'use client';
import React from 'react';
import { useRouter, usePathname } from 'next/navigation';

interface ManagerSidebarProps {
  activeTab?: string;
  userEmail?: string;
  onLogout?: () => void;
  userRole?: string | null;
  onClose?: () => void;
}

interface NavItemProps {
  icon: string;
  label: string;
  path: string;
  isActive: boolean;
  onClick: () => void;
}

function NavItem({ icon, label, isActive, onClick }: NavItemProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center px-2 py-1.5 text-xs rounded-md transition-colors italic ${
        isActive
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

  const derivedTab = (() => {
    if (!pathname) return null;
    if (pathname.startsWith('/manager/schedule/new')) return 'schedule-new';
    if (pathname.startsWith('/manager/schedule/sheet-edit')) return 'schedule-sheet-edit';
    if (pathname.startsWith('/manager/reservations/bulk')) return 'reservations-bulk';
    if (pathname.startsWith('/manager/reservation-edit/approval')) return 'reservation-edit-approval';
    if (pathname.startsWith('/manager/reservation-edit')) return 'reservation-edit';
    if (pathname.startsWith('/manager/cafe-guide')) return 'cafe-guide';
    if (pathname.startsWith('/manager/confirmation')) return 'confirmation';
    if (pathname.startsWith('/manager/passport-management')) return 'passport-management';
    if (pathname.startsWith('/manager/sht-car')) return 'sht-car';
    if (pathname === '/manager/analytics') return 'analytics';
    if (pathname === '/manager/payment-processing') return 'payment-processing';
    if (pathname.startsWith('/manager/quotes/cruise')) return 'quotes-cruise';
    if (pathname.startsWith('/manager/quotes')) return 'quotes';
    if (pathname.startsWith('/manager/customers')) return 'customers';
    if (pathname.startsWith('/manager/quote-bulk-delete')) return 'quote-bulk-delete';
    return null;
  })();

  const isActiveTab = (key: string) => {
    if (derivedTab) return derivedTab === key;
    if (activeTab) return activeTab === key;
    return false;
  };

  const handleNavigation = (path: string) => {
    router.push(path);
    if (onClose) onClose();
  };

  return (
    <div className="h-screen w-40 bg-gray-50 border-r border-gray-200 flex flex-col">
      <div className="h-16 flex items-center justify-between px-4 border-b border-gray-200 bg-white">
        <h1 className="text-lg font-bold text-gray-800">스테이하롱</h1>
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

      <div className="flex-1 overflow-y-auto p-3">
        <div className="space-y-3">
          <div className="bg-white rounded-lg shadow-sm border border-yellow-200">
            <div className="px-3 py-2 rounded-t-lg border-b bg-yellow-50 border-yellow-200">
              <h3 className="text-sm font-semibold flex items-center text-blue-600">
                <span className="mr-2">⭐</span>
                즐겨찾기
              </h3>
            </div>
            <div className="p-2 space-y-1">
            <NavItem
              icon="🆕"
              label="신/구 구분"
              path="/manager/schedule/new"
              isActive={isActiveTab('schedule-new')}
              onClick={() => handleNavigation('/manager/schedule/new')}
            />
            <NavItem
              icon="⚡"
              label="예약 처리"
              path="/manager/reservations/bulk"
              isActive={isActiveTab('reservations-bulk')}
              onClick={() => handleNavigation('/manager/reservations/bulk')}
            />
            <NavItem
              icon="🗂️"
              label="견적 입력"
              path="/manager/quotes/cruise"
              isActive={isActiveTab('quotes-cruise')}
              onClick={() => handleNavigation('/manager/quotes/cruise')}
            />
            <NavItem
              icon="📋"
              label="견적 목록"
              path="/manager/quotes"
              isActive={isActiveTab('quotes')}
              onClick={() => handleNavigation('/manager/quotes')}
            />
            <NavItem
              icon="✏️"
              label="예약 수정"
              path="/manager/reservation-edit"
              isActive={isActiveTab('reservation-edit')}
              onClick={() => handleNavigation('/manager/reservation-edit')}
            />
            <NavItem
              icon="💳"
              label="결제 처리"
              path="/manager/payment-processing"
              isActive={isActiveTab('payment-processing')}
              onClick={() => handleNavigation('/manager/payment-processing')}
            />
            <NavItem
              icon="🚐"
              label="스하 차량"
              path="/manager/sht-car"
              isActive={isActiveTab('sht-car')}
              onClick={() => handleNavigation('/manager/sht-car')}
            />
            </div>
          </div>

          {canSeeCafeGuide && (
            <div className="bg-white rounded-lg shadow-sm border border-blue-200">
              <div className="px-3 py-2 rounded-t-lg border-b bg-blue-50 border-blue-200">
                <h3 className="text-sm font-semibold flex items-center text-blue-600">
                  <span className="mr-2">📂</span>
                  관리 기타
                </h3>
              </div>
              <div className="p-2 space-y-1">
              <NavItem
                icon="📣"
                label="카페 안내"
                path="/manager/cafe-guide"
                isActive={isActiveTab('cafe-guide')}
                onClick={() => handleNavigation('/manager/cafe-guide')}
              />
              <NavItem
                icon="🗂️"
                label="시트 수정"
                path="/manager/schedule/sheet-edit"
                isActive={isActiveTab('schedule-sheet-edit')}
                onClick={() => handleNavigation('/manager/schedule/sheet-edit')}
              />
              <NavItem
                icon="📋"
                label="고객 관리"
                path="/manager/customers"
                isActive={isActiveTab('customers')}
                onClick={() => handleNavigation('/manager/customers')}
              />
              <NavItem
                icon="🛡️"
                label="수정 승인"
                path="/manager/reservation-edit/approval"
                isActive={isActiveTab('reservation-edit-approval')}
                onClick={() => handleNavigation('/manager/reservation-edit/approval')}
              />
              <NavItem
                icon="📊"
                label="예약 통계"
                path="/manager/analytics"
                isActive={isActiveTab('analytics')}
                onClick={() => handleNavigation('/manager/analytics')}
              />
              <NavItem
                icon="📄"
                label="예약 확인서"
                path="/manager/confirmation"
                isActive={isActiveTab('confirmation')}
                onClick={() => handleNavigation('/manager/confirmation')}
              />
              <NavItem
                icon="🛂"
                label="여권 관리"
                path="/manager/passport-management"
                isActive={isActiveTab('passport-management')}
                onClick={() => handleNavigation('/manager/passport-management')}
              />
              <NavItem
                icon="📅"
                label="크차 일자"
                path="/manager/cruise-car-dates"
                isActive={isActiveTab('cruise-car-dates')}
                onClick={() => handleNavigation('/manager/cruise-car-dates')}
              />
              <NavItem
                icon="💸"
                label="추가 요금"
                path="/manager/additional-fee-management"
                isActive={isActiveTab('additional-fee-management')}
                onClick={() => handleNavigation('/manager/additional-fee-management')}
              />
              <NavItem
                icon="🗑️"
                label="예약 삭제"
                path="/manager/quote-bulk-delete"
                isActive={isActiveTab('quote-bulk-delete')}
                onClick={() => handleNavigation('/manager/quote-bulk-delete')}
              />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-gray-200 p-3 bg-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center min-w-0 flex-1">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-gray-700 truncate">{userEmail || '매니저'}</p>
              <p className="text-xs text-gray-500">매니저</p>
            </div>
          </div>
          {onLogout && (
            <button
              onClick={onLogout}
              className="ml-2 px-3 py-2 text-sm font-semibold rounded-md bg-red-100 text-red-700 hover:bg-red-200 hover:text-red-800 transition-colors border border-red-200"
              title="로그아웃"
            >
              🚪
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

