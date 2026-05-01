'use client';
import React from 'react';
import Image from 'next/image';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabase';

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    email: '',
    password: '',
  });
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // 1. Supabase Auth 회원가입
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
      });

      if (authError) {
        // Auth 오류 구체적으로 처리
        if (authError.message.includes('already registered') || authError.message.includes('User already registered')) {
          throw new Error('이미 가입된 이메일입니다. 로그인하거나 비밀번호 재설정을 이용해주세요.');
        }
        throw authError;
      }

      if (!authData.user) {
        throw new Error('사용자 생성에 실패했습니다. 다시 시도해주세요.');
      }

      console.log('✅ Auth 회원가입 성공:', authData.user.id);
      console.log('ℹ️ users 테이블 등록은 견적 시점에 처리됩니다.');

      // 로딩 상태 명시적으로 해제 후 리다이렉트 (페이지 전환 전에 상태 업데이트 완료)
      setLoading(false);

      // 약간의 딜레이 후 리다이렉트 (상태 업데이트가 확실히 적용되도록)
      setTimeout(() => {
        window.location.href = 'https://quote.stayhalong.com/mypage';
      }, 300);
    } catch (error: any) {
      console.error('❌ 회원가입 실패:', error);

      // 사용자 친화적인 에러 메시지
      let errorMessage = '회원가입 실패:\n';
      if (error.message) {
        errorMessage += error.message;
      } else if (error.error_description) {
        errorMessage += error.error_description;
      } else {
        errorMessage += '알 수 없는 오류가 발생했습니다.';
      }

      alert(errorMessage);
      setLoading(false);
    }
  };

  return (
    <div className="max-w-sm mx-auto mt-12 p-4 bg-white shadow rounded">
      <div className="flex justify-start mb-4">
        <Image src="/logo-full.png" alt="스테이하롱 전체 로고" width={320} height={80} unoptimized />
      </div>
      <h2 className="text-2xl font-bold mb-6 text-left">📝 신규견적</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="email"
          name="email"
          placeholder="이메일을 입력하세요"
          value={form.email}
          onChange={handleChange}
          required
          className="w-full border rounded px-3 py-2"
        />
        <input
          type="password"
          name="password"
          placeholder="비밀번호는 6자리 이상 입력"
          value={form.password}
          onChange={handleChange}
          required
          minLength={6}
          className="w-full border rounded px-3 py-2"
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-500 text-white py-2 rounded hover:bg-blue-600 disabled:opacity-50"
        >
          {loading ? '처리 중...' : '신규견적'}
        </button>
      </form>

      <div className="text-left mt-4">
        <button
          onClick={() => router.push('/login')}
          className="text-blue-500 hover:text-blue-700 underline"
        >
          이미 계정이 있으신가요? 견적 신청/확인
        </button>
      </div>

      <div className="mt-6 p-4 bg-blue-50 rounded-lg">
        <p className="text-sm text-blue-700">
          💡 이메일과 비밀번호는 향후 견적내용을 확인하실 때 사용됩니다.
        </p>
      </div>
    </div>
  );
}
