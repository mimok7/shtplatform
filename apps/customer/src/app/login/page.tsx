"use client";
import React, { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabase';
import { setCachedUser } from '@/lib/authCache';
import { primeAuthCache } from '@/hooks/useAuth';
import { clearInvalidSession, isInvalidRefreshTokenError } from '@/lib/authRecovery';

const TAB_SESSION_KEY = 'sht:tab:id';
const ACTIVE_TAB_KEY = 'sht:active:tab:customer';
const ACTIVE_TAB_PREFIX = 'sht:active:tab:user:customer:';

function getOrCreateTabId() {
  if (typeof window === 'undefined') return '';
  let tabId = sessionStorage.getItem(TAB_SESSION_KEY);
  if (!tabId) {
    tabId = `tab_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(TAB_SESSION_KEY, tabId);
  }
  return tabId;
}

function markActiveTab(userId?: string) {
  if (typeof window === 'undefined') return;
  const tabId = getOrCreateTabId();
  localStorage.setItem(ACTIVE_TAB_KEY, JSON.stringify({ tabId, ts: Date.now() }));
  if (userId) {
    localStorage.setItem(`${ACTIVE_TAB_PREFIX}${userId}`, JSON.stringify({ tabId, ts: Date.now() }));
  }
}

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
      markActiveTab(user.id);
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
    </div>
  );
}
