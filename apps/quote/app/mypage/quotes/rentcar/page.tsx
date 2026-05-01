'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import supabase from '@/lib/supabase';

function RentcarQuoteContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const quoteId = searchParams.get('quoteId');
  const itemId = searchParams.get('itemId');
  const serviceRefId = searchParams.get('serviceRefId');
  const mode = searchParams.get('mode');

  const [loading, setLoading] = useState(false);
  const [quote, setQuote] = useState<any>(null);
  const [isEditMode, setIsEditMode] = useState(false);

  // 단계별 옵션들 (rentcar_price 테이블 기준)
  const [routeOptions, setRouteOptions] = useState<string[]>([]);

  const WAY_TYPE_OPTIONS = ['편도', '당일왕복', '다른날왕복', '시내당일렌트'];

  // 선택된 차량들
  const [vehicles, setVehicles] = useState<any[]>([
    { wayType: '', route: '', carType: '', carTypeOptions: [] }
  ]);

  const [formData, setFormData] = useState({
    special_requests: ''
  });

  useEffect(() => {
    if (!quoteId) {
      alert('견적 ID가 필요합니다.');
      router.push('/mypage');
      return;
    }

    // 초기 경로 옵션 로드는 이용방식 선택 시 로드됨

    const initializeData = async () => {
      if (mode === 'edit' && itemId && serviceRefId) {
        setIsEditMode(true);
        await loadExistingQuoteData();
      }
    };

    initializeData();
    loadQuote();
  }, [quoteId, router, mode, itemId, serviceRefId]);

  // 기존 견적 데이터 로드 (수정 모드용)
  const loadExistingQuoteData = async () => {
    try {
      setLoading(true);

      const { data: serviceData, error: serviceError } = await supabase
        .from('rentcar')
        .select('*')
        .eq('id', serviceRefId)
        .single();

      if (serviceError || !serviceData) {
        console.error('서비스 데이터 조회 오류:', serviceError);
        alert('서비스 데이터를 찾을 수 없습니다.');
        return;
      }

      // rentcar_code를 통해 rentcar_price에서 조건들을 역으로 찾기
      if (serviceData.rentcar_code) {
        const { data: priceData, error: priceError } = await supabase
          .from('rentcar_price')
          .select('*')
          .eq('rent_code', serviceData.rentcar_code)
          .single();

        if (priceError || !priceData) {
          console.error('렌터카 가격 정보 조회 오류:', priceError);
        } else {
          // 가격 정보에서 조건들을 복원하여 첫 번째 차량으로 설정
          await loadRouteOptions(priceData.way_type);
          const carTypes = await fetchCarTypeOptions(priceData.way_type, priceData.route);

          setVehicles([{
            wayType: priceData.way_type,
            route: priceData.route,
            carType: priceData.vehicle_type,
            carTypeOptions: carTypes
          }]);
        }
      }

      setFormData(prev => ({
        ...prev,
        special_requests: serviceData.special_requests || ''
      }));

      console.log('기존 렌터카 견적 데이터 로드 완료:', serviceData);
    } catch (error) {
      console.error('기존 견적 데이터 로드 오류:', error);
      alert('기존 견적 데이터를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };




  const loadRouteOptions = async (wayType: string) => {
    if (!wayType) return;
    try {
      const { data, error } = await supabase
        .from('rentcar_price')
        .select('route')
        .eq('way_type', wayType)
        .order('route');

      if (error) throw error;

      // 중복 제거
      const uniqueRoutes = [...new Set(data.map((item: any) => item.route).filter(Boolean))] as string[];
      setRouteOptions(uniqueRoutes);
    } catch (error) {
      console.error('렌트카 경로 옵션 로드 실패:', error);
    }
  };

  const fetchCarTypeOptions = async (wayType: string, route: string) => {
    try {
      const { data, error } = await supabase
        .from('rentcar_price')
        .select('vehicle_type')
        .eq('way_type', wayType)
        .eq('route', route)
        .order('vehicle_type');

      if (error) throw error;

      return [...new Set(data.map((item: any) => item.vehicle_type).filter(Boolean))] as string[];
    } catch (error) {
      console.error('렌트카 차량 타입 옵션 로드 실패:', error);
      return [];
    }
  };

  const handleAddVehicle = () => {
    setVehicles(prev => [...prev, { wayType: '', route: '', carType: '', carTypeOptions: [] }]);
  };

  const handleRemoveVehicle = (index: number) => {
    if (vehicles.length > 1) {
      setVehicles(prev => prev.filter((_, i) => i !== index));
    }
  };

  const handleVehicleChange = async (index: number, field: string, value: any) => {
    const newVehicles = [...vehicles];
    newVehicles[index][field] = value;

    if (field === 'wayType') {
      // 이용방식이 변경되면 경로/차량 초기화 및 경로 옵션 새로고침
      newVehicles[index].route = '';
      newVehicles[index].carType = '';
      newVehicles[index].carTypeOptions = [];
      await loadRouteOptions(value);
    } else if (field === 'route') {
      // 경로가 변경되면 해당 차량의 차량 타입 옵션 새로고침
      const carTypes = await fetchCarTypeOptions(newVehicles[index].wayType, value);
      newVehicles[index].carTypeOptions = carTypes;
      newVehicles[index].carType = ''; // 차량 타입 초기화
    }

    setVehicles(newVehicles);
  };

  const loadQuote = async () => {
    if (!quoteId) return;

    try {
      const { data, error } = await supabase
        .from('quote')
        .select('*')
        .eq('id', quoteId)
        .single();

      if (error) throw error;
      setQuote(data);
    } catch (error) {
      console.error('견적 정보 로드 실패:', error);
      alert('견적 정보를 불러올 수 없습니다.');
      router.push('/mypage/quotes');
    }
  };

  // 3가지 조건으로 rent_code 조회
  const getRentCodeFromConditions = async (wayType: string, route: string, carType: string) => {
    try {
      const { data, error } = await supabase
        .from('rentcar_price')
        .select('rent_code')
        .eq('way_type', wayType)
        .eq('route', route)
        .eq('vehicle_type', carType)
        .single();

      if (error) throw error;
      return data.rent_code;
    } catch (error) {
      console.error('rent_code 조회 실패:', error);
      throw error;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 모든 차량이 선택되었는지 확인
    const isAllSelected = vehicles.every(v => v.wayType && v.route && v.carType);
    if (!isAllSelected) {
      alert('모든 차량의 경로와 타입을 선택해주세요.');
      return;
    }

    if (!quoteId) {
      alert('견적 ID가 없습니다.');
      return;
    }

    setLoading(true);

    try {
      for (let i = 0; i < vehicles.length; i++) {
        const vehicle = vehicles[i];

        // 3가지 조건으로 rent_code 조회
        const rentCode = await getRentCodeFromConditions(
          vehicle.wayType,
          vehicle.route,
          vehicle.carType
        );

        // 렌트카 폼 데이터 구성
        const rentcarData = {
          rentcar_code: rentCode,
          special_requests: formData.special_requests
        };

        if (i === 0 && isEditMode && serviceRefId) {
          // 첫 번째 차량이고 수정 모드인 경우 기존 데이터 업데이트
          const { error: updateError } = await supabase
            .from('rentcar')
            .update(rentcarData)
            .eq('id', serviceRefId);

          if (updateError) throw updateError;
          console.log('✅ 기존 렌트카 서비스 수정 성공');
        } else {
          // 새 차량 추가 (생성 모드이거나 두 번째 이상의 차량인 경우)
          const { data: rentcarServiceData, error: rentcarError } = await supabase
            .from('rentcar')
            .insert([rentcarData])
            .select()
            .single();

          if (rentcarError) throw rentcarError;

          // 견적 아이템 생성
          const { error: itemError } = await supabase
            .from('quote_item')
            .insert({
              quote_id: quoteId,
              service_type: 'rentcar',
              service_ref_id: rentcarServiceData.id,
              quantity: 1,
              unit_price: 0,
              total_price: 0
            });

          if (itemError) throw itemError;
          console.log(`✅ 렌트카 서비스 ${i + 1} 추가 성공`);
        }
      }

      alert(isEditMode ? '렌트카 정보가 수정/추가되었습니다!' : '렌트카 서비스가 견적에 추가되었습니다!');
      router.push(`/mypage/quotes/new?quoteId=${quoteId}`);

    } catch (error) {
      console.error('❌ 렌트카 견적 처리 중 오류:', error);
      alert('오류가 발생했습니다: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const isFormValid = vehicles.every(v => v.wayType && v.route && v.carType);

  if (!quote) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
          <p className="mt-4 text-gray-600">견적 정보를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <div className="bg-gradient-to-br from-green-200 via-emerald-200 to-teal-100 text-gray-900">
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold mb-2">🚗 렌트카 견적 신청</h1>
              <p className="text-lg opacity-90">
                편리한 렌트카 서비스를 위한 견적을 작성해주세요.
              </p>
            </div>
            <button
              onClick={() => router.back()}
              className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
            >
              ← 뒤로
            </button>
          </div>

          {/* 견적 정보 */}
          <div className="bg-white/70 backdrop-blur rounded-lg p-4 mb-6">
            <h3 className="font-semibold text-gray-800 mb-2">현재 견적 정보</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>견적명: <span className="font-semibold text-blue-600">{quote.title}</span></div>
              <div>상태: {quote.status === 'draft' ? '작성 중' : quote.status}</div>
              <div>작성일: {new Date(quote.created_at).toLocaleDateString('ko-KR')}</div>
            </div>
          </div>
        </div>
      </div>

      {/* 폼 */}
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-lg p-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">렌트카 정보 입력</h2>

            {/* 렌트카 안내 카드 */}
            <div className="bg-green-600 rounded-lg p-6 mb-6 border border-green-700">
              <h3 className="text-white text-lg font-semibold mb-2">🚗 견적안내</h3>
              <p className="text-white/90 text-sm">렌트카 예약을 위해 아래 정보를 순서대로 입력해 주세요.<br />정확한 카테고리, 경로, 차량 타입 정보를 입력하시면 빠른 견적 안내가 가능합니다.</p>
            </div>

            {/* 렌트카 서비스 선택 폼 */}
            <div className="space-y-6">
              {vehicles.map((vehicle, index) => (
                <div key={index} className="p-6 border border-gray-200 rounded-xl bg-gray-50/50 relative">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold text-gray-700">차량 {index + 1}</h3>
                    {vehicles.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveVehicle(index)}
                        className="text-red-500 hover:text-red-700 text-sm font-medium"
                      >
                        삭제
                      </button>
                    )}
                  </div>

                  <div className="space-y-4">
                    {/* 이용방식 선택 */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        🛣️ 이용방식 *
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {WAY_TYPE_OPTIONS.map((wt) => (
                          <button
                            key={wt}
                            type="button"
                            onClick={() => handleVehicleChange(index, 'wayType', wt)}
                            className={`p-2 rounded-lg border text-sm font-medium transition-all ${vehicle.wayType === wt
                                ? 'border-blue-500 bg-blue-50 text-blue-700'
                                : 'border-gray-200 bg-white hover:border-blue-300 text-gray-700'
                              }`}
                          >
                            {wt}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 경로 선택 */}
                    {vehicle.wayType && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          🚗 경로 *
                        </label>
                        <select
                          value={vehicle.route}
                          onChange={(e) => handleVehicleChange(index, 'route', e.target.value)}
                          className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                          required
                        >
                          <option value="">경로를 선택하세요</option>
                          {routeOptions.map(route => (
                            <option key={route} value={route}>{route}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* 차량 타입 선택 */}
                    {vehicle.route && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          🚙 차량 타입 *
                        </label>
                        <select
                          value={vehicle.carType}
                          onChange={(e) => handleVehicleChange(index, 'carType', e.target.value)}
                          className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                          required
                        >
                          <option value="">차량 타입을 선택하세요</option>
                          {vehicle.carTypeOptions.map((carType: string) => (
                            <option key={carType} value={carType}>{carType}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* 차량 추가 버튼 */}
              <button
                type="button"
                onClick={handleAddVehicle}
                className="w-full py-4 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 hover:border-blue-400 hover:text-blue-500 transition-all flex items-center justify-center gap-2 font-medium"
              >
                <span className="text-xl">+</span> 차량 추가
              </button>

              {/* 특별 요청사항 */}
              <div className="pt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  📝 특별 요청사항
                </label>
                <textarea
                  value={formData.special_requests}
                  onChange={(e) => setFormData({ ...formData, special_requests: e.target.value })}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={4}
                  placeholder="네비게이션, 차일드시트, 픽업 위치, 반납 위치 등을 입력해주세요"
                />
              </div>

              {/* 선택 요약 */}
              {isFormValid && (
                <div className="bg-green-50 p-6 rounded-lg border border-green-200">
                  <h3 className="font-semibold text-green-800 mb-3">✅ 선택 요약</h3>
                  <div className="space-y-4">
                    {vehicles.map((v, i) => (
                      <div key={i} className="text-green-700 text-sm border-b border-green-100 pb-2 last:border-0">
                        <div className="font-bold mb-1">차량 {i + 1}</div>
                        <div><strong>이용방식:</strong> {v.wayType}</div>
                        <div><strong>경로:</strong> {v.route}</div>
                        <div><strong>차량 타입:</strong> {v.carType}</div>
                      </div>
                    ))}
                    {formData.special_requests && (
                      <div className="text-green-700 text-sm pt-2">
                        <strong>특별 요청:</strong> {formData.special_requests}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* 제출 버튼 */}
            <div className="flex justify-center space-x-4 pt-6 mt-8">
              <button
                type="button"
                onClick={() => router.back()}
                className="px-6 py-3 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={!isFormValid || loading}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? '처리 중...' : '견적에 추가'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}


export default function RentcarQuotePage() {
  return (
    <Suspense fallback={<div className="flex justify-center items-center h-64">로딩 중...</div>}>
      <RentcarQuoteContent />
    </Suspense>
  );
}
