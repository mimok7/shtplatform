'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

const TAB_SESSION_KEY = 'sht:tab:id';
const ACTIVE_TAB_KEY = 'sht:active:tab:manager';

function getOrCreateTabId() {
  if (typeof window === 'undefined') return '';
  let tabId = sessionStorage.getItem(TAB_SESSION_KEY);
  if (!tabId) {
    tabId = `tab_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(TAB_SESSION_KEY, tabId);
  }
  return tabId;
}

function readTabId(raw: string | null) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed?.tabId === 'string' ? parsed.tabId : null;
  } catch {
    return null;
  }
}

function claimActiveTab(tabId: string) {
  localStorage.setItem(ACTIVE_TAB_KEY, JSON.stringify({ tabId, ts: Date.now() }));
}

export default function TabSessionGuard({ loginPath }: { loginPath: string }) {
  const pathname = usePathname();
  const currentTabIdRef = useRef('');

  useEffect(() => {
    // 로그인 페이지에서는 active tab 마킹도 생략
    if (pathname.startsWith(loginPath)) return;

    currentTabIdRef.current = getOrCreateTabId();

    // 탭 복원/새 웹뷰 생성 시 현재 탭을 active로 다시 마킹한다.
    claimActiveTab(currentTabIdRef.current);

    const handleStorage = (e: StorageEvent) => {
      if (e.key !== ACTIVE_TAB_KEY) return;
      const incomingTabId = readTabId(e.newValue);
      if (!incomingTabId || incomingTabId === currentTabIdRef.current) return;
      claimActiveTab(currentTabIdRef.current);
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [pathname, loginPath]);

  return null;
}