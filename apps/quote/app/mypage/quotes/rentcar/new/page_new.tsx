'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import supabase from '@/lib/supabase';

export default function RentcarQuotePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const quoteId = searchParams.get('quoteId');

  const [loading, setLoading] = useState(false);
  const [quote, setQuote] = useState<any>(null);

  // 단계별 옵션들 (rentcar_price 테이블 기준)
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [routeOptions, setRouteOptions] = useState<string[]>([]);
  const [carTypeOptions, setCarTypeOptions] = useState<string[]>([]);

  // 선택된 값들
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedRoute, setSelectedRoute] = useState('');
  const [selectedCarType, setSelectedCarType] = useState('');

  const [selectedRentCode, setSelectedRentCode] = useState(''); // 검색된 렌트 코드 표시용

  const [formData, setFormData] = useState({
    special_requests: ''
  });

  useEffect(() => {
    if (!quoteId) {
      alert('견적 ID가 필요합니다.');
      router.push('/mypage');
      return;
    }
    loadCategoryOptions();
    loadQuote();
  }, [quoteId, router]);

  // 카테고리 선택 시 경로 옵션 업데이트
  useEffect(() => {
    if (selectedCategory) {
      loadRouteOptions(selectedCategory);
    } else {
      setRouteOptions([]);
      setSelectedRoute('');
    }
  }, [selectedCategory]);

  // 카테고리와 경로가 선택될 때 차량 타입 목록 업데이트
  useEffect(() => {
    if (selectedCategory && selectedRoute) {
      loadCarTypeOptions(selectedCategory, selectedRoute);
    } else {
      setCarTypeOptions([]);
      setSelectedCarType('');
    }
  }, [selectedCategory, selectedRoute]);

  // 모든 조건이 선택되면 렌트 코드 조회
  useEffect(() => {
    if (selectedCategory && selectedRoute && selectedCarType) {
      getRentCodeFromConditions(selectedCategory, selectedRoute, selectedCarType)
        .then(code => setSelectedRentCode(code))
        .catch(() => setSelectedRentCode(''));
    } else {
      setSelectedRentCode('');
    }
  }, [selectedCategory, selectedRoute, selectedCarType]);

  const loadCategoryOptions = async () => {
    try {
      const { data, error } = await supabase
        .from('rentcar_price')
        .select('way_type')
        .order('way_type');

      if (error) throw error;

      // 중복 제거
      const uniqueCategories = [...new Set(data.map((item: any) => item.way_type).filter(Boolean))] as string[];
      setCategoryOptions(uniqueCategories);
    } catch (error) {
      console.error('렌트카 카테고리 로드 실패:', error);
    }
  };

  const loadRouteOptions = async (category: string) => {
    try {
      const { data, error } = await supabase
        .from('rentcar_price')
        .select('route')
        .eq('way_type', category)
        .order('route');

      if (error) throw error;

      // 중복 제거
      const uniqueRoutes = [...new Set(data.map((item: any) => item.route).filter(Boolean))] as string[];
      setRouteOptions(uniqueRoutes);
    } catch (error) {
      console.error('렌트카 경로 옵션 로드 실패:', error);
    }
  };

  const loadCarTypeOptions = async (category: string, route: string) => {
    try {
      const { data, error } = await supabase
        .from('rentcar_price')
        .select('vehicle_type')
        .eq('way_type', category)
        .eq('route', route)
        .order('vehicle_type');

      if (error) throw error;

      // 중복 제거
      const uniqueCarTypes = [...new Set(data.map((item: any) => item.vehicle_type).filter(Boolean))] as string[];
      setCarTypeOptions(uniqueCarTypes);
    } catch (error) {
      console.error('렌트카 차량 타입 옵션 로드 실패:', error);
    }
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
  const getRentCodeFromConditions = async (category: string, route: string, carType: string) => {
    try {
      const { data, error } = await supabase
        .from('rentcar_price')
        .select('rent_code')
        .eq('way_type', category)
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

    if (!selectedCategory || !selectedRoute || !selectedCarType) {
      alert('모든 필수 항목을 선택해주세요.');
      return;
    }

    if (!quoteId) {
      alert('견적 ID가 없습니다.');
      return;
    }

    setLoading(true);

    try {
      // 3가지 조건으로 rent_code 조회
      const rentCode = await getRentCodeFromConditions(
        selectedCategory,
        selectedRoute,
        selectedCarType
      );

      // 렌트카 폼 데이터 구성 - 필수 필드만 포함
      const rentcarData = {
        rentcar_code: rentCode,
        ...(formData.special_requests && { special_requests: formData.special_requests })
      };

      console.log('🚗 렌트카 데이터:', rentcarData);

      // 1. 렌트카 서비스 생성
      const { data: rentcarServiceData, error: rentcarError } = await supabase
        .from('rentcar')
        .insert([rentcarData])
        .select()
        .single();

      if (rentcarError) {
        console.error('❌ 렌트카 서비스 생성 오류:', rentcarError);
        alert(`렌트카 서비스 생성 실패: ${rentcarError.message}`);
        return;
      }

      console.log('✅ 렌트카 서비스 생성 성공:', rentcarServiceData);

      // 2. 견적 아이템 생성
      const { data: itemData, error: itemError } = await supabase
        .from('quote_item')
        .insert({
          quote_id: quoteId,
          service_type: 'rentcar',
          service_ref_id: rentcarServiceData.id,
          quantity: 1,
          unit_price: 0,
          total_price: 0
        })
        .select()
        .single();

      if (itemError) {
        console.error('❌ 견적 아이템 생성 오류:', itemError);
        alert(`견적 아이템 생성 실패: ${itemError.message}`);
        return;
      }

      console.log('✅ 견적 아이템 생성 성공:', itemData);

      alert('렌트카 서비스가 견적에 추가되었습니다!');
      router.push(`/mypage/quotes/${quoteId}/view`);

    } catch (error) {
      console.error('❌ 렌트카 견적 추가 중 오류:', error);
      alert('오류가 발생했습니다: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const isFormValid = selectedCategory && selectedRoute && selectedCarType;

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
              ← 뒤로가기
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
              {/* 1단계: 카테고리 선택 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  📋 렌트카 카테고리 *
                </label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                >
                  <option value="">카테고리를 선택하세요</option>
                  {categoryOptions.map(category => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </div>

              {/* 2단계: 경로 선택 */}
              {selectedCategory && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    🛣️ 렌트카 경로 *
                  </label>
                  <select
                    value={selectedRoute}
                    onChange={(e) => setSelectedRoute(e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  >
                    <option value="">경로를 선택하세요</option>
                    {routeOptions.map(route => (
                      <option key={route} value={route}>{route}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* 3단계: 차량 타입 선택 */}
              {selectedCategory && selectedRoute && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    🚙 차량 타입 *
                  </label>
                  <select
                    value={selectedCarType}
                    onChange={(e) => setSelectedCarType(e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  >
                    <option value="">차량 타입을 선택하세요</option>
                    {carTypeOptions.map(carType => (
                      <option key={carType} value={carType}>{carType}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* 특별 요청사항 */}
              <div>
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
                  <div className="text-green-700 space-y-2">
                    <div><strong>카테고리:</strong> {selectedCategory}</div>
                    <div><strong>경로:</strong> {selectedRoute}</div>
                    <div><strong>차량 타입:</strong> {selectedCarType}</div>
                    {selectedRentCode && (
                      <div><strong>렌트카 코드:</strong> <span className="font-mono text-blue-600">{selectedRentCode}</span></div>
                    )}
                    {formData.special_requests && <div><strong>특별 요청:</strong> {formData.special_requests}</div>}
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
