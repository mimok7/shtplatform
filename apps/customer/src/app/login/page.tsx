"use client";
import React, { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabase';
import { setCachedUser } from '@/lib/authCache';
import { primeAuthCache } from '@/hooks/useAuth';
import { clearInvalidSession, isInvalidRefreshTokenError } from '@/lib/authRecovery';
import { buildProfileCompletionPath, hasRequiredProfileFields } from '@/lib/profileRequirements';

const TAB_SESSION_KEY = 'sht:tab:id';
const ACTIVE_TAB_KEY = 'sht:active:tab:customer';
const ACTIVE_TAB_PREFIX = 'sht:active:tab:user:customer:';

function isMobileOrStandalone() {
  if (typeof window === 'undefined') return false;
  const userAgent = window.navigator.userAgent || '';
  const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
  const isStandalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return isMobileDevice || isStandalone;
}

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
  if (isMobileOrStandalone()) return;
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

      const { data: profile } = await supabase
        .from('users')
        .select('email, name, english_name, phone_number')
        .eq('id', user.id)
        .maybeSingle();

      if (!hasRequiredProfileFields({
        email: profile?.email || user.email || '',
        name: profile?.name || '',
        english_name: profile?.english_name || '',
        phone_number: profile?.phone_number || '',
      })) {
        router.replace(buildProfileCompletionPath('/mypage'));
        return;
      }

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
    <div className="max-w-md mx-auto mt-8 px-3 py-6">
      {/* 로고 */}
      <div className="mb-8 flex justify-center">
        <Image src="/logo-full.png" alt="스테이하롱" width={280} height="70" unoptimized priority />
      </div>

      {/* 메인 폼 */}
      <div className="bg-white rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold text-slate-900 mb-4 text-center">예약 신청/확인</h2>

        <form onSubmit={handleLogin} className="space-y-3">
          <div>
            <label className="block text-xs text-slate-600 mb-1.5 font-medium">이메일</label>
            <input
              id="login-email"
              type="email"
              placeholder="예약 시 입력한 이메일"
              className="w-full border border-slate-200 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-xs text-slate-600 mb-1.5 font-medium">비밀번호</label>
            <input
              id="login-password"
              type="password"
              placeholder="6자 이상 입력"
              className="w-full border border-slate-200 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium text-sm hover:bg-blue-700 transition disabled:opacity-50 mt-4"
            disabled={loading}
          >
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </form>
      </div>

      {/* 링크 영역 */}
      <div className="flex flex-col items-center gap-3 text-sm">
        <button
          onClick={() => router.push('/signup')}
          className="text-blue-600 hover:text-blue-700 font-medium"
        >
          신규 가입
        </button>
        <button
          onClick={() => setShowForgot(!showForgot)}
          className="text-slate-500 hover:text-slate-700"
        >
          비밀번호를 잊으셨나요?
        </button>
      </div>

      {/* 비밀번호 찾기 폼 */}
      {showForgot && (
        <div className="mt-6 bg-slate-50 border border-slate-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">임시 비밀번호 발송</h3>
          <form onSubmit={handleForgotPassword} className="space-y-2.5">
            <div>
              <input
                type="text"
                placeholder="이름 (예약 시 입력한 이름)"
                className="w-full border border-slate-200 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={forgotName}
                onChange={(e) => setForgotName(e.target.value)}
                required
              />
            </div>
            <div>
              <input
                type="email"
                placeholder="이메일 (예약 시 입력한 이메일)"
                className="w-full border border-slate-200 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                required
              />
            </div>
            <button
              type="submit"
              className="w-full bg-blue-600 text-white py-2 rounded-lg font-medium text-sm hover:bg-blue-700 transition disabled:opacity-50"
              disabled={forgotLoading}
            >
              {forgotLoading ? '발송 중...' : '임시 비밀번호 발송'}
            </button>
          </form>

          {forgotMessage && (
            <div className={`mt-3 text-xs p-2.5 rounded ${forgotMessage.includes('발송') ? 'bg-blue-50 text-blue-800' : 'bg-red-50 text-red-800'}`}>
              {forgotMessage}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
