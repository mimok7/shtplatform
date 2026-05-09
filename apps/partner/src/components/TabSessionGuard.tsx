'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

const TAB_SESSION_KEY = 'sht:tab:id';
const ACTIVE_TAB_KEY = 'sht:active:tab';

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

export default function TabSessionGuard({ loginPath }: { loginPath: string }) {
    const pathname = usePathname();
    const currentTabIdRef = useRef('');
    const blockedRef = useRef(false);
    const [blocked, setBlocked] = useState(false);

    useEffect(() => {
        // 로그인 페이지에서는 차단하지 않음 — 새 로그인이 우선되어야 함
        if (pathname.startsWith(loginPath)) return;

        currentTabIdRef.current = getOrCreateTabId();

        const blockCurrentTab = () => {
            if (blockedRef.current) return;
            blockedRef.current = true;
            setBlocked(true);
        };

        const syncWithActiveTab = () => {
            const activeTabId = readTabId(localStorage.getItem(ACTIVE_TAB_KEY));
            if (!activeTabId || activeTabId === currentTabIdRef.current) return;
            blockCurrentTab();
        };

        const handleStorage = (e: StorageEvent) => {
            if (e.key !== ACTIVE_TAB_KEY) return;
            const incomingTabId = readTabId(e.newValue);
            if (!incomingTabId || incomingTabId === currentTabIdRef.current) return;
            blockCurrentTab();
        };

        syncWithActiveTab();
        window.addEventListener('storage', handleStorage);
        return () => window.removeEventListener('storage', handleStorage);
    }, [pathname, loginPath]);

    const handleClose = () => {
        try {
            window.open('', '_self');
            window.close();
        } catch {
            // noop
        }
        // User-opened tab은 close가 차단될 수 있어 사용 중지를 위해 blank 페이지로 전환
        window.setTimeout(() => window.location.replace('about:blank'), 120);
    };

    if (blocked) {
        return (
            <div className="fixed inset-0 z-[9999] bg-black/70 flex items-center justify-center p-4">
                <div className="w-full max-w-md rounded-xl bg-white p-6 text-center shadow-xl">
                    <h2 className="text-xl font-bold text-red-600">동시 접속 차단</h2>
                    <ul className="mt-4 text-left text-sm text-gray-700 leading-relaxed space-y-2">
                        <li>- 동시 접속은 보안, 데이터 저장 오류 예방을 위하여 차단되어 있습니다.</li>
                        <li>- 현재 창의 사용이 중지되었습니다.</li>
                        <li>- 계속 사용하려면 가장 최근 로그인한 창만 사용해 주세요.</li>
                        <li>- 감사합니다. ^^</li>
                    </ul>
                    <button
                        onClick={handleClose}
                        className="mt-6 w-full px-4 py-2 bg-gray-800 text-white rounded-lg font-medium hover:bg-gray-900 transition"
                    >
                        닫기
                    </button>
                </div>
            </div>
        );
    }

    return null;
}