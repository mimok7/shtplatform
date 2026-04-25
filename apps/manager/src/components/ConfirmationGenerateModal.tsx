'use client';
import { useEffect, useState } from 'react';
import supabase from '@/lib/supabase';

interface ReservationDetail {
    reservation_id: string;
    service_type: string;
    service_details: any;
    amount: number;
    status: string;
    price_code?: string;
    price_option?: string;
    all_service_types?: string[];
    priceDetail?: any;
    reservation_total_amount?: number;
    manual_additional_fee?: number;
    manual_additional_fee_detail?: string;
}

interface QuoteData {
    quote_id: string;
    title: string;
    user_name: string;
    user_email: string;
    user_phone: string;
    total_price: number;
    payment_status: string;
    created_at: string;
    reservations: ReservationDetail[];
}

interface ConfirmationGenerateModalProps {
    isOpen: boolean;
    onClose: () => void;
    quoteId: string;
    autoSend?: boolean;
}

// 스케줄 타입 변환 맵 (DB 코드 → 한글 표시)
const SCHEDULE_TYPE_MAP: Record<string, string> = {
    '1N2D': '1박2일',
    '2N3D': '2박3일',
    '3N4D': '3박4일',
    'DAY': '당일',
};

// 스케줄 타입을 한글로 변환
const formatScheduleType = (scheduleType: string | undefined): string => {
    if (!scheduleType) return '-';
    return SCHEDULE_TYPE_MAP[scheduleType] || scheduleType;
};

const normalizeShtSeatType = (value: string) => {
    const raw = String(value || '').trim().toUpperCase();
    if (!raw) return '';
    if (raw === 'ALL') return 'ALL';
    if (raw.startsWith('A')) return 'A';
    if (raw.startsWith('B')) return 'B';
    if (raw.startsWith('C')) return 'C';
    return raw;
};

const getShtSeatList = (seatNumber: string) => String(seatNumber || '')
    .split(/[\s,\/]+/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

const getShtSeatPriceSummary = (detail: any, fallbackAmount = 0) => {
    const seatPriceMap = (detail?._shtSeatPrices || {}) as Record<string, number>;
    const seatList = getShtSeatList(String(detail?.seat_number || ''));
    const passengerCount = Math.max(
        seatList.filter((seat) => seat !== 'ALL').length,
        Number(detail?.passenger_count || 0),
        0,
    );

    if (seatList.some((seat) => seat === 'ALL')) {
        const unit = Number(seatPriceMap.ALL || fallbackAmount || 0);
        return {
            amount: unit > 0 ? unit : fallbackAmount,
            calcLines: [unit > 0 ? `단독(ALL) × ${unit.toLocaleString()}동` : '-'],
        };
    }

    const grouped = new Map<string, number>();
    seatList.forEach((seat) => {
        const type = normalizeShtSeatType(seat);
        if (!type || type === 'ALL') return;
        grouped.set(type, (grouped.get(type) || 0) + 1);
    });

    if (grouped.size === 0) {
        const inferredUnit = passengerCount > 0 && fallbackAmount > 0
            ? Math.round(fallbackAmount / passengerCount)
            : 0;
        return {
            amount: fallbackAmount,
            calcLines: passengerCount > 0 && inferredUnit > 0
                ? [`${passengerCount}인 × ${inferredUnit.toLocaleString()}동`]
                : [fallbackAmount > 0 ? `${fallbackAmount.toLocaleString()}동` : '-'],
        };
    }

    const groupedEntries = ['A', 'B', 'C']
        .map((type) => [type, grouped.get(type) || 0] as const)
        .filter(([, count]) => count > 0);
    const knownTotal = groupedEntries.reduce((sum, [type, count]) => sum + (Number(seatPriceMap[type] || 0) * count), 0);
    const missingSeatCount = groupedEntries.reduce((sum, [type, count]) => sum + (seatPriceMap[type] ? 0 : count), 0);
    const inferredUnit = missingSeatCount > 0 && fallbackAmount > knownTotal
        ? Math.round((fallbackAmount - knownTotal) / missingSeatCount)
        : 0;

    let total = 0;
    const calcLines: string[] = [];
    groupedEntries.forEach(([type, count]) => {
        if (!count) return;
        const unit = Number(seatPriceMap[type] || inferredUnit || 0);
        total += unit * count;
        calcLines.push(`${type}좌석 ${count}인 × ${unit.toLocaleString()}동`);
    });

    return {
        amount: total > 0 ? total : fallbackAmount,
        calcLines: calcLines.length > 0 ? calcLines : [fallbackAmount > 0 ? `${fallbackAmount.toLocaleString()}동` : '-'],
    };
};

// request_note에서 [객실 n], [구성 n] 등의 자동생성 패턴 제거
const getFilteredNoteText = (note: any): string => {
    if (!note) return '';
    const hiddenLinePattern = /^(?:비고\s*:\s*)?(?:\[(?:객실|구성)\s*\d+\]|(?:객실|구성)\s*\d+\b)/;
    const autoRoomSegmentPattern = /(?:비고\s*:\s*)?(?:\[(?:객실|구성)\s*\d+\]|(?:객실|구성)\s*\d+\b)\s*[^|\n]*\|\s*성인\s*\d+\s*,\s*아동(?:\([^)]+\))?\s*\d+\s*,\s*아동엑베\s*\d+\s*,\s*유아\s*\d+\s*,\s*성인엑베\s*\d+\s*,\s*싱글\s*\d+/g;

    const isAutoRoomCompositionLine = (line: string) => {
        const normalized = line.replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
        if (hiddenLinePattern.test(normalized) && /(성인|아동|유아|싱글|엑베)/.test(normalized)) return true;
        if (/\|\s*성인\s*\d+/.test(normalized) && /(아동\s*\d+|유아\s*\d+|싱글\s*\d+|엑베)/.test(normalized)) return true;
        return false;
    };

    const lines = String(note)
        .replace(/\[CHILD_OLDER_COUNTS:[^\]]*\]\s*/g, '')
        .split('\n')
        .map((line) => line.replace(/\u00A0/g, ' ').replace(autoRoomSegmentPattern, '').replace(/\s{2,}/g, ' ').trim())
        .filter(Boolean)
        .filter((line) => !isAutoRoomCompositionLine(line));
    return lines.join('\n').trim();
};

export default function ConfirmationGenerateModal({ isOpen, onClose, quoteId, autoSend }: ConfirmationGenerateModalProps) {
    const [quoteData, setQuoteData] = useState<QuoteData | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [emailSending, setEmailSending] = useState(false);

    // ESC 키로 모달 닫기 지원
    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isOpen, onClose]);

    useEffect(() => {
        // 모달이 처음 열릴 때만 데이터 로드 (isOpen이 true로 변경될 때 1회)
        if (!isOpen) {
            setEmailSending(false);
            return;
        }
        if (!quoteId) {
            setError('올바르지 않은 접근입니다.');
            setQuoteData(null);
            return;
        }
        loadQuoteData(quoteId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    // autoSend 처리
    useEffect(() => {
        if (isOpen && autoSend && quoteData && !emailSending) {
            sendEmailConfirmation();
        }
    }, [isOpen, autoSend, quoteData]);

    const loadQuoteData = async (qid: string) => {
        try {
            setLoading(true);
            setError(null);

            // 1. 견적 우선 조회
            const { data: quote, error: quoteResultError } = await supabase
                .from('quote')
                .select('*')
                .eq('id', qid)
                .maybeSingle();

            let finalQuoteData: any = quote;
            let reservations: any[] = [];
            let user: any = null;

            if (!quoteResultError && quote) {
                // 견적이 있는 경우: 기존 로직
                const [quoteItemResult, reservationsResult] = await Promise.all([
                    supabase.from('quote_item').select('*').eq('quote_id', qid),
                    supabase.from('reservation').select('*').eq('re_quote_id', qid),
                ]);

                reservations = (reservationsResult.data as any[]) || [];

                const userResult = await supabase
                    .from('users')
                    .select('name, email, phone_number')
                    .eq('id', quote.user_id)
                    .maybeSingle();
                user = userResult.data as any;
            } else {
                // 2. 견적이 없으면 예약 단일건으로 시도
                const { data: reservation, error: resError } = await supabase
                    .from('reservation')
                    .select('*')
                    .eq('re_id', qid)
                    .maybeSingle();

                if (!reservation || resError) {
                    console.error('견적/예약 조회 실패:', quoteResultError || resError);
                    setError('예약 정보를 찾을 수 없습니다. 예약 번호를 확인해 주세요.');
                    setQuoteData(null);
                    return;
                }

                finalQuoteData = {
                    id: reservation.re_id,
                    title: '예약확인서',
                    user_id: reservation.re_user_id,
                    total_price: 0,
                    payment_status: 'pending',
                    created_at: reservation.re_created_at
                };
                reservations = [reservation];

                if (reservation.re_user_id) {
                    const { data: userData } = await supabase
                        .from('users')
                        .select('name, email, phone_number')
                        .eq('id', reservation.re_user_id)
                        .maybeSingle();
                    user = userData;
                }
            }

            const reservationIds = reservations.map((r: any) => r.re_id);
            const [
                cruiseResult,
                airportResult,
                hotelResult,
                rentcarResult,
                tourResult,
                carShtResult,
                cruiseCarResult,
                packageResult,
            ] = await Promise.all([
                reservationIds.length > 0
                    ? supabase.from('reservation_cruise').select('*').in('reservation_id', reservationIds)
                    : Promise.resolve({ data: [] }),
                reservationIds.length > 0
                    ? supabase.from('reservation_airport').select('*').in('reservation_id', reservationIds)
                    : Promise.resolve({ data: [] }),
                reservationIds.length > 0
                    ? supabase.from('reservation_hotel').select('*').in('reservation_id', reservationIds)
                    : Promise.resolve({ data: [] }),
                reservationIds.length > 0
                    ? supabase.from('reservation_rentcar').select('*').in('reservation_id', reservationIds)
                    : Promise.resolve({ data: [] }),
                reservationIds.length > 0
                    ? supabase.from('reservation_tour').select('*').in('reservation_id', reservationIds)
                    : Promise.resolve({ data: [] }),
                reservationIds.length > 0
                    ? supabase.from('reservation_car_sht').select('*').in('reservation_id', reservationIds)
                    : Promise.resolve({ data: [] }),
                reservationIds.length > 0
                    ? supabase.from('reservation_cruise_car').select('*').in('reservation_id', reservationIds)
                    : Promise.resolve({ data: [] }),
                reservationIds.length > 0
                    ? supabase.from('reservation_package').select('*').in('reservation_id', reservationIds)
                    : Promise.resolve({ data: [] }),
            ]);

            const cruiseDetails = (cruiseResult.data as any[]) || [];
            const airportDetails = (airportResult.data as any[]) || [];
            const hotelDetails = (hotelResult.data as any[]) || [];
            const packageDetails = (packageResult.data as any[]) || [];
            const rentcarDetails = (rentcarResult.data as any[]) || [];
            const tourDetails = (tourResult.data as any[]) || [];
            const carDetails = (carShtResult.data as any[]) || [];
            const cruiseCarDetails = (cruiseCarResult.data as any[]) || [];

            // 스하차량 좌석 단가는 하드코딩이 아닌 rentcar_price 기준으로 계산
            const shtPriceCodes = Array.from(new Set(
                carDetails
                    .map((d: any) => d.car_price_code || d.rentcar_price_code || d.price_code)
                    .filter(Boolean)
            ));

            const { data: shtPriceRows } = shtPriceCodes.length > 0
                ? await supabase
                    .from('rentcar_price')
                    .select('rent_code, category, vehicle_type, price')
                    .in('rent_code', shtPriceCodes)
                : { data: [] as any[] };

            const seatPriceMapByCode = new Map<string, Record<string, number>>();
            (shtPriceRows || []).forEach((row: any) => {
                const code = String(row.rent_code || '').trim();
                if (!code) return;
                const seatType = normalizeShtSeatType(row.category || row.vehicle_type || '');
                if (!seatType) return;
                const unitPrice = Number(row.price || 0);
                if (!unitPrice) return;

                const existing = seatPriceMapByCode.get(code) || {};
                // 같은 타입이 여러 행이면 더 큰 값을 사용 (데이터 중복/조건행 대비)
                existing[seatType] = Math.max(existing[seatType] || 0, unitPrice);
                seatPriceMapByCode.set(code, existing);
            });

            const carDetailsWithShtPrice = carDetails.map((detail: any) => {
                const code = String(detail.car_price_code || detail.rentcar_price_code || detail.price_code || '').trim();
                return {
                    ...detail,
                    _shtSeatPrices: seatPriceMapByCode.get(code) || {},
                };
            });

            // 크루즈 차량(car) 예약 상세에 대해 rentcar_price 정보 병합
            let cruiseCarMergedDetails: any[] = [];
            if (cruiseCarDetails.length > 0) {
                const carPriceCodes = cruiseCarDetails.map((c: any) => c.car_price_code).filter(Boolean);
                const { data: carPriceData } = carPriceCodes.length > 0
                    ? await supabase.from('rentcar_price').select('*').in('rent_code', carPriceCodes)
                    : { data: [] as any[] };
                const { data: carData } = carPriceCodes.length > 0
                    ? await supabase.from('car').select('*').in('car_code', carPriceCodes)
                    : { data: [] as any[] };
                cruiseCarMergedDetails = cruiseCarDetails.map((detail: any) => {
                    const priceInfo = (carPriceData || []).find((p: any) => p.rent_code === detail.car_price_code) || {};
                    const carInfo = (carData || []).find((c: any) => c.car_code === detail.car_price_code) || {};
                    const shtDetail = (carDetails || []).find((s: any) => s.reservation_id === detail.reservation_id) || null;
                    return { ...detail, priceInfo, carInfo, shtDetail };
                });
            }

            const pickAmount = (type: string, detail: any): number => {
                if (!detail) return 0;
                if (type === 'sht') {
                    return getShtSeatPriceSummary(detail, Number(detail?.car_total_price || detail?.amount || 0)).amount;
                }
                const amountFields = ['car_total_price', 'room_total_price', 'total_price', 'unit_price', 'price', 'amount'];
                for (const field of amountFields) {
                    const value = detail[field];
                    if (typeof value === 'number' && !isNaN(value) && value > 0) return value;
                }
                return 0;
            };

            const resStatusMap = new Map<string, string>();
            const reservationMetaMap = new Map<string, { total_amount: number; manual_additional_fee: number; manual_additional_fee_detail: string }>();
            reservations.forEach((r: any) => {
                const reservationId = String(r.re_id || '').trim();
                if (!reservationId) return;
                resStatusMap.set(reservationId, r.re_status || 'pending');
                reservationMetaMap.set(reservationId, {
                    total_amount: Number(r.total_amount || 0),
                    manual_additional_fee: Number(r.manual_additional_fee || 0),
                    manual_additional_fee_detail: String(r.manual_additional_fee_detail || '').trim(),
                });
            });

            const detailMap: Record<string, any[]> = {
                cruise: cruiseDetails,
                airport: airportDetails,
                hotel: hotelDetails,
                rentcar: rentcarDetails,
                tour: tourDetails,
                car: cruiseCarMergedDetails,
                sht: carDetailsWithShtPrice,
                package: packageDetails,
            };

            const priceCodeFieldByType: Record<string, string | undefined> = {
                cruise: 'room_price_code',
                airport: 'airport_price_code',
                hotel: 'hotel_price_code',
                rentcar: 'rentcar_price_code',
                tour: 'tour_price_code',
                car: 'car_price_code',
                sht: 'car_price_code',
                package: 'package_id',
            };
            const optionFieldsByType: Record<string, string[]> = {
                cruise: ['room_type'],
                airport: [],
                hotel: ['hotel_name', 'room_name', 'room_type'],
                rentcar: [],
                tour: ['tour_name'],
                car: ['sht_category'],
                sht: ['sht_category'],
                package: ['package_name'],
            };

            // 모든 행 처리
            const tempReservations: ReservationDetail[] = [];

            Object.entries(detailMap).forEach(([serviceType, details]) => {
                details.forEach((detail) => {
                    const priceCodeField = priceCodeFieldByType[serviceType];
                    const optionFields = optionFieldsByType[serviceType] || [];
                    const priceCode = priceCodeField ? detail[priceCodeField] || '' : '';

                    let priceOption = '';
                    for (const k of optionFields) {
                        if (detail[k]) {
                            priceOption = detail[k];
                            break;
                        }
                    }
                    if (!priceOption && serviceType === 'car' && detail.shtDetail?.sht_category) {
                        priceOption = detail.shtDetail.sht_category;
                    }

                    const reservationId = detail.reservation_id || finalQuoteData.id;
                    const parentStatus = resStatusMap.get(reservationId) || 'pending';
                    const reservationMeta = reservationMetaMap.get(reservationId);

                    tempReservations.push({
                        reservation_id: reservationId,
                        service_type: serviceType,
                        service_details: detail,
                        amount: pickAmount(serviceType, detail),
                        status: parentStatus,
                        price_code: priceCode,
                        price_option: priceOption,
                        reservation_total_amount: Number(reservationMeta?.total_amount || 0),
                        manual_additional_fee: Number(reservationMeta?.manual_additional_fee || 0),
                        manual_additional_fee_detail: String(reservationMeta?.manual_additional_fee_detail || '').trim(),
                    });
                });
            });

            // 가격 상세 정보 병렬 조회
            const processedReservations = await Promise.all(tempReservations.map(async (res) => {
                // 공항 서비스: reservation_airport.airport_price_code → airport_price.airport_code 검색
                if (res.service_type === 'airport' && res.price_code) {
                    const rawWay = (res.service_details as any)?.way_type || (res.service_details as any)?.ra_way_type || '';
                    // way_type 영문→한글 매핑 (airport_price.service_type이 한글)
                    const wayTypeMap: Record<string, string> = {
                        pickup: '픽업', sending: '샌딩', '픽업': '픽업', '샌딩': '샌딩',
                    };
                    const serviceTypeKo = wayTypeMap[rawWay] || rawWay;
                    let query = supabase
                        .from('airport_price')
                        .select('airport_code, service_type, route, vehicle_type, price')
                        .eq('airport_code', res.price_code);
                    if (serviceTypeKo) {
                        query = (query as any).eq('service_type', serviceTypeKo);
                    }
                    const { data: apData } = await query.limit(1).maybeSingle();
                    return { ...res, priceDetail: apData || null };
                }
                if (res.price_code) {
                    const priceDetail = await fetchPriceDetail(res.service_type, res.price_code);
                    return { ...res, priceDetail };
                }
                return res;
            }));

            // 총 금액 계산 (SHT는 reservation_id 기준 중복 제거 + 추가요금 포함)
            const shtPickedMap = new Map<string, any>();
            for (const r of processedReservations) {
                if (r.service_type !== 'sht') continue;
                const prev = shtPickedMap.get(r.reservation_id);
                if (!prev || Number(r.amount || 0) > Number(prev.amount || 0)) {
                    shtPickedMap.set(r.reservation_id, r);
                }
            }
            const calculatedTotal = processedReservations.reduce((sum, reservation) => {
                if (reservation.service_type === 'sht') {
                    if (shtPickedMap.get(reservation.reservation_id) !== reservation) return sum;
                    const sd = reservation.service_details as any;
                    const shtSummary = getShtSeatPriceSummary(sd, Number(sd?.car_total_price || reservation.amount || 0));
                    return sum + shtSummary.amount + Number(reservation.manual_additional_fee || 0);
                }
                return sum + (reservation.amount || 0);
            }, 0);

            const reservationTotalMap = new Map<string, number>();
            processedReservations.forEach((reservation) => {
                const reservationId = String(reservation.reservation_id || '').trim();
                if (!reservationId) return;
                const total = Number(reservation.reservation_total_amount);
                if (Number.isFinite(total)) {
                    reservationTotalMap.set(reservationId, total);
                }
            });
            const hasReservationTotals = reservationTotalMap.size > 0;
            const reservationTotalSum = Array.from(reservationTotalMap.values()).reduce((sum, value) => sum + Number(value || 0), 0);

            setQuoteData({
                quote_id: finalQuoteData.id,
                title: finalQuoteData.title || '제목 없음',
                user_name: user?.name || '알 수 없음',
                user_email: user?.email || '',
                user_phone: user?.phone_number || '',
                total_price: hasReservationTotals ? reservationTotalSum : (calculatedTotal || finalQuoteData.total_price || 0),
                payment_status: finalQuoteData.payment_status || 'pending',
                created_at: finalQuoteData.created_at,
                reservations: processedReservations,
            });
        } catch (e) {
            console.error('견적 데이터 로드 실패:', e);
            setError('예약 정보를 불러오는 중 오류가 발생했습니다.');
            setQuoteData(null);
        } finally {
            setLoading(false);
        }
    };

    async function fetchPriceDetail(serviceType: string, priceCode: string) {
        if (!priceCode) return null;
        let table = '';
        let codeField = '';
        let selectFields: string[] = [];
        switch (serviceType) {
            case 'cruise':
            case 'room':
                table = 'cruise_rate_card';
                codeField = 'id';
                selectFields = ['id', 'cruise_name', 'schedule_type', 'room_type', 'room_type_en', 'price_adult', 'price_child', 'price_infant', 'price_extra_bed', 'price_child_extra_bed', 'price_single', 'valid_from', 'valid_to'];
                break;
            case 'car':
            case 'sht':
                table = 'rentcar_price';
                codeField = 'rent_code';
                selectFields = ['rent_code', 'way_type', 'vehicle_type', 'capacity', 'price', 'route'];
                break;
            case 'airport': {
                const { data: apData } = await supabase
                    .from('airport_price')
                    .select('airport_code, service_type, route, vehicle_type, price')
                    .eq('airport_code', priceCode)
                    .limit(1)
                    .maybeSingle();
                if (!apData) return null;
                return apData;
            }
            case 'hotel': {
                const { data: hotelPriceData, error: hotelPriceErr } = await supabase
                    .from('hotel_price')
                    .select('hotel_price_code, hotel_code, hotel_name, room_type, room_name, room_category, base_price, season_name, weekday_type, start_date, end_date, include_breakfast, notes')
                    .eq('hotel_price_code', priceCode)
                    .maybeSingle();
                if (hotelPriceErr || !hotelPriceData) return null;
                return hotelPriceData;
            }
            case 'rentcar':
                table = 'rentcar_price';
                codeField = 'rent_code';
                selectFields = ['rent_code', 'way_type', 'category', 'route', 'vehicle_type', 'price', 'capacity'];
                break;
            case 'tour': {
                table = 'tour_pricing';
                codeField = 'pricing_id';
                selectFields = ['pricing_id', 'tour_id', 'price_per_person', 'vehicle_type', 'min_guests', 'max_guests'];
                const { data: tourPriceData, error: tourPriceErr } = await supabase
                    .from(table)
                    .select(selectFields.join(','))
                    .eq(codeField, priceCode)
                    .maybeSingle();
                if (tourPriceErr || !tourPriceData) return null;
                const tourPriceObj: any = tourPriceData;
                // tour 테이블에서 투어명 추가 조회
                let tour_name = '';
                if (tourPriceObj.tour_id) {
                    const { data: t } = await supabase.from('tour').select('tour_name').eq('tour_id', tourPriceObj.tour_id).maybeSingle();
                    if (t) tour_name = (t as any).tour_name;
                }
                return { ...tourPriceObj, tour_name };
            }
            case 'package':
                table = 'package_master';
                codeField = 'id';
                selectFields = ['id', 'name', 'package_code', 'description'];
                break;
            default:
                return null;
        }
        const { data, error } = await supabase
            .from(table)
            .select(selectFields.join(','))
            .eq(codeField, priceCode)
            .maybeSingle();
        if (error || !data) return null;
        return data;
    }

    // 가격 상세 fetch는 최초 데이터 로드 시에만 처리 (불필요한 반복 fetch 방지)
    // useEffect 제거 또는 quoteData가 최초 세팅될 때만 실행되도록 변경 필요

    const getServiceTypeName = (type: string) => {
        const typeNames: Record<string, string> = {
            cruise: '크루즈',
            airport: '공항 차량',
            hotel: '호텔',
            rentcar: '렌터카',
            tour: '투어',
            car: '크루즈 차량',
            sht: '스하 차량',
        };
        return typeNames[type] || type;
    };

    const hasTimezone = (raw: string) => /[zZ]$|[+-]\d{2}:?\d{2}$/.test(raw);

    const formatDate = (dateString: string) => {
        if (!dateString) return '-';
        const raw = String(dateString).trim();
        if (!raw) return '-';

        if (!hasTimezone(raw)) {
            const m = raw.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
            if (m) {
                const [, y, mo, d] = m;
                return `${Number(y)}년 ${Number(mo)}월 ${Number(d)}일`;
            }
            return raw;
        }

        const d = new Date(raw);
        if (Number.isNaN(d.getTime())) return raw;
        return d.toLocaleDateString('ko-KR', {
            timeZone: 'Asia/Seoul',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
    };

    const formatDateTimeAmPm = (dateTimeStr: string) => {
        if (!dateTimeStr) return '-';
        const raw = String(dateTimeStr).trim();
        if (!raw) return '-';

        const plainMatch = raw.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})\s*[T ]?(\d{1,2}):(\d{2})/);
        if (!hasTimezone(raw) && plainMatch) {
            const [, yearStr, monthStr, dayStr, hourStr, minuteStr] = plainMatch;
            const hour = Number(hourStr);
            const minute = String(Number(minuteStr)).padStart(2, '0');
            const ampm = hour < 12 ? '오전' : '오후';
            const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
            return `${yearStr}-${String(Number(monthStr)).padStart(2, '0')}-${String(Number(dayStr)).padStart(2, '0')} ${ampm} ${displayHour}:${minute}`;
        }

        const d = new Date(raw);
        if (Number.isNaN(d.getTime())) return raw;
        return d.toLocaleString('ko-KR', {
            timeZone: 'Asia/Seoul',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
        }).replace(/\. /g, '-').replace('.', '');
    };

    const printConfirmation = () => {
        // 모달 컨텐츠만 인쇄하도록 설정
        const modalContent = document.querySelector('.confirmation-modal-content');
        if (modalContent) {
            const printWindow = window.open('', '_blank');
            if (printWindow) {
                printWindow.document.write(`
                    <html>
                        <head>
                            <title>예약 확인서</title>
                            <style>
                                body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
                                table { border-collapse: collapse; width: 100%; }
                                td, th { border: 1px solid #ddd; padding: 8px; text-align: left; }
                                .text-center { text-align: center; }
                                .font-bold { font-weight: bold; }
                                .text-blue-600 { color: #2563eb; }
                                .text-gray-500 { color: #6b7280; }
                                .text-gray-600 { color: #4b5563; }
                                .text-gray-700 { color: #374151; }
                                .text-gray-900 { color: #111827; }
                                .bg-blue-50 { background-color: #eff6ff; }
                                .bg-gray-50 { background-color: #f9fafb; }
                                .bg-gray-100 { background-color: #f3f4f6; }
                                @media print { @page { margin: 1cm; } }
                            </style>
                        </head>
                        <body>
                            ${modalContent.innerHTML}
                        </body>
                    </html>
                `);
                printWindow.document.close();
                printWindow.focus();
                printWindow.print();
                printWindow.close();
            }
        } else {
            // 폴백: 전체 윈도우 인쇄
            window.print();
        }
    };

    const generatePDF = () => {
        // PDF 생성을 위해 새 창에서 확인서 페이지 열기
        const modalContent = document.querySelector('.confirmation-modal-content');
        if (modalContent) {
            const pdfWindow = window.open('', '_blank');
            if (pdfWindow) {
                pdfWindow.document.write(`
                    <html>
                        <head>
                            <title>예약 확인서 - ${quoteData?.user_name || ''}</title>
                            <style>
                                body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
                                table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
                                td, th { border: 1px solid #ddd; padding: 8px; text-align: left; }
                                .text-center { text-align: center; }
                                .font-bold { font-weight: bold; }
                                .text-blue-600 { color: #2563eb; }
                                .text-gray-500 { color: #6b7280; }
                                .text-gray-600 { color: #4b5563; }
                                .text-gray-700 { color: #374151; }
                                .text-gray-900 { color: #111827; }
                                .bg-blue-50 { background-color: #eff6ff; }
                                .bg-gray-50 { background-color: #f9fafb; }
                                .bg-gray-100 { background-color: #f3f4f6; }
                                @media print { @page { margin: 1cm; } }
                            </style>
                        </head>
                        <body>
                            ${modalContent.innerHTML}
                            <script>
                                window.onload = function() {
                                    window.print();
                                    setTimeout(function() { window.close(); }, 1000);
                                };
                            </script>
                        </body>
                    </html>
                `);
                pdfWindow.document.close();
            }
        }
    };

    async function sendEmailConfirmation() {
        if (!quoteData) return;

        try {
            setEmailSending(true);

            // PDF 생성용 html2pdf 동적 임포트
            const html2pdf = (await import('html2pdf.js')).default;
            const element = document.querySelector('.confirmation-modal-content');

            if (!element) {
                throw new Error('확인서 요소를 찾을 수 없습니다.');
            }

            const opt = {
                margin: 0.5,
                filename: `예약확인서_${quoteData.quote_id}_${quoteData.user_name}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: {
                    scale: 2,
                    useCORS: true,
                    letterRendering: true
                },
                jsPDF: {
                    unit: 'in',
                    format: 'a4',
                    orientation: 'portrait'
                }
            };

            // PDF를 Blob으로 생성
            const pdfBlob = await html2pdf().set(opt as any).from(element as any).outputPdf('blob');

            // Blob to Base64 (Data URI)
            const pdfBase64: string = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.readAsDataURL(pdfBlob);
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = error => reject(error);
            });

            // 스타일 정의
            const styles = `
                body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
                table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
                td, th { border: 1px solid #ddd; padding: 8px; text-align: left; }
                .text-center { text-align: center; }
                .font-bold { font-weight: bold; }
                .text-blue-600 { color: #2563eb; }
                .text-gray-500 { color: #6b7280; }
                .text-gray-600 { color: #4b5563; }
                .text-gray-700 { color: #374151; }
                .text-gray-900 { color: #111827; }
                .bg-blue-50 { background-color: #eff6ff; }
                .bg-gray-50 { background-color: #f9fafb; }
                .bg-gray-100 { background-color: #f3f4f6; }
            `;

            const emailHtml = `
                <html>
                    <head>
                        <style>${styles}</style>
                    </head>
                    <body>
                        ${element.innerHTML}
                    </body>
                </html>
            `;

            // 이메일 발송 API 호출
            const response = await fetch('/api/send-email', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    to: quoteData.user_email,
                    subject: `[스테이하롱 트레블] 예약확인서 - ${quoteData.title}`,
                    html: emailHtml,
                    attachments: [
                        {
                            filename: `예약확인서_${quoteData.quote_id}_${quoteData.user_name}.pdf`,
                            path: pdfBase64 // Data URI 사용
                        }
                    ]
                }),
            });

            if (!response.ok) {
                const resData = await response.json();
                const errorMessage = resData.details
                    ? `${resData.error}\n(${resData.details})`
                    : (resData.error || '이메일 발송 요청 실패');
                throw new Error(errorMessage);
            }

            // DB 상태 업데이트
            await supabase.from('confirmation_status').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('reservation_id', quoteData.quote_id);
            // 견적 상태도 업데이트
            await supabase.from('quote').update({ status: 'confirmed' }).or(`quote_id.eq.${quoteData.quote_id},id.eq.${quoteData.quote_id}`);

            alert(`✅ ${quoteData.user_email}로 예약확인서가 성공적으로 발송되었습니다.`);

            if (autoSend) {
                onClose();
            }
        } catch (error: any) {
            console.error('이메일 발송 실패:', error);
            alert(`❌ 이메일 발송에 실패했습니다.\n\n${error.message || error}`);
        } finally {
            setEmailSending(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* 배경 오버레이 */}
            <div
                className="absolute inset-0 bg-black/40 z-40"
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onClose();
                }}
            />

            {/* 모달 컨텐츠 래퍼 */}
            <div
                className="relative bg-white w-[92vw] sm:w-[88vw] md:w-[80vw] lg:w-[62vw] xl:w-[56vw] max-w-4xl max-h-[90vh] rounded-lg shadow-xl overflow-hidden flex flex-col z-50"
                onClick={e => e.stopPropagation()}
            >
                {/* 상단 바 */}
                <div className="bg-white shadow-sm border-b sticky top-0 z-10 print:hidden">
                    <div className="px-6 py-4 flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                            <div className="text-xl">🌊</div>
                            <div>
                                <h1 className="text-base font-bold text-gray-900">스테이하롱 크루즈</h1>
                                <p className="text-xs text-gray-600">예약확인서 미리보기</p>
                            </div>
                        </div>
                        <div className="flex items-center space-x-2">
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    printConfirmation();
                                }}
                                className="px-3 py-2 bg-white text-blue-600 border border-blue-500 rounded hover:bg-blue-600 hover:text-white hover:shadow-md transition-all duration-200 text-sm"
                                aria-label="인쇄"
                            >
                                🖨️ 인쇄
                            </button>
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    generatePDF();
                                }}
                                className="px-3 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 hover:border-gray-400 transition-all duration-200 text-sm"
                                aria-label="PDF"
                            >
                                📄 PDF
                            </button>
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    onClose();
                                }}
                                className="px-3 py-2 border border-gray-300 text-blue-600 rounded hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-all duration-200 text-sm"
                                aria-label="닫기"
                            >
                                닫기
                            </button>
                        </div>
                    </div>
                </div>

                {/* 본문 스크롤 영역 */}
                <div className="overflow-y-auto p-6 bg-gray-50">
                    {loading ? (
                        <div className="flex justify-center items-center h-40">
                            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500 mr-4" />
                            <p className="text-gray-600">예약 정보를 불러오는 중...</p>
                        </div>
                    ) : error || !quoteData ? (
                        <div className="text-center p-12">
                            <div className="text-5xl mb-4">❌</div>
                            <h2 className="text-xl font-bold text-gray-900 mb-2">오류</h2>
                            <p className="text-gray-600 mb-4">{error || '예약 정보를 찾을 수 없습니다.'}</p>
                            <button
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    onClose();
                                }}
                                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 hover:shadow-md transition-all duration-200"
                            >
                                닫기
                            </button>
                        </div>
                    ) : (
                        <div className="max-w-4xl mx-auto">
                            <div className="bg-white rounded-lg shadow-lg overflow-hidden">
                                <div className="p-6 confirmation-modal-content font-sans">
                                    {/* 헤더 */}
                                    <div className="text-center mb-6 border-b-2 border-blue-600 pb-4">
                                        <div className="flex justify-between items-center mb-2">
                                            <div className="text-left">
                                                <img src="/logo2.png" alt="StayHalong Logo" className="h-10 object-contain" />
                                            </div>
                                            <div className="text-right">
                                                <div className="text-xs text-gray-500">확인서 번호</div>
                                                <div className="text-xs font-mono text-gray-700">{quoteData.quote_id.slice(-8).toUpperCase()}</div>
                                                <div className="text-xs text-gray-400 mt-1">발행일: {formatDate(new Date().toISOString())}</div>
                                            </div>
                                        </div>
                                        <h1 className="text-2xl font-bold text-gray-900 mb-1">🎯 스테이하롱트래블 예약 확인서</h1>
                                    </div>

                                    {/* 고객 및 예약 정보 표 */}
                                    <div className="mb-6">
                                        <table className="w-full border border-gray-300">
                                            <tbody>
                                                <tr className="bg-blue-50">
                                                    <td className="border border-gray-300 px-3 py-2 font-semibold text-gray-700 w-1/3 text-center text-xs">예약자 정보</td>
                                                    <td className="border border-gray-300 px-3 py-2 font-semibold text-gray-700 w-1/3 text-center text-xs">예약 기본 정보</td>
                                                    <td className="border border-gray-300 px-3 py-2 font-semibold text-gray-700 w-1/3 text-center text-xs">예약 내역</td>
                                                </tr>
                                                <tr>
                                                    <td className="border border-gray-300 px-3 py-2 align-top">
                                                        <div className="space-y-1 text-sm">
                                                            <div><span className="text-gray-500">성명:</span> <span className="font-bold text-gray-900">{quoteData.user_name}</span></div>
                                                            <div><span className="text-gray-500">📧 이메일:</span> <span className="font-bold text-gray-900">{quoteData.user_email}</span></div>
                                                            <div><span className="text-gray-500">📞 연락처:</span> <span className="font-bold text-gray-900">{quoteData.user_phone}</span></div>
                                                        </div>
                                                    </td>
                                                    <td className="border border-gray-300 px-3 py-2 align-top">
                                                        <div className="space-y-1 text-sm">
                                                            <div><span className="text-gray-500">예약번호:</span> <span className="font-bold text-gray-900 font-mono">{quoteData.quote_id}</span></div>
                                                            <div><span className="text-gray-500">예약일:</span> <span className="font-bold text-gray-900">{formatDate(quoteData.created_at)}</span></div>
                                                        </div>
                                                    </td>
                                                    <td className="border border-gray-300 px-3 py-2 align-top">
                                                        <div className="space-y-1 text-sm">
                                                            <div><span className="text-gray-500">서비스 종류:</span></div>
                                                            <div className="flex flex-wrap gap-1 mt-1">
                                                                {quoteData.reservations && quoteData.reservations.length > 0 ? (
                                                                    Array.from(new Set(quoteData.reservations.map((r) => r.service_type))).map((type) => (
                                                                        <span key={type} className="inline-block px-2 py-1 bg-blue-50 text-blue-600 rounded text-xs font-medium">
                                                                            {getServiceTypeName(type)}
                                                                        </span>
                                                                    ))
                                                                ) : (
                                                                    <span className="text-gray-400">-</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* 예약 서비스 상세 표 */}
                                    <div className="mb-6">
                                        <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center">
                                            <span className="w-1 h-5 bg-blue-600 mr-2" />예약 서비스 상세 내역
                                        </h3>
                                        <table className="w-full border border-gray-300">
                                            <thead>
                                                <tr className="bg-gray-100">
                                                    <th className="border border-gray-300 px-2 py-2 text-center text-xs font-semibold text-gray-700 w-[10%]">No.</th>
                                                    <th className="border border-gray-300 px-2 py-2 text-center text-xs font-semibold text-gray-700 w-[24%]">구분</th>
                                                    <th className="border border-gray-300 px-2 py-2 text-center text-xs font-semibold text-gray-700 w-[66%]">상세 정보</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {(() => {
                                                    const serviceOrder: Record<string, number> = { cruise: 0, car: 1, sht: 2, airport: 3, hotel: 4, rentcar: 5, tour: 6 };
                                                    const sortedReservations = [...quoteData.reservations].sort((a, b) =>
                                                        (serviceOrder[a.service_type] ?? 99) - (serviceOrder[b.service_type] ?? 99)
                                                    );
                                                    // 공항 픽업/샌딩 한 행 병합
                                                    const allAirportEntries = sortedReservations.filter(r => r.service_type === 'airport');
                                                    let airportSeen = false;
                                                    const displayReservations = sortedReservations.filter(r => {
                                                        if (r.service_type === 'airport') {
                                                            if (airportSeen) return false;
                                                            airportSeen = true;
                                                        }
                                                        return true;
                                                    });
                                                    return displayReservations.map((reservation, index) => {
                                                        const serviceStyleMap: Record<string, string> = {
                                                            cruise: 'bg-blue-50/50',
                                                            airport: 'bg-emerald-50/50',
                                                            hotel: 'bg-indigo-50/50',
                                                            rentcar: 'bg-amber-50/50',
                                                            tour: 'bg-purple-50/50',
                                                            car: 'bg-teal-50/50',
                                                            sht: 'bg-cyan-50/50',
                                                        };
                                                        const rowBgColor = serviceStyleMap[reservation.service_type] || 'bg-white';

                                                        return (
                                                            <tr key={`${reservation.reservation_id}-${reservation.service_type}-${index}`} className={rowBgColor}>
                                                                <td className="border border-gray-300 px-2 py-2 text-center font-medium text-gray-700 w-[10%]">{index + 1}</td>
                                                                <td className="border border-gray-300 px-2 py-2 text-center align-top w-[24%]">
                                                                    <div className="font-semibold text-gray-900">
                                                                        {Array.isArray(reservation.all_service_types) && reservation.all_service_types.length > 0 ? (
                                                                            <>
                                                                                {reservation.all_service_types.map((type) => (
                                                                                    <span key={type} className="inline-block mr-2 px-2 py-1 bg-blue-50 text-blue-600 rounded text-xs font-medium">{getServiceTypeName(type)}</span>
                                                                                ))}
                                                                            </>
                                                                        ) : (
                                                                            <span>{getServiceTypeName(reservation.service_type)}</span>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                                <td className="border border-gray-300 px-2 py-2 text-left align-top w-[66%]">
                                                                    {reservation.service_type === 'cruise' && reservation.service_details && (
                                                                        <div className="space-y-1 text-xs">
                                                                            <div><span className="text-gray-500">체크인:</span> <span className="font-bold text-gray-900">{formatDate((reservation.service_details as any).checkin)}</span></div>
                                                                            <div><span className="text-gray-500">크루즈명:</span> <span className="font-bold text-gray-900">{(reservation.priceDetail as any)?.cruise_name || '-'}</span></div>
                                                                            <div><span className="text-gray-500">스케줄:</span> <span className="font-bold text-gray-900">{formatScheduleType((reservation.priceDetail as any)?.schedule_type)}</span></div>
                                                                            <div><span className="text-gray-500">객실타입:</span> <span className="font-bold text-gray-900">{(reservation.priceDetail as any)?.room_type || '-'}</span></div>
                                                                            <div><span className="text-gray-500">객실수:</span> <span className="font-bold text-gray-900">{Math.max(1, Number((reservation.service_details as any)?.room_count || 1))}실</span></div>
                                                                            <div><span className="text-gray-500">인원:</span> <span className="font-bold text-gray-900">{(() => {
                                                                                const d = reservation.service_details as any;
                                                                                const adultCount = d?.adult_count || 0;
                                                                                const extraBedCount = d?.extra_bed_count || 0;
                                                                                const childCount = d?.child_count || 0;
                                                                                const childExtraBedCount = d?.child_extra_bed_count || 0;
                                                                                const infantCount = d?.infant_count || 0;
                                                                                const singleCount = d?.single_count || 0;
                                                                                const totalAdult = adultCount + extraBedCount;
                                                                                const totalChild = childCount + childExtraBedCount;
                                                                                const parts = [];
                                                                                if (totalAdult > 0) {
                                                                                    const detail = extraBedCount > 0 ? ` (기본${adultCount}+엑스트라${extraBedCount})` : '';
                                                                                    parts.push(`성인 ${totalAdult}명${detail}`);
                                                                                }
                                                                                if (totalChild > 0) {
                                                                                    const detail = childExtraBedCount > 0 ? ` (기본${childCount}+엑스트라${childExtraBedCount})` : '';
                                                                                    parts.push(`아동 ${totalChild}명${detail}`);
                                                                                }
                                                                                if (infantCount > 0) parts.push(`유아 ${infantCount}명`);
                                                                                if (singleCount > 0) parts.push(`싱글 ${singleCount}명`);
                                                                                return parts.length > 0 ? parts.join(', ') : '-';
                                                                            })()}</span></div>
                                                                            <div><span className="text-gray-500">총 인원:</span> <span className="font-bold text-gray-900">{(() => {
                                                                                const d = reservation.service_details as any;
                                                                                const total = (d?.adult_count || 0) + (d?.extra_bed_count || 0) + (d?.child_count || 0) + (d?.child_extra_bed_count || 0) + (d?.infant_count || 0);
                                                                                return `${total}명`;
                                                                            })()}</span></div>
                                                                            {Boolean((reservation.service_details as any).boarding_code) && <div><span className="text-gray-500">탑승코드:</span> <span className="font-mono text-gray-900">{(reservation.service_details as any).boarding_code}</span></div>}
                                                                            {Boolean((reservation.service_details as any).boarding_assist) && <div><span className="text-gray-500">탑승보조:</span> <span className="font-bold text-gray-900">필요</span></div>}
                                                                            {(reservation.service_details as any).request_note && getFilteredNoteText((reservation.service_details as any).request_note) && <div><span className="text-gray-500">요청사항:</span> <span className="text-gray-700">{getFilteredNoteText((reservation.service_details as any).request_note)}</span></div>}
                                                                        </div>
                                                                    )}
                                                                    {reservation.service_type === 'airport' && (() => {
                                                                        const entries = allAirportEntries.length > 0 ? allAirportEntries : [reservation];
                                                                        return (
                                                                            <div className={entries.length > 1 ? 'grid grid-cols-2 gap-4' : ''}>
                                                                                {entries.map((entry, ei) => {
                                                                                    const d = entry.service_details as any;
                                                                                    const p = entry.priceDetail as any;
                                                                                    const way = d?.ra_way_type || d?.way_type || '';
                                                                                    const isPickup = way.includes('픽업') || way.toLowerCase().includes('pickup');
                                                                                    const isSending = way.includes('샌딩') || way.toLowerCase().includes('sending');
                                                                                    const label = isPickup ? '✈️ 픽업' : isSending ? '✈️ 샌딩' : '✈️ 공항차량';
                                                                                    return (
                                                                                        <div key={ei} className="space-y-1 text-xs">
                                                                                            {entries.length > 1 && <div className="font-semibold text-emerald-700 mb-1">{label}</div>}
                                                                                            <div><span className="text-gray-500">경로:</span> <span className="font-bold text-gray-900">{p?.route || '-'}</span></div>
                                                                                            <div><span className="text-gray-500">차종:</span> <span className="font-bold text-gray-900">{p?.vehicle_type || '-'}</span></div>
                                                                                            <div><span className="text-gray-500">일시:</span> <span className="font-bold text-gray-900">{formatDateTimeAmPm(d?.ra_datetime)}</span></div>
                                                                                            {isPickup && <div><span className="text-gray-500">항공편:</span> <span className="font-bold text-gray-900">{d?.ra_flight_number || '-'}</span></div>}
                                                                                            <div><span className="text-gray-500">인원:</span> <span className="font-bold text-gray-900">{d?.ra_passenger_count || 0}명</span></div>
                                                                                            <div><span className="text-gray-500">장소:</span> <span className="font-bold text-gray-900">{
                                                                                                (() => {
                                                                                                    const loc = d?.ra_airport_location || '';
                                                                                                    const accom = d?.accommodation_info || '';
                                                                                                    if (isPickup) return loc && accom ? `${loc} → ${accom}` : loc || accom || '-';
                                                                                                    if (isSending) return accom && loc ? `${accom} → ${loc}` : accom || loc || '-';
                                                                                                    return loc || accom || '-';
                                                                                                })()
                                                                                            }</span></div>
                                                                                            <div><span className="text-gray-500">차량수:</span> <span className="font-bold text-gray-900">{d?.ra_car_count || 1}대</span></div>
                                                                                            <div><span className="text-gray-500">수하물:</span> <span className="font-bold text-gray-900">{d?.ra_luggage_count || 0}개</span></div>
                                                                                            {d?.ra_stopover_location && <div><span className="text-gray-500">경유지:</span> <span className="font-bold text-gray-900">{d.ra_stopover_location}</span></div>}
                                                                                            {d?.request_note && getFilteredNoteText(d.request_note) && <div><span className="text-gray-500">요청사항:</span> <span className="text-gray-700">{getFilteredNoteText(d.request_note)}</span></div>}
                                                                                        </div>
                                                                                    );
                                                                                })}
                                                                            </div>
                                                                        );
                                                                    })()}
                                                                    {reservation.service_type === 'hotel' && reservation.service_details && (
                                                                        <div className="space-y-1 text-xs">
                                                                            <div><span className="text-gray-500">체크인:</span> <span className="font-bold text-gray-900">{formatDate((reservation.service_details as any).checkin_date)}</span></div>
                                                                            <div><span className="text-gray-500">호텔명:</span> <span className="font-bold text-gray-900">{reservation.priceDetail?.hotel_name || '-'}</span></div>
                                                                            <div><span className="text-gray-500">객실명:</span> <span className="font-bold text-gray-900">{reservation.priceDetail?.room_name || '-'}</span></div>
                                                                            <div><span className="text-gray-500">객실수:</span> <span className="font-bold text-gray-900">{(reservation.service_details as any).room_count || 0}실</span></div>
                                                                            <div><span className="text-gray-500">스케줄:</span> <span className="font-bold text-gray-900">{(reservation.service_details as any).schedule || '-'}</span></div>
                                                                            <div><span className="text-gray-500">투숙인원:</span> <span className="font-bold text-gray-900">{(reservation.service_details as any).guest_count || 0}명</span></div>
                                                                            <div><span className="text-gray-500">인원구성:</span> <span className="font-bold text-gray-900">{(() => {
                                                                                const d = reservation.service_details as any;
                                                                                const parts = [];
                                                                                if ((d?.adult_count || 0) > 0) parts.push(`성인 ${d.adult_count}명`);
                                                                                if ((d?.child_count || 0) > 0) parts.push(`아동 ${d.child_count}명`);
                                                                                if ((d?.infant_count || 0) > 0) parts.push(`유아 ${d.infant_count}명`);
                                                                                return parts.length > 0 ? parts.join(', ') : '-';
                                                                            })()}</span></div>
                                                                            {(reservation.service_details as any).hotel_category && (
                                                                                <div><span className="text-gray-500">호텔등급:</span> <span className="font-bold text-gray-900">{(reservation.service_details as any).hotel_category}</span></div>
                                                                            )}
                                                                            {Boolean((reservation.service_details as any).breakfast_service) && (
                                                                                <div><span className="text-gray-500">조식:</span> <span className="font-bold text-gray-900">{(reservation.service_details as any).breakfast_service}</span></div>
                                                                            )}
                                                                            {(reservation.service_details as any).accommodation_info && (
                                                                                <div><span className="text-gray-500">숙박정보:</span> <span className="text-gray-700">{(reservation.service_details as any).accommodation_info}</span></div>
                                                                            )}
                                                                            {(reservation.service_details as any).assignment_code && (
                                                                                <div><span className="text-gray-500">배정코드:</span> <span className="font-mono text-gray-900">{(reservation.service_details as any).assignment_code}</span></div>
                                                                            )}
                                                                            {(reservation.service_details as any).request_note && getFilteredNoteText((reservation.service_details as any).request_note) && (
                                                                                <div><span className="text-gray-500">요청사항:</span> <span className="text-gray-700">{getFilteredNoteText((reservation.service_details as any).request_note)}</span></div>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                    {reservation.service_type === 'rentcar' && reservation.service_details && (
                                                                        <div className="space-y-1 text-xs">
                                                                            <div><span className="text-gray-500">픽업:</span> <span className="font-bold text-gray-900">{formatDateTimeAmPm((reservation.service_details as any).pickup_datetime || (reservation.service_details as any).pickup_date)}</span></div>
                                                                            <div><span className="text-gray-500">픽업위치:</span> <span className="font-bold text-gray-900">{(reservation.service_details as any).pickup_location || '-'}</span></div>
                                                                            <div><span className="text-gray-500">목적지:</span> <span className="font-bold text-gray-900">{(reservation.service_details as any).destination || '-'}</span></div>
                                                                            {(reservation.service_details as any).via_location && (
                                                                                <div><span className="text-gray-500">경유지:</span> <span className="font-bold text-gray-900">{(reservation.service_details as any).via_location}</span></div>
                                                                            )}
                                                                            {(reservation.service_details as any).via_waiting && (
                                                                                <div><span className="text-gray-500">경유대기:</span> <span className="font-bold text-gray-900">{(reservation.service_details as any).via_waiting}</span></div>
                                                                            )}
                                                                            <div><span className="text-gray-500">이용방식:</span> <span className="font-bold text-gray-900">{(reservation.service_details as any).way_type || reservation.priceDetail?.way_type || '-'}</span></div>
                                                                            <div><span className="text-gray-500">경로:</span> <span className="font-bold text-gray-900">{reservation.priceDetail?.route || '-'}</span></div>
                                                                            <div><span className="text-gray-500">차종:</span> <span className="font-bold text-gray-900">{reservation.priceDetail?.vehicle_type || '-'}</span></div>
                                                                            <div><span className="text-gray-500">탑승인원:</span> <span className="font-bold text-gray-900">{(reservation.service_details as any).passenger_count || reservation.priceDetail?.capacity ? `${(reservation.service_details as any).passenger_count || reservation.priceDetail?.capacity}인` : '-'}</span></div>
                                                                            <div><span className="text-gray-500">수하물:</span> <span className="font-bold text-gray-900">{(reservation.service_details as any).luggage_count || 0}개</span></div>
                                                                            {(reservation.service_details as any).return_datetime && (
                                                                                <div><span className="text-gray-500">드롭:</span> <span className="font-bold text-gray-900">{formatDateTimeAmPm((reservation.service_details as any).return_datetime)}</span></div>
                                                                            )}
                                                                            {(reservation.service_details as any).return_pickup_location && (
                                                                                <div><span className="text-gray-500">드롭위치:</span> <span className="font-bold text-gray-900">{(reservation.service_details as any).return_pickup_location}</span></div>
                                                                            )}
                                                                            {(reservation.service_details as any).return_destination && (
                                                                                <div><span className="text-gray-500">드롭목적지:</span> <span className="font-bold text-gray-900">{(reservation.service_details as any).return_destination}</span></div>
                                                                            )}
                                                                            {(reservation.service_details as any).return_via_location && (
                                                                                <div><span className="text-gray-500">반납경유지:</span> <span className="font-bold text-gray-900">{(reservation.service_details as any).return_via_location}</span></div>
                                                                            )}
                                                                            {(reservation.service_details as any).return_via_waiting && (
                                                                                <div><span className="text-gray-500">반납경유대기:</span> <span className="font-bold text-gray-900">{(reservation.service_details as any).return_via_waiting}</span></div>
                                                                            )}
                                                                            {(reservation.service_details as any).dispatch_code && (
                                                                                <div><span className="text-gray-500">배차코드:</span> <span className="font-mono text-gray-900">{(reservation.service_details as any).dispatch_code}</span></div>
                                                                            )}
                                                                            {(reservation.service_details as any).dispatch_memo && (
                                                                                <div><span className="text-gray-500">배차메모:</span> <span className="text-gray-700">{(reservation.service_details as any).dispatch_memo}</span></div>
                                                                            )}
                                                                            {(reservation.service_details as any).request_note && getFilteredNoteText((reservation.service_details as any).request_note) && (
                                                                                <div><span className="text-gray-500">요청사항:</span> <span className="text-gray-700">{getFilteredNoteText((reservation.service_details as any).request_note)}</span></div>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                    {reservation.service_type === 'tour' && reservation.service_details && (
                                                                        <div className="space-y-1 text-xs">
                                                                            <div><span className="text-gray-500">투어명:</span> <span className="font-bold text-gray-900">{(reservation.priceDetail?.tour_name || (reservation.service_details as any).tour_name || '-')}</span></div>
                                                                            <div><span className="text-gray-500">투어일:</span> <span className="font-bold text-gray-900">{formatDate((reservation.service_details as any).tour_date || (reservation.service_details as any).usage_date)}</span></div>
                                                                            <div><span className="text-gray-500">참가인원:</span> <span className="font-bold text-gray-900">{(() => {
                                                                                const d = reservation.service_details as any;
                                                                                const parts = [];
                                                                                if ((d?.adult_count || 0) > 0) parts.push(`성인 ${d.adult_count}명`);
                                                                                if ((d?.child_count || 0) > 0) parts.push(`아동 ${d.child_count}명`);
                                                                                if ((d?.infant_count || 0) > 0) parts.push(`유아 ${d.infant_count}명`);
                                                                                if (parts.length === 0) return `${d?.tour_capacity || d?.participant_count || 0}명`;
                                                                                return parts.join(', ');
                                                                            })()}</span></div>
                                                                            <div><span className="text-gray-500">픽업장소:</span> <span className="font-bold text-gray-900">{(reservation.service_details as any).pickup_location || '-'}</span></div>
                                                                            {(reservation.service_details as any).dropoff_location && (
                                                                                <div><span className="text-gray-500">드랍장소:</span> <span className="font-bold text-gray-900">{(reservation.service_details as any).dropoff_location}</span></div>
                                                                            )}
                                                                            {(reservation.priceDetail?.vehicle_type || reservation.priceDetail?.tour_vehicle) && (
                                                                                <div><span className="text-gray-500">차량명:</span> <span className="font-bold text-gray-900">{reservation.priceDetail?.vehicle_type || reservation.priceDetail?.tour_vehicle}</span></div>
                                                                            )}
                                                                            {(reservation.service_details as any).accommodation_info && (
                                                                                <div><span className="text-gray-500">숙박정보:</span> <span className="text-gray-700">{(reservation.service_details as any).accommodation_info}</span></div>
                                                                            )}
                                                                            {(reservation.service_details as any).dispatch_code && (
                                                                                <div><span className="text-gray-500">배차코드:</span> <span className="font-mono text-gray-900">{(reservation.service_details as any).dispatch_code}</span></div>
                                                                            )}
                                                                            {(reservation.service_details as any).request_note && getFilteredNoteText((reservation.service_details as any).request_note) && (
                                                                                <div><span className="text-gray-500">요청사항:</span> <span className="text-gray-700">{getFilteredNoteText((reservation.service_details as any).request_note)}</span></div>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                    {reservation.service_type === 'car' && reservation.service_details && (
                                                                        <div className="space-y-1 text-xs">
                                                                            <div><span className="text-gray-500">구분:</span> <span className="font-bold text-gray-900">{(reservation.service_details as any).way_type || '-'}</span></div>
                                                                            <div><span className="text-gray-500">차량타입:</span> <span className="font-bold text-gray-900">{(reservation.service_details as any).vehicle_type || '-'}</span></div>
                                                                            <div><span className="text-gray-500">승객수:</span> <span className="font-bold text-gray-900">{(reservation.service_details as any).passenger_count ?? reservation.priceDetail?.passenger_count ?? 0}명</span></div>
                                                                            <div><span className="text-gray-500">픽업일시:</span> <span className="font-bold text-gray-900">{formatDate((reservation.service_details as any).pickup_datetime)}</span></div>
                                                                            {((reservation.service_details as any).return_datetime || (reservation.service_details as any).dropoff_datetime) && (
                                                                                <div><span className="text-gray-500">드롭일시:</span> <span className="font-bold text-gray-900">{formatDate((reservation.service_details as any).return_datetime || (reservation.service_details as any).dropoff_datetime)}</span></div>
                                                                            )}
                                                                            <div><span className="text-gray-500">픽업위치:</span> <span className="font-bold text-gray-900">{(reservation.service_details as any).pickup_location || '-'}</span></div>
                                                                            <div><span className="text-gray-500">드랍위치:</span> <span className="font-bold text-gray-900">{(reservation.service_details as any).dropoff_location || '-'}</span></div>
                                                                            {(reservation.service_details as any).request_note && (
                                                                                <div><span className="text-gray-500">요청사항:</span> <span className="text-gray-700">{(reservation.service_details as any).request_note}</span></div>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                    {reservation.service_type === 'sht' && reservation.service_details && (
                                                                        <div className="space-y-1 text-xs">
                                                                            <div><span className="text-gray-500">카테고리:</span> <span className="font-bold text-gray-900">{(reservation.service_details as any).sht_category || '-'}</span></div>
                                                                            <div><span className="text-gray-500">차량번호:</span> <span className="font-bold text-gray-900">{(reservation.service_details as any).vehicle_number || '-'}</span></div>
                                                                            <div><span className="text-gray-500">좌석번호:</span> <span className="font-bold text-gray-900">{(reservation.service_details as any).seat_number || '-'}</span></div>
                                                                            <div><span className="text-gray-500">사용일자:</span> <span className="font-bold text-gray-900">{formatDate((reservation.service_details as any).pickup_datetime)}</span></div>
                                                                            <div><span className="text-gray-500">승객수:</span> <span className="font-bold text-gray-900">{(reservation.service_details as any).passenger_count ?? 0}명</span></div>
                                                                            <div><span className="text-gray-500">픽업위치:</span> <span className="font-bold text-gray-900">{(reservation.service_details as any).pickup_location || '-'}</span></div>
                                                                            <div><span className="text-gray-500">드랍위치:</span> <span className="font-bold text-gray-900">{(reservation.service_details as any).dropoff_location || '-'}</span></div>
                                                                            {(reservation.service_details as any).dispatch_code && (
                                                                                <div><span className="text-gray-500">배차코드:</span> <span className="font-mono text-gray-900">{(reservation.service_details as any).dispatch_code}</span></div>
                                                                            )}
                                                                            {(reservation.service_details as any).dispatch_memo && (
                                                                                <div><span className="text-gray-500">배차메모:</span> <span className="text-gray-700">{(reservation.service_details as any).dispatch_memo}</span></div>
                                                                            )}
                                                                            {(reservation.service_details as any).request_note && getFilteredNoteText((reservation.service_details as any).request_note) && (
                                                                                <div><span className="text-gray-500">요청사항:</span> <span className="text-gray-700">{getFilteredNoteText((reservation.service_details as any).request_note)}</span></div>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                    {(() => {
                                                                        const shtCat = String((reservation.service_details as any)?.sht_category || '').toLowerCase();
                                                                        const isShtDropoff = reservation.service_type === 'sht' &&
                                                                            (shtCat.includes('drop') || shtCat.includes('sending') || shtCat.includes('샌딩'));
                                                                        if (isShtDropoff) return null;
                                                                        const fee = Number(reservation.manual_additional_fee || 0);
                                                                        const detail = String(reservation.manual_additional_fee_detail || '').trim();
                                                                        if (!fee && !detail) return null;
                                                                        return (
                                                                            <div className="mt-2 p-2 rounded border border-rose-200 bg-rose-50 text-xs space-y-1">
                                                                                {fee > 0 && <div><span className="text-rose-700">추가요금:</span> <span className="font-bold text-rose-700">{fee.toLocaleString()}동</span></div>}
                                                                                {detail && <div><span className="text-rose-700">추가내역:</span> <span className="text-rose-800 whitespace-pre-line">{detail}</span></div>}
                                                                            </div>
                                                                        );
                                                                    })()}
                                                                    {/* 가격 상세 정보 (병합) - 맞춤 렌더 서비스 제외 (cruise, car, airport, hotel, rentcar, tour, sht) */}
                                                                    {!['cruise', 'car', 'airport', 'hotel', 'rentcar', 'tour', 'sht'].includes(reservation.service_type) && reservation.priceDetail && (
                                                                        <div className="mt-2 pt-1 border-t border-gray-200 text-[11px] text-gray-600">
                                                                            {Object.entries(reservation.priceDetail as Record<string, any>)
                                                                                .filter(([key, value]: [string, any]) =>
                                                                                    !key.includes('code') && key !== 'price' &&
                                                                                    key !== 'start_date' && key !== 'end_date' && key !== 'weekday_type' &&
                                                                                    !(
                                                                                        reservation.service_type === 'tour' &&
                                                                                        (key === 'tour_name' || key === 'tour_capacity' || key === 'tour_vehicle' || key === 'tour_type')
                                                                                    ) &&
                                                                                    value !== null && value !== undefined && String(value).trim() !== ''
                                                                                )
                                                                                .map(([key, value]: [string, any]) => {
                                                                                    const labels: Record<string, string> = {
                                                                                        schedule: '스케줄', cruise: '크루즈', room_category: '구분', room_type: '객실타입',
                                                                                        car_category: '구분', car_type: '차량타입', passenger_count: '승객수', payment: '결제방식',
                                                                                        airport_category: '구분', airport_route: '경로', airport_car_type: '차종',
                                                                                        hotel_name: '호텔명', room_name: '룸명', way_type: '이용방식', category: '카테고리',
                                                                                        route: '경로', vehicle_type: '차종', capacity: '탑승인원', tour_name: '투어명',
                                                                                        tour_capacity: '정원', tour_vehicle: '차량', tour_type: '결제방식',
                                                                                    };
                                                                                    return (
                                                                                        <div key={key}><span className="text-gray-500">{labels[key] || key}:</span> <span className="font-bold text-gray-900">{String(value)}</span></div>
                                                                                    );
                                                                                })
                                                                            }
                                                                        </div>
                                                                    )}
                                                                    {!reservation.service_details && (
                                                                        <div className="text-sm text-gray-400">상세 정보가 없습니다</div>
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        );
                                                    });
                                                })()}
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* 결제 내역 표 (분리됨) */}
                                    <div className="mb-6">
                                        <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center">
                                            <span className="w-1 h-5 bg-green-600 mr-2" />💰 결제 내역
                                        </h3>
                                        <table className="w-full border border-gray-300">
                                            <thead>
                                                <tr className="bg-gray-100">
                                                    <th className="border border-gray-300 px-2 py-1.5 text-center text-[11px] font-semibold text-gray-600 w-6">No.</th>
                                                    <th className="border border-gray-300 px-2 py-1.5 text-center text-[11px] font-semibold text-gray-600 w-20">구분</th>
                                                    <th className="border border-gray-300 px-2 py-1.5 text-center text-[11px] font-semibold text-gray-600 w-50">서비스 상세</th>
                                                    <th className="border border-gray-300 px-2 py-1.5 text-center text-[11px] font-semibold text-gray-600 w-50">금액 계산</th>
                                                    <th className="border border-gray-300 px-2 py-1.5 text-center text-[11px] font-semibold text-gray-600 w-28">합계</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {(() => {
                                                    const serviceOrder: Record<string, number> = { cruise: 0, car: 1, sht: 2, airport: 3, hotel: 4, rentcar: 5, tour: 6 };
                                                    const sortedRaw = [...quoteData.reservations].sort((a, b) =>
                                                        (serviceOrder[a.service_type] ?? 99) - (serviceOrder[b.service_type] ?? 99)
                                                    );
                                                    // 스하차량은 reservation_id 단위로 1행만 표시 (Pickup/Drop-off 등 중복 방지)
                                                    const shtByReservation = new Map<string, any>();
                                                    const nonShtRows: any[] = [];
                                                    for (const row of sortedRaw) {
                                                        if (row.service_type !== 'sht') {
                                                            nonShtRows.push(row);
                                                            continue;
                                                        }
                                                        const key = row.reservation_id;
                                                        const prev = shtByReservation.get(key);
                                                        if (!prev) {
                                                            shtByReservation.set(key, row);
                                                            continue;
                                                        }
                                                        const prevSeats = String(prev.service_details?.seat_number || '').trim();
                                                        const curSeats = String(row.service_details?.seat_number || '').trim();
                                                        const prevAmount = Number(prev.amount || 0);
                                                        const curAmount = Number(row.amount || 0);
                                                        const pickCurrent = (!prevSeats && !!curSeats) || curAmount > prevAmount;
                                                        if (pickCurrent) shtByReservation.set(key, row);
                                                    }
                                                    const sorted = [...nonShtRows, ...Array.from(shtByReservation.values())].sort((a, b) =>
                                                        (serviceOrder[a.service_type] ?? 99) - (serviceOrder[b.service_type] ?? 99)
                                                    );
                                                    // 공항 픽업/샌딩 한 행 병합
                                                    const allPayAirportEntries = sorted.filter(r => r.service_type === 'airport');
                                                    let payAirportSeen = false;
                                                    const displaySorted = sorted.filter(r => {
                                                        if (r.service_type === 'airport') {
                                                            if (payAirportSeen) return false;
                                                            payAirportSeen = true;
                                                        }
                                                        return true;
                                                    });
                                                    return displaySorted.map((r, i) => {
                                                        const d = r.service_details as any;
                                                        const p = r.priceDetail as any;
                                                        let rowAmountOverride: number | null = null;

                                                        // 서비스 상세명 줄 + 인원별 계산식 줄 목록 생성
                                                        const descLines: string[] = [];
                                                        const calcLines: string[] = [];
                                                        switch (r.service_type) {
                                                            case 'cruise': {
                                                                // 상세 표기: 크루즈명 / 스케줄 / 객실타입
                                                                const cruiseName = p?.cruise_name || '';
                                                                const scheduleType = formatScheduleType(p?.schedule_type);
                                                                const roomType = p?.room_type || '';
                                                                if (cruiseName) descLines.push(`🚢 ${cruiseName}`);
                                                                if (scheduleType !== '-' || roomType) descLines.push(`${scheduleType} / ${roomType || '-'}`);
                                                                // cruise_rate_card: price_adult, price_child, price_infant, price_extra_bed, price_child_extra_bed, price_single
                                                                const adultPrice = p?.price_adult || 0;
                                                                const childPrice = p?.price_child || 0;
                                                                const infantPrice = p?.price_infant || 0;
                                                                const extraBedPrice = p?.price_extra_bed || 0;
                                                                const childExtraBedPrice = p?.price_child_extra_bed || 0;
                                                                const singlePrice = p?.price_single || 0;
                                                                const adultCount = d?.adult_count || 0;
                                                                const childCount = d?.child_count || 0;
                                                                const infantCount = d?.infant_count || 0;
                                                                const extraBedCount = d?.extra_bed_count || 0;
                                                                const childExtraBedCount = d?.child_extra_bed_count || 0;
                                                                const singleCount = d?.single_count || 0;
                                                                if (adultCount > 0) calcLines.push(`성인 ${adultCount}명 × ${adultPrice.toLocaleString()}동`);
                                                                if (extraBedCount > 0) calcLines.push(`엑스트라베드(성인) ${extraBedCount}명 × ${extraBedPrice.toLocaleString()}동`);
                                                                if (childCount > 0) calcLines.push(`아동 ${childCount}명 × ${childPrice.toLocaleString()}동`);
                                                                if (childExtraBedCount > 0) calcLines.push(`아동 엑스트라베드 ${childExtraBedCount}명 × ${childExtraBedPrice.toLocaleString()}동`);
                                                                if (infantCount > 0) calcLines.push(`유아 ${infantCount}명 × ${infantPrice.toLocaleString()}동`);
                                                                if (singleCount > 0) calcLines.push(`싱글차지 ${singleCount}명 × ${singlePrice.toLocaleString()}동`);
                                                                break;
                                                            }
                                                            case 'airport': {
                                                                // 병합된 공항 서비스: 모든 공항 항목의 상세+금액을 한 행에 표시
                                                                const airportItems = allPayAirportEntries.length > 0 ? allPayAirportEntries : [r];
                                                                airportItems.forEach((ar) => {
                                                                    const ap = ar.priceDetail as any;
                                                                    const ad = ar.service_details as any;
                                                                    const way = ad?.ra_way_type || ad?.way_type || '';
                                                                    const isPickup = way.includes('픽업') || way.toLowerCase().includes('pickup');
                                                                    const labelText = isPickup ? '픽업' : '샌딩';
                                                                    const cat = ap?.service_type || '';
                                                                    const route = ap?.route || '';
                                                                    const carType = ap?.vehicle_type || '';
                                                                    if (airportItems.length > 1) {
                                                                        const header = cat && cat !== labelText ? `${labelText} / ${cat}` : labelText;
                                                                        descLines.push(`✈️ ${header} / ${[route, carType].filter(Boolean).join(' / ')}`);
                                                                    } else {
                                                                        if (cat || route) descLines.push(`✈️ ${[cat, route].filter(Boolean).join(' / ')}`);
                                                                        if (carType) descLines.push(`차량: ${carType}`);
                                                                    }
                                                                    const airportUnitPrice = ap?.price || 0;
                                                                    const carCount = ad?.ra_car_count || 1;
                                                                    if (airportItems.length > 1) {
                                                                        calcLines.push(`${labelText} ${carCount}대 × ${airportUnitPrice.toLocaleString()}동`);
                                                                    } else {
                                                                        calcLines.push(`${carCount}대 × ${airportUnitPrice.toLocaleString()}동`);
                                                                    }
                                                                });
                                                                break;
                                                            }
                                                            case 'hotel': {
                                                                // 상세 표기: 호텔명 / 객실명
                                                                const hotelName = p?.hotel_name || '';
                                                                const roomName = p?.room_name || '';
                                                                if (hotelName || roomName) descLines.push(`🏨 ${[hotelName, roomName].filter(Boolean).join(' / ')}`);
                                                                const hotelUnitPrice = p?.base_price || 0;
                                                                const rooms = d?.room_count || 1;
                                                                const nights = d?.nights || 1;
                                                                const totalPrice = rooms * nights * hotelUnitPrice;
                                                                calcLines.push(`${rooms}실 × ${nights}박 × ${hotelUnitPrice.toLocaleString()}동 = ${totalPrice.toLocaleString()}동`);
                                                                break;
                                                            }
                                                            case 'rentcar': {
                                                                // 상세 표기: 카테고리 / 노선 / 차량타입 (안함 제외)
                                                                const wayType = p?.way_type || '';
                                                                const rentRoute = p?.route || '';
                                                                const vehicleType = p?.vehicle_type || '';
                                                                const rentParts = [wayType, rentRoute].filter(Boolean);
                                                                if (rentParts.length > 0) descLines.push(`🚗 ${rentParts.join(' / ')}`);
                                                                if (vehicleType) descLines.push(`차량: ${vehicleType}`);
                                                                const rentUnitPrice = p?.price || 0;
                                                                const days = d?.rental_days || 1;
                                                                calcLines.push(`${days}대 × ${rentUnitPrice.toLocaleString()}동`);
                                                                break;
                                                            }
                                                            case 'tour': {
                                                                // 상세 표기: 투어명
                                                                const tourName = p?.tour_name || d?.tour_name || '';
                                                                if (tourName) descLines.push(`🗺️ 투어명: ${tourName}`);
                                                                const tourUnitPrice = p?.price_per_person || 0;
                                                                const cap = d?.tour_capacity || d?.participant_count || 1;
                                                                calcLines.push(`${cap}명 × ${tourUnitPrice.toLocaleString()}동`);
                                                                break;
                                                            }
                                                            case 'car':
                                                            case 'sht': {
                                                                if (r.service_type === 'sht') {
                                                                    descLines.push('🚐 스테이하롱 셔틀 리무진');
                                                                    const summary = getShtSeatPriceSummary(d, Number(d?.car_total_price || r.amount || 0));
                                                                    rowAmountOverride = summary.amount;
                                                                    calcLines.push(...summary.calcLines);
                                                                } else {
                                                                    // 상세 표기: 차량타입만 표시
                                                                    const cType = d?.vehicle_type || p?.car_type || '';
                                                                    if (cType) descLines.push(`🚐 ${cType}`);
                                                                    const carUnitPrice = p?.price || 0;
                                                                    // 차량은 단위를 '대'로 표기
                                                                    const carPax = Math.max(d?.passenger_count || 0, 1);
                                                                    calcLines.push(`${carPax}대 × ${carUnitPrice.toLocaleString()}동`);
                                                                }
                                                                break;
                                                            }
                                                            default: {
                                                                const fallbackPrice = p?.price || p?.base_price || p?.price_per_person || p?.price_adult || 0;
                                                                calcLines.push(`${fallbackPrice.toLocaleString()}동`);
                                                            }
                                                        }

                                                        const manualAdditionalFee = Number(r.manual_additional_fee || 0);
                                                        const manualAdditionalFeeDetail = String(r.manual_additional_fee_detail || '').trim();
                                                        if (manualAdditionalFee > 0) {
                                                            calcLines.push(`추가요금 ${manualAdditionalFee.toLocaleString()}동`);
                                                        }
                                                        if (manualAdditionalFeeDetail) {
                                                            calcLines.push(`추가내역: ${manualAdditionalFeeDetail}`);
                                                        }

                                                        // calcLines가 비어있거나 단가가 모두 0인 경우 총액 기반 fallback
                                                        if (calcLines.length === 0 || (r.service_type !== 'sht' && calcLines.every(l => l.includes('× 0동')))) {
                                                            calcLines.length = 0;
                                                            calcLines.push(`${r.amount.toLocaleString()}동`);
                                                        }

                                                        const hotelRowTotal = (() => {
                                                            if (r.service_type !== 'hotel') return null;
                                                            const hotelUnitPrice = p?.base_price || 0;
                                                            const rooms = d?.room_count || 1;
                                                            const nights = d?.nights || 1;
                                                            return rooms * nights * hotelUnitPrice;
                                                        })();

                                                        const baseRowAmount = rowAmountOverride ?? (r.service_type === 'airport' && allPayAirportEntries.length > 1
                                                            ? allPayAirportEntries.reduce((sum, a) => sum + (a.amount || 0), 0)
                                                            : (hotelRowTotal ?? r.amount));

                                                        const hasReservationTotal = r.reservation_total_amount !== undefined
                                                            && r.reservation_total_amount !== null
                                                            && Number.isFinite(Number(r.reservation_total_amount));
                                                        const reservationRowTotal = Number(r.reservation_total_amount || 0);

                                                        const mergedAirportReservationTotal = r.service_type === 'airport' && allPayAirportEntries.length > 1
                                                            ? Array.from(
                                                                new Map(
                                                                    allPayAirportEntries
                                                                        .filter((a) => a.reservation_id)
                                                                        .map((a) => [a.reservation_id, Number(a.reservation_total_amount || 0)])
                                                                ).values()
                                                            ).reduce((sum, value) => sum + Number(value || 0), 0)
                                                            : null;

                                                        const rowAmountFallback = r.service_type === 'sht'
                                                            ? baseRowAmount + manualAdditionalFee
                                                            : baseRowAmount;

                                                        const rowAmount = mergedAirportReservationTotal !== null && Number.isFinite(mergedAirportReservationTotal)
                                                            ? mergedAirportReservationTotal
                                                            : (hasReservationTotal ? reservationRowTotal : rowAmountFallback);

                                                        return (
                                                            <tr key={`pay-row-${i}`} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                                                <td className="border border-gray-300 px-2 py-2 text-center text-xs text-gray-500">{i + 1}</td>
                                                                <td className="border border-gray-300 px-2 py-2 text-center text-xs font-semibold text-gray-800">{getServiceTypeName(r.service_type)}</td>
                                                                <td className="border border-gray-300 px-3 py-2 text-left text-xs text-gray-600">
                                                                    {descLines.length > 0
                                                                        ? descLines.map((line, li) => <div key={`desc-${li}`} className="text-[11px] text-gray-700">{line}</div>)
                                                                        : <span className="text-gray-400">-</span>
                                                                    }
                                                                </td>
                                                                <td className="border border-gray-300 px-3 py-2 text-left text-xs text-gray-700">
                                                                    {calcLines.length > 0
                                                                        ? calcLines.map((line, li) => <div key={li}>{line}</div>)
                                                                        : <span className="text-gray-400">-</span>
                                                                    }
                                                                </td>
                                                                <td className="border border-gray-300 px-3 py-2 text-right text-sm font-bold text-blue-700">{rowAmount.toLocaleString()}동</td>
                                                            </tr>
                                                        );
                                                    });
                                                })()}
                                            </tbody>
                                            <tfoot>
                                                <tr className="bg-blue-50">
                                                    <td colSpan={5} className="border border-gray-300 px-3 py-3 text-right">
                                                        <span className="text-base font-bold text-gray-900 mr-2">총 결제 금액</span>
                                                        <span className="text-xl font-bold text-blue-600">{quoteData.total_price.toLocaleString()}<span className="text-sm font-normal text-gray-500 ml-1">동</span></span>
                                                    </td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>

                                    {/* 취소규정 */}
                                    <div className="mb-6">
                                        <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center"><span className="w-1 h-5 bg-orange-500 mr-2" />취소규정</h3>
                                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                                            {/* 기본 취소규정 테이블 */}
                                            <div className="mb-4">
                                                <table className="w-full border border-gray-300 text-xs">
                                                    <thead>
                                                        <tr className="bg-orange-50">
                                                            <th className="border border-gray-300 px-3 py-2 text-left font-semibold text-gray-700">취소 기한</th>
                                                            <th className="border border-gray-300 px-3 py-2 text-left font-semibold text-gray-700">수수료 / 위약금</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        <tr>
                                                            <td className="border border-gray-300 px-3 py-2">승선코드 발급 전</td>
                                                            <td className="border border-gray-300 px-3 py-2 font-semibold text-green-600">무료 취소 (31일 이상 남음)</td>
                                                        </tr>
                                                        <tr>
                                                            <td className="border border-gray-300 px-3 py-2">승선코드 발급 후 ~ 31일 전</td>
                                                            <td className="border border-gray-300 px-3 py-2">100만동</td>
                                                        </tr>
                                                        <tr>
                                                            <td className="border border-gray-300 px-3 py-2">21~30일 전</td>
                                                            <td className="border border-gray-300 px-3 py-2">15% 위약금</td>
                                                        </tr>
                                                        <tr>
                                                            <td className="border border-gray-300 px-3 py-2">17~20일 전</td>
                                                            <td className="border border-gray-300 px-3 py-2">50% 위약금</td>
                                                        </tr>
                                                        <tr className="bg-red-50">
                                                            <td className="border border-gray-300 px-3 py-2 font-semibold">16일 전 이후</td>
                                                            <td className="border border-gray-300 px-3 py-2 font-semibold text-red-600">취소 및 환불 불가</td>
                                                        </tr>
                                                    </tbody>
                                                </table>
                                            </div>
                                            {/* 주요 안내 */}
                                            <div className="space-y-2 text-xs text-gray-700 leading-relaxed">
                                                <div>
                                                    <p className="font-semibold text-gray-900 mb-1">⚠️ 중요 안내</p>
                                                    <ul className="space-y-1 ml-3">
                                                        <li>• 예약금 100만동만 송금 후 취소 시, 승선코드 미발급이어도 100만동 위약금 부과</li>
                                                        <li>• 천재지변, 태풍, 승선인원 미달, 크루즈사 사정으로 인한 결항은 전액 반환 보장</li>
                                                        <li>• 환불 대기 기간: 통상 2개월 (주말, 공휴일 제외)</li>
                                                        <li>• 환불 대기가 어렵다면 양도자 찾기로 빠른 환불 가능</li>
                                                    </ul>
                                                </div>
                                                <div className="pt-2 border-t border-gray-300">
                                                    <p className="font-semibold text-gray-900 mb-1">💳 신용카드 결제 고객</p>
                                                    <p className="ml-3">카드사에서 카드매출 취소 가능 시 카드사 측 진행, 불가 시 네이버 환율 기준 베트남동으로 한국 계좌에 반환</p>
                                                </div>
                                                <div className="pt-2 border-t border-gray-300">
                                                    <p className="font-semibold text-gray-900 mb-1">🏥 교통사고·질병 취소</p>
                                                    <p className="ml-3">영문진단서 제출 필수. 크루즈사 심사 후 환자 본인만 취소규정 면제 가능 (100% 환불 완전 보장 아님)</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* 고객센터 */}
                                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
                                        <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center"><span className="w-1 h-5 bg-red-500 mr-2" />긴급연락처 및 고객지원</h3>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                                            <div className="text-center">
                                                <div className="text-xl mb-1">📞</div>
                                                <div className="font-semibold text-gray-700">고객센터</div>
                                                <div className="text-xs text-gray-600">평일 09:00-18:00</div>
                                                <div className="font-mono text-blue-600">07045545185</div>
                                            </div>
                                            <div className="text-center">
                                                <div className="text-xl mb-1">🚨</div>
                                                <div className="font-semibold text-gray-700">24시간 긴급연락</div>
                                                <div className="text-xs text-gray-600">여행 중 응급상황</div>
                                                <div className="font-mono text-red-600">07045545185</div>
                                            </div>
                                            <div className="text-center">
                                                <div className="text-xl mb-1">📧</div>
                                                <div className="font-semibold text-gray-700">이메일 문의</div>
                                                <div className="text-xs text-gray-600">24시간 접수</div>
                                                <div className="text-blue-600">support@stayhalong.com</div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* 푸터 */}
                                    <div className="text-center text-xs text-gray-500 border-t-2 border-blue-600 pt-4">
                                        <div className="mb-3">
                                            <div className="text-base font-bold text-blue-600 mb-1">🌊 스테이하롱 트레블과 함께하는 특별한 여행 🌊</div>
                                            <p className="text-gray-600">베트남 하롱베이에서 잊지 못할 추억을 만들어보세요!</p>
                                        </div>
                                        <div className="bg-blue-50 rounded-lg p-3 text-center">
                                            <div className="font-medium text-gray-700 mb-1">
                                                <span className="text-blue-600">🏢 스테이하롱 트레블</span> |
                                                <span className="text-gray-600"> 하롱베이 상주 한국인 베트남 전문 여행사</span>
                                            </div>
                                            <div className="text-[11px] text-gray-500 space-y-1">
                                                <div>📍 상호 : CONG TY TENPER COMMUNICATIONS</div>
                                                <div>📍 주소 : PHUONG YET KIEU, THANH PHO HA LONG</div>
                                                <div>📧 support@stayhalong.com | ☎️ 07045545185 | 🌐 <a href="https://cafe.naver.com/stayhalong" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">https://cafe.naver.com/stayhalong</a></div>
                                                <div>🕒 운영시간: 평일 09:00-24:00 (토요일 09:00-15:00, 일요일/공휴일 비상업무)</div>
                                                <div className="text-gray-400 mt-1">© 2024 StayHalong Travel. All rights reserved.</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

