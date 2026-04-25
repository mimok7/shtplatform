'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabase';

export default function CustomerReservations() {
  const router = useRouter();
  const [reservations, setReservations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    loadReservations();
  }, []);

  const loadReservations = async () => {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        router.push('/login');
        return;
      }

      const { data, error } = await supabase
        .from('reservation')
        .select(`
          *,
          quote:re_quote_id (
            title,
            total_price
          ),
          packageMaster:package_id (
            name,
            package_code
          )
        `)
        .eq('re_user_id', user.id)
        .order('re_created_at', { ascending: false });

      if (error) throw error;
      setReservations(data || []);
    } catch (error) {
      console.error('예약 목록 로드 오류:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: { [key: string]: string } = {
      pending: '대기 중',
      approved: '승인',
      confirmed: '확정됨',
      cancelled: '취소됨',
      completed: '완료됨'
    };
    return labels[status] || status;
  };

  const getStatusColor = (status: string) => {
    const colors: { [key: string]: string } = {
      pending: 'bg-orange-100 text-orange-800',
      approved: 'bg-blue-100 text-blue-800',
      confirmed: 'bg-green-100 text-green-800',
      cancelled: 'bg-red-100 text-red-800',
      completed: 'bg-blue-100 text-blue-800'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const filteredReservations = reservations.filter((reservation: any) => {
    if (filter === 'all') return true;
    return reservation.re_status === filter;
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-green-500"></div>
          <p className="mt-4 text-gray-600">예약 목록을 불러오는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <div className="bg-gradient-to-br from-green-200 via-emerald-200 to-teal-100">
        <div className="container mx-auto px-4 py-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">
            🎫 내 예약 목록
          </h1>
          <p className="text-lg text-gray-600">
            예약한 여행을 확인하고 관리하세요.
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          {/* 필터 버튼 */}
          <div className="flex gap-3 mb-6">
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${filter === 'all'
                ? 'bg-blue-500 text-white'
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
            >
              전체
            </button>
            <button
              onClick={() => setFilter('pending')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${filter === 'pending'
                ? 'bg-orange-500 text-white'
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
            >
              대기 중
            </button>
            <button
              onClick={() => setFilter('confirmed')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${filter === 'confirmed'
                ? 'bg-green-500 text-white'
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
            >
              확정됨
            </button>
            <button
              onClick={() => setFilter('completed')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${filter === 'completed'
                ? 'bg-blue-500 text-white'
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
            >
              완료됨
            </button>
          </div>

          {/* 예약 목록 */}
          {filteredReservations.length === 0 ? (
            <div className="bg-white rounded-xl shadow-lg p-12 text-center">
              <div className="text-6xl mb-4">🎫</div>
              <h3 className="text-xl font-semibold text-gray-600 mb-2">
                {filter === 'all' ? '예약이 없습니다' : `${getStatusLabel(filter)} 예약이 없습니다`}
              </h3>
              <p className="text-gray-500 mb-6">새로운 예약을 신청해보세요!</p>
              <button
                onClick={() => router.push('/customer/reservations/new')}
                className="bg-green-500 text-white px-6 py-3 rounded-lg hover:bg-green-600 transition-colors"
              >
                새 예약 신청
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {filteredReservations.map((reservation: any) => (
                <div
                  key={reservation.re_id}
                  className="bg-white rounded-xl shadow-lg hover:shadow-xl transition-shadow border border-gray-200"
                >
                  <div className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <h3 className="text-xl font-bold text-gray-800">
                            {reservation.re_type === 'package'
                              ? `[패키지] ${reservation.packageMaster?.name || reservation.package_code || '패키지 여행'}`
                              : (reservation.quote?.title || '예약')}
                          </h3>
                          <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(reservation.re_status)}`}>
                            {getStatusLabel(reservation.re_status)}
                          </span>
                          {reservation.re_type === 'package' && (
                            <span className="bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full text-sm font-medium">📦 패키지</span>
                          )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-600">
                          <div>
                            <span className="font-medium">예약 번호:</span>
                            <span className="ml-2 font-mono">
                              {reservation.re_id.substring(0, 8)}...
                            </span>
                          </div>
                          <div>
                            <span className="font-medium">예약일:</span>
                            <span className="ml-2">
                              {new Date(reservation.re_created_at).toLocaleDateString('ko-KR')}
                            </span>
                          </div>
                          <div>
                            <span className="font-medium">총 금액:</span>
                            <span className="ml-2 font-bold text-green-600 text-lg">
                              {(reservation.total_amount || reservation.quote?.total_price)?.toLocaleString() || '미정'}동
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 패키지 인원 정보 */}
                    {reservation.re_type === 'package' && (
                      <div className="mb-4 p-4 bg-indigo-50 rounded-lg flex gap-4">
                        <div className="text-sm">
                          <span className="font-semibold text-indigo-700">성인:</span> {reservation.re_adult_count || 0}명
                        </div>
                        <div className="text-sm">
                          <span className="font-semibold text-indigo-700">아동:</span> {reservation.re_child_count || 0}명
                        </div>
                        {reservation.re_infant_count > 0 && (
                          <div className="text-sm">
                            <span className="font-semibold text-indigo-700">유아:</span> {reservation.re_infant_count || 0}명
                          </div>
                        )}
                      </div>
                    )}

                    {/* 예약 세부사항 */}
                    {reservation.details && (
                      <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                        <h4 className="font-medium text-gray-700 mb-2">📝 예약 세부사항</h4>
                        <p className="text-gray-600">{reservation.details}</p>
                      </div>
                    )}

                    {/* 액션 버튼 */}
                    <div className="flex flex-wrap gap-3 pt-4 border-t border-gray-200">
                      <button
                        onClick={() => router.push(`/customer/reservations/${reservation.id}`)}
                        className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors"
                      >
                        📋 상세 보기
                      </button>

                      {reservation.status === 'pending' && (
                        <button
                          onClick={() => router.push(`/customer/reservations/${reservation.id}/edit`)}
                          className="bg-amber-500 text-white px-4 py-2 rounded-lg hover:bg-amber-600 transition-colors"
                        >
                          ✏️ 수정
                        </button>
                      )}

                      {(reservation.status === 'pending' || reservation.status === 'confirmed') && (
                        <button
                          onClick={() => {
                            if (confirm('정말 예약을 취소하시겠습니까?')) {
                              // 취소 로직 구현
                            }
                          }}
                          className="bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 transition-colors"
                        >
                          ❌ 취소
                        </button>
                      )}

                      {reservation.status === 'confirmed' && (
                        <button
                          onClick={() => router.push(`/customer/schedule/${reservation.id}`)}
                          className="bg-purple-500 text-white px-4 py-2 rounded-lg hover:bg-purple-600 transition-colors"
                        >
                          📅 일정 보기
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

