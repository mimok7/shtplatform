'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { getBrowserSupabase } from '@/lib/supabase';

type Mode = 'lookup' | 'login';

function HomeContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [mode, setMode] = useState<Mode>('login');
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [loginEmail, setLoginEmail] = useState('');
    const [loginPassword, setLoginPassword] = useState('');
    const [showForgot, setShowForgot] = useState(false);
    const [forgotName, setForgotName] = useState('');
    const [forgotEmail, setForgotEmail] = useState('');
    const [forgotLoading, setForgotLoading] = useState(false);
    const [forgotMessage, setForgotMessage] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [candidates, setCandidates] = useState<Array<{ reservationId: string; orderId: string | null; reservationDate: string | null; status: string | null; token: string }>>([]);

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
                    setMode('lookup');
                    setLoginEmail(data.session.user.email || '');
                }
            } catch {
                // noop
            }
        };
        void init();
        return () => { cancelled = true; };
    }, []);

    const submitLookup = async () => {
        setLoading(true);
        setMessage(null);
        setCandidates([]);
        try {
            const res = await fetch('/api/cancel/lookup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name.trim(), email: email.trim() }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json?.error || '요청 실패');

            if (json.reservations && json.reservations.length > 1) {
                setCandidates(json.reservations);
                setMessage('취소 가능한 예약이 여러 건 확인되었습니다. 아래에서 선택해 주세요.');
                return;
            }
            if (json.token && json.reservationId) {
                router.push(`/r/${json.reservationId}?t=${encodeURIComponent(json.token)}`);
                return;
            }
            setMessage('예약을 찾지 못했습니다. 이름과 이메일을 다시 확인해 주세요.');
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
                body: JSON.stringify({ name: forgotName.trim(), email: forgotEmail.trim() }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json?.error || '요청 실패');
            setForgotMessage('입력하신 정보로 이메일이 발송되었습니다. 받은 편지함을 확인해 주세요.\n(스팸 폴더도 확인 부탁드립니다.)');
            setForgotName('');
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
        setCandidates([]);
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
            setMessage('로그인되었습니다. 예약 취소 신청 페이지로 이동합니다.');
            // 로그인 직후 별도 본인확인 페이지 없이 바로 취소 신청 흐름으로 이동
            // 자동으로 서버에 본인(로그인된 이메일)에 대한 예약 조회를 요청합니다.
            try {
                const res = await fetch('/api/cancel/lookup', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: '', email: loginEmail.trim() }),
                });
                const json = await res.json();
                if (res.ok) {
                    if (json.reservations && json.reservations.length > 1) {
                        // 여러 예약이 있으면 후보 선택 UI로 이동(조회 모드)
                        setCandidates(json.reservations);
                        setMode('lookup');
                        return;
                    }
                    if (json.token && json.reservationId) {
                        router.push(`/r/${json.reservationId}?t=${encodeURIComponent(json.token)}`);
                        return;
                    }
                    // 예약 없음
                    setMode('lookup');
                    setMessage('취소 가능한 예약을 찾지 못했습니다. 예약 목록에서 선택해 주세요.');
                    return;
                } else {
                    throw new Error(json?.error || '예약 조회 실패');
                }
            } catch (err: any) {
                // 실패 시에는 기존 lookup 모드로 전환하여 수동 본인확인 허용
                setMode('lookup');
                setMessage(err?.message || '자동 조회 중 오류가 발생했습니다. 아래에서 이름과 이메일로 직접 조회해 주세요.');
            }
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

        if (!name.trim() || !email.trim()) {
            setMessage('이름과 이메일을 모두 입력해 주세요.');
            return;
        }

        if (mode === 'lookup') void submitLookup();
    };

    const onSubmitForgot = () => {
        if (!forgotName.trim() || !forgotEmail.trim()) {
            setForgotMessage('이름과 이메일을 모두 입력해 주세요.');
            return;
        }
        void submitReset();
    };

    const goCandidate = (reservationId: string, token: string) => {
        router.push(`/r/${reservationId}?t=${encodeURIComponent(token)}`);
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

                {mode === 'login' ? (
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
                                    예약 시 입력한 <strong>이름과 이메일</strong>을 입력하시면 임시 비밀번호를 보내드립니다.
                                    받으신 임시 비밀번호로 로그인 후 <strong>내 정보</strong>에서 새 비밀번호로 변경해 주세요.
                                </p>
                                <div className="space-y-2">
                                    <input
                                        type="text"
                                        placeholder="이름 (예약 시 입력한 이름)"
                                        className="w-full border p-2 rounded text-sm"
                                        value={forgotName}
                                        onChange={(e) => setForgotName(e.target.value)}
                                    />
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
                                <label className="block text-sm font-medium">이름</label>
                                <input
                                    type="text"
                                    className="mt-1 w-full rounded border p-2 text-sm"
                                    placeholder="예약 시 입력한 이름"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                />
                            </div>
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

                            {candidates.length > 0 && (
                                <div className="mt-2 space-y-2 rounded border bg-gray-50 p-2 text-sm">
                                    <p className="text-xs text-gray-500">취소 신청할 예약을 선택하세요. (링크는 30분간 1회 유효)</p>
                                    {candidates.map((c) => (
                                        <button
                                            key={c.reservationId}
                                            type="button"
                                            onClick={() => goCandidate(c.reservationId, c.token)}
                                            className="block w-full rounded border bg-white p-2 text-left hover:bg-blue-50"
                                        >
                                            <div className="font-medium">주문번호 {c.orderId || '-'}</div>
                                            <div className="text-xs text-gray-500">예약일 {c.reservationDate || '-'} / 상태 {c.status || '-'}</div>
                                        </button>
                                    ))}
                                </div>
                            )}
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

