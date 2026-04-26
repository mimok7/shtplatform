'use client';
import { Suspense, useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import supabase from '@/lib/supabase';

interface ReservationDetail {
  reservation_id: string;
  service_type: string;
  service_details: any;
  amount: number;
  status: string;
  price_code?: string;
  price_option?: string;
  all_service_types?: string[];
  priceDetail?: any;
}

interface QuoteData {
  quote_id: string;
  title: string;
  user_name: string;
  user_email: string;
  user_phone: string;
  total_price: number;
  payment_status: string;
  created_at: string;
  reservations: ReservationDetail[];
}

function ManagerConfirmationClient() {
  const router = useRouter();
  const params = useParams();
  const quoteId = params.quote_id as string;

  const [quoteData, setQuoteData] = useState<QuoteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (quoteId) {
      loadQuoteData();
    } else {
      setError('올바르지 않은 접근입니다.');
      setLoading(false);
    }
  }, [quoteId]);

  const loadQuoteData = async () => {
    try {
      setLoading(true);

      // 견적 정보 및 예약 목록 병렬 조회 (quote_id 기준)
      const [quoteResult, quoteItemResult, reservationsResult] = await Promise.all([
        supabase
          .from('quote')
          .select('*')
          .eq('quote_id', quoteId)
          .single(),
        supabase
          .from('quote_item')
          .select('*')
          .eq('quote_id', quoteId),
        supabase
          .from('reservation')
          .select('*')
          .eq('re_quote_id', quoteId)
      ]);

      if (quoteResult.error || !quoteResult.data) {
        setError('예약 정보를 찾을 수 없습니다. 견적 번호를 확인해 주세요.');
        return;
      }

      const quote = quoteResult.data;
      const quoteItems = quoteItemResult.data || [];
      const reservations = reservationsResult.data || [];

      // 사용자 정보 조회
      const userResult = await supabase
        .from('users')
        .select('name, email, phone_number')
        .eq('id', quote.user_id)
        .single();
      const user = userResult.data;

      // 예약 테이블 기반 상세정보 및 가격정보 로드
      const reservationIds = reservations.map(r => r.re_id);
      const [
        cruiseResult,
        airportResult,
        hotelResult,
        rentcarResult,
        tourResult,
        carResult,
        cruiseCarResult
      ] = await Promise.all([
        reservationIds.length > 0 ?
          supabase.from('reservation_cruise').select('*').in('reservation_id', reservationIds) :
          Promise.resolve({ data: [] }),
        reservationIds.length > 0 ?
          supabase.from('reservation_airport').select('*').in('reservation_id', reservationIds) :
          Promise.resolve({ data: [] }),
        reservationIds.length > 0 ?
          supabase.from('reservation_hotel').select('*').in('reservation_id', reservationIds) :
          Promise.resolve({ data: [] }),
        reservationIds.length > 0 ?
          supabase.from('reservation_rentcar').select('*').in('reservation_id', reservationIds) :
          Promise.resolve({ data: [] }),
        reservationIds.length > 0 ?
          supabase.from('reservation_tour').select('*').in('reservation_id', reservationIds) :
          Promise.resolve({ data: [] }),
        reservationIds.length > 0 ?
          supabase.from('reservation_car_sht').select('*').in('reservation_id', reservationIds) :
          Promise.resolve({ data: [] }),
        reservationIds.length > 0 ?
          supabase.from('reservation_cruise_car').select('*').in('reservation_id', reservationIds) :
          Promise.resolve({ data: [] })
      ]);

      // 서비스별 상세 데이터 배열
      const cruiseDetails = cruiseResult.data || [];
      const airportDetails = airportResult.data || [];
      const hotelDetails = hotelResult.data || [];
      const rentcarDetails = rentcarResult.data || [];
      const tourDetails = tourResult.data || [];
      const carDetails = carResult.data || [];
      const cruiseCarDetails = cruiseCarResult.data || [];

      // 크루즈 차량(car) 예약 상세에 대해 car, car_price 정보 병합
      let cruiseCarMergedDetails = [];
      if (cruiseCarDetails.length > 0) {
        const carPriceCodes = cruiseCarDetails.map(c => c.car_price_code).filter(Boolean);
        const { data: carPriceData } = carPriceCodes.length > 0 ?
          await supabase.from('rentcar_price').select('*').in('rent_code', carPriceCodes) :
          { data: [] };
        const { data: carData } = carPriceCodes.length > 0 ?
          await supabase.from('car').select('*').in('car_code', carPriceCodes) :
          { data: [] };
        cruiseCarMergedDetails = cruiseCarDetails.map(detail => {
          const priceInfo = carPriceData?.find(p => p.car_code === detail.car_price_code) || {};
          const carInfo = carData?.find(c => c.car_code === detail.car_price_code) || {};
          const shtDetail = (carDetails || []).find((s: any) => s.reservation_id === detail.reservation_id) || null;
          return {
            ...detail,
            priceInfo,
            carInfo,
            shtDetail,
          };
        });
      }

      // 금액 추출 함수
      const pickAmount = (type: string, detail: any): number => {
        if (!detail) return 0;
        const amountFields = [
          'car_total_price', 'room_total_price', 'total_price', 'unit_price', 'price', 'amount'
        ];
        for (const field of amountFields) {
          const value = detail[field];
          if (typeof value === 'number' && !isNaN(value) && value > 0) {
            return value;
          }
        }
        return 0;
      };

      // 매핑 준비
      const resStatusMap = new Map<string, string>();
      reservations.forEach(r => resStatusMap.set(r.re_id, r.re_status || 'pending'));
      const detailMap: Record<string, any[]> = {
        cruise: cruiseDetails,
        airport: airportDetails,
        hotel: hotelDetails,
        rentcar: rentcarDetails,
        tour: tourDetails,
        car: cruiseCarMergedDetails,
      };
      const idxMap = new Map<string, number>();

      const normalizeType = (t: string) => {
        if (t === 'room') return 'cruise';
        return t;
      };
      const priceCodeFieldByType: Record<string, string | undefined> = {
        cruise: 'room_price_code',
        airport: 'airport_price_code',
        hotel: 'hotel_price_code',
        rentcar: 'rentcar_price_code',
        tour: 'tour_price_code',
        car: 'car_price_code',
      };
      const optionFieldsByType: Record<string, string[]> = {
        cruise: ['room_type'],
        airport: [],
        hotel: ['hotel_name', 'room_name', 'room_type'],
        rentcar: [],
        tour: ['tour_name'],
        car: ['sht_category'],
      };

      const processedReservations: ReservationDetail[] = [];
      for (const qi of quoteItems) {
        const t = normalizeType(qi.service_type);
        const list = detailMap[t] || [];
        const cur = idxMap.get(t) || 0;
        const matched = list[cur];
        if (matched) idxMap.set(t, cur + 1);

        const priceCodeField = priceCodeFieldByType[t];
        const optionFields = optionFieldsByType[t] || [];
        const priceCode = priceCodeField ? (matched?.[priceCodeField] || '') : '';
        let priceOption = '';
        for (const k of optionFields) {
          if (matched?.[k]) { priceOption = matched[k]; break; }
        }
        if (!priceOption && t === 'car' && matched?.shtDetail?.sht_category) {
          priceOption = matched.shtDetail.sht_category;
        }
        const parentStatus = matched ? (resStatusMap.get(matched.reservation_id) || 'pending') : 'pending';
        processedReservations.push({
          reservation_id: matched?.reservation_id || quote.id,
          service_type: t,
          service_details: matched || {},
          amount: matched ? pickAmount(t, matched) : (qi.total_price || qi.unit_price || 0),
          status: parentStatus,
          price_code: priceCode,
          price_option: priceOption,
        });
      }

      setQuoteData({
        quote_id: quote.id,
        title: quote.title || '제목 없음',
        user_name: user?.name || '알 수 없음',
        user_email: user?.email || '',
        user_phone: user?.phone_number || '',
        total_price: quote.total_price || 0,
        payment_status: quote.payment_status || 'pending',
        created_at: quote.created_at,
        reservations: processedReservations
      });

    } catch (error) {
      setError('예약 정보를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  async function fetchPriceDetail(serviceType: string, priceCode: string) {
    if (!priceCode) return null;
    let table = '';
    let codeField = '';
    let selectFields: string[] = [];
    switch (serviceType) {
      case 'cruise':
      case 'room':
        table = 'cruise_rate_card';
        codeField = 'id';
        selectFields = ['id', 'room_type', 'room_type_en', 'price_adult', 'schedule_type', 'cruise_name', 'valid_from', 'valid_to', 'season_name'];
        break;
      case 'car':
        table = 'rentcar_price';
        codeField = 'car_code';
        selectFields = ['car_code', 'car_category', 'car_type', 'price', 'cruise', 'schedule', 'passenger_count'];
        break;
      case 'airport':
        table = 'airport_price';
        codeField = 'airport_code';
        selectFields = ['airport_code', 'service_type', 'route', 'vehicle_type', 'price'];
        break;
      case 'hotel':
        table = 'hotel_price';
        codeField = 'hotel_price_code';
        selectFields = ['hotel_price_code', 'hotel_code', 'hotel_name', 'room_type', 'room_name', 'room_category', 'base_price', 'start_date', 'end_date', 'weekday_type', 'season_name'];
        break;
      case 'rentcar':
        table = 'rentcar_price';
        codeField = 'rent_code';
        selectFields = ['rent_code', 'way_type', 'route', 'vehicle_type', 'price', 'capacity'];
        break;
      case 'tour':
        table = 'tour_pricing';
        codeField = 'pricing_id';
        selectFields = ['pricing_id', 'price_per_person', 'vehicle_type', 'min_guests', 'max_guests', 'tour_id'];
        break;
      default:
        return null;
    }
    const { data, error } = await supabase.from(table).select(selectFields.join(',')).eq(codeField, priceCode).single();
    if (error || !data) return null;
    return data;
  }

  const getServiceTypeName = (type: string) => {
    const typeNames = {
      cruise: '크루즈',
      airport: '공항 서비스',
      hotel: '호텔',
      rentcar: '렌터카',
      tour: '투어',
      car: '차량 서비스'
    };
    return typeNames[type as keyof typeof typeNames] || type;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const printConfirmation = () => {
    window.print();
  };

  useEffect(() => {
    if (!quoteData || !quoteData.reservations) return;
    (async () => {
      const updatedReservations = await Promise.all(
        quoteData.reservations.map(async (r) => {
          if (r.price_code) {
            const priceDetail = await fetchPriceDetail(r.service_type, r.price_code);
            return { ...r, priceDetail };
          }
          return r;
        })
      );
      setQuoteData((prev) => prev ? { ...prev, reservations: updatedReservations } : prev);
    })();
  }, [quoteData?.reservations]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">예약 정보를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (error || !quoteData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-6">❌</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">접근 오류</h2>
          <p className="text-gray-600 mb-6">{error || '예약 정보를 찾을 수 없습니다.'}</p>
          <button
            onClick={() => window.close()}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            창 닫기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 상단 고정 바 */}
      <div className="bg-white shadow-sm border-b sticky top-0 z-10 print:hidden">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="text-2xl">🌊</div>
              <div>
                <h1 className="text-lg font-bold text-gray-900">스테이하롱 크루즈</h1>
                <p className="text-sm text-gray-600">예약확인서</p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={printConfirmation}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2"
              >
                <span>🖨️</span>
                <span>인쇄하기</span>
              </button>
              <button
                onClick={() => window.close()}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 확인서 본문 */}
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-white rounded-lg shadow-lg overflow-hidden print:shadow-none print:rounded-none">
          <div className="p-8" style={{ fontFamily: 'Arial, sans-serif' }}>
            {/* 헤더 */}
            <div className="text-center mb-8 border-b-2 border-blue-600 pb-6">
              <div className="flex justify-between items-center mb-4">
                <div className="text-left">
                  <div className="text-xs text-gray-500">RESERVATION CONFIRMATION</div>
                  <div className="text-lg font-bold text-blue-600">스테이하롱 크루즈</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-500">확인서 번호</div>
                  <div className="text-sm font-mono text-gray-700">{quoteData.quote_id.slice(-8).toUpperCase()}</div>
                  <div className="text-xs text-gray-400 mt-1">발행일: {formatDate(new Date().toISOString())}</div>
                </div>
              </div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">🎯 예약 확인서</h1>
              <p className="text-base text-gray-600">베트남 하롱베이 크루즈 여행 예약이 확정되었습니다</p>
            </div>

            {/* 고객 및 예약 정보 표 */}
            <div className="mb-8">
              <table className="w-full border border-gray-300">
                <tbody>
                  <tr className="bg-blue-50">
                    <td className="border border-gray-300 px-4 py-3 font-semibold text-gray-700 w-1/4 text-center">예약자 정보</td>
                    <td className="border border-gray-300 px-4 py-3 font-semibold text-gray-700 w-1/4 text-center">예약 기본 정보</td>
                    <td className="border border-gray-300 px-4 py-3 font-semibold text-gray-700 w-1/4 text-center">예약 내역</td>
                    <td className="border border-gray-300 px-4 py-3 font-semibold text-gray-700 w-1/4 text-center">결제 정보</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-300 px-4 py-3 align-top">
                      <div className="space-y-2">
                        <div><span className="text-gray-500 text-sm">성명:</span><br /><span className="font-semibold">{quoteData.user_name}</span></div>
                        <div><span className="text-gray-500 text-sm">📧 이메일:</span><br /><span className="text-sm">{quoteData.user_email}</span></div>
                        <div><span className="text-gray-500 text-sm">📞 연락처:</span><br /><span className="text-sm">{quoteData.user_phone}</span></div>
                      </div>
                    </td>
                    <td className="border border-gray-300 px-4 py-3 align-top">
                      <div className="space-y-2">
                        <div><span className="text-gray-500 text-sm">예약번호:</span><br /><span className="font-mono text-sm">{quoteData.quote_id}</span></div>
                        <div><span className="text-gray-500 text-sm">예약명:</span><br /><span className="font-medium text-sm">{quoteData.title}</span></div>
                        <div><span className="text-gray-500 text-sm">예약일:</span><br /><span className="text-sm">{formatDate(quoteData.created_at)}</span></div>
                      </div>
                    </td>
                    <td className="border border-gray-300 px-4 py-3 align-top">
                      <div className="space-y-2">
                        <div><span className="text-gray-500 text-sm">서비스 종류:</span></div>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {quoteData.reservations && quoteData.reservations.length > 0 ? (
                            Array.from(new Set(quoteData.reservations.map(r => r.service_type))).map((type, idx) => (
                              <span key={type} className="inline-block px-2 py-1 bg-blue-50 text-blue-600 rounded text-xs font-medium">
                                {getServiceTypeName(type)}
                              </span>
                            ))
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="border border-gray-300 px-4 py-3 align-top">
                      <div className="space-y-2">
                        <div><span className="text-gray-500 text-sm">결제상태:</span><br /><span className="inline-block px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded">✅ 결제완료</span></div>
                        <div><span className="text-gray-500 text-sm">총 금액:</span><br /><span className="text-lg font-bold text-blue-600">{quoteData.total_price.toLocaleString()}동</span></div>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* 예약 서비스 상세 표 */}
            <div className="mb-8">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <span className="w-1 h-6 bg-blue-600 mr-3"></span>
                예약 서비스 상세 내역
              </h3>
              <table className="w-full border border-gray-300">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-300 px-3 py-3 text-center text-sm font-semibold text-gray-700">No.</th>
                    <th className="border border-gray-300 px-3 py-3 text-center text-sm font-semibold text-gray-700">구분</th>
                    <th className="border border-gray-300 px-3 py-3 text-center text-sm font-semibold text-gray-700 w-1/6">상세 정보</th>
                    <th className="border border-gray-300 px-3 py-3 text-center text-sm font-semibold text-gray-700">가격 정보</th>
                    <th className="border border-gray-300 px-3 py-3 text-center text-sm font-semibold text-gray-700">금액</th>
                  </tr>
                </thead>
                <tbody>
                  {quoteData.reservations.map((reservation, index) => (
                    <tr key={`${reservation.reservation_id}-${reservation.service_type}-${(reservation.service_details as any)?.id ?? index}`} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="border border-gray-300 px-3 py-4 text-center font-medium text-gray-700">
                        {index + 1}
                      </td>
                      <td className="border border-gray-300 px-3 py-4 text-center align-top">
                        <div className="font-semibold text-gray-900 mb-1">
                          {Array.isArray(reservation.all_service_types) && reservation.all_service_types.length > 0 ? (
                            <>
                              {reservation.all_service_types.map((type, idx) => (
                                <span key={type} className="inline-block mr-2 px-2 py-1 bg-blue-50 text-blue-600 rounded text-xs font-medium">
                                  {getServiceTypeName(type)}
                                </span>
                              ))}
                            </>
                          ) : (
                            <span>{getServiceTypeName(reservation.service_type)}</span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 font-mono">
                          ID: {reservation.reservation_id.slice(-8)}
                        </div>
                      </td>
                      <td className="border border-gray-300 px-3 py-4 text-left align-top w-1/4">
                        {/* 상세 정보 렌더링 - 고객 확인서와 동일한 로직 */}
                        {reservation.service_type === 'cruise' && reservation.service_details && (
                          <div className="space-y-1 text-xs">
                            <div><span className="text-gray-500">체크인:</span> <span>{(reservation.service_details as any).checkin || '-'}</span></div>
                            <div><span className="text-gray-500">투숙인원:</span> <span>{(reservation.service_details as any).guest_count || 0}명</span></div>
                            <div><span className="text-gray-500">요청사항:</span> <span className="text-gray-600">{(reservation.service_details as any).request_note || '없음'}</span></div>
                          </div>
                        )}
                        {reservation.service_type === 'airport' && reservation.service_details && (
                          <div className="space-y-1 text-xs">
                            <div><span className="text-gray-500">공항:</span> <span>{(reservation.service_details as any).ra_airport_location || '-'}</span></div>
                            <div><span className="text-gray-500">일시:</span> <span>{(reservation.service_details as any).ra_datetime || '-'}</span></div>
                            <div><span className="text-gray-500">항공편:</span> <span>{(reservation.service_details as any).ra_flight_number || '-'}</span></div>
                            <div><span className="text-gray-500">인원:</span> <span>{(reservation.service_details as any).ra_passenger_count || 0}명</span></div>
                          </div>
                        )}
                        {reservation.service_type === 'hotel' && reservation.service_details && (
                          <div className="space-y-1 text-xs">
                            <div><span className="text-gray-500">체크인:</span> <span>{(reservation.service_details as any).checkin_date || '-'}</span></div>
                            <div><span className="text-gray-500">박수:</span> <span>{(reservation.service_details as any).nights || 0}박</span></div>
                            <div><span className="text-gray-500">투숙인원:</span> <span>{(reservation.service_details as any).guest_count || 0}명</span></div>
                            <div><span className="text-gray-500">호텔명:</span> <span>{(reservation.service_details as any).hotel_name || '-'}</span></div>
                          </div>
                        )}
                        {reservation.service_type === 'rentcar' && reservation.service_details && (
                          <div className="space-y-1 text-xs">
                            <div><span className="text-gray-500">픽업:</span> <span>{(reservation.service_details as any).pickup_datetime || (reservation.service_details as any).pickup_date || '-'}</span></div>
                            <div><span className="text-gray-500">대여일수:</span> <span>{(reservation.service_details as any).rental_days || 0}일</span></div>
                            <div><span className="text-gray-500">기사수:</span> <span>{(reservation.service_details as any).driver_count || 0}명</span></div>
                            <div><span className="text-gray-500">차량정보:</span> <span>{(reservation.service_details as any).car_type || '-'}</span></div>
                          </div>
                        )}
                        {reservation.service_type === 'tour' && reservation.service_details && (
                          <div className="space-y-1 text-xs">
                            <div><span className="text-gray-500">투어일:</span> <span>{(reservation.service_details as any).tour_date || '-'}</span></div>
                            <div><span className="text-gray-500">참가인원:</span> <span>{(reservation.service_details as any).participant_count || 0}명</span></div>
                            <div><span className="text-gray-500">투어명:</span> <span>{(reservation.service_details as any).tour_name || '-'}</span></div>
                            <div><span className="text-gray-500">픽업장소:</span> <span>{(reservation.service_details as any).pickup_location || '-'}</span></div>
                          </div>
                        )}
                        {reservation.service_type === 'car' && reservation.service_details && (
                          <div className="space-y-1 text-xs">
                            <div><span className="text-gray-500">픽업일시:</span> <span className="font-medium">{(reservation.service_details as any).pickup_datetime || '-'}</span></div>
                            <div><span className="text-gray-500">픽업/드랍:</span> <span className="font-medium">{(reservation.service_details as any).pickup_location || '-'} → {(reservation.service_details as any).dropoff_location || '-'}</span></div>
                            <div><span className="text-gray-500">차량수:</span> <span>{(reservation.service_details as any).car_count ?? 0}대</span></div>
                            <div><span className="text-gray-500">승객수:</span> <span>{(reservation.service_details as any).passenger_count ?? 0}명</span></div>
                            {(reservation.service_details as any).request_note && (
                              <div><span className="text-gray-500">요청사항:</span> <span className="text-gray-600">{(reservation.service_details as any).request_note}</span></div>
                            )}
                            {(reservation.service_details as any).shtDetail && (
                              <div className="pt-1 border-t border-gray-200">
                                <div className="text-gray-500">스테이하롱 차량 선택</div>
                                <div><span className="text-gray-500">차량번호:</span> <span>{(reservation.service_details as any).shtDetail.vehicle_number || '-'}</span></div>
                                <div><span className="text-gray-500">좌석수:</span> <span>{(reservation.service_details as any).shtDetail.seat_number || 0}석</span></div>
                                <div><span className="text-gray-500">색상:</span> <span>{(reservation.service_details as any).shtDetail.color_label || '-'}</span></div>
                                <div><span className="text-gray-500">기사:</span> <span>{(reservation.service_details as any).shtDetail.driver_name || '-'}</span></div>
                              </div>
                            )}
                          </div>
                        )}
                        {!reservation.service_details && (
                          <div className="text-sm text-gray-400">상세 정보가 없습니다</div>
                        )}
                      </td>
                      <td className="border border-gray-300 px-3 py-4 text-left align-top">
                        <div className="text-sm text-gray-700">
                          {reservation.priceDetail ? (
                            <div className="mt-1 text-xs text-gray-500">
                              {(() => {
                                const order = ['schedule', 'room_category', 'cruise', 'room_type', 'payment'];
                                const fieldMap: Record<string, string> = {
                                  price: '가격', schedule: '스케줄', cruise: '크루즈', start_date: '시작일', end_date: '종료일',
                                  room_category: '구분', room_type: '객실타입', payment: '결제방식',
                                  car_category: '구분', car_type: '차량타입', passenger_count: '승객수',
                                  airport_category: '구분', airport_route: '공항경로', airport_car_type: '공항차종',
                                  hotel_name: '호텔명', room_name: '룸명', weekday_type: '요일구분',
                                  way_type: '이용방식', route: '경로', vehicle_type: '차종',
                                  tour_name: '투어명', tour_capacity: '정원', tour_vehicle: '차량', tour_type: '투어타입'
                                };
                                const filtered = Object.entries(reservation.priceDetail)
                                  .filter(([key]) => key !== 'price_code' && key !== 'price' && !key.includes('code') && key !== 'start_date' && key !== 'end_date');
                                const sorted = [
                                  ...order
                                    .map(k => filtered.find(([key]) => key === k))
                                    .filter((v): v is [string, any] => !!v),
                                  ...filtered.filter(([key]) => !order.includes(key))
                                ];
                                return sorted.map(([key, value]) => {
                                  const label = key.includes('category') ? '구분' : (fieldMap[key] || key);
                                  return (
                                    <div key={key}><span className="font-semibold">{label}:</span> {String(value)}</div>
                                  );
                                });
                              })()}
                            </div>
                          ) : (
                            <div className="text-xs text-gray-400">가격 상세 정보 없음</div>
                          )}
                          {reservation.price_option && (
                            <div className="text-xs text-gray-500 mt-1">{reservation.price_option}</div>
                          )}
                        </div>
                      </td>
                      <td className="border border-gray-300 px-3 py-4 text-center">
                        <div className="text-lg font-bold text-blue-600">
                          {(() => {
                            const price = reservation.priceDetail?.price ?? 0;
                            let count = 1;
                            let unit = '명';
                            if (reservation.service_type === 'cruise') {
                              count = reservation.service_details?.guest_count ?? 1;
                            } else if (reservation.service_type === 'airport') {
                              count = reservation.service_details?.ra_passenger_count ?? 1;
                            } else if (reservation.service_type === 'hotel') {
                              count = reservation.service_details?.guest_count ?? 1;
                            } else if (reservation.service_type === 'rentcar') {
                              count = reservation.service_details?.driver_count ?? 1;
                              unit = '대';
                            } else if (reservation.service_type === 'car') {
                              count = reservation.service_details?.seat_number ?? 1;
                              unit = '대';
                            } else if (reservation.service_type === 'tour') {
                              count = reservation.service_details?.participant_count ?? 1;
                            }
                            return (
                              <>
                                <span className="text-xs text-gray-500 block mb-1">{`${price.toLocaleString()} × ${count}${unit} =`}</span>
                                {`${reservation.amount.toLocaleString()}동`}
                              </>
                            );
                          })()}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-blue-50">
                    <td colSpan={5} className="border border-gray-300 px-3 py-6 text-right">
                      <div className="text-lg font-semibold text-gray-700">
                        총 결제 금액 : <span className="text-2xl font-bold text-blue-600 ml-2">{quoteData.total_price.toLocaleString()}<span className="text-base font-normal text-gray-500 ml-1">동</span></span>
                      </div>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* 여행 준비사항 및 중요 안내 */}
            <div className="mb-8">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <span className="w-1 h-6 bg-orange-500 mr-3"></span>
                여행 준비사항 및 중요 안내
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="font-semibold text-blue-800 mb-3 flex items-center">
                    <span className="mr-2">📋</span>여행 준비물
                  </h4>
                  <ul className="text-sm text-blue-700 space-y-1">
                    <li>• 여권 (유효기간 6개월 이상)</li>
                    <li>• 본 예약확인서 출력본</li>
                    <li>• 여행자보험 가입 권장</li>
                    <li>• 개인 상비약 및 세면용품</li>
                    <li>• 편안한 복장 및 운동화</li>
                  </ul>
                </div>
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <h4 className="font-semibold text-yellow-800 mb-3 flex items-center">
                    <span className="mr-2">⚠️</span>주의사항
                  </h4>
                  <ul className="text-sm text-yellow-700 space-y-1">
                    <li>• 여행 3일 전까지 변경/취소 가능</li>
                    <li>• 날씨에 따라 일정 변경 가능</li>
                    <li>• 출발 30분 전 집결 완료</li>
                    <li>• 안전수칙 준수 필수</li>
                    <li>• 귀중품 분실 주의</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* 긴급연락처 및 고객센터 - 스테이하롱 트레블 정보로 변경 */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 mb-8">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <span className="w-1 h-6 bg-red-500 mr-3"></span>
                긴급연락처 및 고객지원
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center">
                  <div className="text-2xl mb-2">📞</div>
                  <div className="font-semibold text-gray-700">고객센터</div>
                  <div className="text-sm text-gray-600">평일 09:00-24:00</div>
                  <div className="font-mono text-blue-600">07045545185</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl mb-2">🚨</div>
                  <div className="font-semibold text-gray-700">24시간 긴급연락</div>
                  <div className="text-sm text-gray-600">여행 중 응급상황</div>
                  <div className="font-mono text-red-600">07045545185</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl mb-2">📧</div>
                  <div className="font-semibold text-gray-700">이메일 문의</div>
                  <div className="text-sm text-gray-600">24시간 접수</div>
                  <div className="text-blue-600">stayhalong@gmail.com</div>
                </div>
              </div>
            </div>

            {/* 푸터 - 스테이하롱 트레블 정보로 변경 */}
            <div className="text-center text-sm text-gray-500 border-t-2 border-blue-600 pt-6">
              <div className="mb-4">
                <div className="text-lg font-bold text-blue-600 mb-2">🌊 스테이하롱 트레블과 함께하는 특별한 여행 🌊</div>
                <p className="text-gray-600">베트남 하롱베이에서 잊지 못할 추억을 만들어보세요!</p>
              </div>
              <div className="bg-blue-50 rounded-lg p-4 text-center">
                <div className="font-medium text-gray-700 mb-2">
                  <span className="text-blue-600">🏢 스테이하롱 트레블</span> |
                  <span className="text-gray-600"> 하롱베이 상주 한국인 베트남 전문 여행사</span>
                </div>
                <div className="text-xs text-gray-500 space-y-1">
                  <div>📍 상호 : CONG TY TENPER COMMUNICATIONS</div>
                  <div>📍 주소 : PHUONG YET KIEU, THANH PHO HA LONG</div>
                  <div>📧 stayhalong@gmail.com | ☎️ 07045545185 | 🌐 <a href="https://cafe.naver.com/stayhalong" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">https://cafe.naver.com/stayhalong</a></div>
                  <div>🕒 운영시간: 평일 09:00-24:00 (토요일 09:00-15:00, 일요일/공휴일 비상업무)</div>
                  <div className="text-gray-400 mt-2">© 2024 StayHalong Travel. All rights reserved.</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export const dynamic = 'force-dynamic';

export default function ManagerConfirmationViewPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">페이지를 불러오는 중...</p>
        </div>
      </div>
    }>
      <ManagerConfirmationClient />
    </Suspense>
  );
}