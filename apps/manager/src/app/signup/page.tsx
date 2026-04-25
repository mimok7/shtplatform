'use client';
import React from 'react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabase';

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    email: '',
    password: '',
    name: '',
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
        options: {
          data: {
            display_name: form.name,
          },
        },
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
      console.log('ℹ️ users 테이블 등록은 예약 시점에 처리됩니다.');

      alert('✅ 회원가입이 완료되었습니다!\n로그인 후 견적을 작성하신 후 예약 시 회원정보를 등록하세요.');
      router.push('/login');
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
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto p-6">
      <h1 className="text-xl font-bold mb-4">회원가입</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="text"
          name="name"
          placeholder="이름을 입력하세요"
          value={form.name}
          onChange={handleChange}
          required
          className="w-full border rounded px-3 py-2"
        />
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
          {loading ? '가입 중...' : '회원가입'}
        </button>
      </form>

      <div className="text-center mt-4">
        <button
          onClick={() => router.push('/login')}
          className="text-blue-500 hover:text-blue-700"
        >
          이미 계정이 있으신가요? 로그인하기
        </button>
      </div>

      <div className="mt-6 p-4 bg-blue-50 rounded-lg">
        <p className="text-sm text-blue-700">
          💡 이메일과 비밀번호는 향후 예약내용을 확인하실 때 사용됩니다.
        </p>
      </div>
    </div>
  );
}
