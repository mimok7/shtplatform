'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabase';
import ManagerLayout from '@/components/ManagerLayout';
import SendNotificationModal from '@/components/SendNotificationModal';
import { NOTIFICATIONS_DISABLED_MESSAGE, NOTIFICATIONS_ENABLED } from '@/lib/notificationFeature';


// 타입 정의
interface BaseNotification {
  id: string;
  type: 'business' | 'customer';
  category: string;
  subcategory?: string; // 서브카테고리 추가
  title: string;
  message: string;
  priority: 'low' | 'normal' | 'high' | 'urgent' | string;
  status: 'unread' | 'read' | 'processing' | 'completed' | 'dismissed';
  target_id?: string;
  target_table?: string;
  assigned_to?: string;
  due_date?: string;
  metadata?: any;
  created_at: string;
  updated_at: string;
  processed_at?: string;
  processed_by_name?: string; // 처리 매니저 이름
  processing_note?: string; // 처리 내용 추가
  customer_details?: any[]; // 조인된 customer_notifications 데이터
  customer_name?: string; // 고객 이름 추가
  customer_email?: string; // 고객 이메일 추가
  customer_phone?: string; // 고객 전화번호 추가
  table_info?: 'notifications' | 'payment_notifications'; // 출처 테이블 정보 추가
}

interface CustomerNotification extends BaseNotification {
  customer_id?: string;
  customer_name?: string;
  customer_phone?: string;
  customer_email?: string;
  inquiry_type?: string;
  service_type?: string;
  response_deadline?: string;
  customer_satisfaction?: number;
  follow_up_required?: boolean;
  resolution_notes?: string;
}

type NotificationItem = BaseNotification | CustomerNotification;

type BookerInfo = {
  name: string;
  email: string;
};

type ParsedMessageLine = {
  label: string;
  value: string;
};

// 한글 컬럼명 매핑
const getKoreanFieldName = (field: string): string => {
  const fieldMap: Record<string, string> = {
    'type': '유형',
    'category': '카테고리',
    'title': '제목',
    'message': '내용',
    'priority': '우선순위',
    'status': '상태',
    'created_at': '생성일시',
    'updated_at': '수정일시',
    'processed_at': '처리일시',
  };
  return fieldMap[field] || field;
};

const getKoreanStatus = (status: string): string => {
  const statusMap: Record<string, string> = {
    'unread': '읽지않음',
    'read': '읽음',
    'processing': '처리중',
    'completed': '완료',
    'dismissed': '무시됨'
  };
  return statusMap[status] || status;
};

const getKoreanPriority = (priority: string): string => {
  const priorityMap: Record<string, string> = {
    'low': '낮음',
    'normal': '보통',
    'high': '높음',
    'urgent': '긴급'
  };
  return priorityMap[priority] || priority;
};

const getPriorityColor = (priority: string): string => {
  switch (priority) {
    case 'urgent':
    case '긴급':
      return 'bg-red-100 text-red-600';
    case 'high':
    case '높음':
      return 'bg-orange-100 text-orange-600';
    case 'normal':
    case '보통':
      return 'bg-blue-100 text-blue-600';
    case 'low':
    case '낮음':
      return 'bg-gray-100 text-gray-600';
    default:
      return 'bg-gray-100 text-gray-600';
  }
};

const getStatusColor = (status: string): string => {
  switch (status) {
    case 'unread': return 'bg-red-100 text-red-600';
    case 'read': return 'bg-blue-100 text-blue-600';
    case 'processing': return 'bg-yellow-100 text-yellow-600';
    case 'completed': return 'bg-green-100 text-green-600';
    case 'dismissed': return 'bg-gray-100 text-gray-600';
    default: return 'bg-gray-100 text-gray-600';
  }
};

const isShtCarNotification = (n: NotificationItem): boolean => {
  const eventKey = String(n.metadata?.eventKey || '').toLowerCase();
  if (eventKey === 'sht_car_low_seat_warning' || eventKey === 'sht_car_cancel') {
    return true;
  }

  const structuredSearch = [
    n.target_table,
    (n as CustomerNotification).service_type,
    String(n.metadata?.service_type || ''),
    String(n.metadata?.reservation_type || ''),
    String(n.metadata?.target_table || ''),
    String(n.metadata?.targetTable || ''),
    String(n.metadata?.url || ''),
    String(n.metadata?.tag || ''),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (
    structuredSearch.includes('reservation_car_sht') ||
    structuredSearch.includes('car_sht') ||
    structuredSearch.includes('/sht-car') ||
    structuredSearch.includes('sht-car') ||
    structuredSearch.includes('sht_car')
  ) {
    return true;
  }

  const haystack = [n.category, n.subcategory, n.title, n.message]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return (
    haystack.includes('스하차량') ||
    haystack.includes('스차') ||
    haystack.includes('sht car') ||
    haystack.includes('sht-car') ||
    haystack.includes('sht_car')
  );
};

const isShtCarCancelRisk = (n: NotificationItem): boolean => {
  const eventKey = String(n.metadata?.eventKey || '').toLowerCase();
  if (eventKey === 'sht_car_cancel') {
    return true;
  }

  const haystack = [n.category, n.subcategory, n.title, n.message]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return (
    (haystack.includes('스하차량') || haystack.includes('스차') || haystack.includes('sht car') || haystack.includes('sht-car') || haystack.includes('sht_car')) &&
    (haystack.includes('취소') || haystack.includes('cancel') || haystack.includes('위험') || haystack.includes('risk'))
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

      return {
        label: part.slice(0, idx).trim(),
        value: part.slice(idx + 1).trim(),
      };
    });
};

const getDisplayNotificationTitle = (title: string): string => {
  return String(title || '').replace(/\s*\([^()]*\d[\d,]*원[^()]*\)\s*$/, '').trim();
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
  const emails = fallbackEmails.length > 0 ? fallbackEmails : (msgEmail ? msgEmail.split(',').map((e: string) => e.trim()).filter(Boolean) : []);

  return {
    pickupDate,
    vehicleNumber,
    seatsText,
    namesText: emails.length > 0 ? emails.map((e: string) => fallbackNameFromEmail(e)).join(', ') : '-',
    emailsText: emails.length > 0 ? emails.join(', ') : '-',
  };
};

export default function NotificationManagement() {
  const router = useRouter();

  const [user, setUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [customerNotifications, setCustomerNotifications] = useState<any[]>([]);

  // 필터 상태
  const [activeTab, setActiveTab] = useState<'business' | 'customer' | 'request' | 'sht-car' | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<string>('unread');
  const [hideOldNotifications, setHideOldNotifications] = useState<boolean>(true); // 오늘 이전 알림 숨기기
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all'); // 카테고리 필터 추가

  // 모달 상태
  const [showModal, setShowModal] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState<NotificationItem | null>(null);

  // 알림 처리 상태
  const [processingNote, setProcessingNote] = useState('');
  const [customerSatisfaction, setCustomerSatisfaction] = useState<number>(5);

  // 통계 데이터
  const [stats, setStats] = useState({
    total: 0,
    quote: 0,      // 견적
    reservation: 0, // 예약
    payment: 0,     // 결제
    shtCar: 0,      // 스차
    customer: 0,    // 고객
    request: 0,     // 고객요청 추가
    unread: 0,      // 읽지않음
    urgent: 0       // 긴급
  });

  // 선택 상태
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isBulkActionLoading, setIsBulkActionLoading] = useState(false);

  // 알림 발송 모달 상태
  const [showSendModal, setShowSendModal] = useState(false);


  // 인증 & 프로필 로드 (최초 1회)
  useEffect(() => {
    async function initAuth() {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (authUser) {
        setUser(authUser);
        const { data: profile } = await supabase
          .from('users')
          .select('name, email, role')
          .eq('id', authUser.id)
          .single();
        if (profile) setUserProfile(profile);
        if (!NOTIFICATIONS_ENABLED) setInitialLoading(false);
      } else {
        setInitialLoading(false);
      }
    }
    initAuth();
  }, []);

  // 데이터 로드 (필터 변경 시 즉시 갱신)
  useEffect(() => {
    if (!user) return;
    if (!NOTIFICATIONS_ENABLED) {
      setInitialLoading(false);
      setNotifications([]);
      setCustomerNotifications([]);
      setStats({
        total: 0,
        quote: 0,
        reservation: 0,
        payment: 0,
        shtCar: 0,
        customer: 0,
        request: 0,
        unread: 0,
        urgent: 0
      });
      return;
    }

    const load = async () => {
      await Promise.all([loadNotifications(), loadStats()]);
      setInitialLoading(false);
    };
    load();
  }, [user, activeTab, statusFilter, priorityFilter, categoryFilter]);

  // 일정 주기 갱신 (성능을 위해 5분 간격, realtime은 popup이 처리)
  useEffect(() => {
    if (!NOTIFICATIONS_ENABLED) {
      return;
    }

    const interval = setInterval(() => {
      loadNotifications();
      loadStats();
    }, 300000); // 5분
    return () => clearInterval(interval);
  }, []);

  const loadNotifications = async () => {
    if (!NOTIFICATIONS_ENABLED) {
      setNotifications([]);
      setCustomerNotifications([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // 1. 업무 알림 조회 (notifications 테이블에서 business 타입)
      let businessQuery = supabase
        .from('notifications')
        .select('*, processing_note')
        .eq('type', 'business')
        .neq('status', 'completed')
        .order('created_at', { ascending: false });

      // 2. 고객 알림 조회 (notifications와 customer_notifications 조인)
      let customerQuery = supabase
        .from('notifications')
        .select(`
                    *,
                    processing_note,
                    customer_details:customer_notifications(
                        customer_id,
                        customer_name,
                        customer_phone,
                        customer_email,
                        inquiry_type,
                        service_type,
                        customer_satisfaction,
                        follow_up_required,
                        resolution_notes,
                        users:customer_id(name, email, phone_number)
                    )
                `)
        .eq('type', 'customer')
        .neq('status', 'completed')
        .order('created_at', { ascending: false });

      // 3. 고객 요청 전용 조회 (target_table=customer_requests)
      let requestQuery = supabase
        .from('notifications')
        .select(`
                    *,
                    processing_note,
                    customer_details:customer_notifications(
                        customer_id,
                        customer_name,
                        customer_phone,
                        customer_email,
                        inquiry_type,
                        service_type,
                        resolution_notes,
                        users:customer_id(name, email, phone_number)
                    )
                `)
        .eq('target_table', 'customer_requests')
        .neq('status', 'completed')
        .order('created_at', { ascending: false });

      if (categoryFilter !== 'all') {
        businessQuery = businessQuery.eq('category', categoryFilter);
        customerQuery = customerQuery.eq('category', categoryFilter);
        requestQuery = requestQuery.eq('category', categoryFilter);
      }

      // statusFilter는 클라이언트에서 notification_reads 오버레이 후 필터링
      // (계정별 읽음 추적 방식)

      if (priorityFilter !== 'all') {
        // 영문/한글 혼재 데이터 모두 매칭
        const priorityMap: Record<string, string> = {
          'urgent': '긴급',
          'high': '높음',
          'normal': '보통',
          'low': '낮음'
        };
        const priorityCandidates = Array.from(new Set([
          priorityFilter,
          priorityMap[priorityFilter],
        ].filter(Boolean) as string[]));

        businessQuery = businessQuery.in('priority', priorityCandidates);
        customerQuery = customerQuery.in('priority', priorityCandidates);
        requestQuery = requestQuery.in('priority', priorityCandidates);
      }

      // 결제 알림도 함께 조회
      let paymentQuery = supabase
        .from('payment_notifications')
        .select('*')
        .order('notification_date', { ascending: false });

      if (statusFilter !== 'all') {
        // payment_notifications는 is_sent로 상태를 관리하므로 매핑
        if (statusFilter === 'unread') paymentQuery = paymentQuery.eq('is_sent', false);
        if (statusFilter === 'read') paymentQuery = paymentQuery.eq('is_sent', true);
      }

      if (priorityFilter !== 'all') {
        const priorityMap: Record<string, string> = {
          'urgent': '긴급',
          'high': '높음',
          'normal': '보통',
          'low': '낮음'
        };
        const priorityCandidates = Array.from(new Set([
          priorityFilter,
          priorityMap[priorityFilter],
        ].filter(Boolean) as string[]));

        paymentQuery = paymentQuery.in('priority', priorityCandidates);
      }

      const [businessResult, customerResult, requestResult, paymentResult] = await Promise.all([
        businessQuery.limit(300),
        customerQuery.limit(300),
        requestQuery.limit(300),
        paymentQuery.limit(300)
      ]);

      if (businessResult.error) {
        console.log('📋 notifications 테이블 오류:', businessResult.error.message);
      }
      if (customerResult.error) {
        console.log('📋 고객 알림 조회 오류:', customerResult.error.message);
      }

      const businessNotifications = businessResult.data || [];
      const customerNotifications = customerResult.data || [];
      const requestNotifications = requestResult.data || [];
      const paymentNotifications = (paymentResult && paymentResult.data) || [];

      // 통합 알림 목록 생성
      let allNotifications: NotificationItem[] = [];

      const businessItems = businessNotifications.map(n => ({
        ...n,
        type: 'business' as const,
        table_info: 'notifications' as const
      }));

      const paymentItems = (categoryFilter === 'all' || categoryFilter === '결제')
        ? paymentNotifications.map((pn: any) => ({
          id: pn.id,
          type: 'business' as const,
          category: '결제',
          title: pn.notification_type === 'payment_due' ? '결제 예정 알림' : pn.notification_type === 'payment_overdue' ? '결제 연체 알림' : pn.notification_type,
          message: pn.message_content || pn.message || '',
          priority: (pn.priority || 'normal') as 'low' | 'normal' | 'high' | 'urgent',
          status: (pn.is_sent ? 'read' : 'unread') as 'unread' | 'read' | 'processing' | 'completed' | 'dismissed',
          target_table: 'reservation',
          target_id: pn.reservation_id ? String(pn.reservation_id) : undefined,
          notification_date: pn.notification_date,
          created_at: pn.created_at || (pn.notification_date ? (new Date(pn.notification_date)).toISOString() : new Date().toISOString()),
          updated_at: pn.sent_at || pn.created_at || new Date().toISOString(),
          metadata: { reservation_id: pn.reservation_id },
          table_info: 'payment_notifications' as const
        }))
        : [];

      const customerItems = customerNotifications.map(n => {
        const details = n.customer_details && n.customer_details[0];
        return {
          ...n,
          type: 'customer' as const,
          table_info: 'notifications' as const,
          customer_name: details?.users?.name || details?.customer_name || n.customer_name,
          customer_email: details?.users?.email || details?.customer_email || n.customer_email,
          customer_phone: details?.users?.phone_number || details?.customer_phone || n.customer_phone,
          customer_details: details ? [{
            ...details,
            customer_name: details.users?.name || details.customer_name,
            customer_email: details.users?.email || details.customer_email,
            customer_phone: details.users?.phone_number || details.customer_phone
          }] : []
        };
      });

      const requestItems = requestNotifications.map(n => {
        const details = n.customer_details && n.customer_details[0];
        return {
          ...n,
          type: n.type || 'customer',
          table_info: 'notifications' as const,
          customer_name: details?.users?.name || details?.customer_name || n.customer_name,
          customer_email: details?.users?.email || details?.customer_email || n.customer_email,
          customer_phone: details?.users?.phone_number || details?.customer_phone || n.customer_phone,
          customer_details: details ? [{
            ...details,
            customer_name: details.users?.name || details.customer_name,
            customer_email: details.users?.email || details.customer_email,
            customer_phone: details.users?.phone_number || details.customer_phone
          }] : []
        } as NotificationItem;
      });

      const mergedByKey = new Map<string, NotificationItem>();
      [...businessItems, ...paymentItems, ...customerItems, ...requestItems].forEach((item) => {
        mergedByKey.set(`${item.table_info || 'notifications'}:${item.id}`, item);
      });
      allNotifications = Array.from(mergedByKey.values());

      // 시간순 정렬
      allNotifications.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      if (activeTab === 'business') {
        allNotifications = allNotifications.filter((n) => n.type === 'business');
      }

      if (activeTab === 'customer') {
        allNotifications = allNotifications.filter((n) => n.type === 'customer');
      }

      // 고객 요청 필터링 추가 (target_table 기준)
      if (activeTab === 'request') {
        allNotifications = allNotifications.filter(n =>
          n.target_table === 'customer_requests' ||
          n.metadata?.request_id !== undefined ||
          n.category?.includes('요청')
        );
      }

      if (activeTab === 'sht-car') {
        allNotifications = allNotifications.filter((n) => isShtCarNotification(n));
      }

      // 안전망: 최종 카테고리 클라이언트 필터 (DB/병합 단계에서 누락된 항목 차단)
      if (categoryFilter !== 'all') {
        allNotifications = allNotifications.filter((n) => {
          if (categoryFilter === '고객문의') {
            return n.type === 'customer' || n.category === '고객문의' || n.category?.includes('고객');
          }
          return n.category === categoryFilter;
        });
      }

      // 클라이언트 필터: completed 상태 최종 제거
      allNotifications = allNotifications.filter(n => n.status !== 'completed');

      // 계정별 읽음 오버레이: notification_reads에서 현재 사용자 읽음 기록 조회
      if (user?.id) {
        const notiIds = allNotifications
          .filter(n => n.table_info === 'notifications')
          .map(n => n.id);
        if (notiIds.length > 0) {
          const { data: readsData } = await supabase
            .from('notification_reads')
            .select('notification_id')
            .eq('user_id', user.id)
            .in('notification_id', notiIds);
          const readSet = new Set((readsData || []).map((r: any) => r.notification_id as string));
          allNotifications = allNotifications.map(n => {
            if (n.table_info !== 'notifications') return n;
            if (['completed', 'processing', 'dismissed'].includes(n.status)) return n;
            return { ...n, status: readSet.has(n.id) ? 'read' : 'unread' };
          });
        }
      }

      // statusFilter 클라이언트 적용 (notification_reads 오버레이 이후)
      if (statusFilter === 'unread') {
        allNotifications = allNotifications.filter(n => n.status === 'unread');
      }

      setNotifications(allNotifications);
      setCustomerNotifications(customerNotifications);

      console.log(`✅ 알림 로드 완료: 업무 ${businessNotifications.length}개, 고객 ${customerNotifications.length}개`);
    } catch (error) {
      console.error('알림 로드 실패:', error);
      setNotifications([]);
      setCustomerNotifications([]);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    if (!NOTIFICATIONS_ENABLED) {
      setStats({
        total: 0,
        quote: 0,
        reservation: 0,
        payment: 0,
        shtCar: 0,
        customer: 0,
        request: 0,
        unread: 0,
        urgent: 0
      });
      return;
    }

    try {
      // 통계 데이터 로드 - count head 방식으로 경량화 (전체 row 가져오지 않음)
      // completed 제외 쵝 활성 알림 기준
      const [
        totalRes,
        unreadRes,
        urgentRes,
        customerRes,
        requestRes,
        quoteRes,
        reservationRes,
        paymentRes,
        shtCarRes,
      ] = await Promise.all([
        supabase.from('notifications').select('*', { count: 'exact', head: true }).neq('status', 'completed'),
        supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('status', 'unread'),
        supabase.from('notifications').select('*', { count: 'exact', head: true }).in('priority', ['urgent', '긴급']).neq('status', 'completed'),
        supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('type', 'customer').neq('status', 'completed'),
        supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('target_table', 'customer_requests').neq('status', 'completed'),
        supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('category', '견적').neq('status', 'completed'),
        supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('category', '예약').neq('status', 'completed'),
        supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('category', '결제').neq('status', 'completed'),
        supabase.from('notifications').select('id, type, category, subcategory, title, message, target_table, metadata').neq('status', 'completed'),
      ]);

      const shtCarCount = (shtCarRes.data || []).filter((notification) => isShtCarNotification(notification as NotificationItem)).length;

      setStats({
        total: totalRes.count || 0,
        quote: quoteRes.count || 0,
        reservation: reservationRes.count || 0,
        payment: paymentRes.count || 0,
        shtCar: shtCarCount,
        customer: customerRes.count || 0,
        request: requestRes.count || 0,
        unread: unreadRes.count || 0,
        urgent: urgentRes.count || 0,
      });
    } catch (error) {
      console.error('통계 로드 실패:', error);
    }
  };

  // 알림 처리 상태 업데이트
  const updateNotificationStatus = async (notificationId: string, status: 'read' | 'processing' | 'completed') => {
    if (!NOTIFICATIONS_ENABLED) {
      alert(NOTIFICATIONS_DISABLED_MESSAGE);
      return;
    }

    try {
      if (status === 'completed') {
        // 완료 처리: RPC 사용 (함수 시그니처: p_notification_id, p_manager_id, p_processing_note, p_customer_satisfaction)
        const { data, error } = await supabase.rpc('complete_notification', {
          p_notification_id: notificationId,
          p_manager_id: user?.id || '',
          p_processing_note: processingNote || '',
          p_customer_satisfaction: customerSatisfaction || null
        });

        if (error) {
          // RPC 실패 시 직접 업데이트 시도
          console.warn('⚠️ RPC 실패, 직접 업데이트 시도:', error.message);
          const { error: directError } = await supabase
            .from('notifications')
            .update({
              status: 'completed',
              processed_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('id', notificationId);
          if (directError) throw directError;
        } else if (data && !data.success) {
          throw new Error(data.message || '알림 처리 중 오류가 발생했습니다.');
        }
      } else if (status === 'read') {
        // 계정별 읽음 처리: notification_reads에 upsert
        const { error } = await supabase
          .from('notification_reads')
          .upsert(
            { notification_id: notificationId, user_id: user?.id || '', read_at: new Date().toISOString() },
            { onConflict: 'notification_id,user_id' }
          );
        if (error) throw error;
      } else {
        // processing/dismissed: 글로벌 DB 업데이트
        const { error } = await supabase
          .from('notifications')
          .update({
            status,
            updated_at: new Date().toISOString()
          })
          .eq('id', notificationId);
        if (error) throw error;
      }

      // DB에서 새로고침하여 UI 즉시 갱신
      await Promise.all([loadNotifications(), loadStats()]);
      setProcessingNote('');
      setCustomerSatisfaction(5);

      console.log(`✅ 알림 처리 완료: ${notificationId} → ${status}`);
    } catch (error) {
      console.error('❌ 알림 처리 실패:', error);
      alert('알림 처리에 실패했습니다.');
    }
  };

  // ID 배열을 청크로 분할 (URL 길이 초과 방지)
  const chunkArray = <T,>(arr: T[], size: number): T[][] => {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  };

  // 대량 상태 업데이트
  const handleBulkUpdateStatus = async (status: 'read' | 'completed') => {
    if (selectedIds.length === 0) return;

    if (!NOTIFICATIONS_ENABLED) {
      alert(NOTIFICATIONS_DISABLED_MESSAGE);
      return;
    }

    try {
      setIsBulkActionLoading(true);
      const selectedNotifications = notifications.filter(n => selectedIds.includes(n.id));

      const notificationsIds = selectedNotifications
        .filter(n => n.table_info === 'notifications')
        .map(n => n.id);

      const paymentNotificationsIds = selectedNotifications
        .filter(n => n.table_info === 'payment_notifications')
        .map(n => n.id);

      const updatePromises: Promise<any>[] = [];
      let errorMessages: string[] = [];

      // 1. notifications 테이블 업데이트
      if (notificationsIds.length > 0) {
        if (status === 'completed') {
          // RPC를 통한 개별 처리 (비즈니스 로직 보존)
          for (const id of notificationsIds) {
            updatePromises.push(
              supabase.rpc('complete_notification', {
                p_notification_id: id,
                p_manager_id: user?.id || '',
                p_processing_note: '대량 완료 처리',
                p_customer_satisfaction: null
              }).then(async (result) => {
                if (result.error) {
                  // RPC 실패 시 직접 업데이트 시도
                  console.warn(`⚠️ RPC 실패 (${id}), 직접 업데이트 시도:`, result.error.message);
                  const directResult = await supabase
                    .from('notifications')
                    .update({
                      status: 'completed',
                      processed_at: new Date().toISOString(),
                      updated_at: new Date().toISOString()
                    })
                    .eq('id', id);
                  if (directResult.error) {
                    errorMessages.push(directResult.error.message);
                  }
                }
                return result;
              })
            );
          }
        } else {
          // 계정별 일괄 읽음 처리: notification_reads에 bulk upsert (100개씩)
          const chunks = chunkArray(notificationsIds, 100);
          for (const chunk of chunks) {
            const rows = chunk.map((id) => ({
              notification_id: id,
              user_id: user?.id || '',
              read_at: new Date().toISOString(),
            }));
            updatePromises.push(
              supabase
                .from('notification_reads')
                .upsert(rows, { onConflict: 'notification_id,user_id' })
                .then(result => {
                  if (result.error) {
                    console.error('❌ 읽음 처리 실패:', result.error.message);
                    errorMessages.push(result.error.message);
                  }
                  return result;
                })
            );
          }
        }
      }

      // 2. payment_notifications 테이블 업데이트 (100개씩 청크 처리)
      if (paymentNotificationsIds.length > 0) {
        const payChunks = chunkArray(paymentNotificationsIds, 100);
        for (const chunk of payChunks) {
          updatePromises.push(
            supabase
              .from('payment_notifications')
              .update({
                is_sent: true,
                sent_at: new Date().toISOString()
              })
              .in('id', chunk)
              .then(result => {
                if (result.error) {
                  console.error('❌ 결제 알림 처리 실패:', result.error.message);
                  errorMessages.push(result.error.message);
                }
                return result;
              })
          );
        }
      }

      await Promise.all(updatePromises);

      // 에러 발생 시 사용자에게 알림
      if (errorMessages.length > 0) {
        const uniqueErrors = [...new Set(errorMessages)];
        console.error('❌ 일부 처리 실패:', uniqueErrors);
        alert(`일부 알림 처리에 실패했습니다:\n${uniqueErrors.join('\n')}`);
      } else {
        console.log(`✅ 대량 ${status} 처리 완료: ${selectedIds.length}건`);
        alert(`${selectedIds.length}건의 알림이 ${status === 'read' ? '읽음' : '완료'} 처리되었습니다.`);
      }

      // 선택 초기화 후 DB에서 새로고침
      setSelectedIds([]);
      await Promise.all([loadNotifications(), loadStats()]);

    } catch (error) {
      console.error('❌ 대량 처리 실패:', error);
      alert('대량 처리에 실패했습니다.');
    } finally {
      setIsBulkActionLoading(false);
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(notifications.map(n => n.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelect = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedIds(prev => [...prev, id]);
    } else {
      setSelectedIds(prev => prev.filter(i => i !== id));
    }
  };

  const handleNotificationClick = (notification: NotificationItem) => {
    if (!NOTIFICATIONS_ENABLED) {
      alert(NOTIFICATIONS_DISABLED_MESSAGE);
      return;
    }

    setSelectedNotification(notification);
    setShowModal(true);

    // 읽지 않음 상태면 읽음으로 변경
    if (notification.status === 'unread') {
      updateNotificationStatus(notification.id, 'read');
    }
  };

  if (initialLoading) {
    return (
      <ManagerLayout title="알림 관리" activeTab="notifications">
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
          <p className="ml-4 text-gray-600">알림을 불러오는 중...</p>
        </div>
      </ManagerLayout>
    );
  }

  if (!NOTIFICATIONS_ENABLED) {
    return (
      <ManagerLayout title="📬 알림 관리" activeTab="notifications">
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
            <div className="text-4xl mb-4">⏸️</div>
            <h2 className="text-lg font-bold text-gray-900 mb-2">알림 기능 임시 정지</h2>
            <p className="text-sm text-gray-600 mb-4">{NOTIFICATIONS_DISABLED_MESSAGE}</p>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-yellow-50 text-yellow-700 border border-yellow-200 text-sm">
              조회, 팝업, 상태 변경, 수동 발송이 모두 중지되어 있습니다.
            </div>
          </div>
        </div>
      </ManagerLayout>
    );
  }

  return (
    <ManagerLayout title="📬 알림 관리" activeTab="notifications">
      <div className="space-y-6">
        {/* 통계 카드 */}
        {/* 통계 요약 (콤팩트 모드) */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {
              setActiveTab('all');
              setCategoryFilter('all');
            }}
            className={`bg-white rounded pl-3 pr-2 py-1.5 shadow-sm border transition-all flex items-center gap-2 hover:border-blue-400 ${categoryFilter === 'all' && activeTab === 'all' ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-gray-200'
              }`}
          >
            <span className="text-xs font-bold text-gray-500">전체:</span>
            <span className="text-sm font-bold text-gray-900">{stats.total}</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('all');
              setCategoryFilter('견적');
            }}
            className={`bg-white rounded pl-3 pr-2 py-1.5 shadow-sm border transition-all flex items-center gap-2 hover:border-blue-400 ${categoryFilter === '견적' ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-gray-200'
              }`}
          >
            <span className="text-xs font-bold text-blue-500">견적:</span>
            <span className="text-sm font-bold text-blue-700">{stats.quote}</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('all');
              setCategoryFilter('예약');
            }}
            className={`bg-white rounded pl-3 pr-2 py-1.5 shadow-sm border transition-all flex items-center gap-2 hover:border-green-400 ${categoryFilter === '예약' ? 'border-green-500 bg-green-50 ring-1 ring-green-500' : 'border-gray-200'
              }`}
          >
            <span className="text-xs font-bold text-green-500">예약:</span>
            <span className="text-sm font-bold text-green-700">{stats.reservation}</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('all');
              setCategoryFilter('결제');
            }}
            className={`bg-white rounded pl-3 pr-2 py-1.5 shadow-sm border transition-all flex items-center gap-2 hover:border-purple-400 ${categoryFilter === '결제' ? 'border-purple-500 bg-purple-50 ring-1 ring-purple-500' : 'border-gray-200'
              }`}
          >
            <span className="text-xs font-bold text-purple-500">결제:</span>
            <span className="text-sm font-bold text-purple-700">{stats.payment}</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('customer');
              setCategoryFilter('all');
              setStatusFilter('all'); // 데이터 표시 보장을 위해 상태 필터 해제
            }}
            className={`bg-white rounded pl-3 pr-2 py-1.5 shadow-sm border transition-all flex items-center gap-2 hover:border-orange-400 ${activeTab === 'customer' ? 'border-orange-500 bg-orange-50 ring-1 ring-orange-500' : 'border-gray-200'
              }`}
          >
            <span className="text-xs font-bold text-orange-500">고객:</span>
            <span className="text-sm font-bold text-orange-700">{stats.customer}</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('request');
              setCategoryFilter('all');
              setStatusFilter('all'); // 데이터 표시 보장을 위해 상태 필터 해제
            }}
            className={`bg-white rounded pl-3 pr-2 py-1.5 shadow-sm border transition-all flex items-center gap-2 hover:border-teal-400 ${activeTab === 'request' ? 'border-teal-500 bg-teal-50 ring-1 ring-teal-500' : 'border-gray-200'
              }`}
          >
            <span className="text-xs font-bold text-teal-500">고객요청:</span>
            <span className="text-sm font-bold text-teal-700">{stats.request}</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('sht-car');
              setCategoryFilter('all');
              setStatusFilter('all');
            }}
            className={`bg-white rounded pl-3 pr-2 py-1.5 shadow-sm border transition-all flex items-center gap-2 hover:border-indigo-400 ${activeTab === 'sht-car' ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500' : 'border-gray-200'
              }`}
          >
            <span className="text-xs font-bold text-indigo-500">스차:</span>
            <span className="text-sm font-bold text-indigo-700">{stats.shtCar}</span>
          </button>

          <div className="bg-white rounded pl-3 pr-2 py-1.5 shadow-sm border border-gray-200 flex items-center gap-2 select-none">
            <span className="text-xs font-bold text-red-500">읽지않음:</span>
            <span className="text-sm font-bold text-red-700">{stats.unread}</span>
          </div>

          <div className="bg-white rounded pl-3 pr-2 py-1.5 shadow-sm border border-gray-200 flex items-center gap-2 select-none">
            <span className="text-xs font-bold text-red-500 font-bold">긴급:</span>
            <span className="text-sm font-bold text-red-700">{stats.urgent}</span>
          </div>
          {/* 최상단 통계 옆 새로고침 버튼 */}
          <div className="flex items-center ml-2">
            <button
              onClick={async () => { await Promise.all([loadNotifications(), loadStats()]); }}
              className="px-3 py-1.5 rounded-lg text-sm font-medium bg-indigo-500 text-white hover:bg-indigo-600 transition-colors"
            >
              새로고침
            </button>
          </div>
        </div>

        {/* 필터 */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            {/* 상태 필터 버튼 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">상태 필터</label>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setStatusFilter('all')}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${statusFilter === 'all'
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                >
                  모든 상태
                </button>
                <button
                  onClick={() => setStatusFilter('unread')}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${statusFilter === 'unread'
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                >
                  읽지 않음
                </button>
                <button
                  onClick={() => setHideOldNotifications(prev => !prev)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1 ${
                    hideOldNotifications
                      ? 'bg-amber-500 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {hideOldNotifications ? '📅 오늘 이전 숨김' : '📅 오늘 이전 표시'}
                </button>

                {/* 전체 선택 체크박스 (이동됨) */}
                <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-100 hover:bg-gray-100 transition-colors ml-2">
                  <input
                    type="checkbox"
                    id="selectAllStatus"
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
                    checked={notifications.length > 0 && selectedIds.length === notifications.length}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                  />
                  <label htmlFor="selectAllStatus" className="text-sm font-medium text-gray-700 cursor-pointer select-none">전체선택</label>
                </div>
              </div>
            </div>

            {/* 우선순위 필터 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">우선순위 필터</label>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setPriorityFilter('all')}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${priorityFilter === 'all'
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                >
                  모든 우선순위
                </button>
                <button
                  onClick={() => setPriorityFilter('urgent')}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${priorityFilter === 'urgent'
                    ? 'bg-red-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                >
                  긴급
                </button>
                {/* (새로고침 버튼은 상단 통계 옆으로 이동) */}
                <button
                  onClick={() => setPriorityFilter('high')}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${priorityFilter === 'high'
                    ? 'bg-orange-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                >
                  높음
                </button>
                <button
                  onClick={() => setPriorityFilter('normal')}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${priorityFilter === 'normal'
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                >
                  보통
                </button>
                <button
                  onClick={() => setPriorityFilter('low')}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${priorityFilter === 'low'
                    ? 'bg-gray-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                >
                  낮음
                </button>
              </div>
            </div>
            {/* 알림 발송 버튼 (새로고침은 위 긴급 옆으로 이동) */}
            <div className="flex items-start lg:items-center gap-2">
              <button
                onClick={() => setShowSendModal(true)}
                className="px-4 py-2 rounded-lg text-sm font-bold bg-blue-600 text-white hover:bg-blue-700 shadow-sm transition-all flex items-center gap-2"
              >
                <span>📢</span> 알림 발송
              </button>
            </div>

          </div>
        </div>

        {/* 대량 액션 바 (선택 시 나타남) */}
        {selectedIds.length > 0 && (
          <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 z-40 w-full max-w-xl px-4">
            <div className="bg-white rounded-2xl shadow-2xl border border-blue-100 p-4 flex items-center justify-between gap-4 shadow-[0_20px_50px_rgba(8,_112,_184,_0.1)]">
              <div className="flex items-center gap-3">
                <div className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-sm font-bold">
                  {selectedIds.length}건 선택됨
                </div>
                <button
                  onClick={() => setSelectedIds([])}
                  className="text-gray-500 hover:text-gray-700 text-sm font-medium transition-colors"
                >
                  선택 해제
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleBulkUpdateStatus('read')}
                  disabled={isBulkActionLoading}
                  className="px-4 py-2 bg-blue-50 text-blue-600 rounded-lg text-sm font-bold hover:bg-blue-100 transition-colors disabled:opacity-50"
                >
                  {isBulkActionLoading ? '처리 중...' : '읽음 처리'}
                </button>
                <button
                  onClick={() => handleBulkUpdateStatus('completed')}
                  disabled={isBulkActionLoading}
                  className="px-4 py-2 bg-green-500 text-white rounded-lg text-sm font-bold hover:bg-green-600 shadow-sm transition-colors disabled:opacity-50"
                >
                  {isBulkActionLoading ? '처리 중...' : '완료 처리'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 알림 목록 - 외부 3열 카드 레이아웃 */}
        {(() => {
          const todayStart = new Date();
          todayStart.setHours(0, 0, 0, 0);
          const displayNotifications = hideOldNotifications
            ? notifications.filter(n => new Date(n.created_at) >= todayStart)
            : notifications;
          return (
        <div>
          {displayNotifications.length === 0 ? (
            <div className="bg-white rounded-lg shadow-sm p-12 text-center">
              <span className="text-4xl mb-4 block">📭</span>
              <h3 className="text-lg font-medium text-gray-900 mb-2">알림이 없습니다</h3>
              <p className="text-gray-600">새로운 알림이 도착하면 여기에 표시됩니다.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {displayNotifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`bg-white rounded-lg shadow-sm p-5 cursor-pointer transition transform hover:-translate-y-0.5 hover:shadow-md relative overflow-hidden ${notification.status === 'unread' ? 'ring-2 ring-blue-100' : ''
                    } ${selectedIds.includes(notification.id) ? 'bg-blue-50 ring-2 ring-blue-400 shadow-lg' : ''}`}
                >
                  {/* 선택 체크박스 */}
                  <div className="absolute top-2 left-2 z-10" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
                      checked={selectedIds.includes(notification.id)}
                      onChange={(e) => handleSelect(notification.id, e.target.checked)}
                    />
                  </div>

                  <div className="flex items-start justify-between pl-6" onClick={() => handleNotificationClick(notification)}>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-3 flex-wrap">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getPriorityColor(notification.priority)}`}>
                          {notification.priority === 'urgent' && '🚨 '}
                          {notification.priority === 'high' && '⚡ '}
                          {notification.priority === 'normal' && '📋 '}
                          {notification.priority === 'low' && '📄 '}
                          {getKoreanPriority(notification.priority)}
                        </span>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(notification.status)}`}>
                          {notification.status === 'unread' && '🔴 '}
                          {notification.status === 'read' && '👁️ '}
                          {notification.status === 'processing' && '⚙️ '}
                          {notification.status === 'completed' && '✅ '}
                          {notification.status === 'dismissed' && '❌ '}
                          {getKoreanStatus(notification.status)}
                        </span>
                        <span className="px-2 py-1 bg-gray-100 rounded-full text-xs font-medium text-gray-600">
                          {notification.type === 'business' ? '💼 업무' : '👥 고객'}
                        </span>
                        <span className="px-2 py-1 bg-purple-100 rounded-full text-xs font-medium text-purple-600">
                          {notification.category}
                        </span>
                      </div>

                      <h3 className="text-md font-semibold text-gray-900 mb-2 line-clamp-2">{getDisplayNotificationTitle(notification.title)}</h3>

                      {notification.customer_email && (
                        <div className="bg-blue-50 rounded-lg p-2 mb-3">
                          <div className="flex items-center gap-2 text-sm">
                            <span className="text-blue-600 font-medium">이메일:</span>
                            <span className="text-blue-600">{notification.customer_email}</span>
                          </div>
                        </div>
                      )}

                      {(() => {
                        if (isShtCarCancelRisk(notification)) {
                          const display = getShtCarCancelDisplayData(notification);
                          return (
                            <div className="text-gray-700 text-sm space-y-1 mb-3">
                              <div><span className="text-blue-600 font-semibold">픽업일:</span> {display.pickupDate}</div>
                              <div><span className="text-blue-600 font-semibold">차량:</span> {display.vehicleNumber}</div>
                              <div><span className="text-blue-600 font-semibold">좌석:</span> {display.seatsText}</div>
                              <div><span className="text-blue-600 font-semibold">예약자:</span> {display.namesText || '-'}</div>
                              <div><span className="text-blue-600 font-semibold">예약자 이메일:</span> {display.emailsText || '-'}</div>
                            </div>
                          );
                        }

                        const msg = notification.message || '';
                        // 중복 정보 제거: 고객/연락/견적/금액/상태 키-값 패턴을 제거
                        const cleaned = msg
                          .replace(/고객명:\s*[^\s]+\s*/g, '')
                          .replace(/이메일:\s*[^\s]+\s*/g, '')
                          .replace(/연락처:\s*[^\s]+\s*/g, '')
                          .replace(/고객ID:\s*[^\s-]+\s*/g, '')
                          .replace(/고객\s*ID:\s*[^\s-]+\s*/g, '')
                          .replace(/서비스:\s*[^\s]+\s*/g, '')
                          .replace(/견적명:\s*[^\s]+(?:\s+\d+)?\s*/g, '')
                          .replace(/총\s*금액:\s*[^\s]+\s*/g, '')
                          .replace(/예약\s*금액:\s*[^\s]+\s*/g, '')
                          .replace(/상태:\s*[^\s]+\s*/g, '')
                          .replace(/예약\s*상태:\s*[^\s]+\s*/g, '')
                          .trim();

                        const lines = parseNotificationMessageLines(cleaned || msg).slice(0, 4);
                        return (
                          <div className="text-gray-600 text-sm space-y-1 mb-3">
                            {lines.map((line, idx) => (
                              <div key={`${notification.id}-line-${idx}`}>
                                {line.label ? <span className="text-blue-600 font-semibold">{line.label}:</span> : null}
                                {line.label ? ' ' : ''}
                                {line.value || '-'}
                              </div>
                            ))}
                          </div>
                        );
                      })()}

                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <div>{new Date(notification.created_at).toLocaleString('ko-KR')}</div>
                        <div className="flex items-center space-x-2">
                          {notification.assigned_to && (
                            <span className="text-xs text-blue-600">담당자: {notification.assigned_to}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
          );
        })()}

        {/* 알림 상세 모달 */}
        {showModal && selectedNotification && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-lg font-bold text-gray-900">알림 상세 정보</h3>
                  <button
                    onClick={() => setShowModal(false)}
                    className="px-3 py-1 bg-gray-100 text-gray-600 rounded-md hover:bg-gray-200 text-sm transition-colors font-medium"
                  >
                    닫기
                  </button>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getPriorityColor(selectedNotification.priority)}`}>
                      {getKoreanPriority(selectedNotification.priority)}
                    </span>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(selectedNotification.status)}`}>
                      {getKoreanStatus(selectedNotification.status)}
                    </span>
                    <span className="px-2 py-1 bg-gray-100 rounded-full text-xs font-medium text-gray-600">
                      {selectedNotification.type === 'business' ? '💼 업무' : '👥 고객'}
                    </span>
                    <span className="px-2 py-1 bg-purple-100 rounded-full text-xs font-medium text-purple-600">
                      {selectedNotification.category}
                    </span>
                  </div>

                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">{getKoreanFieldName('title')}</h4>
                    <p className="text-gray-700">{getDisplayNotificationTitle(selectedNotification.title)}</p>
                  </div>

                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">{getKoreanFieldName('message')}</h4>
                    <div className="text-gray-700">
                      {(() => {
                        if (isShtCarCancelRisk(selectedNotification)) {
                          const display = getShtCarCancelDisplayData(selectedNotification);
                          return (
                            <div className="space-y-1">
                              <div><span className="text-blue-600 font-semibold">픽업일:</span> {display.pickupDate}</div>
                              <div><span className="text-blue-600 font-semibold">차량:</span> {display.vehicleNumber}</div>
                              <div><span className="text-blue-600 font-semibold">좌석:</span> {display.seatsText}</div>
                              <div><span className="text-blue-600 font-semibold">예약자:</span> {display.namesText || '-'}</div>
                              <div><span className="text-blue-600 font-semibold">예약자 이메일:</span> {display.emailsText || '-'}</div>
                            </div>
                          );
                        }

                        const lines = parseNotificationMessageLines(selectedNotification.message || '');
                        if (lines.length === 0) {
                          return <p className="whitespace-pre-line">{selectedNotification.message}</p>;
                        }

                        return (
                          <div className="space-y-1">
                            {lines.map((line, idx) => (
                              <div key={`${selectedNotification.id}-detail-line-${idx}`}>
                                {line.label ? <span className="text-blue-600 font-semibold">{line.label}:</span> : null}
                                {line.label ? ' ' : ''}
                                {line.value || '-'}
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {/* 고객 정보 표시 (고객 알림인 경우) */}
                  {selectedNotification.type === 'customer' && selectedNotification.customer_details && selectedNotification.customer_details[0] && (
                    <div className="bg-blue-50 p-4 rounded-lg">
                      <h4 className="font-medium text-blue-900 mb-2">👤 고객 정보</h4>
                      <div className="space-y-1 text-sm">
                        <div><span className="font-medium">이름:</span> {selectedNotification.customer_details[0].customer_name || '이름 정보 없음'}</div>
                        <div><span className="font-medium">이메일:</span> {selectedNotification.customer_details[0].customer_email || '이메일 정보 없음'}</div>
                        <div><span className="font-medium">연락처:</span> {selectedNotification.customer_details[0].customer_phone || '연락처 정보 없음'}</div>
                        <div><span className="font-medium">문의 유형:</span> {selectedNotification.customer_details[0].inquiry_type || '-'}</div>
                        <div><span className="font-medium">서비스 유형:</span> {selectedNotification.customer_details[0].service_type || '-'}</div>
                      </div>
                    </div>
                  )}

                  {/* 처리 매니저 정보 표시 (완료된 경우) */}
                  {selectedNotification.status === 'completed' && selectedNotification.processed_by_name && (
                    <div className="bg-green-50 p-4 rounded-lg">
                      <h4 className="font-medium text-green-900 mb-2">✅ 처리 정보</h4>
                      <div className="space-y-1 text-sm">
                        <div><span className="font-medium">처리 매니저:</span> {selectedNotification.processed_by_name}</div>
                        {selectedNotification.processed_at && (
                          <div><span className="font-medium">처리 완료:</span> {new Date(selectedNotification.processed_at).toLocaleString('ko-KR')}</div>
                        )}
                        {selectedNotification.processing_note && (
                          <div className="mt-2 p-2 bg-white rounded border border-green-100">
                            <span className="font-medium block mb-1">처리 내용:</span>
                            <div className="text-gray-700 whitespace-pre-line">{selectedNotification.processing_note}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-medium text-gray-600">{getKoreanFieldName('created_at')}:</span>
                      <p className="text-gray-800">{new Date(selectedNotification.created_at).toLocaleString('ko-KR')}</p>
                    </div>
                    {selectedNotification.processed_at && (
                      <div>
                        <span className="font-medium text-gray-600">{getKoreanFieldName('processed_at')}:</span>
                        <p className="text-gray-800">{new Date(selectedNotification.processed_at).toLocaleString('ko-KR')}</p>
                      </div>
                    )}
                  </div>

                  {/* 처리 메모 입력 */}
                  {selectedNotification.status !== 'completed' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        처리 메모
                      </label>
                      <textarea
                        value={processingNote}
                        onChange={(e) => setProcessingNote(e.target.value)}
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="처리 내용을 입력하세요..."
                      />
                    </div>
                  )}

                  {/* 고객 만족도 (고객 알림인 경우) */}
                  {selectedNotification.type === 'customer' && selectedNotification.status !== 'completed' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        고객 만족도 (1-5점)
                      </label>
                      <select
                        value={customerSatisfaction}
                        onChange={(e) => setCustomerSatisfaction(Number(e.target.value))}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value={5}>5점 (매우 만족)</option>
                        <option value={4}>4점 (만족)</option>
                        <option value={3}>3점 (보통)</option>
                        <option value={2}>2점 (불만족)</option>
                        <option value={1}>1점 (매우 불만족)</option>
                      </select>
                    </div>
                  )}
                </div>

                {/* 액션 버튼 */}
                <div className="flex justify-end space-x-3 mt-6">
                  <button
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                  >
                    닫기
                  </button>

                  {selectedNotification.status !== 'completed' && (
                    <>
                      {/* 읽음 또는 읽지 않음 상태일 때 '처리중'으로 변경하는 버튼 */}
                      {(selectedNotification.status === 'unread' || selectedNotification.status === 'read') && (
                        <button
                          onClick={async () => {
                            await updateNotificationStatus(selectedNotification.id, 'processing');
                            setShowModal(false);
                          }}
                          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                        >
                          처리 접수
                        </button>
                      )}

                      {/* 처리중 상태일 때 '완료'로 변경하는 버튼 */}
                      {selectedNotification.status === 'processing' && (
                        <button
                          onClick={async () => {
                            await updateNotificationStatus(selectedNotification.id, 'completed');
                            setShowModal(false);
                          }}
                          className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                        >
                          처리 완료
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 알림 발송 모달 */}
      <SendNotificationModal
        isOpen={showSendModal}
        onClose={() => setShowSendModal(false)}
        onSuccess={() => {
          loadNotifications();
          loadStats();
        }}
      />
    </ManagerLayout>
  );
}
