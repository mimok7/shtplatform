'use client';

import React, { useEffect, useMemo, useState } from 'react';
import supabase from '@/lib/supabase';

type ApplyType = 'pickup' | 'sending' | 'both';

type Props = {
    quoteId: string;
    onSuccess?: () => void;
};

export default function AirportFormLite({ quoteId, onSuccess }: Props) {
    const [loading, setLoading] = useState(false);
    const [applyType, setApplyType] = useState<ApplyType>('pickup');

    const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
    const [routeOptions, setRouteOptions] = useState<string[]>([]);
    const [carTypeOptions, setCarTypeOptions] = useState<string[]>([]);
    const [routeOptions2, setRouteOptions2] = useState<string[]>([]);
    const [carTypeOptions2, setCarTypeOptions2] = useState<string[]>([]);

    const [selectedCategory, setSelectedCategory] = useState('');
    const [selectedRoute, setSelectedRoute] = useState('');
    const [selectedCarType, setSelectedCarType] = useState('');
    const [selectedCategory2, setSelectedCategory2] = useState('');
    const [selectedRoute2, setSelectedRoute2] = useState('');
    const [selectedCarType2, setSelectedCarType2] = useState('');

    const [selectedAirportCode, setSelectedAirportCode] = useState('');
    const [selectedAirportCode2, setSelectedAirportCode2] = useState('');
    const [specialRequests, setSpecialRequests] = useState('');

    // 초기 카테고리 로드
    useEffect(() => {
        const loadCategoryOptions = async () => {
            try {
                const { data, error } = await supabase.from('airport_price').select('service_type').order('service_type');
                if (error) throw error;
                const unique = [...new Set((data || []).map((d: any) => d.service_type).filter(Boolean))] as string[];
                setCategoryOptions(unique);
            } catch (e) {
                console.error('공항 카테고리 로드 실패:', e);
            }
        };
        loadCategoryOptions();
    }, []);

    const getCategoryFromApplyType = (t: ApplyType) => (t === 'pickup' || t === 'both' ? '픽업' : '샌딩');
    const getCategory2FromApplyType = (t: ApplyType) => (t === 'both' ? '샌딩' : '');

    // applyType 변경 시 자동 카테고리 설정
    useEffect(() => {
        const c1 = getCategoryFromApplyType(applyType);
        const c2 = getCategory2FromApplyType(applyType);
        setSelectedCategory(c1);
        setSelectedCategory2(c2);
    }, [applyType]);

    // 경로/차량 타입 옵션 로드
    useEffect(() => {
        const run = async () => {
            if (!selectedCategory) {
                setRouteOptions([]); setSelectedRoute(''); return;
            }
            try {
                const { data, error } = await supabase.from('airport_price').select('route').eq('service_type', selectedCategory).order('route');
                if (error) throw error;
                const unique = [...new Set((data || []).map((d: any) => d.route).filter(Boolean))] as string[];
                setRouteOptions(unique);
            } catch (e) { console.error('공항 경로 옵션 로드 실패:', e); }
        };
        run();
    }, [selectedCategory]);

    useEffect(() => {
        const run = async () => {
            if (!(selectedCategory && selectedRoute)) {
                setCarTypeOptions([]); setSelectedCarType(''); return;
            }
            try {
                const { data, error } = await supabase
                    .from('airport_price')
                    .select('vehicle_type')
                    .eq('service_type', selectedCategory)
                    .eq('route', selectedRoute)
                    .order('vehicle_type');
                if (error) throw error;
                const unique = [...new Set((data || []).map((d: any) => d.vehicle_type).filter(Boolean))] as string[];
                setCarTypeOptions(unique);
            } catch (e) { console.error('공항 차량 타입 옵션 로드 실패:', e); }
        };
        run();
    }, [selectedCategory, selectedRoute]);

    // B 블록 옵션 로드
    useEffect(() => {
        const run = async () => {
            if (!selectedCategory2) { setRouteOptions2([]); setSelectedRoute2(''); return; }
            try {
                const { data, error } = await supabase.from('airport_price').select('route').eq('service_type', selectedCategory2).order('route');
                if (error) throw error;
                const unique = [...new Set((data || []).map((d: any) => d.route).filter(Boolean))] as string[];
                setRouteOptions2(unique);
            } catch (e) { setRouteOptions2([]); }
        };
        run();
    }, [selectedCategory2]);

    useEffect(() => {
        const run = async () => {
            if (!(selectedCategory2 && selectedRoute2)) { setCarTypeOptions2([]); setSelectedCarType2(''); return; }
            try {
                const { data, error } = await supabase
                    .from('airport_price')
                    .select('vehicle_type')
                    .eq('service_type', selectedCategory2)
                    .eq('route', selectedRoute2)
                    .order('vehicle_type');
                if (error) throw error;
                const unique = [...new Set((data || []).map((d: any) => d.vehicle_type).filter(Boolean))] as string[];
                setCarTypeOptions2(unique);
            } catch (e) { setCarTypeOptions2([]); }
        };
        run();
    }, [selectedCategory2, selectedRoute2]);

    // 코드 조회
    useEffect(() => {
        const run = async () => {
            if (!(selectedCategory && selectedRoute && selectedCarType)) { setSelectedAirportCode(''); return; }
            try {
                const { data, error } = await supabase
                    .from('airport_price')
                    .select('airport_code')
                    .eq('service_type', selectedCategory)
                    .eq('route', selectedRoute)
                    .eq('vehicle_type', selectedCarType)
                    .single();
                if (error) throw error;
                setSelectedAirportCode(data?.airport_code || '');
            } catch { setSelectedAirportCode(''); }
        };
        run();
    }, [selectedCategory, selectedRoute, selectedCarType]);

    useEffect(() => {
        const run = async () => {
            if (!(selectedCategory2 && selectedRoute2 && selectedCarType2)) { setSelectedAirportCode2(''); return; }
            try {
                const { data, error } = await supabase
                    .from('airport_price')
                    .select('airport_code')
                    .eq('service_type', selectedCategory2)
                    .eq('route', selectedRoute2)
                    .eq('vehicle_type', selectedCarType2)
                    .single();
                if (error) throw error;
                setSelectedAirportCode2(data?.airport_code || '');
            } catch { setSelectedAirportCode2(''); }
        };
        run();
    }, [selectedCategory2, selectedRoute2, selectedCarType2]);

    const isMainValid = useMemo(() => !!(selectedCategory && selectedRoute && selectedCarType), [selectedCategory, selectedRoute, selectedCarType]);
    const isExtraValid = useMemo(() => applyType !== 'both' || !!(selectedCategory2 && selectedRoute2 && selectedCarType2), [applyType, selectedCategory2, selectedRoute2, selectedCarType2]);
    const isFormValid = isMainValid && isExtraValid;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!quoteId) return alert('견적 ID가 필요합니다.');
        if (!isFormValid) return;
        setLoading(true);
        try {
            const insertOne = async (category: string, route: string, carType: string, withNote: boolean) => {
                const { data: codeRow, error: codeErr } = await supabase
                    .from('airport_price')
                    .select('airport_code')
                    .eq('service_type', category)
                    .eq('route', route)
                    .eq('vehicle_type', carType)
                    .single();
                if (codeErr || !codeRow?.airport_code) throw codeErr || new Error('공항 코드 조회 실패');
                const { data: airportServiceData, error: airportError } = await supabase
                    .from('airport')
                    .insert({
                        airport_code: codeRow.airport_code,
                        special_requests: withNote ? (specialRequests?.trim() || null) : null
                    })
                    .select()
                    .single();
                if (airportError || !airportServiceData?.id) throw airportError || new Error('공항 서비스 생성 실패');

                // 공항 단가 조회 (airport_price에서 airport_code 기준)
                let unitPrice = 0;
                try {
                    const { data: priceRow } = await supabase
                        .from('airport_price')
                        .select('price')
                        .eq('airport_code', codeRow.airport_code)
                        .maybeSingle();
                    if (priceRow && priceRow.price != null) unitPrice = Number(priceRow.price) || 0;
                } catch (e) {
                    console.warn('공항 단가 조회 실패, 0 사용', e);
                    unitPrice = 0;
                }

                const totalPrice = unitPrice * 1;
                const { error: itemError } = await supabase
                    .from('quote_item')
                    .insert({
                        quote_id: quoteId,
                        service_type: 'airport',
                        service_ref_id: airportServiceData.id,
                        quantity: 1,
                        unit_price: unitPrice,
                        total_price: totalPrice
                    });
                if (itemError) throw itemError;
            };

            // 메인
            await insertOne(selectedCategory, selectedRoute, selectedCarType, true);
            // 추가
            if (applyType === 'both') {
                await insertOne(selectedCategory2, selectedRoute2, selectedCarType2, false);
            }

            alert('공항 서비스가 견적에 추가되었습니다!');
            onSuccess?.();
        } catch (err: any) {
            console.error('공항 생성 오류:', err);
            alert(`오류가 발생했습니다: ${err?.message || '알 수 없는 오류'}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">공항 정보 입력</h2>

            <div className="space-y-3">
                <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">신청 종류</label>
                    <div className="flex gap-2">
                        {(['both', 'pickup', 'sending'] as ApplyType[]).map((t) => (
                            <button
                                key={t}
                                type="button"
                                onClick={() => {
                                    setApplyType(t);
                                    if (t !== 'both') { setSelectedRoute2(''); setSelectedCarType2(''); setRouteOptions2([]); setCarTypeOptions2([]); setSelectedAirportCode2(''); }
                                }}
                                className={`px-3 py-2 rounded border text-xs ${applyType === t ? 'bg-blue-600 text-white border-blue-600' : 'bg-gray-50 text-gray-700 border-gray-300 hover:bg-gray-100'}`}
                            >
                                {t === 'pickup' ? '픽업만' : t === 'sending' ? '샌딩만' : '픽업+샌딩'}
                            </button>
                        ))}
                    </div>
                </div>

                {selectedCategory ? (
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">공항 경로 ({applyType === 'both' ? '픽업' : applyType === 'pickup' ? '픽업' : '샌딩'}) *</label>
                        <select value={selectedRoute} onChange={(e) => setSelectedRoute(e.target.value)} className="w-full p-2 border border-gray-300 rounded text-sm" required>
                            <option value="">경로를 선택하세요</option>
                            {routeOptions.map((r) => (<option key={r} value={r}>{r}</option>))}
                        </select>
                    </div>
                ) : null}

                {selectedCategory && selectedRoute ? (
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">차량 타입 ({applyType === 'both' ? '픽업' : applyType === 'pickup' ? '픽업' : '샌딩'}) *</label>
                        <select value={selectedCarType} onChange={(e) => setSelectedCarType(e.target.value)} className="w-full p-2 border border-gray-300 rounded text-sm" required>
                            <option value="">차량 타입을 선택하세요</option>
                            {carTypeOptions.map((t) => (<option key={t} value={t}>{t}</option>))}
                        </select>
                    </div>
                ) : null}

                {applyType === 'both' ? (
                    <div className="mt-3 border-t pt-3">
                        <h4 className="text-sm font-medium text-gray-800 mb-2">추가 서비스 (샌딩)</h4>
                        <div className="space-y-3">
                            {selectedCategory2 ? (
                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">공항 경로 (샌딩) *</label>
                                    <select value={selectedRoute2} onChange={(e) => setSelectedRoute2(e.target.value)} className="w-full p-2 border border-gray-300 rounded text-sm">
                                        <option value="">경로를 선택하세요</option>
                                        {routeOptions2.map((r) => (<option key={r} value={r}>{r}</option>))}
                                    </select>
                                </div>
                            ) : null}
                            {selectedCategory2 && selectedRoute2 ? (
                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">차량 타입 (샌딩) *</label>
                                    <select value={selectedCarType2} onChange={(e) => setSelectedCarType2(e.target.value)} className="w-full p-2 border border-gray-300 rounded text-sm">
                                        <option value="">차량 타입을 선택하세요</option>
                                        {carTypeOptions2.map((t) => (<option key={t} value={t}>{t}</option>))}
                                    </select>
                                </div>
                            ) : null}
                        </div>
                    </div>
                ) : null}

                <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">특별 요청사항</label>
                    <textarea value={specialRequests} onChange={(e) => setSpecialRequests(e.target.value)} className="w-full p-2 border border-gray-300 rounded text-sm" rows={3} placeholder="짐의 수량, 카시트 등" />
                </div>

                {(selectedAirportCode || selectedAirportCode2) ? (
                    <div className="bg-yellow-50 border border-yellow-200 rounded p-2 text-xs text-yellow-800">
                        {selectedAirportCode ? (<div>선택된 공항 코드(메인): <span className="font-mono">{selectedAirportCode}</span></div>) : null}
                        {selectedAirportCode2 ? (<div>선택된 공항 코드(추가): <span className="font-mono">{selectedAirportCode2}</span></div>) : null}
                    </div>
                ) : null}
            </div>

            <div className="flex justify-end gap-2 pt-4">
                <button type="submit" disabled={!isFormValid || loading} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 text-sm">
                    {loading ? '처리 중...' : '견적에 추가'}
                </button>
            </div>
        </form>
    );
}
