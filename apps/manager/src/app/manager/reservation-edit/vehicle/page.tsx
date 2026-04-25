'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import supabase from '@/lib/supabase';
import { saveAdditionalFeeTemplateFromInput } from '@/lib/additionalFeeTemplate';
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
    Mail
} from 'lucide-react';

interface RentcarPriceOption {
    rent_code: string;
    way_type: string | null;
    route: string | null;
    vehicle_type: string | null;
    price: number | null;
}

interface CruiseCarReservation {
    reservation_id: string;
    car_price_code: string;
    rentcar_price_code?: string;
    way_type?: string;
    route?: string;
    vehicle_type?: string;
    car_count: number;
    passenger_count: number;
    pickup_datetime: string;
    pickup_location: string;
    dropoff_location: string;
    return_datetime?: string;
    car_total_price: number;
    unit_price: number;
    request_note: string;
    dispatch_code: string;
    dispatch_memo: string;
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
}

function CruiseCarReservationEditContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const reservationId = searchParams.get('id');

    const [reservation, setReservation] = useState<CruiseCarReservation | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [wayTypeOptions, setWayTypeOptions] = useState<string[]>([]);
    const [routeOptions, setRouteOptions] = useState<string[]>([]);
    const [vehicleTypeOptions, setVehicleTypeOptions] = useState<string[]>([]);
    const [cruiseCheckin, setCruiseCheckin] = useState('');
    const [additionalFee, setAdditionalFee] = useState(0);
    const [additionalFeeDetail, setAdditionalFeeDetail] = useState('');
    const [feeTemplates, setFeeTemplates] = useState<{ id: number; name: string; amount: number }[]>([]);
    const [formData, setFormData] = useState({
        rentcar_price_code: '',
        way_type: '',
        route: '',
        vehicle_type: '',
        car_count: 0,
        passenger_count: 0,
        pickup_datetime: '',
        pickup_location: '',
        dropoff_location: '',
        return_datetime: '',
        car_total_price: 0,
        unit_price: 0,
        request_note: '',
        dispatch_code: '',
        dispatch_memo: ''
    });

    const finalTotalPrice = (formData.car_total_price || 0) + additionalFee;

    useEffect(() => {
        if (reservationId) {
            loadReservation();
        } else {
            router.push('/manager/reservation-edit');
        }
    }, [reservationId]);

    useEffect(() => {
        loadWayTypeOptions();
        supabase
            .from('additional_fee_template')
            .select('id, name, amount')
            .or('service_type.is.null,service_type.eq.vehicle')
            .eq('is_active', true)
            .order('sort_order')
            .then(({ data }) => { if (data) setFeeTemplates(data); });
    }, []);

    useEffect(() => {
        if (!formData.way_type) {
            setRouteOptions([]);
            return;
        }
        loadRouteOptions(formData.way_type);
    }, [formData.way_type]);

    useEffect(() => {
        if (!formData.way_type || !formData.route) {
            setVehicleTypeOptions([]);
            return;
        }
        loadVehicleTypeOptions(formData.way_type, formData.route);
    }, [formData.way_type, formData.route]);

    useEffect(() => {
        const targetCount = formData.car_count > 0 ? formData.car_count : formData.passenger_count;
        const autoTotal = (formData.unit_price || 0) * targetCount;
        setFormData(prev => ({ ...prev, car_total_price: autoTotal }));
        // unit_price / car_count / passenger_count 변화 시 총금액 동기화
    }, [formData.unit_price, formData.car_count, formData.passenger_count]);

    const shiftDate = (dateText: string, days: number) => {
        if (!dateText) return '';
        const date = new Date(`${dateText}T00:00:00`);
        if (Number.isNaN(date.getTime())) return '';
        date.setDate(date.getDate() + days);
        return date.toISOString().slice(0, 10);
    };

    const copyPickupDateToReturnDate = (mode: 'same-day' | 'next-day') => {
        if (!formData.pickup_datetime) return;
        const nextValue = mode === 'next-day'
            ? shiftDate(formData.pickup_datetime, 1)
            : formData.pickup_datetime;

        setFormData(prev => ({
            ...prev,
            return_datetime: nextValue || prev.return_datetime
        }));
    };

    const loadWayTypeOptions = async () => {
        try {
            const { data, error } = await supabase
                .from('rentcar_price')
                .select('way_type')
                .not('way_type', 'is', null)
                .order('way_type');

            if (error) throw error;

            const uniqueWayTypes = Array.from(
                new Set((data || []).map((item: any) => item.way_type).filter(Boolean))
            ) as string[];
            setWayTypeOptions(uniqueWayTypes);
        } catch (error) {
            console.error('❌ 이용방식 옵션 조회 실패:', error);
            setWayTypeOptions([]);
        }
    };

    const loadRouteOptions = async (wayType: string) => {
        try {
            const { data, error } = await supabase
                .from('rentcar_price')
                .select('route')
                .eq('way_type', wayType)
                .not('route', 'is', null)
                .order('route');

            if (error) throw error;

            const uniqueRoutes = Array.from(
                new Set((data || []).map((item: any) => item.route).filter(Boolean))
            ) as string[];
            setRouteOptions(uniqueRoutes);
        } catch (error) {
            console.error('❌ 경로 옵션 조회 실패:', error);
            setRouteOptions([]);
        }
    };

    const loadVehicleTypeOptions = async (wayType: string, route: string) => {
        try {
            const { data, error } = await supabase
                .from('rentcar_price')
                .select('vehicle_type')
                .eq('way_type', wayType)
                .eq('route', route)
                .not('vehicle_type', 'is', null)
                .order('vehicle_type');

            if (error) throw error;

            const uniqueTypes = Array.from(
                new Set((data || []).map((item: any) => item.vehicle_type).filter(Boolean))
            ) as string[];
            setVehicleTypeOptions(uniqueTypes);
        } catch (error) {
            console.error('❌ 차량타입 옵션 조회 실패:', error);
            setVehicleTypeOptions([]);
        }
    };

    const loadRentcarPriceByCode = async (code: string) => {
        if (!code) return null;
        const { data, error } = await supabase
            .from('rentcar_price')
            .select('rent_code, way_type, route, vehicle_type, price')
            .eq('rent_code', code)
            .maybeSingle();

        if (error) {
            console.warn('⚠️ rentcar_price 코드 조회 실패:', error);
            return null;
        }
        return data as RentcarPriceOption | null;
    };

    const applySelectedRentcarPrice = async (wayType: string, route: string, vehicleType: string) => {
        if (!wayType || !route || !vehicleType) return;

        const { data, error } = await supabase
            .from('rentcar_price')
            .select('rent_code, way_type, route, vehicle_type, price')
            .eq('way_type', wayType)
            .eq('route', route)
            .eq('vehicle_type', vehicleType)
            .limit(1)
            .maybeSingle();

        if (error) {
            console.error('❌ rentcar_price 선택값 조회 실패:', error);
            return;
        }

        if (!data) {
            console.warn('⚠️ 일치하는 rentcar_price 데이터가 없습니다:', { wayType, route, vehicleType });
            return;
        }

        setFormData(prev => ({
            ...prev,
            rentcar_price_code: data.rent_code || '',
            way_type: data.way_type || prev.way_type,
            route: data.route || prev.route,
            vehicle_type: data.vehicle_type || prev.vehicle_type,
            unit_price: data.price || 0
        }));
    };

    const loadReservation = async () => {
        try {
            console.log('🔄 크루즈 차량 예약 데이터 로드 시작...', reservationId);
            setLoading(true);

            // 1) 예약 기본 정보 조회
            const { data: resRow, error: resErr } = await supabase
                .from('reservation')
                .select('re_id, re_type, re_status, re_created_at, re_quote_id, re_user_id, total_amount, price_breakdown, manual_additional_fee, manual_additional_fee_detail')
                .eq('re_id', reservationId)
                .single();

            if (resErr || !resRow) throw resErr || new Error('예약 기본 정보 접근 실패');

            // 1-1) 크루즈 체크인 일자 조회 (픽업일시 복사용)
            // 우선: 현재 예약 ID로 직접 조회
            let resolvedCheckin = '';
            const { data: directCruiseRow, error: directCruiseErr } = await supabase
                .from('reservation_cruise')
                .select('checkin')
                .eq('reservation_id', resRow.re_id)
                .limit(1)
                .maybeSingle();

            if (directCruiseErr) {
                console.warn('⚠️ 크루즈 체크인 직접 조회 실패:', directCruiseErr);
            }

            if (directCruiseRow?.checkin) {
                resolvedCheckin = directCruiseRow.checkin;
            }

            // fallback: 차량 예약과 크루즈 예약이 다른 re_id인 경우, 같은 quote의 cruise 예약에서 조회
            if (!resolvedCheckin && resRow.re_quote_id) {
                const { data: cruiseReservationRows, error: cruiseReservationErr } = await supabase
                    .from('reservation')
                    .select('re_id')
                    .eq('re_quote_id', resRow.re_quote_id)
                    .eq('re_type', 'cruise')
                    .order('re_created_at', { ascending: false })
                    .limit(10);

                if (cruiseReservationErr) {
                    console.warn('⚠️ quote 기준 cruise 예약 조회 실패:', cruiseReservationErr);
                }

                const cruiseReservationIds = (cruiseReservationRows || []).map((row: any) => row.re_id).filter(Boolean);

                if (cruiseReservationIds.length > 0) {
                    const { data: cruiseRows, error: cruiseErr } = await supabase
                        .from('reservation_cruise')
                        .select('reservation_id, checkin, created_at')
                        .in('reservation_id', cruiseReservationIds)
                        .order('created_at', { ascending: false });

                    if (cruiseErr) {
                        console.warn('⚠️ quote 기준 reservation_cruise 조회 실패:', cruiseErr);
                    }

                    const latestCheckinRow = (cruiseRows || []).find((row: any) => !!row.checkin);
                    if (latestCheckinRow?.checkin) {
                        resolvedCheckin = latestCheckinRow.checkin;
                    }
                }
            }

            setCruiseCheckin(resolvedCheckin);

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

            // 3) 서비스 상세 (크루즈 차량)
            const { data: carRow, error: carErr } = await supabase
                .from('reservation_cruise_car')
                .select('*')
                .eq('reservation_id', reservationId)
                .limit(1)
                .maybeSingle();

            if (carErr) {
                console.warn('⚠️ 크루즈 차량 예약 상세 조회 실패:', carErr);
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

            const defaultCarInfo = {
                reservation_id: reservationId,
                car_price_code: '',
                car_count: 0,
                passenger_count: 0,
                pickup_datetime: '',
                pickup_location: '',
                dropoff_location: '',
                car_total_price: 0,
                unit_price: 0,
                request_note: '',
                dispatch_code: '',
                dispatch_memo: ''
            };

            const fullReservation: CruiseCarReservation = {
                ...(carRow || defaultCarInfo),
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

            const existingCode = carRow?.rentcar_price_code || carRow?.car_price_code || '';
            const rentcarPriceInfo = existingCode ? await loadRentcarPriceByCode(existingCode) : null;

            setReservation(fullReservation);
            setFormData({
                rentcar_price_code: existingCode,
                way_type: carRow?.way_type || rentcarPriceInfo?.way_type || '',
                route: carRow?.route || rentcarPriceInfo?.route || '',
                vehicle_type: carRow?.vehicle_type || rentcarPriceInfo?.vehicle_type || '',
                car_count: carRow?.car_count || 0,
                passenger_count: carRow?.passenger_count || 0,
                pickup_datetime: carRow?.pickup_datetime || '',
                pickup_location: carRow?.pickup_location || '',
                dropoff_location: carRow?.dropoff_location || '',
                return_datetime: carRow?.return_datetime || '',
                car_total_price: carRow?.car_total_price || 0,
                unit_price: carRow?.unit_price || rentcarPriceInfo?.price || 0,
                request_note: carRow?.request_note || '',
                dispatch_code: carRow?.dispatch_code || '',
                dispatch_memo: carRow?.dispatch_memo || ''
            });

            const baseTotal = Number(carRow?.car_total_price || 0);
            const savedAdditionalFee = Number(resRow.price_breakdown?.additional_fee);
            const derivedAdditionalFee = Number.isFinite(savedAdditionalFee)
                ? savedAdditionalFee
                : Math.max(0, Number(resRow.total_amount || 0) - baseTotal);
            setAdditionalFee(derivedAdditionalFee);
            setAdditionalFeeDetail(
                String(
                    resRow.manual_additional_fee_detail
                    || resRow.price_breakdown?.additional_fee_detail
                    || resRow.price_breakdown?.additional_fee_note
                    || ''
                )
            );

        } catch (error) {
            console.error('❌ 크루즈 차량 예약 로드 실패:', error);
            alert('크루즈 차량 예약 정보를 불러오는데 실패했습니다.');
            router.push('/manager/reservation-edit');
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!reservation) return;

        try {
            setSaving(true);
            console.log('💾 크루즈 차량 예약 수정 저장 시작...');

            const basicPayload: Record<string, any> = {
                car_price_code: formData.rentcar_price_code,
                car_count: formData.car_count,
                passenger_count: formData.passenger_count,
                pickup_datetime: formData.pickup_datetime,
                pickup_location: formData.pickup_location,
                dropoff_location: formData.dropoff_location,
                car_total_price: formData.car_total_price,
                unit_price: formData.unit_price,
                request_note: formData.request_note,
                dispatch_code: formData.dispatch_code,
                dispatch_memo: formData.dispatch_memo,
                updated_at: new Date().toISOString()
            };

            const extendedPayload: Record<string, any> = {
                ...basicPayload,
                rentcar_price_code: formData.rentcar_price_code,
                way_type: formData.way_type || null,
                route: formData.route || null,
                vehicle_type: formData.vehicle_type || null,
                return_datetime: formData.return_datetime || null
            };

            const tryUpdate = async (payload: Record<string, any>) => {
                return await supabase
                    .from('reservation_cruise_car')
                    .update(payload)
                    .eq('reservation_id', reservationId)
                    .select();
            };

            let updateResult = await tryUpdate(extendedPayload);

            if (updateResult.error && /does not exist|column/i.test(updateResult.error.message || '')) {
                console.warn('⚠️ 확장 컬럼 미지원, 기본 컬럼으로 저장 재시도');
                updateResult = await tryUpdate(basicPayload);
            }

            // 1. Update 시도
            const { data: updatedData, error: updateError } = updateResult;

            if (updateError) throw updateError;

            // 메인 예약 테이블 동기화 (총 금액 + 인원수 + 타임스탬프)
            const reservationPayload: Record<string, any> = {
                total_amount: finalTotalPrice,
                pax_count: formData.passenger_count || 0,
                price_breakdown: {
                    type: 'cruise_car',
                    base_total: formData.car_total_price || 0,
                    additional_fee: additionalFee,
                    additional_fee_detail: additionalFeeDetail || null,
                    grand_total: finalTotalPrice,
                },
                manual_additional_fee: additionalFee,
                manual_additional_fee_detail: additionalFeeDetail || null,
                re_update_at: new Date().toISOString(),
            };

            const { error: reservationError } = await supabase
                .from('reservation')
                .update(reservationPayload)
                .eq('re_id', reservationId);

            if (reservationError) {
                console.warn('⚠️ reservation 동기화 실패:', reservationError);
            }

            await saveAdditionalFeeTemplateFromInput({
                serviceType: 'vehicle',
                detail: additionalFeeDetail,
                amount: additionalFee,
            });

            // 2. Insert fallback
            if (!updatedData || updatedData.length === 0) {
                console.log('⚠️ 기존 데이터 없음, 신규 삽입...');
                let insertPayload = extendedPayload;
                let insertError: any = null;

                const firstInsert = await supabase
                    .from('reservation_cruise_car')
                    .insert({
                        reservation_id: reservationId,
                        ...insertPayload
                    });

                insertError = firstInsert.error;

                if (insertError && /does not exist|column/i.test(insertError.message || '')) {
                    console.warn('⚠️ 확장 컬럼 미지원, 기본 컬럼으로 신규 삽입 재시도');
                    insertPayload = basicPayload;
                    const fallbackInsert = await supabase
                        .from('reservation_cruise_car')
                        .insert({
                            reservation_id: reservationId,
                            ...insertPayload
                        });
                    insertError = fallbackInsert.error;
                }

                if (insertError) throw insertError;
            }

            console.log('✅ 크루즈 차량 예약 수정 완료');
            alert('크루즈 차량 예약이 성공적으로 수정되었습니다.');

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
            <ManagerLayout title="🚗 크루즈 차량 예약 수정" activeTab="reservation-edit-vehicle">
                <div className="flex justify-center items-center h-64">
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
                        <p className="mt-4 text-gray-600">크루즈 차량 예약 데이터를 불러오는 중...</p>
                    </div>
                </div>
            </ManagerLayout>
        );
    }

    if (!reservation) {
        return (
            <ManagerLayout title="🚗 크루즈 차량 예약 수정" activeTab="reservation-edit-vehicle">
                <div className="text-center py-12">
                    <Car className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">예약을 찾을 수 없습니다</h3>
                    <p className="text-gray-600 mb-4">요청하신 크루즈 차량 예약 정보를 찾을 수 없습니다.</p>
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
        <ManagerLayout title="🚗 크루즈 차량 예약 수정" activeTab="reservation-edit-vehicle">
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
                        <h1 className="text-xl font-bold text-gray-900">크루즈 차량 예약 수정</h1>
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

                        {/* 수정 가능한 필드들 */}
                        <div className="bg-white rounded-lg shadow-sm p-6">
                            <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
                                <Car className="w-5 h-5" />
                                크루즈 차량 세부사항 수정
                            </h3>
                            <div className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            이용방식
                                        </label>
                                        <select
                                            value={formData.way_type}
                                            onChange={(e) => {
                                                const nextWayType = e.target.value;
                                                setFormData(prev => ({
                                                    ...prev,
                                                    way_type: nextWayType,
                                                    route: '',
                                                    vehicle_type: '',
                                                    rentcar_price_code: '',
                                                    unit_price: 0
                                                }));
                                            }}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                        >
                                            <option value="">이용방식 선택</option>
                                            {wayTypeOptions.map((wayType) => (
                                                <option key={wayType} value={wayType}>{wayType}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            경로
                                        </label>
                                        <select
                                            value={formData.route}
                                            onChange={(e) => {
                                                const nextRoute = e.target.value;
                                                setFormData(prev => ({
                                                    ...prev,
                                                    route: nextRoute,
                                                    vehicle_type: '',
                                                    rentcar_price_code: '',
                                                    unit_price: 0
                                                }));
                                            }}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                            disabled={!formData.way_type}
                                        >
                                            <option value="">경로 선택</option>
                                            {routeOptions.map((route) => (
                                                <option key={route} value={route}>{route}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            차량타입
                                        </label>
                                        <select
                                            value={formData.vehicle_type}
                                            onChange={async (e) => {
                                                const nextType = e.target.value;
                                                setFormData(prev => ({
                                                    ...prev,
                                                    vehicle_type: nextType,
                                                    rentcar_price_code: ''
                                                }));

                                                await applySelectedRentcarPrice(
                                                    formData.way_type,
                                                    formData.route,
                                                    nextType
                                                );
                                            }}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                            disabled={!formData.way_type || !formData.route}
                                        >
                                            <option value="">차량타입 선택</option>
                                            {vehicleTypeOptions.map((vehicleType) => (
                                                <option key={vehicleType} value={vehicleType}>{vehicleType}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            차량 가격 코드 (rent_code)
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.rentcar_price_code}
                                            readOnly
                                            className="w-full px-3 py-2 border border-gray-200 bg-gray-50 rounded-lg text-gray-700"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            <Car className="inline w-4 h-4 mr-1" />
                                            차량 대수
                                        </label>
                                        <input
                                            type="number"
                                            value={formData.car_count}
                                            onChange={(e) => setFormData({ ...formData, car_count: parseInt(e.target.value) || 0 })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                            min="0"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            <Users className="inline w-4 h-4 mr-1" />
                                            승객 수
                                        </label>
                                        <input
                                            type="number"
                                            value={formData.passenger_count}
                                            onChange={(e) => setFormData({ ...formData, passenger_count: parseInt(e.target.value) || 0 })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                            min="0"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            <Calendar className="inline w-4 h-4 mr-1" />
                                            픽업 일시 (가는 편)
                                        </label>
                                        <input
                                            type="date"
                                            value={formData.pickup_datetime}
                                            onChange={(e) => setFormData({ ...formData, pickup_datetime: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                        />
                                        <div className="mt-2 flex items-center justify-between gap-2 text-sm">
                                            <span className="text-gray-600">
                                                체크인 일자: <span className="font-medium text-gray-900">{cruiseCheckin || '-'}</span>
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => setFormData(prev => ({ ...prev, pickup_datetime: cruiseCheckin }))}
                                                disabled={!cruiseCheckin}
                                                className="px-2 py-1 text-xs rounded border border-blue-200 text-blue-600 hover:bg-blue-50 disabled:text-gray-400 disabled:border-gray-200 disabled:cursor-not-allowed"
                                            >
                                                체크인 일자 복사
                                            </button>
                                        </div>
                                    </div>
                                    {(formData.way_type === '당일왕복' || formData.way_type === '다른날왕복') && (
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                <Calendar className="inline w-4 h-4 mr-1" />
                                                오는 편 날짜
                                                <span className="ml-1 text-xs text-orange-500">(pier → 숙소)</span>
                                            </label>
                                            <input
                                                type="date"
                                                value={formData.return_datetime}
                                                onChange={(e) => setFormData({ ...formData, return_datetime: e.target.value })}
                                                className="w-full px-3 py-2 border border-orange-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 bg-orange-50"
                                            />
                                            <div className="mt-2 flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => copyPickupDateToReturnDate('next-day')}
                                                    disabled={!formData.pickup_datetime}
                                                    className="px-2 py-1 text-xs rounded border border-orange-200 text-orange-600 hover:bg-orange-50 disabled:text-gray-400 disabled:border-gray-200 disabled:cursor-not-allowed"
                                                >
                                                    픽업 다음일 복사
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => copyPickupDateToReturnDate('same-day')}
                                                    disabled={!formData.pickup_datetime}
                                                    className="px-2 py-1 text-xs rounded border border-blue-200 text-blue-600 hover:bg-blue-50 disabled:text-gray-400 disabled:border-gray-200 disabled:cursor-not-allowed"
                                                >
                                                    당일 복사
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            <MapPin className="inline w-4 h-4 mr-1" />
                                            픽업 장소
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.pickup_location}
                                            onChange={(e) => setFormData({ ...formData, pickup_location: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                            placeholder="픽업 위치 입력"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            <MapPin className="inline w-4 h-4 mr-1" />
                                            드롭오프 장소
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.dropoff_location}
                                            onChange={(e) => setFormData({ ...formData, dropoff_location: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                            placeholder="드롭오프 위치 입력"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            단가 (VND)
                                        </label>
                                        <input
                                            type="number"
                                            value={formData.unit_price}
                                            onChange={(e) => setFormData({ ...formData, unit_price: parseInt(e.target.value) || 0 })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                            min="0"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            총 가격 (VND)
                                        </label>
                                        <input
                                            type="number"
                                            value={formData.car_total_price}
                                            readOnly
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                            min="0"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        배차 코드
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.dispatch_code}
                                        onChange={(e) => setFormData({ ...formData, dispatch_code: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        요청 사항
                                    </label>
                                    <textarea
                                        value={formData.request_note}
                                        onChange={(e) => setFormData({ ...formData, request_note: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                        rows={3}
                                        placeholder="특별 요청사항을 입력하세요"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        배차 메모
                                    </label>
                                    <textarea
                                        value={formData.dispatch_memo}
                                        onChange={(e) => setFormData({ ...formData, dispatch_memo: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                        rows={3}
                                        placeholder="배차 관련 메모를 입력하세요"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 우측: 예약 상태 */}
                    <div className="space-y-6">
                        <div className="bg-white rounded-lg shadow-sm p-6">
                            <h3 className="text-lg font-medium text-gray-900 mb-4">예약 상태</h3>
                            <div className="space-y-3">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">상태</label>
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
                                    <label className="block text-sm font-medium text-gray-700 mb-1">생성일</label>
                                    <div className="text-gray-900">
                                        {new Date(reservation.reservation.re_created_at).toLocaleDateString('ko-KR')}
                                    </div>
                                </div>

                                {reservation.reservation.quote && (
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">견적 제목</label>
                                        <div className="text-gray-900">{reservation.reservation.quote.title}</div>
                                    </div>
                                )}

                                <div className="mt-4 pt-4 border-t border-gray-100 space-y-4">
                                    <div>
                                        <h4 className="text-sm font-semibold text-gray-800">추가내역 / 추가요금</h4>
                                        <p className="text-xs text-gray-500 mt-1">예약 상태 바로 아래에서 추가요금을 조정하고 합계를 바로 확인할 수 있습니다.</p>
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
                                            value={additionalFee}
                                            onChange={(e) => setAdditionalFee(parseInt(e.target.value, 10) || 0)}
                                            title="추가요금"
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                            min="0"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">추가요금 내역</label>
                                        <textarea
                                            value={additionalFeeDetail}
                                            onChange={(e) => setAdditionalFeeDetail(e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                            rows={3}
                                            placeholder="추가요금 사유 또는 내역을 입력하세요"
                                        />
                                    </div>
                                </div>

                                {(formData.car_total_price > 0 || additionalFee > 0) && (
                                    <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">기본 차량 금액</label>
                                            <div className="text-lg font-semibold text-gray-900">
                                                {(formData.car_total_price || 0).toLocaleString()}동
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">추가요금</label>
                                            <div className="text-lg font-semibold text-gray-900">
                                                {additionalFee.toLocaleString()}동
                                            </div>
                                        </div>
                                        {additionalFeeDetail.trim() && (
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">추가요금 내역</label>
                                                <div className="text-sm text-gray-700 whitespace-pre-wrap">
                                                    {additionalFeeDetail}
                                                </div>
                                            </div>
                                        )}
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">최종 총 금액</label>
                                            <div className="text-xl font-bold text-green-600">
                                                {finalTotalPrice.toLocaleString()}동
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* 저장 버튼 */}
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                        >
                            <Save className="w-5 h-5" />
                            {saving ? '저장 중...' : '변경사항 저장'}
                        </button>
                    </div>
                </div>
            </div>
        </ManagerLayout>
    );
}

export default function CruiseCarReservationEditPage() {
    return (
        <Suspense fallback={
            <ManagerLayout title="🚗 크루즈 차량 예약 수정" activeTab="reservation-edit-vehicle">
                <div className="flex justify-center items-center h-64">
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
                        <p className="mt-4 text-gray-600">페이지를 불러오는 중...</p>
                    </div>
                </div>
            </ManagerLayout>
        }>
            <CruiseCarReservationEditContent />
        </Suspense>
    );
}
