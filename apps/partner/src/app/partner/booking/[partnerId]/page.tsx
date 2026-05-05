'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import PartnerLayout from '@/components/PartnerLayout';
import SectionBox from '@/components/SectionBox';
import Spinner from '@/components/Spinner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

interface Service {
    service_id: string;
    service_name: string;
    service_type: string;
    service_subtype?: string | null;
    description?: string | null;
    capacity?: number | null;
    default_price: number;
    unit?: string | null;
    duration_minutes?: number | null;
    min_quantity?: number | null;
    max_quantity?: number | null;
    sht_discount_rate?: number | null;
    thumbnail_url?: string | null;
}
interface Price {
    price_code: string;
    service_id: string;
    valid_from?: string | null;
    valid_to?: string | null;
    price: number;
    sht_price?: number | null;
    duration_minutes?: number | null;
    tier_label?: string | null;
    condition_label?: string | null;
    is_active?: boolean | null;
}
interface Promotion {
    promo_id: string;
    promo_code: string;
    promo_name: string;
    promo_type: string;
    benefit_value?: number | null;
    benefit_unit?: string | null;
    free_item_name?: string | null;
    min_people?: number | null;
    max_people?: number | null;
    requires_coupon?: boolean | null;
    coupon_label?: string | null;
    requires_cruise_booking?: boolean | null;
    min_cruise_people?: number | null;
    note?: string | null;
}
interface Partner {
    partner_id: string; partner_code?: string | null; name: string; branch_name?: string | null;
    category: string; subcategory?: string | null;
    region?: string | null; address?: string | null; description?: string | null;
    thumbnail_url?: string | null; open_hours?: string | null; map_url?: string | null;
    booking_lead_hours?: number | null;
}

function modeOf(category: string): 'stay' | 'schedule' | 'order' {
    if (category === 'hotel') return 'stay';
    if (category === 'restaurant') return 'order';
    return 'schedule';
}

const CATEGORY_LABEL: Record<string, string> = {
    hotel: '🏨 호텔', spa: '💆 스파', restaurant: '🍴 식당', costume: '👘 의상대여', tour: '🚌 투어', rentcar: '🚗 렌터카',
};

// partner_code → 이미지 fallback 매핑 (배열: 갤러리 지원)
const PARTNER_IMAGE_MAP: Record<string, string[]> = {
    'NHAMNHAM-HL-001':       ['/images/partners/nhamnham.gif'],
    'SOLCAFE-HL-001':        ['/images/partners/solcafe.gif'],
    'TAEYEONG-HN-WESTLAKE':  ['/images/partners/taeyeong.gif'],
    'TAEYEONG-HL-DELIVERY':   ['/images/partners/taeyeong.gif'],
    'MON-HL-NIGHTMKT':       ['/images/partners/mon.jpg'],
    'SERENE-HN-001':         ['/images/partners/serene.jpg'],
    'CUCCHI-HL-AOZAI':       ['/images/partners/cucchi.jpg'],
};
function partnerImages(p: { thumbnail_url?: string | null; partner_code?: string | null }): string[] {
    const fromMap = p.partner_code ? PARTNER_IMAGE_MAP[p.partner_code] : null;
    if (fromMap && fromMap.length) return fromMap;
    return p.thumbnail_url ? [p.thumbnail_url] : [];
}
function partnerImage(p: { thumbnail_url?: string | null; partner_code?: string | null }): string | null {
    const arr = partnerImages(p);
    return arr[0] || null;
}

export default function BookingDetailPage() {
    const params = useParams();
    const router = useRouter();
    const partnerId = String(params?.partnerId || '');
    const { user, loading: authLoading } = useAuth(['member', 'partner', 'manager', 'admin'], '/partner/login');

    const [partner, setPartner] = useState<Partner | null>(null);
    const [services, setServices] = useState<Service[]>([]);
    const [prices, setPrices] = useState<Price[]>([]);
    const [promotions, setPromotions] = useState<Promotion[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);

    // ✅ 다중 메뉴 선택: { service_id: 수량 }
    const [selectedItems, setSelectedItems] = useState<Record<string, number>>({});
    const [selectedPrice, setSelectedPrice] = useState<string>(''); // 단일 메뉴 선택 시에만 활성
    const [checkin, setCheckin] = useState<string>('');
    const [checkout, setCheckout] = useState<string>('');
    const [roomCount, setRoomCount] = useState<number>(1);
    const [scheduledDate, setScheduledDate] = useState<string>('');
    const [scheduledTime, setScheduledTime] = useState<string>('');
    const [guestCount, setGuestCount] = useState<string>(''); // ✅ 빈값 허용 (필수입력)
    const [contactName, setContactName] = useState<string>('');
    const [contactKakao, setContactKakao] = useState<string>(''); // ✅ 카톡 ID 신규
    const [contactPhone, setContactPhone] = useState<string>('');
    const [requestNote, setRequestNote] = useState<string>('');
    const [couponCode, setCouponCode] = useState<string>('');

    // 선택된 메뉴 목록 (배열로 변환)
    const selectedList = useMemo(
        () => Object.entries(selectedItems).map(([sid, qty]) => ({ sid, qty })),
        [selectedItems]
    );
    const singleSelectedSid = selectedList.length === 1 ? selectedList[0].sid : '';

    const mode = useMemo(() => modeOf(partner?.category || 'hotel'), [partner?.category]);

    useEffect(() => {
        if (!partnerId) return;
        let cancelled = false;
        (async () => {
            try {
                const [pRes, sRes, promRes] = await Promise.all([
                    supabase.from('partner').select('*').eq('partner_id', partnerId).maybeSingle(),
                    supabase.from('partner_service').select('*').eq('partner_id', partnerId).eq('is_active', true).order('sort_order', { ascending: true }).order('service_name'),
                    supabase.from('partner_promotion').select('*').eq('partner_id', partnerId).eq('is_active', true),
                ]);
                if (cancelled) return;
                setPartner((pRes.data as Partner) || null);
                const ss = (sRes.data as Service[]) || [];
                setServices(ss);
                setPromotions((promRes.data as Promotion[]) || []);
                if (ss.length > 0) {
                    const ids = ss.map(s => s.service_id);
                    const { data: prRes } = await supabase
                        .from('partner_price')
                        .select('*')
                        .in('service_id', ids);
                    if (cancelled) return;
                    setPrices(((prRes as Price[]) || []).filter(p => p.is_active !== false));
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [partnerId]);

    const currentPrice = useMemo(() => prices.find(p => p.price_code === selectedPrice) || null, [prices, selectedPrice]);
    const servicePrices = useMemo(
        () => singleSelectedSid ? prices.filter(p => p.service_id === singleSelectedSid) : [],
        [singleSelectedSid, prices]
    );

    const nights = useMemo(() => {
        if (mode !== 'stay' || !checkin || !checkout) return 0;
        const d = Math.ceil((new Date(checkout).getTime() - new Date(checkin).getTime()) / 86400000);
        return d > 0 ? d : 0;
    }, [mode, checkin, checkout]);

    // 총 수량(메뉴 합계)
    const totalQty = useMemo(
        () => selectedList.reduce((s, x) => s + (x.qty || 0), 0),
        [selectedList]
    );

    // 합산 단가/금액 — 다중 메뉴 지원
    const totalPrice = useMemo(() => {
        if (mode === 'stay') {
            // stay는 단일 메뉴 가정 (호텔). 첫 항목 기준.
            const first = selectedList[0];
            const svc = first ? services.find(s => s.service_id === first.sid) : null;
            const unit = currentPrice ? Number(currentPrice.price) : Number(svc?.default_price || 0);
            return unit * (nights || 1) * roomCount;
        }
        // schedule/order: 메뉴별 단가 × 수량 합산
        return selectedList.reduce((sum, item) => {
            const svc = services.find(s => s.service_id === item.sid);
            const unit = (singleSelectedSid === item.sid && currentPrice)
                ? Number(currentPrice.price)
                : Number(svc?.default_price || 0);
            return sum + unit * item.qty;
        }, 0);
    }, [mode, selectedList, services, currentPrice, nights, roomCount, singleSelectedSid]);

    const guestNum = Math.max(0, Number(guestCount) || 0);

    const eligiblePromos = useMemo(() => {
        const ppl = mode === 'stay' ? guestNum : (guestNum || totalQty || 1);
        return promotions.filter(p => {
            if (p.min_people && ppl < p.min_people) return false;
            if (p.max_people && ppl > p.max_people) return false;
            return true;
        });
    }, [promotions, guestNum, totalQty, mode]);

    // 메뉴 토글/수량 조작 helper
    const toggleItem = (sid: string) => {
        setSelectedItems(prev => {
            const next = { ...prev };
            if (next[sid]) delete next[sid]; else next[sid] = 1;
            return next;
        });
        // 다중 선택 시 가격 옵션 초기화
        setSelectedPrice('');
    };
    const setItemQty = (sid: string, qty: number) => {
        setSelectedItems(prev => ({ ...prev, [sid]: Math.max(1, qty) }));
    };

    const handleSubmit = async () => {
        setMsg(null);
        if (!user) { setMsg('로그인이 필요합니다.'); return; }

        if (mode === 'stay') {
            if (!checkin || !checkout) { setMsg('체크인/체크아웃 날짜를 입력하세요.'); return; }
            if (nights <= 0) { setMsg('체크아웃이 체크인보다 이후여야 합니다.'); return; }
        } else if (mode === 'schedule') {
            if (!scheduledDate || !scheduledTime) { setMsg('이용 날짜와 시간을 선택하세요.'); return; }
        } else if (mode === 'order') {
            if (!scheduledDate) { setMsg('방문/배달 날짜를 선택하세요.'); return; }
        }

        // ✅ 필수 입력 검증: 이름 / 카톡id / 일시 / 인원
        if (!contactName.trim()) { setMsg('예약자 이름을 입력하세요.'); return; }
        if (!contactKakao.trim()) { setMsg('카카오톡 ID를 입력하세요.'); return; }
        if (mode === 'stay') {
            if (!checkin) { setMsg('일시(체크인)를 입력하세요.'); return; }
        } else {
            if (!scheduledDate) { setMsg('일시를 입력하세요.'); return; }
        }
        if (!guestCount || guestNum <= 0) { setMsg('인원을 입력하세요.'); return; }

        setSubmitting(true);
        try {
            try {
                const { data: existing } = await supabase.from('users').select('id').eq('id', user.id).maybeSingle();
                if (!existing) {
                    await supabase.from('users').insert({
                        id: user.id, email: user.email, role: 'member',
                        name: contactName || user.email, phone: contactPhone,
                    });
                }
            } catch { /* ignore */ }

            const scheduledAt = mode === 'schedule'
                ? `${scheduledDate}T${scheduledTime}:00`
                : (mode === 'order' && scheduledDate ? `${scheduledDate}T${scheduledTime || '12:00'}:00` : null);

            const noteParts: string[] = [];
            noteParts.push(`[카카오톡 ID] ${contactKakao}`);
            if (couponCode) noteParts.push(`[쿠폰] ${couponCode}`);
            if (requestNote.trim()) noteParts.push(`[요청사항]\n${requestNote.trim()}`);

            const payload: any = {
                pr_user_id: user.id,
                pr_partner_id: partnerId,
                pr_service_id: null,
                pr_price_code: null,
                guest_count: guestNum,
                unit_price: 0,
                total_price: 0,
                status: 'pending',
                request_note: noteParts.join('\n\n'),
                contact_name: contactName,
                contact_phone: contactPhone || null,
                service_label: '직접문의',
                price_label: null,
                quantity: mode === 'stay' ? roomCount : 0,
                duration_minutes: null,
                payment_status: 'unpaid',
            };

            if (mode === 'stay') {
                payload.checkin_date = checkin;
                payload.checkout_date = checkout;
                payload.nights = nights;
                payload.room_count = roomCount;
            } else {
                payload.scheduled_at = scheduledAt;
            }

            const { error } = await supabase.from('partner_reservation').insert(payload);
            if (error) throw error;
            router.push('/partner/my-reservations');
        } catch (err: any) {
            setMsg(err?.message || '예약 저장 실패');
        } finally {
            setSubmitting(false);
        }
    };

    if (authLoading || loading) {
        return <PartnerLayout requiredRoles={['member', 'partner', 'manager', 'admin']}><Spinner label="불러오는 중..." /></PartnerLayout>;
    }
    if (!partner) {
        return <PartnerLayout requiredRoles={['member', 'partner', 'manager', 'admin']}><div className="text-sm text-gray-500">업체를 찾을 수 없습니다.</div></PartnerLayout>;
    }

    return (
        <PartnerLayout title={`${CATEGORY_LABEL[partner.category] || partner.category} ${partner.name}${partner.branch_name ? ` (${partner.branch_name})` : ''}`} requiredRoles={['member', 'partner', 'manager', 'admin']}>
            <SectionBox title="업체 정보">
                {(() => {
                    const imgs = partnerImages(partner);
                    if (imgs.length === 0) return null;
                    return (
                        <div className={`grid ${imgs.length >= 2 ? 'grid-cols-2 gap-2' : 'grid-cols-1'} mb-3`}>
                            {imgs.map((src, i) => (
                                <div key={i} className="w-full aspect-[16/9] rounded overflow-hidden bg-gray-100">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={src} alt={`${partner.name}-${i + 1}`} className="w-full h-full object-cover" />
                                </div>
                            ))}
                        </div>
                    );
                })()}
                <div className="text-sm text-gray-700 space-y-0.5">
                    <div>지역: {partner.region || '-'}</div>
                    <div>주소: {partner.address || '-'}</div>
                    {partner.open_hours && <div>운영 시간: {partner.open_hours}</div>}
                    {partner.booking_lead_hours ? <div className="text-amber-700">최소 예약 시간: {partner.booking_lead_hours}시간 전</div> : null}
                    {partner.description && <div className="text-gray-600 mt-2 whitespace-pre-line">{partner.description}</div>}
                    {partner.map_url && <a href={partner.map_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">지도 보기 →</a>}
                </div>
            </SectionBox>

            {promotions.length > 0 && (
                <SectionBox title="🎁 진행 중 프로모션">
                    <div className="space-y-2">
                        {promotions.map(p => {
                            const eligible = eligiblePromos.find(e => e.promo_id === p.promo_id);
                            return (
                                <div key={p.promo_id} className={`p-3 rounded border ${eligible ? 'border-green-300 bg-green-50' : 'border-gray-200 bg-gray-50 opacity-70'}`}>
                                    <div className="flex justify-between items-start gap-2">
                                        <div className="text-sm font-medium text-gray-800">{p.promo_name}</div>
                                        <span className="text-xs px-2 py-0.5 rounded bg-white border border-gray-200 text-gray-600">{p.promo_code}</span>
                                    </div>
                                    <div className="text-xs text-gray-600 mt-1">
                                        {p.promo_type === 'free_item' && p.free_item_name && <>🎉 무료 제공: <b>{p.free_item_name}</b></>}
                                        {p.promo_type === 'percent_discount' && <>💸 할인: <b>{p.benefit_value}%</b></>}
                                        {p.promo_type === 'amount_discount' && <>💸 할인: <b>{Number(p.benefit_value || 0).toLocaleString()} {p.benefit_unit || 'VND'}</b></>}
                                    </div>
                                    {(p.min_people || p.max_people) && (
                                        <div className="text-xs text-gray-500 mt-0.5">조건: {p.min_people || 1}~{p.max_people || '∞'}명</div>
                                    )}
                                    {p.requires_cruise_booking && (
                                        <div className="text-xs text-blue-600 mt-0.5">크루즈 예약 동반 시 적용 (최소 {p.min_cruise_people || 1}명)</div>
                                    )}
                                    {p.requires_coupon && (
                                        <div className="text-xs text-amber-600 mt-0.5">🎟️ 쿠폰 필수 — 코드 입력란에 기재</div>
                                    )}
                                    {p.note && <div className="text-xs text-gray-500 mt-1 whitespace-pre-line">{p.note}</div>}
                                </div>
                            );
                        })}
                    </div>
                </SectionBox>
            )}

            <SectionBox title="① 메뉴 안내">
                <div className="p-4 rounded bg-blue-50 border border-blue-200">
                    <div className="text-sm text-gray-700 leading-relaxed">
                        <p className="font-medium mb-2">📋 다양한 상품과 메뉴는 직접문의 하세요</p>
                        <p className="text-gray-600">
                            업체별 메뉴 및 가격, 특별 옵션 등에 대해 자세히 알아보시려면 아래 예약자 정보를 입력하고 카카오톡으로 문의하시면 담당자가 상세히 안내해드립니다.
                        </p>
                    </div>
                </div>
            </SectionBox>



            <SectionBox title="③ 일정">
                {mode === 'stay' ? (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <label><div className="text-xs text-gray-500 mb-1">체크인 <span className="text-red-500">*</span></div>
                            <input type="date" value={checkin} onChange={(e) => setCheckin(e.target.value)} className="w-full px-2 py-1 rounded border border-gray-200 bg-white" /></label>
                        <label><div className="text-xs text-gray-500 mb-1">체크아웃 <span className="text-red-500">*</span></div>
                            <input type="date" value={checkout} onChange={(e) => setCheckout(e.target.value)} className="w-full px-2 py-1 rounded border border-gray-200 bg-white" /></label>
                        <label><div className="text-xs text-gray-500 mb-1">객실 수</div>
                            <input type="number" min={1} value={roomCount} onChange={(e) => setRoomCount(Math.max(1, Number(e.target.value) || 1))} className="w-full px-2 py-1 rounded border border-gray-200 bg-white" /></label>
                        <label><div className="text-xs text-gray-500 mb-1">총 인원 <span className="text-red-500">*</span></div>
                            <input type="number" min={0} value={guestCount}
                                onChange={(e) => setGuestCount(e.target.value)}
                                placeholder="인원 입력"
                                className="w-full px-2 py-1 rounded border border-gray-200 bg-white" /></label>
                        <div className="text-xs text-gray-500 col-span-full">박 수: {nights}박</div>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                        <label><div className="text-xs text-gray-500 mb-1">{mode === 'order' ? '방문/배달 날짜' : '이용 날짜'} <span className="text-red-500">*</span></div>
                            <input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} className="w-full px-2 py-1 rounded border border-gray-200 bg-white" /></label>
                        <label><div className="text-xs text-gray-500 mb-1">{mode === 'order' ? '시간(선택)' : '시간'} {mode !== 'order' && <span className="text-red-500">*</span>}</div>
                            <input type="time" value={scheduledTime} onChange={(e) => setScheduledTime(e.target.value)} className="w-full px-2 py-1 rounded border border-gray-200 bg-white" /></label>
                        <label><div className="text-xs text-gray-500 mb-1">총 인원 <span className="text-red-500">*</span></div>
                            <input type="number" min={0} value={guestCount}
                                onChange={(e) => setGuestCount(e.target.value)}
                                placeholder="인원 입력"
                                className="w-full px-2 py-1 rounded border border-gray-200 bg-white" /></label>
                    </div>
                )}
            </SectionBox>

            <SectionBox title="④ 연락처 / 요청사항">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    <label className="block">
                        <div className="text-xs text-gray-500 mb-1">예약자 이름 <span className="text-red-500">*</span></div>
                        <input type="text" placeholder="예약자 이름" value={contactName} onChange={(e) => setContactName(e.target.value)} className="w-full px-2 py-1 rounded border border-gray-200 bg-white" />
                    </label>
                    <label className="block">
                        <div className="text-xs text-gray-500 mb-1">카카오톡 ID <span className="text-red-500">*</span></div>
                        <input type="text" placeholder="예: stayhalong_kr" value={contactKakao} onChange={(e) => setContactKakao(e.target.value)} className="w-full px-2 py-1 rounded border border-gray-200 bg-white" />
                    </label>
                    <label className="block md:col-span-2">
                        <div className="text-xs text-gray-500 mb-1">연락처 (선택)</div>
                        <input type="text" placeholder="연락처" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} className="w-full px-2 py-1 rounded border border-gray-200 bg-white" />
                    </label>

                </div>
                <textarea placeholder="요청사항(선택)" rows={3} value={requestNote} onChange={(e) => setRequestNote(e.target.value)} className="w-full px-2 py-1 rounded border border-gray-200 bg-white text-sm mt-2" />
                <div className="text-[11px] text-gray-500 mt-1"><span className="text-red-500">*</span> 표시 항목은 필수 입력입니다 (이름 / 카카오톡 ID / 일시 / 인원).</div>
            </SectionBox>



            {msg && <div className="text-sm text-red-500 mb-2">{msg}</div>}

            <div className="flex justify-end gap-2">
                <button onClick={() => router.back()} className="px-3 py-2 text-sm rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-50">취소</button>
                <button onClick={handleSubmit} disabled={submitting}
                    className="px-4 py-2 text-sm rounded bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50">
                    {submitting ? '저장 중...' : '예약하기'}
                </button>
            </div>
        </PartnerLayout>
    );
}
