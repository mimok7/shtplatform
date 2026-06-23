'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import supabase from '@/lib/supabase';
import { calculateReservationPricing } from '@/lib/pricing';
import { saveAdditionalFeeTemplateFromInput } from '@/lib/additionalFeeTemplate';
import { recordReservationChange } from '@/lib/reservationChangeTracker';
import ManagerLayout from '../_components/MobileReservationLayout';
import StepperNumberInput from '../_components/StepperNumberInput';
import {
    ArrowLeft,
    Calendar,
    FileText,
    Mail,
    Phone,
    Save,
    User,
    Users,
} from 'lucide-react';

type TicketPriceItem = 'adult' | 'child_under_1_2m' | 'shuttle';
type PriceChannel = 'official' | 'card' | 'krw';

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
    adult_count?: number | null;
    child_count?: number | null;
    shuttle_count?: number | null;
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

const PRICE_ITEM_LABEL: Record<TicketPriceItem, string> = {
    adult: '성인',
    child_under_1_2m: '아동(1.2m 미만)',
    shuttle: '셔틀',
};

const PRICE_CHANNEL_LABEL: Record<PriceChannel, string> = {
    official: '공식가 (VND)',
    card: '스테이카드가 (VND)',
    krw: '스테이크루즈가 (KRW)',
};

function TicketReservationEditContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const reservationId = searchParams.get('id');

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
        ticket_quantity: 1,
        adult_count: 1,
        child_count: 0,
        shuttle_count: 0,
        usage_date: '',
        shuttle_required: false,
        pickup_location: '',
        dropoff_location: '',
        ticket_price_item: 'adult' as TicketPriceItem,
        price_channel: 'card' as PriceChannel,
        ticket_price_code: '',
        unit_price: 0,
        total_price: 0,
        request_note: '',
    });

    const applyAdditionalFeeValue = (nextValue: number) => {
        setAdditionalFee(nextValue);
        setAdditionalFeeInput(nextValue === 0 ? '' : String(nextValue));
    };

    const ticketFinalTotal = Math.max(0, (formData.total_price || 0) + additionalFee);
    const todayText = useState(() => new Date().toISOString().slice(0, 10))[0];

    const getUnitByChannel = (option: TicketPriceOption, channel: PriceChannel) => {
        if (channel === 'official') return Number(option.official_price_vnd || 0);
        if (channel === 'krw') return Number(option.stay_krw_price_krw || 0);
        return Number(option.stay_card_price_vnd || 0);
    };

    const findTicketPriceOption = (
        ticketType: string,
        priceItem: TicketPriceItem,
        effectiveDate: string,
    ) => {
        return ticketPriceOptions
            .filter((option) => {
                if (option.ticket_type !== ticketType) return false;
                if (option.price_item !== priceItem) return false;
                if (option.valid_from > effectiveDate) return false;
                if (option.valid_to && option.valid_to < effectiveDate) return false;
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

    const resolveTicketPricing = (base: typeof formData) => {
        const effectiveDate = base.usage_date || todayText;
        const adultCount = Math.max(0, Number(base.adult_count || 0));
        const childCount = Math.max(0, Number(base.child_count || 0));
        const ticketQuantity = adultCount + childCount;
        const shuttleCount = base.shuttle_required ? ticketQuantity : 0;

        const adultOption = findTicketPriceOption(base.ticket_type, 'adult', effectiveDate);
        const childOption = findTicketPriceOption(base.ticket_type, 'child_under_1_2m', effectiveDate);
        const shuttleOption = findTicketPriceOption(base.ticket_type, 'shuttle', effectiveDate);

        const adultUnit = adultOption ? getUnitByChannel(adultOption, base.price_channel) : 0;
        const childUnit = childOption ? getUnitByChannel(childOption, base.price_channel) : 0;
        const shuttleUnit = shuttleOption ? getUnitByChannel(shuttleOption, base.price_channel) : 0;

        const adultTotal = adultUnit * adultCount;
        const childTotal = childUnit * childCount;
        const shuttleTotal = shuttleUnit * shuttleCount;
        const total = adultTotal + childTotal + shuttleTotal;
        const unit = ticketQuantity > 0 ? total / ticketQuantity : 0;

        const resolvedItem: TicketPriceItem =
            adultCount > 0 ? 'adult' : childCount > 0 ? 'child_under_1_2m' : base.shuttle_required ? 'shuttle' : 'adult';

        const resolvedCode =
            (adultCount > 0 ? adultOption?.ticket_price_code : null) ||
            (childCount > 0 ? childOption?.ticket_price_code : null) ||
            (base.shuttle_required ? shuttleOption?.ticket_price_code : null) ||
            '';

        return {
            ...base,
            ticket_quantity: ticketQuantity,
            adult_count: adultCount,
            child_count: childCount,
            shuttle_count: shuttleCount,
            ticket_price_item: resolvedItem,
            ticket_price_code: resolvedCode,
            ticket_name:
                base.ticket_name ||
                (adultCount > 0 ? adultOption?.ticket_name : null) ||
                (childCount > 0 ? childOption?.ticket_name : null) ||
                (base.shuttle_required ? shuttleOption?.ticket_name : null) ||
                '',
            unit_price: unit,
            total_price: total,
        };
    };

    useEffect(() => {
        if (reservationId) {
            void loadReservation();
        } else {
            router.push('/reservation-edit');
        }
    }, [reservationId]);

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

        const next = resolveTicketPricing(formData);
        const changed =
            next.ticket_price_item !== formData.ticket_price_item ||
            next.ticket_price_code !== formData.ticket_price_code ||
            next.ticket_name !== formData.ticket_name ||
            next.unit_price !== formData.unit_price ||
            next.total_price !== formData.total_price;

        if (changed) {
            setFormData(next);
        }

        const adultOption = findTicketPriceOption(next.ticket_type, 'adult', next.usage_date || todayText);
        const childOption = findTicketPriceOption(next.ticket_type, 'child_under_1_2m', next.usage_date || todayText);
        const shuttleOption = findTicketPriceOption(next.ticket_type, 'shuttle', next.usage_date || todayText);
        const hasRequiredPrice = (!!adultOption || next.adult_count === 0) && (!!childOption || next.child_count === 0) && (!!shuttleOption || !next.shuttle_required);

        if (hasRequiredPrice) {
            setPriceInfoText(
                `성인 ${next.adult_count}명 / 아동 ${next.child_count}명 / 셔틀 ${next.shuttle_required ? '사용' : '미사용'} / ${PRICE_CHANNEL_LABEL[next.price_channel]}`,
            );
        } else {
            setPriceInfoText('선택 조건과 일치하는 요금표가 없습니다');
        }
    }, [
        formData.ticket_type,
        formData.adult_count,
        formData.child_count,
        formData.usage_date,
        formData.shuttle_required,
        formData.price_channel,
        ticketPriceOptions,
    ]);

    const loadReservation = async () => {
        try {
            setLoading(true);

            const { data: resRow, error: resErr } = await supabase
                .from('reservation')
                .select('re_id, re_type, re_status, re_created_at, re_quote_id, re_user_id, manual_additional_fee, manual_additional_fee_detail')
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
                if (userRow) {
                    customerInfo = { ...customerInfo, ...userRow, phone: userRow.phone_number };
                }
            }

            const { data: ticketRow, error: ticketErr } = await supabase
                .from('reservation_ticket')
                .select('*')
                .eq('reservation_id', reservationId)
                .limit(1)
                .maybeSingle();

            if (ticketErr) {
                console.warn('⚠️ 티켓 상세 조회 실패:', ticketErr);
            }

            let quoteInfo = null as { title: string } | null;
            if (resRow.re_quote_id) {
                const { data: q } = await supabase
                    .from('quote')
                    .select('title')
                    .eq('id', resRow.re_quote_id)
                    .single();
                quoteInfo = q || null;
            }

            const fullReservation: TicketReservation = {
                reservation_id: reservationId!,
                ticket_type: ticketRow?.ticket_type || 'dragon',
                ticket_name: ticketRow?.ticket_name || '',
                program_selection: ticketRow?.program_selection || '',
                ticket_quantity: ticketRow?.ticket_quantity || 1,
                adult_count: ticketRow?.adult_count ?? ticketRow?.ticket_quantity ?? 1,
                child_count: ticketRow?.child_count ?? 0,
                shuttle_count: ticketRow?.shuttle_count ?? (ticketRow?.shuttle_required ? ticketRow?.ticket_quantity || 1 : 0),
                usage_date: ticketRow?.usage_date || '',
                shuttle_required: !!ticketRow?.shuttle_required,
                pickup_location: ticketRow?.pickup_location || '',
                dropoff_location: ticketRow?.dropoff_location || '',
                unit_price: ticketRow?.unit_price || 0,
                total_price: ticketRow?.total_price || 0,
                request_note: ticketRow?.request_note || '',
                ticket_price_code: ticketRow?.ticket_price_code || '',
                ticket_price_item: ticketRow?.ticket_price_item || (ticketRow?.shuttle_required ? 'shuttle' : 'adult'),
                price_channel: ticketRow?.price_channel || 'card',
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

            setReservation(fullReservation);
            setFormData({
                ticket_type: fullReservation.ticket_type || 'dragon',
                ticket_name: fullReservation.ticket_name || '',
                program_selection: fullReservation.program_selection || '',
                ticket_quantity: Number(fullReservation.ticket_quantity || 1),
                adult_count: Number(fullReservation.adult_count ?? fullReservation.ticket_quantity ?? 1),
                child_count: Number(fullReservation.child_count ?? 0),
                shuttle_count: Number(fullReservation.shuttle_count ?? (fullReservation.shuttle_required ? fullReservation.ticket_quantity || 1 : 0)),
                usage_date: fullReservation.usage_date || '',
                shuttle_required: !!fullReservation.shuttle_required,
                pickup_location: fullReservation.pickup_location || '',
                dropoff_location: fullReservation.dropoff_location || '',
                ticket_price_item: (fullReservation.ticket_price_item || (fullReservation.shuttle_required ? 'shuttle' : 'adult')) as TicketPriceItem,
                price_channel: (fullReservation.price_channel || 'card') as PriceChannel,
                ticket_price_code: fullReservation.ticket_price_code || '',
                unit_price: Number(fullReservation.unit_price || 0),
                total_price: Number(fullReservation.total_price || 0),
                request_note: fullReservation.request_note || '',
            });
            applyAdditionalFeeValue(Number(resRow.manual_additional_fee || 0));
            setAdditionalFeeDetail(String(resRow.manual_additional_fee_detail || ''));
        } catch (error) {
            console.error('❌ 티켓 예약 로드 실패:', error);
            alert('티켓 예약 정보를 불러오는데 실패했습니다.');
            router.push('/reservation-edit');
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!reservationId) return;

        try {
            setSaving(true);

            const payload = {
                ticket_type: formData.ticket_type,
                ticket_name: formData.ticket_name || null,
                program_selection: formData.program_selection || null,
                ticket_quantity: formData.ticket_quantity,
                adult_count: formData.adult_count,
                child_count: formData.child_count,
                shuttle_count: formData.shuttle_count,
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
                        code: formData.ticket_price_code || formData.ticket_name || formData.program_selection || null,
                        unit_price: findTicketPriceOption(formData.ticket_type, 'adult', formData.usage_date || todayText)
                            ? getUnitByChannel(findTicketPriceOption(formData.ticket_type, 'adult', formData.usage_date || todayText)!, formData.price_channel)
                            : 0,
                        quantity: formData.adult_count,
                        total:
                            (findTicketPriceOption(formData.ticket_type, 'adult', formData.usage_date || todayText)
                                ? getUnitByChannel(findTicketPriceOption(formData.ticket_type, 'adult', formData.usage_date || todayText)!, formData.price_channel)
                                : 0) * formData.adult_count,
                        metadata: {
                            ticket_type: formData.ticket_type,
                            ticket_price_item: formData.ticket_price_item,
                            price_channel: formData.price_channel,
                            ticket_price_code: formData.ticket_price_code || null,
                            adult_count: formData.adult_count,
                            child_count: formData.child_count,
                            shuttle_count: formData.shuttle_count,
                            usage_date: formData.usage_date || null,
                            shuttle_required: formData.shuttle_required,
                            pickup_location: formData.pickup_location || null,
                            dropoff_location: formData.dropoff_location || null,
                        },
                    },
                    {
                        label: '티켓(아동)',
                        code: findTicketPriceOption(formData.ticket_type, 'child_under_1_2m', formData.usage_date || todayText)?.ticket_price_code || null,
                        unit_price: findTicketPriceOption(formData.ticket_type, 'child_under_1_2m', formData.usage_date || todayText)
                            ? getUnitByChannel(findTicketPriceOption(formData.ticket_type, 'child_under_1_2m', formData.usage_date || todayText)!, formData.price_channel)
                            : 0,
                        quantity: formData.child_count,
                        total:
                            (findTicketPriceOption(formData.ticket_type, 'child_under_1_2m', formData.usage_date || todayText)
                                ? getUnitByChannel(findTicketPriceOption(formData.ticket_type, 'child_under_1_2m', formData.usage_date || todayText)!, formData.price_channel)
                                : 0) * formData.child_count,
                    },
                    ...(formData.shuttle_required
                        ? [
                            {
                                label: '티켓(셔틀)',
                                code: findTicketPriceOption(formData.ticket_type, 'shuttle', formData.usage_date || todayText)?.ticket_price_code || null,
                                unit_price: findTicketPriceOption(formData.ticket_type, 'shuttle', formData.usage_date || todayText)
                                    ? getUnitByChannel(findTicketPriceOption(formData.ticket_type, 'shuttle', formData.usage_date || todayText)!, formData.price_channel)
                                    : 0,
                                quantity: formData.shuttle_count,
                                total:
                                    (findTicketPriceOption(formData.ticket_type, 'shuttle', formData.usage_date || todayText)
                                        ? getUnitByChannel(findTicketPriceOption(formData.ticket_type, 'shuttle', formData.usage_date || todayText)!, formData.price_channel)
                                        : 0) * formData.shuttle_count,
                            },
                        ]
                        : []),
                ],
                metadata: {
                    request_note: formData.request_note || null,
                },
            });

            const { data: updatedData, error: updateError } = await supabase
                .from('reservation_ticket')
                .update(payload)
                .eq('reservation_id', reservationId)
                .select();

            if (updateError) throw updateError;

            if (!updatedData || updatedData.length === 0) {
                const { error: insertError } = await supabase
                    .from('reservation_ticket')
                    .insert({
                        reservation_id: reservationId,
                        ...payload,
                    });
                if (insertError) throw insertError;
            }

            const { error: reservationError } = await supabase
                .from('reservation')
                .update({
                    total_amount: pricing.total_amount,
                    pax_count: formData.ticket_quantity || 0,
                    re_adult_count: formData.adult_count || 0,
                    re_child_count: formData.child_count || 0,
                    reservation_date: formData.usage_date || null,
                    price_breakdown: pricing.price_breakdown,
                    manual_additional_fee: additionalFee,
                    manual_additional_fee_detail: additionalFeeDetail || null,
                    re_update_at: new Date().toISOString(),
                })
                .eq('re_id', reservationId);

            if (reservationError) {
                console.error('⚠️ 예약 테이블 동기화 실패:', reservationError);
            }

            await saveAdditionalFeeTemplateFromInput({
                serviceType: 'ticket',
                detail: additionalFeeDetail,
                amount: additionalFee,
            });

            try {
                await recordReservationChange({
                    reservationId,
                    reType: 'ticket' as any,
                    rows: {
                        ticket: [
                            {
                                reservation_id: reservationId,
                                ...payload,
                            },
                        ],
                    } as any,
                    managerNote: '티켓 예약 매니저 직접 수정',
                    snapshotData: {
                        price_breakdown: pricing.price_breakdown,
                        total_amount: pricing.total_amount,
                        manual_additional_fee: additionalFee,
                    },
                });
            } catch (trackErr) {
                console.warn('⚠️ 변경 추적 기록 실패(저장은 계속):', trackErr);
            }

            alert('티켓 예약이 성공적으로 수정되었습니다.');
            router.refresh();
            await loadReservation();
        } catch (error) {
            console.error('❌ 티켓 저장 실패:', error);
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
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
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
                    <p className="text-gray-600 mb-4">요청하신 티켓 예약 정보를 찾을 수 없습니다.</p>
                    <button
                        onClick={() => router.push('/reservation-edit')}
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
                <div className="grid grid-cols-1 gap-6">
                    <div className="space-y-6">
                        <div className="bg-white rounded-lg shadow-sm p-4">
                            <h3 className="text-base font-medium text-gray-900 mb-4 flex items-center gap-2">
                                <User className="w-4 h-4" />
                                고객 정보
                            </h3>
                            <div className="space-y-2 text-sm text-gray-700">
                                <div className="flex items-center gap-2"><User className="w-4 h-4 text-gray-400" /> {reservation.reservation.users.name}</div>
                                <div className="flex items-center gap-2 break-all"><Mail className="w-4 h-4 text-gray-400" /> {reservation.reservation.users.email || '이메일 없음'}</div>
                                <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-gray-400" /> {reservation.reservation.users.phone || '전화번호 없음'}</div>
                            </div>
                        </div>

                        <div className="bg-white rounded-lg shadow-sm p-4">
                            <h3 className="text-base font-medium text-gray-900 mb-4">티켓 예약 정보</h3>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">티켓 유형</label>
                                    <select
                                        value={formData.ticket_type}
                                        onChange={(e) => setFormData((prev) => ({ ...prev, ticket_type: e.target.value }))}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    >
                                        <option value="dragon">드래곤펄</option>
                                        <option value="onsen">요코온센</option>
                                        <option value="other">기타</option>
                                    </select>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">요금 채널</label>
                                        <select
                                            value={formData.price_channel}
                                            onChange={(e) => setFormData((prev) => ({ ...prev, price_channel: e.target.value as PriceChannel }))}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                        >
                                            <option value="card">스테이카드가 (VND)</option>
                                            <option value="official">공식가 (VND)</option>
                                            <option value="krw">스테이크루즈가 (KRW)</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">성인 인원</label>
                                        <StepperNumberInput
                                            value={formData.adult_count}
                                            min={0}
                                            max={50}
                                            onChange={(value) => setFormData((prev) => ({ ...prev, adult_count: value }))}
                                            className="w-full"
                                            inputClassName="text-sm"
                                            ariaLabel="성인 인원"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">아동 인원</label>
                                        <StepperNumberInput
                                            value={formData.child_count}
                                            min={0}
                                            max={50}
                                            onChange={(value) => setFormData((prev) => ({ ...prev, child_count: value }))}
                                            className="w-full"
                                            inputClassName="text-sm"
                                            ariaLabel="아동 인원"
                                        />
                                    </div>
                                </div>

                                <div className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-700">
                                    요금표 매칭: {priceInfoText || '매칭 없음'}
                                    <div className="text-xs text-blue-600 mt-1">코드: {formData.ticket_price_code || '미매칭'}</div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        <Calendar className="inline w-4 h-4 mr-1" />
                                        사용일
                                    </label>
                                    <input
                                        type="date"
                                        value={formData.usage_date}
                                        onChange={(e) => setFormData((prev) => ({ ...prev, usage_date: e.target.value }))}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">티켓명</label>
                                    <input
                                        type="text"
                                        value={formData.ticket_name}
                                        onChange={(e) => setFormData((prev) => ({ ...prev, ticket_name: e.target.value }))}
                                        placeholder="예: 요코온센 입장권"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">프로그램 선택</label>
                                    <input
                                        type="text"
                                        value={formData.program_selection}
                                        onChange={(e) => setFormData((prev) => ({ ...prev, program_selection: e.target.value }))}
                                        placeholder="예: 오후권"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    />
                                </div>

                                <div className="border border-gray-300 rounded-lg p-3 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                                    <label className="text-sm font-medium text-gray-700 inline-flex items-center gap-1">
                                        <Users className="w-4 h-4" />
                                        총 인원
                                    </label>
                                    <input
                                        type="number"
                                        value={formData.ticket_quantity}
                                        readOnly
                                        className="w-full max-w-[160px] px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-700 text-sm"
                                    />
                                </div>

                                {formData.shuttle_required && (
                                    <div className="border border-gray-300 rounded-lg p-3 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                                        <label className="text-sm font-medium text-gray-700 inline-flex items-center gap-1">셔틀 인원</label>
                                        <StepperNumberInput
                                            value={formData.shuttle_count}
                                            min={0}
                                            max={50}
                                            onChange={(value) => setFormData((prev) => ({ ...prev, shuttle_count: value }))}
                                            className="w-full max-w-[160px]"
                                            inputClassName="text-sm"
                                            ariaLabel="셔틀 인원"
                                        />
                                    </div>
                                )}

                                <div className="flex items-center gap-2">
                                    <input
                                        id="ticket-shuttle-required"
                                        type="checkbox"
                                        checked={formData.shuttle_required}
                                        onChange={(e) => setFormData((prev) => ({ ...prev, shuttle_required: e.target.checked }))}
                                        className="w-4 h-4"
                                    />
                                    <label htmlFor="ticket-shuttle-required" className="text-sm font-medium text-gray-700">셔틀 이용</label>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">픽업 위치</label>
                                    <input
                                        type="text"
                                        value={formData.pickup_location}
                                        onChange={(e) => setFormData((prev) => ({ ...prev, pickup_location: e.target.value }))}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">드롭오프 위치</label>
                                    <input
                                        type="text"
                                        value={formData.dropoff_location}
                                        onChange={(e) => setFormData((prev) => ({ ...prev, dropoff_location: e.target.value }))}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">단가</label>
                                    <input
                                        type="number"
                                        value={formData.unit_price}
                                        readOnly
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-700"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">총 금액</label>
                                    <input
                                        type="number"
                                        value={formData.total_price}
                                        readOnly
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 font-bold text-green-600"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">요청사항</label>
                                    <textarea
                                        rows={3}
                                        value={formData.request_note}
                                        onChange={(e) => setFormData((prev) => ({ ...prev, request_note: e.target.value }))}
                                        placeholder="티켓 관련 요청사항을 입력하세요"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div className="bg-white rounded-lg shadow-sm p-4">
                            <h3 className="text-base font-medium text-gray-900 mb-4">요금/추가내역</h3>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">추가내역 선택</label>
                                    <select
                                        title="추가내역 선택"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
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
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">직접입력 추가/차감 금액 (VND)</label>
                                    <input
                                        type="number"
                                        value={additionalFeeInput}
                                        onChange={(e) => {
                                            const nextValue = e.target.value;
                                            setAdditionalFeeInput(nextValue);

                                            if (nextValue === '' || nextValue === '-') {
                                                setAdditionalFee(0);
                                                return;
                                            }

                                            const parsedValue = Number(nextValue);
                                            if (Number.isFinite(parsedValue)) {
                                                setAdditionalFee(parsedValue);
                                            }
                                        }}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">추가요금 내역</label>
                                    <textarea
                                        value={additionalFeeDetail}
                                        onChange={(e) => setAdditionalFeeDetail(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                        rows={2}
                                        placeholder="추가요금 사유 또는 내역을 입력하세요"
                                    />
                                </div>

                                {(formData.total_price > 0 || additionalFee !== 0) && (
                                    <div className="pt-3 border-t border-gray-100 space-y-2">
                                        <div className="flex justify-between text-sm text-gray-700">
                                            <span>기본 티켓 금액</span>
                                            <span className="font-semibold">{formData.total_price.toLocaleString()}동</span>
                                        </div>
                                        <div className="text-xs text-gray-500">
                                            성인 {formData.adult_count}명, 아동 {formData.child_count}명{formData.shuttle_required ? `, 셔틀 ${formData.shuttle_count}명` : ''}
                                        </div>
                                        <div className={`flex justify-between text-sm ${additionalFee >= 0 ? 'text-orange-600' : 'text-red-600'}`}>
                                            <span>{additionalFee >= 0 ? '추가요금' : '차감금액'}</span>
                                            <span className="font-semibold">{additionalFee > 0 ? '+' : ''}{additionalFee.toLocaleString()}동</span>
                                        </div>
                                        <div className="pt-2 border-t border-gray-200">
                                            <label className="block text-sm font-medium text-gray-700">최종 총 금액</label>
                                            <div className="text-xl font-bold text-green-600">{ticketFinalTotal.toLocaleString()}동</div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="bg-white rounded-lg shadow-sm p-4 space-y-3 text-sm text-gray-700">
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-gray-500">예약 상태</span>
                                <span className="font-medium">{reservation.reservation.re_status}</span>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-gray-500">예약일</span>
                                <span className="font-medium">{new Date(reservation.reservation.re_created_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}</span>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-gray-500">여행명</span>
                                <span className="font-medium text-right break-all">{reservation.reservation.quote?.title || '제목 없음'}</span>
                            </div>
                        </div>

                        <div className="bg-white rounded-lg shadow-sm p-4">
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {saving ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
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
        <Suspense fallback={
            <ManagerLayout title="🎫 티켓 예약 수정" activeTab="reservation-edit-ticket">
                <div className="flex justify-center items-center h-64">
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
                        <p className="mt-4 text-gray-600">페이지를 불러오는 중...</p>
                    </div>
                </div>
            </ManagerLayout>
        }>
            <TicketReservationEditContent />
        </Suspense>
    );
}
