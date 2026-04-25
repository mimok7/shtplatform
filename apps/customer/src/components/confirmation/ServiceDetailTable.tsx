'use client';

import React from 'react';

interface ServiceDetailTableProps {
    reservations: any[];
    totalPrice: number;
}

export const ServiceDetailTable = ({ reservations, totalPrice }: ServiceDetailTableProps) => {
    const getServiceTypeName = (type: string) => {
        const typeNames: Record<string, string> = {
            cruise: '크루즈',
            airport: '공항차량',
            hotel: '호텔',
            rentcar: '렌터카',
            tour: '투어',
            car: '차량 서비스',
        };
        return typeNames[type] || type;
    };

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

    return (
        <div className="mb-6">
            <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center">
                <span className="w-1 h-5 bg-blue-600 mr-2" />예약 서비스 상세 내역
            </h3>
            <table className="w-full border border-gray-300">
                <thead>
                    <tr className="bg-gray-100">
                        <th className="border border-gray-300 px-2 py-2 text-center text-xs font-semibold text-gray-700">No.</th>
                        <th className="border border-gray-300 px-2 py-2 text-center text-xs font-semibold text-gray-700">구분</th>
                        <th className="border border-gray-300 px-2 py-2 text-center text-xs font-semibold text-gray-700 w-1/6">상세 정보</th>
                        <th className="border border-gray-300 px-2 py-2 text-center text-xs font-semibold text-gray-700">가격 정보</th>
                        <th className="border border-gray-300 px-2 py-2 text-center text-xs font-semibold text-gray-700">금액</th>
                    </tr>
                </thead>
                <tbody>
                    {reservations.map((reservation, index) => (
                        <tr key={`${reservation.reservation_id}-${reservation.service_type}-${index}`} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                            <td className="border border-gray-300 px-2 py-2 text-center font-medium text-gray-700">{index + 1}</td>
                            <td className="border border-gray-300 px-2 py-2 text-center align-top">
                                <div className="font-semibold text-gray-900 mb-1">
                                    {Array.isArray(reservation.all_service_types) && reservation.all_service_types.length > 0 ? (
                                        <>
                                            {reservation.all_service_types.map((type: string) => (
                                                <span key={type} className="inline-block mr-2 px-2 py-1 bg-blue-50 text-blue-600 rounded text-xs font-medium">{getServiceTypeName(type)}</span>
                                            ))}
                                        </>
                                    ) : (
                                        <span>{getServiceTypeName(reservation.service_type)}</span>
                                    )}
                                </div>
                                <div className="text-[10px] text-gray-500 font-mono">ID: {reservation.reservation_id.slice(-8)}</div>
                            </td>
                            <td className="border border-gray-300 px-2 py-2 text-left align-top w-1/4">
                                {reservation.service_type === 'cruise' && reservation.service_details && (
                                    <div className="space-y-1 text-xs">
                                        <div><span className="text-gray-500">체크인:</span> <span>{(reservation.service_details as any).checkin || '-'}</span></div>
                                        <div><span className="text-gray-500">크루즈명:</span> <span>{(reservation.priceDetail as any)?.cruise_name || '-'}</span></div>
                                        <div><span className="text-gray-500">스케줄:</span> <span>{formatScheduleType((reservation.priceDetail as any)?.schedule_type)}</span></div>
                                        <div><span className="text-gray-500">객실타입:</span> <span>{(reservation.priceDetail as any)?.room_type || '-'}</span></div>
                                        <div><span className="text-gray-500">인원:</span> <span>{(() => {
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
                                        <div><span className="text-gray-500">총 인원:</span> <span>{(() => {
                                            const d = reservation.service_details as any;
                                            const total = (d?.adult_count || 0) + (d?.extra_bed_count || 0) + (d?.child_count || 0) + (d?.child_extra_bed_count || 0) + (d?.infant_count || 0);
                                            return `${total}명`;
                                        })()}</span></div>
                                        {(reservation.service_details as any).request_note && <div><span className="text-gray-500">요청사항:</span> <span className="text-gray-600">{(reservation.service_details as any).request_note}</span></div>}
                                    </div>
                                )}
                                {reservation.service_type === 'airport' && reservation.service_details && (
                                    <div className="space-y-1 text-xs">
                                        <div><span className="text-gray-500">장소:</span> <span>{(reservation.service_details as any).ra_airport_location || '-'}</span></div>
                                        <div><span className="text-gray-500">일시:</span> <span>{(reservation.service_details as any).ra_datetime || '-'}</span></div>
                                        <div><span className="text-gray-500">항공편:</span> <span>{(reservation.service_details as any).ra_flight_number || '-'}</span></div>
                                        <div><span className="text-gray-500">인원:</span> <span>{(reservation.service_details as any).ra_passenger_count || 0}명</span></div>
                                    </div>
                                )}
                                {reservation.service_type === 'hotel' && reservation.service_details && (
                                    <div className="space-y-1 text-xs">
                                        <div><span className="text-gray-500">체크인:</span> <span>{(reservation.service_details as any).checkin_date || '-'}</span></div>
                                        <div><span className="text-gray-500">객실수:</span> <span>{(reservation.service_details as any).room_count || 0}실</span></div>
                                        <div><span className="text-gray-500">투숙인원:</span> <span>{(reservation.service_details as any).guest_count || 0}명</span></div>
                                        <div><span className="text-gray-500">호텔구분:</span> <span>{(reservation.service_details as any).hotel_category || '-'}</span></div>
                                        {Boolean((reservation.service_details as any).breakfast_service) && (
                                            <div><span className="text-gray-500">조식:</span> <span>{(reservation.service_details as any).breakfast_service}</span></div>
                                        )}
                                    </div>
                                )}
                                {reservation.service_type === 'rentcar' && reservation.service_details && (
                                    <div className="space-y-1 text-xs">
                                        <div><span className="text-gray-500">픽업:</span> <span>{(reservation.service_details as any).pickup_datetime || (reservation.service_details as any).pickup_date || '-'}</span></div>
                                        <div><span className="text-gray-500">대여일수:</span> <span>{(reservation.service_details as any).rental_days || 0}일</span></div>
                                        <div><span className="text-gray-500">기사수:</span> <span>{(reservation.service_details as any).driver_count || 0}명</span></div>
                                        <div><span className="text-gray-500">차량정보:</span> <span>{(reservation.service_details as any).car_type || '-'}</span></div>
                                    </div>
                                )}
                                {reservation.service_type === 'tour' && reservation.service_details && (
                                    <div className="space-y-1 text-xs">
                                        <div><span className="text-gray-500">투어일:</span> <span>{(reservation.service_details as any).tour_date || '-'}</span></div>
                                        <div><span className="text-gray-500">참가인원:</span> <span>{(reservation.service_details as any).participant_count || 0}명</span></div>
                                        <div><span className="text-gray-500">투어명:</span> <span>{(reservation.service_details as any).tour_name || '-'}</span></div>
                                        <div><span className="text-gray-500">픽업장소:</span> <span>{(reservation.service_details as any).pickup_location || '-'}</span></div>
                                    </div>
                                )}
                                {reservation.service_type === 'car' && reservation.service_details && (
                                    <div className="space-y-1 text-xs">
                                        <div><span className="text-gray-500">픽업일시:</span> <span className="font-medium">{(reservation.service_details as any).pickup_datetime || '-'}</span></div>
                                        <div><span className="text-gray-500">픽업/드랍:</span> <span className="font-medium">{(reservation.service_details as any).pickup_location || '-'} → {(reservation.service_details as any).dropoff_location || '-'}</span></div>
                                        <div><span className="text-gray-500">차량수:</span> <span>{(reservation.service_details as any).car_count ?? 0}대</span></div>
                                        <div><span className="text-gray-500">승객수:</span> <span>{(reservation.service_details as any).passenger_count ?? 0}명</span></div>
                                        {(reservation.service_details as any).request_note && (
                                            <div><span className="text-gray-500">요청사항:</span> <span className="text-gray-600">{(reservation.service_details as any).request_note}</span></div>
                                        )}
                                        {(reservation.service_details as any).shtDetail && (
                                            <div className="pt-1 border-t border-gray-200">
                                                <div className="text-gray-500">스테이하롱 차량 선택</div>
                                                <div><span className="text-gray-500">차량번호:</span> <span>{(reservation.service_details as any).shtDetail.vehicle_number || '-'}</span></div>
                                                <div><span className="text-gray-500">좌석수:</span> <span>{(reservation.service_details as any).shtDetail.seat_number || 0}석</span></div>
                                                <div><span className="text-gray-500">카테고리:</span> <span>{(reservation.service_details as any).shtDetail.sht_category || '-'}</span></div>
                                                {(reservation.service_details as any).shtDetail.usage_date && (
                                                    <div><span className="text-gray-500">사용일시:</span> <span>{new Date((reservation.service_details as any).shtDetail.usage_date).toLocaleString('ko-KR')}</span></div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                                {!reservation.service_details && (
                                    <div className="text-sm text-gray-400">상세 정보가 없습니다</div>
                                )}
                            </td>
                            <td className="border border-gray-300 px-2 py-2 text-left align-top">
                                <div className="text-xs text-gray-700">
                                    {reservation.priceDetail ? (
                                        <div className="mt-1 text-[11px] text-gray-600">
                                            {(() => {
                                                const order = ['schedule', 'room_category', 'cruise', 'room_type', 'payment'];
                                                const fieldMap: Record<string, string> = {
                                                    price: '가격',
                                                    schedule: '스케줄',
                                                    cruise: '크루즈',
                                                    start_date: '시작일',
                                                    end_date: '종료일',
                                                    room_category: '구분',
                                                    room_type: '객실타입',
                                                    payment: '결제방식',
                                                    car_category: '구분',
                                                    car_type: '차량타입',
                                                    passenger_count: '승객수',
                                                    airport_category: '구분',
                                                    airport_route: '경로',
                                                    airport_car_type: '차종',
                                                    service_type: '구분',
                                                    hotel_name: '호텔명',
                                                    room_name: '룸명',
                                                    weekday_type: '요일구분',
                                                    way_type: '이용방식',
                                                    category: '카테고리',
                                                    route: '경로',
                                                    vehicle_type: '차종',
                                                    capacity: '탑승인원',
                                                    tour_name: '투어명',
                                                    tour_capacity: '정원',
                                                    tour_vehicle: '차량',
                                                    tour_type: '결제방식',
                                                };
                                                const filtered = Object.entries(reservation.priceDetail)
                                                    .filter(([key]) => key !== 'price_code' && key !== 'price' && !key.includes('code') && key !== 'start_date' && key !== 'end_date');
                                                const sorted = [
                                                    ...order.map((k) => filtered.find(([key]) => key === k)).filter(Boolean) as any[],
                                                    ...filtered.filter(([key]) => !order.includes(key)),
                                                ];
                                                return sorted.map(([key, value]: any) => {
                                                    const label = key.includes('category') ? '구분' : fieldMap[key] || key;
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
                                                                    const days = nights > 0 ? nights + 1 : 1;
                                                                    display = `${nights}박 ${days}일`;
                                                                } catch (e) {
                                                                    display = '';
                                                                }
                                                            }
                                                        }
                                                        return (<div key={key}><span className="font-semibold">{label}:</span> {display || String(value)}</div>);
                                                    }
                                                    return (
                                                        <div key={key}><span className="font-semibold">{label}:</span> {String(value)}</div>
                                                    );
                                                });
                                            })()}
                                        </div>
                                    ) : (
                                        <div className="text-xs text-gray-400">가격 상세 정보 없음</div>
                                    )}
                                    {reservation.price_option && (
                                        <div className="text-[11px] text-gray-500 mt-1">{reservation.price_option}</div>
                                    )}
                                </div>
                            </td>
                            <td className="border border-gray-300 px-2 py-2 text-center">
                                <div className="text-base font-bold text-blue-600">
                                    {(() => {
                                        const price = reservation.priceDetail?.price ?? 0;
                                        let count = 1;
                                        let unit = '명';
                                        if (reservation.service_type === 'cruise') {
                                            count = reservation.service_details?.guest_count ?? 1;
                                        } else if (reservation.service_type === 'airport') {
                                            count = reservation.service_details?.ra_passenger_count ?? 1;
                                        } else if (reservation.service_type === 'hotel') {
                                            count = reservation.service_details?.guest_count ?? 1;
                                        } else if (reservation.service_type === 'rentcar') {
                                            count = reservation.service_details?.driver_count ?? 1;
                                            unit = '대';
                                        } else if (reservation.service_type === 'car') {
                                            // 차량 서비스: 차량 대수 우선, 다음 승객수, 마지막으로 차량 스펙의 좌석수
                                            count =
                                                reservation.service_details?.car_count ??
                                                reservation.service_details?.passenger_count ??
                                                (reservation.service_details as any)?.shtDetail?.seat_number ??
                                                (reservation.service_details as any)?.carInfo?.seat_number ??
                                                1;
                                            unit = '대';
                                        } else if (reservation.service_type === 'tour') {
                                            count = reservation.service_details?.participant_count ?? 1;
                                        }
                                        return (
                                            <>
                                                <span className="text-[11px] text-gray-500 block mb-1">{`${price.toLocaleString()} × ${count}${unit} =`}</span>
                                                {`${reservation.amount.toLocaleString()}동`}
                                            </>
                                        );
                                    })()}
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
                <tfoot>
                    <tr className="bg-blue-50">
                        <td colSpan={5} className="border border-gray-300 px-3 py-4 text-right">
                            <div className="text-base font-semibold text-gray-700">
                                총 결제 금액 : <span className="text-xl font-bold text-blue-600 ml-2">{totalPrice.toLocaleString()}<span className="text-sm font-normal text-gray-500 ml-1">동</span></span>
                            </div>
                        </td>
                    </tr>
                </tfoot>
            </table>

            {/* 결제 내역 섹션 */}
            <div className="mt-6">
                <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center">
                    <span className="w-1 h-5 bg-green-600 mr-2" />💰 결제 내역
                </h3>
                <table className="w-full border border-gray-300">
                    <thead>
                        <tr className="bg-gray-100">
                            <th className="border border-gray-300 px-2 py-1.5 text-center text-[11px] font-semibold text-gray-600 w-6">No.</th>
                            <th className="border border-gray-300 px-2 py-1.5 text-center text-[11px] font-semibold text-gray-600 w-16">구분</th>
                            <th className="border border-gray-300 px-2 py-1.5 text-center text-[11px] font-semibold text-gray-600 w-40">서비스 상세</th>
                            <th className="border border-gray-300 px-2 py-1.5 text-center text-[11px] font-semibold text-gray-600 flex-1">금액 계산</th>
                            <th className="border border-gray-300 px-2 py-1.5 text-center text-[11px] font-semibold text-gray-600 w-28">합계</th>
                        </tr>
                    </thead>
                    <tbody>
                        {reservations.map((r, i) => {
                            const d = r.service_details as any;
                            const p = r.priceDetail as any;

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
                                    // cruise_rate_card prices
                                    const adultPrice = p?.price_adult || 0;
                                    const childPrice = p?.price_child || 0;
                                    const infantPrice = p?.price_infant || 0;
                                    const extraBedPrice = p?.price_extra_bed || 0;
                                    const childExtraBedPrice = p?.price_child_extra_bed || 0;
                                    const singlePrice = p?.price_single || 0;
                                    const adultCount = d?.adult_count || d?.guest_count || 0;
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
                                    // 상세 표기: 카테고리 / 노선 / 차량타입
                                    const cat = p?.service_type || '';
                                    const route = p?.route || '';
                                    const carType = p?.vehicle_type || '';
                                    if (cat || route) descLines.push(`✈️ ${[cat, route].filter(Boolean).join(' / ')}`);
                                    if (carType) descLines.push(`차량: ${carType}`);
                                    const airportUnitPrice = p?.price || 0;
                                    const pax = d?.ra_passenger_count || d?.passenger_count || 1;
                                    calcLines.push(`${pax}명 × ${airportUnitPrice.toLocaleString()}동`);
                                    break;
                                }
                                case 'hotel': {
                                    // 상세 표기: 시즌명
                                    const season = p?.season_name || '';
                                    if (season) descLines.push(`🏨 시즌: ${season}`);
                                    const hotelUnitPrice = p?.base_price || 0;
                                    const rooms = d?.room_count || 1;
                                    const nights = d?.nights || 1;
                                    calcLines.push(`${rooms}실 / ${nights}박 × ${hotelUnitPrice.toLocaleString()}동`);
                                    break;
                                }
                                case 'rentcar': {
                                    // 상세 표기: 카테고리 / 노선 / 차량타입
                                    const wayType = p?.way_type || '';
                                    const rentRoute = p?.route || '';
                                    const vehicleType = p?.vehicle_type || '';
                                    if (wayType || rentRoute) descLines.push(`🚗 ${[wayType, rentRoute].filter(Boolean).join(' / ')}`);
                                    if (vehicleType) descLines.push(`차량: ${vehicleType}`);
                                    const rentUnitPrice = p?.price || 0;
                                    const days = d?.rental_days || 1;
                                    calcLines.push(`${days}일 × ${rentUnitPrice.toLocaleString()}동`);
                                    break;
                                }
                                case 'tour': {
                                    // 상세 표기: 차량타입
                                    const vType = p?.vehicle_type || '';
                                    if (vType) descLines.push(`🗺️ 차량: ${vType}`);
                                    const tourUnitPrice = p?.price_per_person || 0;
                                    const cap = d?.participant_count || d?.tour_capacity || 1;
                                    calcLines.push(`${cap}명 × ${tourUnitPrice.toLocaleString()}동`);
                                    break;
                                }
                                case 'car': {
                                    // 상세 표기: 카테고리 / 차량타입
                                    const cCat = p?.car_category || '';
                                    const cType = p?.car_type || '';
                                    if (cCat || cType) descLines.push(`🚐 ${[cCat, cType].filter(Boolean).join(' / ')}`);
                                    const carUnitPrice = p?.price || 0;
                                    const carPax = d?.car_count || d?.passenger_count || 1;
                                    calcLines.push(`${carPax}명 × ${carUnitPrice.toLocaleString()}동`);
                                    break;
                                }
                                default: {
                                    const fallbackPrice = p?.price || p?.base_price || p?.price_per_person || p?.price_adult || 0;
                                    calcLines.push(`${fallbackPrice.toLocaleString()}동`);
                                }
                            }

                            // 단가가 모두 0인 경우 총액 기반 fallback
                            if (calcLines.length === 0 || calcLines.every(l => l.includes('× 0동'))) {
                                calcLines.length = 0;
                                calcLines.push(`${r.amount.toLocaleString()}동`);
                            }

                            return (
                                <tr key={`pay-row-${i}`} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                    <td className="border border-gray-300 px-2 py-2 text-center text-xs text-gray-500">{i + 1}</td>
                                    <td className="border border-gray-300 px-2 py-2 text-center text-xs font-semibold text-gray-800">
                                        {getServiceTypeName(r.service_type)}
                                    </td>
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
                                    <td className="border border-gray-300 px-3 py-2 text-right text-sm font-bold text-blue-700">
                                        {r.amount.toLocaleString()}동
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                    <tfoot>
                        <tr className="bg-blue-50">
                            <td colSpan={5} className="border border-gray-300 px-3 py-3 text-right">
                                <span className="text-base font-bold text-gray-900 mr-2">총 결제 금액</span>
                                <span className="text-xl font-bold text-blue-600">{totalPrice.toLocaleString()}<span className="text-sm font-normal text-gray-500 ml-1">동</span></span>
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    );
};
