// @ts-nocheck
'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import ManagerLayout from '@/components/ManagerLayout';
import supabase from '@/lib/supabase';
import {
    Ship, Plane, Building, MapPin, Car, Calendar, RefreshCw,
    Trash2, CheckSquare, Square, ChevronDown, ChevronUp, X, Edit2,
} from 'lucide-react';

type ServiceType = 'all' | 'cruise' | 'car' | 'vehicle' | 'airport' | 'hotel' | 'tour' | 'rentcar';
type GroupMode = 'date' | 'user';

const TABLE_MAP: Record<string, string> = {
    cruise: 'sh_r', car: 'sh_c', vehicle: 'sh_cc', airport: 'sh_p',
    hotel: 'sh_h', tour: 'sh_t', rentcar: 'sh_rc',
};

const SERVICE_LABELS: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    cruise: { label: '크루즈', color: 'blue', icon: <Ship className="w-4 h-4" /> },
    car: { label: '차량', color: 'sky', icon: <Car className="w-4 h-4" /> },
    vehicle: { label: '스하차량', color: 'purple', icon: <Car className="w-4 h-4" /> },
    airport: { label: '공항', color: 'green', icon: <Plane className="w-4 h-4" /> },
    hotel: { label: '호텔', color: 'orange', icon: <Building className="w-4 h-4" /> },
    tour: { label: '투어', color: 'red', icon: <MapPin className="w-4 h-4" /> },
    rentcar: { label: '렌트카', color: 'indigo', icon: <Car className="w-4 h-4" /> },
};

const BG: Record<string, string> = {
    blue: 'bg-blue-50 border-blue-200', sky: 'bg-sky-50 border-sky-200',
    purple: 'bg-purple-50 border-purple-200', green: 'bg-green-50 border-green-200',
    orange: 'bg-orange-50 border-orange-200', red: 'bg-red-50 border-red-200',
    indigo: 'bg-indigo-50 border-indigo-200', gray: 'bg-gray-50 border-gray-200',
};
const TEXT: Record<string, string> = {
    blue: 'text-blue-700', sky: 'text-sky-700', purple: 'text-purple-700',
    green: 'text-green-700', orange: 'text-orange-700', red: 'text-red-700',
    indigo: 'text-indigo-700', gray: 'text-gray-700',
};
const BTN_COLOR: Record<string, string> = {
    blue: 'bg-blue-500 hover:bg-blue-600', sky: 'bg-sky-500 hover:bg-sky-600',
    purple: 'bg-purple-500 hover:bg-purple-600', green: 'bg-green-500 hover:bg-green-600',
    orange: 'bg-orange-500 hover:bg-orange-600', red: 'bg-red-500 hover:bg-red-600',
    indigo: 'bg-indigo-500 hover:bg-indigo-600', gray: 'bg-gray-500 hover:bg-gray-600',
};

function parseDate(dateStr: string): Date | null {
    if (!dateStr) return null;
    try {
        if (dateStr.includes('. ')) {
            const parts = dateStr.split('. ').map((p) => p.trim());
            if (parts.length >= 3)
                return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2].split(' ')[0]), 12);
        }
        if (dateStr.includes('-')) {
            const [y, m, d] = dateStr.split(' ')[0].split('-');
            return new Date(parseInt(y), parseInt(m) - 1, parseInt(d), 12);
        }
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) return d;
    } catch { }
    return null;
}

function toYMD(dateStr: string): string {
    const d = parseDate(dateStr);
    if (!d) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtDate(dateStr: string): string {
    const d = parseDate(dateStr);
    return d ? d.toLocaleDateString('ko-KR') : (dateStr || '-');
}

function todayYMD(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

interface CardItem {
    _id: string;
    rowId: number;
    orderId: string;
    serviceType: string;
    data: any;
    dateKey: string;
}

function getPrimaryDate(serviceType: string, row: any): string {
    const raw =
        serviceType === 'cruise' ? row.checkin_date :
            serviceType === 'car' ? row.boarding_datetime :
                serviceType === 'vehicle' ? row.boarding_date :
                    serviceType === 'airport' ? row.date :
                        serviceType === 'hotel' ? row.checkin_date :
                            serviceType === 'tour' ? row.start_date :
                                serviceType === 'rentcar' ? row.boarding_date : '';
    return toYMD(raw || '');
}

function mapRow(raw: any[], serviceType: string, userMap: Map<string, any>): CardItem[] {
    return raw.map((row, idx) => {
        const user = userMap.get(row.order_id) || {};
        const base = {
            orderId: row.order_id,
            serviceType,
            customerName: user.korean_name || '',
            customerEnglishName: user.english_name || '',
            email: user.email || row.email || '',
        };
        let data: any = { ...base };
        if (serviceType === 'cruise') {
            data = { ...data, cruise: row.cruise_name, category: row.division, roomType: row.room_type, roomCount: parseInt(row.room_count) || 0, checkin: row.checkin_date, time: row.time, adult: parseInt(row.adult) || 0, child: parseInt(row.child) || 0, toddler: parseInt(row.toddler) || 0, totalGuests: parseInt(row.guest_count) || 0, discount: row.room_discount, note: row.room_note, requestNote: row.connecting_room, discountCode: row.discount_code, boardingInfo: row.boarding_count, boardingHelp: row.boarding_help };
        } else if (serviceType === 'car') {
            data = { ...data, carType: row.vehicle_type, carCode: row.vehicle_code, carCount: parseInt(row.vehicle_count) || 0, passengerCount: parseInt(row.passenger_count) || 0, pickupDatetime: row.boarding_datetime, pickupLocation: row.boarding_location, dropoffLocation: row.dropoff_location, totalPrice: parseFloat(row.total) || 0 };
        } else if (serviceType === 'vehicle') {
            data = { ...data, boardingDate: row.boarding_date, vehicleNumber: row.vehicle_number, seatNumber: row.seat_number, category: row.category, division: row.division };
        } else if (serviceType === 'airport') {
            data = { ...data, tripType: row.division, category: row.category, route: row.route, carType: row.vehicle_type, carCount: parseInt(row.vehicle_count) || 0, date: row.date, time: row.time, airportName: row.airport_name, flightNumber: row.flight_number, passengerCount: parseInt(row.passenger_count) || 0, carrierCount: parseInt(row.carrier_count) || 0, placeName: row.accommodation_info || row.location_name || '', stopover: row.stopover };
        } else if (serviceType === 'hotel') {
            data = { ...data, hotelName: row.hotel_name, roomName: row.room_name, roomType: row.room_type, roomCount: parseInt(row.room_count) || 0, days: parseInt(row.schedule) || 0, checkinDate: row.checkin_date, checkoutDate: row.checkout_date, breakfastService: row.breakfast_service, adult: parseInt(row.adult) || 0, child: parseInt(row.child) || 0, toddler: parseInt(row.toddler) || 0, totalGuests: parseInt(row.guest_count) || 0, note: row.note, totalPrice: parseFloat(row.total) || 0 };
        } else if (serviceType === 'tour') {
            data = { ...data, tourName: row.tour_name, tourType: row.tour_type, detailCategory: row.detail_category, startDate: row.start_date, endDate: row.end_date, participants: parseInt(row.tour_count) || 0, pickupLocation: row.pickup_location, dropoffLocation: row.dropoff_location, memo: row.memo, dispatch: row.dispatch, tourNote: row.tour_note };
        } else if (serviceType === 'rentcar') {
            data = { ...data, carType: row.vehicle_type, route: row.route, tripType: row.division, carCount: parseInt(row.vehicle_count) || 0, pickupDate: row.boarding_date, pickupTime: row.boarding_time, pickupLocation: row.boarding_location, destination: row.destination, passengerCount: parseInt(row.passenger_count) || 0, carrierCount: parseInt(row.carrier_count) || 0, usagePeriod: row.usage_period, memo: row.memo, stopover: row.stopover };
        }
        const rowId = Number(row.id);
        const safeRowId = Number.isFinite(rowId) ? rowId : -1;
        return {
            _id: safeRowId > -1 ? `${serviceType}-${safeRowId}` : `${serviceType}-${row.order_id}-${idx}`,
            rowId: safeRowId,
            orderId: row.order_id,
            serviceType,
            data,
            dateKey: getPrimaryDate(serviceType, row),
        };
    });
}

// ─── 카드 컴포넌트 ───
function CardItemView({ item, onDetail }: { item: CardItem; onDetail: (item: CardItem) => void }) {
    const st = item.serviceType;
    const info = SERVICE_LABELS[st] || { label: '기타', color: 'gray', icon: <Calendar className="w-4 h-4" /> };
    const d = item.data;
    const bg = BG[info.color] || BG.gray;
    const tc = TEXT[info.color] || TEXT.gray;
    const btnCls = BTN_COLOR[info.color] || BTN_COLOR.gray;
    const dateStr = d.checkin || d.pickupDatetime || d.boardingDate || d.date || d.checkinDate || d.startDate || d.pickupDate || '';
    return (
        <div className={`border rounded-lg p-3 shadow-sm hover:shadow-md transition-all ${bg} flex flex-col gap-1 h-full`}>
            <div className="flex items-center gap-1.5 mb-1 pb-1 border-b border-gray-100">
                <span className={tc}>{info.icon}</span>
                <span className={`text-xs font-bold ${tc}`}>{info.label}</span>
                <span className="text-xs text-gray-400 ml-auto truncate max-w-[56px]">{d.orderId}</span>
                <button
                    onClick={() => onDetail(item)}
                    className={`px-2 py-0.5 rounded text-xs font-medium text-white transition-colors ml-1 ${btnCls}`}
                >
                    상세
                </button>
            </div>
            {d.customerName && (
                <div className="flex items-center gap-1">
                    <span className={`font-bold text-sm ${tc}`}>{d.customerName}</span>
                    {d.customerEnglishName && <span className="text-xs text-gray-400">({d.customerEnglishName})</span>}
                </div>
            )}
            {dateStr && (
                <div className="flex items-center gap-1 text-xs text-gray-600">
                    <Calendar className="w-3 h-3" />
                    <span>{fmtDate(dateStr)}</span>
                    {d.time && <span className="text-gray-400">{d.time}</span>}
                </div>
            )}
            {st === 'cruise' && (
                <>
                    <div className="text-xs"><span className="text-gray-400 mr-1">크루즈</span><span className={`font-semibold ${tc}`}>{d.cruise}</span></div>
                    <div className="text-xs text-gray-500">{d.roomType} {d.category && `(${d.category})`}{d.roomCount > 0 && ` x${d.roomCount}`}</div>
                    <div className="text-xs text-gray-400">{[d.adult > 0 && `성인${d.adult}`, d.child > 0 && `아동${d.child}`, d.toddler > 0 && `유아${d.toddler}`].filter(Boolean).join(' ')}</div>
                </>
            )}
            {st === 'car' && (
                <>
                    <div className="text-xs"><span className={`font-semibold ${tc}`}>{d.carType}</span>{d.carCount > 0 && ` x${d.carCount}`}</div>
                    {d.pickupLocation && <div className="text-xs text-gray-500 truncate">출발 {d.pickupLocation}</div>}
                    {d.dropoffLocation && <div className="text-xs text-gray-500 truncate">도착 {d.dropoffLocation}</div>}
                </>
            )}
            {st === 'vehicle' && (
                <>
                    <div className="text-xs"><span className={`font-semibold ${tc}`}>{d.vehicleNumber}</span> / 좌석 {d.seatNumber}</div>
                    {d.category && <div className="text-xs text-gray-500">{d.category}</div>}
                </>
            )}
            {st === 'airport' && (
                <>
                    <div className="text-xs"><span className={`font-semibold ${tc}`}>{d.tripType} {d.category}</span></div>
                    {d.route && <div className="text-xs text-gray-500 truncate">{d.route}</div>}
                    {d.flightNumber && <div className="text-xs text-gray-400">{d.flightNumber}</div>}
                </>
            )}
            {st === 'hotel' && (
                <>
                    <div className="text-xs"><span className={`font-semibold ${tc}`}>{d.hotelName}</span></div>
                    <div className="text-xs text-gray-500">{d.roomName || d.roomType}{d.roomCount > 0 && ` x${d.roomCount}`}{d.days > 0 && ` / ${d.days}박`}</div>
                    {d.checkoutDate && <div className="text-xs text-gray-400">체크아웃 {fmtDate(d.checkoutDate)}</div>}
                </>
            )}
            {st === 'tour' && (
                <>
                    <div className="text-xs"><span className={`font-semibold ${tc}`}>{d.tourName}</span></div>
                    {d.participants > 0 && <div className="text-xs text-gray-500">{d.participants}명</div>}
                    {d.pickupLocation && <div className="text-xs text-gray-500 truncate">픽업 {d.pickupLocation}</div>}
                </>
            )}
            {st === 'rentcar' && (
                <>
                    <div className="text-xs"><span className={`font-semibold ${tc}`}>{d.carType}</span>{d.carCount > 0 && ` x${d.carCount}`}</div>
                    {d.route && <div className="text-xs text-gray-500">{d.route}</div>}
                    {d.destination && <div className="text-xs text-gray-500 truncate">목적지 {d.destination}</div>}
                </>
            )}
        </div>
    );
}

// ─── 상세 모달 ───
function DetailModal({
    item,
    canDelete,
    onClose,
    onDeleted,
}: {
    item: CardItem;
    canDelete: boolean;
    onClose: () => void;
    onDeleted: (id: string) => void;
}) {
    const router = useRouter();
    const [deleting, setDeleting] = useState(false);
    const st = item.serviceType;
    const info = SERVICE_LABELS[st] || { label: '기타', color: 'gray', icon: <Calendar className="w-4 h-4" /> };
    const d = item.data;
    const tc = TEXT[info.color] || TEXT.gray;

    const handleDelete = async () => {
        if (!confirm(`${d.customerName || item.orderId} 데이터를 삭제하시겠습니까?`)) return;
        if (item.rowId < 0) {
            alert('삭제 실패: 행 식별자(id)가 없어 안전하게 삭제할 수 없습니다.');
            return;
        }
        setDeleting(true);
        try {
            const { error } = await supabase.from(TABLE_MAP[st] || 'sh_r').delete().eq('id', item.rowId);
            if (error) { alert('삭제 실패: ' + error.message); return; }
            onDeleted(item._id);
            onClose();
        } finally {
            setDeleting(false);
        }
    };

    const rows: { label: string; value: any }[] = [];
    rows.push({ label: '주문ID', value: d.orderId });
    rows.push({ label: '이름', value: d.customerName || '-' });
    if (d.customerEnglishName) rows.push({ label: '영문명', value: d.customerEnglishName });
    if (d.email) rows.push({ label: '이메일', value: d.email });

    if (st === 'cruise') {
        rows.push({ label: '체크인', value: fmtDate(d.checkin) + (d.time ? ` ${d.time}` : '') });
        rows.push({ label: '크루즈', value: d.cruise });
        rows.push({ label: '객실', value: [d.roomType, d.category && `(${d.category})`, d.roomCount > 0 && `x${d.roomCount}`].filter(Boolean).join(' ') });
        rows.push({ label: '인원', value: [d.adult > 0 && `성인 ${d.adult}`, d.child > 0 && `아동 ${d.child}`, d.toddler > 0 && `유아 ${d.toddler}`].filter(Boolean).join(' / ') || '-' });
        if (d.discount) rows.push({ label: '할인', value: d.discount });
        if (d.discountCode) rows.push({ label: '할인코드', value: d.discountCode });
        if (d.boardingInfo) rows.push({ label: '승선인원', value: d.boardingInfo });
        if (d.boardingHelp) rows.push({ label: '승선도움', value: d.boardingHelp });
        if (d.note) rows.push({ label: '객실메모', value: d.note });
        if (d.requestNote) rows.push({ label: '요청사항', value: d.requestNote });
    } else if (st === 'car') {
        rows.push({ label: '픽업일시', value: d.pickupDatetime || '-' });
        rows.push({ label: '차종', value: [d.carType, d.carCount > 0 && `x${d.carCount}`].filter(Boolean).join(' ') });
        if (d.passengerCount > 0) rows.push({ label: '인원', value: `${d.passengerCount}명` });
        if (d.pickupLocation) rows.push({ label: '출발지', value: d.pickupLocation });
        if (d.dropoffLocation) rows.push({ label: '도착지', value: d.dropoffLocation });
        if (d.totalPrice) rows.push({ label: '금액', value: d.totalPrice.toLocaleString() + '동' });
    } else if (st === 'vehicle') {
        rows.push({ label: '탑승일', value: fmtDate(d.boardingDate) });
        rows.push({ label: '구분/분류', value: [d.division, d.category].filter(Boolean).join(' / ') || '-' });
        rows.push({ label: '차량번호', value: d.vehicleNumber || '-' });
        rows.push({ label: '좌석번호', value: d.seatNumber || '-' });
    } else if (st === 'airport') {
        rows.push({ label: '일시', value: [fmtDate(d.date), d.time].filter(Boolean).join(' ') });
        rows.push({ label: '구분', value: [d.tripType, d.category].filter(Boolean).join(' - ') });
        if (d.route) rows.push({ label: '경로', value: d.route });
        rows.push({ label: '차종', value: [d.carType, d.carCount > 0 && `x${d.carCount}`].filter(Boolean).join(' ') || '-' });
        if (d.passengerCount > 0) rows.push({ label: '인원', value: `${d.passengerCount}명` });
        if (d.carrierCount > 0) rows.push({ label: '수하물', value: `${d.carrierCount}개` });
        if (d.airportName) rows.push({ label: '공항', value: d.airportName });
        if (d.flightNumber) rows.push({ label: '항공편', value: d.flightNumber });
        if (d.placeName) rows.push({ label: '숙박지/장소', value: d.placeName });
        if (d.stopover) rows.push({ label: '경유지', value: d.stopover });
    } else if (st === 'hotel') {
        rows.push({ label: '체크인', value: fmtDate(d.checkinDate) });
        if (d.checkoutDate) rows.push({ label: '체크아웃', value: fmtDate(d.checkoutDate) });
        if (d.days > 0) rows.push({ label: '박수', value: `${d.days}박` });
        rows.push({ label: '호텔', value: d.hotelName || '-' });
        rows.push({ label: '객실', value: [d.roomName || d.roomType, d.roomCount > 0 && `x${d.roomCount}`].filter(Boolean).join(' ') || '-' });
        rows.push({ label: '인원', value: [d.adult > 0 && `성인 ${d.adult}`, d.child > 0 && `아동 ${d.child}`, d.toddler > 0 && `유아 ${d.toddler}`].filter(Boolean).join(' / ') || '-' });
        if (d.breakfastService) rows.push({ label: '조식', value: d.breakfastService });
        if (d.note) rows.push({ label: '메모', value: d.note });
        if (d.totalPrice) rows.push({ label: '금액', value: d.totalPrice.toLocaleString() + '동' });
    } else if (st === 'tour') {
        rows.push({ label: '시작일', value: fmtDate(d.startDate) });
        if (d.endDate) rows.push({ label: '종료일', value: fmtDate(d.endDate) });
        rows.push({ label: '투어명', value: d.tourName || '-' });
        if (d.tourType) rows.push({ label: '투어타입', value: d.tourType });
        if (d.detailCategory) rows.push({ label: '세부분류', value: d.detailCategory });
        if (d.participants > 0) rows.push({ label: '참가인원', value: `${d.participants}명` });
        if (d.dispatch) rows.push({ label: '배차', value: d.dispatch });
        if (d.pickupLocation) rows.push({ label: '픽업위치', value: d.pickupLocation });
        if (d.dropoffLocation) rows.push({ label: '드랍위치', value: d.dropoffLocation });
        if (d.memo) rows.push({ label: '메모', value: d.memo });
        if (d.tourNote) rows.push({ label: '투어메모', value: d.tourNote });
    } else if (st === 'rentcar') {
        rows.push({ label: '픽업일', value: [fmtDate(d.pickupDate), d.pickupTime].filter(Boolean).join(' ') });
        rows.push({ label: '구분', value: [d.tripType, d.route].filter(Boolean).join(' / ') || '-' });
        rows.push({ label: '차종', value: [d.carType, d.carCount > 0 && `x${d.carCount}`].filter(Boolean).join(' ') || '-' });
        if (d.passengerCount > 0) rows.push({ label: '인원', value: `${d.passengerCount}명` });
        if (d.pickupLocation) rows.push({ label: '픽업위치', value: d.pickupLocation });
        if (d.destination) rows.push({ label: '목적지', value: d.destination });
        if (d.stopover) rows.push({ label: '경유지', value: d.stopover });
        if (d.usagePeriod) rows.push({ label: '이용기간', value: d.usagePeriod });
        if (d.memo) rows.push({ label: '메모', value: d.memo });
    }

    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
            <div
                className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                <div className={`flex items-center gap-2 px-4 py-3 rounded-t-xl border-b ${BG[info.color] || BG.gray}`}>
                    <span className={tc}>{info.icon}</span>
                    <span className={`font-bold text-sm ${tc}`}>{info.label} 상세</span>
                    <span className="text-xs text-gray-500 ml-auto">{d.orderId}</span>
                    <button onClick={onClose} className="ml-2 p-1 rounded hover:bg-black/10">
                        <X className="w-4 h-4 text-gray-500" />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                    <dl className="space-y-2">
                        {rows.map((row, i) => (
                            <div key={i} className="flex gap-2 text-sm">
                                <dt className="text-gray-500 whitespace-nowrap w-20 shrink-0">{row.label}</dt>
                                <dd className="text-gray-800 font-medium break-words flex-1">{row.value || '-'}</dd>
                            </div>
                        ))}
                    </dl>
                </div>
                <div className="flex gap-2 px-4 py-3 border-t bg-gray-50 rounded-b-xl">
                    <button
                        onClick={() => router.push(`/manager/sheet-reservations/${item.orderId}/edit`)}
                        className="flex items-center gap-1 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 flex-1 justify-center"
                    >
                        <Edit2 className="w-4 h-4" />수정
                    </button>
                    {canDelete && (
                        <button
                            onClick={handleDelete}
                            disabled={deleting}
                            className="flex items-center gap-1 px-4 py-2 bg-red-500 text-white rounded-lg text-sm hover:bg-red-600 disabled:opacity-50 flex-1 justify-center"
                        >
                            <Trash2 className="w-4 h-4" />{deleting ? '삭제 중...' : '삭제'}
                        </button>
                    )}
                    <button onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-300">
                        닫기
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── 메인 페이지 ───
export default function SheetEditPage() {
    const [items, setItems] = useState<CardItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [userEmail, setUserEmail] = useState<string | null>(null);
    const [typeFilter, setTypeFilter] = useState<ServiceType>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [groupMode, setGroupMode] = useState<GroupMode>('date');
    const [futureOnly, setFutureOnly] = useState(true);
    const [detailItem, setDetailItem] = useState<CardItem | null>(null);
    const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [deleting, setDeleting] = useState(false);

    const emailLower = userEmail ? userEmail.toLowerCase() : '';
    const canDelete = emailLower === 'kys@hyojacho.es.kr' || emailLower === 'kjh@hyojacho.es.kr';

    useEffect(() => {
        supabase.auth.getUser().then(({ data: { user } }) => {
            if (user?.email) setUserEmail(user.email);
        });
    }, []);

    const loadData = useCallback(async () => {
        setLoading(true);
        setSelected(new Set());
        try {
            let allShM: any[] = [];
            let fromM = 0;
            while (true) {
                const { data, error } = await supabase
                    .from('sh_m')
                    .select('order_id, korean_name, english_name, email')
                    .range(fromM, fromM + 999);
                if (error || !data || data.length === 0) break;
                allShM = allShM.concat(data);
                if (data.length < 1000) break;
                fromM += 1000;
            }
            const userMap = new Map(allShM.map((u) => [u.order_id, u]));

            const fetchAll = async (table: string) => {
                let all: any[] = [];
                let f = 0;
                while (true) {
                    const { data, error } = await supabase.from(table).select('*').range(f, f + 999);
                    if (error || !data || data.length === 0) break;
                    all = all.concat(data);
                    if (data.length < 1000) break;
                    f += 1000;
                }
                return all;
            };

            const tables: [string, string][] =
                typeFilter === 'all'
                    ? [['sh_r', 'cruise'], ['sh_c', 'car'], ['sh_cc', 'vehicle'], ['sh_p', 'airport'], ['sh_h', 'hotel'], ['sh_t', 'tour'], ['sh_rc', 'rentcar']]
                    : [[TABLE_MAP[typeFilter], typeFilter]];

            const results = await Promise.all(
                tables.map(([tbl, st]) => fetchAll(tbl).then((rows) => mapRow(rows, st, userMap)))
            );
            setItems(results.flat());
        } finally {
            setLoading(false);
        }
    }, [typeFilter]);

    useEffect(() => { loadData(); }, [loadData]);

    const today = todayYMD();

    const processedItems = useMemo(() => {
        let list = items;
        if (searchQuery.trim()) {
            const q = searchQuery.trim().toLowerCase();
            list = list.filter((item) => {
                const d = item.data;
                return (
                    (d.customerName || '').toLowerCase().includes(q) ||
                    (d.customerEnglishName || '').toLowerCase().includes(q) ||
                    (d.orderId || '').toLowerCase().includes(q) ||
                    (d.cruise || '').toLowerCase().includes(q) ||
                    (d.hotelName || '').toLowerCase().includes(q) ||
                    (d.tourName || '').toLowerCase().includes(q) ||
                    (d.airportName || '').toLowerCase().includes(q) ||
                    (d.route || '').toLowerCase().includes(q)
                );
            });
        }
        if (futureOnly) list = list.filter((item) => !item.dateKey || item.dateKey >= today);
        return list;
    }, [items, searchQuery, futureOnly, today]);

    const groupedData = useMemo((): { key: string; label: string; items: CardItem[] }[] => {
        if (groupMode === 'date') {
            const map = new Map<string, CardItem[]>();
            for (const item of processedItems) {
                const key = item.dateKey || '날짜 없음';
                if (!map.has(key)) map.set(key, []);
                map.get(key)!.push(item);
            }
            return Array.from(map.entries())
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([key, its]) => ({ key, label: key === '날짜 없음' ? '날짜 없음' : fmtDate(key), items: its }));
        } else {
            const map = new Map<string, CardItem[]>();
            for (const item of processedItems) {
                const key = item.data.customerName || item.data.orderId || '이름 없음';
                if (!map.has(key)) map.set(key, []);
                map.get(key)!.push(item);
            }
            return Array.from(map.entries())
                .sort(([a], [b]) => a.localeCompare(b, 'ko'))
                .map(([key, its]) => ({
                    key,
                    label: key,
                    items: its.slice().sort((a, b) => a.dateKey.localeCompare(b.dateKey)),
                }));
        }
    }, [processedItems, groupMode]);

    const toggleGroup = (key: string) => {
        setCollapsedGroups((prev) => {
            const n = new Set(prev);
            n.has(key) ? n.delete(key) : n.add(key);
            return n;
        });
    };

    const toggleSelect = (id: string) => {
        setSelected((prev) => {
            const n = new Set(prev);
            n.has(id) ? n.delete(id) : n.add(id);
            return n;
        });
    };

    const isGroupFullySelected = (groupItems: CardItem[]) => {
        if (groupItems.length === 0) return false;
        return groupItems.every((item) => selected.has(item._id));
    };

    const toggleSelectGroup = (groupItems: CardItem[]) => {
        setSelected((prev) => {
            const n = new Set(prev);
            const fullySelected = groupItems.length > 0 && groupItems.every((item) => n.has(item._id));
            if (fullySelected) {
                groupItems.forEach((item) => n.delete(item._id));
            } else {
                groupItems.forEach((item) => n.add(item._id));
            }
            return n;
        });
    };

    const deleteGroupItems = async (groupItems: CardItem[], groupLabel: string) => {
        if (!canDelete || groupItems.length === 0) return;
        if (!confirm(`${groupLabel} 예약자 데이터 ${groupItems.length}건을 모두 삭제하시겠습니까?`)) return;
        setDeleting(true);
        try {
            await Promise.all(
                groupItems.map((item) =>
                    item.rowId > -1
                        ? supabase.from(TABLE_MAP[item.serviceType] || 'sh_r').delete().eq('id', item.rowId)
                        : Promise.resolve({ error: { message: 'missing row id' } })
                )
            );
            const deletedIds = new Set(groupItems.map((i) => i._id));
            setItems((prev) => prev.filter((i) => !deletedIds.has(i._id)));
            setSelected((prev) => {
                const n = new Set(prev);
                groupItems.forEach((item) => n.delete(item._id));
                return n;
            });
        } finally {
            setDeleting(false);
        }
    };

    const deleteSelected = async () => {
        if (!canDelete || selected.size === 0) return;
        if (!confirm(`선택한 ${selected.size}건을 삭제하시겠습니까?`)) return;
        setDeleting(true);
        try {
            const toDelete = processedItems.filter((i) => selected.has(i._id));
            await Promise.all(
                toDelete.map((item) =>
                    item.rowId > -1
                        ? supabase.from(TABLE_MAP[item.serviceType] || 'sh_r').delete().eq('id', item.rowId)
                        : Promise.resolve({ error: { message: 'missing row id' } })
                )
            );
            const deletedIds = new Set(toDelete.map((i) => i._id));
            setItems((prev) => prev.filter((i) => !deletedIds.has(i._id)));
            setSelected(new Set());
        } finally {
            setDeleting(false);
        }
    };

    const handleDeleted = (id: string) => setItems((prev) => prev.filter((i) => i._id !== id));

    return (
        <ManagerLayout title="시트 수정" activeTab="schedule-sheet-edit">
            <div className="w-full">
                {/* ── 툴바 ── */}
                <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-3 mb-3 flex flex-wrap gap-2 items-center">
                    {/* 서비스 타입 필터 */}
                    <div className="flex gap-1 flex-wrap">
                        {(['all', 'cruise', 'car', 'vehicle', 'airport', 'hotel', 'tour', 'rentcar'] as ServiceType[]).map((t) => (
                            <button
                                key={t}
                                onClick={() => setTypeFilter(t)}
                                className={`px-2 py-1 rounded text-xs font-medium transition-colors ${typeFilter === t ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                            >
                                {t === 'all' ? '전체' : SERVICE_LABELS[t]?.label || t}
                            </button>
                        ))}
                    </div>

                    <div className="flex items-center gap-2 ml-auto flex-wrap">
                        {/* 그룹 모드 토글 */}
                        <div className="flex border border-gray-200 rounded overflow-hidden">
                            <button
                                onClick={() => setGroupMode('date')}
                                className={`px-2 py-1 text-xs font-medium transition-colors ${groupMode === 'date' ? 'bg-blue-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                            >
                                📅 일자별
                            </button>
                            <button
                                onClick={() => setGroupMode('user')}
                                className={`px-2 py-1 text-xs font-medium transition-colors border-l ${groupMode === 'user' ? 'bg-blue-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                            >
                                👤 사용자별
                            </button>
                        </div>

                        {/* 오늘 이후 필터 */}
                        <button
                            onClick={() => setFutureOnly((v) => !v)}
                            className={`px-2 py-1 rounded text-xs font-medium transition-colors ${futureOnly ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                        >
                            📆 오늘 이후만
                        </button>

                        {/* 검색 */}
                        <div className="flex gap-1">
                            <input
                                type="text"
                                placeholder="검색…"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="px-2 py-1 border border-gray-200 rounded text-xs w-36"
                            />
                            {searchQuery && (
                                <button onClick={() => setSearchQuery('')} className="px-2 text-xs bg-gray-100 rounded">✕</button>
                            )}
                        </div>

                        <button onClick={loadData} className="p-1.5 rounded bg-gray-100 hover:bg-gray-200" title="새로고침">
                            <RefreshCw className="w-4 h-4 text-gray-500" />
                        </button>
                    </div>
                </div>

                {/* ── 일괄 삭제 툴바 (권한자만) ── */}
                {canDelete && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2 mb-3 flex items-center gap-3 flex-wrap">
                        <span className="text-xs text-gray-500">전체 {processedItems.length}건 / 선택 {selected.size}건</span>
                        {selected.size > 0 && (
                            <button
                                onClick={deleteSelected}
                                disabled={deleting}
                                className="flex items-center gap-1 px-3 py-1.5 bg-red-500 text-white rounded text-xs hover:bg-red-600 disabled:opacity-50 ml-auto"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                                {deleting ? '삭제 중...' : `선택 ${selected.size}건 삭제`}
                            </button>
                        )}
                    </div>
                )}

                {/* ── 본문 ── */}
                {loading ? (
                    <div className="flex justify-center items-center h-64">
                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500" />
                    </div>
                ) : groupedData.length === 0 ? (
                    <div className="text-center text-gray-400 py-16 text-sm">데이터가 없습니다.</div>
                ) : (
                    <div className="space-y-4">
                        {groupedData.map((group) => {
                            const collapsed = collapsedGroups.has(group.key);
                            const groupFullySelected = isGroupFullySelected(group.items);
                            return (
                                <div key={group.key}>
                                    {/* 그룹 헤더 */}
                                    <div className="w-full flex items-center gap-2 mb-2">
                                        <button
                                            className="flex items-center gap-2 text-left flex-1"
                                            onClick={() => toggleGroup(group.key)}
                                        >
                                            <div className="h-px flex-1 bg-gray-200" />
                                            <span className="text-sm font-semibold text-gray-700 whitespace-nowrap">{group.label}</span>
                                            <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">{group.items.length}건</span>
                                            {collapsed ? (
                                                <ChevronDown className="w-4 h-4 text-gray-400" />
                                            ) : (
                                                <ChevronUp className="w-4 h-4 text-gray-400" />
                                            )}
                                            <div className="h-px flex-1 bg-gray-200" />
                                        </button>
                                        {canDelete && groupMode === 'user' && (
                                            <>
                                                <button
                                                    onClick={() => toggleSelectGroup(group.items)}
                                                    className="flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs hover:bg-blue-100"
                                                >
                                                    {groupFullySelected ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                                                    전체선택
                                                </button>
                                                <button
                                                    onClick={() => deleteGroupItems(group.items, group.label)}
                                                    disabled={deleting}
                                                    className="flex items-center gap-1 px-2 py-1 bg-red-500 text-white rounded text-xs hover:bg-red-600 disabled:opacity-50"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                    전체삭제
                                                </button>
                                            </>
                                        )}
                                    </div>

                                    {!collapsed && (
                                        <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                                            {group.items.map((item) => (
                                                <div key={item._id} className="relative">
                                                    {canDelete && (
                                                        <button
                                                            onClick={() => toggleSelect(item._id)}
                                                            className="absolute top-1.5 left-1.5 z-10"
                                                        >
                                                            {selected.has(item._id) ? (
                                                                <CheckSquare className="w-4 h-4 text-blue-500" />
                                                            ) : (
                                                                <Square className="w-4 h-4 text-gray-400" />
                                                            )}
                                                        </button>
                                                    )}
                                                    <div className={canDelete ? 'pl-5' : ''}>
                                                        <CardItemView item={item} onDetail={setDetailItem} />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* 상세 모달 */}
            {detailItem && (
                <DetailModal
                    item={detailItem}
                    canDelete={canDelete}
                    onClose={() => setDetailItem(null)}
                    onDeleted={handleDeleted}
                />
            )}
        </ManagerLayout>
    );
}
