"use client";
import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabase';
import { upsertUserProfile } from '@/lib/userUtils';
import { clearCachedUser, setCachedUser } from '@/lib/authCache';

const AUTO_CLEAR_KEY = 'sh_auto_clear_done_v1';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [autoClearing, setAutoClearing] = useState(false);

  useEffect(() => {
    const runAutoClear = async () => {
      try {
        if (sessionStorage.getItem(AUTO_CLEAR_KEY) === '1') return;

        const url = new URL(window.location.href);
        const alreadyAutoCleared = url.searchParams.get('autocleared') === '1';

        if (alreadyAutoCleared) {
          sessionStorage.setItem(AUTO_CLEAR_KEY, '1');
          url.searchParams.delete('autocleared');
          window.history.replaceState({}, '', `${url.pathname}${url.search}`);
          return;
        }

        setAutoClearing(true);
        await performSiteDataClear({ isAuto: true });
      } catch (err) {
        console.error('자동 초기화 오류:', err);
        setAutoClearing(false);
      }
    };

    runAutoClear();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        // 계정이 없는 경우 회원가입 페이지로 이동
        if (error.message.includes('Invalid login credentials') ||
          error.message.includes('Email not confirmed') ||
          error.message.includes('User not found')) {
          alert('계정이 존재하지 않습니다. 회원가입 페이지로 이동합니다.');
          router.push('/signup');
          return;
        }

        // 다른 오류는 기존 방식으로 처리
        alert('❌ 로그인 실패: ' + error.message);
        setLoading(false);
        return;
      }

      const user = data.user;
      if (!user) {
        alert('로그인에 실패했습니다.');
        setLoading(false);
        return;
      }

      console.log('✅ 로그인 성공:', user.id, user.email);

      // 프로필 확인하여 적절한 페이지로 리디렉션
      const { data: profile } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();

      // 세션 캐시 저장
      setCachedUser(user);

      // 프로필이 없으면 백그라운드에서 생성
      if (!profile) {
        console.log('ℹ️  프로필 없음, 백그라운드에서 생성');
        upsertUserProfile(user.id, user.email || '', {
          name: user.user_metadata?.display_name || user.email?.split('@')[0] || '사용자',
          role: 'guest',
        }).catch(err => console.error('프로필 생성 오류:', err));
      }

      // 바로 mypage로 이동
      router.push('/mypage/quotes');

    } catch (error) {
      console.error('로그인 처리 오류:', error);
      alert('로그인 처리 중 오류가 발생했습니다.');
      setLoading(false);
    }
  };

  const getDashboardPath = (role: string | null) => {
    switch (role) {
      case 'member': return '/customer/dashboard';
      case 'manager': return '/manager/dashboard';
      case 'admin': return '/admin/dashboard';
      default: return '/user/dashboard';
    }
  };

  const performSiteDataClear = async ({ isAuto }: { isAuto: boolean }) => {
    try {
      // 1) 서버에 Clear-Site-Data 헤더 요청 (HttpOnly 쿠키 포함 초기화)
      await fetch('/api/clear-site-data', { method: 'POST', cache: 'no-store' });

      // 2) 클라이언트 인증 캐시/세션 정리
      clearCachedUser();
      try {
        await supabase.auth.signOut({ scope: 'local' });
      } catch {
        // signOut 실패해도 아래 클라이언트 정리는 계속 수행
      }

      // 3) 브라우저 저장소 정리
      try { localStorage.clear(); } catch { }
      try { sessionStorage.clear(); } catch { }

      // 자동 실행 무한 루프 방지용 플래그 재설정
      try { sessionStorage.setItem(AUTO_CLEAR_KEY, '1'); } catch { }

      // 4) IndexedDB/Cache/ServiceWorker 정리
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

      if (!isAuto) {
        alert('초기화가 완료되었습니다. 페이지를 다시 로드합니다.');
      }

      if (isAuto) {
        const nextUrl = new URL(window.location.href);
        nextUrl.searchParams.set('autocleared', '1');
        window.location.replace(`${nextUrl.pathname}${nextUrl.search}`);
      } else {
        window.location.href = '/';
      }
    } catch (err) {
      console.error('사이트 데이터 초기화 오류:', err);
      if (!isAuto) {
        alert('초기화 중 오류가 발생했습니다. 다시 시도해주세요.');
      }
    }
  };

  const handleClearSiteData = async () => {
    const ok = window.confirm(
      'stayhalong 관련 쿠키/세션/저장소를 초기화합니다.\n진행하시겠습니까?'
    );
    if (!ok) return;

    await performSiteDataClear({ isAuto: false });
  };

  return (
    <div className="max-w-sm mx-auto mt-12 p-4 bg-white shadow rounded">
      <div className="flex justify-start mb-4">
        <Image src="/logo-full.png" alt="스테이하롱 전체 로고" width={320} height={80} unoptimized />
      </div>
      <h2 className="text-2xl font-bold mb-6 text-left">🔐 견적 신청/확인</h2>
      {autoClearing && (
        <div className="mb-4 rounded bg-yellow-50 border border-yellow-200 text-yellow-700 px-3 py-2 text-sm">
          브라우저 데이터 자동 초기화 중입니다. 잠시만 기다려주세요...
        </div>
      )}
      <form onSubmit={handleLogin} className="space-y-4">
        <input
          type="email"
          placeholder="이메일"
          className="w-full border p-2 rounded"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <p className="text-sm text-gray-500 mt-1">
          견적 신청시 입력하신 이메일과 비밀번호를 입력해주세요.
        </p>
        <input
          type="password"
          placeholder="비밀번호"
          className="w-full border p-2 rounded"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <p className="text-sm text-gray-500 mt-1">비밀번호는 6자 이상 입력해주세요.</p>
        <button
          type="submit"
          className="bg-blue-500 text-white w-full py-2 rounded hover:bg-blue-600 transition disabled:opacity-50"
          disabled={loading}
        >
          {loading ? '처리 중...' : '견적 신청/확인'}
        </button>
      </form>

      <div className="mt-4 text-left">
        <p className="text-sm text-gray-600">
          계정이 없으신가요?{' '}
          <button
            onClick={() => router.push('/signup')}
            className="text-blue-500 hover:text-blue-700 underline"
          >
            신규견적
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
