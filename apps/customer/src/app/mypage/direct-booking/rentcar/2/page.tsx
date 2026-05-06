'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import supabase from '@/lib/supabase';
import { ensureMemberRole, getFastAuthUser } from '@/lib/reservationAuth';

function RentcarReservationContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const quoteId = searchParams.get('quoteId');

  const [loading, setLoading] = useState(false);
  const [quote, setQuote] = useState<any>(null);
  const [user, setUser] = useState<any>(null);
  const [availableServices, setAvailableServices] = useState<any[]>([]);
  const [selectedServices, setSelectedServices] = useState<any[]>([]);

  // 예약에 필요한 추가 state
  const [rentcarCount, setRentcarCount] = useState(1);
  const [unitPrice, setUnitPrice] = useState(0);

  // 폼 데이터
  const [formData, setFormData] = useState({
    pickup_datetime: '',
    return_datetime: '',
    pickup_location: '',
    destination: '',
    driver_count: 1,
    passenger_count: 1,
    luggage_count: 0,
    request_note: ''
  });

  useEffect(() => {
    if (!quoteId) {
      alert('가격 ID가 필요합니다.');
      router.push('/mypage/direct-booking');
      return;
    }

    const init = async () => {
      try {
        const { user: authUser } = await getFastAuthUser();
        if (!authUser) {
          router.push('/login');
          return;
        }

        setUser(authUser);
        await Promise.all([loadQuote(), loadRentcarServices()]);
      } catch (error) {
        console.error('초기 로드 오류:', error);
        router.push('/login');
      }
    };

    init();
  }, [quoteId, router]);

  // 가격 정보 로드
  const loadQuote = async () => {
    try {
      const { data: quoteData, error } = await supabase
        .from('quote')
        .select('*')
        .eq('id', quoteId)
        .single();

      if (error || !quoteData) {
        alert('가격을 찾을 수 없습니다.');
        router.push('/mypage/direct-booking');
        return;
      }

      setQuote(quoteData);
    } catch (error) {
      console.error('가격 로드 오류:', error);
      alert('가격 정보를 불러오는 중 오류가 발생했습니다.');
    }
  };

  // 가격에 연결된 렌터카 서비스들 조회
  const loadRentcarServices = async () => {
    try {
      const { data: quoteItems } = await supabase
        .from('quote_item')
        .select('service_type, service_ref_id, usage_date')
        .eq('quote_id', quoteId)
        .eq('service_type', 'rentcar');

      console.log('🔍 Quote Items:', quoteItems);

      if (quoteItems && quoteItems.length > 0) {
        const allServices = [];
        const uniqueServiceIds = Array.from(new Set(quoteItems.map(item => item.service_ref_id).filter(Boolean)));

        const { data: rentcarRows, error: rentcarError } = await supabase
          .from('rentcar')
          .select('id, rentcar_code')
          .in('id', uniqueServiceIds);

        if (rentcarError) {
          console.error('Rentcar 조회 오류:', rentcarError);
          return;
        }

        const rentcarCodeById = new Map((rentcarRows || []).map((row: any) => [row.id, row.rentcar_code]));
        const uniqueRentCodes = Array.from(new Set((rentcarRows || []).map((row: any) => row.rentcar_code).filter(Boolean)));

        const { data: allPriceOptions, error: priceError } = await supabase
          .from('rent_price')
          .select('*')
          .in('rent_code', uniqueRentCodes);

        if (priceError) {
          console.error('Rent price 조회 오류:', priceError);
          return;
        }

        const priceOptionsByCode = (allPriceOptions || []).reduce((acc: Record<string, any[]>, option: any) => {
          if (!acc[option.rent_code]) acc[option.rent_code] = [];
          acc[option.rent_code].push(option);
          return acc;
        }, {});

        for (const item of quoteItems) {
          const rentcarCode = rentcarCodeById.get(item.service_ref_id) as string | undefined;
          const priceOptions = rentcarCode ? (priceOptionsByCode[rentcarCode] || []) : [];

          if (priceOptions.length > 0) {
            allServices.push(...priceOptions.map(option => ({
              ...option,
              usage_date: item.usage_date,
              // 호환성을 위한 필드 매핑
              rentcar_code: option.rent_code,
              car_model: option.rent_car_type || '일반 차량',
              vehicle_type: option.rent_type || '렌터카',
              seats: '4',
              features: `${option.rent_category} - ${option.rent_route}`
            })));
          }
        }

        console.log('📋 All Services:', allServices);
        setAvailableServices(allServices);

        // 1단계에서 선택된 렌터카 정보를 자동으로 설정 (읽기 전용)
        if (allServices.length > 0) {
          console.log('💡 1단계에서 선택된 렌터카 정보를 확인합니다:', allServices.length, '개');

          const firstService = allServices[0];
          console.log('🎯 선택된 렌터카:', firstService.car_model);

          setSelectedServices([firstService]);
          setRentcarCount(1);
          setUnitPrice(firstService.price || 0);

          console.log('💰 계산된 총 금액:', (firstService.price || 0), '동');
        }
      }
    } catch (error) {
      console.error('렌터카 서비스 로드 오류:', error);
    }
  };

  // 서비스 선택/해제 함수 제거 (읽기 전용으로 변경)
  // const toggleService = (service: any) => {
  //   // 더 이상 선택/해제 불가 - 1단계에서 선택된 정보만 표시
  // };

  // 차량 타입별 서비스 분류
  const getServicesByType = () => {
    const types: { [key: string]: any[] } = {};
    availableServices.forEach(service => {
      const type = service.vehicle_type || '기타';
      if (!types[type]) {
        types[type] = [];
      }
      types[type].push(service);
    });
    return types;
  };

  // 예약 저장
  const handleSubmit = async () => {
    if (!user) {
      alert('로그인이 필요합니다.');
      return;
    }

    if (selectedServices.length === 0) {
      alert('최소 하나의 렌터카를 선택해주세요.');
      return;
    }

    setLoading(true);

    try {
      await ensureMemberRole(user);

      // 중복 예약 확인
      const { data: duplicateCheck } = await supabase
        .from('reservation')
        .select('re_id')
        .eq('re_user_id', user.id)
        .eq('re_quote_id', quoteId)
        .eq('re_type', 'rentcar')
        .maybeSingle();

      let reservationData;

      if (duplicateCheck) {
        // 기존 예약 업데이트
        reservationData = { re_id: duplicateCheck.re_id };
        await supabase
          .from('reservation_rentcar')
          .delete()
          .eq('reservation_id', duplicateCheck.re_id);
      } else {
        // 새 예약 생성
        const { data: newReservation, error: reservationError } = await supabase
          .from('reservation')
          .insert({
            re_user_id: user.id,
            re_quote_id: quoteId,
            re_type: 'rentcar',
            re_status: 'pending',
            re_created_at: new Date().toISOString()
          })
          .select()
          .single();

        if (reservationError) {
          console.error('예약 생성 오류:', reservationError);
          alert('예약 생성 중 오류가 발생했습니다.');
          return;
        }
        reservationData = newReservation;
      }

      // 메인 서비스 저장 (크루즈 패턴)
      const mainService = selectedServices[0];
      const additionalServicesNote = selectedServices
        .slice(1)
        .map(service => `추가 차량: ${service.car_model} - ${service.vehicle_type} (${service.price?.toLocaleString()}동)`)
        .join('\n');

      const fullRequestNote = [
        formData.request_note,
        additionalServicesNote
      ].filter(Boolean).join('\n');

      const rentcarReservationData = {
        reservation_id: reservationData.re_id,
        rentcar_price_code: mainService.rent_code, // rent_code 사용
        rentcar_count: 1, // 필수 컬럼
        unit_price: mainService.price || 0, // 필수 컬럼
        car_count: formData.driver_count || 1,
        passenger_count: formData.passenger_count || 1,
        pickup_datetime: formData.pickup_datetime ? new Date(formData.pickup_datetime).toISOString() : null,
        pickup_location: formData.pickup_location || null,
        destination: formData.destination || null,
        luggage_count: formData.luggage_count || 0,
        total_price: selectedServices.reduce((sum, service) => sum + (service.price || 0), 0),
        request_note: fullRequestNote || null
      };

      console.log('💾 Rentcar Reservation Data:', rentcarReservationData);

      const { error: rentcarError } = await supabase
        .from('reservation_rentcar')
        .insert(rentcarReservationData);

      if (rentcarError) {
        console.error('렌터카 예약 저장 오류:', rentcarError);
        alert('렌터카 예약 저장 중 오류가 발생했습니다.');
        return;
      }

      alert('예약 신청이 완료되었습니다.\n카카오 채널로 연락주세요.\n담당자의 안내에 따라 결제를 진행하셔야 예약이 완료됩니다.');
      router.push('/mypage/direct-booking');

    } catch (error) {
      console.error('예약 저장 오류:', error);
      alert('예약 저장 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  if (!quote) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
          <p className="mt-4 text-gray-600">데이터를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  const servicesByType = getServicesByType();
  const totalPrice = selectedServices.reduce((sum, service) => sum + (service.price || 0), 0);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <div className="bg-gradient-to-br from-purple-200 via-indigo-200 to-blue-100 text-gray-900">
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-lg font-bold text-gray-800">🚗 렌터카 서비스 예약</h1>
              <p className="text-sm text-gray-600 mt-1">가격: {quote.title}</p>
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
          <div className="bg-white rounded-xl shadow-lg p-8">
            <h2 className="text-lg font-bold text-gray-800 mb-6">🎯 2단계: 예약 진행</h2>

            {/* 가격 정보 */}
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-6">
              <h3 className="font-semibold text-purple-800 mb-2">✅ 가격이 성공적으로 저장되었습니다!</h3>
              <div className="text-sm text-purple-700">
                <p>가격명: <span className="font-semibold">{quote.title}</span></p>
                <p>이제 예약 정보를 입력해주세요.</p>
              </div>
            </div>

            {/* 선택된 차량 정보 표시 (읽기 전용) */}
            {availableServices.length > 0 ? (
              <div className="space-y-4 mb-6">
                <h3 className="text-lg font-semibold text-gray-800">🚗 선택된 렌터카 정보 (1단계에서 선택됨)</h3>

                {/* 선택된 서비스 표시 (클릭 불가) */}
                {selectedServices.length > 0 && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h4 className="text-md font-medium text-blue-800 mb-3">✅ 확정된 렌터카</h4>
                    <div className="space-y-3">
                      {selectedServices.map((service, index) => (
                        <div
                          key={index}
                          className="p-4 rounded-lg border-2 border-blue-500 bg-blue-50"
                        >
                          <div className="flex justify-between items-start mb-2">
                            <span className="font-medium text-blue-900">{service.car_model}</span>
                            <span className="text-blue-600 font-bold">{service.price?.toLocaleString()}동</span>
                          </div>
                          <div className="text-sm text-blue-700">
                            <div>좌석: {service.seats}인승</div>
                            <div>특징: {service.features}</div>
                            <div className="text-blue-600 mt-1">카테고리: {service.rent_category}</div>
                            <div className="text-blue-600">경로: {service.rent_route}</div>
                          </div>
                        </div>
                      ))}
                      <div className="border-t border-blue-300 pt-3 mt-3">
                        <div className="flex justify-between font-bold text-blue-800">
                          <span>총 예상 금액:</span>
                          <span>{totalPrice.toLocaleString()}동</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 수정 안내 */}
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                  <p className="text-sm text-gray-600 flex items-center">
                    <span className="mr-2">💡</span>
                    렌터카 선택을 변경하려면 <button
                      onClick={() => router.push(`/mypage/direct-booking/rentcar/1?quoteId=${quoteId}`)}
                      className="text-blue-600 hover:text-blue-800 underline mx-1"
                    >
                      이전 단계
                    </button>로 돌아가세요.
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-6 mb-6">
                <div className="text-center">
                  <div className="text-orange-500 text-3xl mb-3">🚗</div>
                  <h3 className="text-lg font-medium text-orange-800 mb-2">차량 정보를 불러오는 중...</h3>
                  <p className="text-orange-600 text-sm">
                    1단계에서 선택한 렌터카 정보를 확인하고 있습니다.
                  </p>
                  <p className="text-orange-500 text-xs mt-2">
                    Quote ID: {quoteId} | Available Services: {availableServices.length}
                  </p>
                </div>
              </div>
            )}

            {/* 예약 세부 정보 입력 */}
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">픽업 일시</label>
                  <input
                    type="datetime-local"
                    value={formData.pickup_datetime}
                    onChange={(e) => setFormData({ ...formData, pickup_datetime: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">샌딩 일시</label>
                  <input
                    type="datetime-local"
                    value={formData.return_datetime}
                    onChange={(e) => setFormData({ ...formData, return_datetime: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">픽업 장소</label>
                  <input
                    type="text"
                    value={formData.pickup_location}
                    onChange={(e) => setFormData({ ...formData, pickup_location: e.target.value })}
                    placeholder="픽업 희망 장소를 입력해주세요"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">목적지</label>
                  <input
                    type="text"
                    value={formData.destination}
                    onChange={(e) => setFormData({ ...formData, destination: e.target.value })}
                    placeholder="최종 목적지를 입력해주세요"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">차량 수</label>
                  <input
                    type="number"
                    min="1"
                    value={formData.driver_count}
                    onChange={(e) => setFormData({ ...formData, driver_count: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">탑승 인원</label>
                  <input
                    type="number"
                    min="1"
                    value={formData.passenger_count}
                    onChange={(e) => setFormData({ ...formData, passenger_count: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">수하물 개수</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.luggage_count}
                    onChange={(e) => setFormData({ ...formData, luggage_count: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">🚗 렌터카 관련 요청사항</label>
                <textarea
                  value={formData.request_note}
                  onChange={(e) => setFormData({ ...formData, request_note: e.target.value })}
                  placeholder="예) 차량 색상 선호, 네비게이션 언어 설정, 보험 추가 옵션, 운전자 추가 등"
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 resize-vertical"
                />
                <p className="mt-1 text-xs text-gray-500">
                  * 차량 인수, 보험, 운전자 관련 특별 요청사항을 입력해 주세요.
                </p>
              </div>
            </div>

            {/* 예약 완료 버튼 */}
            <div className="flex justify-end space-x-4 mt-8">
              <button
                type="button"
                onClick={() => router.push(`/mypage/direct-booking/rentcar/1?quoteId=${quoteId}`)}
                className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors text-xs"
              >
                이전 단계
              </button>

              {/* 디버깅 정보 표시 */}
              {selectedServices.length === 0 && (
                <div className="px-4 py-2 bg-yellow-100 text-yellow-800 rounded-lg text-xs">
                  차량 선택 필요 (Available: {availableServices.length})
                </div>
              )}

              <button
                onClick={handleSubmit}
                disabled={loading || selectedServices.length === 0}
                className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors text-xs"
              >
                {loading ? '예약 중...' : selectedServices.length === 0 ? '차량을 선택하세요' : '예약 완료'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RentcarReservationPage() {
  return (
    <Suspense fallback={<div className="flex justify-center items-center h-64">로딩 중...</div>}>
      <RentcarReservationContent />
    </Suspense>
  );
}
