'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import supabase from '@/lib/supabase';
import ManagerLayout from '../_components/MobileReservationLayout';
import ShtCarSeatMap from '@/components/ShtCarSeatMap';
import {
    Search, User, Ship, Plane, Building, Car, MapPin, Bus,
    ArrowLeft, Check, ChevronDown, ChevronUp
} from 'lucide-react';

// ═══════════════════════════════════════════
// 타입 정의
// ═══════════════════════════════════════════
interface UserInfo {
    id: string;
    name: string;
    email: string;
    phone_number: string;
}

type ServiceType = 'cruise' | 'airport' | 'hotel' | 'tour' | 'rentcar';

// 유니크 문자열 추출 헬퍼
const uniqueStrings = (data: any[], field: string): string[] =>
    (data || []).map((d: any) => String(d[field] || '')).filter((v, i, a) => v && a.indexOf(v) === i);

const SERVICE_LIST: { type: ServiceType; label: string; icon: React.ReactNode; color: string }[] = [
    { type: 'cruise', label: '크루즈', icon: <Ship className="w-6 h-6" />, color: 'blue' },
    { type: 'airport', label: '공항 서비스', icon: <Plane className="w-6 h-6" />, color: 'green' },
    { type: 'hotel', label: '호텔', icon: <Building className="w-6 h-6" />, color: 'purple' },
    { type: 'tour', label: '투어', icon: <MapPin className="w-6 h-6" />, color: 'orange' },
    { type: 'rentcar', label: '렌터카', icon: <Car className="w-6 h-6" />, color: 'red' },
];

// ═══════════════════════════════════════════
// 공항 서비스 폼
// ═══════════════════════════════════════════
function AirportForm({ userId, quoteId, onComplete }: { userId: string; quoteId?: string; onComplete: () => void }) {
    const [form, setForm] = useState({
        serviceType: 'pickup' as 'pickup' | 'sending' | 'both',
        category1: '', route1: '', vehicleType1: '', airportCode1: '',
        category2: '', route2: '', vehicleType2: '', airportCode2: '',
        airportLocation1: '', airportLocation2: '',
        pickupLocation: '', pickupDatetime: '', pickupFlightNumber: '',
        sendingLocation: '', sendingDatetime: '',
        passengerCount: 1, luggageCount: 0,
    });

    const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
    const [routeOptions1, setRouteOptions1] = useState<string[]>([]);
    const [vehicleTypeOptions1, setVehicleTypeOptions1] = useState<string[]>([]);
    const [routeOptions2, setRouteOptions2] = useState<string[]>([]);
    const [vehicleTypeOptions2, setVehicleTypeOptions2] = useState<string[]>([]);
    const [price1, setPrice1] = useState<number | null>(null);
    const [price2, setPrice2] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        loadCategoryOptions();
    }, []);

    useEffect(() => {
        if (form.serviceType === 'pickup') setForm(p => ({ ...p, category1: '픽업', category2: '' }));
        else if (form.serviceType === 'sending') setForm(p => ({ ...p, category1: '샌딩', category2: '' }));
        else setForm(p => ({ ...p, category1: '픽업', category2: '샌딩' }));
    }, [form.serviceType]);

    useEffect(() => { if (form.category1) loadRouteOptions(form.category1, 1); else setRouteOptions1([]); }, [form.category1]);
    useEffect(() => { if (form.category1 && form.route1) loadVehicleTypeOptions(form.category1, form.route1, 1); else setVehicleTypeOptions1([]); }, [form.category1, form.route1]);
    useEffect(() => { if (form.category1 && form.route1 && form.vehicleType1) getAirportCode(form.category1, form.route1, form.vehicleType1, 1); }, [form.category1, form.route1, form.vehicleType1]);
    useEffect(() => { if (form.category2) loadRouteOptions(form.category2, 2); else setRouteOptions2([]); }, [form.category2]);
    useEffect(() => { if (form.category2 && form.route2) loadVehicleTypeOptions(form.category2, form.route2, 2); else setVehicleTypeOptions2([]); }, [form.category2, form.route2]);
    useEffect(() => { if (form.category2 && form.route2 && form.vehicleType2) getAirportCode(form.category2, form.route2, form.vehicleType2, 2); }, [form.category2, form.route2, form.vehicleType2]);

    const loadCategoryOptions = async () => {
        const { data } = await supabase.from('airport_price').select('service_type').order('service_type');
        setCategoryOptions(uniqueStrings(data || [], 'service_type'));
    };

    const loadRouteOptions = async (category: string, num: number) => {
        const { data } = await supabase.from('airport_price').select('route').eq('service_type', category).order('route');
        const routes = uniqueStrings(data || [], 'route');
        num === 1 ? setRouteOptions1(routes) : setRouteOptions2(routes);
    };

    const loadVehicleTypeOptions = async (category: string, route: string, num: number) => {
        const { data } = await supabase.from('airport_price').select('vehicle_type').eq('service_type', category).eq('route', route).order('vehicle_type');
        const types = uniqueStrings(data || [], 'vehicle_type');
        num === 1 ? setVehicleTypeOptions1(types) : setVehicleTypeOptions2(types);
    };

    const getAirportCode = async (category: string, route: string, vehicleType: string, num: number) => {
        const { data } = await supabase
            .from('airport_price')
            .select('airport_code, price, route_from, route_to')
            .eq('service_type', category)
            .eq('route', route)
            .eq('vehicle_type', vehicleType)
            .single();

        const airportLocation = String(
            category === '샌딩' ? (data?.route_to || '') : (data?.route_from || '')
        ).trim();

        if (num === 1) {
            setForm(p => ({ ...p, airportCode1: data?.airport_code || '', airportLocation1: airportLocation }));
            setPrice1(data?.price || null);
        } else {
            setForm(p => ({ ...p, airportCode2: data?.airport_code || '', airportLocation2: airportLocation }));
            setPrice2(data?.price || null);
        }
    };

    const handleSubmit = async () => {
        if (!form.airportCode1) { alert('서비스를 선택해주세요.'); return; }
        if (form.serviceType === 'both' && !form.airportCode2) { alert('샌딩 서비스를 선택해주세요.'); return; }
        if (!form.pickupLocation && !form.sendingLocation) { alert('위치를 입력해주세요.'); return; }
        if ((form.serviceType === 'pickup' || form.serviceType === 'both') && !form.pickupDatetime) { alert('항공편 도착 일시를 입력해주세요.'); return; }
        if ((form.serviceType === 'sending' || form.serviceType === 'both') && !form.sendingDatetime) { alert('승차 시간을 입력해주세요.'); return; }

        setLoading(true);
        try {
            const { data: newReservation, error: resError } = await supabase.from('reservation').insert({
                re_user_id: userId, re_type: 'airport', re_status: 'pending', re_quote_id: quoteId || null, re_created_at: new Date().toISOString()
            }).select().single();
            if (resError) throw resError;

            const insertDetail = async (
                code: string,
                airportLocation: string,
                location: string,
                flightNum: string,
                datetime: string,
                wayType: string,
                price: number
            ) => {
                await supabase.from('reservation_airport').insert({
                    reservation_id: newReservation.re_id, airport_price_code: code,
                    ra_airport_location: airportLocation,
                    accommodation_info: location,
                    ra_flight_number: flightNum,
                    ra_datetime: datetime ? new Date(datetime).toISOString() : null,
                    ra_passenger_count: form.passengerCount, ra_luggage_count: form.luggageCount,
                    way_type: wayType, ra_car_count: 1, unit_price: price, total_price: price
                });
            };

            if (form.serviceType === 'pickup' || form.serviceType === 'both') {
                await insertDetail(
                    form.airportCode1,
                    form.airportLocation1,
                    form.pickupLocation,
                    form.pickupFlightNumber,
                    form.pickupDatetime,
                    'pickup',
                    price1 || 0
                );
            }
            if (form.serviceType === 'sending') {
                await insertDetail(
                    form.airportCode1,
                    form.airportLocation1,
                    form.sendingLocation,
                    '',
                    form.sendingDatetime,
                    'sending',
                    price1 || 0
                );
            }
            if (form.serviceType === 'both' && form.airportCode2) {
                await insertDetail(
                    form.airportCode2,
                    form.airportLocation2,
                    form.sendingLocation,
                    '',
                    form.sendingDatetime,
                    'sending',
                    price2 || 0
                );
            }

            alert('공항 서비스 예약이 생성되었습니다!');
            onComplete();
        } catch (error: any) {
            alert('오류: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const renderServiceSelect = (num: number) => {
        const routes = num === 1 ? routeOptions1 : routeOptions2;
        const vehicleTypes = num === 1 ? vehicleTypeOptions1 : vehicleTypeOptions2;
        const price = num === 1 ? price1 : price2;
        const prefix = num === 1 ? '서비스 1' : '서비스 2';
        const cat = num === 1 ? form.category1 : form.category2;
        const rt = num === 1 ? form.route1 : form.route2;
        const vt = num === 1 ? form.vehicleType1 : form.vehicleType2;

        return (
            <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                <h4 className="font-medium text-gray-700">{prefix} ({cat || '-'})</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                        <label className="text-xs text-gray-700">경로</label>
                        <select value={rt} onChange={e => setForm(p => ({ ...p, [num === 1 ? 'route1' : 'route2']: e.target.value }))}
                            className="w-full px-3 py-2 border rounded-lg text-sm">
                            <option value="">선택</option>
                            {routes.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="text-xs text-gray-700">차량 타입</label>
                        <select value={vt} onChange={e => setForm(p => ({ ...p, [num === 1 ? 'vehicleType1' : 'vehicleType2']: e.target.value }))}
                            className="w-full px-3 py-2 border rounded-lg text-sm">
                            <option value="">선택</option>
                            {vehicleTypes.map(v => <option key={v} value={v}>{v}</option>)}
                        </select>
                    </div>
                </div>
                {price !== null && <div className="text-sm text-blue-600 font-medium">가격: {price.toLocaleString()}동</div>}
            </div>
        );
    };

    return (
        <div className="space-y-4">
            <div>
                <label className="text-sm font-medium text-gray-700">서비스 타입</label>
                <div className="flex gap-2 mt-1">
                    {[{ v: 'pickup', l: '픽업만' }, { v: 'sending', l: '샌딩만' }, { v: 'both', l: '픽업+샌딩' }].map(o => (
                        <button key={o.v} onClick={() => setForm(p => ({ ...p, serviceType: o.v as any }))}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${form.serviceType === o.v ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                            {o.l}
                        </button>
                    ))}
                </div>
            </div>

            {renderServiceSelect(1)}
            {form.serviceType === 'both' && renderServiceSelect(2)}

            {(form.serviceType === 'pickup' || form.serviceType === 'both') && (
                <div className="space-y-3 bg-blue-50 rounded-lg p-4">
                    <h4 className="font-medium text-blue-800">픽업 정보</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                            <label className="text-xs text-gray-700">하차 위치 (영문)</label>
                            <input type="text" value={form.pickupLocation} onChange={e => setForm(p => ({ ...p, pickupLocation: e.target.value }))}
                                className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Hotel name in English" />
                        </div>
                        <div>
                            <label className="text-xs text-gray-700">항공편 도착 일시</label>
                            <input type="datetime-local" value={form.pickupDatetime} onChange={e => setForm(p => ({ ...p, pickupDatetime: e.target.value }))}
                                className="w-full px-3 py-2 border rounded-lg text-sm" />
                        </div>
                        <div>
                            <label className="text-xs text-gray-700">항공편명</label>
                            <input type="text" value={form.pickupFlightNumber} onChange={e => setForm(p => ({ ...p, pickupFlightNumber: e.target.value }))}
                                className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="예: VN123" />
                        </div>
                    </div>
                </div>
            )}

            {(form.serviceType === 'sending' || form.serviceType === 'both') && (
                <div className="space-y-3 bg-green-50 rounded-lg p-4">
                    <h4 className="font-medium text-green-800">샌딩 정보</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs text-gray-700">승차 위치 (영문)</label>
                            <input type="text" value={form.sendingLocation} onChange={e => setForm(p => ({ ...p, sendingLocation: e.target.value }))}
                                className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Hotel name in English" />
                        </div>
                        <div>
                            <label className="text-xs text-gray-700">승차 시간</label>
                            <input type="datetime-local" value={form.sendingDatetime} onChange={e => setForm(p => ({ ...p, sendingDatetime: e.target.value }))}
                                className="w-full px-3 py-2 border rounded-lg text-sm" />
                        </div>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="text-xs text-gray-700">승객 수</label>
                    <input type="number" min={1} value={form.passengerCount} onChange={e => setForm(p => ({ ...p, passengerCount: Number(e.target.value) }))}
                        className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                    <label className="text-xs text-gray-700">수하물 개수</label>
                    <input type="number" min={0} value={form.luggageCount} onChange={e => setForm(p => ({ ...p, luggageCount: Number(e.target.value) }))}
                        className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
            </div>

            {(price1 !== null || price2 !== null) && (
                <div className="bg-yellow-50 rounded-lg p-4">
                    <div className="text-lg font-bold text-red-600">
                        예상 총 금액: {((price1 || 0) + (price2 || 0)).toLocaleString()}동
                    </div>
                </div>
            )}

            <button onClick={handleSubmit} disabled={loading}
                className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
                {loading ? '처리 중...' : '공항 서비스 예약 생성'}
            </button>
        </div>
    );
}

// ═══════════════════════════════════════════
// 호텔 서비스 폼
// ═══════════════════════════════════════════
function HotelForm({ userId, quoteId, onComplete }: { userId: string; quoteId?: string; onComplete: () => void }) {
    const [loading, setLoading] = useState(false);
    const [hotelCardsData, setHotelCardsData] = useState<any[]>([]);
    const [roomCardsData, setRoomCardsData] = useState<any[]>([]);
    const [selectedHotelName, setSelectedHotelName] = useState('');
    const [selectedHotel, setSelectedHotel] = useState<any>(null);

    const [formData, setFormData] = useState({
        checkin_date: '', checkout_date: '',
        room_count: '1', adult_count: '2', child_count: '0',
        special_requests: ''
    });

    const calculateNights = (checkin: string, checkout: string) => {
        if (!checkin || !checkout) return 0;
        const diff = new Date(checkout).getTime() - new Date(checkin).getTime();
        return Math.max(Math.ceil(diff / (1000 * 60 * 60 * 24)), 0);
    };

    useEffect(() => {
        if (formData.checkin_date && formData.checkout_date) loadHotels();
        else { setHotelCardsData([]); setRoomCardsData([]); setSelectedHotelName(''); }
    }, [formData.checkin_date, formData.checkout_date]);

    useEffect(() => {
        if (selectedHotelName && formData.checkin_date) loadRooms(selectedHotelName);
        else { setRoomCardsData([]); setSelectedHotel(null); }
    }, [selectedHotelName, formData.checkin_date, formData.checkout_date]);

    const loadHotels = async () => {
        const { data: priceData } = await supabase.from('hotel_price').select('hotel_code')
            .lte('start_date', formData.checkin_date).gte('end_date', formData.checkin_date);
        const codes = [...new Set((priceData || []).map((p: any) => p.hotel_code))];
        if (codes.length === 0) { setHotelCardsData([]); return; }
        const { data: hotels } = await supabase.from('hotel_info').select('*').in('hotel_code', codes).eq('active', true).order('hotel_name');
        setHotelCardsData(hotels || []);
    };

    const loadRooms = async (hotelName: string) => {
        const hotelInfo = hotelCardsData.find((h: any) => h.hotel_name === hotelName);
        if (!hotelInfo) { setRoomCardsData([]); return; }
        const { data: priceRows } = await supabase.from('hotel_price').select('*')
            .eq('hotel_code', hotelInfo.hotel_code)
            .lte('start_date', formData.checkin_date).gte('end_date', formData.checkin_date).order('base_price');

        const dayOfWeek = new Date(formData.checkin_date).getDay();
        const isWeekend = dayOfWeek === 5 || dayOfWeek === 6;
        const filtered = (priceRows || []).filter((p: any) => {
            if (p.weekday_type === 'ALL') return true;
            if (isWeekend && p.weekday_type === 'WEEKEND') return true;
            if (!isWeekend && p.weekday_type === 'WEEKDAY') return true;
            return false;
        });

        const roomMap = new Map();
        filtered.forEach((p: any) => {
            const existing = roomMap.get(p.room_type);
            if (!existing || (p.weekday_type !== 'ALL' && existing.weekday_type === 'ALL')) roomMap.set(p.room_type, p);
        });
        setRoomCardsData(Array.from(roomMap.values()));
    };

    const handleSubmit = async () => {
        if (!formData.checkin_date || !formData.checkout_date) { alert('날짜를 선택해주세요.'); return; }
        if (!selectedHotel) { alert('호텔 객실을 선택해주세요.'); return; }

        setLoading(true);
        try {
            const nights = calculateNights(formData.checkin_date, formData.checkout_date);
            const schedule = `${nights}박${nights + 1}일`;
            const unitPrice = parseFloat(selectedHotel.base_price || '0');
            const totalPrice = unitPrice * Number(formData.room_count) * nights;
            const totalGuests = Number(formData.adult_count) + Number(formData.child_count);

            const { data: res, error: resError } = await supabase.from('reservation').insert({
                re_user_id: userId, re_type: 'hotel', re_status: 'pending', re_quote_id: quoteId || null, total_amount: totalPrice
            }).select().single();
            if (resError) throw resError;

            const { error: hotelError } = await supabase.from('reservation_hotel').insert({
                reservation_id: res.re_id, hotel_price_code: selectedHotel.hotel_price_code,
                schedule, room_count: formData.room_count, guest_count: totalGuests,
                checkin_date: formData.checkin_date, unit_price: unitPrice, total_price: totalPrice,
                request_note: formData.special_requests || null
            });
            if (hotelError) throw hotelError;

            alert('호텔 예약이 생성되었습니다!');
            onComplete();
        } catch (error: any) {
            alert('오류: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const nights = calculateNights(formData.checkin_date, formData.checkout_date);

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                    <label className="text-sm font-medium text-gray-700">체크인</label>
                    <input type="date" value={formData.checkin_date} onChange={e => setFormData(p => ({ ...p, checkin_date: e.target.value }))}
                        className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                    <label className="text-sm font-medium text-gray-700">체크아웃</label>
                    <input type="date" value={formData.checkout_date} onChange={e => setFormData(p => ({ ...p, checkout_date: e.target.value }))}
                        className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
            </div>

            {nights > 0 && <div className="text-sm text-blue-600 font-medium">📅 {nights}박 {nights + 1}일</div>}

            {hotelCardsData.length > 0 && (
                <div>
                    <label className="text-sm font-medium text-gray-700">호텔 선택</label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                        {hotelCardsData.map((hotel: any) => (
                            <div key={hotel.hotel_code} onClick={() => { setSelectedHotelName(hotel.hotel_name); setSelectedHotel(null); }}
                                className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${selectedHotelName === hotel.hotel_name ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-300'}`}>
                                <div className="font-medium">{hotel.hotel_name}</div>
                                {hotel.location && <div className="text-xs text-gray-500 mt-1">{hotel.location}</div>}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {roomCardsData.length > 0 && (
                <div>
                    <label className="text-sm font-medium text-gray-700">객실 선택</label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                        {roomCardsData.map((room: any) => (
                            <div key={room.hotel_price_code} onClick={() => setSelectedHotel(room)}
                                className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${selectedHotel?.hotel_price_code === room.hotel_price_code ? 'border-purple-500 bg-purple-50' : 'border-gray-200 hover:border-purple-300'}`}>
                                <div className="flex justify-between items-start">
                                    <div>
                                        <div className="font-medium">{room.room_name || room.room_type}</div>
                                        {room.room_category && <div className="text-xs text-gray-500">{room.room_category}</div>}
                                    </div>
                                    <div className="text-blue-600 font-bold text-sm">{Number(room.base_price || 0).toLocaleString()}동</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="grid grid-cols-3 gap-3">
                <div>
                    <label className="text-xs text-gray-700">객실 수</label>
                    <input type="number" min={1} value={formData.room_count}
                        onChange={e => setFormData(p => ({ ...p, room_count: e.target.value }))}
                        className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                    <label className="text-xs text-gray-700">성인 수</label>
                    <input type="number" min={1} value={formData.adult_count}
                        onChange={e => setFormData(p => ({ ...p, adult_count: e.target.value }))}
                        className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                    <label className="text-xs text-gray-700">아동 수</label>
                    <input type="number" min={0} value={formData.child_count}
                        onChange={e => setFormData(p => ({ ...p, child_count: e.target.value }))}
                        className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
            </div>

            <div>
                <label className="text-xs text-gray-700">특별 요청사항</label>
                <textarea value={formData.special_requests} onChange={e => setFormData(p => ({ ...p, special_requests: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg text-sm" rows={3} placeholder="요청사항을 입력해주세요" />
            </div>

            {selectedHotel && nights > 0 && (
                <div className="bg-yellow-50 rounded-lg p-4">
                    <div className="text-lg font-bold text-red-600">
                        예상 총 금액: {(Number(selectedHotel.base_price || 0) * Number(formData.room_count) * nights).toLocaleString()}동
                    </div>
                </div>
            )}

            <button onClick={handleSubmit} disabled={loading}
                className="w-full py-3 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 disabled:opacity-50 transition-colors">
                {loading ? '처리 중...' : '호텔 예약 생성'}
            </button>
        </div>
    );
}

// ═══════════════════════════════════════════
// 투어 서비스 폼
// ═══════════════════════════════════════════
function TourForm({ userId, quoteId, onComplete }: { userId: string; quoteId?: string; onComplete: () => void }) {
    const [loading, setLoading] = useState(false);
    const [tours, setTours] = useState<any[]>([]);
    const [pricingData, setPricingData] = useState<any[]>([]);
    const [selectedTourId, setSelectedTourId] = useState('');
    const [selectedPricingId, setSelectedPricingId] = useState('');
    const [guestCount, setGuestCount] = useState(1);

    const [formData, setFormData] = useState({
        tour_date: '', pickup_location: '', dropoff_location: '', special_requests: ''
    });

    useEffect(() => { loadTours(); }, []);

    useEffect(() => {
        if (selectedTourId) loadTourDetails(selectedTourId);
    }, [selectedTourId]);

    const loadTours = async () => {
        const { data } = await supabase.from('tour').select('tour_id, tour_code, tour_name, category, duration, location, description')
            .eq('is_active', true).neq('is_cruise_addon', true).order('category').order('tour_name');
        setTours(data || []);
    };

    const loadTourDetails = async (tourId: string) => {
        const { data } = await supabase.from('tour_pricing').select('*').eq('tour_id', tourId).order('min_guests');
        const list = data || [];
        setPricingData(list);
        setSelectedPricingId('');
    };

    const getSelectedPricing = () => {
        if (!pricingData.length) return null;
        const selected = pricingData.find(p => p.pricing_id === selectedPricingId);
        if (selected) return selected;
        return pricingData.find(p => guestCount >= p.min_guests && guestCount <= p.max_guests) || null;
    };

    const getPrice = () => {
        const pricing = getSelectedPricing();
        return pricing?.price_per_person || 0;
    };

    const handleSubmit = async () => {
        if (!selectedTourId) { alert('투어를 선택해주세요.'); return; }
        if (!formData.tour_date) { alert('투어 날짜를 선택해주세요.'); return; }
        if (!selectedPricingId) { alert('인원별 가격을 선택해주세요.'); return; }

        setLoading(true);
        try {
            const tour = tours.find(t => t.tour_id === selectedTourId);
            const selectedPricing = pricingData.find(p => p.pricing_id === selectedPricingId);
            const pricePerPerson = Number(selectedPricing?.price_per_person || 0);
            const totalPrice = pricePerPerson * guestCount;

            const { data: res, error: resError } = await supabase.from('reservation').insert({
                re_user_id: userId, re_type: 'tour', re_status: 'pending', re_quote_id: quoteId || null, total_amount: totalPrice
            }).select().single();
            if (resError) throw resError;

            const { error: tourError } = await supabase.from('reservation_tour').insert({
                reservation_id: res.re_id, tour_price_code: selectedPricing?.pricing_id || '',
                usage_date: formData.tour_date, tour_capacity: guestCount,
                pickup_location: formData.pickup_location, dropoff_location: formData.dropoff_location,
                unit_price: pricePerPerson, total_price: totalPrice,
                request_note: formData.special_requests || null
            });
            if (tourError) throw tourError;

            alert('투어 예약이 생성되었습니다!');
            onComplete();
        } catch (error: any) {
            alert('오류: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-4">
            <div>
                <label className="text-sm font-medium text-gray-700">투어 선택</label>
                <div className="grid grid-cols-1 gap-3 mt-2">
                    {tours.map(tour => (
                        <div key={tour.tour_id} onClick={() => setSelectedTourId(tour.tour_id)}
                            className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${selectedTourId === tour.tour_id ? 'border-orange-500 bg-orange-50' : 'border-gray-200 hover:border-orange-300'}`}>
                            <div className="font-medium">{tour.tour_name}</div>
                            <div className="text-xs text-gray-500 mt-1">{tour.category} · {tour.duration} · {tour.location}</div>
                            {tour.description && <div className="text-xs text-gray-400 mt-1 line-clamp-2">{tour.description}</div>}
                        </div>
                    ))}
                </div>
            </div>

            {pricingData.length > 0 && (
                <div>
                    <label className="text-sm font-medium text-gray-700">인원별 가격</label>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
                        {pricingData.map(p => (
                            <button
                                type="button"
                                key={p.pricing_id}
                                onClick={() => setSelectedPricingId(p.pricing_id)}
                                className={`p-3 rounded-lg border text-center text-sm transition-colors ${selectedPricingId === p.pricing_id
                                    ? 'bg-orange-50 border-orange-400'
                                    : guestCount >= p.min_guests && guestCount <= p.max_guests
                                        ? 'bg-orange-50/60 border-orange-200 hover:border-orange-300'
                                        : 'border-gray-200 hover:border-orange-300'
                                    }`}
                            >
                                <div className="text-gray-600">{p.min_guests}~{p.max_guests}명</div>
                                <div className="font-bold text-orange-600">{Number(p.price_per_person || 0).toLocaleString()}동</div>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                    <label className="text-xs text-gray-700">투어 날짜</label>
                    <input type="date" value={formData.tour_date} onChange={e => setFormData(p => ({ ...p, tour_date: e.target.value }))}
                        className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                    <label className="text-xs text-gray-700">인원 수</label>
                    <input type="number" min={1} value={guestCount} onChange={e => setGuestCount(Number(e.target.value))}
                        className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                    <label className="text-xs text-gray-700">픽업 장소</label>
                    <input type="text" value={formData.pickup_location} onChange={e => setFormData(p => ({ ...p, pickup_location: e.target.value }))}
                        className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="예: 호텔 로비" />
                </div>
                <div>
                    <label className="text-xs text-gray-700">하차 장소</label>
                    <input type="text" value={formData.dropoff_location} onChange={e => setFormData(p => ({ ...p, dropoff_location: e.target.value }))}
                        className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="예: 호텔 로비" />
                </div>
            </div>

            <div>
                <label className="text-xs text-gray-700">특별 요청사항</label>
                <textarea value={formData.special_requests} onChange={e => setFormData(p => ({ ...p, special_requests: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg text-sm" rows={3} />
            </div>

            {selectedTourId && (
                <div className="bg-yellow-50 rounded-lg p-4">
                    <div className="text-lg font-bold text-red-600">
                        예상 총 금액: {(getPrice() * guestCount).toLocaleString()}동 ({guestCount}명 × {getPrice().toLocaleString()}동)
                    </div>
                </div>
            )}

            <button onClick={handleSubmit} disabled={loading}
                className="w-full py-3 bg-orange-600 text-white rounded-lg font-medium hover:bg-orange-700 disabled:opacity-50 transition-colors">
                {loading ? '처리 중...' : '투어 예약 생성'}
            </button>
        </div>
    );
}

// ═══════════════════════════════════════════
// 렌터카 서비스 폼
// ═══════════════════════════════════════════
function RentcarForm({ userId, quoteId, onComplete }: { userId: string; quoteId?: string; onComplete: () => void }) {
    const [loading, setLoading] = useState(false);
    const WAY_TYPE_OPTIONS = ['편도', '당일왕복', '다른날왕복', '시내당일렌트'];
    const ROUND_TRIP_TYPES = ['당일왕복', '다른날왕복'];

    const [form, setForm] = useState({
        wayType: '', route: '', carType: '', rentcarCode: '',
        pickup_datetime: '', pickup_location: '', destination: '',
        via_location: '', via_waiting: '',
        return_datetime: '', return_pickup_location: '', return_destination: '',
        return_via_location: '', return_via_waiting: '',
        passenger_count: 1, car_count: 1, luggage_count: 0,
        request_note: '',
    });

    const [routeOptions, setRouteOptions] = useState<string[]>([]);
    const [carTypeOptions, setCarTypeOptions] = useState<string[]>([]);
    const [price, setPrice] = useState<number | null>(null);

    useEffect(() => { if (form.wayType) loadRoutes(form.wayType); else setRouteOptions([]); }, [form.wayType]);
    useEffect(() => { if (form.wayType && form.route) loadCarTypes(form.wayType, form.route); else setCarTypeOptions([]); }, [form.wayType, form.route]);
    useEffect(() => { if (form.wayType && form.route && form.carType) getRentcarCode(form.wayType, form.route, form.carType); }, [form.wayType, form.route, form.carType]);

    const loadRoutes = async (wayType: string) => {
        const { data } = await supabase.from('rentcar_price').select('route').eq('way_type', wayType).eq('car_category_code', '렌트카').order('route');
        setRouteOptions(uniqueStrings(data || [], 'route'));
    };

    const loadCarTypes = async (wayType: string, route: string) => {
        const { data } = await supabase.from('rentcar_price').select('vehicle_type').eq('way_type', wayType).eq('route', route).eq('car_category_code', '렌트카').order('vehicle_type');
        setCarTypeOptions(uniqueStrings(data || [], 'vehicle_type'));
    };

    const getRentcarCode = async (wayType: string, route: string, carType: string) => {
        const { data } = await supabase.from('rentcar_price').select('rent_code, price').eq('way_type', wayType).eq('route', route).eq('vehicle_type', carType).eq('car_category_code', '렌트카').single();
        setForm(p => ({ ...p, rentcarCode: data?.rent_code || '' }));
        setPrice(data?.price || null);
    };

    const isRoundTrip = ROUND_TRIP_TYPES.includes(form.wayType);

    const handleSubmit = async () => {
        if (!form.rentcarCode) { alert('렌터카를 선택해주세요.'); return; }
        if (!form.pickup_datetime) { alert('픽업 일시를 입력해주세요.'); return; }

        setLoading(true);
        try {
            const totalPrice = (price || 0) * form.car_count;

            const { data: res, error: resError } = await supabase.from('reservation').insert({
                re_user_id: userId, re_type: 'rentcar', re_status: 'pending', re_quote_id: quoteId || null, total_amount: totalPrice
            }).select().single();
            if (resError) throw resError;

            const { error: rentcarError } = await supabase.from('reservation_rentcar').insert({
                reservation_id: res.re_id, rentcar_price_code: form.rentcarCode,
                way_type: form.wayType, pickup_datetime: new Date(form.pickup_datetime).toISOString(),
                pickup_location: form.pickup_location, destination: form.destination,
                via_location: form.via_location || null, via_waiting: form.via_waiting || null,
                return_datetime: form.return_datetime ? new Date(form.return_datetime).toISOString() : null,
                return_pickup_location: form.return_pickup_location || null,
                return_destination: form.return_destination || null,
                return_via_location: form.return_via_location || null,
                return_via_waiting: form.return_via_waiting || null,
                car_count: form.car_count, passenger_count: form.passenger_count,
                unit_price: price || 0, total_price: totalPrice,
                request_note: form.request_note || null
            });
            if (rentcarError) throw rentcarError;

            alert('렌터카 예약이 생성되었습니다!');
            onComplete();
        } catch (error: any) {
            alert('오류: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-4">
            <div>
                <label className="text-sm font-medium text-gray-700">이용 방식</label>
                <div className="flex flex-wrap gap-2 mt-1">
                    {WAY_TYPE_OPTIONS.map(w => (
                        <button key={w} onClick={() => setForm(p => ({ ...p, wayType: w, route: '', carType: '', rentcarCode: '' }))}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${form.wayType === w ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                            {w}
                        </button>
                    ))}
                </div>
            </div>

            {form.wayType && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                        <label className="text-xs text-gray-700">경로</label>
                        <select value={form.route} onChange={e => setForm(p => ({ ...p, route: e.target.value, carType: '', rentcarCode: '' }))}
                            className="w-full px-3 py-2 border rounded-lg text-sm">
                            <option value="">선택</option>
                            {routeOptions.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="text-xs text-gray-700">차량 타입</label>
                        <select value={form.carType} onChange={e => setForm(p => ({ ...p, carType: e.target.value }))}
                            className="w-full px-3 py-2 border rounded-lg text-sm">
                            <option value="">선택</option>
                            {carTypeOptions.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>
                </div>
            )}

            {price !== null && <div className="text-sm text-red-600 font-medium">차량 가격: {price.toLocaleString()}동</div>}

            <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                <h4 className="font-medium text-gray-700">가는편 (픽업)</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                        <label className="text-xs text-gray-700">픽업 일시</label>
                        <input type="datetime-local" value={form.pickup_datetime} onChange={e => setForm(p => ({ ...p, pickup_datetime: e.target.value }))}
                            className="w-full px-3 py-2 border rounded-lg text-sm" />
                    </div>
                    <div>
                        <label className="text-xs text-gray-700">출발지</label>
                        <input type="text" value={form.pickup_location} onChange={e => setForm(p => ({ ...p, pickup_location: e.target.value }))}
                            className="w-full px-3 py-2 border rounded-lg text-sm" />
                    </div>
                    <div>
                        <label className="text-xs text-gray-700">목적지</label>
                        <input type="text" value={form.destination} onChange={e => setForm(p => ({ ...p, destination: e.target.value }))}
                            className="w-full px-3 py-2 border rounded-lg text-sm" />
                    </div>
                    <div>
                        <label className="text-xs text-gray-700">경유지</label>
                        <input type="text" value={form.via_location} onChange={e => setForm(p => ({ ...p, via_location: e.target.value }))}
                            className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="없으면 비워두세요" />
                    </div>
                </div>
            </div>

            {isRoundTrip && (
                <div className="bg-green-50 rounded-lg p-4 space-y-3">
                    <h4 className="font-medium text-green-700">오는편 (샌딩)</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs text-gray-700">샌딩 일시</label>
                            <input type="datetime-local" value={form.return_datetime} onChange={e => setForm(p => ({ ...p, return_datetime: e.target.value }))}
                                className="w-full px-3 py-2 border rounded-lg text-sm" />
                        </div>
                        <div>
                            <label className="text-xs text-gray-700">출발지</label>
                            <input type="text" value={form.return_pickup_location} onChange={e => setForm(p => ({ ...p, return_pickup_location: e.target.value }))}
                                className="w-full px-3 py-2 border rounded-lg text-sm" />
                        </div>
                        <div>
                            <label className="text-xs text-gray-700">목적지</label>
                            <input type="text" value={form.return_destination} onChange={e => setForm(p => ({ ...p, return_destination: e.target.value }))}
                                className="w-full px-3 py-2 border rounded-lg text-sm" />
                        </div>
                        <div>
                            <label className="text-xs text-gray-700">경유지</label>
                            <input type="text" value={form.return_via_location} onChange={e => setForm(p => ({ ...p, return_via_location: e.target.value }))}
                                className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="없으면 비워두세요" />
                        </div>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-3 gap-3">
                <div>
                    <label className="text-xs text-gray-700">승객 수</label>
                    <input type="number" min={1} value={form.passenger_count} onChange={e => setForm(p => ({ ...p, passenger_count: Number(e.target.value) }))}
                        className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                    <label className="text-xs text-gray-700">차량 수</label>
                    <input type="number" min={1} value={form.car_count} onChange={e => setForm(p => ({ ...p, car_count: Number(e.target.value) }))}
                        className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                    <label className="text-xs text-gray-700">짐 개수</label>
                    <input type="number" min={0} value={form.luggage_count} onChange={e => setForm(p => ({ ...p, luggage_count: Number(e.target.value) }))}
                        className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
            </div>

            <div>
                <label className="text-xs text-gray-700">요청사항</label>
                <textarea value={form.request_note} onChange={e => setForm(p => ({ ...p, request_note: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg text-sm" rows={3} />
            </div>

            {price !== null && (
                <div className="bg-yellow-50 rounded-lg p-4">
                    <div className="text-lg font-bold text-red-600">
                        예상 총 금액: {((price || 0) * form.car_count).toLocaleString()}동 ({form.car_count}대)
                    </div>
                </div>
            )}

            <button onClick={handleSubmit} disabled={loading}
                className="w-full py-3 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50 transition-colors">
                {loading ? '처리 중...' : '렌터카 예약 생성'}
            </button>
        </div>
    );
}

// ═══════════════════════════════════════════
// 크루즈 서비스 폼
// ═══════════════════════════════════════════
function CruiseForm({ userId, quoteId, onComplete }: { userId: string; quoteId?: string; onComplete: () => void }) {
    const [loading, setLoading] = useState(false);
    const scheduleOptions = ['1박2일', '2박3일', '당일'];
    const carCategoryHardcoded = ['편도', '당일왕복', '다른날왕복'];

    const [form, setForm] = useState({
        checkin: '', schedule: '', cruise_name: '', room_type: '',
        adult_count: 2, child_count: 0, child_older_count: 0, infant_count: 0, extra_bed_count: 0,
        single_count: 0, room_count: 1,
        pickup_location: '', dropoff_location: '',
        request_note: '',
    });

    const [cruiseOptions, setCruiseOptions] = useState<string[]>([]);
    const [roomTypeCards, setRoomTypeCards] = useState<any[]>([]);
    const [selectedRateCardId, setSelectedRateCardId] = useState('');
    const [selectedCard, setSelectedCard] = useState<any>(null);

    // 차량 상태
    const [carCategoryOptions, setCarCategoryOptions] = useState<string[]>([]);
    const [carRouteOptions, setCarRouteOptions] = useState<string[]>([]);
    const [carTypeOptions, setCarTypeOptions] = useState<string[]>([]);
    const [vehicleForm, setVehicleForm] = useState({
        car_category: '', route: '', car_type: '', car_code: '', count: 1
    });
    const [carPrice, setCarPrice] = useState<number | null>(null);
    const [isShtSeatModalOpen, setIsShtSeatModalOpen] = useState(false);
    const [selectedShtSeat, setSelectedShtSeat] = useState<{ vehicle: string; seat: string; category: string } | null>(null);

    const isCommonCruise = (value?: string | null) => {
        const v = String(value || '').trim();
        return !v || v === '공통' || v.toLowerCase() === 'common';
    };

    const matchCruiseOrCommon = (value?: string | null, cruiseName?: string) => {
        if (isCommonCruise(value)) return true;
        return String(value || '').trim() === String(cruiseName || '').trim();
    };

    const isRateValidForCheckin = (checkin: string, startDate?: string, endDate?: string) => {
        if (!checkin) return true;
        if (!startDate && !endDate) return true;

        const target = checkin.slice(0, 10);
        const start = startDate ? String(startDate).slice(0, 10) : '';
        const end = endDate ? String(endDate).slice(0, 10) : '';

        if (start && target < start) return false;
        if (end && target > end) return false;
        return true;
    };

    useEffect(() => { if (form.schedule) loadCruiseOptions(); }, [form.schedule, form.checkin]);
    useEffect(() => { if (form.schedule && form.cruise_name) loadRoomTypeCards(); }, [form.schedule, form.cruise_name, form.checkin]);
    useEffect(() => { loadCarCategoryOptions(); }, []);
    useEffect(() => {
        if (form.cruise_name && vehicleForm.car_category) loadCarRoutes(vehicleForm.car_category, form.cruise_name);
        else setCarRouteOptions([]);
    }, [vehicleForm.car_category, form.cruise_name]);
    useEffect(() => {
        if (form.cruise_name && vehicleForm.car_category && vehicleForm.route) {
            loadCarTypes(vehicleForm.car_category, vehicleForm.route, form.cruise_name);
        } else {
            setCarTypeOptions([]);
        }
    }, [vehicleForm.car_category, vehicleForm.route, form.cruise_name]);
    useEffect(() => { if (vehicleForm.car_category && vehicleForm.route && vehicleForm.car_type) getCarCode(); }, [vehicleForm.car_category, vehicleForm.route, vehicleForm.car_type]);
    useEffect(() => {
        setVehicleForm({ car_category: '', route: '', car_type: '', car_code: '', count: 1 });
        setCarRouteOptions([]);
        setCarTypeOptions([]);
        setCarPrice(null);
    }, [form.cruise_name]);

    const getScheduleTypeCandidates = (schedule: string): string[] => {
        const map: Record<string, string[]> = {
            '1박2일': ['1N2D', '1N', '1박2일'],
            '2박3일': ['2N3D', '2N', '2박3일'],
            '당일': ['DAY', '당일'],
        };
        return map[schedule] || [schedule];
    };

    const loadCruiseOptions = async () => {
        const scheduleCandidates = getScheduleTypeCandidates(form.schedule);
        const { data } = await supabase.from('cruise_rate_card').select('cruise_name, valid_from, valid_to')
            .in('schedule_type', scheduleCandidates)
            .eq('is_active', true);

        const filtered = (data || []).filter((row: any) =>
            isRateValidForCheckin(form.checkin, row.valid_from, row.valid_to)
        );
        const nextCruises = uniqueStrings(filtered, 'cruise_name');

        setCruiseOptions(nextCruises);
        if (form.cruise_name && !nextCruises.includes(form.cruise_name)) {
            setForm((prev) => ({ ...prev, cruise_name: '', room_type: '' }));
            setSelectedRateCardId('');
            setSelectedCard(null);
            setRoomTypeCards([]);
        }
    };

    const loadRoomTypeCards = async () => {
        const scheduleCandidates = getScheduleTypeCandidates(form.schedule);
        const { data } = await supabase.from('cruise_rate_card').select('*')
            .in('schedule_type', scheduleCandidates)
            .eq('cruise_name', form.cruise_name)
            .eq('is_active', true)
            .order('price_adult');

        const filteredCards = (data || []).filter((row: any) =>
            isRateValidForCheckin(form.checkin, row.valid_from, row.valid_to)
        );
        setRoomTypeCards(filteredCards);

        if (selectedRateCardId && !filteredCards.some((row: any) => String(row.id || row.rate_card_id) === selectedRateCardId)) {
            setSelectedRateCardId('');
            setSelectedCard(null);
        }
    };

    const loadCarCategoryOptions = async () => {
        // 고객 다이렉트 예약 페이지와 동일하게 고정 카테고리 사용
        setCarCategoryOptions(carCategoryHardcoded);
    };

    const loadCarRoutes = async (cat: string, cruiseName: string) => {
        const { data } = await supabase
            .from('rentcar_price')
            .select('route, cruise')
            .eq('way_type', cat)
            .like('route', '%하롱베이%')
            .order('route');
        const filtered = (data || []).filter((row: any) => matchCruiseOrCommon(row?.cruise, cruiseName));
        setCarRouteOptions(uniqueStrings(filtered, 'route'));
    };

    const loadCarTypes = async (cat: string, route: string, cruiseName: string) => {
        let query = supabase
            .from('rentcar_price')
            .select('vehicle_type, cruise')
            .eq('way_type', cat);

        if (route) {
            query = query.eq('route', route);
        } else {
            query = query.like('route', '%하롱베이%');
        }

        const { data } = await query.order('vehicle_type');
        const filtered = (data || []).filter((row: any) => matchCruiseOrCommon(row?.cruise, cruiseName));
        setCarTypeOptions(uniqueStrings(filtered, 'vehicle_type'));
    };

    const getCarCode = async () => {
        const { data } = await supabase.from('rentcar_price').select('rent_code, price, cruise')
            .eq('way_type', vehicleForm.car_category)
            .eq('route', vehicleForm.route)
            .eq('vehicle_type', vehicleForm.car_type)
            .order('created_at', { ascending: false });

        const rows = (data || []) as any[];
        const target =
            rows.find((row) => String(row?.cruise || '').trim() === String(form.cruise_name || '').trim()) ||
            rows.find((row) => isCommonCruise(row?.cruise));

        setVehicleForm(p => ({ ...p, car_code: target?.rent_code || '' }));
        setCarPrice(target?.price || null);
    };

    const calculateRoomPrice = () => {
        if (!selectedCard) return 0;
        const c = selectedCard;
        return (
            (c.price_adult || 0) * form.adult_count +
            (c.price_child || 0) * form.child_count +
            (c.price_child_older || c.price_child || 0) * form.child_older_count +
            (c.price_infant || 0) * form.infant_count +
            (c.price_extra_bed || 0) * form.extra_bed_count +
            (c.price_single || 0) * form.single_count
        ) * form.room_count;
    };

    const saveCruiseReservation = async () => {
        if (!form.checkin) { alert('체크인 날짜를 선택해주세요.'); return; }
        if (!selectedCard) { alert('객실 타입을 선택해주세요.'); return; }

        setLoading(true);
        try {
            const roomTotal = calculateRoomPrice();
            const { data: cruiseReservation, error: cruiseReservationError } = await supabase.from('reservation').insert({
                re_user_id: userId,
                re_quote_id: quoteId || null,
                re_type: 'cruise',
                re_status: 'pending',
                total_amount: roomTotal
            }).select().single();

            if (cruiseReservationError) throw cruiseReservationError;

            const { error: cruiseError } = await supabase.from('reservation_cruise').insert({
                reservation_id: cruiseReservation.re_id,
                room_price_code: selectedCard.rate_card_id || selectedCard.id || '',
                room_count: form.room_count,
                guest_count: form.adult_count + form.child_count + form.child_older_count + form.infant_count,
                adult_count: form.adult_count,
                child_count: form.child_count + form.child_older_count,
                infant_count: form.infant_count,
                extra_bed_count: form.extra_bed_count,
                single_count: form.single_count,
                checkin: form.checkin,
                room_total_price: roomTotal,
                request_note: [
                    `[CHILD_OLDER_COUNTS:${form.child_older_count}]`,
                    form.request_note,
                    form.pickup_location ? `픽업: ${form.pickup_location}` : '',
                    form.dropoff_location ? `드롭오프: ${form.dropoff_location}` : '',
                ].filter(Boolean).join('\n') || null
            });

            if (cruiseError) throw cruiseError;

            alert('크루즈 예약이 생성되었습니다!');
            onComplete();
        } catch (error: any) {
            alert('오류: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const saveCruiseCarReservation = async () => {
        if (!form.cruise_name) { alert('크루즈명을 먼저 선택해주세요.'); return; }
        if (!vehicleForm.car_code) { alert('크루즈 차량을 선택해주세요.'); return; }

        setLoading(true);
        try {
            const carTotal = (carPrice || 0) * vehicleForm.count;
            const isSht = (vehicleForm.car_type || '').includes('스테이하롱 셔틀 리무진');

            if (isSht && !selectedShtSeat?.seat) {
                alert('스하차량 좌석을 먼저 선택해주세요.');
                return;
            }

            const { data: carReservation, error: carReservationError } = await supabase.from('reservation').insert({
                re_user_id: userId,
                re_quote_id: quoteId || null,
                re_type: isSht ? 'sht' : 'car',
                re_status: 'pending',
                total_amount: carTotal
            }).select().single();

            if (carReservationError) throw carReservationError;

            if (isSht) {
                if (!form.checkin) {
                    alert('스하차량 저장 시 체크인 날짜가 필요합니다.');
                    return;
                }

                const isRoundTrip = ['당일왕복', '다른날왕복'].includes(vehicleForm.car_category || '');
                const toUsageDateIso = (dateText: string) => `${dateText}T00:00:00+09:00`;
                const addDays = (dateText: string, days: number) => {
                    const d = new Date(`${dateText}T00:00:00+09:00`);
                    d.setDate(d.getDate() + days);
                    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                };

                let pierLocation = '선착장';
                if (form.cruise_name) {
                    const { data: cruiseLocationData } = await supabase
                        .from('cruise_location')
                        .select('pier_location')
                        .eq('kr_name', form.cruise_name)
                        .maybeSingle();

                    if (cruiseLocationData?.pier_location) {
                        pierLocation = cruiseLocationData.pier_location;
                    }
                }

                const baseRow = {
                    reservation_id: carReservation.re_id,
                    vehicle_number: selectedShtSeat?.vehicle || null,
                    seat_number: selectedShtSeat?.seat || null,
                    car_price_code: vehicleForm.car_code,
                    car_count: vehicleForm.count,
                    passenger_count: vehicleForm.count,
                    unit_price: carPrice || 0,
                    request_note: form.request_note || null,
                };

                if (isRoundTrip) {
                    const dropoffDate = vehicleForm.car_category === '당일왕복'
                        ? form.checkin
                        : addDays(form.checkin, form.schedule === '2박3일' ? 2 : 1);

                    const { error: shtError } = await supabase.from('reservation_car_sht').insert([
                        {
                            ...baseRow,
                            sht_category: 'Pickup',
                            pickup_datetime: form.checkin,
                            pickup_location: form.pickup_location || null,
                            dropoff_location: pierLocation,
                            car_total_price: carTotal,
                        },
                        {
                            ...baseRow,
                            sht_category: 'Drop-off',
                            pickup_datetime: dropoffDate,
                            pickup_location: pierLocation,
                            dropoff_location: form.dropoff_location || null,
                            car_total_price: 0,
                        },
                    ]);

                    if (shtError) throw shtError;
                } else {
                    const { error: shtError } = await supabase.from('reservation_car_sht').insert({
                        ...baseRow,
                        sht_category: 'Pickup',
                        pickup_datetime: form.checkin,
                        pickup_location: form.pickup_location || null,
                        dropoff_location: form.dropoff_location || null,
                        car_total_price: carTotal,
                    });

                    if (shtError) throw shtError;
                }
            } else {
                const { error: carError } = await supabase.from('reservation_cruise_car').insert({
                    reservation_id: carReservation.re_id,
                    car_price_code: vehicleForm.car_code,
                    rentcar_price_code: vehicleForm.car_code,
                    way_type: vehicleForm.car_category || null,
                    route: vehicleForm.route || null,
                    vehicle_type: vehicleForm.car_type || null,
                    car_count: vehicleForm.count,
                    passenger_count: form.adult_count + form.child_count,
                    pickup_location: form.pickup_location || '',
                    dropoff_location: form.dropoff_location || '',
                    car_total_price: carTotal,
                    unit_price: carPrice || 0,
                    request_note: form.request_note || null
                });

                if (carError) throw carError;
            }

            alert(isSht ? '스하차량 예약이 생성되었습니다!' : '크루즈 차량 예약이 생성되었습니다!');
            onComplete();
        } catch (error: any) {
            alert('오류: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                    <label className="text-sm font-medium text-gray-700">체크인</label>
                    <input type="date" value={form.checkin} onChange={e => setForm(p => ({ ...p, checkin: e.target.value }))}
                        className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                    <label className="text-sm font-medium text-gray-700">일정</label>
                    <select value={form.schedule} onChange={e => setForm(p => ({ ...p, schedule: e.target.value, cruise_name: '' }))}
                        className="w-full px-3 py-2 border rounded-lg text-sm">
                        <option value="">선택</option>
                        {scheduleOptions.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                </div>
                <div>
                    <label className="text-sm font-medium text-gray-700">크루즈 선택</label>
                    <select value={form.cruise_name} onChange={e => setForm(p => ({ ...p, cruise_name: e.target.value }))}
                        className="w-full px-3 py-2 border rounded-lg text-sm">
                        <option value="">선택</option>
                        {cruiseOptions.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>
            </div>

            {roomTypeCards.length > 0 && (
                <div>
                    <label className="text-sm font-medium text-gray-700">객실 선택</label>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mt-2">
                        {roomTypeCards.map(card => (
                            <div key={card.id} onClick={() => { setSelectedRateCardId(card.id); setSelectedCard(card); }}
                                className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${selectedRateCardId === card.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-300'}`}>
                                <div className="font-medium text-sm">{card.room_type}</div>
                                {card.room_type_en && <div className="text-xs text-gray-400">{card.room_type_en}</div>}
                                <div className="mt-2 space-y-1 text-xs">
                                    <div className="flex justify-between"><span>성인</span><span className="font-bold text-blue-600">{Number(card.price_adult || 0).toLocaleString()}동</span></div>
                                    {card.price_child > 0 && <div className="flex justify-between"><span>아동(5~7세)</span><span>{Number(card.price_child || 0).toLocaleString()}동</span></div>}
                                    {(card.price_child_older || card.price_child) > 0 && <div className="flex justify-between"><span>아동(8~11세)</span><span>{Number(card.price_child_older || card.price_child || 0).toLocaleString()}동</span></div>}
                                    {card.price_extra_bed > 0 && <div className="flex justify-between"><span>엑스트라베드</span><span>{Number(card.price_extra_bed || 0).toLocaleString()}동</span></div>}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                <h4 className="font-medium text-gray-700">인원 구성</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                    {[
                        { key: 'adult_count', label: '성인', min: 1 },
                        { key: 'child_count', label: '아동(5~7세)' },
                        { key: 'child_older_count', label: '아동(8~11세)' },
                        { key: 'infant_count', label: '유아(0~4세)' },
                        { key: 'extra_bed_count', label: '엑스트라베드' },
                        { key: 'single_count', label: '싱글차지' },
                        { key: 'room_count', label: '객실 수', min: 1 },
                    ].map(f => (
                        <div key={f.key}>
                            <label className="text-xs text-gray-700">{f.label}</label>
                            <input type="number" min={f.min || 0} value={(form as any)[f.key]}
                                onChange={e => setForm(p => ({ ...p, [f.key]: Number(e.target.value) }))}
                                className="w-full px-3 py-2 border rounded-lg text-sm" />
                        </div>
                    ))}
                </div>
            </div>

            {/* 차량 선택 섹션 */}
            <div className="bg-blue-50 rounded-lg p-4 space-y-3">
                <h4 className="font-medium text-blue-800">🚗 차량 서비스 (선택)</h4>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div>
                        <label className="text-xs text-gray-700">이용방식</label>
                        <select value={vehicleForm.car_category}
                            onChange={e => setVehicleForm(p => ({ ...p, car_category: e.target.value, route: '', car_type: '', car_code: '' }))}
                            className="w-full px-3 py-2 border rounded-lg text-sm"
                            disabled={!form.cruise_name}
                        >
                            <option value="">선택 안함</option>
                            {carCategoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>
                    {vehicleForm.car_category && (
                        <div>
                            <label className="text-xs text-gray-700">경로</label>
                            <select value={vehicleForm.route}
                                onChange={e => setVehicleForm(p => ({ ...p, route: e.target.value, car_type: '', car_code: '' }))}
                                className="w-full px-3 py-2 border rounded-lg text-sm">
                                <option value="">선택</option>
                                {carRouteOptions.map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                        </div>
                    )}
                    {vehicleForm.route && (
                        <div>
                            <label className="text-xs text-gray-700">차량 타입</label>
                            <select value={vehicleForm.car_type}
                                onChange={e => {
                                    const nextType = e.target.value;
                                    setVehicleForm(p => ({ ...p, car_type: nextType }));
                                    if (!nextType.includes('스테이하롱 셔틀 리무진')) {
                                        setSelectedShtSeat(null);
                                    }
                                }}
                                className="w-full px-3 py-2 border rounded-lg text-sm">
                                <option value="">선택</option>
                                {carTypeOptions.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                    )}
                </div>
                {carPrice !== null && (
                    <div className="flex items-center gap-3">
                        <span className="text-sm text-blue-600 font-medium">차량 가격: {carPrice.toLocaleString()}동</span>
                        <div>
                            <label className="text-xs text-gray-700 mr-1">수량</label>
                            <input type="number" min={1} value={vehicleForm.count}
                                onChange={e => setVehicleForm(p => ({ ...p, count: Number(e.target.value) }))}
                                className="w-16 px-2 py-1 border rounded text-sm" />
                        </div>
                    </div>
                )}

                {vehicleForm.car_type.includes('스테이하롱 셔틀 리무진') && (
                    <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 space-y-2">
                        <div className="text-sm font-semibold text-indigo-700">🚌 스하차량 좌석 선택</div>
                        <button
                            type="button"
                            onClick={() => setIsShtSeatModalOpen(true)}
                            className="px-3 py-2 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700 transition-colors"
                        >
                            좌석 선택 열기
                        </button>
                        {selectedShtSeat?.seat && (
                            <div className="text-sm text-gray-700">
                                선택 좌석: <span className="font-semibold">{selectedShtSeat.vehicle} / {selectedShtSeat.seat}</span>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                    <label className="text-xs text-gray-700">픽업 장소</label>
                    <input type="text" value={form.pickup_location} onChange={e => setForm(p => ({ ...p, pickup_location: e.target.value }))}
                        className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                    <label className="text-xs text-gray-700">드롭오프 장소</label>
                    <input type="text" value={form.dropoff_location} onChange={e => setForm(p => ({ ...p, dropoff_location: e.target.value }))}
                        className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
            </div>

            <div>
                <label className="text-xs text-gray-700">요청사항</label>
                <textarea value={form.request_note} onChange={e => setForm(p => ({ ...p, request_note: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg text-sm" rows={3} />
            </div>

            {selectedCard && (
                <div className="bg-yellow-50 rounded-lg p-4 space-y-2">
                    <div className="text-sm">
                        <span className="text-gray-600">객실 금액:</span>
                        <span className="ml-2 font-bold">{calculateRoomPrice().toLocaleString()}동</span>
                    </div>
                    {carPrice !== null && vehicleForm.car_code && (
                        <div className="text-sm">
                            <span className="text-gray-600">차량 금액:</span>
                            <span className="ml-2 font-bold">{(carPrice * vehicleForm.count).toLocaleString()}동</span>
                        </div>
                    )}
                    <div className="text-lg font-bold text-red-600 pt-2 border-t">
                        예상 총 금액: {(calculateRoomPrice() + (vehicleForm.car_code ? (carPrice || 0) * vehicleForm.count : 0)).toLocaleString()}동
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <button onClick={saveCruiseReservation} disabled={loading}
                    className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
                    {loading ? '처리 중...' : '크루즈 예약 저장'}
                </button>
                <button onClick={saveCruiseCarReservation} disabled={loading}
                    className="w-full py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                    {loading ? '처리 중...' : (vehicleForm.car_type.includes('스테이하롱 셔틀 리무진') ? '스하차량 저장' : '크루즈 차량 저장')}
                </button>
            </div>

            <ShtCarSeatMap
                isOpen={isShtSeatModalOpen}
                onClose={() => setIsShtSeatModalOpen(false)}
                usageDate={form.checkin || undefined}
                onSeatSelect={(seatInfo) => setSelectedShtSeat(seatInfo)}
                requiredSeats={Math.max(1, vehicleForm.count || 1)}
                initialCategory="pickup"
            />
        </div>
    );
}

// ═══════════════════════════════════════════
// 메인 페이지 컴포넌트
// ═══════════════════════════════════════════
function NewReservationContent() {
    const router = useRouter();
    const searchParams = useSearchParams();

    // 단계 관리
    const [step, setStep] = useState(1); // 1: 고객 선택, 2: 서비스 선택, 3: 예약 양식

    // 고객 검색
    const [customerSearch, setCustomerSearch] = useState('');
    const [customers, setCustomers] = useState<UserInfo[]>([]);
    const [selectedCustomer, setSelectedCustomer] = useState<UserInfo | null>(null);
    const [searchLoading, setSearchLoading] = useState(false);

    // 견적 검색
    const [searchMode, setSearchMode] = useState<'customer' | 'quote' | 'newCustomer'>('customer');
    const [quoteSearch, setQuoteSearch] = useState('');
    const [quoteResults, setQuoteResults] = useState<any[]>([]);
    const [selectedQuote, setSelectedQuote] = useState<{ id: string; title: string } | null>(null);
    const [quoteId, setQuoteId] = useState('');
    const [selectedQuoteFastTrack, setSelectedQuoteFastTrack] = useState<{ has: boolean; total: number }>({ has: false, total: 0 });

    const [newCustomerForm, setNewCustomerForm] = useState({ name: '', email: '', phone_number: '' });
    const [newCustomerLoading, setNewCustomerLoading] = useState(false);

    // 서비스 선택
    const [selectedService, setSelectedService] = useState<ServiceType | null>(null);

    const loadQuoteFastTrackSummary = async (targetQuoteId?: string | null) => {
        if (!targetQuoteId) {
            setSelectedQuoteFastTrack({ has: false, total: 0 });
            return;
        }

        try {
            const { data: airportReservations } = await supabase
                .from('reservation')
                .select('re_id')
                .eq('re_quote_id', targetQuoteId)
                .eq('re_type', 'airport');

            const reservationIds = (airportReservations || []).map((row: any) => row.re_id).filter(Boolean);
            if (reservationIds.length === 0) {
                setSelectedQuoteFastTrack({ has: false, total: 0 });
                return;
            }

            const { data: fastTrackRows } = await supabase
                .from('reservation_airport_fasttrack')
                .select('reservation_id')
                .in('reservation_id', reservationIds);

            const total = (fastTrackRows || []).length;
            setSelectedQuoteFastTrack({ has: total > 0, total });
        } catch (error) {
            console.warn('⚠️ 패스트랙 요약 조회 실패:', error);
            setSelectedQuoteFastTrack({ has: false, total: 0 });
        }
    };

    // URL 파라미터로 고객 선택 지원
    useEffect(() => {
        const quoteParam = searchParams.get('quote_id');
        const userId = searchParams.get('user_id');
        if (quoteParam) {
            loadQuoteById(quoteParam);
            return;
        }
        if (userId) {
            loadCustomerById(userId);
        }
    }, [searchParams]);

    const loadQuoteById = async (quoteParam: string) => {
        try {
            const { data: quoteData, error: quoteError } = await supabase
                .from('quote')
                .select('id, title, user_id')
                .eq('id', quoteParam)
                .single();

            if (quoteError || !quoteData) {
                console.error('견적 조회 실패:', quoteError);
                return;
            }

            let customer: UserInfo = {
                id: quoteData.user_id,
                name: '(견적자)',
                email: '',
                phone_number: '',
            };

            if (quoteData.user_id) {
                const { data: userData } = await supabase
                    .from('users')
                    .select('id, name, email, phone_number')
                    .eq('id', quoteData.user_id)
                    .single();
                if (userData) {
                    customer = userData as UserInfo;
                }
            }

            setSelectedQuote({ id: quoteData.id, title: quoteData.title || '(제목 없음)' });
            setQuoteId(quoteData.id);
            setSelectedCustomer(customer);
            await loadQuoteFastTrackSummary(quoteData.id);
            setSearchMode('quote');
            setStep(2);
        } catch (error) {
            console.error('quote_id 초기화 실패:', error);
        }
    };

    const loadCustomerById = async (userId: string) => {
        const { data } = await supabase.from('users').select('id, name, email, phone_number').eq('id', userId).single();
        if (data) {
            setSelectedCustomer(data);
            setStep(2);
        }
    };

    const searchCustomers = async () => {
        if (!customerSearch.trim()) return;
        setSearchLoading(true);
        try {
            const term = customerSearch.trim();
            // 이름, 이메일, 전화번호로 검색
            const { data, error } = await supabase.from('users').select('id, name, email, phone_number')
                .or(`name.ilike.%${term}%,email.ilike.%${term}%,phone_number.ilike.%${term}%`)
                .order('name').limit(20);
            if (error) throw error;
            setCustomers(data || []);
        } catch (error) {
            console.error('고객 검색 실패:', error);
        } finally {
            setSearchLoading(false);
        }
    };

    const createNewCustomer = async () => {
        // 필수 입력사항 검증
        if (!newCustomerForm.name.trim()) {
            alert('고객명을 입력해주세요.');
            return;
        }
        if (!newCustomerForm.email.trim()) {
            alert('이메일을 입력해주세요.');
            return;
        }

        const password = 'sht123!';
        setNewCustomerLoading(true);
        try {
            // 1. Supabase 인증 계정 생성
            const { data: { user: authUser }, error: authError } = await supabase.auth.signUp({
                email: newCustomerForm.email.trim(),
                password: password
            });

            if (authError) throw new Error(`인증 계정 생성 실패: ${authError.message}`);
            if (!authUser) throw new Error('인증 계정 생성 실패: 사용자 정보 없음');

            // 2. 사용자 테이블에 사용자 정보 추가
            const { data, error: userError } = await supabase.from('users').insert({
                id: authUser.id,
                name: newCustomerForm.name.trim(),
                email: newCustomerForm.email.trim(),
                phone_number: newCustomerForm.phone_number.trim() || null,
                role: 'member',
                created_at: new Date().toISOString()
            }).select().single();

            if (userError) throw new Error(`사용자 테이블 저장 실패: ${userError.message}`);

            // 3. 견적 자동 생성 (신고객용)
            const { data: newQuote, error: quoteError } = await supabase.from('quote').insert({
                user_id: authUser.id,
                title: `${newCustomerForm.name.trim()} 견적`,
                status: 'draft',
            }).select('id, title').single();
            if (quoteError) throw new Error(`견적 생성 실패: ${quoteError.message}`);

            const newCustomer: UserInfo = {
                id: data.id,
                name: data.name,
                email: data.email || '',
                phone_number: data.phone_number || ''
            };

            setSelectedCustomer(newCustomer);
            setQuoteId(newQuote.id);
            setSelectedQuote({ id: newQuote.id, title: newQuote.title || '(제목 없음)' });
            setNewCustomerForm({ name: '', email: '', phone_number: '' });
            setStep(2);
            alert('새 고객이 추가되었습니다. (이메일: ' + newCustomerForm.email.trim() + ', 임시 비밀번호: sht123!)');
        } catch (error: any) {
            console.error('고객 생성 실패:', error);
            alert('고객 생성 실패: ' + (error.message || '알 수 없는 오류'));
        } finally {
            setNewCustomerLoading(false);
        }
    };

    const searchByQuote = async () => {
        if (!quoteSearch.trim()) return;
        setSearchLoading(true);
        try {
            const term = quoteSearch.trim();
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            let query = supabase.from('quote').select('id, title, user_id, status, created_at')
                .order('created_at', { ascending: false }).limit(20);
            if (uuidRegex.test(term)) {
                query = query.eq('id', term);
            } else {
                query = query.ilike('title', `%${term}%`);
            }
            const { data, error } = await query;
            if (error) throw error;
            const userIds = [...new Set((data || []).map((q: any) => q.user_id))];
            const userMap = new Map<string, UserInfo>();
            if (userIds.length > 0) {
                const { data: usersData } = await supabase.from('users').select('id, name, email, phone_number').in('id', userIds);
                (usersData || []).forEach((u: any) => userMap.set(u.id, u));
            }
            setQuoteResults((data || []).map((q: any) => ({ ...q, user: userMap.get(q.user_id) || null })));
        } catch (error) {
            console.error('견적 검색 실패:', error);
        } finally {
            setSearchLoading(false);
        }
    };

    const selectQuoteAndProceed = (quote: any) => {
        setSelectedQuote({ id: quote.id, title: quote.title || '(제목 없음)' });
        setQuoteId(quote.id);
        const customer: UserInfo = quote.user || { id: quote.user_id, name: '(견적자)', email: '', phone_number: '' };
        setSelectedCustomer(customer);
        loadQuoteFastTrackSummary(quote.id);
        setStep(2);
    };

    const handleComplete = () => {
        router.push('/reservation-edit');
    };

    return (
        <ManagerLayout title="➕ 새 예약 추가" activeTab="reservation-edit">
            <div className="max-w-4xl mx-auto space-y-6">
                {/* 뒤로가기 */}
                <button onClick={() => {
                    if (step === 3) { setStep(2); setSelectedService(null); }
                    else if (step === 2) { setStep(1); setSelectedCustomer(null); setSelectedService(null); setSelectedQuote(null); setQuoteId(''); setQuoteResults([]); }
                    else router.push('/reservation-edit');
                }}
                    className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-800 text-sm">
                    <ArrowLeft className="w-4 h-4" /> 뒤로
                </button>

                {/* 단계 표시 */}
                <div className="flex items-center gap-4 bg-white rounded-lg shadow-sm p-4">
                    {[
                        { n: 1, label: '고객 선택' },
                        { n: 2, label: '서비스 선택' },
                        { n: 3, label: '예약 양식 작성' },
                    ].map((s, idx) => (
                        <React.Fragment key={s.n}>
                            {idx > 0 && <div className="flex-1 h-px bg-gray-300" />}
                            <div className={`flex items-center gap-2 ${step >= s.n ? 'text-blue-600' : 'text-gray-400'}`}>
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${step > s.n ? 'bg-green-100 text-green-600' : step === s.n ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400'}`}>
                                    {step > s.n ? <Check className="w-4 h-4" /> : s.n}
                                </div>
                                <span className="text-sm font-medium hidden md:inline">{s.label}</span>
                            </div>
                        </React.Fragment>
                    ))}
                </div>

                {/* Step 1: 고객 선택 */}
                {step === 1 && (
                    <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
                        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                            <User className="w-5 h-5 text-blue-600" /> 고객 선택
                        </h2>

                        {/* 검색 모드 탭 */}
                        <div className="flex border-b border-gray-200">
                            <button
                                onClick={() => { setSearchMode('customer'); setCustomers([]); setQuoteSearch(''); setQuoteResults([]); }}
                                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${searchMode === 'customer' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                                구예약 추가
                            </button>
                            <button
                                onClick={() => { setSearchMode('quote'); setCustomerSearch(''); setCustomers([]); setQuoteResults([]); }}
                                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${searchMode === 'quote' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                                신예약 추가
                            </button>
                            <button
                                onClick={() => { setSearchMode('newCustomer'); setCustomerSearch(''); setCustomers([]); setQuoteSearch(''); setQuoteResults([]); }}
                                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${searchMode === 'newCustomer' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                                신고객 추가
                            </button>
                        </div>

                        {/* 고객 검색 탭 */}
                        {searchMode === 'customer' && (
                            <>
                                <div className="flex gap-2">
                                    <div className="relative flex-1">
                                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                                        <input type="text" placeholder="이름, 이메일 또는 전화번호로 검색"
                                            value={customerSearch} onChange={e => setCustomerSearch(e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Enter') searchCustomers(); }}
                                            className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                                    </div>
                                    <button onClick={searchCustomers} disabled={searchLoading}
                                        className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium">
                                        {searchLoading ? '검색 중...' : '검색'}
                                    </button>
                                </div>
                                {customers.length > 0 && (
                                    <div className="space-y-2 max-h-96 overflow-y-auto">
                                        {customers.map(customer => (
                                            <div key={customer.id}
                                                onClick={() => { setSelectedCustomer(customer); setQuoteId(''); setSelectedQuote(null); setStep(2); }}
                                                className="flex items-center justify-between p-4 border rounded-lg cursor-pointer hover:bg-blue-50 hover:border-blue-300 transition-colors">
                                                <div>
                                                    <div className="font-medium text-gray-900">{customer.name || '이름 없음'}</div>
                                                    <div className="text-sm text-gray-500">{customer.email}</div>
                                                </div>
                                                <div className="text-sm text-gray-400">{customer.phone_number || '-'}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {customers.length === 0 && customerSearch && !searchLoading && (
                                    <div className="text-center py-8 text-gray-500">
                                        <User className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                                        검색 결과가 없습니다
                                    </div>
                                )}
                            </>
                        )}

                        {/* 신고객 추가 탭 */}
                        {searchMode === 'newCustomer' && (
                            <div className="bg-green-50 rounded-lg p-6 space-y-4">
                                <h3 className="text-lg font-bold text-gray-900">신고객 추가</h3>
                                <div className="space-y-3">
                                    <div>
                                        <label className="text-sm font-medium text-gray-700 block mb-1">고객명 *</label>
                                        <input type="text" placeholder="고객 이름"
                                            value={newCustomerForm.name} onChange={e => setNewCustomerForm(p => ({ ...p, name: e.target.value }))}
                                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500" />
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-gray-700 block mb-1">이메일 *</label>
                                        <input type="email" placeholder="이메일 주소"
                                            value={newCustomerForm.email} onChange={e => setNewCustomerForm(p => ({ ...p, email: e.target.value }))}
                                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500" />
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-gray-700 block mb-1">비밀번호 (자동 지정: sht123!)</label>
                                        <input type="password" value="sht123!"
                                            disabled
                                            className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-500 cursor-not-allowed" />
                                        <p className="text-xs text-gray-500 mt-1">비밀번호는 sht123!로 자동 지정됩니다.</p>
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-gray-700 block mb-1">전화번호</label>
                                        <input type="tel" placeholder="전화번호"
                                            value={newCustomerForm.phone_number} onChange={e => setNewCustomerForm(p => ({ ...p, phone_number: e.target.value }))}
                                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500" />
                                    </div>
                                </div>
                                <div className="flex gap-2 pt-2">
                                    <button onClick={createNewCustomer} disabled={newCustomerLoading}
                                        className="flex-1 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium">
                                        {newCustomerLoading ? '추가 중...' : '고객 추가'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* 견적 검색 탭 */}
                        {searchMode === 'quote' && (
                            <>
                                <div className="flex gap-2">
                                    <div className="relative flex-1">
                                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                                        <input type="text" placeholder="견적 제목 또는 견적 ID(UUID)로 검색"
                                            value={quoteSearch} onChange={e => setQuoteSearch(e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Enter') searchByQuote(); }}
                                            className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                                    </div>
                                    <button onClick={searchByQuote} disabled={searchLoading}
                                        className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium">
                                        {searchLoading ? '검색 중...' : '검색'}
                                    </button>
                                </div>
                                {quoteResults.length > 0 && (
                                    <div className="space-y-2 max-h-96 overflow-y-auto">
                                        {quoteResults.map((quote: any) => (
                                            <div key={quote.id}
                                                onClick={() => selectQuoteAndProceed(quote)}
                                                className="p-4 border rounded-lg cursor-pointer hover:bg-blue-50 hover:border-blue-300 transition-colors">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="font-medium text-gray-900">{quote.title || '(제목 없음)'}</div>
                                                        <div className="text-sm text-gray-500 mt-0.5">
                                                            {quote.user ? `${quote.user.name || '이름 없음'} · ${quote.user.email}` : '미등록 고객'}
                                                        </div>
                                                        <div className="text-xs text-gray-400 mt-0.5 truncate">견적 ID: {quote.id}</div>
                                                    </div>
                                                    <div className="text-right shrink-0">
                                                        <div className={`text-xs px-2 py-0.5 rounded-full ${quote.status === 'approved' ? 'bg-green-100 text-green-700' : quote.status === 'pending' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'}`}>
                                                            {quote.status}
                                                        </div>
                                                        <div className="text-xs text-gray-400 mt-1">
                                                            {new Date(quote.created_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {quoteResults.length === 0 && quoteSearch && !searchLoading && (
                                    <div className="text-center py-8 text-gray-500">
                                        <Search className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                                        검색 결과가 없습니다
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}

                {/* Step 2: 서비스 선택 */}
                {step === 2 && selectedCustomer && (
                    <div className="space-y-4">
                        {/* 선택된 고객 정보 */}
                        <div className="bg-blue-50 rounded-lg p-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <User className="w-5 h-5 text-blue-600" />
                                <div>
                                    <div className="font-medium text-gray-900">{selectedCustomer.name || '이름 없음'}</div>
                                    <div className="text-sm text-gray-500">{selectedCustomer.email}</div>
                                    {selectedQuote && (
                                        <div className="text-xs text-blue-600 mt-0.5">견적: {selectedQuote.title}</div>
                                    )}
                                </div>
                            </div>
                            <button onClick={() => { setStep(1); setSelectedCustomer(null); setSelectedQuote(null); setQuoteId(''); setQuoteResults([]); setSelectedQuoteFastTrack({ has: false, total: 0 }); }}
                                className="text-sm text-blue-600 hover:text-blue-800">변경</button>
                        </div>
                        {selectedQuoteFastTrack.has && (
                            <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-100 text-rose-700 text-xs font-semibold">
                                FAST TRACK 신청 있음 ({selectedQuoteFastTrack.total}명)
                            </div>
                        )}

                        <div className="bg-white rounded-lg shadow-sm p-6">
                            <h2 className="text-lg font-bold text-gray-900 mb-4">서비스 선택</h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {SERVICE_LIST.map(service => (
                                    <div key={service.type}
                                        onClick={() => { setSelectedService(service.type); setStep(3); }}
                                        className={`p-6 rounded-lg border-2 cursor-pointer transition-all hover:shadow-md
                                            ${selectedService === service.type ? `border-${service.color}-500 bg-${service.color}-50` : 'border-gray-200 hover:border-gray-400'}`}>
                                        <div className={`text-${service.color}-600 mb-3`}>{service.icon}</div>
                                        <div className="font-medium text-gray-900">{service.label}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* Step 3: 예약 양식 */}
                {step === 3 && selectedCustomer && selectedService && (
                    <div className="space-y-4">
                        {/* 선택된 고객 정보 */}
                        <div className="bg-blue-50 rounded-lg p-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <User className="w-5 h-5 text-blue-600" />
                                <div>
                                    <div className="font-medium text-gray-900">{selectedCustomer.name || '이름 없음'} · {selectedCustomer.email}</div>
                                    {selectedQuote && (
                                        <div className="text-xs text-blue-600 mt-0.5">견적: {selectedQuote.title} <span className="text-gray-400">({selectedQuote.id.slice(0, 8)}...)</span></div>
                                    )}
                                </div>
                            </div>
                        </div>
                        {selectedQuoteFastTrack.has && (
                            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-100 text-rose-700 text-xs font-semibold">
                                FAST TRACK 신청 있음 ({selectedQuoteFastTrack.total}명)
                            </div>
                        )}

                        {/* 선택된 서비스 */}
                        <div className="bg-white rounded-lg shadow-sm p-6">
                            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                                {SERVICE_LIST.find(s => s.type === selectedService)?.icon}
                                {SERVICE_LIST.find(s => s.type === selectedService)?.label} 예약
                            </h2>

                            {selectedService === 'airport' && <AirportForm userId={selectedCustomer.id} quoteId={quoteId || undefined} onComplete={handleComplete} />}
                            {selectedService === 'hotel' && <HotelForm userId={selectedCustomer.id} quoteId={quoteId || undefined} onComplete={handleComplete} />}
                            {selectedService === 'tour' && <TourForm userId={selectedCustomer.id} quoteId={quoteId || undefined} onComplete={handleComplete} />}
                            {selectedService === 'rentcar' && <RentcarForm userId={selectedCustomer.id} quoteId={quoteId || undefined} onComplete={handleComplete} />}
                            {selectedService === 'cruise' && <CruiseForm userId={selectedCustomer.id} quoteId={quoteId || undefined} onComplete={handleComplete} />}
                        </div>
                    </div>
                )}
            </div>
        </ManagerLayout>
    );
}

export default function NewReservationPage() {
    return (
        <Suspense fallback={
            <ManagerLayout title="➕ 새 예약 추가" activeTab="reservation-edit">
                <div className="flex justify-center items-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto" />
                </div>
            </ManagerLayout>
        }>
            <NewReservationContent />
        </Suspense>
    );
}
