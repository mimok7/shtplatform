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

  // 비밀번호 찾기
  const [showForgot, setShowForgot] = useState(false);
  const [forgotName, setForgotName] = useState('');
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotMessage, setForgotMessage] = useState<string | null>(null);

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

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotName.trim() || !forgotEmail.trim()) {
      setForgotMessage('이름과 이메일을 모두 입력해 주세요.');
      return;
    }
    setForgotLoading(true);
    setForgotMessage(null);
    try {
      const res = await fetch('/api/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: forgotName.trim(), email: forgotEmail.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || '요청 실패');
      setForgotMessage('입력하신 정보로 이메일이 발송되었습니다. 받은 편지함을 확인해 주세요.\n(스팸 폴더도 확인 부탁드립니다.)');
      setForgotName('');
      setForgotEmail('');
    } catch (err: any) {
      setForgotMessage(err?.message || '오류가 발생했습니다.');
    } finally {
      setForgotLoading(false);
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

      <div className="mt-3 text-left">
        <button
          type="button"
          onClick={() => { setShowForgot((v) => !v); setForgotMessage(null); }}
          className="text-sm text-gray-500 hover:text-gray-700 underline"
        >
          비밀번호를 잊으셨나요?
        </button>
      </div>

      {showForgot && (
        <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
          <h3 className="text-sm font-semibold text-gray-800 mb-2">임시 비밀번호 발송</h3>
          <p className="text-xs text-gray-600 mb-3">
            예약 시 입력한 <strong>이름과 이메일</strong>을 입력하시면 임시 비밀번호를 보내드립니다.
            받으신 임시 비밀번호로 로그인 후 <strong>내 정보</strong>에서 새 비밀번호로 변경해 주세요.
          </p>
          <form onSubmit={handleForgotPassword} className="space-y-2">
            <input
              type="text"
              placeholder="이름 (예약 시 입력한 이름)"
              className="w-full border p-2 rounded text-sm"
              value={forgotName}
              onChange={(e) => setForgotName(e.target.value)}
              required
            />
            <input
              type="email"
              placeholder="이메일 (예약 시 사용한 이메일)"
              className="w-full border p-2 rounded text-sm"
              value={forgotEmail}
              onChange={(e) => setForgotEmail(e.target.value)}
              required
            />
            <button
              type="submit"
              disabled={forgotLoading}
              className="w-full bg-orange-500 text-white py-2 rounded text-sm hover:bg-orange-600 disabled:opacity-50"
            >
              {forgotLoading ? '발송 중...' : '임시 비밀번호 이메일 받기'}
            </button>
          </form>
          {forgotMessage && (
            <p className="mt-2 text-xs whitespace-pre-line rounded bg-white border px-3 py-2 text-gray-700">
              {forgotMessage}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
