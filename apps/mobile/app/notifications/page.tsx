// @ts-nocheck
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabase';
import ManagerLayout from '@/components/ManagerLayout';
import { Bell, RefreshCw, CheckCheck, AlertTriangle } from 'lucide-react';

type NotificationItem = {
  id: string;
  type: string;
  category: string;
  title: string;
  message: string;
  priority: string;
  status: string;
  target_table?: string;
  target_id?: string;
  metadata?: any;
  created_at: string;
  table_info: 'notifications' | 'payment_notifications';
};

const getPriorityColor = (priority: string) => {
  switch (priority) {
    case 'urgent':
    case '긴급': return 'bg-red-100 text-red-700 border-red-200';
    case 'high':
    case '높음': return 'bg-orange-100 text-orange-700 border-orange-200';
    case 'normal':
    case '보통': return 'bg-blue-100 text-blue-700 border-blue-200';
    default: return 'bg-gray-100 text-gray-600 border-gray-200';
  }
};

const getPriorityLabel = (priority: string) => {
  const map: Record<string, string> = {
    urgent: '긴급', high: '높음', normal: '보통', low: '낮음',
    긴급: '긴급', 높음: '높음', 보통: '보통', 낮음: '낮음',
  };
  return map[priority] || priority;
};

const getCategoryBadge = (category: string) => {
  if (!category) return '';
  if (category.includes('견적')) return 'bg-purple-100 text-purple-700';
  if (category.includes('예약')) return 'bg-green-100 text-green-700';
  if (category.includes('결제')) return 'bg-yellow-100 text-yellow-700';
  if (category.includes('고객')) return 'bg-cyan-100 text-cyan-700';
  return 'bg-gray-100 text-gray-600';
};

const formatRelativeTime = (dateStr: string) => {
  const now = new Date();
  const d = new Date(dateStr);
  const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (diffMin < 1) return '방금 전';
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}시간 전`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}일 전`;
  return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
};

export default function MobileNotificationsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const [hideOld, setHideOld] = useState(true); // 오늘 이전 알림 숨기기

  const loadUnread = useCallback(async () => {
    try {
      // 1. notifications 테이블 (unread)
      const { data: notiData } = await supabase
        .from('notifications')
        .select('id, type, category, title, message, priority, status, target_table, target_id, metadata, created_at')
        .eq('status', 'unread')
        .order('created_at', { ascending: false })
        .limit(200);

      // 2. payment_notifications 테이블 (미발송)
      const { data: payData } = await supabase
        .from('payment_notifications')
        .select('id, notification_type, message_content, priority, is_sent, reservation_id, notification_date, created_at')
        .eq('is_sent', false)
        .order('notification_date', { ascending: false })
        .limit(100);

      const notiItems: NotificationItem[] = (notiData || []).map((n) => ({
        id: n.id,
        type: n.type || 'business',
        category: n.category || '',
        title: n.title || '(제목 없음)',
        message: n.message || '',
        priority: n.priority || 'normal',
        status: n.status,
        target_table: n.target_table,
        target_id: n.target_id,
        metadata: n.metadata,
        created_at: n.created_at,
        table_info: 'notifications',
      }));

      const payItems: NotificationItem[] = (payData || []).map((p) => ({
        id: p.id,
        type: 'business',
        category: '결제',
        title: p.notification_type === 'payment_due'
          ? '결제 예정 알림'
          : p.notification_type === 'payment_overdue'
            ? '결제 연체 알림'
            : p.notification_type || '결제 알림',
        message: p.message_content || '',
        priority: p.priority || 'normal',
        status: 'unread',
        target_table: 'reservation',
        target_id: p.reservation_id ? String(p.reservation_id) : undefined,
        metadata: { reservation_id: p.reservation_id },
        created_at: p.created_at || p.notification_date || new Date().toISOString(),
        table_info: 'payment_notifications',
      }));

      const all = [...notiItems, ...payItems].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setNotifications(all);
    } catch (err) {
      console.error('알림 로드 실패:', err);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      try {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (cancelled) return;
        if (error || !user) {
          router.replace('/login');
          return;
        }
        await loadUnread();
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    init();
    return () => { cancelled = true; };
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadUnread();
    setRefreshing(false);
  };

  const markAsRead = async (item: NotificationItem) => {
    if (markingId === item.id) return;
    setMarkingId(item.id);
    try {
      if (item.table_info === 'notifications') {
        await supabase
          .from('notifications')
          .update({ status: 'read', updated_at: new Date().toISOString() })
          .eq('id', item.id);
      } else {
        await supabase
          .from('payment_notifications')
          .update({ is_sent: true, sent_at: new Date().toISOString() })
          .eq('id', item.id);
      }
      setNotifications((prev) => prev.filter((n) => n.id !== item.id));
    } catch (err) {
      console.error('읽음 처리 실패:', err);
      alert('읽음 처리에 실패했습니다.');
    } finally {
      setMarkingId(null);
    }
  };

  const markAllAsRead = async () => {
    if (notifications.length === 0 || markingAll) return;
    if (!confirm(`읽지 않은 알림 ${notifications.length}개를 모두 읽음 처리하시겠습니까?`)) return;
    setMarkingAll(true);
    try {
      const notiIds = notifications.filter(n => n.table_info === 'notifications').map(n => n.id);
      const payIds = notifications.filter(n => n.table_info === 'payment_notifications').map(n => n.id);

      const promises: Promise<any>[] = [];
      if (notiIds.length > 0) {
        promises.push(
          supabase
            .from('notifications')
            .update({ status: 'read', updated_at: new Date().toISOString() })
            .in('id', notiIds)
        );
      }
      if (payIds.length > 0) {
        promises.push(
          supabase
            .from('payment_notifications')
            .update({ is_sent: true, sent_at: new Date().toISOString() })
            .in('id', payIds)
        );
      }
      await Promise.all(promises);
      setNotifications([]);
    } catch (err) {
      console.error('일괄 읽음 실패:', err);
      alert('일괄 읽음 처리에 실패했습니다.');
    } finally {
      setMarkingAll(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-72">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <ManagerLayout title="알림 관리">
      <div className="max-w-md mx-auto space-y-3 pb-6">
        {/* 헤더 영역 */}
        <div className="flex items-center justify-between pt-2 px-1">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-blue-600" />
            <span className="text-sm font-semibold text-gray-800">읽지 않은 알림</span>
            {notifications.length > 0 && (
              <span className="bg-red-500 text-white text-[11px] font-bold px-2 py-0.5 rounded-full">
                {notifications.length}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              className="p-1.5 rounded-lg bg-gray-100 active:bg-gray-200 disabled:opacity-50"
              aria-label="새로고침"
            >
              <RefreshCw className={`w-4 h-4 text-gray-600 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            {notifications.length > 0 && (
              <button
                type="button"
                onClick={markAllAsRead}
                disabled={markingAll}
                className="flex items-center gap-1 text-[12px] px-2.5 py-1.5 rounded-lg bg-blue-600 text-white active:bg-blue-700 disabled:opacity-50"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                {markingAll ? '처리 중...' : '모두 읽음'}
              </button>
            )}
          </div>
        </div>

        {/* 오늘 이전 숨기기 필터 버튼 */}
        <div className="px-1">
          <button
            type="button"
            onClick={() => setHideOld(prev => !prev)}
            className={`text-[12px] px-3 py-1.5 rounded-full font-medium transition-colors ${
              hideOld
                ? 'bg-amber-500 text-white'
                : 'bg-gray-100 text-gray-600 border border-gray-200'
            }`}
          >
            📅 {hideOld ? '오늘 이전 숨김' : '오늘 이전 표시'}
          </button>
        </div>

        {/* 필터 적용 */}
        {(() => {
          const todayStart = new Date();
          todayStart.setHours(0, 0, 0, 0);
          const displayList = hideOld
            ? notifications.filter(n => new Date(n.created_at) >= todayStart)
            : notifications;

          return (
            <>
              {/* 알림 없음 */}
              {displayList.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                  <Bell className="w-12 h-12 mb-3 text-gray-300" />
                  <p className="text-sm font-medium">읽지 않은 알림이 없습니다</p>
                  <button
                    type="button"
                    onClick={handleRefresh}
                    className="mt-4 text-xs text-blue-500 underline"
                  >
                    새로고침
                  </button>
                </div>
              )}

              {/* 알림 카드 목록 */}
              {displayList.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => markAsRead(item)}
                  disabled={markingId === item.id}
                  className="w-full text-left bg-white rounded-2xl shadow-sm border border-blue-100 p-4 active:scale-[0.98] transition-all disabled:opacity-60"
                >
                  <div className="flex items-start gap-3">
                    {/* 우선순위 점 */}
                    <div className="mt-1 flex-shrink-0">
                      {(item.priority === 'urgent' || item.priority === '긴급') ? (
                        <AlertTriangle className="w-4 h-4 text-red-500" />
                      ) : (
                        <span className="block w-2.5 h-2.5 rounded-full bg-blue-500 mt-0.5" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* 배지 행 */}
                      <div className="flex flex-wrap gap-1 mb-1.5">
                        {item.category && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${getCategoryBadge(item.category)}`}>
                            {item.category}
                          </span>
                        )}
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${getPriorityColor(item.priority)}`}>
                          {getPriorityLabel(item.priority)}
                        </span>
                      </div>

                      {/* 제목 */}
                      <p className="text-sm font-semibold text-gray-900 leading-snug truncate">
                        {item.title}
                      </p>

                      {/* 내용 */}
                      {item.message && (
                        <p className="mt-0.5 text-[12px] text-gray-500 line-clamp-2 leading-relaxed">
                          {item.message}
                        </p>
                      )}

                      {/* 시간 */}
                      <p className="mt-1.5 text-[11px] text-gray-400">
                        {formatRelativeTime(item.created_at)}
                      </p>
                    </div>

                    {/* 읽음 처리 중 스피너 */}
                    {markingId === item.id && (
                      <div className="flex-shrink-0">
                        <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </>
          );
        })()}
      </div>
    </ManagerLayout>
  );
}
