'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import supabase, { hasSupabaseEnv } from '@/lib/supabase';
import { canAccessManagerApp, isPublicPath } from '@/lib/auth';

type AuthGateProps = {
  children: React.ReactNode;
};

export default function AuthGate({ children }: AuthGateProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const isPublic = isPublicPath(pathname);

    // 공개 경로(로그인)는 빠르게 통과
    if (isPublic) {
      if (!cancelled) setChecking(false);
      return;
    }

    // 비공개 경로에서 환경변수 없으면 로그인으로 리다이렉트
    if (!hasSupabaseEnv) {
      if (!cancelled) {
        router.replace('/login?error=missing-env');
        setChecking(false);
      }
      return;
    }

    const validateSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (cancelled) return;

        if (!session) {
          router.replace('/login');
          if (!cancelled) setChecking(false);
          return;
        }

        // 네트워크 지연 시 무한 대기를 방지하기 위해 권한 확인에 타임아웃을 둔다.
        const canAccess = await Promise.race<boolean>([
          canAccessManagerApp(session.user),
          new Promise<boolean>((resolve) => {
            setTimeout(() => resolve(false), 8000);
          }),
        ]);

        if (!canAccess) {
          await supabase.auth.signOut();
          router.replace('/login?error=forbidden');
          if (!cancelled) setChecking(false);
          return;
        }

        if (!cancelled) setChecking(false);
      } catch (err) {
        console.warn('Session validation error (non-blocking):', err);
        if (!cancelled) {
          setChecking(false);
        }
      }
    };

    validateSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;

      if (!session) {
        router.replace('/login');
        return;
      }

      void (async () => {
        if (cancelled) return;
        const canAccess = await Promise.race<boolean>([
          canAccessManagerApp(session.user),
          new Promise<boolean>((resolve) => {
            setTimeout(() => resolve(false), 8000);
          }),
        ]);
        if (!canAccess) {
          await supabase.auth.signOut();
          router.replace('/login?error=forbidden');
        }
      })();
    });

    return () => {
      cancelled = true;
      try {
        subscription?.unsubscribe?.();
      } catch {
        /* noop */
      }
    };
  }, [pathname, router]);

  const isPublic = isPublicPath(pathname);

  // 공개 경로는 항상 통과
  if (isPublic) {
    return <>{children}</>;
  }

  // 환경변수 미설정 + 비공개 경로 → 로그인 리다이렉트 중
  if (!hasSupabaseEnv) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-start justify-center p-4">
        <div className="w-full bg-white rounded-2xl shadow-lg border border-red-200 p-4">
          <h2 className="text-lg font-semibold text-slate-900">⚠️ 환경 변수 설정 필요</h2>
          <p className="mt-2 text-sm text-slate-600">
            모바일 앱 실행을 위해 Supabase 환경변수를 설정해주세요.
          </p>
          <div className="mt-4 rounded-xl bg-red-50 border border-red-200 p-3 space-y-1 text-sm text-red-900">
            <div className="font-mono">NEXT_PUBLIC_SUPABASE_URL</div>
            <div className="font-mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</div>
            <div className="mt-3 text-xs text-red-800">
              📁 파일: <code className="bg-white px-1 py-0.5 rounded">apps/mobile/.env.local</code>
            </div>
          </div>
          <a href="/login" className="mt-4 block w-full py-2 px-4 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg text-center">
            로그인 페이지로 이동
          </a>
        </div>
      </div>
    );
  }

  // 세션 확인 중 (비공개 경로 + 환경변수 있음)
  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="inline-block">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
          </div>
          <p className="mt-4 text-slate-600 text-sm">인증 정보를 확인하는 중입니다...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
