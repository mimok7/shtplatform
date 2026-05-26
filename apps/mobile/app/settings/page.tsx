'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell, Lock, UserRound, ArrowLeft, Home, Download } from 'lucide-react';
import supabase from '@/lib/supabase';

const APP_NAME = 'mobile';
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';

type ProfileState = {
  userId: string;
  email: string;
  role: string;
  name: string;
  phone: string;
};

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

function toApplicationServerKey(base64String: string): ArrayBuffer {
  const bytes = urlBase64ToUint8Array(base64String);
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function arrayBuffersEqual(left: ArrayBuffer, right: ArrayBuffer): boolean {
  if (left.byteLength !== right.byteLength) return false;
  const leftBytes = new Uint8Array(left);
  const rightBytes = new Uint8Array(right);
  return leftBytes.every((value, index) => value === rightBytes[index]);
}

async function getCurrentPushSubscription(
  registration: ServiceWorkerRegistration,
  applicationServerKey: ArrayBuffer
): Promise<PushSubscription | null> {
  const subscription = await registration.pushManager.getSubscription();
  const existingKey = subscription?.options?.applicationServerKey;

  if (subscription && existingKey && !arrayBuffersEqual(existingKey, applicationServerKey)) {
    await subscription.unsubscribe().catch(() => false);
    return null;
  }

  return subscription;
}

function isPushWorkerEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  const isLocalhost =
    location.hostname === 'localhost' ||
    location.hostname === '127.0.0.1' ||
    location.hostname === '[::1]';
  return process.env.NODE_ENV === 'production' && !isLocalhost;
}

function waitForActiveServiceWorker(
  registration: ServiceWorkerRegistration,
  timeoutMs = 5000
): Promise<ServiceWorkerRegistration> {
  if (registration.active) return Promise.resolve(registration);

  const worker = registration.installing || registration.waiting;
  if (!worker) return Promise.resolve(registration);

  return new Promise((resolve) => {
    const timeout = window.setTimeout(() => resolve(registration), timeoutMs);
    worker.addEventListener('statechange', () => {
      if (worker.state === 'activated') {
        window.clearTimeout(timeout);
        resolve(registration);
      }
    });
  });
}

async function ensureServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushWorkerEnabled()) return null;

  const matched = await navigator.serviceWorker.getRegistration('/');
  const registration = matched || await navigator.serviceWorker.register('/sw.js', {
    scope: '/',
    updateViaCache: 'none',
  });

  await registration.update().catch(() => undefined);
  await waitForActiveServiceWorker(registration);

  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<ServiceWorkerRegistration>((resolve) => {
      window.setTimeout(() => resolve(registration), 5000);
    }),
  ]);
}

export default function MobileSettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [notificationBusy, setNotificationBusy] = useState(false);

  const [profile, setProfile] = useState<ProfileState>({
    userId: '',
    email: '',
    role: '',
    name: '',
    phone: '',
  });

  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(true);
  const [showInstallGuide, setShowInstallGuide] = useState(false);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const loadProfile = async () => {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      setLoading(false);
      return;
    }

    const { data: profileRow } = await supabase
      .from('users')
      .select('name, phone_number, role')
      .eq('id', user.id)
      .maybeSingle();

    setProfile({
      userId: user.id,
      email: user.email || '',
      role: String(profileRow?.role || '').trim().toLowerCase(),
      name: profileRow?.name || '',
      phone: profileRow?.phone_number || '',
    });

    setLoading(false);
  };

  const refreshSubscriptionState = async () => {
    if (typeof window === 'undefined') return;

    setPermission(Notification.permission);

    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setIsSubscribed(false);
      return;
    }

    if (!isPushWorkerEnabled()) {
      setIsSubscribed(false);
      return;
    }

    if (!VAPID_PUBLIC_KEY) {
      setIsSubscribed(false);
      return;
    }

    try {
      const registration = await ensureServiceWorkerRegistration();
      if (!registration) {
        setIsSubscribed(false);
        return;
      }
      const existing = await getCurrentPushSubscription(
        registration,
        toApplicationServerKey(VAPID_PUBLIC_KEY)
      );
      setIsSubscribed(!!existing);
    } catch {
      setIsSubscribed(false);
    }
  };

  useEffect(() => {
    void loadProfile();
    void refreshSubscriptionState();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const checkStandalone = () => {
      const isPwa =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
      setIsStandalone(isPwa);
    };

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setIsStandalone(false);
    };

    const onAppInstalled = () => {
      setDeferredPrompt(null);
      setIsStandalone(true);
      setShowInstallGuide(false);
    };

    checkStandalone();
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const getSessionToken = async (): Promise<string> => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token || '';
  };

  const saveSubscription = async (subscription: PushSubscription) => {
    const token = await getSessionToken();
    if (!token) {
      throw new Error('로그인 세션이 만료되었습니다. 다시 로그인 후 시도해 주세요.');
    }

    const response = await fetch('/api/subscribe-push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        subscription: subscription.toJSON(),
        appName: APP_NAME,
      }),
    });

    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result?.error || '구독 저장에 실패했습니다.');
    }
  };

  const unsubscribeOnServer = async (endpoint: string) => {
    const token = await getSessionToken();
    if (!token) {
      throw new Error('로그인 세션이 만료되었습니다. 다시 로그인 후 시도해 주세요.');
    }
    const response = await fetch('/api/unsubscribe-push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ endpoint }),
    });

    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result?.error || '구독 해제에 실패했습니다.');
    }
  };

  const handleEnableNotification = async () => {
    if (typeof window === 'undefined') return;

    if (!isPushWorkerEnabled()) {
      alert('로컬 개발 환경에서는 푸시 알림이 비활성화됩니다. 운영 도메인에서 확인해 주세요.');
      return;
    }

    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      alert('이 브라우저는 푸시 알림을 지원하지 않습니다.');
      return;
    }

    if (!VAPID_PUBLIC_KEY) {
      alert('VAPID 공개키가 설정되지 않았습니다. 운영자에게 문의하세요.');
      return;
    }

    if (Notification.permission === 'denied') {
      alert('브라우저 설정에서 알림 권한을 허용으로 변경해 주세요.');
      return;
    }

    setNotificationBusy(true);
    try {
      const registration = await ensureServiceWorkerRegistration();
      if (!registration) {
        alert('푸시 알림 서비스워커를 준비하지 못했습니다. 운영 도메인에서 다시 시도해 주세요.');
        return;
      }
      const applicationServerKey = toApplicationServerKey(VAPID_PUBLIC_KEY);
      let subscription = await getCurrentPushSubscription(registration, applicationServerKey);

      if (!subscription) {
        const ask = await Notification.requestPermission();
        setPermission(ask);

        if (ask !== 'granted') {
          alert('알림 권한이 허용되지 않았습니다.');
          return;
        }

        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });
      }

      await saveSubscription(subscription);
      setIsSubscribed(true);
      alert('알림 구독이 활성화되었습니다.');
    } catch (error: any) {
      console.error('알림 활성화 실패:', error);
      alert(error?.message || '알림 활성화 중 오류가 발생했습니다.');
    } finally {
      setNotificationBusy(false);
      await refreshSubscriptionState();
    }
  };

  const handleDisableNotification = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      alert('이 브라우저는 푸시 알림을 지원하지 않습니다.');
      return;
    }

    if (!isPushWorkerEnabled()) {
      alert('로컬 개발 환경에서는 푸시 알림이 비활성화됩니다. 운영 도메인에서 확인해 주세요.');
      return;
    }

    setNotificationBusy(true);
    try {
      const registration = await ensureServiceWorkerRegistration();
      if (!registration) {
        setIsSubscribed(false);
        alert('푸시 알림 서비스워커를 찾을 수 없습니다.');
        return;
      }
      const subscription = VAPID_PUBLIC_KEY
        ? await getCurrentPushSubscription(registration, toApplicationServerKey(VAPID_PUBLIC_KEY))
        : await registration.pushManager.getSubscription();

      if (!subscription) {
        setIsSubscribed(false);
        alert('이미 구독 해제된 상태입니다.');
        return;
      }

      await unsubscribeOnServer(subscription.endpoint);
      await subscription.unsubscribe();
      setIsSubscribed(false);
      alert('알림 구독이 해제되었습니다.');
    } catch (error: any) {
      console.error('알림 비활성화 실패:', error);
      alert(error?.message || '알림 해제 중 오류가 발생했습니다.');
    } finally {
      setNotificationBusy(false);
      await refreshSubscriptionState();
    }
  };

  const handleInstallApp = async () => {
    if (isStandalone) {
      alert('이미 앱이 설치되어 있습니다.');
      return;
    }

    if (!deferredPrompt) {
      setShowInstallGuide(true);
      return;
    }

    try {
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice;
    } finally {
      setDeferredPrompt(null);
    }
  };

  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    if (!profile.userId) return;

    setSavingProfile(true);
    try {
      const { error } = await supabase
        .from('users')
        .update({
          name: profile.name.trim() || null,
          phone_number: profile.phone.trim() || null,
        })
        .eq('id', profile.userId);

      if (error) throw error;

      alert('내정보가 저장되었습니다.');
    } catch (error: any) {
      console.error('내정보 저장 실패:', error);
      alert(error?.message || '내정보 저장에 실패했습니다.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();

    if (newPassword.length < 8) {
      alert('새 비밀번호는 8자 이상으로 입력해 주세요.');
      return;
    }

    if (newPassword !== confirmPassword) {
      alert('비밀번호 확인이 일치하지 않습니다.');
      return;
    }

    setSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      setNewPassword('');
      setConfirmPassword('');
      alert('비밀번호가 변경되었습니다.');
    } catch (error: any) {
      console.error('비밀번호 변경 실패:', error);
      alert(error?.message || '비밀번호 변경에 실패했습니다.');
    } finally {
      setSavingPassword(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 px-2 py-4">
        <div className="w-full rounded-2xl bg-white p-4 text-center text-sm text-slate-500">설정 정보를 불러오는 중...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* 헤더 */}
      <div className="bg-white border-b shadow-sm px-2 py-2">
        <div className="flex items-center gap-2 mb-2">
          <button onClick={() => router.back()} className="p-1.5 rounded-lg hover:bg-gray-100">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h1 className="text-base font-bold text-gray-800 flex-1 text-center">설정</h1>
          <Link href="/" className="p-1.5 rounded-lg hover:bg-gray-100">
            <Home className="w-5 h-5 text-gray-600" />
          </Link>
        </div>
      </div>

      {/* 본문 */}
      <div className="mx-auto w-full max-w-md space-y-3 px-2 py-4">
        <section className="rounded-2xl bg-white p-3 shadow-sm">
          <div className="mb-2 flex items-center gap-2">
            <Bell className="h-4 w-4 text-blue-600" />
            <h2 className="text-sm font-semibold text-slate-900">알림 허용</h2>
          </div>

          <div className="space-y-1 text-xs text-slate-600">
            <p>브라우저 권한: <span className="font-semibold text-slate-800">{permission}</span></p>
            <p>앱 구독 상태: <span className="font-semibold text-slate-800">{isSubscribed ? '활성' : '비활성'}</span></p>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => void handleEnableNotification()}
              disabled={notificationBusy}
              className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
            >
              {notificationBusy ? '처리 중...' : '알림 허용'}
            </button>
            <button
              type="button"
              onClick={() => void handleDisableNotification()}
              disabled={notificationBusy}
              className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-60"
            >
              {notificationBusy ? '처리 중...' : '알림 차단'}
            </button>
          </div>
        </section>

        <section className="rounded-2xl bg-white p-3 shadow-sm">
          <div className="mb-2 flex items-center gap-2">
            <Download className="h-4 w-4 text-indigo-600" />
            <h2 className="text-sm font-semibold text-slate-900">앱 설치</h2>
          </div>

          <div className="space-y-1 text-xs text-slate-600">
            <p>설치 상태: <span className="font-semibold text-slate-800">{isStandalone ? '설치됨' : '미설치'}</span></p>
            <p>설치 권장 팝업은 제거되었습니다. 필요할 때 여기서 설치를 진행하세요.</p>
          </div>

          <button
            type="button"
            onClick={() => void handleInstallApp()}
            disabled={isStandalone}
            className="mt-3 w-full rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isStandalone ? '이미 설치됨' : '앱 설치'}
          </button>

          {showInstallGuide && !isStandalone && (
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-600">
              <p className="font-semibold text-slate-700">수동 설치 안내</p>
              <p className="mt-1">1. 브라우저 메뉴(⋮ 또는 공유) 열기</p>
              <p>2. "홈 화면에 추가" 또는 "앱 설치" 선택</p>
              <p>3. 추가/설치 버튼을 눌러 완료</p>
            </div>
          )}
        </section>

        <section className="rounded-2xl bg-white p-3 shadow-sm">
          <div className="mb-2 flex items-center gap-2">
            <UserRound className="h-4 w-4 text-emerald-600" />
            <h2 className="text-sm font-semibold text-slate-900">내정보</h2>
          </div>

          <form className="space-y-2" onSubmit={handleSaveProfile}>
            <div>
              <label className="mb-1 block text-[11px] text-slate-500">이메일</label>
              <input
                type="text"
                value={profile.email}
                disabled
                className="w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-xs text-slate-700"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-slate-500">권한</label>
              <input
                type="text"
                value={profile.role || '-'}
                disabled
                className="w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-xs text-slate-700"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-slate-500">이름</label>
              <input
                type="text"
                value={profile.name}
                onChange={(e) => setProfile((prev) => ({ ...prev, name: e.target.value }))}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-800"
                placeholder="이름 입력"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-slate-500">연락처</label>
              <input
                type="text"
                value={profile.phone}
                onChange={(e) => setProfile((prev) => ({ ...prev, phone: e.target.value }))}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-800"
                placeholder="연락처 입력"
              />
            </div>

            <button
              type="submit"
              disabled={savingProfile}
              className="mt-1 w-full rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
            >
              {savingProfile ? '저장 중...' : '내정보 저장'}
            </button>
          </form>
        </section>

        <section className="rounded-2xl bg-white p-3 shadow-sm">
          <div className="mb-2 flex items-center gap-2">
            <Lock className="h-4 w-4 text-amber-600" />
            <h2 className="text-sm font-semibold text-slate-900">비밀번호 변경</h2>
          </div>

          <form className="space-y-2" onSubmit={handleChangePassword}>
            <div>
              <label className="mb-1 block text-[11px] text-slate-500">새 비밀번호</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-800"
                placeholder="8자 이상 입력"
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-slate-500">새 비밀번호 확인</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-800"
                placeholder="다시 입력"
                autoComplete="new-password"
              />
            </div>

            <button
              type="submit"
              disabled={savingPassword}
              className="mt-1 w-full rounded-xl bg-amber-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
            >
              {savingPassword ? '변경 중...' : '비밀번호 변경'}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
