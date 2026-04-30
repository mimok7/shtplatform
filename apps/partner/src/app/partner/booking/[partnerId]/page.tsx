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
    description?: string | null;
    capacity?: number | null;
    default_price: number;
}
interface Price {
    price_code: string;
    service_id: string;
    valid_from?: string | null;
    valid_to?: string | null;
    price: number;
    condition_label?: string | null;
}
interface Partner { partner_id: string; name: string; region?: string | null; address?: string | null; }

export default function BookingDetailPage() {
    const params = useParams();
    const router = useRouter();
    const partnerId = String(params?.partnerId || '');
    const { user, profile, loading: authLoading } = useAuth(['member', 'partner', 'manager', 'admin'], '/partner/login');

    const [partner, setPartner] = useState<Partner | null>(null);
    const [services, setServices] = useState<Service[]>([]);
    const [prices, setPrices] = useState<Price[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);

    // form
    const [selectedService, setSelectedService] = useState<string>('');
    const [selectedPrice, setSelectedPrice] = useState<string>('');
    const [checkin, setCheckin] = useState<string>('');
    const [checkout, setCheckout] = useState<string>('');
    const [roomCount, setRoomCount] = useState<number>(1);
    const [guestCount, setGuestCount] = useState<number>(2);
    const [contactName, setContactName] = useState<string>('');
    const [contactPhone, setContactPhone] = useState<string>('');
    const [requestNote, setRequestNote] = useState<string>('');

    useEffect(() => {
        if (!partnerId) return;
        let cancelled = false;
        (async () => {
            try {
                const [pRes, sRes] = await Promise.all([
                    supabase.from('partner').select('partner_id, name, region, address').eq('partner_id', partnerId).maybeSingle(),
                    supabase.from('partner_service').select('*').eq('partner_id', partnerId).eq('is_active', true).order('service_name'),
                ]);
                if (cancelled) return;
                setPartner((pRes.data as Partner) || null);
                const ss = (sRes.data as Service[]) || [];
                setServices(ss);

                if (ss.length > 0) {
                    const ids = ss.map(s => s.service_id);
                    const { data: prRes } = await supabase
                        .from('partner_price')
                        .select('*')
                        .in('service_id', ids);
                    if (cancelled) return;
                    setPrices((prRes as Price[]) || []);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [partnerId]);

    const nights = useMemo(() => {
        if (!checkin || !checkout) return 0;
        const a = new Date(checkin).getTime();
        const b = new Date(checkout).getTime();
        const d = Math.ceil((b - a) / (1000 * 60 * 60 * 24));
        return d > 0 ? d : 0;
    }, [checkin, checkout]);

    const unitPrice = useMemo(() => {
        if (selectedPrice) {
            return prices.find(p => p.price_code === selectedPrice)?.price || 0;
        }
        if (selectedService) {
            return services.find(s => s.service_id === selectedService)?.default_price || 0;
        }
        return 0;
    }, [selectedPrice, selectedService, prices, services]);

    const totalPrice = unitPrice * (nights || 1) * roomCount;

    const servicePrices = useMemo(() => {
        if (!selectedService) return [];
        return prices.filter(p => p.service_id === selectedService);
    }, [selectedService, prices]);

    const handleSubmit = async () => {
        setMsg(null);
        if (!user) { setMsg('로그인이 필요합니다.'); return; }
        if (!selectedService) { setMsg('서비스를 선택하세요.'); return; }
        if (!checkin || !checkout) { setMsg('체크인/체크아웃 날짜를 입력하세요.'); return; }
        if (nights <= 0) { setMsg('체크아웃이 체크인보다 이후여야 합니다.'); return; }

        setSubmitting(true);
        try {
            // 예약자 users 테이블 자동 등록 (없으면)
            try {
                const { data: existing } = await supabase.from('users').select('id').eq('id', user.id).maybeSingle();
                if (!existing) {
                    await supabase.from('users').insert({
                        id: user.id, email: user.email, role: 'member',
                        name: contactName || user.email, phone: contactPhone,
                    });
                }
            } catch { /* ignore */ }

            const { error } = await supabase.from('partner_reservation').insert({
                pr_user_id: user.id,
                pr_partner_id: partnerId,
                pr_service_id: selectedService,
                pr_price_code: selectedPrice || null,
                checkin_date: checkin,
                checkout_date: checkout,
                nights,
                guest_count: guestCount,
                room_count: roomCount,
                unit_price: unitPrice,
                total_price: totalPrice,
                status: 'pending',
                request_note: requestNote || null,
                contact_name: contactName || null,
                contact_phone: contactPhone || null,
            });
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
        return <PartnerLayout requiredRoles={['member', 'partner', 'manager', 'admin']}><div className="text-sm text-gray-500">호텔을 찾을 수 없습니다.</div></PartnerLayout>;
    }

    return (
        <PartnerLayout title={`🏨 ${partner.name}`} requiredRoles={['member', 'partner', 'manager', 'admin']}>
            <SectionBox title="호텔 정보">
                <div className="text-sm text-gray-700">
                    <div>지역: {partner.region || '-'}</div>
                    <div>주소: {partner.address || '-'}</div>
                </div>
            </SectionBox>

            <SectionBox title="① 객실/플랜 선택">
                {services.length === 0 ? (
                    <div className="text-sm text-gray-500">등록된 객실이 없습니다.</div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {services.map(s => {
                            const active = s.service_id === selectedService;
                            return (
                                <div
                                    key={s.service_id}
                                    onClick={() => { setSelectedService(s.service_id); setSelectedPrice(''); }}
                                    className={`p-3 rounded border-2 cursor-pointer ${active ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:border-blue-300'}`}
                                >
                                    <div className="flex justify-between items-start">
                                        <div className="text-sm font-medium text-gray-800">{s.service_name}</div>
                                        <div className="text-sm font-semibold text-blue-600">{Number(s.default_price).toLocaleString()}동</div>
                                    </div>
                                    <div className="text-xs text-gray-500 mt-1">정원 {s.capacity ?? '-'}명 · {s.service_type}</div>
                                    {s.description && <div className="text-xs text-gray-600 mt-1 line-clamp-2">{s.description}</div>}
                                </div>
                            );
                        })}
                    </div>
                )}
            </SectionBox>

            {servicePrices.length > 0 && (
                <SectionBox title="② 시즌/요금 옵션 (선택)">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        {servicePrices.map(p => {
                            const active = p.price_code === selectedPrice;
                            return (
                                <div
                                    key={p.price_code}
                                    onClick={() => setSelectedPrice(active ? '' : p.price_code)}
                                    className={`p-2 rounded border cursor-pointer text-xs ${active ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:border-blue-300'}`}
                                >
                                    <div className="font-medium text-gray-700">{p.condition_label || p.price_code}</div>
                                    <div className="text-blue-600 font-semibold">{Number(p.price).toLocaleString()}동</div>
                                    {(p.valid_from || p.valid_to) && (
                                        <div className="text-gray-500 mt-1">{p.valid_from || '~'} ~ {p.valid_to || '~'}</div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </SectionBox>
            )}

            <SectionBox title="③ 일정 / 인원">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <label>
                        <div className="text-xs text-gray-500 mb-1">체크인</div>
                        <input type="date" value={checkin} onChange={(e) => setCheckin(e.target.value)}
                            className="w-full px-2 py-1 rounded border border-gray-200 bg-white" />
                    </label>
                    <label>
                        <div className="text-xs text-gray-500 mb-1">체크아웃</div>
                        <input type="date" value={checkout} onChange={(e) => setCheckout(e.target.value)}
                            className="w-full px-2 py-1 rounded border border-gray-200 bg-white" />
                    </label>
                    <label>
                        <div className="text-xs text-gray-500 mb-1">객실 수</div>
                        <input type="number" min={1} value={roomCount} onChange={(e) => setRoomCount(Math.max(1, Number(e.target.value) || 1))}
                            className="w-full px-2 py-1 rounded border border-gray-200 bg-white" />
                    </label>
                    <label>
                        <div className="text-xs text-gray-500 mb-1">총 인원</div>
                        <input type="number" min={1} value={guestCount} onChange={(e) => setGuestCount(Math.max(1, Number(e.target.value) || 1))}
                            className="w-full px-2 py-1 rounded border border-gray-200 bg-white" />
                    </label>
                </div>
                <div className="text-xs text-gray-500">박 수: {nights}박</div>
            </SectionBox>

            <SectionBox title="④ 연락처 / 요청사항">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    <input type="text" placeholder="예약자 이름" value={contactName} onChange={(e) => setContactName(e.target.value)}
                        className="w-full px-2 py-1 rounded border border-gray-200 bg-white" />
                    <input type="text" placeholder="연락처" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)}
                        className="w-full px-2 py-1 rounded border border-gray-200 bg-white" />
                </div>
                <textarea placeholder="요청사항(선택)" rows={3} value={requestNote} onChange={(e) => setRequestNote(e.target.value)}
                    className="w-full px-2 py-1 rounded border border-gray-200 bg-white text-sm" />
            </SectionBox>

            <div className="bg-yellow-50 border border-yellow-200 rounded p-4 mb-3">
                <div className="text-sm text-yellow-800 mb-1">💰 예상 총 금액</div>
                <div className="text-xl font-bold text-red-600">
                    {totalPrice.toLocaleString()}동
                    <span className="text-xs text-gray-500 ml-2 font-normal">
                        ({Number(unitPrice).toLocaleString()}동 × {nights || 1}박 × {roomCount}객실)
                    </span>
                </div>
            </div>

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
