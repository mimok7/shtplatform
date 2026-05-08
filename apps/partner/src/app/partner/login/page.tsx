'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

// 로그인 후 역할별 진입 경로
function landingFor(role?: string | null): string {
    switch (role) {
        case 'partner':            return '/partner/dashboard';   // 업체 — 카테고리 적응 대시보드
        case 'manager':
        case 'admin':              return '/partner/admin/partners';
        case 'member':
        default:                   return '/partner/browse';
    }
}

export default function PartnerLoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // ✅ 이미 로그인한 사용자 자동 감지 및 리다이렉트
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                // ✅ getSession() → getUser(): 서버에서 JWT 유효성 검증
                const { data } = await supabase.auth.getUser();
                const user = data?.user ?? null;
                if (cancelled) return;

                if (user) {
                    // 세션이 있으면 역할 조회 후 리다이렉트
                    const { data: userData } = await supabase
                        .from('users')
                        .select('role')
                        .eq('id', user.id)
                        .maybeSingle();
                    if (cancelled) return;
                    const role = userData?.role ?? null;
                    router.replace(landingFor(role));
                } else {
                    // 세션 없으면 로그인 폼 표시
                    setLoading(false);
                }
            } catch (err) {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [router]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);
        try {
            const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
            if (signInError) throw signInError;

            // role 조회 → 역할별 페이지로 이동
            let role: string | null = null;
            try {
                const { data: u } = await supabase
                    .from('users')
                    .select('role')
                    .eq('id', data.user?.id)
                    .maybeSingle();
                role = u?.role ?? null;
            } catch { /* ignore */ }

            // 단일 세션 강제: 다른 기기/탭의 모든 세션 종료 (실패해도 로그인 진행)
            try { await supabase.auth.signOut({ scope: 'others' }); } catch { /* noop */ }
            router.replace(landingFor(role));
        } catch (err: any) {
            setError(err?.message || '로그인 실패');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex flex-col bg-white">
            {/* 머릿글 — 고객앱 NewHomeHeader와 동일 */}
            <header
                className="w-full relative bg-[#0052cc] bg-cover bg-center"
                style={{ backgroundImage: "url('/images/index_15.gif')" }}
            >
                <div className="w-full">
                    <div className="w-full max-w-[600px] mx-auto px-2 md:px-4 py-2">
                        <div className="flex w-full items-center justify-start">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src="/images/logo.png"
                                width={723}
                                height={196}
                                alt="Home"
                                className="block w-auto h-auto max-h-[40px] object-contain"
                            />
                        </div>
                    </div>
                </div>
            </header>

            {/* 본문 — 로그인 카드 */}
            <main className="flex-1 w-full">
                {loading ? (
                    <div className="flex items-center justify-center h-96">
                        <div className="text-center">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                            <p className="text-sm text-gray-600">로그인 확인 중...</p>
                        </div>
                    </div>
                ) : (
                    <div className="max-w-sm w-full mx-auto mt-12 p-4 bg-white shadow rounded">
                        <h2 className="text-2xl font-bold mb-2 text-left">🤝 제휴업체 로그인</h2>
                        <p className="text-sm text-gray-500 mb-6">제휴업체 / 회원 / 매니저 공통 로그인</p>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <input
                                type="email"
                                required
                                placeholder="이메일 (예: partner1@stayhalong.com)"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full border p-2 rounded"
                            />
                            <input
                                type="password"
                                required
                                placeholder="비밀번호"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full border p-2 rounded"
                            />
                            {error && <div className="text-sm text-red-600">{error}</div>}
                            <button
                                type="submit"
                                disabled={loading}
                                className="bg-blue-700 text-white w-full py-2 rounded hover:bg-blue-800 transition disabled:opacity-50"
                            >
                                {loading ? '처리 중...' : '로그인'}
                            </button>
                        </form>

                        <p className="mt-4 text-xs text-gray-500 text-center leading-relaxed">
                            제휴업체 계정 초기 비밀번호는 매니저가 별도 안내합니다.<br />
                            로그인 후 비밀번호 변경을 권장합니다.
                        </p>
                    </div>
                )}
            </main>

            {/* 바닥글 — 고객앱 NewHomeFooter와 동일 */}
            <footer className="w-full bg-white pb-6 border-t border-gray-100">
                <div className="w-full max-w-[600px] mx-auto px-4 mt-6">
                    <div className="w-full flex justify-start opacity-80">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src="/images/index_16.gif"
                            alt="Footer Logos"
                            className="block w-full h-auto object-contain"
                        />
                    </div>
                </div>
            </footer>
        </div>
    );
}
