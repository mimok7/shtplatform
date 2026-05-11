'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import ManagerLayout from '@/components/ManagerLayout';
import PaymentDetailModal from '../../../components/PaymentDetailModal';
import supabase from '@/lib/supabase';
import {
  CreditCard,
  DollarSign,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Clock,
  Search,
  Eye,
  RotateCcw,
} from 'lucide-react';

// 결제 상태/수단 텍스트 변환
const getPaymentStatusText = (status: string) => {
  switch (status) {
    case 'pending': return '결제 대기';
    case 'completed': return '결제 완료';
    case 'failed': return '결제 실패';
    default: return status;
  }
};
const getPaymentStatusIcon = (status: string) => {
  switch (status) {
    case 'completed': return <CheckCircle className="w-5 h-5 text-green-600" />;
    case 'failed': return <AlertCircle className="w-5 h-5 text-red-600" />;
    default: return <Clock className="w-5 h-5 text-yellow-600" />;
  }
};
const getPaymentMethodText = (method: string) => {
  switch (method) {
    case 'CARD': case 'card': return '신용카드';
    case 'BANK': case 'bank': return '계좌이체';
    case 'CASH': case 'cash': return '현금';
    default: return method || '신용카드';
  }
};

const debugLog = (...args: any[]) => {
  if (process.env.NODE_ENV !== 'production') {
    console.log(...args);
  }
};

export default function ManagerPaymentsPage() {
  const router = useRouter();
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchInput, setSearchInput] = useState('');
  // 최초 로딩시 결제대기만 보이도록 기본값 'pending'
  const [filter, setFilter] = useState('pending');
  const [selectedPayments, setSelectedPayments] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState(false);
  const [bulkCompleting, setBulkCompleting] = useState(false);
  const [creatingGroupLinkId, setCreatingGroupLinkId] = useState<string | null>(null);
  // 페이지네이션 상태
  const PAGE_SIZE = 50;
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [globalStats, setGlobalStats] = useState({
    totalAmount: 0,
    completedAmount: 0,
    totalCount: 0,
    zeroAmountCount: 0
  });

  const resolveVehicleQuantity = (row: any, unitPrice = 0) => {
    const carCount = Number(row?.car_count) || 0;
    if (carCount > 0) return carCount;

    const totalPrice = Number(row?.car_total_price || row?.total_price) || 0;
    if (totalPrice > 0 && unitPrice > 0) {
      const derived = Math.round(totalPrice / unitPrice);
      if (derived > 0) return derived;
    }

    const passengerCount = Number(row?.passenger_count) || 0;
    if (passengerCount > 0) return passengerCount;

    return 1;
  };

  const formatQuantityUnit = (unit?: string) => {
    return unit === '대' ? '' : (unit || '');
  };

  // 대량 IN 쿼리/업데이트를 분할 처리하기 위한 유틸
  const chunkArray = <T,>(arr: T[], size: number): T[][] => {
    const res: T[][] = [];
    for (let i = 0; i < arr.length; i += size) res.push(arr.slice(i, i + size));
    return res;
  };

  // 예약 디테일 모달 상태
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState<any>(null);

  const getPreferredAmount = (payment: any, serviceTotal?: number) => {
    const rawPaymentAmount = payment?.amount;
    const hasPaymentAmount = rawPaymentAmount !== null && rawPaymentAmount !== undefined && rawPaymentAmount !== '';
    const serviceAmount = Number(serviceTotal ?? payment?.serviceData?.total ?? 0);
    const paymentAmount = Number(rawPaymentAmount || 0);
    const rawReservationAmount = payment?.reservation?.total_amount ?? payment?.reservation?.price_breakdown?.grand_total;
    const hasReservationAmount = rawReservationAmount !== null && rawReservationAmount !== undefined && rawReservationAmount !== '';
    const reservationAmount = Number(rawReservationAmount || 0);

    // 예약 수정 화면에서 저장한 최종 금액을 모든 결제 처리 화면에서 우선 표시
    if (hasReservationAmount && Number.isFinite(reservationAmount) && reservationAmount > 0) return reservationAmount;
    if (hasPaymentAmount && Number.isFinite(paymentAmount)) return paymentAmount;
    return serviceAmount;
  };

  // 상세보기 모달 열기
  const openDetailModal = (payment: any) => {
    setSelectedReservation(payment);
    setModalOpen(true);
  };

  // 서비스 상세 테이블에서 금액 계산 함수 (getServiceDetails와 동일한 로직)
  const calculateServiceAmount = async (reservationId: string, reservationType: string): Promise<number> => {
    let total = 0;

    try {
      // 1. 크루즈 객실 서비스
      if (reservationType === 'cruise') {
        const { data: cruiseData } = await supabase
          .from('reservation_cruise')
          .select('*')
          .eq('reservation_id', reservationId);

        if (cruiseData && cruiseData.length > 0) {
          for (const cruise of cruiseData) {
            // room_total_price가 있으면 사용
            if (cruise.room_total_price && Number(cruise.room_total_price) > 0) {
              total += Number(cruise.room_total_price);
            } else if (cruise.room_price_code) {
              const { data: roomPrice } = await supabase
                .from('cruise_rate_card')
                .select('price_adult, price_child, price_child_extra_bed, price_infant, price_extra_bed, price_single')
                .eq('id', cruise.room_price_code)
                .maybeSingle();
              if (roomPrice) {
                const adultCount = Number(cruise.adult_count) || Number(cruise.guest_count) || 1;
                const childCount = Number(cruise.child_count) || 0;
                const childExtraBedCount = Number(cruise.child_extra_bed_count) || 0;
                const infantCount = Number(cruise.infant_count) || 0;
                const extraBedCount = Number(cruise.extra_bed_count) || 0;
                const singleCount = Number(cruise.single_count) || 0;

                let roomTotal = 0;
                roomTotal += (Number(roomPrice.price_adult) || 0) * adultCount;
                roomTotal += (Number(roomPrice.price_child) || 0) * childCount;
                roomTotal += (Number(roomPrice.price_child_extra_bed) || 0) * childExtraBedCount;
                roomTotal += (Number(roomPrice.price_infant) || 0) * infantCount;
                roomTotal += (Number(roomPrice.price_extra_bed) || 0) * extraBedCount;
                roomTotal += (Number(roomPrice.price_single) || 0) * singleCount;
                total += roomTotal;
              }
            }
          }
        }
      }

      // 2. 크루즈 차량 서비스 (vehicle 타입)
      if (reservationType === 'vehicle' || reservationType === 'cruise') {
        const { data: cruiseCarData } = await supabase
          .from('reservation_cruise_car')
          .select('*')
          .eq('reservation_id', reservationId);

        if (cruiseCarData && cruiseCarData.length > 0) {
          for (const car of cruiseCarData) {
            // car_total_price가 있으면 사용
            if (car.car_total_price && Number(car.car_total_price) > 0) {
              total += Number(car.car_total_price);
            } else if (car.rentcar_price_code || car.car_price_code) {
              const priceCode = car.rentcar_price_code || car.car_price_code;
              const { data: carPrice } = await supabase
                .from('rentcar_price')
                .select('price')
                .eq('rent_code', priceCode)
                .maybeSingle();
              if (carPrice?.price) {
                const quantity = resolveVehicleQuantity(car, Number(carPrice.price));
                total += Number(carPrice.price) * quantity;
              }
            }
          }
        }
      }

      // 3. SHT 차량 서비스 (sht 타입)
      if (reservationType === 'sht' || reservationType === 'car') {
        const { data: shtData } = await supabase
          .from('reservation_car_sht')
          .select('*')
          .eq('reservation_id', reservationId);

        if (shtData && shtData.length > 0) {
          for (const sht of shtData) {
            // car_total_price가 있으면 사용
            if (sht.car_total_price && Number(sht.car_total_price) > 0) {
              total += Number(sht.car_total_price);
              console.log(`SHT car_total_price 사용: ${sht.car_total_price}`);
            } else if (sht.unit_price && Number(sht.unit_price) > 0) {
              // unit_price * car_count 계산
              const carCount = Number(sht.car_count) || 1;
              total += Number(sht.unit_price) * carCount;
              console.log(`SHT unit_price*car_count 계산: ${sht.unit_price} * ${carCount}`);
            } else if (sht.car_price_code) {
              // rentcar_price 테이블에서 가격 조회
              const { data: carPrice } = await supabase
                .from('rentcar_price')
                .select('price')
                .eq('rent_code', sht.car_price_code)
                .maybeSingle();
              if (carPrice?.price) {
                const quantity = Number(sht.car_count) || 1;
                total += Number(carPrice.price) * quantity;
                console.log(`SHT rentcar_price 테이블 조회: ${carPrice.price} * ${quantity}`);
              }
            }
          }
        }

      }

      // 4. 공항 서비스
      if (reservationType === 'airport') {
        const { data: airportData } = await supabase
          .from('reservation_airport')
          .select('*')
          .eq('reservation_id', reservationId);

        if (airportData && airportData.length > 0) {
          for (const airport of airportData) {
            // total_price가 있으면 사용
            if (airport.total_price && Number(airport.total_price) > 0) {
              total += Number(airport.total_price);
            } else if (airport.airport_price_code) {
              const { data: airportPrice } = await supabase
                .from('airport_price')
                .select('price')
                .eq('airport_code', airport.airport_price_code)
                .maybeSingle();
              if (airportPrice?.price) {
                const quantity = Number(airport.ra_passenger_count) || 1;
                total += Number(airportPrice.price) * quantity;
              }
            }
          }
        }
      }

      // 5. 호텔 서비스
      if (reservationType === 'hotel') {
        const { data: hotelData } = await supabase
          .from('reservation_hotel')
          .select('*')
          .eq('reservation_id', reservationId);

        if (hotelData && hotelData.length > 0) {
          for (const hotel of hotelData) {
            // total_price가 있으면 사용
            if (hotel.total_price && Number(hotel.total_price) > 0) {
              total += Number(hotel.total_price);
            } else if (hotel.hotel_price_code) {
              const { data: hotelPrice } = await supabase
                .from('hotel_price')
                .select('base_price')
                .eq('hotel_price_code', hotel.hotel_price_code)
                .maybeSingle();
              if (hotelPrice?.base_price) {
                const nights = Number(hotel.schedule?.match(/\d+/)?.[0]) || 1;
                const rooms = Number(hotel.room_count) || 1;
                total += Number(hotelPrice.base_price) * nights * rooms;
              }
            }
          }
        }
      }

      // 6. 렌터카 서비스
      if (reservationType === 'rentcar') {
        const { data: rentcarData } = await supabase
          .from('reservation_rentcar')
          .select('*')
          .eq('reservation_id', reservationId);

        if (rentcarData && rentcarData.length > 0) {
          for (const rentcar of rentcarData) {
            // total_price가 있으면 사용
            if (rentcar.total_price && Number(rentcar.total_price) > 0) {
              total += Number(rentcar.total_price);
            } else if (rentcar.rentcar_price_code) {
              const { data: rentPrice } = await supabase
                .from('rentcar_price')
                .select('price')
                .eq('rent_code', rentcar.rentcar_price_code)
                .maybeSingle();
              if (rentPrice?.price) {
                const days = Number(rentcar.rental_days) || 1;
                const carCount = Number(rentcar.rentcar_count) || 1;
                total += Number(rentPrice.price) * days * carCount;
              }
            }
          }
        }
      }

      // 7. 투어 서비스
      if (reservationType === 'tour') {
        const { data: tourData } = await supabase
          .from('reservation_tour')
          .select('*')
          .eq('reservation_id', reservationId);

        if (tourData && tourData.length > 0) {
          for (const tour of tourData) {
            // total_price가 있으면 사용
            if (tour.total_price && Number(tour.total_price) > 0) {
              total += Number(tour.total_price);
            } else if (tour.tour_price_code) {
              const { data: tourPrice } = await supabase
                .from('tour_pricing')
                .select('price_per_person, pricing_id, tour:tour_id(tour_name, tour_code)')
                .eq('pricing_id', tour.tour_price_code)
                .maybeSingle();
              if (tourPrice?.price_per_person) {
                const quantity = Number(tour.tour_capacity) || 1;
                total += Number(tourPrice.price_per_person) * quantity;
              }
            }
          }
        }
      }

    } catch (error) {
      console.error('서비스 금액 계산 오류:', reservationId, error);
    }

    return total;
  };

  // 결제 레코드 생성 함수 - 견적 그룹 내 모든 서비스(예약)를 개별 결제 레코드로 생성
  const generatePaymentRecords = async () => {
    setGenerating(true);
    try {
      // 1. 예약 조회 (total_amount 포함)
      const { data: reservations } = await supabase
        .from('reservation')
        .select('re_id, re_user_id, re_quote_id, re_type, total_amount, price_breakdown');

      if (!reservations || reservations.length === 0) {
        alert('예약이 없습니다.');
        return;
      }

      console.log('🔍 예약 조회:', reservations.length, '건');

      // 2. total_amount가 0인 예약들의 금액을 자동 계산하고 업데이트
      let updatedCount = 0;
      for (const reservation of reservations) {
        if (!reservation.total_amount || Number(reservation.total_amount) === 0) {
          const calculatedAmount = await calculateServiceAmount(reservation.re_id, reservation.re_type);

          if (calculatedAmount > 0) {
            const { error: updateError } = await supabase
              .from('reservation')
              .update({ total_amount: calculatedAmount })
              .eq('re_id', reservation.re_id);

            if (updateError) {
              console.error(`예약 ${reservation.re_id} 금액 업데이트 실패:`, updateError);
            } else {
              reservation.total_amount = calculatedAmount;
              updatedCount++;
              console.log(`💵 예약 ${reservation.re_id} (${reservation.re_type}): ${calculatedAmount.toLocaleString()}동으로 업데이트`);
            }
          }
        }
      }

      if (updatedCount > 0) {
        console.log(`📊 ${updatedCount}개 예약의 금액이 업데이트되었습니다.`);
      }

      // 3. 이미 결제 레코드가 있는 예약 제외 (reservation_id 단위)
      const reservationIds = reservations.map(r => r.re_id);
      const existingResIds = new Set<string>();
      const chunkSize = 100;
      for (let i = 0; i < reservationIds.length; i += chunkSize) {
        const chunk = reservationIds.slice(i, i + chunkSize);
        const { data: chunkData } = await supabase
          .from('reservation_payment')
          .select('reservation_id')
          .in('reservation_id', chunk);
        (chunkData || []).forEach(p => existingResIds.add(p.reservation_id));
      }

      // 결제 레코드가 없는 예약만 필터
      const newReservations = reservations.filter(r => !existingResIds.has(r.re_id));

      if (newReservations.length === 0) {
        alert(`${updatedCount > 0 ? `${updatedCount}개 예약의 금액이 업데이트되었습니다.\n` : ''}새로 생성할 결제 레코드가 없습니다. (모든 예약에 이미 결제 레코드가 있습니다)`);
        return;
      }

      console.log('🆕 신규 결제 생성 대상:', newReservations.length, '건');

      // 4. 각 예약마다 개별 결제 레코드 생성 (같은 견적 그룹이면 quote_id 공유)
      const paymentRecords = newReservations.map(reservation => {
        const isQuote = !!reservation.re_quote_id;
        return {
          id: crypto.randomUUID(),
          reservation_id: reservation.re_id,
          quote_id: reservation.re_quote_id || null,
          user_id: reservation.re_user_id,
          amount: Number(reservation.total_amount) || 0,
          payment_method: 'BANK',
          payment_status: 'pending',
          memo: `자동 생성 - ${reservation.re_type} | ${isQuote ? `견적 ${reservation.re_quote_id}` : `개별예약 ${String(reservation.re_id).slice(0, 8)}`} (${new Date().toLocaleDateString()})`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
      });

      console.log('📋 생성할 결제 레코드:', paymentRecords.length, '건');
      paymentRecords.forEach(p => console.log(`  ${p.memo} | ${p.amount.toLocaleString()}동`));

      // 5. 결제 레코드 일괄 삽입
      if (paymentRecords.length > 0) {
        console.log('🚀 결제 레코드 서버 전송 시작...', paymentRecords.length, '건');
        const { error } = await supabase
          .from('reservation_payment')
          .insert(paymentRecords);

        if (error) {
          if (error.message?.includes('notifications_subcategory_check')) {
            alert('데이터베이스 알림 설정(제약조건) 오류가 발생했습니다.\n\n해결 방법: Supabase SQL Editor에서 제공해드린 "sql/fix-notification-subcategory.sql" 스크립트를 실행해 주세요. 이 작업이 완료되어야 결제 데이터를 저장할 수 있습니다.');
            setGenerating(false);
            return;
          } else {
            console.error('❌ 결제 레코드 삽입 오류:', error);
            throw error;
          }
        }

        alert(`${updatedCount > 0 ? `${updatedCount}개 예약의 금액이 업데이트되었습니다.\n` : ''}${paymentRecords.length}개의 결제 레코드가 생성되었습니다.`);
      } else {
        alert(`${updatedCount > 0 ? `${updatedCount}개 예약의 금액이 업데이트되었습니다.\n` : ''}생성할 새로운 결제 레코드가 없습니다.`);
      }

    } catch (error) {
      console.error('결제 레코드 생성 실패:', error);
      alert('결제 레코드 생성 중 오류가 발생했습니다.');
    } finally {
      setGenerating(false);
      // 생성 완료 후 목록 새로고침
      await loadPayments();
    }
  };

  // 전역 통계 로드
  const fetchGlobalStats = async () => {
    try {
      const { data, error } = await supabase
        .from('reservation_payment')
        .select('amount, payment_status');

      if (error) throw error;

      if (data) {
        const total = data.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
        const completed = data.filter(p => p.payment_status === 'completed').reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
        const zeroCount = data.filter(p => (Number(p.amount) || 0) <= 0).length;

        setGlobalStats({
          totalAmount: total,
          completedAmount: completed,
          totalCount: data.length,
          zeroAmountCount: zeroCount
        });
      }
    } catch (e) {
      console.error('전역 통계 로드 실패:', e);
    }
  };

  // 결제 목록 로드 (상세 정보 포함)
  const loadPayments = async () => {
    setLoading(true);
    fetchGlobalStats(); // 통계는 별도로 전체 로드
    try {
      // 결제 목록 조회: 현재 필터에 맞춰 서버 사이드에서 정확히 로드 (all이면 전체)
      let query = supabase
        .from('reservation_payment')
        .select(`
          *,
          reservation:reservation_id (
            re_id,
            re_status,
            re_type,
            re_quote_id,
            total_amount,
            manual_additional_fee,
            manual_additional_fee_detail,
            price_breakdown
          )
        `)
        .order('created_at', { ascending: false });

      if (filter && filter !== 'all') {
        if (filter === 'zero') {
          query = query.or('amount.eq.0,amount.is.null');
        } else {
          query = query.eq('payment_status', filter);
        }
      }

      if (searchTerm) {
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(searchTerm);

        // 1. 사용자 테이블 검색 (이름, 이메일, 전화번호)
        const userOrConditions = [`name.ilike.%${searchTerm}%`, `email.ilike.%${searchTerm}%`, `phone_number.ilike.%${searchTerm}%`];
        if (isUUID) userOrConditions.push(`id.eq.${searchTerm}`);

        const { data: matchedUsers } = await supabase
          .from('users')
          .select('id')
          .or(userOrConditions.join(','));

        const matchedUserIds = matchedUsers?.map(u => u.id) || [];

        // 2. 견적 테이블 검색 (제목)
        const quoteOrConditions = [`title.ilike.%${searchTerm}%`];
        if (isUUID) quoteOrConditions.push(`id.eq.${searchTerm}`);
        const { data: matchedQuotes } = await supabase
          .from('quote')
          .select('id')
          .or(quoteOrConditions.join(','));
        const matchedQuoteIds = (matchedQuotes || []).map(q => q.id);

        // 3. 예약 테이블 검색 (ID 또는 견적 ID 기준)
        let resOrConditions: string[] = [];
        if (isUUID) resOrConditions.push(`re_id.eq.${searchTerm}`);
        if (matchedQuoteIds.length > 0) {
          resOrConditions.push(`re_quote_id.in.(${matchedQuoteIds.map(id => `"${id}"`).join(',')})`);
        }

        let matchedResIds: string[] = [];
        if (resOrConditions.length > 0) {
          const { data: matchedReservations } = await supabase
            .from('reservation')
            .select('re_id')
            .or(resOrConditions.join(','));
          matchedResIds = (matchedReservations || []).map(r => r.re_id);
        }

        // 4. 검색 조건 구성
        let orParts = [];
        // matchedUserIds를 개별 eq 조건으로 추가
        matchedUserIds.forEach(id => {
          orParts.push(`user_id.eq.${id}`);
        });

        if (isUUID) {
          orParts.push(`reservation_id.eq.${searchTerm}`);
        }

        if (matchedResIds.length > 0) {
          orParts.push(`reservation_id.in.(${matchedResIds.map(id => `"${id}"`).join(',')})`);
        }

        orParts.push(`memo.ilike.%${searchTerm}%`);

        if (orParts.length > 0) {
          query = query.or(orParts.join(','));
        }
      }

      // 초기 페이지 범위
      const { data: paymentRows } = await (query as any).range(0, PAGE_SIZE - 1);

      const rows: any[] = (paymentRows as any[]) || [];

      // 사용자 정보 매핑
      const userIds = Array.from(new Set(rows.map((r: any) => r.user_id).filter(Boolean)));
      const { data: users } = userIds.length > 0
        ? await supabase.from('users').select('id, name, email').in('id', userIds as string[])
        : { data: [] };

      const usersMap = new Map((users || []).map((u: any) => [u.id, u]));

      // 각 결제의 서비스 상세 정보 조회 (개별 reservation_id 기준)
      const enriched = await Promise.all(rows.map(async (r: any) => {
        const reType = r.reservation?.re_type || '';
        const serviceData = await getServiceDetails([r.reservation_id]);

        // 서비스 상세 테이블에 데이터가 없으면 reservation.total_amount로 보충
        if (serviceData.services.length === 0 && r.reservation?.total_amount > 0) {
          const reTypeLabels: Record<string, string> = {
            cruise: '크루즈', airport: '공항', hotel: '호텔',
            tour: '투어', rentcar: '렌터카', sht: '스하차량', car: '차량'
          };
          const fallbackUnitByType: Record<string, string> = {
            car: '대',
            vehicle: '대',
            airport: '대',
            rentcar: '대',
            hotel: '박',
            cruise: '식',
            tour: '명',
            sht: '대',
          };
          serviceData.services.push({
            type: reTypeLabels[reType] || reType,
            unitPrice: Number(r.reservation.total_amount),
            quantity: 1,
            quantityUnit: fallbackUnitByType[reType] || '식',
            amount: Number(r.reservation.total_amount)
          });
          serviceData.total = Number(r.reservation.total_amount);
        }

        const preferredAmount = getPreferredAmount(r, serviceData.total);

        return {
          ...r,
          users: r.user_id ? usersMap.get(r.user_id) : undefined,
          calculatedAmount: preferredAmount,
          serviceData,
          allReservationIds: [r.reservation_id],
          allServiceTypes: reType ? [reType] : []
        };
      }));

      // pending 결제의 잘못된 금액을 서비스 계산값으로 DB 동기화
      const mismatches = enriched.filter((p: any) => {
        const preferred = Number(p.calculatedAmount || 0);
        const currentRaw = p.amount;
        const hasCurrentPayment = currentRaw !== null && currentRaw !== undefined && currentRaw !== '';
        const currentPayment = Number(p.amount || 0);
        // 수동 입력된 금액(>0)은 덮어쓰지 않고, 미입력/0 금액만 자동 보정
        return p.payment_status === 'pending' && preferred > 0 && (!hasCurrentPayment || currentPayment <= 0);
      });

      if (mismatches.length > 0) {
        await Promise.all(mismatches.map(async (p: any) => {
          const preferred = Number(p.calculatedAmount || 0);
          await supabase.from('reservation_payment').update({ amount: preferred, updated_at: new Date().toISOString() }).eq('id', p.id);
          await supabase.from('reservation').update({ total_amount: preferred }).eq('re_id', p.reservation_id);
        }));

        // 로컬 반영
        mismatches.forEach((p: any) => {
          p.amount = Number(p.calculatedAmount || 0);
          if (p.reservation) p.reservation.total_amount = Number(p.calculatedAmount || 0);
        });

        await fetchGlobalStats();
      }

      // quote title 일괄 조회
      const quoteIds = Array.from(new Set(enriched.map((r: any) => r.quote_id || r.reservation?.re_quote_id).filter(Boolean)));
      const { data: quoteRows } = quoteIds.length > 0
        ? await supabase.from('quote').select('id, title').in('id', quoteIds as string[])
        : { data: [] };
      const quotesMap = new Map((quoteRows || []).map((q: any) => [q.id, q]));
      const enrichedWithQuote = enriched.map((r: any) => {
        const qId = r.quote_id || r.reservation?.re_quote_id;
        return { ...r, quoteTitle: qId ? ((quotesMap.get(qId) as any)?.title || null) : null };
      });

      setPayments(enrichedWithQuote);
      setHasMore((enrichedWithQuote?.length || 0) === PAGE_SIZE);
      console.log('💾 결제 목록 로드 완료:', enrichedWithQuote.length, '건');
    } catch (e) {
      console.error('결제 목록 로드 실패:', e);
      setPayments([]);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  };

  // 다음 페이지 로드
  const loadMorePayments = async () => {
    if (loadingMore || !hasMore) return;
    try {
      setLoadingMore(true);
      // 동일한 쿼리 빌드
      let query = supabase
        .from('reservation_payment')
        .select(`
          *,
          reservation:reservation_id (
            re_id,
            re_status,
            re_type,
            re_quote_id,
            total_amount
          )
        `)
        .order('created_at', { ascending: false });
      if (filter && filter !== 'all') {
        if (filter === 'zero') {
          query = query.or('amount.eq.0,amount.is.null');
        } else {
          query = query.eq('payment_status', filter);
        }
      }
      if (searchTerm) {
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(searchTerm);

        const userOrConditions = [`name.ilike.%${searchTerm}%`, `email.ilike.%${searchTerm}%`, `phone_number.ilike.%${searchTerm}%`];
        if (isUUID) userOrConditions.push(`id.eq.${searchTerm}`);

        const { data: matchedUsers } = await supabase
          .from('users')
          .select('id')
          .or(userOrConditions.join(','));
        const matchedUserIds = matchedUsers?.map(u => u.id) || [];

        // 2. 견적 테이블 검색 (제목)
        const quoteOrConditions = [`title.ilike.%${searchTerm}%`];
        if (isUUID) quoteOrConditions.push(`id.eq.${searchTerm}`);
        const { data: matchedQuotes } = await supabase
          .from('quote')
          .select('id')
          .or(quoteOrConditions.join(','));
        const matchedQuoteIds = (matchedQuotes || []).map(q => q.id);

        // 3. 예약 테이블 검색 (ID 또는 견적 ID 기준)
        let resOrConditions: string[] = [];
        if (isUUID) resOrConditions.push(`re_id.eq.${searchTerm}`);
        if (matchedQuoteIds.length > 0) {
          resOrConditions.push(`re_quote_id.in.(${matchedQuoteIds.map(id => `"${id}"`).join(',')})`);
        }

        let matchedResIds: string[] = [];
        if (resOrConditions.length > 0) {
          const { data: matchedReservations } = await supabase
            .from('reservation')
            .select('re_id')
            .or(resOrConditions.join(','));
          matchedResIds = (matchedReservations || []).map(r => r.re_id);
        }

        let orParts = [];
        matchedUserIds.forEach(id => orParts.push(`user_id.eq.${id}`));
        if (isUUID) {
          orParts.push(`reservation_id.eq.${searchTerm}`);
        }
        if (matchedResIds.length > 0) {
          orParts.push(`reservation_id.in.(${matchedResIds.map(id => `"${id}"`).join(',')})`);
        }
        orParts.push(`memo.ilike.%${searchTerm}%`);

        if (orParts.length > 0) query = query.or(orParts.join(','));
      }
      const offset = payments.length;
      const { data: paymentRows } = await (query as any).range(offset, offset + PAGE_SIZE - 1);
      const rows: any[] = (paymentRows as any[]) || [];

      const userIds = Array.from(new Set(rows.map((r: any) => r.user_id).filter(Boolean)));
      const { data: users } = userIds.length > 0
        ? await supabase.from('users').select('id, name, email').in('id', userIds as string[])
        : { data: [] };
      const usersMap = new Map((users || []).map((u: any) => [u.id, u]));

      // 개별 결제 레코드 enrichment (각 결제 = 1개 서비스)
      const enrichedNext = await Promise.all(rows.map(async (r: any) => {
        const reType = r.reservation?.re_type || '';
        const serviceData = await getServiceDetails([r.reservation_id]);

        // 서비스 상세 테이블에 데이터 없으면 reservation.total_amount로 보충
        if (serviceData.services.length === 0 && r.reservation?.total_amount) {
          const reTypeLabels: Record<string, string> = {
            cruise: '크루즈', airport: '공항', hotel: '호텔',
            tour: '투어', rentcar: '렌터카', sht: '스하차량', car: '차량'
          };
          const fallbackUnitByType: Record<string, string> = {
            car: '대',
            vehicle: '대',
            airport: '대',
            rentcar: '대',
            hotel: '박',
            cruise: '식',
            tour: '명',
            sht: '대',
          };
          serviceData.services.push({
            type: reTypeLabels[reType] || reType,
            unitPrice: Number(r.reservation.total_amount),
            quantity: 1,
            quantityUnit: fallbackUnitByType[reType] || '식',
            amount: Number(r.reservation.total_amount)
          });
          serviceData.total = Number(r.reservation.total_amount);
        }

        const preferredAmount = getPreferredAmount(r, serviceData.total);

        return {
          ...r,
          users: r.user_id ? usersMap.get(r.user_id) : undefined,
          calculatedAmount: preferredAmount,
          serviceData,
          allReservationIds: [r.reservation_id],
          allServiceTypes: reType ? [reType] : []
        };
      }));

      // quote title 일괄 조회
      const quoteIdsNext = Array.from(new Set(enrichedNext.map((r: any) => r.quote_id || r.reservation?.re_quote_id).filter(Boolean)));
      const { data: quoteRowsNext } = quoteIdsNext.length > 0
        ? await supabase.from('quote').select('id, title').in('id', quoteIdsNext as string[])
        : { data: [] };
      const quotesMapNext = new Map((quoteRowsNext || []).map((q: any) => [q.id, q]));
      const enrichedNextWithQuote = enrichedNext.map((r: any) => {
        const qId = r.quote_id || r.reservation?.re_quote_id;
        return { ...r, quoteTitle: qId ? ((quotesMapNext.get(qId) as any)?.title || null) : null };
      });

      setPayments(prev => prev.concat(enrichedNextWithQuote));
      if ((enrichedNextWithQuote?.length || 0) < PAGE_SIZE) setHasMore(false);
    } catch (e) {
      console.error('다음 페이지 로드 실패:', e);
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  };

  // 서비스 상세 정보 조회 함수 (견적 ID로 연결된 모든 예약 서비스 조회)
  const getServiceDetails = async (reservationIds: string[]) => {
    if (!reservationIds || reservationIds.length === 0) {
      debugLog('❌ reservationIds가 없습니다');
      return { total: 0, services: [] };
    }

    debugLog('🔍 서비스 상세 정보 조회 시작:', reservationIds.length, '개 예약');

    try {
      const services: any[] = [];
      let total = 0;

      // 1. 크루즈 객실 서비스 조회 (카테고리별 분리)
      const { data: cruiseData, error: cruiseError } = await supabase
        .from('reservation_cruise')
        .select('*')
        .in('reservation_id', reservationIds);

      if (cruiseError) {
        console.error('크루즈 예약 조회 오류:', cruiseError);
      } else if (cruiseData && cruiseData.length > 0) {
        debugLog('🚢 크루즈 데이터:', cruiseData);
        for (const cruise of cruiseData) {
          // room_total_price가 저장되어 있으면 그대로 사용 (정확한 합계)
          if (cruise.room_total_price && Number(cruise.room_total_price) > 0) {
            const roomLabel = cruise.room_price_code || '객실';
            // 카테고리별 내역을 세부 표시
            const adultCount = Number(cruise.adult_count) || Number(cruise.guest_count) || 1;
            const childCount = Number(cruise.child_count) || 0;
            const childExtraBedCount = Number(cruise.child_extra_bed_count) || 0;
            const infantCount = Number(cruise.infant_count) || 0;
            const extraBedCount = Number(cruise.extra_bed_count) || 0;
            const singleCount = Number(cruise.single_count) || 0;

            // rate_card에서 단가 조회하여 카테고리별 표시
            if (cruise.room_price_code) {
              const { data: roomPrice } = await supabase
                .from('cruise_rate_card')
                .select('price_adult, price_child, price_child_extra_bed, price_infant, price_extra_bed, price_single, room_type, cruise_name')
                .eq('id', cruise.room_price_code)
                .maybeSingle();

              const roomTypeName = roomPrice?.room_type || roomLabel;
              if (roomPrice) {
                if (adultCount > 0 && Number(roomPrice.price_adult) > 0) {
                  const amt = Number(roomPrice.price_adult) * adultCount;
                  services.push({ type: `크루즈 ${roomTypeName} (성인)`, unitPrice: Number(roomPrice.price_adult), quantity: adultCount, quantityUnit: '명', amount: amt });
                  total += amt;
                }
                if (childCount > 0 && Number(roomPrice.price_child) > 0) {
                  const amt = Number(roomPrice.price_child) * childCount;
                  services.push({ type: `크루즈 ${roomTypeName} (아동)`, unitPrice: Number(roomPrice.price_child), quantity: childCount, quantityUnit: '명', amount: amt });
                  total += amt;
                }
                if (childExtraBedCount > 0 && Number(roomPrice.price_child_extra_bed) > 0) {
                  const amt = Number(roomPrice.price_child_extra_bed) * childExtraBedCount;
                  services.push({ type: `크루즈 ${roomTypeName} (아동 엑스트라베드)`, unitPrice: Number(roomPrice.price_child_extra_bed), quantity: childExtraBedCount, quantityUnit: '명', amount: amt });
                  total += amt;
                }
                if (infantCount > 0 && Number(roomPrice.price_infant) > 0) {
                  const amt = Number(roomPrice.price_infant) * infantCount;
                  services.push({ type: `크루즈 ${roomTypeName} (유아)`, unitPrice: Number(roomPrice.price_infant), quantity: infantCount, quantityUnit: '명', amount: amt });
                  total += amt;
                }
                if (extraBedCount > 0 && Number(roomPrice.price_extra_bed) > 0) {
                  const amt = Number(roomPrice.price_extra_bed) * extraBedCount;
                  services.push({ type: `크루즈 ${roomTypeName} (엑스트라베드)`, unitPrice: Number(roomPrice.price_extra_bed), quantity: extraBedCount, quantityUnit: '명', amount: amt });
                  total += amt;
                }
                if (singleCount > 0 && Number(roomPrice.price_single) > 0) {
                  const amt = Number(roomPrice.price_single) * singleCount;
                  services.push({ type: `크루즈 ${roomTypeName} (싱글)`, unitPrice: Number(roomPrice.price_single), quantity: singleCount, quantityUnit: '명', amount: amt });
                  total += amt;
                }
                // 카테고리별 합계와 room_total_price 차이가 있으면 room_total_price 사용
                const catTotal = services.reduce((s, sv) => s + (sv.amount || 0), 0);
                if (catTotal === 0) {
                  services.push({ type: `크루즈 ${roomTypeName}`, unitPrice: Number(cruise.room_total_price), quantity: 1, quantityUnit: '식', amount: Number(cruise.room_total_price) });
                  total += Number(cruise.room_total_price);
                }
              } else {
                services.push({ type: `크루즈 객실`, unitPrice: Number(cruise.room_total_price), quantity: 1, quantityUnit: '식', amount: Number(cruise.room_total_price) });
                total += Number(cruise.room_total_price);
              }
            } else {
              services.push({ type: `크루즈 객실`, unitPrice: Number(cruise.room_total_price), quantity: 1, quantityUnit: '식', amount: Number(cruise.room_total_price) });
              total += Number(cruise.room_total_price);
            }
            console.log('✅ 크루즈 객실 (room_total_price):', cruise.room_total_price, '동');
          } else if (cruise.room_price_code) {
            // room_total_price 없는 경우: rate_card에서 카테고리별 계산
            const { data: roomPrice, error: roomPriceError } = await supabase
              .from('cruise_rate_card')
              .select('price_adult, price_child, price_child_extra_bed, price_infant, price_extra_bed, price_single, room_type, cruise_name')
              .eq('id', cruise.room_price_code)
              .maybeSingle();

            if (roomPriceError) {
              console.error('객실 가격 조회 오류:', roomPriceError);
            } else if (roomPrice) {
              const roomTypeName = roomPrice.room_type || cruise.room_price_code;
              const adultCount = Number(cruise.adult_count) || Number(cruise.guest_count) || 1;
              const childCount = Number(cruise.child_count) || 0;
              const childExtraBedCount = Number(cruise.child_extra_bed_count) || 0;
              const infantCount = Number(cruise.infant_count) || 0;
              const extraBedCount = Number(cruise.extra_bed_count) || 0;
              const singleCount = Number(cruise.single_count) || 0;

              if (adultCount > 0 && Number(roomPrice.price_adult) > 0) {
                const amt = Number(roomPrice.price_adult) * adultCount;
                services.push({ type: `크루즈 ${roomTypeName} (성인)`, unitPrice: Number(roomPrice.price_adult), quantity: adultCount, quantityUnit: '명', amount: amt });
                total += amt;
              }
              if (childCount > 0 && Number(roomPrice.price_child) > 0) {
                const amt = Number(roomPrice.price_child) * childCount;
                services.push({ type: `크루즈 ${roomTypeName} (아동)`, unitPrice: Number(roomPrice.price_child), quantity: childCount, quantityUnit: '명', amount: amt });
                total += amt;
              }
              if (childExtraBedCount > 0 && Number(roomPrice.price_child_extra_bed) > 0) {
                const amt = Number(roomPrice.price_child_extra_bed) * childExtraBedCount;
                services.push({ type: `크루즈 ${roomTypeName} (아동 엑스트라베드)`, unitPrice: Number(roomPrice.price_child_extra_bed), quantity: childExtraBedCount, quantityUnit: '명', amount: amt });
                total += amt;
              }
              if (infantCount > 0 && Number(roomPrice.price_infant) > 0) {
                const amt = Number(roomPrice.price_infant) * infantCount;
                services.push({ type: `크루즈 ${roomTypeName} (유아)`, unitPrice: Number(roomPrice.price_infant), quantity: infantCount, quantityUnit: '명', amount: amt });
                total += amt;
              }
              if (extraBedCount > 0 && Number(roomPrice.price_extra_bed) > 0) {
                const amt = Number(roomPrice.price_extra_bed) * extraBedCount;
                services.push({ type: `크루즈 ${roomTypeName} (엑스트라베드)`, unitPrice: Number(roomPrice.price_extra_bed), quantity: extraBedCount, quantityUnit: '명', amount: amt });
                total += amt;
              }
              if (singleCount > 0 && Number(roomPrice.price_single) > 0) {
                const amt = Number(roomPrice.price_single) * singleCount;
                services.push({ type: `크루즈 ${roomTypeName} (싱글)`, unitPrice: Number(roomPrice.price_single), quantity: singleCount, quantityUnit: '명', amount: amt });
                total += amt;
              }
              console.log('✅ 크루즈 객실 카테고리별 합계:', total, '동');
            }
          }
        }
      }

      // 2. 크루즈 차량 서비스 조회
      const { data: cruiseCarData, error: cruiseCarError } = await supabase
        .from('reservation_cruise_car')
        .select('*')
        .in('reservation_id', reservationIds);

      if (cruiseCarError) {
        console.error('크루즈 차량 예약 조회 오류:', cruiseCarError);
      } else if (cruiseCarData && cruiseCarData.length > 0) {
        console.log('🚗 크루즈 차량 데이터:', cruiseCarData);
        for (const car of cruiseCarData) {
          const priceCode = car.rentcar_price_code || car.car_price_code;
          if (priceCode) {
            const { data: carPrice, error: carPriceError } = await supabase
              .from('rentcar_price')
              .select('price, rent_code, vehicle_type')
              .eq('rent_code', priceCode)
              .maybeSingle();

            if (carPriceError) {
              console.error('차량 가격 조회 오류:', carPriceError);
            } else if (carPrice?.price) {
              const unitPrice = Number(carPrice.price);
              const quantity = resolveVehicleQuantity(car, unitPrice);
              const carAmount = unitPrice * quantity;
              services.push({
                type: '차량',
                unitPrice: unitPrice,
                quantity: quantity,
                quantityUnit: '대',
                amount: carAmount
              });
              total += carAmount;
              console.log('✅ 크루즈 차량:', carAmount, '동');
            }
          }
        }
      }

      // 3. 공항 서비스 조회
      const { data: airportData, error: airportError } = await supabase
        .from('reservation_airport')
        .select('*')
        .in('reservation_id', reservationIds);

      if (airportError) {
        console.error('공항 예약 조회 오류:', airportError);
      } else if (airportData && airportData.length > 0) {
        console.log('✈️ 공항 데이터:', airportData);
        for (const airport of airportData) {
          if (airport.airport_price_code) {
            const { data: airportPrice, error: airportPriceError } = await supabase
              .from('airport_price')
              .select('price, airport_code, route')
              .eq('airport_code', airport.airport_price_code)
              .maybeSingle();

            if (airportPriceError) {
              console.error('공항 가격 조회 오류:', airportPriceError);
            } else if (airportPrice?.price) {
              const unitPrice = Number(airportPrice.price);
              const quantity = Number(airport.ra_car_count) || 1;
              const airportAmount = unitPrice * quantity;
              services.push({
                type: '공항',
                unitPrice: unitPrice,
                quantity: quantity,
                quantityUnit: '대',
                amount: airportAmount
              });
              total += airportAmount;
              console.log('✅ 공항 서비스:', airportAmount, '동');
            }
          }
        }
      }

      // 4. 호텔 서비스 조회
      const { data: hotelData, error: hotelError } = await supabase
        .from('reservation_hotel')
        .select('*')
        .in('reservation_id', reservationIds);

      if (hotelError) {
        console.error('호텔 예약 조회 오류:', hotelError);
      } else if (hotelData && hotelData.length > 0) {
        console.log('🏨 호텔 데이터:', hotelData);
        for (const hotel of hotelData) {
          if (hotel.hotel_price_code) {
            const { data: hotelPrice, error: hotelPriceError } = await supabase
              .from('hotel_price')
              .select('base_price, hotel_price_code, hotel_name')
              .eq('hotel_price_code', hotel.hotel_price_code)
              .maybeSingle();

            if (hotelPriceError) {
              console.error('호텔 가격 조회 오류:', hotelPriceError);
            } else if (hotelPrice?.base_price) {
              const unitPrice = Number(hotelPrice.base_price);
              const nights = Number(hotel.schedule?.match(/\d+/)?.[0]) || 1; // schedule에서 숫자 추출
              const rooms = Number(hotel.room_count) || 1;
              const quantity = nights;
              const hotelAmount = unitPrice * nights * rooms;
              services.push({
                type: `호텔 (${hotelPrice.hotel_name || hotel.hotel_price_code})`,
                unitPrice: unitPrice,
                quantity: quantity,
                quantityUnit: `박 ${rooms}실`,
                amount: hotelAmount
              });
              total += hotelAmount;
              console.log('✅ 호텔 서비스:', hotelAmount, '동');
            }
          } else if (hotel.total_price && Number(hotel.total_price) > 0) {
            // 가격 코드가 없고 total_price가 있는 경우
            const hotelAmount = Number(hotel.total_price);
            const quantity = Number(hotel.room_count) || 1;
            services.push({
              type: `호텔 (코드없음)`,
              unitPrice: hotelAmount, // total_price를 단가로 사용
              quantity: quantity,
              quantityUnit: '실',
              amount: hotelAmount
            });
            total += hotelAmount;
            console.log('✅ 호텔 서비스 (총액):', hotelAmount, '동');
          }
        }
      }

      // 5. 렌터카 서비스 조회 (rentcar_price 테이블 사용)
      const { data: rentcarData, error: rentcarError } = await supabase
        .from('reservation_rentcar')
        .select('*')
        .in('reservation_id', reservationIds);

      if (rentcarError) {
        console.error('렌터카 예약 조회 오류:', rentcarError);
      } else if (rentcarData && rentcarData.length > 0) {
        console.log('🚗 렌터카 데이터:', rentcarData);
        for (const rentcar of rentcarData) {
          if (rentcar.rentcar_price_code) {
            const { data: rentPrice, error: rentPriceError } = await supabase
              .from('rentcar_price')
              .select('price, rent_code, way_type')
              .eq('rent_code', rentcar.rentcar_price_code)
              .maybeSingle();

            if (rentPriceError) {
              console.error('렌터카 가격 조회 오류:', rentPriceError);
            } else if (rentPrice?.price) {
              const unitPrice = Number(rentPrice.price);
              const carCount = Number(rentcar.rentcar_count) || 1;
              const quantity = carCount;
              const rentcarAmount = unitPrice * quantity;
              services.push({
                type: `렌터카 (${rentPrice.way_type || rentcar.rentcar_price_code})`,
                unitPrice: unitPrice,
                quantity: quantity,
                quantityUnit: '대',
                amount: rentcarAmount
              });
              total += rentcarAmount;
              console.log('✅ 렌터카 서비스:', rentcarAmount, '동');
            }
          } else if (rentcar.total_price && Number(rentcar.total_price) > 0) {
            // 가격 코드가 없고 total_price가 있는 경우
            const rentcarAmount = Number(rentcar.total_price);
            const quantity = Number(rentcar.rentcar_count) || 1;
            services.push({
              type: `렌터카 (코드없음)`,
              unitPrice: rentcarAmount, // total_price를 단가로 사용
              quantity: quantity,
              quantityUnit: '대',
              amount: rentcarAmount
            });
            total += rentcarAmount;
            console.log('✅ 렌터카 서비스 (총액):', rentcarAmount, '동');
          }
        }
      }

      // 6. 투어 서비스 조회
      const { data: tourData, error: tourError } = await supabase
        .from('reservation_tour')
        .select('*')
        .in('reservation_id', reservationIds);

      if (tourError) {
        console.error('투어 예약 조회 오류:', tourError);
      } else if (tourData && tourData.length > 0) {
        console.log('🗺️ 투어 데이터:', tourData);
        for (const tour of tourData) {
          if (tour.tour_price_code) {
            const { data: tourPrice, error: tourPriceError } = await supabase
              .from('tour_pricing')
              .select('price_per_person, pricing_id, tour:tour_id(tour_name, tour_code)')
              .eq('pricing_id', tour.tour_price_code)
              .maybeSingle();

            if (tourPriceError) {
              console.error('투어 가격 조회 오류:', tourPriceError);
            } else if (tourPrice?.price_per_person) {
              const unitPrice = Number(tourPrice.price_per_person);
              const quantity = Number(tour.tour_capacity) || 1;
              const tourAmount = unitPrice * quantity;
              services.push({
                type: `투어 (${tourPrice.tour?.tour_name || tour.tour_price_code})`,
                unitPrice: unitPrice,
                quantity: quantity,
                quantityUnit: '명',
                amount: tourAmount
              });
              total += tourAmount;
              console.log('✅ 투어 서비스:', tourAmount, '동');
            }
          } else if (tour.total_price && Number(tour.total_price) > 0) {
            // 가격 코드가 없고 total_price가 있는 경우
            const tourAmount = Number(tour.total_price);
            const quantity = Number(tour.tour_capacity) || 1;
            services.push({
              type: `투어 (코드없음)`,
              unitPrice: tourAmount, // total_price를 단가로 사용
              quantity: quantity,
              quantityUnit: '명',
              amount: tourAmount
            });
            total += tourAmount;
            console.log('✅ 투어 서비스 (총액):', tourAmount, '동');
          }
        }
      }

      // 7. 차량 서비스 조회 (reservation_car_sht)
      const { data: vehicleData, error: vehicleError } = await supabase
        .from('reservation_car_sht')
        .select('*')
        .in('reservation_id', reservationIds);

      if (vehicleError) {
        console.error('차량 예약 조회 오류:', vehicleError);
      } else if (vehicleData && vehicleData.length > 0) {
        console.log('🚗 차량 데이터:', vehicleData);
        const dedupedShtMap = new Map<string, any>();
        for (const vehicle of vehicleData) {
          // 2WAY 저장 시 Drop-off 0원 행은 중복 과금/표시에서 제외
          if (vehicle.sht_category === 'Drop-off' && Number(vehicle.car_total_price || 0) <= 0) {
            continue;
          }

          const dedupeKey = [
            vehicle.reservation_id,
            vehicle.car_price_code || '',
            vehicle.vehicle_number || '',
            vehicle.seat_number || ''
          ].join('|');

          const prev = dedupedShtMap.get(dedupeKey);
          const prevAmount = Number(prev?.car_total_price || 0);
          const currAmount = Number(vehicle.car_total_price || 0);

          // 같은 키가 여러 건이면 금액 정보가 더 명확한 행(총액 큰 행)을 유지
          if (!prev || currAmount > prevAmount) {
            dedupedShtMap.set(dedupeKey, vehicle);
          }
        }

        for (const vehicle of dedupedShtMap.values()) {
          let unitPrice = 0;
          let amount = 0;
          const quantity = Number(vehicle.car_count) || 1;

          if (vehicle.car_total_price && Number(vehicle.car_total_price) > 0) {
            amount = Number(vehicle.car_total_price);
            unitPrice = amount / quantity;
          } else if (vehicle.unit_price && Number(vehicle.unit_price) > 0) {
            unitPrice = Number(vehicle.unit_price);
            amount = unitPrice * quantity;
          } else if (vehicle.car_price_code) {
            const { data: carPrice } = await supabase
              .from('rentcar_price')
              .select('price')
              .eq('rent_code', vehicle.car_price_code)
              .maybeSingle();
            if (carPrice?.price) {
              unitPrice = Number(carPrice.price);
              amount = unitPrice * quantity;
            }
          }

          services.push({
            type: `스하차량 (${vehicle.car_price_code || '일반'})`,
            unitPrice: unitPrice,
            quantity: quantity,
            quantityUnit: '대',
            amount: amount
          });
          total += amount;
          console.log('✅ SHT 차량 서비스:', amount, '동');
        }
      }

      debugLog('📊 서비스 상세 정보 완료:', {
        reservationIds,
        서비스수: services.length,
        총금액: total,
        서비스목록: services
      });

      return { total, services };
    } catch (error) {
      console.error('❌ 서비스 상세 정보 조회 실패:', reservationIds, error);
      return { total: 0, services: [] };
    }
  };

  // 필터/검색어 변경 시 초기화 후 첫 페이지 로드
  useEffect(() => {
    setPayments([]);
    setHasMore(true);
    loadPayments();
  }, [filter, searchTerm]);

  // 예약 수정 후 결제처리 화면으로 복귀할 때 최신 데이터 재조회
  useEffect(() => {
    const handleFocus = () => {
      loadPayments();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadPayments();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [filter, searchTerm]);

  const handleSearchClick = () => {
    setSearchTerm(searchInput);
  };

  const handleReset = () => {
    setSearchInput('');
    setSearchTerm('');
    setFilter('all');
  };

  const handleManualRefresh = async () => {
    await loadPayments();
  };

  // 필터/검색 (이제 서버사이드에서 처리하므로 단순화)
  // quote_id 기반 그룹화 (useMemo 사용)
  const groupedPayments = useMemo(() => {
    const groups: any[] = [];
    const map = new Map<string, any>();

    payments.forEach((payment) => {
      const quoteId = payment.quote_id || payment.reservation?.re_quote_id || `no_quote_${payment.user_id || 'unknown'}`;
      if (!map.has(quoteId)) {
        const group = {
          quoteId: quoteId,
          quoteTitle: payment.quoteTitle || null,
          hasQuote: !!(payment.quote_id || payment.reservation?.re_quote_id),
          user: payment.users,
          payments: [],
          totalAmount: 0,
          pendingAmount: 0,
          pendingCount: 0,
          completedCount: 0,
          failedCount: 0,
        };
        map.set(quoteId, group);
        groups.push(group);
      }
      const g = map.get(quoteId);
      g.payments.push(payment);
      // 첫 번째로 quoteTitle이 있는 payment에서 title 가져오기
      if (!g.quoteTitle && payment.quoteTitle) g.quoteTitle = payment.quoteTitle;
      // user 정보가 없으면 채우기
      if (!g.user && payment.users) g.user = payment.users;

      const amt = getPreferredAmount(payment);
      g.totalAmount += amt;

      if (payment.payment_status === 'completed') {
        g.completedCount++;
      } else if (payment.payment_status === 'failed') {
        g.failedCount++;
      } else {
        g.pendingCount++;
        g.pendingAmount += amt;
      }
    });

    // 정렬: 대기 중인 결제가 있는 견적 우선, 그 다음 최신 순
    return groups.sort((a, b) => {
      if (a.pendingCount !== b.pendingCount) return b.pendingCount - a.pendingCount;
      const aDate = a.payments[0]?.created_at || '';
      const bDate = b.payments[0]?.created_at || '';
      return new Date(bDate).getTime() - new Date(aDate).getTime();
    });
  }, [payments]);

  const filteredPayments = payments;
  const filteredGroups = groupedPayments;

  // 전체 선택
  const handleSelectAll = () => {
    if (selectedPayments.size === filteredPayments.length) {
      setSelectedPayments(new Set());
    } else {
      setSelectedPayments(new Set(filteredPayments.map(p => p.id)));
    }
  };
  const handleSelectPayment = (id: string) => {
    const next = new Set(selectedPayments);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedPayments(next);
  };

  // 결제완료 처리
  const updatePaymentStatus = async (paymentId: string, status: string) => {
    await supabase
      .from('reservation_payment')
      .update({ payment_status: status })
      .eq('id', paymentId);

    // 결제 완료 시 해당 예약을 '승인(approved)' 상태로 변경 + 확인서 대기 생성
    if (status === 'completed') {
      const { data: paymentRow } = await supabase
        .from('reservation_payment')
        .select('reservation_id')
        .eq('id', paymentId)
        .maybeSingle();
      if (paymentRow?.reservation_id) {
        const rid = paymentRow.reservation_id;
        // 현재 'pending' 상태인 경우만 'approved'로 변경
        await supabase
          .from('reservation')
          .update({ re_status: 'approved' })
          .eq('re_id', rid)
          .eq('re_status', 'pending');
        // 확인서 대기 생성 (없는 경우만)
        const { data: existingCs } = await supabase
          .from('confirmation_status')
          .select('reservation_id')
          .eq('reservation_id', rid)
          .maybeSingle();
        if (!existingCs) {
          const { data: resRow } = await supabase
            .from('reservation')
            .select('re_id, re_quote_id')
            .eq('re_id', rid)
            .maybeSingle();
          await supabase.from('confirmation_status').insert({
            reservation_id: rid,
            quote_id: resRow?.re_quote_id || null,
            status: 'waiting',
          });
        }
      }
    }
    await loadPayments();
  };

  // 결제수단 변경
  const updatePaymentMethod = async (paymentId: string, method: string) => {
    const { error } = await supabase
      .from('reservation_payment')
      .update({ payment_method: method, updated_at: new Date().toISOString() })
      .eq('id', paymentId);
    if (error) {
      console.error('결제수단 변경 오류:', error);
      alert('결제수단 변경에 실패했습니다.');
      return;
    }
    // 로컬 상태 즉시 반영 (API 재호출 없이)
    setPayments(prev => prev.map(p => p.id === paymentId ? { ...p, payment_method: method } : p));
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      alert('링크가 클립보드에 복사되었습니다.');
    } catch {
      alert('클립보드 복사에 실패했습니다.');
    }
  };

  // 그룹 선택 금액 계산 (선택된 항목 또는 미결제 합계)
  const getGroupEffectiveAmount = (group: any) => {
    const selectedInGroup = group.payments.filter((p: any) => selectedPayments.has(p.id));
    if (selectedInGroup.length > 0) {
      return selectedInGroup.reduce((sum: number, p: any) => sum + getPreferredAmount(p), 0);
    }
    return group.pendingAmount;
  };

  // 통합 결제창 링크 생성 (선택된 또는 미결제 항목 합산)
  const createGroupPaymentLink = async (group: any): Promise<string | null> => {
    const selectedInGroup = group.payments.filter((p: any) => selectedPayments.has(p.id));
    const targetPayments = selectedInGroup.length > 0
      ? selectedInGroup
      : group.payments.filter((p: any) => p.payment_status === 'pending');
    if (targetPayments.length === 0) {
      alert('결제 대기 중인 항목이 없습니다.');
      return null;
    }

    const totalAmount = targetPayments.reduce((sum: number, p: any) => sum + getPreferredAmount(p), 0);
    setCreatingGroupLinkId(group.quoteId);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('로그인이 필요합니다.');

      const res = await fetch('/api/payments/onepay/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          paymentIds: targetPayments.map((p: any) => p.id),
          amount: totalAmount
        })
      });
      const json = await res.json();
      if (!res.ok || !json?.url) {
        const required = Array.isArray(json?.required) ? `\n필수 환경변수: ${json.required.join(', ')}` : '';
        const code = json?.code ? `\n오류코드: ${json.code}` : '';
        alert(`${json?.error || '결제 링크 생성에 실패했습니다.'}${code}${required}`);
        return null;
      }
      return json.url as string;
    } catch (e) {
      console.error('통합 결제 링크 생성 실패:', e);
      alert('결제 링크 생성 중 오류가 발생했습니다.');
      return null;
    } finally {
      setCreatingGroupLinkId(null);
    }
  };

  // 일괄 결제완료 처리
  const handleBulkComplete = async () => {
    if (selectedPayments.size === 0) {
      alert('선택된 결제가 없습니다.');
      return;
    }

    const selectedCount = selectedPayments.size;
    const confirmed = confirm(`선택된 ${selectedCount}건의 결제를 모두 완료 처리하시겠습니까?`);

    if (!confirmed) return;

    try {
      setBulkCompleting(true);
      const selectedIds = Array.from(selectedPayments);

      // 사전 조회: 예약 ID 매핑 확보 (배치)
      let beforeRows: any[] = [];
      for (const batch of chunkArray(selectedIds, 100)) {
        const { data: rows, error: preErr } = await supabase
          .from('reservation_payment')
          .select('id, reservation_id, payment_status')
          .in('id', batch);
        if (preErr) throw preErr;
        beforeRows = beforeRows.concat(rows || []);
      }

      // 일괄 업데이트 시도 + 영향 행 수 확인 (배치)
      let updatedRowsAll: any[] = [];
      let lastError: any = null;
      for (const batch of chunkArray(selectedIds, 100)) {
        const { data: updatedRows, error } = await supabase
          .from('reservation_payment')
          .update({ payment_status: 'completed', updated_at: new Date().toISOString() })
          .in('id', batch)
          .select('id, reservation_id, payment_status');
        if (error) {
          lastError = error;
        }
        updatedRowsAll = updatedRowsAll.concat(updatedRows || []);
      }

      let succeededIds = new Set<string>((updatedRowsAll || []).map((r: any) => String(r.id)));

      // 영향이 없는 경우(정책/조건 문제 등), 개별 폴백 시도
      if (succeededIds.size === 0 && !lastError) {
        for (const pid of selectedIds) {
          const { data: row, error: updErr } = await supabase
            .from('reservation_payment')
            .update({ payment_status: 'completed', updated_at: new Date().toISOString() })
            .eq('id', pid)
            .select('id, reservation_id, payment_status')
            .maybeSingle();
          if (!updErr && row?.id) {
            succeededIds.add(String(row.id));
          }
        }
      }

      if (lastError) throw lastError;

      const successCount = succeededIds.size;
      if (successCount === 0) {
        throw new Error('업데이트된 행이 없습니다. 권한 정책(RLS) 또는 선택 항목을 확인하세요.');
      }

      // 결제 완료된 예약의 re_status를 '승인(approved)'으로 변경 (대기 상태인 경우만)
      const successRows = (beforeRows || []).filter(r => succeededIds.has(String(r.id)));
      const reservationIds = Array.from(new Set(successRows.map((r: any) => r.reservation_id).filter(Boolean)));
      if (reservationIds.length > 0) {
        for (const batch of chunkArray(reservationIds, 100)) {
          await supabase
            .from('reservation')
            .update({ re_status: 'approved' })
            .in('re_id', batch)
            .eq('re_status', 'pending');
        }
      }

      // 완료된 예약의 확인서 상태 자동 생성(upsert)
      if (reservationIds.length > 0) {
        // 이미 존재하는 상태 조회 (배치)
        let existingSet = new Set<string>();
        for (const batch of chunkArray(reservationIds, 100)) {
          const { data: csRows } = await supabase
            .from('confirmation_status')
            .select('reservation_id')
            .in('reservation_id', batch);
          (csRows || []).forEach((r: any) => existingSet.add(r.reservation_id));
        }
        const missing = reservationIds.filter(id => !existingSet.has(id));
        if (missing.length > 0) {
          // 예약에서 quote_id 매핑 가져오기 (배치)
          const qMap = new Map<string, string | null>();
          for (const batch of chunkArray(missing, 100)) {
            const { data: rRows } = await supabase
              .from('reservation')
              .select('re_id, re_quote_id')
              .in('re_id', batch);
            (rRows || []).forEach((r: any) => qMap.set(r.re_id, r.re_quote_id));
          }
          // 삽입도 배치로 분할
          const insertsAll = missing.map((rid: string) => ({
            reservation_id: rid,
            quote_id: qMap.get(rid) || null,
            status: 'waiting',
          }));
          for (const batch of chunkArray(insertsAll, 100)) {
            await supabase.from('confirmation_status').insert(batch);
          }
        }
      }

      alert(`${successCount}건의 결제가 완료 처리되었습니다.`);
      setSelectedPayments(new Set());
      await loadPayments();
    } catch (error) {
      console.error('일괄 결제완료 처리 실패:', error);
      alert('일괄 결제완료 처리 중 오류가 발생했습니다.');
    } finally {
      setBulkCompleting(false);
    }
  };

  // 예약확인서 페이지로 이동
  const navigateToConfirmation = (payment: any) => {
    // 예약 ID와 결제 정보를 쿼리 파라미터로 전달
    const params = new URLSearchParams({
      reservationId: payment.reservation_id || '',
      paymentId: payment.id || '',
      userId: payment.user_id || ''
    });
    router.push(`/manager/confirmation?${params.toString()}`);
  };

  // 통계 (전체 데이터 기준 사용)
  const totalAmount = globalStats.totalAmount;
  const completedAmount = globalStats.completedAmount;
  const zeroAmountCount = globalStats.zeroAmountCount;
  const totalCount = globalStats.totalCount;

  // 로딩 UI
  if (loading) {
    return (
      <ManagerLayout title="결제 관리" activeTab="payments">
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">결제 정보를 불러오는 중...</p>
        </div>
      </ManagerLayout>
    );
  }

  return (
    <ManagerLayout title="결제 관리" activeTab="payments">
      <div className="space-y-6">


        {/* 검색/필터 */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex gap-4 mb-4 flex-wrap items-center">
            <div className="flex-1 flex gap-2 min-w-[300px]">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="고객명, 이메일, 예약ID로 검색..."
                  value={searchInput}
                  onChange={e => setSearchInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearchClick()}
                  className="w-full pl-10 pr-4 py-2 border rounded focus:outline-none focus:border-green-500 text-sm"
                />
              </div>
              <button
                onClick={handleSearchClick}
                className="px-4 py-2 bg-gray-800 text-white rounded text-sm hover:bg-gray-900 transition-colors font-bold"
              >
                조회
              </button>
            </div>
            <div className="flex gap-2 items-center">
              {[
                { value: 'all', label: '전체' },
                { value: 'zero', label: '금액미입력' },
                { value: 'pending', label: '결제대기' },
                { value: 'completed', label: '결제완료' },
                { value: 'failed', label: '실패' },
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setFilter(opt.value)}
                  className={`px-3 py-2 rounded text-sm border transition-colors font-medium ${filter === opt.value
                    ? 'bg-green-600 text-white border-green-600'
                    : 'bg-gray-100 text-gray-700 border-gray-200 hover:bg-green-50'
                    }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="flex items-center">
              <button
                onClick={generatePaymentRecords}
                disabled={generating}
                className={`ml-2 px-4 py-2 text-white rounded text-sm transition-colors ${generating
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-blue-500 hover:bg-blue-600'
                  }`}
                title="예약을 기반으로 결제 레코드를 생성합니다"
              >
                {generating ? (
                  <div className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    결제 자료 생성 중...
                  </div>
                ) : (
                  '결제 자료 가져오기'
                )}
              </button>
            </div>
          </div>
          {/* 전체 선택 및 일괄 처리 */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <button
                onClick={handleSelectAll}
                className="flex items-center gap-2 px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded transition-colors"
              >
                {selectedPayments.size === filteredPayments.length && filteredPayments.length > 0 ? (
                  <CheckCircle className="w-4 h-4 text-blue-600" />
                ) : (
                  <div className="w-4 h-4 border-2 border-gray-400 rounded"></div>
                )}
                전체 선택 ({selectedPayments.size}/{filteredPayments.length})
              </button>
              <button
                onClick={handleReset}
                className="flex items-center gap-1 px-3 py-1 text-xs bg-orange-50 text-orange-600 hover:bg-orange-100 rounded transition-colors border border-orange-200 font-medium"
              >
                <RotateCcw className="w-3 h-3" />
                검색 초기화
              </button>
              <button
                onClick={handleManualRefresh}
                className="flex items-center gap-1 px-3 py-1 text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 rounded transition-colors border border-blue-200 font-medium"
              >
                <RotateCcw className="w-3 h-3" />
                새로고침
              </button>
            </div>

            {selectedPayments.size > 0 && (
              <button
                onClick={handleBulkComplete}
                disabled={bulkCompleting}
                className={`flex items-center gap-2 px-4 py-2 text-white rounded-lg transition-colors text-sm ${bulkCompleting ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'}`}
              >
                <CheckCircle className="w-4 h-4" />
                {bulkCompleting ? '처리 중...' : `일괄결제완료 (${selectedPayments.size}건)`}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 결제 목록 */}
      <div className="bg-white rounded-lg shadow-sm">
        <div className="p-6 border-b">
          <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
            <CreditCard className="w-6 h-6 text-green-500" />
            결제 목록 ({filteredPayments.length}건)
          </h3>
          {filteredGroups.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              결제 내역이 없습니다.
            </div>
          ) : (
            <div className="flex flex-col gap-6 p-6">
              {filteredGroups.map((group) => (
                <div
                  key={group.quoteId}
                  className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow"
                >
                  {/* 견적 그룹 헤더 */}
                  <div className="bg-gray-50 border-b p-4 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-bold text-xs">
                        {group.hasQuote ? '견적' : 'N/A'}
                      </div>
                      <div>
                        <div className="font-bold text-gray-900 text-lg">
                          {group.user?.name ? `고객: ${group.user.name}` : '고객 정보 없음'}
                        </div>
                        <div className="text-xs text-gray-500 flex flex-wrap gap-2">
                          <span>{group.quoteTitle || (group.hasQuote ? `견적 #${String(group.quoteId).slice(0, 8).toUpperCase()}` : '견적 없음')}</span>
                          <span>ID: {group.hasQuote ? String(group.quoteId).slice(0, 8).toUpperCase() : '-'}</span>
                          {group.user?.email && <span className="text-gray-400">{group.user.email}</span>}
                          <span>· 총 {group.payments.length}건의 결제 내역</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-6">
                      <div className="flex gap-3 text-sm">
                        {group.pendingCount > 0 && (
                          <div className="flex items-center gap-1.5 px-3 py-1 bg-yellow-50 text-yellow-700 rounded-full border border-yellow-100 font-medium">
                            <Clock className="w-3.5 h-3.5" />
                            대기 {group.pendingCount}
                          </div>
                        )}
                        {group.completedCount > 0 && (
                          <div className="flex items-center gap-1.5 px-3 py-1 bg-green-50 text-green-700 rounded-full border border-green-100 font-medium">
                            <CheckCircle className="w-3.5 h-3.5" />
                            완료 {group.completedCount}
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-gray-500 font-medium mb-0.5">
                          {group.payments.some((p: any) => selectedPayments.has(p.id)) ? '선택 결제 금액' : '미결제 합계'}
                        </div>
                        <div className="text-xl font-black text-indigo-600">
                          {getGroupEffectiveAmount(group).toLocaleString()} <span className="text-sm font-normal">동</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            const allGroupIds = group.payments.map((p: any) => p.id);
                            const currentSelectedInGroup = allGroupIds.filter((id: string) => selectedPayments.has(id));

                            const next = new Set(selectedPayments);
                            if (currentSelectedInGroup.length === allGroupIds.length) {
                              allGroupIds.forEach((id: string) => next.delete(id));
                            } else {
                              allGroupIds.forEach((id: string) => next.add(id));
                            }
                            setSelectedPayments(next);
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${group.payments.every((p: any) => selectedPayments.has(p.id))
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                            }`}
                        >
                          {group.payments.every((p: any) => selectedPayments.has(p.id)) ? '전체 선택 해제' : '견적 전체 선택'}
                        </button>
                        {group.pendingCount > 0 && (
                          <div className="flex gap-1">
                            <button
                              disabled={!!creatingGroupLinkId}
                              onClick={async () => {
                                const url = await createGroupPaymentLink(group);
                                if (url) window.open(url, '_blank');
                              }}
                              className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-bold hover:bg-green-700 disabled:bg-gray-300 shadow-sm transition-all"
                            >
                              {creatingGroupLinkId === group.quoteId ? (
                                <span className="flex items-center gap-1">
                                  <span className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></span>
                                  생성 중...
                                </span>
                              ) : (
                                '통합 결제창'
                              )}
                            </button>
                            <button
                              disabled={!!creatingGroupLinkId}
                              onClick={async () => {
                                const url = await createGroupPaymentLink(group);
                                if (url) await copyToClipboard(url);
                              }}
                              className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 disabled:bg-gray-300 shadow-sm transition-all"
                            >
                              {creatingGroupLinkId === group.quoteId ? '...' : '링크 복사'}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 결제 리스트 */}
                  <div className="divide-y overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-gray-50/50 text-gray-600 text-xs uppercase font-semibold">
                        <tr>
                          <th className="px-6 py-3 w-10">선택</th>
                          <th className="px-6 py-3">예약정보</th>
                          <th className="px-6 py-3">서비스 내역</th>
                          <th className="px-6 py-3">금액</th>
                          <th className="px-6 py-3">결제수단</th>
                          <th className="px-6 py-3">상태</th>
                          <th className="px-6 py-3 text-right">관리</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {group.payments.map((payment: any) => (
                          <tr
                            key={payment.id}
                            className={`hover:bg-gray-50/80 transition-colors ${selectedPayments.has(payment.id) ? 'bg-blue-50/30' : ''}`}
                          >
                            <td className="px-6 py-4">
                              <button
                                onClick={() => handleSelectPayment(payment.id)}
                                className="p-1 hover:bg-gray-200 rounded-md transition-colors"
                              >
                                {selectedPayments.has(payment.id) ? (
                                  <CheckCircle className="w-5 h-5 text-blue-600 fill-current" />
                                ) : (
                                  <div className="w-5 h-5 border-2 border-gray-300 rounded-md"></div>
                                )}
                              </button>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex flex-col">
                                <span className="font-bold text-gray-900">
                                  {payment.reservation_id ? String(payment.reservation_id).slice(0, 8).toUpperCase() : '-'}
                                </span>
                                <span className="text-xs text-gray-500">
                                  {new Date(payment.created_at).toLocaleDateString()}
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              {/* 서비스 내역: 서비스명 + 상세 계산 */}
                              {payment.serviceData?.services?.length > 0 ? (
                                <div className="space-y-1">
                                  {payment.serviceData.services.map((s: any, idx: number) => (
                                    <div key={idx} className="text-xs">
                                      <span className="inline-block px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded font-medium border border-blue-100 mr-1">
                                        {s.type}
                                      </span>
                                      <span className="text-gray-500">
                                        {s.unitPrice?.toLocaleString()} × {s.quantity}{formatQuantityUnit(s.quantityUnit)} = <span className="font-medium text-gray-700">{s.amount?.toLocaleString()}₫</span>
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="text-xs text-gray-400">
                                  {(() => {
                                    const reTypeLabels: Record<string, string> = {
                                      cruise: '크루즈', airport: '공항', hotel: '호텔',
                                      tour: '투어', rentcar: '렌터카', sht: '스하차량', car: '차량'
                                    };
                                    const reType = payment.reservation?.re_type || '';
                                    return reType ? (
                                      <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded font-medium border border-gray-200">
                                        {reTypeLabels[reType] || reType}
                                      </span>
                                    ) : '-';
                                  })()}
                                </div>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              <div className="font-bold text-gray-900">
                                {getPreferredAmount(payment).toLocaleString()} ₫
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <select
                                value={payment.payment_method || 'BANK'}
                                onChange={(e) => updatePaymentMethod(payment.id, e.target.value)}
                                className="text-xs px-2 py-1 rounded border border-gray-200 bg-white text-gray-700 cursor-pointer hover:border-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-400 transition-colors"
                              >
                                <option value="BANK">계좌이체</option>
                                <option value="CARD">신용카드</option>
                                <option value="CASH">현금</option>
                              </select>
                            </td>
                            <td className="px-6 py-4">
                              <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold leading-none ${payment.payment_status === 'completed' ? 'bg-green-100 text-green-700' :
                                payment.payment_status === 'failed' ? 'bg-red-100 text-red-700' :
                                  'bg-yellow-100 text-yellow-700'
                                }`}>
                                <div className={`w-1.5 h-1.5 rounded-full ${payment.payment_status === 'completed' ? 'bg-green-500' :
                                  payment.payment_status === 'failed' ? 'bg-red-500' :
                                    'bg-yellow-500'
                                  }`} />
                                {getPaymentStatusText(payment.payment_status)}
                              </div>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className="flex justify-end gap-2">
                                <button
                                  onClick={() => openDetailModal(payment)}
                                  className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                  title="상세보기"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>

                                {payment.payment_status === 'completed' && (
                                  <button
                                    onClick={() => navigateToConfirmation(payment)}
                                    className="px-3 py-1 bg-purple-600 text-white rounded text-xs font-bold hover:bg-purple-700 shadow-sm transition-all"
                                  >
                                    확인서
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* 고객별 요약/합계 footer (필요 시) */}
                  <div className="bg-gray-50/30 p-4 border-t flex justify-end gap-4">
                    <span className="text-gray-500 text-sm">해당 고객 미결제 합계:</span>
                    <span className="text-sm font-bold text-red-600">
                      {group.pendingAmount.toLocaleString()} ₫
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
          {/* 더 불러오기 */}
          {hasMore && (
            <div className="mt-6 flex justify-center">
              <button
                onClick={loadMorePayments}
                disabled={loadingMore}
                className={`px-4 py-2 rounded text-sm text-white ${loadingMore ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'}`}
              >
                {loadingMore ? '불러오는 중...' : '더 불러오기'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 결제 상세 모달 */}
      {selectedReservation && (
        <PaymentDetailModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          payment={selectedReservation}
        />
      )}
    </ManagerLayout>
  );
}
