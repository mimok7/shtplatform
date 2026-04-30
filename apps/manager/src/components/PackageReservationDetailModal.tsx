'use client';

import React, { useMemo } from 'react';
import {
    X,
    Users,
    Package,
    Calendar,
    CheckCircle,
    AlertCircle,
    XCircle,
    Ship,
    Plane,
    Building,
    MapPin,
    Car,
    Clock,
} from 'lucide-react';

interface PackageReservationDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    userInfo: any;
    allUserServices: any[];
    loading: boolean;
}

function formatKst(value?: string | null): string {
    if (!value) return '-';
    const raw = String(value).trim();
    if (!raw) return '-';

    const hasTimezone = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(raw);
    if (!hasTimezone) {
        return raw.replace('T', ' ').slice(0, 16);
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
    });
}

function isUuidLike(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isCodeLike(value: any): boolean {
    const raw = String(value || '').trim();
    if (!raw) return false;
    if (isUuidLike(raw)) return true;
    if (/^[A-Z]{1,6}[-_][A-Z0-9_-]{2,}$/i.test(raw)) return true;
    if (/^[A-Z]_[0-9]{2}_[0-9]{2}_[0-9]{5,}$/i.test(raw)) return true;
    return false;
}

function humanizeText(value: any, fallback = '-'): string {
    const raw = String(value || '').trim();
    if (!raw) return fallback;
    if (/^updating$/i.test(raw)) return '미정';
    return raw;
}

function humanizeWayType(value: any): string {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return '-';
    if (raw.includes('pickup') || raw.includes('entry') || raw.includes('픽업')) return '픽업';
    if (raw.includes('sending') || raw.includes('sanding') || raw.includes('exit') || raw.includes('샌딩')) return '샌딩';
    if (raw.includes('dropoff') || raw.includes('drop') || raw.includes('드롭')) return '드롭';
    return humanizeText(value);
}

function humanizeServiceName(value: any, fallbackLabel: string): string {
    const raw = String(value || '').trim();
    if (!raw) return fallbackLabel;
    if (isCodeLike(raw)) return fallbackLabel;
    return humanizeText(raw, fallbackLabel);
}

function formatAmount(value: any): string {
    const amount = Number(value || 0);
    if (!amount) return '금액 확인 중';
    return `${amount.toLocaleString()}동`;
}

function formatNote(value: any): string {
    const raw = String(value || '').trim();
    if (!raw) return '';

    return raw
        .replace(/\[\s*/g, '')
        .replace(/\s*\]/g, '')
        .replace(/UPDATING/gi, '미정')
        .trim();
}

function extractCruiseInfoFromNote(note: any): { cruiseName?: string; roomType?: string } {
    const text = formatNote(note);
    if (!text) return {};

    const line = text
        .split('\n')
        .map((v) => v.trim())
        .find((v) => v.startsWith('객실:'));

    if (!line) return {};

    const value = line.replace(/^객실:\s*/, '').trim();
    if (!value) return {};

    const tokens = value.split(/\s+/).filter(Boolean);
    if (tokens.length < 2) return { roomType: value };

    const roomKeywordIndex = tokens.findIndex((t) => /(스위트|캐빈|룸|디럭스|베란다|씨뷰|오션|패밀리)/.test(t));

    if (roomKeywordIndex > 0) {
        const cruiseName = tokens.slice(0, roomKeywordIndex).join(' ').trim();
        const roomType = tokens.slice(roomKeywordIndex).join(' ').trim();
        return { cruiseName, roomType };
    }

    if (tokens.length >= 3) {
        return {
            cruiseName: tokens.slice(0, 2).join(' ').trim(),
            roomType: tokens.slice(2).join(' ').trim(),
        };
    }

    return { roomType: value };
}

function getServiceDateValue(service: any): string {
    return String(
        service.checkin ||
        service.checkinDate ||
        service.tourDate ||
        service.usageDate ||
        service.ra_datetime ||
        service.pickupDatetime ||
        service.re_created_at ||
        ''
    ).trim();
}

function getTimeValue(value: string): number {
    if (!value) return Number.MAX_SAFE_INTEGER;
    const hasTimezone = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(value);
    const normalized = hasTimezone ? value : value.replace(' ', 'T');
    const d = new Date(normalized);
    const t = d.getTime();
    return Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : t;
}

function getAirportOrderWeight(service: any): number {
    const type = humanizeWayType(service.category || service.way_type);
    if (type === '픽업') return 0;
    if (type === '샌딩') return 1;
    return 9;
}

function getAirportDisplayLocations(service: any): { pickup: string; sending: string } {
    const wayType = humanizeWayType(service.category || service.way_type);
    const airport = humanizeText(service.airportName || service.ra_airport_location || service.airport_location, '미정');
    const stay = humanizeText(service.accommodation_info || service.ra_accommodation_info, '');
    const pickupRaw = humanizeText(service.pickupLocation || service.pickup_location || stay, '');
    const dropRaw = humanizeText(service.dropoffLocation || service.destination || service.dropoff_location || stay, '');

    if (wayType === '픽업') {
        return {
            pickup: pickupRaw !== '-' && pickupRaw ? pickupRaw : airport,
            sending: dropRaw !== '-' && dropRaw ? dropRaw : '미정',
        };
    }

    if (wayType === '샌딩') {
        return {
            pickup: pickupRaw !== '-' && pickupRaw ? pickupRaw : '미정',
            sending: dropRaw !== '-' && dropRaw ? dropRaw : airport,
        };
    }

    return {
        pickup: pickupRaw !== '-' && pickupRaw ? pickupRaw : '미정',
        sending: dropRaw !== '-' && dropRaw ? dropRaw : '미정',
    };
}

function getStatusBadge(status?: string) {
    const s = String(status || '').toLowerCase();
    if (s === 'confirmed') return <span className="flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full"><CheckCircle className="w-3 h-3" />확정</span>;
    if (s === 'approved') return <span className="flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full"><CheckCircle className="w-3 h-3" />승인</span>;
    if (s === 'completed') return <span className="flex items-center gap-1 text-xs font-medium text-gray-700 bg-gray-100 px-2 py-0.5 rounded-full"><CheckCircle className="w-3 h-3" />완료</span>;
    if (s === 'pending') return <span className="flex items-center gap-1 text-xs font-medium text-yellow-700 bg-yellow-100 px-2 py-0.5 rounded-full"><AlertCircle className="w-3 h-3" />대기</span>;
    if (s === 'cancelled') return <span className="flex items-center gap-1 text-xs font-medium text-red-700 bg-red-100 px-2 py-0.5 rounded-full"><XCircle className="w-3 h-3" />취소</span>;
    return <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{status || '-'}</span>;
}

function getServiceIcon(type: string) {
    switch (type) {
        case 'cruise':
            return <Ship className="w-4 h-4 text-blue-600" />;
        case 'airport':
            return <Plane className="w-4 h-4 text-green-600" />;
        case 'hotel':
            return <Building className="w-4 h-4 text-orange-600" />;
        case 'tour':
            return <MapPin className="w-4 h-4 text-purple-600" />;
        case 'rentcar':
        case 'vehicle':
        case 'car':
        case 'sht':
            return <Car className="w-4 h-4 text-indigo-600" />;
        default:
            return <Clock className="w-4 h-4 text-gray-500" />;
    }
}

function getServiceLabel(type: string) {
    const map: Record<string, string> = {
        package: '패키지',
        cruise: '크루즈',
        airport: '공항',
        hotel: '호텔',
        tour: '투어',
        rentcar: '렌터카',
        vehicle: '크루즈 차량',
        car: '크루즈 차량',
        sht: '스하차량',
    };
    return map[type] || type;
}

export default function PackageReservationDetailModal({
    isOpen,
    onClose,
    userInfo,
    allUserServices,
    loading,
}: PackageReservationDetailModalProps) {
    const filteredServices = useMemo(() => {
        const list = Array.isArray(allUserServices) ? allUserServices : [];
        const hasPackageScoped = list.some((s) => s?.serviceType === 'package' || s?.isPackageService);
        return hasPackageScoped ? list.filter((s) => s?.serviceType === 'package' || s?.isPackageService) : list;
    }, [allUserServices]);

    const packageRoots = useMemo(
        () => filteredServices.filter((s) => s?.serviceType === 'package'),
        [filteredServices]
    );

    const packageServices = useMemo(() => {
        const nonPackage = filteredServices.filter((s) => s?.serviceType !== 'package');

        // 동일 투어 중복 제거
        const tourSeen = new Set<string>();
        const deduped = nonPackage.filter((s) => {
            if (s?.serviceType !== 'tour') return true;
            const rawName = String(s?.tourName || '').trim();
            const key = [
                String(s?.tourDate || ''),
                rawName,
                String(s?.pickupLocation || s?.pickup_location || ''),
                String(s?.dropoffLocation || s?.destination || s?.dropoff_location || ''),
                String(s?.reservation_id || s?.re_id || ''),
            ].join('|');
            if (tourSeen.has(key)) return false;
            tourSeen.add(key);
            return true;
        });

        // 날짜순 정렬 + 같은 날짜 공항은 픽업 먼저, 샌딩 나중
        return [...deduped].sort((a, b) => {
            const ta = getTimeValue(getServiceDateValue(a));
            const tb = getTimeValue(getServiceDateValue(b));
            if (ta !== tb) return ta - tb;

            if (a?.serviceType === 'airport' && b?.serviceType === 'airport') {
                return getAirportOrderWeight(a) - getAirportOrderWeight(b);
            }

            return 0;
        });
    }, [filteredServices]);

    const totalAmount = useMemo(
        () => packageRoots.reduce((sum, p) => sum + Number(p?.total_amount || p?.totalPrice || 0), 0),
        [packageRoots]
    );

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                <div className="bg-white border-b border-gray-100 px-6 py-4 shrink-0 flex justify-between items-start">
                    <div className="flex-1">
                        <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                            <Package className="w-6 h-6 text-indigo-600" />
                            패키지 예약 통합 상세
                        </h2>
                        {userInfo && (
                            <div className="mt-3 bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-200 rounded-lg p-3">
                                <div className="flex flex-wrap items-center gap-3 text-sm text-gray-700">
                                    <span className="font-semibold text-gray-900 flex items-center gap-1">
                                        <Users className="w-4 h-4 text-indigo-600" />
                                        {userInfo.name || '-'}
                                    </span>
                                    <span>{userInfo.email || '-'}</span>
                                    <span>{userInfo.phone || userInfo.phone_number || '-'}</span>
                                    <span>행복여행: {userInfo.quote_title || '-'}</span>
                                </div>
                            </div>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-500 hover:text-gray-700 p-2 hover:bg-gray-100 rounded-lg"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {loading ? (
                        <div className="text-center py-10 text-gray-500">패키지 예약 상세를 불러오는 중...</div>
                    ) : (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3">
                                    <div className="text-xs text-indigo-700">패키지 예약 건수</div>
                                    <div className="text-xl font-bold text-indigo-900">{packageRoots.length}건</div>
                                </div>
                                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                                    <div className="text-xs text-blue-700">포함 서비스 건수</div>
                                    <div className="text-xl font-bold text-blue-900">{packageServices.length}건</div>
                                </div>
                                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                                    <div className="text-xs text-emerald-700">패키지 총액 합계</div>
                                    <div className="text-xl font-bold text-emerald-900">{Number(totalAmount || 0).toLocaleString()}동</div>
                                </div>
                            </div>

                            {packageRoots.length > 0 && (
                                <div className="space-y-3">
                                    <h3 className="text-sm font-semibold text-gray-800">패키지 예약 목록</h3>
                                    {packageRoots.map((pkg, idx) => (
                                        <div key={`${pkg.re_id || pkg.reservation_id || idx}`} className="border border-indigo-100 rounded-lg p-3 bg-indigo-50/40">
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <div className="font-semibold text-indigo-800">
                                                    {pkg.package_name || pkg.package_code || '패키지'}
                                                </div>
                                                {getStatusBadge(pkg.re_status || pkg.service?.re_status)}
                                            </div>
                                            <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-gray-700">
                                                <div>예약일: {formatKst(pkg.re_created_at || pkg.service?.re_created_at)}</div>
                                                <div>인원: 성인 {pkg.re_adult_count || 0}, 아동 {pkg.re_child_count || 0}, 유아 {pkg.re_infant_count || 0}</div>
                                                <div className="font-semibold text-emerald-700">총액: {formatAmount(pkg.total_amount)}</div>
                                            </div>
                                            {(pkg.child_extra_bed != null || pkg.child_no_extra_bed != null || pkg.infant_free != null || pkg.infant_tour != null || pkg.infant_extra_bed != null || pkg.infant_seat != null) && (
                                                <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-gray-700 bg-white border border-indigo-100 rounded p-2">
                                                    <div>아동: 엑스트라베드 {pkg.child_extra_bed || 0}, 베드없음 {pkg.child_no_extra_bed || 0}</div>
                                                    <div>유아: 무료 {pkg.infant_free || 0}, 투어 {pkg.infant_tour || 0}, 엑스트라베드 {pkg.infant_extra_bed || 0}, 좌석 {pkg.infant_seat || 0}</div>
                                                    <div>공항 차량: {humanizeText(pkg.airport_vehicle, '미정')}</div>
                                                    <div>닌빈 차량: {humanizeText(pkg.ninh_binh_vehicle, '미정')}</div>
                                                    <div>하노이 차량: {humanizeText(pkg.hanoi_vehicle, '미정')}</div>
                                                    <div>크루즈 차량: {humanizeText(pkg.cruise_vehicle, '미정')}</div>
                                                    <div>스하 픽업: {humanizeText(pkg.sht_pickup_vehicle, '미정')} / {humanizeText(pkg.sht_pickup_seat, '좌석 미정')}</div>
                                                    <div>스하 드롭: {humanizeText(pkg.sht_dropoff_vehicle, '미정')} / {humanizeText(pkg.sht_dropoff_seat, '좌석 미정')}</div>
                                                </div>
                                            )}
                                            {pkg.package_description && (
                                                <div className="mt-2 text-xs text-gray-600 bg-white border border-gray-200 rounded p-2 whitespace-pre-line">
                                                    {humanizeText(pkg.package_description)}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="space-y-3">
                                <h3 className="text-sm font-semibold text-gray-800">패키지 포함 서비스 전체 내역</h3>
                                {packageServices.length === 0 && (
                                    <div className="text-sm text-gray-500 border border-dashed border-gray-300 rounded-lg p-4">
                                        표시할 패키지 포함 서비스가 없습니다.
                                    </div>
                                )}
                                {packageServices.map((service, idx) => {
                                    const type = service.serviceType || 'service';
                                    const cruiseFromNote = type === 'cruise' ? extractCruiseInfoFromNote(service.note) : {};
                                    const cruiseNameValue = cruiseFromNote.cruiseName || service.cruiseName || service.cruise;
                                    const roomTypeValue = cruiseFromNote.roomType || service.roomType;
                                    const airportLocations = type === 'airport' ? getAirportDisplayLocations(service) : null;
                                    const tourNameValue = type === 'tour'
                                        ? (isCodeLike(service.tourName) ? humanizeText((formatNote(service.note).match(/투어\s*[:：]\s*([^\n]+)/)?.[1] || ''), '투어 프로그램') : humanizeServiceName(service.tourName, '투어 프로그램'))
                                        : '';
                                    return (
                                        <div key={`${service.reservation_id || service.re_id || type}-${idx}`} className="border border-gray-200 rounded-lg p-3 bg-white">
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                                                    {getServiceIcon(type)}
                                                    <span>{getServiceLabel(type)}</span>
                                                </div>
                                                {getStatusBadge(service.re_status || service.service?.re_status)}
                                            </div>

                                            <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-gray-700">
                                                {(service.checkin || service.checkinDate || service.tourDate || service.usageDate || service.ra_datetime || service.pickupDatetime) && (
                                                    <div>
                                                        <Calendar className="inline w-4 h-4 mr-1 text-gray-500" />
                                                        일정: {formatKst(service.checkin || service.checkinDate || service.tourDate || service.usageDate || service.ra_datetime || service.pickupDatetime)}
                                                    </div>
                                                )}
                                                {cruiseNameValue && <div>크루즈: {humanizeServiceName(cruiseNameValue, '크루즈 프로그램')}</div>}
                                                {roomTypeValue && <div>객실타입: {humanizeServiceName(roomTypeValue, '객실 타입 확정 예정')}</div>}
                                                {type === 'tour' && <div>투어명: {tourNameValue}</div>}
                                                {service.hotelName && <div>호텔명: {humanizeServiceName(service.hotelName, '호텔')}</div>}
                                                {(service.category || service.way_type) && <div>구분: {humanizeWayType(service.category || service.way_type)}</div>}
                                                {service.route && <div>경로: {humanizeText(service.route)}</div>}
                                                {service.carType && <div>차량타입: {humanizeServiceName(service.carType, '차량 배정 예정')}</div>}
                                                {type === 'airport' ? (
                                                    <>
                                                        <div>픽업 장소: {airportLocations?.pickup || '미정'}</div>
                                                        <div>샌딩 장소: {airportLocations?.sending || '미정'}</div>
                                                    </>
                                                ) : (
                                                    <>
                                                        {(service.pickupLocation || service.pickup_location) && <div>픽업: {humanizeText(service.pickupLocation || service.pickup_location, '미정')}</div>}
                                                        {(service.dropoffLocation || service.destination || service.dropoff_location) && <div>드롭: {humanizeText(service.dropoffLocation || service.destination || service.dropoff_location, '미정')}</div>}
                                                    </>
                                                )}
                                                {service.flightNumber && <div>항공편: {humanizeText(service.flightNumber)}</div>}
                                                {service.passengerCount != null && <div>탑승 인원: {service.passengerCount}명</div>}
                                                {service.carCount != null && <div>차량수: {service.carCount}대</div>}
                                                {service.luggageCount != null && <div>수하물: {service.luggageCount}개</div>}
                                                {service.guestCount != null && <div>투숙 인원: {service.guestCount}명</div>}
                                                {service.tourCapacity != null && <div>투어 인원: {service.tourCapacity}명</div>}
                                                {service.vehicleNumber && <div>차량번호: {humanizeText(service.vehicleNumber)}</div>}
                                                {service.seatNumber && <div>좌석: {humanizeText(service.seatNumber)}</div>}
                                                {service.driverName && <div>기사: {humanizeText(service.driverName)}</div>}
                                                {service.dispatchCode && <div>배차코드: {humanizeText(service.dispatchCode)}</div>}
                                                {(service.adult != null || service.child != null || service.infant != null) && (
                                                    <div>인원 구성: 성인 {service.adult || 0}, 아동 {service.child || 0}, 유아 {service.infant || 0}</div>
                                                )}
                                            </div>

                                            <div className="mt-2 pt-2 border-t border-gray-100 flex justify-between items-center text-sm">
                                                <span className="text-gray-500">금액</span>
                                                <div className="text-right">
                                                    {service.unitPrice != null && Number(service.unitPrice || 0) > 0 && (
                                                        <div className="text-xs text-gray-500">단가 {formatAmount(service.unitPrice)}</div>
                                                    )}
                                                    <span className="font-bold text-blue-700">{formatAmount(service.totalPrice || service.total_amount)}</span>
                                                </div>
                                            </div>

                                            {formatNote(service.note) && (
                                                <div className="mt-2 text-xs text-gray-600 bg-gray-50 p-2 rounded whitespace-pre-line">
                                                    비고: {formatNote(service.note)}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
