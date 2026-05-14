'use client';

import React, { useEffect, useMemo, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import supabase from '@/lib/supabase';
import { saveAdditionalFeeTemplateFromInput } from '@/lib/additionalFeeTemplate';
import { recordReservationChange } from '@/lib/reservationChangeTracker';
import { calculateReservationPricing } from '@sht/domain/pricing';
import ManagerLayout from '../_components/MobileReservationLayout';
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

interface VehicleFormData {
    rentcar_price_code: string;
    way_type: string;
    route: string;
    vehicle_type: string;
    car_count: number;
    passenger_count: number;
    pickup_datetime: string;
    pickup_location: string;
    dropoff_location: string;
    return_datetime: string;
    car_total_price: number;
    manual_total: boolean;
    unit_price: number;
    request_note: string;
    dispatch_code: string;
    dispatch_memo: string;
}

const createEmptyVehicleForm = (): VehicleFormData => ({
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
    manual_total: false,
    unit_price: 0,
    request_note: '',
    dispatch_code: '',
    dispatch_memo: ''
});

function CruiseCarReservationEditContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const reservationId = searchParams.get('id');

    const [reservation, setReservation] = useState<CruiseCarReservation | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [wayTypeOptions, setWayTypeOptions] = useState<string[]>([]);
    const [routeOptionsByWay, setRouteOptionsByWay] = useState<Record<string, string[]>>({});
    const [vehicleTypeOptionsByKey, setVehicleTypeOptionsByKey] = useState<Record<string, string[]>>({});
    const [vehicleForms, setVehicleForms] = useState<VehicleFormData[]>([createEmptyVehicleForm()]);
    const [cruiseCheckin, setCruiseCheckin] = useState('');
    const [additionalFee, setAdditionalFee] = useState(0);
    const [additionalFeeDetail, setAdditionalFeeDetail] = useState('');
    const [feeTemplates, setFeeTemplates] = useState<{ id: number; name: string; amount: number }[]>([]);
    const [authChecked, setAuthChecked] = useState(false);

    const baseTotalPrice = useMemo(
        () => vehicleForms.reduce((sum, item) => sum + (item.car_total_price || 0), 0),
        [vehicleForms]
    );

    const totalPassengerCount = useMemo(
        () => vehicleForms.reduce((sum, item) => sum + (item.passenger_count || 0), 0),
        [vehicleForms]
    );

    const finalTotalPrice = baseTotalPrice + additionalFee;

    // ✅ 인증 상태 확인 (403 에러 사전 방지)
    useEffect(() => {
        let cancelled = false;
        const checkAuth = async () => {
            try {
                const { data, error } = await supabase.auth.getUser();
                if (cancelled) return;
                if (error || !data?.user) {
                    router.replace('/login');
                    return;
                }
                setAuthChecked(true);
            } catch (err) {
                if (cancelled) return;
                console.warn('인증 확인 오류:', err);
                router.replace('/login');
            }
        };
        checkAuth();
        return () => { cancelled = true; };
    }, []);

    // ✅ 인증 후 예약 데이터 로드
    useEffect(() => {
        if (!authChecked) return;
        if (reservationId) {
            loadReservation();
        } else {
            router.push('/reservation-edit');
        }
    }, [reservationId, authChecked]);

    useEffect(() => {
        loadWayTypeOptions();
        supabase
            .from('additional_fee_template')
            .select('id, name, amount')
            .or('service_type.is.null,service_type.eq.vehicle')
            .eq('is_active', true)
            .order('sort_order')
            .then(({ data }) => {
                if (data) setFeeTemplates(data);
            });
    }, []);

    const getAutoTotal = (item: VehicleFormData) => {
        const targetCount = item.car_count > 0 ? item.car_count : item.passenger_count;
        return (item.unit_price || 0) * targetCount;
    };

    const updateVehicleForm = (index: number, patch: Partial<VehicleFormData>) => {
        setVehicleForms(prev =>
            prev.map((item, idx) => (idx === index ? { ...item, ...patch } : item))
        );
    };

    const updateVehicleFormWithAutoTotal = (index: number, patch: Partial<VehicleFormData>) => {
        setVehicleForms(prev =>
            prev.map((item, idx) => {
                if (idx !== index) return item;
                const next = { ...item, ...patch };
                if (next.manual_total) {
                    return next;
                }
                return { ...next, car_total_price: getAutoTotal(next) };
            })
        );
    };

    const addVehicleForm = () => {
        setVehicleForms(prev => [
            ...prev,
            {
                ...createEmptyVehicleForm(),
                pickup_datetime: prev[0]?.pickup_datetime || cruiseCheckin || '',
                pickup_location: prev[0]?.pickup_location || '',
                dropoff_location: prev[0]?.dropoff_location || ''
            }
        ]);
    };

    const removeVehicleForm = (index: number) => {
        setVehicleForms(prev => {
            if (prev.length <= 1) return prev;
            return prev.filter((_, idx) => idx !== index);
        });
    };

    const shiftDate = (dateText: string, days: number) => {
        if (!dateText) return '';
        const date = new Date(`${dateText}T00:00:00`);
        if (Number.isNaN(date.getTime())) return '';
        date.setDate(date.getDate() + days);
        return date.toISOString().slice(0, 10);
    };

    const copyPickupDateToReturnDate = (index: number, mode: 'same-day' | 'next-day') => {
        const item = vehicleForms[index];
        if (!item?.pickup_datetime) return;
        const nextValue = mode === 'next-day'
            ? shiftDate(item.pickup_datetime, 1)
            : item.pickup_datetime;
        updateVehicleForm(index, { return_datetime: nextValue || item.return_datetime });
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

    const ensureRouteOptions = async (wayType: string) => {
        if (!wayType) return;
        if (routeOptionsByWay[wayType]) return;

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

            setRouteOptionsByWay(prev => ({ ...prev, [wayType]: uniqueRoutes }));
        } catch (error) {
            console.error('❌ 경로 옵션 조회 실패:', error);
            setRouteOptionsByWay(prev => ({ ...prev, [wayType]: [] }));
        }
    };

    const ensureVehicleTypeOptions = async (wayType: string, route: string) => {
        if (!wayType || !route) return;
        const key = `${wayType}__${route}`;
        if (vehicleTypeOptionsByKey[key]) return;

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

            setVehicleTypeOptionsByKey(prev => ({ ...prev, [key]: uniqueTypes }));
        } catch (error) {
            console.error('❌ 차량타입 옵션 조회 실패:', error);
            setVehicleTypeOptionsByKey(prev => ({ ...prev, [key]: [] }));
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

    const findRentcarPrice = async (wayType: string, route: string, vehicleType: string) => {
        if (!wayType || !route || !vehicleType) return null;

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
            return null;
        }

        if (!data) {
            console.warn('⚠️ 일치하는 rentcar_price 데이터가 없습니다:', { wayType, route, vehicleType });
            return null;
        }

        return data as RentcarPriceOption;
    };

    const loadReservation = async () => {
        try {
            setLoading(true);

            const { data: resRow, error: resErr } = await supabase
                .from('reservation')
                .select('re_id, re_type, re_status, re_created_at, re_quote_id, re_user_id, total_amount, price_breakdown, manual_additional_fee, manual_additional_fee_detail')
                .eq('re_id', reservationId)
                .single();

            if (resErr || !resRow) throw resErr || new Error('예약 기본 정보 접근 실패');

            let resolvedCheckin = '';
            const { data: directCruiseRow } = await supabase
                .from('reservation_cruise')
                .select('checkin')
                .eq('reservation_id', resRow.re_id)
                .limit(1)
                .maybeSingle();

            if (directCruiseRow?.checkin) resolvedCheckin = directCruiseRow.checkin;

            if (!resolvedCheckin && resRow.re_quote_id) {
                const { data: cruiseReservationRows } = await supabase
                    .from('reservation')
                    .select('re_id')
                    .eq('re_quote_id', resRow.re_quote_id)
                    .eq('re_type', 'cruise')
                    .order('re_created_at', { ascending: false })
                    .limit(10);

                const cruiseReservationIds = (cruiseReservationRows || []).map((row: any) => row.re_id).filter(Boolean);
                if (cruiseReservationIds.length > 0) {
                    const { data: cruiseRows } = await supabase
                        .from('reservation_cruise')
                        .select('reservation_id, checkin, created_at')
                        .in('reservation_id', cruiseReservationIds)
                        .order('created_at', { ascending: false });

                    const latestCheckinRow = (cruiseRows || []).find((row: any) => !!row.checkin);
                    if (latestCheckinRow?.checkin) resolvedCheckin = latestCheckinRow.checkin;
                }
            }

            setCruiseCheckin(resolvedCheckin);

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

            const { data: carRows, error: carErr } = await supabase
                .from('reservation_cruise_car')
                .select('*')
                .eq('reservation_id', reservationId)
                .order('created_at', { ascending: true });

            if (carErr) {
                console.warn('⚠️ 크루즈 차량 예약 상세 조회 실패:', carErr);
            }

            let quoteInfo = null as { title: string } | null;
            if (resRow.re_quote_id) {
                const { data: q, error: qErr } = await supabase
                    .from('quote')
                    .select('title')
                    .eq('id', resRow.re_quote_id)
                    .single();
                if (!qErr && q) quoteInfo = q;
            }

            const firstRow = (carRows && carRows.length > 0 ? carRows[0] : null) as any;
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
                ...(firstRow || defaultCarInfo),
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

            const rows = (carRows || []).length > 0 ? (carRows as any[]) : [defaultCarInfo];
            const forms = await Promise.all(rows.map(async (row: any) => {
                const existingCode = row.rentcar_price_code || row.car_price_code || '';
                const rentcarPriceInfo = existingCode ? await loadRentcarPriceByCode(existingCode) : null;

                const wayType = row.way_type || rentcarPriceInfo?.way_type || '';
                const route = row.route || rentcarPriceInfo?.route || '';

                if (wayType) await ensureRouteOptions(wayType);
                if (wayType && route) await ensureVehicleTypeOptions(wayType, route);

                const form: VehicleFormData = {
                    rentcar_price_code: existingCode,
                    way_type: wayType,
                    route,
                    vehicle_type: row.vehicle_type || rentcarPriceInfo?.vehicle_type || '',
                    car_count: row.car_count || 0,
                    passenger_count: row.passenger_count || 0,
                    pickup_datetime: row.pickup_datetime || '',
                    pickup_location: row.pickup_location || '',
                    dropoff_location: row.dropoff_location || '',
                    return_datetime: row.return_datetime || '',
                    car_total_price: row.car_total_price || 0,
                    manual_total: row.car_total_price != null,
                    unit_price: row.unit_price || rentcarPriceInfo?.price || 0,
                    request_note: row.request_note || '',
                    dispatch_code: row.dispatch_code || '',
                    dispatch_memo: row.dispatch_memo || ''
                };

                return {
                    ...form,
                    car_total_price: row.car_total_price ?? getAutoTotal(form)
                };
            }));

            setVehicleForms(forms);

            const baseTotal = forms.reduce((sum, item) => sum + (item.car_total_price || 0), 0);
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
            router.push('/reservation-edit');
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!reservation || !reservationId) return;

        try {
            setSaving(true);

            const normalizedForms = vehicleForms
                .map(item => ({ ...item }))
                .filter(item =>
                    item.rentcar_price_code
                    || item.way_type
                    || item.route
                    || item.vehicle_type
                    || item.car_count > 0
                    || item.passenger_count > 0
                    || item.pickup_datetime
                    || item.pickup_location
                    || item.dropoff_location
                    || item.return_datetime
                    || item.request_note
                    || item.dispatch_code
                    || item.dispatch_memo
                );

            if (normalizedForms.length === 0) {
                normalizedForms.push(createEmptyVehicleForm());
            }

            const basicRows = normalizedForms.map(item => ({
                reservation_id: reservationId,
                car_price_code: item.rentcar_price_code,
                car_count: item.car_count,
                passenger_count: item.passenger_count,
                pickup_datetime: item.pickup_datetime,
                pickup_location: item.pickup_location,
                dropoff_location: item.dropoff_location,
                car_total_price: item.car_total_price,
                unit_price: item.unit_price,
                request_note: item.request_note,
                dispatch_code: item.dispatch_code,
                dispatch_memo: item.dispatch_memo,
                updated_at: new Date().toISOString()
            }));

            const extendedRows = basicRows.map((row, index) => ({
                ...row,
                rentcar_price_code: normalizedForms[index].rentcar_price_code,
                way_type: normalizedForms[index].way_type || null,
                route: normalizedForms[index].route || null,
                vehicle_type: normalizedForms[index].vehicle_type || null,
                return_datetime: normalizedForms[index].return_datetime || null
            }));

            const { error: deleteError } = await supabase
                .from('reservation_cruise_car')
                .delete()
                .eq('reservation_id', reservationId);
            if (deleteError) throw deleteError;

            let insertResult = await supabase
                .from('reservation_cruise_car')
                .insert(extendedRows);

            if (insertResult.error && /does not exist|column/i.test(insertResult.error.message || '')) {
                console.warn('⚠️ 확장 컬럼 미지원, 기본 컬럼으로 저장 재시도');
                insertResult = await supabase
                    .from('reservation_cruise_car')
                    .insert(basicRows);
            }

            if (insertResult.error) throw insertResult.error;

            const pricing = calculateReservationPricing({
                serviceType: 'cruise_car',
                baseTotal: baseTotalPrice,
                additionalFee,
                additionalFeeDetail,
                lineItems: normalizedForms.map((item, index) => ({
                    label: `차량 ${index + 1}`,
                    code: item.rentcar_price_code || null,
                    unit_price: item.unit_price || 0,
                    quantity: item.car_count || 1,
                    total: item.car_total_price || 0,
                    metadata: {
                        way_type: item.way_type || null,
                        route: item.route || null,
                        vehicle_type: item.vehicle_type || null,
                        passenger_count: item.passenger_count || 0,
                    },
                })),
                metadata: {
                    total_passenger_count: totalPassengerCount,
                },
            });

            const reservationPayload: Record<string, any> = {
                total_amount: pricing.total_amount,
                pax_count: totalPassengerCount,
                price_breakdown: pricing.price_breakdown,
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

            // 변경 추적 기록 (cruise_car 다중 행)
            try {
                await recordReservationChange({
                    reservationId,
                    reType: 'cruise_car',
                    rows: { cruise_car: extendedRows.map((r) => { const { reservation_id, updated_at, ...rest } = r as any; return rest; }) },
                    managerNote: '크루즈 차량 예약 매니저 직접 수정',
                    snapshotData: {
                        price_breakdown: pricing.price_breakdown,
                        total_amount: pricing.total_amount,
                        manual_additional_fee: additionalFee,
                    },
                });
            } catch (trackErr) {
                console.warn('⚠️ 변경 추적 기록 실패(저장은 계속):', trackErr);
            }

            alert('크루즈 차량 예약이 성공적으로 수정되었습니다.');
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
        <ManagerLayout title="🚗 크루즈 차량 예약 수정" activeTab="reservation-edit-vehicle">
            <div className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 space-y-6">
                        <div className="bg-white rounded-lg shadow-sm p-4">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-medium text-gray-900 flex items-center gap-2">
                                    <Car className="w-5 h-5" />
                                    크루즈 차량 세부사항 수정
                                </h3>
                                <button
                                    type="button"
                                    onClick={addVehicleForm}
                                    className="px-3 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700"
                                >
                                    + 차량추가
                                </button>
                            </div>

                            <div className="space-y-6">
                                {vehicleForms.map((item, index) => {
                                    const routeOptions = item.way_type ? (routeOptionsByWay[item.way_type] || []) : [];
                                    const vehicleKey = `${item.way_type}__${item.route}`;
                                    const vehicleOptions = item.way_type && item.route
                                        ? (vehicleTypeOptionsByKey[vehicleKey] || [])
                                        : [];

                                    return (
                                        <div key={`vehicle-${index}`} className="border border-gray-200 rounded-lg p-4 space-y-4">
                                            <div className="flex items-center justify-between">
                                                <h4 className="font-medium text-gray-900">차량 {index + 1}</h4>
                                                <button
                                                    type="button"
                                                    onClick={() => removeVehicleForm(index)}
                                                    disabled={vehicleForms.length <= 1}
                                                    className="px-2 py-1 text-xs rounded border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-40"
                                                >
                                                    차량 삭제
                                                </button>
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-1">이용방식</label>
                                                    <select
                                                        value={item.way_type}
                                                        onChange={async (e) => {
                                                            const nextWayType = e.target.value;
                                                            updateVehicleFormWithAutoTotal(index, {
                                                                way_type: nextWayType,
                                                                route: '',
                                                                vehicle_type: '',
                                                                rentcar_price_code: '',
                                                                unit_price: 0,
                                                                manual_total: false,
                                                            });
                                                            if (nextWayType) {
                                                                await ensureRouteOptions(nextWayType);
                                                            }
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
                                                    <label className="block text-sm font-medium text-gray-700 mb-1">경로</label>
                                                    <select
                                                        value={item.route}
                                                        onChange={async (e) => {
                                                            const nextRoute = e.target.value;
                                                            updateVehicleFormWithAutoTotal(index, {
                                                                route: nextRoute,
                                                                vehicle_type: '',
                                                                rentcar_price_code: '',
                                                                unit_price: 0,
                                                                manual_total: false,
                                                            });
                                                            if (item.way_type && nextRoute) {
                                                                await ensureVehicleTypeOptions(item.way_type, nextRoute);
                                                            }
                                                        }}
                                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                                        disabled={!item.way_type}
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
                                                    <label className="block text-sm font-medium text-gray-700 mb-1">차량타입</label>
                                                    <select
                                                        value={item.vehicle_type}
                                                        onChange={async (e) => {
                                                            const nextType = e.target.value;
                                                            updateVehicleFormWithAutoTotal(index, {
                                                                vehicle_type: nextType,
                                                                rentcar_price_code: '',
                                                                manual_total: false,
                                                            });

                                                            const priceInfo = await findRentcarPrice(item.way_type, item.route, nextType);
                                                            if (priceInfo) {
                                                                updateVehicleFormWithAutoTotal(index, {
                                                                    rentcar_price_code: priceInfo.rent_code || '',
                                                                    way_type: priceInfo.way_type || item.way_type,
                                                                    route: priceInfo.route || item.route,
                                                                    vehicle_type: priceInfo.vehicle_type || nextType,
                                                                    unit_price: priceInfo.price || 0,
                                                                    manual_total: false,
                                                                });
                                                            }
                                                        }}
                                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                                        disabled={!item.way_type || !item.route}
                                                    >
                                                        <option value="">차량타입 선택</option>
                                                        {vehicleOptions.map((vehicleType) => (
                                                            <option key={vehicleType} value={vehicleType}>{vehicleType}</option>
                                                        ))}
                                                    </select>
                                                </div>

                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-1">차량 가격 코드 (rent_code)</label>
                                                    <input
                                                        type="text"
                                                        value={item.rentcar_price_code}
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
                                                        value={item.car_count}
                                                        onChange={(e) => updateVehicleFormWithAutoTotal(index, { car_count: parseInt(e.target.value, 10) || 0 })}
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
                                                        value={item.passenger_count}
                                                        onChange={(e) => updateVehicleFormWithAutoTotal(index, { passenger_count: parseInt(e.target.value, 10) || 0 })}
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
                                                        value={item.pickup_datetime}
                                                        onChange={(e) => updateVehicleForm(index, { pickup_datetime: e.target.value })}
                                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                                    />
                                                    <div className="mt-2 flex items-center justify-between gap-2 text-sm">
                                                        <span className="text-gray-600">
                                                            체크인 일자: <span className="font-medium text-gray-900">{cruiseCheckin || '-'}</span>
                                                        </span>
                                                        <button
                                                            type="button"
                                                            onClick={() => updateVehicleForm(index, { pickup_datetime: cruiseCheckin })}
                                                            disabled={!cruiseCheckin}
                                                            className="px-2 py-1 text-xs rounded border border-blue-200 text-blue-600 hover:bg-blue-50 disabled:text-gray-400 disabled:border-gray-200 disabled:cursor-not-allowed"
                                                        >
                                                            체크인 일자 복사
                                                        </button>
                                                    </div>
                                                </div>

                                                {(item.way_type === '당일왕복' || item.way_type === '다른날왕복') && (
                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                                            <Calendar className="inline w-4 h-4 mr-1" />
                                                            오는 편 날짜
                                                            <span className="ml-1 text-xs text-orange-500">(pier → 숙소)</span>
                                                        </label>
                                                        <input
                                                            type="date"
                                                            value={item.return_datetime}
                                                            onChange={(e) => updateVehicleForm(index, { return_datetime: e.target.value })}
                                                            className="w-full px-3 py-2 border border-orange-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 bg-orange-50"
                                                        />
                                                        <div className="mt-2 flex items-center gap-2">
                                                            <button
                                                                type="button"
                                                                onClick={() => copyPickupDateToReturnDate(index, 'next-day')}
                                                                disabled={!item.pickup_datetime}
                                                                className="px-2 py-1 text-xs rounded border border-orange-200 text-orange-600 hover:bg-orange-50 disabled:text-gray-400 disabled:border-gray-200 disabled:cursor-not-allowed"
                                                            >
                                                                픽업 다음일 복사
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => copyPickupDateToReturnDate(index, 'same-day')}
                                                                disabled={!item.pickup_datetime}
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
                                                        value={item.pickup_location}
                                                        onChange={(e) => updateVehicleForm(index, { pickup_location: e.target.value })}
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
                                                        value={item.dropoff_location}
                                                        onChange={(e) => updateVehicleForm(index, { dropoff_location: e.target.value })}
                                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                                        placeholder="드롭오프 위치 입력"
                                                    />
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-1">단가 (VND)</label>
                                                    <input
                                                        type="number"
                                                        value={item.unit_price}
                                                        onChange={(e) => updateVehicleFormWithAutoTotal(index, { unit_price: parseInt(e.target.value, 10) || 0 })}
                                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                                        min="0"
                                                    />
                                                </div>

                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-1">총 가격 (VND)</label>
                                                    <input
                                                        type="number"
                                                        value={item.car_total_price}
                                                        onChange={(e) => updateVehicleForm(index, {
                                                            car_total_price: parseInt(e.target.value, 10) || 0,
                                                            manual_total: true
                                                        })}
                                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-bold text-green-600"
                                                        min="0"
                                                    />
                                                </div>
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">배차 코드</label>
                                                <input
                                                    type="text"
                                                    value={item.dispatch_code}
                                                    onChange={(e) => updateVehicleForm(index, { dispatch_code: e.target.value })}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">요청 사항</label>
                                                <textarea
                                                    value={item.request_note}
                                                    onChange={(e) => updateVehicleForm(index, { request_note: e.target.value })}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                                    rows={3}
                                                    placeholder="특별 요청사항을 입력하세요"
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">배차 메모</label>
                                                <textarea
                                                    value={item.dispatch_memo}
                                                    onChange={(e) => updateVehicleForm(index, { dispatch_memo: e.target.value })}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                                    rows={3}
                                                    placeholder="배차 관련 메모를 입력하세요"
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div className="bg-white rounded-lg shadow-sm p-4">
                            <h3 className="text-lg font-medium text-gray-900 mb-4">요금/추가내역</h3>
                            <div className="space-y-3">
                                <div className="mt-4 pt-4 border-t border-gray-100 space-y-4">
                                    <div>
                                        <h4 className="text-sm font-semibold text-gray-800">추가내역 / 추가요금</h4>
                                        <p className="text-xs text-gray-500 mt-1">추가요금을 조정하면 최종 합계를 바로 확인할 수 있습니다.</p>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">추가내역 선택</label>
                                        <select
                                            title="추가내역 선택"
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                                            value=""
                                            onChange={(e) => {
                                                const tpl = feeTemplates.find(t => String(t.id) === e.target.value);
                                                if (tpl) {
                                                    setAdditionalFee(tpl.amount);
                                                    setAdditionalFeeDetail(tpl.name);
                                                }
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

                                {(baseTotalPrice > 0 || additionalFee > 0) && (
                                    <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">기본 차량 금액</label>
                                            <div className="text-lg font-semibold text-gray-900">
                                                {baseTotalPrice.toLocaleString()}동
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
