'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import supabase from '@/lib/supabase';
import { saveAdditionalFeeTemplateFromInput } from '@/lib/additionalFeeTemplate';
import { recordReservationChange } from '@/lib/reservationChangeTracker';
import { calculateReservationPricing } from '@sht/domain/pricing';
import ManagerLayout from '@/components/ManagerLayout';
import {
    Save,
    ArrowLeft,
    Calendar,
    Car,
    MapPin,
    Users,
    User,
    Phone,
    Mail,
    Clock
} from 'lucide-react';

interface RentcarReservation {
    id?: string;
    reservation_id: string;
    rentcar_price_code: string;
    pickup_datetime: string;
    pickup_location: string;
    route: string;
    destination: string;
    via_location: string;
    via_waiting: string;
    car_count: number;
    passenger_count?: number;
    unit_price: number;
    total_price: number;
    request_note: string;
    way_type: string;
    return_datetime: string;
    return_pickup_location: string;
    return_destination: string;
    return_via_location: string;
    return_via_waiting: string;
    // 추가 정보
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
    rentcar_price: {
        rent_code: string;
        vehicle_type: string;
        capacity: number;
        description: string;
        route?: string;
        way_type?: string;
        price: number;
    } | null;
}

type RentcarWayKey = 'pickup' | 'sending';

function normalizeRentcarWayType(wayType?: string | null): RentcarWayKey {
    const raw = String(wayType || '').trim().toLowerCase();
    if (raw === 'sending' || raw === '샌딩') return 'sending';
    return 'pickup';
}

function RentcarReservationEditContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const reservationId = searchParams.get('id');

    const [reservation, setReservation] = useState<RentcarReservation | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [additionalFee, setAdditionalFee] = useState(0);
    const [additionalFeeDetail, setAdditionalFeeDetail] = useState('');
    const [feeTemplates, setFeeTemplates] = useState<{ id: number; name: string; amount: number }[]>([]);
    const [formData, setFormData] = useState({
        pickup_datetime: '',
        pickup_location: '',
        route: '',
        destination: '',
        via_location: '',
        via_waiting: '',
        car_count: 0,
        rental_days: 0,
        driver_count: 0,
        unit_price: 0,
        total_price: 0,
        request_note: '',
        way_type: '',
        return_datetime: '',
        return_pickup_location: '',
        return_destination: '',
        return_via_location: '',
        return_via_waiting: ''
    });
    const hasPickupSectionData = Boolean(
        formData.pickup_datetime ||
        formData.pickup_location ||
        formData.destination ||
        formData.via_location ||
        formData.via_waiting
    );
    const hasSendingSectionData = Boolean(
        formData.return_datetime ||
        formData.return_pickup_location ||
        formData.return_destination ||
        formData.return_via_location ||
        formData.return_via_waiting
    );
    const rentcarFinalTotal = (formData.total_price || 0) + additionalFee;

    const toInputDateTime = (value?: string | null) => {
        if (!value) return '';
        const raw = String(value).trim();
        if (!raw) return '';

        const hasTimezone = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(raw);
        if (!hasTimezone) {
            return raw.replace(' ', 'T').slice(0, 16);
        }

        const d = new Date(raw);
        if (Number.isNaN(d.getTime())) {
            return raw.replace(' ', 'T').slice(0, 16);
        }

        const parts = new Intl.DateTimeFormat('sv-SE', {
            timeZone: 'Asia/Seoul',
            hour12: false,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        }).formatToParts(d);

        const pick = (type: string) => parts.find(p => p.type === type)?.value || '';
        return `${pick('year')}-${pick('month')}-${pick('day')}T${pick('hour')}:${pick('minute')}`;
    };

    const toDbDateTimeKst = (value?: string | null): string | null => {
        if (!value) return null;
        const v = String(value).trim();
        if (!v) return null;

        const normalized = v.replace(' ', 'T');
        if (/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}$/.test(normalized)) {
            return `${normalized}:00+09:00`;
        }
        return normalized;
    };

    useEffect(() => {
        if (reservationId) {
            loadReservation();
        } else {
            router.push('/manager/reservation-edit');
        }
    }, [reservationId]);

    useEffect(() => {
        supabase
            .from('additional_fee_template')
            .select('id, name, amount')
            .or('service_type.is.null,service_type.eq.rentcar')
            .eq('is_active', true)
            .order('sort_order')
            .then(({ data }) => { if (data) setFeeTemplates(data); });
    }, []);

    const loadReservation = async () => {
        try {
            console.log('🔄 렌터카 예약 데이터 로드 시작...', reservationId);
            setLoading(true);

            // 1) 예약 기본 정보 조회
            const { data: resRow, error: resErr } = await supabase
                .from('reservation')
                .select('re_id, re_type, re_status, re_created_at, re_quote_id, re_user_id, manual_additional_fee, manual_additional_fee_detail')
                .eq('re_id', reservationId)
                .single();

            if (resErr || !resRow) throw resErr || new Error('예약 기본 정보 접근 실패');

            // 2) 고객 정보 조회
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

            // 3) 서비스 상세 (렌터카)
            const { data: rentcarRow, error: rentcarErr } = await supabase
                .from('reservation_rentcar')
                .select('*')
                .eq('reservation_id', reservationId)
                .limit(1)
                .maybeSingle();

            if (rentcarErr) {
                console.warn('⚠️ 렌터카 예약 상세 조회 실패:', rentcarErr);
            }

            // 4) 견적 타이틀
            let quoteInfo = null as { title: string } | null;
            if (resRow.re_quote_id) {
                const { data: q, error: qErr } = await supabase
                    .from('quote')
                    .select('title')
                    .eq('id', resRow.re_quote_id)
                    .single();
                if (!qErr && q) quoteInfo = q;
            }

            // 5) 가격 정보
            let rentcarPriceInfo = null as any;
            if (rentcarRow?.rentcar_price_code) {
                const { data: rp, error: rpErr } = await supabase
                    .from('rentcar_price')
                    .select('rent_code, vehicle_type, capacity, route, way_type, price, description')
                    .eq('rent_code', rentcarRow.rentcar_price_code)
                    .single();
                if (!rpErr) rentcarPriceInfo = rp;
            }

            const defaultRentcarInfo = {
                reservation_id: reservationId,
                rentcar_price_code: '',
                pickup_datetime: '',
                destination: '',
                car_count: 0,
                unit_price: 0,
                total_price: 0,
                request_note: ''
            };

            const fullReservation: RentcarReservation = {
                ...(rentcarRow || defaultRentcarInfo),
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
                rentcar_price: rentcarPriceInfo,
            };

            setReservation(fullReservation);
            setFormData({
                pickup_datetime: toInputDateTime(rentcarRow?.pickup_datetime),
                pickup_location: rentcarRow?.pickup_location || '',
                route: rentcarRow?.route || rentcarPriceInfo?.route || '',
                destination: rentcarRow?.destination || '',
                via_location: rentcarRow?.via_location || '',
                via_waiting: rentcarRow?.via_waiting || '',
                car_count: rentcarRow?.car_count || 1,
                rental_days: 1,
                driver_count: rentcarRow?.passenger_count || 0,
                unit_price: rentcarRow?.unit_price || rentcarPriceInfo?.price || 0,
                total_price: rentcarRow?.total_price || (rentcarRow?.car_count * (rentcarRow?.unit_price || rentcarPriceInfo?.price || 0)) || 0,
                request_note: rentcarRow?.request_note || '',
                way_type: rentcarRow?.way_type || '',
                return_datetime: toInputDateTime(rentcarRow?.return_datetime),
                return_pickup_location: rentcarRow?.return_pickup_location || '',
                return_destination: rentcarRow?.return_destination || '',
                return_via_location: rentcarRow?.return_via_location || '',
                return_via_waiting: rentcarRow?.return_via_waiting || ''
            });
            setAdditionalFee(Number(resRow.manual_additional_fee || 0));
            setAdditionalFeeDetail(String(resRow.manual_additional_fee_detail || ''));

        } catch (error) {
            console.error('❌ 렌터카 예약 로드 실패:', error);
            alert('렌터카 예약 정보를 불러오는데 실패했습니다.');
            router.push('/manager/reservation-edit');
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteWay = async (way: RentcarWayKey) => {
        const label = way === 'pickup' ? '픽업' : '샌딩';
        if (!window.confirm(`${label} 정보만 삭제하시겠습니까?`)) return;

        try {
            setSaving(true);

            const { data: rentcarRows, error: rowsError } = await supabase
                .from('reservation_rentcar')
                .select('id, reservation_id, way_type, pickup_datetime, pickup_location, destination, via_location, via_waiting, total_price, return_datetime, return_pickup_location, return_destination, return_via_location, return_via_waiting')
                .eq('reservation_id', reservationId)
                .order('created_at', { ascending: true });

            if (rowsError) throw rowsError;

            const rows = (rentcarRows || []) as Array<Record<string, any>>;
            const pickupRow = rows.find((row) => normalizeRentcarWayType(row.way_type) === 'pickup') || rows[0] || null;
            const sendingRow = rows.find((row) => normalizeRentcarWayType(row.way_type) === 'sending') || null;
            const hasEmbeddedSending = Boolean(
                pickupRow && (
                    pickupRow.return_datetime ||
                    pickupRow.return_pickup_location ||
                    pickupRow.return_destination ||
                    pickupRow.return_via_location ||
                    pickupRow.return_via_waiting
                )
            );

            if (way === 'sending') {
                if (sendingRow && sendingRow.id !== pickupRow?.id) {
                    const { error: deleteSendingError } = await supabase
                        .from('reservation_rentcar')
                        .delete()
                        .eq('id', sendingRow.id);
                    if (deleteSendingError) throw deleteSendingError;
                } else if (pickupRow?.id && hasEmbeddedSending) {
                    const { error: clearSendingError } = await supabase
                        .from('reservation_rentcar')
                        .update({
                            return_datetime: null,
                            return_pickup_location: null,
                            return_destination: null,
                            return_via_location: null,
                            return_via_waiting: null,
                        })
                        .eq('id', pickupRow.id);
                    if (clearSendingError) throw clearSendingError;
                } else {
                    alert('삭제할 샌딩 정보가 없습니다.');
                    return;
                }
            } else {
                if (pickupRow?.id && sendingRow && sendingRow.id !== pickupRow.id) {
                    const { error: deletePickupError } = await supabase
                        .from('reservation_rentcar')
                        .delete()
                        .eq('id', pickupRow.id);
                    if (deletePickupError) throw deletePickupError;
                } else if (pickupRow?.id && hasEmbeddedSending) {
                    const { error: promoteSendingError } = await supabase
                        .from('reservation_rentcar')
                        .update({
                            pickup_datetime: pickupRow.return_datetime,
                            pickup_location: pickupRow.return_pickup_location,
                            destination: pickupRow.return_destination,
                            via_location: pickupRow.return_via_location,
                            via_waiting: pickupRow.return_via_waiting,
                            way_type: 'sending',
                            return_datetime: null,
                            return_pickup_location: null,
                            return_destination: null,
                            return_via_location: null,
                            return_via_waiting: null,
                        })
                        .eq('id', pickupRow.id);
                    if (promoteSendingError) throw promoteSendingError;
                } else if (pickupRow?.id) {
                    const { error: deletePickupOnlyError } = await supabase
                        .from('reservation_rentcar')
                        .delete()
                        .eq('id', pickupRow.id);
                    if (deletePickupOnlyError) throw deletePickupOnlyError;
                } else {
                    alert('삭제할 픽업 정보가 없습니다.');
                    return;
                }
            }

            const { data: remainingRows, error: remainingError } = await supabase
                .from('reservation_rentcar')
                .select('total_price, pickup_datetime')
                .eq('reservation_id', reservationId)
                .order('created_at', { ascending: true });

            if (remainingError) throw remainingError;

            const totalAmount = (remainingRows || []).reduce((sum: number, row: any) => sum + Number(row.total_price || 0), 0);
            const reservationDate = remainingRows?.[0]?.pickup_datetime
                ? String(remainingRows[0].pickup_datetime).split('T')[0]
                : null;

            const { error: reservationError } = await supabase
                .from('reservation')
                .update({
                    total_amount: totalAmount,
                    reservation_date: reservationDate,
                    re_update_at: new Date().toISOString(),
                })
                .eq('re_id', reservationId);

            if (reservationError) {
                console.error('⚠️ 예약 테이블 동기화 실패:', reservationError);
            }

            alert(`${label} 정보가 삭제되었습니다.`);
            router.refresh();

            if (!remainingRows || remainingRows.length === 0) {
                router.push('/manager/reservation-edit');
                return;
            }

            await loadReservation();
        } catch (error) {
            console.error(`❌ ${label} 삭제 오류:`, error);
            alert('삭제 중 오류가 발생했습니다.');
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteReservation = async () => {
        if (!window.confirm('이 렌터카 예약 전체를 삭제하시겠습니까?')) return;

        try {
            setSaving(true);
            const { error: deleteError } = await supabase
                .from('reservation_rentcar')
                .delete()
                .eq('reservation_id', reservationId);

            if (deleteError) throw deleteError;

            alert('렌터카 예약이 삭제되었습니다.');
            router.push('/manager/reservation-edit');
        } catch (error) {
            console.error('❌ 삭제 오류:', error);
            alert('삭제 중 오류가 발생했습니다.');
        } finally {
            setSaving(false);
        }
    };

    const handleSave = async () => {
        if (!reservation) return;

        try {
            setSaving(true);
            console.log('💾 렌터카 예약 수정 저장 시작...');

            const payload = {
                pickup_datetime: toDbDateTimeKst(formData.pickup_datetime),
                pickup_location: formData.pickup_location,
                destination: formData.destination,
                via_location: formData.via_location || null,
                via_waiting: formData.via_waiting || null,
                car_count: formData.car_count,
                passenger_count: formData.driver_count,
                unit_price: formData.unit_price,
                total_price: formData.total_price,
                request_note: formData.request_note,
                way_type: formData.way_type || null,
                return_datetime: toDbDateTimeKst(formData.return_datetime),
                return_pickup_location: formData.return_pickup_location || null,
                return_destination: formData.return_destination || null,
                return_via_location: formData.return_via_location || null,
                return_via_waiting: formData.return_via_waiting || null,
            };
            const pricing = calculateReservationPricing({
                serviceType: 'rentcar',
                baseTotal: formData.total_price,
                additionalFee,
                additionalFeeDetail,
                lineItems: [{
                    label: '렌터카',
                    code: reservation.rentcar_price_code || null,
                    unit_price: formData.unit_price,
                    quantity: formData.car_count || 1,
                    total: formData.total_price || 0,
                    metadata: {
                        route: formData.route || null,
                        way_type: formData.way_type || null,
                        passenger_count: formData.driver_count || 0,
                        pickup_datetime: formData.pickup_datetime || null,
                    },
                }],
                metadata: {
                    pickup_location: formData.pickup_location || null,
                    destination: formData.destination || null,
                    request_note: formData.request_note || null,
                },
            });

            // 1. Update 시도
            const { data: updatedData, error: updateError } = await supabase
                .from('reservation_rentcar')
                .update(payload)
                .eq('reservation_id', reservationId)
                .select();

            if (updateError) throw updateError;

            // 1.5. 메인 예약 테이블 동기화 (총 금액 + 예약일 + 타임스탬프)
            const { error: reservationError } = await supabase
                .from('reservation')
                .update({
                    total_amount: pricing.total_amount,
                    reservation_date: formData.pickup_datetime ? formData.pickup_datetime.split('T')[0] : null,
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
                serviceType: 'rentcar',
                detail: additionalFeeDetail,
                amount: additionalFee,
            });

            // 변경 추적 기록
            try {
                await recordReservationChange({
                    reservationId: reservationId!,
                    reType: 'rentcar',
                    rows: {
                        rentcar: [{
                            rentcar_price_code: reservation.rentcar_price_code || null,
                            car_count: payload.car_count,
                            passenger_count: payload.passenger_count,
                            unit_price: payload.unit_price,
                            total_price: payload.total_price,
                            pickup_datetime: payload.pickup_datetime,
                            pickup_location: payload.pickup_location,
                            destination: payload.destination,
                            via_location: payload.via_location,
                            via_waiting: payload.via_waiting,
                            request_note: payload.request_note,
                            way_type: payload.way_type,
                            return_datetime: payload.return_datetime,
                            return_pickup_location: payload.return_pickup_location,
                            return_destination: payload.return_destination,
                            return_via_location: payload.return_via_location,
                            return_via_waiting: payload.return_via_waiting,
                        }],
                    },
                    managerNote: '렌터카 예약 매니저 직접 수정',
                    snapshotData: {
                        price_breakdown: pricing.price_breakdown,
                        total_amount: pricing.total_amount,
                        manual_additional_fee: additionalFee,
                    },
                });
            } catch (trackErr) {
                console.warn('⚠️ 변경 추적 기록 실패(저장은 계속):', trackErr);
            }

            // 2. Insert fallback
            if (!updatedData || updatedData.length === 0) {
                console.log('⚠️ 기존 데이터 없음, 신규 삽입...');
                const { error: insertError } = await supabase
                    .from('reservation_rentcar')
                    .insert({
                        reservation_id: reservationId,
                        rentcar_price_code: reservation.rentcar_price_code,
                        ...payload
                    });
                if (insertError) throw insertError;
            }

            console.log('✅ 렌터카 예약 수정 완료');
            alert('렌터카 예약이 성공적으로 수정되었습니다.');

            // 데이터 다시 로드 + Next.js 라우터 캐시 무효화 (상세 모달 최신화)
            router.refresh();
            await loadReservation();

        } catch (error) {
            console.error('❌ 저장 오류:', error);
            alert('저장 중 오류가 발생했습니다.');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <ManagerLayout title="🚗 렌터카 예약 수정" activeTab="reservation-edit-rentcar">
                <div className="flex justify-center items-center h-64">
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
                        <p className="mt-4 text-gray-600">렌터카 예약 데이터를 불러오는 중...</p>
                    </div>
                </div>
            </ManagerLayout>
        );
    }

    if (!reservation) {
        return (
            <ManagerLayout title="🚗 렌터카 예약 수정" activeTab="reservation-edit-rentcar">
                <div className="text-center py-12">
                    <Car className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">예약을 찾을 수 없습니다</h3>
                    <p className="text-gray-600 mb-4">요청하신 렌터카 예약 정보를 찾을 수 없습니다.</p>
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
        <ManagerLayout title="🚗 렌터카 예약 수정" activeTab="reservation-edit-rentcar">
            <div className="space-y-6">
                {/* 헤더 */}
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => router.push('/manager/reservation-edit')}
                        className="inline-flex items-center gap-2 px-3 py-2 text-gray-600 hover:text-gray-800 transition-colors"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        예약 목록으로
                    </button>
                    <div>
                        <h1 className="text-xl font-bold text-gray-900">렌터카 예약 수정</h1>
                        <p className="text-sm text-gray-600">예약 ID: {reservation.reservation.re_id}</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* 좌측: 예약 정보 */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* 고객 정보 */}
                        <div className="bg-white rounded-lg shadow-sm p-6">
                            <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
                                <User className="w-5 h-5" />
                                고객 정보
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">이름</label>
                                    <div className="text-gray-900">{reservation.reservation.users.name}</div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">이메일</label>
                                    <div className="text-gray-900 flex items-center gap-2">
                                        <Mail className="w-4 h-4 text-gray-400" />
                                        {reservation.reservation.users.email}
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">전화번호</label>
                                    <div className="text-gray-900 flex items-center gap-2">
                                        <Phone className="w-4 h-4 text-gray-400" />
                                        {reservation.reservation.users.phone}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* 차량 정보 */}
                        <div className="bg-white rounded-lg shadow-sm p-6">
                            <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
                                <Car className="w-5 h-5" />
                                차량 정보
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">차량명</label>
                                    <div className="text-gray-900">
                                        {reservation.rentcar_price?.vehicle_type || reservation.rentcar_price_code}
                                    </div>
                                    {reservation.rentcar_price?.description && (
                                        <div className="text-sm text-gray-600 mt-1">
                                            {reservation.rentcar_price.description}
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">차량 유형</label>
                                    <div className="text-gray-900">
                                        {reservation.rentcar_price?.vehicle_type || '정보 없음'}
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">승차 정원</label>
                                    <div className="text-gray-900 flex items-center gap-2">
                                        <Users className="w-4 h-4 text-gray-400" />
                                        {reservation.rentcar_price?.capacity || 0}명
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">1일 가격</label>
                                    <div className="text-gray-900">
                                        {reservation.rentcar_price?.price?.toLocaleString()}동
                                    </div>
                                </div>
                                {reservation.rentcar_price?.route && (
                                    <div className="md:col-span-2">
                                        <label className="block text-sm font-medium text-gray-700 mb-1">경로</label>
                                        <div className="text-sm text-gray-600">
                                            {reservation.rentcar_price.route}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* 수정 가능한 필드들 */}
                        <div className="bg-white rounded-lg shadow-sm p-6">
                            <h3 className="text-lg font-medium text-gray-900 mb-4">예약 세부사항 수정</h3>
                            <div className="mb-4 flex gap-2 flex-wrap">
                                <button
                                    type="button"
                                    onClick={() => handleDeleteWay('pickup')}
                                    disabled={saving || !hasPickupSectionData}
                                    className="px-3 py-1.5 rounded-lg border border-red-200 bg-red-50 text-red-600 text-sm hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    픽업 삭제
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleDeleteWay('sending')}
                                    disabled={saving || !hasSendingSectionData}
                                    className="px-3 py-1.5 rounded-lg border border-red-200 bg-red-50 text-red-600 text-sm hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    샌딩 삭제
                                </button>
                            </div>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        <Clock className="inline w-4 h-4 mr-1" />
                                        픽업 일시
                                    </label>
                                    <input
                                        type="datetime-local"
                                        value={formData.pickup_datetime}
                                        onChange={(e) => setFormData(prev => ({
                                            ...prev,
                                            pickup_datetime: e.target.value
                                        }))}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    />
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            <MapPin className="inline w-4 h-4 mr-1" />
                                            픽업 위치 (출발지)
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.pickup_location}
                                            onChange={(e) => setFormData(prev => ({ ...prev, pickup_location: e.target.value }))}
                                            placeholder="예: 하노이 호텔, 공항 이름 등"
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            <MapPin className="inline w-4 h-4 mr-1" />
                                            목적지
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.destination}
                                            onChange={(e) => setFormData(prev => ({
                                                ...prev,
                                                destination: e.target.value
                                            }))}
                                            placeholder="예: 하롱베이, 사파, 닌빈 등"
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        경로
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.route}
                                        onChange={(e) => setFormData(prev => ({
                                            ...prev,
                                            route: e.target.value
                                        }))}
                                        placeholder="예: 하노이 - 하롱베이"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    />
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            경유지
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.via_location}
                                            onChange={(e) => setFormData(prev => ({ ...prev, via_location: e.target.value }))}
                                            placeholder="경유지 (없으면 빈칸)"
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            경유 대기시간
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.via_waiting}
                                            onChange={(e) => setFormData(prev => ({ ...prev, via_waiting: e.target.value }))}
                                            placeholder="예: 1시간, 30분"
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                        />
                                    </div>
                                </div>

                                {/* 오는 편 (샌딩) 섹션 */}
                                <div className="border-t border-orange-200 pt-4 mt-2">
                                    <h4 className="text-sm font-semibold text-orange-700 mb-3 flex items-center gap-1">
                                        🔄 오는 편 (샌딩)
                                        <span className="text-xs text-gray-500 font-normal ml-1">- 왕복인 경우 입력</span>
                                    </h4>
                                    <div className="space-y-3 bg-orange-50 p-3 rounded-lg">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                <Clock className="inline w-4 h-4 mr-1" />
                                                오는 편 일시
                                            </label>
                                            <input
                                                type="datetime-local"
                                                value={formData.return_datetime}
                                                onChange={(e) => setFormData(prev => ({ ...prev, return_datetime: e.target.value }))}
                                                className="w-full px-3 py-2 border border-orange-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                                            />
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    <MapPin className="inline w-4 h-4 mr-1" />
                                                    오는 편 출발지
                                                </label>
                                                <input
                                                    type="text"
                                                    value={formData.return_pickup_location}
                                                    onChange={(e) => setFormData(prev => ({ ...prev, return_pickup_location: e.target.value }))}
                                                    placeholder="예: 크루즈 부두, 호텔"
                                                    className="w-full px-3 py-2 border border-orange-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    <MapPin className="inline w-4 h-4 mr-1" />
                                                    오는 편 목적지
                                                </label>
                                                <input
                                                    type="text"
                                                    value={formData.return_destination}
                                                    onChange={(e) => setFormData(prev => ({ ...prev, return_destination: e.target.value }))}
                                                    placeholder="예: 하노이 공항, 호텔"
                                                    className="w-full px-3 py-2 border border-orange-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                                                />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    오는 편 경유지
                                                </label>
                                                <input
                                                    type="text"
                                                    value={formData.return_via_location}
                                                    onChange={(e) => setFormData(prev => ({ ...prev, return_via_location: e.target.value }))}
                                                    placeholder="경유지 (없으면 빈칸)"
                                                    className="w-full px-3 py-2 border border-orange-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    오는 편 경유 대기시간
                                                </label>
                                                <input
                                                    type="text"
                                                    value={formData.return_via_waiting}
                                                    onChange={(e) => setFormData(prev => ({ ...prev, return_via_waiting: e.target.value }))}
                                                    placeholder="예: 1시간, 30분"
                                                    className="w-full px-3 py-2 border border-orange-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            차량 수
                                        </label>
                                        <input
                                            type="number"
                                            min="1"
                                            max="10"
                                            value={formData.car_count}
                                            onChange={(e) => {
                                                const count = parseInt(e.target.value) || 0;
                                                setFormData(prev => ({
                                                    ...prev,
                                                    car_count: count,
                                                    total_price: count * prev.rental_days * prev.unit_price
                                                }));
                                            }}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            승객수
                                        </label>
                                        <input
                                            type="number"
                                            min="1"
                                            max="5"
                                            value={formData.driver_count}
                                            onChange={(e) => setFormData(prev => ({
                                                ...prev,
                                                driver_count: parseInt(e.target.value) || 0
                                            }))}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            단가 (동)
                                        </label>
                                        <input
                                            type="number"
                                            value={formData.unit_price}
                                            onChange={(e) => {
                                                const price = parseInt(e.target.value) || 0;
                                                setFormData(prev => ({
                                                    ...prev,
                                                    unit_price: price,
                                                    total_price: prev.car_count * prev.rental_days * price
                                                }));
                                            }}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            총 금액 (동)
                                        </label>
                                        <input
                                            type="number"
                                            value={formData.total_price}
                                            onChange={(e) => setFormData(prev => ({
                                                ...prev,
                                                total_price: parseInt(e.target.value) || 0
                                            }))}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-bold text-green-600"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        요청사항
                                    </label>
                                    <textarea
                                        rows={4}
                                        value={formData.request_note}
                                        onChange={(e) => setFormData(prev => ({
                                            ...prev,
                                            request_note: e.target.value
                                        }))}
                                        placeholder="픽업 장소, 운전자 정보, 특별 요청사항 등을 입력하세요..."
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 우측: 예약 상태 및 저장 */}
                    <div className="space-y-6">
                        {/* 예약 상태 */}
                        <div className="bg-white rounded-lg shadow-sm p-6">
                            <h3 className="text-lg font-medium text-gray-900 mb-4">예약 상태</h3>
                            <div className="space-y-3">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">상태</label>
                                    <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${reservation.reservation.re_status === 'confirmed' ? 'bg-green-100 text-green-800' :
                                        reservation.reservation.re_status === 'approved' ? 'bg-blue-100 text-blue-800' :
                                            reservation.reservation.re_status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                                reservation.reservation.re_status === 'cancelled' ? 'bg-red-100 text-red-800' :
                                                    'bg-gray-100 text-gray-800'
                                        }`}>
                                        {reservation.reservation.re_status === 'confirmed' ? '확정' : reservation.reservation.re_status === 'approved' ? '승인' : reservation.reservation.re_status === 'pending' ? '대기중' : reservation.reservation.re_status === 'cancelled' ? '취소' : reservation.reservation.re_status}
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">예약일</label>
                                    <div className="text-gray-900 flex items-center gap-2">
                                        <Calendar className="w-4 h-4 text-gray-400" />
                                        {new Date(reservation.reservation.re_created_at).toLocaleDateString('ko-KR')}
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">여행명</label>
                                    <div className="text-gray-900">
                                        {reservation.reservation.quote?.title || '제목 없음'}
                                    </div>
                                </div>
                                <div className="pt-4 mt-4 border-t border-gray-100 space-y-4">
                                    <div>
                                        <h4 className="text-sm font-semibold text-gray-800">추가내역 / 추가요금</h4>
                                        <p className="text-xs text-gray-500 mt-1">예약 상태 아래에서 추가요금을 조정하면 최종 합계가 즉시 반영됩니다.</p>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">추가내역 선택</label>
                                        <select
                                            title="추가내역 선택"
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                                            value=""
                                            onChange={(e) => {
                                                const tpl = feeTemplates.find(t => String(t.id) === e.target.value);
                                                if (tpl) { setAdditionalFee(tpl.amount); setAdditionalFeeDetail(tpl.name); }
                                            }}
                                        >
                                            <option value="">-- 추가내역 선택 --</option>
                                            {feeTemplates.map(t => (
                                                <option key={t.id} value={t.id}>{t.name} ({t.amount.toLocaleString()}동)</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">추가요금 (VND)</label>
                                        <input
                                            type="number"
                                            min="0"
                                            value={additionalFee}
                                            onChange={(e) => setAdditionalFee(parseInt(e.target.value, 10) || 0)}
                                            title="추가요금"
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
                                </div>
                                {(formData.total_price > 0 || additionalFee > 0) && (
                                    <div className="pt-4 mt-4 border-t border-gray-100 space-y-2">
                                        <div className="flex justify-between text-sm text-gray-700">
                                            <span>기본 렌터카 금액</span>
                                            <span className="font-semibold">{formData.total_price.toLocaleString()}동</span>
                                        </div>
                                        <div className="text-xs text-gray-500">
                                            {formData.car_count}대 × {formData.rental_days}일 × {formData.unit_price.toLocaleString()}동
                                        </div>
                                        <div className="flex justify-between text-sm text-orange-600">
                                            <span>추가요금</span>
                                            <span className="font-semibold">+{additionalFee.toLocaleString()}동</span>
                                        </div>
                                        {additionalFeeDetail.trim() && (
                                            <div className="text-xs text-gray-500 whitespace-pre-wrap">{additionalFeeDetail}</div>
                                        )}
                                        <div className="pt-2 border-t border-gray-200">
                                            <label className="block text-sm font-medium text-gray-700">최종 총 금액</label>
                                            <div className="text-xl font-bold text-green-600">
                                                {rentcarFinalTotal.toLocaleString()}동
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* 저장 버튼 */}
                        <div className="bg-white rounded-lg shadow-sm p-6 space-y-3">
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
                            <button
                                onClick={handleDeleteReservation}
                                disabled={saving}
                                className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                전체 예약 삭제
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </ManagerLayout>
    );
}

export default function RentcarReservationEditPage() {
    return (
        <Suspense fallback={
            <ManagerLayout title="🚗 렌터카 예약 수정" activeTab="reservation-edit-rentcar">
                <div className="flex justify-center items-center h-64">
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
                        <p className="mt-4 text-gray-600">페이지를 불러오는 중...</p>
                    </div>
                </div>
            </ManagerLayout>
        }>
            <RentcarReservationEditContent />
        </Suspense>
    );
}
