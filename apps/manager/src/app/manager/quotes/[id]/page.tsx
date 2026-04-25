'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import supabase from '@/lib/supabase';
import { updateQuoteItemPrices } from '@/lib/updateQuoteItemPrices';

interface QuoteDetail {
  id: string;
  status: string;
  total_price: number;
  created_at: string;
  updated_at: string;
  user_id: string;
  departure_date: string;
  return_date: string;
  adult_count: number;
  person_count?: number;
  infant_count: number;
  cruise_name?: string;
  manager_note?: string;
  users?: {
    name: string;
    email: string;
    phone_number?: string;
  };
  // 서비스 테이블 (견적 룸 제거됨)
  rentcar?: any[];
  cruise?: any[];
  airport?: any[];
  hotel?: any[];
  tour?: any[];
}

export default function QuoteDetailPage() {
  const router = useRouter();
  const params = useParams();
  const quoteId = params.id as string;

  const [user, setUser] = useState<any>(null);
  const [calculating, setCalculating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [quote, setQuote] = useState<QuoteDetail | null>(null);
  const [detailedServices, setDetailedServices] = useState<any>({});
  const [approvalNote, setApprovalNote] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [showRejectionModal, setShowRejectionModal] = useState(false);

  useEffect(() => {
    async function init() {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (authUser) {
        setUser(authUser);
      }
    }
    init();
  }, []);

  useEffect(() => {
    if (user && quoteId) {
      loadQuoteDetail();
      loadDetailedServices();
    }
  }, [user, quoteId]);

  // checkAuth 제거됨 - useAuth 훅 사용

  const loadQuoteDetail = async () => {
    try {
      console.log('📋 견적 상세 정보 로딩 시작...', quoteId);

      // 견적 기본 정보 조회
      const { data: quoteData, error: quoteError } = await supabase
        .from('quote')
        .select('*')
        .eq('id', quoteId)
        .single();

      if (quoteError) {
        console.error('❌ 견적 조회 실패:', quoteError);
        alert('견적을 찾을 수 없습니다.');
        router.push('/manager/quotes');
        return;
      }

      console.log('✅ 견적 기본 정보:', quoteData);

      // 사용자 정보 조회 (안전한 방식)
      let userData = null;
      try {
        const { data: userResult, error: userError } = await supabase
          .from('users')
          .select('id, name, email, phone_number')
          .eq('id', quoteData.user_id)
          .single();

        if (userError) {
          console.warn('⚠️ 사용자 정보 조회 실패:', userError);
        } else {
          userData = userResult;
        }
      } catch (userErr) {
        console.warn('⚠️ 사용자 정보 조회 예외:', userErr);
      }

      console.log('👤 사용자 정보:', userData);

      // quote_item을 통해 서비스 데이터 조회 (올바른 스키마 구조)
      const serviceQueries = await Promise.allSettled([
        // 객실 정보 (quote_room 테이블이 없을 수 있으므로 안전하게)
        supabase
          .from('quote_room')
          .select(`*`)
          .eq('quote_id', quoteId),

        // quote_item을 통한 각 서비스별 데이터 조회 (조인 없이 먼저 시도)
        supabase
          .from('quote_item')
          .select('*')
          .eq('quote_id', quoteId)
          .eq('service_type', 'rentcar'),

        supabase
          .from('quote_item')
          .select('*')
          .eq('quote_id', quoteId)
          .eq('service_type', 'cruise'),

        supabase
          .from('quote_item')
          .select('*')
          .eq('quote_id', quoteId)
          .eq('service_type', 'airport'),

        supabase
          .from('quote_item')
          .select('*')
          .eq('quote_id', quoteId)
          .eq('service_type', 'hotel'),

        supabase
          .from('quote_item')
          .select('*')
          .eq('quote_id', quoteId)
          .eq('service_type', 'tour')
      ]);

      console.log('🔍 각 테이블별 조회 상태:');
      serviceQueries.forEach((result, index) => {
        const tableNames = ['quote_room', 'rentcar(quote_item)', 'cruise(quote_item)', 'airport(quote_item)', 'hotel(quote_item)', 'tour(quote_item)'];
        console.log(`  ${tableNames[index]}: ${result.status}`);
        if (result.status === 'rejected') {
          console.log(`    에러:`, result.reason);
        }
      });

      // 결과 처리 및 상세 로깅 (견적 룸 테이블 제거됨)

      // quote_item 데이터에서 서비스별로 분류
      const carItems = serviceQueries[0].status === 'fulfilled' ? (serviceQueries[0].value.data || []) : [];
      const cruiseItems = serviceQueries[1].status === 'fulfilled' ? (serviceQueries[1].value.data || []) : [];
      const airportItems = serviceQueries[2].status === 'fulfilled' ? (serviceQueries[2].value.data || []) : [];
      const hotelItems = serviceQueries[3].status === 'fulfilled' ? (serviceQueries[3].value.data || []) : [];
      const tourItems = serviceQueries[4].status === 'fulfilled' ? (serviceQueries[4].value.data || []) : [];

      // quote_item 데이터를 그대로 사용 (조인 없이)
      const carData = carItems.map((item: any) => ({
        id: item.id,
        service_ref_id: item.service_ref_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: item.total_price,
        options: item.options,
        // 기본 필드들
        car_model: item.options?.car_model || '렌트카',
        pickup_date: item.options?.pickup_date || null,
        return_date: item.options?.return_date || null,
        pickup_location: item.options?.pickup_location || '미정',
        return_location: item.options?.return_location || '미정'
      }));

      const cruiseData = cruiseItems.map((item: any) => ({
        id: item.id,
        service_ref_id: item.service_ref_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: item.total_price,
        options: item.options,
        // 기본 필드들
        cruise_name: item.options?.cruise_name || '크루즈',
        departure_date: item.options?.departure_date || null,
        return_date: item.options?.return_date || null,
        departure_port: item.options?.departure_port || '미정'
      }));

      const airportData = airportItems.map((item: any) => ({
        id: item.id,
        service_ref_id: item.service_ref_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: item.total_price,
        options: item.options,
        // 기본 필드들
        service_type: item.options?.service_type || '공항 서비스',
        flight_number: item.options?.flight_number || '미정'
      }));

      const hotelData = hotelItems.map((item: any) => ({
        id: item.id,
        service_ref_id: item.service_ref_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: item.total_price,
        options: item.options,
        // 기본 필드들
        hotel_name: item.options?.hotel_name || '호텔',
        check_in_date: item.options?.check_in_date || null,
        check_out_date: item.options?.check_out_date || null
      }));

      const tourData = tourItems.map((item: any) => ({
        id: item.id,
        service_ref_id: item.service_ref_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: item.total_price,
        options: item.options,
        // 기본 필드들
        tour_name: item.options?.tour_name || '투어',
        tour_date: item.options?.tour_date || null,
        duration_hours: item.options?.duration_hours || null
      }));

      // 상세 에러 로깅 및 성공 여부 확인
      serviceQueries.forEach((result, index) => {
        const names = ['객실(quote_room)', '렌트카(rentcar)', '크루즈(cruise)', '공항(airport)', '호텔(hotel)', '투어(tour)'];
        if (result.status === 'rejected') {
          console.warn(`❌ ${names[index]} 테이블 조회 실패:`, result.reason);
          console.warn(`   - 에러 코드:`, result.reason?.code);
          console.warn(`   - 에러 메시지:`, result.reason?.message);
        } else {
          console.log(`✅ ${names[index]} 테이블 조회 성공:`, result.value.data?.length || 0, '건');
        }
      });

      // 데이터 상세 로깅
      console.log('📊 서비스별 데이터 요약:');
      console.log('🚗 렌트카 데이터:', carData?.length || 0, '건', carData);
      console.log('🚢 크루즈 데이터:', cruiseData?.length || 0, '건', cruiseData);
      console.log('✈️ 공항 서비스 데이터:', airportData?.length || 0, '건', airportData);
      console.log('🏨 호텔 데이터:', hotelData?.length || 0, '건', hotelData);
      console.log('🎯 투어 데이터:', tourData?.length || 0, '건', tourData);

      const detailedQuote: QuoteDetail = {
        ...quoteData,
        users: userData || { name: '알 수 없음', email: '미확인', phone_number: '미확인' },
        rentcar: carData || [],
        cruise: cruiseData || [],
        airport: airportData || [],
        hotel: hotelData || [],
        tour: tourData || []
      };

      console.log('✅ 견적 상세 정보 로드 완료:', detailedQuote);
      setQuote(detailedQuote);

    } catch (error) {
      console.error('❌ 견적 상세 정보 로드 실패:', error);
      alert('견적 정보를 불러오는데 실패했습니다.');
      router.push('/manager/quotes');
    }
  };

  const handleApproval = async () => {
    try {
      console.log('🔄 견적 승인 처리 시작...', quoteId);

      const updateData = {
        status: 'approved', // 승인 상태로 변경 (고객이 예약 신청할 수 있음)
        updated_at: new Date().toISOString(),
        ...(approvalNote.trim() && { manager_note: approvalNote.trim() })
      };

      console.log('📝 업데이트 데이터:', updateData);

      const { data, error } = await supabase
        .from('quote')
        .update(updateData)
        .eq('id', quoteId)
        .select(); // 업데이트된 데이터를 반환받음

      if (error) {
        console.error('❌ Supabase 에러 상세:', error);
        throw error;
      }

      console.log('✅ 승인 처리 성공:', data);
      alert('견적이 승인되었습니다. 고객이 예약 신청을 할 수 있습니다.');
      setShowApprovalModal(false);
      setApprovalNote('');
      await loadQuoteDetail(); // 새로고침
    } catch (error: any) {
      console.error('❌ 승인 처리 실패:', error);
      console.error('❌ 에러 메시지:', error?.message);
      console.error('❌ 에러 코드:', error?.code);
      alert(`승인 처리에 실패했습니다.\n에러: ${error?.message || '알 수 없는 오류'}`);
    }
  };

  const handleRejection = async () => {
    try {
      console.log('🔄 견적 거절 처리 시작...', quoteId);

      const updateData = {
        status: 'rejected',
        updated_at: new Date().toISOString(),
        manager_note: rejectionReason.trim()
      };

      console.log('📝 업데이트 데이터:', updateData);

      const { data, error } = await supabase
        .from('quote')
        .update(updateData)
        .eq('id', quoteId)
        .select(); // 업데이트된 데이터를 반환받음

      if (error) {
        console.error('❌ Supabase 에러 상세:', error);
        throw error;
      }

      console.log('✅ 거절 처리 성공:', data);
      alert('견적이 거절되었습니다.');
      setShowRejectionModal(false);
      setRejectionReason('');
      await loadQuoteDetail(); // 새로고침
    } catch (error: any) {
      console.error('❌ 거절 처리 실패:', error);
      console.error('❌ 에러 메시지:', error?.message);
      console.error('❌ 에러 코드:', error?.code);
      alert(`거절 처리에 실패했습니다.\n에러: ${error?.message || '알 수 없는 오류'}`);
    }
  };

  // 가격 계산 함수
  const handleCalculatePrices = async () => {
    try {
      setCalculating(true);
      console.log('💰 견적 가격 계산 시작...');

      const success = await updateQuoteItemPrices(quoteId);

      if (success) {
        alert('가격 계산이 완료되었습니다.');
        // 기본 견적 정보와 상세 서비스 정보를 모두 다시 로드
        await Promise.all([
          loadQuoteDetail(),
          loadDetailedServices()
        ]);
      } else {
        alert('가격 계산에 실패했습니다. 콘솔을 확인해주세요.');
      }
    } catch (error) {
      console.error('❌ 가격 계산 중 오류:', error);
      alert('가격 계산 중 오류가 발생했습니다.');
    } finally {
      setCalculating(false);
    }
  };

  // 상세 서비스 정보 로드
  const loadDetailedServices = async () => {
    try {
      console.log('🔍 상세 서비스 정보 로드 시작...', quoteId);

      const { data: quoteItems, error } = await supabase
        .from('quote_item')
        .select('*')
        .eq('quote_id', quoteId);

      if (error) throw error;

      console.log('📋 Quote Items 로드됨:', quoteItems);

      const detailed: any = {
        rooms: [],
        cars: [],
        airports: [],
        hotels: [],
        rentcars: [],
        tours: []
      };

      for (const item of quoteItems || []) {
        try {
          console.log(`🔍 처리 중: ${item.service_type} (ref_id: ${item.service_ref_id})`);

          if (item.service_type === 'room') {
            const { data: roomData } = await supabase
              .from('room')
              .select('*')
              .eq('id', item.service_ref_id)
              .single();

            if (roomData) {
              console.log('✅ 객실 정보:', roomData);
              // cruise_rate_card 테이블에서 모든 가격 정보 조회
              const { data: priceData } = await supabase
                .from('cruise_rate_card')
                .select('*')
                .eq('id', roomData.room_code);

              detailed.rooms.push({
                ...item,
                roomInfo: roomData,
                priceInfo: priceData || []
              });
            }
          } else if (item.service_type === 'car') {
            const { data: carData } = await supabase
              .from('car')
              .select('*')
              .eq('id', item.service_ref_id)
              .single();

            if (carData) {
              console.log('✅ 차량 정보:', carData);
              const { data: priceData } = await supabase
                .from('car_price')
                .select('*')
                .eq('car_code', carData.car_code);

              detailed.cars.push({
                ...item,
                carInfo: carData,
                priceInfo: priceData || []
              });
            }
          } else if (item.service_type === 'airport') {
            const { data: airportData } = await supabase
              .from('airport')
              .select('*')
              .eq('id', item.service_ref_id)
              .single();

            if (airportData) {
              console.log('✅ 공항 정보:', airportData);
              const { data: priceData } = await supabase
                .from('airport_price')
                .select('*')
                .eq('airport_code', airportData.airport_code);

              detailed.airports.push({
                ...item,
                airportInfo: airportData,
                priceInfo: priceData || []
              });
            }
          } else if (item.service_type === 'hotel') {
            const { data: hotelData } = await supabase
              .from('hotel')
              .select('*')
              .eq('id', item.service_ref_id)
              .single();

            if (hotelData) {
              console.log('✅ 호텔 정보:', hotelData);
              const { data: priceData } = await supabase
                .from('hotel_price')
                .select('*')
                .eq('hotel_price_code', hotelData.hotel_code);

              detailed.hotels.push({
                ...item,
                hotelInfo: hotelData,
                priceInfo: priceData || []
              });
            }
          } else if (item.service_type === 'rentcar') {
            const { data: rentcarData } = await supabase
              .from('rentcar')
              .select('*')
              .eq('id', item.service_ref_id)
              .single();

            if (rentcarData) {
              console.log('✅ 렌트카 정보:', rentcarData);
              const { data: priceData } = await supabase
                .from('rentcar_price')
                .select('*')
                .eq('rent_code', rentcarData.rentcar_code);

              detailed.rentcars.push({
                ...item,
                rentcarInfo: rentcarData,
                priceInfo: priceData || []
              });
            }
          } else if (item.service_type === 'tour') {
            const { data: tourData } = await supabase
              .from('tour')
              .select('*')
              .eq('id', item.service_ref_id)
              .single();

            if (tourData) {
              console.log('✅ 투어 정보:', tourData);
              const { data: priceData } = await supabase
                .from('tour_pricing')
                .select('*, tour:tour_id!inner(tour_name, tour_code)')
                .eq('tour.tour_code', tourData.tour_code)
                .eq('is_active', true);

              detailed.tours.push({
                ...item,
                tourInfo: tourData,
                priceInfo: priceData || []
              });
            }
          }
        } catch (serviceError) {
          console.warn(`⚠️ ${item.service_type} 상세 정보 로드 실패:`, serviceError);
        }
      }

      setDetailedServices(detailed);
      console.log('✅ 상세 서비스 정보 로드 완료:', detailed);
    } catch (error) {
      console.error('❌ 상세 서비스 정보 로드 실패:', error);
    }
  };

  const getStatusBadge = (status: string) => {
    const badges = {
      pending: 'bg-yellow-100 text-yellow-800',
      submitted: 'bg-yellow-100 text-yellow-800',
      draft: 'bg-gray-100 text-gray-800',
      confirmed: 'bg-blue-100 text-blue-800',
      approved: 'bg-blue-100 text-blue-800',
      rejected: 'bg-red-100 text-red-800'
    };
    const labels = {
      pending: '검토 대기',
      submitted: '제출됨',
      draft: '임시저장',
      confirmed: '확정됨 (예약)',
      approved: '승인됨',
      rejected: '거절됨'
    };
    return (
      <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${badges[status as keyof typeof badges] || 'bg-gray-100 text-gray-800'}`}>
        {labels[status as keyof typeof labels] || status}
      </span>
    );
  };

  if (loading || !quote) {
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
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => router.push('/manager/quotes')}
                className="p-2 text-gray-400 hover:text-gray-600"
              >
                ← 목록으로
              </button>
              <h1 className="text-2xl font-bold text-gray-900">📋 견적 상세 검토</h1>
              {getStatusBadge(quote.status)}
              <button
                onClick={handleCalculatePrices}
                disabled={calculating}
                className={`ml-4 px-4 py-2 rounded-md text-sm font-medium ${calculating
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
              >
                {calculating ? '계산 중...' : '💰 가격 계산'}
              </button>
            </div>
            <div className="text-sm text-gray-500">매니저: {user?.email}</div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* 메인 콘텐츠 */}
          <div className="lg:col-span-2 space-y-6">
            {/* 고객 정보 */}
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">👤 고객 정보</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">고객명</label>
                  <p className="mt-1 text-sm text-gray-900">{quote.users?.name || '정보 없음'}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">이메일</label>
                  <p className="mt-1 text-sm text-gray-900">{quote.users?.email || '정보 없음'}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">연락처</label>
                  <p className="mt-1 text-sm text-gray-900">{quote.users?.phone_number || '정보 없음'}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">견적 ID</label>
                  <p className="mt-1 text-sm text-gray-900 font-mono">{quote.id}</p>
                </div>
              </div>
            </div>

            {/* 상세 서비스 정보 섹션 */}
            {/* 객실 정보 */}
            {detailedServices.rooms && detailedServices.rooms.length > 0 && (
              <div className="bg-white shadow rounded-lg p-6">
                <h2 className="text-lg font-medium text-gray-900 mb-4">🛏 객실 정보 (상세)</h2>
                <div className="space-y-4">
                  {detailedServices.rooms.map((room: any, index: number) => (
                    <div key={index} className="border border-gray-200 rounded-lg p-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <h3 className="font-medium text-gray-900 mb-2">기본 정보</h3>
                          <p className="text-sm text-gray-600">객실 코드: {room.roomInfo?.room_code}</p>
                          <p className="text-sm text-gray-600">인원수: {room.roomInfo?.person_count || 0}명</p>
                          <p className="text-sm text-gray-600">추가수: {room.roomInfo?.extra_count || 0}명</p>
                        </div>
                        <div>
                          <h3 className="font-medium text-gray-900 mb-2">가격 정보</h3>
                          {room.priceInfo && room.priceInfo.length > 0 ? (
                            <div className="space-y-2">
                              {room.priceInfo.map((price: any, priceIndex: number) => (
                                <div key={priceIndex} className="bg-gray-50 p-2 rounded">
                                  <p className="text-sm text-gray-600">일정: {price.schedule}</p>
                                  <p className="text-sm text-gray-600">크루즈: {price.cruise}</p>
                                  <p className="text-sm text-gray-600">객실 타입: {price.room_type}</p>
                                  <p className="text-sm text-gray-600">카테고리: {price.room_category}</p>
                                  <p className="text-sm font-medium text-green-600">기본 가격: {price.price?.toLocaleString()}동</p>
                                  {price.base_price && (
                                    <p className="text-sm text-gray-600">베이스 가격: {price.base_price?.toLocaleString()}동</p>
                                  )}
                                  {price.extra_charge && (
                                    <p className="text-sm text-gray-600">추가 요금: {price.extra_charge?.toLocaleString()}동</p>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-red-600">가격 정보 없음</p>
                          )}
                          <p className="text-sm font-medium text-blue-600 mt-2">
                            총액: {room.total_price?.toLocaleString()}동
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 차량 정보 */}
            {detailedServices.cars && detailedServices.cars.length > 0 && (
              <div className="bg-white shadow rounded-lg p-6">
                <h2 className="text-lg font-medium text-gray-900 mb-4">🚗 차량 정보 (상세)</h2>
                <div className="space-y-4">
                  {detailedServices.cars.map((car: any, index: number) => (
                    <div key={index} className="border border-gray-200 rounded-lg p-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <h3 className="font-medium text-gray-900 mb-2">기본 정보</h3>
                          <p className="text-sm text-gray-600">차량 코드: {car.carInfo?.car_code}</p>
                          <p className="text-sm text-gray-600">차량수: {car.carInfo?.car_count}대</p>
                        </div>
                        <div>
                          <h3 className="font-medium text-gray-900 mb-2">가격 정보</h3>
                          {car.priceInfo && car.priceInfo.length > 0 ? (
                            <div className="space-y-2">
                              {car.priceInfo.map((price: any, priceIndex: number) => (
                                <div key={priceIndex} className="bg-gray-50 p-2 rounded">
                                  <p className="text-sm text-gray-600">일정: {price.schedule}</p>
                                  <p className="text-sm text-gray-600">크루즈: {price.cruise}</p>
                                  <p className="text-sm text-gray-600">차량 타입: {price.car_type}</p>
                                  <p className="text-sm text-gray-600">카테고리: {price.car_category}</p>
                                  <p className="text-sm font-medium text-green-600">기본 가격: {price.price?.toLocaleString()}동</p>
                                  {price.base_price && (
                                    <p className="text-sm text-gray-600">베이스 가격: {price.base_price?.toLocaleString()}동</p>
                                  )}
                                  {price.extra_charge && (
                                    <p className="text-sm text-gray-600">추가 요금: {price.extra_charge?.toLocaleString()}동</p>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-red-600">가격 정보 없음</p>
                          )}
                          <p className="text-sm font-medium text-blue-600 mt-2">
                            총액: {car.total_price?.toLocaleString()}동
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 공항 서비스 정보 */}
            {detailedServices.airports && detailedServices.airports.length > 0 && (
              <div className="bg-white shadow rounded-lg p-6">
                <h2 className="text-lg font-medium text-gray-900 mb-4">✈️ 공항 서비스 (상세)</h2>
                <div className="space-y-4">
                  {detailedServices.airports.map((airport: any, index: number) => (
                    <div key={index} className="border border-gray-200 rounded-lg p-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <h3 className="font-medium text-gray-900 mb-2">기본 정보</h3>
                          <p className="text-sm text-gray-600">공항 코드: {airport.airportInfo?.airport_code}</p>
                          <p className="text-sm text-gray-600">승객수: {airport.airportInfo?.passenger_count}명</p>
                        </div>
                        <div>
                          <h3 className="font-medium text-gray-900 mb-2">가격 정보</h3>
                          {airport.priceInfo && airport.priceInfo.length > 0 ? (
                            <div className="space-y-2">
                              {airport.priceInfo.map((price: any, priceIndex: number) => (
                                <div key={priceIndex} className="bg-gray-50 p-2 rounded">
                                  <p className="text-sm text-gray-600">카테고리: {price.airport_category}</p>
                                  <p className="text-sm text-gray-600">경로: {price.airport_route}</p>
                                  <p className="text-sm text-gray-600">차량 타입: {price.airport_car_type}</p>
                                  <p className="text-sm font-medium text-green-600">기본 가격: {price.price?.toLocaleString()}동</p>
                                  {price.base_price && (
                                    <p className="text-sm text-gray-600">베이스 가격: {price.base_price?.toLocaleString()}동</p>
                                  )}
                                  {price.extra_charge && (
                                    <p className="text-sm text-gray-600">추가 요금: {price.extra_charge?.toLocaleString()}동</p>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-red-600">가격 정보 없음</p>
                          )}
                          <p className="text-sm font-medium text-blue-600 mt-2">
                            총액: {airport.total_price?.toLocaleString()}동
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 호텔 정보 */}
            {detailedServices.hotels && detailedServices.hotels.length > 0 && (
              <div className="bg-white shadow rounded-lg p-6">
                <h2 className="text-lg font-medium text-gray-900 mb-4">🏨 호텔 정보 (상세)</h2>
                <div className="space-y-4">
                  {detailedServices.hotels.map((hotel: any, index: number) => (
                    <div key={index} className="border border-gray-200 rounded-lg p-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <h3 className="font-medium text-gray-900 mb-2">기본 정보</h3>
                          <p className="text-sm text-gray-600">호텔 코드: {hotel.hotelInfo?.hotel_code}</p>
                        </div>
                        <div>
                          <h3 className="font-medium text-gray-900 mb-2">가격 정보</h3>
                          {hotel.priceInfo && hotel.priceInfo.length > 0 ? (
                            <div className="space-y-2">
                              {hotel.priceInfo.map((price: any, priceIndex: number) => (
                                <div key={priceIndex} className="bg-gray-50 p-2 rounded">
                                  <p className="text-sm text-gray-600">호텔명: {price.hotel_name}</p>
                                  <p className="text-sm text-gray-600">객실명: {price.room_name}</p>
                                  <p className="text-sm text-gray-600">객실 타입: {price.room_type}</p>
                                  <p className="text-sm font-medium text-green-600">기본 가격: {price.price?.toLocaleString()}동</p>
                                  {price.base_price && (
                                    <p className="text-sm text-gray-600">베이스 가격: {price.base_price?.toLocaleString()}동</p>
                                  )}
                                  {price.extra_charge && (
                                    <p className="text-sm text-gray-600">추가 요금: {price.extra_charge?.toLocaleString()}동</p>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-red-600">가격 정보 없음</p>
                          )}
                          <p className="text-sm font-medium text-blue-600 mt-2">
                            총액: {hotel.total_price?.toLocaleString()}동
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 렌트카 정보 */}
            {detailedServices.rentcars && detailedServices.rentcars.length > 0 && (
              <div className="bg-white shadow rounded-lg p-6">
                <h2 className="text-lg font-medium text-gray-900 mb-4">🚙 렌트카 정보 (상세)</h2>
                <div className="space-y-4">
                  {detailedServices.rentcars.map((rentcar: any, index: number) => (
                    <div key={index} className="border border-gray-200 rounded-lg p-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <h3 className="font-medium text-gray-900 mb-2">기본 정보</h3>
                          <p className="text-sm text-gray-600">렌트카 코드: {rentcar.rentcarInfo?.rentcar_code}</p>
                        </div>
                        <div>
                          <h3 className="font-medium text-gray-900 mb-2">가격 정보</h3>
                          {rentcar.priceInfo && rentcar.priceInfo.length > 0 ? (
                            <div className="space-y-2">
                              {rentcar.priceInfo.map((price: any, priceIndex: number) => (
                                <div key={priceIndex} className="bg-gray-50 p-2 rounded">
                                  <p className="text-sm text-gray-600">렌트 타입: {price.description}</p>
                                  <p className="text-sm text-gray-600">카테고리: {price.way_type}</p>
                                  <p className="text-sm text-gray-600">경로: {price.route}</p>
                                  <p className="text-sm font-medium text-green-600">기본 가격: {price.price?.toLocaleString()}동</p>
                                  {price.base_price && (
                                    <p className="text-sm text-gray-600">베이스 가격: {price.base_price?.toLocaleString()}동</p>
                                  )}
                                  {price.extra_charge && (
                                    <p className="text-sm text-gray-600">추가 요금: {price.extra_charge?.toLocaleString()}동</p>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-red-600">가격 정보 없음</p>
                          )}
                          <p className="text-sm font-medium text-blue-600 mt-2">
                            총액: {rentcar.total_price?.toLocaleString()}동
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 투어 정보 */}
            {detailedServices.tours && detailedServices.tours.length > 0 && (
              <div className="bg-white shadow rounded-lg p-6">
                <h2 className="text-lg font-medium text-gray-900 mb-4">🎯 투어 정보 (상세)</h2>
                <div className="space-y-4">
                  {detailedServices.tours.map((tour: any, index: number) => (
                    <div key={index} className="border border-gray-200 rounded-lg p-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <h3 className="font-medium text-gray-900 mb-2">기본 정보</h3>
                          <p className="text-sm text-gray-600">투어 코드: {tour.tourInfo?.tour_code}</p>
                          <p className="text-sm text-gray-600">투어 날짜: {tour.tourInfo?.tour_date}</p>
                          <p className="text-sm text-gray-600">참가자수: {tour.tourInfo?.participant_count}명</p>
                        </div>
                        <div>
                          <h3 className="font-medium text-gray-900 mb-2">가격 정보</h3>
                          {tour.priceInfo && tour.priceInfo.length > 0 ? (
                            <div className="space-y-2">
                              {tour.priceInfo.map((price: any, priceIndex: number) => (
                                <div key={priceIndex} className="bg-gray-50 p-2 rounded">
                                  <p className="text-sm text-gray-600">투어명: {price.tour_name}</p>
                                  <p className="text-sm text-gray-600">정동: {price.tour_capacity}명</p>
                                  <p className="text-sm text-gray-600">차량: {price.tour_vehicle}</p>
                                  <p className="text-sm font-medium text-green-600">기본 가격: {price.price?.toLocaleString()}동</p>
                                  {price.base_price && (
                                    <p className="text-sm text-gray-600">베이스 가격: {price.base_price?.toLocaleString()}동</p>
                                  )}
                                  {price.extra_charge && (
                                    <p className="text-sm text-gray-600">추가 요금: {price.extra_charge?.toLocaleString()}동</p>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-red-600">가격 정보 없음</p>
                          )}
                          <p className="text-sm font-medium text-blue-600 mt-2">
                            총액: {tour.total_price?.toLocaleString()}동
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}



            {/* 기본 견적 정보 완료 */}

            {/* 렌트카 정보 */}
            {quote.rentcar && quote.rentcar.length > 0 && (
              <div className="bg-white shadow rounded-lg p-6">
                <h2 className="text-lg font-medium text-gray-900 mb-4">🚗 렌트카 정보</h2>
                <div className="space-y-4">
                  {quote.rentcar.map((car: any, index: number) => (
                    <div key={index} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-medium text-gray-900">
                            {car.car_model || '차량 정보 없음'}
                          </h3>
                          <p className="text-sm text-gray-600 mt-1">
                            픽업일: {car.pickup_date ? new Date(car.pickup_date).toLocaleDateString() : '미정'} |
                            반납일: {car.return_date ? new Date(car.return_date).toLocaleDateString() : '미정'}
                          </p>
                          <p className="text-sm text-gray-600">
                            픽업장소: {car.pickup_location || '미정'} |
                            반납장소: {car.return_location || '미정'}
                          </p>
                          <div className="mt-2">
                            <span className="text-sm text-gray-500">
                              수량: {car.quantity || 1}대
                            </span>
                            {car.total_price && (
                              <span className="ml-4 text-sm font-medium text-green-600">
                                {car.total_price.toLocaleString()}동
                              </span>
                            )}
                          </div>
                          {car.options && (
                            <p className="text-sm text-gray-500 mt-1">
                              추가 옵션: {JSON.stringify(car.options)}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 사이드바 - 승인 액션 */}
          <div className="space-y-6">
            {/* 견적 요약 */}
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">💰 견적 요약</h2>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">총 견적가</span>
                  <span className="text-lg font-bold text-blue-600">
                    {quote.total_price?.toLocaleString() || '0'}동
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">신청일</span>
                  <span className="text-gray-900">
                    {new Date(quote.created_at).toLocaleDateString()}
                  </span>
                </div>
                {quote.updated_at !== quote.created_at && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">수정일</span>
                    <span className="text-gray-900">
                      {new Date(quote.updated_at).toLocaleDateString()}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* 승인 액션 */}
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">🔍 승인 관리</h2>

              {/* 현재 상태 표시 */}
              <div className="mb-4 p-3 bg-gray-50 rounded-md">
                <span className="text-sm text-gray-600">현재 상태: </span>
                {getStatusBadge(quote.status)}
                <div className="text-xs text-gray-500 mt-1">
                  실제 DB 값: "{quote.status}"
                </div>
              </div>

              {/* 디버깅 정보 */}
              <div className="mb-4 p-2 bg-blue-50 rounded text-xs text-blue-700">
                승인 버튼 표시 조건: status가 'pending', 'submitted', 'draft' 중 하나
                <br />
                현재 조건 만족: {['pending', 'submitted', 'draft'].includes(quote.status) ? '✅ 예' : '❌ 아니오'}
              </div>

              {(quote.status === 'pending' || quote.status === 'submitted' || quote.status === 'draft') && (
                <div className="space-y-3">
                  <button
                    onClick={() => setShowApprovalModal(true)}
                    className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-3 px-4 rounded-md transition-colors"
                  >
                    ✅ 승인하기
                  </button>
                  <button
                    onClick={() => setShowRejectionModal(true)}
                    className="w-full bg-red-600 hover:bg-red-700 text-white font-medium py-3 px-4 rounded-md transition-colors"
                  >
                    ❌ 거절하기
                  </button>
                  <p className="text-xs text-gray-500 text-center">
                    승인 후 고객이 예약 신청을 할 수 있습니다.
                  </p>
                </div>
              )}

              {quote.status === 'approved' && (
                <div className="text-center py-4">
                  <div className="text-green-600 font-medium">✅ 견적 승인됨</div>
                  <p className="text-sm text-gray-500 mt-1">
                    고객이 예약 신청을 할 수 있습니다.
                  </p>
                </div>
              )}

              {(quote.status === 'confirmed' || quote.status === 'reserved') && (
                <div className="text-center py-4">
                  <div className="text-blue-600 font-medium">✅ 예약 확정 완료</div>
                  <p className="text-sm text-gray-500 mt-1">
                    이 견적은 예약이 확정되었습니다.
                  </p>
                  <button
                    onClick={() => router.push('/manager/reservations')}
                    className="mt-3 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm"
                  >
                    예약 관리로 이동
                  </button>
                </div>
              )}

              {quote.status === 'rejected' && (
                <div className="text-center py-4">
                  <div className="text-red-600 font-medium">❌ 거절됨</div>
                  <p className="text-sm text-gray-500 mt-1">
                    이 견적은 거절되었습니다.
                  </p>
                  {quote.manager_note && (
                    <p className="text-sm text-red-600 mt-2 bg-red-50 p-2 rounded">
                      사유: {quote.manager_note}
                    </p>
                  )}
                </div>
              )}

              {/* 기타 상태의 경우 */}
              {!['pending', 'confirmed', 'rejected'].includes(quote.status) && (
                <div className="text-center py-4">
                  <div className="text-gray-600 font-medium">⚠️ 알 수 없는 상태</div>
                  <p className="text-sm text-gray-500 mt-1">
                    상태: {quote.status}
                  </p>
                </div>
              )}
            </div>

            {/* 매니저 노트 */}
            {quote.manager_note && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <h3 className="text-sm font-medium text-yellow-800 mb-2">📝 매니저 노트</h3>
                <p className="text-sm text-yellow-700">{quote.manager_note}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 승인 모달 */}
      {showApprovalModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">견적 승인</h3>
              <p className="text-sm text-gray-600 mb-4">
                이 견적을 승인하시겠습니까? 승인 후 고객이 예약 신청을 할 수 있습니다.
              </p>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  승인 메모 (선택사항)
                </label>
                <textarea
                  value={approvalNote}
                  onChange={(e) => setApprovalNote(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  rows={3}
                  placeholder="고객에게 전달할 추가 안내사항을 입력하세요..."
                />
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={handleApproval}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-md"
                >
                  승인하기
                </button>
                <button
                  onClick={() => setShowApprovalModal(false)}
                  className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 font-medium py-2 px-4 rounded-md"
                >
                  취소
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 거절 모달 */}
      {showRejectionModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">견적 거절</h3>
              <p className="text-sm text-gray-600 mb-4">
                이 견적을 거절하시겠습니까? 거절 사유를 입력해주세요.
              </p>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  거절 사유 <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  rows={3}
                  placeholder="거절 사유를 구체적으로 입력해주세요..."
                  required
                />
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={handleRejection}
                  disabled={!rejectionReason.trim()}
                  className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 text-white font-medium py-2 px-4 rounded-md"
                >
                  거절하기
                </button>
                <button
                  onClick={() => setShowRejectionModal(false)}
                  className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 font-medium py-2 px-4 rounded-md"
                >
                  취소
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
