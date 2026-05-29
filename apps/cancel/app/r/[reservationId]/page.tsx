'use client';

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';

type ReasonCategory = 'natural_disaster' | 'change_of_mind' | 'other';
type CancelType = 'full' | 'partial';

type TargetItem = { serviceType: string; rowId: string; reservationId: string; label: string; detail?: Record<string, string> };

type Reservation = {
    re_id: string;
    re_status: string | null;
    re_type: string | null;
    order_id: string | null;
    total_amount: number | null;
    reservation_date: string | null;
    re_created_at: string | null;
    targets: TargetItem[];
};

type HistoryItem = {
    id: string;
    reservation_id: string;
    status: string;
    result_status: string;
    cancellation_type: CancelType;
    cancel_reason_category: string;
    cancel_targets?: Array<{ service_type: string; row_id: string; label?: string }> | null;
    submitted_at: string;
};

const SERVICE_META: Record<string, { icon: string; name: string; bg: string; border: string; text: string }> = {
    cruise:     { icon: '🚢', name: '크루즈',          bg: 'bg-blue-50',   border: 'border-blue-200',   text: 'text-blue-700' },
    cruise_car: { icon: '🚗', name: '크루즈 픽업차량', bg: 'bg-sky-50',    border: 'border-sky-200',    text: 'text-sky-700' },
    airport:    { icon: '✈️', name: '공항 이동',       bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-700' },
    hotel:      { icon: '🏨', name: '호텔',            bg: 'bg-amber-50',  border: 'border-amber-200',  text: 'text-amber-700' },
    rentcar:    { icon: '🚙', name: '렌터카',          bg: 'bg-green-50',  border: 'border-green-200',  text: 'text-green-700' },
    car_sht:    { icon: '🚐', name: '스테이하롱 차량', bg: 'bg-teal-50',   border: 'border-teal-200',   text: 'text-teal-700' },
    tour:       { icon: '🎡', name: '투어',            bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700' },
    ticket:     { icon: '🎫', name: '티켓',            bg: 'bg-pink-50',   border: 'border-pink-200',   text: 'text-pink-700' },
};

const SERVICE_DISPLAY_ORDER = ['cruise', 'cruise_car', 'car_sht', 'airport', 'rentcar', 'tour', 'hotel', 'ticket'] as const;
const SERVICE_ORDER_INDEX = SERVICE_DISPLAY_ORDER.reduce<Record<string, number>>((acc, key, idx) => {
    acc[key] = idx;
    return acc;
}, {});

function compareServiceType(a: string, b: string): number {
    const aIdx = SERVICE_ORDER_INDEX[a] ?? Number.MAX_SAFE_INTEGER;
    const bIdx = SERVICE_ORDER_INDEX[b] ?? Number.MAX_SAFE_INTEGER;
    if (aIdx !== bIdx) return aIdx - bIdx;
    return a.localeCompare(b);
}

const STATUS_INFO: Record<string, { label: string; cls: string }> = {
    pending:        { label: '대기중',   cls: 'bg-yellow-100 text-yellow-800' },
    confirmed:      { label: '확정',     cls: 'bg-green-100 text-green-800' },
    cancelled:      { label: '취소됨',   cls: 'bg-red-100 text-red-800' },
    completed:      { label: '완료',     cls: 'bg-gray-100 text-gray-600' },
    in_progress:    { label: '진행중',   cls: 'bg-blue-100 text-blue-800' },
    pending_cancel: { label: '취소대기', cls: 'bg-orange-100 text-orange-800' },
};

const CANCEL_REQ_STATUS: Record<string, { label: string; cls: string }> = {
    pending:  { label: '검토 대기', cls: 'bg-yellow-100 text-yellow-800' },
    approved: { label: '승인',      cls: 'bg-green-100 text-green-800' },
    rejected: { label: '거절',      cls: 'bg-red-100 text-red-800' },
};

const REASON_OPTIONS: { value: ReasonCategory; label: string; hint: string; icon: string }[] = [
    { value: 'natural_disaster', label: '자연재해·불가항력', hint: '태풍·홍수·항공 결항 등', icon: '⛈️' },
    { value: 'change_of_mind',   label: '단순 변심',         hint: '환불 규정 적용',         icon: '💭' },
    { value: 'other',            label: '기타',               hint: '상세 사유 필수 입력',     icon: '📝' },
];

const RE_TYPE_LABEL: Record<string, string> = {
    cruise: '크루즈', hotel: '호텔', airport: '공항', car: '차량', tour: '투어', package: '패키지',
};

const BANK_OPTIONS = [
    'KB국민은행',
    '신한은행',
    '우리은행',
    '하나은행',
    'NH농협은행',
    'IBK기업은행',
    'SC제일은행',
    '씨티은행',
    '카카오뱅크',
    '케이뱅크',
    '토스뱅크',
    '부산은행',
    '대구은행',
    '경남은행',
    '광주은행',
    '전북은행',
    '제주은행',
    '수협은행',
    '우체국',
] as const;

const CUSTOM_BANK_VALUE = '__custom__';

function normalizeAccountInput(raw: string): string {
    // 숫자와 하이픈만 남기고 하이픈은 1개씩만 유지한다.
    const cleaned = raw.replace(/[^0-9-]/g, '');
    return cleaned
        .replace(/-+/g, '-')
        .replace(/^-/, '')
        .replace(/-$/, '');
}

function digitsOnly(value: string): string {
    return value.replace(/[^0-9]/g, '');
}

const CUSTOMER_APP_URL =
    (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_CUSTOMER_APP_URL) ||
    'https://staycruise.kr';

function DetailRow({ label, value }: { label: string; value: string }) {
    if (!value || value === '-') return null;
    return (
        <div className="flex justify-between text-xs">
            <span className="text-gray-500">{label}</span>
            <span className="font-medium text-gray-800">{value}</span>
        </div>
    );
}

function CancelDetailContent() {
    const params = useParams();
    const search = useSearchParams();
    const reservationId = params?.reservationId as string;
    const token = search?.get('t') || '';

    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [reservations, setReservations] = useState<Reservation[]>([]);
    const [history, setHistory] = useState<HistoryItem[]>([]);

    const [cancelType, setCancelType] = useState<CancelType>('full');
    const [reasonCategory, setReasonCategory] = useState<ReasonCategory>('change_of_mind');
    const [reasonDetail, setReasonDetail] = useState('');
    const [selectedBank, setSelectedBank] = useState('');
    const [customBankName, setCustomBankName] = useState('');
    const [refundAccountNumber, setRefundAccountNumber] = useState('');
    const [refundAccountHolder, setRefundAccountHolder] = useState('');
    const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
    const [currentHistoryPage, setCurrentHistoryPage] = useState(1);
    const ITEMS_PER_PAGE = 5;

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
                if (!res.ok) {
                    const msg =
                        json?.error === 'used'    ? '이미 사용된 링크입니다. 새로운 취소 신청 링크를 받아 주세요.' :
                        json?.error === 'expired' ? '링크가 만료되었습니다. 다시 조회해 주세요.' :
                        json?.error || '유효하지 않은 링크입니다.';
                    throw new Error(msg);
                }
                const loadedReservations: Reservation[] = json.reservations || [];
                setReservations(loadedReservations);
                setHistory(json.requests || []);
                const allT = loadedReservations.flatMap(r => r.targets || []);
                setSelectedKeys(new Set(allT.map((t: TargetItem) => `${t.serviceType}:${t.rowId}`)));
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

    const allTargets = useMemo(() => {
        const uniq = new Map<string, TargetItem>();
        reservations.flatMap(r => r.targets || []).forEach((t) => {
            const key = `${t.serviceType}:${t.rowId}`;
            if (!uniq.has(key)) uniq.set(key, t);
        });
        return Array.from(uniq.values());
    }, [reservations]);

    const primaryReservation = useMemo(() => {
        return reservations.find((r) => r.re_id === reservationId) || reservations[0] || null;
    }, [reservations, reservationId]);

    const groupedTargets = useMemo(() => {
        const typeMap = new Map<string, TargetItem[]>();
        allTargets.forEach((t) => {
            if (!typeMap.has(t.serviceType)) typeMap.set(t.serviceType, []);
            typeMap.get(t.serviceType)!.push(t);
        });
        const grouped: { type: string; items: TargetItem[] }[] = [];
        typeMap.forEach((items, type) => grouped.push({ type, items }));
        return grouped.sort((a, b) => compareServiceType(a.type, b.type));
    }, [allTargets]);

    const selectedTargets = useMemo(() => {
        if (cancelType !== 'partial') return [];
        return allTargets
            .filter((t) => selectedKeys.has(`${t.serviceType}:${t.rowId}`))
            .map((t) => ({ service_type: t.serviceType, row_id: t.rowId, label: t.label }))
            .sort((a, b) => compareServiceType(a.service_type, b.service_type));
    }, [cancelType, selectedKeys, allTargets]);

    const orderedAllTargets = useMemo(() => {
        return [...allTargets].sort((a, b) => compareServiceType(a.serviceType, b.serviceType));
    }, [allTargets]);

    const serviceInfoByReservation = useMemo(() => {
        const map = new Map<string, Array<{ type: string; name: string; icon: string }>>();
        for (const resv of reservations) {
            const typeSet = new Set<string>();
            for (const target of resv.targets || []) {
                typeSet.add(target.serviceType);
            }
            if (typeSet.size === 0 && resv.re_type) {
                typeSet.add(resv.re_type);
            }
            const orderedTypes = Array.from(typeSet).sort((a, b) => compareServiceType(a, b));
            map.set(resv.re_id, orderedTypes.map((serviceType) => {
                const meta = SERVICE_META[serviceType];
                return {
                    type: serviceType,
                    name: meta?.name || RE_TYPE_LABEL[serviceType] || serviceType,
                    icon: meta?.icon || '📋',
                };
            }));
        }
        return map;
    }, [reservations]);

    const getHistoryServiceInfo = (h: HistoryItem): Array<{ type: string; name: string; icon: string }> => {
        if (h.cancellation_type === 'partial') {
            let targets = Array.isArray(h.cancel_targets) ? h.cancel_targets : [];
            if (!targets.length && typeof h.cancel_targets === 'string') {
                try {
                    targets = JSON.parse(h.cancel_targets);
                } catch {
                    targets = [];
                }
            }
            const orderedTypes = Array.from(new Set(targets.map((t) => t.service_type).filter(Boolean))).sort((a, b) => compareServiceType(a, b));
            const infos = orderedTypes.map((serviceType) => {
                const meta = SERVICE_META[serviceType];
                return {
                    type: serviceType,
                    name: meta?.name || serviceType,
                    icon: meta?.icon || '📋',
                };
            });
            if (infos.length > 0) return infos;
        }
        const fallbackInfos = serviceInfoByReservation.get(h.reservation_id) || [];
        return fallbackInfos;
    };

    const onSubmit = async () => {
        const detail = reasonDetail.trim();
        const bankName = selectedBank === CUSTOM_BANK_VALUE ? customBankName.trim() : selectedBank.trim();
        const normalizedAccountInput = normalizeAccountInput(refundAccountNumber.trim());
        const accountDigits = digitsOnly(normalizedAccountInput);
        const accountHolder = refundAccountHolder.trim();
        if (reasonCategory === 'other' && !detail) {
            alert('기타 사유는 상세 내용을 입력해 주세요.');
            return;
        }
        if (cancelType === 'partial' && selectedTargets.length === 0) {
            alert('부분 취소할 서비스를 1개 이상 선택해 주세요.');
            return;
        }
        // 계좌번호를 입력한 경우에만 형식 검증 (선택 사항이므로 미입력 허용)
        if (normalizedAccountInput && (accountDigits.length < 10 || accountDigits.length > 14)) {
            alert('계좌번호 형식이 올바르지 않습니다. 숫자 10~14자리로 입력해 주세요.');
            return;
        }
        if (!confirm(`취소 신청을 등록하시겠습니까?\n\n확인 후 매니저가 검토하여 처리 결과를 안내드립니다.`)) return;

        setSubmitting(true);
        try {
            const res = await fetch('/api/cancel/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    token,
                    reservationId,
                    additionalReservationIds: reservations.map(r => r.re_id).filter(id => id !== reservationId),
                    cancellationType: cancelType,
                    reasonCategory,
                    reasonDetail: detail || null,
                    refundBankName: bankName,
                    refundAccountNumber: accountDigits,
                    refundAccountHolder: accountHolder,
                    cancelTargets: cancelType === 'partial' ? selectedTargets : null,
                }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json?.error || '신청 실패');
            setSubmitted(true);
        } catch (err: any) {
            alert(err?.message || '신청 실패');
        } finally {
            setSubmitting(false);
        }
    };

    // ─── 상태별 화면 ─────────────────────────────────────────
    if (loading) {
        return (
            <div className="flex h-72 items-center justify-center">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="mx-auto max-w-sm mt-10 rounded-2xl border border-red-200 bg-red-50 p-8 text-center">
                <div className="text-5xl mb-4">⚠️</div>
                <p className="font-semibold text-red-700">{error}</p>
                <a href="/" className="mt-5 inline-block text-sm text-blue-600 underline">처음으로 돌아가기</a>
            </div>
        );
    }

    if (submitted) {
        return (
            <div className="mx-auto max-w-sm mt-10 rounded-2xl border border-green-200 bg-green-50 p-8 text-center">
                <div className="text-5xl mb-4">✅</div>
                <h2 className="text-xl font-bold text-green-700 mb-2">취소 신청 완료</h2>
                <p className="text-sm text-gray-600 leading-relaxed">
                    담당 매니저가 확인 후<br />처리 결과를 안내해 드립니다.
                </p>
                <div className="mt-6 flex flex-col gap-2">
                    <a href={CUSTOMER_APP_URL} className="inline-block rounded-xl bg-green-600 px-6 py-2.5 text-white text-sm font-semibold hover:bg-green-700 transition text-center">
                        고객앱으로 돌아가기
                    </a>
                    <a href="/" className="inline-block rounded-xl border border-gray-300 px-6 py-2.5 text-gray-600 text-sm hover:bg-gray-50 transition text-center">
                        취소 신청 홈
                    </a>
                </div>
            </div>
        );
    }

    if (reservations.length === 0) {
        return <div className="py-10 text-center text-sm text-gray-500">취소 가능한 예약이 없습니다.</div>;
    }

    return (
        <div className="space-y-4 py-4 max-w-lg mx-auto px-4">
            {/* ── 예약 요약 + 서비스 목록 ── */}
            {primaryReservation && (
                <section className="rounded-2xl border bg-white shadow-sm overflow-hidden">
                    <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-5 py-4">
                        <h1 className="text-white font-bold text-lg">예약 취소 신청</h1>
                        <p className="text-blue-100 text-xs mt-0.5">중복 항목을 정리해 핵심 정보만 표시합니다.</p>
                    </div>

                    <div className="px-5 pt-4 pb-3 space-y-2.5 text-sm">
                        <div className="flex items-center justify-between">
                            <span className="text-gray-500">예약 상태</span>
                            <span className={`rounded-full px-3 py-0.5 text-xs font-semibold ${(STATUS_INFO[primaryReservation.re_status || ''] || { label: '-', cls: 'bg-gray-100 text-gray-600' }).cls}`}>
                                {(STATUS_INFO[primaryReservation.re_status || ''] || { label: '-', cls: 'bg-gray-100 text-gray-600' }).label}
                            </span>
                        </div>
                        {primaryReservation.re_type && (
                            <div className="flex items-center justify-between">
                                <span className="text-gray-500">예약 유형</span>
                                <span className="text-gray-800">{RE_TYPE_LABEL[primaryReservation.re_type] || primaryReservation.re_type}</span>
                            </div>
                        )}
                        <div className="flex items-center justify-between">
                            <span className="text-gray-500">예약일</span>
                            <span className="text-gray-800">{primaryReservation.reservation_date ? primaryReservation.reservation_date.slice(0, 10) : '-'}</span>
                        </div>
                        <div className="flex items-center justify-between border-t pt-2.5 mt-1">
                            <span className="text-gray-500 font-medium">총 결제 금액</span>
                            <span className="text-lg font-bold text-blue-700">{(primaryReservation.total_amount || 0).toLocaleString()}원</span>
                        </div>
                        {reservations.length > 1 && (
                            <p className="text-xs text-gray-500">연결 예약 {reservations.length}건이 함께 처리됩니다.</p>
                        )}
                    </div>

                    {groupedTargets.length > 0 && (
                        <div className="border-t mx-5 pb-5">
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mt-4 mb-3">취소 가능 서비스</p>
                            <div className="space-y-2">
                                {groupedTargets.map(({ type, items }) => {
                                    const meta = SERVICE_META[type] || { icon: '📋', name: type, bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-700' };
                                    return (
                                        <div key={type} className={`rounded-xl border ${meta.border} ${meta.bg} px-3 pt-2.5 pb-3`}>
                                            <div className="flex items-center gap-1.5 mb-2">
                                                <span className="text-base">{meta.icon}</span>
                                                <span className={`text-xs font-bold ${meta.text}`}>{meta.name}</span>
                                                {items.length > 1 && <span className={`text-xs ${meta.text} opacity-70`}>({items.length}건)</span>}
                                            </div>
                                            <div className="space-y-2">
                                                {items.map((item) => (
                                                    <div key={item.rowId} className="rounded-lg bg-white/70 border border-white px-2.5 py-2 space-y-1">
                                                        {item.detail
                                                            ? Object.entries(item.detail).map(([k, v]) => <DetailRow key={k} label={k} value={v} />)
                                                            : <p className="text-xs text-gray-700">{item.label}</p>
                                                        }
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </section>
            )}

            {/* ── 취소 신청 폼 ── */}
            <section className="rounded-2xl border bg-white shadow-sm p-5 space-y-5 text-sm">
                <h2 className="font-bold text-base">취소 신청</h2>

                {/* 취소 유형 */}
                <div>
                    <p className="text-xs font-semibold text-gray-500 mb-2">취소 유형</p>
                    <div className="grid grid-cols-2 gap-2">
                        {([
                            { value: 'full' as CancelType,    icon: '🗑️', label: '전체 취소',  desc: '모든 서비스 취소' },
                            { value: 'partial' as CancelType, icon: '✂️', label: '부분 취소',  desc: '일부 서비스만 취소' },
                        ] as const).map((opt) => (
                            <button
                                key={opt.value}
                                type="button"
                                onClick={() => setCancelType(opt.value)}
                                className={`rounded-xl border-2 p-4 text-left transition ${
                                    cancelType === opt.value ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300 bg-white'
                                }`}
                            >
                                <div className="text-2xl mb-1">{opt.icon}</div>
                                <div className="font-semibold text-sm">{opt.label}</div>
                                <div className="text-xs text-gray-500 mt-0.5">{opt.desc}</div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* 부분 취소 서비스 선택 */}
                {cancelType === 'partial' && (
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <p className="text-xs font-semibold text-gray-500">취소할 서비스 선택</p>
                            <span className="text-xs font-semibold text-blue-600">
                                {selectedTargets.length}/{allTargets.length} 선택됨
                            </span>
                        </div>
                        {allTargets.length === 0 ? (
                            <p className="text-center py-4 text-gray-400 text-xs">선택 가능한 서비스가 없습니다.</p>
                        ) : (
                            <div className="space-y-2">
                                {orderedAllTargets.map((t) => {
                                    const key = `${t.serviceType}:${t.rowId}`;
                                    const meta = SERVICE_META[t.serviceType] || { icon: '📋', name: t.serviceType, bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-700' };
                                    const checked = selectedKeys.has(key);
                                    return (
                                        <button
                                            key={key}
                                            type="button"
                                            onClick={() => onToggle(key)}
                                            className={`w-full rounded-xl border-2 p-3 text-left flex items-start gap-3 transition ${
                                                checked
                                                    ? 'border-red-400 bg-red-50'
                                                    : 'border-gray-200 bg-white hover:border-gray-300'
                                            }`}
                                        >
                                            {/* 체크박스 */}
                                            <div className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${checked ? 'border-red-500 bg-red-500' : 'border-gray-300 bg-white'}`}>
                                                {checked && (
                                                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                    </svg>
                                                )}
                                            </div>

                                            {/* 서비스 정보 */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-1.5 mb-1">
                                                    <span>{meta.icon}</span>
                                                    <span className={`text-xs font-bold ${meta.text}`}>{meta.name}</span>
                                                    {checked && <span className="ml-auto text-xs font-semibold text-red-600 shrink-0">취소 선택됨</span>}
                                                </div>
                                                {t.detail ? (
                                                    <div className="space-y-0.5">
                                                        {Object.entries(t.detail).map(([k, v]) =>
                                                            v && v !== '-' ? (
                                                                <div key={k} className="flex justify-between text-xs">
                                                                    <span className="text-gray-400 shrink-0">{k}</span>
                                                                    <span className="text-gray-700 ml-2 text-right">{v}</span>
                                                                </div>
                                                            ) : null
                                                        )}
                                                    </div>
                                                ) : (
                                                    <p className="text-xs text-gray-700">{t.label}</p>
                                                )}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                        {selectedTargets.length > 0 && (
                            <p className="mt-2 text-xs text-red-600 font-medium">
                                선택된 {selectedTargets.length}개 서비스가 취소 신청됩니다.
                            </p>
                        )}
                    </div>
                )}

                {/* 취소 사유 */}
                <div>
                    <p className="text-xs font-semibold text-gray-500 mb-2">취소 사유</p>
                    <div className="space-y-2">
                        {REASON_OPTIONS.map((opt) => (
                            <label
                                key={opt.value}
                                className={`flex items-center gap-3 cursor-pointer rounded-xl border-2 p-3 transition ${
                                    reasonCategory === opt.value ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                                }`}
                            >
                                <input type="radio" className="sr-only" checked={reasonCategory === opt.value} onChange={() => setReasonCategory(opt.value)} />
                                <span className="text-xl shrink-0">{opt.icon}</span>
                                <div className="flex-1">
                                    <div className="font-semibold text-sm">{opt.label}</div>
                                    <div className="text-xs text-gray-500">{opt.hint}</div>
                                </div>
                                <div className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${reasonCategory === opt.value ? 'border-blue-500 bg-blue-500' : 'border-gray-300'}`}>
                                    {reasonCategory === opt.value && <div className="w-2 h-2 rounded-full bg-white" />}
                                </div>
                            </label>
                        ))}
                    </div>
                </div>

                {/* 상세 사유 */}
                <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                        상세 사유
                        {reasonCategory === 'other' ? <span className="text-red-500 ml-1">*필수</span> : <span className="text-gray-400 ml-1">(선택)</span>}
                    </label>
                    <textarea
                        className="w-full rounded-xl border-2 border-gray-200 p-3 text-sm focus:border-blue-400 focus:outline-none resize-none"
                        rows={3}
                        placeholder={reasonCategory === 'other' ? '취소 사유를 자세히 입력해 주세요.' : '추가 요청 사항이 있으시면 입력해 주세요.'}
                        value={reasonDetail}
                        onChange={(e) => setReasonDetail(e.target.value)}
                    />
                </div>

                {/* 환불 계좌 정보 */}
                <div>
                    <p className="text-xs font-semibold text-gray-500 mb-1">
                        환불 계좌 정보
                        <span className="ml-1 text-yellow-500">(현금을 송금한 예약자는 반드시 아래에 입력해주세요)</span>
                    </p>
                    <p className="text-xs text-red-500 font-medium mb-2">신용카드 결제 고객은 입력하지 않아도 됩니다.</p>
                    <div className="space-y-2">
                        <select
                            className="w-full rounded-xl border-2 border-gray-200 p-3 text-sm focus:border-blue-400 focus:outline-none bg-white"
                            value={selectedBank}
                            onChange={(e) => setSelectedBank(e.target.value)}
                        >
                            <option value="">은행 선택</option>
                            {BANK_OPTIONS.map((bank) => (
                                <option key={bank} value={bank}>{bank}</option>
                            ))}
                            <option value={CUSTOM_BANK_VALUE}>직접 입력</option>
                        </select>
                        {selectedBank === CUSTOM_BANK_VALUE && (
                            <input
                                type="text"
                                className="w-full rounded-xl border-2 border-gray-200 p-3 text-sm focus:border-blue-400 focus:outline-none"
                                placeholder="은행명 직접 입력"
                                value={customBankName}
                                onChange={(e) => setCustomBankName(e.target.value)}
                            />
                        )}
                        <input
                            type="text"
                            className="w-full rounded-xl border-2 border-gray-200 p-3 text-sm focus:border-blue-400 focus:outline-none"
                            placeholder="계좌번호 (숫자/하이픈 가능)"
                            value={refundAccountNumber}
                            onChange={(e) => setRefundAccountNumber(normalizeAccountInput(e.target.value))}
                        />
                        <p className="text-xs text-gray-500">하이픈은 자동 정리되며 저장 시 숫자만 보관됩니다.</p>
                        <input
                            type="text"
                            className="w-full rounded-xl border-2 border-gray-200 p-3 text-sm focus:border-blue-400 focus:outline-none"
                            placeholder="예금주"
                            value={refundAccountHolder}
                            onChange={(e) => setRefundAccountHolder(e.target.value)}
                        />
                    </div>
                </div>

                {/* 제출 버튼 */}
                <button
                    type="button"
                    disabled={submitting}
                    onClick={onSubmit}
                    className="w-full rounded-xl bg-red-600 px-4 py-3.5 font-bold text-white text-base disabled:opacity-50 hover:bg-red-700 active:bg-red-800 transition"
                >
                    {submitting ? (
                        <span className="flex items-center justify-center gap-2">
                            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                            </svg>
                            처리 중...
                        </span>
                    ) : '취소 신청하기'}
                </button>
            </section>

            {/* ── 신청 이력 ── */}
            {history.length > 0 && (
                <section className="rounded-2xl border bg-white shadow-sm p-5 text-sm">
                    <h2 className="font-bold text-base mb-3">취소 신청 이력</h2>
                    {(() => {
                        const totalPages = Math.ceil(history.length / ITEMS_PER_PAGE);
                        const startIdx = (currentHistoryPage - 1) * ITEMS_PER_PAGE;
                        const endIdx = startIdx + ITEMS_PER_PAGE;
                        const paginatedHistory = history.slice(startIdx, endIdx);
                        return (
                            <>
                                <div className="space-y-2 mb-4">
                                    {paginatedHistory.map((h) => {
                                        const hs = CANCEL_REQ_STATUS[h.status] || { label: h.status, cls: 'bg-gray-100 text-gray-600' };
                                        const reason = REASON_OPTIONS.find((r) => r.value === h.cancel_reason_category);
                                        const serviceInfos = getHistoryServiceInfo(h);
                                        return (
                                            <div key={h.id} className="rounded-xl border p-3 space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-xs text-gray-500">{new Date(h.submitted_at).toLocaleString('ko-KR')}</span>
                                                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${hs.cls}`}>{hs.label}</span>
                                                </div>
                                                <div className="flex flex-wrap gap-2 text-xs text-gray-600">
                                                    <span className="rounded-md bg-gray-100 px-2 py-0.5">
                                                        {h.cancellation_type === 'full' ? '🗑️ 전체 취소' : '✂️ 부분 취소'}
                                                    </span>
                                                    {reason && (
                                                        <span className="rounded-md bg-gray-100 px-2 py-0.5">
                                                            {reason.icon} {reason.label}
                                                        </span>
                                                    )}
                                                </div>
                                                {serviceInfos.length > 0 && (
                                                    <div className="flex flex-wrap gap-1.5 text-xs">
                                                        {serviceInfos.map((info) => {
                                                            const meta = SERVICE_META[info.type] || { bg: 'bg-gray-100', text: 'text-gray-700' };
                                                            return (
                                                                <span key={info.type} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium ${meta.bg} ${meta.text}`}>
                                                                    <span>{info.icon}</span>
                                                                    <span>{info.name}</span>
                                                                </span>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                                {totalPages > 1 && (
                                    <div className="flex items-center justify-center gap-2 mt-4 pt-3 border-t">
                                        <button
                                            onClick={() => setCurrentHistoryPage(Math.max(1, currentHistoryPage - 1))}
                                            disabled={currentHistoryPage === 1}
                                            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-200 transition"
                                        >
                                            이전
                                        </button>
                                        <div className="text-xs text-gray-600 font-medium">
                                            {currentHistoryPage} / {totalPages}
                                        </div>
                                        <button
                                            onClick={() => setCurrentHistoryPage(Math.min(totalPages, currentHistoryPage + 1))}
                                            disabled={currentHistoryPage === totalPages}
                                            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-200 transition"
                                        >
                                            다음
                                        </button>
                                    </div>
                                )}
                            </>
                        );
                    })()}
                </section>
            )}

        </div>
    );
}

export default function CancelDetailPage() {
    return (
        <Suspense fallback={
            <div className="flex h-72 items-center justify-center">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500" />
            </div>
        }>
            <CancelDetailContent />
        </Suspense>
    );
}

