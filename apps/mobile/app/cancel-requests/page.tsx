// @ts-nocheck
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import supabase from '@/lib/supabase';
import { ArrowLeft, Home } from 'lucide-react';

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
    refund_amount: number | null;
    refund_payment_id: string | null;
    refund_completed_at: string | null;
    refund_completed_by: string | null;
    total_paid: number | null;
    service_checkin: string | null;
    requester?: { id: string; name: string | null; email: string | null } | null;
    reservation?: { re_id: string; re_status: string | null; re_quote_id: string | null; re_type: string | null; re_user_id: string | null } | null;
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

type PenaltyInfo = { daysUntil: number | null; penaltyRate: number; refundRate: number; penaltyAmount: number; refundAmount: number; label: string; cannotCancel: boolean; };
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
    if (daysUntil > 30) { penaltyRate = 0; label = '위약금 없음'; }
    else if (daysUntil >= 21) { penaltyRate = 0.15; label = '위약금 15% (21~30일전)'; }
    else if (daysUntil >= 17) { penaltyRate = 0.5; label = '위약금 50% (17~20일전)'; }
    else { penaltyRate = 1; label = '환불 불가 (16일 이내)'; cannotCancel = true; }
    const penaltyAmount = Math.round(paid * penaltyRate);
    return { daysUntil, penaltyRate, refundRate: 1 - penaltyRate, penaltyAmount, refundAmount: paid - penaltyAmount, label, cannotCancel };
}
const LOAD_MORE_GROUPS = 10;

export default function MobileCancelRequestsPage() {
    const [rows, setRows] = useState<CancelRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<RequestStatus | 'all'>('pending');
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [userId, setUserId] = useState<string | null>(null);
    const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});
    const [refundDraft, setRefundDraft] = useState<Record<string, string>>({});
    const [visibleGroupCount, setVisibleGroupCount] = useState(INITIAL_VISIBLE_GROUPS);

    const requesterKeyOf = (row: CancelRow) => {
        if (row.requester_user_id) return `uid:${row.requester_user_id}`;
        if (row.requester_email) return `email:${row.requester_email.toLowerCase()}`;
        return `unknown:${row.id}`;
    };

    const requesterLabelOf = (row: CancelRow) => {
        return row.requester?.name || row.requester?.email || row.requester_email || row.refund_account_holder || '미상 신청자';
    };

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
                .select('id, reservation_id, requester_user_id, requester_email, requester_phone, refund_bank_name, refund_account_number, refund_account_holder, cancellation_type, cancel_reason_category, cancel_reason_detail, cancel_targets, status, result_status, manager_note, submitted_at, reviewed_at, executed_at, refund_amount, refund_payment_id, refund_completed_at, refund_completed_by')
                .order('submitted_at', { ascending: false })
                .limit(100);
            if (statusFilter !== 'all') q = q.eq('status', statusFilter);
            const { data, error } = await q;
            if (error) throw error;

            const baseRows = (data || []) as CancelRow[];
            const reservationIds = Array.from(new Set(baseRows.map((row: any) => row.reservation_id).filter(Boolean)));
            const requesterIds = Array.from(new Set(baseRows.map((row: any) => row.requester_user_id).filter(Boolean)));

            const [reservationRes, requesterRes, cruiseRes, cruiseCarRes, rentcarRes, carShtRes, airportRes, hotelRes] = await Promise.all([
                reservationIds.length
                    ? supabase.from('reservation').select('re_id, re_status, re_quote_id, re_type, re_user_id, total_amount').in('re_id', reservationIds)
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

            const merged = baseRows.map((row: CancelRow) => {
                const res = row.reservation_id ? (reservationMap.get(row.reservation_id) as any) || null : null;
                return {
                    ...row,
                    total_paid: res?.total_amount != null ? Number(res.total_amount) : null,
                    service_checkin: checkinMap.get(row.reservation_id) ?? null,
                    reservation: res,
                    requester: row.requester_user_id
                        ? requesterMap.get(row.requester_user_id) || null
                        : (() => {
                            const reUserId = res?.re_user_id ?? null;
                            return reUserId ? reservationUserMap.get(reUserId) || null : null;
                        })(),
                };
            });

            setRows(merged as CancelRow[]);
        } catch (err: any) {
            alert(err?.message || '목록 조회 실패');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { void fetchRows(); }, [statusFilter]);

    const approve = async (row: CancelRow, options?: { confirmAction?: boolean; refreshAfter?: boolean; silent?: boolean }) => {
        const confirmAction = options?.confirmAction ?? true;
        const refreshAfter = options?.refreshAfter ?? true;
        const silent = options?.silent ?? false;
        if (row.status !== 'pending') return alert('이미 처리됨');
        if (confirmAction && !confirm('승인하시겠습니까?')) return;
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
            if (refreshAfter) await fetchRows();
            if (!silent) alert('승인 처리되었습니다.');
        } catch (err: any) {
            alert(err?.message || '승인 실패');
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
        const map = new Map<string, { key: string; quoteId: string | null; requesterLabel: string; requesterEmail: string | null; requesterPhone: string | null; refundBankName: string | null; refundAccountNumber: string | null; refundAccountHolder: string | null; rows: CancelRow[] }>();
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

    useEffect(() => {
        setVisibleGroupCount(INITIAL_VISIBLE_GROUPS);
    }, [statusFilter]);

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

    const approveAllByRequester = async (groupKey: string) => {
        const group = groupedRows.find((item) => item.key === groupKey);
        if (!group) return;
        const pendingRows = group.rows.filter((row) => row.status === 'pending');
        if (pendingRows.length === 0) {
            alert('승인 가능한 대기 요청이 없습니다.');
            return;
        }
        if (!confirm(`견적 ${group.quoteId ? group.quoteId.slice(0, 8) + '…' : group.requesterLabel} 의 대기 요청 ${pendingRows.length}건을 모두 승인하시겠습니까?`)) return;

        let successCount = 0;
        for (const row of pendingRows) {
            try {
                await approve(row, { confirmAction: false, refreshAfter: false, silent: true });
                successCount += 1;
            } catch {
                // approve 내부에서 알림 처리
            }
        }
        await fetchRows();
        alert(`전체 승인 완료: ${successCount}/${pendingRows.length}건`);
    };

    const applyRefundComplete = async (row: CancelRow, options?: { refundAmountOverride?: number }) => {
        if (!userId) return;
        if (row.status !== 'approved') {
            alert('승인 상태인 요청만 환불 완료 처리할 수 있습니다.');
            return;
        }
        const input = options?.refundAmountOverride != null ? String(options.refundAmountOverride) : (refundDraft[row.id] ?? '');
        const refundAmount = Number(String(input).replace(/[,\s]/g, ''));
        if (!Number.isFinite(refundAmount) || refundAmount <= 0) {
            alert('카드 내 환불 금액 입력칸에 1원 이상 금액을 입력해 주세요.');
            return;
        }
        if (!confirm(`환불 ${refundAmount.toLocaleString('ko-KR')}원을 완료 처리합니까?`)) return;

        setProcessingId(row.id);
        try {
            const basePaymentPayload = {
                reservation_id: row.reservation_id,
                payment_date: new Date().toISOString().slice(0, 10),
                payment_status: 'completed',
                payment_method: row.refund_bank_name ? 'bank_transfer' : null,
                created_by: userId,
            };

            let paymentInsertedId: string | null = null;
            const { data: paymentInserted, error: payErr } = await supabase
                .from('reservation_payments')
                .insert({
                    ...basePaymentPayload,
                    payment_type: 'refund',
                    payment_amount: refundAmount,
                    notes: `[취소환불] ${REASON_LABEL[row.cancel_reason_category] || ''} / 신청 ${row.id.slice(0, 8)}`,
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
                        notes: `[취소환불-대체저장] ${REASON_LABEL[row.cancel_reason_category] || ''} / 신청 ${row.id.slice(0, 8)}`,
                    })
                    .select('id')
                    .single();
                if (fallbackErr) throw fallbackErr;
                paymentInsertedId = fallbackInserted?.id ?? null;
            } else {
                paymentInsertedId = paymentInserted?.id ?? null;
            }

            const { error: updErr } = await supabase
                .from('reservation_cancellation_request')
                .update({
                    status: 'completed',
                    result_status: 'refunded',
                    refund_amount: refundAmount,
                    refund_payment_id: paymentInsertedId,
                    refund_completed_at: new Date().toISOString(),
                    refund_completed_by: userId,
                })
                .eq('id', row.id);
            if (updErr) throw updErr;

            try {
                await fetch('/api/cancel-notify', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        subcategory: 'cancellation_refunded',
                        reservationId: row.reservation_id,
                        title: '예약 취소 환불 완료',
                        message: `환불 ${refundAmount.toLocaleString('ko-KR')}원이 완료 처리되었습니다.`,
                        createdBy: userId,
                        metadata: { cancellationType: row.cancellation_type, refundAmount, paymentId: paymentInsertedId },
                    }),
                });
            } catch (e) { console.warn('refund notify 실패', e); }

            await fetchRows();
            setRefundDraft((prev) => ({ ...prev, [row.id]: '' }));
            alert('환불 완료 처리했습니다.');
        } catch (err: any) {
            alert(err?.message || '환불 완료 처리 실패');
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
                <button onClick={() => window.history.back()} className="p-1.5 rounded-lg hover:bg-gray-100">
                    <ArrowLeft className="w-5 h-5 text-gray-600" />
                </button>
                <h1 className="text-base font-bold text-gray-800 flex-1 text-center">취소 요청 처리</h1>
                <Link href="/" className="p-1.5 rounded-lg hover:bg-gray-100">
                    <Home className="w-5 h-5 text-gray-600" />
                </Link>
            </header>

            <div className="p-3 space-y-3">
                <div className="flex gap-2 overflow-x-auto text-xs">
                    {(['pending','approved','completed','rejected','all'] as const).map((s) => (
                        <button
                            key={s}
                            onClick={() => setStatusFilter(s as any)}
                            className={`whitespace-nowrap rounded-full border px-3 py-1 ${statusFilter === s ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700'}`}
                        >
                            {s === 'pending' ? '대기' : s === 'approved' ? '승인' : s === 'completed' ? '환불완료' : s === 'rejected' ? '반려' : '전체'}
                        </button>
                    ))}
                </div>

                {loading ? (
                    <p className="p-4 text-center text-sm text-gray-500">불러오는 중...</p>
                ) : filteredRows.length === 0 ? (
                    <p className="p-4 text-center text-sm text-gray-500">요청 없음</p>
                ) : (
                    <>
                    {visibleGroupedRows.map((group) => {
                        const pendingCount = group.rows.filter((row) => row.status === 'pending').length;
                        return (
                            <section key={group.key} className="rounded-lg border bg-white p-3 text-sm shadow-sm space-y-2">
                                <div className="rounded border border-blue-100 bg-blue-50 p-2 text-xs text-gray-700 space-y-1">
                                    <div className="flex items-center justify-between">
                                        <strong className="text-sm text-blue-900">{group.requesterLabel}</strong>
                                        <span className="text-[11px] text-blue-700 whitespace-nowrap">요청 {group.rows.length}건 · 대기 {pendingCount}건</span>
                                    </div>
                                    {group.requesterEmail && <p>이메일: {group.requesterEmail}</p>}
                                    {group.requesterPhone && <p>연락처: {group.requesterPhone}</p>}
                                    <p>환불은행: {group.refundBankName || '-'}</p>
                                    <p>계좌번호: {group.refundAccountNumber || '-'}</p>
                                    <p>예금주: {group.refundAccountHolder || '-'}</p>
                                    {pendingCount > 0 && (
                                        <button
                                            onClick={() => approveAllByRequester(group.key)}
                                            disabled={processingId !== null}
                                            className="mt-1 rounded bg-blue-600 px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
                                        >
                                            견적 전체 승인
                                        </button>
                                    )}
                                </div>

                                {group.rows.map((row) => {
                                    const serviceInfos = getServiceInfo(row);
                                    const penalty = calcCancelFee(row.service_checkin, row.total_paid, row.cancel_reason_category);
                                    return (
                                        <div key={row.id} className="rounded border p-2 text-sm space-y-2">
                                            {serviceInfos.length > 0 && (
                                                <div className="flex flex-wrap gap-1">
                                                    {serviceInfos.map((info) => (
                                                        <span key={info.type} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${info.bg} ${info.text}`}>
                                                            <span>{info.icon}</span>
                                                            <span>{info.name}</span>
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                            <div className="flex flex-wrap items-center gap-1 text-xs">
                                                <span className={`rounded px-2 py-0.5 ${STATUS_BADGE[row.status]}`}>
                                                    {STATUS_LABEL[row.status]}
                                                </span>
                                                <span className="rounded bg-purple-100 px-2 py-0.5 text-purple-800">{REASON_LABEL[row.cancel_reason_category] || row.cancel_reason_category}</span>
                                                <span className="rounded bg-gray-100 px-2 py-0.5">{row.cancellation_type === 'full' ? '전체' : '부분'}</span>
                                                <span className="ml-auto text-gray-400">{new Date(row.submitted_at).toLocaleString('ko-KR')}</span>
                                            </div>
                                            <p className="text-xs">사유: {row.cancel_reason_detail || '-'}</p>
                                            <div className="rounded bg-gray-50 px-2 py-1.5 text-xs space-y-0.5 border border-gray-100">
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
                                                    {penalty.penaltyRate > 0 && !penalty.cannotCancel && row.total_paid != null && <span> (위약금 {penalty.penaltyAmount.toLocaleString('ko-KR')}원)</span>}
                                                </p>
                                                {!penalty.cannotCancel && row.total_paid != null && (
                                                    <p className="text-blue-700 font-semibold">환불예상: {penalty.refundAmount.toLocaleString('ko-KR')}원</p>
                                                )}
                                            </div>
                                            {row.status === 'completed' && row.refund_amount != null && (
                                                <p className="text-xs text-emerald-700 font-medium">환불: {Number(row.refund_amount).toLocaleString('ko-KR')}원</p>
                                            )}
                                            {row.status === 'approved' && (
                                                <div className="rounded border border-emerald-200 bg-emerald-50 p-2">
                                                    <div className="flex items-center gap-2 flex-nowrap">
                                                        <input
                                                            type="text"
                                                            value={refundDraft[row.id] ?? ''}
                                                            onChange={(e) => setRefundDraft((prev) => ({ ...prev, [row.id]: formatAmountInput(e.target.value) }))}
                                                            placeholder={row.total_paid != null ? `예: ${penalty.refundAmount.toLocaleString('ko-KR')}` : '환불 금액 입력'}
                                                            className="w-28 rounded border border-emerald-300 bg-white px-2 py-1 text-xs"
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                if (row.total_paid == null) return;
                                                                setRefundDraft((prev) => ({ ...prev, [row.id]: Number(penalty.refundAmount).toLocaleString('ko-KR') }));
                                                            }}
                                                            disabled={row.total_paid == null || processingId === row.id}
                                                            className="shrink-0 rounded border border-emerald-400 bg-white px-2 py-1 text-[11px] text-emerald-700 disabled:opacity-50"
                                                        >
                                                            예상금액 가져오기
                                                        </button>
                                                        <button
                                                            onClick={() => applyRefundComplete(row)}
                                                            disabled={processingId === row.id}
                                                            className="shrink-0 rounded bg-emerald-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
                                                        >
                                                            완료 처리
                                                        </button>
                                                    </div>
                                                </div>
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
                                })}
                            </section>
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
                    </>
                )}
            </div>
        </div>
    );
}
