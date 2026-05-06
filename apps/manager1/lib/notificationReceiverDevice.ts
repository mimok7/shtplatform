'use client';

export const NOTIFICATION_RECEIVER_PREFERENCE_TABLE = 'manager_notification_receiver_preferences';

const DEVICE_ID_STORAGE_KEY = 'manager1:notification-receiver-device-id';
const DEVICE_ID_COOKIE_KEY = 'sht_notification_device_id';

function getCookieDomain() {
  if (typeof window === 'undefined') return '';
  const host = window.location.hostname;
  if (host.endsWith('.staycruise.kr')) return ';domain=.staycruise.kr';
  if (host.endsWith('.stayhalong.com')) return ';domain=.stayhalong.com';
  return '';
}

function readCookie(key: string) {
  if (typeof document === 'undefined') return null;
  const matched = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${key}=`));
  if (!matched) return null;
  return decodeURIComponent(matched.split('=').slice(1).join('='));
}

function writeCookie(key: string, value: string) {
  if (typeof document === 'undefined') return;
  const oneYear = 60 * 60 * 24 * 365;
  document.cookie = `${key}=${encodeURIComponent(value)};path=/;max-age=${oneYear};SameSite=Lax${getCookieDomain()}`;
}

function detectPlatform() {
  if (typeof navigator === 'undefined') return '알 수 없는 기기';
  const userAgent = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(userAgent)) return 'iPhone/iPad';
  if (/android/.test(userAgent)) return 'Android';
  if (/mac/.test(userAgent)) return 'Mac';
  if (/win/.test(userAgent)) return 'Windows';
  return '기타 기기';
}

function detectBrowser() {
  if (typeof navigator === 'undefined') return '브라우저';
  const userAgent = navigator.userAgent.toLowerCase();
  if (userAgent.includes('edg/')) return 'Edge';
  if (userAgent.includes('chrome/') && !userAgent.includes('edg/')) return 'Chrome';
  if (userAgent.includes('safari/') && !userAgent.includes('chrome/')) return 'Safari';
  if (userAgent.includes('firefox/')) return 'Firefox';
  return '브라우저';
}

export function getOrCreateNotificationDeviceId() {
  if (typeof window === 'undefined') return 'server';

  const cookieValue = readCookie(DEVICE_ID_COOKIE_KEY);
  if (cookieValue) {
    window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, cookieValue);
    return cookieValue;
  }

  const existing = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY);
  if (existing) {
    writeCookie(DEVICE_ID_COOKIE_KEY, existing);
    return existing;
  }

  const generated = `device-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, generated);
  writeCookie(DEVICE_ID_COOKIE_KEY, generated);
  return generated;
}

export function getNotificationDeviceLabel() {
  const platform = detectPlatform();
  const browser = detectBrowser();
  return `${platform} · ${browser}`;
}