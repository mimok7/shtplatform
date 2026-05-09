'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabase';

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

function markActiveTab() {
  if (typeof window === 'undefined') return;
  const tabId = getOrCreateTabId();
  localStorage.setItem(ACTIVE_TAB_KEY, JSON.stringify({ tabId, ts: Date.now() }));
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // signInWithPassword 응답에 user가 직접 포함되어 있으므로 getUser() 추가 호출 불필요
      const { data: signInData, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        alert('로그인 실패: ' + error.message);
        setLoading(false);
        return;
      }

      const user = signInData.user;
      if (!user) {
        alert('로그인 세션 확인에 실패했습니다. 다시 시도해주세요.');
        setLoading(false);
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single();

      if (profileError || profile?.role !== 'admin') {
        void supabase.auth.signOut();
        alert('관리자 계정만 로그인 가능합니다.');
        setLoading(false);
        return;
      }

      // 단일 세션 강제: fire-and-forget (await 불필요 — 로그인 지연 방지)
      void supabase.auth.signOut({ scope: 'others' }).catch(() => undefined);
      markActiveTab();
      router.replace('/admin');
      // router.refresh() 제거: replace 후 자동으로 새 세션 반영됨
    } catch (error) {
      console.error('로그인 처리 오류:', error);
      alert('로그인 처리 중 오류가 발생했습니다.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-sm w-full bg-white rounded-lg shadow-sm p-6">
        <div className="flex justify-center mb-4">
          <Image
            src="/logo-full.png"
            alt="스테이하롱 로고"
            width={280}
            height={72}
            unoptimized
            loading="eager"
            style={{ width: 'auto', height: 'auto' }}
          />
        </div>
        <h2 className="text-xl font-bold mb-5 text-center">관리자 로그인</h2>

        <form onSubmit={handleLogin} className="space-y-3">
          <input
            type="email"
            placeholder="이메일"
            className="w-full border border-gray-200 p-2 rounded"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="비밀번호"
            className="w-full border border-gray-200 p-2 rounded"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button
            type="submit"
            className="bg-blue-500 text-white w-full py-2 rounded hover:bg-blue-600 transition disabled:opacity-50"
            disabled={loading}
          >
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </form>

        <p className="text-xs text-gray-500 mt-4 text-center">관리자 권한이 없는 계정은 자동으로 차단됩니다.</p>
      </div>
    </div>
  );
}
