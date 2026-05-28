'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';

type ReasonCategory = 'natural_disaster' | 'change_of_mind' | 'other';
type CancelType = 'full' | 'partial';

type TargetItem = { serviceType: string; rowId: string; label: string };

type Reservation = {
    re_id: string;
    re_status: string | null;
    order_id: string | null;
    total_amount: number | null;
    reservation_date: string | null;
};

type HistoryItem = {
    id: string;
    status: string;
    result_status: string;
    cancellation_type: CancelType;
    cancel_reason_category: string;
    submitted_at: string;
};

const REASON_OPTIONS: { value: ReasonCategory; label: string; hint: string }[] = [
    { value: 'natural_disaster', label: '자연재해', hint: '태풍·홍수·항공결항 등' },
    { value: 'change_of_mind', label: '단순 변심', hint: '환불 규정 적용' },
    { value: 'other', label: '기타', hint: '상세 사유 필수 입력' },
];

export default function CancelDetailPage() {
    const params = useParams();
    const search = useSearchParams();
    const reservationId = params?.reservationId as string;
    const token = search?.get('t') || '';

    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [reservation, setReservation] = useState<Reservation | null>(null);
    const [targets, setTargets] = useState<TargetItem[]>([]);
    const [history, setHistory] = useState<HistoryItem[]>([]);

    const [cancelType, setCancelType] = useState<CancelType>('full');
    const [reasonCategory, setReasonCategory] = useState<ReasonCategory>('change_of_mind');
    const [reasonDetail, setReasonDetail] = useState('');
    const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

    useEffect(() => {
        const init = async () => {
            try {
                if (!token || !reservationId) throw new Error('잘못된 접근입니다.');
                const res = await fetch('/api/cancel/context', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token, reservationId }),
                });
                const json = await res.json();
                if (!res.ok) throw new Error(json?.error || '토큰이 만료되었거나 유효하지 않습니다.');
                setReservation(json.reservation || null);
                setTargets(json.targets || []);
                setHistory(json.requests || []);
                setSelectedKeys(new Set((json.targets || []).map((t: TargetItem) => `${t.serviceType}:${t.rowId}`)));
            } catch (err: any) {
                setError(err?.message || '로드 실패');
            } finally {
                setLoading(false);
            }
        };
        void init();
    }, [token, reservationId]);

    const onToggle = (key: string) => {
        setSelectedKeys((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key); else next.add(key);
            return next;
        });
    };

    const selectedTargets = useMemo(() => {
        if (cancelType !== 'partial') return [];
        return targets
            .filter((t) => selectedKeys.has(`${t.serviceType}:${t.rowId}`))
            .map((t) => ({ service_type: t.serviceType, row_id: t.rowId, label: t.label }));
    }, [cancelType, selectedKeys, targets]);

    const onSubmit = async () => {
        const detail = reasonDetail.trim();
        if (reasonCategory === 'other' && !detail) {
            alert('기타 사유는 상세 내용을 입력해 주세요.');
            return;
        }
        if (cancelType === 'partial' && selectedTargets.length === 0) {
            alert('부분 취소 대상을 선택해 주세요.');
            return;
        }
        if (!confirm('취소 신청을 등록하시겠습니까? (토큰은 1회 사용 후 만료됩니다)')) return;

        setSubmitting(true);
        try {
            const res = await fetch('/api/cancel/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    token,
                    reservationId,
                    cancellationType: cancelType,
                    reasonCategory,
                    reasonDetail: detail || null,
                    cancelTargets: cancelType === 'partial' ? selectedTargets : null,
                }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json?.error || '신청 실패');
            alert('취소 신청이 정상 접수되었습니다. 매니저 확인 후 처리됩니다.');
            window.location.href = '/';
        } catch (err: any) {
            alert(err?.message || '신청 실패');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) return <div className="py-10 text-center text-sm text-gray-500">불러오는 중...</div>;
    if (error) return <div className="py-10 text-center text-sm text-red-600">{error}</div>;
    if (!reservation) return <div className="py-10 text-center text-sm text-gray-500">예약을 찾을 수 없습니다.</div>;

    return (
        <div className="space-y-6 py-6">
            <section className="rounded-lg border bg-white p-5 text-sm">
                <h1 className="text-lg font-bold">예약 정보</h1>
                <div className="mt-2 space-y-1">
                    <p><strong>주문번호:</strong> {reservation.order_id || '-'}</p>
                    <p><strong>상태:</strong> {reservation.re_status || '-'}</p>
                    <p><strong>예약일:</strong> {reservation.reservation_date || '-'}</p>
                    <p><strong>총액:</strong> {reservation.total_amount?.toLocaleString?.() || 0} 원</p>
                </div>
            </section>

            <section className="rounded-lg border bg-white p-5 space-y-4 text-sm">
                <h2 className="text-base font-semibold">취소 신청</h2>
                <div className="flex flex-wrap gap-3">
                    <label className="flex items-center gap-2">
                        <input type="radio" checked={cancelType === 'full'} onChange={() => setCancelType('full')} /> 전체 취소
                    </label>
                    <label className="flex items-center gap-2">
                        <input type="radio" checked={cancelType === 'partial'} onChange={() => setCancelType('partial')} /> 부분 취소
                    </label>
                </div>

                {cancelType === 'partial' && (
                    <div className="space-y-1">
                        <p className="font-medium">대상 선택</p>
                        {targets.length === 0 ? (
                            <p className="text-gray-500">선택 가능한 서비스가 없습니다.</p>
                        ) : (
                            <div className="max-h-72 space-y-2 overflow-y-auto rounded border p-2">
                                {targets.map((t) => {
                                    const key = `${t.serviceType}:${t.rowId}`;
                                    return (
                                        <label key={key} className="flex items-start gap-2">
                                            <input type="checkbox" checked={selectedKeys.has(key)} onChange={() => onToggle(key)} className="mt-1" />
                                            <span><strong className="mr-2">[{t.serviceType}]</strong>{t.label}</span>
                                        </label>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                <div>
                    <p className="font-medium">취소 사유 분류</p>
                    <div className="mt-2 grid gap-2 md:grid-cols-3">
                        {REASON_OPTIONS.map((opt) => (
                            <label key={opt.value} className={`cursor-pointer rounded border p-3 ${reasonCategory === opt.value ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}>
                                <input type="radio" className="mr-2" checked={reasonCategory === opt.value} onChange={() => setReasonCategory(opt.value)} />
                                <strong>{opt.label}</strong>
                                <div className="text-xs text-gray-500">{opt.hint}</div>
                            </label>
                        ))}
                    </div>
                </div>

                <div>
                    <label className="block font-medium">상세 사유 {reasonCategory === 'other' && <span className="text-red-500">*</span>}</label>
                    <textarea
                        className="mt-1 w-full rounded border p-2"
                        rows={4}
                        value={reasonDetail}
                        onChange={(e) => setReasonDetail(e.target.value)}
                    />
                </div>

                <button
                    type="button"
                    disabled={submitting}
                    onClick={onSubmit}
                    className="w-full rounded bg-red-600 px-4 py-2 font-medium text-white disabled:opacity-50"
                >
                    {submitting ? '저장 중...' : '취소 신청 저장'}
                </button>
            </section>

            <section className="rounded-lg border bg-white p-5 text-sm">
                <h2 className="text-base font-semibold">최근 신청 이력</h2>
                {history.length === 0 ? (
                    <p className="mt-2 text-gray-500">이력이 없습니다.</p>
                ) : (
                    <ul className="mt-2 space-y-1">
                        {history.map((h) => (
                            <li key={h.id}>
                                {new Date(h.submitted_at).toLocaleString('ko-KR')} — {h.cancellation_type} / {h.cancel_reason_category} / <strong>{h.status}</strong>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
}

