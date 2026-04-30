'use client';

import { useEffect, useMemo, useState } from 'react';
import {
    Sparkles, Utensils, Shirt, Bus, Car, Tag,
    CalendarDays, Users, Clock, MapPin, TrendingUp, CalendarCheck, AlertCircle
} from 'lucide-react';
import PartnerLayout from '@/components/PartnerLayout';
import SectionBox from '@/components/SectionBox';
import Spinner from '@/components/Spinner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

// ============================================================
// 우리 업체 대시보드 — 카테고리별 특성에 맞춰 적응
// (호텔은 별도 시스템에서 관리하므로 본 화면 대상이 아님)
// ============================================================

interface PartnerInfo {
    partner_id: string;
    partner_code: string;
    name: string;
    branch_name?: string | null;
    category: string;
    subcategory?: string | null;
    region?: string | null;
    address?: string | null;
    description?: string | null;
}

interface Row {
    pr_id: string;
    pr_user_id: string;
    pr_partner_id: string;
    checkin_date: string | null;
    checkout_date: string | null;
    scheduled_at: string | null;
    nights: number | null;
    guest_count: number;
    room_count: number | null;
    quantity: number | null;
    duration_minutes: number | null;
    service_label?: string | null;
    price_label?: string | null;
    total_price: number;
    status: string;
    payment_status?: string | null;
    confirmation_code?: string | null;
    contact_name?: string | null;
    contact_phone?: string | null;
    request_note?: string | null;
    created_at: string;
    service?: { service_name: string } | null;
}

const STATUS_LABEL: Record<string, string> = { pending: '대기', confirmed: '확정', cancelled: '취소', completed: '완료' };
const STATUS_COLOR: Record<string, string> = {
    pending: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    confirmed: 'bg-green-50 text-green-700 border-green-200',
    cancelled: 'bg-gray-100 text-gray-500 border-gray-200',
    completed: 'bg-blue-50 text-blue-700 border-blue-200',
};

// ----- 카테고리 메타 -----
interface CatMeta {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    color: string;
    softBg: string;
    // 컬럼 라벨
    dateLabel: string;        // '방문일' / '시술일' / '픽업일' / '투어일' ...
    serviceLabel: string;     // '주문 메뉴' / '시술 코스' / '대여 의상' ...
    qtyLabel: string;         // '인원' / '대수+인원' / '인원' ...
    todayLabel: string;       // 오늘 지표 라벨
}

const CATEGORY_META: Record<string, CatMeta> = {
    restaurant: { label: '식당',    icon: Utensils, color: 'from-orange-500 to-amber-500', softBg: 'bg-orange-50',
        dateLabel: '방문일',   serviceLabel: '주문 메뉴',  qtyLabel: '방문 인원', todayLabel: '오늘 방문 예정' },
    spa:        { label: '스파',    icon: Sparkles, color: 'from-pink-500 to-rose-500',    softBg: 'bg-pink-50',
        dateLabel: '시술일',   serviceLabel: '시술 코스',  qtyLabel: '시술 인원', todayLabel: '오늘 시술 예정' },
    costume:    { label: '의상대여', icon: Shirt,    color: 'from-purple-500 to-fuchsia-500', softBg: 'bg-purple-50',
        dateLabel: '픽업일',   serviceLabel: '대여 의상',  qtyLabel: '인원',     todayLabel: '오늘 픽업/반납' },
    tour:       { label: '투어',    icon: Bus,      color: 'from-emerald-500 to-teal-500', softBg: 'bg-emerald-50',
        dateLabel: '투어일',   serviceLabel: '투어 상품',  qtyLabel: '참여 인원', todayLabel: '오늘 출발' },
    rentcar:    { label: '렌터카',   icon: Car,      color: 'from-indigo-500 to-violet-500', softBg: 'bg-indigo-50',
        dateLabel: '픽업일',   serviceLabel: '차량',      qtyLabel: '대수/인원', todayLabel: '오늘 픽업/반납' },
};
function metaOf(c?: string | null): CatMeta {
    return (c && CATEGORY_META[c]) || {
        label: c || '기타', icon: Tag, color: 'from-gray-500 to-gray-600', softBg: 'bg-gray-50',
        dateLabel: '이용일', serviceLabel: '서비스', qtyLabel: '인원', todayLabel: '오늘 이용 예정',
    };
}

// partner_code → 이미지 매핑은 lib/partnerImages.ts (사이드바와 공용)

function fmtDate(s?: string | null) {
    if (!s) return '-';
    const [y, m, d] = s.split('-');
    return `${y}.${m}.${d}`;
}

export default function PartnerDashboardPage() {
    const { profile, loading: authLoading } = useAuth(['partner', 'manager', 'admin'], '/partner/login');
    const [partner, setPartner] = useState<PartnerInfo | null>(null);
    const [rows, setRows] = useState<Row[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<string>('');
    const [period, setPeriod] = useState<'all' | 'today' | 'week' | 'month'>('week');

    // 1) 업체 정보 로드
    useEffect(() => {
        if (authLoading) return;
        if (profile?.role !== 'partner' || !profile?.partner_id) {
            // manager/admin: 업체 컨텍스트 없이 전체 통계만
            return;
        }
        let cancelled = false;
        (async () => {
            const { data } = await supabase
                .from('partner')
                .select('partner_id, partner_code, name, branch_name, category, subcategory, region, address, description')
                .eq('partner_id', profile.partner_id!)
                .maybeSingle();
            if (cancelled) return;
            setPartner((data as any) || null);
        })();
        return () => { cancelled = true; };
    }, [authLoading, profile?.partner_id, profile?.role]);

    // 2) 예약 목록 로드
    useEffect(() => {
        if (authLoading) return;
        if (profile?.role === 'partner' && !profile?.partner_id) { setLoading(false); return; }
        let cancelled = false;
        (async () => {
            try {
                let q = supabase
                    .from('partner_reservation')
                    .select(`
                        pr_id, pr_user_id, pr_partner_id, checkin_date, checkout_date, scheduled_at,
                        nights, guest_count, room_count, quantity, duration_minutes,
                        service_label, price_label, total_price, status, payment_status, confirmation_code,
                        contact_name, contact_phone, request_note, created_at,
                        service:pr_service_id(service_name)
                    `)
                    .order('created_at', { ascending: false });
                if (profile?.role === 'partner' && profile?.partner_id) {
                    q = q.eq('pr_partner_id', profile.partner_id);
                }
                const { data } = await q;
                if (cancelled) return;
                setRows((data as any) || []);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [authLoading, profile?.partner_id, profile?.role]);

    const updateStatus = async (pr_id: string, next: string) => {
        if (!confirm(`상태를 "${STATUS_LABEL[next] || next}"로 변경할까요?`)) return;
        const patch: any = { status: next };
        if (next === 'confirmed' && !rows.find(r => r.pr_id === pr_id)?.confirmation_code) {
            patch.confirmation_code = `C${Date.now().toString().slice(-8)}`;
        }
        const { error } = await supabase.from('partner_reservation').update(patch).eq('pr_id', pr_id);
        if (error) { alert('변경 실패: ' + error.message); return; }
        setRows(prev => prev.map(r => r.pr_id === pr_id ? { ...r, status: next, ...(patch.confirmation_code ? { confirmation_code: patch.confirmation_code } : {}) } : r));
    };

    const meta = useMemo(() => metaOf(partner?.category), [partner?.category]);
    const Icon = meta.icon;

    const today = new Date().toISOString().slice(0, 10);

    // 기간/상태 필터링
    const filtered = useMemo(() => {
        let r = rows;
        if (statusFilter) r = r.filter(x => x.status === statusFilter);
        if (period !== 'all') {
            const now = new Date();
            const limit = new Date();
            if (period === 'today') limit.setDate(now.getDate() + 1);
            else if (period === 'week') limit.setDate(now.getDate() + 7);
            else if (period === 'month') limit.setMonth(now.getMonth() + 1);
            r = r.filter(x => {
                const dateStr = x.checkin_date || (x.scheduled_at ? x.scheduled_at.slice(0, 10) : null);
                if (!dateStr) return true;
                const d = new Date(dateStr);
                return d >= new Date(today) && d <= limit;
            });
        }
        return r;
    }, [rows, statusFilter, period, today]);

    // 카테고리 적응 메트릭
    const metrics = useMemo(() => {
        const isToday = (s?: string | null) => !!s && s.slice(0, 10) === today;
        const datesToday = (r: Row) => isToday(r.checkin_date) || isToday(r.checkout_date) || isToday(r.scheduled_at);
        const todayCount = rows.filter(r => r.status !== 'cancelled' && datesToday(r)).length;
        const todayGuests = rows
            .filter(r => r.status !== 'cancelled' && datesToday(r))
            .reduce((s, r) => s + (r.guest_count || 0), 0);
        const pending = rows.filter(r => r.status === 'pending').length;
        const upcoming7 = rows.filter(r => {
            if (r.status === 'cancelled') return false;
            const dateStr = r.checkin_date || (r.scheduled_at ? r.scheduled_at.slice(0, 10) : null);
            if (!dateStr) return false;
            const diff = (new Date(dateStr).getTime() - new Date(today).getTime()) / 86400000;
            return diff >= 0 && diff <= 7;
        }).length;
        return { todayCount, todayGuests, pending, upcoming7 };
    }, [rows, today]);

    if (authLoading) return <PartnerLayout><Spinner /></PartnerLayout>;

    return (
        <PartnerLayout
            title={partner ? partner.name : '우리 업체 예약'}
            subtitle={partner?.branch_name || meta.label}
            requiredRoles={['partner', 'manager', 'admin']}
        >
            {/* 카테고리 적응 헤더 배너 (이미지는 사이드바에 표시) */}
            {partner && (
                <div className={`rounded-2xl overflow-hidden border ${meta.softBg} border-gray-200 mb-4`}>
                    <div className={`px-5 py-4 bg-gradient-to-r ${meta.color} text-white`}>
                        <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                                    <Icon className="w-5 h-5" />
                                </div>
                                <div className="min-w-0">
                                    <div className="text-[11px] uppercase tracking-wider opacity-80">{meta.label}{partner.subcategory ? ` · ${partner.subcategory}` : ''}</div>
                                    <div className="text-base font-bold truncate">{partner.name}</div>
                                    {partner.region && (
                                        <div className="flex items-center gap-1 text-[12px] opacity-90 mt-0.5">
                                            <MapPin className="w-3 h-3" />
                                            <span className="truncate">{partner.region}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="hidden sm:block text-right">
                                <div className="text-[11px] opacity-80">{meta.todayLabel}</div>
                                <div className="text-2xl font-extrabold">{metrics.todayCount}<span className="text-sm font-medium opacity-90"> 건</span></div>
                            </div>
                        </div>
                    </div>
                    {/* KPI 카드 */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-gray-200">
                        <KpiCell icon={CalendarDays} label={meta.todayLabel} value={`${metrics.todayCount}건`} />
                        <KpiCell icon={Users} label="오늘 인원" value={`${metrics.todayGuests}명`} />
                        <KpiCell icon={AlertCircle} label="승인 대기" value={`${metrics.pending}건`} highlight={metrics.pending > 0} />
                        <KpiCell icon={TrendingUp} label="향후 7일" value={`${metrics.upcoming7}건`} />
                    </div>
                </div>
            )}

            {/* 필터 */}
            <SectionBox>
                <div className="flex gap-2 flex-wrap text-xs">
                    {(['today', 'week', 'month', 'all'] as const).map(p => (
                        <button key={p} onClick={() => setPeriod(p)}
                            className={`px-3 py-1.5 rounded-full border ${period === p ? 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white border-transparent' : 'bg-white border-gray-200 text-gray-600 hover:border-blue-300'}`}>
                            {p === 'today' ? '오늘' : p === 'week' ? '향후 7일' : p === 'month' ? '향후 30일' : '전체'}
                        </button>
                    ))}
                    <span className="border-l border-gray-200 mx-1" />
                    {['', 'pending', 'confirmed', 'completed', 'cancelled'].map(s => (
                        <button key={s} onClick={() => setStatusFilter(s)}
                            className={`px-3 py-1.5 rounded-full border ${statusFilter === s ? 'bg-gray-800 text-white border-transparent' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-400'}`}>
                            {s === '' ? '상태 전체' : STATUS_LABEL[s]}
                        </button>
                    ))}
                </div>
            </SectionBox>

            <SectionBox title={`예약 ${filtered.length}건`}>
                {loading ? <Spinner label="불러오는 중..." /> : filtered.length === 0 ? (
                    <div className="text-sm text-gray-500 text-center py-12">조건에 맞는 예약이 없습니다.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                            <thead className="bg-gray-50 text-gray-600">
                                <tr>
                                    <th className="px-2 py-2 text-left">{meta.dateLabel}</th>
                                    <th className="px-2 py-2 text-left">{meta.serviceLabel}</th>
                                    <th className="px-2 py-2 text-right">{meta.qtyLabel}</th>
                                    <th className="px-2 py-2 text-left">예약자</th>
                                    <th className="px-2 py-2 text-left">연락처</th>
                                    <th className="px-2 py-2 text-left">요청사항</th>
                                    <th className="px-2 py-2 text-right">금액</th>
                                    <th className="px-2 py-2 text-center">상태</th>
                                    <th className="px-2 py-2 text-center">액션</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(r => (
                                    <tr key={r.pr_id} className="border-t border-gray-100 hover:bg-gray-50 align-top">
                                        <td className="px-2 py-2 whitespace-nowrap">
                                            {r.checkin_date ? (
                                                <>
                                                    {fmtDate(r.checkin_date)}
                                                    {r.checkout_date && r.checkout_date !== r.checkin_date && (
                                                        <><br /><span className="text-gray-400">~ {fmtDate(r.checkout_date)}</span></>
                                                    )}
                                                </>
                                            ) : r.scheduled_at ? (
                                                <>{r.scheduled_at.slice(0, 10)}<br /><span className="text-gray-500">{r.scheduled_at.slice(11, 16)}{r.duration_minutes ? ` (${r.duration_minutes}분)` : ''}</span></>
                                            ) : '-'}
                                        </td>
                                        <td className="px-2 py-2">
                                            <div className="font-medium text-gray-800">{r.service_label || r.service?.service_name || '-'}</div>
                                            {r.price_label && <div className="text-[11px] text-gray-500">{r.price_label}</div>}
                                            {r.confirmation_code && <div className="text-[11px] text-blue-600 font-mono">#{r.confirmation_code}</div>}
                                        </td>
                                        <td className="px-2 py-2 text-right whitespace-nowrap">
                                            {qtyText(partner?.category, r)}
                                        </td>
                                        <td className="px-2 py-2">{r.contact_name || '-'}</td>
                                        <td className="px-2 py-2">{r.contact_phone || '-'}</td>
                                        <td className="px-2 py-2 max-w-[200px] truncate" title={r.request_note || ''}>{r.request_note || '-'}</td>
                                        <td className="px-2 py-2 text-right font-semibold whitespace-nowrap">
                                            {Number(r.total_price) > 0 ? (
                                                <span className="text-red-600">{Number(r.total_price).toLocaleString()}동</span>
                                            ) : (
                                                <span className="text-gray-400 text-[11px]">현장결제</span>
                                            )}
                                            {r.payment_status && <div className="text-[11px] text-gray-500">{r.payment_status}</div>}
                                        </td>
                                        <td className="px-2 py-2 text-center">
                                            <span className={`px-2 py-0.5 rounded-full text-[11px] border ${STATUS_COLOR[r.status] || 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                                                {STATUS_LABEL[r.status] || r.status}
                                            </span>
                                        </td>
                                        <td className="px-2 py-2 text-center whitespace-nowrap">
                                            <div className="flex gap-1 justify-center flex-wrap">
                                                {r.status !== 'confirmed' && r.status !== 'completed' && (
                                                    <button onClick={() => updateStatus(r.pr_id, 'confirmed')} className="px-2 py-0.5 text-[11px] rounded bg-green-500 text-white hover:bg-green-600">확정</button>
                                                )}
                                                {r.status !== 'completed' && r.status !== 'cancelled' && (
                                                    <button onClick={() => updateStatus(r.pr_id, 'completed')} className="px-2 py-0.5 text-[11px] rounded bg-blue-500 text-white hover:bg-blue-600">완료</button>
                                                )}
                                                {r.status !== 'cancelled' && (
                                                    <button onClick={() => updateStatus(r.pr_id, 'cancelled')} className="px-2 py-0.5 text-[11px] rounded bg-gray-200 text-gray-700 hover:bg-gray-300">취소</button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </SectionBox>
        </PartnerLayout>
    );
}

// ----- KPI 셀 -----
function KpiCell({ icon: Icon, label, value, highlight }: {
    icon: React.ComponentType<{ className?: string }>;
    label: string; value: string; highlight?: boolean;
}) {
    return (
        <div className={`bg-white px-4 py-3 ${highlight ? 'ring-1 ring-amber-200' : ''}`}>
            <div className="flex items-center gap-1.5 text-[11px] text-gray-500 mb-0.5">
                <Icon className="w-3 h-3" />
                <span>{label}</span>
            </div>
            <div className={`text-lg font-bold ${highlight ? 'text-amber-600' : 'text-gray-800'}`}>{value}</div>
        </div>
    );
}

// ----- 카테고리별 수량 표시 -----
function qtyText(category: string | undefined, r: Row): string {
    switch (category) {
        case 'restaurant':
        case 'spa':
        case 'tour':
            return `${r.guest_count}명`;
        case 'costume':
            return `${r.guest_count}명${r.nights && r.nights > 1 ? ` · ${r.nights}일` : ''}`;
        case 'rentcar':
            return `${r.room_count || 1}대 · ${r.guest_count}명${r.nights && r.nights > 1 ? ` · ${r.nights}일` : ''}`;
        default:
            return r.nights ? `${r.nights}박/${r.room_count}/${r.guest_count}명` : `${r.quantity || 1}/${r.guest_count}명`;
    }
}
