'use client';

import React, { useEffect, useMemo, useState } from 'react';
import ManagerLayout from '@/components/ManagerLayout';
import SectionBox from '@/components/SectionBox';
import supabase from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { logStatusChange } from '@/lib/statusLog';
import { openCentralReservationDetailModal } from '@/contexts/reservationDetailModalEvents';

type RequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'completed';

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
    refund_amount: number | null;
    refund_payment_id: string | null;
    refund_completed_at: string | null;
    refund_completed_by: string | null;
    total_paid: number | null;
    service_checkin: string | null;
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
    completed: '환불완료',
};

const STATUS_BADGE: Record<RequestStatus, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    approved: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-700',
    cancelled: 'bg-gray-100 text-gray-700',
    completed: 'bg-emerald-100 text-emerald-800',
};

const REASON_LABEL: Record<string, string> = {
    natural_disaster: '자연재해',
    change_of_mind: '단순변심',
    other: '기타',
};

const SERVICE_DISPLAY_ORDER = ['cruise', 'cruise_car', 'car_sht', 'airport', 'tour', 'rentcar', 'hotel', 'ticket'];

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

const SERVICE_TYPE_ALIAS: Record<string, string> = {
    car: 'cruise_car',
};

const normalizeServiceType = (value: string | null | undefined): string => {
    if (!value) return '';
    return SERVICE_TYPE_ALIAS[value] || value;
};

const serviceOrderIndex = (serviceType: string): number => {
    const idx = SERVICE_DISPLAY_ORDER.indexOf(normalizeServiceType(serviceType));
    return idx === -1 ? 999 : idx;
};

const formatAmountInput = (value: string): string => {
    const digits = value.replace(/[^\d]/g, '');
    if (!digits) return '';
    return Number(digits).toLocaleString('ko-KR');
};

const getPrimaryServiceType = (row: CancelRow): string => {
    if (row.cancellation_type === 'full') return normalizeServiceType(row.reservation?.re_type || '');
    const targets: Array<{ service_type: string }> = Array.isArray(row.cancel_targets)
        ? row.cancel_targets
        : (typeof row.cancel_targets === 'string' ? (() => { try { return JSON.parse(row.cancel_targets); } catch { return []; } })() : []);
    const types = Array.from(new Set(targets.map((t) => normalizeServiceType(t.service_type)).filter(Boolean)));
    types.sort((a, b) => serviceOrderIndex(a) - serviceOrderIndex(b));
    return types[0] || '';
};

const APPROVED_VISIBLE_DAYS = 7;
const INITIAL_VISIBLE_GROUPS = 10;

type PenaltyInfo = {
    daysUntil: number | null;
    penaltyRate: number;
    refundRate: number;
    penaltyAmount: number;
    refundAmount: number;
    label: string;
    cannotCancel: boolean;
};

function calcCancelFee(
    checkinDate: string | null | undefined,
    totalPaid: number | null | undefined,
    reasonCategory: CancelRow['cancel_reason_category'],
): PenaltyInfo {
    const paid = totalPaid ?? 0;
    if (reasonCategory === 'natural_disaster') {
        return { daysUntil: null, penaltyRate: 0, refundRate: 1, penaltyAmount: 0, refundAmount: paid, label: '자연재해: 위약금 없음 (전액 환불)', cannotCancel: false };
    }
    if (!checkinDate) return { daysUntil: null, penaltyRate: 0, refundRate: 1, penaltyAmount: 0, refundAmount: paid, label: '이용일 미확인', cannotCancel: false };
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const checkin = new Date(checkinDate); checkin.setHours(0, 0, 0, 0);
    const daysUntil = Math.floor((checkin.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    let penaltyRate: number; let label: string; let cannotCancel = false;
    if (daysUntil > 30) { penaltyRate = 0; label = '위약금 없음 (전액 환불)'; }
    else if (daysUntil >= 21) { penaltyRate = 0.15; label = '위약금 15% (21일전단30일전)'; }
    else if (daysUntil >= 17) { penaltyRate = 0.5; label = '위약금 50% (17일전단20일전)'; }
    else { penaltyRate = 1; label = '환불 불가 (16일 이내)'; cannotCancel = true; }
    const penaltyAmount = Math.round(paid * penaltyRate);
    const refundAmount = paid - penaltyAmount;
    return { daysUntil, penaltyRate, refundRate: 1 - penaltyRate, penaltyAmount, refundAmount, label, cannotCancel };
}
const LOAD_MORE_GROUPS = 10;

export default function ManagerCancelRequestsPage() {
    const { user, loading: authLoading } = useAuth();
    const [mounted, setMounted] = useState(false);
    const [rows, setRows] = useState<CancelRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<RequestStatus | 'all'>('pending');
    const [reasonFilter, setReasonFilter] = useState<'all' | CancelRow['cancel_reason_category']>('all');
    const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});
    const [refundDraft, setRefundDraft] = useState<Record<string, string>>({});
    const [refundGroupDraft, setRefundGroupDraft] = useState<Record<string, string>>({});
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

    const handleRowCardClick = (event: React.MouseEvent<HTMLElement>, row: CancelRow) => {
        const target = event.target as HTMLElement;
        if (target.closest('button, input, textarea, select, a, label')) return;

        setSelectedRowId(row.id);
        const userId = row.requester_user_id || row.reservation?.re_user_id;
        if (!userId) {
            alert('예약자 정보를 찾을 수 없어 통합 상세를 열 수 없습니다.');
            return;
        }
        openCentralReservationDetailModal({ userId, mode: 'auto' });
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
                    submitted_at, reviewed_at, executed_at,
                    refund_amount, refund_payment_id, refund_completed_at, refund_completed_by
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

            const [reservationRes, requesterRes, cruiseRes, cruiseCarRes, rentcarRes, carShtRes, airportRes, hotelRes] = await Promise.all([
                reservationIds.length
                    ? supabase.from('reservation').select('re_id, re_status, re_user_id, re_quote_id, re_type, total_amount').in('re_id', reservationIds)
                    : Promise.resolve({ data: [], error: null } as any),
                requesterIds.length
                    ? supabase.from('users').select('id, name, email').in('id', requesterIds)
                    : Promise.resolve({ data: [], error: null } as any),
                reservationIds.length
                    ? supabase.from('reservation_cruise').select('reservation_id, checkin').in('reservation_id', reservationIds)
                    : Promise.resolve({ data: [], error: null } as any),
                reservationIds.length
                    ? supabase.from('reservation_cruise_car').select('reservation_id, pickup_datetime').in('reservation_id', reservationIds)
                    : Promise.resolve({ data: [], error: null } as any),
                reservationIds.length
                    ? supabase.from('reservation_rentcar').select('reservation_id, pickup_datetime').in('reservation_id', reservationIds)
                    : Promise.resolve({ data: [], error: null } as any),
                reservationIds.length
                    ? supabase.from('reservation_car_sht').select('reservation_id, usage_date, pickup_datetime').in('reservation_id', reservationIds)
                    : Promise.resolve({ data: [], error: null } as any),
                reservationIds.length
                    ? supabase.from('reservation_airport').select('reservation_id, ra_datetime').in('reservation_id', reservationIds)
                    : Promise.resolve({ data: [], error: null } as any),
                reservationIds.length
                    ? supabase.from('reservation_hotel').select('reservation_id, checkin_date').in('reservation_id', reservationIds)
                    : Promise.resolve({ data: [], error: null } as any),
            ]);

            if (reservationRes.error) throw reservationRes.error;
            if (requesterRes.error) throw requesterRes.error;

            // 이용일: 서비스별 날짜 컴하 통합
            const checkinMap = new Map<string, string>();
            const setCheckin = (reservation_id: string, dateVal: string | null | undefined) => {
                if (!checkinMap.has(reservation_id) && dateVal) checkinMap.set(reservation_id, dateVal.slice(0, 10));
            };
            for (const c of (cruiseRes.data || [])) setCheckin(c.reservation_id, c.checkin);
            for (const c of (cruiseCarRes.data || [])) setCheckin(c.reservation_id, c.pickup_datetime);
            for (const r of (rentcarRes.data || [])) setCheckin(r.reservation_id, r.pickup_datetime);
            for (const c of (carShtRes.data || [])) setCheckin(c.reservation_id, c.usage_date || c.pickup_datetime);
            for (const a of (airportRes.data || [])) setCheckin(a.reservation_id, a.ra_datetime);
            for (const h of (hotelRes.data || [])) setCheckin(h.reservation_id, h.checkin_date);

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

            const merged = baseRows.map((row) => {
                const res = row.reservation_id ? (reservationMap.get(row.reservation_id) as any) || null : null;
                return {
                    ...row,
                    total_paid: res?.total_amount != null ? Number(res.total_amount) : null,
                    service_checkin: checkinMap.get(row.reservation_id) ?? null,
                    reservation: res,
                    requester: row.requester_user_id
                        ? (requesterMap.get(row.requester_user_id) as any) || null
                        : (() => {
                            const reUserId = res?.re_user_id ?? null;
                            return reUserId ? (reservationUserMap.get(reUserId) as any) || null : null;
                        })(),
                };
            });

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
                        prevStatus: row.reservation?.re_status || undefined,
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
        if (statusFilter !== 'approved' && statusFilter !== 'completed') return rows;
        const now = Date.now();
        const limitMs = APPROVED_VISIBLE_DAYS * 24 * 60 * 60 * 1000;
        return rows.filter((row) => {
            const baseDate = row.refund_completed_at || row.executed_at || row.reviewed_at || row.submitted_at;
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
            rows: group.rows.sort((a, b) => {
                const orderDiff = serviceOrderIndex(getPrimaryServiceType(a)) - serviceOrderIndex(getPrimaryServiceType(b));
                if (orderDiff !== 0) return orderDiff;
                return new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime();
            }),
        }));
    }, [filteredRows]);

    const visibleGroupedRows = useMemo(
        () => groupedRows.slice(0, visibleGroupCount),
        [groupedRows, visibleGroupCount],
    );

    const getServiceInfo = (row: CancelRow): Array<{ type: string; name: string; icon: string; bg: string; text: string }> => {
        if (row.cancellation_type === 'full') {
            const reType = normalizeServiceType(row.reservation?.re_type || null);
            if (reType) {
                const meta = SERVICE_META[reType] || { name: reType, icon: '📦', bg: 'bg-gray-100', text: 'text-gray-700' };
                return [{ type: reType, ...meta }];
            }
            return [{ type: 'full', name: '전체 취소', icon: '🗑️', bg: 'bg-red-100', text: 'text-red-700' }];
        }
        const targets: Array<{ service_type: string; row_id: string; label?: string }> = Array.isArray(row.cancel_targets)
            ? row.cancel_targets
            : (typeof row.cancel_targets === 'string' ? (() => { try { return JSON.parse(row.cancel_targets); } catch { return []; } })() : []);
        const serviceTypes = Array.from(new Set(targets.map((t) => normalizeServiceType(t.service_type)).filter(Boolean)));
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

    const applyRefundCompleteByGroup = async (groupKey: string) => {
        const group = groupedRows.find((item) => item.key === groupKey);
        if (!group) return;
        const approvedRows = group.rows.filter((row) => row.status === 'approved');
        if (approvedRows.length === 0) {
            alert('합산 환불 처리할 승인 건이 없습니다.');
            return;
        }

        const suggestedAmounts = approvedRows.map((row) => {
            const penalty = calcCancelFee(row.service_checkin, row.total_paid, row.cancel_reason_category);
            if (penalty.cannotCancel || row.total_paid == null) return 0;
            return penalty.refundAmount;
        });
        const suggestedTotal = suggestedAmounts.reduce((acc, cur) => acc + cur, 0);
        const input = refundGroupDraft[group.key] ?? '';
        const targetTotal = input ? Number(input.replace(/[,\s]/g, '')) : suggestedTotal;
        if (!Number.isFinite(targetTotal) || targetTotal <= 0) {
            alert('합산 환불 금액이 올바르지 않습니다.');
            return;
        }
        if (!confirm(`승인 ${approvedRows.length}건을 합산 환불 ${targetTotal.toLocaleString('ko-KR')}원으로 완료 처리합니까?`)) return;

        const allocated: number[] = [];
        if (suggestedTotal > 0) {
            let running = 0;
            approvedRows.forEach((_, idx) => {
                if (idx === approvedRows.length - 1) {
                    allocated.push(Math.max(0, targetTotal - running));
                    return;
                }
                const amount = Math.round((suggestedAmounts[idx] / suggestedTotal) * targetTotal);
                allocated.push(amount);
                running += amount;
            });
        } else {
            const base = Math.floor(targetTotal / approvedRows.length);
            let remain = targetTotal - base * approvedRows.length;
            approvedRows.forEach(() => {
                const plus = remain > 0 ? 1 : 0;
                allocated.push(base + plus);
                if (remain > 0) remain -= 1;
            });
        }

        let successCount = 0;
        let skippedCount = 0;
        for (let i = 0; i < approvedRows.length; i += 1) {
            if ((allocated[i] ?? 0) <= 0) {
                skippedCount += 1;
                continue;
            }
            try {
                await applyRefundComplete(approvedRows[i], {
                    confirmAction: false,
                    refreshAfter: false,
                    silent: true,
                    refundAmountOverride: allocated[i],
                });
                successCount += 1;
            } catch {
                // 개별 실패는 applyRefundComplete 내부에서 알림
            }
        }
        await fetchRows();
        alert(`합산 환불 완료: ${successCount}/${approvedRows.length}건${skippedCount > 0 ? ` (0원 ${skippedCount}건 제외)` : ''}`);
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

    const applyRefundComplete = async (
        row: CancelRow,
        options?: { confirmAction?: boolean; refreshAfter?: boolean; silent?: boolean; refundAmountOverride?: number },
    ) => {
        const confirmAction = options?.confirmAction ?? true;
        const refreshAfter = options?.refreshAfter ?? true;
        const silent = options?.silent ?? false;
        if (!user?.id) return;
        if (row.status !== 'approved') {
            alert('승인 상태인 요청만 환불 완료 처리할 수 있습니다.');
            return;
        }

        let refundAmount: number | null = options?.refundAmountOverride ?? null;
        if (refundAmount == null) {
            const input = refundDraft[row.id] ?? '';
            const parsed = Number(String(input).replace(/[,\s]/g, ''));
            if (!Number.isFinite(parsed) || parsed <= 0) {
                alert('카드 내 환불 금액 입력칸에 1원 이상 금액을 입력해 주세요.');
                return;
            }
            refundAmount = parsed;
        }

        if (confirmAction && !confirm(`환불 ${refundAmount.toLocaleString('ko-KR')}원을 완료 처리합니까?`)) return;

        setProcessingId(row.id);
        try {
            const basePaymentPayload = {
                reservation_id: row.reservation_id,
                payment_date: new Date().toISOString().slice(0, 10),
                payment_status: 'completed',
                payment_method: row.refund_bank_name ? 'bank_transfer' : null,
                created_by: user.id,
            };

            let paymentInsertedId: string | null = null;
            const { data: paymentInserted, error: payErr } = await supabase
                .from('reservation_payments')
                .insert({
                    ...basePaymentPayload,
                    payment_type: 'refund',
                    payment_amount: refundAmount,
                    notes: `[취소환불] ${REASON_LABEL[row.cancel_reason_category]} / 신청 ${row.id.slice(0, 8)}`,
                })
                .select('id')
                .single();

            if (payErr) {
                console.warn('[cancel-requests] refund 타입 INSERT 실패, final 음수 금액으로 재시도', payErr);
                const { data: fallbackInserted, error: fallbackErr } = await supabase
                    .from('reservation_payments')
                    .insert({
                        ...basePaymentPayload,
                        payment_type: 'final',
                        payment_amount: Math.abs(refundAmount),
                        notes: `[취소환불-대체저장] ${REASON_LABEL[row.cancel_reason_category]} / 신청 ${row.id.slice(0, 8)}`,
                    })
                    .select('id')
                    .single();
                if (fallbackErr) throw fallbackErr;
                paymentInsertedId = fallbackInserted?.id ?? null;
            } else {
                paymentInsertedId = paymentInserted?.id ?? null;
            }

            // 2) reservation_cancellation_request 업데이트
            const { error: updErr } = await supabase
                .from('reservation_cancellation_request')
                .update({
                    status: 'completed',
                    result_status: 'refunded',
                    refund_amount: refundAmount,
                    refund_payment_id: paymentInsertedId,
                    refund_completed_at: new Date().toISOString(),
                    refund_completed_by: user.id,
                })
                .eq('id', row.id);
            if (updErr) throw updErr;

            // 3) 알림 발송
            try {
                await fetch('/api/cancel-notify', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        subcategory: 'cancellation_refunded',
                        reservationId: row.reservation_id,
                        title: '예약 취소 환불 완료',
                        message: `환불 ${refundAmount.toLocaleString('ko-KR')}원이 완료 처리되었습니다.`,
                        createdBy: user.id,
                        metadata: { cancellationType: row.cancellation_type, refundAmount, paymentId: paymentInsertedId },
                    }),
                });
            } catch (notifyErr) { console.warn('[cancel-requests] refund notify 실패', notifyErr); }

            if (!silent) alert('환불 완료 처리했습니다.');
            setRefundDraft((prev) => ({ ...prev, [row.id]: '' }));
            if (refreshAfter) await fetchRows();
        } catch (err: any) {
            console.error('[cancel-requests] 환불 완료 실패', err);
            alert(err?.message || '환불 완료 처리에 실패했습니다.');
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
        const counts: Record<RequestStatus | 'total', number> = { pending: 0, approved: 0, rejected: 0, cancelled: 0, completed: 0, total: filteredRows.length };
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
                <p className="text-xs text-gray-600">대기 {summary.pending} · 승인 {summary.approved} · 환불완료 {summary.completed} · 반려 {summary.rejected} · 전체 {summary.total}</p>

                <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                    <div className="rounded-lg border bg-white p-2">
                        <p className="mb-1 text-xs font-semibold text-gray-700">상태 그룹</p>
                        <div className="flex flex-wrap gap-1">
                            {([
                                { key: 'pending', label: '대기' },
                                { key: 'approved', label: '승인' },
                                { key: 'completed', label: '환불완료' },
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

                <SectionBox title="취소 요청 목록">
                    {loading ? (
                        <p className="p-4 text-sm text-gray-500">불러오는 중...</p>
                    ) : filteredRows.length === 0 ? (
                        <p className="p-4 text-sm text-gray-500">조건에 맞는 취소 요청이 없습니다.</p>
                    ) : (
                        <div className="space-y-4">
                            <div className="space-y-2">
                                {visibleGroupedRows.map((group) => {
                                    const pendingCount = group.rows.filter((row) => row.status === 'pending').length;
                                    const approvedRows = group.rows.filter((row) => row.status === 'approved');
                                    const groupTotalPaid = group.rows.reduce((acc, row) => acc + Number(row.total_paid || 0), 0);
                                    const groupExpectedRefund = approvedRows.reduce((acc, row) => {
                                        const penalty = calcCancelFee(row.service_checkin, row.total_paid, row.cancel_reason_category);
                                        if (penalty.cannotCancel || row.total_paid == null) return acc;
                                        return acc + penalty.refundAmount;
                                    }, 0);
                                    const groupCompletedRefund = group.rows.reduce((acc, row) => {
                                        if (row.status !== 'completed') return acc;
                                        return acc + Number(row.refund_amount || 0);
                                    }, 0);
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
                                                <p>예약금액 합계: {groupTotalPaid.toLocaleString('ko-KR')}원</p>
                                                <p className="text-blue-700 font-semibold">예상환불 합계(승인): {groupExpectedRefund.toLocaleString('ko-KR')}원</p>
                                                <p className="text-emerald-700">완료환불 합계: {groupCompletedRefund.toLocaleString('ko-KR')}원</p>
                                            </div>
                                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                                {pendingCount > 0 && (
                                                    <button
                                                        type="button"
                                                        onClick={() => applyApproveByRequester(group.key)}
                                                        disabled={processingId !== null}
                                                        className="rounded bg-blue-600 px-3 py-1 text-xs text-white disabled:opacity-50"
                                                    >
                                                        견적 전체 승인
                                                    </button>
                                                )}
                                                {approvedRows.length > 0 && (
                                                    <>
                                                        <input
                                                            type="text"
                                                            value={refundGroupDraft[group.key] ?? ''}
                                                            onChange={(e) => setRefundGroupDraft((prev) => ({ ...prev, [group.key]: formatAmountInput(e.target.value) }))}
                                                            placeholder="합산 환불금액"
                                                            className="w-32 rounded border border-emerald-300 bg-white px-2 py-1 text-xs"
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() => setRefundGroupDraft((prev) => ({ ...prev, [group.key]: Number(groupExpectedRefund).toLocaleString('ko-KR') }))}
                                                            disabled={processingId !== null}
                                                            className="rounded border border-emerald-400 bg-white px-2 py-1 text-[11px] text-emerald-700 disabled:opacity-50"
                                                        >
                                                            합산 예상금액 가져오기
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => void applyRefundCompleteByGroup(group.key)}
                                                            disabled={processingId !== null}
                                                            className="rounded bg-emerald-600 px-3 py-1 text-xs text-white disabled:opacity-50"
                                                        >
                                                            합산 완료 처리
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                            <div className="mt-2 grid gap-2 md:grid-cols-3">
                                                {group.rows.map((row) => {
                                                    const serviceInfos = getServiceInfo(row);
                                                    const canRefund = row.status === 'approved';
                                                    const penalty = calcCancelFee(row.service_checkin, row.total_paid, row.cancel_reason_category);
                                                    return (
                                                        <div
                                                            key={row.id}
                                                            onClick={(event) => handleRowCardClick(event, row)}
                                                            className={`w-full rounded border px-3 py-2 text-left text-sm transition cursor-pointer ${selectedRowId === row.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}
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
                                                                <span className={`rounded px-2 py-0.5 text-xs ${STATUS_BADGE[row.status]}`}>
                                                                    {STATUS_LABEL[row.status]}
                                                                </span>
                                                                <span className="rounded bg-purple-100 px-2 py-0.5 text-xs text-purple-800">
                                                                    {REASON_LABEL[row.cancel_reason_category]}
                                                                </span>
                                                                <span className="ml-auto text-xs text-gray-500">{new Date(row.submitted_at).toLocaleString('ko-KR')}</span>
                                                            </div>
                                                            <div className="mt-1 text-xs text-gray-700">
                                                                유형: {row.cancellation_type === 'full' ? '전체' : '부분'}
                                                                {row.status === 'completed' && row.refund_amount != null && (
                                                                    <span className="ml-2 text-emerald-700 font-medium">· 환불: {Number(row.refund_amount).toLocaleString('ko-KR')}원</span>
                                                                )}
                                                            </div>
                                                            <div className="mt-1.5 rounded bg-gray-50 px-2 py-1.5 text-xs space-y-0.5 border border-gray-100">
                                                                <p className="text-gray-600">
                                                                    이용일: {row.service_checkin || <span className="text-gray-400">미확인</span>}
                                                                    {penalty.daysUntil != null && (
                                                                        <span className={`ml-1 font-semibold ${penalty.daysUntil < 0 ? 'text-gray-400' : penalty.cannotCancel ? 'text-red-600' : penalty.penaltyRate > 0 ? 'text-orange-600' : 'text-green-700'}`}>
                                                                            ({penalty.daysUntil < 0 ? `D+${Math.abs(penalty.daysUntil)}` : `D-${penalty.daysUntil}`})
                                                                        </span>
                                                                    )}
                                                                </p>
                                                                <p className="text-gray-700">예약금액: <span className="font-semibold">{row.total_paid != null ? row.total_paid.toLocaleString('ko-KR') + '원' : <span className="text-gray-400">미확인</span>}</span></p>
                                                                <p className={penalty.cannotCancel ? 'text-red-600 font-semibold' : penalty.penaltyRate > 0 ? 'text-orange-600 font-medium' : 'text-green-700'}>
                                                                    취소정책: {penalty.label}
                                                                    {penalty.penaltyRate > 0 && !penalty.cannotCancel && row.total_paid != null && (
                                                                        <span> (위약금 {penalty.penaltyAmount.toLocaleString('ko-KR')}원)</span>
                                                                    )}
                                                                </p>
                                                                {!penalty.cannotCancel && row.total_paid != null && (
                                                                    <p className="text-blue-700 font-semibold">환불예상: {penalty.refundAmount.toLocaleString('ko-KR')}원</p>
                                                                )}
                                                            </div>
                                                            {canRefund && (
                                                                <div className="mt-2 rounded border border-emerald-200 bg-emerald-50 p-2">
                                                                    <div className="flex items-center gap-2 flex-nowrap">
                                                                        <input
                                                                            type="text"
                                                                            value={refundDraft[row.id] ?? ''}
                                                                            onClick={(e) => e.stopPropagation()}
                                                                            onChange={(e) => setRefundDraft((prev) => ({ ...prev, [row.id]: formatAmountInput(e.target.value) }))}
                                                                            placeholder={row.total_paid != null ? `예: ${penalty.refundAmount.toLocaleString('ko-KR')}` : '환불 금액 입력'}
                                                                            className="w-28 rounded border border-emerald-300 bg-white px-2 py-1 text-xs"
                                                                        />
                                                                        <button
                                                                            type="button"
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                if (row.total_paid == null) return;
                                                                                setRefundDraft((prev) => ({ ...prev, [row.id]: Number(penalty.refundAmount).toLocaleString('ko-KR') }));
                                                                            }}
                                                                            disabled={row.total_paid == null || processingId !== null}
                                                                            className="shrink-0 rounded border border-emerald-400 bg-white px-2 py-1 text-[11px] text-emerald-700 disabled:opacity-50"
                                                                        >
                                                                            예상금액 가져오기
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={(e) => { e.stopPropagation(); void applyRefundComplete(row); }}
                                                                            disabled={processingId !== null}
                                                                            className="rounded bg-emerald-600 px-3 py-1 text-xs text-white disabled:opacity-50"
                                                                        >
                                                                            완료 처리
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
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
                        </div>
                    )}
                </SectionBox>
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
