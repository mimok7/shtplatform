'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import supabase from '@/lib/supabase';

function NewTourQuoteContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const quoteId = searchParams.get('quoteId');
  const itemId = searchParams.get('itemId');
  const serviceRefId = searchParams.get('serviceRefId');
  const mode = searchParams.get('mode');

  const [loading, setLoading] = useState(false);
  const [quote, setQuote] = useState<any>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [tourNameOptions, setTourNameOptions] = useState<string[]>([]);
  const [vehicleOptions, setVehicleOptions] = useState<string[]>([]);
  const [paymentOptions, setPaymentOptions] = useState<string[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);

  // 선택된 값들
  const [selectedTourName, setSelectedTourName] = useState('');
  const [selectedVehicle, setSelectedVehicle] = useState('');
  const [selectedPayment, setSelectedPayment] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');

  const [selectedTourCode, setSelectedTourCode] = useState(''); // 검색된 투어 코드 표시용

  const [formData, setFormData] = useState({
    tour_date: '',
    special_requests: ''
  });

  useEffect(() => {
    if (!quoteId) {
      alert('가격 ID가 필요합니다.');
      router.push('/mypage');
      return;
    }

    // URL 파라미터로 수정 모드 확인
    const isEdit = mode === 'edit' && itemId && serviceRefId;
    setIsEditMode(Boolean(isEdit));

    const initializeData = async () => {
      if (isEdit) {
        // 수정 모드: 기존 데이터 로드
        await loadExistingQuoteData();
      } else {
        // 새 생성 모드: 투어명 옵션 로드
        await loadTourNameOptions();
      }
      await loadQuote();
    };

    initializeData();
  }, [quoteId, router, mode, itemId, serviceRefId]);

  // 투어명 선택 시 차량 옵션 업데이트
  useEffect(() => {
    if (selectedTourName) {
      loadVehicleOptions(selectedTourName);
    } else {
      setVehicleOptions([]);
      setSelectedVehicle('');
    }
  }, [selectedTourName]);

  // 투어명과 차량이 선택될 때 투어 타입 목록 업데이트
  useEffect(() => {
    if (selectedTourName && selectedVehicle) {
      loadPaymentOptions(selectedTourName, selectedVehicle);
    } else {
      setPaymentOptions([]);
      setSelectedPayment('');
    }
  }, [selectedTourName, selectedVehicle]);

  // 투어명, 차량, 투어 타입이 선택될 때 최대 참가자수 목록 업데이트
  useEffect(() => {
    if (selectedTourName && selectedVehicle && selectedPayment) {
      loadCategoryOptions(selectedTourName, selectedVehicle, selectedPayment);
    } else {
      setCategoryOptions([]);
      setSelectedCategory('');
    }
  }, [selectedTourName, selectedVehicle, selectedPayment]);

  // 모든 조건이 선택되면 투어 코드 조회
  useEffect(() => {
    if (selectedTourName && selectedVehicle && selectedPayment && selectedCategory) {
      getTourCodeFromConditions(selectedTourName, selectedVehicle, selectedPayment, selectedCategory)
        .then(code => setSelectedTourCode(code))
        .catch(() => setSelectedTourCode(''));
    } else {
      setSelectedTourCode('');
    }
  }, [selectedTourName, selectedVehicle, selectedPayment, selectedCategory]);

  // 기존 가격 데이터 로드 (수정 모드용)
  const loadExistingQuoteData = async () => {
    try {
      setLoading(true);

      const { data: serviceData, error: serviceError } = await supabase
        .from('tour')
        .select('*')
        .eq('id', serviceRefId)
        .single();

      if (serviceError || !serviceData) {
        console.error('서비스 데이터 조회 오류:', serviceError);
        alert('서비스 데이터를 찾을 수 없습니다.');
        return;
      }

      // 먼저 모든 옵션 로드
      await loadTourNameOptions();

      // tour_code로 투어 가격 정보 조회하여 폼 데이터 복원
      const { data: tourPriceData, error: priceError } = await supabase
        .from('tour_price')
        .select('*')
        .eq('tour_code', serviceData.tour_code)
        .single();

      if (priceError || !tourPriceData) {
        console.error('투어 가격 정보 조회 오류:', priceError);
        alert('투어 가격 정보를 찾을 수 없습니다.');
        return;
      }

      // 순차적으로 선택값들 설정
      setSelectedTourName(tourPriceData.tour_name);
      await loadVehicleOptions(tourPriceData.tour_name);

      setSelectedVehicle(tourPriceData.tour_vehicle);
      await loadPaymentOptions(tourPriceData.tour_name, tourPriceData.tour_vehicle);

      setSelectedPayment(tourPriceData.tour_type);
      await loadCategoryOptions(tourPriceData.tour_name, tourPriceData.tour_vehicle, tourPriceData.tour_type);

      setSelectedCategory(tourPriceData.tour_capacity.toString());

      // 폼 데이터 설정
      setFormData({
        tour_date: serviceData.tour_date || '',
        special_requests: serviceData.special_requests || ''
      });

      console.log('기존 투어 가격 데이터 로드 완료:', serviceData);
    } catch (error) {
      console.error('기존 가격 데이터 로드 오류:', error);
      alert('기존 가격 데이터를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const loadTourNameOptions = async () => {
    try {
      const { data, error } = await supabase
        .from('tour_price')
        .select('tour_name')
        .order('tour_name');

      if (error) throw error;

      // 중복 제거
      const uniqueTourNames = [...new Set(data.map((item: any) => item.tour_name))] as string[];
      setTourNameOptions(uniqueTourNames);
    } catch (error) {
      console.error('투어명 로드 실패:', error);
    }
  };

  const loadVehicleOptions = async (tourName: string) => {
    try {
      const { data, error } = await supabase
        .from('tour_price')
        .select('tour_vehicle')
        .eq('tour_name', tourName)
        .order('tour_vehicle');

      if (error) throw error;

      // 중복 제거
      const uniqueVehicles = [...new Set(data.map((item: any) => item.tour_vehicle))] as string[];
      setVehicleOptions(uniqueVehicles);
    } catch (error) {
      console.error('차량 옵션 로드 실패:', error);
    }
  };

  const loadPaymentOptions = async (tourName: string, vehicle: string) => {
    try {
      const { data, error } = await supabase
        .from('tour_price')
        .select('tour_type')
        .eq('tour_name', tourName)
        .eq('tour_vehicle', vehicle)
        .order('tour_type');

      if (error) throw error;

      // 중복 제거
      const uniquePayments = [...new Set(data.map((item: any) => item.tour_type))] as string[];
      setPaymentOptions(uniquePayments);
    } catch (error) {
      console.error('투어 타입 옵션 로드 실패:', error);
    }
  };

  const loadCategoryOptions = async (tourName: string, vehicle: string, payment: string) => {
    try {
      const { data, error } = await supabase
        .from('tour_price')
        .select('tour_capacity')
        .eq('tour_name', tourName)
        .eq('tour_vehicle', vehicle)
        .eq('tour_type', payment)
        .order('tour_capacity');

      if (error) throw error;

      // 중복 제거 (최대 참가자수는 숫자이므로 문자열로 변환)
      const uniqueCategories = [...new Set(data.map((item: any) => item.tour_capacity.toString()))] as string[];
      setCategoryOptions(uniqueCategories);
    } catch (error) {
      console.error('최대 참가자수 옵션 로드 실패:', error);
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
      router.push('/mypage/quotes');
    }
  };

  // 4가지 조건으로 tour_code 조회
  const getTourCodeFromConditions = async (tourName: string, vehicle: string, payment: string, category: string) => {
    try {
      const { data, error } = await supabase
        .from('tour_price')
        .select('tour_code')
        .eq('tour_name', tourName)
        .eq('tour_vehicle', vehicle)
        .eq('tour_type', payment)
        .eq('tour_capacity', parseInt(category))
        .single();

      if (error) throw error;
      return data.tour_code;
    } catch (error) {
      console.error('tour_code 조회 실패:', error);
      throw error;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedTourName || !selectedVehicle || !selectedPayment || !selectedCategory) {
      alert('모든 필수 항목을 선택해주세요.');
      return;
    }

    if (!quoteId) {
      alert('가격 ID가 없습니다.');
      return;
    }

    setLoading(true);

    try {
      // 4가지 조건으로 tour_code 조회
      const tourCode = await getTourCodeFromConditions(
        selectedTourName,
        selectedVehicle,
        selectedPayment,
        selectedCategory
      );

      // 투어 폼 데이터 구성 - 필수 필드만 포함
      const tourData = {
        tour_code: tourCode,
        tour_date: formData.tour_date,
        ...(formData.special_requests && { special_requests: formData.special_requests })
      };

      console.log('🎯 투어 데이터:', tourData);

      if (isEditMode && serviceRefId) {
        // 수정 모드: 기존 투어 서비스 업데이트
        const { error: updateError } = await supabase
          .from('tour')
          .update(tourData)
          .eq('id', serviceRefId);

        if (updateError) {
          console.error('❌ 투어 서비스 수정 오류:', updateError);
          alert(`투어 서비스 수정 실패: ${updateError.message}`);
          return;
        }

        console.log('✅ 투어 서비스 수정 성공');
        alert('투어 정보가 수정되었습니다!');
      } else {
        // 생성 모드: 새 투어 서비스 생성
        const { data: tourServiceData, error: tourError } = await supabase
          .from('tour')
          .insert([tourData])
          .select()
          .single();

        if (tourError) {
          console.error('❌ 투어 서비스 생성 오류:', tourError);
          alert(`투어 서비스 생성 실패: ${tourError.message}`);
          return;
        }

        console.log('✅ 투어 서비스 생성 성공:', tourServiceData);

        // 가격 아이템 생성
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

        if (itemError) {
          console.error('❌ 가격 아이템 생성 오류:', itemError);
          alert(`가격 아이템 생성 실패: ${itemError.message}`);
          return;
        }

        console.log('✅ 가격 아이템 생성 성공:', itemData);
        alert('투어가 가격에 추가되었습니다!');
      }

      // 수정 완료 후 2폴더로 이동 (렌터카 패턴과 동일)
      if (isEditMode) {
        router.push(`/mypage/quotes/new?quoteId=${quoteId}`);
      } else {
        router.push(`/mypage/direct-booking/tour/2?quoteId=${quoteId}`);
      }

    } catch (error) {
      console.error('❌ 투어 가격 처리 중 오류:', error);
      alert('오류가 발생했습니다: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const isFormValid = selectedTourName && selectedVehicle && selectedPayment && selectedCategory && formData.tour_date;

  if (!quote) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
          <p className="mt-4 text-gray-600">가격 정보를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <div className="bg-gradient-to-br from-blue-200 via-purple-200 to-indigo-100 text-gray-900">
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold mb-2">
                🎯 투어 가격 {isEditMode ? '수정' : '신청'}
              </h1>
              <p className="text-lg opacity-90">
                투어 여행을 위한 가격을 {isEditMode ? '수정' : '작성'}해주세요.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => router.back()}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
              >
                ← 뒤로
              </button>
            </div>
          </div>

          {/* 가격 정보 */}
          <div className="bg-white/70 backdrop-blur rounded-lg p-4 mb-6">
            <h3 className="font-semibold text-gray-800 mb-2">현재 가격 정보</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>가격명: <span className="font-semibold text-blue-600">{quote.title}</span></div>
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
            <h2 className="text-2xl font-bold text-gray-800 mb-6">
              투어 정보 {isEditMode ? '수정' : '입력'}
            </h2>

            {/* 투어 안내 카드 */}
            <div className="bg-blue-600 rounded-lg p-6 mb-6 border border-blue-700">
              <h3 className="text-white text-lg font-semibold mb-2">📝 가격안내</h3>
              <p className="text-white/90 text-sm">투어 예약을 위해 아래 정보를 순서대로 입력해 주세요.<br />정확한 투어명, 차량, 투어 타입, 참가자수 정보를 입력하시면 빠른 가격 안내가 가능합니다.</p>
            </div>

            {/* 투어 선택 폼 */}
            <div className="space-y-6">
              {/* 1단계: 투어명 선택 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  🎯 투어명 *
                </label>
                <select
                  value={selectedTourName}
                  onChange={(e) => setSelectedTourName(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                >
                  <option value="">투어명을 선택하세요</option>
                  {tourNameOptions.map(tour => (
                    <option key={tour} value={tour}>{tour}</option>
                  ))}
                </select>
              </div>

              {/* 2단계: 차량 선택 */}
              {selectedTourName && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    🚗 차량 *
                  </label>
                  <select
                    value={selectedVehicle}
                    onChange={(e) => setSelectedVehicle(e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  >
                    <option value="">차량을 선택하세요</option>
                    {vehicleOptions.map(vehicle => (
                      <option key={vehicle} value={vehicle}>{vehicle}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* 3단계: 투어 타입 선택 */}
              {selectedTourName && selectedVehicle && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    💳 투어 타입 *
                  </label>
                  <select
                    value={selectedPayment}
                    onChange={(e) => setSelectedPayment(e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  >
                    <option value="">투어 타입을 선택하세요</option>
                    {paymentOptions.map(payment => (
                      <option key={payment} value={payment}>{payment}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* 4단계: 최대 참가자수 선택 */}
              {selectedTourName && selectedVehicle && selectedPayment && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    👥 최대 참가자수 *
                  </label>
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  >
                    <option value="">최대 참가자수를 선택하세요</option>
                    {categoryOptions.map(category => (
                      <option key={category} value={category}>{category}명</option>
                    ))}
                  </select>
                </div>
              )}

              {/* 투어 날짜 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  📅 투어 날짜 *
                </label>
                <input
                  type="date"
                  value={formData.tour_date}
                  onChange={(e) => setFormData({ ...formData, tour_date: e.target.value })}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>

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
                  placeholder="특별한 요청사항이 있으시면 입력해주세요"
                />
              </div>

              {/* 선택 요약 */}
              {isFormValid && (
                <div className="bg-green-50 p-6 rounded-lg border border-green-200">
                  <h3 className="font-semibold text-green-800 mb-3">✅ 선택 요약</h3>
                  <div className="text-green-700 space-y-2">
                    <div><strong>투어명:</strong> {selectedTourName}</div>
                    <div><strong>차량:</strong> {selectedVehicle}</div>
                    <div><strong>투어 타입:</strong> {selectedPayment}</div>
                    <div><strong>최대 참가자수:</strong> {selectedCategory}명</div>
                    <div><strong>투어 날짜:</strong> {new Date(formData.tour_date).toLocaleDateString('ko-KR')}</div>
                    {selectedTourCode && (
                      <div className="pt-2 border-t border-green-200">
                        <strong>🔍 검색된 투어 코드:</strong> <span className="bg-yellow-100 px-2 py-1 rounded font-mono text-sm">{selectedTourCode}</span>
                      </div>
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
                {loading ? '처리 중...' : isEditMode ? '수정 완료' : '다음'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}


export default function NewTourQuotePage() {
  return (
    <Suspense fallback={<div className="flex justify-center items-center h-64">로딩 중...</div>}>
      <NewTourQuoteContent />
    </Suspense>
  );
}
