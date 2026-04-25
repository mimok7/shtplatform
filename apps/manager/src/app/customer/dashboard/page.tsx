'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabase';
import { AuthWrapper } from '@/components/AuthWrapper';
import { NOTIFICATIONS_DISABLED_MESSAGE, NOTIFICATIONS_ENABLED } from '@/lib/notificationFeature';

export default function CustomerDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [reservations, setReservations] = useState<any[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [notiLoading, setNotiLoading] = useState(false);

  useEffect(() => {
    loadCustomerData();
  }, []);

  const loadCustomerData = async () => {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        router.push('/login');
        return;
      }
      setUser(user);

      // 예약 정보 조회
      const { data: reservationData } = await supabase
        .from('reservation')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (reservationData) {
        setReservations(reservationData);
      }

      // 프로필 정보 조회
      const { data: profileData } = await supabase
        .from('customer_profile')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (profileData) {
        setProfile(profileData);
      }

      // 알림 정보 조회 (본인에게 온 것 중 완료되지 않은 것)
      if (NOTIFICATIONS_ENABLED) {
        loadNotifications(user.id);
      } else {
        setNotifications([]);
      }

    } catch (error) {
      console.error('데이터 로드 오류:', error);
    }
  };

  const loadNotifications = async (userId: string) => {
    if (!NOTIFICATIONS_ENABLED) {
      setNotifications([]);
      return;
    }

    try {
      setNotiLoading(true);
      // customer_notifications 테이블을 통해 본인에게 온 알림을 정확히 조회
      const { data, error } = await supabase
        .from('notifications')
        .select(`
          *,
          processing_note,
          processed_by_name,
          customer_notifications!inner(customer_id)
        `)
        .eq('type', 'customer')
        .eq('customer_notifications.customer_id', userId)
        .neq('status', 'completed')
        .order('created_at', { ascending: false });

      if (!error && data) {
        setNotifications(data);
      }
    } catch (error) {
      console.error('알림 로드 오류:', error);
    } finally {
      setNotiLoading(false);
    }
  };

  const confirmNotification = async (notificationId: string) => {
    if (!NOTIFICATIONS_ENABLED) {
      alert(NOTIFICATIONS_DISABLED_MESSAGE);
      return;
    }

    if (!confirm('이 알림을 확인했습니까?\n확인 완료 상태로 변경됩니다.')) return;

    try {
      // 1. notifications 테이블 업데이트
      const { error: nError } = await supabase
        .from('notifications')
        .update({
          status: 'completed',
          updated_at: new Date().toISOString()
        })
        .eq('id', notificationId);

      if (nError) throw nError;

      // 2. customer_notifications 테이블 동기화
      await supabase
        .from('customer_notifications')
        .update({
          status: 'completed',
          updated_at: new Date().toISOString(),
          processed_at: new Date().toISOString()
        })
        .eq('notification_id', notificationId);

      // 3. customer_requests 테이블 동기화 (연동된 경우)
      const { data: notiData } = await supabase
        .from('notifications')
        .select('target_table, target_id')
        .eq('id', notificationId)
        .single();

      if (notiData?.target_table === 'customer_requests' && notiData?.target_id) {
        await supabase
          .from('customer_requests')
          .update({
            status: 'completed',
            processed_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', notiData.target_id);
      }

      alert('확인되었습니다.');
      if (user) loadNotifications(user.id);
    } catch (error) {
      console.error('알림 확인 실패:', error);
      alert('확인 처리에 실패했습니다.');
    }
  };

  const getReservationStats = () => {
    const total = reservations.length;
    const confirmed = reservations.filter((r: any) => r.status === 'confirmed').length;
    const pending = reservations.filter((r: any) => r.status === 'pending').length;
    const completed = reservations.filter((r: any) => r.status === 'completed').length;

    return { total, confirmed, pending, completed };
  };

  const stats = getReservationStats();

  return (
    <AuthWrapper allowedRoles={['member', 'manager', 'admin']}>
      <div className="min-h-screen bg-gray-50">
        {/* 헤더 */}
        <div className="bg-gradient-to-br from-green-100 via-emerald-100 to-teal-100">
          <div className="container mx-auto px-4 py-8">
            <h1 className="text-3xl font-bold text-gray-800 mb-2">
              🎫 예약자 대시보드
            </h1>
            <p className="text-lg text-gray-600">
              안녕하세요, {profile?.name || user?.email}님! 예약 관리를 시작하세요.
            </p>
          </div>
        </div>

        {/* 통계 카드 */}
        <div className="container mx-auto px-4 py-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm">전체 예약</p>
                  <p className="text-2xl font-bold text-blue-500">{stats.total}</p>
                </div>
                <div className="text-3xl text-blue-400">🎫</div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm">대기 중</p>
                  <p className="text-2xl font-bold text-orange-500">{stats.pending}</p>
                </div>
                <div className="text-3xl text-orange-400">⏳</div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm">확정됨</p>
                  <p className="text-2xl font-bold text-green-500">{stats.confirmed}</p>
                </div>
                <div className="text-3xl text-green-400">✅</div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm">완료됨</p>
                  <p className="text-2xl font-bold text-purple-500">{stats.completed}</p>
                </div>
                <div className="text-3xl text-purple-400">🏁</div>
              </div>
            </div>
          </div>

          {/* 알림 섹션 */}
          {notifications.length > 0 && (
            <div className="mb-8">
              <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
                <span className="mr-2">🔔</span> 새로운 알림
                <span className="ml-2 bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                  {notifications.length}
                </span>
              </h2>
              <div className="grid grid-cols-1 gap-4">
                {notifications.map((noti) => (
                  <div key={noti.id} className="bg-white rounded-xl shadow-md border-l-4 border-blue-500 p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 animate-fadeIn">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${noti.priority === 'urgent' ? 'bg-red-100 text-red-600' :
                          noti.priority === 'high' ? 'bg-orange-100 text-orange-600' :
                            'bg-blue-100 text-blue-600'
                          }`}>
                          {noti.category || '일반'}
                        </span>
                        <span className="text-gray-400 text-xs">
                          {new Date(noti.created_at).toLocaleString('ko-KR')}
                        </span>
                      </div>
                      <h3 className="font-bold text-gray-800 text-lg mb-1">{noti.title}</h3>
                      <p className="text-gray-600 text-sm whitespace-pre-wrap mb-3">{noti.message}</p>

                      {noti.processing_note && (
                        <div className="bg-green-50 rounded-lg p-3 border border-green-100 mb-2">
                          <p className="text-xs font-bold text-green-700 mb-1 flex items-center">
                            <span className="mr-1">💬</span> 매니저 답변 ({noti.processed_by_name || '매니저'})
                          </p>
                          <p className="text-sm text-gray-700 whitespace-pre-wrap">{noti.processing_note}</p>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => confirmNotification(noti.id)}
                      className="whitespace-nowrap bg-blue-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-blue-700 transition-colors shadow-sm"
                    >
                      확인 완료
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 빠른 액션 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow cursor-pointer"
              onClick={() => router.push('/customer/reservations/new')}>
              <div className="text-center">
                <div className="text-4xl mb-4">➕</div>
                <h3 className="text-lg font-semibold text-gray-800 mb-2">새 예약</h3>
                <p className="text-gray-600 text-sm">새로운 예약을 신청하세요</p>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow cursor-pointer"
              onClick={() => router.push('/customer/reservations')}>
              <div className="text-center">
                <div className="text-4xl mb-4">📋</div>
                <h3 className="text-lg font-semibold text-gray-800 mb-2">예약 목록</h3>
                <p className="text-gray-600 text-sm">내 예약을 확인하세요</p>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow cursor-pointer"
              onClick={() => router.push('/customer/profile')}>
              <div className="text-center">
                <div className="text-4xl mb-4">👤</div>
                <h3 className="text-lg font-semibold text-gray-800 mb-2">개인정보</h3>
                <p className="text-gray-600 text-sm">개인정보를 관리하세요</p>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow cursor-pointer"
              onClick={() => router.push('/customer/payment')}>
              <div className="text-center">
                <div className="text-4xl mb-4">💳</div>
                <h3 className="text-lg font-semibold text-gray-800 mb-2">결제 관리</h3>
                <p className="text-gray-600 text-sm">결제 정보를 관리하세요</p>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow cursor-pointer"
              onClick={() => router.push('/customer/schedule')}>
              <div className="text-center">
                <div className="text-4xl mb-4">📅</div>
                <h3 className="text-lg font-semibold text-gray-800 mb-2">여행 일정</h3>
                <p className="text-gray-600 text-sm">예정된 여행을 확인하세요</p>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow cursor-pointer"
              onClick={() => router.push('/customer/support')}>
              <div className="text-center">
                <div className="text-4xl mb-4">💬</div>
                <h3 className="text-lg font-semibold text-gray-800 mb-2">고객 지동</h3>
                <p className="text-gray-600 text-sm">문의 및 지원을 받으세요</p>
              </div>
            </div>
          </div>

          {/* 최근 예약 */}
          {reservations.length > 0 && (
            <div className="mt-8">
              <h2 className="text-xl font-bold text-gray-800 mb-4">최근 예약</h2>
              <div className="bg-white rounded-xl shadow-lg p-6">
                <div className="space-y-4">
                  {reservations.slice(0, 3).map((reservation: any) => (
                    <div key={reservation.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                      <div>
                        <h4 className="font-semibold text-gray-800">{reservation.title}</h4>
                        <p className="text-sm text-gray-600">
                          예약일: {new Date(reservation.created_at).toLocaleDateString('ko-KR')}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className={`px-3 py-1 rounded-full text-sm font-medium ${reservation.status === 'confirmed' ? 'bg-green-100 text-green-700' :
                          reservation.status === 'pending' ? 'bg-orange-100 text-orange-700' :
                            'bg-gray-100 text-gray-700'
                          }`}>
                          {reservation.status === 'confirmed' ? '확정' :
                            reservation.status === 'pending' ? '대기' : reservation.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </AuthWrapper>
  );
}

