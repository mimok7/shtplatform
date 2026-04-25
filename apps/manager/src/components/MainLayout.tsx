import React from 'react';
import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { getCurrentUserInfo, getUserDisplayName, isAdmin } from '@/lib/userUtils';
import { User } from '@supabase/supabase-js';

interface LayoutProps {
  children: React.ReactNode;
  activeTab?: string;
}

export default function MainLayout({ children, activeTab = 'home' }: LayoutProps) {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<any>(null);
  const [currentTab, setCurrentTab] = useState(activeTab);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const checkUser = async () => {
      const { user, userData } = await getCurrentUserInfo();
      setUser(user);
      setUserData(userData);
    };
    checkUser();
  }, []);

  // 경로에 따라 탭 설정
  useEffect(() => {
    if (pathname.includes('/admin')) {
      setCurrentTab('admin');
    } else if (pathname.includes('/mypage/quotes') || pathname.includes('/quote')) {
      setCurrentTab('quotes');
    } else if (pathname.includes('/mypage/reservations') || pathname.includes('/reserve')) {
      setCurrentTab('reservations');
    } else if (
      pathname.includes('/mypage') ||
      pathname.includes('/login') ||
      pathname.includes('/signup')
    ) {
      setCurrentTab('account');
    } else {
      setCurrentTab('home');
    }
  }, [pathname]);

  const tabs = [
    {
      id: 'home',
      label: '홈',
      icon: '🏠',
      path: '/',
    },
    {
      id: 'quotes',
      label: '견적 관리',
      icon: '📋',
      requireAuth: true,
      path: '/mypage/quotes',
    },
    {
      id: 'reservations',
      label: '예약 관리',
      icon: '🎫',
      requireAuth: true,
      path: '/mypage/reservations',
    },
    {
      id: 'admin',
      label: '관리자',
      icon: '⚙️',
      requireAuth: true,
      requireAdmin: true,
      path: '/admin',
    },
    {
      id: 'account',
      label: '계정',
      icon: '👤',
      path: user ? '/mypage' : '/login',
    },
  ];

  const filteredTabs = tabs.filter((tab) => {
    if (tab.requireAuth && !user) return false;
    if (tab.requireAdmin && !isAdmin(userData)) return false;
    return true;
  });

  const handleTabClick = (tab: any) => {
    if (tab.path) {
      router.push(tab.path);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header - 고정 위치 */}
      <header className="fixed top-0 left-0 right-0 bg-white shadow-md z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-10">
            <div className="text-sm font-medium text-gray-800">스테이하롱 크루즈</div>
            <div className="flex items-center space-x-3">
              {user ? (
                <>
                  <span className="text-xs text-gray-600">
                    {getUserDisplayName(user, userData)}님 환영합니다
                  </span>
                  {isAdmin(userData) && (
                    <button
                      onClick={() => router.push('/admin')}
                      className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded hover:bg-red-200 transition-colors"
                    >
                      관리자
                    </button>
                  )}
                </>
              ) : (
                <span className="text-xs text-gray-500">로그인해주세요</span>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Tab Navigation - 고정 위치 */}
      <div className="fixed top-10 left-0 right-0 bg-white border-b border-gray-200 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex overflow-x-auto">
            {filteredTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTabClick(tab)}
                className={`px-4 py-3 text-sm font-medium flex items-center space-x-2 whitespace-nowrap border-b-2 ${currentTab === tab.id
                    ? 'border-blue-500 text-blue-600 bg-blue-50'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  }`}
              >
                <span className="text-base">{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content - 상단 여백 추가 */}
      <div className="pt-24">{children}</div>
    </div>
  );
}
