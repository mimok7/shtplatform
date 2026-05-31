'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageWrapper from '@/components/PageWrapper';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';

type ReminderServiceType = 'cruise' | 'airport' | 'rentcar' | 'hotel' | 'tour' | 'ticket' | 'package';

type ReminderDateBasis =
  | 'checkin'
  | 'pickup'
  | 'dropoff'
  | 'rentcar_pickup'
  | 'rentcar_return'
  | 'usage'
  | 'start';

type CustomerReminderRule = {
  id: string;
  serviceType: ReminderServiceType;
  dateBasis: ReminderDateBasis;
  label: string;
  enabled: boolean;
  daysBefore: number;
  title: string;
  body: string;
};

type CustomerReminderSettings = {
  updatedAt: string;
  updatedBy: string;
  rules: CustomerReminderRule[];
};

type RuntimeReminder = {
  id: string;
  title: string;
  body: string;
  serviceType: ReminderServiceType;
  serviceDate: string;
  daysBefore: number;
};

function toDateOnly(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function diffDaysFromToday(targetDate: string | null | undefined): number | null {
  const target = toDateOnly(targetDate);
  if (!target) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffMs = target.getTime() - today.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function applyTemplate(template: string, serviceLabel: string, days: number, serviceDate: string): string {
  return template
    .replaceAll('{service}', serviceLabel)
    .replaceAll('{days}', String(days))
    .replaceAll('{date}', formatDate(serviceDate));
}

export default function NotificationsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [runtimeReminders, setRuntimeReminders] = useState<RuntimeReminder[]>([]);
  const [runtimeLoading, setRuntimeLoading] = useState(true);
  const [dismissedReminderKeys, setDismissedReminderKeys] = useState<string[]>([]);

  const normalizeNotifications = (rows: any[]) => (
    (rows || []).map((row: any) => {
      const isRead = typeof row?.is_read === 'boolean'
        ? row.is_read
        : ['read', 'completed'].includes(String(row?.status || '').toLowerCase());
      return {
        ...row,
        is_read: isRead,
        description: row?.description ?? row?.message ?? '',
      };
    })
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const key = `customer_runtime_reminders_dismissed_${new Date().toISOString().slice(0, 10)}`;
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      setDismissedReminderKeys([]);
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      setDismissedReminderKeys(Array.isArray(parsed) ? parsed : []);
    } catch {
      setDismissedReminderKeys([]);
    }
  }, []);

  const dismissReminderForToday = (reminderId: string) => {
    if (typeof window === 'undefined') return;
    const key = `customer_runtime_reminders_dismissed_${new Date().toISOString().slice(0, 10)}`;
    setDismissedReminderKeys((prev) => {
      if (prev.includes(reminderId)) return prev;
      const next = [...prev, reminderId];
      window.localStorage.setItem(key, JSON.stringify(next));
      return next;
    });
  };

  useEffect(() => {
    let cancelled = false;

    const fetchNotifications = async () => {
      if (!user?.id) return;

      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('notifications')
          .select('*')
          .eq('assigned_to', user.id)
          .order('created_at', { ascending: false });

        if (!cancelled) {
          if (error) throw error;
          setNotifications(normalizeNotifications(data || []));
        }
      } catch (err) {
        console.error('알림 조회 실패:', err);
        if (!cancelled) {
          setNotifications([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    if (user?.id) {
      fetchNotifications();
    }

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    let cancelled = false;

    const fetchRuntimeReminders = async () => {
      if (!user?.id) return;

      try {
        setRuntimeLoading(true);

        const settingsRes = await fetch('/api/customer-reminder-settings', { cache: 'no-store' });
        const settingsJson = await settingsRes.json().catch(() => ({}));
        if (!settingsRes.ok) {
          throw new Error(settingsJson?.error || '고객 사전알림 설정을 불러오지 못했습니다.');
        }

        const settings = settingsJson as CustomerReminderSettings;
        const enabledRules = (settings.rules || []).filter((rule) => rule.enabled);
        if (enabledRules.length === 0) {
          if (!cancelled) setRuntimeReminders([]);
          return;
        }

        const serviceLabelMap: Record<ReminderServiceType, string> = {
          cruise: '크루즈',
          airport: '공항',
          rentcar: '렌트카',
          hotel: '호텔',
          tour: '투어',
          ticket: '티켓',
          package: '패키지',
        };

        const { data: reservations, error: reservationError } = await supabase
          .from('reservation')
          .select('re_id, re_type, reservation_date')
          .eq('re_user_id', user.id);

        if (reservationError) throw reservationError;

        const list = reservations || [];
        const cruiseIds = list.filter((r: any) => r.re_type === 'cruise').map((r: any) => r.re_id);
        const airportIds = list.filter((r: any) => r.re_type === 'airport').map((r: any) => r.re_id);
        const rentcarIds = list.filter((r: any) => r.re_type === 'rentcar').map((r: any) => r.re_id);
        const hotelIds = list.filter((r: any) => r.re_type === 'hotel').map((r: any) => r.re_id);
        const tourIds = list.filter((r: any) => r.re_type === 'tour').map((r: any) => r.re_id);
        const ticketIds = list.filter((r: any) => r.re_type === 'ticket').map((r: any) => r.re_id);

        const [cruiseRes, airportRes, rentcarRes, hotelRes, tourRes, ticketRes] = await Promise.all([
          cruiseIds.length > 0
            ? supabase.from('reservation_cruise').select('reservation_id, checkin').in('reservation_id', cruiseIds)
            : Promise.resolve({ data: [], error: null } as any),
          airportIds.length > 0
            ? supabase.from('reservation_airport').select('reservation_id, ra_datetime, way_type').in('reservation_id', airportIds)
            : Promise.resolve({ data: [], error: null } as any),
          rentcarIds.length > 0
            ? supabase.from('reservation_rentcar').select('reservation_id, pickup_datetime, return_datetime').in('reservation_id', rentcarIds)
            : Promise.resolve({ data: [], error: null } as any),
          hotelIds.length > 0
            ? supabase.from('reservation_hotel').select('reservation_id, checkin_date').in('reservation_id', hotelIds)
            : Promise.resolve({ data: [], error: null } as any),
          tourIds.length > 0
            ? supabase.from('reservation_tour').select('reservation_id, usage_date').in('reservation_id', tourIds)
            : Promise.resolve({ data: [], error: null } as any),
          ticketIds.length > 0
            ? supabase.from('reservation_ticket').select('reservation_id, usage_date').in('reservation_id', ticketIds)
            : Promise.resolve({ data: [], error: null } as any),
        ]);

        const cruiseMap = new Map<string, string>();
        (cruiseRes.data || []).forEach((row: any) => cruiseMap.set(row.reservation_id, row.checkin));
        const airportPickupMap = new Map<string, string>();
        const airportDropoffMap = new Map<string, string>();
        (airportRes.data || []).forEach((row: any) => {
          const wayType = String(row.way_type || '').toLowerCase();
          if (wayType === 'dropoff') {
            airportDropoffMap.set(row.reservation_id, row.ra_datetime);
          } else {
            airportPickupMap.set(row.reservation_id, row.ra_datetime);
          }
        });
        const rentcarPickupMap = new Map<string, string>();
        const rentcarReturnMap = new Map<string, string>();
        (rentcarRes.data || []).forEach((row: any) => {
          rentcarPickupMap.set(row.reservation_id, row.pickup_datetime);
          if (row.return_datetime) {
            rentcarReturnMap.set(row.reservation_id, row.return_datetime);
          }
        });
        const hotelMap = new Map<string, string>();
        (hotelRes.data || []).forEach((row: any) => hotelMap.set(row.reservation_id, row.checkin_date));
        const tourMap = new Map<string, string>();
        (tourRes.data || []).forEach((row: any) => tourMap.set(row.reservation_id, row.usage_date));
        const ticketMap = new Map<string, string>();
        (ticketRes.data || []).forEach((row: any) => ticketMap.set(row.reservation_id, row.usage_date));

        const resolveServiceDate = (reservation: any, dateBasis: ReminderDateBasis): string | null => {
          if (reservation.re_type === 'cruise') {
            if (dateBasis === 'checkin') return cruiseMap.get(reservation.re_id) || null;
            return null;
          }
          if (reservation.re_type === 'airport') {
            if (dateBasis === 'dropoff') return airportDropoffMap.get(reservation.re_id) || null;
            if (dateBasis === 'pickup') return airportPickupMap.get(reservation.re_id) || null;
            return null;
          }
          if (reservation.re_type === 'rentcar') {
            if (dateBasis === 'rentcar_return') return rentcarReturnMap.get(reservation.re_id) || null;
            if (dateBasis === 'rentcar_pickup') return rentcarPickupMap.get(reservation.re_id) || null;
            return null;
          }
          if (reservation.re_type === 'hotel') {
            if (dateBasis === 'checkin') return hotelMap.get(reservation.re_id) || null;
            return null;
          }
          if (reservation.re_type === 'tour') {
            if (dateBasis === 'usage') return tourMap.get(reservation.re_id) || null;
            return null;
          }
          if (reservation.re_type === 'ticket') {
            if (dateBasis === 'usage') return ticketMap.get(reservation.re_id) || null;
            return null;
          }
          if (reservation.re_type === 'package') {
            if (dateBasis === 'start') return reservation.reservation_date || null;
            return null;
          }
          return null;
        };

        const dynamicReminders: RuntimeReminder[] = [];

        list.forEach((reservation: any) => {
          const serviceType = reservation.re_type as ReminderServiceType;
          enabledRules
            .filter((rule) => rule.serviceType === serviceType)
            .forEach((rule) => {
              const serviceDate = resolveServiceDate(reservation, rule.dateBasis);
              if (!serviceDate) return;
              const days = diffDaysFromToday(serviceDate);
              if (days === null || days !== rule.daysBefore) return;

              const serviceLabel = serviceLabelMap[serviceType] || serviceType;
              dynamicReminders.push({
                id: `${rule.id}:${rule.dateBasis}:${reservation.re_id}:${serviceDate}`,
                title: applyTemplate(rule.title, serviceLabel, rule.daysBefore, serviceDate),
                body: applyTemplate(rule.body, serviceLabel, rule.daysBefore, serviceDate),
                serviceType,
                serviceDate,
                daysBefore: rule.daysBefore,
              });
            });
        });

        dynamicReminders.sort((a, b) => new Date(a.serviceDate).getTime() - new Date(b.serviceDate).getTime());

        if (!cancelled) {
          setRuntimeReminders(dynamicReminders);
        }
      } catch (err) {
        console.error('동적 사전알림 조회 실패:', err);
        if (!cancelled) {
          setRuntimeReminders([]);
        }
      } finally {
        if (!cancelled) {
          setRuntimeLoading(false);
        }
      }
    };

    if (user?.id) {
      fetchRuntimeReminders();
    }

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const handleMarkAsRead = async (notificationId: string) => {
    try {
      await supabase
        .from('notifications')
        .update({ status: 'read' })
        .eq('id', notificationId);

      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, is_read: true, status: 'read' } : n)
      );
    } catch (err) {
      console.error('알림 읽음 처리 실패:', err);
    }
  };

  const handleMarkAllAsRead = async () => {
    const unreadIds = notifications
      .filter(n => !n.is_read)
      .map(n => n.id);

    if (unreadIds.length === 0) return;

    try {
      await supabase
        .from('notifications')
        .update({ status: 'read' })
        .in('id', unreadIds);

      setNotifications(prev =>
        prev.map(n => ({ ...n, is_read: true, status: 'read' }))
      );
    } catch (err) {
      console.error('알림 모두 읽음 처리 실패:', err);
    }
  };

  if (authLoading) {
    return (
      <PageWrapper title="알림">
        <div className="flex justify-center items-center h-72">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </PageWrapper>
    );
  }

  const unreadCount = notifications.filter(n => !n.is_read).length;
  const visibleRuntimeReminders = runtimeReminders.filter((reminder) => !dismissedReminderKeys.includes(reminder.id));

  return (
    <PageWrapper title="알림">
      <div className="space-y-3">
        {/* DB 미저장 동적 사전알림 */}
        {runtimeLoading ? (
          <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-800">
            고객 사전알림을 계산 중입니다...
          </div>
        ) : visibleRuntimeReminders.length > 0 ? (
          <div className="space-y-2">
            {visibleRuntimeReminders.map((reminder) => (
              <div
                key={reminder.id}
                className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-semibold text-indigo-900">{reminder.title}</p>
                  <button
                    type="button"
                    onClick={() => dismissReminderForToday(reminder.id)}
                    className="shrink-0 rounded-md border border-indigo-300 bg-white px-2 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100"
                  >
                    오늘만 숨기기
                  </button>
                </div>
                <p className="mt-1 text-xs text-indigo-800">{reminder.body}</p>
                <p className="mt-1 text-[11px] text-indigo-600">서비스일: {formatDate(reminder.serviceDate)} · {reminder.daysBefore}일 전 안내</p>
              </div>
            ))}
          </div>
        ) : null}

        {/* 헤더: 전체 읽음 버튼 */}
        {unreadCount > 0 && (
          <div className="flex justify-end">
            <button
              onClick={handleMarkAllAsRead}
              className="px-3 py-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 transition"
            >
              모두 읽음
            </button>
          </div>
        )}

        {/* 알림 목록 */}
        {loading ? (
          <div className="flex justify-center items-center h-72">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        ) : notifications.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-slate-500 text-sm">받은 알림이 없습니다</p>
          </div>
        ) : (
          <div className="space-y-2">
            {notifications.map((notification: any) => (
              <div
                key={notification.id}
                onClick={() => handleMarkAsRead(notification.id)}
                className={`border rounded-lg p-3 cursor-pointer transition ${
                  !notification.is_read
                    ? 'bg-blue-50 border-blue-200 hover:bg-blue-100'
                    : 'bg-white border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-start gap-3">
                  {!notification.is_read && (
                    <div className="w-2 h-2 rounded-full bg-blue-600 mt-2 flex-shrink-0"></div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${
                      !notification.is_read
                        ? 'font-semibold text-slate-900'
                        : 'font-medium text-slate-700'
                    } break-words`}>
                      {notification.title}
                    </p>
                    {notification.description && (
                      <p className="text-xs text-slate-500 mt-1">
                        {notification.description}
                      </p>
                    )}
                    <p className="text-xs text-slate-400 mt-1.5">
                      {new Date(notification.created_at).toLocaleDateString('ko-KR', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </PageWrapper>
  );
}
