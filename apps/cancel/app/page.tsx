'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { getBrowserSupabase } from '@/lib/supabase';

type Mode = 'lookup' | 'login' | 'menu';

function HomeContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [mode, setMode] = useState<Mode>('login');
    const [checkingSession, setCheckingSession] = useState(true);
    const [sessionEmail, setSessionEmail] = useState('');
    const [email, setEmail] = useState('');
    const [loginEmail, setLoginEmail] = useState('');
    const [loginPassword, setLoginPassword] = useState('');
    const [showForgot, setShowForgot] = useState(false);
    const [forgotEmail, setForgotEmail] = useState('');
    const [forgotLoading, setForgotLoading] = useState(false);
    const [forgotMessage, setForgotMessage] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<string | null>(null);

    useEffect(() => {
        const modeParam = searchParams.get('mode');
        if (modeParam === 'lookup') {
            setMode('lookup');
        }
    }, [searchParams]);

    useEffect(() => {
        let cancelled = false;
        const init = async () => {
            try {
                const supabase = getBrowserSupabase();
                const { data } = await supabase.auth.getSession();
                if (cancelled) return;
                if (data.session?.user) {
                    const emailValue = (data.session.user.email || '').trim();
                    setSessionEmail(emailValue);
                    setLoginEmail(emailValue);
                    setMode('menu');
                }
            } catch {
                // noop
            } finally {
                if (!cancelled) setCheckingSession(false);
            }
        };
        void init();
        return () => { cancelled = true; };
    }, []);

    const submitLookupByEmail = async (emailValue: string) => {
        setLoading(true);
        setMessage(null);
        try {
            const res = await fetch('/api/cancel/lookup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: emailValue.trim() }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json?.error || '요청 실패');

            if (json.reservations && json.reservations.length > 1) {
                router.push('/cancel/select');
                return;
            }
            if (json.token && json.reservationId) {
                router.push(`/r/${json.reservationId}?t=${encodeURIComponent(json.token)}`);
                return;
            }
            setMessage('취소 가능한 예약을 찾지 못했습니다.');
        } catch (err: any) {
            setMessage(err?.message || '자동 조회 중 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };

    const submitLookup = async () => {
        setLoading(true);
        setMessage(null);
        try {
            const res = await fetch('/api/cancel/lookup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email.trim() }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json?.error || '요청 실패');

            if (json.reservations && json.reservations.length > 1) {
                router.push('/cancel/select');
                return;
            }
            if (json.token && json.reservationId) {
                router.push(`/r/${json.reservationId}?t=${encodeURIComponent(json.token)}`);
                return;
            }
            setMessage('예약을 찾지 못했습니다. 이메일을 다시 확인해 주세요.');
        } catch (err: any) {
            setMessage(err?.message || '요청 실패');
        } finally {
            setLoading(false);
        }
    };

    const submitReset = async () => {
        setForgotLoading(true);
        setForgotMessage(null);
        try {
            const res = await fetch('/api/cancel/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: forgotEmail.trim() }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json?.error || '요청 실패');
            setForgotMessage('입력하신 이메일로 이메일이 발송되었습니다. 받은 편지함을 확인해 주세요.\n(스팸 폴더도 확인 부탁드립니다.)');
            setForgotEmail('');
        } catch (err: any) {
            setForgotMessage(err?.message || '요청 실패');
        } finally {
            setForgotLoading(false);
        }
    };

    const submitLogin = async () => {
        setLoading(true);
        setMessage(null);
        try {
            const supabase = getBrowserSupabase();
            const { error } = await supabase.auth.signInWithPassword({
                email: loginEmail.trim(),
                password: loginPassword,
            });
            if (error) {
                if (error.message.includes('Invalid login credentials')) {
                    setMessage('이메일 또는 비밀번호가 올바르지 않습니다. 임시 비밀번호로 다시 시도해 주세요.');
                    return;
                }
                throw error;
            }
            const emailValue = loginEmail.trim();
            setSessionEmail(emailValue);
            setMode('menu');
        } catch (err: any) {
            setMessage(err?.message || '로그인 실패');
        } finally {
            setLoading(false);
        }
    };

    const onSubmit = () => {
        if (mode === 'login') {
            if (!loginEmail.trim() || !loginPassword.trim()) {
                setMessage('이메일과 비밀번호를 모두 입력해 주세요.');
                return;
            }
            void submitLogin();
            return;
        }

        if (!email.trim()) {
            setMessage('이메일을 입력해 주세요.');
            return;
        }

        if (mode === 'lookup') void submitLookup();
    };

    const onSubmitForgot = () => {
        if (!forgotEmail.trim()) {
            setForgotMessage('이메일을 입력해 주세요.');
            return;
        }
        void submitReset();
    };

    return (
        <div className="space-y-6 py-6 w-full max-w-[600px] mx-auto px-4">
            <section className="max-w-sm mx-auto mt-2 p-4 bg-white shadow rounded">
                <div className="flex justify-start mb-4">
                    <Image
                        src="/logo-full.png"
                        alt="스테이하롱 전체 로고"
                        width={320}
                        height={80}
                        style={{ width: 'auto', height: 'auto', maxWidth: '100%' }}
                        unoptimized
                        priority
                    />
                </div>
                <h2 className="text-2xl font-bold mb-6 text-left">🔐 예약 취소 신청</h2>

                {checkingSession ? (
                    <div className="flex items-center justify-center py-10">
                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500" />
                    </div>
                ) : sessionEmail ? (
                    <div className="space-y-4">
                        <div className="rounded border bg-green-50 p-3 text-sm text-green-700">
                            <span className="font-semibold">{sessionEmail}</span> 계정으로 로그인되었습니다.
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => { setMode('lookup'); void submitLookupByEmail(sessionEmail); }}
                                disabled={loading}
                                className="rounded-lg bg-blue-600 text-white py-3 font-semibold hover:bg-blue-700 transition disabled:opacity-50 flex flex-col items-center justify-center gap-1"
                            >
                                <span className="text-lg">💬</span>
                                <span className="text-sm">취소신청</span>
                            </button>
                            <button
                                onClick={() => router.push('/history')}
                                className="rounded-lg bg-purple-600 text-white py-3 font-semibold hover:bg-purple-700 transition flex flex-col items-center justify-center gap-1"
                            >
                                <span className="text-lg">📋</span>
                                <span className="text-sm">취소이력</span>
                            </button>
                        </div>

                        <button
                            onClick={async () => {
                                const supabase = getBrowserSupabase();
                                await supabase.auth.signOut();
                                setSessionEmail('');
                                setMode('login');
                            }}
                            className="w-full rounded text-sm text-gray-500 hover:text-gray-700 underline"
                        >
                            로그아웃
                        </button>

                        {loading && (
                            <div className="flex items-center justify-center py-6">
                                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500" />
                            </div>
                        )}

                        {message && <p className="rounded bg-gray-50 p-2 text-xs text-gray-700">{message}</p>}
                    </div>
                ) : mode === 'login' ? (
                    <>
                        <div className="space-y-4">
                            <input
                                id="cancel-login-email"
                                name="email"
                                type="email"
                                autoComplete="email"
                                placeholder="이메일"
                                className="w-full border p-2 rounded"
                                value={loginEmail}
                                onChange={(e) => setLoginEmail(e.target.value)}
                                required
                            />
                            <p className="text-sm text-gray-700 mt-1">
                                예약 신청시 입력하신 이메일과 비밀번호를 입력해주세요.
                            </p>

                            <input
                                id="cancel-login-password"
                                name="password"
                                type="password"
                                autoComplete="current-password"
                                placeholder="비밀번호"
                                className="w-full border p-2 rounded"
                                value={loginPassword}
                                onChange={(e) => setLoginPassword(e.target.value)}
                                required
                            />
                            <p className="text-sm text-gray-700 mt-1">비밀번호는 6자 이상 입력해주세요.</p>

                            <button
                                type="button"
                                className="bg-blue-700 text-white w-full py-2 rounded hover:bg-blue-800 transition disabled:opacity-50"
                                disabled={loading}
                                onClick={onSubmit}
                            >
                                {loading ? '처리 중...' : '예약 취소 신청'}
                            </button>
                        </div>

                        {message && <p className="mt-3 rounded bg-gray-50 p-2 text-xs text-gray-700">{message}</p>}

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
                                    예약 시 사용한 <strong>이메일</strong>을 입력하시면 임시 비밀번호를 보내드립니다.
                                    받으신 임시 비밀번호로 로그인 후 <strong>내 정보</strong>에서 새 비밀번호로 변경해 주세요.
                                </p>
                                <div className="space-y-2">
                                    <input
                                        type="email"
                                        placeholder="이메일 (예약 시 사용한 이메일)"
                                        className="w-full border p-2 rounded text-sm"
                                        value={forgotEmail}
                                        onChange={(e) => setForgotEmail(e.target.value)}
                                    />
                                    <button
                                        type="button"
                                        disabled={forgotLoading}
                                        onClick={onSubmitForgot}
                                        className="w-full bg-orange-500 text-white py-2 rounded text-sm hover:bg-orange-600 disabled:opacity-50"
                                    >
                                        {forgotLoading ? '발송 중...' : '임시 비밀번호 이메일 받기'}
                                    </button>
                                </div>
                                {forgotMessage && (
                                    <p className="mt-2 text-xs whitespace-pre-line rounded bg-white border px-3 py-2 text-gray-700">
                                        {forgotMessage}
                                    </p>
                                )}
                            </div>
                        )}

                    </>
                ) : (
                    <>
                        <div className="space-y-3">
                            <div>
                                <label className="block text-sm font-medium">이메일</label>
                                <input
                                    type="email"
                                    className="mt-1 w-full rounded border p-2 text-sm"
                                    placeholder="예약 시 사용한 이메일"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                />
                            </div>

                            <button
                                type="button"
                                disabled={loading}
                                onClick={onSubmit}
                                className="w-full rounded bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                            >
                                {loading ? '처리 중...' : '본인확인 후 취소 신청'}
                            </button>

                            {message && <p className="rounded bg-gray-50 p-2 text-xs text-gray-700">{message}</p>}
                        </div>

                        <p className="mt-3 text-xs text-gray-500">로그인된 계정의 예약만 취소 신청할 수 있습니다.</p>
                    </>
                )}
            </section>
        </div>
    );
}

export default function HomePage() {
    return (
        <Suspense fallback={
            <div className="flex h-72 items-center justify-center">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500" />
            </div>
        }>
            <HomeContent />
        </Suspense>
    );
}

