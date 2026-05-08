"use client";
import React, { useEffect, Suspense } from 'react';
import Image from 'next/image';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import supabase from '@/lib/supabase';
import { setCachedRole } from '@/lib/userUtils';

// useSearchParams는 Suspense 경계 안에서만 사용 가능
function ErrorFromParams() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const err = searchParams?.get('error');
    if (err) {
      alert('❌ ' + err);
      router.replace('/login');
    }
  }, [searchParams, router]);

  return null;
}

function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        const code = (error as any).code || error.status || '';
        alert(`❌ 로그인 실패: ${error.message}${code ? ' (' + code + ')' : ''}\n\n매니저 계정 이메일과 비밀번호를 확인해주세요.`);
        setLoading(false);
        return;
      }

      // ✅ 로그인 후 로컬 세션 재확인
      const { data: { session }, error: userError } = await supabase.auth.getSession();
      const user = session?.user ?? null;

      if (userError || !user) {
        console.error('❌ 사용자 정보 조회 실패:', userError);
        alert('로그인은 성공했으나 사용자 정보를 가져올 수 없습니다.');
        setLoading(false);
        return;
      }

      console.log('✅ 로그인된 유저:', user.id, user.email);

      // 사용자가 'users' 테이블에 존재하는지 확인
      const { data: existingUser, error: fetchError } = await supabase
        .from('users')
        .select('id, role, status')
        .eq('id', user.id)
        .single();

      // 매니저/관리자 권한이 없으면 차단 (매니저 앱이므로 신규 guest도 차단)
      const ALLOWED_ROLES = ['manager', 'admin'];
      let userRole: string | null = null;

      if (fetchError) {
        if (fetchError.code === 'PGRST116') {
          // 신규 사용자 → 매니저 앱에서는 가입 불가
          console.warn('⛔ 매니저 권한 없음 (신규 사용자):', user.email);
          await supabase.auth.signOut();
          alert('❌ 매니저 권한이 없는 계정입니다.\n관리자에게 권한 부여를 요청하세요.');
          setLoading(false);
          return;
        } else {
          console.error('❌ 프로필 조회 오류:', fetchError);
          await supabase.auth.signOut();
          alert('사용자 정보를 확인하는 중 오류가 발생했습니다.\n' + fetchError.message);
          setLoading(false);
          return;
        }
      } else {
        userRole = existingUser?.role || null;
        console.log('✅ 기존 프로필 확인:', userRole, existingUser?.status);
      }

      if (!userRole || !ALLOWED_ROLES.includes(userRole)) {
        console.warn('⛔ 매니저 권한 없음:', user.email, 'role=', userRole);
        await supabase.auth.signOut();
        alert(`❌ 매니저 권한이 없는 계정입니다. (현재 권한: ${userRole || '없음'})\n관리자에게 권한 부여를 요청하세요.`);
        setLoading(false);
        return;
      }

      setCachedRole(userRole);

      // 단일 세션 강제: 다른 기기/탭의 모든 세션 종료 (실패해도 로그인 진행)
      try { await supabase.auth.signOut({ scope: 'others' }); } catch { /* noop */ }
      router.push('/'); // 홈 메뉴 페이지로 이동
      router.refresh(); // 세션 반영

    } catch (error) {
      console.error('로그인 처리 오류:', error);
      alert('로그인 처리 중 오류가 발생했습니다.');
      setLoading(false);
    }
  };

  return (
    <div className="max-w-sm mx-auto mt-12 p-4 bg-white shadow rounded">
      <div className="flex justify-center mb-4">
        <Image src="/logo-full.png" alt="스테이하롭 전체 로고" width={320} height={80} priority style={{ width: "auto", height: "auto" }} unoptimized />
      </div>
      <h2 className="text-2xl font-bold mb-6 text-center">🔐 로그인</h2>
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
          매니저 계정 이메일을 입력해주세요.
        </p>
        <input
          type="password"
          placeholder="비밀번호"
          className="w-full border p-2 rounded"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <p className="text-sm text-gray-500 mt-1">매니저 계정 비밀번호를 입력해주세요.</p>
        <button
          type="submit"
          className="bg-blue-500 text-white w-full py-2 rounded hover:bg-blue-600 transition disabled:opacity-50"
          disabled={loading}
        >
          {loading ? '로그인 중...' : '로그인'}
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <>
      <Suspense fallback={null}>
        <ErrorFromParams />
      </Suspense>
      <LoginForm />
    </>
  );
}
