'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useParams } from 'next/navigation';
import supabase from '@/lib/supabase';
import ManagerLayout from '@/components/ManagerLayout';
import {
    ArrowLeft,
    Edit,
    User,
    Calendar,
    Phone,
    Mail,
    FileText,
    Ship,
    Plane,
    Building,
    MapPin,
    Car,
    CheckCircle,
    XCircle,
    Clock,
    Save
} from 'lucide-react';

interface ReservationDetail {
    re_id: string;
    re_type: string;
    re_status: string;
    re_created_at: string;
    re_quote_id: string | null;
    re_user_id: string;
    // 원본 예약 행 전체를 함께 보관 (모든 컬럼 표시 용도)
    reservationRow: any;
    users: {
        id: string;
        name: string;
        email: string;
        phone_number: string;
    } | null;
    quote: {
        title: string;
        status: string;
        total_price: number;
        manager_note?: string | null;
    } | null;
    serviceDetails: any | any[];
    serviceDetailsExtra?: any | any[]; // cruise_car 등 추가 연결 정보 (다중 행)
    serviceCarSht?: any | any[]; // reservation_car_sht 데이터 (다중 행)
    servicePriceDetails?: any[][] | null; // 서비스 상세 각 행에 대한 가격 테이블 행들
    serviceExtraPriceDetails?: any[][] | null; // cruise_car 등 추가 연결의 가격 행들
}

function ReservationViewContent() {
    const router = useRouter();
    const params = useParams();
    const reservationId = params.id as string;

    const [reservation, setReservation] = useState<ReservationDetail | null>(null);
    const [memo, setMemo] = useState<string>('');
    const [memoInitial, setMemoInitial] = useState<string>('');
    const [savingMemo, setSavingMemo] = useState<boolean>(false);
    const [memoMessage, setMemoMessage] = useState<string>('');
    const [savingConfirm, setSavingConfirm] = useState<boolean>(false);
    const [confirmMessage, setConfirmMessage] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!reservationId) {
            alert('예약 ID가 필요합니다.');
            router.push('/manager/reservations');
            return;
        }
        loadReservationDetail();
    }, [reservationId]);

    const loadReservationDetail = async () => {
        try {
            setLoading(true);

            // 권한 확인
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                router.push('/login');
                return;
            }

            // 예약 원본 전체 컬럼 조회
            const { data: reservationRow, error: queryError } = await supabase
                .from('reservation')
                .select('*')
                .eq('re_id', reservationId)
                .single();

            if (queryError) {
                throw queryError;
            }

            if (!reservationRow) {
                alert('예약 정보를 찾을 수 없습니다.');
                router.push('/manager/reservations');
                return;
            }

            // 관련 사용자 정보 조회 (있으면)
            let userInfo: ReservationDetail['users'] = null;
            if (reservationRow.re_user_id) {
                const { data: u } = await supabase
                    .from('users')
                    .select('id, name, email, phone_number')
                    .eq('id', reservationRow.re_user_id)
                    .maybeSingle();
                if (u) userInfo = u as any;
            }

            // 연결된 견적 정보 조회 (있으면)
            let quoteInfo: ReservationDetail['quote'] = null;
            if (reservationRow.re_quote_id) {
                const { data: q } = await supabase
                    .from('quote')
                    .select('title, status, total_price, manager_note')
                    .eq('id', reservationRow.re_quote_id)
                    .maybeSingle();
                if (q) quoteInfo = q as any;
            }

            // 서비스별 상세 정보 조회 (전체 컬럼, 다중 행 지원)
            let serviceDetails: any[] | null = null;
            const serviceTableMap: { [key: string]: string } = {
                cruise: 'reservation_cruise',
                airport: 'reservation_airport',
                hotel: 'reservation_hotel',
                tour: 'reservation_tour',
                ticket: 'reservation_ticket',
                rentcar: 'reservation_rentcar'
            };

            const tableName = serviceTableMap[reservationRow.re_type];
            console.log('🔍 서비스 조회 시작:', {
                serviceType: reservationRow.re_type,
                tableName,
                reservationId
            });

            if (tableName) {
                const { data: serviceData, error: serviceError } = await supabase
                    .from(tableName)
                    .select('*')
                    .eq('reservation_id', reservationId)
                    .order('created_at', { ascending: false });

                if (serviceError) {
                    console.error(`🚨 ${tableName} 데이터 조회 오류:`, serviceError);
                } else {
                    serviceDetails = Array.isArray(serviceData) ? serviceData : (serviceData ? [serviceData] : []);
                    console.log(`✅ ${tableName} 데이터 조회 완료:`, serviceDetails?.length || 0, '건');
                }
            } else {
                console.warn('⚠️ 알 수 없는 서비스 타입:', reservationRow.re_type);
            }

            // 추가 연결 데이터: 크루즈 차량
            let serviceDetailsExtra: any[] | null = null;
            if (reservationRow.re_type === 'cruise') {
                const { data: cruiseCar } = await supabase
                    .from('reservation_cruise_car')
                    .select('*')
                    .eq('reservation_id', reservationId)
                    .order('created_at', { ascending: false });
                serviceDetailsExtra = Array.isArray(cruiseCar) ? cruiseCar : (cruiseCar ? [cruiseCar] : []);
            }

            // 추가: 사내 차량 정보 (있으면 노출)
            let serviceCarSht: any[] | null = null;
            const { data: carSht } = await supabase
                .from('reservation_car_sht')
                .select('*')
                .eq('reservation_id', reservationId)
                .order('created_at', { ascending: false });
            serviceCarSht = Array.isArray(carSht) ? carSht : (carSht ? [carSht] : []);

            // 가격 테이블 매핑 정보
            const priceMap: Record<string, { table: string; codeKey: string; codeColumn: string }> = {
                cruise: { table: 'cruise_rate_card', codeKey: 'room_price_code', codeColumn: 'id' },
                airport: { table: 'airport_price', codeKey: 'airport_price_code', codeColumn: 'airport_code' },
                hotel: { table: 'hotel_price', codeKey: 'hotel_price_code', codeColumn: 'hotel_price_code' },
                rentcar: { table: 'rentcar_price', codeKey: 'rentcar_price_code', codeColumn: 'rent_code' },
                tour: { table: 'tour_pricing', codeKey: 'tour_price_code', codeColumn: 'pricing_id' },
                cruise_car: { table: 'rentcar_price', codeKey: 'car_price_code', codeColumn: 'rent_code' }
            };

            // 서비스 상세 가격 정보 조회 (각 행 별 해당 코드로 모든 가격 행 로드)
            let servicePriceDetails: any[][] | null = null;
            if (serviceDetails && Array.isArray(serviceDetails) && reservationRow.re_type in priceMap) {
                const cfg = priceMap[reservationRow.re_type];
                const priceLists: any[][] = [];
                for (const item of serviceDetails) {
                    const code = item?.[cfg.codeKey];
                    if (!code) { priceLists.push([]); continue; }
                    const { data: priceRows } = await supabase
                        .from(cfg.table)
                        .select('*')
                        .eq(cfg.codeColumn, code);
                    priceLists.push(Array.isArray(priceRows) ? priceRows : (priceRows ? [priceRows] : []));
                }
                servicePriceDetails = priceLists;
            }

            // 추가 연결(크루즈 차량) 가격 정보 조회
            let serviceExtraPriceDetails: any[][] | null = null;
            if (serviceDetailsExtra && Array.isArray(serviceDetailsExtra)) {
                const cfg = priceMap['cruise_car'];
                const extraLists: any[][] = [];
                for (const item of serviceDetailsExtra) {
                    const code = item?.[cfg.codeKey];
                    if (!code) { extraLists.push([]); continue; }
                    const { data: priceRows } = await supabase
                        .from(cfg.table)
                        .select('*')
                        .eq(cfg.codeColumn, code);
                    extraLists.push(Array.isArray(priceRows) ? priceRows : (priceRows ? [priceRows] : []));
                }
                serviceExtraPriceDetails = extraLists;
            }

            const result: ReservationDetail = {
                re_id: reservationRow.re_id,
                re_type: reservationRow.re_type,
                re_status: reservationRow.re_status,
                re_created_at: reservationRow.re_created_at,
                re_quote_id: reservationRow.re_quote_id,
                re_user_id: reservationRow.re_user_id,
                reservationRow,
                users: userInfo,
                quote: quoteInfo,
                serviceDetails,
                serviceDetailsExtra,
                serviceCarSht,
                servicePriceDetails,
                serviceExtraPriceDetails
            };
            setReservation(result);
            setMemo(quoteInfo?.manager_note || '');
            setMemoInitial(quoteInfo?.manager_note || '');
            setError(null);

        } catch (error) {
            console.error('예약 상세 정보 로드 실패:', error);
            setError('예약 정보를 불러오는 중 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'approved': return <CheckCircle className="w-5 h-5 text-blue-600" />;
            case 'confirmed': return <CheckCircle className="w-5 h-5 text-green-600" />;
            case 'completed': return <CheckCircle className="w-5 h-5 text-gray-600" />;
            case 'cancelled': return <XCircle className="w-5 h-5 text-red-600" />;
            default: return <Clock className="w-5 h-5 text-yellow-600" />;
        }
    };

    const getStatusText = (status: string) => {
        switch (status) {
            case 'pending': return '대기중';
            case 'approved': return '승인';
            case 'confirmed': return '확정';
            case 'completed': return '완료';
            case 'cancelled': return '취소됨';
            default: return status;
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'approved': return 'bg-blue-100 text-blue-800 border-blue-200';
            case 'confirmed': return 'bg-green-100 text-green-800 border-green-200';
            case 'completed': return 'bg-gray-100 text-gray-800 border-gray-200';
            case 'cancelled': return 'bg-red-100 text-red-800 border-red-200';
            default: return 'bg-yellow-100 text-yellow-800 border-yellow-200';
        }
    };

    const getTypeIcon = (type: string) => {
        switch (type) {
            case 'cruise': return <Ship className="w-6 h-6 text-blue-600" />;
            case 'airport': return <Plane className="w-6 h-6 text-green-600" />;
            case 'hotel': return <Building className="w-6 h-6 text-purple-600" />;
            case 'tour': return <MapPin className="w-6 h-6 text-orange-600" />;
            case 'ticket': return <FileText className="w-6 h-6 text-teal-600" />;
            case 'rentcar': return <Car className="w-6 h-6 text-red-600" />;
            default: return <FileText className="w-6 h-6 text-gray-600" />;
        }
    };

    const getTypeName = (type: string) => {
        switch (type) {
            case 'cruise': return '크루즈';
            case 'airport': return '공항';
            case 'hotel': return '호텔';
            case 'tour': return '투어';
            case 'ticket': return '티켓';
            case 'rentcar': return '렌터카';
            default: return type;
        }
    };

    const hasQuote = !!reservation?.re_quote_id;
    const memoDirty = memo !== memoInitial;

    const handleSaveMemo = async () => {
        if (!reservation?.re_quote_id) return;
        try {
            setSavingMemo(true);
            setMemoMessage('');
            const { error } = await supabase
                .from('quote')
                .update({ manager_note: memo })
                .eq('id', reservation.re_quote_id);
            if (error) throw error;
            setReservation(prev => prev ? { ...prev, quote: prev.quote ? { ...prev.quote, manager_note: memo } : prev.quote } : prev);
            setMemoInitial(memo);
            setMemoMessage('저장되었습니다.');
        } catch (e: any) {
            setMemoMessage(e?.message || '저장 중 오류가 발생했습니다.');
        } finally {
            setSavingMemo(false);
            setTimeout(() => setMemoMessage(''), 2000);
        }
    };

    const handleConfirmReservation = async () => {
        if (!reservation) return;
        const statusFlow: Record<string, { next: string; label: string } | undefined> = {
            pending: { next: 'approved', label: '승인' },
            approved: { next: 'confirmed', label: '확정' },
            confirmed: { next: 'completed', label: '완료' },
        };
        const flow = statusFlow[reservation.re_status || ''];
        if (!flow) return;
        const nextStatus = flow.next;
        const nextLabel = flow.label;
        try {
            setSavingConfirm(true);
            setConfirmMessage('');
            const { error } = await supabase
                .from('reservation')
                .update({ re_status: nextStatus })
                .eq('re_id', reservation.re_id);
            if (error) throw error;
            setReservation(prev => prev ? { ...prev, re_status: nextStatus, reservationRow: { ...prev.reservationRow, re_status: nextStatus } } : prev);
            setConfirmMessage(`예약이 ${nextLabel}되었습니다.`);

            // 예약 승인(pending → approved) 시: 결제 자동 완료 처리 + 확인서 대기 생성
            if (nextStatus === 'approved') {
                await supabase
                    .from('reservation_payment')
                    .update({ payment_status: 'completed', updated_at: new Date().toISOString() })
                    .eq('reservation_id', reservation.re_id)
                    .eq('payment_status', 'pending');
                const { data: existingCs } = await supabase
                    .from('confirmation_status')
                    .select('reservation_id')
                    .eq('reservation_id', reservation.re_id)
                    .maybeSingle();
                if (!existingCs) {
                    await supabase.from('confirmation_status').insert({
                        reservation_id: reservation.re_id,
                        quote_id: reservation.re_quote_id || null,
                        status: 'waiting',
                    });
                }
            }

            if (nextStatus === 'completed') {
                router.back();
                return;
            }
        } catch (e: any) {
            setConfirmMessage(e?.message || '예약 상태 변경 중 오류가 발생했습니다.');
        } finally {
            setSavingConfirm(false);
            setTimeout(() => setConfirmMessage(''), 2000);
        }
    };

    // 라벨 맵과 id 숨김 규칙을 가진 표 렌더러 (단일 객체)
    const labelMap: Record<string, Record<string, string>> = {
        reservation: {
            re_status: '예약 상태',
            re_created_at: '예약일시',
            contact_name: '신청자명',
            contact_phone: '신청자 연락처',
            contact_email: '신청자 이메일',
            emergency_contact: '비상 연락처',
            special_requests: '요청 사항',
            applicant_name: '신청자명(예비)',
            applicant_email: '신청자 이메일(예비)',
            applicant_phone: '신청자 전화(예비)',
            application_datetime: '신청 일시'
        },
        cruise: {
            reservation_id: '예약 ID',
            room_price_code: '객실 가격 코드',
            checkin: '체크인 날짜',
            guest_count: '탑승객 수',
            unit_price: '단가',
            boarding_assist: '승선 지원 여부',
            room_total_price: '객실 총액',
            request_note: '요청사항',
            created_at: '예약 생성일시',
            nights: '숙박 일수',
            passenger_names: '승객 명단'
        },
        airport: {
            reservation_id: '예약 ID',
            airport_price_code: '공항 가격 코드',
            ra_airport_location: '공항 위치',
            ra_flight_number: '항공편 번호',
            ra_datetime: '운행 일시',
            ra_stopover_location: '경유지',
            ra_stopover_wait_minutes: '경유 대기시간 (분)',
            ra_car_count: '차량 수',
            ra_passenger_count: '승객 수',
            ra_luggage_count: '수하물 개수',
            request_note: '요청사항',
            ra_is_processed: '처리 완료 여부',
            created_at: '예약 생성일시',
            ra_pickup_location: '픽업 장소',
            ra_dropoff_location: '하차 장소'
        },
        hotel: {
            reservation_id: '예약 ID',
            hotel_price_code: '호텔 가격 코드',
            schedule: '스케줄',
            room_count: '객실 수',
            checkin_date: '체크인 날짜',
            checkout_date: '체크아웃 날짜',
            nights: '숙박 일수',
            breakfast_service: '조식 서비스',
            hotel_category: '호텔 등급',
            guest_count: '투숙객 수',
            total_price: '총 결제 금액',
            request_note: '요청사항',
            created_at: '예약 생성일시'
        },
        rentcar: {
            reservation_id: '예약 ID',
            rentcar_price_code: '렌터카 가격 코드',
            rentcar_count: '렌터카 수량',
            unit_price: '단가',
            car_count: '차량 수',
            passenger_count: '승객 수',
            pickup_datetime: '픽업 일시',
            return_datetime: '반납 일시',
            pickup_location: '픽업 장소',
            return_location: '반납 장소',
            destination: '목적지',
            via_location: '경유지',
            via_waiting: '경유 대기시간',
            luggage_count: '수하물 개수',
            rental_days: '렌터카 이용 일수',
            driver_count: '운전자 수',
            total_price: '총 결제 금액',
            request_note: '요청사항',
            created_at: '예약 생성일시'
        },
        tour: {
            reservation_id: '예약 ID',
            tour_price_code: '투어 가격 코드',
            tour_capacity: '투어 정원',
            tour_date: '투어 날짜',
            participant_count: '참가자 수',
            pickup_location: '픽업 장소',
            dropoff_location: '하차 장소',
            tour_duration: '투어 소요시간',
            total_price: '총 결제 금액',
            request_note: '요청사항',
            created_at: '예약 생성일시'
        },
        ticket: {
            reservation_id: '예약 ID',
            ticket_type: '티켓 유형',
            ticket_name: '티켓명',
            program_selection: '프로그램',
            ticket_quantity: '수량',
            usage_date: '이용 날짜',
            shuttle_required: '셔틀 신청',
            pickup_location: '픽업 장소',
            dropoff_location: '하차 장소',
            ticket_details: '상세 내용',
            special_requests: '특별 요청사항',
            unit_price: '단가',
            total_price: '총 결제 금액',
            request_note: '요청사항',
            created_at: '예약 생성일시',
            updated_at: '수정일시'
        },
        cruise_car: {
            reservation_id: '예약 ID',
            car_price_code: '차량 가격 코드',
            car_count: '차량 수',
            passenger_count: '승객 수',
            pickup_datetime: '픽업 일시',
            pickup_location: '픽업 장소',
            dropoff_location: '하차 장소',
            car_total_price: '차량 총액',
            request_note: '요청사항',
            created_at: '생성일시',
            updated_at: '수정일시'
        },
        car_sht: {
            reservation_id: '예약 ID',
            usage_date: '승차일자',
            sht_category: '구분',
            vehicle_number: '차량 번호',
            seat_number: '좌석 수',
            color_label: '차량 색상',
            created_at: '등록일시'
        }
    };

    const priceLabelMap: Record<string, Record<string, string>> = {
        cruise_rate_card: {
            id: '객실 코드',
            schedule_type: '운항 스케줄',
            room_type: '객실 타입',
            room_type_en: '객실 타입(영문)',
            cruise_name: '크루즈명',
            price_adult: '성인 가격 (동)',
            price_child: '소아 가격 (동)',
            price_infant: '유아 가격 (동)',
            valid_from: '운항 시작일',
            valid_to: '운항 종료일',
            season_name: '시즌',
            is_active: '활성 여부'
        },
        airport_price: {
            airport_code: '공항 서비스 코드',
            service_type: '서비스 카테고리',
            route: '운행 노선',
            vehicle_type: '차량 종류',
            price: '가격 (동)',
            base_price: '기본 요금',
            distance_km: '운행 거리 (km)',
            duration_minutes: '소요 시간 (분)'
        },
        hotel_price: {
            hotel_price_code: '요금 코드',
            hotel_code: '호텔 코드',
            hotel_name: '호텔명',
            room_name: '객실명',
            base_price: '기본 가격 (동)',
            season_name: '시즌',
            weekday_type: '요일 타입',
            include_breakfast: '조식 포함',
            start_date: '적용 시작일',
            end_date: '적용 종료일'
        },
        rentcar_price: {
            rent_code: '렌터카 코드',
            way_type: '이용방식',
            route: '이용 경로',
            vehicle_type: '차량 모델',
            price: '1일 가격 (동)',
            base_price: '기본 요금',
            capacity: '탑승 인원',
            insurance_included: '보험 포함 여부',
            fuel_type: '연료 타입'
        },
        tour_pricing: {
            pricing_id: '투어 가격 ID',
            price_per_person: '1인 가격 (동)',
            vehicle_type: '이동 수단',
            min_guests: '최소 인원',
            max_guests: '최대 인원',
            deposit_amount: '보증금',
            season_key: '시즌',
            is_active: '활성 여부'
        },
        car_price: {
            car_code: '차량 서비스 코드',
            car_category: '서비스 카테고리',
            cruise: '연결 크루즈',
            car_type: '차량 종류',
            price: '가격 (동)',
            schedule: '운행 스케줄',
            passenger_count: '승객 정원',
            luggage_capacity: '수하물 용량'
        }
    };

    const renderLabeledTable = (obj: any, type?: keyof typeof labelMap) => {
        if (!obj) return null;
        const hiddenKeys = new Set(['id']);
        const entries = Object.entries(obj).filter(([k]) => {
            if (hiddenKeys.has(k)) return false;
            if (k.endsWith('_id')) return false;
            if (k.endsWith('_price_code')) return false;
            return true;
        });
        return (
            <div className="overflow-x-auto">
                <table className="min-w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                    <tbody>
                        {entries.map(([key, value]) => {
                            let display: any = value;
                            if (value && typeof value === 'string') {
                                const isoLike = /\d{4}-\d{2}-\d{2}/.test(value);
                                if (isoLike) {
                                    const d = new Date(value);
                                    if (!isNaN(d.getTime())) display = d.toLocaleString('ko-KR');
                                }
                            }
                            if (typeof value === 'number') {
                                display = Number(value).toLocaleString('ko-KR');
                            }
                            if (typeof value === 'object' && value !== null) {
                                try { display = JSON.stringify(value); } catch { display = String(value); }
                            }
                            const label = (type && labelMap[type]?.[key]) || key;
                            return (
                                <tr key={key} className="border-b last:border-0">
                                    <th className="w-1/3 text-left bg-gray-50 text-gray-700 px-3 py-2 font-medium align-top">{label}</th>
                                    <td className="px-3 py-2 text-gray-900 break-all">{display === null || display === undefined ? 'null' : display}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        );
    };

    const renderTableList = (items: any[] | null | undefined, type?: keyof typeof labelMap) => {
        if (!items || items.length === 0) return null;
        if (items.length === 1) return renderLabeledTable(items[0], type);
        return (
            <div className="space-y-4">
                {items.map((it, idx) => (
                    <div key={idx} className="border border-gray-200 rounded-lg">
                        <div className="bg-gray-50 text-xs text-gray-600 px-3 py-2 rounded-t">항목 {idx + 1}</div>
                        <div className="p-3">{renderLabeledTable(it, type)}</div>
                    </div>
                ))}
            </div>
        );
    };

    const renderPriceTable = (obj: any, priceTable: keyof typeof priceLabelMap) => {
        if (!obj) return null;
        const labels = priceLabelMap[priceTable] || {};
        const entries = Object.entries(obj);
        return (
            <div className="overflow-x-auto">
                <table className="min-w-full text-sm border border-blue-200 rounded-lg overflow-hidden">
                    <tbody>
                        {entries.map(([key, value]) => {
                            let display: any = value;
                            if (value && typeof value === 'string') {
                                const isoLike = /\d{4}-\d{2}-\d{2}/.test(value);
                                if (isoLike) {
                                    const d = new Date(value);
                                    if (!isNaN(d.getTime())) display = d.toLocaleDateString('ko-KR');
                                }
                            }
                            if (typeof value === 'number') display = Number(value).toLocaleString('ko-KR');
                            if (typeof value === 'object' && value !== null) { try { display = JSON.stringify(value); } catch { display = String(value); } }
                            return (
                                <tr key={key} className="border-b last:border-0">
                                    <th className="w-1/3 text-left bg-blue-50 text-blue-700 px-3 py-2 font-medium align-top">{labels[key] || key}</th>
                                    <td className="px-3 py-2 text-gray-900 break-all">{display === null || display === undefined ? 'null' : display}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        );
    };

    const renderServiceWithPrices = (
        items: any[] | null | undefined,
        type: keyof typeof labelMap,
        priceLists: any[][] | null | undefined,
        priceTableKey: keyof typeof priceLabelMap
    ) => {
        if (!items || items.length === 0) return null;
        return (
            <div className="space-y-4">
                {items.map((it, idx) => (
                    <div key={idx} className="border border-gray-200 rounded-lg">
                        <div className="bg-gray-50 text-xs text-gray-600 px-3 py-2 rounded-t">항목 {idx + 1}</div>
                        <div className="p-3 space-y-3">
                            {renderLabeledTable(it, type)}
                            {(priceLists && priceLists[idx] && priceLists[idx].length > 0) && (
                                <div className="mt-2">
                                    <div className="text-sm font-medium text-blue-700 mb-2">가격 옵션</div>
                                    <div className="space-y-3">
                                        {priceLists[idx].map((p, pi) => (
                                            <div key={pi} className="border border-blue-200 rounded">
                                                <div className="bg-blue-50 text-xs text-blue-700 px-3 py-1 rounded-t">가격 항목 {pi + 1}</div>
                                                <div className="p-2">{renderPriceTable(p, priceTableKey)}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    if (loading) {
        return (
            <ManagerLayout title="예약 상세보기" activeTab="reservations">
                <div className="flex justify-center items-center h-64">
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
                        <p className="mt-4 text-gray-600">예약 정보를 불러오는 중...</p>
                    </div>
                </div>
            </ManagerLayout>
        );
    }

    if (!reservation) {
        return (
            <ManagerLayout title="예약 상세보기" activeTab="reservations">
                <div className="text-center py-12">
                    <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-600">예약 정보를 찾을 수 없습니다</h3>
                </div>
            </ManagerLayout>
        );
    }

    return (
        <ManagerLayout title="예약 상세보기" activeTab="reservations">
            <div className="space-y-6">

                {/* 헤더 */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => router.push('/manager/reservations')}
                            className="p-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                        <div>
                            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
                                {getTypeIcon(reservation.re_type)}
                                {getTypeName(reservation.re_type)} 예약 상세
                            </h1>
                            <p className="text-gray-600 mt-1">예약 ID: {reservation.re_id}</p>
                        </div>
                    </div>

                    <div className="flex gap-3">
                        <button
                            onClick={handleConfirmReservation}
                            disabled={reservation.re_status === 'completed' || reservation.re_status === 'cancelled' || savingConfirm}
                            className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${reservation.re_status === 'completed' || reservation.re_status === 'cancelled' || savingConfirm ? 'bg-gray-200 text-gray-500' : reservation.re_status === 'pending' ? 'bg-blue-600 text-white hover:bg-blue-700' : reservation.re_status === 'approved' ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-gray-700 text-white hover:bg-gray-800'}`}
                            title={reservation.re_status === 'pending' ? '승인 처리' : reservation.re_status === 'approved' ? '확정 처리' : reservation.re_status === 'confirmed' ? '완료 처리' : '처리 불가'}
                        >
                            <CheckCircle className="w-4 h-4" />
                            {reservation.re_status === 'completed' ? '완료됨' : reservation.re_status === 'cancelled' ? '취소됨' : reservation.re_status === 'pending' ? '승인 처리' : reservation.re_status === 'approved' ? '확정 처리' : '완료 처리'}
                        </button>
                        <button
                            onClick={() => router.push(`/manager/reservations/${reservation.re_id}/edit`)}
                            className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors flex items-center gap-2"
                        >
                            <Edit className="w-4 h-4" />
                            수정
                        </button>
                        <button
                            onClick={() => router.push(`/manager/reservations/${reservation.re_id}/confirm`)}
                            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2"
                            title="예약 확인서"
                        >
                            <FileText className="w-4 h-4" /> 확인서
                        </button>
                    </div>
                </div>

                {confirmMessage && (
                    <div className="text-sm text-gray-600 -mt-3">{confirmMessage}</div>
                )}

                {error && (
                    <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
                        ⚠️ {error}
                    </div>
                )}

                {/* 예약 기본 정보는 상위 페이지에서만 표시 */}

                {/* 고객 정보 */}
                {reservation.users && (
                    <div className="bg-white rounded-lg shadow-md p-6">
                        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                            <User className="w-5 h-5 text-green-600" /> 고객 정보
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <div className="space-y-2 text-sm">
                                    <div><span className="text-gray-600">고객명:</span> <strong>{reservation.users.name}</strong></div>
                                    <div className="flex items-center gap-1">
                                        <Mail className="w-4 h-4 text-gray-500" />
                                        <span className="text-gray-600">이메일:</span>
                                        <a href={`mailto:${reservation.users.email}`} className="text-blue-600 hover:underline">
                                            {reservation.users.email}
                                        </a>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <Phone className="w-4 h-4 text-gray-500" />
                                        <span className="text-gray-600">전화번호:</span>
                                        <a href={`tel:${reservation.users.phone_number}`} className="text-blue-600 hover:underline">
                                            {reservation.users.phone_number}
                                        </a>
                                    </div>
                                    <div><span className="text-gray-600">고객 ID:</span> <code className="bg-gray-100 px-2 py-1 rounded text-xs">{reservation.users.id}</code></div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* 견적 정보 */}
                {reservation.quote && (
                    <div className="bg-white rounded-lg shadow-md p-6">
                        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                            <FileText className="w-6 h-6 text-purple-600" />
                            연결된 견적 정보
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <span className="text-gray-600 text-sm">견적 제목:</span>
                                <p className="font-medium">{reservation.quote.title}</p>
                            </div>
                            <div>
                                <span className="text-gray-600 text-sm">견적 상태:</span>
                                <p className="font-medium">{reservation.quote.status}</p>
                            </div>
                            <div>
                                <span className="text-gray-600 text-sm">총 금액:</span>
                                <p className="font-medium text-blue-600">
                                    {reservation.quote.total_price?.toLocaleString()}동
                                </p>
                            </div>
                        </div>
                        <div className="mt-4">
                            <button
                                onClick={() => router.push(`/manager/quotes/${reservation.re_quote_id}/view`)}
                                className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors text-sm"
                            >
                                견적 상세보기 →
                            </button>
                        </div>
                    </div>
                )}

                {/* 서비스 상세 정보 */}
                <div className="bg-white rounded-lg shadow-md p-6">
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                        {getTypeIcon(reservation.re_type)}
                        {getTypeName(reservation.re_type)} 서비스 상세
                    </h3>

                    {reservation.serviceDetails && reservation.serviceDetails.length > 0 ? (
                        <>
                            {/* 서비스별 렌더링 개선 */}
                            {reservation.re_type === 'cruise' && renderServiceWithPrices(
                                Array.isArray(reservation.serviceDetails) ? reservation.serviceDetails : [reservation.serviceDetails],
                                'cruise',
                                reservation.servicePriceDetails,
                                'cruise_rate_card'
                            )}

                            {reservation.re_type === 'airport' && renderServiceWithPrices(
                                Array.isArray(reservation.serviceDetails) ? reservation.serviceDetails : [reservation.serviceDetails],
                                'airport',
                                reservation.servicePriceDetails,
                                'airport_price'
                            )}

                            {reservation.re_type === 'hotel' && renderServiceWithPrices(
                                Array.isArray(reservation.serviceDetails) ? reservation.serviceDetails : [reservation.serviceDetails],
                                'hotel',
                                reservation.servicePriceDetails,
                                'hotel_price'
                            )}

                            {reservation.re_type === 'rentcar' && renderServiceWithPrices(
                                Array.isArray(reservation.serviceDetails) ? reservation.serviceDetails : [reservation.serviceDetails],
                                'rentcar',
                                reservation.servicePriceDetails,
                                'rentcar_price'
                            )}

                            {reservation.re_type === 'tour' && renderServiceWithPrices(
                                Array.isArray(reservation.serviceDetails) ? reservation.serviceDetails : [reservation.serviceDetails],
                                'tour',
                                reservation.servicePriceDetails,
                                'tour_pricing'
                            )}

                            {/* 서비스 타입별 추가 정보 표시 */}
                            {!['cruise', 'airport', 'hotel', 'rentcar', 'tour'].includes(reservation.re_type) && (
                                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                                    <p className="text-sm text-yellow-800 mb-3">
                                        ⚠️ 알 수 없는 서비스 타입: {reservation.re_type}
                                    </p>
                                    {renderTableList(
                                        Array.isArray(reservation.serviceDetails) ? reservation.serviceDetails : [reservation.serviceDetails],
                                        'reservation'
                                    )}
                                </div>
                            )}

                            {/* 고객 요청사항 - 각 서비스별로 처리 */}
                            {(() => {
                                const serviceData = Array.isArray(reservation.serviceDetails) ? reservation.serviceDetails[0] : reservation.serviceDetails;
                                const requestNote = serviceData?.request_note;

                                if (requestNote) {
                                    return (
                                        <div className="mt-4">
                                            <h4 className="font-medium text-gray-700 mb-2">고객 요청사항</h4>
                                            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                                                <p className="text-sm text-gray-700 whitespace-pre-wrap">
                                                    {requestNote}
                                                </p>
                                            </div>
                                        </div>
                                    );
                                }
                                return null;
                            })()}
                        </>
                    ) : (
                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
                            <div className="text-gray-500 mb-2">
                                <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
                                <p className="text-sm">서비스 상세 정보가 없습니다.</p>
                                <p className="text-xs text-gray-400 mt-1">
                                    서비스 타입: {reservation.re_type} | 예약 ID: {reservation.re_id}
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                {/* 크루즈 연결 차량 (reservation_cruise_car) */}
                {reservation.re_type === 'cruise' && reservation.serviceDetailsExtra && (
                    <div className="bg-white rounded-lg shadow-md p-6">
                        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                            <Car className="w-6 h-6 text-red-600" /> 연결 차량 정보 (cruise_car)
                        </h3>
                        {renderServiceWithPrices(
                            Array.isArray(reservation.serviceDetailsExtra) ? reservation.serviceDetailsExtra : [reservation.serviceDetailsExtra],
                            'cruise_car',
                            reservation.serviceExtraPriceDetails,
                            'rentcar_price'
                        )}
                    </div>
                )}

                {/* 사내 차량 정보 (reservation_car_sht) */}
                {reservation.serviceCarSht && (
                    <div className="bg-white rounded-lg shadow-md p-6">
                        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                            <Car className="w-6 h-6 text-gray-600" /> 스하차량 정보
                        </h3>
                        {Array.isArray(reservation.serviceCarSht) ? (
                            <div className="space-y-4">
                                {reservation.serviceCarSht.map((item, idx) => {
                                    const usageDate = item.usage_date ? new Date(item.usage_date).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }) : '-';
                                    const category = item.sht_category || '-';

                                    return (
                                        <div key={idx} className="border border-blue-200 rounded-lg p-4 bg-blue-50">
                                            <div className="grid grid-cols-2 gap-4 mb-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="flex-1">
                                                        <p className="text-xs font-semibold text-green-800 uppercase">승차일자</p>
                                                        <p className="text-lg font-bold text-blue-700">{usageDate}</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <div className="flex-1">
                                                        <p className="text-xs font-semibold text-green-800 uppercase">구분</p>
                                                        <p className={`text-lg font-bold ${category === 'Pickup' || category === '픽업' ? 'text-green-700' : 'text-red-700'}`}>
                                                            {category}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                            {renderLabeledTable(item, 'car_sht')}
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            renderLabeledTable(reservation.serviceCarSht, 'car_sht')
                        )}
                    </div>
                )}

                {/* 관리자 메모 */}
                <div className="bg-white rounded-lg shadow-md p-6">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-lg font-semibold">관리자 메모</h3>
                        {hasQuote && (
                            <button
                                onClick={handleSaveMemo}
                                disabled={!memoDirty || savingMemo}
                                className={`px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 ${(!memoDirty || savingMemo) ? 'bg-gray-200 text-gray-500' : 'bg-green-500 text-white hover:bg-green-600'}`}
                                title="메모 저장"
                            >
                                <Save className="w-4 h-4" /> 저장
                            </button>
                        )}
                    </div>
                    {hasQuote ? (
                        <>
                            <textarea
                                value={memo}
                                onChange={(e) => setMemo(e.target.value)}
                                className="w-full h-32 rounded border border-gray-200 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                                placeholder="관리자 메모를 입력하세요..."
                            />
                            {memoMessage && (
                                <div className="text-xs mt-2 text-gray-600">{memoMessage}</div>
                            )}
                        </>
                    ) : (
                        <div className="bg-gray-50 rounded-lg p-4 text-center text-gray-500 text-sm">
                            연결된 견적이 없어 메모를 저장할 수 없습니다.
                        </div>
                    )}
                </div>
            </div>
        </ManagerLayout>
    );
}

export default function ReservationViewPage() {
    return (
        <Suspense fallback={
            <ManagerLayout title="예약 상세보기" activeTab="reservations">
                <div className="flex justify-center items-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
                </div>
            </ManagerLayout>
        }>
            <ReservationViewContent />
        </Suspense>
    );
}
