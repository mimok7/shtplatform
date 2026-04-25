'use client';

import React, { useState, useEffect } from 'react';
import { X, Ship, Plane, Building, MapPin, Car, Users, Wallet, Calendar, Clock, CheckCircle, AlertCircle, XCircle, Package } from 'lucide-react';
import supabase from '@/lib/supabase';
import ShtCarSeatMap from '@/components/ShtCarSeatMap';

interface UserReservationDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    userInfo: any;
    allUserServices: any[];
    loading: boolean;
}

// 시간 표시는 항상 KST 기준으로 통일 (수동 +8/+9 보정 금지)
function formatDatetimeOffset(value: any): string {
    if (!value) return '-';

    const raw = String(value).trim();
    if (!raw) return '-';

    const hasTimezone = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(raw);

    // timezone 정보가 없는 문자열은 값 자체를 KST 시각으로 간주해 그대로 표시
    if (!hasTimezone) {
        const normalized = raw.replace(' ', 'T');
        const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
        if (match) {
            const [, year, month, day, hourStr, minute] = match;
            const hour24 = Number(hourStr);
            const ampm = hour24 >= 12 ? '오후' : '오전';
            const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
            const hour12Text = String(hour12).padStart(2, '0');
            return `${year}. ${month}. ${day}. ${ampm} ${hour12Text}:${minute}`;
        }
        return raw;
    }

    const d = new Date(raw);
    if (isNaN(d.getTime())) return raw;

    return d.toLocaleString('ko-KR', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
    });
}

const isInfantSurchargeText = (text: string): boolean => {
    return /유아|infant|2세\s*미만|3번째|2인째/i.test(text || '');
};

const getChargeableInfantCountFromText = (infantCount: number, text: string): number => {
    if (/3번째/.test(text)) return Math.max(0, infantCount - 2);
    if (/2인째/.test(text)) return Math.max(0, infantCount - 1);
    return Math.max(0, infantCount);
};

const normalizeCruisePriceBreakdown = (pb: any, infantCount: number) => {
    if (!pb || !Array.isArray(pb.surcharges)) return pb;

    const normalizedSurcharges = pb.surcharges.map((s: any) => {
        const label = String(s?.holiday_name || '');
        if (!isInfantSurchargeText(label)) return s;

        const chargeableInfants = getChargeableInfantCountFromText(infantCount, label);
        const unit = Number(s?.surcharge_adult ?? s?.surcharge_child ?? 0);
        return {
            ...s,
            adult_count: 0,
            child_count: 0,
            infant_count: chargeableInfants,
            total: unit * chargeableInfants,
        };
    });

    const surchargeTotal = normalizedSurcharges
        .filter((s: any) => s?.is_confirmed !== false)
        .reduce((sum: number, s: any) => sum + Number(s?.total || 0), 0);

    const subtotal = Number(pb?.subtotal || 0);
    const optionTotal = Number(pb?.option_total || 0);

    return {
        ...pb,
        surcharges: normalizedSurcharges,
        surcharge_total: surchargeTotal,
        grand_total: subtotal + surchargeTotal + optionTotal,
    };
};

const getFilteredNoteText = (note: any): string => {
    if (!note) return '';

    const sanitizedNote = String(note)
        .replace(/\[CHILD_OLDER_COUNTS:[^\]]*\]\s*/gi, '')
        .trim();

    const hiddenLinePattern = /^(?:비고\s*:\s*)?(?:\[(?:객실|구성)\s*\d+\]|(?:객실|구성)\s*\d+\b)/;

    const lines = sanitizedNote
        .split('\n')
        .map((line) => line.replace(/\u00A0/g, ' ').trim())
        .filter(Boolean)
        .filter((line) => !hiddenLinePattern.test(line));
    return lines.join('\n').trim();
};

const renderServiceNote = (note: any) => {
    const filteredNote = getFilteredNoteText(note);
    if (!filteredNote) return null;
    return <div className="text-gray-500 text-xs mt-1 bg-gray-50 p-1 rounded whitespace-pre-line">비고: {filteredNote}</div>;
};

const getManualAdditionalFee = (service: any): number => {
    const raw = service?.manual_additional_fee
        ?? service?.manualAdditionalFee
        ?? service?.reservation_manual_additional_fee
        ?? service?.reservation?.manual_additional_fee
        ?? service?.priceBreakdown?.additional_fee
        ?? service?.price_breakdown?.additional_fee
        ?? 0;
    const parsed = Number(raw || 0);
    return Number.isFinite(parsed) ? parsed : 0;
};

const getManualAdditionalFeeDetail = (service: any): string => {
    const raw = service?.manual_additional_fee_detail
        ?? service?.manualAdditionalFeeDetail
        ?? service?.reservation_manual_additional_fee_detail
        ?? service?.reservation?.manual_additional_fee_detail
        ?? service?.priceBreakdown?.additional_fee_detail
        ?? service?.price_breakdown?.additional_fee_detail
        ?? '';
    return String(raw || '').trim();
};

const getReservationTotalAmount = (service: any): number | null => {
    const raw = service?.reservation_total_amount
        ?? service?.reservationTotalAmount
        ?? service?.reservation?.total_amount
        ?? null;

    if (raw === null || raw === undefined || raw === '') return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
};

export default function UserReservationDetailModal({
    isOpen,
    onClose,
    userInfo,
    allUserServices,
    loading,
}: UserReservationDetailModalProps) {
    const [sortMode, setSortMode] = useState<'date' | 'type'>('type');
    const [enrichedServices, setEnrichedServices] = useState<any[]>([]);
    const [isEnriching, setIsEnriching] = useState(false);
    const [isShtSeatModalOpen, setIsShtSeatModalOpen] = useState(false);
    const [selectedShtService, setSelectedShtService] = useState<any>(null);

    // 서비스 데이터 보강 (가격 테이블 정보 추가)
    useEffect(() => {
        if (!isOpen || !allUserServices || allUserServices.length === 0) {
            setEnrichedServices(allUserServices || []);
            return;
        }

        const enrichServicesData = async () => {
            setIsEnriching(true);
            try {
                // 1. 각 서비스별 price_code 수집
                const airportCodes = allUserServices
                    .filter(s => s.serviceType === 'airport' && s.airport_price_code)
                    .map(s => s.airport_price_code);
                const rentCodes = allUserServices
                    .filter(s => s.serviceType === 'rentcar' && s.rentcar_price_code)
                    .map(s => String(s.rentcar_price_code || '').trim())
                    .filter(Boolean);
                const tourCodes = allUserServices
                    .filter(s => s.serviceType === 'tour' && s.tour_price_code)
                    .map(s => s.tour_price_code);
                const reservationIds = Array.from(new Set(
                    allUserServices
                        .map(s => String(s.reservation_id || s.reservationId || '').trim())
                        .filter(Boolean)
                ));

                // 2. 가격 테이블 조회
                const [airportPrices, rentPrices, tourPrices, reservationRows] = await Promise.all([
                    airportCodes.length > 0
                        ? supabase.from('airport_price').select('airport_code, service_type, route, vehicle_type').in('airport_code', airportCodes)
                        : Promise.resolve({ data: [] }),
                    rentCodes.length > 0
                        ? supabase.from('rentcar_price').select('rent_code, vehicle_type, way_type, route, price, capacity').in('rent_code', rentCodes)
                        : Promise.resolve({ data: [] }),
                    tourCodes.length > 0
                        ? supabase.from('tour_pricing').select('pricing_id, price_per_person, vehicle_type, tour:tour_id(tour_name, tour_code)').in('pricing_id', tourCodes)
                        : Promise.resolve({ data: [] }),
                    reservationIds.length > 0
                        ? supabase
                            .from('reservation')
                            .select('re_id, total_amount, manual_additional_fee, manual_additional_fee_detail')
                            .in('re_id', reservationIds)
                        : Promise.resolve({ data: [] })
                ]);

                // 3. Map 생성
                const airportPriceMap = new Map((airportPrices.data || []).map((r: any) => [r.airport_code, r]));
                const rentPriceMap = new Map<string, any>();
                for (const row of rentPrices.data || []) {
                    const rawCode = String(row?.rent_code || '').trim();
                    const upperCode = rawCode.toUpperCase();
                    if (rawCode) {
                        rentPriceMap.set(rawCode, row);
                    }
                    if (upperCode && upperCode !== rawCode) {
                        rentPriceMap.set(upperCode, row);
                    }
                }
                const tourPriceMap = new Map((tourPrices.data || []).map((r: any) => [r.pricing_id, r]));
                const reservationMap = new Map((reservationRows.data || []).map((r: any) => [r.re_id, r]));

                console.log('🔍 Modal - Airport Price Map:', airportPriceMap);
                console.log('🚗 Modal - Rent Price Map:', rentPriceMap);
                console.log('🗺️ Modal - Tour Price Map:', tourPriceMap);

                // 4. 서비스 데이터 보강
                const enriched = allUserServices.map(service => {
                    const reservationId = String(service.reservation_id || service.reservationId || '').trim();
                    const reservationInfo: any = reservationId ? reservationMap.get(reservationId) : null;
                    const serviceWithReservation = reservationInfo
                        ? {
                            ...service,
                            reservation_total_amount: reservationInfo.total_amount,
                            reservation_manual_additional_fee: reservationInfo.manual_additional_fee,
                            reservation_manual_additional_fee_detail: reservationInfo.manual_additional_fee_detail,
                            reservation: {
                                ...(service?.reservation || {}),
                                ...reservationInfo,
                            },
                        }
                        : service;

                    if (serviceWithReservation.serviceType === 'airport' && serviceWithReservation.airport_price_code) {
                        const priceInfo: any = airportPriceMap.get(serviceWithReservation.airport_price_code);
                        return {
                            ...serviceWithReservation,
                            route: priceInfo?.route || service.route || '-',
                            carType: priceInfo?.vehicle_type || serviceWithReservation.carType || '-',
                            category: priceInfo?.service_type || serviceWithReservation.category || '-'
                        };
                    }
                    if (serviceWithReservation.serviceType === 'rentcar' && serviceWithReservation.rentcar_price_code) {
                        const rentCode = String(serviceWithReservation.rentcar_price_code || '').trim();
                        const priceInfo: any = rentPriceMap.get(rentCode) || rentPriceMap.get(rentCode.toUpperCase());
                        return {
                            ...serviceWithReservation,
                            route: priceInfo?.route || serviceWithReservation.route || '-',
                            carType: priceInfo?.vehicle_type || serviceWithReservation.vehicle_type || serviceWithReservation.carType || '-',
                            category: priceInfo?.way_type || serviceWithReservation.category || '-'
                        };
                    }
                    if (serviceWithReservation.serviceType === 'tour' && serviceWithReservation.tour_price_code) {
                        const priceInfo: any = tourPriceMap.get(serviceWithReservation.tour_price_code);
                        return {
                            ...serviceWithReservation,
                            carType: priceInfo?.vehicle_type || serviceWithReservation.carType || '-',
                            tourName: priceInfo?.tour?.tour_name || serviceWithReservation.tourName || '-'
                        };
                    }
                    return serviceWithReservation;
                });

                setEnrichedServices(enriched);
            } catch (error) {
                console.error('❌ 서비스 데이터 보강 실패:', error);
                setEnrichedServices(allUserServices);
            } finally {
                setIsEnriching(false);
            }
        };

        enrichServicesData();
    }, [isOpen, allUserServices]); if (!isOpen) return null;

    const getServiceIcon = (serviceType: string) => {
        switch (serviceType) {
            case 'cruise': return <Ship className="w-5 h-5 text-blue-600" />;
            case 'vehicle':
            case 'car': return <Car className="w-5 h-5 text-purple-600" />;
            case 'airport': return <Plane className="w-5 h-5 text-green-600" />;
            case 'hotel': return <Building className="w-5 h-5 text-orange-600" />;
            case 'tour': return <MapPin className="w-5 h-5 text-pink-600" />;
            case 'rentcar': return <Car className="w-5 h-5 text-indigo-600" />;
            case 'sht': return <Car className="w-5 h-5 text-blue-500" />;
            case 'package': return <Package className="w-5 h-5 text-indigo-600" />;
            default: return <Users className="w-5 h-5 text-gray-600" />;
        }
    };

    const getServiceLabel = (serviceType: string) => {
        const labels: Record<string, string> = {
            cruise: '크루즈',
            vehicle: '크루즈 차량',
            car: '크루즈 차량',
            airport: '공항',
            hotel: '호텔',
            tour: '투어',
            rentcar: '렌터카',
            sht: '스하차량',
            package: '패키지'
        };
        return labels[serviceType] || '서비스';
    };

    const getStatusBadge = (status: string) => {
        if (status === 'confirmed') return <span className="flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full"><CheckCircle className="w-3 h-3" />확정</span>;
        if (status === 'completed') return <span className="flex items-center gap-1 text-xs font-medium text-gray-700 bg-gray-100 px-2 py-0.5 rounded-full"><CheckCircle className="w-3 h-3" />완료</span>;
        if (status === 'pending') return <span className="flex items-center gap-1 text-xs font-medium text-yellow-700 bg-yellow-100 px-2 py-0.5 rounded-full"><AlertCircle className="w-3 h-3" />대기</span>;
        if (status === 'cancelled') return <span className="flex items-center gap-1 text-xs font-medium text-red-700 bg-red-100 px-2 py-0.5 rounded-full"><XCircle className="w-3 h-3" />취소</span>;
        return <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{status}</span>;
    };

    const getDateStr = (service: any) => {
        let dateStr = '';
        if (service.checkin) dateStr = service.checkin;
        else if (service.pickupDatetime) dateStr = service.pickupDatetime.split('T')[0];
        else if (service.date) dateStr = service.date;
        else if (service.checkinDate) dateStr = service.checkinDate;
        else if (service.tourDate) dateStr = service.tourDate;
        else if (service.usageDate) dateStr = service.usageDate.split('T')[0];
        return dateStr;
    };

    const getSortedGroups = () => {
        // 중복 제거 제거: 모든 서비스를 표시 (공항 픽업/샌딩, 렌터카 픽업/드롭 등)
        const allServices = enrichedServices || [];

        if (sortMode === 'date') {
            const groups: Record<string, any[]> = {};
            allServices.forEach(service => {
                const date = getDateStr(service);
                const key = date || '기타';
                if (!groups[key]) groups[key] = [];
                groups[key].push(service);
            });

            // 날짜 오름차순 정렬
            const sortedKeys = Object.keys(groups).sort((a, b) => {
                if (a === '기타') return 1;
                if (b === '기타') return -1;
                return new Date(a).getTime() - new Date(b).getTime();
            });

            return sortedKeys.map(key => ({
                title: key === '기타' ? '날짜 미정' : new Date(key).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }),
                originalKey: key,
                items: groups[key]
            }));
        } else {
            // 종류별 정렬
            const typeOrder = ['cruise', 'vehicle', 'sht', 'airport', 'tour', 'rentcar', 'hotel'];
            const groups: Record<string, any[]> = {};

            allServices.forEach(service => {
                const type = service.serviceType;
                if (!groups[type]) groups[type] = [];
                groups[type].push(service);
            });

            const sortedTypes = Object.keys(groups).sort((a, b) => {
                const indexA = typeOrder.indexOf(a);
                const indexB = typeOrder.indexOf(b);
                const valA = indexA === -1 ? 999 : indexA;
                const valB = indexB === -1 ? 999 : indexB;
                return valA - valB;
            });

            return sortedTypes.map(type => ({
                title: getServiceLabel(type),
                originalKey: type,
                items: groups[type].sort((a, b) => {
                    const dateA = getDateStr(a) || '9999-99-99';
                    const dateB = getDateStr(b) || '9999-99-99';
                    return dateA.localeCompare(dateB);
                })
            }));
        }
    };

    const sortedGroups = getSortedGroups();
    const childBirthDates = Array.isArray(userInfo?.child_birth_dates)
        ? userInfo.child_birth_dates.filter((date: unknown): date is string => typeof date === 'string' && date.trim().length > 0)
        : [];

    const openShtSeatModal = (service: any) => {
        setSelectedShtService(service);
        setIsShtSeatModalOpen(true);
    };

    const handleShtSeatSelected = (seatInfo: { vehicle: string; seat: string; category: string; usageDate?: string }) => {
        if (!selectedShtService) return;

        setEnrichedServices(prev => prev.map(service => {
            if (service !== selectedShtService && service.reservation_id !== selectedShtService.reservation_id) {
                return service;
            }

            if (service.serviceType !== 'sht') return service;

            return {
                ...service,
                vehicleNumber: seatInfo.vehicle,
                seatNumber: seatInfo.seat,
                category: seatInfo.category,
                usageDate: seatInfo.usageDate || service.usageDate,
            };
        }));
    };

    const renderServiceContent = (service: any) => {
        const type = service.serviceType;
        const isPackageService = service.isPackageService;
        const manualAdditionalFee = getManualAdditionalFee(service);
        const manualAdditionalFeeDetail = getManualAdditionalFeeDetail(service);

        return (
            <div className="flex flex-col gap-1 text-sm text-gray-700 mt-2">
                {isPackageService && (
                    <div className="mb-1">
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-full">
                            <Package className="w-3 h-3" />패키지 포함
                        </span>
                    </div>
                )}
                {type === 'cruise' && (
                    <>
                        {(() => {
                            const rawPb = service.priceBreakdown || service.price_breakdown || null;
                            const pb = normalizeCruisePriceBreakdown(rawPb, Number(service.infant || 0));
                            const roomTotalPrice = Number(service.room_total_price || 0);
                            const pbGrandTotal = Number(pb?.grand_total || 0);
                            const cruiseTotal = roomTotalPrice > 0
                                ? roomTotalPrice
                                : Number(pbGrandTotal > 0 ? pbGrandTotal : (service.totalPrice ?? service.total_amount ?? 0));
                            const cruiseLines = [
                                pb?.adult && { label: '성인', value: pb.adult },
                                pb?.child && { label: '아동', value: pb.child },
                                pb?.child_extra_bed && { label: '아동엑베', value: pb.child_extra_bed },
                                pb?.infant && { label: '유아', value: pb.infant },
                                pb?.extra_bed && { label: '엑스트라베드', value: pb.extra_bed },
                                pb?.single && { label: '싱글차액', value: pb.single },
                            ].filter(Boolean) as Array<{ label: string; value: any }>;

                            return (
                                <>
                                    <div className="bg-blue-50 rounded-lg p-3 mb-2 border border-blue-100">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                                            <div><strong>크루즈명:</strong> <span className="font-semibold text-blue-800">{service.cruiseName || service.cruise || '크루즈'}</span></div>
                                            <div><strong>객실타입:</strong> {service.roomType}</div>
                                            <div><strong>객실수:</strong> {service.room_count || service.roomCount || 0}실</div>
                                            <div><strong>체크인:</strong> {service.checkin}</div>
                                            <div><strong>결제방식:</strong> {service.paymentMethod}</div>
                                            <div><strong>성인:</strong> {service.adult || 0}명</div>
                                            <div><strong>아동:</strong> {service.child || 0}명</div>
                                            {(service.infant || 0) > 0 && <div><strong>유아:</strong> {service.infant}명</div>}
                                            {(service.childExtraBedCount || 0) > 0 && <div><strong>아동엑베:</strong> {service.childExtraBedCount}명</div>}
                                            {(service.extraBedCount || 0) > 0 && <div><strong>엑스트라베드:</strong> {service.extraBedCount}개</div>}
                                            {(service.singleCount || 0) > 0 && <div><strong>싱글:</strong> {service.singleCount}명</div>}
                                        </div>
                                    </div>
                                    {/* 카테고리별 요금 내역 */}
                                    <div className="border-t border-gray-100 pt-2 mt-1 space-y-1">
                                        <div className="text-xs font-semibold text-gray-500 mb-1">요금 내역</div>
                                        {cruiseLines.length > 0 ? (
                                            cruiseLines.map((line, idx) => (
                                                <div key={`${line.label}-${idx}`} className="flex justify-between text-sm">
                                                    <span className="text-gray-600">{line.label} {Number(line.value?.unit_price || 0).toLocaleString()}동 × {Number(line.value?.count || 0)}명</span>
                                                    <span className="font-medium">{Number(line.value?.total || 0).toLocaleString()}동</span>
                                                </div>
                                            ))
                                        ) : (
                                            <>
                                                {(service.adult || 0) > 0 && (
                                                    <div className="flex justify-between text-sm">
                                                        <span className="text-gray-600">성인 {Number(service.priceAdult || service.unitPrice || 0).toLocaleString()}동 × {service.adult}명</span>
                                                        <span className="font-medium">{(Number(service.priceAdult || service.unitPrice || 0) * (service.adult || 0)).toLocaleString()}동</span>
                                                    </div>
                                                )}
                                                {(service.child || 0) > 0 && (
                                                    <div className="flex justify-between text-sm">
                                                        <span className="text-gray-600">아동 {Number(service.priceChild || 0).toLocaleString()}동 × {service.child}명</span>
                                                        <span className="font-medium">{(Number(service.priceChild || 0) * (service.child || 0)).toLocaleString()}동</span>
                                                    </div>
                                                )}
                                                {(service.childExtraBedCount || 0) > 0 && (
                                                    <div className="flex justify-between text-sm">
                                                        <span className="text-gray-600">아동엑베 {Number(service.priceChildExtraBed || 0).toLocaleString()}동 × {service.childExtraBedCount}명</span>
                                                        <span className="font-medium">{(Number(service.priceChildExtraBed || 0) * (service.childExtraBedCount || 0)).toLocaleString()}동</span>
                                                    </div>
                                                )}
                                                {(service.infant || 0) > 0 && (
                                                    <div className="flex justify-between text-sm">
                                                        <span className="text-gray-600">유아 {Number(service.priceInfant || 0).toLocaleString()}동 × {service.infant}명</span>
                                                        <span className="font-medium">{(Number(service.priceInfant || 0) * (service.infant || 0)).toLocaleString()}동</span>
                                                    </div>
                                                )}
                                                {(service.extraBedCount || 0) > 0 && (
                                                    <div className="flex justify-between text-sm">
                                                        <span className="text-gray-600">엑스트라베드 {Number(service.priceExtraBed || 0).toLocaleString()}동 × {service.extraBedCount}개</span>
                                                        <span className="font-medium">{(Number(service.priceExtraBed || 0) * (service.extraBedCount || 0)).toLocaleString()}동</span>
                                                    </div>
                                                )}
                                                {(service.singleCount || 0) > 0 && (
                                                    <div className="flex justify-between text-sm">
                                                        <span className="text-gray-600">싱글차액 {Number(service.priceSingle || 0).toLocaleString()}동 × {service.singleCount}명</span>
                                                        <span className="font-medium">{(Number(service.priceSingle || 0) * (service.singleCount || 0)).toLocaleString()}동</span>
                                                    </div>
                                                )}
                                            </>
                                        )}

                                        {(pb?.surcharge_total || 0) > 0 && (
                                            <div className="flex justify-between text-sm">
                                                <span className="text-gray-600">성수기/공휴일 추가요금</span>
                                                <span className="font-medium">{Number(pb.surcharge_total || 0).toLocaleString()}동</span>
                                            </div>
                                        )}
                                        {(pb?.option_total || 0) > 0 && (
                                            <div className="flex justify-between text-sm">
                                                <span className="text-gray-600">선택 옵션 합계</span>
                                                <span className="font-medium">{Number(pb.option_total || 0).toLocaleString()}동</span>
                                            </div>
                                        )}
                                    </div>
                                    <div className="border-t border-gray-200 pt-1 mt-1 flex justify-between items-center">
                                        <span className="text-gray-500 font-medium">총 금액</span>
                                        <span className="font-bold text-blue-600 text-base">{cruiseTotal.toLocaleString()}동</span>
                                    </div>
                                    {renderServiceNote(service.note)}
                                </>
                            );
                        })()}
                    </>
                )}
                {(type === 'vehicle' || type === 'car') && (
                    <>
                        <div>구분: {service.carCategory || '-'}</div>
                        <div>차량타입: {service.carType || '-'}</div>
                        <div>경로: {service.route || '-'}</div>
                        <div>총인원수: {service.passengerCount || 0}명</div>
                        <div>픽업일시: {service.pickupDatetime?.replace('T', ' ') || '-'}</div>
                        <div>픽업위치: {service.pickupLocation || '-'}</div>
                        <div>드랍위치: {service.dropoffLocation || '-'}</div>
                        {service.vehicleNumber && <div>차량번호: {service.vehicleNumber}</div>}
                        {service.totalPrice && (
                            <div className="border-t border-gray-100 pt-1 mt-1 flex justify-between items-center">
                                <span className="text-gray-500">총 금액</span>
                                <span className="font-bold text-blue-600">{Number(service.totalPrice || 0).toLocaleString()}동</span>
                            </div>
                        )}
                        {renderServiceNote(service.note)}
                    </>
                )}
                {type === 'airport' && (
                    <>
                        {(() => {
                            const airportTypeRaw = String(service.category || service.way_type || '').toLowerCase();
                            const isPickup = airportTypeRaw.includes('pickup') || airportTypeRaw.includes('픽업');
                            const isSending = airportTypeRaw.includes('sending') || airportTypeRaw.includes('샌딩');
                            // 변경: 공항 위치는 ra_airport_location에서 가져오기
                            const airportDisplay = service.ra_airport_location || '-';
                            // 변경: 하차위치/승차위치는 accommodation_info에서 가져오기
                            const dropoffDisplay = service.accommodation_info || '-';

                            return (
                                <div className="bg-green-50 rounded-lg p-3 mb-2 border border-green-100">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                                        <div><strong>구분:</strong> {service.category || service.way_type || '-'}</div>
                                        <div><strong>경로:</strong> {service.route || '-'}</div>
                                        <div><strong>차량:</strong> {service.carType || '-'}</div>
                                        <div><strong>일시:</strong> {service.ra_datetime ? formatDatetimeOffset(service.ra_datetime) : '-'}</div>
                                        <div><strong>항공편:</strong> {service.flightNumber || service.ra_flight_number || '-'}</div>
                                        <div><strong>공항:</strong> {airportDisplay}</div>
                                        <div><strong>하차위치:</strong> {dropoffDisplay}</div>
                                        {/* 변경: 목적지 → 경유지로 변경 */}
                                        {service.stopover && <div><strong>경유지:</strong> {service.stopover}</div>}
                                        {service.passengerCount && <div><strong>인원:</strong> {service.passengerCount}명</div>}
                                    </div>
                                </div>
                            );
                        })()}
                        {(service.unitPrice || service.totalPrice) && (
                            <div className="border-t border-gray-100 pt-2 mt-1 space-y-1">
                                {service.unitPrice > 0 && (
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-600">{Number(service.unitPrice).toLocaleString()}동 × {service.carCount || 1}대</span>
                                        <span className="font-medium">{(Number(service.unitPrice) * (service.carCount || 1)).toLocaleString()}동</span>
                                    </div>
                                )}
                                <div className="flex justify-between items-center border-t border-gray-200 pt-1">
                                    <span className="text-gray-500 font-medium">총 금액</span>
                                    <span className="font-bold text-blue-600">{Number(service.totalPrice || 0).toLocaleString()}동</span>
                                </div>
                            </div>
                        )}
                        {renderServiceNote(service.note)}
                    </>
                )}
                {type === 'hotel' && (
                    <>
                        <div className="bg-orange-50 rounded-lg p-3 mb-2 border border-orange-100">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                                <div><strong>호텔명:</strong> <span className="font-semibold text-orange-800">{service.hotelName}</span></div>
                                <div><strong>객실타입:</strong> {service.roomType}</div>
                                <div><strong>체크인:</strong> {service.checkinDate}</div>
                                {service.checkinDate && service.nights ? (
                                    <>
                                        <div><strong>체크아웃:</strong> {(() => {
                                            const checkin = new Date(service.checkinDate);
                                            const checkout = new Date(checkin);
                                            checkout.setDate(checkout.getDate() + (service.nights || 0));
                                            return checkout.toISOString().split('T')[0];
                                        })()}</div>
                                        <div><strong>숙박일정:</strong> {(() => {
                                            const nights = service.nights || 0;
                                            return `${nights}박 ${nights + 1}일`;
                                        })()}</div>
                                    </>
                                ) : null}
                                <div><strong>인원:</strong> {service.guestCount}명</div>
                            </div>
                        </div>
                        {renderServiceNote(service.note)}
                    </>
                )}
                {type === 'tour' && (
                    <>
                        <div className="bg-purple-50 rounded-lg p-3 mb-2 border border-purple-100">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                                <div><strong>투어명:</strong> <span className="font-semibold text-purple-800">{service.tourName}</span></div>
                                {service.tourDate && <div><strong>투어일자:</strong> {service.tourDate}</div>}
                                {service.tourCapacity && <div><strong>인원수:</strong> {service.tourCapacity}명</div>}
                                {service.carCount && <div><strong>차량:</strong> {service.carCount}대</div>}
                                <div><strong>픽업장소:</strong> {service.pickupLocation}</div>
                                {service.dropoffLocation && <div><strong>드랍장소:</strong> {service.dropoffLocation}</div>}
                            </div>
                        </div>
                        {(service.unitPrice || service.totalPrice) && (
                            <div className="border-t border-gray-100 pt-2 mt-1 space-y-1">
                                {service.unitPrice > 0 && (service.tourCapacity || 0) > 0 && (
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-600">1인 {Number(service.unitPrice).toLocaleString()}동 × {service.tourCapacity}명</span>
                                        <span className="font-medium">{(Number(service.unitPrice) * (service.tourCapacity || 1)).toLocaleString()}동</span>
                                    </div>
                                )}
                                <div className="flex justify-between items-center border-t border-gray-200 pt-1">
                                    <span className="text-gray-500 font-medium">총 금액</span>
                                    <span className="font-bold text-blue-600">{Number(service.totalPrice || 0).toLocaleString()}동</span>
                                </div>
                            </div>
                        )}
                        {renderServiceNote(service.note)}
                    </>
                )}
                {type === 'rentcar' && (
                    <>
                        {/* 차량 기본 정보 */}
                        <div className="bg-red-50 rounded-lg p-3 mb-2 border border-red-100">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                                <div><strong>차량 타입:</strong> <span className="font-semibold">{service.carType || '-'}{service.capacity && <span className="text-xs font-normal text-gray-500 ml-1">({service.capacity}인승)</span>}</span></div>
                                {service.route && <div><strong>경로:</strong> {service.route}</div>}
                                {(service.category || service.way_type) && <div><strong>이용방식:</strong> {service.category || service.way_type}</div>}
                                {service.carCount != null && <div><strong>차량 수:</strong> {service.carCount}대</div>}
                                {service.passengerCount != null && <div><strong>탑승 인원:</strong> {service.passengerCount}명</div>}
                                {service.luggageCount != null && Number(service.luggageCount) > 0 && <div><strong>수하물:</strong> {service.luggageCount}개</div>}
                                {service.dispatchCode && <div><strong>차량번호:</strong> {service.dispatchCode}</div>}
                            </div>
                        </div>

                        {/* 픽업 정보 */}
                        {(service.pickupDatetime || service.pickup_datetime || service.pickupLocation || service.pickup_location || service.destination || service.dropoffLocation || service.dropoff_location) && (
                            <div className="mt-1 p-2 bg-blue-50 rounded-lg border border-blue-100">
                                <div className="text-xs font-bold text-blue-700 mb-1">📍 픽업</div>
                                {(service.pickupDatetime || service.pickup_datetime) && (
                                    <div className="text-xs">시간: <span className="font-medium">{formatDatetimeOffset(service.pickupDatetime || service.pickup_datetime)}</span></div>
                                )}
                                {(service.pickupLocation || service.pickup_location) && (
                                    <div className="text-xs">픽업장소: <span className="font-medium">{service.pickupLocation || service.pickup_location}</span></div>
                                )}
                                {(service.destination || service.dropoffLocation || service.dropoff_location) && (
                                    <div className="text-xs">드롭장소: <span className="font-medium">{service.destination || service.dropoffLocation || service.dropoff_location}</span></div>
                                )}
                            </div>
                        )}

                        {/* 픽업 경유 정보 */}
                        {(service.viaLocation || service.via_location || service.viaWaiting || service.via_waiting) && (
                            <div className="mt-1 p-2 bg-yellow-50 rounded-lg border border-yellow-100">
                                <div className="text-xs font-bold text-yellow-700 mb-1">🔄 픽업 경유</div>
                                {(service.viaLocation || service.via_location) && <div className="text-xs">경유지: <span className="font-medium">{service.viaLocation || service.via_location}</span></div>}
                                {(service.viaWaiting || service.via_waiting) && <div className="text-xs">대기: <span className="font-medium">{service.viaWaiting || service.via_waiting}</span></div>}
                            </div>
                        )}

                        {/* 리턴 정보 - 일시가 있을 때만 표시 */}
                        {(service.returnDatetime || service.return_datetime) && (
                            <div className="mt-1 p-2 bg-green-50 rounded-lg border border-green-100">
                                <div className="text-xs font-bold text-green-700 mb-1">🎯 리턴</div>
                                {(service.returnDatetime || service.return_datetime) && (
                                    <div className="text-xs">시간: <span className="font-medium">{formatDatetimeOffset(service.returnDatetime || service.return_datetime)}</span></div>
                                )}
                                {(service.returnPickupLocation || service.return_pickup_location) && (
                                    <div className="text-xs">픽업장소: <span className="font-medium">{service.returnPickupLocation || service.return_pickup_location}</span></div>
                                )}
                                {(service.returnDestination || service.return_destination) && (
                                    <div className="text-xs">드롭장소: <span className="font-medium">{service.returnDestination || service.return_destination}</span></div>
                                )}
                            </div>
                        )}

                        {/* 리턴 경유 정보 - 리턴 일시가 있을 때만 표시 */}
                        {(service.returnDatetime || service.return_datetime) && (service.returnViaLocation || service.return_via_location || service.returnViaWaiting || service.return_via_waiting) && (
                            <div className="mt-1 p-2 bg-amber-50 rounded-lg border border-amber-100">
                                <div className="text-xs font-bold text-amber-700 mb-1">🔄 리턴 경유</div>
                                {(service.returnViaLocation || service.return_via_location) && <div className="text-xs">경유지: <span className="font-medium">{service.returnViaLocation || service.return_via_location}</span></div>}
                                {(service.returnViaWaiting || service.return_via_waiting) && <div className="text-xs">대기: <span className="font-medium">{service.returnViaWaiting || service.return_via_waiting}</span></div>}
                            </div>
                        )}

                        {/* 금액 */}
                        {(service.unitPrice || service.totalPrice) && (
                            <div className="border-t border-gray-100 pt-2 mt-1 space-y-1">
                                {service.unitPrice > 0 && (
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-600">{Number(service.unitPrice).toLocaleString()}동 × {service.carCount || 1}대</span>
                                        <span className="font-medium">{(Number(service.unitPrice) * (service.carCount || 1)).toLocaleString()}동</span>
                                    </div>
                                )}
                                <div className="flex justify-between items-center border-t border-gray-200 pt-1">
                                    <span className="text-gray-500 font-medium">총 금액</span>
                                    <span className="font-bold text-blue-600">{Number(service.totalPrice || 0).toLocaleString()}동</span>
                                </div>
                            </div>
                        )}

                        {/* 요청사항 */}
                        {renderServiceNote(service.note)}
                    </>
                )}
                {type === 'sht' && (
                    <>
                        <div className="bg-indigo-50 rounded-lg p-3 mb-2 border border-indigo-100">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                                <div><strong>사용일:</strong> {service.usageDate ? formatDatetimeOffset(service.usageDate) : '-'}</div>
                                <div><strong>구분:</strong> {service.category || '-'}</div>
                                <div><strong>차량번호:</strong> {service.vehicleNumber}</div>
                                {service.seatNumber && <div><strong>좌석:</strong> {service.seatNumber}</div>}
                                <div><strong>픽업장소:</strong> {service.pickupLocation || '-'}</div>
                                <div><strong>드롭장소:</strong> {service.dropoffLocation || '-'}</div>
                            </div>
                        </div>
                        {service.unitPrice && <div>단가: {Number(service.unitPrice || 0).toLocaleString()}동</div>}
                        {(() => {
                            const isShtDropoff = String(service.category || '').toLowerCase().includes('drop');
                            const displayAmt = isShtDropoff ? 0 : Number(service.totalPrice || 0);
                            return (
                                <div className="border-t border-gray-100 pt-1 mt-1 flex justify-between items-center">
                                    <span className="text-gray-500">총 금액</span>
                                    <span className="font-bold text-blue-600">
                                        {displayAmt.toLocaleString()}동
                                        {isShtDropoff && <span className="text-xs text-gray-400 ml-1">(왕복요금은 픽업에 포함)</span>}
                                    </span>
                                </div>
                            );
                        })()}
                        {renderServiceNote(service.note)}
                    </>
                )}
                {type === 'package' && (
                    <>
                        <div className="font-bold text-indigo-700">{service.package_name || service.package_code}</div>
                        <div>인원: 성인 {service.re_adult_count || 0} / 아동 {service.re_child_count || 0}</div>
                        <div>등록일: {service.re_created_at ? new Date(service.re_created_at).toLocaleDateString() : '-'}</div>
                        <div className="border-t border-gray-100 pt-1 mt-1 flex justify-between items-center">
                            <span className="text-gray-500 font-medium">패키지 총액</span>
                            <span className="font-bold text-indigo-600">{Number(service.total_amount || 0).toLocaleString()}동</span>
                        </div>
                    </>
                )}
                {!isPackageService && !(type === 'sht' && String(service.category || '').toLowerCase().includes('drop')) && (manualAdditionalFee > 0 || manualAdditionalFeeDetail) && (
                    <div className="border-t border-rose-100 pt-2 mt-2 space-y-1 text-xs bg-rose-50/70 rounded p-2">
                        <div className="flex justify-between items-center">
                            <span className="text-rose-700 font-medium">추가요금</span>
                            <span className="font-bold text-rose-700">{manualAdditionalFee.toLocaleString()}동</span>
                        </div>
                        {manualAdditionalFeeDetail && (
                            <div className="text-rose-800 whitespace-pre-line">추가내역: {manualAdditionalFeeDetail}</div>
                        )}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                {/* 헤더 */}
                <div className="bg-white border-b border-gray-100 px-6 py-4 shrink-0">
                    <div className="flex justify-between items-start">
                        <div className="flex-1">
                            <h2 className="text-2xl font-bold text-gray-900">예약 통합 상세</h2>

                            {/* 예약자 정보 카드 */}
                            {userInfo && (
                                <div className="mt-3 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-3">
                                    <div className="flex items-center gap-2 mb-1">
                                        <Users className="w-4 h-4 text-blue-600" />
                                        <span className="text-xs font-semibold text-blue-700">예약자 정보</span>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-3 text-sm text-gray-700">
                                        <span className="font-semibold text-gray-900">
                                            {userInfo.name}
                                            <span className="text-gray-500 font-normal ml-1">({userInfo.english_name || '-'})</span>
                                        </span>
                                        {userInfo.nickname && (
                                            <>
                                                <span className="w-1 h-1 bg-gray-300 rounded-full"></span>
                                                <span>{userInfo.nickname}</span>
                                            </>
                                        )}
                                        <span className="w-1 h-1 bg-gray-300 rounded-full"></span>
                                        <span>{userInfo.email}</span>
                                        <span className="w-1 h-1 bg-gray-300 rounded-full"></span>
                                        <span>{userInfo.phone}</span>
                                        {allUserServices?.length > 0 && allUserServices[0]?.paymentMethod && (
                                            <>
                                                <span className="w-1 h-1 bg-gray-300 rounded-full"></span>
                                                <span className="text-blue-700 font-medium">결제: {allUserServices?.[0]?.paymentMethod}</span>
                                            </>
                                        )}
                                    </div>
                                    {childBirthDates.length > 0 && (
                                        <div className="mt-2 pt-2 border-t border-blue-100 text-sm text-gray-700">
                                            <span className="font-medium text-gray-900 mr-2">아동 생년월일</span>
                                            <div className="flex flex-wrap gap-2 mt-1">
                                                {childBirthDates.map((date, index) => (
                                                    <span
                                                        key={`${date}-${index}`}
                                                        className="inline-flex items-center rounded-full bg-white px-2.5 py-1 text-xs font-medium text-blue-700 border border-blue-200"
                                                    >
                                                        아동 {index + 1}: {date}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                        <button
                            title="닫기"
                            onClick={onClose}
                            className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400 hover:text-gray-600 ml-4"
                        >
                            <X className="w-6 h-6" />
                        </button>
                    </div>

                    {/* 정렬 버튼 */}
                    <div className="flex gap-2 mt-4">
                        <button
                            onClick={() => setSortMode('date')}
                            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${sortMode === 'date' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                        >
                            일자별
                        </button>
                        <button
                            onClick={() => setSortMode('type')}
                            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${sortMode === 'type' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                        >
                            종류별
                        </button>
                    </div>
                </div>

                {/* 본문 (스크롤 영역) + 푸터 통합 */}
                <div className="flex-1 overflow-y-auto bg-gray-50 p-6 flex flex-col">
                    {(loading || isEnriching) ? (
                        <div className="flex flex-col items-center justify-center h-64">
                            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mb-4"></div>
                            <p className="text-gray-500">{isEnriching ? '서비스 정보를 불러오는 중...' : '데이터를 불러오는 중입니다...'}</p>
                        </div>
                    ) : (enrichedServices?.length || 0) === 0 ? (
                        <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                            <Calendar className="w-12 h-12 mb-3 opacity-20" />
                            <p>예약 내역이 없습니다.</p>
                        </div>
                    ) : (
                        <div className="space-y-8 flex-1">
                            {sortedGroups.map((group) => (
                                <div key={group.originalKey} className="relative pl-4 sm:pl-0">
                                    {/* 그룹 헤더 */}
                                    <div className="sticky top-0 z-10 flex items-center mb-4 bg-gray-50 py-2">
                                        {sortMode === 'date' ? (
                                            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-600 font-bold text-xs ring-4 ring-gray-50 mr-3">
                                                {group.originalKey === '기타' ? '?' : new Date(group.originalKey).getDate()}
                                            </div>
                                        ) : (
                                            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-white text-gray-600 ring-4 ring-gray-50 mr-3 border border-gray-100">
                                                {getServiceIcon(group.originalKey)}
                                            </div>
                                        )}
                                        <h3 className="text-lg font-bold text-gray-800">
                                            {group.title}
                                        </h3>
                                        <span className="ml-2 text-xs font-medium text-gray-500 bg-white px-2 py-0.5 rounded border border-gray-200">
                                            {group.items.length}건
                                        </span>
                                    </div>

                                    {/* 해당 그룹의 서비스 목록 */}
                                    <div className="space-y-3 pl-4 border-l-2 border-gray-200 ml-4">
                                        {group.items.map((service: any, idx: number) => (
                                            <div key={`${service.reservation_id}-${service.serviceType}-${idx}`} className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow relative group">
                                                <div className="flex items-start justify-between mb-2">
                                                    <div className="flex items-center gap-2">
                                                        <div className={`p-1.5 rounded-lg ${service.serviceType === 'cruise' ? 'bg-blue-50' :
                                                            service.serviceType === 'hotel' ? 'bg-orange-50' :
                                                                'bg-gray-50'
                                                            }`}>
                                                            {getServiceIcon(service.serviceType)}
                                                        </div>
                                                        <span className="font-bold text-gray-800">
                                                            {getServiceLabel(service.serviceType)}
                                                            {service.serviceType === 'rentcar' && service.category && (
                                                                <span className="text-sm font-normal text-blue-600 ml-1">({service.category})</span>
                                                            )}
                                                            {service.serviceType === 'rentcar' && service.way_type && (
                                                                <span className="text-sm font-normal text-green-600 ml-1">({service.way_type})</span>
                                                            )}
                                                            {service.serviceType === 'airport' && service.category && (
                                                                <span className="text-sm font-normal text-blue-600 ml-1">({service.category})</span>
                                                            )}
                                                            {service.serviceType === 'airport' && service.way_type && (
                                                                <span className="text-sm font-normal text-green-600 ml-1">({service.way_type})</span>
                                                            )}
                                                            {service.serviceType === 'sht' && (
                                                                <span className="text-sm font-normal text-blue-600 ml-1">(왕복)</span>
                                                            )}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        {service.serviceType === 'sht' && (
                                                            <button
                                                                type="button"
                                                                onClick={() => openShtSeatModal(service)}
                                                                className="rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
                                                            >
                                                                좌석 수정
                                                            </button>
                                                        )}
                                                        {getStatusBadge(service.status)}
                                                    </div>
                                                </div>

                                                {renderServiceContent(service)}

                                                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <span className="text-[10px] text-gray-300">#{service.reservation_id}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* 푸터 - 스크롤 영역 내부로 이동 */}
                    <div className="mt-8 pt-6 border-t border-gray-200">
                        {/* 서비스별 금액 카드 */}
                        {(enrichedServices?.length || 0) > 0 && (
                            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4 mb-4">
                                <h4 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-1.5">
                                    <Wallet className="w-4 h-4 text-blue-600" />
                                    예상 총 금액
                                </h4>
                                {(() => {
                                    // 총 금액 집계
                                    const typeStats: Record<string, { count: number; unitPrice: number; total: number }> = {};
                                    const additionalFeeByReservation = new Map<string, number>();
                                    const reservationTotalByReservation = new Map<string, number>();
                                    (enrichedServices || []).forEach((s: any) => {
                                        const t = s.serviceType;
                                        // SHT Drop-off 행은 집계 제외 (왕복요금은 픽업에만 포함)
                                        if (t === 'sht' && String(s.category || '').toLowerCase().includes('drop')) return;
                                        let total = Number(s.room_total_price || s.totalPrice || s.total_amount || 0);

                                        // 크루즈는 카드 본문과 동일하게 보정된 price_breakdown 기준으로 집계
                                        if (t === 'cruise') {
                                            const rawPb = s.priceBreakdown || s.price_breakdown || null;
                                            const normalizedPb = normalizeCruisePriceBreakdown(rawPb, Number(s.infant || 0));
                                            const roomTotalPrice = Number(s.room_total_price || 0);
                                            total = roomTotalPrice > 0
                                                ? roomTotalPrice
                                                : Number(normalizedPb?.grand_total ?? total);
                                        }

                                        if (!typeStats[t]) typeStats[t] = { count: 0, unitPrice: 0, total: 0 };
                                        typeStats[t].count += 1;
                                        typeStats[t].total += total;

                                        const reservationId = String(s.reservation_id || s.reservationId || '').trim();
                                        if (reservationId && !additionalFeeByReservation.has(reservationId)) {
                                            additionalFeeByReservation.set(reservationId, getManualAdditionalFee(s));
                                        }
                                        const reservationTotalAmount = getReservationTotalAmount(s);
                                        if (reservationId && reservationTotalAmount !== null && !reservationTotalByReservation.has(reservationId)) {
                                            reservationTotalByReservation.set(reservationId, reservationTotalAmount);
                                        }
                                    });
                                    const grandTotal = Object.values(typeStats).reduce((a, b) => a + b.total, 0);
                                    const additionalFeeTotal = Array.from(additionalFeeByReservation.values()).reduce((sum, fee) => sum + Number(fee || 0), 0);
                                    const reservationGrandTotal = Array.from(reservationTotalByReservation.values()).reduce((sum, total) => sum + Number(total || 0), 0);
                                    const hasReservationGrandTotal = reservationTotalByReservation.size > 0;
                                    const displayGrandTotal = hasReservationGrandTotal ? reservationGrandTotal : grandTotal;

                                    return (
                                        <div className="space-y-1">
                                            <div className="flex justify-between items-center">
                                                <span className="text-sm font-bold text-gray-900">합계</span>
                                                <span className="text-lg font-bold text-blue-600">{displayGrandTotal.toLocaleString()}동</span>
                                            </div>
                                            {additionalFeeTotal > 0 && (
                                                <div className="flex justify-between items-center text-xs">
                                                    <span className="text-rose-700 font-medium">예약 추가요금 합계</span>
                                                    <span className="font-bold text-rose-700">{additionalFeeTotal.toLocaleString()}동</span>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })()}
                            </div>
                        )}
                        <div className="flex justify-between items-center">
                            <div className="text-sm text-gray-500">
                                총 <span className="font-bold text-gray-900">{allUserServices?.length || 0}</span>건의 예약
                            </div>
                            <button
                                onClick={onClose}
                                className="px-6 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors font-medium"
                            >
                                닫기
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {isShtSeatModalOpen && selectedShtService && (
                <ShtCarSeatMap
                    isOpen={isShtSeatModalOpen}
                    onClose={() => {
                        setIsShtSeatModalOpen(false);
                        setSelectedShtService(null);
                    }}
                    usageDate={selectedShtService.usageDate || undefined}
                    vehicleNumber={selectedShtService.vehicleNumber || undefined}
                    initialCategory={String(selectedShtService.category || '').toLowerCase().includes('drop') ? 'dropoff' : 'pickup'}
                    saveToDb
                    reservationId={selectedShtService.reservation_id || undefined}
                    pickupLocation={selectedShtService.pickupLocation || undefined}
                    dropoffLocation={selectedShtService.dropoffLocation || undefined}
                    onSeatSelect={handleShtSeatSelected}
                />
            )}
        </div>
    );
}
