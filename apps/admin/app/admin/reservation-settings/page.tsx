'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bell, Check, Loader2, Plus, RefreshCw, Save, ToggleLeft, ToggleRight } from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import supabase from '@/lib/supabase';

const APPS_TABLE = 'notification_apps';
const EVENT_TYPES_TABLE = 'notification_event_types';
const APP_EVENT_SETTINGS_TABLE = 'notification_app_event_settings';

type NotificationApp = {
  app_name: string;
  app_label: string;
  description: string | null;
  enabled: boolean;
  sort_order: number;
};

type NotificationEventType = {
  event_key: string;
  event_label: string;
  description: string | null;
  default_title: string | null;
  default_body: string | null;
  default_url: string | null;
  default_priority: 'low' | 'normal' | 'high' | 'urgent';
  is_active: boolean;
  sort_order: number;
};

type AppEventSetting = {
  app_name: string;
  event_key: string;
  enabled: boolean;
};

type SubscriptionCount = {
  app_name: string;
  total_count: number;
  active_count: number;
};

type EventDraft = {
  event_key: string;
  event_label: string;
  description: string;
  default_title: string;
  default_body: string;
  default_url: string;
  default_priority: 'low' | 'normal' | 'high' | 'urgent';
};

type ActiveSubscriberRow = {
  id: string;
  app_name: string;
  user_id: string | null;
  account_email: string | null;
  user_name: string | null;
  endpoint: string;
  user_agent: string | null;
  last_used_at: string | null;
  created_at: string | null;
};

const DEFAULT_DRAFT: EventDraft = {
  event_key: '',
  event_label: '',
  description: '',
  default_title: '',
  default_body: '',
  default_url: '',
  default_priority: 'normal',
};

const PRIORITY_LABELS = {
  low: '낮음',
  normal: '보통',
  high: '높음',
  urgent: '긴급',
};

function normalizeKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function formatDateTime(value: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('ko-KR');
}

function formatEndpoint(value: string) {
  if (!value) return '-';
  try {
    const url = new URL(value);
    return `${url.hostname}${url.pathname.slice(0, 24)}${url.pathname.length > 24 ? '...' : ''}`;
  } catch {
    return value.length > 36 ? `${value.slice(0, 36)}...` : value;
  }
}

function extractDeviceLabel(userAgent: string | null) {
  if (!userAgent) return '알 수 없음';
  const ua = userAgent.toLowerCase();

  const os = ua.includes('android')
    ? 'Android'
    : ua.includes('iphone') || ua.includes('ipad') || ua.includes('ios')
      ? 'iOS'
      : ua.includes('windows')
        ? 'Windows'
        : ua.includes('mac os') || ua.includes('macintosh')
          ? 'macOS'
          : ua.includes('linux')
            ? 'Linux'
            : '기타 OS';

  const browser = ua.includes('edg/')
    ? 'Edge'
    : ua.includes('chrome/')
      ? 'Chrome'
      : ua.includes('safari/') && !ua.includes('chrome/')
        ? 'Safari'
        : ua.includes('firefox/')
          ? 'Firefox'
          : '기타 브라우저';

  return `${os} · ${browser}`;
}

export default function ReservationSettingsPage() {
  const [apps, setApps] = useState<NotificationApp[]>([]);
  const [events, setEvents] = useState<NotificationEventType[]>([]);
  const [settings, setSettings] = useState<AppEventSetting[]>([]);
  const [counts, setCounts] = useState<SubscriptionCount[]>([]);
  const [adminUserId, setAdminUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [addingEvent, setAddingEvent] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [draft, setDraft] = useState<EventDraft>(DEFAULT_DRAFT);
  const [viewTab, setViewTab] = useState<'settings' | 'subscribers'>('settings');
  const [subscriberRows, setSubscriberRows] = useState<ActiveSubscriberRow[]>([]);
  const [subscribersLoading, setSubscribersLoading] = useState(false);
  const [subscriberAppFilter, setSubscriberAppFilter] = useState<string>('all');

  const countMap = useMemo(() => {
    return new Map(counts.map((count) => [count.app_name, count]));
  }, [counts]);

  const appNameSet = useMemo(() => {
    return new Set(apps.map((app) => app.app_name));
  }, [apps]);

  const settingMap = useMemo(() => {
    return new Map(settings.map((setting) => [`${setting.app_name}:${setting.event_key}`, setting]));
  }, [settings]);

  const appLabelMap = useMemo(() => {
    return new Map(apps.map((app) => [app.app_name, app.app_label]));
  }, [apps]);

  const enabledAppCount = apps.filter((app) => app.enabled).length;
  const activeEventCount = events.filter((event) => event.is_active).length;
  const activeSubscriptionCount = counts
    .filter((count) => appNameSet.has(count.app_name))
    .reduce((sum, count) => sum + Number(count.active_count || 0), 0);
  const unknownActiveSubscriptionCount = counts
    .filter((count) => !appNameSet.has(count.app_name))
    .reduce((sum, count) => sum + Number(count.active_count || 0), 0);

  const loadSettings = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);

    const { data: sessionData } = await supabase.auth.getSession();
    setAdminUserId(sessionData.session?.user?.id || null);

    const countsPromise = supabase.rpc('admin_get_push_subscription_app_counts');

    const [appsResult, eventsResult, settingsResult] = await Promise.all([
      supabase.from(APPS_TABLE).select('app_name, app_label, description, enabled, sort_order').order('sort_order', { ascending: true }),
      supabase.from(EVENT_TYPES_TABLE).select('event_key, event_label, description, default_title, default_body, default_url, default_priority, is_active, sort_order').order('sort_order', { ascending: true }),
      supabase.from(APP_EVENT_SETTINGS_TABLE).select('app_name, event_key, enabled'),
    ]);

    if (appsResult.error || eventsResult.error || settingsResult.error) {
      setApps([]);
      setEvents([]);
      setSettings([]);
      setCounts([]);
      setErrorMessage('예약설정 테이블이 아직 준비되지 않았습니다. sql/081-notification-app-settings.sql 을 먼저 실행해 주세요.');
      return;
    }

    setApps((appsResult.data || []) as NotificationApp[]);
    setEvents((eventsResult.data || []) as NotificationEventType[]);
    setSettings((settingsResult.data || []) as AppEventSetting[]);

    void countsPromise.then(({ data, error }) => {
      if (!error) {
        setCounts((data || []) as SubscriptionCount[]);
      }
    });
  };

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        await loadSettings();
      } catch (error) {
        console.error('예약설정 로드 실패:', error);
        if (!cancelled) {
          setErrorMessage('예약설정을 불러오지 못했습니다.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const saveAppEnabled = async (appName: string, nextEnabled: boolean) => {
    setSavingKey(`app:${appName}`);
    setErrorMessage(null);
    setSuccessMessage(null);

    const previousApps = apps;
    setApps((current) => current.map((app) => (app.app_name === appName ? { ...app, enabled: nextEnabled } : app)));

    const { error } = await supabase
      .from(APPS_TABLE)
      .update({
        enabled: nextEnabled,
        updated_by: adminUserId,
        updated_at: new Date().toISOString(),
      })
      .eq('app_name', appName);

    if (error) {
      setApps(previousApps);
      setErrorMessage('앱 푸시 설정 저장에 실패했습니다.');
    } else {
      setSuccessMessage('앱 푸시 설정을 저장했습니다.');
    }

    setSavingKey(null);
  };

  const saveEventEnabled = async (eventKey: string, nextEnabled: boolean) => {
    setSavingKey(`event:${eventKey}`);
    setErrorMessage(null);
    setSuccessMessage(null);

    const previousEvents = events;
    setEvents((current) => current.map((event) => (event.event_key === eventKey ? { ...event, is_active: nextEnabled } : event)));

    const { error } = await supabase
      .from(EVENT_TYPES_TABLE)
      .update({
        is_active: nextEnabled,
        updated_by: adminUserId,
        updated_at: new Date().toISOString(),
      })
      .eq('event_key', eventKey);

    if (error) {
      setEvents(previousEvents);
      setErrorMessage('알림 유형 설정 저장에 실패했습니다.');
    } else {
      setSuccessMessage('알림 유형 설정을 저장했습니다.');
    }

    setSavingKey(null);
  };

  const saveAppEventEnabled = async (appName: string, eventKey: string, nextEnabled: boolean) => {
    const key = `${appName}:${eventKey}`;
    setSavingKey(`setting:${key}`);
    setErrorMessage(null);
    setSuccessMessage(null);

    const previousSettings = settings;
    setSettings((current) => {
      const exists = current.some((setting) => setting.app_name === appName && setting.event_key === eventKey);
      if (exists) {
        return current.map((setting) => (setting.app_name === appName && setting.event_key === eventKey ? { ...setting, enabled: nextEnabled } : setting));
      }
      return [...current, { app_name: appName, event_key: eventKey, enabled: nextEnabled }];
    });

    const { error } = await supabase.from(APP_EVENT_SETTINGS_TABLE).upsert(
      {
        app_name: appName,
        event_key: eventKey,
        enabled: nextEnabled,
        updated_by: adminUserId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'app_name,event_key' }
    );

    if (error) {
      setSettings(previousSettings);
      setErrorMessage('앱별 알림 허용 설정 저장에 실패했습니다.');
    } else {
      setSuccessMessage('앱별 알림 허용 설정을 저장했습니다.');
    }

    setSavingKey(null);
  };

  const seedMissingSettings = async () => {
    setSeeding(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const rows = apps.flatMap((app) =>
      events.map((event) => ({
        app_name: app.app_name,
        event_key: event.event_key,
        enabled: true,
        updated_by: adminUserId,
        updated_at: new Date().toISOString(),
      }))
    );

    const { error } = await supabase.from(APP_EVENT_SETTINGS_TABLE).upsert(rows, { onConflict: 'app_name,event_key', ignoreDuplicates: true });

    if (error) {
      setErrorMessage('누락된 앱별 설정 생성에 실패했습니다.');
    } else {
      setSuccessMessage('누락된 앱별 설정을 채웠습니다.');
      await loadSettings();
    }

    setSeeding(false);
  };

  const addEventType = async () => {
    const eventKey = normalizeKey(draft.event_key);
    if (!eventKey || !draft.event_label.trim()) {
      setErrorMessage('알림 키와 표시 이름은 필수입니다.');
      return;
    }

    setAddingEvent(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const nextSortOrder = Math.max(0, ...events.map((event) => event.sort_order || 0)) + 10;
    const { error: eventError } = await supabase.from(EVENT_TYPES_TABLE).insert({
      event_key: eventKey,
      event_label: draft.event_label.trim(),
      description: draft.description.trim() || null,
      default_title: draft.default_title.trim() || null,
      default_body: draft.default_body.trim() || null,
      default_url: draft.default_url.trim() || null,
      default_priority: draft.default_priority,
      is_active: true,
      sort_order: nextSortOrder,
      updated_by: adminUserId,
      updated_at: new Date().toISOString(),
    });

    if (eventError) {
      setErrorMessage(eventError.code === '23505' ? '이미 존재하는 알림 키입니다.' : '알림 유형 추가에 실패했습니다.');
      setAddingEvent(false);
      return;
    }

    const settingRows = apps.map((app) => ({
      app_name: app.app_name,
      event_key: eventKey,
      enabled: true,
      updated_by: adminUserId,
      updated_at: new Date().toISOString(),
    }));

    if (settingRows.length > 0) {
      await supabase.from(APP_EVENT_SETTINGS_TABLE).upsert(settingRows, { onConflict: 'app_name,event_key' });
    }

    setDraft(DEFAULT_DRAFT);
    setSuccessMessage('새 알림 유형을 추가했습니다.');
    await loadSettings();
    setAddingEvent(false);
  };

  const loadActiveSubscribers = async (appFilter: string = subscriberAppFilter) => {
    setSubscribersLoading(true);
    setErrorMessage(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token || '';
      const query = appFilter !== 'all' ? `?appName=${encodeURIComponent(appFilter)}` : '';
      const response = await fetch(`/api/admin/push-subscriptions${query}`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrorMessage(result?.error || '활성 구독자 목록을 불러오지 못했습니다.');
        setSubscriberRows([]);
        return;
      }

      setSubscriberRows(Array.isArray(result?.rows) ? (result.rows as ActiveSubscriberRow[]) : []);
    } catch (error) {
      console.error('활성 구독자 로드 실패:', error);
      setErrorMessage('활성 구독자 목록을 불러오지 못했습니다.');
      setSubscriberRows([]);
    } finally {
      setSubscribersLoading(false);
    }
  };

  useEffect(() => {
    if (viewTab !== 'subscribers') return;
    void loadActiveSubscribers(subscriberAppFilter);
  }, [viewTab, subscriberAppFilter]);

  if (loading) {
    return (
      <AdminLayout title="예약설정" activeTab="reservation-settings">
        <div className="flex h-64 items-center justify-center text-gray-600">
          <Loader2 className="mr-3 h-6 w-6 animate-spin text-blue-600" />
          예약설정을 불러오는 중...
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="예약설정" activeTab="reservation-settings">
      <div className="max-w-7xl space-y-6">
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1">
          <button
            type="button"
            onClick={() => setViewTab('settings')}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              viewTab === 'settings' ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            푸시 설정
          </button>
          <button
            type="button"
            onClick={() => setViewTab('subscribers')}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              viewTab === 'subscribers' ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            활성 구독자
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
              <p className="text-xs font-medium text-gray-500">활성 앱</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">{enabledAppCount}</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
              <p className="text-xs font-medium text-gray-500">활성 알림 유형</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">{activeEventCount}</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
              <p className="text-xs font-medium text-gray-500">활성 구독</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">{activeSubscriptionCount}</p>
            </div>
          </div>

          <div className="flex gap-2">
            {viewTab === 'settings' && (
              <button
                type="button"
                onClick={() => void seedMissingSettings()}
                disabled={seeding || apps.length === 0 || events.length === 0}
                className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {seeding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                설정 보정
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (viewTab === 'subscribers') {
                  void loadActiveSubscribers(subscriberAppFilter);
                } else {
                  void loadSettings();
                }
              }}
              className="inline-flex items-center rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              새로고침
            </button>
          </div>
        </div>

        <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <h3 className="text-sm font-semibold">상단 지표 안내</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs sm:text-sm">
            <li>
              <span className="font-semibold">활성 구독</span>은 현재 이 페이지의 등록 앱(notification_apps)에 속한
              구독 중 <span className="font-semibold">is_active = true</span> 건수 합계입니다.
            </li>
            <li>
              <span className="font-semibold">설정 보정</span>은 앱 × 알림유형 조합 중 누락된 항목을
              자동 생성하며, 새로 생성된 항목은 기본값 <span className="font-semibold">허용중</span>으로 채웁니다.
            </li>
            <li>이미 존재하는 설정은 변경하지 않습니다.</li>
          </ul>
          {unknownActiveSubscriptionCount > 0 && (
            <p className="mt-2 rounded-md bg-white/70 px-3 py-2 text-xs text-amber-800">
              참고: 등록 앱 목록에 없는 구독 활성 건이 {unknownActiveSubscriptionCount.toLocaleString()}건 있어 상단
              활성 구독 수에는 제외됩니다.
            </p>
          )}
        </section>

        {errorMessage && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div>}
        {successMessage && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{successMessage}</div>}

        {viewTab === 'subscribers' && (
          <section className="rounded-lg border border-gray-200 bg-white p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-gray-900">앱별 활성 구독 계정/이름</h3>
                <p className="mt-1 text-xs text-gray-500">모바일에서 알림 허용 후 이 목록에 계정이 나타나야 정상 등록입니다.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSubscriberAppFilter('all')}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold ${subscriberAppFilter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}
                >
                  전체 앱
                </button>
                {apps.map((app) => (
                  <button
                    key={`filter:${app.app_name}`}
                    type="button"
                    onClick={() => setSubscriberAppFilter(app.app_name)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold ${subscriberAppFilter === app.app_name ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}
                  >
                    {app.app_label}
                  </button>
                ))}
              </div>
            </div>

            {subscribersLoading ? (
              <div className="flex h-36 items-center justify-center text-gray-600">
                <Loader2 className="mr-2 h-5 w-5 animate-spin text-blue-600" /> 활성 구독자 조회 중...
              </div>
            ) : subscriberRows.length === 0 ? (
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-600">
                활성 구독자가 없습니다. 모바일 앱에서 로그인 후 알림 허용을 다시 시도해 주세요.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-3 py-3">앱</th>
                      <th className="px-3 py-3">기기</th>
                      <th className="px-3 py-3">이름</th>
                      <th className="px-3 py-3">계정</th>
                      <th className="px-3 py-3">사용자 ID</th>
                      <th className="px-3 py-3">구독 키</th>
                      <th className="px-3 py-3">최근 활동</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {subscriberRows.map((row) => (
                      <tr key={row.id}>
                        <td className="px-3 py-3 text-gray-700">{appLabelMap.get(row.app_name) || row.app_name}</td>
                        <td className="px-3 py-3 text-xs text-gray-600">{extractDeviceLabel(row.user_agent)}</td>
                        <td className="px-3 py-3 text-gray-900">{row.user_name || '-'}</td>
                        <td className="px-3 py-3 text-gray-700">{row.account_email || '(로그인 정보 없음)'}</td>
                        <td className="px-3 py-3 text-xs text-gray-500">{row.user_id || '-'}</td>
                        <td className="px-3 py-3 text-xs text-gray-500">{formatEndpoint(row.endpoint)}</td>
                        <td className="px-3 py-3 text-gray-700">{formatDateTime(row.last_used_at || row.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {viewTab === 'settings' && (
          <>

        <section className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          <h3 className="text-sm font-semibold">상태 안내</h3>
          <p className="mt-2">버튼에 보이는 문구는 현재 상태입니다.</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs sm:text-sm">
            <li><span className="font-semibold">전체 푸시: 허용중</span>이면 해당 앱의 푸시 발송이 가능하고, <span className="font-semibold">차단중</span>이면 앱 전체가 막힙니다.</li>
            <li><span className="font-semibold">유형 상태: 사용중</span>이어야 해당 알림 유형이 동작합니다. <span className="font-semibold">중지중</span>이면 동작하지 않습니다.</li>
            <li>각 셀의 <span className="font-semibold">허용중</span>은 앱별-유형별 허용 상태입니다. 단, 상위가 꺼져 있으면 실제 발송은 되지 않습니다.</li>
            <li><span className="font-semibold">실제 발송 조건</span>: 전체 푸시 = 허용중 + 유형 상태 = 사용중 + 셀 상태 = 허용중</li>
          </ul>
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-5">
          <div className="mb-4 flex items-center gap-2">
            <Bell className="h-5 w-5 text-blue-600" />
            <h3 className="text-base font-semibold text-gray-900">앱별 푸시 허용</h3>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-3">앱</th>
                  <th className="px-3 py-3">설명</th>
                  <th className="px-3 py-3">구독</th>
                  <th className="px-3 py-3">전체 푸시</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {apps.map((app) => {
                  const count = countMap.get(app.app_name);
                  const isSaving = savingKey === `app:${app.app_name}`;
                  return (
                    <tr key={app.app_name} className="align-middle">
                      <td className="px-3 py-3">
                        <p className="font-semibold text-gray-900">{app.app_label}</p>
                        <p className="text-xs text-gray-500">{app.app_name}</p>
                      </td>
                      <td className="px-3 py-3 text-gray-600">{app.description || '-'}</td>
                      <td className="px-3 py-3 text-gray-600">
                        활성 {Number(count?.active_count || 0).toLocaleString()} / 전체 {Number(count?.total_count || 0).toLocaleString()}
                      </td>
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          disabled={isSaving}
                          onClick={() => void saveAppEnabled(app.app_name, !app.enabled)}
                          className={`inline-flex items-center rounded-full px-3 py-1.5 text-xs font-semibold ${
                            app.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'
                          } disabled:opacity-50`}
                        >
                          {isSaving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : app.enabled ? <ToggleRight className="mr-1.5 h-4 w-4" /> : <ToggleLeft className="mr-1.5 h-4 w-4" />}
                          {app.enabled ? '허용중' : '차단중'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-gray-900">앱별 알림 유형</h3>
              <p className="mt-1 text-xs text-gray-500">전체 앱 허용과 알림 유형 허용이 모두 켜져 있어야 발송됩니다.</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="sticky left-0 z-10 bg-gray-50 px-3 py-3">알림 유형</th>
                  {apps.map((app) => (
                    <th key={app.app_name} className="px-3 py-3 text-center">{app.app_label}</th>
                  ))}
                  <th className="px-3 py-3 text-center">유형 상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {events.map((event) => {
                  const eventSaving = savingKey === `event:${event.event_key}`;
                  return (
                    <tr key={event.event_key}>
                      <td className="sticky left-0 z-10 bg-white px-3 py-3">
                        <p className="font-semibold text-gray-900">{event.event_label}</p>
                        <p className="mt-0.5 text-xs text-gray-500">{event.event_key}</p>
                        {event.description && <p className="mt-1 max-w-sm text-xs text-gray-500">{event.description}</p>}
                      </td>
                      {apps.map((app) => {
                        const setting = settingMap.get(`${app.app_name}:${event.event_key}`);
                        const enabled = setting?.enabled !== false;
                        const disabledByParent = !app.enabled || !event.is_active;
                        const key = `${app.app_name}:${event.event_key}`;
                        const isSaving = savingKey === `setting:${key}`;

                        return (
                          <td key={key} className="px-3 py-3 text-center">
                            <button
                              type="button"
                              disabled={isSaving}
                              onClick={() => void saveAppEventEnabled(app.app_name, event.event_key, !enabled)}
                              title={disabledByParent ? '앱 또는 알림 유형이 꺼져 있어 발송되지 않습니다.' : undefined}
                              className={`inline-flex min-w-20 items-center justify-center rounded-full px-3 py-1.5 text-xs font-semibold ${
                                enabled && !disabledByParent
                                  ? 'bg-blue-100 text-blue-700'
                                  : enabled
                                    ? 'bg-yellow-100 text-yellow-700'
                                    : 'bg-gray-100 text-gray-500'
                              } disabled:opacity-50`}
                            >
                              {isSaving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : enabled ? <ToggleRight className="mr-1.5 h-4 w-4" /> : <ToggleLeft className="mr-1.5 h-4 w-4" />}
                              {enabled ? (disabledByParent ? '허용(대기)' : '허용중') : '차단중'}
                            </button>
                          </td>
                        );
                      })}
                      <td className="px-3 py-3 text-center">
                        <button
                          type="button"
                          disabled={eventSaving}
                          onClick={() => void saveEventEnabled(event.event_key, !event.is_active)}
                          className={`inline-flex items-center rounded-full px-3 py-1.5 text-xs font-semibold ${
                            event.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'
                          } disabled:opacity-50`}
                        >
                          {eventSaving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : event.is_active ? <ToggleRight className="mr-1.5 h-4 w-4" /> : <ToggleLeft className="mr-1.5 h-4 w-4" />}
                          {event.is_active ? '사용중' : '중지중'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-5">
          <div className="mb-4 flex items-center gap-2">
            <Plus className="h-5 w-5 text-blue-600" />
            <h3 className="text-base font-semibold text-gray-900">알림 내용/유형 추가</h3>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium text-gray-700">알림 키</span>
              <input
                value={draft.event_key}
                onChange={(event) => setDraft((current) => ({ ...current, event_key: normalizeKey(event.target.value) }))}
                placeholder="example_event"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-gray-700">표시 이름</span>
              <input
                value={draft.event_label}
                onChange={(event) => setDraft((current) => ({ ...current, event_label: event.target.value }))}
                placeholder="알림 표시 이름"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
              />
            </label>
            <label className="block text-sm md:col-span-2">
              <span className="font-medium text-gray-700">설명</span>
              <input
                value={draft.description}
                onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
                placeholder="운영자가 알아볼 수 있는 설명"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-gray-700">기본 제목</span>
              <input
                value={draft.default_title}
                onChange={(event) => setDraft((current) => ({ ...current, default_title: event.target.value }))}
                placeholder="푸시 기본 제목"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-gray-700">기본 우선순위</span>
              <select
                value={draft.default_priority}
                onChange={(event) => setDraft((current) => ({ ...current, default_priority: event.target.value as EventDraft['default_priority'] }))}
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 focus:border-blue-500 focus:outline-none"
              >
                {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm md:col-span-2">
              <span className="font-medium text-gray-700">기본 내용</span>
              <textarea
                value={draft.default_body}
                onChange={(event) => setDraft((current) => ({ ...current, default_body: event.target.value }))}
                rows={3}
                placeholder="푸시 기본 내용"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
              />
            </label>
            <label className="block text-sm md:col-span-2">
              <span className="font-medium text-gray-700">기본 이동 URL</span>
              <input
                value={draft.default_url}
                onChange={(event) => setDraft((current) => ({ ...current, default_url: event.target.value }))}
                placeholder="https://staycruise.kr/..."
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
              />
            </label>
          </div>

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => void addEventType()}
              disabled={addingEvent}
              className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {addingEvent ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              알림 유형 추가
            </button>
          </div>
        </section>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
