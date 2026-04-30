'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function PartnerLoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);
        try {
            const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
            if (signInError) throw signInError;
            router.replace('/partner/booking');
        } catch (err: any) {
            setError(err?.message || '로그인 실패');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4">
            <div className="w-full max-w-sm bg-white border border-gray-200 rounded-lg shadow-sm p-6">
                <h1 className="text-lg font-semibold text-gray-800 mb-1">제휴업체 시스템</h1>
                <p className="text-xs text-gray-500 mb-4">로그인이 필요합니다.</p>
                <form onSubmit={handleSubmit} className="space-y-3">
                    <input
                        type="email"
                        required
                        placeholder="이메일"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full px-3 py-2 text-sm rounded border border-gray-200 bg-gray-50 focus:bg-white focus:outline-none focus:border-blue-300"
                    />
                    <input
                        type="password"
                        required
                        placeholder="비밀번호"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full px-3 py-2 text-sm rounded border border-gray-200 bg-gray-50 focus:bg-white focus:outline-none focus:border-blue-300"
                    />
                    {error && <div className="text-xs text-red-500">{error}</div>}
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full px-3 py-2 text-sm rounded bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50"
                    >
                        {loading ? '로그인 중...' : '로그인'}
                    </button>
                </form>
            </div>
        </div>
    );
}
