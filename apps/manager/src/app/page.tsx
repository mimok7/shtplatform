"use client";

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabase';

interface UserProfile {
  id: string;
  email: string;
  role: 'manager' | 'admin' | 'dispatcher';
  name?: string;
}

export default function HomePage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const { data: { user: authUser }, error } = await supabase.auth.getUser();

      if (error || !authUser) {
        console.log('❌ 로그인되지 않은 상태');
        setUser(null);
        setLoading(false);
        return;
      }

      console.log('✅ 인증된 사용자:', authUser.email);

      // 사용자 테이블에서 권한 확인
      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('id, email, role, name')
        .eq('id', authUser.id)
        .single();

      let userRole = 'manager'; // 기본값: 매니저

      if (profile && profile.role) {
        // users 테이블에 등록되고 role이 있는 경우
        userRole = profile.role;
        console.log('✅ 등록된 사용자 권한:', userRole);
      } else {
        // users 테이블에 없거나 role이 없는 경우 = 기본 매니저 권한 부여
        console.log('⚠️ users 테이블 미등록 - 기본 매니저 권한 부여');
      }

      // 관리자 권한이 아니면 접근 불가
      if (!['admin', 'manager', 'dispatcher'].includes(userRole)) {
        console.log('❌ 관리자 권한 없음 - 로그인 페이지로 이동');
        alert('접근 권한이 없습니다. 관리자 계정이 필요합니다.');
        await supabase.auth.signOut();
        router.push('/login');
        return;
      }

      const userProfile: UserProfile = {
        id: authUser.id,
        email: authUser.email || '',
        role: userRole as 'manager' | 'admin' | 'dispatcher',
        name: profile?.name || authUser.email?.split('@')[0] || '사용자'
      };

      setUser(userProfile);

      // 권한별 자동 리다이렉트
      console.log('🔄 권한별 리다이렉트 시작...');
      if (userRole === 'admin') {
        console.log('🔧 관리자 계정 - 매니저 페이지로 리다이렉트 (관리자 시스템 분리됨)');
        // alert('관리자용 시스템이 분리되었습니다. 매니저 화면으로 이동합니다.');
        router.push('/manager/schedule/new');
        return;
      } else if (userRole === 'manager') {
        console.log('📊 매니저 계정 - 매니저 페이지로 리다이렉트');
        router.push('/manager/schedule/new');
        return;
      } else if (userRole === 'dispatcher') {
        console.log('🚐 배차 담당자 계정 - 배차 관리 페이지로 리다이렉트');
        router.push('/dispatch');
        return;
      }

    } catch (error) {
      console.error('🚨 인증 확인 중 오류:', error);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = () => {
    router.push('/login');
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    router.push('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">로딩 중...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full space-y-8">
          <div className="text-center">
            <div className="flex justify-center mb-4">
              <Image src="/logo-full.png" alt="스테이하롱 전체 로고" width={320} height={80} loading="eager" style={{ width: "auto", height: "auto" }} unoptimized />
            </div>
            <h2 className="mt-2 text-center text-2xl font-extrabold text-gray-900">
              스테이하롱 크루즈 관리자 시스템
            </h2>
            <p className="mt-2 text-center text-sm text-gray-600">
              견적 승인 및 예약 관리 시스템
            </p>
          </div>
          <div className="mt-8 space-y-6">
            <div className="flex flex-col space-y-4">
              <button
                onClick={handleLogin}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-300 hover:bg-blue-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-300"
              >
                관리자 로그인
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 사용자가 로그인되어 있으면 권한에 따라 자동 리다이렉트됨
  // 이 부분은 실행되지 않지만 안전장치로 유지
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-4">환영합니다, {user.name}님!</h1>
        <p className="text-gray-600 mb-4">권한: {user.role}</p>
        <div className="space-x-4">
          {user.role === 'admin' && (
            <button
              onClick={() => {
                alert('관리자 전용 시스템은 별도로 분리되었습니다.');
                router.push('/manager/schedule/new');
              }}
              className="px-4 py-2 bg-red-300 text-white rounded hover:bg-red-400"
            >
              매니저 화면으로 이동 (관리자)
            </button>
          )}
          {user.role === 'manager' && (
            <button
              onClick={() => router.push('/manager/schedule/new')}
              className="px-4 py-2 bg-green-300 text-white rounded hover:bg-green-400"
            >
              매니저 페이지
            </button>
          )}
          {user.role === 'dispatcher' && (
            <button
              onClick={() => router.push('/dispatch')}
              className="px-4 py-2 bg-orange-300 text-white rounded hover:bg-orange-400"
            >
              배차 관리
            </button>
          )}
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-gray-300 text-white rounded hover:bg-gray-400"
          >
            로그아웃
          </button>
        </div>
      </div>
    </div>
  );
}
