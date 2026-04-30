'use client';

import React, { useState, useEffect } from 'react';
import { useParams, notFound, useRouter } from 'next/navigation';
import supabase from '@/lib/supabase';

interface ServiceDetail {
  type: 'cruise' | 'hotel' | 'airport' | 'tour' | 'rentcar';
  title: string;
  checkin?: string;
  checkout?: string;
  adultCount?: number;
  childCount?: number;
  infantCount?: number;
  totalPeople?: number;
  roomCount?: number;
  carCount?: number;
  participantCount?: number;
  totalPrice: number;
}

export default function ReservationDetailViewPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [quote, setQuote] = useState<any>(null);
  const [services, setServices] = useState<ServiceDetail[]>([]);
  const [error, setError] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;

    const fetchData = async () => {
      try {
        // 인증 확인
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
          router.push('/login');
          return;
        }

        // Quote 데이터 조회
        const { data: quoteData, error: quoteError } = await supabase
          .from('quote')
          .select('*')
          .eq('id', id)
          .eq('user_id', user.id)
          .single();

        if (quoteError) {
          console.error('Quote fetch error:', quoteError);
          notFound();
          return;
        }

        setQuote(quoteData);

        // quote_item으로 모든 서비스 조회
        const { data: quoteItems } = await supabase
          .from('quote_item')
          .select('*')
          .eq('quote_id', id);

        const servicesList: ServiceDetail[] = [];

        if (quoteItems && quoteItems.length > 0) {
          for (const item of quoteItems) {
            const { service_type, service_ref_id } = item;

            if (service_type === 'cruise') {
              const { data: cruise } = await supabase
                .from('cruise')
                .select('*')
                .eq('id', service_ref_id)
                .single();

              if (cruise) {
                servicesList.push({
                  type: 'cruise',
                  title: cruise.cruise_name || '크루즈',
                  checkin: cruise.departure_date ? new Date(cruise.departure_date).toLocaleDateString('ko-KR', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    weekday: 'short'
                  }) : undefined,
                  checkout: cruise.return_date ? new Date(cruise.return_date).toLocaleDateString('ko-KR', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    weekday: 'short'
                  }) : undefined,
                  adultCount: cruise.adult_count || 0,
                  childCount: cruise.child_count || 0,
                  infantCount: cruise.infant_count || 0,
                  totalPeople: (cruise.adult_count || 0) + (cruise.child_count || 0) + (cruise.infant_count || 0),
                  roomCount: 1, // 기본값
                  totalPrice: item.total_price || 0,
                });
              }
            } else if (service_type === 'hotel') {
              const { data: hotel } = await supabase
                .from('hotel')
                .select('*')
                .eq('id', service_ref_id)
                .single();

              if (hotel) {
                servicesList.push({
                  type: 'hotel',
                  title: hotel.hotel_name || '호텔',
                  checkin: hotel.check_in_date ? new Date(hotel.check_in_date).toLocaleDateString('ko-KR', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    weekday: 'short'
                  }) : undefined,
                  checkout: hotel.check_out_date ? new Date(hotel.check_out_date).toLocaleDateString('ko-KR', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    weekday: 'short'
                  }) : undefined,
                  adultCount: hotel.adult_count || 0,
                  childCount: hotel.child_count || 0,
                  infantCount: 0,
                  totalPeople: (hotel.adult_count || 0) + (hotel.child_count || 0),
                  roomCount: hotel.room_count || 1,
                  totalPrice: item.total_price || 0,
                });
              }
            } else if (service_type === 'airport') {
              const { data: airport } = await supabase
                .from('airport')
                .select('*')
                .eq('id', service_ref_id)
                .single();

              if (airport) {
                const serviceDate = airport.arrival_date || airport.departure_date;
                servicesList.push({
                  type: 'airport',
                  title: `공항 - ${airport.service_type || '픽업/드롭'}`,
                  checkin: serviceDate ? new Date(serviceDate).toLocaleDateString('ko-KR', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    weekday: 'short'
                  }) : undefined,
                  totalPeople: airport.passenger_count || 0,
                  totalPrice: item.total_price || 0,
                });
              }
            } else if (service_type === 'tour') {
              const { data: tour } = await supabase
                .from('tour')
                .select('*')
                .eq('id', service_ref_id)
                .single();

              if (tour) {
                servicesList.push({
                  type: 'tour',
                  title: tour.tour_name || '투어',
                  checkin: tour.tour_date ? new Date(tour.tour_date).toLocaleDateString('ko-KR', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    weekday: 'short'
                  }) : undefined,
                  totalPeople: tour.participant_count || 0,
                  totalPrice: item.total_price || 0,
                });
              }
            } else if (service_type === 'rentcar') {
              const { data: rentcar } = await supabase
                .from('rentcar')
                .select('*')
                .eq('id', service_ref_id)
                .single();

              if (rentcar) {
                servicesList.push({
                  type: 'rentcar',
                  title: rentcar.car_model || '렌트카',
                  checkin: rentcar.pickup_date ? new Date(rentcar.pickup_date).toLocaleDateString('ko-KR', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    weekday: 'short'
                  }) : undefined,
                  checkout: rentcar.return_date ? new Date(rentcar.return_date).toLocaleDateString('ko-KR', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    weekday: 'short'
                  }) : undefined,
                  carCount: 1,
                  totalPrice: item.total_price || 0,
                });
              }
            }
          }
        }

        setServices(servicesList);
      } catch (error) {
        console.error('Error fetching data:', error);
        setError(error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-green-500"></div>
          <p className="mt-4 text-gray-600">예약 정보를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (error || !quote) return notFound();

  const formatPrice = (price: number | undefined) => {
    if (!price) return '기준요금';
    return `${price.toLocaleString()} VND`;
  };

  const getServiceIcon = (type: string) => {
    const icons: { [key: string]: string } = {
      cruise: '🚢',
      hotel: '🏨',
      airport: '✈️',
      tour: '🎫',
      rentcar: '🚗'
    };
    return icons[type] || '📋';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <div className="bg-gradient-to-br from-blue-200 via-cyan-200 to-blue-100">
        <div className="container mx-auto px-4 py-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">
            📑 예약 상세 정보
          </h1>
          <p className="text-lg text-gray-600">
            예약번호: <span className="font-mono font-semibold">{quote.id.substring(0, 8)}...</span>
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {/* 기본 정보 */}
          <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">📋 기본 정보</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500">예약 ID</p>
                <p className="text-lg font-semibold text-gray-800">{quote.id}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">예약 상태</p>
                <p className="text-lg font-semibold text-green-600">{quote.status}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">예약일</p>
                <p className="text-lg font-semibold text-gray-800">
                  {new Date(quote.created_at).toLocaleDateString('ko-KR')}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">총 가격</p>
                <p className="text-lg font-bold text-green-600">{formatPrice(quote.total_price)}</p>
              </div>
            </div>
          </div>

          {/* 서비스 상세 */}
          <div className="space-y-6">
            {services.length === 0 ? (
              <div className="bg-white rounded-xl shadow-lg p-12 text-center">
                <p className="text-gray-500">서비스 정보가 없습니다.</p>
              </div>
            ) : (
              services.map((service, index) => (
                <div
                  key={index}
                  className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-blue-500"
                >
                  <h3 className="text-xl font-bold text-gray-800 mb-4">
                    {getServiceIcon(service.type)} 서비스 상세
                  </h3>

                  {/* 서비스별 상세 정보 */}
                  <div className="space-y-3">
                    {/* 제목 */}
                    <div className="pb-3 border-b border-gray-200">
                      <p className="text-sm font-semibold text-gray-600">{service.title}</p>
                    </div>

                    {/* 체크인/출발 */}
                    {service.checkin && (
                      <div className="flex justify-between items-center">
                        <span className="text-gray-700">
                          {service.type === 'rentcar' ? '픽업일' : '체크인'}:
                        </span>
                        <span className="font-semibold text-gray-900">{service.checkin}</span>
                      </div>
                    )}

                    {/* 체크아웃/반납 */}
                    {service.checkout && (
                      <div className="flex justify-between items-center">
                        <span className="text-gray-700">
                          {service.type === 'rentcar' ? '반납일' : '체크아웃'}:
                        </span>
                        <span className="font-semibold text-gray-900">{service.checkout}</span>
                      </div>
                    )}

                    {/* 인원 정보 */}
                    {service.totalPeople && service.totalPeople > 0 && (
                      <>
                        <div className="flex justify-between items-center">
                          <span className="text-gray-700">인원:</span>
                          <span className="font-semibold text-gray-900">{service.totalPeople}</span>
                        </div>

                        {/* 성인 */}
                        {service.adultCount !== undefined && service.adultCount > 0 && (
                          <div className="ml-4 flex justify-between items-center">
                            <span className="text-gray-600">성인:</span>
                            <span className="font-semibold text-gray-800">{service.adultCount}</span>
                          </div>
                        )}

                        {/* 아동 */}
                        {service.childCount !== undefined && service.childCount > 0 && (
                          <div className="ml-4 flex justify-between items-center">
                            <span className="text-gray-600">아동:</span>
                            <span className="font-semibold text-gray-800">{service.childCount}</span>
                          </div>
                        )}

                        {/* 유아 */}
                        {service.infantCount !== undefined && service.infantCount > 0 && (
                          <div className="ml-4 flex justify-between items-center">
                            <span className="text-gray-600">유아:</span>
                            <span className="font-semibold text-gray-800">{service.infantCount}</span>
                          </div>
                        )}
                      </>
                    )}

                    {/* 객실 수 */}
                    {service.roomCount && service.roomCount > 0 && (
                      <div className="flex justify-between items-center">
                        <span className="text-gray-700">객실 수:</span>
                        <span className="font-semibold text-gray-900">{service.roomCount}</span>
                      </div>
                    )}

                    {/* 차량 수 */}
                    {service.carCount && service.carCount > 0 && (
                      <div className="flex justify-between items-center">
                        <span className="text-gray-700">차량 수:</span>
                        <span className="font-semibold text-gray-900">{service.carCount}</span>
                      </div>
                    )}

                    {/* 총 가격 */}
                    <div className="mt-4 pt-4 border-t border-gray-200 flex justify-between items-center bg-gradient-to-r from-blue-50 to-cyan-50 p-3 rounded">
                      <span className="font-bold text-gray-800">총 가격:</span>
                      <span className="font-bold text-lg text-blue-600">{formatPrice(service.totalPrice)}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* 액션 버튼 */}
          <div className="mt-8 flex gap-4">
            <button
              onClick={() => window.print()}
              className="flex-1 bg-blue-500 text-white px-6 py-3 rounded-lg hover:bg-blue-600 transition-colors font-medium"
            >
              🖨️ 인쇄 / PDF 저장
            </button>
            <button
              onClick={() => router.back()}
              className="flex-1 bg-gray-500 text-white px-6 py-3 rounded-lg hover:bg-gray-600 transition-colors font-medium"
            >
              ← 돌아가기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
