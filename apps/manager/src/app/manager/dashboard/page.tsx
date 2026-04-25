'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabase';
import DatabaseStatusWidget from '@/components/DatabaseStatusWidget';
import ManagerLayout from '@/components/ManagerLayout';

export default function ManagerDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [stats, setStats] = useState({
    quotes: { total: 0, pending: 0, approved: 0, rejected: 0, confirmed: 0 },
    reservations: { total: 0, confirmed: 0, pending: 0, completed: 0 },
    customers: { total: 0, active: 0, new: 0 },
    revenue: { total: 0, thisMonth: 0, lastMonth: 0 },
    recentActivity: [] as any[]
  });

  useEffect(() => {
    // AuthWrapper가 이미 권한 확인을 수행하므로 여기서는 통계만 로드
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      await loadManagerStats();
    })();
  }, []);

  const loadManagerStats = async () => {
    try {
      console.log('📊 실제 데이터베이스에서 매니저 통계 로딩 시작...');

      // 🔥 실제 데이터를 우선적으로 가져오기
      const { data: quotes, error: quotesError } = await supabase
        .from('quote')
        .select('id, status, total_price, created_at, updated_at');

      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('id, created_at, role')
        .in('role', ['member', 'guest']);

      console.log('🔍 실제 데이터 조회 결과:');
      console.log('📋 견적 데이터:', { count: quotes?.length || 0, error: quotesError?.message });
      console.log('👥 사용자 데이터:', { count: users?.length || 0, error: usersError?.message });

      if (quotesError) {
        console.error('❌ 견적 데이터 조회 실패:', quotesError);
      }
      if (usersError) {
        console.error('❌ 사용자 데이터 조회 실패:', usersError);
      }

      // 실제 데이터가 있으면 실제 통계 계산
      if (quotes && quotes.length >= 0) { // 0건이어도 실제 데이터로 처리
        console.log('✅ 실제 견적 데이터로 통계 계산:', quotes.length, '건');

        const quoteStats = {
          total: quotes.length,
          pending: quotes.filter(q => q.status === 'pending' || q.status === 'submitted').length,
          approved: quotes.filter(q => q.status === 'approved').length,
          rejected: quotes.filter(q => q.status === 'rejected').length,
          confirmed: quotes.filter(q => q.status === 'confirmed').length
        };

        const now = new Date();
        const thisMonth = now.getMonth();
        const thisYear = now.getFullYear();
        const lastMonth = thisMonth === 0 ? 11 : thisMonth - 1;
        const lastMonthYear = thisMonth === 0 ? thisYear - 1 : thisYear;

        const revenue = {
          total: quotes
            .filter(q => q.status === 'approved' || q.status === 'confirmed')
            .reduce((sum, q) => sum + (q.total_price || 0), 0),
          thisMonth: quotes
            .filter(q => {
              const date = new Date(q.created_at);
              return date.getMonth() === thisMonth &&
                date.getFullYear() === thisYear &&
                (q.status === 'approved' || q.status === 'confirmed');
            })
            .reduce((sum, q) => sum + (q.total_price || 0), 0),
          lastMonth: quotes
            .filter(q => {
              const date = new Date(q.created_at);
              return date.getMonth() === lastMonth &&
                date.getFullYear() === lastMonthYear &&
                (q.status === 'approved' || q.status === 'confirmed');
            })
            .reduce((sum, q) => sum + (q.total_price || 0), 0)
        };

        const customerStats = {
          total: users?.length || 0,
          active: users?.filter(u => u.role === 'member').length || 0,
          new: users?.filter(u => {
            const date = new Date(u.created_at);
            return date.getMonth() === thisMonth && date.getFullYear() === thisYear;
          }).length || 0
        };

        // 예약 통계 (confirmed 상태의 견적을 예약으로 처리)
        const reservationStats = {
          total: quotes.filter(q => q.status === 'confirmed' || q.status === 'completed').length,
          confirmed: quotes.filter(q => q.status === 'confirmed').length,
          pending: quotes.filter(q => q.status === 'approved').length, // 승인된 것 중 예약 대기
          completed: quotes.filter(q => q.status === 'completed').length
        };

        setStats({
          quotes: quoteStats,
          revenue,
          customers: customerStats,
          reservations: reservationStats,
          recentActivity: quotes
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .slice(0, 5)
            .map(q => ({
              type: '견적',
              description: `견적 ${q.status} 처리 - ${(q.total_price || 0).toLocaleString()}동`,
              time: q.created_at,
              status: q.status
            }))
        });

        console.log('✅ 실제 데이터로 대시보드 통계 설정 완료:');
        console.log('📊 견적 통계:', quoteStats);
        console.log('💰 수익 통계:', revenue);
        console.log('👥 고객 통계:', customerStats);
        console.log('🎫 예약 통계:', reservationStats);

      } else {
        console.log('📭 견적 데이터가 없음 - 실제 0건 표시');
        setStats({
          quotes: { total: 0, pending: 0, approved: 0, rejected: 0, confirmed: 0 },
          revenue: { total: 0, thisMonth: 0, lastMonth: 0 },
          customers: { total: users?.length || 0, active: 0, new: 0 },
          reservations: { total: 0, confirmed: 0, pending: 0, completed: 0 },
          recentActivity: []
        });
      }

    } catch (error) {
      console.error('❌ 매니저 통계 로드 완전 실패:', error);
      console.log('🔧 최소한의 빈 데이터로 설정');

      setStats({
        quotes: { total: 0, pending: 0, approved: 0, rejected: 0, confirmed: 0 },
        revenue: { total: 0, thisMonth: 0, lastMonth: 0 },
        customers: { total: 0, active: 0, new: 0 },
        reservations: { total: 0, confirmed: 0, pending: 0, completed: 0 },
        recentActivity: []
      });
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
          <p className="mt-4 text-gray-600">권한을 확인하는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <ManagerLayout title="📊 매니저 대시보드" activeTab="dashboard">

      {/* 통계 카드 */}
      <div className="container mx-auto px-4 py-8">
        {/* 매니저 메뉴 - 제일 위로 이동 */}
        <div className="mb-8">
          <h2 className="text-xl font-bold text-gray-800 mb-4">🛠️ 관리 메뉴</h2>
          <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <button
              onClick={() => router.push('/manager/quotes')}
              className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm">견적 관리</p>
                  <p className="text-lg font-bold text-blue-600">견적 승인</p>
                </div>
                <div className="text-3xl text-blue-400">📋</div>
              </div>
            </button>

            <button
              onClick={() => router.push('/manager/reservations')}
              className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm">예약 관리</p>
                  <p className="text-lg font-bold text-purple-600">예약 처리</p>
                </div>
                <div className="text-3xl text-purple-400">🎫</div>
              </div>
            </button>

            <button
              onClick={() => router.push('/manager/customers')}
              className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm">고객 관리</p>
                  <p className="text-lg font-bold text-green-600">고객 정보</p>
                </div>
                <div className="text-3xl text-green-400">👥</div>
              </div>
            </button>

            <button
              onClick={() => router.push('/manager/analytics')}
              className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm">분석 리포트</p>
                  <p className="text-lg font-bold text-orange-600">통계 분석</p>
                </div>
                <div className="text-3xl text-orange-400">📊</div>
              </div>
            </button>

            {/* 환율 관리는 관리자 전용으로 분리되어 대시보드 메뉴에서 제거됨 */}
          </div>
        </div>

        {/* 수익 통계 */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">💰 수익 통계</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <p className="text-gray-600 text-sm">총 수익</p>
              <p className="text-2xl font-bold text-green-600">
                {(stats.revenue?.total ?? 0).toLocaleString()}동
              </p>
            </div>
            <div className="text-center">
              <p className="text-gray-600 text-sm">이번 달</p>
              <p className="text-2xl font-bold text-blue-600">
                {(stats.revenue?.thisMonth ?? 0).toLocaleString()}동
              </p>
            </div>
            <div className="text-center">
              <p className="text-gray-600 text-sm">지난 달</p>
              <p className="text-2xl font-bold text-gray-600">
                {(stats.revenue?.lastMonth ?? 0).toLocaleString()}동
              </p>
            </div>
          </div>
        </div>

        {/* 견적 통계 */}
        <div className="mb-8">
          <h2 className="text-xl font-bold text-gray-800 mb-4">📋 견적 통계</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm">전체 견적</p>
                  <p className="text-2xl font-bold text-blue-500">{stats.quotes.total}</p>
                </div>
                <div className="text-3xl text-blue-400">📋</div>
              </div>
            </div>
            {/* ...existing code... */}
          </div>
        </div>

        {/* 예약 통계 */}
        <div className="mb-8">
          <h2 className="text-xl font-bold text-gray-800 mb-4">🎫 예약 통계</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm">전체 예약</p>
                  <p className="text-2xl font-bold text-purple-500">{stats.reservations?.total ?? 0}</p>
                </div>
                <div className="text-3xl text-purple-400">🎫</div>
              </div>
            </div>
            {/* ...existing code... */}
          </div>
        </div>

        {/* 데이터베이스 상태 위젯 - 제일 아래로 이동 */}
        <DatabaseStatusWidget />
      </div>
    </ManagerLayout>
  );
}

