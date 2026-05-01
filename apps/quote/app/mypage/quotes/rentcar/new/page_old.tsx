'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import supabase from '@/lib/supabase';
import { addRentcarToQuote, getQuoteWithItems } from '@/lib/quoteUtils';
import { RentcarFormData, QuoteWithItems } from '@/lib/types';

export default function RentcarQuotePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const quoteId = searchParams.get('quoteId');

  const [loading, setLoading] = useState(false);
  const [quote, setQuote] = useState<QuoteWithItems | null>(null);
  const [formData, setFormData] = useState<RentcarFormData>({
    car_model: '',
    pickup_date: '',
    return_date: '',
    pickup_location: '',
    return_location: '',
    driver_age: 30,
    has_driver: false,
    insurance_type: '',
    special_requests: ''
  });

  useEffect(() => {
    if (!quoteId) {
      alert('견적 ID가 필요합니다.');
      router.push('/mypage/quotes/new');
      return;
    }
    loadQuote();
  }, [quoteId, router]);

  const loadQuote = async () => {
    if (!quoteId) return;
    
    const quoteData = await getQuoteWithItems(quoteId);
    if (quoteData) {
      setQuote(quoteData);
    } else {
      alert('견적 정보를 불러올 수 없습니다.');
      router.push('/mypage/quotes/new');
    }
  };

  const handleInputChange = (field: keyof RentcarFormData, value: string | number | boolean) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!quoteId) {
      alert('견적 ID가 없습니다.');
      return;
    }

    if (!formData.car_model || !formData.pickup_date || !formData.return_date) {
      alert('필수 항목을 모두 입력해주세요.');
      return;
    }

    // 픽업 날짜가 반납 날짜보다 이후인지 확인
    if (new Date(formData.pickup_date) >= new Date(formData.return_date)) {
      alert('반납 날짜는 픽업 날짜보다 나중이어야 합니다.');
      return;
    }

    // 운전자가 없는 경우 운전자 나이 확인
    if (!formData.has_driver && (!formData.driver_age || formData.driver_age < 21)) {
      alert('직접 운전하는 경우 운전자 나이는 21세 이상이어야 합니다.');
      return;
    }

    setLoading(true);
    try {
      const result = await addRentcarToQuote(quoteId, formData);
      if (result) {
        alert('렌트카 견적이 추가되었습니다!');
        router.push(`/mypage/quotes/${quoteId}/view`);
      } else {
        alert('렌트카 견적 추가에 실패했습니다.');
      }
    } catch (error) {
      console.error('렌트카 견적 추가 중 오류:', error);
      alert('오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

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
      <div className="bg-gradient-to-br from-red-200 via-rose-200 to-pink-100 text-gray-900">
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold mb-2">🚗 렌트카 견적 신청</h1>
              <p className="text-lg opacity-90">
                자유로운 여행을 위한 렌트카 서비스 견적을 작성해주세요.
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
              <div>총 서비스 수: {quote.items.length}개</div>
            </div>
          </div>
        </div>
      </div>

      {/* 폼 */}
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-lg p-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">렌트카 정보 입력</h2>
            
            {/* 차량 정보 */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                차량 모델 *
              </label>
              <select
                value={formData.car_model}
                onChange={(e) => handleInputChange('car_model', e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              >
                <option value="">차량을 선택해주세요</option>
                <optgroup label="경차/소형차">
                  <option value="spark">쉐보레 스파크</option>
                  <option value="morning">기아 모닝</option>
                  <option value="ray">기아 레이</option>
                </optgroup>
                <optgroup label="중형차">
                  <option value="k5">기아 K5</option>
                  <option value="sonata">현대 소나타</option>
                  <option value="grandeur">현대 그랜저</option>
                </optgroup>
                <optgroup label="SUV">
                  <option value="tucson">현대 투싼</option>
                  <option value="sportage">기아 스포티지</option>
                  <option value="sorento">기아 소렌토</option>
                  <option value="santafe">현대 싼타페</option>
                </optgroup>
                <optgroup label="승합차">
                  <option value="starex">현대 스타렉스</option>
                  <option value="carnival">기아 카니발</option>
                </optgroup>
                <optgroup label="프리미엄">
                  <option value="genesis">제네시스 G90</option>
                  <option value="bmw">BMW 5시리즈</option>
                  <option value="benz">벤츠 E클래스</option>
                </optgroup>
              </select>
            </div>

            {/* 대여 날짜 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  픽업 날짜 *
                </label>
                <input
                  type="date"
                  value={formData.pickup_date}
                  onChange={(e) => handleInputChange('pickup_date', e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  반납 날짜 *
                </label>
                <input
                  type="date"
                  value={formData.return_date}
                  onChange={(e) => handleInputChange('return_date', e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>
            </div>

            {/* 위치 정보 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  픽업 장소
                </label>
                <input
                  type="text"
                  value={formData.pickup_location}
                  onChange={(e) => handleInputChange('pickup_location', e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="예: 인천공항, 김포공항, 서울역, 호텔명 등"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  반납 장소
                </label>
                <input
                  type="text"
                  value={formData.return_location}
                  onChange={(e) => handleInputChange('return_location', e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="픽업 장소와 다른 경우 입력 (비어 있으면 픽업 장소와 동일)"
                />
              </div>
            </div>

            {/* 운전자 정보 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  운전 서비스
                </label>
                <div className="space-y-2">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="driver_service"
                      checked={!formData.has_driver}
                      onChange={() => handleInputChange('has_driver', false)}
                      className="mr-2"
                    />
                    <span>직접 운전 (셀프 렌트카)</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="driver_service"
                      checked={formData.has_driver}
                      onChange={() => handleInputChange('has_driver', true)}
                      className="mr-2"
                    />
                    <span>운전기사 포함</span>
                  </label>
                </div>
              </div>

              {!formData.has_driver && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    운전자 나이 *
                  </label>
                  <input
                    type="number"
                    min="21"
                    max="80"
                    value={formData.driver_age}
                    onChange={(e) => handleInputChange('driver_age', parseInt(e.target.value) || 21)}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required={!formData.has_driver}
                  />
                  <p className="text-sm text-gray-500 mt-1">만 21세 이상</p>
                </div>
              )}
            </div>

            {/* 보험 정보 */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                보험 타입
              </label>
              <select
                value={formData.insurance_type}
                onChange={(e) => handleInputChange('insurance_type', e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">선택해주세요</option>
                <option value="basic">기본 보험</option>
                <option value="comprehensive">종합 보험</option>
                <option value="full">완전 보험</option>
                <option value="premium">프리미엄 보험</option>
              </select>
            </div>

            {/* 대여 기간 표시 */}
            {formData.pickup_date && formData.return_date && (
              <div className="mb-6 p-4 bg-blue-50 rounded-lg">
                <h3 className="font-semibold text-blue-800 mb-2">대여 기간</h3>
                <div className="text-blue-700">
                  {new Date(formData.pickup_date).toLocaleDateString('ko-KR')} ~ {new Date(formData.return_date).toLocaleDateString('ko-KR')}
                  {(() => {
                    const pickup = new Date(formData.pickup_date);
                    const returnDate = new Date(formData.return_date);
                    const days = Math.ceil((returnDate.getTime() - pickup.getTime()) / (1000 * 60 * 60 * 24));
                    return days > 0 ? ` (${days}일)` : '';
                  })()}
                </div>
                <div className="text-sm text-blue-600 mt-1">
                  운전 방식: {formData.has_driver ? '운전기사 포함' : '직접 운전'}
                  {!formData.has_driver && formData.driver_age && ` (운전자 ${formData.driver_age}세)`}
                </div>
              </div>
            )}

            {/* 특별 요청 사항 */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                특별 요청사항
              </label>
              <textarea
                value={formData.special_requests}
                onChange={(e) => handleInputChange('special_requests', e.target.value)}
                rows={4}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="아이 카시트, 네비게이션, 블랙박스, 스키캐리어 등 추가 옵션이나 요청사항을 입력해주세요..."
              />
            </div>

            {/* 버튼 */}
            <div className="flex gap-4 justify-end">
              <button
                type="button"
                onClick={() => router.push('/mypage/quotes/new')}
                className="px-6 py-3 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? '추가 중...' : '견적에 추가'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
