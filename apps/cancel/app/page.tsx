'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

type Mode = 'lookup' | 'reset';

export default function HomePage() {
    const router = useRouter();
    const [mode, setMode] = useState<Mode>('lookup');
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [candidates, setCandidates] = useState<Array<{ reservationId: string; orderId: string | null; reservationDate: string | null; status: string | null; token: string }>>([]);

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
        setLoading(true);
        setMessage(null);
        try {
            const res = await fetch('/api/cancel/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name.trim(), email: email.trim() }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json?.error || '요청 실패');
            setMessage('임시 비밀번호가 이메일로 발송되었습니다. 메일을 확인하신 뒤 로그인하여 이용해 주세요.');
        } catch (err: any) {
            setMessage(err?.message || '요청 실패');
        } finally {
            setLoading(false);
        }
    };

    const onSubmit = () => {
        if (!name.trim() || !email.trim()) {
            setMessage('이름과 이메일을 모두 입력해 주세요.');
            return;
        }
        if (mode === 'lookup') void submitLookup();
        else void submitReset();
    };

    const goCandidate = (reservationId: string, token: string) => {
        router.push(`/r/${reservationId}?t=${encodeURIComponent(token)}`);
    };

    return (
        <div className="space-y-6 py-6">
            <section className="rounded-lg border bg-white p-5">
                <h1 className="text-lg font-bold">예약 취소 신청</h1>
                <p className="mt-1 text-sm text-gray-600">
                    예약 시 입력한 <strong>이름과 이메일</strong>로 본인확인 후 취소 신청을 진행할 수 있습니다.
                    비밀번호를 잊으셨다면 임시 비밀번호 발송 기능을 이용해 주세요.
                </p>
            </section>

            <section className="rounded-lg border bg-white p-5">
                <div className="mb-4 flex gap-2 text-sm">
                    <button
                        type="button"
                        onClick={() => { setMode('lookup'); setMessage(null); }}
                        className={`rounded px-3 py-1 ${mode === 'lookup' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}
                    >
                        취소 신청 페이지로 이동
                    </button>
                    <button
                        type="button"
                        onClick={() => { setMode('reset'); setMessage(null); }}
                        className={`rounded px-3 py-1 ${mode === 'reset' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}
                    >
                        임시 비밀번호 이메일 발송
                    </button>
                </div>

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
                        {loading ? '처리 중...' : (mode === 'lookup' ? '본인확인 후 취소 신청' : '임시 비밀번호 발송')}
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
            </section>
        </div>
    );
}

