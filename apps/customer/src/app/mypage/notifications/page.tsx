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

function toYmdInKst(value: string | null | undefined): string | null {
  if (!value) return null;

  const plainYmd = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(plainYmd)) return plainYmd;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  return formatter.format(date);
}

function diffDaysFromToday(targetDate: string | null | undefined): number | null {
  const targetYmd = toYmdInKst(targetDate);
  if (!targetYmd) return null;

  const todayYmd = toYmdInKst(new Date().toISOString());
  if (!todayYmd) return null;

  const targetMs = Date.parse(`${targetYmd}T00:00:00Z`);
  const todayMs = Date.parse(`${todayYmd}T00:00:00Z`);
  return Math.round((targetMs - todayMs) / (1000 * 60 * 60 * 24));
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

  const getAccessToken = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    return sessionData.session?.access_token || '';
  };

  useEffect(() => {
    let cancelled = false;

    const fetchNotifications = async () => {
      if (!user?.id) return;

      try {
        setLoading(true);
        const token = await getAccessToken();
        const response = await fetch('/api/notifications', {
          cache: 'no-store',
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
        const result = await response.json().catch(() => ({}));

        if (!cancelled) {
          if (!response.ok) {
            throw new Error(result?.error || '알림 조회 실패');
          }
          setNotifications(normalizeNotifications(Array.isArray(result?.rows) ? result.rows : []));
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
              if (days === null || days < 0 || days > rule.daysBefore) return;

              const serviceLabel = serviceLabelMap[serviceType] || serviceType;
              dynamicReminders.push({
                id: `${rule.id}:${rule.dateBasis}:${reservation.re_id}:${serviceDate}:${days}`,
                title: applyTemplate(rule.title, serviceLabel, days, serviceDate),
                body: applyTemplate(rule.body, serviceLabel, days, serviceDate),
                serviceType,
                serviceDate,
                daysBefore: days,
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
      const token = await getAccessToken();
      const response = await fetch('/api/notifications', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ mode: 'single', notificationId }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.error || '읽음 처리 실패');
      }

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
      const token = await getAccessToken();
      const response = await fetch('/api/notifications', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ mode: 'all' }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.error || '전체 읽음 처리 실패');
      }

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

  return (
    <PageWrapper title="알림">
      <div className="space-y-3">
        {/* 동적 사전알림 */}
        {runtimeLoading ? (
          <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-800">
            고객 사전알림을 계산 중입니다...
          </div>
        ) : runtimeReminders.length > 0 ? (
          <div className="space-y-2">
            {runtimeReminders.map((reminder) => (
              <div
                key={reminder.id}
                className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3"
              >
                <div className="flex items-start gap-3">
                  <p className="text-sm font-semibold text-indigo-900">{reminder.title}</p>
                </div>
                <p className="mt-1 text-xs text-indigo-800">{reminder.body}</p>
                <p className="mt-1 text-[11px] text-indigo-600">서비스일: {formatDate(reminder.serviceDate)} · {reminder.daysBefore}일 전 안내 (0시 기준)</p>
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
                    {!notification.is_read && (
                      <div className="mt-2">
                        <button
                          type="button"
                          onClick={() => handleMarkAsRead(notification.id)}
                          className="rounded-md bg-blue-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-blue-700"
                        >
                          읽음
                        </button>
                      </div>
                    )}
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
