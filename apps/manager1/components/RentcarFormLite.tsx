'use client';

import React, { useEffect, useMemo, useState } from 'react';
import supabase from '@/lib/supabase';

type Props = {
    quoteId: string;
    onSuccess?: (payload: { itemId: string; serviceRefId: string }) => void;
};

export default function RentcarFormLite({ quoteId, onSuccess }: Props) {
    const [loading, setLoading] = useState(false);

    const [routeOptions, setRouteOptions] = useState<string[]>([]);
    const [carTypeOptions, setCarTypeOptions] = useState<string[]>([]);

    const [selectedCategory, setSelectedCategory] = useState('');
    const [selectedRoute, setSelectedRoute] = useState('');
    const [selectedCarType, setSelectedCarType] = useState('');

    const [selectedRentCode, setSelectedRentCode] = useState('');
    const [specialRequests, setSpecialRequests] = useState('');

    useEffect(() => {
        if (!selectedCategory) {
            setRouteOptions([]);
            setSelectedRoute('');
            return;
        }
        const loadRouteOptions = async () => {
            try {
                const { data, error } = await supabase
                    .from('rentcar_price')
                    .select('route')
                    .eq('way_type', selectedCategory)
                    .order('route');
                if (error) throw error;
                const uniqueRoutes = [...new Set((data || []).map((item: any) => item.route).filter(Boolean))] as string[];
                setRouteOptions(uniqueRoutes);
            } catch (e) {
                console.error('렌트카 경로 옵션 로드 실패:', e);
            }
        };
        loadRouteOptions();
    }, [selectedCategory]);

    useEffect(() => {
        if (!(selectedCategory && selectedRoute)) {
            setCarTypeOptions([]);
            setSelectedCarType('');
            return;
        }
        const loadCarTypeOptions = async () => {
            try {
                const { data, error } = await supabase
                    .from('rentcar_price')
                    .select('vehicle_type')
                    .eq('way_type', selectedCategory)
                    .eq('route', selectedRoute)
                    .order('vehicle_type');
                if (error) throw error;
                const uniqueCarTypes = [...new Set((data || []).map((item: any) => item.vehicle_type).filter(Boolean))] as string[];
                setCarTypeOptions(uniqueCarTypes);
            } catch (e) {
                console.error('렌트카 차량 타입 옵션 로드 실패:', e);
            }
        };
        loadCarTypeOptions();
    }, [selectedCategory, selectedRoute]);

    useEffect(() => {
        const run = async () => {
            if (!(selectedCategory && selectedRoute && selectedCarType)) {
                setSelectedRentCode('');
                return;
            }
            try {
                const { data, error } = await supabase
                    .from('rentcar_price')
                    .select('rent_code')
                    .eq('way_type', selectedCategory)
                    .eq('route', selectedRoute)
                    .eq('vehicle_type', selectedCarType)
                    .single();
                if (error) throw error;
                setSelectedRentCode(data?.rent_code || '');
            } catch (e) {
                console.error('rent_code 조회 실패:', e);
                setSelectedRentCode('');
            }
        };
        run();
    }, [selectedCategory, selectedRoute, selectedCarType]);

    const isFormValid = useMemo(() => !!(selectedCategory && selectedRoute && selectedCarType), [selectedCategory, selectedRoute, selectedCarType]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!quoteId) return alert('견적 ID가 필요합니다.');
        if (!isFormValid) return;
        setLoading(true);
        try {
            const { data: codeRow, error: codeErr } = await supabase
                .from('rentcar_price')
                .select('rent_code')
                .eq('way_type', selectedCategory)
                .eq('route', selectedRoute)
                .eq('vehicle_type', selectedCarType)
                .single();
            if (codeErr || !codeRow?.rent_code) throw codeErr || new Error('렌트 코드 조회 실패');

            const { data: rentcarServiceData, error: rentcarError } = await supabase
                .from('rentcar')
                .insert([
                    {
                        rentcar_code: codeRow.rent_code,
                        ...(specialRequests && { special_requests: specialRequests })
                    }
                ])
                .select()
                .single();
            if (rentcarError || !rentcarServiceData?.id) throw rentcarError || new Error('렌트카 서비스 생성 실패');

            // 가능한 단가 조회 (rentcar_price에서 rent_code로 조회)
            let unitPrice = 0;
            try {
                const { data: priceRow } = await supabase
                    .from('rentcar_price')
                    .select('price')
                    .eq('rent_code', codeRow.rent_code)
                    .maybeSingle();
                if (priceRow && priceRow.price != null) unitPrice = Number(priceRow.price) || 0;
            } catch (e) {
                console.warn('렌트카 단가 조회 실패, 0 사용', e);
                unitPrice = 0;
            }

            const totalPrice = unitPrice * 1;

            const { data: itemData, error: itemError } = await supabase
                .from('quote_item')
                .insert({
                    quote_id: quoteId,
                    service_type: 'rentcar',
                    service_ref_id: rentcarServiceData.id,
                    quantity: 1,
                    unit_price: unitPrice,
                    total_price: totalPrice
                })
                .select()
                .single();
            if (itemError || !itemData?.id) throw itemError || new Error('견적 아이템 생성 실패');

            onSuccess?.({ itemId: itemData.id, serviceRefId: rentcarServiceData.id });
            alert('렌트카 서비스가 견적에 추가되었습니다!');
        } catch (err: any) {
            console.error('렌트카 생성 오류:', err);
            alert(`오류가 발생했습니다: ${err?.message || '알 수 없는 오류'}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">렌트카 정보 입력</h2>

            <div className="space-y-3">
                <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">이용방식 *</label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {['편도', '당일왕복', '다른날왕복', '시내당일렌트'].map((c) => (
                            <button
                                key={c}
                                type="button"
                                onClick={() => setSelectedCategory(c)}
                                className={`p-2 rounded border text-sm ${selectedCategory === c ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white hover:border-blue-300 text-gray-700'}`}
                            >
                                {c}
                            </button>
                        ))}
                    </div>
                </div>

                {selectedCategory ? (
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">경로 *</label>
                        <select
                            value={selectedRoute}
                            onChange={(e) => setSelectedRoute(e.target.value)}
                            className="w-full p-2 border border-gray-300 rounded text-sm"
                            required
                        >
                            <option value="">경로를 선택하세요</option>
                            {routeOptions.map((r) => (
                                <option key={r} value={r}>{r}</option>
                            ))}
                        </select>
                    </div>
                ) : null}

                {selectedCategory && selectedRoute ? (
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">차량 타입 *</label>
                        <select
                            value={selectedCarType}
                            onChange={(e) => setSelectedCarType(e.target.value)}
                            className="w-full p-2 border border-gray-300 rounded text-sm"
                            required
                        >
                            <option value="">차량 타입을 선택하세요</option>
                            {carTypeOptions.map((t) => (
                                <option key={t} value={t}>{t}</option>
                            ))}
                        </select>
                    </div>
                ) : null}

                <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">특별 요청사항</label>
                    <textarea
                        value={specialRequests}
                        onChange={(e) => setSpecialRequests(e.target.value)}
                        className="w-full p-2 border border-gray-300 rounded text-sm"
                        rows={3}
                        placeholder="네비게이션, 차일드시트, 픽업/반납 위치 등"
                    />
                </div>

                {selectedRentCode ? (
                    <div className="bg-yellow-50 border border-yellow-200 rounded p-2 text-xs text-yellow-800">
                        선택된 렌트 코드: <span className="font-mono">{selectedRentCode}</span>
                    </div>
                ) : null}
            </div>

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
