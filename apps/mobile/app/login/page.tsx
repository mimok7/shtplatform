'use client';

import { FormEvent, Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import supabase, { hasSupabaseEnv } from '@/lib/supabase';
import { canAccessManagerApp } from '@/lib/auth';

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginPageContent />
    </Suspense>
  );
}

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!hasSupabaseEnv) return;

    const error = searchParams.get('error');
    if (error === 'forbidden') {
      setErrorMessage('매니저 권한이 있는 계정만 로그인할 수 있습니다.');
    }

    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return;

      if (await canAccessManagerApp(data.session.user)) {
        router.replace('/');
        return;
      }

      await supabase.auth.signOut();
    };

    checkSession();
  }, [router, searchParams]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!hasSupabaseEnv) {
      setErrorMessage('Supabase 환경변수를 먼저 설정해주세요. (apps/mobile/.env.local)');
      return;
    }

    setLoading(true);
    setErrorMessage('');

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setErrorMessage('이메일 또는 비밀번호를 확인해주세요.');
      setLoading(false);
      return;
    }

    if (!(await canAccessManagerApp(data.user))) {
      await supabase.auth.signOut();
      setErrorMessage('매니저 권한이 있는 계정만 로그인할 수 있습니다.');
      setLoading(false);
      return;
    }

    router.replace('/');
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-blue-100 flex flex-col px-3 py-4">
      <div className="pt-2 pb-3">
        <img
          src="/logo.png"
          alt="스테이하롱 로고"
          className="h-16 w-auto mx-auto"
        />
      </div>

      <div className="flex-1 flex items-center justify-center w-full">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-4">

          <h1 className="text-xl font-bold text-slate-900">매니저 로그인</h1>
          <p className="mt-2 text-sm text-slate-500">스테이하롱 모바일 관리자 전용 페이지</p>

          {!hasSupabaseEnv ? (
            <div className="mt-4 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              환경변수가 설정되지 않았습니다. apps/mobile/.env.local 파일에 NEXT_PUBLIC_SUPABASE_URL,
              NEXT_PUBLIC_SUPABASE_ANON_KEY를 추가하세요.
            </div>
          ) : null}

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">
                이메일
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                disabled={!hasSupabaseEnv || loading}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="manager@example.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">
                비밀번호
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                disabled={!hasSupabaseEnv || loading}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="비밀번호 입력"
              />
            </div>

            {errorMessage ? (
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{errorMessage}</p>
            ) : null}

            <button
              type="submit"
              disabled={!hasSupabaseEnv || loading}
              className="w-full rounded-xl bg-blue-600 text-white font-semibold py-3 hover:bg-blue-700 disabled:bg-blue-300"
            >
              {loading ? '로그인 중...' : '로그인'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function LoginFallback() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-blue-100 flex flex-col px-3 py-4">
      <div className="pt-2 pb-3">
        <img
          src="/logo.png"
          alt="스테이하롱 로고"
          className="h-16 w-auto mx-auto"
        />
      </div>
      <div className="flex-1 flex items-center justify-center w-full">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-4 text-center text-slate-600">
          로그인 화면을 준비하는 중입니다...
        </div>
      </div>
    </div>
  );
}
