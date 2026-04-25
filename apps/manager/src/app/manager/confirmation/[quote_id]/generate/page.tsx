'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import ManagerLayout from '@/components/ManagerLayout';
import supabase from '@/lib/supabase';
import UnifiedConfirmation, { UnifiedQuoteData } from '@/components/UnifiedConfirmation';

interface ReservationDetail {
  reservation_id: string;
  service_type: string;
  service_details: any;
  amount: number;
  status: string;
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

export default function ManagerConfirmationGeneratePage() {
  const params = useParams();
  const router = useRouter();
  const quoteId = params.quote_id as string;

  const [quoteData, setQuoteData] = useState<QuoteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const [unified, setUnified] = useState<UnifiedQuoteData | null>(null);

  // 서비스 타입을 한글로 변환하는 함수
  const getServiceName = (type: string): string => {
    const names: Record<string, string> = {
      cruise: '🚢 크루즈',
      cruise_car: '🚗 크루즈 차량',
      airport: '✈️ 공항차량',
      hotel: '🏨 호텔',
      tour: '🎯 투어',
      rentcar: '🚙 렌터카',
      sht: '🚐 SHT 차량'
    };
    return names[type] || type;
  };


  useEffect(() => {
    if (quoteId) {
      loadQuoteOrReservationData();
    }
  }, [quoteId]);

  // 견적이 없으면 예약만으로도 확인서 생성
  const loadQuoteOrReservationData = async () => {
    try {
      setLoading(true);
      // 공용 가격 정보 병합 함수 (서비스별 price_info 채우기)
      const enrichDataWithPrices = async (data: any[], serviceType: string) => {
        if (!data || data.length === 0) return [];
        return await Promise.all(
          data.map(async (item) => {
            let priceData = null;
            switch (serviceType) {
              case 'cruise':
                if (item?.room_price_code) {
                  const { data: priceInfo } = await supabase
                    .from('cruise_rate_card')
                    .select('*')
                    .eq('id', item.room_price_code)
                    .single();
                  priceData = priceInfo;
                }
                break;
              case 'cruise_car':
                if (item?.car_price_code) {
                  const { data: priceInfo } = await supabase
                    .from('car_price')
                    .select('*')
                    .eq('car_code', item.car_price_code)
                    .single();
                  priceData = priceInfo;
                }
                break;
              case 'airport':
                if (item?.airport_price_code) {
                  const { data: priceInfo } = await supabase
                    .from('airport_price')
                    .select('*')
                    .eq('airport_code', item.airport_price_code)
                    .single();
                  priceData = priceInfo;
                }
                break;
              case 'hotel':
                if (item?.hotel_price_code) {
                  const { data: priceInfo } = await supabase
                    .from('hotel_price')
                    .select('*')
                    .eq('hotel_price_code', item.hotel_price_code)
                    .single();
                  priceData = priceInfo;
                }
                break;
              case 'tour':
                if (item?.tour_price_code) {
                  const { data: priceInfo } = await supabase
                    .from('tour_pricing')
                    .select('*, tour:tour_id(tour_name, tour_code)')
                    .eq('pricing_id', item.tour_price_code)
                    .single();
                  priceData = priceInfo;
                }
                break;
              case 'rentcar':
                if (item?.rentcar_price_code) {
                  const { data: priceInfo } = await supabase
                    .from('rentcar_price')
                    .select('*')
                    .eq('rent_code', item.rentcar_price_code)
                    .single();
                  priceData = priceInfo;
                }
                break;
            }
            return { ...item, price_info: priceData };
          })
        );
      };
      // 1. 견적 우선 조회
      let quote: any | null = null;
      let quoteError: any = null;
      {
        const { data, error } = await supabase
          .from('quote')
          .select('*')
          .eq('id', quoteId)
          .single();
        if (!error && data) {
          quote = data;
        } else {
          const { data: q2, error: e2 } = await supabase
            .from('quote')
            .select('*')
            .eq('quote_id', quoteId)
            .single();
          if (!e2 && q2) {
            quote = q2;
          } else {
            quoteError = e2 || error;
          }
        }
      }

      if (quote) {
        // 기존 견적 기반 로직 (기존 코드 그대로)
        // ...existing code for quote (생략, 위 코드 그대로)...
        // (아래 기존 코드 복사)
        // 사용자 정보 조회
        const { data: userInfo } = await supabase
          .from('users')
          .select('name, email, phone_number')
          .eq('id', quote.user_id)
          .single();

        // 예약 기본 정보 조회
        const { data: reservationList } = await supabase
          .from('reservation')
          .select('re_id, re_type, re_status')
          .eq('re_quote_id', quoteId)
          .neq('re_type', 'car_sht');

        const resList = reservationList || [];
        console.log('🔍 조회된 예약 목록:', resList);

        const idsByType = {
          cruise: resList.filter(r => r.re_type === 'cruise').map(r => r.re_id),
          airport: resList.filter(r => r.re_type === 'airport').map(r => r.re_id),
          hotel: resList.filter(r => r.re_type === 'hotel').map(r => r.re_id),
          rentcar: resList.filter(r => r.re_type === 'rentcar').map(r => r.re_id),
          tour: resList.filter(r => r.re_type === 'tour').map(r => r.re_id),
          sht: [] as string[]
        } as const;

        console.log('📊 서비스 타입별 예약 ID:', idsByType);

        // 상세 테이블 병렬 조회 - 크루즈 예약에서 객실과 차량 모두 조회
        const reservationIds = resList.map(r => r.re_id);
        const [cruiseRows, cruiseCarRows, airportRows, hotelRows, rentcarRows, tourRows, shtRows] = await Promise.all([
          reservationIds.length ? supabase.from('reservation_cruise').select(`*`).in('reservation_id', reservationIds) : Promise.resolve({ data: [] }),
          reservationIds.length ? supabase.from('reservation_cruise_car').select(`*`).in('reservation_id', reservationIds) : Promise.resolve({ data: [] }),
          idsByType.airport.length ? supabase.from('reservation_airport').select('*').in('reservation_id', idsByType.airport) : Promise.resolve({ data: [] }),
          idsByType.hotel.length ? supabase.from('reservation_hotel').select('*').in('reservation_id', idsByType.hotel) : Promise.resolve({ data: [] }),
          idsByType.rentcar.length ? supabase.from('reservation_rentcar').select('*').in('reservation_id', idsByType.rentcar) : Promise.resolve({ data: [] }),
          idsByType.tour.length ? supabase.from('reservation_tour').select('*').in('reservation_id', idsByType.tour) : Promise.resolve({ data: [] }),
          idsByType.sht.length ? supabase.from('reservation_car_sht').select('*').in('reservation_id', idsByType.sht) : Promise.resolve({ data: [] })
        ] as any);

        // (가격 정보 조회는 상단 공용 함수 사용)

        // 각 서비스별로 가격 정보 조회 - PaymentDetailModal과 동일한 방식
        const enrichedCruiseData = await enrichDataWithPrices((cruiseRows as any).data, 'cruise');
        const enrichedCruiseCarData = await enrichDataWithPrices((cruiseCarRows as any).data, 'cruise_car');
        const enrichedAirportData = await enrichDataWithPrices((airportRows as any).data, 'airport');
        const enrichedHotelData = await enrichDataWithPrices((hotelRows as any).data, 'hotel');
        const enrichedTourData = await enrichDataWithPrices((tourRows as any).data, 'tour');
        const enrichedRentcarData = await enrichDataWithPrices((rentcarRows as any).data, 'rentcar');

        // 크루즈는 한 예약에 여러 객실이 있을 수 있으므로 배열로 그룹화
        const mapByArray = (rows: any[] | null | undefined) => {
          const m = new Map<string, any[]>();
          for (const r of rows || []) {
            if (r?.reservation_id) {
              if (!m.has(r.reservation_id)) {
                m.set(r.reservation_id, []);
              }
              m.get(r.reservation_id)!.push(r);
            }
          }
          return m;
        };

        // 단일 객체로 매핑 (기타 서비스용)
        const mapBy = (rows: any[] | null | undefined) => {
          const m = new Map<string, any>();
          for (const r of rows || []) if (r?.reservation_id) m.set(r.reservation_id, r);
          return m;
        };

        // 크루즈와 크루즈 차량은 배열로, 나머지는 단일 객체로 매핑 - 가격 정보 포함된 데이터 사용
        const cruiseArrayMap = mapByArray(enrichedCruiseData);
        const cruiseCarArrayMap = mapByArray(enrichedCruiseCarData);
        const airportMap = mapBy(enrichedAirportData);
        const hotelMap = mapBy(enrichedHotelData);
        const rentcarMap = mapBy(enrichedRentcarData);
        const tourMap = mapBy(enrichedTourData);
        const shtMap = mapBy((shtRows as any).data);

        const pickAmount = (type: string, detail: any): number => {
          if (!detail) return 0;
          const tryFields = {
            cruise: ['room_total_price', 'total_price', 'price', 'amount'],
            cruise_car: ['car_total_price', 'total_price', 'price', 'amount'],
            airport: ['total_price', 'unit_price', 'price', 'amount'], // DB에는 total_price 컬럼 존재
            hotel: ['total_price', 'unit_price', 'price', 'amount'], // DB에는 total_price 컬럼 존재
            rentcar: ['total_price', 'unit_price', 'price', 'amount'], // DB에는 total_price 컬럼 존재
            tour: ['total_price', 'unit_price', 'price', 'amount'], // DB에는 total_price 컬럼 존재
            sht: ['car_total_price', 'total_price', 'unit_price', 'price', 'amount'] // reservation_car_sht 테이블
          } as Record<string, string[]>;
          for (const f of (tryFields[type] || [])) {
            const v = detail[f];
            if (typeof v === 'number' && !isNaN(v)) return v;
          }
          return 0;
        };

        // 크루즈의 경우 총 가격 계산 (여러 객실의 합계)
        const calculateCruiseTotalAmount = (cruiseDetails: any[]): number => {
          if (!cruiseDetails || cruiseDetails.length === 0) return 0;
          return cruiseDetails.reduce((sum, detail) => {
            const amount = pickAmount('cruise', detail);
            return sum + amount;
          }, 0);
        };

        // 모든 서비스 처리 - 각 예약을 개별 서비스로 표시
        const processedReservations: ReservationDetail[] = [];

        // 크루즈 예약들을 개별적으로 처리
        for (const res of resList.filter(r => r.re_type === 'cruise')) {
          const cruiseDetails = enrichedCruiseData.filter(c => c.reservation_id === res.re_id);
          if (cruiseDetails.length > 0) {
            // 각 크루즈 객실을 개별 서비스로 추가
            cruiseDetails.forEach((cruise, index) => {
              const amount = cruise.room_total_price || 0;
              processedReservations.push({
                reservation_id: `${res.re_id}_cruise_${index}`,
                service_type: 'cruise',
                service_details: {
                  ...cruise,
                  price_info: cruise.price_info
                },
                amount: amount,
                status: res.re_status
              });
            });
          }
        }

        // 크루즈 차량 예약들을 개별적으로 처리 - 크루즈 예약과 연결되거나 단독 차량 예약
        for (const res of resList.filter(r => r.re_type === 'cruise' || r.re_type === 'vehicle')) {
          const cruiseCarDetails = enrichedCruiseCarData.filter(c => c.reservation_id === res.re_id);
          if (cruiseCarDetails.length > 0) {
            // 각 크루즈 차량을 개별 서비스로 추가
            cruiseCarDetails.forEach((car, index) => {
              const amount = car.car_total_price || 0;
              processedReservations.push({
                reservation_id: `${res.re_id}_car_${index}`,
                service_type: 'cruise_car',
                service_details: {
                  ...car,
                  price_info: car.price_info
                },
                amount: amount,
                status: res.re_status
              });
            });
          }
        }

        // 공항 서비스 처리
        for (const res of resList.filter(r => r.re_type === 'airport')) {
          const airportDetail = enrichedAirportData.find(a => a.reservation_id === res.re_id);
          if (airportDetail) {
            const amount = airportDetail.total_price || 0;
            processedReservations.push({
              reservation_id: res.re_id,
              service_type: 'airport',
              service_details: {
                ...airportDetail,
                price_info: airportDetail.price_info
              },
              amount: amount,
              status: res.re_status
            });
          }
        }

        // 호텔 서비스 처리
        for (const res of resList.filter(r => r.re_type === 'hotel')) {
          const hotelDetail = enrichedHotelData.find(h => h.reservation_id === res.re_id);
          if (hotelDetail) {
            const amount = hotelDetail.total_price || 0;
            processedReservations.push({
              reservation_id: res.re_id,
              service_type: 'hotel',
              service_details: {
                ...hotelDetail,
                price_info: hotelDetail.price_info
              },
              amount: amount,
              status: res.re_status
            });
          }
        }

        // 렌터카 서비스 처리
        for (const res of resList.filter(r => r.re_type === 'rentcar')) {
          const rentcarDetail = enrichedRentcarData.find(r => r.reservation_id === res.re_id);
          if (rentcarDetail) {
            const amount = rentcarDetail.total_price || 0;
            processedReservations.push({
              reservation_id: res.re_id,
              service_type: 'rentcar',
              service_details: {
                ...rentcarDetail,
                price_info: rentcarDetail.price_info
              },
              amount: amount,
              status: res.re_status
            });
          }
        }

        // 투어 서비스 처리
        for (const res of resList.filter(r => r.re_type === 'tour')) {
          const tourDetail = enrichedTourData.find(t => t.reservation_id === res.re_id);
          if (tourDetail) {
            const amount = tourDetail.total_price || 0;
            processedReservations.push({
              reservation_id: res.re_id,
              service_type: 'tour',
              service_details: {
                ...tourDetail,
                price_info: tourDetail.price_info
              },
              amount: amount,
              status: res.re_status
            });
          }
        }

        // SHT 차량 서비스 처리
        for (const res of resList.filter(r => r.re_type === 'sht' || r.re_type === 'car')) {
          const shtDetail = shtMap.get(res.re_id);
          if (shtDetail) {
            const amount = pickAmount('sht', shtDetail);
            processedReservations.push({
              reservation_id: res.re_id,
              service_type: 'sht',
              service_details: shtDetail,
              amount: amount,
              status: res.re_status
            });
          }
        }

        console.log('✅ 최종 처리된 예약 목록:', processedReservations);

        // 결제 정보에서 총액 합산 시도 (fallback)
        const { data: payments } = reservationIds.length ? await supabase
          .from('reservation_payment')
          .select('amount')
          .in('reservation_id', reservationIds) : { data: [] };
        const paymentTotal = (payments || []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

        // 총 금액 계산 - 모든 개별 서비스의 금액 합산
        const rowsTotal = processedReservations.reduce((sum, reservation) => sum + (reservation.amount || 0), 0);

        // 최종 금액 결정: quote.total_price(DB) -> 아이템 합계 -> 결제액 합계 순
        let calculatedTotalPrice = Number(quote.total_price) || 0;
        if (calculatedTotalPrice <= 0) {
          calculatedTotalPrice = rowsTotal > 0 ? rowsTotal : paymentTotal;
        }

        console.log('💰 결정된 총 금액:', calculatedTotalPrice, '(아이템합:', rowsTotal, ', 결제합:', paymentTotal, ')');

        // 패키지 여부 확인
        const isPackage = quote.title?.includes('패키지') || processedReservations.length > 1;

        const qd: QuoteData = {
          quote_id: quote.quote_id || quote.id,
          title: quote.title || '제목 없음',
          user_name: userInfo?.name || '알 수 없음',
          user_email: userInfo?.email || '',
          user_phone: userInfo?.phone_number || '',
          total_price: calculatedTotalPrice,
          payment_status: quote.payment_status || 'pending',
          created_at: quote.created_at,
          reservations: processedReservations
        };
        setQuoteData(qd);
        setUnified({
          id: qd.quote_id,
          title: qd.title,
          user_name: qd.user_name,
          user_phone: qd.user_phone,
          total_price: qd.total_price,
          reservations: qd.reservations.map(r => ({
            reservation_id: r.reservation_id,
            service_type: r.service_type,
            service_details: r.service_details,
            amount: r.amount,
            status: r.status,
          })),
          hide_details: isPackage
        });
        setLoading(false);
        return;
      }

      // 2. 견적이 없으면 예약 단일건으로 확인서 생성
      const { data: reservation, error: resError } = await supabase
        .from('reservation')
        .select('*')
        .eq('re_id', quoteId)
        .single();
      if (!reservation || resError) {
        alert('예약/견적 정보를 찾을 수 없습니다.');
        setLoading(false);
        return;
      }
      // 예약 기반 사용자 정보
      let userInfo2 = null;
      if (reservation.re_user_id) {
        const { data: userData } = await supabase
          .from('users')
          .select('name, email, phone_number')
          .eq('id', reservation.re_user_id)
          .single();
        userInfo2 = userData;
      }
      // 서비스별 상세 정보
      let serviceDetail = null;
      let cruiseCarDetail = null;
      if (reservation.re_type === 'cruise') {
        const { data } = await supabase.from('reservation_cruise').select('*').eq('reservation_id', reservation.re_id).single();
        serviceDetail = (await enrichDataWithPrices([data], 'cruise'))[0];

        // 크루즈 차량도 함께 조회
        const { data: carData } = await supabase.from('reservation_cruise_car').select('*').eq('reservation_id', reservation.re_id).single();
        if (carData) {
          cruiseCarDetail = (await enrichDataWithPrices([carData], 'cruise_car'))[0];
        }
      } else if (reservation.re_type === 'airport') {
        const { data } = await supabase.from('reservation_airport').select('*').eq('reservation_id', reservation.re_id).single();
        serviceDetail = (await enrichDataWithPrices([data], 'airport'))[0];
      } else if (reservation.re_type === 'hotel') {
        const { data } = await supabase.from('reservation_hotel').select('*').eq('reservation_id', reservation.re_id).single();
        serviceDetail = (await enrichDataWithPrices([data], 'hotel'))[0];
      } else if (reservation.re_type === 'rentcar') {
        const { data } = await supabase.from('reservation_rentcar').select('*').eq('reservation_id', reservation.re_id).single();
        serviceDetail = (await enrichDataWithPrices([data], 'rentcar'))[0];
      } else if (reservation.re_type === 'tour') {
        const { data } = await supabase.from('reservation_tour').select('*').eq('reservation_id', reservation.re_id).single();
        serviceDetail = (await enrichDataWithPrices([data], 'tour'))[0];
      } else if (reservation.re_type === 'car' || reservation.re_type === 'sht') {
        const { data } = await supabase.from('reservation_car_sht').select('*').eq('reservation_id', reservation.re_id).single();
        serviceDetail = data;
      } else if (reservation.re_type === 'vehicle') {
        const { data: carData } = await supabase.from('reservation_cruise_car').select('*').eq('reservation_id', reservation.re_id).single();
        if (carData) {
          serviceDetail = (await enrichDataWithPrices([carData], 'cruise_car'))[0];
        }
      }
      // 결제 정보
      let paymentStatus = '';
      let totalPrice = 0;
      const { data: payment } = await supabase
        .from('reservation_payment')
        .select('payment_status, amount')
        .eq('reservation_id', reservation.re_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      if (payment) {
        paymentStatus = payment.payment_status;
        totalPrice = payment.amount;
      } else if (serviceDetail?.total_price) {
        totalPrice = serviceDetail.total_price;
      } else if (serviceDetail?.car_total_price) {
        totalPrice = serviceDetail.car_total_price;
      }

      // 크루즈 차량 금액도 포함
      let carTotalPrice = 0;
      if (cruiseCarDetail?.car_total_price) {
        carTotalPrice = cruiseCarDetail.car_total_price;
      }

      const reservationItems = [
        {
          reservation_id: reservation.re_id,
          service_type: reservation.re_type,
          service_details: serviceDetail,
          amount: totalPrice,
          status: reservation.re_status,
        }
      ];

      // 크루즈 차량이 있으면 추가
      if (cruiseCarDetail) {
        reservationItems.push({
          reservation_id: reservation.re_id + '_car',
          service_type: 'cruise_car',
          service_details: cruiseCarDetail,
          amount: carTotalPrice,
          status: reservation.re_status,
        });
      }

      const qd2: QuoteData = {
        quote_id: reservation.re_id,
        title: serviceDetail?.title || '예약확인서',
        user_name: userInfo2?.name || '',
        user_email: userInfo2?.email || '',
        user_phone: userInfo2?.phone_number || '',
        total_price: totalPrice + carTotalPrice,
        payment_status: paymentStatus,
        created_at: reservation.re_created_at,
        reservations: reservationItems
      };
      setQuoteData(qd2);
      setUnified({
        id: qd2.quote_id,
        title: qd2.title,
        user_name: qd2.user_name,
        user_phone: qd2.user_phone,
        total_price: qd2.total_price,
        reservations: qd2.reservations.map(r => ({
          reservation_id: r.reservation_id,
          service_type: r.service_type,
          service_details: r.service_details,
          amount: r.amount,
          status: r.status,
        }))
      });
    } catch (error) {
      console.error('예약/견적 데이터 로드 실패:', error);
      alert('예약/견적 정보를 불러올 수 없습니다.');
    } finally {
      setLoading(false);
    }
  };

  const generatePdfConfirmation = async () => {
    if (!quoteData) return;

    try {
      setGenerating(true);

      // html2pdf 동적 임포트
      const html2pdf = (await import('html2pdf.js')).default;

      const element = document.getElementById('confirmation-letter');
      const opt = {
        margin: 1,
        filename: `예약확인서_${quoteData.quote_id}_${quoteData.user_name}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
      };

      await html2pdf().set(opt).from(element).save();

      alert('예약확인서가 생성되었습니다.');
    } catch (error) {
      console.error('PDF 생성 실패:', error);
      alert('PDF 생성에 실패했습니다.');
    } finally {
      setGenerating(false);
    }
  };

  const printConfirmation = () => {
    const printContent = document.getElementById('confirmation-letter');
    const windowPrint = window.open('', '', 'width=800,height=600');

    if (windowPrint && printContent) {
      windowPrint.document.write(`
        <html>
          <head>
            <title>예약확인서</title>
            <style>
              body { font-family: Arial, sans-serif; padding: 20px; }
              .text-center { text-align: center; }
              .font-bold { font-weight: bold; }
              .mb-4 { margin-bottom: 1rem; }
              .border-b { border-bottom: 1px solid #ccc; padding-bottom: 0.5rem; }
              .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; }
              .space-y-2 > * { margin-bottom: 0.5rem; }
              .bg-gray-50 { background-color: #f9f9f9; padding: 1rem; border-radius: 0.5rem; }
              .text-blue-600 { color: #2563eb; }
              .text-gray-600 { color: #4b5563; }
              .border-t { border-top: 1px solid #ccc; padding-top: 1rem; margin-top: 1rem; }
            </style>
          </head>
          <body>
            ${printContent.innerHTML}
          </body>
        </html>
      `);
      windowPrint.document.close();
      windowPrint.print();
      windowPrint.close();
    }
  };

  const sendEmailConfirmation = async () => {
    if (!quoteData) return;

    try {
      setEmailSending(true);

      // PDF 생성
      const html2pdf = (await import('html2pdf.js')).default;
      const element = document.getElementById('confirmation-letter');

      if (!element) {
        throw new Error('확인서 요소를 찾을 수 없습니다.');
      }

      const opt = {
        margin: 0.5,
        filename: `예약확인서_${quoteData.quote_id}_${quoteData.user_name}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          letterRendering: true
        },
        jsPDF: {
          unit: 'in',
          format: 'a4',
          orientation: 'portrait'
        }
      };

      // PDF를 Blob으로 생성
      const pdfBlob = await html2pdf().set(opt).from(element).outputPdf('blob');

      // 이메일 발송 데이터 준비
      const emailData = {
        to: quoteData.user_email,
        subject: `[스테이하롱 트레블] 예약확인서 - ${quoteData.title}`,
        html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; color: white;">
                            <h1 style="margin: 0; font-size: 28px;">🎯 예약확인서</h1>
                            <p style="margin: 10px 0 0 0; font-size: 18px;">스테이하롱 트레블</p>
                        </div>
                        
                        <div style="padding: 30px; background: #ffffff;">
                            <h2 style="color: #333; margin-bottom: 20px;">안녕하세요, ${quoteData.user_name}님! 👋</h2>
                            
                            <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
                                <strong>${quoteData.title}</strong> 예약이 성공적으로 완료되었습니다.<br/>
                                베트남 하롱베이에서의 특별한 여행을 준비해보세요!
                            </p>
                            
                            <div style="background: #f8f9fa; border-radius: 10px; padding: 20px; margin: 20px 0;">
                                <h3 style="color: #495057; margin-top: 0;">📋 예약 정보</h3>
                                <ul style="color: #6c757d; list-style: none; padding: 0;">
                                    <li style="margin-bottom: 8px;"><strong>예약번호:</strong> ${quoteData.quote_id}</li>
                                    <li style="margin-bottom: 8px;"><strong>예약명:</strong> ${quoteData.title}</li>
                                    <li style="margin-bottom: 8px;"><strong>총 금액:</strong> <span style="color: #007bff; font-weight: bold;">${quoteData.total_price.toLocaleString()}동</span></li>
                                    <li style="margin-bottom: 8px;"><strong>예약일:</strong> ${formatDate(quoteData.created_at)}</li>
                                    <li><strong>상태:</strong> <span style="color: #28a745; font-weight: bold;">✅ 결제완료</span></li>
                                </ul>
                            </div>
                            
                            <div style="background: #e3f2fd; border-radius: 10px; padding: 20px; margin: 20px 0;">
                                <h3 style="color: #1976d2; margin-top: 0;">🎒 여행 준비사항</h3>
                                <ul style="color: #1565c0; margin: 0;">
                                    <li>여권 (유효기간 6개월 이상)</li>
                                    <li>첨부된 예약확인서 출력본</li>
                                    <li>여행자보험 가입 권장</li>
                                    <li>편안한 복장 및 운동화</li>
                                </ul>
                            </div>
                            
                            <div style="background: #fff3cd; border-radius: 10px; padding: 20px; margin: 20px 0;">
                                <h3 style="color: #856404; margin-top: 0;">⚠️ 중요 안내</h3>
                                <ul style="color: #856404; margin: 0;">
                                    <li>여행 3일 전까지 변경/취소 가능</li>
                                    <li>날씨에 따라 일정이 변경될 수 있습니다</li>
                                    <li>출발 30분 전 집결 완료</li>
                                    <li>귀중품 관리에 주의해주세요</li>
                                </ul>
                            </div>
                            
                            <div style="text-align: center; margin: 30px 0;">
                                <p style="color: #666; margin-bottom: 15px;">문의사항이 있으시면 언제든 연락주세요!</p>
                                <div style="background: #f8f9fa; border-radius: 10px; padding: 15px; display: inline-block;">
                                    <p style="margin: 0; color: #495057;"><strong>📞 고객센터:</strong> 1588-1234</p>
                                    <p style="margin: 5px 0 0 0; color: #495057;"><strong>📧 이메일:</strong> support@stayhalong.com</p>
                                </div>
                            </div>
                        </div>
                        
                        <div style="background: #6c757d; padding: 20px; text-align: center; color: white;">
                            <p style="margin: 0; font-size: 16px;">🌊 스테이하롱 트레블 🌊</p>
                            <p style="margin: 5px 0 0 0; font-size: 12px; opacity: 0.8;">베트남 하롱베이 전문 여행사</p>
                        </div>
                    </div>
                `,
        attachments: [
          {
            filename: `예약확인서_${quoteData.quote_id}_${quoteData.user_name}.pdf`,
            content: pdfBlob
          }
        ]
      };

      // 실제 이메일 발송 API 호출 (구현 필요)
      // const response = await fetch('/api/send-email', {
      //     method: 'POST',
      //     headers: { 'Content-Type': 'application/json' },
      //     body: JSON.stringify(emailData)
      // });

      // 시뮬레이션
      console.log('📧 이메일 발송 데이터:', emailData);
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 확인서 발송 후 상태 업데이트: 견적 status, confirmed_at, 예약 상태를 'confirmed'로 동기화
      try {
        // id/quote_id 양쪽 지원
        await supabase.from('quote').update({ status: 'confirmed', confirmed_at: new Date().toISOString() }).or(`quote_id.eq.${quoteData.quote_id},id.eq.${quoteData.quote_id}`);
        await supabase.from('reservation').update({ re_status: 'confirmed' }).eq('re_quote_id', quoteData.quote_id);
        // (선택) 발송 로그 기록
        try {
          await supabase.from('reservation_confirmation').insert({
            quote_id: quoteData.quote_id,
            method: 'email',
            status: 'sent',
            subject: `예약확인서: ${quoteData.title}`,
            recipient_email: quoteData.user_email,
            sent_at: new Date().toISOString(),
            meta: {
              generator: 'manager',
              amount: quoteData.total_price,
              services: quoteData.reservations.length
            }
          } as any);
        } catch (logErr) {
          const errAny = logErr as any;
          console.warn('발송 로그 기록 실패(선택):', errAny?.message || errAny);
        }
      } catch (e) {
        console.warn('확인서 발송 상태 동기화 실패:', e);
      }

      alert(`✅ ${quoteData.user_email}로 예약확인서가 성공적으로 발송되었습니다.\n\n📋 발송 내용:\n- 예약확인서 PDF 첨부\n- 여행 준비사항 안내\n- 긴급연락처 정보\n- 중요 주의사항`);

    } catch (error) {
      console.error('이메일 발송 실패:', error);
      alert('❌ 이메일 발송에 실패했습니다.\n\n다시 시도하거나 고객센터로 문의해주세요.');
    } finally {
      setEmailSending(false);
    }
  };

  const getServiceTypeName = (type: string) => {
    const typeNames = {
      cruise: '크루즈',
      cruise_car: '크루즈 차량',
      airport: '공항차량',
      hotel: '호텔',
      rentcar: '렌터카',
      tour: '투어',
      car: '차량 서비스',
      sht: 'SHT 차량',
      vehicle: '차량 서비스'
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

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <ManagerLayout title="예약확인서 생성" activeTab="confirmation">
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
          <p className="ml-4 text-gray-600">데이터를 불러오는 중...</p>
        </div>
      </ManagerLayout>
    );
  }

  if (!quoteData) {
    return (
      <ManagerLayout title="예약확인서 생성" activeTab="confirmation">
        <div className="text-center py-12">
          <div className="text-4xl mb-4">❌</div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">견적을 찾을 수 없습니다</h3>
          <button
            onClick={() => router.back()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            돌아가기
          </button>
        </div>
      </ManagerLayout>
    );
  }

  return (
    <ManagerLayout title="예약확인서 생성" activeTab="confirmation">
      <div className="space-y-6">


        {/* 예약확인서 미리보기 */}
        <div className="bg-white rounded-lg shadow-sm">
          {/* 공용 확인서 렌더러: 고객용과 동일 양식 */}
          <div id="confirmation-letter">
            {!unified ? (
              <div className="p-8 text-center text-gray-500">미리보기 데이터를 불러오는 중...</div>
            ) : (
              <UnifiedConfirmation data={unified} />
            )}
          </div>
        </div>
      </div>
    </ManagerLayout>
  );
}
