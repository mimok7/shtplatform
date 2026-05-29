'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserSupabase } from '@/lib/supabase';

type Candidate = {
    reservationId: string;
    orderId: string | null;
    reservationDate: string | null;
    status: string | null;
    token: string;
};

export default function CancelSelectPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState<string | null>(null);
    const [candidates, setCandidates] = useState<Candidate[]>([]);

    useEffect(() => {
        let cancelled = false;
        const init = async () => {
            try {
                const supabase = getBrowserSupabase();
                const { data } = await supabase.auth.getSession();
                if (cancelled) return;

                const sessionEmail = (data.session?.user?.email || '').trim();
                if (!sessionEmail) {
                    router.replace('/');
                    return;
                }

                const res = await fetch('/api/cancel/lookup', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: sessionEmail }),
                });
                const json = await res.json();
                if (!res.ok) {
                    throw new Error(json?.error || '요청 실패');
                }

                if (json.token && json.reservationId) {
                    router.replace(`/r/${json.reservationId}?t=${encodeURIComponent(json.token)}`);
                    return;
                }

                const rows = (json.reservations || []) as Candidate[];
                setCandidates(rows);
                if (rows.length === 0) {
                    setMessage('취소 가능한 예약을 찾지 못했습니다.');
                }
            } catch (err: any) {
                if (!cancelled) {
                    setMessage(err?.message || '예약 조회 중 오류가 발생했습니다.');
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        void init();
        return () => {
            cancelled = true;
        };
    }, [router]);

    return (
        <div className="space-y-4 py-6 w-full max-w-[600px] mx-auto px-4">
            <section className="max-w-sm mx-auto mt-2 p-4 bg-white shadow rounded">
                <h2 className="text-xl font-bold text-left">예약 선택</h2>
                <p className="mt-1 text-xs text-gray-500">취소 신청할 예약을 선택하세요. (링크는 30분간 1회 유효)</p>

                {loading && (
                    <div className="flex items-center justify-center py-8">
                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500" />
                    </div>
                )}

                {!loading && message && <p className="mt-3 rounded bg-gray-50 p-2 text-xs text-gray-700">{message}</p>}

                {!loading && candidates.length > 0 && (
                    <div className="mt-3 space-y-2 rounded border bg-gray-50 p-2 text-sm">
                        {candidates.map((c) => (
                            <button
                                key={c.reservationId}
                                type="button"
                                onClick={() => router.push(`/r/${c.reservationId}?t=${encodeURIComponent(c.token)}`)}
                                className="block w-full rounded border bg-white p-2 text-left hover:bg-blue-50"
                            >
                                <div className="text-xs text-gray-500">예약일 {c.reservationDate || '-'} / 상태 {c.status || '-'}</div>
                            </button>
                        ))}
                    </div>
                )}

                <div className="mt-4">
                    <button
                        type="button"
                        onClick={() => router.push('/')}
                        className="w-full rounded border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                        홈으로 돌아가기
                    </button>
                </div>
            </section>
        </div>
    );
}
