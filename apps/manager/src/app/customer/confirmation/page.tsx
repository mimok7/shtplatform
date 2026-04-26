'use client';
import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import supabase from '@/lib/supabase';

interface ReservationDetail {
    reservation_id: string;
    service_type: string;
    service_details: any;
    amount: number;
    status: string;
    price_code?: string;
    price_option?: string;
    all_service_types?: string[]; // 추가: 예약된 모든 서비스 종류
    priceDetail?: any;
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

function CustomerConfirmationClient() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const quoteId = searchParams.get('quote_id');
    const token = searchParams.get('token'); // 보안을 위한 토큰

    const [quoteData, setQuoteData] = useState<QuoteData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (quoteId) {
            loadQuoteData();
        } else {
            setError('올바르지 않은 접근입니다.');
            setLoading(false);
        }
    }, [quoteId]);

    const loadQuoteData = async () => {
        try {
            setLoading(true);

            // 1) 견적 조회
            // - 현재 스키마(sql/db.csv) 기준 quote 테이블에 quote_id 컬럼이 없음
            // - 기본은 quote.id(UUID)로 조회
            let resolvedQuoteId: string | null = null;
            const isUuid = typeof quoteId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(quoteId);
            if (isUuid) {
                resolvedQuoteId = quoteId;
            } else {
                setError('예약 정보를 찾을 수 없습니다. 견적 번호를 확인해 주세요.');
                return;
            }

            const quoteResult = resolvedQuoteId
                ? await supabase
                    .from('quote')
                    .select('*')
                    .eq('id', resolvedQuoteId)
                    .single()
                : { data: null as any, error: { message: 'invalid quote id' } as any };

            if (quoteResult.error || !quoteResult.data) {
                console.error('견적 조회 실패:', quoteResult.error);
                setError('예약 정보를 찾을 수 없습니다. 견적 번호를 확인해 주세요.');
                return;
            }

            const quote = quoteResult.data;
            const quoteUuid = quote.id;

            // 2) 견적 아이템 + 예약 목록 조회 (UUID 기준)
            const [quoteItemResult, reservationsResult] = await Promise.all([
                supabase
                    .from('quote_item')
                    .select('*')
                    .eq('quote_id', quoteUuid),
                supabase
                    .from('reservation')
                    .select('*')
                    .eq('re_quote_id', quoteUuid)
                    .neq('re_type', 'car_sht')
            ]);

            const quoteItems = quoteItemResult.data || [];
            const reservations = reservationsResult.data || [];


            // 2. 사용자 정보 조회
            const userResult = await supabase
                .from('users')
                .select('name, email, phone_number')
                .eq('id', quote.user_id)
                .single();
            const user = userResult.data;

            // 예약 테이블 기반 상세정보 및 가격정보 로드 (모든 예약 상세 테이블 병렬 조회)
            const reservationIds = reservations.map((r: any) => r.re_id);
            const [
                cruiseResult,
                airportResult,
                hotelResult,
                rentcarResult,
                tourResult,
                carResult,
                cruiseCarResult
            ] = await Promise.all([
                reservationIds.length > 0 ?
                    supabase.from('reservation_cruise').select('*').in('reservation_id', reservationIds) :
                    Promise.resolve({ data: [] }),
                reservationIds.length > 0 ?
                    supabase.from('reservation_airport').select('*').in('reservation_id', reservationIds) :
                    Promise.resolve({ data: [] }),
                reservationIds.length > 0 ?
                    supabase.from('reservation_hotel').select('*').in('reservation_id', reservationIds) :
                    Promise.resolve({ data: [] }),
                reservationIds.length > 0 ?
                    supabase.from('reservation_rentcar').select('*').in('reservation_id', reservationIds) :
                    Promise.resolve({ data: [] }),
                reservationIds.length > 0 ?
                    supabase.from('reservation_tour').select('*').in('reservation_id', reservationIds) :
                    Promise.resolve({ data: [] }),
                reservationIds.length > 0 ?
                    supabase.from('reservation_car_sht').select('*').in('reservation_id', reservationIds) :
                    Promise.resolve({ data: [] }),
                reservationIds.length > 0 ?
                    supabase.from('reservation_cruise_car').select('*').in('reservation_id', reservationIds) :
                    Promise.resolve({ data: [] })
            ]);

            // 서비스별 상세 데이터 배열
            const cruiseDetails = cruiseResult.data || [];
            const airportDetails = airportResult.data || [];
            const hotelDetails = hotelResult.data || [];
            const rentcarDetails = rentcarResult.data || [];
            const tourDetails = tourResult.data || [];
            const carDetails = carResult.data || [];
            const cruiseCarDetails = cruiseCarResult.data || [];

            // 차량(car + SHT) 예약 상세 병합: reservation_cruise_car + reservation_car_sht
            const carPriceCodes = Array.from(new Set([
                ...cruiseCarDetails.map(c => c.car_price_code).filter(Boolean),
                ...carDetails.map((c: any) => c.car_price_code).filter(Boolean)
            ]));

            const carPriceResult = carPriceCodes.length > 0 ?
                await supabase.from('rentcar_price').select('*').in('rent_code', carPriceCodes) :
                { data: [] };
            const carPriceData = (carPriceResult?.data || []) as any[];

            const carDataResult = carPriceCodes.length > 0 ?
                await supabase.from('car').select('*').in('car_code', carPriceCodes) :
                { data: [] };
            const carData = (carDataResult?.data || []) as any[];

            // 기존 크루즈 차량 상세 + 매칭된 SHT 상세 포함
            const cruiseCarMergedDetails = cruiseCarDetails.map(detail => {
                const priceInfo = carPriceData.find((p: any) => p.car_code === detail.car_price_code) || {};
                const carInfo = carData.find((c: any) => c.car_code === detail.car_price_code) || {};
                const shtDetail = (carDetails || []).find((s: any) => s.reservation_id === detail.reservation_id) || null;
                return {
                    ...detail,
                    priceInfo,
                    carInfo,
                    shtDetail,
                };
            });

            // 순수 SHT 차량 상세 (reservation_car_sht)에 대한 메타 병합
            const standaloneShtDetails = carDetails.filter((cd: any) =>
                !cruiseCarDetails.some(cc => cc.reservation_id === cd.reservation_id)
            ).map((detail: any) => {
                const priceInfo = carPriceData.find((p: any) => p.car_code === detail.car_price_code) || {};
                const carInfo = carData.find((c: any) => c.car_code === detail.car_price_code) || {};
                return {
                    ...detail,
                    priceInfo,
                    carInfo,
                    shtDetail: detail,
                };
            });

            const carUnifiedDetails = [...cruiseCarMergedDetails, ...standaloneShtDetails];

            // 금액 추출 함수 (실제 데이터 구조에 맞게 수정)
            const pickAmount = (type: string, detail: any): number => {
                if (!detail) return 0;
                const amountFields = [
                    // 우선순위: 크루즈 차량 총액 우선
                    'car_total_price', 'room_total_price', 'total_price', 'unit_price', 'price', 'amount'
                ];
                for (const field of amountFields) {
                    const value = detail[field];
                    if (typeof value === 'number' && !isNaN(value) && value > 0) {
                        return value;
                    }
                }
                return 0;
            };

            // 매핑 준비: 예약ID -> 상태, 서비스유형 -> 상세배열, 인덱스 맵
            const resStatusMap = new Map<string, string>();
            reservations.forEach(r => resStatusMap.set(r.re_id, r.re_status || 'pending'));
            const detailByReservation: Record<string, Map<string, any[]>> = {
                cruise: new Map(),
                airport: new Map(),
                hotel: new Map(),
                rentcar: new Map(),
                tour: new Map(),
                car: new Map(),
            };

            const addDetail = (type: string, detail: any) => {
                if (!detail || !detail.reservation_id) return;
                const map = detailByReservation[type];
                if (!map) return;
                const list = map.get(detail.reservation_id) || [];
                map.set(detail.reservation_id, [...list, detail]);
            };

            cruiseDetails.forEach(detail => addDetail('cruise', detail));
            airportDetails.forEach(detail => addDetail('airport', detail));
            hotelDetails.forEach(detail => addDetail('hotel', detail));
            rentcarDetails.forEach(detail => addDetail('rentcar', detail));
            tourDetails.forEach(detail => addDetail('tour', detail));
            carUnifiedDetails.forEach(detail => addDetail('car', detail));

            // quote_item 서비스 타입을 예약 상세와 1:1로 순서 매칭하여 행 구성
            const normalizeType = (t: string) => {
                if (t === 'room') return 'cruise';
                if (t === 'sht') return 'car';
                return t;
            };
            const priceCodeFieldByType: Record<string, string | undefined> = {
                cruise: 'room_price_code',
                airport: 'airport_price_code',
                hotel: 'hotel_price_code',
                rentcar: 'rentcar_price_code',
                tour: 'tour_price_code',
                // 크루즈 차량 서비스 가격코드
                car: 'car_price_code',
            };
            const optionFieldsByType: Record<string, string[]> = {
                cruise: ['room_type'],
                airport: [],
                hotel: ['hotel_name', 'room_name', 'room_type'],
                rentcar: [],
                tour: ['tour_name'],
                car: ['sht_category'],
            };

            const processedReservations: ReservationDetail[] = [];
            reservations
                .filter(res => res.re_quote_id === quote.id)
                .forEach(res => {
                    const t = normalizeType(res.re_type || '');
                    const details = detailByReservation[t]?.get(res.re_id) || [];
                    if (details.length > 0) {
                        details.forEach(detail => {
                            const priceCodeField = priceCodeFieldByType[t];
                            const optionFields = optionFieldsByType[t] || [];
                            const priceCode = priceCodeField ? (detail?.[priceCodeField] || '') : '';
                            let priceOption = '';
                            for (const k of optionFields) {
                                if (detail?.[k]) { priceOption = detail[k]; break; }
                            }
                            if (!priceOption && t === 'car' && detail?.shtDetail?.sht_category) {
                                priceOption = detail.shtDetail.sht_category;
                            }
                            const parentStatus = resStatusMap.get(res.re_id) || 'pending';
                            const amount = detail ? pickAmount(t, detail) : Number(res.total_amount) || 0;
                            processedReservations.push({
                                reservation_id: res.re_id,
                                service_type: t,
                                service_details: detail || res,
                                amount,
                                status: parentStatus,
                                price_code: priceCode,
                                price_option: priceOption,
                                all_service_types: [res.re_type]
                            });
                        });
                    } else {
                        const priceCodeField = priceCodeFieldByType[t];
                        const optionFields = optionFieldsByType[t] || [];
                        const priceCode = priceCodeField ? (res[priceCodeField] || '') : '';
                        let priceOption = '';
                        for (const k of optionFields) {
                            if (res[k]) { priceOption = res[k]; break; }
                        }
                        const parentStatus = resStatusMap.get(res.re_id) || 'pending';
                        const amount = Number(res.total_amount) || 0;
                        processedReservations.push({
                            reservation_id: res.re_id,
                            service_type: t,
                            service_details: res,
                            amount,
                            status: parentStatus,
                            price_code: priceCode,
                            price_option: priceOption,
                            all_service_types: [res.re_type]
                        });
                    }
                });

            // 최종 데이터 설정
            const rowsTotal = processedReservations.reduce((sum, reservation) => sum + (reservation.amount || 0), 0);

            // 결제 정보에서 총액 합산 시도 (fallback용)
            let paymentTotal = 0;
            if (reservationIds.length > 0) {
                const { data: payments } = await supabase
                    .from('reservation_payment')
                    .select('amount')
                    .in('reservation_id', reservationIds);
                paymentTotal = (payments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
            }

            let finalTotal = Number(quote.total_price) || 0;
            if (finalTotal <= 0) {
                finalTotal = rowsTotal > 0 ? rowsTotal : paymentTotal;
            }

            setQuoteData({
                quote_id: quote.id,
                title: quote.title || '제목 없음',
                user_name: user?.name || '알 수 없음',
                user_email: user?.email || '',
                user_phone: user?.phone_number || '',
                total_price: finalTotal,
                payment_status: quote.payment_status || 'pending',
                created_at: quote.created_at,
                reservations: processedReservations
            });

        } catch (error) {
            console.error('견적 데이터 로드 실패:', error);
            setError('예약 정보를 불러오는 중 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };

    // 가격 정보 테이블에서 상세 정보 조회 함수 (db.csv 기반 컬럼 매핑)
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
                selectFields = ['id', 'cruise_name', 'schedule_type', 'room_type', 'price_adult', 'price_child', 'price_infant', 'valid_from', 'valid_to'];
                break;
            case 'car':
                table = 'rentcar_price';
                codeField = 'car_code';
                selectFields = ['car_code', 'car_category', 'car_type', 'price', 'cruise', 'schedule', 'passenger_count'];
                break;
            case 'airport':
                table = 'airport_price';
                codeField = 'airport_code';
                selectFields = ['airport_code', 'service_type', 'route', 'vehicle_type', 'price'];
                break;
            case 'hotel':
                table = 'hotel_price';
                codeField = 'hotel_price_code';
                selectFields = ['hotel_price_code', 'hotel_code', 'hotel_name', 'room_type', 'room_name', 'room_category', 'base_price', 'start_date', 'end_date', 'weekday_type', 'season_name'];
                break;
            case 'rentcar':
                table = 'rentcar_price';
                codeField = 'rent_code';
                selectFields = ['rent_code', 'way_type', 'route', 'vehicle_type', 'price', 'capacity'];
                break;
            case 'tour':
                table = 'tour_pricing';
                codeField = 'pricing_id';
                selectFields = ['pricing_id', 'price_per_person', 'vehicle_type', 'min_guests', 'max_guests', 'tour_id'];
                break;
            default:
                return null;
        }
        // 차량서비스(car)는 car_price 테이블에서 가격정보를 가져옴
        const { data, error } = await supabase.from(table).select(selectFields.join(',')).eq(codeField, priceCode).single();
        if (error || !data) return null;
        return data;
    }

    const getServiceTypeName = (type: string) => {
        const typeNames = {
            cruise: '크루즈',
            airport: '공항차량',
            hotel: '호텔',
            rentcar: '렌터카',
            tour: '투어',
            sht: '스하차량',
            car: '차량 서비스'
        };
        return typeNames[type as keyof typeof typeNames] || type;
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('ko-KR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    };

    const printConfirmation = () => {
        window.print();
    };

    // 예약 데이터 로드 후 가격 상세 정보 병합
    useEffect(() => {
        if (!quoteData || !quoteData.reservations) return;
        (async () => {
            const updatedReservations = await Promise.all(
                quoteData.reservations.map(async (r) => {
                    if (r.price_code) {
                        const priceDetail = await fetchPriceDetail(r.service_type, r.price_code);
                        return { ...r, priceDetail };
                    }
                    return r;
                })
            );
            setQuoteData((prev) => prev ? { ...prev, reservations: updatedReservations } : prev);
        })();
    }, [quoteData?.reservations]);

    const isPackage = quoteData?.title?.includes('패키지') || (quoteData?.reservations?.length ?? 0) > 1;

    const renderDetailedInfo = (reservation: ReservationDetail) => {
        if (!reservation.service_details) return <div className="text-sm text-gray-400">상세 정보가 없습니다</div>;

        const details = reservation.service_details as any;
        const type = reservation.service_type;

        if (type === 'cruise') {
            return (
                <div className="space-y-1 text-xs">
                    {details.checkin != null && <div><span className="text-gray-500">체크인:</span> <span>{details.checkin}</span></div>}
                    {details.guest_count != null && <div><span className="text-gray-500">투숙인원:</span> <span>{details.guest_count}명</span></div>}
                    {details.request_note != null && <div><span className="text-gray-500">요청사항:</span> <span className="text-gray-600">{details.request_note}</span></div>}
                </div>
            );
        }
        if (type === 'airport') {
            return (
                <div className="space-y-1 text-xs">
                    {details.ra_airport_location != null && <div><span className="text-gray-500">장소:</span> <span>{details.ra_airport_location}</span></div>}
                    {details.ra_datetime != null && <div><span className="text-gray-500">일시:</span> <span>{details.ra_datetime}</span></div>}
                    {details.ra_flight_number != null && <div><span className="text-gray-500">항공편:</span> <span>{details.ra_flight_number}</span></div>}
                    {details.ra_passenger_count != null && <div><span className="text-gray-500">인원:</span> <span>{details.ra_passenger_count}명</span></div>}
                </div>
            );
        }
        if (type === 'hotel') {
            return (
                <div className="space-y-1 text-xs">
                    {details.checkin_date != null && <div><span className="text-gray-500">체크인:</span> <span>{details.checkin_date}</span></div>}
                    {details.nights != null && <div><span className="text-gray-500">박수:</span> <span>{details.nights}박</span></div>}
                    {details.guest_count != null && <div><span className="text-gray-500">투숙인원:</span> <span>{details.guest_count}명</span></div>}
                    {details.hotel_name != null && <div><span className="text-gray-500">호텔명:</span> <span>{details.hotel_name}</span></div>}
                </div>
            );
        }
        if (type === 'rentcar') {
            return (
                <div className="space-y-1 text-xs">
                    {(details.pickup_datetime ?? details.pickup_date) != null && <div><span className="text-gray-500">픽업:</span> <span>{details.pickup_datetime || details.pickup_date}</span></div>}
                    {details.rental_days != null && <div><span className="text-gray-500">대여일수:</span> <span>{details.rental_days}일</span></div>}
                    {details.driver_count != null && <div><span className="text-gray-500">기사수:</span> <span>{details.driver_count}명</span></div>}
                    {details.car_type != null && <div><span className="text-gray-500">차량정보:</span> <span>{details.car_type}</span></div>}
                </div>
            );
        }
        if (type === 'tour') {
            return (
                <div className="space-y-1 text-xs">
                    {details.tour_date != null && <div><span className="text-gray-500">투어일:</span> <span>{details.tour_date}</span></div>}
                    {details.participant_count != null && <div><span className="text-gray-500">참가인원:</span> <span>{details.participant_count}명</span></div>}
                    {details.tour_name != null && <div><span className="text-gray-500">투어명:</span> <span>{details.tour_name}</span></div>}
                    {details.pickup_location != null && <div><span className="text-gray-500">픽업장소:</span> <span>{details.pickup_location}</span></div>}
                </div>
            );
        }
        if (type === 'car') {
            return (
                <div className="space-y-1 text-xs">
                    {details.pickup_datetime != null && <div><span className="text-gray-500">픽업일시:</span> <span className="font-medium">{formatDate(details.pickup_datetime)}</span></div>}
                    {(details.return_datetime != null || details.dropoff_datetime != null) && (
                        <div><span className="text-gray-500">드롭일시:</span> <span className="font-medium">{formatDate(details.return_datetime || details.dropoff_datetime)}</span></div>
                    )}
                    {(details.pickup_location != null || details.dropoff_location != null) && <div><span className="text-gray-500">픽업/드랍:</span> <span className="font-medium">{details.pickup_location || '-'} → {details.dropoff_location || '-'}</span></div>}
                    {details.car_count != null && <div><span className="text-gray-500">차량수:</span> <span>{details.car_count}대</span></div>}
                    {details.passenger_count != null && <div><span className="text-gray-500">승객수:</span> <span>{details.passenger_count}명</span></div>}
                    {details.request_note && <div><span className="text-gray-500">요청사항:</span> <span className="text-gray-600">{details.request_note}</span></div>}
                    {details.shtDetail && (
                        <div className="pt-1 border-t border-gray-200">
                            <div className="text-gray-500">스하차량 선택</div>
                            {details.shtDetail.vehicle_number != null && <div><span className="text-gray-500">차량번호:</span> <span className="font-medium">{details.shtDetail.vehicle_number}</span></div>}
                            {details.shtDetail.seat_number != null && <div><span className="text-gray-500">좌석수:</span> <span className="font-medium">{details.shtDetail.seat_number}석</span></div>}
                            {details.shtDetail.color_label != null && <div><span className="text-gray-500">색상:</span> <span className="font-medium">{details.shtDetail.color_label}</span></div>}
                            {details.shtDetail.driver_name != null && <div><span className="text-gray-500">기사:</span> <span className="font-medium">{details.shtDetail.driver_name}</span></div>}
                        </div>
                    )}
                </div>
            );
        }
        return <div className="text-sm text-gray-400">상세 정보가 없습니다</div>;
    };

    const renderPriceInfo = (reservation: ReservationDetail) => {
        if (!reservation.priceDetail) return <div className="text-xs text-gray-400">가격 상세 정보 없음</div>;

        const order = ['schedule', 'room_category', 'cruise', 'room_type', 'payment'];
        const fieldMap: Record<string, string> = {
            price: '가격', schedule: '스케줄', cruise: '크루즈', start_date: '시작일', end_date: '종료일',
            room_category: '구분', room_type: '객실타입', payment: '결제방식',
            car_category: '구분', car_type: '차량타입', passenger_count: '승객수',
            airport_category: '구분', airport_route: '경로', airport_car_type: '차종',
            hotel_name: '호텔명', room_name: '룸명', weekday_type: '요일구분',
            way_type: '이용방식', route: '경로', vehicle_type: '차종',
            tour_name: '투어명', tour_capacity: '정원', tour_vehicle: '차량', tour_type: '결제방식'
        };

        const entries = typeof reservation.priceDetail === 'object' ? Object.entries(reservation.priceDetail) : [];
        const filtered = entries.filter(([key, value]) => value != null && value !== '' && key !== 'price_code' && key !== 'price' && !key.includes('code') && key !== 'start_date' && key !== 'end_date');
        const sorted = [
            ...order.map(k => filtered.find(([key]) => key === k)).filter(Boolean),
            ...filtered.filter(([key]) => !order.includes(key))
        ].filter((x): x is [string, unknown] => Boolean(x));

        return (
            <div className="mt-1 text-xs text-gray-500">
                {sorted.map(([key, value]) => {
                    const label = key.includes('category') ? '구분' : (fieldMap[key] || key);
                    if (key === 'schedule' && reservation.service_type === 'hotel') {
                        const rawSchedule = reservation.priceDetail?.schedule ?? reservation.service_details?.schedule ?? value;
                        let display = rawSchedule != null ? String(rawSchedule) : '';
                        if (!display || display.trim() === '') {
                            const start = reservation.priceDetail?.start_date || reservation.service_details?.checkin || reservation.service_details?.start_date;
                            const end = reservation.priceDetail?.end_date || reservation.service_details?.checkout || reservation.service_details?.end_date;
                            if (start && end) {
                                try {
                                    const s = new Date(start);
                                    const e = new Date(end);
                                    const nights = Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
                                    display = `${nights}박 ${nights + 1}일`;
                                } catch (e) { display = ''; }
                            }
                        }
                        return <div key={key}><span className="font-medium">{label}:</span> {display || String(value)}</div>;
                    }
                    return <div key={key}><span className="font-medium">{label}:</span> {String(value)}</div>;
                })}
                {reservation.price_option && <div className="text-xs text-gray-500 mt-1">{reservation.price_option}</div>}
            </div>
        );
    };

    const renderAmount = (reservation: ReservationDetail) => {
        let unitPrice = Number(reservation.priceDetail?.price ?? reservation.service_details?.price ?? 0) || 0;
        let count = 1;
        let unit = '명';
        const type = reservation.service_type;
        const details = reservation.service_details as any;

        if (type === 'cruise') count = details?.guest_count ?? 1;
        else if (type === 'airport') { count = details?.ra_car_count ?? 1; unit = '대'; }
        else if (type === 'hotel') {
            const scheduleStr = reservation.priceDetail?.schedule ?? details?.schedule;
            let nights = 1;
            if (scheduleStr && typeof scheduleStr === 'string') {
                const m = scheduleStr.match(/(\d+)\s*박/);
                if (m) nights = Math.max(1, parseInt(m[1], 10));
            }
            count = nights || 1; unit = '박';
        } else if (type === 'rentcar') { count = details?.driver_count ?? 1; unit = '대'; }
        else if (type === 'car') { count = details?.seat_number ?? 1; unit = '대'; }
        else if (type === 'tour') {
            const cap = Number(reservation.priceDetail?.tour_capacity ?? details?.tour_capacity ?? details?.participant_count ?? 1);
            count = isNaN(cap) || cap <= 0 ? 1 : cap;
        }

        if ((!unitPrice || unitPrice === 0) && reservation.amount && Number(count) > 0) {
            const tot = Number(reservation.amount) || 0;
            if (tot > 0) unitPrice = Math.round(tot / Number(count));
        }

        const displayUnit = unitPrice || 0;
        const displayTotal = Number(displayUnit) * Number(count);

        return (
            <div className="text-lg font-bold text-blue-600">
                <span className="text-xs text-gray-500 block mb-1">{`${displayUnit.toLocaleString()} × ${count}${unit} =`}</span>
                {`${Number(displayTotal).toLocaleString()}동`}
            </div>
        );
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500 mx-auto mb-4"></div>
                    <p className="text-gray-600">예약 정보를 불러오는 중...</p>
                </div>
            </div>
        );
    }

    if (error || !quoteData) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="text-6xl mb-6">❌</div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-4">접근 오류</h2>
                    <p className="text-gray-600 mb-6">{error || '예약 정보를 찾을 수 없습니다.'}</p>
                    <button
                        onClick={() => router.push('/')}
                        className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                        창 닫기
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {/* 상단 고정 바 */}
            <div className="bg-white shadow-sm border-b sticky top-0 z-10 print:hidden">
                <div className="max-w-4xl mx-auto px-6 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                            <div className="text-2xl">🌊</div>
                            <div>
                                <h1 className="text-lg font-bold text-gray-900">스테이하롱 크루즈</h1>
                                <p className="text-sm text-gray-600">예약확인서</p>
                            </div>
                        </div>
                        <div className="flex items-center space-x-3">
                            <button
                                onClick={printConfirmation}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2"
                            >
                                <span>🖨️</span>
                                <span>인쇄하기</span>
                            </button>
                            <button
                                onClick={() => router.push('/')}
                                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                            >
                                닫기
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* 확인서 본문 */}
            <div className="max-w-4xl mx-auto p-6">
                <div className="bg-white rounded-lg shadow-lg overflow-hidden print:shadow-none print:rounded-none">
                    <div className="p-8" style={{ fontFamily: 'Arial, sans-serif' }}>
                        {/* 헤더 */}
                        <div className="text-center mb-8 border-b-2 border-blue-600 pb-6">
                            <div className="flex justify-between items-center mb-4">
                                <div className="text-left">
                                    <img src="/images/logo1.png" alt="스테이하롱 크루즈" className="h-12 mx-auto" />
                                </div>
                                <div className="text-right">
                                    <div className="text-xs text-gray-500">확인서 번호</div>
                                    <div className="text-sm font-mono text-gray-700">{quoteData.quote_id.slice(-8).toUpperCase()}</div>
                                    <div className="text-xs text-gray-400 mt-1">발행일: {formatDate(new Date().toISOString())}</div>
                                </div>
                            </div>
                            <h1 className="text-3xl font-bold text-gray-900 mb-2">🎯 예약 확인서</h1>
                            <p className="text-base text-gray-600">베트남 하롱베이 크루즈 여행 예약이 확정되었습니다</p>
                        </div>

                        {/* 고객 및 예약 정보 표 */}
                        <div className="mb-8">
                            <table className="w-full border border-gray-300">
                                <tbody>
                                    <tr className="bg-blue-50">
                                        <td className="border border-gray-300 px-4 py-3 text-gray-700 w-1/4 text-center">예약자 정보</td>
                                        <td className="border border-gray-300 px-4 py-3 text-gray-700 w-1/4 text-center">예약 기본 정보</td>
                                        <td className="border border-gray-300 px-4 py-3 text-gray-700 w-1/4 text-center">예약 내역</td>
                                        <td className="border border-gray-300 px-4 py-3 text-gray-700 w-1/4 text-center">결제 정보</td>
                                    </tr>
                                    <tr>
                                        <td className="border border-gray-300 px-4 py-3 align-top">
                                            <div className="space-y-2">
                                                <div><span className="text-gray-500 text-sm">성명:</span><br /><span className="font-medium">{quoteData.user_name}</span></div>
                                                {quoteData.user_email && (
                                                    <div><span className="text-gray-500 text-sm">📧 이메일:</span><br /><span className="text-sm">{quoteData.user_email}</span></div>
                                                )}
                                                {quoteData.user_phone && (
                                                    <div><span className="text-gray-500 text-sm">📞 연락처:</span><br /><span className="text-sm">{quoteData.user_phone}</span></div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="border border-gray-300 px-4 py-3 align-top">
                                            <div className="space-y-2">
                                                <div><span className="text-gray-500 text-sm">예약번호:</span><br /><span className="font-mono text-sm">{quoteData.quote_id}</span></div>
                                                <div><span className="text-gray-500 text-sm">예약명:</span><br /><span className="font-medium text-sm">{quoteData.title}</span></div>
                                                <div><span className="text-gray-500 text-sm">예약일:</span><br /><span className="text-sm">{formatDate(quoteData.created_at)}</span></div>
                                            </div>
                                        </td>
                                        <td className="border border-gray-300 px-4 py-3 align-top">
                                            <div className="space-y-2">
                                                <div><span className="text-gray-500 text-sm">서비스 종류:</span></div>
                                                <div className="flex flex-wrap gap-2 mt-1">
                                                    {quoteData.reservations && quoteData.reservations.length > 0 ? (
                                                        Array.from(new Set(quoteData.reservations.map(r => r.service_type))).map((type, idx) => (
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
                                        <td className="border border-gray-300 px-4 py-3 align-top">
                                            <div className="space-y-2">
                                                <div><span className="text-gray-500 text-sm">결제상태:</span><br /><span className="inline-block px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded">✅ 결제완료</span></div>
                                                <div><span className="text-gray-500 text-sm">총 금액:</span><br /><span className="text-lg font-bold text-blue-600">{quoteData.total_price.toLocaleString()}동</span></div>
                                            </div>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        {/* 예약 서비스 상세 표 */}
                        <div className="mb-8">
                            <h3 className="text-lg text-gray-900 mb-4 flex items-center">
                                <span className="w-1 h-6 bg-blue-600 mr-3"></span>
                                예약 서비스 상세 내역
                            </h3>
                            <table className="w-full border border-gray-300">
                                <thead>
                                    <tr className="bg-gray-100">
                                        <th className="border border-gray-300 px-3 py-3 text-center text-sm text-gray-700 w-12">No.</th>
                                        <th className="border border-gray-300 px-3 py-3 text-center text-sm text-gray-700">구분</th>
                                        {!isPackage && (
                                            <>
                                                <th className="border border-gray-300 px-3 py-3 text-center text-sm text-gray-700 w-1/4">상세 정보</th>
                                                <th className="border border-gray-300 px-3 py-3 text-center text-sm text-gray-700">가격 정보</th>
                                                <th className="border border-gray-300 px-3 py-3 text-center text-sm text-gray-700">금액</th>
                                            </>
                                        )}
                                        {isPackage && <th className="border border-gray-300 px-3 py-3 text-center text-sm text-gray-700">비고</th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    {quoteData.reservations.map((reservation, index) => (
                                        <tr key={`${reservation.reservation_id}-${reservation.service_type}-${(reservation.service_details as any)?.id ?? index}`} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                            <td className="border border-gray-300 px-3 py-4 text-center font-medium text-gray-700">
                                                {index + 1}
                                            </td>
                                            {/* 서비스 종류 셀 렌더링 부분 (테이블 내부) */}
                                            <td className="border border-gray-300 px-3 py-4 text-center align-top">
                                                <div className="font-medium text-gray-900 mb-1">
                                                    {/* 예약된 모든 서비스 종류를 표시 */}
                                                    {Array.isArray(reservation.all_service_types) && reservation.all_service_types.length > 0 ? (
                                                        <>
                                                            {reservation.all_service_types.map((type, idx) => (
                                                                <span key={type} className="inline-block mr-2 px-2 py-1 bg-blue-50 text-blue-600 rounded text-xs font-medium">
                                                                    {getServiceTypeName(type)}
                                                                </span>
                                                            ))}
                                                        </>
                                                    ) : (
                                                        <span>{getServiceTypeName(reservation.service_type)}</span>
                                                    )}
                                                </div>
                                                <div className="text-xs text-gray-500 font-mono">
                                                    ID: {reservation.reservation_id.slice(-8)}
                                                </div>
                                            </td>

                                            {!isPackage && (
                                                <>
                                                    <td className="border border-gray-300 px-3 py-4 text-left align-top">
                                                        {renderDetailedInfo(reservation)}
                                                    </td>
                                                    <td className="border border-gray-300 px-3 py-4 text-left align-top">
                                                        {renderPriceInfo(reservation)}
                                                    </td>
                                                    <td className="border border-gray-300 px-3 py-4 text-center">
                                                        {renderAmount(reservation)}
                                                    </td>
                                                </>
                                            )}
                                            {isPackage && (
                                                <td className="border border-gray-300 px-3 py-4 text-center text-sm text-gray-500 italic">
                                                    패키지 포함 서비스
                                                </td>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="bg-blue-50">
                                        <td colSpan={isPackage ? 3 : 5} className="border border-gray-300 px-3 py-6 text-right">
                                            <div className="text-lg text-gray-700">
                                                총 결제 금액 : <span className="text-2xl font-bold text-blue-600 ml-2">{quoteData.total_price.toLocaleString()}<span className="text-base font-normal text-gray-500 ml-1">동</span></span>
                                            </div>
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>

                        {/* 여행 일정 및 중요 안내사항 */}
                        <div className="mb-8">
                            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                                <span className="w-1 h-6 bg-orange-500 mr-3"></span>
                                여행 준비사항 및 중요 안내
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                    <h4 className="font-semibold text-blue-800 mb-3 flex items-center">
                                        <span className="mr-2">📋</span>여행 준비물
                                    </h4>
                                    <ul className="text-sm text-blue-700 space-y-1">
                                        <li>• 여권 (유효기간 6개월 이상)</li>
                                        <li>• 본 예약확인서 출력본</li>
                                        <li>• 여행자보험 가입 권장</li>
                                        <li>• 개인 상비약 및 세면용품</li>
                                        <li>• 편안한 복장 및 운동화</li>
                                    </ul>
                                </div>
                                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                                    <h4 className="font-semibold text-yellow-800 mb-3 flex items-center">
                                        <span className="mr-2">⚠️</span>주의사항
                                    </h4>
                                    <ul className="text-sm text-yellow-700 space-y-1">
                                        <li>• 여행 3일 전까지 변경/취소 가능</li>
                                        <li>• 날씨에 따라 일정 변경 가능</li>
                                        <li>• 출발 30분 전 집결 완료</li>
                                        <li>• 안전수칙 준수 필수</li>
                                        <li>• 귀중품 분실 주의</li>
                                    </ul>
                                </div>
                            </div>
                        </div>

                        {/* 긴급연락처 및 고객센터 */}
                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 mb-8">
                            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                                <span className="w-1 h-6 bg-red-500 mr-3"></span>
                                긴급연락처 및 고객지원
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="text-center">
                                    <div className="text-2xl mb-2">📞</div>
                                    <div className="font-semibold text-gray-700">고객센터</div>
                                    <div className="text-sm text-gray-600">평일 09:00-18:00</div>
                                    <div className="font-mono text-blue-600">07045545185</div>
                                </div>
                                <div className="text-center">
                                    <div className="text-2xl mb-2">🚨</div>
                                    <div className="font-semibold text-gray-700">24시간 긴급연락</div>
                                    <div className="text-sm text-gray-600">여행 중 응급상황</div>
                                    <div className="font-mono text-red-600">07045545185</div>
                                </div>
                                <div className="text-center">
                                    <div className="text-2xl mb-2">📧</div>
                                    <div className="font-semibold text-gray-700">이메일 문의</div>
                                    <div className="text-sm text-gray-600">24시간 접수</div>
                                    <div className="text-blue-600">support@stayhalong.com</div>
                                </div>
                            </div>
                        </div>

                        {/* 푸터 */}
                        <div className="text-center text-sm text-gray-500 border-t-2 border-blue-600 pt-6">
                            <div className="mb-4">
                                <div className="text-lg font-bold text-blue-600 mb-2">🌊 스테이하롱 트레블과 함께하는 특별한 여행 🌊</div>
                                <p className="text-gray-600">베트남 하롱베이에서 잊지 못할 추억을 만들어보세요!</p>
                            </div>
                            <div className="bg-blue-50 rounded-lg p-4 text-center">
                                <div className="font-medium text-gray-700 mb-2">
                                    <span className="text-blue-600">🏢 스테이하롱 트레블</span> |
                                    <span className="text-gray-600"> 하롱베이 상주 한국인 베트남 전문 여행사</span>
                                </div>
                                <div className="text-xs text-gray-500 space-y-1">
                                    <div>📍 상호 : CONG TY TENPER COMMUNICATIONS</div>
                                    <div>📍 주소 : PHUONG YET KIEU, THANH PHO HA LONG</div>
                                    <div>📧 support@stayhalong.com | ☎️ 07045545185 | 🌐 <a href="https://cafe.naver.com/stayhalong" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">https://cafe.naver.com/stayhalong</a></div>
                                    <div>🕒 운영시간: 평일 09:00-24:00 (토요일 09:00-15:00, 일요일/공휴일 비상업무)</div>
                                    <div className="text-gray-400 mt-2">© 2024 StayHalong Travel. All rights reserved.</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* 감사 메시지 */}
            <div className="max-w-4xl mx-auto px-6 pb-6 print:hidden">
                <div className="bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg p-6 text-center">
                    <div className="text-3xl mb-3">🎉</div>
                    <h2 className="text-xl font-bold mb-2">예약해 주셔서 감사합니다!</h2>
                    <p className="opacity-90">스테이하롱 크루즈와 함께 특별한 하롱베이 여행을 즐기세요.</p>
                </div>
            </div>
        </div>
    );
}

export const dynamic = 'force-dynamic';

export default function CustomerConfirmationPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500 mx-auto mb-4"></div>
                    <p className="text-gray-600">페이지를 불러오는 중...</p>
                </div>
            </div>
        }>
            <CustomerConfirmationClient />
        </Suspense>
    );
}
