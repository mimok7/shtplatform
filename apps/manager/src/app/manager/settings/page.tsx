'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Download } from 'lucide-react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

function isStandaloneApp(): boolean {
  if (typeof window === 'undefined') return true;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export default function ManagerSettingsPage() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(true);
  const [showManualGuide, setShowManualGuide] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const checkStandalone = () => {
      setIsStandalone(isStandaloneApp());
    };

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setIsStandalone(false);
    };

    const onAppInstalled = () => {
      setDeferredPrompt(null);
      setIsStandalone(true);
      setShowManualGuide(false);
    };

    checkStandalone();
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      setShowManualGuide(true);
      return;
    }

    try {
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice;
    } finally {
      setDeferredPrompt(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="mx-auto w-full max-w-2xl space-y-4">
        <div className="flex items-center gap-2">
          <Link
            href="/manager/schedule/new"
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
          >
            <ArrowLeft className="h-4 w-4" />
            뒤로
          </Link>
          <h1 className="text-lg font-semibold text-slate-900">설정</h1>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center gap-2">
            <Download className="h-4 w-4 text-blue-600" />
            <h2 className="text-sm font-semibold text-slate-900">앱 설치</h2>
          </div>

          <p className="text-xs text-slate-600">
            설치 권장 팝업은 제거되었습니다. 필요할 때 여기서 직접 설치를 진행해 주세요.
          </p>

          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleInstallClick()}
              disabled={isStandalone}
              className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isStandalone ? '이미 설치됨' : '앱 설치'}
            </button>
            {!deferredPrompt && !isStandalone && (
              <span className="text-[11px] text-slate-500">자동 설치창이 없는 환경에서는 수동 설치를 이용해 주세요.</span>
            )}
          </div>

          {showManualGuide && !isStandalone && (
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-600">
              <p className="font-semibold text-slate-700">수동 설치 안내</p>
              <p className="mt-1">1. 브라우저 메뉴(⋮ 또는 공유) 열기</p>
              <p>2. "홈 화면에 추가" 또는 "앱 설치" 선택</p>
              <p>3. 추가/설치 버튼을 눌러 완료</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
