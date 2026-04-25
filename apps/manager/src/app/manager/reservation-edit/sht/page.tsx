'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import supabase from '@/lib/supabase';
import { saveAdditionalFeeTemplateFromInput } from '@/lib/additionalFeeTemplate';
import ManagerLayout from '@/components/ManagerLayout';
import ShtCarSeatMap from '@/components/ShtCarSeatMap';
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
    Bus,
    LayoutGrid,
    DollarSign
} from 'lucide-react';

// 좌석 타입별 단가 정의 (VND) - rentcar_price 테이블 기준
const SHT_SEAT_PRICES: Record<string, number> = {
    A: 1050000,    // rentcar_price에서 조회
    B: 850000,     // rentcar_price에서 조회
    C: 650000,     // rentcar_price에서 조회
    ALL: 5400000,  // rentcar_price에서 조회 (단독 전체 좌석)
};

// 좌석 ID → 좌석 타입 매핑
function getSeatType(seatId: string): string {
    const id = seatId.trim().toUpperCase();
    if (id === 'ALL') return 'ALL';
    if (id.startsWith('A')) return 'A';
    if (id.startsWith('B')) return 'B';
    if (id.startsWith('C')) return 'C';
    return 'A'; // 기본값
}

// 좌석 문자열 → 타입별 그룹 및 가격 계산
function calcSeatPriceBreakdown(seatStr: string): { type: string; seats: string[]; unitPrice: number; subtotal: number }[] {
    if (!seatStr) return [];
    const seats = seatStr.split(',').map(s => s.trim()).filter(Boolean);

    if (seats.length === 1 && seats[0].toUpperCase() === 'ALL') {
        return [{ type: 'ALL', seats: ['ALL'], unitPrice: SHT_SEAT_PRICES.ALL, subtotal: SHT_SEAT_PRICES.ALL }];
    }

    const groups: Record<string, string[]> = {};
    for (const seat of seats) {
        const type = getSeatType(seat);
        if (!groups[type]) groups[type] = [];
        groups[type].push(seat.toUpperCase());
    }

    return Object.entries(groups).map(([type, seatList]) => ({
        type,
        seats: seatList,
        unitPrice: SHT_SEAT_PRICES[type] || 0,
        subtotal: (SHT_SEAT_PRICES[type] || 0) * seatList.length,
    }));
}

// 좌석 문자열 → 총 가격
function calcSeatTotalPrice(seatStr: string): number {
    return calcSeatPriceBreakdown(seatStr).reduce((sum, g) => sum + g.subtotal, 0);
}

function getShtCalculatedPrice(
    seatStr: string,
    priceMap: Record<string, number>,
    carPriceCode: string,
    priceByCode: Record<string, number>,
): { totalPrice: number; unitPrice: number; passengerCount: number } {
    const breakdown = calcSeatPriceBreakdown(seatStr);
    const normalizedCode = String(carPriceCode || '').trim().toUpperCase();
    const allPriceFromCode = normalizedCode ? Number(priceByCode[normalizedCode] || 0) : 0;
    const getUnitPrice = (seatType: string) => {
        if (seatType === 'ALL') return allPriceFromCode > 0 ? allPriceFromCode : Number(priceMap.ALL || 0);
        return Number(priceMap[seatType] || 0);
    };

    const totalPrice = breakdown.reduce((sum, g) => sum + getUnitPrice(g.type) * g.seats.length, 0);
    const hasAll = breakdown.some((g) => g.type === 'ALL');
    const seatCount = hasAll
        ? 1
        : breakdown.reduce((n, g) => n + g.seats.length, 0);
    const passengerCount = hasAll
        ? 10
        : breakdown.reduce((n, g) => n + g.seats.length, 0);

    return {
        totalPrice,
        unitPrice: hasAll ? getUnitPrice('ALL') : (seatCount > 0 ? Math.round(totalPrice / seatCount) : 0),
        passengerCount,
    };
}

function resolveShtSeatTypeFromText(text: string): 'A' | 'B' | 'C' | 'ALL' | null {
    const normalized = text.toUpperCase();

    if (normalized.includes('단독') || normalized.includes('ALL') || normalized.includes('전체')) {
        return 'ALL';
    }
    if (normalized.includes('셔틀 리무진 A') || normalized.includes('리무진 A') || normalized === 'A') {
        return 'A';
    }
    if (normalized.includes('셔틀 리무진 B') || normalized.includes('리무진 B') || normalized === 'B') {
        return 'B';
    }
    if (normalized.includes('셔틀 리무진 C') || normalized.includes('리무진 C') || normalized === 'C') {
        return 'C';
    }

    return null;
}

function pickFirstFilled<T>(...values: Array<T | null | undefined>): T | undefined {
    for (const value of values) {
        if (value === null || value === undefined) continue;
        if (typeof value === 'string' && value.trim() === '') continue;
        return value;
    }
    return undefined;
}

function toDateInputValue(value: unknown): string {
    if (!value) return '';
    const raw = String(value).trim();
    if (!raw) return '';

    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

    const normalized = raw.replace(' ', 'T');
    const parsed = new Date(normalized);
    if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString().slice(0, 10);
    }

    return normalized.slice(0, 10);
}

function normalizeShtCategory(value: unknown): 'Pickup' | 'Drop-off' {
    const raw = String(value || '').toLowerCase();
    if (raw.includes('drop') || raw.includes('sending') || raw.includes('샌딩')) {
        return 'Drop-off';
    }
    return 'Pickup';
}

function isRoundTripPriceCode(value: unknown): boolean {
    const code = String(value || '').toUpperCase();
    return code.includes('2WAY') || code.includes('ROUND') || code.includes('왕복');
}

function buildFormFromRows(row: any, fallback: any, reservationId: string | null) {
    const defaultSHTInfo = {
        reservation_id: reservationId,
        vehicle_number: '',
        seat_number: '',
        sht_category: '',
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
        dispatch_memo: '',
        pickup_confirmed_at: ''
    };

    return {
        vehicle_number: String(pickFirstFilled(row?.vehicle_number, fallback?.vehicle_number, defaultSHTInfo.vehicle_number) || ''),
        seat_number: String(pickFirstFilled(row?.seat_number, fallback?.seat_number, defaultSHTInfo.seat_number) || ''),
        sht_category: String(pickFirstFilled(row?.sht_category, fallback?.way_type, defaultSHTInfo.sht_category) || ''),
        car_price_code: String(
            pickFirstFilled(
                row?.car_price_code,
                fallback?.car_price_code,
                fallback?.rentcar_price_code,
                defaultSHTInfo.car_price_code
            ) || ''
        ),
        car_count: Number(pickFirstFilled(row?.car_count, fallback?.car_count, defaultSHTInfo.car_count) || 0),
        passenger_count: Number(pickFirstFilled(row?.passenger_count, fallback?.passenger_count, defaultSHTInfo.passenger_count) || 0),
        pickup_datetime: toDateInputValue(pickFirstFilled(row?.pickup_datetime, fallback?.pickup_datetime, defaultSHTInfo.pickup_datetime)),
        pickup_location: String(
            pickFirstFilled(
                row?.pickup_location,
                fallback?.pickup_location,
                fallback?.route_from,
                defaultSHTInfo.pickup_location
            ) || ''
        ),
        dropoff_location: String(
            pickFirstFilled(
                row?.dropoff_location,
                fallback?.dropoff_location,
                fallback?.route_to,
                defaultSHTInfo.dropoff_location
            ) || ''
        ),
        car_total_price: Number(pickFirstFilled(row?.car_total_price, fallback?.car_total_price, defaultSHTInfo.car_total_price) || 0),
        unit_price: Number(pickFirstFilled(row?.unit_price, fallback?.unit_price, defaultSHTInfo.unit_price) || 0),
        request_note: String(pickFirstFilled(row?.request_note, fallback?.request_note, defaultSHTInfo.request_note) || ''),
        dispatch_code: String(pickFirstFilled(row?.dispatch_code, fallback?.dispatch_code, defaultSHTInfo.dispatch_code) || ''),
        dispatch_memo: String(pickFirstFilled(row?.dispatch_memo, fallback?.dispatch_memo, defaultSHTInfo.dispatch_memo) || ''),
        pickup_confirmed_at: String(
            pickFirstFilled(row?.pickup_confirmed_at, fallback?.pickup_confirmed_at, defaultSHTInfo.pickup_confirmed_at) || ''
        ),
    };
}

interface SHTReservation {
    reservation_id: string;
    vehicle_number: string;
    seat_number: string;
    sht_category: string;
    car_price_code: string;
    car_count: number;
    passenger_count: number;
    pickup_datetime: string;
    pickup_location: string;
    dropoff_location: string;
    car_total_price: number;
    unit_price: number;
    request_note: string;
    dispatch_code: string;
    dispatch_memo: string;
    pickup_confirmed_at: string;
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

interface ShtFormData {
    vehicle_number: string;
    seat_number: string;
    sht_category: string;
    car_price_code: string;
    car_count: number;
    passenger_count: number;
    pickup_datetime: string;
    pickup_location: string;
    dropoff_location: string;
    car_total_price: number;
    unit_price: number;
    request_note: string;
    dispatch_code: string;
    dispatch_memo: string;
    pickup_confirmed_at: string;
}

type ShtFormsState = Record<'Pickup' | 'Drop-off', ShtFormData>;

const EMPTY_SHT_FORM_PICKUP: ShtFormData = { vehicle_number: '', seat_number: '', sht_category: 'Pickup', car_price_code: '', car_count: 0, passenger_count: 0, pickup_datetime: '', pickup_location: '', dropoff_location: '', car_total_price: 0, unit_price: 0, request_note: '', dispatch_code: '', dispatch_memo: '', pickup_confirmed_at: '' };
const EMPTY_SHT_FORM_DROPOFF: ShtFormData = { vehicle_number: '', seat_number: '', sht_category: 'Drop-off', car_price_code: '', car_count: 0, passenger_count: 0, pickup_datetime: '', pickup_location: '', dropoff_location: '', car_total_price: 0, unit_price: 0, request_note: '', dispatch_code: '', dispatch_memo: '', pickup_confirmed_at: '' };

function SHTReservationEditContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const reservationId = searchParams.get('id');

    const [reservation, setReservation] = useState<SHTReservation | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [isSeatMapOpen, setIsSeatMapOpen] = useState(false);
    const [seatPriceMap, setSeatPriceMap] = useState<Record<string, number>>(SHT_SEAT_PRICES);
    const [seatPriceByCode, setSeatPriceByCode] = useState<Record<string, number>>({});
    const [seatCodeByType, setSeatCodeByType] = useState<Record<string, string>>({});
    const [activeCategory, setActiveCategory] = useState<'Pickup' | 'Drop-off'>('Pickup');
    const [shtForms, setShtForms] = useState<ShtFormsState>({
        Pickup: { ...EMPTY_SHT_FORM_PICKUP },
        'Drop-off': { ...EMPTY_SHT_FORM_DROPOFF },
    });
    const [additionalFees, setAdditionalFees] = useState<Record<'Pickup' | 'Drop-off', { fee: number; detail: string }>>({
        Pickup: { fee: 0, detail: '' },
        'Drop-off': { fee: 0, detail: '' },
    });
    const [feeTemplates, setFeeTemplates] = useState<{ id: number; name: string; amount: number }[]>([]);

    const formData = shtForms[activeCategory];
    // 차량가격은 왕복요금이므로 픽업에만 총액 반영, 드롭은 0원 처리
    const pickupBaseTotal = Number(shtForms['Pickup'].car_total_price || 0);
    const pickupAdditionalFee = additionalFees['Pickup'].fee;
    const dropoffAdditionalFee = additionalFees['Drop-off'].fee;
    const overallShtBaseTotal = pickupBaseTotal;
    const finalReservationTotal = pickupBaseTotal + pickupAdditionalFee + dropoffAdditionalFee;
    const updateActiveForm = (updates: Partial<typeof formData>) => {
        setShtForms(prev => ({ ...prev, [activeCategory]: { ...prev[activeCategory], ...updates } }));
    };

    useEffect(() => {
        loadShtSeatPrices();
        supabase
            .from('additional_fee_template')
            .select('id, name, amount')
            .or('service_type.is.null,service_type.eq.sht')
            .eq('is_active', true)
            .order('sort_order')
            .then(({ data }) => { if (data) setFeeTemplates(data); });
    }, []);

    useEffect(() => {
        if (reservationId) {
            loadReservation();
        } else {
            router.push('/manager/reservation-edit');
        }
    }, [reservationId]);

    const loadShtSeatPrices = async () => {
        try {
            const { data, error } = await supabase
                .from('rentcar_price')
                .select('rent_code, category, vehicle_type, description, price')
                .or('vehicle_type.ilike.%스테이하롱 셔틀 리무진%,vehicle_type.in.(A,B,C,ALL),vehicle_type.ilike.%단독%,description.ilike.%스테이하롱 셔틀 리무진%,category.ilike.%sht%')
                .limit(200);

            if (error) {
                console.warn('⚠️ SHT 좌석 가격 조회 실패, 기본값 사용:', error);
                setSeatPriceMap(SHT_SEAT_PRICES);
                setSeatPriceByCode({});
                setSeatCodeByType({});
                return;
            }

            const mapped: Record<string, number> = {};
            const priceByCode: Record<string, number> = {};
            const codeByType: Record<string, string> = {};
            let allPriceFallback = 0;
            let allPriceSolo = 0;
            let allCodeFallback = '';
            let allCodeSolo = '';
            for (const row of data || []) {
                const sourceText = [row.vehicle_type, row.category, row.description, row.rent_code]
                    .filter(Boolean)
                    .join(' ');
                const seatType = resolveShtSeatTypeFromText(sourceText);
                const price = Number(row.price || 0);
                const rentCode = String(row.rent_code || '').trim().toUpperCase();

                if (rentCode && price > 0) {
                    priceByCode[rentCode] = price;
                }

                if (seatType && price > 0) {
                    if (seatType === 'ALL') {
                        const normalizedSource = sourceText.toUpperCase();
                        const isSolo = normalizedSource.includes('SOLO') || normalizedSource.includes('단독') || normalizedSource.includes('ALL');
                        allPriceFallback = Math.max(allPriceFallback, price);
                        if (!allCodeFallback && rentCode) allCodeFallback = rentCode;
                        if (isSolo) {
                            if (price >= allPriceSolo) {
                                allPriceSolo = price;
                                if (rentCode) allCodeSolo = rentCode;
                            }
                        }
                    } else {
                        mapped[seatType] = price;
                        if (rentCode && !codeByType[seatType]) codeByType[seatType] = rentCode;
                    }
                }
            }

            if (allPriceSolo > 0) {
                mapped.ALL = allPriceSolo;
                if (allCodeSolo) codeByType.ALL = allCodeSolo;
            } else if (allPriceFallback > 0) {
                mapped.ALL = allPriceFallback;
                if (allCodeFallback) codeByType.ALL = allCodeFallback;
            }

            const merged = {
                ...SHT_SEAT_PRICES,
                ...mapped,
            };

            console.log('✅ SHT 좌석 가격 적용:', merged);
            setSeatPriceMap(merged);
            setSeatPriceByCode(priceByCode);
            setSeatCodeByType(codeByType);
        } catch (err) {
            console.warn('⚠️ SHT 좌석 가격 로드 중 예외, 기본값 사용:', err);
            setSeatPriceMap(SHT_SEAT_PRICES);
            setSeatPriceByCode({});
            setSeatCodeByType({});
        }
    };

    const loadReservation = async () => {
        try {
            console.log('🔄 스하차량 예약 데이터 로드 시작...', reservationId);
            setLoading(true);

            // 1) 예약 기본 정보 조회
            const { data: resRow, error: resErr } = await supabase
                .from('reservation')
                .select('re_id, re_type, re_status, re_created_at, re_quote_id, re_user_id, total_amount, price_breakdown, manual_additional_fee, manual_additional_fee_detail')
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

            // 3) 서비스 상세 (스하차량 + 크루즈차량 폴백)
            const [shtResult, cruiseCarResult] = await Promise.all([
                supabase
                    .from('reservation_car_sht')
                    .select('*')
                    .eq('reservation_id', reservationId)
                    .order('created_at', { ascending: true }),
                supabase
                    .from('reservation_cruise_car')
                    .select('*')
                    .eq('reservation_id', reservationId)
                    .limit(1)
                    .maybeSingle(),
            ]);

            if (shtResult.error) {
                console.warn('⚠️ 스하차량 예약 상세 조회 실패:', shtResult.error);
            }
            if (cruiseCarResult.error) {
                console.warn('⚠️ 크루즈 차량 상세 조회 실패:', cruiseCarResult.error);
            }

            const shtRows = Array.isArray(shtResult.data) ? shtResult.data : [];
            const cruiseCarRow = cruiseCarResult.data;

            const pickupRow = shtRows.find((row: any) => normalizeShtCategory(row?.sht_category) === 'Pickup') || null;
            const dropoffRow = shtRows.find((row: any) => normalizeShtCategory(row?.sht_category) === 'Drop-off') || null;

            const pickupForm = buildFormFromRows(pickupRow, cruiseCarRow, reservationId);
            pickupForm.sht_category = 'Pickup';
            const dropoffForm = buildFormFromRows(dropoffRow, null, reservationId);
            dropoffForm.sht_category = 'Drop-off';

            // 왕복 코드인데 드롭 데이터가 없거나 금액이 0이면 픽업 금액/코드를 드롭에 보정
            if (isRoundTripPriceCode(pickupForm.car_price_code)) {
                const dropMissingOrZero = !dropoffRow || Number(dropoffForm.car_total_price || 0) <= 0;
                if (dropMissingOrZero) {
                    dropoffForm.car_price_code = pickupForm.car_price_code;
                    dropoffForm.unit_price = Number(pickupForm.unit_price || 0);
                    dropoffForm.car_total_price = Number(pickupForm.car_total_price || 0);
                    if (!dropoffForm.passenger_count && pickupForm.passenger_count) {
                        dropoffForm.passenger_count = pickupForm.passenger_count;
                    }
                }
            }

            setShtForms({
                Pickup: pickupForm,
                'Drop-off': dropoffForm,
            });

            // 픽업/드롭 추가요금 각각 로드
            const pb = resRow.price_breakdown || {};
            const savedPickupFee = Number.isFinite(Number(pb.pickup_additional_fee)) ? Number(pb.pickup_additional_fee) : 0;
            const savedDropoffFee = Number.isFinite(Number(pb.dropoff_additional_fee)) ? Number(pb.dropoff_additional_fee) : 0;
            // 구버전 데이터(통합 additional_fee)가 있고 픽업/드롭 분리값이 없으면 픽업에 할당
            if (savedPickupFee === 0 && savedDropoffFee === 0) {
                const legacyFee = Number.isFinite(Number(pb.additional_fee)) ? Number(pb.additional_fee) : Number(resRow.manual_additional_fee || 0);
                const legacyDetail = String(resRow.manual_additional_fee_detail || pb.additional_fee_detail || pb.additional_fee_note || '');
                if (legacyFee > 0) {
                    setAdditionalFees({
                        Pickup: { fee: legacyFee, detail: legacyDetail },
                        'Drop-off': { fee: 0, detail: '' },
                    });
                }
            } else {
                setAdditionalFees({
                    Pickup: { fee: savedPickupFee, detail: String(pb.pickup_additional_fee_detail || '') },
                    'Drop-off': { fee: savedDropoffFee, detail: String(pb.dropoff_additional_fee_detail || '') },
                });
            }

            if (dropoffRow && !pickupRow) {
                setActiveCategory('Drop-off');
            } else {
                setActiveCategory('Pickup');
            }

            const preferredRow = pickupRow || dropoffRow;

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

            const mergedFallback = buildFormFromRows(preferredRow, cruiseCarRow, reservationId);

            const fullReservation: SHTReservation = {
                ...mergedFallback,
                reservation_id: (mergedFallback as any).reservation_id || reservationId || '',
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

        } catch (error) {
            console.error('❌ 스하차량 예약 로드 실패:', error);
            alert('스하차량 예약 정보를 불러오는데 실패했습니다.');
            router.push('/manager/reservation-edit');
        } finally {
            setLoading(false);
        }
    };

    const handleSeatSelect = (seatInfo: { vehicle: string; seat: string; category: string; usageDate?: string }) => {
        const normalizedSeat = String(seatInfo.seat || '').trim().toUpperCase();
        const autoCode = normalizedSeat === 'ALL' ? (seatCodeByType.ALL || formData.car_price_code) : formData.car_price_code;
        const calculated = getShtCalculatedPrice(seatInfo.seat, seatPriceMap, autoCode, seatPriceByCode);
        updateActiveForm({
            vehicle_number: seatInfo.vehicle,
            seat_number: seatInfo.seat,
            pickup_datetime: seatInfo.usageDate || formData.pickup_datetime,
            car_price_code: autoCode,
            car_total_price: calculated.totalPrice,
            unit_price: calculated.unitPrice,
            passenger_count: calculated.passengerCount,
        });
        setIsSeatMapOpen(false);
    };

    const handleSave = async () => {
        if (!reservation) return;

        try {
            setSaving(true);
            console.log('💾 스하차량 예약 수정 저장 시작...');

            // 저장할 데이터 (reservation_id는 필수)
            const normalizedCategory = activeCategory;
            const payload: Record<string, any> = {
                reservation_id: reservationId,
                vehicle_number: formData.vehicle_number || null,
                seat_number: formData.seat_number || null,
                sht_category: normalizedCategory,
                car_price_code: formData.car_price_code || null,
                car_count: formData.car_count,
                passenger_count: formData.passenger_count,
                pickup_datetime: formData.pickup_datetime || null,
                pickup_location: formData.pickup_location || null,
                dropoff_location: formData.dropoff_location || null,
                car_total_price: formData.car_total_price || 0,
                unit_price: formData.unit_price || 0,
                request_note: formData.request_note || null,
                dispatch_code: formData.dispatch_code || null,
                dispatch_memo: formData.dispatch_memo || null,
                pickup_confirmed_at: formData.pickup_confirmed_at || null,
            };

            console.log('📤 기존 데이터 삭제 후 새로 삽입 시작:', payload);

            // 1. 현재 카테고리(Pickup/Drop-off) 데이터만 삭제
            const { error: deleteError } = await supabase
                .from('reservation_car_sht')
                .delete()
                .eq('reservation_id', reservationId)
                .in('sht_category', normalizedCategory === 'Pickup' ? ['Pickup', 'pickup', '픽업'] : ['Drop-off', 'dropoff', 'drop-off', 'sending', '샌딩']);

            if (deleteError) {
                console.error('❌ 기존 데이터 삭제 실패:', deleteError);
                throw deleteError;
            }

            console.log('✅ 기존 데이터 삭제 완료');

            // 2. 새 데이터 삽입
            const { data: insertedData, error: insertError } = await supabase
                .from('reservation_car_sht')
                .insert(payload)
                .select();

            if (insertError) {
                console.error('❌ 스하차량 저장 실패:', insertError);
                throw insertError;
            }

            console.log('✅ 스하차량 저장 완료, 저장된 행:', insertedData?.length || 0, insertedData);

            if (!insertedData || insertedData.length === 0) {
                throw new Error('스하차량 정보 저장에 실패했습니다.');
            }

            // 3. 메인 예약 테이블 동기화 (픽업 차량가격만 base, 드롭은 0)
            const { data: allRows, error: allRowsError } = await supabase
                .from('reservation_car_sht')
                .select('car_total_price, passenger_count, sht_category')
                .eq('reservation_id', reservationId);

            if (allRowsError) {
                console.error('⚠️ 스하차량 합계 조회 실패:', allRowsError);
            }

            // 차량가격은 왕복요금이므로 픽업 행의 금액만 합산
            const pickupRows = (allRows || []).filter((row: any) => normalizeShtCategory(row?.sht_category) === 'Pickup');
            const basePickupTotal = pickupRows.reduce((sum: number, row: any) => sum + Number(row?.car_total_price || 0), 0);
            const totalPax = (allRows || []).reduce((sum: number, row: any) => sum + Number(row?.passenger_count || 0), 0);
            const totalAdditionalFee = pickupAdditionalFee + dropoffAdditionalFee;
            const finalTotalAmount = basePickupTotal + totalAdditionalFee;

            const reservationPayload: Record<string, any> = {
                total_amount: finalTotalAmount,
                pax_count: totalPax,
                price_breakdown: {
                    type: 'sht',
                    base_total: basePickupTotal,
                    pickup_additional_fee: pickupAdditionalFee,
                    pickup_additional_fee_detail: additionalFees['Pickup'].detail || null,
                    dropoff_additional_fee: dropoffAdditionalFee,
                    dropoff_additional_fee_detail: additionalFees['Drop-off'].detail || null,
                    additional_fee: totalAdditionalFee,
                    additional_fee_detail: [additionalFees['Pickup'].detail, additionalFees['Drop-off'].detail].filter(Boolean).join(' / ') || null,
                    grand_total: finalTotalAmount,
                },
                manual_additional_fee: totalAdditionalFee,
                manual_additional_fee_detail: [additionalFees['Pickup'].detail, additionalFees['Drop-off'].detail].filter(Boolean).join(' / ') || null,
                re_update_at: new Date().toISOString(),
            };

            const { error: reservationError } = await supabase
                .from('reservation')
                .update(reservationPayload)
                .eq('re_id', reservationId);

            if (reservationError) {
                console.error('⚠️ 예약 테이블 동기화 실패:', reservationError);
            }

            await saveAdditionalFeeTemplateFromInput({
                serviceType: 'sht',
                detail: additionalFees['Pickup'].detail,
                amount: pickupAdditionalFee,
            });
            await saveAdditionalFeeTemplateFromInput({
                serviceType: 'sht',
                detail: additionalFees['Drop-off'].detail,
                amount: dropoffAdditionalFee,
            });

            console.log('✅ 스하차량 예약 수정 완료');
            alert('스하차량 예약이 성공적으로 수정되었습니다.');

            // 데이터 다시 로드 + Next.js 라우터 캐시 무효화 (상세 모달 최신화)
            router.refresh();
            await loadReservation();

        } catch (error) {
            console.error('❌ 저장 오류:', error);
            const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
            alert(`저장 중 오류가 발생했습니다: ${errorMessage}`);
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <ManagerLayout title="🚌 스하차량 예약 수정" activeTab="reservation-edit-sht">
                <div className="flex justify-center items-center h-64">
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
                        <p className="mt-4 text-gray-600">스하차량 예약 데이터를 불러오는 중...</p>
                    </div>
                </div>
            </ManagerLayout>
        );
    }

    if (!reservation) {
        return (
            <ManagerLayout title="🚌 스하차량 예약 수정" activeTab="reservation-edit-sht">
                <div className="text-center py-12">
                    <Bus className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">예약을 찾을 수 없습니다</h3>
                    <p className="text-gray-600 mb-4">요청하신 스하차량 예약 정보를 찾을 수 없습니다.</p>
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
        <ManagerLayout title="🚌 스하차량 예약 수정" activeTab="reservation-edit-sht">
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
                        <h1 className="text-xl font-bold text-gray-900">스하차량 예약 수정</h1>
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
                            <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center justify-between">
                                <span className="flex items-center gap-2">
                                    <Bus className="w-5 h-5" />
                                    스하차량 세부사항 수정
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setIsSeatMapOpen(true)}
                                    className="inline-flex items-center gap-2 px-3 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
                                >
                                    <LayoutGrid className="w-4 h-4" />
                                    좌석 선택
                                </button>
                            </h3>
                            <div className="mb-4 flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => setActiveCategory('Pickup')}
                                    className={`px-3 py-1.5 rounded-lg border text-sm ${activeCategory === 'Pickup'
                                        ? 'bg-blue-50 border-blue-400 text-blue-700'
                                        : 'bg-white border-gray-200 text-gray-600'
                                        }`}
                                >
                                    픽업 수정
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setActiveCategory('Drop-off')}
                                    className={`px-3 py-1.5 rounded-lg border text-sm ${activeCategory === 'Drop-off'
                                        ? 'bg-blue-50 border-blue-400 text-blue-700'
                                        : 'bg-white border-gray-200 text-gray-600'
                                        }`}
                                >
                                    드롭오프 수정
                                </button>
                                <span className="text-xs text-gray-500 self-center">
                                    현재 수정: {activeCategory === 'Pickup' ? '픽업' : '드롭오프'}
                                </span>
                            </div>
                            <div className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            <Car className="inline w-4 h-4 mr-1" />
                                            차량 번호
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.vehicle_number}
                                            onChange={(e) => updateActiveForm({ vehicle_number: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                            placeholder="예: Vehicle 1"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            좌석 번호
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.seat_number}
                                            onChange={(e) => {
                                                const seatStr = e.target.value;
                                                const calculated = getShtCalculatedPrice(seatStr, seatPriceMap, formData.car_price_code, seatPriceByCode);
                                                updateActiveForm({
                                                    seat_number: seatStr,
                                                    car_total_price: calculated.totalPrice,
                                                    unit_price: calculated.unitPrice,
                                                    passenger_count: calculated.passengerCount,
                                                });
                                            }}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                            placeholder="예: A1, B2"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            <Users className="inline w-4 h-4 mr-1" />
                                            차량 대수
                                        </label>
                                        <input
                                            type="number"
                                            value={formData.car_count}
                                            onChange={(e) => updateActiveForm({ car_count: parseInt(e.target.value) || 0 })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                            min="0"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            승객 수
                                        </label>
                                        <input
                                            type="number"
                                            value={formData.passenger_count}
                                            onChange={(e) => updateActiveForm({ passenger_count: parseInt(e.target.value) || 0 })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                            min="0"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        <Calendar className="inline w-4 h-4 mr-1" />
                                        픽업 일시
                                    </label>
                                    <input
                                        type="date"
                                        value={formData.pickup_datetime}
                                        onChange={(e) => updateActiveForm({ pickup_datetime: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    />
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
                                            onChange={(e) => updateActiveForm({ pickup_location: e.target.value })}
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
                                            onChange={(e) => updateActiveForm({ dropoff_location: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                            placeholder="드롭오프 위치 입력"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        요청 사항
                                    </label>
                                    <textarea
                                        value={formData.request_note}
                                        onChange={(e) => updateActiveForm({ request_note: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                        rows={3}
                                        placeholder="특별 요청사항을 입력하세요"
                                    />
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="md:col-span-2">
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            배차 코드
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.dispatch_code}
                                            onChange={(e) => updateActiveForm({ dispatch_code: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                                            onChange={(e) => updateActiveForm({ unit_price: parseFloat(e.target.value) || 0 })}
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
                                            onChange={(e) => updateActiveForm({ car_total_price: parseFloat(e.target.value) || 0 })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                            min="0"
                                        />
                                    </div>
                                </div>

                                {/* 좌석별 단가 내역 표시 */}
                                {formData.seat_number && (
                                    <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                                        <h4 className="text-sm font-medium text-blue-800 mb-3 flex items-center gap-2">
                                            <DollarSign className="w-4 h-4" />
                                            좌석별 단가 내역
                                        </h4>
                                        <div className="space-y-2">
                                            {calcSeatPriceBreakdown(formData.seat_number).map((group) => (
                                                <div key={group.type} className="flex items-center justify-between bg-white rounded px-3 py-2 text-sm">
                                                    <div className="flex items-center gap-2">
                                                        <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold text-white ${group.type === 'A' ? 'bg-blue-500' :
                                                            group.type === 'B' ? 'bg-purple-500' :
                                                                group.type === 'C' ? 'bg-amber-500' :
                                                                    'bg-red-500'
                                                            }`}>
                                                            {group.type === 'ALL' ? '단독' : group.type}
                                                        </span>
                                                        <span className="text-gray-700">
                                                            {group.type === 'ALL' ? '전 좌석 단독' : `${group.seats.join(', ')}`}
                                                        </span>
                                                        <span className="text-gray-400 text-xs">
                                                            ({group.type === 'ALL' ? '1건' : `${group.seats.length}석`})
                                                        </span>
                                                    </div>
                                                    <div className="text-right">
                                                        <span className="text-gray-500 text-xs mr-2">
                                                            @{(seatPriceMap[group.type] || 0).toLocaleString()}동
                                                        </span>
                                                        <span className="font-semibold text-blue-700">
                                                            {((seatPriceMap[group.type] || 0) * group.seats.length).toLocaleString()}동
                                                        </span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="mt-3 pt-3 border-t border-blue-200 flex justify-between items-center">
                                            <span className="text-sm font-medium text-blue-800">계산된 총 가격</span>
                                            <span className="text-lg font-bold text-red-600">
                                                {calcSeatPriceBreakdown(formData.seat_number).reduce((sum, g) => {
                                                    const unitPrice = seatPriceMap[g.type] || 0;
                                                    return sum + unitPrice * g.seats.length;
                                                }, 0).toLocaleString()}동
                                            </span>
                                        </div>
                                        {formData.car_total_price !== calcSeatPriceBreakdown(formData.seat_number).reduce((sum, g) => {
                                            const unitPrice = seatPriceMap[g.type] || 0;
                                            return sum + unitPrice * g.seats.length;
                                        }, 0) && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const calculated = getShtCalculatedPrice(formData.seat_number, seatPriceMap, formData.car_price_code, seatPriceByCode);
                                                        updateActiveForm({
                                                            car_total_price: calculated.totalPrice,
                                                            unit_price: calculated.unitPrice,
                                                            passenger_count: calculated.passengerCount,
                                                        });
                                                    }}
                                                    className="mt-2 w-full text-center text-xs text-blue-600 hover:text-blue-800 underline"
                                                >
                                                    계산된 가격으로 적용하기
                                                </button>
                                            )}
                                    </div>
                                )}

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        배차 메모
                                    </label>
                                    <textarea
                                        value={formData.dispatch_memo}
                                        onChange={(e) => updateActiveForm({ dispatch_memo: e.target.value })}
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
                                        <p className="text-xs text-gray-500 mt-1">현재 선택된 {activeCategory === 'Pickup' ? '픽업' : '드롭'} 기준으로 추가요금을 수정하면 합계가 즉시 반영됩니다.</p>
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
                                                    setAdditionalFees(prev => ({
                                                        ...prev,
                                                        [activeCategory]: { fee: tpl.amount, detail: tpl.name }
                                                    }));
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
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            {activeCategory === 'Pickup' ? '픽업' : '드롭'} 추가요금 (VND)
                                        </label>
                                        <input
                                            type="number"
                                            value={additionalFees[activeCategory].fee}
                                            onChange={(e) => setAdditionalFees(prev => ({ ...prev, [activeCategory]: { ...prev[activeCategory], fee: parseInt(e.target.value, 10) || 0 } }))}
                                            title={`${activeCategory === 'Pickup' ? '픽업' : '드롭'} 추가요금`}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                            min="0"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            {activeCategory === 'Pickup' ? '픽업' : '드롭'} 추가요금 내역
                                        </label>
                                        <textarea
                                            value={additionalFees[activeCategory].detail}
                                            onChange={(e) => setAdditionalFees(prev => ({ ...prev, [activeCategory]: { ...prev[activeCategory], detail: e.target.value } }))}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                            rows={2}
                                            placeholder={`${activeCategory === 'Pickup' ? '픽업' : '드롭'} 추가요금 사유 또는 내역을 입력하세요`}
                                        />
                                    </div>
                                </div>

                                {(pickupBaseTotal > 0 || pickupAdditionalFee > 0 || dropoffAdditionalFee > 0) && (
                                    <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
                                        {/* 픽업 */}
                                        <div className="bg-blue-50 rounded p-3">
                                            <div className="text-xs font-semibold text-blue-700 mb-1">🚗 픽업</div>
                                            <div className="flex justify-between text-sm text-gray-700">
                                                <span>차량 금액 (왕복 포함)</span>
                                                <span className="font-semibold">{pickupBaseTotal.toLocaleString()}동</span>
                                            </div>
                                            {pickupAdditionalFee > 0 && (
                                                <div className="flex justify-between text-sm text-gray-700 mt-1">
                                                    <span>추가요금</span>
                                                    <span className="font-semibold text-orange-600">+{pickupAdditionalFee.toLocaleString()}동</span>
                                                </div>
                                            )}
                                            {additionalFees['Pickup'].detail.trim() && (
                                                <div className="text-xs text-gray-500 mt-1 whitespace-pre-wrap">{additionalFees['Pickup'].detail}</div>
                                            )}
                                        </div>
                                        {/* 드롭 */}
                                        <div className="bg-purple-50 rounded p-3">
                                            <div className="text-xs font-semibold text-purple-700 mb-1">🏁 드롭</div>
                                            <div className="flex justify-between text-sm text-gray-700">
                                                <span>차량 금액</span>
                                                <span className="font-semibold text-gray-400">0동 (왕복요금 픽업 포함)</span>
                                            </div>
                                            {dropoffAdditionalFee > 0 && (
                                                <div className="flex justify-between text-sm text-gray-700 mt-1">
                                                    <span>추가요금</span>
                                                    <span className="font-semibold text-orange-600">+{dropoffAdditionalFee.toLocaleString()}동</span>
                                                </div>
                                            )}
                                            {additionalFees['Drop-off'].detail.trim() && (
                                                <div className="text-xs text-gray-500 mt-1 whitespace-pre-wrap">{additionalFees['Drop-off'].detail}</div>
                                            )}
                                        </div>
                                        {/* 합계 */}
                                        <div className="pt-2 border-t border-gray-200">
                                            <div className="flex justify-between text-sm text-gray-600 mb-1">
                                                <span>차량 기본</span><span>{pickupBaseTotal.toLocaleString()}동</span>
                                            </div>
                                            {(pickupAdditionalFee + dropoffAdditionalFee) > 0 && (
                                                <div className="flex justify-between text-sm text-orange-600 mb-1">
                                                    <span>추가요금 합계</span><span>+{(pickupAdditionalFee + dropoffAdditionalFee).toLocaleString()}동</span>
                                                </div>
                                            )}
                                            <label className="block text-sm font-medium text-gray-700 mb-1">최종 총 금액</label>
                                            <div className="text-xl font-bold text-green-600">
                                                {finalReservationTotal.toLocaleString()}동
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
            {/* 좌석 선택 모달 */}
            <ShtCarSeatMap
                isOpen={isSeatMapOpen}
                onClose={() => setIsSeatMapOpen(false)}
                onSeatSelect={handleSeatSelect}
                usageDate={formData.pickup_datetime || undefined}
                vehicleNumber={formData.vehicle_number || undefined}
                requiredSeats={formData.passenger_count || 1}
                initialCategory={activeCategory === 'Drop-off' ? 'dropoff' : 'pickup'}
                saveToDb
                reservationId={reservationId || undefined}
                pickupLocation={formData.pickup_location || undefined}
                dropoffLocation={formData.dropoff_location || undefined}
            />
        </ManagerLayout>
    );
}

export default function SHTReservationEditPage() {
    return (
        <Suspense fallback={
            <ManagerLayout title="🚌 스하차량 예약 수정" activeTab="reservation-edit-sht">
                <div className="flex justify-center items-center h-64">
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
                        <p className="mt-4 text-gray-600">페이지를 불러오는 중...</p>
                    </div>
                </div>
            </ManagerLayout>
        }>
            <SHTReservationEditContent />
        </Suspense>
    );
}
