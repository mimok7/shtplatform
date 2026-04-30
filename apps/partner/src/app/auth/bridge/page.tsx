'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';

// ============================================================
// SSO Bridge — 다른 stayhalong 도메인 앱(예: customer)에서
// 현재 세션 토큰을 hash 파라미터로 넘겨 전달받아
// 본 앱(partner)의 supabase 세션을 설정한 뒤 next 경로로 이동.
//
// 보안 메모:
//   - 토큰은 location.hash 에 담겨 서버/Referer 로 전송되지 않음
//   - next 파라미터는 same-origin 경로(/로 시작)만 허용
//   - 처리 완료 후 history.replaceState 로 hash 즉시 제거
// ============================================================

export default function AuthBridgePage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500" />
            </div>
        }>
            <BridgeInner />
        </Suspense>
    );
}

function BridgeInner() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                // 1) hash 우선 파싱 (보안상 권장), 없으면 query 시도
                const hash = typeof window !== 'undefined' ? window.location.hash.replace(/^#/, '') : '';
                const hashParams = new URLSearchParams(hash);
                const access_token = hashParams.get('at') || searchParams.get('at') || '';
                const refresh_token = hashParams.get('rt') || searchParams.get('rt') || '';
                const nextRaw = hashParams.get('next') || searchParams.get('next') || '/partner/browse';
                // same-origin 경로만 허용
                const next = nextRaw.startsWith('/') && !nextRaw.startsWith('//') ? nextRaw : '/partner/browse';

                if (!access_token || !refresh_token) {
                    if (!cancelled) setError('세션 토큰이 전달되지 않았습니다. 다시 시도해 주세요.');
                    return;
                }

                const { error: setErr } = await supabase.auth.setSession({ access_token, refresh_token });
                if (cancelled) return;
                if (setErr) {
                    setError('세션 설정 실패: ' + setErr.message);
                    return;
                }

                // hash/query 즉시 제거 (브라우저 히스토리에 토큰 남기지 않음)
                try {
                    window.history.replaceState({}, '', window.location.pathname);
                } catch { /* noop */ }

                router.replace(next);
            } catch (err: any) {
                if (!cancelled) setError(err?.message || '알 수 없는 오류');
            }
        })();
        return () => { cancelled = true; };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="text-center">
                {error ? (
                    <>
                        <div className="text-red-600 text-sm mb-3">{error}</div>
                        <button
                            onClick={() => router.replace('/partner/login')}
                            className="px-4 py-2 rounded bg-blue-500 text-white text-sm hover:bg-blue-600"
                        >
                            로그인 페이지로
                        </button>
                    </>
                ) : (
                    <>
                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500 mx-auto mb-3" />
                        <div className="text-sm text-gray-600">제휴업체 시스템으로 이동 중...</div>
                    </>
                )}
            </div>
        </div>
    );
}
