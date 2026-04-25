'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import supabase from '@/lib/supabase';

function RentcarQuoteContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const quoteId = searchParams.get('quoteId');

  const [loading, setLoading] = useState(false);
  const [quote, setQuote] = useState<any>(null);

  // 단계별 옵션들 (rent_price 테이블 기준)
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
      alert('가격 ID가 필요합니다.');
      router.push('/mypage/direct-booking');
      return;
    }
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

  // 카테고리 표시명 변환 함수
  const getCategoryDisplayName = (category: string) => {
    switch (category) {
      case '당일':
        return '왕복 당일';
      case '다른날':
        return '왕복 다른날';
      case '안함':
        return '편도';
      default:
        return category;
    }
  };

  const loadRouteOptions = async (category: string) => {
    try {
      const { data, error } = await supabase
        .from('rent_price')
        .select('rent_route')
        .eq('rent_category', category)
        .order('rent_route');

      if (error) throw error;

      // 중복 제거
      const uniqueRoutes = [...new Set(data.map((item: any) => item.rent_route).filter(Boolean))] as string[];
      setRouteOptions(uniqueRoutes);
    } catch (error) {
      console.error('렌트카 경로 옵션 로드 실패:', error);
    }
  };

  const loadCarTypeOptions = async (category: string, route: string) => {
    try {
      const { data, error } = await supabase
        .from('rent_price')
        .select('rent_car_type')
        .eq('rent_category', category)
        .eq('rent_route', route)
        .order('rent_car_type');

      if (error) throw error;

      // 중복 제거
      const uniqueCarTypes = [...new Set(data.map((item: any) => item.rent_car_type).filter(Boolean))] as string[];
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
      console.error('가격 정보 로드 실패:', error);
      alert('가격 정보를 불러올 수 없습니다.');
      router.push('/mypage/direct-booking');
    }
  };

  // 3가지 조건으로 rent_code 조회
  const getRentCodeFromConditions = async (category: string, route: string, carType: string) => {
    try {
      const { data, error } = await supabase
        .from('rent_price')
        .select('rent_code')
        .eq('rent_category', category)
        .eq('rent_route', route)
        .eq('rent_car_type', carType)
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
      alert('가격 ID가 없습니다.');
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

      // 새 렌트카 서비스 생성
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

      // 가격 아이템 생성
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
        console.error('❌ 가격 아이템 생성 오류:', itemError);
        alert(`가격 아이템 생성 실패: ${itemError.message}`);
        return;
      }

      console.log('✅ 가격 아이템 생성 성공:', itemData);
      alert('렌트카 서비스가 추가되었습니다!');

      // 2 폴더 (예약 단계)로 이동
      router.push(`/mypage/direct-booking/rentcar/2?quoteId=${quoteId}`);

    } catch (error) {
      console.error('❌ 렌트카 가격 처리 중 오류:', error);
      alert('오류가 발생했습니다: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const isFormValid = selectedCategory && selectedRoute && selectedCarType;

  if (!quote) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">가격 정보를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">처리 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <div className="bg-gradient-to-br from-purple-200 via-indigo-200 to-blue-100 text-gray-900">
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-lg font-bold text-gray-800">🚗 렌터카 서비스 가격</h1>
              <p className="text-sm text-gray-600 mt-1">
                가격 "{quote.title}"에 렌터카 서비스를 추가합니다
              </p>
              <div className="bg-blue-50 rounded-lg p-2 mt-2">
                <p className="text-xs text-blue-600">가격 ID: {quoteId}</p>
              </div>
            </div>
            <button
              onClick={() => router.push('/mypage/direct-booking')}
              className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors text-xs"
            >
              ← 뒤로
            </button>
          </div>
        </div>
      </div>

      {/* 메인 컨텐츠 */}
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-lg p-8">
            <h2 className="text-lg font-bold text-gray-800 mb-6">📝 렌터카 서비스 선택</h2>

            {/* 렌터카 예약 안내 카드 */}
            <div className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-lg p-6 mb-6">
              <h3 className="text-white text-lg font-semibold mb-2">🚗 렌터카 서비스 안내</h3>
              <p className="text-white/90 text-sm">
                카테고리, 경로, 차량 타입을 선택하여 렌터카 서비스를 추가할 수 있습니다.
              </p>
            </div>

            {/* 서비스 선택 영역 */}
            <div className="space-y-6">
              {/* 카테고리 선택 - 3개 고정 버튼 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">📋 카테고리</label>
                <div className="grid grid-cols-3 gap-4">
                  <button
                    type="button"
                    onClick={() => setSelectedCategory('당일')}
                    className={`p-4 rounded-lg border-2 cursor-pointer transition-all text-center ${selectedCategory === '당일'
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 bg-white hover:border-blue-300 text-gray-700'
                      }`}
                  >
                    <div className="font-medium">왕복 당일</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedCategory('다른날')}
                    className={`p-4 rounded-lg border-2 cursor-pointer transition-all text-center ${selectedCategory === '다른날'
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 bg-white hover:border-blue-300 text-gray-700'
                      }`}
                  >
                    <div className="font-medium">왕복 다른날</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedCategory('안함')}
                    className={`p-4 rounded-lg border-2 cursor-pointer transition-all text-center ${selectedCategory === '안함'
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 bg-white hover:border-blue-300 text-gray-700'
                      }`}
                  >
                    <div className="font-medium">편도</div>
                  </button>
                </div>
              </div>

              {/* 경로 선택 */}
              {selectedCategory && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">🛣️ 경로</label>
                  <select
                    value={selectedRoute}
                    onChange={(e) => setSelectedRoute(e.target.value)}
                    className="w-full border border-gray-300 p-3 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                    required
                  >
                    <option value="">경로를 선택하세요</option>
                    {routeOptions.map((route) => (
                      <option key={route} value={route}>
                        {route}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* 차량 타입 선택 */}
              {selectedCategory && selectedRoute && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">🚙 차량 타입</label>
                  <select
                    value={selectedCarType}
                    onChange={(e) => setSelectedCarType(e.target.value)}
                    className="w-full border border-gray-300 p-3 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                    required
                  >
                    <option value="">차량 타입을 선택하세요</option>
                    {carTypeOptions.map((carType) => (
                      <option key={carType} value={carType}>
                        {carType}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* 선택된 조건 요약 */}
              {selectedCategory && selectedRoute && selectedCarType && (
                <div className="bg-green-50 rounded-lg p-4">
                  <h4 className="text-md font-medium text-green-800 mb-2">✅ 선택된 조건</h4>
                  <div className="space-y-1 text-sm text-green-700">
                    <div><strong>카테고리:</strong> {getCategoryDisplayName(selectedCategory)}</div>
                    <div><strong>경로:</strong> {selectedRoute}</div>
                    <div><strong>차량 타입:</strong> {selectedCarType}</div>
                    {selectedRentCode && (
                      <div><strong>렌트 코드:</strong> {selectedRentCode}</div>
                    )}
                  </div>
                </div>
              )}

              {/* 특별 요청사항 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">특별 요청사항</label>
                <textarea
                  value={formData.special_requests}
                  onChange={(e) => setFormData({ ...formData, special_requests: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-purple-500"
                  placeholder="특별한 요청사항이 있으시면 입력해주세요..."
                />
              </div>
            </div>

            {/* 제출 버튼 */}
            <div className="flex justify-end space-x-4 mt-8">
              <button
                type="button"
                onClick={() => router.push('/mypage/direct-booking')}
                className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors text-xs"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={loading || !isFormValid}
                className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors text-xs"
              >
                {loading ? '저장 중...' : '다음'}
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
