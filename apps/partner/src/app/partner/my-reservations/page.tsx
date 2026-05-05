'use client';

import { useEffect, useMemo, useState } from 'react';
import {
    Sparkles, Utensils, Shirt, Bus, Car, Tag,
    CalendarDays, CalendarCheck, Users, Clock, MapPin,
    Phone, StickyNote, Receipt
} from 'lucide-react';
import PartnerLayout from '@/components/PartnerLayout';
import SectionBox from '@/components/SectionBox';
import Spinner from '@/components/Spinner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

// ============================================================
// 카테고리별 특성에 맞춘 예약 내역 카드
// 호텔(hotel)은 별도 시스템에서 관리되므로 이 화면에서 제외
// ============================================================

type Status = 'pending' | 'confirmed' | 'cancelled' | 'completed' | string;

interface Row {
    pr_id: string;
    pr_partner_id: string;
    checkin_date: string;
    checkout_date: string;
    nights: number;
    guest_count: number;
    room_count: number;
    unit_price: number;
    total_price: number;
    currency: string;
    status: Status;
    request_note: string | null;
    contact_name: string | null;
    contact_phone: string | null;
    created_at: string;
    partner?: { name: string; category: string; subcategory?: string | null; region?: string | null; address?: string | null } | null;
    service?: { service_name: string; service_type?: string | null; service_subtype?: string | null; unit?: string | null } | null;
}

const STATUS_LABEL: Record<string, string> = {
    pending: '대기', confirmed: '확정', cancelled: '취소', completed: '완료',
};
const STATUS_COLOR: Record<string, string> = {
    pending: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    confirmed: 'bg-green-50 text-green-700 border-green-200',
    cancelled: 'bg-gray-100 text-gray-500 border-gray-200',
    completed: 'bg-blue-50 text-blue-700 border-blue-200',
};

// ----- 카테고리 메타 (호텔 제외) -----
const CATEGORY_META: Record<string, {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    color: string;       // gradient
    softBg: string;      // soft tinted bg
    border: string;      // border color
}> = {
    spa:        { label: '스파',    icon: Sparkles, color: 'from-pink-500 to-rose-500',         softBg: 'bg-pink-50/60',    border: 'border-pink-200' },
    restaurant: { label: '식당',    icon: Utensils, color: 'from-orange-500 to-amber-500',     softBg: 'bg-orange-50/60',  border: 'border-orange-200' },
    costume:    { label: '의상대여', icon: Shirt,    color: 'from-purple-500 to-fuchsia-500',  softBg: 'bg-purple-50/60',  border: 'border-purple-200' },
    tour:       { label: '투어',    icon: Bus,      color: 'from-emerald-500 to-teal-500',    softBg: 'bg-emerald-50/60', border: 'border-emerald-200' },
    rentcar:    { label: '렌터카',   icon: Car,      color: 'from-indigo-500 to-violet-500',   softBg: 'bg-indigo-50/60',  border: 'border-indigo-200' },
};
function metaOf(c?: string | null) {
    return (c && CATEGORY_META[c]) || { label: c || '기타', icon: Tag, color: 'from-gray-500 to-gray-600', softBg: 'bg-gray-50/60', border: 'border-gray-200' };
}

// ----- 날짜 포맷 -----
function fmtDate(s?: string | null) {
    if (!s) return '-';
    const [y, m, d] = s.split('-');
    return `${y}.${m}.${d}`;
}
function weekday(s?: string | null) {
    if (!s) return '';
    const dt = new Date(s + 'T00:00:00');
    return ['일','월','화','수','목','금','토'][dt.getDay()];
}
function fmtMoney(n: number, cur = 'VND') {
    const v = Number(n || 0).toLocaleString();
    return cur === 'KRW' ? `${v}원` : `${v}동`;
}

// ============================================================
// 카테고리별 카드 본문 — 각 업체 특성에 맞춘 필드 노출
// ============================================================

// 공통: 상태 배지
function StatusBadge({ status }: { status: Status }) {
    return (
        <span className={`px-2 py-0.5 rounded-full text-[11px] border ${STATUS_COLOR[status] || 'bg-gray-50 text-gray-600 border-gray-200'}`}>
            {STATUS_LABEL[status] || status}
        </span>
    );
}

// 공통: 메모/연락처 푸터
function CardFooter({ r }: { r: Row }) {
    if (!r.contact_name && !r.contact_phone && !r.request_note) return null;
    return (
        <div className="mt-3 pt-3 border-t border-gray-100 space-y-1.5 text-[12px] text-gray-600">
            {(r.contact_name || r.contact_phone) && (
                <div className="flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-gray-400" />
                    <span>{[r.contact_name, r.contact_phone].filter(Boolean).join(' · ')}</span>
                </div>
            )}
            {r.request_note && (
                <div className="flex items-start gap-1.5">
                    <StickyNote className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                    <span className="whitespace-pre-wrap">{r.request_note}</span>
                </div>
            )}
        </div>
    );
}

// --- 1) 식당 — 방문일 / 인원 / 메뉴(서비스) ---
function RestaurantBody({ r }: { r: Row }) {
    return (
        <div className="grid grid-cols-2 gap-2 text-[13px]">
            <Field icon={CalendarDays} label="방문일" value={`${fmtDate(r.checkin_date)} (${weekday(r.checkin_date)})`} />
            <Field icon={Users} label="방문 인원" value={`${r.guest_count}명`} />
            <Field icon={Utensils} label="메뉴/주문" value={r.service?.service_name || '-'} full />
        </div>
    );
}

// --- 2) 스파 — 시술일 / 인원 / 시술명 / 예상 소요(있으면) ---
function SpaBody({ r }: { r: Row }) {
    return (
        <div className="grid grid-cols-2 gap-2 text-[13px]">
            <Field icon={CalendarDays} label="시술일" value={`${fmtDate(r.checkin_date)} (${weekday(r.checkin_date)})`} />
            <Field icon={Users} label="예약 인원" value={`${r.guest_count}명`} />
            <Field icon={Sparkles} label="시술 코스" value={r.service?.service_name || '-'} full />
        </div>
    );
}

// --- 3) 의상대여 — 픽업일~반납일 / 인원 / 의상 ---
function CostumeBody({ r }: { r: Row }) {
    return (
        <div className="grid grid-cols-2 gap-2 text-[13px]">
            <Field icon={CalendarDays} label="픽업일" value={fmtDate(r.checkin_date)} />
            <Field icon={CalendarCheck} label="반납일" value={fmtDate(r.checkout_date)} />
            <Field icon={Users} label="이용 인원" value={`${r.guest_count}명`} />
            <Field icon={Clock} label="대여 기간" value={`${Math.max(1, r.nights)}일`} />
            <Field icon={Shirt} label="의상" value={r.service?.service_name || '-'} full />
        </div>
    );
}

// --- 4) 투어 — 투어일 / 인원 / 투어명 ---
function TourBody({ r }: { r: Row }) {
    return (
        <div className="grid grid-cols-2 gap-2 text-[13px]">
            <Field icon={CalendarDays} label="투어 일자" value={`${fmtDate(r.checkin_date)} (${weekday(r.checkin_date)})`} />
            <Field icon={Users} label="참여 인원" value={`${r.guest_count}명`} />
            {r.nights > 1 && <Field icon={Clock} label="일정" value={`${r.nights}일`} />}
            <Field icon={Bus} label="투어 상품" value={r.service?.service_name || '-'} full />
        </div>
    );
}

// --- 5) 렌터카 — 픽업일~반납일 / 차량수 / 인원 / 차종 ---
function RentcarBody({ r }: { r: Row }) {
    return (
        <div className="grid grid-cols-2 gap-2 text-[13px]">
            <Field icon={CalendarDays} label="픽업" value={fmtDate(r.checkin_date)} />
            <Field icon={CalendarCheck} label="반납" value={fmtDate(r.checkout_date)} />
            <Field icon={Clock} label="이용 기간" value={`${Math.max(1, r.nights)}일`} />
            <Field icon={Users} label="탑승 인원" value={`${r.guest_count}명`} />
            <Field icon={Car} label="차량" value={`${r.service?.service_name || '-'}${r.room_count > 1 ? ` × ${r.room_count}대` : ''}`} full />
        </div>
    );
}

// --- 6) 기타 ---
function GenericBody({ r }: { r: Row }) {
    return (
        <div className="grid grid-cols-2 gap-2 text-[13px]">
            <Field icon={CalendarDays} label="이용일" value={fmtDate(r.checkin_date)} />
            <Field icon={Users} label="인원" value={`${r.guest_count}명`} />
            <Field icon={Tag} label="서비스" value={r.service?.service_name || '-'} full />
        </div>
    );
}

function Field({ icon: Icon, label, value, full }: {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    value: string;
    full?: boolean;
}) {
    return (
        <div className={full ? 'col-span-2' : ''}>
            <div className="flex items-center gap-1 text-[11px] text-gray-500 mb-0.5">
                <Icon className="w-3 h-3" />
                <span>{label}</span>
            </div>
            <div className="text-[13px] font-medium text-gray-800 break-keep">{value}</div>
        </div>
    );
}

// ============================================================
// 카드 컨테이너
// ============================================================
function ReservationCard({ r }: { r: Row }) {
    const cat = r.partner?.category || 'etc';
    const m = metaOf(cat);
    const Icon = m.icon;

    let Body: React.FC<{ r: Row }> = GenericBody;
    if (cat === 'restaurant') Body = RestaurantBody;
    else if (cat === 'spa')   Body = SpaBody;
    else if (cat === 'costume') Body = CostumeBody;
    else if (cat === 'tour')  Body = TourBody;
    else if (cat === 'rentcar') Body = RentcarBody;

    return (
        <div className={`rounded-2xl border ${m.border} ${m.softBg} backdrop-blur-sm shadow-sm overflow-hidden`}>
            {/* 헤더 */}
            <div className={`px-4 py-3 bg-gradient-to-r ${m.color} text-white flex items-center justify-between`}>
                <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                        <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                        <div className="text-[11px] uppercase tracking-wider opacity-80">{m.label}</div>
                        <div className="text-sm font-semibold truncate">{r.partner?.name || '-'}</div>
                    </div>
                </div>
                <StatusBadge status={r.status} />
            </div>

            {/* 본문 */}
            <div className="px-4 py-3 bg-white/70">
                {(r.partner?.region || r.partner?.address) && (
                    <div className="flex items-center gap-1 text-[11px] text-gray-500 mb-2">
                        <MapPin className="w-3 h-3" />
                        <span className="truncate">{r.partner?.region}{r.partner?.address ? ` · ${r.partner.address}` : ''}</span>
                    </div>
                )}
                <Body r={r} />

                {/* 결제 요약 */}
                <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-1 text-[11px] text-gray-500">
                        <Receipt className="w-3 h-3" />
                        <span>예약일 {fmtDate(r.created_at?.slice(0, 10))}</span>
                    </div>
                </div>

                <CardFooter r={r} />
            </div>
        </div>
    );
}

// ============================================================
// 페이지
// ============================================================
export default function MyReservationsPage() {
    const { user, loading: authLoading } = useAuth(['member', 'partner', 'manager', 'admin'], '/partner/login');
    const [rows, setRows] = useState<Row[]>([]);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState<'all' | 'upcoming' | 'past' | 'cancelled'>('all');

    useEffect(() => {
        if (!user) return;
        let cancelled = false;
        (async () => {
            try {
                const { data } = await supabase
                    .from('partner_reservation')
                    .select(`
                        pr_id, pr_partner_id, checkin_date, checkout_date,
                        nights, guest_count, room_count, unit_price, total_price, currency,
                        status, request_note, contact_name, contact_phone, created_at,
                        partner:pr_partner_id(name, category, subcategory, region, address),
                        service:pr_service_id(service_name, service_type, service_subtype, unit)
                    `)
                    .eq('pr_user_id', user.id)
                    .order('checkin_date', { ascending: false });
                if (cancelled) return;
                // 호텔은 이 화면에서 제외 (별도 시스템 관리)
                const filtered = ((data as any[]) || []).filter(x => x?.partner?.category !== 'hotel');
                setRows(filtered as Row[]);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [user]);

    const today = new Date().toISOString().slice(0, 10);
    const filtered = useMemo(() => {
        if (tab === 'all') return rows;
        if (tab === 'cancelled') return rows.filter(r => r.status === 'cancelled');
        if (tab === 'upcoming') return rows.filter(r => r.status !== 'cancelled' && r.checkin_date >= today);
        return rows.filter(r => r.status !== 'cancelled' && r.checkin_date < today);
    }, [rows, tab, today]);

    // 카테고리별 그룹핑
    const grouped = useMemo(() => {
        const g: Record<string, Row[]> = {};
        for (const r of filtered) {
            const c = r.partner?.category || 'etc';
            (g[c] ||= []).push(r);
        }
        return g;
    }, [filtered]);

    const counts = useMemo(() => ({
        all: rows.length,
        upcoming: rows.filter(r => r.status !== 'cancelled' && r.checkin_date >= today).length,
        past: rows.filter(r => r.status !== 'cancelled' && r.checkin_date < today).length,
        cancelled: rows.filter(r => r.status === 'cancelled').length,
    }), [rows, today]);

    if (authLoading) return <PartnerLayout><Spinner /></PartnerLayout>;

    return (
        <PartnerLayout
            title="내 예약 내역"
            subtitle="제휴업체별 예약을 한눈에"
            requiredRoles={['member', 'partner', 'manager', 'admin']}
        >
            {/* 필터 탭 */}
            <div className="mb-4 flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4 lg:mx-0 lg:px-0">
                {([
                    ['all', '전체', counts.all],
                    ['upcoming', '예정', counts.upcoming],
                    ['past', '지난 예약', counts.past],
                    ['cancelled', '취소', counts.cancelled],
                ] as const).map(([k, label, n]) => (
                    <button
                        key={k}
                        onClick={() => setTab(k)}
                        className={`flex-shrink-0 px-4 py-2 rounded-full text-xs font-medium border transition ${
                            tab === k
                                ? 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white border-transparent shadow-sm'
                                : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                        }`}
                    >
                        {label} <span className="ml-1 opacity-80">{n}</span>
                    </button>
                ))}
            </div>

            {loading ? (
                <SectionBox><Spinner label="불러오는 중..." /></SectionBox>
            ) : filtered.length === 0 ? (
                <SectionBox>
                    <div className="text-sm text-gray-500 text-center py-12">
                        {tab === 'all' ? '예약 내역이 없습니다.' : '해당 조건의 예약이 없습니다.'}
                    </div>
                </SectionBox>
            ) : (
                <div className="space-y-6">
                    {Object.entries(grouped).map(([cat, list]) => {
                        const m = metaOf(cat);
                        const Icon = m.icon;
                        return (
                            <section key={cat}>
                                <div className="flex items-center gap-2 mb-2 px-1">
                                    <div className={`w-6 h-6 rounded-md bg-gradient-to-br ${m.color} text-white flex items-center justify-center`}>
                                        <Icon className="w-3.5 h-3.5" />
                                    </div>
                                    <h3 className="text-sm font-semibold text-gray-800">{m.label}</h3>
                                    <span className="text-xs text-gray-500">{list.length}건</span>
                                </div>
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                                    {list.map(r => <ReservationCard key={r.pr_id} r={r} />)}
                                </div>
                            </section>
                        );
                    })}
                </div>
            )}
        </PartnerLayout>
    );
}
