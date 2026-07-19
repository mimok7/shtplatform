// @ts-nocheck
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabase';
import ManagerLayout from '@/components/ManagerLayout';
import { Bell, RefreshCw, CheckCheck, AlertTriangle, Car, CalendarDays, User } from 'lucide-react';
import { toKstDateKey } from '@/lib/dateKst';

type NotificationItem = {
  id: string;
  type: string;
  category: string;
  subcategory?: string;
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

type BookerInfo = {
  name: string;
  email: string;
};

type ParsedMessageLine = {
  label: string;
  value: string;
};

const PAGE_SIZE = 20;

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
  return d.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: 'short', day: 'numeric' });
};

const isShtCarRelated = (item: NotificationItem) => {
  const eventKey = String(item.metadata?.eventKey || '').toLowerCase();
  if (eventKey === 'sht_car_low_seat_warning' || eventKey === 'sht_car_cancel') {
    return true;
  }

  const searchText = [
    item.category,
    item.subcategory,
    item.title,
    item.message,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return (
    searchText.includes('스하차량') ||
    searchText.includes('스차') ||
    searchText.includes('sht car') ||
    searchText.includes('sht-car') ||
    searchText.includes('sht_car')
  );
};

const isCustomerRelated = (item: NotificationItem) => {
  if (String(item.type || '').toLowerCase() === 'customer') {
    return true;
  }

  const searchText = [
    item.category,
    item.subcategory,
    item.title,
    item.message,
    item.target_table,
    String(item.metadata?.eventKey || ''),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return (
    searchText.includes('고객') ||
    searchText.includes('customer') ||
    searchText.includes('문의') ||
    searchText.includes('inquiry')
  );
};

const isShtCarCancelRisk = (item: NotificationItem) => {
  const eventKey = String(item.metadata?.eventKey || '').toLowerCase();
  if (eventKey === 'sht_car_cancel') {
    return true;
  }

  const searchText = [
    item.category,
    item.subcategory,
    item.title,
    item.message,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return (
    (searchText.includes('스차') || searchText.includes('스하차량') || searchText.includes('sht car') || searchText.includes('sht_car')) &&
    (searchText.includes('취소') || searchText.includes('cancel') || searchText.includes('위험') || searchText.includes('risk'))
  );
};

const parseBodyField = (message: string, field: string) => {
  const m = String(message || '').match(new RegExp(`${field}\\s*:\\s*([^|\\n]+)`, 'i'));
  return (m?.[1] || '').trim();
};

const fallbackNameFromEmail = (email: string) => {
  const value = String(email || '').trim();
  if (!value.includes('@')) return '-';
  const local = value.split('@')[0]?.trim();
  return local || '-';
};

const parseNotificationMessageLines = (message: string): ParsedMessageLine[] => {
  return String(message || '')
    .split(/\||\n/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const idx = part.indexOf(':');
      if (idx <= 0) {
        return { label: '', value: part };
      }
      const label = part.slice(0, idx).trim();
      const value = part.slice(idx + 1).trim();
      return { label, value };
    });
};

const normalizeDateValue = (value: unknown): string | null => {
  const text = String(value || '').trim();
  if (!text) return null;

  const normalized = text.replace(/\./g, '-').replace(/\//g, '-');
  const match = normalized.match(/(\d{4}-\d{1,2}-\d{1,2})/);
  if (match?.[1]) {
    return match[1]
      .split('-')
      .map((part, index) => (index === 0 ? part : part.padStart(2, '0')))
      .join('-');
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return toKstDateKey(parsed);
};

const getFilterBaseDate = (item: NotificationItem): string | null => {
  const metadata = item.metadata || {};
  const message = String(item.message || '');

  const candidates = [
    metadata.checkin,
    metadata.checkinDate,
    metadata.checkin_date,
    metadata.usageDate,
    metadata.usage_date,
    metadata.use_date,
    metadata.usedate,
    metadata.pickupDate,
    metadata.startDate,
    parseBodyField(message, '체크인'),
    parseBodyField(message, '사용일자'),
    parseBodyField(message, '이용일자'),
    parseBodyField(message, '사용일'),
    parseBodyField(message, '픽업일'),
    parseBodyField(message, '투어일자'),
    parseBodyField(message, '출발일'),
  ];

  for (const candidate of candidates) {
    const normalized = normalizeDateValue(candidate);
    if (normalized) return normalized;
  }

  return normalizeDateValue(item.created_at);
};

const getShtCarCancelDisplayData = (item: NotificationItem) => {
  const metadata = item.metadata || {};
  const message = String(item.message || '');

  const pickupDate = metadata.pickupDate || parseBodyField(message, '픽업일') || '-';
  const vehicleNumber = metadata.vehicleNumber || parseBodyField(message, '차량') || '-';

  const seatList: string[] = Array.isArray(metadata.seatList)
    ? metadata.seatList.map((s: unknown) => String(s)).filter(Boolean)
    : [];
  const seatCount = Number(metadata.seatCount || seatList.length || 0);
  const seatsText = seatList.length > 0 ? `${seatCount}석 (${seatList.join(', ')})` : `${seatCount || '-'}석`;

  const mappedBookers: BookerInfo[] = Array.isArray(metadata.bookers)
    ? metadata.bookers
      .map((b: unknown) => ({
        name: String((b as { name?: string })?.name || '-').trim() || '-',
        email: String((b as { email?: string })?.email || '-').trim() || '-',
      }))
      .filter((b) => b.name !== '-' || b.email !== '-')
    : [];

  if (mappedBookers.length > 0) {
    return {
      pickupDate,
      vehicleNumber,
      seatsText,
      namesText: mappedBookers.map((b) => (b.name && b.name !== '-' ? b.name : fallbackNameFromEmail(b.email))).join(', '),
      emailsText: mappedBookers.map((b) => b.email).join(', '),
    };
  }

  const fallbackEmails = Array.isArray(metadata.emails)
    ? metadata.emails.map((e: unknown) => String(e).trim()).filter(Boolean)
    : [];
  const msgEmail = parseBodyField(message, '예약자 이메일');
  const emails = fallbackEmails.length > 0 ? fallbackEmails : (msgEmail ? msgEmail.split(',').map((e) => e.trim()).filter(Boolean) : []);

  return {
    pickupDate,
    vehicleNumber,
    seatsText,
    namesText: emails.length > 0 ? emails.map((e) => fallbackNameFromEmail(e)).join(', ') : '-',
    emailsText: emails.length > 0 ? emails.join(', ') : '-',
  };
};

export default function MobileNotificationsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'sht-car' | 'customer'>('all');
  const [statusFilter, setStatusFilter] = useState<'unread' | 'all'>('unread');
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const [hideOld, setHideOld] = useState(false); // 오늘 이전 알림 표시
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const enrichCancelRiskBookers = useCallback(async (items: NotificationItem[]) => {
    const emailNameFromFeed = new Map<string, string>();
    for (const item of items) {
      const text = `${String(item.title || '')} ${String(item.message || '')}`;
      const m = text.match(/고객명\s*:\s*([^|\n]+?)\s+이메일\s*:\s*([^|\n\s]+)/i);
      if (!m) continue;
      const name = String(m[1] || '').trim();
      const email = String(m[2] || '').trim();
      if (!name || !email) continue;
      emailNameFromFeed.set(email, name);
    }

    const targets = items.filter((item) => {
      if (!isShtCarCancelRisk(item)) return false;
      const ids = (item.metadata as { reservationIds?: unknown[] })?.reservationIds;
      return Array.isArray(ids) && ids.length > 0;
    });

    if (targets.length === 0) return items;

    const reservationIds = Array.from(
      new Set(
        targets.flatMap((item) => {
          const ids = (item.metadata as { reservationIds?: unknown[] })?.reservationIds;
          return Array.isArray(ids) ? ids.map((id) => String(id)).filter(Boolean) : [];
        })
      )
    );

    if (reservationIds.length === 0) return items;

    const managerReservationMap = new Map<string, { name: string; email: string }>();
    const { data: managerReservations } = await supabase
      .from('manager_reservations')
      .select('re_id, customer_name, customer_email')
      .in('re_id', reservationIds);

    (managerReservations || []).forEach((row: { re_id?: string | null; customer_name?: string | null; customer_email?: string | null }) => {
      const reId = String(row.re_id || '').trim();
      if (!reId) return;
      managerReservationMap.set(reId, {
        name: String(row.customer_name || '-').trim() || '-',
        email: String(row.customer_email || '-').trim() || '-',
      });
    });

    const { data: reservations, error: reservationErr } = await supabase
      .from('reservation')
      .select('re_id, re_user_id')
      .in('re_id', reservationIds);

    if (reservationErr || !reservations) return items;

    const userIds = Array.from(
      new Set(
        reservations
          .map((row: { re_user_id?: string | null }) => row.re_user_id)
          .filter((id): id is string => Boolean(id))
      )
    );

    const userMap = new Map<string, { name: string; email: string }>();
    if (userIds.length > 0) {
      const { data: users } = await supabase
        .from('users')
        .select('id, name, email')
        .in('id', userIds);

      (users || []).forEach((u: { id: string; name?: string | null; email?: string | null }) => {
        userMap.set(u.id, {
          name: String(u.name || '-'),
          email: String(u.email || '-'),
        });
      });
    }

    const allEmails = Array.from(
      new Set(
        targets.flatMap((item) => {
          const emails = (item.metadata as { emails?: unknown[] })?.emails;
          return Array.isArray(emails)
            ? emails.map((e) => String(e).trim()).filter(Boolean)
            : [];
        })
      )
    );

    const emailUserMap = new Map<string, { name: string; email: string }>();
    if (allEmails.length > 0) {
      const { data: usersByEmail } = await supabase
        .from('users')
        .select('id, name, email')
        .in('email', allEmails);

      (usersByEmail || []).forEach((u: { name?: string | null; email?: string | null }) => {
        const email = String(u.email || '').trim();
        if (!email) return;
        emailUserMap.set(email, {
          name: String(u.name || '-'),
          email,
        });
      });
    }

    const reservationUserMap = new Map<string, { name: string; email: string }>();
    (reservations || []).forEach((row: { re_id: string; re_user_id?: string | null }) => {
      if (!row.re_id || !row.re_user_id) return;
      const user = userMap.get(row.re_user_id);
      if (user) {
        reservationUserMap.set(String(row.re_id), user);
      }
    });

    return items.map((item) => {
      if (!isShtCarCancelRisk(item)) return item;
      const metadata = item.metadata || {};
      const ids = Array.isArray(metadata.reservationIds)
        ? metadata.reservationIds.map((id: unknown) => String(id)).filter(Boolean)
        : [];
      if (ids.length === 0) return item;

      const seen = new Set<string>();
      const bookers: BookerInfo[] = [];
      for (const id of ids) {
        const managerInfo = managerReservationMap.get(id);
        if (managerInfo && (managerInfo.name !== '-' || managerInfo.email !== '-')) {
          const key = `${managerInfo.name}::${managerInfo.email}`;
          if (!seen.has(key)) {
            seen.add(key);
            bookers.push({ name: managerInfo.name || '-', email: managerInfo.email || '-' });
          }
        }

        const user = reservationUserMap.get(id);
        if (!user) continue;
        const key = `${user.name}::${user.email}`;
        if (seen.has(key)) continue;
        seen.add(key);
        bookers.push({ name: user.name || '-', email: user.email || '-' });
      }

      const emails = Array.isArray(metadata.emails)
        ? metadata.emails.map((e: unknown) => String(e).trim()).filter(Boolean)
        : [];

      for (const email of emails) {
        const mapped = emailUserMap.get(email);
        const name = mapped?.name || emailNameFromFeed.get(email) || fallbackNameFromEmail(email);
        const key = `${name}::${email}`;
        if (seen.has(key)) continue;
        seen.add(key);
        bookers.push({ name, email });
      }

      return {
        ...item,
        metadata: {
          ...metadata,
          bookers,
        },
      };
    });
  }, []);

  // notification_reads에서 현재 사용자가 읽은 알림 ID Set 조회
  const fetchUserReadSet = useCallback(async (userId: string, notificationIds: string[]): Promise<Set<string>> => {
    if (notificationIds.length === 0) return new Set();
    const { data } = await supabase
      .from('notification_reads')
      .select('notification_id')
      .eq('user_id', userId)
      .in('notification_id', notificationIds);
    return new Set((data || []).map((r: any) => r.notification_id as string));
  }, []);

  // 알림 목록에 사용자별 읽음 상태 오버레이 적용
  const applyReadOverlay = useCallback((items: NotificationItem[], readSet: Set<string>): NotificationItem[] => {
    return items.map((item) => {
      if (item.table_info !== 'notifications') return item;
      if (['completed', 'processing', 'dismissed'].includes(item.status)) return item;
      return { ...item, status: readSet.has(item.id) ? 'read' : 'unread' };
    });
  }, []);

  const loadNotifications = useCallback(async (mode: 'reset' | 'append' = 'reset') => {
    const nextPage = mode === 'append' ? page + 1 : 0;
    const from = nextPage * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    if (mode === 'append') {
      setLoadingMore(true);
    }

    try {
      // 1. notifications 테이블 (status 필터 제거 → 클라이언트에서 오버레이 후 필터)
      const notiQuery = supabase
        .from('notifications')
        .select('id, type, category, subcategory, title, message, priority, status, target_table, target_id, metadata, created_at')
        .order('created_at', { ascending: false })
        .range(from, to);

      // 2. payment_notifications 테이블
      let payQuery = supabase
        .from('payment_notifications')
        .select('id, notification_type, message_content, priority, is_sent, reservation_id, notification_date, created_at')
        .order('notification_date', { ascending: false })
        .range(from, to);

      if (statusFilter === 'unread') {
        payQuery = payQuery.eq('is_sent', false);
      }

      const [{ data: notiData }, { data: payData }] = await Promise.all([notiQuery, payQuery]);

      let notiItems: NotificationItem[] = (notiData || []).map((n: any) => ({
        id: n.id,
        type: n.type || 'business',
        category: n.category || '',
        subcategory: n.subcategory || '',
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

      // 계정별 읽음 오버레이 적용
      if (currentUserId && notiItems.length > 0) {
        const notiIds = notiItems.map((i) => i.id);
        const readSet = await fetchUserReadSet(currentUserId, notiIds);
        notiItems = applyReadOverlay(notiItems, readSet);
      }

      // statusFilter 클라이언트 필터 (notifications)
      if (statusFilter === 'unread') {
        notiItems = notiItems.filter((i) => i.status === 'unread');
      } else if (statusFilter === 'read') {
        notiItems = notiItems.filter((i) => i.status === 'read');
      }

      const payItems: NotificationItem[] = (payData || []).map((p: any) => ({
        id: p.id,
        type: 'business',
        category: '결제',
        subcategory: '',
        title: p.notification_type === 'payment_due'
          ? '결제 예정 알림'
          : p.notification_type === 'payment_overdue'
            ? '결제 연체 알림'
            : p.notification_type || '결제 알림',
        message: p.message_content || '',
        priority: p.priority || 'normal',
        status: p.is_sent ? 'read' : 'unread',
        target_table: 'reservation',
        target_id: p.reservation_id ? String(p.reservation_id) : undefined,
        metadata: { reservation_id: p.reservation_id },
        created_at: p.created_at || p.notification_date || new Date().toISOString(),
        table_info: 'payment_notifications',
      }));

      const combined = [...notiItems, ...payItems].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      const all = await enrichCancelRiskBookers(combined);

      setHasMore(notiItems.length === PAGE_SIZE || payItems.length === PAGE_SIZE);

      if (mode === 'append') {
        setNotifications((prev) => {
          const map = new Map<string, NotificationItem>();
          for (const item of prev) {
            map.set(`${item.table_info}:${item.id}`, item);
          }
          for (const item of all) {
            map.set(`${item.table_info}:${item.id}`, item);
          }
          return Array.from(map.values()).sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
        });
      } else {
        setNotifications(all);
      }
      setPage(nextPage);
    } catch (err) {
      console.error('알림 로드 실패:', err);
    } finally {
      if (mode === 'append') {
        setLoadingMore(false);
      }
    }
  }, [page, statusFilter, enrichCancelRiskBookers, currentUserId, fetchUserReadSet, applyReadOverlay]);

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
        setCurrentUserId(user.id);
        setAuthReady(true);
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled && !authReady) setLoading(false);
      }
    };
    init();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!authReady) return;
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      await loadNotifications('reset');
      if (!cancelled) setLoading(false);
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [authReady, statusFilter]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadNotifications('reset');
    setRefreshing(false);
  };

  const handleLoadMore = async () => {
    if (loadingMore || !hasMore) return;
    await loadNotifications('append');
  };

  const markAsRead = async (item: NotificationItem) => {
    if (markingId === item.id || !currentUserId) return;
    setMarkingId(item.id);
    try {
      if (item.table_info === 'notifications') {
        // 계정별 읽음 처리: notification_reads에 upsert
        await supabase
          .from('notification_reads')
          .upsert(
            { notification_id: item.id, user_id: currentUserId, read_at: new Date().toISOString() },
            { onConflict: 'notification_id,user_id' }
          );
      } else {
        // payment_notifications는 global is_sent 유지
        await supabase
          .from('payment_notifications')
          .update({ is_sent: true, sent_at: new Date().toISOString() })
          .eq('id', item.id);
      }
      setNotifications((prev) => {
        if (statusFilter === 'unread') {
          return prev.filter((n) => !(n.id === item.id && n.table_info === item.table_info));
        }
        return prev.map((n) => {
          if (n.id !== item.id || n.table_info !== item.table_info) return n;
          return { ...n, status: 'read' };
        });
      });
    } catch (err) {
      console.error('읽음 처리 실패:', err);
      alert('읽음 처리에 실패했습니다.');
    } finally {
      setMarkingId(null);
    }
  };

  const markAllAsRead = async () => {
    const unreadTargets = notifications.filter((n) => n.status === 'unread');
    if (unreadTargets.length === 0 || markingAll || !currentUserId) return;
    if (!confirm(`읽지 않은 알림 ${unreadTargets.length}개를 모두 읽음 처리하시겠습니까?`)) return;
    setMarkingAll(true);
    try {
      const notiIds = unreadTargets.filter(n => n.table_info === 'notifications').map(n => n.id);
      const payIds = unreadTargets.filter(n => n.table_info === 'payment_notifications').map(n => n.id);

      const promises: Promise<any>[] = [];
      if (notiIds.length > 0) {
        // 계정별 일괄 읽음: notification_reads에 bulk upsert
        const rows = notiIds.map((id) => ({
          notification_id: id,
          user_id: currentUserId,
          read_at: new Date().toISOString(),
        }));
        promises.push(
          supabase
            .from('notification_reads')
            .upsert(rows, { onConflict: 'notification_id,user_id' })
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
      setNotifications((prev) => {
        if (statusFilter === 'unread') {
          return prev.filter((n) => n.status !== 'unread');
        }
        return prev.map((n) => (n.status === 'unread' ? { ...n, status: 'read' } : n));
      });
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
        {(() => {
          const unreadCount = notifications.filter((n) => n.status === 'unread').length;

          return (
            <>
        <div className="mx-1 mt-2 rounded-2xl border border-gray-200 bg-white shadow-sm p-3 space-y-2.5">
          {/* 헤더 영역 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-blue-600" />
              <span className="text-sm font-semibold text-gray-800">전체 알림</span>
              {unreadCount > 0 && (
                <span className="bg-red-500 text-white text-[11px] font-bold px-2 py-0.5 rounded-full">
                  {unreadCount}
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
              {unreadCount > 0 && (
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

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`inline-flex items-center gap-1.5 text-[12px] px-2.5 py-1.5 rounded-full font-medium transition-colors whitespace-nowrap ${
                  statusFilter === 'all'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-gray-100 text-gray-700 border border-gray-200'
                }`}
                aria-label="전체 알림"
              >
                전체
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('unread')}
                className={`inline-flex items-center gap-1.5 text-[12px] px-2.5 py-1.5 rounded-full font-medium transition-colors whitespace-nowrap ${
                  statusFilter === 'unread'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 border border-gray-200'
                }`}
                aria-label="읽지 않은 알림만"
              >
                읽지 않음
              </button>
            </div>

            <button
              type="button"
              onClick={() => setHideOld(prev => !prev)}
              className={`inline-flex items-center gap-1.5 text-[12px] px-2.5 py-1.5 rounded-full font-medium transition-colors whitespace-nowrap ${
                hideOld
                  ? 'bg-amber-500 text-white'
                  : 'bg-gray-100 text-gray-600 border border-gray-200'
              }`}
              aria-label={hideOld ? '오늘 이전 숨김' : '오늘 이전 표시'}
            >
              <CalendarDays className="w-3.5 h-3.5" />
              {hideOld ? '오늘 이전 숨김' : '오늘 이전 표시'}
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`inline-flex items-center gap-1.5 text-[12px] px-2.5 py-1.5 rounded-full font-medium transition-colors whitespace-nowrap ${
                activeTab === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 border border-gray-200'
              }`}
              aria-label="전체 알림"
            >
              <Bell className="w-3.5 h-3.5" />
              전체
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('sht-car')}
              className={`inline-flex items-center gap-1.5 text-[12px] px-2.5 py-1.5 rounded-full font-medium transition-colors whitespace-nowrap ${
                activeTab === 'sht-car'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-700 border border-gray-200'
              }`}
              aria-label="스차 알림"
            >
              <Car className="w-3.5 h-3.5" />
              스차
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('customer')}
              className={`inline-flex items-center gap-1.5 text-[12px] px-2.5 py-1.5 rounded-full font-medium transition-colors whitespace-nowrap ${
                activeTab === 'customer'
                  ? 'bg-cyan-600 text-white'
                  : 'bg-gray-100 text-gray-700 border border-gray-200'
              }`}
              aria-label="고객 알림"
            >
              <User className="w-3.5 h-3.5" />
              고객
            </button>
          </div>
        </div>

        {/* 필터 적용 */}
        {(() => {
          const todayKey = toKstDateKey(new Date());
          const dateFiltered = hideOld
            ? notifications.filter((n) => {
              const baseDate = getFilterBaseDate(n);
              if (!baseDate) return false;
              return baseDate >= todayKey;
            })
            : notifications;

          const displayList = activeTab === 'sht-car'
            ? dateFiltered.filter((item) => isShtCarRelated(item))
            : activeTab === 'customer'
              ? dateFiltered.filter((item) => isCustomerRelated(item))
              : dateFiltered;

          return (
            <>
              {/* 알림 없음 */}
              {displayList.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                  <Bell className="w-12 h-12 mb-3 text-gray-300" />
                  <p className="text-sm font-medium">
                    {statusFilter === 'unread' ? '읽지 않은 알림이 없습니다' : '표시할 알림이 없습니다'}
                  </p>
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
              {displayList.map((item) => {
                const isCancelRisk = isShtCarCancelRisk(item);
                const cancelData = isCancelRisk ? getShtCarCancelDisplayData(item) : null;
                const cardTone = isCancelRisk
                  ? (item.status === 'read' ? 'bg-red-50 border-red-200' : 'bg-red-100 border-red-300')
                  : (item.status === 'read' ? 'bg-gray-50 border-gray-200' : 'bg-white border-blue-100');

                return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => markAsRead(item)}
                  disabled={markingId === item.id}
                  className={`w-full text-left rounded-2xl shadow-sm border p-4 active:scale-[0.98] transition-all disabled:opacity-60 ${cardTone}`}
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
                      {isCancelRisk ? (
                        <div className="mt-0.5 text-[12px] text-gray-600 leading-relaxed space-y-0.5">
                          <p><span className="text-blue-600 font-semibold">일자:</span> {cancelData?.pickupDate || '-'}</p>
                          <p><span className="text-blue-600 font-semibold">차량:</span> {cancelData?.vehicleNumber || '-'}</p>
                          <p><span className="text-blue-600 font-semibold">좌석:</span> {cancelData?.seatsText || '-'}</p>
                          <p><span className="text-blue-600 font-semibold">예약자:</span> {cancelData?.namesText || '-'}</p>
                          <p><span className="text-blue-600 font-semibold">예약자 이메일:</span> {cancelData?.emailsText || '-'}</p>
                        </div>
                      ) : item.message ? (
                        (() => {
                          const lines = parseNotificationMessageLines(item.message).slice(0, 4);
                          if (lines.length === 0) return null;

                          return (
                            <div className="mt-0.5 text-[12px] text-gray-500 leading-relaxed space-y-0.5">
                              {lines.map((line, idx) => (
                                <p key={`${item.id}-line-${idx}`}>
                                  {line.label ? <span className="text-blue-600 font-semibold">{line.label}:</span> : null}
                                  {line.label ? ' ' : ''}
                                  {line.value || '-'}
                                </p>
                              ))}
                            </div>
                          );
                        })()
                      ) : null}

                      {/* 시간 */}
                      <p className="mt-1.5 text-[11px] text-gray-400">
                        {formatRelativeTime(item.created_at)}
                        {item.status === 'read' ? ' · 읽음' : ''}
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
              );
              })}

              {displayList.length > 0 && hasMore && (
                <div className="px-1">
                  <button
                    type="button"
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                    className="w-full text-[13px] font-medium py-2.5 rounded-xl border border-gray-200 bg-white text-gray-700 active:bg-gray-50 disabled:opacity-60"
                  >
                    {loadingMore ? '불러오는 중...' : '더 불러오기'}
                  </button>
                </div>
              )}
            </>
          );
        })()}
            </>
          );
        })()}
      </div>
    </ManagerLayout>
  );
}
