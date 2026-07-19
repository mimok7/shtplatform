'use client';

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import supabase from '@/lib/supabase';
import { calculateReservationPricing } from '@sht/domain/pricing';
import { saveAdditionalFeeTemplateFromInput } from '@/lib/additionalFeeTemplate';
import ManagerLayout from '@/components/ManagerLayout';
import { ArrowLeft, Calendar, FileText, Mail, Phone, Save, User } from 'lucide-react';

type PriceChannel = 'official' | 'card' | 'krw';
type TicketPriceItem = 'adult' | 'child_under_1_2m' | 'shuttle';

interface TicketPriceOption {
    ticket_price_code: string;
    ticket_type: string;
    ticket_name: string;
    price_item: TicketPriceItem;
    official_price_vnd: number;
    stay_card_price_vnd: number;
    stay_krw_price_krw: number;
    valid_from: string;
    valid_to: string | null;
    sort_order: number;
}

interface TicketReservation {
    reservation_id: string;
    ticket_type: string | null;
    ticket_name: string | null;
    program_selection: string | null;
    ticket_quantity: number | null;
    adult_count: number | null;
    child_count: number | null;
    shuttle_count: number | null;
    usage_date: string | null;
    shuttle_required: boolean | null;
    pickup_location: string | null;
    dropoff_location: string | null;
    unit_price: number | null;
    total_price: number | null;
    request_note: string | null;
    ticket_price_code?: string | null;
    ticket_price_item?: TicketPriceItem | null;
    price_channel?: PriceChannel | null;
    reservation: {
        re_id: string;
        re_status: string;
        re_created_at: string;
        users: {
            name: string;
            email: string;
            phone: string;
        };
        quote: {
            title: string;
        } | null;
    };
}

const CHANNEL_LABEL: Record<PriceChannel, string> = {
    official: '공식가 (VND)',
    card: '스테이카드가 (VND)',
    krw: '스테이크루즈가 (KRW)',
};

function TicketReservationEditContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const reservationId = searchParams.get('id');
    const newUserId = searchParams.get('userId');
    const newQuoteId = searchParams.get('quoteId');
    const isCreateMode = !reservationId && !!newUserId;

    const [reservation, setReservation] = useState<TicketReservation | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [additionalFee, setAdditionalFee] = useState(0);
    const [additionalFeeInput, setAdditionalFeeInput] = useState('');
    const [additionalFeeDetail, setAdditionalFeeDetail] = useState('');
    const [feeTemplates, setFeeTemplates] = useState<{ id: number; name: string; amount: number }[]>([]);
    const [ticketPriceOptions, setTicketPriceOptions] = useState<TicketPriceOption[]>([]);
    const [priceInfoText, setPriceInfoText] = useState('');

    const [formData, setFormData] = useState({
        ticket_type: 'dragon',
        ticket_name: '',
        program_selection: '',
        usage_date: '',
        shuttle_required: false,
        pickup_location: '',
        dropoff_location: '',
        price_channel: 'card' as PriceChannel,
        ticket_price_code: '',
        ticket_price_item: 'adult' as TicketPriceItem,

        adult_count: 1,
        child_count: 0,
        shuttle_count: 0,

        adult_unit_price: 0,
        child_unit_price: 0,
        shuttle_unit_price: 0,

        ticket_quantity: 1,
        unit_price: 0,
        total_price: 0,
        request_note: '',
    });

    const todayText = useMemo(() => new Date().toISOString().slice(0, 10), []);
    const currencyLabel = formData.price_channel === 'krw' ? 'KRW' : 'VND';

    const adultTotal = formData.adult_count * formData.adult_unit_price;
    const childTotal = formData.child_count * formData.child_unit_price;
    const shuttleAppliedCount = formData.shuttle_required ? formData.shuttle_count : 0;
    const shuttleTotal = shuttleAppliedCount * formData.shuttle_unit_price;
    const ticketBaseTotal = adultTotal + childTotal + shuttleTotal;
    const finalTotal = Math.max(0, ticketBaseTotal + additionalFee);

    const applyAdditionalFeeValue = (nextValue: number) => {
        setAdditionalFee(nextValue);
        setAdditionalFeeInput(nextValue === 0 ? '' : String(nextValue));
    };

    const getUnitByChannel = (option: TicketPriceOption, channel: PriceChannel) => {
        if (channel === 'official') return Number(option.official_price_vnd || 0);
        if (channel === 'krw') return Number(option.stay_krw_price_krw || 0);
        return Number(option.stay_card_price_vnd || 0);
    };

    const findOption = (ticketType: string, item: TicketPriceItem, date: string) => {
        return ticketPriceOptions
            .filter((option) => {
                if (option.ticket_type !== ticketType) return false;
                if (option.price_item !== item) return false;
                if (option.valid_from > date) return false;
                if (option.valid_to && option.valid_to < date) return false;
                return true;
            })
            .sort((a, b) => {
                if (a.valid_from === b.valid_from) {
                    if (a.sort_order === b.sort_order) {
                        return a.ticket_price_code.localeCompare(b.ticket_price_code);
                    }
                    return a.sort_order - b.sort_order;
                }
                return a.valid_from < b.valid_from ? 1 : -1;
            })[0];
    };

    const recalcDerived = (base: typeof formData) => {
        const adultCount = Math.max(0, Number(base.adult_count || 0));
        const childCount = Math.max(0, Number(base.child_count || 0));
        const totalPeople = adultCount + childCount;
        const shuttleCount = base.shuttle_required ? Math.max(0, Number(base.shuttle_count || 0)) : 0;

        const nextTotal =
            adultCount * Number(base.adult_unit_price || 0) +
            childCount * Number(base.child_unit_price || 0) +
            shuttleCount * Number(base.shuttle_unit_price || 0);

        const representativeItem: TicketPriceItem =
            adultCount > 0 ? 'adult' : childCount > 0 ? 'child_under_1_2m' : shuttleCount > 0 ? 'shuttle' : 'adult';

        const representativeUnit =
            representativeItem === 'adult'
                ? Number(base.adult_unit_price || 0)
                : representativeItem === 'child_under_1_2m'
                  ? Number(base.child_unit_price || 0)
                  : Number(base.shuttle_unit_price || 0);

        return {
            ...base,
            adult_count: adultCount,
            child_count: childCount,
            shuttle_count: shuttleCount,
            ticket_quantity: totalPeople,
            ticket_price_item: representativeItem,
            unit_price: representativeUnit,
            total_price: nextTotal,
        };
    };

    useEffect(() => {
        if (reservationId) {
            void loadReservation();
            return;
        }
        if (!newUserId) {
            router.push('/manager/reservation-edit');
            return;
        }
        void loadNewReservation();
    }, [reservationId, newUserId, newQuoteId]);

    useEffect(() => {
        supabase
            .from('additional_fee_template')
            .select('id, name, amount')
            .or('service_type.is.null,service_type.eq.ticket')
            .eq('is_active', true)
            .order('sort_order')
            .then(({ data }) => {
                if (data) setFeeTemplates(data);
            });

        // Fetch ticket_price via API to bypass RLS
        fetch('/api/ticket-price')
            .then(res => res.json())
            .then(({ data, error }) => {
                if (error) {
                    console.error('Failed to load ticket_price:', error);
                    setPriceInfoText('요금표 로딩 실패');
                } else if (data) {
                    setTicketPriceOptions(data as TicketPriceOption[]);
                }
            })
            .catch(err => {
                console.error('Error fetching ticket_price:', err);
                setPriceInfoText('요금표 로딩 실패');
            });
    }, []);

    useEffect(() => {
        if (ticketPriceOptions.length === 0) {
            setPriceInfoText('요금표 로딩 중');
            return;
        }

        const effectiveDate = formData.usage_date || todayText;
        const adultOption = findOption(formData.ticket_type, 'adult', effectiveDate);
        const childOption = findOption(formData.ticket_type, 'child_under_1_2m', effectiveDate);
        const shuttleOption = findOption(formData.ticket_type, 'shuttle', effectiveDate);

        const nextAdultUnit = adultOption ? getUnitByChannel(adultOption, formData.price_channel) : 0;
        const nextChildUnit = childOption ? getUnitByChannel(childOption, formData.price_channel) : 0;
        const nextShuttleUnit = shuttleOption ? getUnitByChannel(shuttleOption, formData.price_channel) : 0;

        const nextName =
            formData.ticket_name ||
            adultOption?.ticket_name ||
            childOption?.ticket_name ||
            shuttleOption?.ticket_name ||
            '';

        const representativeCode =
            (formData.adult_count > 0 ? adultOption?.ticket_price_code : null) ||
            (formData.child_count > 0 ? childOption?.ticket_price_code : null) ||
            (formData.shuttle_required ? shuttleOption?.ticket_price_code : null) ||
            '';

        const basePatched = {
            ...formData,
            ticket_name: nextName,
            ticket_price_code: representativeCode,
            adult_unit_price: nextAdultUnit,
            child_unit_price: nextChildUnit,
            shuttle_unit_price: nextShuttleUnit,
        };

        const next = recalcDerived(basePatched);

        const changed =
            next.ticket_name !== formData.ticket_name ||
            next.ticket_price_code !== formData.ticket_price_code ||
            next.adult_unit_price !== formData.adult_unit_price ||
            next.child_unit_price !== formData.child_unit_price ||
            next.shuttle_unit_price !== formData.shuttle_unit_price ||
            next.ticket_quantity !== formData.ticket_quantity ||
            next.total_price !== formData.total_price ||
            next.unit_price !== formData.unit_price ||
            next.ticket_price_item !== formData.ticket_price_item ||
            next.shuttle_count !== formData.shuttle_count;

        if (changed) setFormData(next);

        const hasRequiredPrice =
            (!!adultOption || next.adult_count === 0) &&
            (!!childOption || next.child_count === 0) &&
            (!!shuttleOption || !next.shuttle_required);

        setPriceInfoText(
            hasRequiredPrice
                ? `성인 ${next.adult_count}명 / 아동 ${next.child_count}명 / 셔틀 ${next.shuttle_required ? `${next.shuttle_count}개` : '미사용'} / ${CHANNEL_LABEL[next.price_channel]}`
                : '선택 조건과 일치하는 요금표가 없습니다',
        );
    }, [
        formData.ticket_type,
        formData.usage_date,
        formData.price_channel,
        formData.adult_count,
        formData.child_count,
        formData.shuttle_required,
        ticketPriceOptions,
    ]);

    const loadReservation = async () => {
        try {
            setLoading(true);

            const { data: resRow, error: resErr } = await supabase
                .from('reservation')
                .select('re_id, re_status, re_created_at, re_quote_id, re_user_id, manual_additional_fee, manual_additional_fee_detail')
                .eq('re_id', reservationId)
                .single();

            if (resErr || !resRow) throw resErr || new Error('예약 기본 정보 조회 실패');

            let customerInfo = { name: '정보 없음', email: '', phone: '' };
            if (resRow.re_user_id) {
                const { data: userRow } = await supabase
                    .from('users')
                    .select('name, email, phone_number')
                    .eq('id', resRow.re_user_id)
                    .single();
                if (userRow) customerInfo = { ...customerInfo, ...userRow, phone: userRow.phone_number };
            }

            const { data: ticketRow } = await supabase
                .from('reservation_ticket')
                .select('*')
                .eq('reservation_id', reservationId)
                .limit(1)
                .maybeSingle();

            let quoteInfo: { title: string } | null = null;
            if (resRow.re_quote_id) {
                const { data: q } = await supabase.from('quote').select('title').eq('id', resRow.re_quote_id).single();
                quoteInfo = q || null;
            }

            const loaded: TicketReservation = {
                reservation_id: reservationId!,
                ticket_type: ticketRow?.ticket_type || 'dragon',
                ticket_name: ticketRow?.ticket_name || '',
                program_selection: ticketRow?.program_selection || '',
                ticket_quantity: ticketRow?.ticket_quantity || 1,
                adult_count: ticketRow?.adult_count ?? ticketRow?.ticket_quantity ?? 1,
                child_count: ticketRow?.child_count ?? 0,
                shuttle_count: ticketRow?.shuttle_count ?? 0,
                usage_date: ticketRow?.usage_date || '',
                shuttle_required: !!ticketRow?.shuttle_required,
                pickup_location: ticketRow?.pickup_location || '',
                dropoff_location: ticketRow?.dropoff_location || '',
                unit_price: Number(ticketRow?.unit_price || 0),
                total_price: Number(ticketRow?.total_price || 0),
                request_note: ticketRow?.request_note || '',
                ticket_price_code: ticketRow?.ticket_price_code || '',
                ticket_price_item: ticketRow?.ticket_price_item || 'adult',
                price_channel: (ticketRow?.price_channel || 'card') as PriceChannel,
                reservation: {
                    re_id: resRow.re_id,
                    re_status: resRow.re_status,
                    re_created_at: resRow.re_created_at,
                    users: {
                        name: customerInfo.name,
                        email: customerInfo.email,
                        phone: customerInfo.phone,
                    },
                    quote: quoteInfo,
                },
            };

            setReservation(loaded);
            setFormData((prev) =>
                recalcDerived({
                    ...prev,
                    ticket_type: loaded.ticket_type || 'dragon',
                    ticket_name: loaded.ticket_name || '',
                    program_selection: loaded.program_selection || '',
                    usage_date: loaded.usage_date || '',
                    shuttle_required: !!loaded.shuttle_required,
                    pickup_location: loaded.pickup_location || '',
                    dropoff_location: loaded.dropoff_location || '',
                    price_channel: (loaded.price_channel || 'card') as PriceChannel,
                    ticket_price_code: loaded.ticket_price_code || '',
                    ticket_price_item: (loaded.ticket_price_item || 'adult') as TicketPriceItem,
                    adult_count: Number(loaded.adult_count ?? loaded.ticket_quantity ?? 1),
                    child_count: Number(loaded.child_count ?? 0),
                    shuttle_count: Number(loaded.shuttle_count ?? 0),
                    unit_price: Number(loaded.unit_price || 0),
                    total_price: Number(loaded.total_price || 0),
                    request_note: loaded.request_note || '',
                }),
            );

            applyAdditionalFeeValue(Number(resRow.manual_additional_fee || 0));
            setAdditionalFeeDetail(String(resRow.manual_additional_fee_detail || ''));
        } catch (err) {
            console.error('❌ 티켓 예약 로드 실패:', err);
            alert('티켓 예약 정보를 불러오는데 실패했습니다.');
            router.push('/manager/reservation-edit');
        } finally {
            setLoading(false);
        }
    };

    const loadNewReservation = async () => {
        try {
            setLoading(true);
            const { data: userRow, error: userError } = await supabase
                .from('users')
                .select('name, email, phone_number')
                .eq('id', newUserId)
                .single();
            if (userError || !userRow) throw userError || new Error('고객 정보 조회 실패');

            let quoteInfo: { title: string } | null = null;
            if (newQuoteId) {
                const { data } = await supabase.from('quote').select('title').eq('id', newQuoteId).single();
                quoteInfo = data || null;
            }

            setReservation({
                reservation_id: '', ticket_type: 'dragon', ticket_name: '', program_selection: '',
                ticket_quantity: 1, adult_count: 1, child_count: 0, shuttle_count: 0,
                usage_date: '', shuttle_required: false, pickup_location: '', dropoff_location: '',
                unit_price: 0, total_price: 0, request_note: '',
                reservation: {
                    re_id: '', re_status: 'pending', re_created_at: new Date().toISOString(),
                    users: { name: userRow.name || '이름 없음', email: userRow.email || '', phone: userRow.phone_number || '' },
                    quote: quoteInfo,
                },
            });
        } catch (err) {
            console.error('❌ 티켓 신규 예약 고객 로드 실패:', err);
            alert('고객 정보를 불러오는데 실패했습니다.');
            router.push('/manager/reservation-edit/new');
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!reservationId && !newUserId) return;

        try {
            setSaving(true);

            const payload = {
                ticket_type: formData.ticket_type,
                ticket_name: formData.ticket_name || null,
                program_selection: formData.program_selection || null,
                ticket_quantity: formData.ticket_quantity,
                adult_count: formData.adult_count,
                child_count: formData.child_count,
                shuttle_count: formData.shuttle_required ? formData.shuttle_count : 0,
                usage_date: formData.usage_date || null,
                shuttle_required: formData.shuttle_required,
                pickup_location: formData.pickup_location || null,
                dropoff_location: formData.dropoff_location || null,
                ticket_price_item: formData.ticket_price_item,
                price_channel: formData.price_channel,
                ticket_price_code: formData.ticket_price_code || null,
                unit_price: formData.unit_price,
                total_price: formData.total_price,
                request_note: formData.request_note || null,
            };

            const pricing = calculateReservationPricing({
                serviceType: 'ticket',
                baseTotal: formData.total_price,
                additionalFee,
                additionalFeeDetail,
                lineItems: [
                    {
                        label: '티켓(성인)',
                        code: 'adult',
                        unit_price: formData.adult_unit_price,
                        quantity: formData.adult_count,
                        total: formData.adult_unit_price * formData.adult_count,
                    },
                    {
                        label: '티켓(아동)',
                        code: 'child_under_1_2m',
                        unit_price: formData.child_unit_price,
                        quantity: formData.child_count,
                        total: formData.child_unit_price * formData.child_count,
                    },
                    {
                        label: '티켓(셔틀)',
                        code: 'shuttle',
                        unit_price: formData.shuttle_required ? formData.shuttle_unit_price : 0,
                        quantity: formData.shuttle_required ? formData.shuttle_count : 0,
                        total: formData.shuttle_required ? formData.shuttle_unit_price * formData.shuttle_count : 0,
                    },
                ],
                metadata: {
                    ticket_type: formData.ticket_type,
                    request_note: formData.request_note || null,
                },
            });

            let targetReservationId = reservationId;
            if (!targetReservationId) {
                const { data: createdReservation, error: createError } = await supabase
                    .from('reservation')
                    .insert({
                        re_user_id: newUserId,
                        re_quote_id: newQuoteId || null,
                        re_type: 'ticket',
                        re_status: 'pending',
                        total_amount: pricing.total_amount,
                        pax_count: formData.ticket_quantity,
                        re_adult_count: formData.adult_count,
                        re_child_count: formData.child_count,
                        reservation_date: formData.usage_date || null,
                        price_breakdown: pricing.price_breakdown,
                        manual_additional_fee: additionalFee,
                        manual_additional_fee_detail: additionalFeeDetail || null,
                    })
                    .select('re_id')
                    .single();
                if (createError || !createdReservation) throw createError || new Error('티켓 예약 생성 실패');
                targetReservationId = createdReservation.re_id;
            }

            const { data: updatedData, error: updateError } = await supabase
                .from('reservation_ticket')
                .update(payload)
                .eq('reservation_id', targetReservationId)
                .select();
            if (updateError) throw updateError;

            if (!updatedData || updatedData.length === 0) {
                const { error: insertError } = await supabase.from('reservation_ticket').insert({ reservation_id: targetReservationId, ...payload });
                if (insertError) throw insertError;
            }

            const { error: reservationError } = await supabase
                .from('reservation')
                .update({
                    total_amount: pricing.total_amount,
                    pax_count: formData.ticket_quantity,
                    re_adult_count: formData.adult_count,
                    re_child_count: formData.child_count,
                    reservation_date: formData.usage_date || null,
                    price_breakdown: pricing.price_breakdown,
                    manual_additional_fee: additionalFee,
                    manual_additional_fee_detail: additionalFeeDetail || null,
                    re_update_at: new Date().toISOString(),
                })
                .eq('re_id', targetReservationId);

            if (reservationError) console.error('⚠️ 예약 테이블 동기화 실패:', reservationError);

            await saveAdditionalFeeTemplateFromInput({
                serviceType: 'ticket',
                detail: additionalFeeDetail,
                amount: additionalFee,
            });

            if (isCreateMode) {
                alert('티켓 예약이 생성되었습니다.');
                router.push(`/manager/reservation-edit/ticket?id=${targetReservationId}`);
                return;
            }

            alert('티켓 예약이 성공적으로 수정되었습니다.');
            router.refresh();
            await loadReservation();
        } catch (err) {
            console.error('❌ 티켓 저장 실패:', err);
            alert('저장 중 오류가 발생했습니다.');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <ManagerLayout title="🎫 티켓 예약 수정" activeTab="reservation-edit-ticket">
                <div className="flex justify-center items-center h-64">
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto" />
                        <p className="mt-4 text-gray-600">티켓 예약 데이터를 불러오는 중...</p>
                    </div>
                </div>
            </ManagerLayout>
        );
    }

    if (!reservation) {
        return (
            <ManagerLayout title="🎫 티켓 예약 수정" activeTab="reservation-edit-ticket">
                <div className="text-center py-12">
                    <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">예약을 찾을 수 없습니다</h3>
                    <button
                        onClick={() => router.push('/manager/reservation-edit')}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        예약 목록으로 돌아가기
                    </button>
                </div>
            </ManagerLayout>
        );
    }

    return (
        <ManagerLayout title="🎫 티켓 예약 수정" activeTab="reservation-edit-ticket">
            <div className="space-y-6">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => router.push('/manager/reservation-edit')}
                        className="inline-flex items-center gap-2 px-3 py-2 text-gray-600 hover:text-gray-800"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        예약 목록으로
                    </button>
                    <div>
                        <h1 className="text-xl font-bold text-gray-900">티켓 예약 수정</h1>
                        <p className="text-sm text-gray-600">예약 ID: {reservation.reservation.re_id}</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 space-y-6">
                        <div className="bg-white rounded-lg shadow-sm p-6">
                            <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
                                <User className="w-5 h-5" /> 고객 정보
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                                <div>{reservation.reservation.users.name}</div>
                                <div className="flex items-center gap-2"><Mail className="w-4 h-4 text-gray-400" />{reservation.reservation.users.email}</div>
                                <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-gray-400" />{reservation.reservation.users.phone}</div>
                            </div>
                        </div>

                        <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
                            <h3 className="text-lg font-medium text-gray-900">티켓 예약 정보</h3>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">티켓 유형</label>
                                    <select
                                        value={formData.ticket_type}
                                        onChange={(e) => setFormData((prev) => ({ ...prev, ticket_type: e.target.value }))}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                    >
                                        <option value="dragon">드래곤펄</option>
                                        <option value="onsen">요코온센</option>
                                        <option value="other">기타</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">사용일</label>
                                    <input
                                        type="date"
                                        value={formData.usage_date}
                                        onChange={(e) => setFormData((prev) => ({ ...prev, usage_date: e.target.value }))}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">성인 인원</label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={formData.adult_count}
                                        onChange={(e) => setFormData((prev) => recalcDerived({ ...prev, adult_count: Math.max(0, Number(e.target.value) || 0) }))}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">아동 인원</label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={formData.child_count}
                                        onChange={(e) => setFormData((prev) => recalcDerived({ ...prev, child_count: Math.max(0, Number(e.target.value) || 0) }))}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">총 인원</label>
                                    <input type="number" readOnly value={formData.ticket_quantity} className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50" />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">요금 채널</label>
                                    <select
                                        value={formData.price_channel}
                                        onChange={(e) => setFormData((prev) => ({ ...prev, price_channel: e.target.value as PriceChannel }))}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                    >
                                        <option value="card">스테이카드가 (VND)</option>
                                        <option value="official">공식가 (VND)</option>
                                        <option value="krw">스테이크루즈가 (KRW)</option>
                                    </select>
                                </div>
                                <div className="flex items-end">
                                    <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-700">
                                        <input
                                            type="checkbox"
                                            checked={formData.shuttle_required}
                                            onChange={(e) => setFormData((prev) => recalcDerived({ ...prev, shuttle_required: e.target.checked }))}
                                            className="w-4 h-4"
                                        />
                                        셔틀 이용
                                    </label>
                                </div>
                            </div>

                            {formData.shuttle_required && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">셔틀 수량</label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={formData.shuttle_count}
                                        onChange={(e) => setFormData((prev) => recalcDerived({ ...prev, shuttle_count: Math.max(0, Number(e.target.value) || 0) }))}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                    />
                                </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">성인 단가</label>
                                    <div className="flex gap-2 items-end">
                                        <input
                                            type="number"
                                            min="0"
                                            value={formData.adult_unit_price}
                                            onChange={(e) => setFormData((prev) => recalcDerived({ ...prev, adult_unit_price: Math.max(0, Number(e.target.value) || 0) }))}
                                            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                        />
                                        <span className="text-sm text-gray-600 whitespace-nowrap">{currencyLabel}</span>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">아동 단가</label>
                                    <div className="flex gap-2 items-end">
                                        <input
                                            type="number"
                                            min="0"
                                            value={formData.child_unit_price}
                                            onChange={(e) => setFormData((prev) => recalcDerived({ ...prev, child_unit_price: Math.max(0, Number(e.target.value) || 0) }))}
                                            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                        />
                                        <span className="text-sm text-gray-600 whitespace-nowrap">{currencyLabel}</span>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">셔틀 단가</label>
                                    <div className="flex gap-2 items-end">
                                        <input
                                            type="number"
                                            min="0"
                                            value={formData.shuttle_unit_price}
                                            onChange={(e) => setFormData((prev) => recalcDerived({ ...prev, shuttle_unit_price: Math.max(0, Number(e.target.value) || 0) }))}
                                            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                        />
                                        <span className="text-sm text-gray-600 whitespace-nowrap">{currencyLabel}</span>
                                    </div>
                                </div>
                            </div>
                            <div className="text-xs text-gray-600 bg-gray-50 rounded px-2 py-1">
                                💡 {priceInfoText} | 대표 코드: {formData.ticket_price_code || '미매칭'}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">티켓명</label>
                                    <input
                                        type="text"
                                        value={formData.ticket_name}
                                        onChange={(e) => setFormData((prev) => ({ ...prev, ticket_name: e.target.value }))}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">프로그램 선택</label>
                                    <input
                                        type="text"
                                        value={formData.program_selection}
                                        onChange={(e) => setFormData((prev) => ({ ...prev, program_selection: e.target.value }))}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">픽업 위치</label>
                                    <input
                                        type="text"
                                        value={formData.pickup_location}
                                        onChange={(e) => setFormData((prev) => ({ ...prev, pickup_location: e.target.value }))}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">드롭오프 위치</label>
                                    <input
                                        type="text"
                                        value={formData.dropoff_location}
                                        onChange={(e) => setFormData((prev) => ({ ...prev, dropoff_location: e.target.value }))}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">요청사항</label>
                                <textarea
                                    rows={3}
                                    value={formData.request_note}
                                    onChange={(e) => setFormData((prev) => ({ ...prev, request_note: e.target.value }))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div className="bg-white rounded-lg shadow-sm p-6 space-y-3">
                            <h3 className="text-lg font-medium text-gray-900">실시간 금액</h3>
                            <div className="text-sm text-gray-700 flex justify-between"><span>성인</span><span>{formData.adult_count} x {formData.adult_unit_price.toLocaleString()} = {adultTotal.toLocaleString()}</span></div>
                            <div className="text-sm text-gray-700 flex justify-between"><span>아동</span><span>{formData.child_count} x {formData.child_unit_price.toLocaleString()} = {childTotal.toLocaleString()}</span></div>
                            <div className="text-sm text-gray-700 flex justify-between"><span>셔틀</span><span>{shuttleAppliedCount} x {formData.shuttle_unit_price.toLocaleString()} = {shuttleTotal.toLocaleString()}</span></div>
                            <div className="pt-2 border-t text-sm text-gray-700 flex justify-between"><span>기본 합계</span><span className="font-semibold">{ticketBaseTotal.toLocaleString()} {currencyLabel}</span></div>

                            <div className="pt-3 border-t space-y-2">
                                <label className="block text-sm font-medium text-gray-700">추가내역 선택</label>
                                <select
                                    title="추가내역 선택"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                    value=""
                                    onChange={(e) => {
                                        const tpl = feeTemplates.find((t) => String(t.id) === e.target.value);
                                        if (tpl) {
                                            applyAdditionalFeeValue(tpl.amount);
                                            setAdditionalFeeDetail(tpl.name);
                                        }
                                    }}
                                >
                                    <option value="">-- 추가내역 선택 --</option>
                                    {feeTemplates.map((t) => (
                                        <option key={t.id} value={t.id}>{t.name} ({t.amount.toLocaleString()}동)</option>
                                    ))}
                                </select>
                                <input
                                    type="number"
                                    value={additionalFeeInput}
                                    onChange={(e) => {
                                        const v = e.target.value;
                                        setAdditionalFeeInput(v);
                                        if (v === '' || v === '-') {
                                            setAdditionalFee(0);
                                            return;
                                        }
                                        const n = Number(v);
                                        if (Number.isFinite(n)) setAdditionalFee(n);
                                    }}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                    placeholder="직접입력 추가/차감 금액"
                                />
                                <textarea
                                    value={additionalFeeDetail}
                                    onChange={(e) => setAdditionalFeeDetail(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                    rows={2}
                                    placeholder="추가요금 내역"
                                />
                            </div>

                            <div className="pt-2 border-t text-sm text-gray-700 flex justify-between"><span>추가/차감</span><span>{additionalFee >= 0 ? '+' : ''}{additionalFee.toLocaleString()} VND</span></div>
                            <div className="pt-2 border-t">
                                <div className="text-sm text-gray-700">최종 총 금액</div>
                                <div className="text-2xl font-bold text-green-600">{finalTotal.toLocaleString()} VND</div>
                            </div>
                        </div>

                        <div className="bg-white rounded-lg shadow-sm p-6">
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                            >
                                {saving ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                        저장 중...
                                    </>
                                ) : (
                                    <>
                                        <Save className="w-4 h-4" />
                                        수정사항 저장
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </ManagerLayout>
    );
}

export default function TicketReservationEditPage() {
    return (
        <Suspense
            fallback={
                <ManagerLayout title="🎫 티켓 예약 수정" activeTab="reservation-edit-ticket">
                    <div className="flex justify-center items-center h-64">
                        <div className="text-center">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto" />
                            <p className="mt-4 text-gray-600">페이지를 불러오는 중...</p>
                        </div>
                    </div>
                </ManagerLayout>
            }
        >
            <TicketReservationEditContent />
        </Suspense>
    );
}
