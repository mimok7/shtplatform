'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import supabase from '../../../../../lib/supabase';
import { getSessionUser } from '../../../../../lib/authHelpers';
import PageWrapper from '../../../../../components/PageWrapper';
import SectionBox from '../../../../../components/SectionBox';

function AirportPriceContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const quoteId = searchParams.get('quoteId'); // URL에서 가격 ID 가져오기

    const [loading, setLoading] = useState(false);
    const [existingQuoteData, setExistingQuoteData] = useState<any>(null);

    // 단계별 옵션들 (airport_price 테이블 기준)
    const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
    // A(첫 서비스), B(추가 서비스) 각각의 경로/차량타입 옵션
    const [routeOptions, setRouteOptions] = useState<string[]>([]);
    const [carTypeOptions, setCarTypeOptions] = useState<string[]>([]);
    const [routeOptions2, setRouteOptions2] = useState<string[]>([]);
    const [carTypeOptions2, setCarTypeOptions2] = useState<string[]>([]);

    // 서비스 종류: pickup, sending, both
    const [applyType, setApplyType] = useState<'pickup' | 'sending' | 'both'>('pickup');

    // 선택된 값들 - A(메인), B(추가)
    const [selectedCategory, setSelectedCategory] = useState('');
    const [selectedRoute, setSelectedRoute] = useState('');
    const [selectedCarType, setSelectedCarType] = useState('');
    const [selectedCategory2, setSelectedCategory2] = useState('');
    const [selectedRoute2, setSelectedRoute2] = useState('');
    const [selectedCarType2, setSelectedCarType2] = useState('');

    // 신청 종류에 따른 자동 카테고리 매핑
    const getCategoryFromApplyType = (type: 'pickup' | 'sending' | 'both') => {
        switch (type) {
            case 'pickup': return '픽업';
            case 'sending': return '샌딩';
            case 'both': return '픽업'; // both일 때는 첫 번째가 픽업
            default: return '';
        }
    };

    const getCategory2FromApplyType = (type: 'pickup' | 'sending' | 'both') => {
        return type === 'both' ? '샌딩' : '';
    };

    const [selectedAirportCode, setSelectedAirportCode] = useState(''); // A 코드 표시용
    const [selectedAirportCode2, setSelectedAirportCode2] = useState(''); // B 코드 표시용

    const [formData, setFormData] = useState({
        vehicle_count: 1,
        additional_note: ''
    });

    useEffect(() => {
        loadCategoryOptions();

        // 가격 ID가 있으면 기존 데이터 로드, 없으면 다이렉트 홈으로 리다이렉트
        if (quoteId) {
            loadExistingQuote();
        } else {
            alert('잘못된 접근입니다. 다이렉트 예약 메인 페이지에서 시작해주세요.');
            router.push('/mypage/direct-booking');
        }
    }, [quoteId]);

    // 카테고리 선택 시 경로 옵션 업데이트 (A)
    useEffect(() => {
        if (selectedCategory) {
            loadRouteOptions(selectedCategory);
            // 카테고리가 변경되면 하위 선택값들 리셋
            setSelectedRoute('');
            setSelectedCarType('');
            setSelectedAirportCode('');
        } else {
            setRouteOptions([]);
            setSelectedRoute('');
            setSelectedCarType('');
            setSelectedAirportCode('');
        }
    }, [selectedCategory]);    // 카테고리와 경로가 선택될 때 차량 타입 목록 업데이트 (A)
    useEffect(() => {
        if (selectedCategory && selectedRoute) {
            loadCarTypeOptions(selectedCategory, selectedRoute);
            // 경로가 변경되면 차량 타입과 코드 리셋
            setSelectedCarType('');
            setSelectedAirportCode('');
        } else {
            setCarTypeOptions([]);
            setSelectedCarType('');
            setSelectedAirportCode('');
        }
    }, [selectedCategory, selectedRoute]);

    // 모든 조건이 선택되면 공항 코드 조회 (A)
    useEffect(() => {
        if (selectedCategory && selectedRoute && selectedCarType) {
            getAirportCodeFromConditions(selectedCategory, selectedRoute, selectedCarType)
                .then(code => setSelectedAirportCode(code))
                .catch(() => setSelectedAirportCode(''));
        } else {
            setSelectedAirportCode('');
        }
    }, [selectedCategory, selectedRoute, selectedCarType]);

    // 카테고리 선택 시 경로 옵션 업데이트 (B)
    useEffect(() => {
        if (selectedCategory2) {
            // 별도 래퍼를 사용하여 B 서비스의 경로 옵션 로드
            (async () => {
                try {
                    const { data, error } = await supabase
                        .from('airport_price')
                        .select('airport_route')
                        .eq('airport_category', selectedCategory2)
                        .order('airport_route');
                    if (error) throw error;
                    const uniqueRoutes = [...new Set((data || []).map((item: any) => item.airport_route).filter(Boolean))] as string[];
                    setRouteOptions2(uniqueRoutes);
                } catch (error) {
                    console.error('B서비스 경로 옵션 로드 오류:', error);
                    setRouteOptions2([]);
                }
            })();

            // 카테고리가 변경되면 하위 선택값들 리셋
            setSelectedRoute2('');
            setSelectedCarType2('');
            setSelectedAirportCode2('');
        } else {
            setRouteOptions2([]);
            setSelectedRoute2('');
            setSelectedCarType2('');
            setSelectedAirportCode2('');
        }
    }, [selectedCategory2]);

    // 카테고리와 경로가 선택될 때 차량 타입 목록 업데이트 (B)
    useEffect(() => {
        if (selectedCategory2 && selectedRoute2) {
            (async () => {
                try {
                    const { data, error } = await supabase
                        .from('airport_price')
                        .select('airport_car_type')
                        .eq('airport_category', selectedCategory2)
                        .eq('airport_route', selectedRoute2)
                        .order('airport_car_type');
                    if (error) throw error;
                    const uniqueCarTypes = [...new Set((data || []).map((item: any) => item.airport_car_type).filter(Boolean))] as string[];
                    setCarTypeOptions2(uniqueCarTypes);
                } catch {
                    setCarTypeOptions2([]);
                }
            })();

            // 경로가 변경되면 차량 타입과 코드 리셋
            setSelectedCarType2('');
            setSelectedAirportCode2('');
        } else {
            setCarTypeOptions2([]);
            setSelectedCarType2('');
            setSelectedAirportCode2('');
        }
    }, [selectedCategory2, selectedRoute2]);

    // 모든 조건이 선택되면 공항 코드 조회 (B)
    useEffect(() => {
        if (selectedCategory2 && selectedRoute2 && selectedCarType2) {
            getAirportCodeFromConditions(selectedCategory2, selectedRoute2, selectedCarType2)
                .then(code => setSelectedAirportCode2(code))
                .catch(() => setSelectedAirportCode2(''));
        } else {
            setSelectedAirportCode2('');
        }
    }, [selectedCategory2, selectedRoute2, selectedCarType2]);

    // 기존 가격 데이터 로드
    const loadExistingQuote = async () => {
        try {
            const { user, error: userError } = await getSessionUser(8000);
            if (userError || !user) {
                alert('로그인이 필요합니다.');
                router.push('/login');
                return;
            }

            console.log('📋 기존 가격 로드 시작:', quoteId);

            const { data: quoteData, error: quoteError } = await supabase
                .from('quote')
                .select('*')
                .eq('id', quoteId) // quote_id 대신 id 사용
                .eq('user_id', user.id)
                .single();

            if (quoteError) {
                console.error('❌ 가격 조회 오류:', quoteError);
                alert('가격 정보를 찾을 수 없습니다. 다이렉트 예약 메인으로 이동합니다.');
                router.push('/mypage/direct-booking');
                return;
            }

            console.log('✅ 가격 로드 성공:', quoteData);
            setExistingQuoteData(quoteData);
        } catch (error) {
            console.error('❌ 기존 가격 로드 오류:', error);
            alert('가격 로드 중 오류가 발생했습니다.');
            router.push('/mypage/direct-booking');
        }
    };

    // applyType 변경 시 자동 카테고리 매핑 및 하위 값들 리셋
    useEffect(() => {
        const autoCategory = getCategoryFromApplyType(applyType);
        setSelectedCategory(autoCategory);

        // 하위 선택값들 리셋
        setSelectedRoute('');
        setSelectedCarType('');
        setSelectedAirportCode('');

        const autoCategory2 = getCategory2FromApplyType(applyType);
        setSelectedCategory2(autoCategory2);

        // 추가 서비스 하위 선택값들도 리셋
        setSelectedRoute2('');
        setSelectedCarType2('');
        setSelectedAirportCode2('');
    }, [applyType]);    // 카테고리 옵션 로드
    const loadCategoryOptions = async () => {
        try {
            const { data, error } = await supabase
                .from('airport_price')
                .select('airport_category')
                .order('airport_category');

            if (error) throw error;

            const uniqueCategories = [...new Set((data || []).map((item: any) => item.airport_category).filter(Boolean))] as string[];
            setCategoryOptions(uniqueCategories);
        } catch (error) {
            console.error('카테고리 옵션 로드 오류:', error);
        }
    };

    // 경로 옵션 로드
    const loadRouteOptions = async (category: string) => {
        try {
            const { data, error } = await supabase
                .from('airport_price')
                .select('airport_route')
                .eq('airport_category', category)
                .order('airport_route');

            if (error) throw error;

            const uniqueRoutes = [...new Set((data || []).map((item: any) => item.airport_route).filter(Boolean))] as string[];
            setRouteOptions(uniqueRoutes);
        } catch (error) {
            console.error('경로 옵션 로드 오류:', error);
        }
    };

    // 차량 타입 옵션 로드
    const loadCarTypeOptions = async (category: string, route: string) => {
        try {
            const { data, error } = await supabase
                .from('airport_price')
                .select('airport_car_type')
                .eq('airport_category', category)
                .eq('airport_route', route)
                .order('airport_car_type');

            if (error) throw error;

            const uniqueCarTypes = [...new Set((data || []).map((item: any) => item.airport_car_type).filter(Boolean))] as string[];
            setCarTypeOptions(uniqueCarTypes);
        } catch (error) {
            console.error('차량 타입 옵션 로드 오류:', error);
        }
    };

    // 조건으로 공항 코드 조회
    const getAirportCodeFromConditions = async (category: string, route: string, carType: string) => {
        try {
            const { data, error } = await supabase
                .from('airport_price')
                .select('airport_code')
                .eq('airport_category', category)
                .eq('airport_route', route)
                .eq('airport_car_type', carType)
                .maybeSingle();

            if (error) throw error;
            return data?.airport_code || '';
        } catch (error) {
            console.error('공항 코드 조회 오류:', error);
            return '';
        }
    };

    // 가격 조회
    const getPriceFromCode = async (airportCode: string) => {
        try {
            const { data, error } = await supabase
                .from('airport_price')
                .select('price')
                .eq('airport_code', airportCode)
                .maybeSingle();

            if (error) throw error;
            return data?.price || 0;
        } catch (error) {
            console.error('가격 조회 오류:', error);
            return 0;
        }
    };

    // 폼 제출
    const handleSubmit = async () => {
        if (!selectedAirportCode) {
            alert('주 서비스를 선택해주세요.');
            return;
        }

        if (!existingQuoteData) {
            alert('가격 정보가 없습니다. 페이지를 새로고침해주세요.');
            return;
        }

        setLoading(true);

        try {
            const { user, error: userError } = await getSessionUser(8000);
            if (userError || !user) {
                alert('로그인이 필요합니다.');
                router.push('/login');
                return;
            }

            const currentDate = new Date().toISOString().split('T')[0];

            // 공항 서비스 1: 메인 서비스 (기존 가격에 추가)
            console.log('공항 서비스 1 생성 시도 (기존 가격에 추가):', {
                quote_id: existingQuoteData.id,
                airport_code: selectedAirportCode,
                passenger_count: 1,
                special_requests: formData.additional_note || ''
            });

            const { data: airportData1, error: airportError1 } = await supabase
                .from('airport')
                .insert({
                    airport_code: selectedAirportCode,
                    passenger_count: 1,
                    special_requests: formData.additional_note || ''
                })
                .select()
                .single();

            if (airportError1) {
                console.error('공항 서비스 1 생성 오류:', airportError1);
                alert(`공항 서비스 생성 중 오류가 발생했습니다: ${airportError1?.message || '알 수 없는 오류'}`);
                return;
            }

            // quote_item 1: 메인 서비스 (기존 가격의 ID 사용)
            const price1 = await getPriceFromCode(selectedAirportCode);
            const { error: itemError1 } = await supabase
                .from('quote_item')
                .insert({
                    quote_id: existingQuoteData.id,
                    service_type: 'airport',
                    service_ref_id: airportData1.id,
                    quantity: formData.vehicle_count,
                    unit_price: price1,
                    total_price: price1 * formData.vehicle_count,
                    usage_date: currentDate
                });

            if (itemError1) {
                console.error('가격 아이템 1 생성 오류:', itemError1);
            }

            // 공항 서비스 2: 추가 서비스 (기존 가격에 추가)
            if (selectedAirportCode2) {
                console.log('공항 서비스 2 생성 시도 (기존 가격에 추가):', {
                    quote_id: existingQuoteData.id,
                    airport_price_code: selectedAirportCode2,
                    vehicle_count: 1,
                    request_note: `추가 서비스: ${selectedCategory2} ${selectedRoute2} ${selectedCarType2}`
                });

                const { data: airportData2, error: airportError2 } = await supabase
                    .from('airport')
                    .insert({
                        airport_price_code: selectedAirportCode2,
                        vehicle_count: 1,
                        request_note: `추가 서비스: ${selectedCategory2} ${selectedRoute2} ${selectedCarType2}`
                    })
                    .select()
                    .single();

                if (!airportError2) {
                    // quote_item 2: 추가 서비스 (기존 가격의 ID 사용)
                    const price2 = await getPriceFromCode(selectedAirportCode2);
                    const { error: itemError2 } = await supabase
                        .from('quote_item')
                        .insert({
                            quote_id: existingQuoteData.id,
                            service_type: 'airport',
                            service_ref_id: airportData2.id,
                            quantity: 1,
                            unit_price: price2,
                            total_price: price2,
                            usage_date: currentDate
                        });

                    if (itemError2) {
                        console.error('가격 아이템 2 생성 오류:', itemError2);
                    }
                } else {
                    console.error('공항 서비스 2 생성 오류:', airportError2);
                }
            }

            alert('공항 서비스가 가격에 추가되었습니다. 다음 단계로 이동합니다.');
            router.push(`/mypage/direct-booking/airport/2?quoteId=${existingQuoteData.id}`);

        } catch (error) {
            console.error('서비스 추가 오류:', error);
            alert('서비스 추가 중 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <PageWrapper>
            <div className="space-y-6">
                {/* 헤더 */}
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-lg font-bold text-gray-800">✈️ 공항 서비스 가격 산정</h1>
                        <p className="text-sm text-gray-600 mt-1">
                            {existingQuoteData
                                ? `가격 "${existingQuoteData.title}"에 공항 서비스를 추가합니다`
                                : '공항 서비스를 선택하면 가격이 자동으로 생성됩니다'
                            }
                        </p>
                        {existingQuoteData && (
                            <div className="bg-blue-50 rounded-lg p-2 mt-2">
                                <p className="text-xs text-blue-600">가격 ID: {existingQuoteData.id}</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* 기본 정보 삭제됨 */}

                {/* 신청 유형 - 작은 버튼 방식 */}
                <SectionBox title="🔄 신청 유형">
                    <div className="space-y-4">
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => setApplyType('both')}
                                className={`px-3 py-2 rounded-md text-sm font-medium transition-all ${applyType === 'both'
                                    ? 'bg-blue-500 text-white'
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                    }`}
                            >
                                픽업+샌딩
                            </button>
                            <button
                                type="button"
                                onClick={() => setApplyType('pickup')}
                                className={`px-3 py-2 rounded-md text-sm font-medium transition-all ${applyType === 'pickup'
                                    ? 'bg-blue-500 text-white'
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                    }`}
                            >
                                픽업
                            </button>
                            <button
                                type="button"
                                onClick={() => setApplyType('sending')}
                                className={`px-3 py-2 rounded-md text-sm font-medium transition-all ${applyType === 'sending'
                                    ? 'bg-blue-500 text-white'
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                    }`}
                            >
                                샌딩
                            </button>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">🚗 차량 대수</label>
                            <input
                                type="number"
                                min="1"
                                value={formData.vehicle_count}
                                onChange={(e) => setFormData(prev => ({ ...prev, vehicle_count: parseInt(e.target.value) }))}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                            />
                        </div>
                    </div>
                </SectionBox>

                {/* 주 서비스 선택 */}
                <SectionBox title="주 서비스 선택">
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">🗺️ 경로 *</label>
                                <select
                                    value={selectedRoute}
                                    onChange={(e) => setSelectedRoute(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                                    disabled={!selectedCategory}
                                    required
                                >
                                    <option value="">경로 선택</option>
                                    {routeOptions.map((route) => (
                                        <option key={route} value={route}>
                                            {route}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">🚙 차량 타입 *</label>
                                <select
                                    value={selectedCarType}
                                    onChange={(e) => setSelectedCarType(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                                    disabled={!selectedRoute}
                                    required
                                >
                                    <option value="">차량 타입 선택</option>
                                    {carTypeOptions.map((carType) => (
                                        <option key={carType} value={carType}>
                                            {carType}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        {selectedAirportCode && (
                            <div className="bg-blue-50 rounded-lg p-4">
                                <p className="text-sm text-blue-800">
                                    선택된 서비스: {selectedCategory} | {selectedRoute} | {selectedCarType}
                                </p>
                                <p className="text-sm text-blue-600">코드: {selectedAirportCode}</p>
                            </div>
                        )}
                    </div>
                </SectionBox>

                {/* 추가 서비스 선택 (픽업+샌딩인 경우만) */}
                {applyType === 'both' && (
                    <SectionBox title="추가 서비스 선택 (샌딩)">
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">🗺️ 경로</label>
                                    <select
                                        value={selectedRoute2}
                                        onChange={(e) => setSelectedRoute2(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                                        disabled={!selectedCategory2}
                                    >
                                        <option value="">경로 선택</option>
                                        {routeOptions2.map((route) => (
                                            <option key={route} value={route}>
                                                {route}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">🚙 차량 타입</label>
                                    <select
                                        value={selectedCarType2}
                                        onChange={(e) => setSelectedCarType2(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                                        disabled={!selectedRoute2}
                                    >
                                        <option value="">차량 타입 선택</option>
                                        {carTypeOptions2.map((carType) => (
                                            <option key={carType} value={carType}>
                                                {carType}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            {selectedAirportCode2 && (
                                <div className="bg-green-50 rounded-lg p-4">
                                    <p className="text-sm text-green-800">
                                        추가 서비스: {selectedCategory2} | {selectedRoute2} | {selectedCarType2}
                                    </p>
                                    <p className="text-sm text-green-600">코드: {selectedAirportCode2}</p>
                                </div>
                            )}
                        </div>
                    </SectionBox>
                )}

                {/* 추가 요청사항 */}
                <SectionBox title="📝 추가 요청사항">
                    <div>

                        <textarea
                            value={formData.additional_note}
                            onChange={(e) => setFormData(prev => ({ ...prev, additional_note: e.target.value }))}
                            rows={4}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md"
                            placeholder="특별 서비스 등 요청사항을 입력해주세요..."
                        />
                    </div>
                </SectionBox>

                {/* 다음 버튼 */}
                <div className="flex justify-end">
                    <button
                        onClick={handleSubmit}
                        disabled={loading}
                        className="bg-blue-500 text-white px-6 py-3 rounded-lg hover:bg-blue-600 disabled:opacity-50"
                    >
                        {loading ? '가격 산정 중...' : '다음: 서비스 정보 입력'}
                    </button>
                </div>
            </div>
        </PageWrapper>
    );
}

export default function AirportPricePage() {
    return (
        <Suspense fallback={<div className="flex justify-center items-center h-64">로딩 중...</div>}>
            <AirportPriceContent />
        </Suspense>
    );
}
