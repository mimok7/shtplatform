'use client';

import React, { useEffect, useMemo, useState } from 'react';
import ManagerLayout from '@/components/ManagerLayout';
import supabase from '@/lib/supabase';
import { logStatusChange } from '@/lib/statusLog';

type RequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

type CancelRow = {
    id: string;
    reservation_id: string;
    requester_user_id: string | null;
    requester_email: string | null;
    requester_phone: string | null;
    refund_bank_name: string | null;
    refund_account_number: string | null;
    refund_account_holder: string | null;
    cancellation_type: 'full' | 'partial';
    cancel_reason_category: 'natural_disaster' | 'change_of_mind' | 'other';
    cancel_reason_detail: string | null;
    cancel_targets: any;
    status: RequestStatus;
    result_status: string;
    manager_note: string | null;
    submitted_at: string;
    reviewed_at: string | null;
    executed_at: string | null;
    execution_summary?: any;
    reservation?: { re_id: string; re_status: string | null; re_user_id: string | null; re_quote_id: string | null; re_type: string | null } | null;
    requester?: { id: string; name: string | null; email: string | null } | null;
};

const SERVICE_TABLE_MAP: Record<string, string> = {
    cruise: 'reservation_cruise',
    cruise_car: 'reservation_cruise_car',
    airport: 'reservation_airport',
    hotel: 'reservation_hotel',
    rentcar: 'reservation_rentcar',
    car_sht: 'reservation_car_sht',
    tour: 'reservation_tour',
};

const STATUS_LABEL: Record<RequestStatus, string> = {
    pending: '대기',
    approved: '승인완료',
    rejected: '반려',
    cancelled: '취소됨',
};

const REASON_LABEL: Record<string, string> = {
    natural_disaster: '자연재해',
    change_of_mind: '단순변심',
    other: '기타',
};

const SERVICE_DISPLAY_ORDER = ['cruise', 'cruise_car', 'car_sht', 'airport', 'rentcar', 'tour', 'hotel', 'ticket'];

const SERVICE_META: Record<string, { name: string; icon: string; bg: string; text: string }> = {
    cruise: { name: '크루즈', icon: '🚢', bg: 'bg-blue-100', text: 'text-blue-700' },
    cruise_car: { name: '크루즈 차량', icon: '🚗', bg: 'bg-cyan-100', text: 'text-cyan-700' },
    car_sht: { name: '셀프카', icon: '🚙', bg: 'bg-teal-100', text: 'text-teal-700' },
    airport: { name: '공항', icon: '✈️', bg: 'bg-amber-100', text: 'text-amber-700' },
    rentcar: { name: '렌트카', icon: '🚘', bg: 'bg-orange-100', text: 'text-orange-700' },
    tour: { name: '투어', icon: '🗺️', bg: 'bg-emerald-100', text: 'text-emerald-700' },
    hotel: { name: '호텔', icon: '🏨', bg: 'bg-rose-100', text: 'text-rose-700' },
    ticket: { name: '티켓', icon: '🎫', bg: 'bg-purple-100', text: 'text-purple-700' },
};

const APPROVED_VISIBLE_DAYS = 7;
const INITIAL_VISIBLE_GROUPS = 10;
const LOAD_MORE_GROUPS = 10;

export default function ManagerCancelRequestsPage() {
    const [user, setUser] = useState<any>(null);
    const [authLoading, setAuthLoading] = useState(true);
    const [mounted, setMounted] = useState(false);
    const [rows, setRows] = useState<CancelRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<RequestStatus | 'all'>('pending');
    const [reasonFilter, setReasonFilter] = useState<'all' | CancelRow['cancel_reason_category']>('all');
    const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});
    const [visibleGroupCount, setVisibleGroupCount] = useState(INITIAL_VISIBLE_GROUPS);
    const [linkModalOpen, setLinkModalOpen] = useState(false);
    const [linkModalForm, setLinkModalForm] = useState<{ reservationId: string; email: string; ttlMinutes: string }>({ reservationId: '', email: '', ttlMinutes: '30' });
    const [linkResult, setLinkResult] = useState<{ url: string; expiresAt: string } | null>(null);
    const [linkLoading, setLinkLoading] = useState(false);
    const [linkCopied, setLinkCopied] = useState(false);
    const [linkError, setLinkError] = useState<string | null>(null);

    const requesterKeyOf = (row: CancelRow) => {
        if (row.requester_user_id) return `uid:${row.requester_user_id}`;
        if (row.requester_email) return `email:${row.requester_email.toLowerCase()}`;
        return `unknown:${row.id}`;
    };

    const requesterLabelOf = (row: CancelRow) => {
        return row.requester?.name || row.requester?.email || row.requester_email || row.refund_account_holder || '미상 신청자';
    };

    const fetchRows = async () => {
        setLoading(true);
        try {
            let query = supabase
                .from('reservation_cancellation_request')
                .select(`
                    id, reservation_id, requester_user_id, requester_email, requester_phone,
                    refund_bank_name, refund_account_number, refund_account_holder,
                    cancellation_type, cancel_reason_category, cancel_reason_detail,
                    cancel_targets, status, result_status, manager_note,
                    submitted_at, reviewed_at, executed_at
                `)
                .order('submitted_at', { ascending: false })
                .limit(200);

            if (statusFilter !== 'all') query = query.eq('status', statusFilter);
            if (reasonFilter !== 'all') query = query.eq('cancel_reason_category', reasonFilter);

            const { data, error } = await query;
            if (error) throw error;

            const baseRows = (data || []) as CancelRow[];
            const reservationIds = Array.from(new Set(baseRows.map((row) => row.reservation_id).filter(Boolean)));
            const requesterIds = Array.from(new Set(baseRows.map((row) => row.requester_user_id).filter(Boolean))) as string[];

            const [reservationRes, requesterRes] = await Promise.all([
                reservationIds.length
                    ? supabase.from('reservation').select('re_id, re_status, re_user_id, re_quote_id, re_type').in('re_id', reservationIds)
                    : Promise.resolve({ data: [], error: null } as any),
                requesterIds.length
                    ? supabase.from('users').select('id, name, email').in('id', requesterIds)
                    : Promise.resolve({ data: [], error: null } as any),
            ]);

            if (reservationRes.error) throw reservationRes.error;
            if (requesterRes.error) throw requesterRes.error;

            const reservationMap = new Map((reservationRes.data || []).map((item: any) => [item.re_id, item]));
            const requesterMap = new Map((requesterRes.data || []).map((item: any) => [item.id, item]));

            // re_user_id 폴백: requester_user_id 없는 행의 예약자 정보 조회
            const reservationUserIds = Array.from(new Set(
                (reservationRes.data || [])
                    .map((r: any) => r.re_user_id)
                    .filter((id: string) => id && !requesterIds.includes(id))
            )) as string[];
            const reservationUserRes = reservationUserIds.length
                ? await supabase.from('users').select('id, name, email').in('id', reservationUserIds)
                : { data: [], error: null };
            const reservationUserMap = new Map(((reservationUserRes as any).data || []).map((item: any) => [item.id, item]));

            const merged = baseRows.map((row) => ({
                ...row,
                reservation: row.reservation_id ? (reservationMap.get(row.reservation_id) as any) || null : null,
                requester: row.requester_user_id
                    ? (requesterMap.get(row.requester_user_id) as any) || null
                    : (() => {
                        const reUserId = row.reservation_id ? (reservationMap.get(row.reservation_id) as any)?.re_user_id : null;
                        return reUserId ? (reservationUserMap.get(reUserId) as any) || null : null;
                    })(),
            }));

            setRows(merged as CancelRow[]);
        } catch (err: any) {
            console.error('[cancel-requests] 조회 실패', err);
            alert(err?.message || '취소 요청 목록을 불러오지 못했습니다.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        let cancelled = false;
        const loadAuth = async () => {
            try {
                const { data, error } = await supabase.auth.getUser();
                if (cancelled) return;
                if (error || !data.user) {
                    setUser(null);
                    return;
                }
                setUser(data.user);
            } catch (err) {
                if (!cancelled) {
                    console.error('[cancel-requests] auth 조회 실패', err);
                    setUser(null);
                }
            } finally {
                if (!cancelled) setAuthLoading(false);
            }
        };
        void loadAuth();
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!mounted || authLoading) return;
        void fetchRows();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mounted, authLoading, statusFilter, reasonFilter]);

    const applyApprove = async (
        row: CancelRow,
        options?: { confirmAction?: boolean; refreshAfter?: boolean; silent?: boolean },
    ) => {
        const confirmAction = options?.confirmAction ?? true;
        const refreshAfter = options?.refreshAfter ?? true;
        const silent = options?.silent ?? false;
        if (!user?.id) return;
        if (row.status !== 'pending') {
            alert('이미 처리된 요청입니다.');
            return;
        }
        if (confirmAction && !confirm(`[${row.cancellation_type === 'full' ? '전체' : '부분'} 취소] 요청을 승인 처리합니까?`)) return;

        setProcessingId(row.id);
        try {
            const executionSummary: any = { deleted: {}, mode: row.cancellation_type };

            if (row.cancellation_type === 'full') {
                const { error: resvErr } = await supabase
                    .from('reservation')
                    .update({ re_status: 'cancelled' })
                    .eq('re_id', row.reservation_id);
                if (resvErr) throw resvErr;

                try {
                    await logStatusChange({
                        reservationId: row.reservation_id,
                        oldStatus: row.reservation?.re_status || null,
                        newStatus: 'cancelled',
                        changedBy: user.id,
                        note: `취소 요청 승인 (사유: ${REASON_LABEL[row.cancel_reason_category]})`,
                    });
                } catch (logErr) {
                    console.warn('[cancel-requests] status log 기록 실패(승인은 계속)', logErr);
                }
                executionSummary.reservationStatus = 'cancelled';
            } else {
                const targets: Array<{ service_type: string; row_id: string; label?: string }> = Array.isArray(row.cancel_targets)
                    ? row.cancel_targets
                    : [];
                for (const target of targets) {
                    const table = SERVICE_TABLE_MAP[target.service_type];
                    if (!table) {
                        console.warn('[cancel-requests] 알 수 없는 service_type:', target.service_type);
                        continue;
                    }
                    const { error: delErr } = await supabase.from(table).delete().eq('id', target.row_id);
                    if (delErr) throw delErr;
                    executionSummary.deleted[target.service_type] = (executionSummary.deleted[target.service_type] || 0) + 1;
                }
            }

            const { error: updErr } = await supabase
                .from('reservation_cancellation_request')
                .update({
                    status: 'approved',
                    result_status: 'executed',
                    reviewed_by: user.id,
                    reviewed_at: new Date().toISOString(),
                    executed_at: new Date().toISOString(),
                    execution_summary: executionSummary,
                    manager_note: noteDraft[row.id] ?? row.manager_note,
                })
                .eq('id', row.id);
            if (updErr) throw updErr;

            if (!silent) alert('취소 요청을 승인 처리했습니다.');
            // 알림 발송
            try {
                await fetch('/api/cancel-notify', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        subcategory: 'cancellation_approved',
                        reservationId: row.reservation_id,
                        title: `예약 취소 승인 (${row.cancellation_type === 'full' ? '전체' : '부분'})`,
                        message: `취소 요청이 승인 처리되었습니다. 사유: ${REASON_LABEL[row.cancel_reason_category]}`,
                        createdBy: user.id,
                        metadata: { cancellationType: row.cancellation_type, reasonCategory: row.cancel_reason_category, executionSummary },
                    }),
                });
            } catch (notifyErr) { console.warn('[cancel-requests] approve notify 실패', notifyErr); }
            if (refreshAfter) await fetchRows();
        } catch (err: any) {
            console.error('[cancel-requests] 승인 실패', err);
            try {
                await supabase
                    .from('reservation_cancellation_request')
                    .update({ result_status: 'failed', manager_note: `[FAILED] ${err?.message || err}` })
                    .eq('id', row.id);
            } catch {/* noop */}
            alert(err?.message || '승인 처리에 실패했습니다.');
        } finally {
            setProcessingId(null);
        }
    };

    const filteredRows = useMemo(() => {
        if (statusFilter !== 'approved') return rows;
        const now = Date.now();
        const limitMs = APPROVED_VISIBLE_DAYS * 24 * 60 * 60 * 1000;
        return rows.filter((row) => {
            const baseDate = row.executed_at || row.reviewed_at || row.submitted_at;
            if (!baseDate) return false;
            const ts = new Date(baseDate).getTime();
            if (Number.isNaN(ts)) return false;
            return now - ts <= limitMs;
        });
    }, [rows, statusFilter]);

    const groupedRows = useMemo(() => {
        const map = new Map<string, {
            key: string;
            quoteId: string | null;
            requesterLabel: string;
            requesterEmail: string | null;
            requesterPhone: string | null;
            refundBankName: string | null;
            refundAccountNumber: string | null;
            refundAccountHolder: string | null;
            rows: CancelRow[];
        }>();

        for (const row of filteredRows) {
            const quoteId = row.reservation?.re_quote_id || null;
            const key = quoteId ? `quote:${quoteId}` : `resv:${row.reservation_id}`;
            const prev = map.get(key);
            if (prev) {
                prev.rows.push(row);
                if (!prev.requesterPhone && row.requester_phone) prev.requesterPhone = row.requester_phone;
                if (!prev.refundBankName && row.refund_bank_name) prev.refundBankName = row.refund_bank_name;
                if (!prev.refundAccountNumber && row.refund_account_number) prev.refundAccountNumber = row.refund_account_number;
                if (!prev.refundAccountHolder && row.refund_account_holder) prev.refundAccountHolder = row.refund_account_holder;
                continue;
            }

            map.set(key, {
                key,
                quoteId,
                requesterLabel: requesterLabelOf(row),
                requesterEmail: row.requester?.email || row.requester_email || null,
                requesterPhone: row.requester_phone || null,
                refundBankName: row.refund_bank_name || null,
                refundAccountNumber: row.refund_account_number || null,
                refundAccountHolder: row.refund_account_holder || null,
                rows: [row],
            });
        }

        return Array.from(map.values()).map((group) => ({
            ...group,
            rows: group.rows.sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime()),
        }));
    }, [filteredRows]);

    const visibleGroupedRows = useMemo(
        () => groupedRows.slice(0, visibleGroupCount),
        [groupedRows, visibleGroupCount],
    );

    const getServiceInfo = (row: CancelRow): Array<{ type: string; name: string; icon: string; bg: string; text: string }> => {
        if (row.cancellation_type === 'full') {
            const reType = row.reservation?.re_type || null;
            if (reType) {
                const meta = SERVICE_META[reType] || { name: reType, icon: '📦', bg: 'bg-gray-100', text: 'text-gray-700' };
                return [{ type: reType, ...meta }];
            }
            return [{ type: 'full', name: '전체 취소', icon: '🗑️', bg: 'bg-red-100', text: 'text-red-700' }];
        }
        const targets: Array<{ service_type: string; row_id: string; label?: string }> = Array.isArray(row.cancel_targets)
            ? row.cancel_targets
            : (typeof row.cancel_targets === 'string' ? (() => { try { return JSON.parse(row.cancel_targets); } catch { return []; } })() : []);
        const serviceTypes = Array.from(new Set(targets.map((t) => t.service_type).filter(Boolean)));
        const orderedTypes = serviceTypes.sort((a, b) => SERVICE_DISPLAY_ORDER.indexOf(a) - SERVICE_DISPLAY_ORDER.indexOf(b));
        return orderedTypes.map((serviceType) => {
            const meta = SERVICE_META[serviceType] || { name: serviceType, icon: '📦', bg: 'bg-gray-100', text: 'text-gray-700' };
            return { type: serviceType, ...meta };
        });
    };

    const applyApproveByRequester = async (groupKey: string) => {
        const group = groupedRows.find((item) => item.key === groupKey);
        if (!group) return;
        const pendingRows = group.rows.filter((row) => row.status === 'pending');
        if (pendingRows.length === 0) {
            alert('승인 가능한 대기 요청이 없습니다.');
            return;
        }

        if (!confirm(`견적 ${group.quoteId ? group.quoteId.slice(0, 8) + '…' : group.requesterLabel} 의 대기 요청 ${pendingRows.length}건을 모두 승인 처리합니까?`)) return;

        let successCount = 0;
        for (const row of pendingRows) {
            try {
                await applyApprove(row, { confirmAction: false, refreshAfter: false, silent: true });
                successCount += 1;
            } catch {
                // applyApprove 내부 처리
            }
        }
        await fetchRows();
        alert(`전체 승인 완료: ${successCount}/${pendingRows.length}건`);
    };

    const applyReject = async (row: CancelRow) => {
        if (!user?.id) return;
        if (row.status !== 'pending') {
            alert('이미 처리된 요청입니다.');
            return;
        }
        const note = (noteDraft[row.id] || '').trim();
        if (!note) {
            alert('반려 사유(메모)를 입력해 주세요.');
            return;
        }
        if (!confirm('이 취소 요청을 반려 처리합니까?')) return;

        setProcessingId(row.id);
        try {
            const { error } = await supabase
                .from('reservation_cancellation_request')
                .update({
                    status: 'rejected',
                    result_status: 'rejected',
                    manager_note: note,
                    reviewed_by: user.id,
                    reviewed_at: new Date().toISOString(),
                })
                .eq('id', row.id);
            if (error) throw error;

            alert('취소 요청을 반려했습니다.');
            try {
                await fetch('/api/cancel-notify', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        subcategory: 'cancellation_rejected',
                        reservationId: row.reservation_id,
                        title: '예약 취소 반려',
                        message: `취소 요청이 반려되었습니다. 사유: ${note}`,
                        createdBy: user.id,
                        metadata: { cancellationType: row.cancellation_type, reasonCategory: row.cancel_reason_category, managerNote: note },
                    }),
                });
            } catch (notifyErr) { console.warn('[cancel-requests] reject notify 실패', notifyErr); }
            await fetchRows();
        } catch (err: any) {
            console.error('[cancel-requests] 반려 실패', err);
            alert(err?.message || '반려 처리에 실패했습니다.');
        } finally {
            setProcessingId(null);
        }
    };

    const issueCancelLink = async () => {
        setLinkLoading(true);
        setLinkError(null);
        setLinkResult(null);
        setLinkCopied(false);
        try {
            const rid = linkModalForm.reservationId.trim();
            const email = linkModalForm.email.trim();
            const ttl = parseInt(linkModalForm.ttlMinutes || '30', 10) || 30;
            if (!rid) throw new Error('예약 ID(re_id)를 입력해 주세요.');
            const res = await fetch('/api/cancel-token/issue', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reservationId: rid, email: email || null, issuedBy: user?.id || null, ttlMinutes: ttl }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json?.error || '발급 실패');
            setLinkResult({ url: json.url, expiresAt: json.expiresAt });
        } catch (e: any) {
            setLinkError(e?.message || '발급 실패');
        } finally {
            setLinkLoading(false);
        }
    };

    const copyLink = async () => {
        if (!linkResult?.url) return;
        try {
            await navigator.clipboard.writeText(linkResult.url);
            setLinkCopied(true);
            setTimeout(() => setLinkCopied(false), 2000);
        } catch {
            // fallback
            const ta = document.createElement('textarea');
            ta.value = linkResult.url;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            setLinkCopied(true);
            setTimeout(() => setLinkCopied(false), 2000);
        }
    };

    const summary = useMemo(() => {
        const counts: Record<RequestStatus | 'total', number> = { pending: 0, approved: 0, rejected: 0, cancelled: 0, total: filteredRows.length };
        filteredRows.forEach((row) => { counts[row.status] = (counts[row.status] || 0) + 1; });
        return counts;
    }, [filteredRows]);

    const selectedRow = useMemo(
        () => filteredRows.find((row) => row.id === selectedRowId) || null,
        [filteredRows, selectedRowId]
    );

    useEffect(() => {
        if (!filteredRows.length) {
            setSelectedRowId(null);
            return;
        }
        if (!selectedRowId || !filteredRows.some((row) => row.id === selectedRowId)) {
            setSelectedRowId(filteredRows[0].id);
        }
    }, [filteredRows, selectedRowId]);

    useEffect(() => {
        setVisibleGroupCount(INITIAL_VISIBLE_GROUPS);
    }, [statusFilter, reasonFilter]);

    if (!mounted || authLoading) {
        return (
            <ManagerLayout title="예약 취소 요청 관리" activeTab="cancel-requests">
                <div className="p-6 text-sm text-gray-600">권한 확인 중...</div>
            </ManagerLayout>
        );
    }

    return (
        <ManagerLayout title="예약 취소 요청 관리" activeTab="cancel-requests">
            <div className="p-3 md:p-4 space-y-2">
                <p className="text-xs text-gray-600">대기 {summary.pending} · 승인 {summary.approved} · 반려 {summary.rejected} · 전체 {summary.total}</p>

                <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                    <div className="rounded-lg border bg-white p-2">
                        <p className="mb-1 text-xs font-semibold text-gray-700">상태 그룹</p>
                        <div className="flex flex-wrap gap-1">
                            {([
                                { key: 'pending', label: '대기' },
                                { key: 'approved', label: '승인' },
                                { key: 'rejected', label: '반려' },
                                { key: 'cancelled', label: '취소됨' },
                                { key: 'all', label: '전체' },
                            ] as const).map((item) => (
                                <button
                                    key={item.key}
                                    type="button"
                                    onClick={() => setStatusFilter(item.key as RequestStatus | 'all')}
                                    className={`inline-flex w-fit min-w-0 whitespace-nowrap rounded-md border px-2 py-1 text-[11px] leading-none ${statusFilter === item.key ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-white'}`}
                                >
                                    {item.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="rounded-lg border bg-white p-2">
                        <p className="mb-1 text-xs font-semibold text-gray-700">사유 그룹</p>
                        <div className="flex flex-wrap gap-1">
                            {([
                                { key: 'all', label: '전체 사유' },
                                { key: 'natural_disaster', label: '자연재해' },
                                { key: 'change_of_mind', label: '단순변심' },
                                { key: 'other', label: '기타' },
                            ] as const).map((item) => (
                                <button
                                    key={item.key}
                                    type="button"
                                    onClick={() => setReasonFilter(item.key as 'all' | CancelRow['cancel_reason_category'])}
                                    className={`inline-flex w-fit min-w-0 whitespace-nowrap rounded-md border px-2 py-1 text-[11px] leading-none ${reasonFilter === item.key ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-white'}`}
                                >
                                    {item.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="rounded-lg border bg-white p-2">
                        <p className="mb-1 text-xs font-semibold text-gray-700">작업 그룹</p>
                        <div className="flex flex-wrap gap-1">
                            <button onClick={fetchRows} className="inline-flex w-fit min-w-0 whitespace-nowrap rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] leading-none text-gray-800 hover:bg-white">새로고침</button>
                            <button
                                onClick={() => {
                                    setLinkModalForm({ reservationId: '', email: '', ttlMinutes: '30' });
                                    setLinkResult(null);
                                    setLinkError(null);
                                    setLinkCopied(false);
                                    setLinkModalOpen(true);
                                }}
                                className="inline-flex w-fit min-w-0 whitespace-nowrap rounded-md border border-purple-200 bg-purple-50 px-2 py-1 text-[11px] leading-none text-purple-700 hover:bg-purple-100"
                            >
                                단회 취소링크 발급
                            </button>
                        </div>
                    </div>
                </div>

                <div className="rounded-lg border bg-white p-3">
                    <h2 className="mb-3 text-sm font-semibold text-gray-800">취소 요청 목록</h2>
                    {loading ? (
                        <p className="p-4 text-sm text-gray-500">불러오는 중...</p>
                    ) : filteredRows.length === 0 ? (
                        <p className="p-4 text-sm text-gray-500">조건에 맞는 취소 요청이 없습니다.</p>
                    ) : (
                        <div className="space-y-4">
                            <div className="space-y-2">
                                {visibleGroupedRows.map((group) => {
                                    const pendingCount = group.rows.filter((row) => row.status === 'pending').length;
                                    return (
                                        <div key={group.key} className="rounded border border-blue-200 bg-blue-50 p-2">
                                            <div className="flex items-center justify-between gap-2">
                                                <strong className="text-sm text-blue-900">{group.requesterLabel}</strong>
                                                <p className="text-xs text-blue-700 whitespace-nowrap">요청 {group.rows.length}건 · 대기 {pendingCount}건</p>
                                            </div>
                                            <div className="mt-1.5 grid gap-1 text-xs text-gray-700 md:grid-cols-3">
                                                {group.requesterEmail && <p>이메일: {group.requesterEmail}</p>}
                                                {group.requesterPhone && <p>연락처: {group.requesterPhone}</p>}
                                                <p>환불은행: {group.refundBankName || '-'}</p>
                                                <p>계좌번호: {group.refundAccountNumber || '-'}</p>
                                                <p>예금주: {group.refundAccountHolder || '-'}</p>
                                            </div>
                                            {pendingCount > 0 && (
                                                <button
                                                    type="button"
                                                    onClick={() => applyApproveByRequester(group.key)}
                                                    disabled={processingId !== null}
                                                    className="mt-2 rounded bg-blue-600 px-3 py-1 text-xs text-white disabled:opacity-50"
                                                >
                                                    견적 전체 승인
                                                </button>
                                            )}
                                            <div className="mt-2 grid gap-2 md:grid-cols-2">
                                                {group.rows.map((row) => {
                                                    const serviceInfos = getServiceInfo(row);
                                                    return (
                                                        <button
                                                            key={row.id}
                                                            type="button"
                                                            onClick={() => setSelectedRowId(row.id)}
                                                            className={`w-full rounded border px-3 py-2 text-left text-sm transition ${selectedRowId === row.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}
                                                        >
                                                            {serviceInfos.length > 0 && (
                                                                <div className="mb-1.5 flex flex-wrap gap-1">
                                                                    {serviceInfos.map((info) => (
                                                                        <span key={info.type} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${info.bg} ${info.text}`}>
                                                                            <span>{info.icon}</span>
                                                                            <span>{info.name}</span>
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            )}
                                                            <div className="flex flex-wrap items-center gap-2">
                                                                <span className={`rounded px-2 py-0.5 text-xs ${row.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : row.status === 'approved' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-700'}`}>
                                                                    {STATUS_LABEL[row.status]}
                                                                </span>
                                                                <span className="rounded bg-purple-100 px-2 py-0.5 text-xs text-purple-800">
                                                                    {REASON_LABEL[row.cancel_reason_category]}
                                                                </span>
                                                                <span className="ml-auto text-xs text-gray-500">{new Date(row.submitted_at).toLocaleString('ko-KR')}</span>
                                                            </div>
                                                            <div className="mt-1 text-xs text-gray-700">
                                                                유형: {row.cancellation_type === 'full' ? '전체' : '부분'}
                                                            </div>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })}
                                {visibleGroupCount < groupedRows.length && (
                                    <div className="pt-2">
                                        <button
                                            type="button"
                                            onClick={() => setVisibleGroupCount((prev) => prev + LOAD_MORE_GROUPS)}
                                            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                                        >
                                            더 불러오기
                                        </button>
                                    </div>
                                )}
                            </div>

                            {selectedRow && (() => {
                                const targets = Array.isArray(selectedRow.cancel_targets) ? selectedRow.cancel_targets : [];
                                return (
                                    <div className="rounded border p-3 text-sm space-y-2">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className={`rounded px-2 py-0.5 text-xs ${selectedRow.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : selectedRow.status === 'approved' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-700'}`}>
                                                {STATUS_LABEL[selectedRow.status]} / {selectedRow.result_status}
                                            </span>
                                            <span className="rounded bg-purple-100 px-2 py-0.5 text-xs text-purple-800">
                                                사유: {REASON_LABEL[selectedRow.cancel_reason_category]}
                                            </span>
                                            <span className="text-xs text-gray-500">유형: {selectedRow.cancellation_type === 'full' ? '전체' : '부분'}</span>
                                        </div>
                                        <div>
                                            <strong>예약 ID:</strong> {selectedRow.reservation_id}
                                            <span className="ml-2 text-gray-500">(현재 상태: {selectedRow.reservation?.re_status || '-'})</span>
                                        </div>
                                        <div>
                                            <strong>신청자:</strong> {selectedRow.requester?.name || '-'} ({selectedRow.requester?.email || selectedRow.requester_email || '-'})
                                        </div>
                                        <div>
                                            <strong>신청자 연락처:</strong> {selectedRow.requester_phone || '-'}
                                        </div>
                                        <div>
                                            <strong>환불 은행명:</strong> {selectedRow.refund_bank_name || '-'}
                                        </div>
                                        <div>
                                            <strong>환불 계좌번호:</strong> {selectedRow.refund_account_number || '-'}
                                        </div>
                                        <div>
                                            <strong>환불 예금주:</strong> {selectedRow.refund_account_holder || '-'}
                                        </div>
                                        <div>
                                            <strong>상세 사유:</strong> {selectedRow.cancel_reason_detail || '-'}
                                        </div>
                                        {selectedRow.cancellation_type === 'partial' && (
                                            <div>
                                                <strong>대상:</strong>
                                                <ul className="ml-4 list-disc">
                                                    {targets.map((target: any, idx: number) => (
                                                        <li key={idx}>[{target.service_type}] {target.label || target.row_id}</li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                        <div>
                                            <label className="block text-xs text-gray-500">매니저 메모(저장됨: {selectedRow.manager_note || '-'})</label>
                                            <textarea
                                                className="mt-1 w-full rounded border p-2 text-sm"
                                                rows={2}
                                                placeholder="승인/반려 시 기록할 메모"
                                                value={noteDraft[selectedRow.id] ?? ''}
                                                onChange={(e) => setNoteDraft((prev) => ({ ...prev, [selectedRow.id]: e.target.value }))}
                                            />
                                        </div>
                                        {selectedRow.status === 'pending' && (
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => applyApprove(selectedRow)}
                                                    disabled={processingId === selectedRow.id}
                                                    className="rounded bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-50"
                                                >
                                                    승인 (취소 실행)
                                                </button>
                                                <button
                                                    onClick={() => applyReject(selectedRow)}
                                                    disabled={processingId === selectedRow.id}
                                                    className="rounded bg-gray-600 px-3 py-1 text-sm text-white disabled:opacity-50"
                                                >
                                                    반려
                                                </button>
                                            </div>
                                        )}
                                        {selectedRow.execution_summary && (
                                            <pre className="rounded bg-gray-50 p-2 text-xs text-gray-700">{JSON.stringify(selectedRow.execution_summary, null, 2)}</pre>
                                        )}
                                    </div>
                                );
                            })()}
                        </div>
                    )}
                </div>
            </div>

            {linkModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                    <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
                        <div className="flex items-center justify-between">
                            <h3 className="text-base font-bold">단회 취소링크 발급</h3>
                            <button onClick={() => setLinkModalOpen(false)} className="text-sm text-gray-500">✕</button>
                        </div>
                        <div className="mt-3 space-y-2 text-sm">
                            <div>
                                <label className="block text-xs text-gray-500">예약 ID (re_id)</label>
                                <input
                                    type="text"
                                    className="mt-1 w-full rounded border p-2"
                                    value={linkModalForm.reservationId}
                                    onChange={(e) => setLinkModalForm((p) => ({ ...p, reservationId: e.target.value }))}
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-500">수신 이메일 (선택)</label>
                                <input
                                    type="email"
                                    className="mt-1 w-full rounded border p-2"
                                    value={linkModalForm.email}
                                    onChange={(e) => setLinkModalForm((p) => ({ ...p, email: e.target.value }))}
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-500">만료 시간(분)</label>
                                <input
                                    type="number"
                                    min={5}
                                    max={1440}
                                    className="mt-1 w-32 rounded border p-2"
                                    value={linkModalForm.ttlMinutes}
                                    onChange={(e) => setLinkModalForm((p) => ({ ...p, ttlMinutes: e.target.value }))}
                                />
                            </div>
                            <button
                                onClick={issueCancelLink}
                                disabled={linkLoading}
                                className="w-full rounded bg-purple-600 px-3 py-2 text-sm text-white disabled:opacity-50"
                            >
                                {linkLoading ? '발급 중...' : '링크 발급'}
                            </button>
                            {linkError && <p className="rounded bg-red-50 p-2 text-xs text-red-700">{linkError}</p>}
                            {linkResult && (
                                <div className="space-y-2 rounded border bg-gray-50 p-2">
                                    <p className="text-xs text-gray-500">만료: {new Date(linkResult.expiresAt).toLocaleString('ko-KR')}</p>
                                    <div className="flex gap-1">
                                        <input
                                            readOnly
                                            value={linkResult.url}
                                            className="flex-1 rounded border bg-white p-2 text-xs"
                                            onFocus={(e) => e.currentTarget.select()}
                                        />
                                        <button
                                            onClick={copyLink}
                                            className="rounded bg-blue-600 px-3 text-xs text-white"
                                        >
                                            {linkCopied ? '복사됨' : '복사'}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </ManagerLayout>
    );
}
