'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import supabase from '@/lib/supabase';

type Props = {
    quoteId: string;
    onSuccess?: (payload: { itemId: string; serviceRefId: string }) => void;
};

export default function HotelFormLite({ quoteId, onSuccess }: Props) {
    const [loading, setLoading] = useState(false);

    // hotel_info 기반
    const [hotelOptions, setHotelOptions] = useState<any[]>([]);
    const [selectedHotelId, setSelectedHotelId] = useState('');
    const [selectedHotelName, setSelectedHotelName] = useState('');

    // room_type 기반
    const [roomOptions, setRoomOptions] = useState<any[]>([]);
    const [selectedRoomId, setSelectedRoomId] = useState('');

    // hotel_price 기반
    const [pricingOptions, setPricingOptions] = useState<any[]>([]);
    const [selectedPricingId, setSelectedPricingId] = useState('');
    const [selectedPricing, setSelectedPricing] = useState<any>(null);

    const [formData, setFormData] = useState({
        checkin_date: '',
        checkout_date: '',
        special_requests: ''
    });

    // 1단계: 체크인/체크아웃 날짜 기반 호텔 목록 로드
    const loadHotelOptions = useCallback(async () => {
        try {
            // hotel_price에서 날짜 범위에 맞는 호텔 코드 조회
            const { data: priceData, error: priceError } = await supabase
                .from('hotel_price')
                .select('hotel_code')
                .lte('start_date', formData.checkin_date)
                .gte('end_date', formData.checkin_date);
            if (priceError) throw priceError;
            const uniqueCodes = [...new Set((priceData || []).map((p: any) => p.hotel_code))];
            if (uniqueCodes.length === 0) { setHotelOptions([]); return; }
            const { data: hotelData, error: hotelError } = await supabase
                .from('hotel_info')
                .select('*')
                .in('hotel_code', uniqueCodes)
                .eq('active', true)
                .order('hotel_name');
            if (hotelError) throw hotelError;
            setHotelOptions(hotelData || []);
        } catch (e) {
            console.error('호텔 옵션 로드 실패:', e);
        }
    }, [formData.checkin_date, formData.checkout_date]);

    // 2단계: 호텔 선택 후 객실 목록 로드
    const loadRoomOptions = useCallback(async (hotelCode: string) => {
        try {
            const { data, error } = await supabase
                .from('hotel_price')
                .select('room_type, room_name, room_category')
                .eq('hotel_code', hotelCode)
                .lte('start_date', formData.checkin_date)
                .gte('end_date', formData.checkin_date);
            if (error) throw error;
            const uniqueRooms = new Map();
            (data || []).forEach((item: any) => {
                if (!uniqueRooms.has(item.room_type)) {
                    uniqueRooms.set(item.room_type, item);
                }
            });
            setRoomOptions(Array.from(uniqueRooms.values()));
        } catch (e) {
            console.error('객실 옵션 로드 실패:', e);
        }
    }, [formData.checkin_date, formData.checkout_date]);

    // 3단계: 객실 선택 후 가격 옵션 로드
    const loadPricingOptions = useCallback(async (hotelCode: string, roomType: string) => {
        try {
            const { data, error } = await supabase
                .from('hotel_price')
                .select('*')
                .eq('hotel_code', hotelCode)
                .eq('room_type', roomType)
                .lte('start_date', formData.checkin_date)
                .gte('end_date', formData.checkin_date)
                .order('base_price');
            if (error) throw error;
            setPricingOptions(data || []);
            if (data && data.length > 0) {
                setSelectedPricingId(data[0].hotel_price_code);
                setSelectedPricing(data[0]);
            } else {
                setSelectedPricingId('');
                setSelectedPricing(null);
            }
        } catch (e) {
            console.error('가격 옵션 로드 실패:', e);
            setPricingOptions([]);
            setSelectedPricingId('');
            setSelectedPricing(null);
        }
    }, [formData.checkin_date, formData.checkout_date]);

    // 의존 체인
    useEffect(() => {
        if (formData.checkin_date && formData.checkout_date) {
            loadHotelOptions();
        } else {
            setHotelOptions([]);
            setSelectedHotelId('');
            setSelectedHotelName('');
        }
    }, [formData.checkin_date, formData.checkout_date, loadHotelOptions]);

    useEffect(() => {
        if (selectedHotelId && formData.checkin_date && formData.checkout_date) {
            loadRoomOptions(selectedHotelId);
        } else {
            setRoomOptions([]);
            setSelectedRoomId('');
        }
    }, [selectedHotelId, formData.checkin_date, formData.checkout_date, loadRoomOptions]);

    useEffect(() => {
        if (selectedHotelId && selectedRoomId && formData.checkin_date && formData.checkout_date) {
            loadPricingOptions(selectedHotelId, selectedRoomId);
        } else {
            setPricingOptions([]);
            setSelectedPricingId('');
            setSelectedPricing(null);
        }
    }, [selectedHotelId, selectedRoomId, formData.checkin_date, formData.checkout_date, loadPricingOptions]);

    const isFormValid = useMemo(() => !!(formData.checkin_date && formData.checkout_date && selectedPricing), [formData.checkin_date, formData.checkout_date, selectedPricing]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!quoteId) return alert('견적 ID가 필요합니다.');
        if (!isFormValid) return;
        setLoading(true);
        try {
            const hotelData = {
                hotel_code: selectedPricing.hotel_price_code,
                checkin_date: formData.checkin_date,
                checkout_date: formData.checkout_date,
                base_price: 0,
                ...(formData.special_requests && { special_requests: formData.special_requests })
            };
            const { data: hotelServiceData, error: hotelError } = await supabase
                .from('hotel')
                .insert([hotelData])
                .select()
                .single();
            if (hotelError || !hotelServiceData?.id) throw hotelError || new Error('호텔 서비스 생성 실패');

            const unit = selectedPricing.base_price || 0;
            const { data: itemData, error: itemError } = await supabase
                .from('quote_item')
                .insert({
                    quote_id: quoteId,
                    service_type: 'hotel',
                    service_ref_id: hotelServiceData.id,
                    quantity: 1,
                    unit_price: unit,
                    total_price: unit,
                    usage_date: formData.checkin_date || null
                })
                .select()
                .single();
            if (itemError || !itemData?.id) throw itemError || new Error('견적 아이템 생성 실패');

            onSuccess?.({ itemId: itemData.id, serviceRefId: hotelServiceData.id });
            alert('호텔이 견적에 추가되었습니다!');
        } catch (err: any) {
            console.error('호텔 생성 오류:', err);
            alert(`오류가 발생했습니다: ${err?.message || '알 수 없는 오류'}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">호텔 정보 입력</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">체크인 *</label>
                    <input
                        type="date"
                        value={formData.checkin_date}
                        onChange={(e) => setFormData({ ...formData, checkin_date: e.target.value })}
                        className="w-full p-2 border border-gray-300 rounded text-sm"
                        required
                    />
                </div>
                <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">체크아웃 *</label>
                    <input
                        type="date"
                        value={formData.checkout_date}
                        onChange={(e) => setFormData({ ...formData, checkout_date: e.target.value })}
                        min={formData.checkin_date}
                        className="w-full p-2 border border-gray-300 rounded text-sm"
                        required
                    />
                </div>
            </div>

            {hotelOptions.length > 0 && (
                <div className="mt-3">
                    <label className="block text-xs font-medium text-gray-700 mb-1">호텔명 *</label>
                    <select
                        value={selectedHotelId}
                        onChange={(e) => {
                            const id = e.target.value;
                            setSelectedHotelId(id);
                            const hotel = hotelOptions.find((h: any) => h.hotel_code === id);
                            setSelectedHotelName(hotel?.hotel_name || '');
                        }}
                        className="w-full p-2 border border-gray-300 rounded text-sm"
                        required
                    >
                        <option value="">호텔을 선택하세요</option>
                        {hotelOptions.map((hotel: any) => (
                            <option key={hotel.hotel_code} value={hotel.hotel_code}>{hotel.hotel_name}</option>
                        ))}
                    </select>
                </div>
            )}

            {selectedHotelId && roomOptions.length > 0 && (
                <div className="mt-3">
                    <label className="block text-xs font-medium text-gray-700 mb-1">객실 *</label>
                    <select
                        value={selectedRoomId}
                        onChange={(e) => setSelectedRoomId(e.target.value)}
                        className="w-full p-2 border border-gray-300 rounded text-sm"
                        required
                    >
                        <option value="">객실을 선택하세요</option>
                        {roomOptions.map((room: any) => (
                            <option key={room.room_type} value={room.room_type}>{room.room_name} ({room.room_category})</option>
                        ))}
                    </select>
                </div>
            )}

            {pricingOptions.length > 1 && (
                <div className="mt-3">
                    <label className="block text-xs font-medium text-gray-700 mb-1">가격 옵션 *</label>
                    <select
                        value={selectedPricingId}
                        onChange={(e) => {
                            const id = e.target.value;
                            setSelectedPricingId(id);
                            setSelectedPricing(pricingOptions.find((p: any) => p.hotel_price_code === id) || null);
                        }}
                        className="w-full p-2 border border-gray-300 rounded text-sm"
                    >
                        {pricingOptions.map((p: any) => (
                            <option key={p.hotel_price_code} value={p.hotel_price_code}>
                                {p.season_name} / {p.weekday_type} - {p.base_price?.toLocaleString()}동
                            </option>
                        ))}
                    </select>
                </div>
            )}

            <div className="mt-3">
                <label className="block text-xs font-medium text-gray-700 mb-1">특별 요청사항</label>
                <textarea
                    value={formData.special_requests}
                    onChange={(e) => setFormData({ ...formData, special_requests: e.target.value })}
                    className="w-full p-2 border border-gray-300 rounded text-sm"
                    rows={3}
                    placeholder="특별한 요청사항이 있으시면 입력해주세요"
                />
            </div>

            {selectedPricing ? (
                <div className="mt-3 bg-yellow-50 border border-yellow-200 rounded p-2 text-xs text-yellow-800">
                    선택: <span className="font-mono">{selectedHotelName}</span> / {selectedPricing.season_name || selectedPricing.season_key} / <span className="font-bold">{selectedPricing.base_price?.toLocaleString()}동</span>
                </div>
            ) : null}

            <div className="flex justify-end gap-2 pt-4">
                <button
                    type="submit"
                    disabled={!isFormValid || loading}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 text-sm"
                >
                    {loading ? '처리 중...' : '견적에 추가'}
                </button>
            </div>
        </form>
    );
}
