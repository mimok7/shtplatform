'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { X, Ship, Plane, Building, MapPin, Car, Users, Wallet, Edit } from 'lucide-react';

interface GoogleSheetsDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    selectedReservation: any;
    allOrderServices: any[];
    loading: boolean;
    orderUserInfo: any;
    relatedEmail?: string;
    relatedDbServices: any[];
    relatedDbLoading: boolean;
}

export default function GoogleSheetsDetailModal({
    isOpen,
    onClose,
    selectedReservation,
    allOrderServices,
    loading,
    orderUserInfo,
    relatedEmail,
    relatedDbServices,
    relatedDbLoading,
}: GoogleSheetsDetailModalProps) {
    const router = useRouter();

    if (!isOpen) return null;

    // request_note에서 [객실 n], [구성 n] 등의 자동생성 패턴 제거
    const getFilteredNoteText = (note: any): string => {
        if (!note) return '';
        const hiddenLinePattern = /^(?:비고\s*:\s*)?(?:\[(?:객실|구성)\s*\d+\]|(?:객실|구성)\s*\d+\b)/;
        const lines = String(note)
            .split('\n')
            .map((line) => line.replace(/\u00A0/g, ' ').trim())
            .filter(Boolean)
            .filter((line) => !hiddenLinePattern.test(line));
        return lines.join('\n').trim();
    };

    const formatDateTimePlus8 = (value: any) => {
        if (!value) return '-';
        const date = new Date(value);
        if (isNaN(date.getTime())) return String(value);

        const adjusted = new Date(date.getTime() + 8 * 60 * 60 * 1000);
        return adjusted.toLocaleString('ko-KR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
        });
    };

    const normalizeWayType = (value: string) => {
        const way = (value || '').toLowerCase();
        if (way === 'pickup' || way === '픽업') return '픽업';
        if (way === 'sending' || way === 'dropoff' || way === '샌딩') return '샌딩';
        return value || '-';
    };

    const getServiceIcon = (serviceType: string) => {
        switch (serviceType) {
            case 'cruise':
                return <Ship className="w-5 h-5 text-blue-600" />;
            case 'vehicle':
                return <Car className="w-5 h-5 text-purple-600" />;
            case 'sapa':
                return <Users className="w-5 h-5 text-teal-600" />;
            case 'airport':
                return <Plane className="w-5 h-5 text-green-600" />;
            case 'hotel':
                return <Building className="w-5 h-5 text-orange-600" />;
            case 'tour':
                return <MapPin className="w-5 h-5 text-pink-600" />;
            case 'rentcar':
                return <Car className="w-5 h-5 text-indigo-600" />;
            case 'car':
                return <Car className="w-5 h-5 text-blue-600" />;
            case 'price':
                return <Wallet className="w-5 h-5 text-yellow-600" />;
            default:
                return <Users className="w-5 h-5 text-gray-600" />;
        }
    };

    const getServiceLabel = (serviceType: string) => {
        switch (serviceType) {
            case 'cruise':
                return '크루즈';
            case 'vehicle':
                return '차량 SHT';
            case 'sht':
                return '차량 SHT';
            case 'cruise_car':
                return '크루즈 차량';
            case 'sapa':
                return '사파';
            case 'airport':
                return '공항서비스';
            case 'hotel':
                return '호텔';
            case 'tour':
                return '투어';
            case 'rentcar':
                return '렌터카';
            case 'car':
                return '크루즈 차량';
            case 'price':
                return '가격정보';
            default:
                return '서비스';
        }
    };

    const getServiceColor = (serviceType: string) => {
        switch (serviceType) {
            case 'cruise':
                return 'bg-blue-50 border-blue-200';
            case 'vehicle':
                return 'bg-purple-50 border-purple-200';
            case 'sapa':
                return 'bg-teal-50 border-teal-200';
            case 'airport':
                return 'bg-green-50 border-green-200';
            case 'hotel':
                return 'bg-orange-50 border-orange-200';
            case 'tour':
                return 'bg-pink-50 border-pink-200';
            case 'rentcar':
                return 'bg-indigo-50 border-indigo-200';
            case 'car':
                return 'bg-blue-50 border-blue-200';
            case 'price':
                return 'bg-yellow-50 border-yellow-200';
            default:
                return 'bg-gray-50 border-gray-200';
        }
    };

    const renderServiceDetails = (service: any) => {
        const serviceType = service.serviceType;

        if (serviceType === 'cruise') {
            return (
                <div className="space-y-1 text-sm">
                    <div><span className="font-semibold text-gray-600">크루즈:</span> {service.cruise}</div>
                    <div><span className="font-semibold text-gray-600">구분:</span> {service.category}</div>
                    <div><span className="font-semibold text-gray-600">객실:</span> {service.roomType}</div>
                    <div><span className="font-semibold text-gray-600">체크인:</span> {service.checkin} {service.time}</div>
                    <div><span className="font-semibold text-gray-600">인원:</span> 성인 {service.adult}명, 아동 {service.child}명, 유아 {service.toddler}명</div>
                    {service.memo && <div><span className="font-semibold text-gray-600">메모:</span> {service.memo}</div>}
                </div>
            );
        }

        if (serviceType === 'vehicle') {
            return (
                <div className="space-y-1 text-sm">
                    <div><span className="font-semibold text-gray-600">구분:</span> {service.division}</div>
                    <div><span className="font-semibold text-gray-600">분류:</span> {service.category}</div>
                    <div><span className="font-semibold text-gray-600">승차일:</span> {service.boardingDate}</div>
                    <div><span className="font-semibold text-gray-600">차량번호:</span> {service.vehicleNumber}</div>
                    {service.seatNumber && <div><span className="font-semibold text-gray-600">좌석:</span> {service.seatNumber}</div>}
                    {service.memo && <div><span className="font-semibold text-gray-600">메모:</span> {service.memo}</div>}
                </div>
            );
        }

        if (serviceType === 'airport') {
            const tripTypeRaw = String(service.tripType || service.division || '').toLowerCase();
            const isPickup = tripTypeRaw.includes('pickup') || tripTypeRaw.includes('픽업');
            const airportLocation = service.airportName || service.ra_airport_location || '-';
            const cityLocation = service.placeName || service.accommodation_info || service.location_name || '-';
            const pickupLocation = isPickup ? airportLocation : cityLocation;
            const sendingLocation = isPickup ? cityLocation : airportLocation;

            return (
                <div className="space-y-1 text-sm">
                    <div><span className="font-semibold text-gray-600">구분:</span> {service.tripType} - {service.category}</div>
                    <div><span className="font-semibold text-gray-600">경로:</span> {service.route}</div>
                    <div><span className="font-semibold text-gray-600">차량타입:</span> {service.vehicle_type || service.vehicleType || service.carType || '-'}</div>
                    <div><span className="font-semibold text-gray-600">일시:</span> {service.date} {service.time}</div>
                    <div><span className="font-semibold text-gray-600">공항:</span> {service.airportName}</div>
                    <div><span className="font-semibold text-gray-600">픽업위치:</span> {pickupLocation}</div>
                    <div><span className="font-semibold text-gray-600">샌딩위치:</span> {sendingLocation}</div>
                    {service.flightNumber && <div><span className="font-semibold text-gray-600">항공편:</span> {service.flightNumber}</div>}
                    <div><span className="font-semibold text-gray-600">인원:</span> {service.passengerCount}명</div>
                    {service.memo && <div><span className="font-semibold text-gray-600">메모:</span> {service.memo}</div>}
                </div>
            );
        }

        if (serviceType === 'hotel') {
            return (
                <div className="space-y-1 text-sm">
                    <div><span className="font-semibold text-gray-600">호텔:</span> {service.hotelName}</div>
                    <div><span className="font-semibold text-gray-600">객실:</span> {service.roomName} ({service.roomType})</div>
                    <div><span className="font-semibold text-gray-600">체크인:</span> {service.checkinDate}</div>
                    <div><span className="font-semibold text-gray-600">체크아웃:</span> {service.checkoutDate}</div>
                    <div><span className="font-semibold text-gray-600">숙박:</span> {service.days}박</div>
                    <div><span className="font-semibold text-gray-600">인원:</span> 성인 {service.adult}명, 아동 {service.child}명</div>
                    {service.memo && <div><span className="font-semibold text-gray-600">메모:</span> {service.memo}</div>}
                </div>
            );
        }

        if (serviceType === 'tour') {
            return (
                <div className="space-y-1 text-sm">
                    <div><span className="font-semibold text-gray-600">투어:</span> {service.tourName}</div>
                    <div><span className="font-semibold text-gray-600">종류:</span> {service.tourType}</div>
                    <div><span className="font-semibold text-gray-600">시작일:</span> {service.startDate}</div>
                    {service.endDate && <div><span className="font-semibold text-gray-600">종료일:</span> {service.endDate}</div>}
                    <div><span className="font-semibold text-gray-600">인원:</span> {service.participants}명</div>
                    {service.pickupLocation && <div><span className="font-semibold text-gray-600">픽업:</span> {service.pickupLocation}</div>}
                    {service.dropoffLocation && <div><span className="font-semibold text-gray-600">드롭:</span> {service.dropoffLocation}</div>}
                    {service.memo && <div><span className="font-semibold text-gray-600">메모:</span> {service.memo}</div>}
                </div>
            );
        }

        if (serviceType === 'rentcar') {
            return (
                <div className="space-y-1 text-sm">
                    <div><span className="font-semibold text-gray-600">차량:</span> {service.carType}</div>
                    <div><span className="font-semibold text-gray-600">경로:</span> {service.route} ({service.tripType})</div>
                    <div><span className="font-semibold text-gray-600">인수:</span> {service.pickupDate} {service.pickupTime}</div>
                    <div><span className="font-semibold text-gray-600">인수장소:</span> {service.pickupLocation}</div>
                    <div><span className="font-semibold text-gray-600">목적지:</span> {service.destination}</div>
                    <div><span className="font-semibold text-gray-600">사용기간:</span> {service.usagePeriod}</div>
                    {service.memo && <div><span className="font-semibold text-gray-600">메모:</span> {service.memo}</div>}
                </div>
            );
        }

        if (serviceType === 'car') {
            return (
                <div className="space-y-1 text-sm">
                    <div><span className="font-semibold text-gray-600">차량:</span> {service.carType}</div>
                    <div><span className="font-semibold text-gray-600">일시:</span> {service.pickupDatetime}</div>
                    <div><span className="font-semibold text-gray-600">승차:</span> {service.pickupLocation}</div>
                    <div><span className="font-semibold text-gray-600">하차:</span> {service.dropoffLocation}</div>
                    <div><span className="font-semibold text-gray-600">인원:</span> {service.passengerCount}명</div>
                    <div><span className="font-semibold text-gray-600">차량수:</span> {service.carCount}대</div>
                    {service.memo && <div><span className="font-semibold text-gray-600">메모:</span> {service.memo}</div>}
                </div>
            );
        }

        if (serviceType === 'sapa') {
            return (
                <div className="space-y-1 text-sm">
                    <div><span className="font-semibold text-gray-600">구분:</span> {service.category}</div>
                    <div><span className="font-semibold text-gray-600">버스:</span> {service.busSelection}</div>
                    <div><span className="font-semibold text-gray-600">사파종류:</span> {service.sapaType}</div>
                    <div><span className="font-semibold text-gray-600">승차일:</span> {service.boardingDate} {service.boardingTime}</div>
                    <div><span className="font-semibold text-gray-600">집결시간:</span> {service.gatheringTime}</div>
                    <div><span className="font-semibold text-gray-600">인원:</span> {service.participantCount}명 / 좌석: {service.seatCount}석</div>
                    {service.memo && <div><span className="font-semibold text-gray-600">메모:</span> {service.memo}</div>}
                </div>
            );
        }

        if (serviceType === 'price') {
            return (
                <div className="space-y-1 text-sm">
                    <div className="border-b pb-2 mb-2">
                        <div><span className="font-semibold text-gray-600">견적일시:</span> {service.quoteDate}</div>
                        <div className="text-lg font-bold text-yellow-700 mt-1">총액: {service.grandTotal?.toLocaleString()}동</div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <div><span className="font-semibold text-gray-600">예약금:</span> {service.deposit?.toLocaleString()}동</div>
                        <div><span className="font-semibold text-gray-600">중도금:</span> {service.midPayment?.toLocaleString()}동</div>
                        <div><span className="font-semibold text-gray-600">잔금:</span> {service.finalPayment?.toLocaleString()}동</div>
                        <div><span className="font-semibold text-gray-600">수기합계:</span> {service.manualTotal?.toLocaleString()}동</div>
                    </div>
                    <div className="border-t pt-2 mt-2 text-xs text-gray-500">
                        <div>객실: {service.roomTotal?.toLocaleString()} / 차량: {service.carTotal?.toLocaleString()} / 픽업: {service.pickupTotal?.toLocaleString()}</div>
                        <div>호텔: {service.hotelTotal?.toLocaleString()} / 렌트: {service.rentTotal?.toLocaleString()} / 투어: {service.tourTotal?.toLocaleString()} / 사파: {service.sapaTotal?.toLocaleString()}</div>
                    </div>
                    {service.memo && <div className="mt-2"><span className="font-semibold text-gray-600">메모:</span> {service.memo}</div>}
                </div>
            );
        }

        return <div className="text-sm text-gray-600">상세 정보 없음</div>;
    };

    const renderRelatedDbServiceDetails = (service: any) => {
        const serviceType = service.serviceType;

        if (serviceType === 'cruise') {
            return (
                <div className="space-y-1 text-sm">
                    <div><span className="font-semibold text-gray-600">체크인:</span> {service.checkin || '-'}</div>
                    <div><span className="font-semibold text-gray-600">객실코드:</span> {service.room_price_code || '-'}</div>
                    <div><span className="font-semibold text-gray-600">인원:</span> {service.guest_count || 0}명</div>
                    {service.request_note && getFilteredNoteText(service.request_note) && <div><span className="font-semibold text-gray-600">요청사항:</span> {getFilteredNoteText(service.request_note)}</div>}
                </div>
            );
        }

        if (serviceType === 'cruise_car') {
            return (
                <div className="space-y-1 text-sm">
                    <div><span className="font-semibold text-gray-600">차종:</span> {service.vehicle_type || '-'}</div>
                    <div><span className="font-semibold text-gray-600">탑승일:</span> {service.pickup_datetime || service.usage_date || service.checkin || '-'}</div>
                    <div><span className="font-semibold text-gray-600">승차위치:</span> {service.pickup_location || '-'}</div>
                    <div><span className="font-semibold text-gray-600">하차위치:</span> {service.dropoff_location || '-'}</div>
                    {service.request_note && getFilteredNoteText(service.request_note) && <div><span className="font-semibold text-gray-600">요청사항:</span> {getFilteredNoteText(service.request_note)}</div>}
                </div>
            );
        }

        if (serviceType === 'sht') {
            return (
                <div className="space-y-1 text-sm">
                    <div><span className="font-semibold text-gray-600">구분:</span> {service.sht_category || '-'}</div>
                    <div><span className="font-semibold text-gray-600">일시:</span> {formatDateTimePlus8(service.usage_date)}</div>
                    <div><span className="font-semibold text-gray-600">승차:</span> {service.pickup_location || '-'}</div>
                    <div><span className="font-semibold text-gray-600">하차:</span> {service.dropoff_location || '-'}</div>
                    <div><span className="font-semibold text-gray-600">차량:</span> {service.vehicle_number || '-'} / 좌석 {service.seat_number || '-'}</div>
                </div>
            );
        }

        if (serviceType === 'airport') {
            return (
                <div className="space-y-1 text-sm">
                    <div><span className="font-semibold text-gray-600">구분:</span> {normalizeWayType(service.ra_way_type || service.way_type || service.service_type || '')}</div>
                    <div><span className="font-semibold text-gray-600">일시:</span> {formatDateTimePlus8(service.ra_datetime)}</div>
                    <div><span className="font-semibold text-gray-600">위치:</span> {service.ra_airport_location || service.accommodation_info || '-'}</div>
                    <div><span className="font-semibold text-gray-600">차종:</span> {service.vehicle_type || '-'}</div>
                    <div><span className="font-semibold text-gray-600">항공편:</span> {service.ra_flight_number || '-'}</div>
                    <div><span className="font-semibold text-gray-600">인원/차량:</span> {service.ra_passenger_count || 0}명 / {service.ra_car_count || 0}대</div>
                    {service.request_note && getFilteredNoteText(service.request_note) && <div><span className="font-semibold text-gray-600">요청사항:</span> {getFilteredNoteText(service.request_note)}</div>}
                </div>
            );
        }

        if (serviceType === 'hotel') {
            return (
                <div className="space-y-1 text-sm">
                    <div><span className="font-semibold text-gray-600">체크인:</span> {service.checkin_date || '-'}</div>
                    <div><span className="font-semibold text-gray-600">박수:</span> {service.nights || 0}박</div>
                    <div><span className="font-semibold text-gray-600">인원:</span> {service.guest_count || 0}명</div>
                    {service.request_note && <div><span className="font-semibold text-gray-600">요청사항:</span> {service.request_note}</div>}
                </div>
            );
        }

        if (serviceType === 'tour') {
            return (
                <div className="space-y-1 text-sm">
                    <div><span className="font-semibold text-gray-600">투어명:</span> {service.tour_name || service.tourName || service.tour_price_code || '-'}</div>
                    <div><span className="font-semibold text-gray-600">이용일:</span> {service.usage_date || '-'}</div>
                    <div><span className="font-semibold text-gray-600">인원:</span> {service.tour_capacity || 0}명</div>
                    <div><span className="font-semibold text-gray-600">픽업:</span> {service.pickup_location || '-'}</div>
                    <div><span className="font-semibold text-gray-600">드롭:</span> {service.dropoff_location || '-'}</div>
                    {service.request_note && <div><span className="font-semibold text-gray-600">요청사항:</span> {service.request_note}</div>}
                </div>
            );
        }

        if (serviceType === 'rentcar') {
            return (
                <div className="space-y-1 text-sm">
                    <div><span className="font-semibold text-gray-600">인수일시:</span> {formatDateTimePlus8(service.pickup_datetime)}</div>
                    <div><span className="font-semibold text-gray-600">픽업:</span> {service.pickup_location || '-'}</div>
                    <div><span className="font-semibold text-gray-600">목적지:</span> {service.destination || '-'}</div>
                    {(service.return_datetime || service.return_pickup_location || service.return_destination || service.dropoff_location) && (
                        <>
                            <div><span className="font-semibold text-gray-600">리턴일시:</span> {service.return_datetime ? formatDateTimePlus8(service.return_datetime) : '-'}</div>
                            <div><span className="font-semibold text-gray-600">리턴위치:</span> {service.return_pickup_location || service.dropoff_location || '-'}</div>
                            <div><span className="font-semibold text-gray-600">리턴목적지:</span> {service.return_destination || '-'}</div>
                        </>
                    )}
                    {service.request_note && <div><span className="font-semibold text-gray-600">요청사항:</span> {service.request_note}</div>}
                </div>
            );
        }

        return <div className="text-sm text-gray-600">상세 정보 없음</div>;
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] overflow-y-auto">
                {/* 헤더 */}
                <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-bold text-gray-800">예약 상세 정보</h2>
                        <p className="text-sm text-gray-500 mt-1">주문ID: {selectedReservation?.orderId}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                    >
                        <X className="w-6 h-6 text-gray-600" />
                    </button>
                </div>

                {/* 본문 */}
                <div className="p-6">
                    {/* SH_M 사용자 정보 표시 */}
                    {orderUserInfo && (
                        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-300 rounded-lg p-5 mb-6">
                            <div className="flex items-center gap-2 mb-4">
                                <Users className="w-6 h-6 text-blue-600" />
                                <h3 className="font-bold text-xl text-gray-800">고객 정보 (SH_M)</h3>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <div className="flex items-start gap-2">
                                        <span className="font-semibold text-gray-600 min-w-[80px]">한글이름:</span>
                                        <span className="text-gray-900 font-bold">{orderUserInfo.koreanName}</span>
                                    </div>
                                    <div className="flex items-start gap-2">
                                        <span className="font-semibold text-gray-600 min-w-[80px]">영문이름:</span>
                                        <span className="text-gray-900">{orderUserInfo.englishName}</span>
                                    </div>
                                    <div className="flex items-start gap-2">
                                        <span className="font-semibold text-gray-600 min-w-[80px]">전화번호:</span>
                                        <span className="text-gray-900">{orderUserInfo.phone}</span>
                                    </div>
                                    <div className="flex items-start gap-2">
                                        <span className="font-semibold text-gray-600 min-w-[80px]">이메일:</span>
                                        <span className="text-gray-900 text-sm">{orderUserInfo.email}</span>
                                    </div>
                                    <div className="flex items-start gap-2">
                                        <span className="font-semibold text-gray-600 min-w-[80px]">예약일:</span>
                                        <span className="text-gray-900">{orderUserInfo.reservationDate}</span>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <div className="flex items-start gap-2">
                                        <span className="font-semibold text-gray-600 min-w-[80px]">결제방식:</span>
                                        <span className="text-gray-900">{orderUserInfo.paymentMethod}</span>
                                    </div>
                                    <div className="flex items-start gap-2">
                                        <span className="font-semibold text-gray-600 min-w-[80px]">요금제:</span>
                                        <span className="text-gray-900">{orderUserInfo.plan}</span>
                                    </div>
                                    <div className="flex items-start gap-2">
                                        <span className="font-semibold text-gray-600 min-w-[80px]">회원등급:</span>
                                        <span className="text-gray-900">{orderUserInfo.memberLevel}</span>
                                    </div>
                                    {orderUserInfo.kakaoId && (
                                        <div className="flex items-start gap-2">
                                            <span className="font-semibold text-gray-600 min-w-[80px]">카톡ID:</span>
                                            <span className="text-gray-900">{orderUserInfo.kakaoId}</span>
                                        </div>
                                    )}
                                    {orderUserInfo.discountCode && (
                                        <div className="flex items-start gap-2">
                                            <span className="font-semibold text-gray-600 min-w-[80px]">할인코드:</span>
                                            <span className="text-red-600 font-semibold">{orderUserInfo.discountCode}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                            {orderUserInfo.requestNote && (
                                <div className="mt-4 pt-4 border-t border-blue-200">
                                    <div className="flex items-start gap-2">
                                        <span className="font-semibold text-gray-600">요청사항:</span>
                                        <span className="text-gray-900">{orderUserInfo.requestNote}</span>
                                    </div>
                                </div>
                            )}
                            {orderUserInfo.specialNote && (
                                <div className="mt-2">
                                    <div className="flex items-start gap-2">
                                        <span className="font-semibold text-gray-600">특이사항:</span>
                                        <span className="text-red-700 font-semibold">{orderUserInfo.specialNote}</span>
                                    </div>
                                </div>
                            )}
                            {orderUserInfo.memo && (
                                <div className="mt-2">
                                    <div className="flex items-start gap-2">
                                        <span className="font-semibold text-gray-600">메모:</span>
                                        <span className="text-gray-700">{orderUserInfo.memo}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* 모든 서비스 목록 */}
                    <div className="mt-6">
                        <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                            <Users className="w-5 h-5" />
                            주문ID의 모든 서비스 ({allOrderServices.length}개)
                        </h3>

                        {loading ? (
                            <div className="flex flex-col items-center justify-center py-12">
                                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4"></div>
                                <p className="text-gray-600">서비스 정보를 불러오는 중...</p>
                            </div>
                        ) : allOrderServices.length === 0 ? (
                            <div className="text-center py-12 text-gray-500">
                                연결된 서비스가 없습니다.
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {allOrderServices.map((service, index) => (
                                    <div
                                        key={`${service.serviceType}-${index}`}
                                        className={`border rounded-lg p-4 ${getServiceColor(service.serviceType)}`}
                                    >
                                        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-300">
                                            {getServiceIcon(service.serviceType)}
                                            <h4 className="font-bold text-gray-800">
                                                {getServiceLabel(service.serviceType)}
                                            </h4>
                                        </div>
                                        <div className="space-y-2">
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className="font-semibold text-gray-700">고객명:</span>
                                                <span className="text-gray-900">
                                                    {service.customerName}
                                                    {service.customerEnglishName && (
                                                        <span className="text-gray-500 ml-2 text-xs">
                                                            ({service.customerEnglishName})
                                                        </span>
                                                    )}
                                                </span>
                                            </div>
                                            {renderServiceDetails(service)}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* 이메일 기반 DB 연관 예약 */}
                    <div className="mt-8">
                        <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                            <Users className="w-5 h-5" />
                            이메일 연관 DB 예약 ({relatedDbServices.length}개)
                        </h3>

                        <div className="text-xs text-gray-500 mb-3">
                            검색 기준 이메일: {relatedEmail || orderUserInfo?.email || selectedReservation?.email || '-'}
                        </div>

                        {relatedDbLoading ? (
                            <div className="flex flex-col items-center justify-center py-10">
                                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-500 mb-3"></div>
                                <p className="text-gray-600 text-sm">DB 예약 정보를 불러오는 중...</p>
                            </div>
                        ) : relatedDbServices.length === 0 ? (
                            <div className="text-center py-10 text-gray-500 border border-dashed border-gray-300 rounded-lg">
                                이메일로 조회된 추가 DB 예약이 없습니다.
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {relatedDbServices.map((service, index) => (
                                    <div
                                        key={`db-${service.serviceType}-${service.reservation_id || index}`}
                                        className={`border rounded-lg p-4 ${getServiceColor(service.serviceType)}`}
                                    >
                                        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-300">
                                            {getServiceIcon(service.serviceType)}
                                            <h4 className="font-bold text-gray-800">
                                                {getServiceLabel(service.serviceType)}
                                            </h4>
                                        </div>

                                        <div className="space-y-2">
                                            <div className="text-xs text-gray-600 bg-white/70 rounded p-2 border border-gray-200">
                                                <div><span className="font-semibold">고객:</span> {service.user?.name || '-'} ({service.user?.email || '-'})</div>
                                            </div>
                                            {renderRelatedDbServiceDetails(service)}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* 푸터 */}
                <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex justify-between">
                    <button
                        onClick={() => {
                            if (selectedReservation?.orderId) {
                                router.push(`/manager/sheet-reservations/${selectedReservation.orderId}/edit`);
                            }
                        }}
                        className="bg-blue-500 text-white px-6 py-2 rounded hover:bg-blue-600 transition-colors flex items-center gap-2"
                    >
                        <Edit className="w-4 h-4" />
                        수정
                    </button>
                    <button
                        onClick={onClose}
                        className="bg-gray-500 text-white px-6 py-2 rounded hover:bg-gray-600 transition-colors"
                    >
                        닫기
                    </button>
                </div>
            </div>
        </div>
    );
}
