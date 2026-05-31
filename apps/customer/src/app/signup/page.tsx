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
          alert('이미 가입된 이메일입니다. 로그인하거나 비밀번호 재설정을 이용해주세요.');
          router.push('/login');
          return;
        }
        throw authError;
      }

      if (!authData.user) {
        throw new Error('사용자 생성에 실패했습니다. 다시 시도해주세요.');
      }

      console.log('✅ Auth 회원가입 성공:', authData.user.id);
      console.log('ℹ️ users 테이블 등록은 예약 시점에 처리됩니다.');

      // 즉시 리다이렉트
      router.push('/mypage/profile');
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
    <div className="max-w-md mx-auto mt-8 px-3 py-6">
      {/* 로고 */}
      <div className="mb-8 flex justify-center">
        <Image src="/logo-full.png" alt="스테이하롱" width={280} height="70" unoptimized priority />
      </div>

      {/* 메인 폼 */}
      <div className="bg-white rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold text-slate-900 mb-4 text-center">신규 예약</h2>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs text-slate-600 mb-1.5 font-medium">이메일</label>
            <input
              type="email"
              name="email"
              placeholder="사용할 이메일 입력"
              value={form.email}
              onChange={handleChange}
              required
              className="w-full border border-slate-200 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-600 mb-1.5 font-medium">비밀번호</label>
            <input
              type="password"
              name="password"
              placeholder="6자 이상 입력"
              value={form.password}
              onChange={handleChange}
              required
              minLength={6}
              className="w-full border border-slate-200 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium text-sm hover:bg-blue-700 transition disabled:opacity-50 mt-4"
          >
            {loading ? '가입 중...' : '신규 예약'}
          </button>
        </form>
      </div>

      {/* 안내 메시지 */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
        <p className="font-medium mb-1">💡 안내</p>
        <p className="text-xs leading-relaxed">
          입력하신 이메일과 비밀번호는 예약 확인 및 관리 시 사용됩니다.
        </p>
      </div>

      {/* 로그인 링크 */}
      <div className="mt-4 text-center">
        <button
          onClick={() => router.push('/login')}
          className="text-sm text-slate-600 hover:text-blue-600"
        >
          이미 계정이 있으신가요? <span className="font-medium">로그인</span>
        </button>
      </div>
    </div>
  );
}
