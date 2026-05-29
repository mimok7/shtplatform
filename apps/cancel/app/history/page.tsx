'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserSupabase } from '@/lib/supabase';

interface HistoryItem {
    id: string;
    reservation_id: string;
    status: string;
    result_status: string;
    cancellation_type: string;
    cancel_reason_category: string;
    cancel_reason_detail?: string | null;
    cancel_targets?: any;
    refund_bank_name?: string | null;
    refund_account_number?: string | null;
    refund_account_holder?: string | null;
    manager_note?: string | null;
    reviewed_at?: string | null;
    executed_at?: string | null;
    requester_email?: string | null;
    requester_phone?: string | null;
    submitted_at: string;
}

const CANCEL_REQ_STATUS: Record<string, { label: string; cls: string }> = {
    pending:    { label: '검토 대기', cls: 'bg-yellow-100 text-yellow-800' },
    approved:   { label: '승인',      cls: 'bg-green-100 text-green-800' },
    rejected:   { label: '거절',      cls: 'bg-red-100 text-red-800' },
    cancelled:  { label: '취소됨',    cls: 'bg-gray-100 text-gray-600' },
};

const RESULT_STATUS: Record<string, { label: string; cls: string }> = {
    requested: { label: '신청됨',   cls: 'bg-blue-50 text-blue-700' },
    executed:  { label: '처리완료', cls: 'bg-green-50 text-green-700' },
    rejected:  { label: '거절됨',   cls: 'bg-red-50 text-red-700' },
    failed:    { label: '처리실패', cls: 'bg-orange-50 text-orange-700' },
};

const REASON_OPTIONS: Array<{ value: string; label: string; icon: string }> = [
    { value: 'natural_disaster', label: '자연재해·불가항력', icon: '⛈️' },
    { value: 'change_of_mind',   label: '단순 변심',         icon: '💭' },
    { value: 'other',            label: '기타',               icon: '📝' },
];

const SERVICE_META: Record<string, { icon: string; name: string; bg: string; text: string }> = {
    cruise:     { icon: '🚢', name: '크루즈',          bg: 'bg-blue-50',   text: 'text-blue-700' },
    cruise_car: { icon: '🚗', name: '크루즈 픽업차량', bg: 'bg-sky-50',    text: 'text-sky-700' },
    airport:    { icon: '✈️', name: '공항 이동',       bg: 'bg-indigo-50', text: 'text-indigo-700' },
    hotel:      { icon: '🏨', name: '호텔',            bg: 'bg-amber-50',  text: 'text-amber-700' },
    rentcar:    { icon: '🚙', name: '렌터카',          bg: 'bg-green-50',  text: 'text-green-700' },
    car_sht:    { icon: '🚐', name: '스테이하롱 차량', bg: 'bg-teal-50',   text: 'text-teal-700' },
    tour:       { icon: '🎡', name: '투어',            bg: 'bg-purple-50', text: 'text-purple-700' },
    ticket:     { icon: '🎫', name: '티켓',            bg: 'bg-pink-50',   text: 'text-pink-700' },
};

const SERVICE_DISPLAY_ORDER = ['cruise', 'cruise_car', 'car_sht', 'airport', 'rentcar', 'tour', 'hotel', 'ticket'];
const SERVICE_ORDER_INDEX = SERVICE_DISPLAY_ORDER.reduce<Record<string, number>>((acc, key, idx) => { acc[key] = idx; return acc; }, {});

function compareServiceType(a: string, b: string): number {
    const aIdx = SERVICE_ORDER_INDEX[a] ?? 99;
    const bIdx = SERVICE_ORDER_INDEX[b] ?? 99;
    return aIdx !== bIdx ? aIdx - bIdx : a.localeCompare(b);
}

function getServiceBadges(h: HistoryItem): Array<{ type: string; name: string; icon: string; label?: string }> {
    let targets: Array<{ service_type: string; label?: string }> = [];
    if (Array.isArray(h.cancel_targets)) {
        targets = h.cancel_targets;
    } else if (typeof h.cancel_targets === 'string') {
        try { targets = JSON.parse(h.cancel_targets); } catch { targets = []; }
    }
    const types = Array.from(new Set(targets.map((t) => t.service_type).filter(Boolean)));
    return types.sort(compareServiceType).map((type) => {
        const meta = SERVICE_META[type] || { icon: '📋', name: type, bg: 'bg-gray-50', text: 'text-gray-700' };
        const target = targets.find((t) => t.service_type === type);
        return { type, name: meta.name, icon: meta.icon, label: target?.label };
    });
}

function maskAccount(num: string | null | undefined): string {
    if (!num) return '-';
    const clean = num.replace(/[^0-9]/g, '');
    if (clean.length <= 4) return clean;
    return clean.slice(0, 3) + '•'.repeat(clean.length - 6) + clean.slice(-3);
}

function HistoryContent() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [sessionEmail, setSessionEmail] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 10;

    useEffect(() => {
        let cancelled = false;
        const init = async () => {
            try {
                const supabase = getBrowserSupabase();
                const { data } = await supabase.auth.getSession();
                if (cancelled) return;

                if (!data.session?.user?.email) {
                    router.push('/');
                    return;
                }

                const emailValue = (data.session.user.email || '').trim();
                setSessionEmail(emailValue);

                // API 호출로 해당 이메일의 모든 취소이력 조회
                const res = await fetch('/api/cancel/history', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: emailValue }),
                });
                const json = await res.json();
                if (!res.ok) throw new Error(json?.error || '조회 실패');
                
                setHistory(json.requests || []);
            } catch (err: any) {
                setError(err?.message || '로드 실패');
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        void init();
        return () => { cancelled = true; };
    }, [router]);

    if (loading) {
        return (
            <div className="flex h-72 items-center justify-center">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500" />
            </div>
        );
    }

    const totalPages = Math.ceil(history.length / ITEMS_PER_PAGE);
    const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIdx = startIdx + ITEMS_PER_PAGE;
    const paginatedHistory = history.slice(startIdx, endIdx);

    return (
        <div className="space-y-6 py-6 w-full max-w-[600px] mx-auto px-4">
            <section className="max-w-sm mx-auto mt-2 p-4 bg-white shadow rounded">
                <h2 className="text-2xl font-bold mb-4 text-left">📋 취소 신청 이력</h2>

                <div className="mb-4 flex items-center justify-between">
                    <button
                        onClick={() => router.push('/')}
                        className="text-sm text-gray-500 hover:text-gray-700 underline"
                    >
                        ← 메뉴로 돌아가기
                    </button>
                    <span className="text-xs text-gray-600">{sessionEmail}</span>
                </div>

                {error && <p className="rounded bg-red-50 p-2 text-xs text-red-700 mb-4">{error}</p>}

                {history.length === 0 ? (
                    <div className="rounded bg-gray-50 p-6 text-center text-sm text-gray-600">
                        <p className="mb-2">📭</p>
                        <p>취소 신청 이력이 없습니다.</p>
                    </div>
                ) : (
                    <>
                        <p className="text-xs text-gray-500 mb-3">총 {history.length}건</p>
                        <div className="space-y-3">
                            {paginatedHistory.map((h) => {
                                const hs = CANCEL_REQ_STATUS[h.status] || { label: h.status, cls: 'bg-gray-100 text-gray-600' };
                                const rs = h.result_status ? RESULT_STATUS[h.result_status] : null;
                                const reason = REASON_OPTIONS.find((r) => r.value === h.cancel_reason_category);
                                const serviceBadges = getServiceBadges(h);
                                return (
                                    <div key={h.id} className="rounded-xl border bg-white p-4 space-y-3">
                                        {/* 헤더: 신청일시 + 처리상태 */}
                                        <div className="flex items-start justify-between gap-2">
                                            <div>
                                                <p className="text-xs text-gray-500">신청일시</p>
                                                <p className="text-sm font-medium text-gray-800">
                                                    {new Date(h.submitted_at).toLocaleString('ko-KR')}
                                                </p>
                                            </div>
                                            <div className="flex flex-col items-end gap-1">
                                                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${hs.cls}`}>
                                                    {hs.label}
                                                </span>
                                                {rs && (
                                                    <span className={`rounded-full px-2.5 py-0.5 text-xs ${rs.cls}`}>
                                                        {rs.label}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <div className="h-px bg-gray-100" />

                                        {/* 취소 구분 + 서비스 배지 */}
                                        <div className="space-y-1.5">
                                            <p className="text-xs text-gray-500">취소 구분</p>
                                            <div className="flex flex-wrap gap-1.5">
                                                <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                                                    {h.cancellation_type === 'full' ? '🗑️ 전체 취소' : '✂️ 부분 취소'}
                                                </span>
                                            </div>
                                        </div>

                                        {serviceBadges.length > 0 && (
                                            <div className="space-y-1.5">
                                                <p className="text-xs text-gray-500">취소 서비스</p>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {serviceBadges.map((info) => {
                                                        const meta = SERVICE_META[info.type] || { bg: 'bg-gray-50', text: 'text-gray-700' };
                                                        return (
                                                            <span key={info.type} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${meta.bg} ${meta.text}`}>
                                                                <span>{info.icon}</span>
                                                                <span>{info.name}</span>
                                                            </span>
                                                        );
                                                    })}
                                                </div>
                                                {/* 부분 취소 항목 상세 */}
                                                {h.cancellation_type === 'partial' && (() => {
                                                    let targets: any[] = [];
                                                    if (Array.isArray(h.cancel_targets)) targets = h.cancel_targets;
                                                    else if (typeof h.cancel_targets === 'string') { try { targets = JSON.parse(h.cancel_targets); } catch { targets = []; } }
                                                    if (!targets.length) return null;
                                                    return (
                                                        <div className="mt-2 space-y-1.5">
                                                            <p className="text-xs text-gray-500">취소 항목</p>
                                                            <div className="flex flex-wrap gap-1.5">
                                                                {targets.map((t: any, i: number) => t.label && (
                                                                    <span key={i} className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium bg-orange-50 text-orange-700">
                                                                        <span>📌</span>
                                                                        <span className="ml-1">{t.label}</span>
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                        )}

                                        {/* 취소 사유 */}
                                        <div className="space-y-1.5">
                                            <p className="text-xs text-gray-500">취소 사유</p>
                                            <div className="flex flex-wrap gap-1.5">
                                                {reason && (
                                                    <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                                                        {reason.icon} {reason.label}
                                                    </span>
                                                )}
                                            </div>
                                            {h.cancel_reason_detail && (
                                                <p className="rounded bg-gray-50 px-2 py-1.5 text-xs text-gray-700 break-words">
                                                    {h.cancel_reason_detail}
                                                </p>
                                            )}
                                        </div>

                                        {/* 처리 결과 (매니저 메모) */}
                                        {h.manager_note && (
                                            <div className="space-y-1">
                                                <p className="text-xs text-gray-500">처리 메모</p>
                                                <p className="rounded bg-yellow-50 px-3 py-2 text-xs text-yellow-900 break-words">
                                                    {h.manager_note}
                                                </p>
                                            </div>
                                        )}

                                        {/* 처리일시 */}
                                        {(h.reviewed_at || h.executed_at) && (
                                            <p className="text-xs text-gray-400 text-right">
                                                처리일시: {new Date((h.reviewed_at || h.executed_at)!).toLocaleString('ko-KR')}
                                            </p>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {totalPages > 1 && (
                            <div className="flex items-center justify-center gap-2 mt-6 pt-4 border-t">
                                <button
                                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                                    disabled={currentPage === 1}
                                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-200 transition"
                                >
                                    이전
                                </button>
                                <div className="text-xs text-gray-600 font-medium">
                                    {currentPage} / {totalPages}
                                </div>
                                <button
                                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                                    disabled={currentPage === totalPages}
                                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-200 transition"
                                >
                                    다음
                                </button>
                            </div>
                        )}
                    </>
                )}
            </section>
        </div>
    );
}

export default function HistoryPage() {
    return (
        <Suspense fallback={
            <div className="flex h-72 items-center justify-center">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500" />
            </div>
        }>
            <HistoryContent />
        </Suspense>
    );
}
