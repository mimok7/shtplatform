"use client";
import React, { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabase';
import { setCachedUser, clearCachedUser } from '@/lib/authCache';
import { primeAuthCache } from '@/hooks/useAuth';
import { clearInvalidSession, isInvalidRefreshTokenError } from '@/lib/authRecovery';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        if (isInvalidRefreshTokenError(error)) {
          await clearInvalidSession();
        }
        if (
          error.message.includes('Invalid login credentials') ||
          error.message.includes('Email not confirmed') ||
          error.message.includes('User not found')
        ) {
          alert('이메일 또는 비밀번호가 올바르지 않습니다. 비밀번호를 확인해주세요.');
          return;
        }
        alert('로그인 실패: ' + error.message);
        return;
      }

      const user = data.user;
      if (!user) {
        alert('로그인에 실패했습니다.');
        return;
      }

      // 로그인 직후 보호 페이지가 먼저 마운트돼도 인증 훅이 동일한 사용자를 보도록 캐시를 선반영한다.
      setCachedUser(user);
      primeAuthCache(user);
      // 단일 세션 강제: 다른 기기/탭의 모든 세션 종료 (실패해도 로그인 진행)
      try { await supabase.auth.signOut({ scope: 'others' }); } catch { /* noop */ }
      router.replace('/mypage');

    } catch (err) {
      console.error('로그인 처리 오류:', err);
      if (isInvalidRefreshTokenError(err)) {
        await clearInvalidSession();
      }
      alert('로그인 처리 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const performSiteDataClear = async () => {
    try {
      await fetch('/api/clear-site-data', { method: 'POST', cache: 'no-store' });
      clearCachedUser();
      try { await supabase.auth.signOut({ scope: 'local' }); } catch { }
      try { localStorage.clear(); } catch { }
      try { sessionStorage.clear(); } catch { }

      // IndexedDB/Cache/ServiceWorker 정리
      try {
        if ('indexedDB' in window && indexedDB.databases) {
          const dbs = await indexedDB.databases();
          await Promise.all((dbs || []).map((db) => {
            if (!db.name) return Promise.resolve();
            return new Promise<void>((resolve) => {
              const req = indexedDB.deleteDatabase(db.name as string);
              req.onsuccess = () => resolve();
              req.onerror = () => resolve();
              req.onblocked = () => resolve();
            });
          }));
        }
      } catch { }
      try {
        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
      } catch { }
      try {
        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map((reg) => reg.unregister()));
        }
      } catch { }

      alert('초기화가 완료되었습니다. 페이지를 다시 로드합니다.');
      window.location.href = '/';
    } catch (err) {
      console.error('사이트 데이터 초기화 오류:', err);
      alert('초기화 중 오류가 발생했습니다. 다시 시도해주세요.');
    }
  };

  const handleClearSiteData = async () => {
    const ok = window.confirm(
      'stayhalong 관련 쿠키/세션/저장소를 초기화합니다.\n진행하시겠습니까?'
    );
    if (!ok) return;

    await performSiteDataClear();
  };

  return (
    <div className="max-w-sm mx-auto mt-12 p-4 bg-white shadow rounded">
      <div className="flex justify-start mb-4">
        <Image src="/logo-full.png" alt="스테이하롱 전체 로고" width={320} height={80} unoptimized priority />
      </div>
      <h2 className="text-2xl font-bold mb-6 text-left">🔐 예약 신청/확인</h2>
      <form onSubmit={handleLogin} className="space-y-4">
        <input
          id="login-email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="이메일"
          className="w-full border p-2 rounded"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <p className="text-sm text-gray-700 mt-1">
          견적 신청시 입력하신 이메일과 비밀번호를 입력해주세요.
        </p>
        <input
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="비밀번호"
          className="w-full border p-2 rounded"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <p className="text-sm text-gray-700 mt-1">비밀번호는 6자 이상 입력해주세요.</p>
        <button
          type="submit"
          className="bg-blue-700 text-white w-full py-2 rounded hover:bg-blue-800 transition disabled:opacity-50"
          disabled={loading}
        >
          {loading ? '처리 중...' : '예약 신청/확인'}
        </button>
      </form>

      <div className="mt-4 text-left">
        <p className="text-sm text-gray-700">
          계정이 없으신가요?{' '}
          <button
            onClick={() => router.push('/signup')}
            className="text-blue-700 hover:text-blue-800 underline"
          >
            신규예약
          </button>
        </p>
      </div>

      <div className="mt-6 pt-4 border-t border-gray-200">
        <button
          type="button"
          onClick={handleClearSiteData}
          className="w-full py-2 rounded bg-gray-100 text-gray-700 hover:bg-gray-200 transition text-sm"
        >
          stayhalong 데이터 초기화 (쿠키/세션/캐시)
        </button>
      </div>
    </div>
  );
}
