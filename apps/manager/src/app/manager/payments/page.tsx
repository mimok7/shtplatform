'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ManagerLayout from '@/components/ManagerLayout';
import supabase from '@/lib/supabase';
import { NOTIFICATIONS_DISABLED_MESSAGE, NOTIFICATIONS_ENABLED } from '@/lib/notificationFeature';
import {
  CreditCard,
  DollarSign,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Clock,
  Search,
  Eye,
  Bell,
  Calendar,
} from 'lucide-react';

interface Reservation {
  re_id: string;
  re_user_id: string;
  re_quote_id: string;
  re_type: string;
  re_status: string;
  total_amount: number;
  paid_amount: number;
  payment_status: 'pending' | 'partial' | 'completed' | 'overdue';
  payment_plan: 'full' | 'split';
  checkin_date?: string;
  customer_phone?: string;
  customer_name?: string;
  customer_email?: string;
  quote_title?: string;
  created_at: string;
  interim_due_date?: string;
  final_due_date?: string;
}

interface GroupedReservation {
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  reservations: Reservation[];
}

interface Payment {
  id: string;
  reservation_id: string;
  payment_type: 'deposit' | 'interim' | 'final' | 'full';
  payment_amount: number;
  payment_date: string;
  payment_status: 'pending' | 'completed' | 'cancelled' | 'overdue';
  payment_method?: string;
  payment_reference?: string;
  notes?: string;
  interim_due_date?: string;
  final_due_date?: string;
}

interface Notification {
  id: string;
  reservation_id: string;
  notification_type: 'checkin_reminder' | 'payment_due' | 'payment_overdue';
  notification_date: string;
  is_sent: boolean;
  message_content: string;
  priority?: 'normal' | 'high' | 'urgent';
}

// 결제 상태/수단 텍스트 변환
const getPaymentStatusText = (status: string) => {
  const statusMap: Record<string, string> = {
    pending: '미결제',
    partial: '부분결제',
    completed: '결제 완료',
    overdue: '연체'
  };
  return statusMap[status] || status;
};

const getPaymentStatusIcon = (status: string) => {
  switch (status) {
    case 'completed': return <CheckCircle className="w-5 h-5 text-green-600" />;
    case 'overdue': return <AlertCircle className="w-5 h-5 text-red-600" />;
    case 'partial': return <CreditCard className="w-5 h-5 text-blue-600" />;
    default: return <Clock className="w-5 h-5 text-yellow-600" />;
  }
};

const getPaymentMethodText = (method: string) => {
  const methodMap: Record<string, string> = {
    card: '신용카드',
    vnd: '베트남동',
    bank_transfer: '계좌이체',
    cash: '현금',
    other: '기타'
  };
  return methodMap[method] || method || '신용카드';
};

export default function ManagerPaymentsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'partial' | 'completed' | 'overdue'>('pending');
  const [showGroupPaymentModal, setShowGroupPaymentModal] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<GroupedReservation | null>(null);
  const [globalStats, setGlobalStats] = useState({ total: 0, pending: 0, partial: 0, completed: 0, overdue: 0 });

  // 새 결제 등록 폼 상태
  const [newPayment, setNewPayment] = useState({
    payment_type: 'deposit' as Payment['payment_type'],
    payment_amount: 0,
    payment_date: new Date().toISOString().split('T')[0],
    payment_method: 'card',
    payment_reference: '',
    notes: '',
    interim_due_date: '',
    final_due_date: ''
  });
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user: authUser }, error } = await supabase.auth.getUser();
      if (error || !authUser) {
        router.push('/login');
        return;
      }
      setUser(authUser);
      setLoading(false);
    };
    checkAuth();
  }, []);

  useEffect(() => {
    if (loading === false) {
      loadReservations();
      loadNotifications();
      loadGlobalStats();
    }
  }, [filter, loading]);

  const loadGlobalStats = async () => {
    try {
      // 각 상태별 건수를 병렬로 집계 (필터 무관하게 전체 통계)
      const [totalRes, pendingRes, partialRes, completedRes, overdueRes] = await Promise.all([
        supabase.from('reservation').select('*', { count: 'exact', head: true }).neq('re_type', 'car_sht'),
        supabase.from('reservation').select('*', { count: 'exact', head: true }).neq('re_type', 'car_sht').eq('payment_status', 'pending'),
        supabase.from('reservation').select('*', { count: 'exact', head: true }).neq('re_type', 'car_sht').eq('payment_status', 'partial'),
        supabase.from('reservation').select('*', { count: 'exact', head: true }).neq('re_type', 'car_sht').eq('payment_status', 'completed'),
        supabase.from('reservation').select('*', { count: 'exact', head: true }).neq('re_type', 'car_sht').eq('payment_status', 'overdue'),
      ]);
      setGlobalStats({
        total: totalRes.count ?? 0,
        pending: pendingRes.count ?? 0,
        partial: partialRes.count ?? 0,
        completed: completedRes.count ?? 0,
        overdue: overdueRes.count ?? 0,
      });
    } catch (e) {
      console.error('globalStats 로드 오류:', e);
    }
  };

  // checkAuth 제거됨 - useAuth 훅 사용

  const loadReservations = async () => {
    try {
      setRefreshing(true);

      // 1. 예약 정보 조회 (사용자 조인 제거)
      let query = supabase
        .from('reservation')
        .select(`
          re_id,
          re_user_id,
          re_quote_id,
          re_type,
          re_status,
          total_amount,
          paid_amount,
          payment_status,
          re_created_at
        `)
        .neq('re_type', 'car_sht')
        .order('re_created_at', { ascending: false });

      if (filter !== 'all') {
        query = query.eq('payment_status', filter);
      }

      const { data: reservationData, error } = await query;

      if (error) {
        console.error('예약 데이터 로드 실패:', error);
        alert('예약 데이터를 불러오는데 실패했습니다.');
        return;
      }

      if (!reservationData || reservationData.length === 0) {
        setReservations([]);
        return;
      }

      // 2. 사용자 정보 + quote 정보 병렬 조회
      const userIds = [...new Set(reservationData.map(r => r.re_user_id).filter(Boolean))];
      const quoteIds = [...new Set(reservationData.map(r => r.re_quote_id).filter(Boolean))];
      let usersMap = new Map();
      let quotesMap = new Map();

      await Promise.all([
        (async () => {
          if (userIds.length > 0) {
            const { data: usersData, error: userError } = await supabase
              .from('users')
              .select('id, name, email, phone_number')
              .in('id', userIds);
            if (!userError && usersData) {
              usersData.forEach(user => usersMap.set(user.id, user));
            }
          }
        })(),
        (async () => {
          if (quoteIds.length > 0) {
            const { data: quotesData, error: quoteError } = await supabase
              .from('quote')
              .select('id, title, quote_id')
              .in('id', quoteIds);
            if (!quoteError && quotesData) {
              quotesData.forEach(q => quotesMap.set(q.id, q));
            }
          }
        })()
      ]);

      // 3. 데이터 결합 및 중복 제거
      const reservationsArray = reservationData.map(r => {
        const userInfo = usersMap.get(r.re_user_id);
        const quoteInfo = quotesMap.get(r.re_quote_id);
        return {
          re_id: r.re_id,
          re_user_id: r.re_user_id,
          re_quote_id: r.re_quote_id,
          re_type: r.re_type,
          re_status: r.re_status,
          total_amount: r.total_amount || 0,
          paid_amount: r.paid_amount || 0,
          payment_status: r.payment_status || 'pending',
          customer_name: userInfo?.name || '이름 없음',
          customer_email: userInfo?.email || '이메일 없음',
          customer_phone: userInfo?.phone_number || '연락처 없음',
          quote_title: quoteInfo?.title || `견적 ${r.re_quote_id?.split('-')[0] || '미연결'}`,
          created_at: r.re_created_at
        };
      });

      // quote_id 기준 정렬 (같은 quote끼리 묶이도록)
      reservationsArray.sort((a, b) => {
        const qA = (a.re_quote_id || '').toLowerCase();
        const qB = (b.re_quote_id || '').toLowerCase();
        if (qA < qB) return -1;
        if (qA > qB) return 1;
        return 0;
      });
      setReservations(reservationsArray);

      console.log(`✅ 예약 데이터 로드 완료: ${reservationsArray.length}개 (이름순 정렬)`);
    } catch (error) {
      console.error('예약 로드 오류:', error);
      alert('예약 데이터를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setRefreshing(false);
    }
  };

  const loadPayments = async (reservationId: string) => {
    try {
      const { data, error } = await supabase
        .from('reservation_payments')
        .select('*')
        .eq('reservation_id', reservationId)
        .order('payment_date', { ascending: true });

      if (error) {
        console.error('결제 내역 로드 실패:', error);
        return;
      }

      setPayments(data || []);
    } catch (error) {
      console.error('결제 내역 로드 오류:', error);
    }
  };

  // 결제 예정일 기반 알림 자동 생성
  const generatePaymentNotifications = async () => {
    if (!NOTIFICATIONS_ENABLED) {
      return;
    }

    try {
      const today = new Date();
      const threeDaysFromNow = new Date(today);
      threeDaysFromNow.setDate(today.getDate() + 3);

      // 1. 모든 예약과 결제 정보 조회
      const { data: reservations, error: reservationError } = await supabase
        .from('reservation')
        .select(`
          re_id,
          re_user_id,
          payment_status
        `)
        .neq('payment_status', 'completed');

      if (reservationError || !reservations) {
        console.error('예약 정보 조회 실패:', reservationError);
        return;
      }

      // 1.1 사용자 정보 별도 조회
      const userIds = [...new Set(reservations.map(r => r.re_user_id).filter(Boolean))];
      let usersMap = new Map();

      if (userIds.length > 0) {
        const { data: usersData, error: userError } = await supabase
          .from('users')
          .select('id, name, email, phone_number')
          .in('id', userIds);

        if (!userError && usersData) {
          usersData.forEach(user => usersMap.set(user.id, user));
        }
      }

      // 2. 결제 정보 조회 (예정일 포함)
      const { data: payments, error: paymentError } = await supabase
        .from('reservation_payments')
        .select('reservation_id, interim_due_date, final_due_date, payment_type, payment_status');

      if (paymentError) {
        console.error('결제 정보 조회 실패:', paymentError);
        return;
      }

      // 3. 서비스별 상세 예약에서 이용일 수집 (체크인/픽업/투어 등)
      const [
        cruiseRes,
        hotelRes,
        rentcarRes,
        airportRes,
        tourRes
      ] = await Promise.all([
        supabase.from('reservation_cruise').select('reservation_id, checkin'),
        supabase.from('reservation_hotel').select('reservation_id, checkin_date'),
        supabase.from('reservation_rentcar').select('reservation_id, pickup_datetime'),
        supabase.from('reservation_airport').select('reservation_id, ra_datetime'),
        supabase.from('reservation_tour').select('reservation_id, usage_date')
      ]);

      const serviceDatesMap = new Map<string, Date[]>();

      const addServiceDate = (reservationId?: string | null, dateStr?: string | null) => {
        if (!reservationId || !dateStr) return;
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return;
        const arr = serviceDatesMap.get(reservationId) || [];
        arr.push(d);
        serviceDatesMap.set(reservationId, arr);
      };

      if (cruiseRes?.data) {
        for (const row of cruiseRes.data as any[]) {
          addServiceDate(row.reservation_id, row.checkin);
        }
      } else if (cruiseRes?.error) {
        console.warn('reservation_cruise 조회 경고:', cruiseRes.error);
      }

      if (hotelRes?.data) {
        for (const row of hotelRes.data as any[]) {
          addServiceDate(row.reservation_id, row.checkin_date);
        }
      } else if (hotelRes?.error) {
        console.warn('reservation_hotel 조회 경고:', hotelRes.error);
      }

      if (rentcarRes?.data) {
        for (const row of rentcarRes.data as any[]) {
          addServiceDate(row.reservation_id, row.pickup_datetime);
        }
      } else if (rentcarRes?.error) {
        console.warn('reservation_rentcar 조회 경고:', rentcarRes.error);
      }

      if (airportRes?.data) {
        for (const row of airportRes.data as any[]) {
          addServiceDate(row.reservation_id, row.ra_datetime);
        }
      } else if (airportRes?.error) {
        console.warn('reservation_airport 조회 경고:', airportRes.error);
      }

      if (tourRes?.data) {
        for (const row of tourRes.data as any[]) {
          addServiceDate(row.reservation_id, row.usage_date);
        }
      } else if (tourRes?.error) {
        console.warn('reservation_tour 조회 경고:', tourRes.error);
      }

      const notifications = [] as any[];

      for (const reservation of reservations) {
        const userInfo = usersMap.get(reservation.re_user_id);
        const customerName = userInfo?.name || '고객';

        // 결제 예정일 알림 및 긴급 알림
        const reservationPayments = payments?.filter(p => p.reservation_id === reservation.re_id) || [];

        for (const payment of reservationPayments) {
          // 중도금 예정일 알림
          if (payment.interim_due_date && payment.payment_status !== 'completed') {
            const dueDate = new Date(payment.interim_due_date);
            const reminderDate = new Date(dueDate);
            reminderDate.setDate(dueDate.getDate() - 1); // 1일 전 알림

            if (reminderDate <= today) {
              // 예정일이 지났으면 긴급 알림
              if (dueDate < today) {
                notifications.push({
                  id: crypto.randomUUID(),
                  reservation_id: reservation.re_id,
                  notification_type: 'payment_overdue',
                  notification_date: today.toISOString().split('T')[0],
                  message_content: `🚨 긴급: ${customerName}님의 중도금 결제가 연체되었습니다. (예정일: ${dueDate.toLocaleDateString()})`,
                  priority: 'urgent',
                  is_sent: false,
                  created_at: new Date().toISOString()
                });
              } else {
                notifications.push({
                  id: crypto.randomUUID(),
                  reservation_id: reservation.re_id,
                  notification_type: 'payment_due',
                  notification_date: reminderDate.toISOString().split('T')[0],
                  message_content: `${customerName}님의 중도금 결제 예정일이 내일입니다. (${dueDate.toLocaleDateString()})`,
                  priority: 'high',
                  is_sent: false,
                  created_at: new Date().toISOString()
                });
              }
            }
          }

          // 잔금 예정일 알림
          if (payment.final_due_date && payment.payment_status !== 'completed') {
            const dueDate = new Date(payment.final_due_date);
            const reminderDate = new Date(dueDate);
            reminderDate.setDate(dueDate.getDate() - 1);

            if (reminderDate <= today) {
              if (dueDate < today) {
                notifications.push({
                  id: crypto.randomUUID(),
                  reservation_id: reservation.re_id,
                  notification_type: 'payment_overdue',
                  notification_date: today.toISOString().split('T')[0],
                  message_content: `🚨 긴급: ${customerName}님의 잔금 결제가 연체되었습니다. (예정일: ${dueDate.toLocaleDateString()})`,
                  priority: 'urgent',
                  is_sent: false,
                  created_at: new Date().toISOString()
                });
              } else {
                notifications.push({
                  id: crypto.randomUUID(),
                  reservation_id: reservation.re_id,
                  notification_type: 'payment_due',
                  notification_date: reminderDate.toISOString().split('T')[0],
                  message_content: `${customerName}님의 잔금 결제 예정일이 내일입니다. (${dueDate.toLocaleDateString()})`,
                  priority: 'high',
                  is_sent: false,
                  created_at: new Date().toISOString()
                });
              }
            }
          }
        }
        // 서비스 이용일 3일 전 체크인 알림 (호텔/크루즈/렌터카/공항/투어 등)
        const serviceDates = serviceDatesMap.get(reservation.re_id) || [];
        for (const serviceDate of serviceDates) {
          const reminderDate = new Date(serviceDate);
          reminderDate.setDate(serviceDate.getDate() - 3);
          // 오늘~3일 내 도달하는 알림만 생성
          if (reminderDate >= new Date(today.toDateString()) && reminderDate <= threeDaysFromNow) {
            notifications.push({
              id: crypto.randomUUID(),
              reservation_id: reservation.re_id,
              notification_type: 'checkin_reminder',
              notification_date: reminderDate.toISOString().split('T')[0],
              message_content: `${customerName}님의 체크인이 3일 후입니다. 일정과 결제 상태를 확인해주세요.`,
              priority: 'normal',
              is_sent: false,
              created_at: new Date().toISOString()
            });
          }
        }
      }

      // 3. 중복 알림 제거 및 저장
      if (notifications.length > 0) {
        for (const notification of notifications) {
          // 기존 알림 중복 체크
          const { data: existing } = await supabase
            .from('payment_notifications')
            .select('id')
            .eq('reservation_id', notification.reservation_id)
            .eq('notification_type', notification.notification_type)
            .eq('notification_date', notification.notification_date)
            .eq('is_sent', false);

          if (!existing || existing.length === 0) {
            await supabase
              .from('payment_notifications')
              .insert(notification);
          }
        }

        console.log('✅ 자동 알림 생성 완료:', notifications.length, '개');
      }

    } catch (error) {
      console.error('알림 생성 오류:', error);
    }
  };

  const loadNotifications = async () => {
    if (!NOTIFICATIONS_ENABLED) {
      setNotifications([]);
      return;
    }

    try {
      await generatePaymentNotifications(); // 알림 자동 생성

      // 1. 알림 데이터 조회 (체크인 3일 전부터, 미처리 알림, 긴급 알림)
      const { data: notificationData, error } = await supabase
        .from('payment_notifications')
        .select('*')
        .eq('is_sent', false)
        .order('notification_date', { ascending: true });

      if (error) {
        console.error('알림 데이터 로드 실패:', error);
        return;
      }

      console.log('🔔 로드된 알림 데이터:', notificationData?.length, '개');

      if (!notificationData || notificationData.length === 0) {
        setNotifications([]);
        return;
      }

      // 2. 예약 정보 별도 조회
      const reservationIds = [...new Set(notificationData.map(n => n.reservation_id).filter(Boolean))];
      let reservationsData: any[] = [];

      if (reservationIds.length > 0) {
        const { data: reservationInfo, error: reservationError } = await supabase
          .from('reservation')
          .select('re_id, re_user_id, checkin_date')
          .in('re_id', reservationIds);

        if (reservationError) {
          console.error('예약 정보 로드 실패:', reservationError);
        } else {
          reservationsData = reservationInfo || [];
        }
      }

      // 중첩된 generatePaymentNotifications 정의 제거 (상위 함수 사용)

      // 사용자 ID 수집 및 데이터 조회
      const userIds = [...new Set(reservationsData.map(r => r.re_user_id).filter(Boolean))];
      let usersData: any[] = [];

      if (userIds.length > 0) {
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('id, name, phone_number')
          .in('id', userIds);

        if (userError) {
          console.error('사용자 정보 로드 실패:', userError);
        } else {
          usersData = userData || [];
        }
      }

      // 4. 데이터 맵 생성
      const reservationMap = new Map();
      reservationsData.forEach((reservation: any) => {
        reservationMap.set(reservation.re_id, reservation);
      });

      const userMap = new Map();
      usersData.forEach((user: any) => {
        userMap.set(user.id, user);
      });

      // 5. 알림 데이터에 관련 정보 결합
      const enrichedNotifications = notificationData.map(notification => {
        const reservation = reservationMap.get(notification.reservation_id);
        const user = reservation ? userMap.get(reservation.re_user_id) : null;

        return {
          ...notification,
          reservation: {
            re_id: notification.reservation_id,
            users: user ? { name: user.name, phone_number: user.phone_number } : { name: '이름 없음', phone_number: '연락처 없음' }
          }
        };
      });

      setNotifications(enrichedNotifications);
    } catch (error) {
      console.error('알림 로드 오류:', error);
    }
  };

  // 🔄 새로고침 함수
  const handleRefresh = async () => {
    console.log('🔄 데이터 새로고침 시작...');
    setRefreshing(true);

    try {
      await Promise.all([
        loadReservations(),
        loadNotifications(),
        loadGlobalStats()
      ]);
      console.log('✅ 데이터 새로고침 완료');
    } catch (error) {
      console.error('❌ 새로고침 오류:', error);
      alert('데이터 새로고침 중 오류가 발생했습니다.');
    } finally {
      setRefreshing(false);
    }
  };

  const handleReservationClick = async (reservation: Reservation) => {
    setSelectedReservation(reservation);
    await loadPayments(reservation.re_id);
    setShowPaymentModal(true);
  };

  const handleAddPayment = async () => {
    if (!selectedReservation) return;

    try {
      const { error } = await supabase
        .from('reservation_payments')
        .insert({
          reservation_id: selectedReservation.re_id,
          payment_type: newPayment.payment_type,
          payment_amount: newPayment.payment_amount,
          payment_date: newPayment.payment_date,
          payment_method: newPayment.payment_method,
          transaction_id: newPayment.payment_reference,
          notes: newPayment.notes,
          payment_status: 'completed' // 등록시 즉시 완료로 처리
        });

      if (error) {
        console.error('결제 등록 실패:', error);
        alert('결제 등록에 실패했습니다.');
        return;
      }

      alert('결제가 등록되었습니다.');

      // 관련 데이터 새로고침
      await Promise.all([
        loadPayments(selectedReservation.re_id),
        handleRefresh() // 전체 데이터 새로고침
      ]);

      // 폼 초기화
      setNewPayment({
        payment_type: 'deposit',
        payment_amount: 0,
        payment_date: new Date().toISOString().split('T')[0],
        payment_method: 'card',
        payment_reference: '',
        notes: '',
        interim_due_date: '',
        final_due_date: ''
      });
    } catch (error) {
      console.error('결제 등록 오류:', error);
      alert('결제 등록 중 오류가 발생했습니다.');
    }
  };

  const handleGroupPaymentClick = (groupReservations: Reservation[]) => {
    const first = groupReservations[0];
    setSelectedGroup({
      customer_name: first.customer_name || '이름 없음',
      customer_email: first.customer_email || '이메일 없음',
      customer_phone: first.customer_phone || '연락처 없음',
      reservations: groupReservations
    });
    setShowGroupPaymentModal(true);
  };

  const handleAddGroupPayment = async () => {
    if (!selectedGroup) return;

    try {
      setRefreshing(true);
      const paymentDate = newPayment.payment_date;
      const paymentMethod = newPayment.payment_method;
      const notes = `${newPayment.notes} (통합 결제)`;

      // 각 예약별로 결제 정보 등록
      const paymentInserts = selectedGroup.reservations.map(res => ({
        reservation_id: res.re_id,
        payment_type: newPayment.payment_type,
        payment_amount: res.total_amount - res.paid_amount > 0 ? res.total_amount - res.paid_amount : 0, // 미결제 잔액 전액
        payment_date: paymentDate,
        payment_method: paymentMethod,
        transaction_id: newPayment.payment_reference,
        notes: notes,
        payment_status: 'completed'
      })).filter(p => p.payment_amount > 0);

      if (paymentInserts.length === 0) {
        alert('결제할 잔액이 있는 예약이 없습니다.');
        setRefreshing(false);
        return;
      }

      const { error } = await supabase
        .from('reservation_payments')
        .insert(paymentInserts);

      if (error) throw error;

      alert(`${paymentInserts.length}건의 통합 결제가 완료되었습니다.`);
      setShowGroupPaymentModal(false);
      await handleRefresh();
    } catch (error) {
      console.error('통합 결제 등록 오류:', error);
      alert('통합 결제 중 오류가 발생했습니다.');
    } finally {
      setRefreshing(false);
    }
  };

  const handleMarkNotificationSent = async (notificationId: string) => {
    if (!NOTIFICATIONS_ENABLED) {
      alert(NOTIFICATIONS_DISABLED_MESSAGE);
      return;
    }

    try {
      const { error } = await supabase
        .from('payment_notifications')
        .update({
          is_sent: true,
          sent_at: new Date().toISOString()
        })
        .eq('id', notificationId);

      if (error) {
        console.error('알림 상태 업데이트 실패:', error);
        return;
      }

      await loadNotifications();
    } catch (error) {
      console.error('알림 상태 업데이트 오류:', error);
    }
  };

  const getPaymentStatusBadge = (status: string) => {
    const badgeMap: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800',
      partial: 'bg-blue-100 text-blue-800',
      completed: 'bg-green-100 text-green-800',
      overdue: 'bg-red-100 text-red-800'
    };

    const labelMap: Record<string, string> = {
      pending: '미결제',
      partial: '부분결제',
      completed: '완료',
      overdue: '연체'
    };

    return (
      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${badgeMap[status] || 'bg-gray-100 text-gray-800'}`}>
        {labelMap[status] || status}
      </span>
    );
  };

  const getPaymentTypeBadge = (type: string) => {
    const labelMap: Record<string, string> = {
      deposit: '예약금',
      interim: '중도금',
      final: '잔금',
      full: '일시불'
    };

    return (
      <span className="inline-flex px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded">
        {labelMap[type] || type}
      </span>
    );
  };

  if (loading) {
    return (
      <ManagerLayout title="예약 결제 관리" activeTab="payments">
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        </div>
      </ManagerLayout>
    );
  }

  return (
    <ManagerLayout title="💰 결제 현황 대시보드" activeTab="payments">
      <div className="space-y-8">
        {/* 페이지 설명 */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-5">
          <h2 className="text-lg font-semibold text-blue-900 mb-2">📊 결제 현황 대시보드</h2>
          <p className="text-blue-700 text-sm">
            전체 예약의 결제 현황을 모니터링하고, 분할 결제 진행 상황을 추적합니다.
            <br />실제 결제 처리는 <strong>예약 결제 처리 페이지</strong>에서 수행하세요.
          </p>
        </div>

        {/* 통계 카드 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white p-5 rounded-lg shadow-sm">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <DollarSign className="h-8 w-8 text-gray-400" />
              </div>
              <div className="ml-4">
                <div className="text-sm font-medium text-green-800">총 예약</div>
                <div className="text-2xl font-bold text-gray-900">
                  {refreshing ? '...' : `${globalStats.total.toLocaleString()}건`}
                </div>
              </div>
            </div>
          </div>
          <div className="bg-white p-5 rounded-lg shadow-sm">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Clock className="h-8 w-8 text-yellow-400" />
              </div>
              <div className="ml-4">
                <div className="text-sm font-medium text-green-800">미결제</div>
                <div className="text-2xl font-bold text-yellow-600">
                  {refreshing ? '...' : `${globalStats.pending.toLocaleString()}건`}
                </div>
              </div>
            </div>
          </div>
          <div className="bg-white p-5 rounded-lg shadow-sm">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <CreditCard className="h-8 w-8 text-blue-400" />
              </div>
              <div className="ml-4">
                <div className="text-sm font-medium text-green-800">부분결제</div>
                <div className="text-2xl font-bold text-blue-600">
                  {refreshing ? '...' : `${globalStats.partial.toLocaleString()}건`}
                </div>
              </div>
            </div>
          </div>
          <div className="bg-white p-5 rounded-lg shadow-sm">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <CheckCircle className="h-8 w-8 text-green-400" />
              </div>
              <div className="ml-4">
                <div className="text-sm font-medium text-green-800">결제완료</div>
                <div className="text-2xl font-bold text-green-600">
                  {refreshing ? '...' : `${globalStats.completed.toLocaleString()}건`}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 검색 및 필터 */}
        <div className="bg-white rounded-lg shadow-sm p-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex items-center gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="행복여행명, 고객명, 이메일 검색..."
                  className="pl-10 pr-4 py-2 border border-gray-200 rounded-md"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="flex gap-2 flex-wrap">
                {[
                  { label: '전체', value: 'all' },
                  { label: '미결제', value: 'pending' },
                  { label: '부분결제', value: 'partial' },
                  { label: '완료', value: 'completed' },
                  { label: '연체', value: 'overdue' }
                ].map(opt => (
                  <button
                    key={opt.value}
                    className={`px-3 py-2 rounded-md text-sm border transition-all ${filter === opt.value
                      ? 'bg-blue-50 text-blue-600 border-blue-300'
                      : 'bg-white text-gray-600 border-gray-200 hover:bg-blue-50'
                      }`}
                    onClick={() => setFilter(opt.value as any)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* 새로고침 버튼 */}
              <button
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all ${refreshing
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed border-gray-200'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                  }`}
                onClick={handleRefresh}
                disabled={refreshing}
              >
                <TrendingUp className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                {refreshing ? '새로고침 중...' : '새로고침'}
              </button>

              {/* 알림 버튼 */}
              <button
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${NOTIFICATIONS_ENABLED
                  ? 'bg-orange-500 text-white hover:bg-orange-600'
                  : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                  }`}
                onClick={() => {
                  if (!NOTIFICATIONS_ENABLED) {
                    alert(NOTIFICATIONS_DISABLED_MESSAGE);
                    return;
                  }
                  setShowNotificationModal(true);
                }}
                disabled={!NOTIFICATIONS_ENABLED}
              >
                <Bell className="w-4 h-4" />
                {NOTIFICATIONS_ENABLED ? `알림 (${notifications.length})` : '알림 중지'}
              </button>
            </div>
          </div>
        </div>

        {/* 예약 목록 - 카드 그리드 형식 */}
        <div className="space-y-8">
          {refreshing ? (
            <div className="flex justify-center items-center h-64">
              <div className="flex flex-col items-center justify-center">
                <TrendingUp className="w-8 h-8 text-gray-400 animate-spin mb-2" />
                <p className="text-gray-500">데이터를 새로고침 중입니다...</p>
              </div>
            </div>
          ) : reservations.length === 0 ? (
            <div className="flex justify-center items-center h-64">
              <div className="flex flex-col items-center justify-center">
                <CreditCard className="w-12 h-12 text-gray-300 mb-4" />
                <p className="text-gray-500 text-lg mb-2">예약 데이터가 없습니다</p>
                <p className="text-gray-400 text-sm mb-4">
                  {filter !== 'all' ? `${filter} 상태의 예약이 없습니다.` : '등록된 예약이 없습니다.'}
                </p>
                <button
                  className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                  onClick={handleRefresh}
                >
                  <TrendingUp className="w-4 h-4" />
                  새로고침
                </button>
              </div>
            </div>
          ) : (() => {
            // quote_id 기준 그룹화 로직
            const searchLower = searchTerm.toLowerCase();
            const filteredReservations = searchTerm
              ? reservations.filter(r =>
                (r.customer_name || '').toLowerCase().includes(searchLower) ||
                (r.customer_email || '').toLowerCase().includes(searchLower) ||
                (r.quote_title || '').toLowerCase().includes(searchLower) ||
                (r.re_quote_id || '').toLowerCase().includes(searchLower)
              )
              : reservations;

            const groups: { [key: string]: Reservation[] } = {};
            filteredReservations.forEach(r => {
              const key = r.re_quote_id || 'unknown';
              if (!groups[key]) groups[key] = [];
              groups[key].push(r);
            });

            return (
              <div className="flex flex-col gap-5">
                {Object.values(groups).map((groupReservations, gIdx) => {
                  const totalAmount = groupReservations.reduce((sum, r) => sum + (r.total_amount || 0), 0);
                  const paidAmount = groupReservations.reduce((sum, r) => sum + (r.paid_amount || 0), 0);
                  const pendingCount = groupReservations.filter(r => r.payment_status === 'pending').length;
                  const partialCount = groupReservations.filter(r => r.payment_status === 'partial').length;
                  const completedCount = groupReservations.filter(r => r.payment_status === 'completed').length;
                  const overdueCount = groupReservations.filter(r => r.payment_status === 'overdue').length;
                  const pendingAmount = totalAmount - paidAmount;

                  return (
                    <div key={`quote-${gIdx}`} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
                      {/* 견적 그룹 헤더 - payment-processing 스타일 */}
                      <div className="bg-gray-50 border-b p-4 flex flex-wrap items-center justify-between gap-4">
                        <div className="flex items-center gap-3 flex-1">
                          <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-bold text-xs">
                            견적
                          </div>
                          <div>
                            <div className="font-bold text-gray-900 text-lg">
                              고객: {groupReservations[0].customer_name || '고객 정보 없음'}
                            </div>
                            <div className="text-xs text-gray-500 flex flex-wrap gap-2 mt-1">
                              <span>{groupReservations[0].quote_title}</span>
                              <span>ID: {groupReservations[0].re_quote_id?.split('-')[0]}</span>
                              <span className="text-gray-400">{groupReservations[0].customer_email}</span>
                              <span>· 📞 {groupReservations[0].customer_phone}</span>
                              <span>· 총 {groupReservations.length}건의 예약</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-6">
                          <div className="flex gap-2">
                            {pendingCount > 0 && (
                              <div className="flex items-center gap-1 px-2.5 py-1 bg-yellow-50 text-yellow-700 rounded-full border border-yellow-100 font-medium text-xs">
                                <Clock className="w-3 h-3" />
                                미결제 {pendingCount}
                              </div>
                            )}
                            {partialCount > 0 && (
                              <div className="flex items-center gap-1 px-2.5 py-1 bg-orange-50 text-orange-700 rounded-full border border-orange-100 font-medium text-xs">
                                <CreditCard className="w-3 h-3" />
                                부분 {partialCount}
                              </div>
                            )}
                            {completedCount > 0 && (
                              <div className="flex items-center gap-1 px-2.5 py-1 bg-green-50 text-green-700 rounded-full border border-green-100 font-medium text-xs">
                                <CheckCircle className="w-3 h-3" />
                                완료 {completedCount}
                              </div>
                            )}
                            {overdueCount > 0 && (
                              <div className="flex items-center gap-1 px-2.5 py-1 bg-red-50 text-red-700 rounded-full border border-red-100 font-medium text-xs">
                                <AlertCircle className="w-3 h-3" />
                                연체 {overdueCount}
                              </div>
                            )}
                          </div>
                          <div className="text-right">
                            <div className="text-xs text-gray-500 font-medium mb-0.5">총 결제 금액</div>
                            <div className="text-xl font-black text-indigo-600">
                              {totalAmount.toLocaleString()} <span className="text-sm font-normal">동</span>
                            </div>
                          </div>
                          <button
                            className="px-3 py-1.5 rounded-lg text-xs font-bold border border-gray-300 text-gray-600 bg-white hover:bg-gray-50 transition-all"
                            onClick={() => handleGroupPaymentClick(groupReservations)}
                          >
                            💳 통합 결제
                          </button>
                        </div>
                      </div>

                      {/* 예약 테이블 */}
                      <div className="divide-y overflow-x-auto">
                        <table className="w-full text-sm text-left">
                          <thead className="bg-gray-50/50 text-gray-600 text-xs uppercase font-semibold">
                            <tr>
                              <th className="px-4 py-2.5">서비스</th>
                              <th className="px-4 py-2.5">총금액</th>
                              <th className="px-4 py-2.5">결제금액</th>
                              <th className="px-4 py-2.5">진행도</th>
                              <th className="px-4 py-2.5">상태</th>
                              <th className="px-4 py-2.5">이용일</th>
                              <th className="px-4 py-2.5">중도금</th>
                              <th className="px-4 py-2.5">잔금</th>
                              <th className="px-4 py-2.5 text-right">관리</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {groupReservations.map((reservation) => {
                              const progressPercent = reservation.total_amount > 0
                                ? Math.round((reservation.paid_amount / reservation.total_amount) * 100)
                                : 0;

                              return (
                                <tr key={reservation.re_id} className="hover:bg-gray-50/80 transition-colors">
                                  <td className="px-4 py-2.5 whitespace-nowrap">
                                    <div className="flex items-center gap-1.5">
                                      <span>
                                        {reservation.re_type === 'cruise' ? '🚢' :
                                          reservation.re_type === 'airport' ? '✈️' :
                                            reservation.re_type === 'hotel' ? '🏨' :
                                              reservation.re_type === 'tour' ? '🚩' :
                                                reservation.re_type === 'rentcar' ? '🚗' : '📋'}
                                      </span>
                                      <span className="font-medium capitalize text-gray-900 text-xs">{reservation.re_type}</span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-2.5 whitespace-nowrap text-gray-900 font-medium text-xs">
                                    {reservation.total_amount > 0 ? `${reservation.total_amount.toLocaleString()}원` : '-'}
                                  </td>
                                  <td className="px-4 py-2.5 whitespace-nowrap text-xs">
                                    <span className="font-bold text-gray-900">
                                      {reservation.paid_amount > 0 ? `${reservation.paid_amount.toLocaleString()}원` : '-'}
                                    </span>
                                  </td>
                                  <td className="px-4 py-2.5 whitespace-nowrap">
                                    <div className="flex items-center gap-1.5">
                                      <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                        <div
                                          className={`h-full ${progressPercent >= 100 ? 'bg-green-500' : 'bg-gray-500'}`}
                                          style={{ width: `${progressPercent}%` }}
                                        />
                                      </div>
                                      <span className="text-xs text-gray-500">{progressPercent}%</span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-2.5 whitespace-nowrap">
                                    {(() => {
                                      const s = reservation.payment_status;
                                      const colorClass = s === 'completed' ? 'bg-green-100 text-green-700' : s === 'partial' ? 'bg-orange-100 text-orange-700' : s === 'overdue' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700';
                                      const dotClass = s === 'completed' ? 'bg-green-500' : s === 'partial' ? 'bg-orange-500' : s === 'overdue' ? 'bg-red-500' : 'bg-yellow-500';
                                      const label = s === 'completed' ? '완료' : s === 'partial' ? '부분' : s === 'overdue' ? '연체' : '미결제';
                                      return (
                                        <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${colorClass}`}>
                                          <div className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
                                          {label}
                                        </div>
                                      );
                                    })()}
                                  </td>
                                  <td className="px-4 py-2.5 whitespace-nowrap text-xs text-gray-500">
                                    {reservation.checkin_date ? new Date(reservation.checkin_date).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' }) : '-'}
                                  </td>
                                  <td className="px-4 py-2.5 whitespace-nowrap text-xs text-gray-500">
                                    {reservation.interim_due_date ? new Date(reservation.interim_due_date).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' }) : '-'}
                                  </td>
                                  <td className="px-4 py-2.5 whitespace-nowrap text-xs text-gray-700 font-semibold">
                                    {reservation.final_due_date ? new Date(reservation.final_due_date).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' }) : '-'}
                                  </td>
                                  <td className="px-4 py-2.5 whitespace-nowrap text-right">
                                    <button
                                      className="px-3 py-1 bg-gray-800 text-white hover:bg-gray-900 rounded text-xs font-bold transition-colors"
                                      onClick={() => handleReservationClick(reservation)}
                                    >
                                      결제관리
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      {/* 그룹 하단 미결제 합계 */}
                      <div className="bg-gray-50/30 px-4 py-3 border-t flex justify-end gap-4">
                        <span className="text-gray-500 text-xs">미결제 잔액:</span>
                        <span className="text-xs font-bold text-red-600">{pendingAmount.toLocaleString()} 원</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>

        {/* 결제 관리 모달 */}
        {showPaymentModal && selectedReservation && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h3 className="text-lg font-medium text-gray-900">
                      고객: {selectedReservation.customer_name} ({selectedReservation.customer_phone})
                    </h3>
                    <p className="text-sm text-gray-500">
                      이메일: {selectedReservation.customer_email} |
                      총 금액: {selectedReservation.total_amount?.toLocaleString()}원 |
                      결제 금액: {selectedReservation.paid_amount?.toLocaleString()}원 |
                      상태: {getPaymentStatusBadge(selectedReservation.payment_status)}
                    </p>
                  </div>
                  <button
                    className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
                    onClick={() => setShowPaymentModal(false)}
                    aria-label="닫기"
                    title="닫기"
                  >
                    닫기
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* 기존 결제 내역 */}
                  <div>
                    <h4 className="text-md font-medium text-gray-900 mb-4">결제 내역</h4>
                    <div className="space-y-3">
                      {payments.map((payment) => (
                        <div key={payment.id} className="border rounded-lg p-4">
                          <div className="flex justify-between items-start">
                            <div>
                              {getPaymentTypeBadge(payment.payment_type)}
                              <div className="text-sm text-gray-600 mt-1">
                                {new Date(payment.payment_date).toLocaleDateString()}
                              </div>
                              {payment.payment_method && (
                                <div className="text-xs text-gray-500">
                                  결제수단: {getPaymentMethodText(payment.payment_method)}
                                </div>
                              )}
                            </div>
                            <div className="text-right">
                              <div className="text-lg font-bold text-gray-900">
                                {payment.payment_amount.toLocaleString()}원
                              </div>
                              {getPaymentStatusBadge(payment.payment_status)}
                            </div>
                          </div>
                          {payment.notes && (
                            <div className="text-sm text-gray-600 mt-2 border-t pt-2">
                              {payment.notes}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 새 결제 등록 */}
                  <div>
                    <div className="flex justify-between items-center mb-4">
                      <h4 className="text-md font-medium text-gray-900">새 결제 등록</h4>
                      <button
                        className="px-3 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 text-sm"
                        onClick={() => setShowPaymentModal(false)}
                      >
                        닫기
                      </button>
                    </div>
                    <div className="space-y-4">

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">결제일</label>
                        <input
                          type="date"
                          className="w-full px-3 py-2 border border-gray-300 rounded-md"
                          value={newPayment.payment_date || ''}
                          onChange={(e) => setNewPayment({ ...newPayment, payment_date: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">결제 유형</label>
                        <select
                          className="w-full px-3 py-2 border border-gray-300 rounded-md"
                          value={newPayment.payment_type}
                          onChange={(e) => {
                            const type = e.target.value as Payment['payment_type'];
                            if (type === 'full' && selectedReservation) {
                              setNewPayment({
                                ...newPayment,
                                payment_type: type,
                                payment_amount: selectedReservation.total_amount || 0
                              });
                            } else {
                              setNewPayment({
                                ...newPayment,
                                payment_type: type,
                                payment_amount: 0
                              });
                            }
                          }}
                        >
                          <option value="deposit">예약금</option>
                          <option value="interim">중도금</option>
                          <option value="final">잔금</option>
                          <option value="full">일시불</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">결제 금액</label>
                        <input
                          type="number"
                          className="w-full px-3 py-2 border border-gray-300 rounded-md"
                          min={0}
                          value={newPayment.payment_amount}
                          onChange={(e) => setNewPayment({ ...newPayment, payment_amount: Number(e.target.value) })}
                          disabled={Boolean(newPayment.payment_type === 'full' && selectedReservation)}
                        />
                        {newPayment.payment_type === 'full' && selectedReservation && (
                          <div className="text-xs text-blue-600 mt-1">총 결제 금액이 자동 입력됩니다.</div>
                        )}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">중도금 예정일</label>
                        <input
                          type="date"
                          className="w-full px-3 py-2 border border-gray-300 rounded-md"
                          value={newPayment.interim_due_date || ''}
                          onChange={(e) => setNewPayment({ ...newPayment, interim_due_date: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">잔금 예정일</label>
                        <input
                          type="date"
                          className="w-full px-3 py-2 border border-gray-300 rounded-md"
                          value={newPayment.final_due_date || ''}
                          onChange={(e) => setNewPayment({ ...newPayment, final_due_date: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">결제 수단</label>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className={`px-3 py-2 border rounded-md ${newPayment.payment_method === 'card' ? 'bg-blue-500 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300'}`}
                            onClick={() => setNewPayment({ ...newPayment, payment_method: 'card' })}
                          >
                            신용카드
                          </button>
                          <button
                            type="button"
                            className={`px-3 py-2 border rounded-md ${newPayment.payment_method === 'vnd' ? 'bg-blue-500 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300'}`}
                            onClick={() => setNewPayment({ ...newPayment, payment_method: 'vnd' })}
                          >
                            베트남동
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">참조번호</label>
                        <input
                          type="text"
                          className="w-full px-3 py-2 border border-gray-300 rounded-md"
                          placeholder="거래번호, 계좌번호 등"
                          value={newPayment.payment_reference}
                          onChange={(e) => setNewPayment({ ...newPayment, payment_reference: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">메모</label>
                        <textarea
                          className="w-full px-3 py-2 border border-gray-300 rounded-md"
                          rows={3}
                          value={newPayment.notes}
                          onChange={(e) => setNewPayment({ ...newPayment, notes: e.target.value })}
                        />
                      </div>
                      <button
                        className="w-full px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 mb-2"
                        onClick={handleAddPayment}
                      >
                        결제 등록
                      </button>
                      {/* 닫기 버튼은 상단으로 이동됨 */}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 알림 모달 */}
        {showNotificationModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-lg font-medium text-gray-900">알림 관리</h3>
                  <button
                    className="text-gray-400 hover:text-gray-600"
                    onClick={() => setShowNotificationModal(false)}
                  >
                    ✕
                  </button>
                </div>

                <div className="space-y-4">
                  {notifications.map((notification) => {
                    // 긴급도별 스타일 설정
                    const getPriorityStyle = (priority: string) => {
                      switch (priority) {
                        case 'urgent':
                          return 'border-red-500 bg-red-50';
                        case 'high':
                          return 'border-orange-500 bg-orange-50';
                        case 'normal':
                          return 'border-blue-500 bg-blue-50';
                        default:
                          return 'border-gray-200 bg-white';
                      }
                    };

                    const getPriorityIcon = (type: string, priority: string) => {
                      if (priority === 'urgent') return '🚨';
                      if (type === 'checkin_reminder') return '🏨';
                      if (type === 'payment_due') return '💳';
                      if (type === 'payment_overdue') return '⚠️';
                      return '📋';
                    };

                    return (
                      <div
                        key={notification.id}
                        className={`border-2 rounded-lg p-4 ${getPriorityStyle(String(notification.priority))}`}
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="text-sm font-medium text-gray-900 mb-2">
                              {getPriorityIcon(String(notification.notification_type), String(notification.priority))}
                              {notification.notification_type === 'checkin_reminder' && ' 체크인 알림'}
                              {notification.notification_type === 'payment_due' && ' 결제 기한 알림'}
                              {notification.notification_type === 'payment_overdue' && ' 결제 연체 알림'}
                              {notification.priority === 'urgent' && (
                                <span className="ml-2 px-2 py-1 bg-red-100 text-red-800 text-xs rounded font-bold">
                                  긴급
                                </span>
                              )}
                              {notification.priority === 'high' && (
                                <span className="ml-2 px-2 py-1 bg-orange-100 text-orange-800 text-xs rounded font-bold">
                                  중요
                                </span>
                              )}
                            </div>
                            <div className="text-sm text-gray-600 mt-1">
                              날짜: {new Date(notification.notification_date).toLocaleDateString()}
                            </div>
                            <div className="text-sm text-gray-700 font-medium mt-2">
                              {notification.message_content}
                            </div>
                          </div>
                          <button
                            className={`px-3 py-1 text-white text-xs rounded hover:opacity-80 ${notification.priority === 'urgent'
                              ? 'bg-red-500 hover:bg-red-600'
                              : 'bg-green-500 hover:bg-green-600'
                              }`}
                            onClick={() => handleMarkNotificationSent(notification.id)}
                          >
                            완료
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {notifications.length === 0 && (
                    <div className="text-center text-gray-500 py-8">
                      <Bell className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                      <p className="text-lg font-medium mb-2">현재 처리할 알림이 없습니다</p>
                      <p className="text-sm">모든 결제 일정이 정상적으로 관리되고 있습니다.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
        {/* 통합 결제 관리 모달 */}
        {showGroupPaymentModal && selectedGroup && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900 border-l-4 border-blue-600 pl-3">
                      통합 결제 관리 - {selectedGroup.customer_name}
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">이 고객의 모든 예약({selectedGroup.reservations.length}건)에 대해 일괄 결제를 처리합니다.</p>
                  </div>
                  <button className="text-gray-400 hover:text-gray-600 text-2xl" onClick={() => setShowGroupPaymentModal(false)}>×</button>
                </div>

                <div className="bg-gray-50 rounded-lg p-4 mb-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-xs text-gray-500 block uppercase">총 미결제 잔액</span>
                      <span className="text-xl font-bold text-red-600">
                        {selectedGroup.reservations.reduce((acc, res) => acc + (res.total_amount - res.paid_amount), 0).toLocaleString()}원
                      </span>
                    </div>
                    <div>
                      <span className="text-xs text-gray-500 block uppercase">대상 예약 목록</span>
                      <span className="text-sm font-medium text-gray-900">
                        {selectedGroup.reservations.map(res => res.re_type).join(', ')}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">결제일</label>
                      <input
                        type="date"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                        value={newPayment.payment_date}
                        onChange={(e) => setNewPayment({ ...newPayment, payment_date: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">결제 수단</label>
                      <select
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                        value={newPayment.payment_method}
                        onChange={(e) => setNewPayment({ ...newPayment, payment_method: e.target.value })}
                      >
                        <option value="card">신용카드</option>
                        <option value="vnd">베트남동</option>
                        <option value="bank_transfer">계좌이체</option>
                        <option value="cash">현금</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">결제 유형</label>
                    <select
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                      value={newPayment.payment_type}
                      onChange={(e) => setNewPayment({ ...newPayment, payment_type: e.target.value as any })}
                    >
                      <option value="full">잔액 전액 결제 (권장)</option>
                      <option value="deposit">예약금</option>
                      <option value="interim">중도금</option>
                      <option value="final">잔금</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">참조번호 / 메모</label>
                    <textarea
                      placeholder="통합 결제에 대한 참고사항을 입력하세요"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                      rows={3}
                      value={newPayment.notes}
                      onChange={(e) => setNewPayment({ ...newPayment, notes: e.target.value })}
                    />
                  </div>
                  <div className="pt-4 flex gap-3">
                    <button
                      className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-bold transition-all shadow-md disabled:opacity-50"
                      onClick={handleAddGroupPayment}
                      disabled={refreshing}
                    >
                      {refreshing ? '처리 중...' : '선택된 모든 예약 일괄 결제 수행'}
                    </button>
                    <button
                      className="px-4 py-3 bg-gray-100 text-gray-600 rounded-md hover:bg-gray-200 font-medium transition-all"
                      onClick={() => setShowGroupPaymentModal(false)}
                    >
                      취소
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </ManagerLayout>
  );
}
