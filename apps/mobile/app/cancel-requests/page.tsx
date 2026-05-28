// @ts-nocheck
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import supabase from '@/lib/supabase';
import { ArrowLeft } from 'lucide-react';

type RequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

const SERVICE_TABLE_MAP: Record<string, string> = {
    cruise: 'reservation_cruise',
    cruise_car: 'reservation_cruise_car',
    airport: 'reservation_airport',
    hotel: 'reservation_hotel',
    rentcar: 'reservation_rentcar',
    car_sht: 'reservation_car_sht',
    tour: 'reservation_tour',
};

const REASON_LABEL: Record<string, string> = {
    natural_disaster: '자연재해',
    change_of_mind: '단순변심',
    other: '기타',
};

export default function MobileCancelRequestsPage() {
    const [rows, setRows] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<RequestStatus | 'all'>('pending');
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [userId, setUserId] = useState<string | null>(null);
    const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!cancelled) setUserId(user?.id || null);
            } catch {/* noop */}
        })();
        return () => { cancelled = true; };
    }, []);

    const fetchRows = async () => {
        setLoading(true);
        try {
            let q = supabase
                .from('reservation_cancellation_request')
                .select('id, reservation_id, cancellation_type, cancel_reason_category, cancel_reason_detail, cancel_targets, status, result_status, manager_note, submitted_at, requester_email, requester:requester_user_id ( id, name, email ), reservation:reservation_id ( re_id, re_status )')
                .order('submitted_at', { ascending: false })
                .limit(100);
            if (statusFilter !== 'all') q = q.eq('status', statusFilter);
            const { data, error } = await q;
            if (error) throw error;
            setRows(data || []);
        } catch (err: any) {
            alert(err?.message || '목록 조회 실패');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { void fetchRows(); }, [statusFilter]);

    const approve = async (row: any) => {
        if (row.status !== 'pending') return alert('이미 처리됨');
        if (!confirm('승인하시겠습니까?')) return;
        setProcessingId(row.id);
        try {
            const summary: any = { deleted: {}, mode: row.cancellation_type };
            if (row.cancellation_type === 'full') {
                await supabase.from('reservation').update({ re_status: 'cancelled' }).eq('re_id', row.reservation_id);
                summary.reservationStatus = 'cancelled';
            } else {
                const targets = Array.isArray(row.cancel_targets) ? row.cancel_targets : [];
                for (const t of targets) {
                    const table = SERVICE_TABLE_MAP[t.service_type];
                    if (!table) continue;
                    await supabase.from(table).delete().eq('id', t.row_id);
                    summary.deleted[t.service_type] = (summary.deleted[t.service_type] || 0) + 1;
                }
            }
            await supabase.from('reservation_cancellation_request').update({
                status: 'approved',
                result_status: 'executed',
                reviewed_by: userId,
                reviewed_at: new Date().toISOString(),
                executed_at: new Date().toISOString(),
                execution_summary: summary,
                manager_note: noteDraft[row.id] ?? row.manager_note,
            }).eq('id', row.id);
            try {
                await fetch('/api/cancel-notify', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        subcategory: 'cancellation_approved',
                        reservationId: row.reservation_id,
                        title: `예약 취소 승인 (${row.cancellation_type === 'full' ? '전체' : '부분'})`,
                        message: `취소 요청이 승인 처리되었습니다. 사유: ${REASON_LABEL[row.cancel_reason_category] || row.cancel_reason_category}`,
                        createdBy: userId,
                        metadata: { cancellationType: row.cancellation_type, reasonCategory: row.cancel_reason_category, executionSummary: summary },
                    }),
                });
            } catch (e) { console.warn('approve notify 실패', e); }
            await fetchRows();
        } catch (err: any) {
            alert(err?.message || '승인 실패');
        } finally {
            setProcessingId(null);
        }
    };

    const reject = async (row: any) => {
        const note = (noteDraft[row.id] || '').trim();
        if (!note) return alert('반려 사유 입력');
        if (!confirm('반려하시겠습니까?')) return;
        setProcessingId(row.id);
        try {
            await supabase.from('reservation_cancellation_request').update({
                status: 'rejected',
                result_status: 'rejected',
                manager_note: note,
                reviewed_by: userId,
                reviewed_at: new Date().toISOString(),
            }).eq('id', row.id);
            try {
                await fetch('/api/cancel-notify', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        subcategory: 'cancellation_rejected',
                        reservationId: row.reservation_id,
                        title: '예약 취소 반려',
                        message: `취소 요청이 반려되었습니다. 사유: ${note}`,
                        createdBy: userId,
                        metadata: { cancellationType: row.cancellation_type, reasonCategory: row.cancel_reason_category, managerNote: note },
                    }),
                });
            } catch (e) { console.warn('reject notify 실패', e); }
            await fetchRows();
        } catch (err: any) {
            alert(err?.message || '반려 실패');
        } finally {
            setProcessingId(null);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 pb-20">
            <header className="sticky top-0 z-10 flex items-center gap-2 border-b bg-white p-3">
                <Link href="/manager" className="text-gray-500"><ArrowLeft className="h-5 w-5" /></Link>
                <h1 className="text-base font-bold">취소 요청 처리</h1>
            </header>

            <div className="p-3 space-y-3">
                <div className="flex gap-2 overflow-x-auto text-xs">
                    {(['pending','approved','rejected','all'] as const).map((s) => (
                        <button
                            key={s}
                            onClick={() => setStatusFilter(s as any)}
                            className={`whitespace-nowrap rounded-full border px-3 py-1 ${statusFilter === s ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700'}`}
                        >
                            {s === 'pending' ? '대기' : s === 'approved' ? '승인' : s === 'rejected' ? '반려' : '전체'}
                        </button>
                    ))}
                </div>

                {loading ? (
                    <p className="p-4 text-center text-sm text-gray-500">불러오는 중...</p>
                ) : rows.length === 0 ? (
                    <p className="p-4 text-center text-sm text-gray-500">요청 없음</p>
                ) : (
                    rows.map((row) => {
                        const targets = Array.isArray(row.cancel_targets) ? row.cancel_targets : [];
                        return (
                            <div key={row.id} className="rounded-lg border bg-white p-3 text-sm shadow-sm space-y-2">
                                <div className="flex flex-wrap items-center gap-1 text-xs">
                                    <span className={`rounded px-2 py-0.5 ${row.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : row.status === 'approved' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-700'}`}>
                                        {row.status}
                                    </span>
                                    <span className="rounded bg-purple-100 px-2 py-0.5 text-purple-800">{REASON_LABEL[row.cancel_reason_category] || row.cancel_reason_category}</span>
                                    <span className="rounded bg-gray-100 px-2 py-0.5">{row.cancellation_type === 'full' ? '전체' : '부분'}</span>
                                    <span className="ml-auto text-gray-400">{new Date(row.submitted_at).toLocaleString('ko-KR')}</span>
                                </div>
                                <p className="text-xs text-gray-600">예약: {row.reservation_id?.slice(0, 8)} · 신청자 {row.requester?.name || row.requester?.email || row.requester_email || '-'}</p>
                                <p className="text-xs">사유: {row.cancel_reason_detail || '-'}</p>
                                {row.cancellation_type === 'partial' && targets.length > 0 && (
                                    <ul className="ml-4 list-disc text-xs">
                                        {targets.map((t: any, i: number) => (
                                            <li key={i}>[{t.service_type}] {t.label || t.row_id}</li>
                                        ))}
                                    </ul>
                                )}
                                {row.status === 'pending' && (
                                    <>
                                        <textarea
                                            className="w-full rounded border p-2 text-xs"
                                            rows={2}
                                            placeholder="매니저 메모"
                                            value={noteDraft[row.id] ?? ''}
                                            onChange={(e) => setNoteDraft((p) => ({ ...p, [row.id]: e.target.value }))}
                                        />
                                        <div className="flex gap-2">
                                            <button onClick={() => approve(row)} disabled={processingId === row.id} className="flex-1 rounded bg-blue-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-50">승인</button>
                                            <button onClick={() => reject(row)} disabled={processingId === row.id} className="flex-1 rounded bg-gray-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-50">반려</button>
                                        </div>
                                    </>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
