'use client';

import React, { useEffect, useMemo, useState } from 'react';
import supabase from '@/lib/supabase';

type Props = {
    quoteId: string;
    onSuccess?: (payload: { itemId: string; serviceRefId: string }) => void;
};

export default function TourFormLite({ quoteId, onSuccess }: Props) {
    const [loading, setLoading] = useState(false);

    // 투어 목록 및 가격 옵션
    const [tourList, setTourList] = useState<any[]>([]);
    const [vehicleOptions, setVehicleOptions] = useState<string[]>([]);
    const [pricingOptions, setPricingOptions] = useState<any[]>([]);

    // 선택 값
    const [selectedTourId, setSelectedTourId] = useState('');
    const [selectedVehicle, setSelectedVehicle] = useState('');
    const [selectedPricingId, setSelectedPricingId] = useState('');

    const [formData, setFormData] = useState({
        tour_date: '',
        special_requests: ''
    });

    // 1단계: 투어 목록 로드 (tour 마스터 테이블)
    useEffect(() => {
        const loadTours = async () => {
            try {
                const { data, error } = await supabase
                    .from('tour')
                    .select('tour_id, tour_name, tour_code, category')
                    .eq('is_active', true)
                    .order('tour_name');
                if (error) throw error;
                setTourList(data || []);
            } catch (e) {
                console.error('투어 목록 로드 실패:', e);
            }
        };
        loadTours();
    }, []);

    // 2단계: 선택된 투어의 차량 옵션 로드 (tour_pricing 테이블)
    useEffect(() => {
        const run = async () => {
            if (!selectedTourId) {
                setVehicleOptions([]);
                setSelectedVehicle('');
                return;
            }
            try {
                const { data, error } = await supabase
                    .from('tour_pricing')
                    .select('vehicle_type')
                    .eq('tour_id', selectedTourId)
                    .eq('is_active', true)
                    .order('vehicle_type');
                if (error) throw error;
                const unique = [...new Set((data || []).map((d: any) => d.vehicle_type).filter(Boolean))] as string[];
                setVehicleOptions(unique);
            } catch (e) {
                console.error('차량 옵션 로드 실패:', e);
            }
        };
        run();
    }, [selectedTourId]);

    // 3단계: 투어 + 차량 조합의 인원/가격 옵션 로드
    useEffect(() => {
        const run = async () => {
            if (!selectedTourId || !selectedVehicle) {
                setPricingOptions([]);
                setSelectedPricingId('');
                return;
            }
            try {
                const { data, error } = await supabase
                    .from('tour_pricing')
                    .select('pricing_id, min_guests, max_guests, price_per_person')
                    .eq('tour_id', selectedTourId)
                    .eq('vehicle_type', selectedVehicle)
                    .eq('is_active', true)
                    .order('min_guests');
                if (error) throw error;
                setPricingOptions(data || []);
            } catch (e) {
                console.error('가격 옵션 로드 실패:', e);
            }
        };
        run();
    }, [selectedTourId, selectedVehicle]);

    const selectedTour = useMemo(() => tourList.find(t => t.tour_id === selectedTourId), [tourList, selectedTourId]);

    const isFormValid = useMemo(() => !!(selectedTourId && selectedVehicle && selectedPricingId && formData.tour_date), [selectedTourId, selectedVehicle, selectedPricingId, formData.tour_date]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!quoteId) return alert('견적 ID가 필요합니다.');
        if (!isFormValid || !selectedTour) return;
        setLoading(true);
        try {
            // 투어 서비스 생성
            const { data: tourServiceData, error: tourError } = await supabase
                .from('tour')
                .insert([
                    {
                        tour_code: selectedTour.tour_code,
                        tour_date: formData.tour_date,
                        ...(formData.special_requests && { special_requests: formData.special_requests })
                    }
                ])
                .select()
                .single();
            if (tourError || !tourServiceData?.id) throw tourError || new Error('투어 서비스 생성 실패');

            // 견적 아이템 생성
            const { data: itemData, error: itemError } = await supabase
                .from('quote_item')
                .insert({
                    quote_id: quoteId,
                    service_type: 'tour',
                    service_ref_id: tourServiceData.id,
                    quantity: 1,
                    unit_price: 0,
                    total_price: 0,
                    usage_date: formData.tour_date || null
                })
                .select()
                .single();
            if (itemError || !itemData?.id) throw itemError || new Error('견적 아이템 생성 실패');

            // 성공 콜백 + 폼 초기화 유지
            onSuccess?.({ itemId: itemData.id, serviceRefId: tourServiceData.id });
            alert('투어가 견적에 추가되었습니다!');
        } catch (err: any) {
            console.error('투어 생성 오류:', err);
            alert(`오류가 발생했습니다: ${err?.message || '알 수 없는 오류'}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">투어 정보 입력</h2>

            <div className="space-y-4">
                <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">투어명 *</label>
                    <select
                        value={selectedTourId}
                        onChange={(e) => { setSelectedTourId(e.target.value); setSelectedVehicle(''); setSelectedPricingId(''); }}
                        className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                        required
                    >
                        <option value="">투어명을 선택하세요</option>
                        {tourList.map((tour) => (
                            <option key={tour.tour_id} value={tour.tour_id}>{tour.tour_name} ({tour.category})</option>
                        ))}
                    </select>
                </div>

                {selectedTourId && vehicleOptions.length > 0 ? (
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">차량 *</label>
                        <select
                            value={selectedVehicle}
                            onChange={(e) => { setSelectedVehicle(e.target.value); setSelectedPricingId(''); }}
                            className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                            required
                        >
                            <option value="">차량을 선택하세요</option>
                            {vehicleOptions.map((v) => (
                                <option key={v} value={v}>{v}</option>
                            ))}
                        </select>
                    </div>
                ) : null}

                {selectedVehicle && pricingOptions.length > 0 ? (
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">인원/가격 선택 *</label>
                        <select
                            value={selectedPricingId}
                            onChange={(e) => setSelectedPricingId(e.target.value)}
                            className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                            required
                        >
                            <option value="">인원 및 가격을 선택하세요</option>
                            {pricingOptions.map((p) => (
                                <option key={p.pricing_id} value={p.pricing_id}>
                                    {p.min_guests === p.max_guests ? `${p.min_guests}명` : `${p.min_guests}-${p.max_guests}명`} - {Number(p.price_per_person).toLocaleString()}동/인
                                </option>
                            ))}
                        </select>
                    </div>
                ) : null}

                <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">투어 날짜 *</label>
                    <input
                        type="date"
                        value={formData.tour_date}
                        onChange={(e) => setFormData({ ...formData, tour_date: e.target.value })}
                        className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                        required
                    />
                </div>

                <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">특별 요청사항</label>
                    <textarea
                        value={formData.special_requests}
                        onChange={(e) => setFormData({ ...formData, special_requests: e.target.value })}
                        className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                        rows={3}
                        placeholder="특별한 요청사항이 있으시면 입력해주세요"
                    />
                </div>

                {selectedPricingId ? (
                    <div className="bg-yellow-50 border border-yellow-200 rounded p-2 text-xs text-yellow-800">
                        선택된 가격 ID: <span className="font-mono">{selectedPricingId}</span>
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
