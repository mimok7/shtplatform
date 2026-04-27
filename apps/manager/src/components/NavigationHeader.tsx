'use client';
import React from 'react';
import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import supabase from '@/lib/supabase';
import Link from 'next/link';

export function NavigationHeader() {
  const [user, setUser] = useState<any>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const checkUser = async () => {
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        setUser(data.user);
        const { data: userData } = await supabase
          .from('users')
          .select('role')
          .eq('id', data.user.id)
          .single();
        setUserRole(userData?.role);
      }
    };
    checkUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event: any, session: any) => {
      if (event === 'SIGNED_OUT') {
        setUser(null);
        setUserRole(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const navItems: Array<{ label: string; path: string; icon: string; public?: boolean; requireAuth?: boolean; requireAdmin?: boolean }> = [
    { label: '홈', path: '/', icon: '🏠', public: true },
    { label: '견적 관리', path: '/mypage/quotes', icon: '📋', requireAuth: true },
    { label: '예약 관리', path: '/mypage/reservations', icon: '🎫', requireAuth: true },
  ];

  const handleLogout = async () => {
    await supabase.auth.signOut();
    // localStorage.clear()는 Supabase 토큰까지 삭제하여 세션 파괴 → 제거
    try { sessionStorage.removeItem('app:user:role'); } catch { /* SSR */ }
    try { sessionStorage.removeItem('app:auth:cache'); } catch { /* SSR */ }
    setUser(null);
    setUserRole(null);
    router.push('/');
    router.refresh();
  };

  const filteredNavItems = navItems.filter((item) => {
    if (item.requireAuth && !user) return false;
    if (item.requireAdmin && userRole !== 'admin') return false;
    return true;
  });

  return (
    <header className="bg-white shadow-lg sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-blue-300 rounded-full flex items-center justify-center text-white text-xl font-bold">
              S
            </div>
            <h1 className="text-xl font-bold text-gray-900 hidden sm:block text-left">스테이하롱 크루즈</h1>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex space-x-8">
            {filteredNavItems.map((item) => (
              <Link
                key={item.path}
                href={item.path}
                className={`flex items-center space-x-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${pathname === item.path
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                  }`}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            ))}
          </nav>

          {/* User Menu */}
          <div className="flex items-center space-x-4">
            <div className="text-sm text-gray-600 hidden sm:block">
              {user ? (
                <span>
                  {user.email?.split('@')[0]}님
                  {userRole === 'admin' && (
                    <span className="ml-2 px-2 py-1 bg-red-100 text-red-800 text-xs rounded">
                      관리자
                    </span>
                  )}
                </span>
              ) : (
                '로그인해주세요'
              )}
            </div>

            {/* User Dropdown */}
            {user ? (
              <div className="relative">
                <button
                  onClick={() => setIsMenuOpen(!isMenuOpen)}
                  className="flex items-center space-x-1 px-3 py-2 rounded-md text-sm font-medium text-green-800 hover:text-gray-700 hover:bg-gray-100"
                >
                  <span>👤</span>
                  <span className="hidden sm:inline">계정</span>
                </button>

                {isMenuOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg py-1 z-50">
                    <Link
                      href="/mypage"
                      className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                      onClick={() => setIsMenuOpen(false)}
                    >
                      🏠 마이페이지
                    </Link>
                    <button
                      onClick={() => {
                        handleLogout();
                        setIsMenuOpen(false);
                      }}
                      className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    >
                      🚪 로그아웃
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex space-x-2">
                <Link
                  href="/login"
                  className="px-3 py-2 rounded-md text-sm font-medium text-green-800 hover:text-gray-700 hover:bg-gray-100"
                >
                  🔐 로그인
                </Link>
                <Link
                  href="/signup"
                  className="px-3 py-2 rounded-md text-sm font-medium bg-blue-600 text-white hover:bg-blue-700"
                >
                  📝 견적신청
                </Link>
              </div>
            )}

            {/* Mobile menu button */}
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="md:hidden flex items-center justify-center w-8 h-8 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <div className="md:hidden py-4 border-t border-gray-200">
            <div className="space-y-2">
              {filteredNavItems.map((item) => (
                <Link
                  key={item.path}
                  href={item.path}
                  className={`flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${pathname === item.path
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                    }`}
                  onClick={() => setIsMenuOpen(false)}
                >
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}

export default NavigationHeader;
