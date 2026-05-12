// @ts-nocheck
'use client';

import React, { useState, useEffect, useRef } from 'react';
import ManagerLayout from '@/components/ManagerLayout';
import supabase from '@/lib/supabase';
import ServiceCardBody from '@/components/ServiceCardBody';
import {
  closeCentralReservationDetailModal,
  openCentralGoogleSheetsDetailModal,
  openCentralPackageDetailModal,
  openCentralReservationDetailModal,
  setCentralReservationDetailModalLoading,
  updateCentralGoogleSheetsDetailModal,
  updateCentralReservationDetailModal,
} from '@/contexts/reservationDetailModalEvents';
import {
  Calendar,
  Clock,
  Ship,
  Plane,
  Building,
  MapPin,
  Car,
  FileText,
  Filter,
  ChevronLeft,
  ChevronRight,
  Search,
  LayoutGrid,
  Table as TableIcon
} from 'lucide-react';

interface SHCReservation {
  orderId: string;
  customerName: string; // SH_M에서 조회한 한글이름
  customerEnglishName?: string; // SH_M에서 조회한 영문이름
  carType: string;
  carCode: string;
  carCount: number;
  passengerCount: number;
  pickupDatetime: string;
  pickupLocation: string;
  dropoffLocation: string;
  unitPrice: number;
  totalPrice: number;
  email: string;
}

interface SHRReservation {
  orderId: string;
  customerName: string; // SH_M에서 조회한 한글이름
  customerEnglishName?: string; // SH_M에서 조회한 영문이름
  cruise: string;
  category: string;
  roomType: string;
  roomCount: number;
  roomCode: string;
  days: number;
  discount: string;
  checkin: string;
  time: string;
  adult: number;
  child: number;
  toddler: number;
  boardingInfo: string;
  totalGuests: number;
  boardingHelp: string;
  discountCode: string;
  note: string;
  requestNote?: string; // 요청사항/특이사항/메모
}

// 스하차량 (SH_CC)
interface SHCCReservation {
  orderId: string;
  customerName: string;
  customerEnglishName?: string;
  cruiseInfo?: string; // SH_R에서 조회한 크루즈명 (C열)
  boardingDate: string; // C열: 승차일
  serviceType: string; // D열: 구분
  category: string; // E열: 분류
  vehicleNumber: string; // F열: 차량번호
  seatNumber: string; // G열: 좌석번호
  name: string; // H열: 이름
  pickupLocation?: string; // L열: 승차위치
  dropoffLocation?: string; // M열: 하차위치
  email: string;
}

// 공항 (SH_P)
interface SHPReservation {
  orderId: string;
  customerName: string;
  customerEnglishName?: string;
  tripType: string; // C열: 구분
  category: string; // D열: 분류
  route: string; // E열: 경로
  carCode: string;
  carType: string;
  date: string; // H열: 일자
  time: string;
  airportName: string;
  flightNumber: string;
  passengerCount: number;
  carrierCount: number;
  placeName: string;
  stopover: string;
  carCount: number;
  unitPrice: number;
  totalPrice: number;
  email: string;
}

// 호텔 (SH_H)
interface SHHReservation {
  orderId: string;
  customerName: string;
  customerEnglishName?: string;
  hotelCode: string;
  hotelName: string;
  roomName: string;
  roomType: string;
  roomCount: number;
  days: number;
  checkinDate: string; // I열: 체크인날짜
  checkoutDate: string;
  breakfastService: string;
  adult: number;
  child: number;
  toddler: number;
  extraBed: number;
  totalGuests: number;
  note: string;
  unitPrice: number;
  totalPrice: number;
  email: string;
}

// 투어 (SH_T)
interface SHTReservation {
  orderId: string;
  customerName: string;
  customerEnglishName?: string;
  tourCode: string;
  tourName: string;
  tourType: string;
  detailCategory: string;
  quantity: number;
  startDate: string; // H열: 시작일자
  endDate: string;
  participants: number;
  dispatch: string;
  pickupLocation: string;
  dropoffLocation: string;
  memo: string;
  unitPrice: number;
  totalPrice: number;
  email: string;
  tourNote: string;
}

// 렌트카 (SH_RC)
interface SHRCReservation {
  orderId: string;
  customerName: string;
  customerEnglishName?: string;
  carCode: string;
  tripType: string;
  category: string;
  route: string;
  carType: string;
  carCount: number;
  pickupDate: string; // I열: 승차일자
  pickupTime: string;
  pickupLocation: string;
  carrierCount: number;
  destination: string;
  stopover: string;
  passengerCount: number;
  usagePeriod: string;
  memo: string;
  unitPrice: number;
  totalPrice: number;
  email: string;
}

export default function ManagerSchedulePage() {
  const [schedules, setSchedules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // 오늘 날짜로 초기화
  const today = new Date();
  const [selectedDate, setSelectedDate] = useState(today);
  const datePickerRef = useRef<HTMLInputElement | null>(null);
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('day');
  // 주/월간 보기에서 일별 그룹화 추가 (기본: 일별)
  const [groupMode, setGroupMode] = useState<'type' | 'day'>('day');
  // 카드/표 보기 모드 (기본: 카드)
  const [displayMode, setDisplayMode] = useState<'card' | 'grid'>('card');
  const [typeFilter, setTypeFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState(''); // 입력 중인 검색어
  const [activeSearchQuery, setActiveSearchQuery] = useState(''); // 실제 검색에 사용되는 검색어
  const [selectedSchedule, setSelectedSchedule] = useState<any>(null);

  // Google Sheets 데이터
  const [googleSheetsData, setGoogleSheetsData] = useState<any[]>([]);
  const [googleSheetsLoading, setGoogleSheetsLoading] = useState(true);
  const [googleSheetsError, setGoogleSheetsError] = useState<string | null>(null);

  // 현재 사용자 정보 (삭제 권한 확인용)
  const [userEmail, setUserEmail] = useState<string | null>(null);

  // 현재 사용자 정보 로드
  useEffect(() => {
    const loadCurrentUser = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.email) {
          setUserEmail(user.email);
        }
      } catch (error) {
        console.error('사용자 정보 로드 실패:', error);
      }
    };
    loadCurrentUser();
  }, []);

  useEffect(() => {
    loadSchedules();
  }, [selectedDate, viewMode, activeSearchQuery]);

  useEffect(() => {
    loadGoogleSheetsData();
  }, [typeFilter]);

  // 검색 실행
  const handleSearch = () => {
    setActiveSearchQuery(searchQuery);
  };

  // 검색 초기화
  const handleClearSearch = () => {
    setSearchQuery('');
    setActiveSearchQuery('');
  };

  // Enter 키 처리
  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  // 주문 ID로 모든 서비스 조회 (Google Sheets - SH_M)
  const loadAllOrderServices = async (orderId: string) => {
    if (!orderId) {
      updateCentralGoogleSheetsDetailModal({ allOrderServices: [], orderUserInfo: null, loading: false });
      return null;
    }

    updateCentralGoogleSheetsDetailModal({ loading: true });
    try {
      // sh_m 사용자 정보 조회
      const { data: userData } = await supabase
        .from('sh_m')
        .select('*')
        .eq('order_id', orderId)
        .single();

      if (userData) {
        const orderUserInfo = {
          orderId: userData.order_id,
          email: userData.email,
          koreanName: userData.korean_name,
          englishName: userData.english_name,
          phone: userData.phone,
          url: userData.url,
          reservationDate: userData.reservation_date,
          paymentMethod: userData.payment_method,
          plan: userData.plan,
          memberLevel: userData.member_grade,  // ✅ member_grade가 정확한 컬럼명
          kakaoId: userData.kakao_id,
          discountCode: userData.discount_code,
          requestNote: userData.request_note,
          specialNote: userData.special_note,
          memo: userData.memo
        };
        updateCentralGoogleSheetsDetailModal({ orderUserInfo });
        console.log('👤 sh_m 사용자 정보:', userData);
      }

      // 모든 서비스 타입 조회 (병렬)
      const [shRData, shCData, shCCData, shPData, shHData, shTData, shRCData] = await Promise.all([
        supabase.from('sh_r').select('*').eq('order_id', orderId),  // 크루즈
        supabase.from('sh_c').select('*').eq('order_id', orderId),  // 차량
        supabase.from('sh_cc').select('*').eq('order_id', orderId), // 스하차량
        supabase.from('sh_p').select('*').eq('order_id', orderId),  // 공항
        supabase.from('sh_h').select('*').eq('order_id', orderId),  // 호텔
        supabase.from('sh_t').select('*').eq('order_id', orderId),  // 투어
        supabase.from('sh_rc').select('*').eq('order_id', orderId)  // 렌트카
      ]);

      // 데이터 매핑 및 합치기 (모든 필드 포함)
      const allData = [
        ...(shRData.data || []).map((r: any) => ({
          ...r,
          serviceType: 'cruise',
          orderId: r.order_id,
          customerName: userData?.korean_name || '',
          customerEnglishName: userData?.english_name || '',
          cruise: r.cruise_name,
          checkin: r.checkin_date,
          time: r.checkin_time,
          roomType: r.room_type,
          category: r.division,
          adult: r.adult || 0,
          child: r.child || 0,
          toddler: r.toddler || 0,
          roomCount: r.room_count || 0
        })),
        ...(shCData.data || []).map((c: any) => ({
          ...c,
          serviceType: 'car',
          orderId: c.order_id,
          customerName: userData?.korean_name || '',
          customerEnglishName: userData?.english_name || '',
          carType: c.vehicle_type,
          pickupDatetime: c.boarding_datetime,
          pickupLocation: c.boarding_location,  // ✅ boarding_location
          dropoffLocation: c.dropoff_location,
          passengerCount: c.passenger_count || 0,
          carCount: c.vehicle_count || 0  // ✅ vehicle_count
        })),
        ...(shCCData.data || []).map((cc: any) => ({
          ...cc,
          serviceType: 'vehicle',
          orderId: cc.order_id,
          customerName: userData?.korean_name || '',
          customerEnglishName: userData?.english_name || '',
          boardingDate: cc.boarding_date,
          vehicleNumber: cc.vehicle_number,
          seatNumber: cc.seat_number,
          category: cc.category,
          division: cc.division
        })),
        ...(shPData.data || []).map((p: any) => ({
          ...p,
          serviceType: 'airport',
          orderId: p.order_id,
          customerName: userData?.korean_name || '',
          customerEnglishName: userData?.english_name || '',
          tripType: p.division,
          category: p.category,
          route: p.route,
          date: p.date,
          time: p.time,
          airportName: p.airport_name,
          flightNumber: p.flight_number,
          passengerCount: p.passenger_count || 0,
          carCount: p.vehicle_count || 0,  // ✅ vehicle_count
          carrierCount: p.carrier_count || 0,
          placeName: p.accommodation_info || p.location_name || ''  // ✅ accommodation_info 우선, 없으면 location_name
        })),
        ...(shHData.data || []).map((h: any) => ({
          ...h,
          serviceType: 'hotel',
          orderId: h.order_id,
          customerName: userData?.korean_name || '',
          customerEnglishName: userData?.english_name || '',
          hotelName: h.hotel_name,
          roomName: h.room_name,
          roomType: h.room_type,
          checkinDate: h.checkin_date,
          checkoutDate: h.checkout_date,
          days: h.schedule,  // ✅ schedule 필드
          adult: h.adult || 0,
          child: h.child || 0,
          toddler: h.toddler || 0,
          roomCount: h.room_count || 0,
          breakfastService: h.breakfast_service
        })),
        ...(shTData.data || []).map((t: any) => ({
          ...t,
          serviceType: 'tour',
          orderId: t.order_id,
          customerName: userData?.korean_name || '',
          customerEnglishName: userData?.english_name || '',
          tourName: t.tour_name,
          tourType: t.tour_type,
          startDate: t.start_date,
          endDate: t.end_date,
          participants: t.tour_count || 0,  // ✅ tour_count
          pickupLocation: t.pickup_location,
          dropoffLocation: t.dropoff_location,
          quantity: t.quantity || 0
        })),
        ...(shRCData.data || []).map((rc: any) => ({
          ...rc,
          serviceType: 'rentcar',
          orderId: rc.order_id,
          customerName: userData?.korean_name || '',
          customerEnglishName: userData?.english_name || '',
          carType: rc.vehicle_type,
          route: rc.route,
          tripType: rc.division,
          pickupDate: rc.boarding_date,  // ✅ boarding_date
          pickupTime: rc.boarding_time,  // ✅ boarding_time
          pickupLocation: rc.boarding_location,  // ✅ boarding_location
          destination: rc.destination,
          usagePeriod: rc.usage_period,
          passengerCount: rc.passenger_count || 0,
          carCount: rc.vehicle_count || 0  // ✅ vehicle_count
        }))
      ];

      console.log('📋 로드된 주문 서비스:', allData.length, '개', allData);
      updateCentralGoogleSheetsDetailModal({ allOrderServices: allData });
      return {
        email: userData?.email || ''
      };
    } catch (error) {
      console.error('주문 서비스 조회 실패:', error);
      updateCentralGoogleSheetsDetailModal({ allOrderServices: [], orderUserInfo: null });
      return null;
    } finally {
      updateCentralGoogleSheetsDetailModal({ loading: false });
    }
  };

  // Google Sheets 데이터 삭제 (권한 확인 포함)
  const handleDeleteGoogleSheetsReservation = async (reservation: any) => {
    const emailLower = (userEmail || '').toLowerCase();
    const canDelete = emailLower === 'kys@hyojacho.es.kr' || emailLower === 'kjh@hyojacho.es.kr';

    if (!canDelete) {
      alert('삭제 권한이 없습니다.');
      return;
    }

    if (!confirm(`${reservation.customerName || '예약'} 데이터를 삭제하시겠습니까?`)) {
      return;
    }

    try {
      const orderId = reservation.orderId;
      if (!orderId) {
        alert('주문 ID를 찾을 수 없습니다.');
        return;
      }

      // 서비스 타입에 따라 해당 테이블에서 삭제
      const serviceType = getServiceType(reservation);
      let tableName = 'sh_r'; // 기본값

      if (serviceType === 'cruise') tableName = 'sh_r';
      else if (serviceType === 'car') tableName = 'sh_c';
      else if (serviceType === 'vehicle') tableName = 'sh_cc';
      else if (serviceType === 'airport') tableName = 'sh_p';
      else if (serviceType === 'hotel') tableName = 'sh_h';
      else if (serviceType === 'tour') tableName = 'sh_t';
      else if (serviceType === 'rentcar') tableName = 'sh_rc';

      // 데이터 삭제
      const { error } = await supabase
        .from(tableName)
        .delete()
        .eq('order_id', orderId);

      if (error) {
        console.error('삭제 실패:', error);
        alert('삭제 중 오류가 발생했습니다: ' + error.message);
        return;
      }

      // 성공 메시지
      alert('삭제되었습니다.');

      // 데이터 새로고침
      setGoogleSheetsData(prev =>
        prev.filter(item => item.orderId !== orderId)
      );
    } catch (error: any) {
      console.error('삭제 처리 중 오류:', error);
      alert('삭제 중 오류가 발생했습니다.');
    }
  };

  // 이메일 기준 DB 예약(추가 예약 포함) 조회
  const loadRelatedDbReservationsByEmail = async (email: string) => {
    const normalizedEmail = email?.trim();
    updateCentralGoogleSheetsDetailModal({ relatedEmail: normalizedEmail || '' });

    if (!normalizedEmail) {
      updateCentralGoogleSheetsDetailModal({ relatedDbServices: [], relatedDbLoading: false });
      return;
    }

    updateCentralGoogleSheetsDetailModal({ relatedDbLoading: true });
    try {
      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select('id, name, email, phone_number')
        .ilike('email', normalizedEmail);

      if (usersError || !usersData || usersData.length === 0) {
        updateCentralGoogleSheetsDetailModal({ relatedDbServices: [] });
        return;
      }

      const userIds = usersData.map((u: any) => u.id).filter(Boolean);
      const userMap = new Map(usersData.map((u: any) => [u.id, u]));

      const { data: reservations, error: reservationError } = await supabase
        .from('reservation')
        .select('re_id, re_user_id, re_quote_id, re_type, re_status, re_created_at')
        .in('re_user_id', userIds)
        .neq('re_type', 'car_sht')
        .order('re_created_at', { ascending: false });

      if (reservationError || !reservations || reservations.length === 0) {
        updateCentralGoogleSheetsDetailModal({ relatedDbServices: [] });
        return;
      }

      const reservationMap = new Map((reservations || []).map((r: any) => [r.re_id, r]));
      const reservationIds = reservations.map((r: any) => r.re_id).filter(Boolean);

      const [cruiseRes, cruiseCarRes, carShtRes, airportRes, hotelRes, tourRes, ticketRes, rentcarRes] = await Promise.all([
        supabase.from('reservation_cruise').select('*').in('reservation_id', reservationIds),
        supabase.from('reservation_cruise_car').select('*').in('reservation_id', reservationIds),
        supabase.from('reservation_car_sht').select('*').in('reservation_id', reservationIds),
        supabase.from('reservation_airport').select('*').in('reservation_id', reservationIds),
        supabase.from('reservation_hotel').select('*').in('reservation_id', reservationIds),
        supabase.from('reservation_tour').select('*').in('reservation_id', reservationIds),
        supabase.from('reservation_ticket').select('*').in('reservation_id', reservationIds),
        supabase.from('reservation_rentcar').select('*').in('reservation_id', reservationIds)
      ]);

      const airportRows = airportRes.data || [];
      const airportCodes = airportRows.map((r: any) => r.airport_price_code).filter(Boolean);
      const cruiseCarRows = cruiseCarRes.data || [];
      const cruiseCarCodes = Array.from(new Set(cruiseCarRows.map((r: any) => r.car_price_code).filter(Boolean)));
      const tourRows = tourRes.data || [];
      const tourCodes = tourRows.map((r: any) => r.tour_price_code).filter(Boolean);
      const { data: airportPriceRows } = airportCodes.length > 0
        ? await supabase
          .from('airport_price')
          .select('airport_code, service_type, route, vehicle_type')
          .in('airport_code', airportCodes)
        : { data: [] };
      const { data: tourPriceRows } = tourCodes.length > 0
        ? await supabase
          .from('tour_pricing')
          .select('pricing_id, tour_id')
          .in('pricing_id', tourCodes)
        : { data: [] };
      const { data: cruiseRateRows } = cruiseCarCodes.length > 0
        ? await supabase
          .from('cruise_rate_card')
          .select('id, vehicle_type')
          .in('id', cruiseCarCodes)
        : { data: [] };

      const normalizeAirportWay = (value: string) => {
        const way = (value || '').toLowerCase();
        if (way === 'pickup' || way === '픽업') return '픽업';
        if (way === 'sending' || way === 'dropoff' || way === '샌딩') return '샌딩';
        return '';
      };

      const airportPriceMap = new Map(
        (airportPriceRows || []).map((p: any) => [`${p.airport_code}-${p.service_type || ''}`, p])
      );
      const tourIds = Array.from(new Set((tourPriceRows || []).map((p: any) => p.tour_id).filter(Boolean)));
      const { data: tourRowsById } = tourIds.length > 0
        ? await supabase
          .from('tour')
          .select('tour_id, tour_name, tour_code')
          .in('tour_id', tourIds)
        : { data: [] };
      const tourByIdMap = new Map((tourRowsById || []).map((t: any) => [t.tour_id, t]));
      const tourPriceMap = new Map(
        (tourPriceRows || []).map((p: any) => [p.pricing_id, tourByIdMap.get(p.tour_id) || null])
      );
      const cruiseRateMap = new Map((cruiseRateRows || []).map((r: any) => [r.id, r]));

      const mergeWithBase = (rows: any[], serviceType: string) =>
        (rows || []).map((row: any) => {
          const reservation = reservationMap.get(row.reservation_id);
          const user = reservation ? userMap.get(reservation.re_user_id) : null;
          return {
            ...row,
            source: 'db',
            serviceType,
            reservation,
            user
          };
        });

      const mergedServices = [
        ...mergeWithBase(cruiseRes.data || [], 'cruise'),
        ...mergeWithBase(cruiseCarRows, 'cruise_car').map((row: any) => {
          const rateInfo = cruiseRateMap.get(row.car_price_code);
          return {
            ...row,
            vehicle_type: row.vehicle_type || rateInfo?.vehicle_type || null,
          };
        }),
        ...mergeWithBase(carShtRes.data || [], 'sht'),
        ...mergeWithBase(airportRows, 'airport').map((row: any) => {
          const wayTypeKo = normalizeAirportWay(row.ra_way_type || row.way_type || row.service_type || '');
          const priceInfo = airportPriceMap.get(`${row.airport_price_code || ''}-${wayTypeKo}`)
            || (airportPriceRows || []).find((p: any) => p.airport_code === row.airport_price_code)
            || null;

          return {
            ...row,
            way_type: row.ra_way_type || row.way_type || priceInfo?.service_type || null,
            service_type: row.service_type || priceInfo?.service_type || null,
            route: row.route || priceInfo?.route || null,
            vehicle_type: row.vehicle_type || priceInfo?.vehicle_type || null,
          };
        }),
        ...mergeWithBase(hotelRes.data || [], 'hotel'),
        ...mergeWithBase(tourRows, 'tour').map((row: any) => {
          const priceInfo = tourPriceMap.get(row.tour_price_code);
          return {
            ...row,
            tour_name: row.tour_name || priceInfo?.tour_name || null,
          };
        }),
        ...mergeWithBase(ticketRes.data || [], 'ticket'),
        ...mergeWithBase(rentcarRes.data || [], 'rentcar')
      ].sort((a: any, b: any) => {
        const aTime = new Date(a?.reservation?.re_created_at || 0).getTime();
        const bTime = new Date(b?.reservation?.re_created_at || 0).getTime();
        return bTime - aTime;
      });

      updateCentralGoogleSheetsDetailModal({ relatedDbServices: mergedServices });
    } catch (error) {
      console.error('이메일 기준 DB 예약 조회 실패:', error);
      updateCentralGoogleSheetsDetailModal({ relatedDbServices: [] });
    } finally {
      updateCentralGoogleSheetsDetailModal({ relatedDbLoading: false });
    }
  };

  // 사용자 ID로 모든 DB 예약 조회 (schedule/page.tsx와 동일)
  const loadAllUserReservations = async (userId: string) => {
    if (!userId) return;

    try {
      openCentralReservationDetailModal({ userInfo: null, allUserServices: [], loading: true });

      // 1. 사용자 정보 조회
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (userError) throw userError;
  updateCentralReservationDetailModal({ userInfo: userData });

      // 2. 사용자의 모든 예약 ID 조회
      const { data: reservations, error: resError } = await supabase
        .from('reservation')
        .select('re_id, re_type, re_status, re_created_at, total_amount, price_breakdown, re_adult_count, re_child_count, re_infant_count, package_id')
        .eq('re_user_id', userId)
        .neq('re_type', 'car_sht')
        .order('re_created_at', { ascending: false });

      if (resError) throw resError;

      // 패키지 예약이 있으면 PackageDetailModalContainer로 라우팅
      if (reservations.some((r: any) => r.re_type === 'package')) {
        closeCentralReservationDetailModal();
        openCentralPackageDetailModal(userId);
        return;
      }

      const reservationIds = reservations.map(r => r.re_id);
      const packageIds = reservations.filter((r: any) => r.re_type === 'package').map((r: any) => r.re_id);
      const packageIdSet = new Set(packageIds);

      if (reservationIds.length === 0) {
        updateCentralReservationDetailModal({ allUserServices: [], loading: false });
        return;
      }

      // 3. 각 서비스 테이블에서 상세 정보 조회
      const [cruiseRes, airportRes, hotelRes, rentcarRes, tourRes, ticketRes, cruiseCarRes, carShtRes, packageMainRes, packageDetailRes] = await Promise.all([
        supabase.from('reservation_cruise').select('*').in('reservation_id', reservationIds),
        supabase.from('reservation_airport').select('*').in('reservation_id', reservationIds),
        supabase.from('reservation_hotel').select('*').in('reservation_id', reservationIds),
        supabase.from('reservation_rentcar').select('*').in('reservation_id', reservationIds),
        supabase.from('reservation_tour').select('*').in('reservation_id', reservationIds),
        supabase.from('reservation_ticket').select('*').in('reservation_id', reservationIds),
        supabase.from('reservation_cruise_car').select('*').in('reservation_id', reservationIds),
        supabase.from('reservation_car_sht').select('*').in('reservation_id', reservationIds),
        packageIds.length > 0
          ? supabase.from('reservation').select('*, package_master:package_id(id, package_code, name, description)').in('re_id', packageIds)
          : Promise.resolve({ data: [] }),
        packageIds.length > 0
          ? supabase.from('reservation_package').select('*').in('reservation_id', packageIds)
          : Promise.resolve({ data: [] })
      ]);

      // 4. 추가 정보 조회 (bulk 페이지와 동일한 수준)
      const cruiseCodes = (cruiseRes.data || []).map(r => r.room_price_code).filter(Boolean);
      const tourCodes = (tourRes.data || []).map(r => r.tour_price_code).filter(Boolean);
      const hotelCodes = (hotelRes.data || []).map(r => r.hotel_price_code).filter(Boolean);
      const airportCodes = (airportRes.data || []).map(r => r.airport_price_code).filter(Boolean);
      const cruiseCarCodes = (cruiseCarRes.data || []).map((c: any) => c.rentcar_price_code || c.car_price_code).filter(Boolean);
      const rentCodes = Array.from(
        new Set(
          (rentcarRes.data || []).flatMap((r: any) => {
            const rawCode = String(r?.rentcar_price_code || '').trim();
            if (!rawCode) return [];
            return Array.from(new Set([rawCode, rawCode.toUpperCase(), rawCode.toLowerCase()]));
          })
        )
      );

      // cruise_rate_card: id + room_type + legacy room_price (bulk 페이지와 동일)
      const [roomPricesById, roomPricesByType, roomPricesLegacy, tourPrices, hotelPrices, rentPrices, airportPrices, carPrices] = await Promise.all([
        cruiseCodes.length > 0 ? supabase.from('cruise_rate_card').select('id, cruise_name, room_type, price_adult, price_child, price_infant, price_extra_bed, price_single, price_child_extra_bed').in('id', cruiseCodes) : Promise.resolve({ data: [] }),
        cruiseCodes.length > 0 ? supabase.from('cruise_rate_card').select('id, cruise_name, room_type, price_adult, price_child, price_infant, price_extra_bed, price_single, price_child_extra_bed').in('room_type', cruiseCodes) : Promise.resolve({ data: [] }),
        // legacy room_price 테이블은 더 이상 사용하지 않음 (404 방지)
        Promise.resolve({ data: [] }),
        tourCodes.length > 0 ? supabase.from('tour_pricing').select('pricing_id, price_per_person, tour_id').in('pricing_id', tourCodes) : Promise.resolve({ data: [] }),
        hotelCodes.length > 0 ? supabase.from('hotel_price').select('hotel_price_code, base_price, hotel_name, room_name').in('hotel_price_code', hotelCodes) : Promise.resolve({ data: [] }),
        rentCodes.length > 0 ? supabase.from('rentcar_price').select('rent_code, vehicle_type, way_type, route, price, category').in('rent_code', rentCodes) : Promise.resolve({ data: [] }),
        airportCodes.length > 0 ? supabase.from('airport_price').select('airport_code, service_type, route, vehicle_type, price').in('airport_code', airportCodes) : Promise.resolve({ data: [] }),
        cruiseCarCodes.length > 0 ? supabase.from('rentcar_price').select('rent_code, vehicle_type, way_type, route, price, category').in('rent_code', cruiseCarCodes) : Promise.resolve({ data: [] })
      ]);

      // roomPriceMap: id + room_type + legacy 병합 (bulk 페이지와 동일)
      const roomPriceMap = new Map((roomPricesById.data || []).map((r: any) => [r.id, r]));
      (roomPricesByType.data || []).forEach((r: any) => {
        if (r?.room_type && !roomPriceMap.has(r.room_type)) roomPriceMap.set(r.room_type, r);
      });
      const getLegacyCategoryKey = (category?: string) => {
        const c = String(category || '').trim();
        if (c.includes('아동') && c.includes('엑스트라')) return 'price_child_extra_bed';
        if (c.includes('유아')) return 'price_infant';
        if (c.includes('아동')) return 'price_child';
        if (c.includes('엑스트라')) return 'price_extra_bed';
        if (c.includes('싱글')) return 'price_single';
        return 'price_adult';
      };
      const legacyRoomByCode = new Map<string, any>();
      (roomPricesLegacy.data || []).forEach((row: any) => {
        const code = row?.room_code;
        if (!code) return;
        const current = legacyRoomByCode.get(code) || { id: code, cruise_name: row?.cruise, room_type: row?.room_type, price_adult: 0, price_child: 0, price_infant: 0, price_extra_bed: 0, price_single: 0, price_child_extra_bed: 0 };
        current[getLegacyCategoryKey(row?.room_category)] = Number(row?.price || 0);
        if (!current.cruise_name && row?.cruise) current.cruise_name = row.cruise;
        if (!current.room_type && row?.room_type) current.room_type = row.room_type;
        legacyRoomByCode.set(code, current);
      });
      legacyRoomByCode.forEach((legacy, code) => {
        const existing = roomPriceMap.get(code);
        if (!existing) { roomPriceMap.set(code, legacy); return; }
        if (!existing.cruise_name && legacy.cruise_name) existing.cruise_name = legacy.cruise_name;
        if (!existing.room_type && legacy.room_type) existing.room_type = legacy.room_type;
        ['price_adult', 'price_child', 'price_infant', 'price_extra_bed', 'price_single', 'price_child_extra_bed'].forEach(k => {
          if (!Number(existing[k]) && Number(legacy[k])) existing[k] = legacy[k];
        });
        roomPriceMap.set(code, existing);
      });

      // tourPriceMap
      const tourIds = Array.from(new Set((tourPrices.data || []).map((r: any) => r.tour_id).filter(Boolean)));
      const { data: toursById } = tourIds.length > 0 ? await supabase.from('tour').select('tour_id, tour_name, tour_code').in('tour_id', tourIds) : { data: [] };
      const tourByIdMap = new Map((toursById || []).map((t: any) => [t.tour_id, t]));
      const tourPriceMap = new Map((tourPrices.data || []).map((r: any) => [r.pricing_id, { ...r, tour: tourByIdMap.get(r.tour_id) || null }]));

      const hotelPriceMap = new Map((hotelPrices.data || []).map((r: any) => [r.hotel_price_code, r]));
      const airportPriceMap = new Map((airportPrices.data || []).map((r: any) => [r.airport_code, r]));
      const carPriceMap = new Map((carPrices.data || []).map((r: any) => [r.rent_code, r]));

      const normalizeRentCode = (value: any) => String(value || '').trim();
      const compactRentCode = (value: string) => value.replace(/\s+/g, '');

      let rentPriceRows = [...(rentPrices.data || [])];
      if (rentCodes.length > 0) {
        const requested = Array.from(new Set((rentcarRes.data || []).map((r: any) => normalizeRentCode(r?.rentcar_price_code).toUpperCase()).filter(Boolean)));
        const present = new Set(rentPriceRows.map((r: any) => normalizeRentCode(r?.rent_code).toUpperCase()).filter(Boolean));
        if (requested.some(c => !present.has(c))) {
          const { data: allRentRows } = await supabase.from('rentcar_price').select('rent_code, vehicle_type, way_type, route, price, category');
          if (allRentRows?.length) {
            const byCode = new Map<string, any>();
            for (const row of [...rentPriceRows, ...allRentRows]) {
              const key = normalizeRentCode(row?.rent_code).toUpperCase();
              if (key) byCode.set(key, row);
            }
            rentPriceRows = Array.from(byCode.values());
          }
        }
      }
      const rentPriceMap = new Map<string, any>();
      for (const row of rentPriceRows) {
        const rawCode = String(row?.rent_code || '').trim();
        const compactCode = compactRentCode(rawCode);
        [rawCode, rawCode.toUpperCase(), rawCode.toLowerCase(), compactCode, compactCode.toUpperCase(), compactCode.toLowerCase()]
          .filter(Boolean)
          .forEach(k => { if (!rentPriceMap.has(k)) rentPriceMap.set(k, row); });
      }

      // 5. 데이터 매핑 (bulk 페이지 flattenedServices와 동일한 필드 구조)
      const reservationMap = new Map(reservations.map(r => [r.re_id, r]));
      const packageDetailMap = new Map((packageDetailRes.data || []).map((r: any) => [r.reservation_id, r]));

      const allServices = [
        ...(packageMainRes.data || []).map((r: any) => ({
          ...r,
          serviceType: 'package',
          status: reservationMap.get(r.re_id)?.re_status,
          package_name: r.package_master?.name || '',
          package_code: r.package_master?.package_code || '',
          package_description: r.package_master?.description || '',
          ...(packageDetailMap.get(r.re_id) || {}),
        })),
        ...(cruiseRes.data || []).map(r => {
          const info = roomPriceMap.get(r.room_price_code);
          const adultCount = r.adult_count ?? r.guest_count ?? 0;
          const childCount = r.child_count || 0;
          const infantCount = r.infant_count || 0;
          const extraBedCount = r.extra_bed_count || 0;
          const singleCount = r.single_count || 0;
          const childExtraBedCount = r.child_extra_bed_count || 0;
          return {
            ...r,
            serviceType: 'cruise',
            isPackageService: packageIdSet.has(r.reservation_id),
            status: reservationMap.get(r.reservation_id)?.re_status,
            cruise: info?.cruise_name || '크루즈',
            cruiseName: info?.cruise_name || '크루즈',
            roomType: info?.room_type || r.room_price_code,
            checkin: r.checkin,
            adult: adultCount,
            child: childCount,
            infant: infantCount,
            extraBedCount,
            singleCount,
            childExtraBedCount,
            priceAdult: info?.price_adult || 0,
            priceChild: info?.price_child || 0,
            priceInfant: info?.price_infant || 0,
            priceExtraBed: info?.price_extra_bed || 0,
            priceSingle: info?.price_single || 0,
            priceChildExtraBed: info?.price_child_extra_bed || 0,
            note: r.request_note,
            unitPrice: r.unit_price,
            totalPrice: r.room_total_price,
            paymentMethod: '정보 없음',
          };
        }),
        ...(cruiseCarRes.data || []).flatMap((r: any) => {
          const code = r.rentcar_price_code || r.car_price_code;
          const info = carPriceMap.get(code);
          const base = {
            ...r,
            serviceType: 'vehicle',
            isPackageService: packageIdSet.has(r.reservation_id),
            status: reservationMap.get(r.reservation_id)?.re_status,
            carCategory: info?.way_type || info?.category || r.way_type || '',
            carType: info?.vehicle_type || r.vehicle_type || '',
            route: info?.route || r.route || '',
            passengerCount: r.passenger_count,
            note: r.request_note,
            unitPrice: info?.price || r.unit_price || 0,
            totalPrice: r.car_total_price,
          };

          const rows: any[] = [];

          // 픽업 카드: 픽업일자 + 승차 위치만 표시
          if (r.pickup_datetime) {
            rows.push({
              ...base,
              segmentType: 'pickup',
              segmentRibbon: '픽업',
              pickupDatetime: r.pickup_datetime,
              pickupLocation: r.pickup_location,
              dropoffLocation: null,
            });
          }

          // 리턴 카드: 리턴일자 + 하차 위치만 표시
          if (r.return_datetime) {
            rows.push({
              ...base,
              segmentType: 'return',
              segmentRibbon: '리턴',
              pickupDatetime: r.return_datetime,
              pickupLocation: null,
              dropoffLocation: r.dropoff_location,
            });
          }

          // 리턴일자가 없으면 기존처럼 픽업 1건만 유지
          if (rows.length === 0) {
            rows.push({
              ...base,
              segmentType: 'pickup',
              segmentRibbon: '픽업',
              pickupDatetime: r.pickup_datetime,
              pickupLocation: r.pickup_location,
              dropoffLocation: null,
            });
          }

          return rows;
        }),
        ...(airportRes.data || []).map(r => {
          const info = airportPriceMap.get(r.airport_price_code);
          const rawWayType = String(r.way_type || r.ra_way_type || info?.service_type || '').toLowerCase();
          const isPickup = rawWayType.includes('pickup') || rawWayType.includes('픽업');
          const airportLocation = r.ra_airport_location || '';
          const accommodationInfo = r.accommodation_info || r.ra_stopover_location || '';
          return {
            ...r,
            serviceType: 'airport',
            isPackageService: packageIdSet.has(r.reservation_id),
            status: reservationMap.get(r.reservation_id)?.re_status,
            category: info?.service_type || '',
            route: info?.route || '',
            carType: info?.vehicle_type || '',
            airportName: airportLocation,
            destination: r.ra_stopover_location,
            pickupLocation: isPickup ? airportLocation : accommodationInfo,
            dropoffLocation: isPickup ? accommodationInfo : airportLocation,
            flightNumber: r.ra_flight_number,
            passengerCount: r.ra_passenger_count,
            carCount: r.ra_car_count,
            ra_datetime: r.ra_datetime,
            way_type: r.way_type,
            note: r.request_note,
            unitPrice: info?.price || r.unit_price || 0,
            totalPrice: r.total_price,
          };
        }),
        ...(hotelRes.data || []).map(r => {
          const info = hotelPriceMap.get(r.hotel_price_code);
          return {
            ...r,
            serviceType: 'hotel',
            isPackageService: packageIdSet.has(r.reservation_id),
            status: reservationMap.get(r.reservation_id)?.re_status,
            hotelName: info?.hotel_name || r.hotel_category,
            roomType: info?.room_name || r.hotel_price_code,
            checkinDate: r.checkin_date,
            nights: r.room_count,
            guestCount: r.guest_count,
            note: r.request_note,
            unitPrice: info?.base_price || r.unit_price,
            totalPrice: r.total_price,
          };
        }),
        ...(tourRes.data || []).map(r => {
          const info = tourPriceMap.get(r.tour_price_code);
          return {
            ...r,
            serviceType: 'tour',
            isPackageService: packageIdSet.has(r.reservation_id),
            status: reservationMap.get(r.reservation_id)?.re_status,
            tourName: info?.tour?.tour_name || '-',
            tourDate: r.usage_date,
            tourCapacity: r.tour_capacity,
            pickupLocation: r.pickup_location,
            dropoffLocation: r.dropoff_location,
            carCount: r.car_count,
            passengerCount: r.passenger_count,
            adult: r.adult_count || 0,
            child: r.child_count || 0,
            infant: r.infant_count || 0,
            note: r.request_note,
            unitPrice: info?.price_per_person || r.unit_price,
            totalPrice: r.total_price,
          };
        }),
        ...(ticketRes.data || []).map(r => ({
          ...r,
          serviceType: 'ticket',
          isPackageService: packageIdSet.has(r.reservation_id),
          status: reservationMap.get(r.reservation_id)?.re_status,
          ticketType: r.ticket_type,
          ticketName: r.ticket_name || r.program_selection,
          usageDate: r.usage_date,
          ticketQuantity: r.ticket_quantity,
          pickupLocation: r.pickup_location,
          dropoffLocation: r.dropoff_location,
          note: r.request_note,
          unitPrice: r.unit_price,
          totalPrice: r.total_price,
        })),
        ...(rentcarRes.data || []).map(r => {
          const rentCode = String(r.rentcar_price_code || '').trim();
          const compactCode = compactRentCode(rentCode);
          const info =
            rentPriceMap.get(rentCode) || rentPriceMap.get(rentCode.toUpperCase()) || rentPriceMap.get(rentCode.toLowerCase()) ||
            rentPriceMap.get(compactCode) || rentPriceMap.get(compactCode.toUpperCase()) || rentPriceMap.get(compactCode.toLowerCase());
          return {
            ...r,
            serviceType: 'rentcar',
            isPackageService: packageIdSet.has(r.reservation_id),
            status: reservationMap.get(r.reservation_id)?.re_status,
            carType: info?.vehicle_type || r.vehicle_type || '-',
            route: info?.route || r.route || '',
            category: info?.way_type || r.way_type || '',
            way_type: info?.way_type || r.way_type || '',
            pickupDatetime: r.pickup_datetime,
            pickupLocation: r.pickup_location,
            destination: r.destination,
            viaLocation: r.via_location,
            viaWaiting: r.via_waiting,
            returnDatetime: r.return_datetime,
            returnPickupLocation: r.return_pickup_location,
            returnDestination: r.return_destination,
            returnViaLocation: r.return_via_location,
            returnViaWaiting: r.return_via_waiting,
            note: r.request_note,
            unitPrice: info?.price || r.unit_price,
            totalPrice: r.total_price,
            carCount: r.car_count || 1,
            passengerCount: r.passenger_count,
            luggageCount: r.luggage_count,
            dispatchCode: r.dispatch_code,
          };
        }),
        ...(carShtRes.data || []).map(r => ({
          ...r,
          serviceType: 'sht',
          isPackageService: packageIdSet.has(r.reservation_id),
          status: reservationMap.get(r.reservation_id)?.re_status,
          category: r.sht_category,
          usageDate: r.pickup_datetime,
          vehicleNumber: r.vehicle_number,
          seatNumber: r.seat_number,
          driverName: r.driver_name,
          pickupLocation: r.pickup_location,
          dropoffLocation: r.dropoff_location,
          note: r.request_note,
          unitPrice: r.unit_price,
          totalPrice: r.car_total_price,
        })),
      ];

      updateCentralReservationDetailModal({ userInfo: userData, allUserServices: allServices });

    } catch (error) {
      console.error('사용자 예약 정보 조회 실패:', error);
      updateCentralReservationDetailModal({ allUserServices: [] });
    } finally {
      setCentralReservationDetailModalLoading(false);
    }
  };

  // Google Sheets 상세보기 모달 열기
  const handleOpenGoogleSheetsDetail = async (reservation: any) => {
    // 서비스 타입 감지
    let serviceType = 'unknown';
    if (isCruiseData(reservation)) serviceType = 'cruise';
    else if (isVehicleData(reservation)) serviceType = 'vehicle';
    else if (isAirportData(reservation)) serviceType = 'airport';
    else if (isHotelData(reservation)) serviceType = 'hotel';
    else if (isTourData(reservation)) serviceType = 'tour';
    else if (isRentcarData(reservation)) serviceType = 'rentcar';
    else if (isCarData(reservation)) serviceType = 'car';

    // 선택된 예약에 serviceType 추가
    openCentralGoogleSheetsDetailModal({
      selectedReservation: { ...reservation, serviceType },
      allOrderServices: [],
      loading: false,
      orderUserInfo: null,
      relatedEmail: '',
      relatedDbServices: [],
      relatedDbLoading: false,
    });

    // 해당 주문 ID의 모든 서비스 조회
    let resolvedEmail = (reservation.email || '').trim();

    if (reservation.orderId) {
      const loadedInfo = await loadAllOrderServices(reservation.orderId);
      if (loadedInfo?.email) {
        resolvedEmail = loadedInfo.email;
      }
    }

    if (resolvedEmail) {
      await loadRelatedDbReservationsByEmail(resolvedEmail);
    }
  };

  const getRange = (base: Date, mode: 'day' | 'week' | 'month') => {
    const start = new Date(base);
    const end = new Date(base);
    if (mode === 'day') {
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    } else if (mode === 'week') {
      // 주간: 월요일 시작 기준
      const day = start.getDay();
      const diffToMonday = (day === 0 ? -6 : 1) - day; // 일요일(0) -> -6, 월(1)->0 ...
      start.setDate(start.getDate() + diffToMonday);
      start.setHours(0, 0, 0, 0);
      end.setTime(start.getTime());
      end.setDate(end.getDate() + 6);
      end.setHours(23, 59, 59, 999);
    } else {
      // 월간: 해당 월 1일 ~ 말일
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      end.setMonth(start.getMonth() + 1, 0); // 다음 달 0일 = 말일
      end.setHours(23, 59, 59, 999);
    }
    return { start, end };
  };

  const loadGoogleSheetsData = async () => {
    console.log('🚀 loadGoogleSheetsData 호출됨!');
    console.log('   typeFilter:', typeFilter);
    console.log('   현재 시각:', new Date().toLocaleTimeString());

    try {
      setGoogleSheetsLoading(true);
      setGoogleSheetsError(null);

      console.log('🔄 loadGoogleSheetsData 시작, typeFilter:', typeFilter);

      const fetchAllRows = async (tableName: string) => {
        let allData: any[] = [];
        let from = 0;
        const batchSize = 1000;

        while (true) {
          const { data, error } = await supabase
            .from(tableName)
            .select('*')
            .range(from, from + batchSize - 1);

          if (error) throw error;
          if (!data || data.length === 0) break;

          allData = allData.concat(data);
          if (data.length < batchSize) break;
          from += batchSize;
        }

        return { data: allData, error: null };
      };

      // DB에서 데이터 조회 (sh_* 테이블)
      if (typeFilter === 'all') {
        console.log('📥 모든 서비스 데이터 조회 시작...');

        const [shRData, shCData, shCCData, shPData, shHData, shTData, shRCData] = await Promise.all([
          fetchAllRows('sh_r'),   // 크루즈
          fetchAllRows('sh_c'),   // 차량
          fetchAllRows('sh_cc'),  // 스하차량
          fetchAllRows('sh_p'),   // 공항
          fetchAllRows('sh_h'),   // 호텔
          fetchAllRows('sh_t'),   // 투어
          fetchAllRows('sh_rc')   // 렌트카
        ]);

        console.log('✅ DB 조회 결과:');
        console.log('  sh_r (크루즈):', shRData.data?.length || 0, '건', shRData.error ? `❌ ${shRData.error.message}` : '');
        console.log('  sh_c (차량):', shCData.data?.length || 0, '건', shCData.error ? `❌ ${shCData.error.message}` : '');
        console.log('  sh_cc (스하차량):', shCCData.data?.length || 0, '건', shCCData.error ? `❌ ${shCCData.error.message}` : '');
        console.log('  sh_p (공항):', shPData.data?.length || 0, '건', shPData.error ? `❌ ${shPData.error.message}` : '');
        console.log('  sh_h (호텔):', shHData.data?.length || 0, '건', shHData.error ? `❌ ${shHData.error.message}` : '');
        console.log('  sh_t (투어):', shTData.data?.length || 0, '건', shTData.error ? `❌ ${shTData.error.message}` : '');
        console.log('  sh_rc (렌트카):', shRCData.data?.length || 0, '건', shRCData.error ? `❌ ${shRCData.error.message}` : '');

        // 크루즈 데이터 샘플 로깅 (날짜 형식 확인용)
        if (shRData.data && shRData.data.length > 0) {
          console.log('📅 크루즈 날짜 샘플 (최근 5건):');
          shRData.data.slice(0, 5).forEach((r: any, i: number) => {
            console.log(`  ${i + 1}. ${r.checkin_date} | ${r.cruise_name} | ${r.order_id}`);
          });
        }

        // sh_m 사용자 정보 조회 (모든 데이터)
        const usersDataResult = await fetchAllRows('sh_m');
        const usersData = usersDataResult.data;
        console.log('👥 sh_m 사용자 정보:', usersData?.length || 0, '건');
        const userMap = new Map((usersData || []).map((u: any) => [u.order_id, { korean_name: u.korean_name, english_name: u.english_name, email: u.email }]));

        // 데이터 매핑 및 합치기
        const allData = [
          ...(shRData.data || []).map((r: any) => {
            const user = userMap.get(r.order_id);
            return {
              orderId: r.order_id,
              customerName: user?.korean_name || '',
              customerEnglishName: user?.english_name || '',
              cruise: r.cruise_name,
              category: r.division,
              roomType: r.room_type,
              roomCount: parseInt(r.room_count) || 0,
              roomCode: r.room_code,
              days: parseInt(r.schedule_days) || 0,
              discount: r.room_discount,
              checkin: r.checkin_date,
              time: r.time,
              adult: parseInt(r.adult) || 0,
              child: parseInt(r.child) || 0,
              toddler: parseInt(r.toddler) || 0,
              boardingInfo: r.boarding_count,
              totalGuests: parseInt(r.guest_count) || 0,
              boardingHelp: r.boarding_help,
              discountCode: r.discount_code,
              note: r.room_note,
              requestNote: r.connecting_room,
              email: user?.email || r.email
            };
          }),
          ...(shCData.data || []).map((c: any) => {
            const user = userMap.get(c.order_id);
            return {
              orderId: c.order_id,
              customerName: user?.korean_name || '',
              customerEnglishName: user?.english_name || '',
              carType: c.vehicle_type,
              carCode: c.vehicle_code,
              carCount: parseInt(c.vehicle_count) || 0,
              passengerCount: parseInt(c.passenger_count) || 0,
              pickupDatetime: c.boarding_datetime,
              pickupLocation: c.boarding_location,
              dropoffLocation: c.dropoff_location,
              unitPrice: parseFloat(c.amount) || 0,
              totalPrice: parseFloat(c.total) || 0,
              email: user?.email || c.email
            };
          }),
          ...(shCCData.data || []).map((cc: any) => {
            const user = userMap.get(cc.order_id);
            return {
              orderId: cc.order_id,
              customerName: user?.korean_name || '',
              customerEnglishName: user?.english_name || '',
              cruiseInfo: '',
              boardingDate: cc.boarding_date,
              serviceType: cc.division,
              category: cc.category,
              vehicleNumber: cc.vehicle_number,
              seatNumber: cc.seat_number,
              name: cc.name,
              pickupLocation: '',
              dropoffLocation: '',
              email: user?.email || cc.email
            };
          }),
          ...(shPData.data || []).map((p: any) => {
            const user = userMap.get(p.order_id);
            return {
              orderId: p.order_id,
              customerName: user?.korean_name || '',
              customerEnglishName: user?.english_name || '',
              tripType: p.division,
              category: p.category,
              route: p.route,
              carCode: p.vehicle_code,
              carType: p.vehicle_type,
              date: p.date,
              time: p.time,
              airportName: p.airport_name,
              flightNumber: p.flight_number,
              passengerCount: parseInt(p.passenger_count) || 0,
              carrierCount: parseInt(p.carrier_count) || 0,
              placeName: p.accommodation_info || p.location_name || '',
              stopover: p.stopover,
              carCount: parseInt(p.vehicle_count) || 0,
              unitPrice: parseFloat(p.amount) || 0,
              totalPrice: parseFloat(p.total) || 0,
              email: user?.email || p.email
            };
          }),
          ...(shHData.data || []).map((h: any) => {
            const user = userMap.get(h.order_id);
            return {
              orderId: h.order_id,
              customerName: user?.korean_name || '',
              customerEnglishName: user?.english_name || '',
              hotelCode: h.hotel_code,
              hotelName: h.hotel_name,
              roomName: h.room_name,
              roomType: h.room_type,
              roomCount: parseInt(h.room_count) || 0,
              days: parseInt(h.schedule) || 0,
              checkinDate: h.checkin_date,
              checkoutDate: h.checkout_date,
              breakfastService: h.breakfast_service,
              adult: parseInt(h.adult) || 0,
              child: parseInt(h.child) || 0,
              toddler: parseInt(h.toddler) || 0,
              extraBed: parseInt(h.extra_bed) || 0,
              totalGuests: parseInt(h.guest_count) || 0,
              note: h.note,
              unitPrice: parseFloat(h.amount) || 0,
              totalPrice: parseFloat(h.total) || 0,
              email: user?.email || h.email
            };
          }),
          ...(shTData.data || []).map((t: any) => {
            const user = userMap.get(t.order_id);
            return {
              orderId: t.order_id,
              customerName: user?.korean_name || '',
              customerEnglishName: user?.english_name || '',
              tourCode: t.tour_code,
              tourName: t.tour_name,
              tourType: t.tour_type,
              detailCategory: t.detail_category,
              quantity: parseInt(t.quantity) || 0,
              startDate: t.start_date,
              endDate: t.end_date,
              participants: parseInt(t.tour_count) || 0,
              dispatch: t.dispatch,
              pickupLocation: t.pickup_location,
              dropoffLocation: t.dropoff_location,
              memo: t.memo,
              unitPrice: parseFloat(t.amount) || 0,
              totalPrice: parseFloat(t.total) || 0,
              email: user?.email || t.email,
              tourNote: t.tour_note
            };
          }),
          ...(shRCData.data || []).map((rc: any) => {
            const user = userMap.get(rc.order_id);
            return {
              orderId: rc.order_id,
              customerName: user?.korean_name || '',
              customerEnglishName: user?.english_name || '',
              carCode: rc.vehicle_code,
              tripType: rc.division,
              category: rc.category,
              route: rc.route,
              carType: rc.vehicle_type,
              carCount: parseInt(rc.vehicle_count) || 0,
              pickupDate: rc.boarding_date,
              pickupTime: rc.boarding_time,
              pickupLocation: rc.boarding_location,
              carrierCount: parseInt(rc.carrier_count) || 0,
              destination: rc.destination,
              stopover: rc.stopover,
              passengerCount: parseInt(rc.passenger_count) || 0,
              usagePeriod: rc.usage_period,
              memo: rc.memo,
              unitPrice: parseFloat(rc.amount) || 0,
              totalPrice: parseFloat(rc.total) || 0,
              email: user?.email || rc.email
            };
          })
        ];

        console.log('📊 전체 로드된 데이터:', allData.length, '건');
        console.log('  - 크루즈:', shRData.data?.length || 0, '건');
        console.log('  - 차량:', shCData.data?.length || 0, '건');
        console.log('  - 스하차량:', shCCData.data?.length || 0, '건');
        console.log('  - 공항:', shPData.data?.length || 0, '건');
        console.log('  - 호텔:', shHData.data?.length || 0, '건');
        console.log('  - 투어:', shTData.data?.length || 0, '건');
        console.log('  - 렌트카:', shRCData.data?.length || 0, '건');

        // 데이터 샘플 확인 (날짜 필드 중점 확인)
        const cruiseSample = allData.filter(d => d.cruise)[0];
        const carSample = allData.filter(d => d.carType && d.pickupDatetime)[0];
        const vhcSample = allData.filter(d => d.vehicleNumber)[0];
        const airportSample = allData.filter(d => d.airportName)[0];
        const hotelSample = allData.filter(d => d.hotelName)[0];
        const tourSample = allData.filter(d => d.tourName)[0];
        const rentcarSample = allData.filter(d => d.carCode && d.pickupDate)[0];

        console.log('📝 크루즈 샘플:', cruiseSample, '→ checkin:', cruiseSample?.checkin);
        console.log('📝 차량 샘플:', carSample, '→ pickupDatetime:', carSample?.pickupDatetime);
        console.log('📝 스하차량 샘플:', vhcSample, '→ boardingDate:', vhcSample?.boardingDate);
        console.log('📝 공항 샘플:', airportSample, '→ date:', airportSample?.date);
        console.log('📝 호텔 샘플:', hotelSample, '→ checkinDate:', hotelSample?.checkinDate);
        console.log('📝 투어 샘플:', tourSample, '→ startDate:', tourSample?.startDate);
        console.log('📝 렌트카 샘플:', rentcarSample, '→ pickupDate:', rentcarSample?.pickupDate);

        // 오늘 날짜(2025-11-14) 데이터 개수 확인 (다양한 날짜 형식 지원)
        const todayFormats = ['2025-11-14', '2025. 11. 14', '2025/11/14', '11/14/2025', '14/11/2025', '11-14-2025'];
        const matchesToday = (dateStr: string) => {
          if (!dateStr) return false;
          return todayFormats.some(format => dateStr.includes(format));
        };

        const todayData = {
          크루즈: allData.filter(d => d.cruise && matchesToday(d.checkin)).length,
          차량: allData.filter(d => d.carType && d.pickupDatetime && matchesToday(d.pickupDatetime)).length,
          스하차량: allData.filter(d => d.vehicleNumber && matchesToday(d.boardingDate)).length,
          공항: allData.filter(d => d.airportName && matchesToday(d.date)).length,
          호텔: allData.filter(d => d.hotelName && matchesToday(d.checkinDate)).length,
          투어: allData.filter(d => d.tourName && matchesToday(d.startDate)).length,
          렌트카: allData.filter(d => d.carCode && d.pickupDate && matchesToday(d.pickupDate)).length
        };
        console.log('📅 오늘(2025-11-14) 날짜 문자열 검색:', todayData);

        // 2025년 11월 데이터 모두 찾기 (날짜 형식 진단)
        const nov2025Cruise = allData.filter(d => d.cruise && d.checkin && (
          d.checkin.includes('2025-11') ||
          d.checkin.includes('2025. 11') ||
          d.checkin.includes('2025/11') ||
          d.checkin.includes('11/2025') ||
          d.checkin.includes('11-2025')
        ));

        console.log('� 2025년 11월 크루즈 데이터:', nov2025Cruise.length, '건');
        if (nov2025Cruise.length > 0) {
          console.log('   날짜 형식 샘플:');
          nov2025Cruise.slice(0, 10).forEach((d, idx) => {
            console.log(`   [${idx + 1}] orderId: ${d.orderId}, checkin: "${d.checkin}"`);
          });
        }

        // 실제 오늘 데이터 샘플 출력 (크루즈 확인)
        const todayCruise = allData.filter(d => d.cruise && matchesToday(d.checkin));
        if (todayCruise.length > 0) {
          console.log('🚢 오늘 크루즈 데이터:', todayCruise.length, '건');
          todayCruise.forEach((d, idx) => {
            console.log(`   [${idx + 1}] ${d.orderId} - checkin: "${d.checkin}"`);
          });
        } else {
          console.log('❌ 오늘 크루즈 데이터 문자열 검색 실패');
        }

        console.log('📦 매핑된 전체 데이터:', allData.length, '건');
        console.log('   - 크루즈:', allData.filter(d => d.cruise).length, '건');
        console.log('   - 차량:', allData.filter(d => d.carType && d.pickupDatetime).length, '건');
        console.log('   - 스하차량:', allData.filter(d => d.vehicleNumber).length, '건');
        console.log('   - 공항:', allData.filter(d => d.airportName).length, '건');
        console.log('   - 호텔:', allData.filter(d => d.hotelName).length, '건');
        console.log('   - 투어:', allData.filter(d => d.tourName).length, '건');
        console.log('   - 렌트카:', allData.filter(d => d.carCode && d.pickupDate).length, '건');

        setGoogleSheetsData(allData);
      } else {
        // 개별 서비스 타입 조회
        const typeMapping: Record<string, string> = {
          'cruise': 'sh_r',
          'car': 'sh_c',
          'sht': 'sh_cc',
          'airport': 'sh_p',
          'hotel': 'sh_h',
          'tour': 'sh_t',
          'rentcar': 'sh_rc'
        };

        const tableName = typeMapping[typeFilter];
        if (!tableName) {
          setGoogleSheetsData([]);
          return;
        }
        const result = await fetchAllRows(tableName);
        const data = result.data;

        if (result.error) {
          throw new Error(`데이터 조회 실패: ${result.error.message}`);
        }

        // 타입별 데이터 매핑
        let mappedData: any[] = [];

        // sh_m에서 한글/영문 이름 조회 (모든 데이터)
        const usersDataResult = await fetchAllRows('sh_m');
        const usersData = usersDataResult.data;
        const userMap = new Map((usersData || []).map((u: any) => [u.order_id, u]));

        if (tableName === 'sh_r') {
          mappedData = (data || []).map((r: any) => {
            const user = userMap.get(r.order_id);
            return {
              orderId: r.order_id,
              customerName: user?.korean_name || '',
              customerEnglishName: user?.english_name || '',
              cruise: r.cruise_name,
              category: r.division,
              roomType: r.room_type,
              roomCount: parseInt(r.room_count) || 0,
              roomCode: r.room_code,
              days: parseInt(r.schedule_days) || 0,
              discount: r.room_discount,
              checkin: r.checkin_date,
              time: r.time,
              adult: parseInt(r.adult) || 0,
              child: parseInt(r.child) || 0,
              toddler: parseInt(r.toddler) || 0,
              boardingInfo: r.boarding_count,
              totalGuests: parseInt(r.guest_count) || 0,
              boardingHelp: r.boarding_help,
              discountCode: r.discount_code,
              note: r.room_note,
              requestNote: r.connecting_room,
              email: user?.email || r.email
            };
          });
        } else if (tableName === 'sh_c') {
          mappedData = (data || []).map((c: any) => {
            const user = userMap.get(c.order_id);
            return {
              orderId: c.order_id,
              customerName: user?.korean_name || '',
              customerEnglishName: user?.english_name || '',
              carType: c.vehicle_type,
              carCode: c.vehicle_code,
              carCount: parseInt(c.vehicle_count) || 0,
              passengerCount: parseInt(c.passenger_count) || 0,
              pickupDatetime: c.boarding_datetime,
              pickupLocation: c.boarding_location,
              dropoffLocation: c.dropoff_location,
              unitPrice: parseFloat(c.amount) || 0,
              totalPrice: parseFloat(c.total) || 0,
              email: user?.email || c.email
            };
          });
        } else if (tableName === 'sh_cc') {
          mappedData = (data || []).map((cc: any) => {
            const user = userMap.get(cc.order_id);
            return {
              orderId: cc.order_id,
              customerName: user?.korean_name || '',
              customerEnglishName: user?.english_name || '',
              cruiseInfo: '',
              boardingDate: cc.boarding_date,
              serviceType: cc.division,
              category: cc.category,
              vehicleNumber: cc.vehicle_number,
              seatNumber: cc.seat_number,
              name: cc.name,
              pickupLocation: '',
              dropoffLocation: '',
              email: user?.email || cc.email
            };
          });
        } else if (tableName === 'sh_p') {
          mappedData = (data || []).map((p: any) => {
            const user = userMap.get(p.order_id);
            return {
              orderId: p.order_id,
              customerName: user?.korean_name || '',
              customerEnglishName: user?.english_name || '',
              tripType: p.division,
              category: p.category,
              route: p.route,
              carCode: p.vehicle_code,
              carType: p.vehicle_type,
              date: p.date,
              time: p.time,
              airportName: p.airport_name,
              flightNumber: p.flight_number,
              passengerCount: parseInt(p.passenger_count) || 0,
              carrierCount: parseInt(p.carrier_count) || 0,
              placeName: p.accommodation_info || p.location_name || '',
              stopover: p.stopover,
              carCount: parseInt(p.vehicle_count) || 0,
              unitPrice: parseFloat(p.amount) || 0,
              totalPrice: parseFloat(p.total) || 0,
              email: user?.email || p.email
            };
          });
        } else if (tableName === 'sh_h') {
          mappedData = (data || []).map((h: any) => {
            const user = userMap.get(h.order_id);
            return {
              orderId: h.order_id,
              customerName: user?.korean_name || '',
              customerEnglishName: user?.english_name || '',
              hotelCode: h.hotel_code,
              hotelName: h.hotel_name,
              roomName: h.room_name,
              roomType: h.room_type,
              roomCount: parseInt(h.room_count) || 0,
              days: parseInt(h.schedule) || 0,
              checkinDate: h.checkin_date,
              checkoutDate: h.checkout_date,
              breakfastService: h.breakfast_service,
              adult: parseInt(h.adult) || 0,
              child: parseInt(h.child) || 0,
              toddler: parseInt(h.toddler) || 0,
              extraBed: parseInt(h.extra_bed) || 0,
              totalGuests: parseInt(h.guest_count) || 0,
              note: h.note,
              unitPrice: parseFloat(h.amount) || 0,
              totalPrice: parseFloat(h.total) || 0,
              email: user?.email || h.email
            };
          });
        } else if (tableName === 'sh_t') {
          mappedData = (data || []).map((t: any) => {
            const user = userMap.get(t.order_id);
            return {
              orderId: t.order_id,
              customerName: user?.korean_name || '',
              customerEnglishName: user?.english_name || '',
              tourCode: t.tour_code,
              tourName: t.tour_name,
              tourType: t.tour_type,
              detailCategory: t.detail_category,
              quantity: parseInt(t.quantity) || 0,
              startDate: t.start_date,
              endDate: t.end_date,
              participants: parseInt(t.tour_count) || 0,
              dispatch: t.dispatch,
              pickupLocation: t.pickup_location,
              dropoffLocation: t.dropoff_location,
              memo: t.memo,
              unitPrice: parseFloat(t.amount) || 0,
              totalPrice: parseFloat(t.total) || 0,
              email: user?.email || t.email,
              tourNote: t.tour_note
            };
          });
        } else if (tableName === 'sh_rc') {
          mappedData = (data || []).map((rc: any) => {
            const user = userMap.get(rc.order_id);
            return {
              orderId: rc.order_id,
              customerName: user?.korean_name || '',
              customerEnglishName: user?.english_name || '',
              carCode: rc.vehicle_code,
              tripType: rc.division,
              category: rc.category,
              route: rc.route,
              carType: rc.vehicle_type,
              carCount: parseInt(rc.vehicle_count) || 0,
              pickupDate: rc.boarding_date,
              pickupTime: rc.boarding_time,
              pickupLocation: rc.boarding_location,
              carrierCount: parseInt(rc.carrier_count) || 0,
              destination: rc.destination,
              stopover: rc.stopover,
              passengerCount: parseInt(rc.passenger_count) || 0,
              usagePeriod: rc.usage_period,
              memo: rc.memo,
              unitPrice: parseFloat(rc.amount) || 0,
              totalPrice: parseFloat(rc.total) || 0,
              email: user?.email || rc.email
            };
          });
        }

        setGoogleSheetsData(mappedData);
      }
    } catch (err: any) {
      setGoogleSheetsError(err.message || '데이터를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setGoogleSheetsLoading(false);
    }
  };

  const parseDate = (dateStr: string): Date | null => {
    if (!dateStr) return null;

    try {
      // "YYYY. MM. DD" 형식 처리
      if (dateStr.includes('. ')) {
        const parts = dateStr.split('. ').map(p => p.trim());
        if (parts.length >= 3) {
          const [year, month, day] = parts;
          const dayNum = day.split(' ')[0]; // 시간 부분 제거
          // 로컬 시간대로 Date 객체 생성 (정오 12시로 설정하여 시간대 문제 방지)
          const date = new Date(
            parseInt(year),
            parseInt(month) - 1, // 월은 0부터 시작
            parseInt(dayNum),
            12, 0, 0, 0 // 정오로 설정
          );
          return date;
        }
      }

      // "YYYY-MM-DD" 형식
      if (dateStr.includes('-')) {
        const datePart = dateStr.split(' ')[0];
        const [year, month, day] = datePart.split('-');
        // 로컬 시간대로 Date 객체 생성 (정오 12시로 설정)
        const date = new Date(
          parseInt(year),
          parseInt(month) - 1,
          parseInt(day),
          12, 0, 0, 0 // 정오로 설정
        );
        return date;
      }

      // 기타 형식
      const date = new Date(dateStr);
      if (!isNaN(date.getTime())) {
        // 시간을 정오로 설정
        date.setHours(12, 0, 0, 0);
        return date;
      }
    } catch (error) {
      // 에러 무시
    }

    return null;
  };

  const formatPrice = (price: number): string => {
    return price.toLocaleString('ko-KR') + '동';
  };

  // 승/하차 위치 텍스트를 표에서 읽기 쉬운 2줄 형식으로 통일
  const formatPickupDropoffText = (pickup?: string, dropoff?: string) => {
    const p = String(pickup || '').trim();
    const d = String(dropoff || '').trim();
    if (p && d) return `승차: ${p}\n하차: ${d}`;
    if (p) return `승차: ${p}`;
    if (d) return `하차: ${d}`;
    return '-';
  };

  // 위치 컬럼은 반응형 폭을 주어 모바일/데스크톱 모두 줄바꿈 가독성을 확보
  const pickupDropoffCellCls = 'px-2 py-1.5 align-top text-xs text-gray-700 whitespace-pre-line break-words leading-5 w-[220px] md:w-[280px] xl:w-[340px]';

  const isPastDate = (dateStr: string): boolean => {
    const date = parseDate(dateStr);
    if (!date) return false;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return date < today;
  };

  const toLocalDateString = (date: Date) => {
    const parts = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const pick = (type: string) => parts.find((p) => p.type === type)?.value || '';
    const y = pick('year');
    const m = pick('month');
    const d = pick('day');
    return `${y}-${m}-${d}`;
  };

  const loadSchedules = async () => {
    try {
      setLoading(true);
      const { start, end } = getRange(selectedDate, viewMode);
      const startDateOnly = toLocalDateString(start);
      const endDateOnly = toLocalDateString(end);
      const hasSearch = activeSearchQuery.trim().length > 0;

      const fetchByReservationIds = async (tableName: string, reservationIds: string[]) => {
        if (reservationIds.length === 0) return [];
        const CHUNK = 200;
        const allRows: any[] = [];
        for (let i = 0; i < reservationIds.length; i += CHUNK) {
          const chunk = reservationIds.slice(i, i + CHUNK);
          const { data, error } = await supabase
            .from(tableName)
            .select('*, reservation_id')
            .in('reservation_id', chunk);
          if (error) throw error;
          allRows.push(...(data || []));
        }
        return allRows;
      };

      const fetchReservationsPaged = async (baseQueryBuilder: () => any, maxRows = 10000) => {
        const PAGE = 1000;
        const rows: any[] = [];
        for (let from = 0; from < maxRows; from += PAGE) {
          const to = from + PAGE - 1;
          const { data, error } = await baseQueryBuilder().range(from, to);
          if (error) throw error;
          const chunk = data || [];
          rows.push(...chunk);
          if (chunk.length < PAGE) break;
        }
        return rows;
      };

      // 서비스별 날짜 컬럼 기준으로 기간 내 데이터 조회 (배치)
      let cruiseRows: any[] = [];
      let airportRows: any[] = [];
      let hotelRows: any[] = [];
      let rentcarRows: any[] = [];
      let tourRows: any[] = [];
      let ticketRows: any[] = [];
      let cruiseCarRows: any[] = [];
      let carShtRows: any[] = [];

      if (hasSearch) {
        // 검색 모드: 기간과 무관하게 reservation 전체를 페이지 조회
        const allReservations = await fetchReservationsPaged(
          () => supabase
            .from('reservation')
            .select('re_id, re_type, re_status, re_user_id')
            .neq('re_type', 'car_sht')
            .order('re_created_at', { ascending: false }),
          200000
        );

        const reservationIds = Array.from(new Set((allReservations || []).map((r: any) => r.re_id).filter(Boolean)));

        if (reservationIds.length === 0) {
          setSchedules([]);
          return;
        }

        const [cruiseData, airportData, hotelData, rentcarData, tourData, ticketData, cruiseCarData, carShtData] = await Promise.all([
          fetchByReservationIds('reservation_cruise', reservationIds),
          fetchByReservationIds('reservation_airport', reservationIds),
          fetchByReservationIds('reservation_hotel', reservationIds),
          fetchByReservationIds('reservation_rentcar', reservationIds),
          fetchByReservationIds('reservation_tour', reservationIds),
          fetchByReservationIds('reservation_ticket', reservationIds),
          fetchByReservationIds('reservation_cruise_car', reservationIds),
          fetchByReservationIds('reservation_car_sht', reservationIds),
        ]);

        cruiseRows = cruiseData;
        airportRows = airportData;
        hotelRows = hotelData;
        rentcarRows = rentcarData;
        tourRows = tourData;
        ticketRows = ticketData;
        cruiseCarRows = cruiseCarData;
        carShtRows = carShtData;
      } else {
        const [cruiseRes, airportRes, hotelRes, rentcarRes, tourRes, ticketRes, cruiseCarRes, carShtRes] = await Promise.all([
          // cruise: checkin (date)
          supabase
            .from('reservation_cruise')
            .select('*, reservation_id')
            .gte('checkin', startDateOnly)
            .lte('checkin', endDateOnly),
          // airport: ra_datetime (timestamp)
          supabase
            .from('reservation_airport')
            .select('*, reservation_id')
            .gte('ra_datetime', start.toISOString())
            .lte('ra_datetime', end.toISOString()),
          // hotel: checkin_date (date)
          supabase
            .from('reservation_hotel')
            .select('*, reservation_id')
            .gte('checkin_date', startDateOnly)
            .lte('checkin_date', endDateOnly),
          // rentcar: pickup/return datetime (timestamp)
          supabase
            .from('reservation_rentcar')
            .select('*, reservation_id')
            .or(
              `and(pickup_datetime.gte.${start.toISOString()},pickup_datetime.lte.${end.toISOString()}),and(return_datetime.gte.${start.toISOString()},return_datetime.lte.${end.toISOString()})`
            ),
          // tour: usage_date (date) - 없을 수 있음, maybeSingle 대신 범위 조회
          supabase
            .from('reservation_tour')
            .select('*, reservation_id')
            .gte('usage_date', startDateOnly)
            .lte('usage_date', endDateOnly),
          supabase
            .from('reservation_ticket')
            .select('*, reservation_id')
            .gte('usage_date', startDateOnly)
            .lte('usage_date', endDateOnly),
          // cruise car: pickup/return date
          supabase
            .from('reservation_cruise_car')
            .select('*, reservation_id')
            .or(
              `and(pickup_datetime.gte.${startDateOnly},pickup_datetime.lte.${endDateOnly}),and(return_datetime.gte.${startDateOnly},return_datetime.lte.${endDateOnly})`
            ),
          // car_sht: pickup_datetime (timestamptz)
          supabase
            .from('reservation_car_sht')
            .select('*, reservation_id')
            .gte('pickup_datetime', start.toISOString())
            .lte('pickup_datetime', end.toISOString())
        ]);

        cruiseRows = cruiseRes.data || [];
        airportRows = airportRes.data || [];
        hotelRows = hotelRes.data || [];
        rentcarRows = rentcarRes.data || [];
        tourRows = tourRes.data || [];
        ticketRows = ticketRes.data || [];
        cruiseCarRows = cruiseCarRes.data || [];
        carShtRows = carShtRes.data || [];
      }

      const serviceRows: Array<{ table: string; rows: any[] }> = [
        { table: 'reservation_cruise', rows: cruiseRows },
        { table: 'reservation_airport', rows: airportRows },
        { table: 'reservation_hotel', rows: hotelRows },
        { table: 'reservation_rentcar', rows: rentcarRows },
        { table: 'reservation_tour', rows: tourRows },
        { table: 'reservation_ticket', rows: ticketRows },
        { table: 'reservation_cruise_car', rows: cruiseCarRows },
        { table: 'reservation_car_sht', rows: carShtRows }
      ];

      // 크루즈 room_price_code → cruise_rate_card(cruise_name, room_type) 매핑 조회
      const cruiseCodes = Array.from(
        new Set((cruiseRows || []).map((r: any) => r.room_price_code).filter(Boolean))
      );
      // cruise_rate_card.id 는 uuid 컬럼이므로, 레거시 비-UUID 코드를 섞어서 .in('id', ...) 호출하면
      // 청크 전체가 'invalid input syntax for type uuid' 에러로 실패해 매핑이 통째로 비게 됨
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const cruiseCodesUuid = cruiseCodes.filter((c: any) => UUID_RE.test(String(c || '')));
      const tourCodes = Array.from(
        new Set((tourRows || []).map((r: any) => r.tour_price_code).filter(Boolean))
      );
      const airportCodes = Array.from(
        new Set((airportRows || []).map((r: any) => r.airport_price_code).filter(Boolean))
      );
      const hotelCodes = Array.from(
        new Set((hotelRows || []).map((r: any) => r.hotel_price_code).filter(Boolean))
      );
      const rentCodes = Array.from(
        new Set(
          (rentcarRows || []).flatMap((r: any) => {
            const rawCode = String(r?.rentcar_price_code || '').trim();
            if (!rawCode) return [];
            const upperCode = rawCode.toUpperCase();
            const lowerCode = rawCode.toLowerCase();
            return Array.from(new Set([rawCode, upperCode, lowerCode]));
          })
        )
      );
      const cruiseCarRentCodes = Array.from(
        new Set(
          (cruiseCarRows || []).flatMap((r: any) => {
            const rawCode = String(r?.rentcar_price_code || '').trim();
            if (!rawCode) return [];
            const upperCode = rawCode.toUpperCase();
            const lowerCode = rawCode.toLowerCase();
            return Array.from(new Set([rawCode, upperCode, lowerCode]));
          })
        )
      );
      const allRentCodes = Array.from(new Set([...rentCodes, ...cruiseCarRentCodes]));
      let cruiseInfoByCode = new Map<string, { cruise?: string; room_type?: string; room_category?: string }>();
      let tourInfoByCode = new Map<string, { tour_name?: string; tour_code?: string; category?: string; vehicle_type?: string }>();
      let airportInfoByKey = new Map<string, { service_type?: string; route?: string; vehicle_type?: string }>();
      let airportInfoByCode = new Map<string, { service_type?: string; route?: string; vehicle_type?: string }>();
      let hotelInfoByCode = new Map<string, { hotel_name?: string; room_name?: string; room_type?: string; include_breakfast?: boolean }>();
      let rentInfoByCode = new Map<string, { vehicle_type?: string; route?: string; way_type?: string; category?: string; cruise?: string }>();

      const normalizeAirportWay = (value: string) => {
        const way = (value || '').toLowerCase();
        if (way === 'pickup' || way === '픽업') return '픽업';
        if (way === 'sending' || way === 'dropoff' || way === '샌딩') return '샌딩';
        return '';
      };
      const normalizeCruiseCode = (value: any) => String(value || '').trim().toLowerCase();

      // 검색 모드에서 IN 리스트가 매우 커지면 URL 길이 초과로 응답이 비어 객실명/크루즈명이 누락됨
      // → 200건 단위로 청크 분할 조회
      const fetchInChunked = async (table: string, selectCols: string, column: string, values: any[], chunkSize = 200) => {
        const acc: any[] = [];
        const uniq = Array.from(new Set((values || []).filter(v => v !== null && v !== undefined && v !== '')));
        for (let i = 0; i < uniq.length; i += chunkSize) {
          const chunk = uniq.slice(i, i + chunkSize);
          const { data, error } = await supabase.from(table).select(selectCols).in(column, chunk);
          if (error) {
            console.error(`${table}.${column} 청크 조회 실패:`, error);
            continue;
          }
          acc.push(...(data || []));
        }
        return { data: acc };
      };

      const [rpByIdRes, rpByTypeRes, tpDataRes, airportPriceRes, hotelPriceRes, rentPriceRes] = await Promise.all([
        cruiseCodesUuid.length > 0
          ? fetchInChunked('cruise_rate_card', 'id, cruise_name, room_type', 'id', cruiseCodesUuid)
          : Promise.resolve({ data: [] as any[] }),
        cruiseCodes.length > 0
          ? fetchInChunked('cruise_rate_card', 'id, cruise_name, room_type', 'room_type', cruiseCodes)
          : Promise.resolve({ data: [] as any[] }),
        tourCodes.length > 0
          ? supabase.from('tour_pricing').select('pricing_id, tour_id, vehicle_type').in('pricing_id', tourCodes)
          : Promise.resolve({ data: [] as any[] }),
        airportCodes.length > 0
          ? supabase.from('airport_price').select('airport_code, service_type, route, vehicle_type').in('airport_code', airportCodes)
          : Promise.resolve({ data: [] }),
        hotelCodes.length > 0
          ? supabase.from('hotel_price').select('hotel_price_code, hotel_name, room_name, room_type, include_breakfast').in('hotel_price_code', hotelCodes)
          : Promise.resolve({ data: [] }),
        allRentCodes.length > 0
          ? supabase.from('rentcar_price').select('rent_code, vehicle_type, route, way_type, category, cruise').in('rent_code', allRentCodes)
          : Promise.resolve({ data: [] })
      ]);

      const normalizeRentCode = (value: any) => String(value || '').trim();
      const compactRentCode = (value: string) => value.replace(/\s+/g, '');

      let rentPriceRows = [...(rentPriceRes.data || [])];
      if (allRentCodes.length > 0) {
        const requested = Array.from(new Set(
          allRentCodes.map((c) => normalizeRentCode(c).toUpperCase()).filter(Boolean)
        ));
        const present = new Set(
          rentPriceRows.map((r: any) => normalizeRentCode(r?.rent_code).toUpperCase()).filter(Boolean)
        );
        const hasMissing = requested.some((code) => !present.has(code));
        if (hasMissing) {
          const { data: allRentRows } = await supabase
            .from('rentcar_price')
            .select('rent_code, vehicle_type, route, way_type, category, cruise');
          if (allRentRows?.length) {
            const byCode = new Map<string, any>();
            for (const row of [...rentPriceRows, ...allRentRows]) {
              const key = normalizeRentCode(row?.rent_code).toUpperCase();
              if (key) byCode.set(key, row);
            }
            rentPriceRows = Array.from(byCode.values());
          }
        }
      }

      // cruise_rate_card: id 조회 + room_type 조회 결과 병합
      const rpMergedMap = new Map<string, any>();
      for (const rp of [...(rpByIdRes.data || []), ...(rpByTypeRes.data || [])]) {
        const idKey = String(rp.id || '').trim();
        if (idKey && !rpMergedMap.has(idKey)) rpMergedMap.set(idKey, rp);
        const typeKey = String(rp.room_type || '').trim();
        if (typeKey && !rpMergedMap.has(typeKey)) rpMergedMap.set(typeKey, rp);
      }

      // legacy room_price 테이블은 더 이상 사용하지 않음 (cruise_rate_card로 통합)

      // cruise_info에서 room_name 조회 (cruise_info에는 room_type 컬럼이 없음 → cruise_name 키로만 매핑)
      const cruiseNames = Array.from(new Set(Array.from(rpMergedMap.values()).map(rp => rp.cruise_name).filter(Boolean)));
      let cruiseInfoDataMap = new Map<string, any>();
      if (cruiseNames.length > 0) {
        const { data: cruiseInfoData } = await fetchInChunked(
          'cruise_info',
          'cruise_name, room_name',
          'cruise_name',
          cruiseNames
        );
        for (const ci of cruiseInfoData || []) {
          // 같은 cruise_name이 여러 room_name으로 존재할 수 있으므로 첫 행 유지
          if (!cruiseInfoDataMap.has(ci.cruise_name)) {
            cruiseInfoDataMap.set(ci.cruise_name, ci);
          }
        }
      }

      for (const rp of rpMergedMap.values()) {
        const idCode = String(rp.id || '').trim();
        const typeCode = String(rp.room_type || '').trim();
        const ciData = cruiseInfoDataMap.get(rp.cruise_name);
        const cruiseInfo = {
          cruise: rp.cruise_name || undefined,
          room_type: rp.room_type || undefined,
          room_name: ciData?.room_name || undefined,
          room_category: undefined
        };
        if (idCode) {
          cruiseInfoByCode.set(idCode, cruiseInfo);
          cruiseInfoByCode.set(normalizeCruiseCode(idCode), cruiseInfo);
        }
        if (typeCode) {
          cruiseInfoByCode.set(typeCode, cruiseInfo);
          cruiseInfoByCode.set(normalizeCruiseCode(typeCode), cruiseInfo);
        }
      }

      for (const ap of airportPriceRes.data || []) {
        const key = `${ap.airport_code || ''}-${ap.service_type || ''}`;
        const value = {
          service_type: ap.service_type || undefined,
          route: ap.route || undefined,
          vehicle_type: ap.vehicle_type || undefined,
        };
        airportInfoByKey.set(key, value);
        if (!airportInfoByCode.has(ap.airport_code)) {
          airportInfoByCode.set(ap.airport_code, value);
        }
      }

      for (const hp of hotelPriceRes.data || []) {
        hotelInfoByCode.set(hp.hotel_price_code, {
          hotel_name: hp.hotel_name || undefined,
          room_name: hp.room_name || undefined,
          room_type: hp.room_type || undefined,
          include_breakfast: hp.include_breakfast ?? undefined,
        });
      }

      for (const rc of rentPriceRows) {
        const rawCode = String(rc.rent_code || '').trim();
        const upperCode = rawCode.toUpperCase();
        const lowerCode = rawCode.toLowerCase();
        const compactCode = compactRentCode(rawCode);
        const compactUpper = compactCode.toUpperCase();
        const compactLower = compactCode.toLowerCase();
        const rentInfo = {
          vehicle_type: rc.vehicle_type || undefined,
          route: rc.route || undefined,
          way_type: rc.way_type || undefined,
          category: rc.category || undefined,
          cruise: rc.cruise || undefined,
        };
        if (rawCode) {
          rentInfoByCode.set(rawCode, rentInfo);
        }
        if (upperCode && upperCode !== rawCode) {
          rentInfoByCode.set(upperCode, rentInfo);
        }
        if (lowerCode && lowerCode !== rawCode && lowerCode !== upperCode) {
          rentInfoByCode.set(lowerCode, rentInfo);
        }
        if (compactCode) {
          rentInfoByCode.set(compactCode, rentInfo);
        }
        if (compactUpper && compactUpper !== compactCode) {
          rentInfoByCode.set(compactUpper, rentInfo);
        }
        if (compactLower && compactLower !== compactCode && compactLower !== compactUpper) {
          rentInfoByCode.set(compactLower, rentInfo);
        }
      }

      // 📌 STEP 1: pricing_id → tour_id 매핑
      const tpData: any[] = tpDataRes?.data || [];
      if (tpData.length > 0) {
        // 📌 STEP 2: tour_id 목록 추출
        const tourIds = Array.from(new Set((tpData).map((tp: any) => tp.tour_id).filter(Boolean)));

        if (tourIds.length > 0) {
          // 📌 STEP 3: tour_id → tour_name 조회
          const { data: toursById } = await supabase
            .from('tour')
            .select('tour_id, tour_name, tour_code, category')
            .in('tour_id', tourIds);

          // 📌 STEP 4: tour_name 맵핑 (pricing_id → tour_name)
          const tourById = new Map((toursById || []).map((t: any) => [t.tour_id, t]));
          for (const tp of tpData) {
            const tourInfo = tourById.get(tp.tour_id);
            tourInfoByCode.set(tp.pricing_id, {
              tour_name: tourInfo?.tour_name || undefined,
              tour_code: tourInfo?.tour_code || undefined,
              category: tourInfo?.category || undefined,
              vehicle_type: tp.vehicle_type || undefined,
            });
          }
        }
      }

      // 해당되는 예약 ID들 조회
      const reservationIds = Array.from(
        new Set(
          serviceRows.flatMap(s => (s.rows || []).map((r: any) => r.reservation_id)).filter(Boolean)
        )
      );

      if (reservationIds.length === 0) {
        setSchedules([]);
        return;
      }

      // 예약 기본 정보와 사용자 정보를 청크 조회 (대량 IN 조건 대응)
      const CHUNK_SIZE = 200;
      const reservationsData: any[] = [];
      for (let i = 0; i < reservationIds.length; i += CHUNK_SIZE) {
        const chunk = reservationIds.slice(i, i + CHUNK_SIZE);
        const { data, error } = await supabase
          .from('reservation')
          .select('re_id, re_type, re_status, re_user_id')
          .in('re_id', chunk)
          .neq('re_type', 'car_sht');
        if (error) {
          console.error('reservation 청크 조회 실패:', error);
          setSchedules([]);
          return;
        }
        reservationsData.push(...(data || []));
      }

      const reservationById = new Map(reservationsData.map(r => [r.re_id, r]));

      const userIds = Array.from(new Set(reservationsData.map(r => r.re_user_id).filter(Boolean)));
      let usersById = new Map<string, any>();
      if (userIds.length > 0) {
        const usersData: any[] = [];
        for (let i = 0; i < userIds.length; i += CHUNK_SIZE) {
          const chunk = userIds.slice(i, i + CHUNK_SIZE);
          const { data, error } = await supabase
            .from('users')
            .select('id, name, email')
            .in('id', chunk);
          if (error) {
            console.error('users 청크 조회 실패:', error);
            continue;
          }
          usersData.push(...(data || []));
        }
        usersById = new Map((usersData || []).map(u => [u.id, u]));
      }

      // 스케줄 객체로 변환
      const result: any[] = [];
      const hasTimezone = (value: string) => /[zZ]$|[+-]\d{2}:?\d{2}$/.test(value);
      const parseKstDateTime = (value: any): Date | null => {
        if (!value) return null;
        if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

        const raw = String(value).trim();
        if (!raw) return null;

        let normalized = raw.replace(' ', 'T');
        if (!hasTimezone(normalized)) {
          if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
            normalized = `${normalized}T00:00:00+09:00`;
          } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(normalized)) {
            normalized = `${normalized}:00+09:00`;
          } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(normalized)) {
            normalized = `${normalized}+09:00`;
          }
        }

        const parsed = new Date(normalized);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
      };
      const toKstTimeStr = (d: Date) => d.toLocaleTimeString('ko-KR', {
        timeZone: 'Asia/Seoul',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });

      for (const { table, rows } of serviceRows) {
        for (const row of rows) {
          const reservation = reservationById.get(row.reservation_id);
          if (!reservation) continue;
          let scheduleDate: Date | null = null;
          let scheduleTime = '';
          let location: string | null = null;
          let duration: string | null = null;
          const reservationAny = reservation as any;
          let type = reservationAny.re_type;

          if (table === 'reservation_cruise') {
            // checkin은 date만 있을 가능성
            if (row.checkin) {
              scheduleDate = new Date(row.checkin + 'T09:00:00');
              // 크루즈는 시간 표기 숨김
              scheduleTime = '';
            }
            location = '하롱베이';
            // room_price_code로 크루즈/룸타입 부가 정보
            if (row.room_price_code) {
              const rawCode = String(row.room_price_code || '').trim();
              const info = cruiseInfoByCode.get(rawCode) || cruiseInfoByCode.get(normalizeCruiseCode(row.room_price_code));
              if (info) {
                (row as any)._cruise_info = { ...info, room_code: row.room_price_code };
              }
            }
          } else if (table === 'reservation_airport') {
            const wayTypeKo = normalizeAirportWay(row.ra_way_type || row.way_type || row.service_type || '');
            const airportInfo = airportInfoByKey.get(`${row.airport_price_code || ''}-${wayTypeKo}`)
              || airportInfoByCode.get(row.airport_price_code)
              || null;

            if (airportInfo) {
              (row as any).service_type = row.service_type || airportInfo.service_type;
              (row as any).route = row.route || airportInfo.route;
              (row as any).vehicle_type = row.vehicle_type || airportInfo.vehicle_type;
            }

            if (row.ra_datetime) {
              const parsed = parseKstDateTime(row.ra_datetime);
              if (parsed) {
                scheduleDate = parsed;
                scheduleTime = toKstTimeStr(parsed);
              }
            }
            location = row.ra_airport_location || null;
          } else if (table === 'reservation_hotel') {
            if (row.hotel_price_code) {
              const hotelInfo = hotelInfoByCode.get(row.hotel_price_code);
              if (hotelInfo) {
                (row as any)._hotel_info = hotelInfo;
              }
            }

            if (row.checkin_date) {
              scheduleDate = new Date(row.checkin_date + 'T15:00:00');
              scheduleTime = '15:00';
            }
            // 예약 시 hotel_category에 호텔명 저장하는 패턴
            location = row.hotel_category || null;
            if (row.nights) duration = `${row.nights}박`;
          } else if (table === 'reservation_rentcar') {
            if (row.rentcar_price_code) {
              const rentCode = String(row.rentcar_price_code || '').trim();
              const compactCode = compactRentCode(rentCode);
              const rentInfo =
                rentInfoByCode.get(rentCode) ||
                rentInfoByCode.get(rentCode.toUpperCase()) ||
                rentInfoByCode.get(rentCode.toLowerCase()) ||
                rentInfoByCode.get(compactCode) ||
                rentInfoByCode.get(compactCode.toUpperCase()) ||
                rentInfoByCode.get(compactCode.toLowerCase());
              if (rentInfo) {
                (row as any)._rentcar_info = rentInfo;
                (row as any).route = row.route || rentInfo.route;
                (row as any).way_type = row.way_type || rentInfo.way_type;
                (row as any).vehicle_type = row.vehicle_type || rentInfo.vehicle_type;
              }
            }

            if (row.pickup_datetime) {
              const parsed = parseKstDateTime(row.pickup_datetime);
              if (parsed) {
                scheduleDate = parsed;
                scheduleTime = toKstTimeStr(parsed);
              }
            }
            if (row.pickup_location && row.destination) {
              location = `${row.pickup_location} → ${row.destination}`;
            } else {
              location = row.pickup_location || row.destination || null;
            }

            if (!scheduleDate) continue;

            // 렌트카는 픽업/리턴을 각각 개별 일정으로 표시
            result.push({
              re_id: reservationAny.re_id,
              re_type: type,
              re_status: reservationAny.re_status,
              users: usersById.get(reservationAny.re_user_id) || null,
              schedule_date: scheduleDate,
              schedule_time: scheduleTime,
              location,
              duration,
              rentcar_phase: 'pickup',
              segment_ribbon: '픽업',
              service_table: table,
              service_row: row,
              cruise_info: (row as any)._cruise_info || null
            });

            // 리턴 카드: return_datetime이 있으면 항상 생성 (같은 날이어도)
            const rentcarReturnDate = row.return_datetime ? parseKstDateTime(row.return_datetime) : null;
            if (rentcarReturnDate) {
              const returnLocation = (row.return_pickup_location && row.return_destination)
                ? `${row.return_pickup_location} → ${row.return_destination}`
                : row.return_pickup_location || row.return_destination || row.dropoff_location || location;

              result.push({
                re_id: reservationAny.re_id,
                re_type: type,
                re_status: reservationAny.re_status,
                users: usersById.get(reservationAny.re_user_id) || null,
                schedule_date: rentcarReturnDate,
                schedule_time: toKstTimeStr(rentcarReturnDate),
                location: returnLocation,
                duration,
                rentcar_phase: 'return',
                segment_ribbon: '리턴',
                service_table: table,
                service_row: row,
                cruise_info: (row as any)._cruise_info || null
              });
            }

            continue;
          } else if (table === 'reservation_tour') {
            if (row.usage_date) {
              scheduleDate = new Date(row.usage_date + 'T09:00:00');
              // 투어 카드는 시간 숨김 정책
              scheduleTime = '';
            }
            if (row.pickup_location && row.dropoff_location) {
              location = `${row.pickup_location} → ${row.dropoff_location}`;
            } else {
              location = row.pickup_location || row.dropoff_location || null;
            }
            // 투어명 enrichment: tour_price_code (=pricing_id) → tour_name
            if (row.tour_price_code && tourInfoByCode.has(row.tour_price_code)) {
              (row as any)._tour_info = tourInfoByCode.get(row.tour_price_code);
            }
            if (row.tour_duration) duration = row.tour_duration;
          } else if (table === 'reservation_ticket') {
            if (row.usage_date) {
              scheduleDate = new Date(row.usage_date + 'T09:00:00');
              scheduleTime = '';
            }
            if (row.pickup_location && row.dropoff_location) {
              location = `${row.pickup_location} → ${row.dropoff_location}`;
            } else {
              location = row.pickup_location || row.dropoff_location || null;
            }
          } else if (table === 'reservation_cruise_car') {
            if (row.rentcar_price_code) {
              const rentCode = String(row.rentcar_price_code || '').trim();
              const compactCode = compactRentCode(rentCode);
              const info =
                rentInfoByCode.get(rentCode) ||
                rentInfoByCode.get(rentCode.toUpperCase()) ||
                rentInfoByCode.get(rentCode.toLowerCase()) ||
                rentInfoByCode.get(compactCode) ||
                rentInfoByCode.get(compactCode.toUpperCase()) ||
                rentInfoByCode.get(compactCode.toLowerCase());
              if (info) {
                (row as any)._rentcar_info = info;
                (row as any).vehicle_type = row.vehicle_type || info.vehicle_type;
              }
            }

            // 픽업 카드 생성
            if (row.pickup_datetime) {
              const pickupDate = new Date(row.pickup_datetime + 'T09:00:00');
              result.push({
                re_id: reservationAny.re_id,
                re_type: type,
                re_status: reservationAny.re_status,
                users: usersById.get(reservationAny.re_user_id) || null,
                schedule_date: pickupDate,
                schedule_time: '09:00',
                location: row.pickup_location || null,
                duration,
                segment_type: 'pickup',
                segment_ribbon: '픽업',
                service_table: table,
                service_row: row,
                cruise_info: (row as any)._cruise_info || null
              });
            }

            // 드롭 카드 생성: 왕복이면 같은날이어도 반드시 생성
            const wayType = String(row.way_type || '').trim();
            const isRoundTrip = wayType.includes('왕복');
            const returnDateSource = row.return_datetime || (isRoundTrip ? row.pickup_datetime : null);
            if (returnDateSource) {
              const returnDate = new Date(returnDateSource + 'T09:00:00');
              if (!isNaN(returnDate.getTime())) {
                result.push({
                  re_id: reservationAny.re_id,
                  re_type: type,
                  re_status: reservationAny.re_status,
                  users: usersById.get(reservationAny.re_user_id) || null,
                  schedule_date: returnDate,
                  schedule_time: '09:00',
                  location: row.dropoff_location || null,
                  duration,
                  segment_type: 'return',
                  segment_ribbon: '드롭',
                  service_table: table,
                  service_row: row,
                  cruise_info: (row as any)._cruise_info || null
                });
              }
            }

            continue;
          } else if (table === 'reservation_car_sht') {
            // pickup_datetime is timestamptz
            if (row.pickup_datetime) {
              const d = new Date(row.pickup_datetime);
              if (!isNaN(d.getTime())) {
                const localDate = new Date(d.getTime() + (9 * 60 * 60 * 1000)); // UTC+9
                scheduleDate = localDate;
                scheduleTime = toKstTimeStr(localDate);
              }
            }
            // No location fields; show category or vehicle info in location slot
            location = row.sht_category || row.vehicle_number || row.dispatch_code || null;
          }

          if (table === 'reservation_rentcar' && row.rentcar_price_code) {
            const rentCode = String(row.rentcar_price_code || '').trim();
            const compactCode = compactRentCode(rentCode);
            const rentInfo =
              rentInfoByCode.get(rentCode) ||
              rentInfoByCode.get(rentCode.toUpperCase()) ||
              rentInfoByCode.get(rentCode.toLowerCase()) ||
              rentInfoByCode.get(compactCode) ||
              rentInfoByCode.get(compactCode.toUpperCase()) ||
              rentInfoByCode.get(compactCode.toLowerCase());
            if (rentInfo) {
              (row as any)._rentcar_info = rentInfo;
              (row as any).route = row.route || rentInfo.route;
              (row as any).way_type = row.way_type || rentInfo.way_type;
              (row as any).vehicle_type = row.vehicle_type || rentInfo.vehicle_type;
            }
          }

          if (!scheduleDate) continue; // 날짜가 없으면 제외

          result.push({
            re_id: reservationAny.re_id,
            re_type: type,
            re_status: reservationAny.re_status,
            users: usersById.get(reservationAny.re_user_id) || null,
            schedule_date: scheduleDate,
            schedule_time: scheduleTime,
            location,
            duration,
            service_table: table,
            service_row: row,
            cruise_info: (row as any)._cruise_info || null
          });
        }
      }

      // 타입 필터는 렌더에서 적용하되, 여기서는 날짜 범위 내 결과만 세팅
      // 최신순 정렬 (시간 기준)
      result.sort((a, b) => a.schedule_date.getTime() - b.schedule_date.getTime());
      setSchedules(result);
    } catch (error) {
      // 에러 무시
    } finally {
      setLoading(false);
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'cruise': return <Ship className="w-5 h-5 text-blue-600" />;
      case 'airport': return <Plane className="w-5 h-5 text-green-600" />;
      case 'hotel': return <Building className="w-5 h-5 text-purple-600" />;
      case 'tour': return <MapPin className="w-5 h-5 text-orange-600" />;
      case 'package': return <FileText className="w-5 h-5 text-teal-600" />;
      case 'ticket': return <FileText className="w-5 h-5 text-teal-600" />;
      case 'rentcar': return <Car className="w-5 h-5 text-red-600" />;
      case 'car': return <Car className="w-5 h-5 text-red-600" />;
      case 'vehicle': return <Car className="w-5 h-5 text-red-600" />;
      default: return <Clock className="w-5 h-5 text-gray-600" />;
    }
  };

  const getTypeName = (type: string) => {
    switch (type) {
      case 'cruise': return '크루즈';
      case 'airport': return '공항';
      case 'hotel': return '호텔';
      case 'tour': return '투어';
      case 'package': return '패키지';
      case 'ticket': return '패키지';
      case 'rentcar': return '렌트카';
      case 'car': return '크차';
      case 'vehicle': return '크차';
      case 'sht': return '스하차량';
      default: return type;
    }
  };

  const getScheduleServiceType = (schedule: any) => {
    if (schedule?.re_type === 'package') return 'package';
    switch (schedule?.service_table) {
      case 'reservation_cruise': return 'cruise';
      case 'reservation_airport': return 'airport';
      case 'reservation_hotel': return 'hotel';
      case 'reservation_tour': return 'tour';
      case 'reservation_ticket': return 'package';
      case 'reservation_rentcar': return 'rentcar';
      case 'reservation_cruise_car': return 'vehicle';
      case 'reservation_car_sht': return 'sht';
      default: return schedule?.re_type || 'other';
    }
  };

  // 표시용 타입명/아이콘 (service_table을 반영)
  const getDisplayTypeName = (schedule: any) => {
    return getTypeName(getScheduleServiceType(schedule));
  };

  const renderDbCardBody = (schedule: any) => {
    const row = schedule?.service_row || {};
    const dateText = schedule?.schedule_date
      ? new Date(schedule.schedule_date).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })
      : undefined;
    const serviceType = schedule?.service_table || schedule?.re_type || '';
    const cardData = (() => {
      if (serviceType === 'reservation_rentcar' || serviceType === 'rentcar') {
        return { ...row, _rentcar_phase: schedule?.rentcar_phase || '' };
      }
      if (serviceType === 'reservation_cruise_car' || serviceType === 'cruise_car') {
        return { ...row, _cruise_car_phase: schedule?.segment_type || '' };
      }
      if (serviceType === 'reservation_cruise' || serviceType === 'cruise') {
        return {
          ...row,
          _cruise_info: row?._cruise_info || schedule?.cruise_info || null,
          cruise_info: row?.cruise_info || schedule?.cruise_info || null,
        };
      }
      return row;
    })();
    const shouldShowTime =
      serviceType === 'reservation_airport' ||
      serviceType === 'reservation_rentcar' ||
      serviceType === 'airport' ||
      serviceType === 'rentcar';
    const timeText = shouldShowTime ? (schedule?.schedule_time || undefined) : undefined;

    return (
      <ServiceCardBody
        serviceType={serviceType}
        data={cardData}
        customerName={schedule.users?.name}
        showCustomer={true}
        dateText={dateText}
        timeText={timeText}
      />
    );
  };

  const renderDbScheduleCard = (schedule: any, idx: number) => (
    <div key={`${schedule.re_id}-${schedule.service_table}-${schedule.segment_type || schedule.rentcar_phase || 'default'}-${idx}`} className="bg-gray-50 border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-all p-3 flex flex-col h-full">
      <div className="flex items-center gap-2 mb-2 pb-1 border-b border-gray-100">
        <div className="flex items-center justify-center w-9 h-9 rounded-full bg-gray-50 border border-gray-200">
          {getDisplayTypeIcon(schedule)}
        </div>
        <h5 className="font-bold text-sm flex-1 truncate text-gray-800">
          {getDisplayTypeName(schedule)}
        </h5>
        {schedule.segment_ribbon && (
          <span className={`px-2 py-0.5 rounded text-xs font-semibold ${(schedule.segment_type === 'return' || schedule.rentcar_phase === 'return') ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
            {schedule.segment_ribbon}
          </span>
        )}
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${schedule.re_status === 'confirmed' ? 'bg-green-100 text-green-800' : schedule.re_status === 'pending' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>
            {schedule.re_status === 'confirmed' ? '확정' : schedule.re_status === 'pending' ? '대기' : '취소'}
          </span>
          <button
            onClick={() => {
              setSelectedSchedule(schedule);
              if (schedule.users?.id) {
                loadAllUserReservations(schedule.users.id);
              }
            }}
            className="bg-blue-500 text-white py-0.5 px-2 rounded text-xs hover:bg-blue-600 transition-colors"
          >상세</button>
        </div>
      </div>
      {renderDbCardBody(schedule)}
    </div>
  );

  // DB 행에서 카드에 표시되는 모든 항목을 다중 라인 텍스트로 추출
  const getDbRowDetails = (schedule: any): string => {
    const row = schedule?.service_row || {};
    const table = schedule?.service_table || schedule?.re_type || '';
    const lines: string[] = [];

    if (schedule?.location) lines.push(`장소: ${schedule.location}`);

    if (table === 'reservation_cruise' || table === 'cruise') {
      const ci = schedule?.cruise_info || row?._cruise_info || row?.cruise_info || {};
      const cruiseName = ci?.cruise_name || ci?.cruise || row?.cruise_name;
      if (cruiseName) lines.push(`크루즈: ${cruiseName}`);
      const roomType = row?.room_type || ci?.room_type || ci?.room_name || row?.room_name;
      if (roomType) lines.push(`객실: ${roomType}`);
      if (row.checkin) lines.push(`체크인: ${row.checkin}`);
    } else if (table === 'reservation_airport' || table === 'airport') {
      if (row.ra_flight_number) lines.push(`항공편: ${row.ra_flight_number}`);
      if (row.ra_airport_location) lines.push(`공항: ${row.ra_airport_location}`);
      if (row.accommodation_info) lines.push(`숙소: ${row.accommodation_info}`);
      if (row.ra_passenger_count) lines.push(`👥 ${row.ra_passenger_count}명`);
      if (row.ra_car_count) lines.push(`🚗 ${row.ra_car_count}대`);
      if (row.ra_luggage_count) lines.push(`🧳 ${row.ra_luggage_count}개`);
      if (row.request_note) lines.push(`요청: ${row.request_note}`);
    } else if (table === 'reservation_hotel' || table === 'hotel') {
      if (row.checkin_date) lines.push(`체크인: ${row.checkin_date}`);
      if (row.nights) lines.push(`기간: ${row.nights}박`);
      if (row.guest_count) lines.push(`인원: ${row.guest_count}명`);
      if (row.room_count) lines.push(`객실: ${row.room_count}개`);
      if (row.request_note) lines.push(`요청: ${row.request_note}`);
    } else if (table === 'reservation_rentcar' || table === 'rentcar') {
      const ri = (row as any)._rentcar_info || {};
      if (ri.vehicle_type || row.vehicle_type) lines.push(`차종: ${ri.vehicle_type || row.vehicle_type}`);
      if (ri.route || row.route) lines.push(`경로: ${ri.route || row.route}`);
      if (row.way_type) lines.push(`구분: ${row.way_type}`);
      if (row.pickup_datetime) lines.push(`픽업: ${row.pickup_datetime}`);
      if (row.return_datetime) lines.push(`리턴: ${row.return_datetime}`);
      if (row.driver_count) lines.push(`👥 운전자 ${row.driver_count}명`);
      if (row.request_note) lines.push(`요청: ${row.request_note}`);
    } else if (table === 'reservation_tour' || table === 'tour') {
      const ti = (row as any)._tour_info || {};
      if (ti.tour_name) lines.push(`투어: ${ti.tour_name}`);
      if (row.tour_capacity) lines.push(`인원: ${row.tour_capacity}명`);
      if (row.pickup_location) lines.push(`픽업: ${row.pickup_location}`);
      if (row.dropoff_location) lines.push(`하차: ${row.dropoff_location}`);
      if (row.usage_date) lines.push(`이용일: ${row.usage_date}`);
      if (row.request_note) lines.push(`요청: ${row.request_note}`);
    } else if (table === 'reservation_ticket' || table === 'ticket') {
      if (row.ticket_name || row.program_selection) lines.push(`패키지: ${row.ticket_name || row.program_selection}`);
      if (row.ticket_quantity) lines.push(`수량: ${row.ticket_quantity}매`);
      if (row.usage_date) lines.push(`이용일: ${row.usage_date}`);
      if (row.pickup_location) lines.push(`픽업: ${row.pickup_location}`);
      if (row.dropoff_location) lines.push(`하차: ${row.dropoff_location}`);
      if (row.request_note) lines.push(`요청: ${row.request_note}`);
    } else if (table === 'reservation_car_sht') {
      if (row.vehicle_number) lines.push(`차량: ${row.vehicle_number}`);
      if (row.seat_number) lines.push(`좌석: ${row.seat_number}`);
      if (row.sht_category) lines.push(`분류: ${row.sht_category}`);
      const pickup = row.pickup_location || row.boarding_location;
      const dropoff = row.dropoff_location;
      if (pickup) lines.push(`승차: ${pickup}`);
      if (dropoff) lines.push(`하차: ${dropoff}`);
    } else if (table === 'reservation_cruise_car') {
      const ri = (row as any)._rentcar_info || {};
      if (ri.vehicle_type || row.vehicle_type) lines.push(`차종: ${ri.vehicle_type || row.vehicle_type}`);
      if (row.way_type) lines.push(`구분: ${row.way_type}`);
      if (row.pickup_location) lines.push(`승차: ${row.pickup_location}`);
      if (row.dropoff_location) lines.push(`하차: ${row.dropoff_location}`);
    }

    // 중복 라인 제거
    const seen = new Set<string>();
    const dedup = lines.filter(l => (seen.has(l) ? false : (seen.add(l), true)));
    return dedup.join('\n') || '-';
  };

  // DB 표 보기 (서비스 타입별 별도 표 — 각 타입에 맞는 컬럼 구성)
  const renderDbGrid = (list: any[]) => {
    // service_table 별로 그룹핑
    const groups: Record<string, any[]> = {};
    list.forEach((s) => {
      const t = s?.service_table || s?.re_type || 'unknown';
      (groups[t] ||= []).push(s);
    });
    const order = ['reservation_cruise', 'reservation_car_sht', 'reservation_cruise_car', 'reservation_airport', 'reservation_hotel', 'reservation_tour', 'reservation_rentcar', 'reservation_ticket'];
    const sortedKeys = Object.keys(groups).sort((a, b) => {
      const ai = order.indexOf(a); const bi = order.indexOf(b);
      return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
    });
    const labelOf = (t: string) => ({
      reservation_cruise: '🚢 크루즈',
      reservation_car_sht: '🚌 SHT 차량',
      reservation_cruise_car: '🚐 크루즈 차량',
      reservation_airport: '✈️ 공항',
      reservation_hotel: '🏨 호텔',
      reservation_tour: '🗺️ 투어',
      reservation_ticket: '📦 패키지',
      reservation_rentcar: '🚗 렌터카',
    } as Record<string, string>)[t] || t;

    const fmtDate = (v: any) => v ? new Date(v).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', weekday: 'short' }) : '-';
    const fmtDt = (v: any) => v ? new Date(v).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : '-';
    const statusBadge = (s: any) => (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${s.re_status === 'confirmed' ? 'bg-green-100 text-green-800' : s.re_status === 'pending' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>
        {s.re_status === 'confirmed' ? '확정' : s.re_status === 'pending' ? '대기' : '취소'}
      </span>
    );
    const actionBtn = (s: any) => (
      <button
        onClick={() => {
          setSelectedSchedule(s);
          if (s.users?.id) loadAllUserReservations(s.users.id);
        }}
        className="bg-blue-500 text-white py-1 px-2.5 rounded text-xs hover:bg-blue-600"
      >상세</button>
    );
    const cellCls = 'px-2 py-1.5 align-top text-xs text-gray-700 whitespace-nowrap';
    const headCls = 'px-2 py-2 text-left font-semibold';

    return (
      <div className="space-y-5">
        {sortedKeys.map((key) => {
          const rows = groups[key];
          return (
            <div key={key} className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
              <div className="px-3 py-2 bg-gray-50 border-b text-sm font-semibold text-gray-700">{labelOf(key)} <span className="text-xs text-gray-500 font-normal">({rows.length}건)</span></div>
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
                  {key === 'reservation_cruise' && (
                    <tr><th className={headCls}>고객</th><th className={headCls}>체크인</th><th className={headCls}>크루즈</th><th className={headCls}>객실</th><th className="px-2 py-2 text-right font-semibold">액션</th></tr>
                  )}
                  {key === 'reservation_car_sht' && (
                    <tr><th className={headCls}>고객</th><th className={headCls}>일자</th><th className={headCls}>차량</th><th className={headCls}>좌석</th><th className={headCls}>분류</th><th className={headCls}>승/하차 위치</th><th className="px-2 py-2 text-right font-semibold">액션</th></tr>
                  )}
                  {key === 'reservation_cruise_car' && (
                    <tr><th className={headCls}>고객</th><th className={headCls}>일자</th><th className={headCls}>차종</th><th className={headCls}>구분</th><th className={headCls}>승차</th><th className={headCls}>하차</th><th className="px-2 py-2 text-right font-semibold">액션</th></tr>
                  )}
                  {key === 'reservation_airport' && (
                    <tr><th className={headCls}>고객</th><th className={headCls}>일자</th><th className={headCls}>시간</th><th className={headCls}>항공편</th><th className={headCls}>공항</th><th className={headCls}>숙소</th><th className={headCls}>👥</th><th className={headCls}>🚗</th><th className={headCls}>🧳</th><th className={headCls}>요청</th><th className="px-2 py-2 text-right font-semibold">액션</th></tr>
                  )}
                  {key === 'reservation_hotel' && (
                    <tr><th className={headCls}>고객</th><th className={headCls}>체크인</th><th className={headCls}>박수</th><th className={headCls}>인원</th><th className={headCls}>객실수</th><th className={headCls}>요청</th><th className="px-2 py-2 text-right font-semibold">액션</th></tr>
                  )}
                  {key === 'reservation_tour' && (
                    <tr><th className={headCls}>고객</th><th className={headCls}>이용일</th><th className={headCls}>투어</th><th className={headCls}>인원</th><th className={headCls}>픽업</th><th className={headCls}>하차</th><th className={headCls}>요청</th><th className="px-2 py-2 text-right font-semibold">액션</th></tr>
                  )}
                  {key === 'reservation_ticket' && (
                    <tr><th className={headCls}>고객</th><th className={headCls}>이용일</th><th className={headCls}>패키지</th><th className={headCls}>수량</th><th className={headCls}>픽업</th><th className={headCls}>하차</th><th className={headCls}>요청</th><th className="px-2 py-2 text-right font-semibold">액션</th></tr>
                  )}
                  {key === 'reservation_rentcar' && (
                    <tr><th className={headCls}>고객</th><th className={headCls}>픽업</th><th className={headCls}>리턴</th><th className={headCls}>차종</th><th className={headCls}>경로</th><th className={headCls}>구분</th><th className={headCls}>운전자</th><th className={headCls}>요청</th><th className="px-2 py-2 text-right font-semibold">액션</th></tr>
                  )}
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {rows.map((s: any, i: number) => {
                    const r = s?.service_row || {};
                    const ci = s?.cruise_info || r?._cruise_info || r?.cruise_info || {};
                    const cust = s?.users?.name || '-';
                    const dateText = fmtDate(s?.schedule_date);
                    const timeText = s?.schedule_time || '-';
                    const ribbon = s.segment_ribbon ? (
                      <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${(s.segment_type === 'return' || s.rentcar_phase === 'return') ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>{s.segment_ribbon}</span>
                    ) : null;
                    const pickup = r.pickup_location || r.boarding_location;
                    const dropoff = r.dropoff_location;
                    const locationText = formatPickupDropoffText(pickup, dropoff);
                    const rowKey = `${s.re_id}-${s.service_table}-${s.segment_type || s.rentcar_phase || 'd'}-${i}`;
                    if (key === 'reservation_cruise') return (
                      <tr key={rowKey} className="hover:bg-blue-50/40"><td className={`${cellCls} font-semibold`}>{cust}</td><td className={cellCls}>{r.checkin || dateText}</td><td className={cellCls}>{ci?.cruise_name || ci?.cruise || '-'}</td><td className={cellCls}>{r.room_type || ci?.room_type || '-'}</td><td className="px-2 py-1.5 align-top text-right">{actionBtn(s)}</td></tr>
                    );
                    if (key === 'reservation_car_sht') return (
                      <tr key={rowKey} className="hover:bg-blue-50/40"><td className={`${cellCls} font-semibold`}>{cust}</td><td className={cellCls}>{dateText}</td><td className={cellCls}>{r.vehicle_number || '-'}</td><td className={cellCls}>{r.seat_number || '-'}</td><td className={cellCls}>{r.sht_category || '-'}</td><td className={pickupDropoffCellCls}>{locationText}</td><td className="px-2 py-1.5 align-top text-right">{actionBtn(s)}</td></tr>
                    );
                    if (key === 'reservation_cruise_car') {
                      const ri = (r as any)._rentcar_info || {};
                      return (
                        <tr key={rowKey} className="hover:bg-blue-50/40"><td className={`${cellCls} font-semibold`}>{cust}</td><td className={cellCls}>{dateText}</td><td className={cellCls}>{ri.vehicle_type || r.vehicle_type || '-'}</td><td className={cellCls}>{r.way_type || ribbon || '-'}</td><td className={cellCls}>{r.pickup_location || '-'}</td><td className={cellCls}>{r.dropoff_location || '-'}</td><td className="px-2 py-1.5 align-top text-right">{actionBtn(s)}</td></tr>
                      );
                    }
                    if (key === 'reservation_airport') return (
                      <tr key={rowKey} className="hover:bg-blue-50/40"><td className={`${cellCls} font-semibold`}>{cust}</td><td className={cellCls}>{dateText}</td><td className={cellCls}>{timeText}</td><td className={cellCls}>{r.ra_flight_number || '-'}</td><td className={cellCls}>{r.ra_airport_location || '-'}</td><td className={`${cellCls} max-w-[180px] truncate`} title={r.accommodation_info || ''}>{r.accommodation_info || '-'}</td><td className={cellCls}>{r.ra_passenger_count || 0}</td><td className={cellCls}>{r.ra_car_count || 0}</td><td className={cellCls}>{r.ra_luggage_count || 0}</td><td className={`${cellCls} whitespace-pre-line max-w-[200px] break-words`}>{r.request_note || '-'}</td><td className="px-2 py-1.5 align-top text-right">{actionBtn(s)}</td></tr>
                    );
                    if (key === 'reservation_hotel') return (
                      <tr key={rowKey} className="hover:bg-blue-50/40"><td className={`${cellCls} font-semibold`}>{cust}</td><td className={cellCls}>{r.checkin_date || dateText}</td><td className={cellCls}>{r.nights ? `${r.nights}박` : '-'}</td><td className={cellCls}>{r.guest_count ? `${r.guest_count}명` : '-'}</td><td className={cellCls}>{r.room_count ? `${r.room_count}개` : '-'}</td><td className={`${cellCls} whitespace-pre-line max-w-[260px] break-words`}>{r.request_note || '-'}</td><td className="px-2 py-1.5 align-top text-right">{actionBtn(s)}</td></tr>
                    );
                    if (key === 'reservation_tour') {
                      const ti = (r as any)._tour_info || {};
                      return (
                        <tr key={rowKey} className="hover:bg-blue-50/40"><td className={`${cellCls} font-semibold`}>{cust}</td><td className={cellCls}>{r.usage_date || dateText}</td><td className={cellCls}>{ti.tour_name || '-'}</td><td className={cellCls}>{r.tour_capacity ? `${r.tour_capacity}명` : '-'}</td><td className={cellCls}>{r.pickup_location || '-'}</td><td className={cellCls}>{r.dropoff_location || '-'}</td><td className={`${cellCls} whitespace-pre-line max-w-[220px] break-words`}>{r.request_note || '-'}</td><td className="px-2 py-1.5 align-top text-right">{actionBtn(s)}</td></tr>
                      );
                    }
                    if (key === 'reservation_ticket') return (
                      <tr key={rowKey} className="hover:bg-blue-50/40"><td className={`${cellCls} font-semibold`}>{cust}</td><td className={cellCls}>{r.usage_date || dateText}</td><td className={cellCls}>{r.ticket_name || r.program_selection || '-'}</td><td className={cellCls}>{r.ticket_quantity ? `${r.ticket_quantity}매` : '-'}</td><td className={cellCls}>{r.pickup_location || '-'}</td><td className={cellCls}>{r.dropoff_location || '-'}</td><td className={`${cellCls} whitespace-pre-line max-w-[220px] break-words`}>{r.request_note || '-'}</td><td className="px-2 py-1.5 align-top text-right">{actionBtn(s)}</td></tr>
                    );
                    if (key === 'reservation_rentcar') {
                      const ri = (r as any)._rentcar_info || {};
                      return (
                        <tr key={rowKey} className="hover:bg-blue-50/40"><td className={`${cellCls} font-semibold`}>{cust}</td><td className={cellCls}>{fmtDt(r.pickup_datetime)}</td><td className={cellCls}>{fmtDt(r.return_datetime)}</td><td className={cellCls}>{ri.vehicle_type || r.vehicle_type || '-'}</td><td className={cellCls}>{ri.route || r.route || '-'}</td><td className={cellCls}>{r.way_type || '-'}</td><td className={cellCls}>{r.driver_count ? `${r.driver_count}명` : '-'}</td><td className={`${cellCls} whitespace-pre-line max-w-[220px] break-words`}>{r.request_note || '-'}</td><td className="px-2 py-1.5 align-top text-right">{actionBtn(s)}</td></tr>
                      );
                    }
                    return null;
                  })}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    );
  };

  // 시트 표 보기 (서비스 타입별 컬럼)
  const renderSheetGrid = (serviceType: string, list: any[]) => {
    const fmtDate = (d: Date | null) => d ? d.toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit', weekday: 'short' }) : '-';
    const headCls = 'px-2 py-2 text-left font-semibold';
    const cellCls = 'px-2 py-1.5 align-top text-xs text-gray-700 whitespace-nowrap';
    const statusOf = (r: any, isPast: boolean) => (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${isPast ? 'bg-gray-200 text-gray-700' : 'bg-blue-100 text-blue-800'}`}>{isPast ? '완료' : '예정'}</span>
    );
    const actionBtn = (r: any) => (
      <button onClick={() => handleOpenGoogleSheetsDetail(r)} className="bg-blue-500 text-white py-1 px-2.5 rounded text-xs hover:bg-blue-600">상세</button>
    );
    const custCell = (r: any) => (
      <span className="font-semibold text-gray-800">{r.customerName || '-'}{r.customerEnglishName && (<span className="ml-1 text-xs text-gray-400 font-normal">({r.customerEnglishName})</span>)}</span>
    );

    let head: React.ReactNode = null;
    let body: React.ReactNode = null;

    if (serviceType === 'cruise') {
      head = (<tr><th className={headCls}>고객</th><th className={headCls}>체크인</th><th className={headCls}>크루즈</th><th className={headCls}>객실</th><th className={headCls}>할인</th><th className="px-2 py-2 text-right font-semibold">액션</th></tr>);
      body = list.map((r: any, i: number) => {
        const isPast = isPastDate(r.checkin);
        const room = `${r.roomType || ''}${r.category ? ` (${r.category})` : ''}`.trim();
        return (<tr key={`${r.orderId}-${i}`} className={`hover:bg-blue-50/40 ${isPast ? 'opacity-60' : ''}`}><td className={cellCls}>{custCell(r)}</td><td className={cellCls}>{fmtDate(parseDate(r.checkin))}</td><td className={cellCls}>{r.cruise || '-'}</td><td className={cellCls}>{room || '-'}</td><td className={cellCls}>{r.discount || '-'}</td><td className="px-2 py-1.5 align-top text-right">{actionBtn(r)}</td></tr>);
      });
    } else if (serviceType === 'vehicle') {
      head = (<tr><th className={headCls}>고객</th><th className={headCls}>탑승일</th><th className={headCls}>차량</th><th className={headCls}>좌석</th><th className={headCls}>분류</th><th className={headCls}>승/하차 위치</th><th className="px-2 py-2 text-right font-semibold">액션</th></tr>);
      body = list.map((r: any, i: number) => {
        const isPast = isPastDate(r.boardingDate);
        const pickup = r.pickupLocation || r.boardingLocation;
        const dropoff = r.dropoffLocation;
        const locationText = formatPickupDropoffText(pickup, dropoff);
        return (<tr key={`${r.orderId}-${i}`} className={`hover:bg-blue-50/40 ${isPast ? 'opacity-60' : ''}`}><td className={cellCls}>{custCell(r)}</td><td className={cellCls}>{fmtDate(parseDate(r.boardingDate))}</td><td className={cellCls}>{r.vehicleNumber || '-'}</td><td className={cellCls}>{r.seatNumber || '-'}</td><td className={cellCls}>{r.category || '-'}</td><td className={pickupDropoffCellCls}>{locationText}</td><td className="px-2 py-1.5 align-top text-right">{actionBtn(r)}</td></tr>);
      });
    } else if (serviceType === 'airport') {
      head = (<tr><th className={headCls}>고객</th><th className={headCls}>일자</th><th className={headCls}>시간</th><th className={headCls}>구분</th><th className={headCls}>경로</th><th className={headCls}>공항</th><th className={headCls}>편명</th><th className={headCls}>숙박지</th><th className={headCls}>👥</th><th className={headCls}>🚗</th><th className={headCls}>🧳</th><th className="px-2 py-2 text-right font-semibold">액션</th></tr>);
      body = list.map((r: any, i: number) => {
        const isPast = isPastDate(r.date);
        const tag = `${r.tripType || ''} ${r.category || ''}`.trim();
        const rawPlace = String(r.placeName || '').trim();
        const place = /^updating$/i.test(rawPlace) ? '-' : (rawPlace || '-');
        return (<tr key={`${r.orderId}-${i}`} className={`hover:bg-blue-50/40 ${isPast ? 'opacity-60' : ''}`}><td className={cellCls}>{custCell(r)}</td><td className={cellCls}>{fmtDate(parseDate(r.date))}</td><td className={cellCls}>{r.time || '-'}</td><td className={cellCls}>{tag || '-'}</td><td className={cellCls}>{r.route || '-'}</td><td className={cellCls}>{r.airportName || '-'}</td><td className={cellCls}>{r.flightNumber || '-'}</td><td className={`${cellCls} max-w-[160px] truncate`} title={place}>{place}</td><td className={cellCls}>{r.passengerCount || 0}</td><td className={cellCls}>{r.carCount || 0}</td><td className={cellCls}>{r.carrierCount || 0}</td><td className="px-2 py-1.5 align-top text-right">{actionBtn(r)}</td></tr>);
      });
    } else if (serviceType === 'hotel') {
      head = (<tr><th className={headCls}>고객</th><th className={headCls}>체크인</th><th className={headCls}>호텔</th><th className={headCls}>객실</th><th className={headCls}>박수</th><th className={headCls}>조식</th><th className={headCls}>성인</th><th className={headCls}>아동</th><th className={headCls}>유아</th><th className={headCls}>객실수</th><th className="px-2 py-2 text-right font-semibold">액션</th></tr>);
      body = list.map((r: any, i: number) => {
        const isPast = isPastDate(r.checkinDate);
        return (<tr key={`${r.orderId}-${i}`} className={`hover:bg-blue-50/40 ${isPast ? 'opacity-60' : ''}`}><td className={cellCls}>{custCell(r)}</td><td className={cellCls}>{fmtDate(parseDate(r.checkinDate))}</td><td className={cellCls}>{r.hotelName || '-'}</td><td className={cellCls}>{r.roomName || r.roomType || '-'}</td><td className={cellCls}>{r.days || 0}박</td><td className={cellCls}>{r.breakfastService ? '🍳' : '-'}</td><td className={cellCls}>{r.adult || 0}</td><td className={cellCls}>{r.child || 0}</td><td className={cellCls}>{r.toddler || 0}</td><td className={cellCls}>{r.roomCount || 0}</td><td className="px-2 py-1.5 align-top text-right">{actionBtn(r)}</td></tr>);
      });
    } else if (serviceType === 'tour') {
      head = (<tr><th className={headCls}>고객</th><th className={headCls}>시작일</th><th className={headCls}>투어</th><th className={headCls}>종류</th><th className={headCls}>픽업</th><th className={headCls}>인원</th><th className={headCls}>메모</th><th className="px-2 py-2 text-right font-semibold">액션</th></tr>);
      body = list.map((r: any, i: number) => {
        const isPast = isPastDate(r.startDate);
        return (<tr key={`${r.orderId}-${i}`} className={`hover:bg-blue-50/40 ${isPast ? 'opacity-60' : ''}`}><td className={cellCls}>{custCell(r)}</td><td className={cellCls}>{fmtDate(parseDate(r.startDate))}</td><td className={cellCls}>{r.tourName || '-'}</td><td className={cellCls}>{r.tourType || '-'}</td><td className={cellCls}>{r.pickupLocation || '-'}</td><td className={cellCls}>{r.participants || 0}명</td><td className={`${cellCls} whitespace-pre-line max-w-[220px] break-words`}>{r.memo || '-'}</td><td className="px-2 py-1.5 align-top text-right">{actionBtn(r)}</td></tr>);
      });
    } else if (serviceType === 'rentcar') {
      head = (<tr><th className={headCls}>고객</th><th className={headCls}>픽업일</th><th className={headCls}>시간</th><th className={headCls}>차량</th><th className={headCls}>구분</th><th className={headCls}>경로</th><th className={headCls}>위치</th><th className={headCls}>사용기간</th><th className={headCls}>👥</th><th className={headCls}>🚗</th><th className="px-2 py-2 text-right font-semibold">액션</th></tr>);
      body = list.map((r: any, i: number) => {
        const isPast = isPastDate(r.pickupDate);
        const loc = [r.pickupLocation, r.destination].filter(Boolean).join(' → ');
        return (<tr key={`${r.orderId}-${i}`} className={`hover:bg-blue-50/40 ${isPast ? 'opacity-60' : ''}`}><td className={cellCls}>{statusOf(r, isPast)}</td><td className={cellCls}>{custCell(r)}</td><td className={cellCls}>{fmtDate(parseDate(r.pickupDate))}</td><td className={cellCls}>{r.pickupTime || '-'}</td><td className={cellCls}>{r.carType || '-'}</td><td className={cellCls}>{r.tripType || '-'}</td><td className={cellCls}>{r.route || '-'}</td><td className={cellCls}>{loc || '-'}</td><td className={cellCls}>{r.usagePeriod || '-'}</td><td className={cellCls}>{r.passengerCount || 0}</td><td className={cellCls}>{r.carCount || 0}</td><td className="px-2 py-1.5 align-top text-right">{actionBtn(r)}</td></tr>);
      });
    } else if (serviceType === 'car') {
      head = (<tr><th className={headCls}>구분</th><th className={headCls}>고객</th><th className={headCls}>일자</th><th className={headCls}>시간</th><th className={headCls}>차량</th><th className={headCls}>장소</th><th className={headCls}>👥</th><th className={headCls}>🚗</th><th className="px-2 py-2 text-right font-semibold">액션</th></tr>);
      body = list.map((r: any, i: number) => {
        const pd = parseDate(r.pickupDatetime);
        const isPast = isPastDate(r.pickupDatetime);
        const loc = r.segmentType === 'return' ? r.dropoffLocation : r.pickupLocation;
        const phaseLabel = r.segmentRibbon || (r.segmentType === 'return' ? '리턴' : '픽업');
        const phaseColor = r.segmentType === 'return' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700';
        return (<tr key={`${r.orderId}-${i}`} className={`hover:bg-blue-50/40 ${isPast ? 'opacity-60' : ''}`}><td className={cellCls}>{statusOf(r, isPast)}</td><td className={cellCls}><span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${phaseColor}`}>{phaseLabel}</span></td><td className={cellCls}>{custCell(r)}</td><td className={cellCls}>{fmtDate(pd)}</td><td className={cellCls}>{pd ? pd.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }) : '-'}</td><td className={cellCls}>{r.carType || '-'}</td><td className={cellCls}>{loc || '-'}</td><td className={cellCls}>{r.passengerCount || 0}</td><td className={cellCls}>{r.carCount || 0}</td><td className="px-2 py-1.5 align-top text-right">{actionBtn(r)}</td></tr>);
      });
    } else {
      // fallback: renderSheetTable 으로
      return renderSheetTable(list);
    }

    return (
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-xs uppercase">{head}</thead>
          <tbody className="divide-y divide-gray-100 bg-white">{body}</tbody>
        </table>
      </div>
    );
  };

  // DB 테이블 렌더 (가독성 좋은 컴팩트 테이블)
  const renderDbTable = (list: any[]) => (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wider">
          <tr>
            <th className="px-3 py-2.5 text-left font-semibold">타입</th>
            <th className="px-3 py-2.5 text-left font-semibold">고객명</th>
            <th className="px-3 py-2.5 text-left font-semibold">일자</th>
            <th className="px-3 py-2.5 text-left font-semibold">시간</th>
            <th className="px-3 py-2.5 text-left font-semibold">서비스 정보</th>
            <th className="px-3 py-2.5 text-left font-semibold">구분</th>
            <th className="px-3 py-2.5 text-right font-semibold">액션</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {list.map((schedule: any, idx: number) => {
            const dateText = schedule?.schedule_date
              ? new Date(schedule.schedule_date).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', weekday: 'short' })
              : '-';
            const serviceType = schedule?.service_table || schedule?.re_type || '';
            const shouldShowTime = serviceType === 'reservation_airport' || serviceType === 'reservation_rentcar' || serviceType === 'airport' || serviceType === 'rentcar' || serviceType === 'reservation_car_sht' || serviceType === 'reservation_cruise_car';
            const timeText = shouldShowTime ? (schedule?.schedule_time || '-') : '-';
            const customerName = schedule?.users?.name || '-';
            const details = getDbRowDetails(schedule);
            return (
              <tr
                key={`${schedule.re_id}-${schedule.service_table}-${schedule.segment_type || schedule.rentcar_phase || 'd'}-${idx}`}
                className="hover:bg-blue-50/40 transition-colors"
              >
                <td className="px-3 py-2 align-top whitespace-nowrap">
                  <div className="flex items-center gap-1.5">
                    {getDisplayTypeIcon(schedule)}
                    <span className="text-gray-700 font-medium">{getDisplayTypeName(schedule)}</span>
                  </div>
                </td>
                <td className="px-3 py-2 align-top font-semibold text-gray-800 whitespace-nowrap">{customerName}</td>
                <td className="px-3 py-2 align-top text-gray-700 whitespace-nowrap">{dateText}</td>
                <td className="px-3 py-2 align-top text-gray-700 whitespace-nowrap tabular-nums">{timeText}</td>
                <td className="px-3 py-2 align-top text-gray-700 whitespace-pre-line text-xs leading-5 max-w-[420px] break-words">{details}</td>
                <td className="px-3 py-2 align-top whitespace-nowrap">
                  {schedule.segment_ribbon ? (
                    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${(schedule.segment_type === 'return' || schedule.rentcar_phase === 'return') ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                      {schedule.segment_ribbon}
                    </span>
                  ) : <span className="text-gray-300">-</span>}
                </td>
                <td className="px-3 py-2 align-top text-right whitespace-nowrap">
                  <button
                    onClick={() => {
                      setSelectedSchedule(schedule);
                      if (schedule.users?.id) {
                        loadAllUserReservations(schedule.users.id);
                      }
                    }}
                    className="bg-blue-500 text-white py-1 px-2.5 rounded text-xs hover:bg-blue-600 transition-colors"
                  >상세</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  // DB 목록 렌더 (보기 모드에 따라 카드/표 자동 전환)
  const renderDbList = (list: any[]) => {
    if (displayMode === 'grid') return renderDbGrid(list);
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {list.map((schedule: any, idx: number) => renderDbScheduleCard(schedule, idx))}
      </div>
    );
  };

  const getDisplayTypeIcon = (schedule: any) => {
    const type = getScheduleServiceType(schedule);
    return getTypeIcon(type === 'sht' ? 'vehicle' : type);
  };

  // 크루즈명 + 객실타입 표시용 유틸 (가용 필드에서 최대한 추출)
  const getCruiseNameAndRoom = (row: any) => {
    const cruise =
      row?.cruise_name ||
      row?.cruise ||
      row?.cruise_title ||
      row?.room_cruise ||
      '';
    const roomType =
      row?.room_type ||
      row?.room_category ||
      row?.room ||
      '';
    const code = row?.room_price_code || '';
    const left = cruise || (code ? `코드:${code}` : '크루즈');
    const right = roomType;
    return [left, right].filter(Boolean).join(' ');
  };

  // 크루즈 레이블을 '크루즈 / 객실타입' 형식으로 반환 (슬래시 앞뒤 공백 포함)
  const formatCruiseLabel = (schedule: any) => {
    const row = schedule?.service_row || {};
    const info = schedule?.cruise_info || {};
    const cruise = info?.cruise || row?.cruise_name || row?.cruise || row?.cruise_title || '';
    const roomType = info?.room_type || row?.room_type || row?.room_category || row?.room || '';
    if (cruise && roomType) return `${cruise} / ${roomType}`;
    if (cruise) return cruise;
    if (roomType) return roomType;
    // fallback to existing heuristic
    // replace only the first whitespace between cruise and room with ' / '
    return getCruiseNameAndRoom(row).replace(/\s+/, ' / ');
  };

  // 시간 무시, 날짜(YYYY-MM-DD) 기준으로만 분류
  // 현지 날짜 기준으로 비교 (UTC 변환 오류 방지)
  const isSameLocalDate = (d1: Date, d2: Date) =>
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate();

  // 주/월간 포함 범위 비교 (양끝 포함)
  const isDateInRange = (date: Date, start: Date, end: Date) => {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const s = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const e = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    return d >= s && d <= e;
  };

  const typeFilteredSchedules = schedules.filter(schedule => {
    if (typeFilter !== 'all') {
      if (getScheduleServiceType(schedule) !== typeFilter) {
        return false;
      }
    }
    return true;
  });

  // DB 검색: 검색어가 있으면 날짜 필터를 무시하고 전체(DB)에서 검색
  let filteredSchedules = typeFilteredSchedules;
  if (activeSearchQuery.trim()) {
    const query = activeSearchQuery.toLowerCase().trim();
    filteredSchedules = typeFilteredSchedules.filter(schedule => {
      const row = schedule.service_row || {};
      const searchFields = [
        schedule.re_id,
        schedule.re_type,
        schedule.re_status,
        schedule.location,
        schedule.users?.name,
        schedule.users?.email,
        row.room_price_code,
        row.car_price_code,
        row.rentcar_price_code,
        row.airport_price_code,
        row.hotel_price_code,
        row.tour_price_code,
        row.checkin,
        row.ra_airport_location,
        row.ra_flight_number,
        row.pickup_location,
        row.dropoff_location,
        row.destination,
        row.hotel_category,
        row.sht_category,
        row.vehicle_number,
      ];
      return searchFields.some(field => field && String(field).toLowerCase().includes(query));
    });
  } else {
    // 검색어가 없을 때만 날짜 범위 필터 적용
    filteredSchedules = typeFilteredSchedules.filter(schedule => {
      if (!schedule.schedule_date) return false;
      if (viewMode === 'day') return isSameLocalDate(schedule.schedule_date, selectedDate);
      const { start, end } = getRange(selectedDate, viewMode);
      return isDateInRange(schedule.schedule_date, start, end);
    });
  }

  // 중복 제거: 동일 상세행(id)만 제거하고, 같은 예약의 다건 상세는 유지
  const uniqueSchedules = filteredSchedules.filter((schedule, index, self) =>
    index === self.findIndex((s) => {
      const sRowId = s?.service_row?.id || '';
      const rowId = schedule?.service_row?.id || '';
      if (sRowId && rowId) {
        return s.re_id === schedule.re_id
          && s.service_table === schedule.service_table
          && sRowId === rowId
          && (s.segment_type || '') === (schedule.segment_type || '')
          && (s.rentcar_phase || '') === (schedule.rentcar_phase || '');
      }
      return s.re_id === schedule.re_id
        && s.service_table === schedule.service_table
        && (s.segment_type || '') === (schedule.segment_type || '')
        && (s.rentcar_phase || '') === (schedule.rentcar_phase || '')
        && (s.schedule_time || '') === (schedule.schedule_time || '')
        && (s.location || '') === (schedule.location || '');
    })
  );

  // 서비스 타입별 그룹
  const groupedByType: Record<string, any[]> = uniqueSchedules.reduce(
    (acc: Record<string, any[]>, cur) => {
      const k = getScheduleServiceType(cur) || 'other';
      (acc[k] ||= []).push(cur);
      return acc;
    },
    {}
  );
  const dbServiceOrder = ['cruise', 'vehicle', 'sht', 'airport', 'hotel', 'tour', 'rentcar', 'package', 'ticket', 'car', 'other'];
  const sortDbServiceEntries = <T,>(entries: [string, T][]) =>
    [...entries].sort(([typeA], [typeB]) => {
      const idxA = dbServiceOrder.indexOf(typeA);
      const idxB = dbServiceOrder.indexOf(typeB);
      const rankA = idxA === -1 ? 999 : idxA;
      const rankB = idxB === -1 ? 999 : idxB;
      return rankA - rankB;
    });
  const groupedByTypeEntries = sortDbServiceEntries(Object.entries(groupedByType));

  // 날짜(YYYY-MM-DD) 기준 그룹 (주/월간 일별 그룹화용)
  const toKey = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const weekdayShort = ['일', '월', '화', '수', '목', '금', '토'];
  const formatDateLabel = (d: Date) => {
    const dateStr = d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
    return `${dateStr} (${weekdayShort[d.getDay()]})`;
  };
  const groupedByDate: Record<string, any[]> = uniqueSchedules.reduce(
    (acc: Record<string, any[]>, cur) => {
      const k = toKey(cur.schedule_date);
      (acc[k] ||= []).push(cur);
      return acc;
    },
    {}
  );

  // 날짜 범위 계산 (디버그용)
  const { start: rangeStart, end: rangeEnd } = viewMode === 'day'
    ? { start: selectedDate, end: selectedDate }
    : getRange(selectedDate, viewMode);

  console.log('📅 필터 날짜 범위:', {
    시작: toLocalDateString(rangeStart),
    종료: toLocalDateString(rangeEnd),
    viewMode
  });

  // Google Sheets 데이터 필터링
  let filteredGoogleSheets = googleSheetsData.filter(reservation => {
    let targetDate: Date | null = null;
    let dateType = '';
    let dateFieldValue = '';

    // 각 서비스 타입별 날짜 필드 확인
    if (reservation.checkin) {
      // 크루즈 데이터
      dateFieldValue = reservation.checkin;
      targetDate = parseDate(reservation.checkin);
      dateType = '크루즈 체크인';
    } else if (reservation.pickupDatetime) {
      // 차량 데이터
      dateFieldValue = reservation.pickupDatetime;
      targetDate = parseDate(reservation.pickupDatetime);
      dateType = '차량 승차일시';
    } else if (reservation.boardingDate) {
      // 스하차량 데이터
      dateFieldValue = reservation.boardingDate;
      targetDate = parseDate(reservation.boardingDate);
      dateType = '스하차량 승차일';
    } else if (reservation.date) {
      // 공항 데이터
      dateFieldValue = reservation.date;
      targetDate = parseDate(reservation.date);
      dateType = '공항 일자';
    } else if (reservation.checkinDate) {
      // 호텔 데이터
      dateFieldValue = reservation.checkinDate;
      targetDate = parseDate(reservation.checkinDate);
      dateType = '호텔 체크인';
    } else if (reservation.startDate) {
      // 투어 데이터
      dateFieldValue = reservation.startDate;
      targetDate = parseDate(reservation.startDate);
      dateType = '투어 시작일';
    } else if (reservation.pickupDate) {
      // 렌트카 데이터
      dateFieldValue = reservation.pickupDate;
      targetDate = parseDate(reservation.pickupDate);
      dateType = '렌트카 승차일';
    }

    // 날짜가 없는 데이터는 필터링에서 제외
    if (!targetDate) {
      const serviceType = reservation.cruise ? '크루즈' :
        reservation.carType && reservation.pickupDatetime ? '차량' :
          reservation.vehicleNumber ? '스하차량' :
            reservation.airportName ? '공항' :
              reservation.hotelName ? '호텔' :
                reservation.tourName ? '투어' :
                  reservation.carCode && reservation.pickupDate ? '렌트카' : '미확인';
      // 매우 드물게만 로깅 (0.1% 확률)
      if (Math.random() < 0.001) {
        console.log(`⚠️ 날짜 없는 ${serviceType} 제외:`, reservation.orderId);
      }
      return false; // ✅ 날짜 없으면 표시 안함
    }    // 날짜 범위 필터링
    if (viewMode === 'day') {
      const result = isSameLocalDate(targetDate, selectedDate);
      return result;
    }
    const { start, end } = getRange(selectedDate, viewMode);
    const result = isDateInRange(targetDate, start, end);

    // 디버깅: 랜덤 샘플링으로 로그 확인
    if (Math.random() < 0.005) {
      const formatLocalDate = (d: Date) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };
      console.log('🔎 날짜 비교:', {
        orderId: reservation.orderId,
        원본날짜: dateFieldValue,
        파싱결과: formatLocalDate(targetDate),
        범위시작: formatLocalDate(start),
        범위종료: formatLocalDate(end),
        매칭: result ? '✅' : '❌'
      });
    }

    return result;
  });

  // 검색어 필터링 (모든 데이터에서 검색, 날짜 필터 무시)
  if (activeSearchQuery.trim()) {
    const query = activeSearchQuery.toLowerCase().trim();
    filteredGoogleSheets = googleSheetsData.filter(item => {
      // 모든 필드에서 검색
      const searchFields = [
        item.orderId,
        item.customerName,
        item.customerEnglishName,
        item.email,
        item.cruise,
        item.carType,
        item.vehicleNumber,
        item.seatNumber,
        item.airportName,
        item.flightNumber,
        item.hotelName,
        item.roomName,
        item.tourName,
        item.pickupLocation,
        item.dropoffLocation,
        item.placeName,
        item.destination,
        item.route,
        item.note,
        item.memo,
        item.requestNote
      ];
      return searchFields.some(field =>
        field && String(field).toLowerCase().includes(query)
      );
    });
  }

  // 필터링 결과 로깅
  console.log('🔍 필터링 결과:');
  console.log('  전체데이터:', googleSheetsData.length, '건');
  console.log('  필터링후:', filteredGoogleSheets.length, '건');
  console.log('  현재 선택 날짜:', toLocalDateString(selectedDate));
  console.log('  뷰모드:', viewMode);

  // 서비스별 필터링 결과
  const filteredServiceCounts = {
    cruise: filteredGoogleSheets.filter(d => d.cruise).length,
    car: filteredGoogleSheets.filter(d => d.carType && d.pickupDatetime).length,
    vehicle: filteredGoogleSheets.filter(d => d.vehicleNumber).length,
    airport: filteredGoogleSheets.filter(d => d.airportName).length,
    hotel: filteredGoogleSheets.filter(d => d.hotelName).length,
    tour: filteredGoogleSheets.filter(d => d.tourName).length,
    rentcar: filteredGoogleSheets.filter(d => d.carCode && d.pickupDate).length
  };
  console.log('  서비스별 필터링 결과:');
  Object.entries(filteredServiceCounts).forEach(([type, count]) => {
    if (count > 0) console.log(`    ${type}: ${count}건`);
  });

  const navigateDate = (direction: 'prev' | 'next') => {
    const newDate = new Date(selectedDate);
    if (viewMode === 'day') {
      newDate.setDate(newDate.getDate() + (direction === 'next' ? 1 : -1));
    } else if (viewMode === 'week') {
      newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7));
    } else {
      newDate.setMonth(newDate.getMonth() + (direction === 'next' ? 1 : -1));
    }
    setSelectedDate(newDate);
  };

  const toDateInputValue = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const handleDateInputChange = (value: string) => {
    const [y, m, d] = value.split('-').map(Number);
    if (!y || !m || !d) return;
    setSelectedDate(new Date(y, m - 1, d, 0, 0, 0, 0));
    if (viewMode !== 'day') setViewMode('day');
  };

  const openDatePicker = () => {
    const input = datePickerRef.current;
    if (!input) return;
    if (typeof (input as any).showPicker === 'function') {
      (input as any).showPicker();
      return;
    }
    input.focus();
    input.click();
  };

  // Google Sheets 데이터 타입 확인 함수들
  const isCruiseData = (item: any): item is SHRReservation => {
    return 'checkin' in item && 'cruise' in item;
  };

  const isVehicleData = (item: any): item is SHCCReservation => {
    return 'boardingDate' in item && 'vehicleNumber' in item;
  };

  const isAirportData = (item: any): item is SHPReservation => {
    return 'airportName' in item && 'flightNumber' in item;
  };

  const isHotelData = (item: any): item is SHHReservation => {
    return 'hotelName' in item && 'checkinDate' in item;
  };

  const isTourData = (item: any): item is SHTReservation => {
    return 'tourName' in item && 'startDate' in item;
  };

  const isRentcarData = (item: any): item is SHRCReservation => {
    return 'pickupDate' in item && 'usagePeriod' in item;
  };

  const isCarData = (item: any): item is SHCReservation => {
    return 'pickupDatetime' in item && !('boardingDate' in item) && !('pickupDate' in item);
  };

  // 서비스 타입 판별 함수
  const getServiceType = (reservation: any): string => {
    if (isCruiseData(reservation)) return 'cruise';
    if (isVehicleData(reservation)) return 'vehicle';
    if (isAirportData(reservation)) return 'airport';
    if (isHotelData(reservation)) return 'hotel';
    if (isTourData(reservation)) return 'tour';
    if (isRentcarData(reservation)) return 'rentcar';
    if (isCarData(reservation)) return 'car';
    return 'unknown';
  };

  // 서비스 타입별 아이콘 및 이름
  const getServiceInfo = (type: string) => {
    const serviceMap: Record<string, { icon: React.ReactNode; name: string; color: string }> = {
      cruise: { icon: <Ship className="w-5 h-5" />, name: '크루즈', color: 'blue' },
      car: { icon: <Car className="w-5 h-5" />, name: '차량', color: 'blue' },
      vehicle: { icon: <Car className="w-5 h-5" />, name: '스하차량', color: 'purple' },
      airport: { icon: <Plane className="w-5 h-5" />, name: '공항', color: 'green' },
      hotel: { icon: <Building className="w-5 h-5" />, name: '호텔', color: 'orange' },
      tour: { icon: <MapPin className="w-5 h-5" />, name: '투어', color: 'red' },
      rentcar: { icon: <Car className="w-5 h-5" />, name: '렌트카', color: 'indigo' }
    };
    return serviceMap[type] || { icon: <Calendar className="w-5 h-5" />, name: '기타', color: 'gray' };
  };

  // 서비스별 그룹화
  const groupedByService = filteredGoogleSheets.reduce((acc: Record<string, any[]>, reservation) => {
    const serviceType = getServiceType(reservation);
    (acc[serviceType] ||= []).push(reservation);
    return acc;
  }, {});

  // 필터링 결과 로그
  console.log('🔍 필터링 결과:');
  console.log('  전체데이터:', googleSheetsData.length, '건');
  console.log('  필터링후:', filteredGoogleSheets.length, '건');
  console.log('  현재 선택 날짜:', selectedDate.toISOString().split('T')[0]);
  console.log('  뷰모드:', viewMode);
  console.log('  서비스별 필터링 결과:');
  Object.entries(groupedByService).forEach(([type, items]) => {
    console.log(`    ${type}: ${items.length}건`);
  });

  // 필터링된 데이터 샘플 확인 (처음 3개)
  if (filteredGoogleSheets.length > 0) {
    console.log('  📋 필터링된 데이터 샘플:');
    filteredGoogleSheets.slice(0, 3).forEach((item, idx) => {
      const dateField = item.checkin || item.pickupDatetime || item.boardingDate ||
        item.date || item.checkinDate || item.startDate || item.pickupDate;
      console.log(`    [${idx + 1}] ${item.orderId} - 날짜: ${dateField}`);
    });
  }

  // Google Sheets 예약 카드 렌더링
  const renderGoogleSheetsCard = (reservation: any, index: number) => {
    // 1. 크루즈 데이터
    if (isCruiseData(reservation)) {
      const checkinDate = parseDate(reservation.checkin);
      const isPast = isPastDate(reservation.checkin);

      return (
        <div
          key={`${reservation.orderId}-${index}`}
          className={`bg-gray-50 border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-all p-3 flex flex-col h-full ${isPast ? 'opacity-60' : ''}`}
        >
          <div className="flex items-center gap-2 mb-2 pb-1 border-b border-gray-100">
            <div className="flex items-center justify-center w-9 h-9 rounded-full bg-blue-50 border border-blue-200">
              <Ship className="w-5 h-5 text-blue-600" />
            </div>
            <h5 className="font-bold text-sm flex-1 truncate text-gray-800">
              크루즈
            </h5>
            <div className="flex items-center gap-2">
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-medium ${isPast
                  ? 'bg-gray-200 text-gray-700'
                  : 'bg-blue-100 text-blue-800'
                  }`}
              >
                {isPast ? '완료' : '예정'}
              </span>
              <button
                onClick={() => handleOpenGoogleSheetsDetail(reservation)}
                className="bg-blue-500 text-white py-0.5 px-2 rounded text-xs hover:bg-blue-600 transition-colors"
              >
                상세
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-1 text-sm text-gray-700 mt-1">
            {reservation.customerName && (
              <div className="flex items-center gap-2 mb-1 pb-1 border-b border-gray-100">
                <span className="font-bold text-blue-700 text-base">
                  {reservation.customerName}
                </span>
                {reservation.customerEnglishName && (
                  <span className="text-xs text-gray-400">
                    ({reservation.customerEnglishName})
                  </span>
                )}
              </div>
            )}
            <div className="flex items-start gap-2">
              <span className="font-semibold text-gray-500 text-xs mt-0.5">크루즈</span>
              <span className="text-sm font-bold text-blue-700 break-words">{reservation.cruise}</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-semibold text-gray-500 text-xs mt-0.5">객실</span>
              <span className="text-sm break-words">{reservation.roomType} {reservation.category && `(${reservation.category})`}</span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <Calendar className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-medium">
                {checkinDate?.toLocaleDateString('ko-KR')}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-500 text-xs">인원</span>
              <span className="text-sm">
                {reservation.adult > 0 && `👨 ${reservation.adult}명`}
                {reservation.child > 0 && ` 👶 ${reservation.child}명`}
                {reservation.toddler > 0 && ` 🍼 ${reservation.toddler}명`}
                {reservation.adult === 0 && reservation.child === 0 && reservation.toddler === 0 && (
                  <span className="text-gray-400">-</span>
                )}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-500 text-xs">객실수</span>
              <span className="text-sm">{reservation.roomCount}개</span>
            </div>
            {reservation.discount && (
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-500 text-xs">할인</span>
                <span className="text-sm text-green-600">{reservation.discount}</span>
              </div>
            )}
            {reservation.requestNote && (() => {
              const filtered = reservation.requestNote
                .replace(/\[CHILD_OLDER_COUNTS:[^\]]*\]\s*/gi, '')
                .replace(/\[옵션\s*\d+\][\s\S]*?(?=\n|$)/g, '')
                .trim();
              return filtered ? (
                <div className="flex items-start gap-2 mt-2 pt-2 border-t border-gray-200">
                  <span className="font-semibold text-orange-600 text-xs whitespace-nowrap">📝</span>
                  <span className="text-sm text-gray-700 leading-relaxed">{filtered}</span>
                </div>
              ) : null;
            })()}
          </div>
        </div>
      );
    }

    // 2. 스하차량 데이터
    else if (isVehicleData(reservation)) {
      console.log('🚙 스하차량 렌더링:', {
        orderId: reservation.orderId,
        boardingDate: reservation.boardingDate,
        vehicleNumber: reservation.vehicleNumber,
        customerName: reservation.customerName
      });
      const boardingDate = parseDate(reservation.boardingDate);
      console.log('📅 파싱된 날짜:', boardingDate);
      const isPast = isPastDate(reservation.boardingDate);

      return (
        <div
          key={`${reservation.orderId}-${index}`}
          className={`bg-gray-50 border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-all p-3 flex flex-col h-full ${isPast ? 'opacity-60' : ''}`}
        >
          <div className="flex items-center gap-2 mb-2 pb-1 border-b border-gray-100">
            <div className="flex items-center justify-center w-9 h-9 rounded-full bg-purple-50 border border-purple-200">
              <Car className="w-5 h-5 text-purple-600" />
            </div>
            <h5 className="font-bold text-sm flex-1 truncate text-gray-800">
              스하차량
            </h5>
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${isPast ? 'bg-gray-200 text-gray-700' : 'bg-purple-100 text-purple-800'}`}>
                {isPast ? '완료' : '예정'}
              </span>
              <button
                onClick={() => handleOpenGoogleSheetsDetail(reservation)}
                className="bg-purple-500 text-white py-0.5 px-2 rounded text-xs hover:bg-purple-600 transition-colors"
              >
                상세
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-1 text-sm text-gray-700 mt-1">
            {reservation.customerName && (
              <div className="flex items-center gap-2 mb-1 pb-1 border-b border-gray-100">
                <span className="font-bold text-purple-700 text-base">{reservation.customerName}</span>
                {reservation.customerEnglishName && (
                  <span className="text-xs text-gray-400">({reservation.customerEnglishName})</span>
                )}
              </div>
            )}
            {(reservation.serviceType || reservation.category) && (
              <div className="flex items-center gap-2 mb-1">
                {reservation.serviceType && (
                  <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-700 text-xs font-semibold">
                    {reservation.serviceType}
                  </span>
                )}
                {reservation.category && (
                  <span className="px-2 py-0.5 rounded bg-purple-50 text-purple-600 text-xs">
                    {reservation.category}
                  </span>
                )}
              </div>
            )}
            {reservation.cruiseInfo && (
              <div className="flex items-start gap-2 mb-1 pb-1 border-b border-gray-100">
                <span className="font-semibold text-gray-500 text-xs mt-0.5">크루즈</span>
                <span className="text-sm text-purple-700 font-medium break-words">{reservation.cruiseInfo}</span>
              </div>
            )}
            <div className="flex items-center gap-2 mt-1">
              <Calendar className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-medium">
                {boardingDate ? boardingDate.toLocaleDateString('ko-KR') : <span className="text-red-500">날짜 없음 ({reservation.boardingDate})</span>}
              </span>
            </div>
            <div className="flex items-start gap-2">
              <Car className="w-4 h-4 text-gray-400 mt-0.5" />
              <span className="text-sm break-words">{reservation.vehicleNumber} / 좌석: {reservation.seatNumber}</span>
            </div>
            {reservation.pickupLocation && (
              <div className="flex items-start gap-2 mt-1">
                <span className="font-semibold text-gray-500 text-xs mt-0.5">픽업</span>
                <span className="text-sm break-words">{reservation.pickupLocation}</span>
              </div>
            )}
            {reservation.dropoffLocation && (
              <div className="flex items-start gap-2">
                <span className="font-semibold text-gray-500 text-xs mt-0.5">드랍</span>
                <span className="text-sm break-words">{reservation.dropoffLocation}</span>
              </div>
            )}
          </div>
        </div>
      );
    }

    // 3. 공항 데이터
    else if (isAirportData(reservation)) {
      const serviceDate = parseDate(reservation.date);
      const isPast = isPastDate(reservation.date);
      const rawStopover = String(reservation.stopover || '').trim();
      const locationLabel = rawStopover === '경유지' ? '숙박지 정보' : (rawStopover || '위치');
      const rawPlaceName = String(reservation.placeName || '').trim();
      const locationValue = /^updating$/i.test(rawPlaceName) ? '-' : (rawPlaceName || '-');

      return (
        <div
          key={`${reservation.orderId}-${index}`}
          className={`bg-gray-50 border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-all p-3 flex flex-col h-full ${isPast ? 'opacity-60' : ''}`}
        >
          <div className="flex items-center gap-2 mb-2 pb-1 border-b border-gray-100">
            <div className="flex items-center justify-center w-9 h-9 rounded-full bg-green-50 border border-green-200">
              <Plane className="w-5 h-5 text-green-600" />
            </div>
            <h5 className="font-bold text-sm flex-1 truncate text-gray-800">
              공항서비스
            </h5>
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${isPast ? 'bg-gray-200 text-gray-700' : 'bg-green-100 text-green-800'}`}>
                {isPast ? '완료' : '예정'}
              </span>
              <button
                onClick={() => handleOpenGoogleSheetsDetail(reservation)}
                className="bg-green-500 text-white py-0.5 px-2 rounded text-xs hover:bg-green-600 transition-colors"
              >
                상세
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-1 text-sm text-gray-700 mt-1">
            {reservation.customerName && (
              <div className="flex items-center gap-2 mb-1 pb-1 border-b border-gray-100">
                <span className="font-bold text-green-700 text-base">{reservation.customerName}</span>
                {reservation.customerEnglishName && (
                  <span className="text-xs text-gray-400">({reservation.customerEnglishName})</span>
                )}
              </div>
            )}
            <div className="flex items-start gap-2">
              <span className="font-semibold text-gray-500 text-xs mt-0.5">구분</span>
              <span className="text-sm font-bold text-green-700 break-words">{reservation.tripType} - {reservation.category}</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-semibold text-gray-500 text-xs mt-0.5">경로</span>
              <span className="text-sm break-words">{reservation.route}</span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <Calendar className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-medium">
                {serviceDate?.toLocaleDateString('ko-KR')} {reservation.time}
              </span>
            </div>
            <div className="flex items-start gap-2">
              <Plane className="w-4 h-4 text-gray-400 mt-0.5" />
              <span className="text-sm break-words">{reservation.airportName} / {reservation.flightNumber}</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-semibold text-gray-500 text-xs mt-0.5">{locationLabel}</span>
              <span className="text-sm break-words">{locationValue}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-500 text-xs">인원/차량</span>
              <span className="text-sm">👥 {reservation.passengerCount}명 / 🚗 {reservation.carCount}대</span>
            </div>
            {reservation.carrierCount > 0 && (
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-500 text-xs">캐리어</span>
                <span className="text-sm">🧳 {reservation.carrierCount}개</span>
              </div>
            )}
          </div>
        </div>
      );
    }

    // 4. 호텔 데이터
    else if (isHotelData(reservation)) {
      const checkinDate = parseDate(reservation.checkinDate);
      const isPast = isPastDate(reservation.checkinDate);

      return (
        <div
          key={`${reservation.orderId}-${index}`}
          className={`bg-gray-50 border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-all p-3 flex flex-col h-full ${isPast ? 'opacity-60' : ''}`}
        >
          <div className="flex items-center gap-2 mb-2 pb-1 border-b border-gray-100">
            <div className="flex items-center justify-center w-9 h-9 rounded-full bg-orange-50 border border-orange-200">
              <Building className="w-5 h-5 text-orange-600" />
            </div>
            <h5 className="font-bold text-sm flex-1 truncate text-gray-800">
              호텔
            </h5>
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${isPast ? 'bg-gray-200 text-gray-700' : 'bg-orange-100 text-orange-800'}`}>
                {isPast ? '완료' : '예정'}
              </span>
              <button
                onClick={() => handleOpenGoogleSheetsDetail(reservation)}
                className="bg-orange-500 text-white py-0.5 px-2 rounded text-xs hover:bg-orange-600 transition-colors"
              >
                상세
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-1 text-sm text-gray-700 mt-1">
            {reservation.customerName && (
              <div className="flex items-center gap-2 mb-1 pb-1 border-b border-gray-100">
                <span className="font-bold text-orange-700 text-base">{reservation.customerName}</span>
                {reservation.customerEnglishName && (
                  <span className="text-xs text-gray-400">({reservation.customerEnglishName})</span>
                )}
              </div>
            )}
            <div className="flex items-start gap-2">
              <span className="font-semibold text-gray-500 text-xs mt-0.5">호텔</span>
              <span className="text-sm font-bold text-orange-700 break-words">{reservation.hotelName}</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-semibold text-gray-500 text-xs mt-0.5">객실</span>
              <span className="text-sm break-words">{reservation.roomName} ({reservation.roomType})</span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <Calendar className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-medium">
                {checkinDate?.toLocaleDateString('ko-KR')}
                {reservation.days > 0 && <span className="text-xs text-gray-500 ml-1">({reservation.days}박)</span>}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-500 text-xs">인원</span>
              <span className="text-sm">
                {reservation.adult > 0 && `👨 ${reservation.adult}명`}
                {reservation.child > 0 && ` 👶 ${reservation.child}명`}
                {reservation.toddler > 0 && ` 🍼 ${reservation.toddler}명`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-500 text-xs">객실수</span>
              <span className="text-sm">{reservation.roomCount}개</span>
            </div>
            {reservation.breakfastService && (
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-500 text-xs">조식</span>
                <span className="text-sm">🍳 포함</span>
              </div>
            )}
          </div>
        </div>
      );
    }

    // 5. 투어 데이터
    else if (isTourData(reservation)) {
      const startDate = parseDate(reservation.startDate);
      const isPast = isPastDate(reservation.startDate);

      return (
        <div
          key={`${reservation.orderId}-${index}`}
          className={`bg-gray-50 border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-all p-3 flex flex-col h-full ${isPast ? 'opacity-60' : ''}`}
        >
          <div className="flex items-center gap-2 mb-2 pb-1 border-b border-gray-100">
            <div className="flex items-center justify-center w-9 h-9 rounded-full bg-pink-50 border border-pink-200">
              <MapPin className="w-5 h-5 text-pink-600" />
            </div>
            <h5 className="font-bold text-sm flex-1 truncate text-gray-800">
              투어
            </h5>
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${isPast ? 'bg-gray-200 text-gray-700' : 'bg-pink-100 text-pink-800'}`}>
                {isPast ? '완료' : '예정'}
              </span>
              <button
                onClick={() => handleOpenGoogleSheetsDetail(reservation)}
                className="bg-pink-500 text-white py-0.5 px-2 rounded text-xs hover:bg-pink-600 transition-colors"
              >
                상세
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-1 text-sm text-gray-700 mt-1">
            {reservation.customerName && (
              <div className="flex items-center gap-2 mb-1 pb-1 border-b border-gray-100">
                <span className="font-bold text-pink-700 text-base">{reservation.customerName}</span>
                {reservation.customerEnglishName && (
                  <span className="text-xs text-gray-400">({reservation.customerEnglishName})</span>
                )}
              </div>
            )}
            <div className="flex items-start gap-2">
              <span className="font-semibold text-gray-500 text-xs mt-0.5">투어</span>
              <span className="text-sm font-bold text-pink-700 break-words">{reservation.tourName}</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-semibold text-gray-500 text-xs mt-0.5">종류</span>
              <span className="text-sm break-words">{reservation.tourType}</span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <Calendar className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-medium">{startDate?.toLocaleDateString('ko-KR')}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-500 text-xs">인원</span>
              <span className="text-sm">👥 {reservation.participants}명</span>
            </div>
            {reservation.pickupLocation && (
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
                <span className="text-sm break-words">{reservation.pickupLocation}</span>
              </div>
            )}
            {reservation.memo && (
              <div className="flex items-start gap-2">
                <span className="font-semibold text-gray-500 text-xs mt-0.5">메모</span>
                <span className="text-sm text-gray-600 break-words">{reservation.memo}</span>
              </div>
            )}
          </div>
        </div>
      );
    }

    // 6. 렌트카 데이터
    else if (isRentcarData(reservation)) {
      const pickupDate = parseDate(reservation.pickupDate);
      const isPast = isPastDate(reservation.pickupDate);

      return (
        <div
          key={`${reservation.orderId}-${index}`}
          className={`bg-gray-50 border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-all p-3 flex flex-col h-full ${isPast ? 'opacity-60' : ''}`}
        >
          <div className="flex items-center gap-2 mb-2 pb-1 border-b border-gray-100">
            <div className="flex items-center justify-center w-9 h-9 rounded-full bg-indigo-50 border border-indigo-200">
              <Car className="w-5 h-5 text-indigo-600" />
            </div>
            <h5 className="font-bold text-sm flex-1 truncate text-gray-800">
              렌트카
            </h5>
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${isPast ? 'bg-gray-200 text-gray-700' : 'bg-indigo-100 text-indigo-800'}`}>
                {isPast ? '완료' : '예정'}
              </span>
              <button
                onClick={() => handleOpenGoogleSheetsDetail(reservation)}
                className="bg-indigo-500 text-white py-0.5 px-2 rounded text-xs hover:bg-indigo-600 transition-colors"
              >
                상세
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-1 text-sm text-gray-700 mt-1">
            {reservation.customerName && (
              <div className="flex items-center gap-2 mb-1 pb-1 border-b border-gray-100">
                <span className="font-bold text-indigo-700 text-base">{reservation.customerName}</span>
                {reservation.customerEnglishName && (
                  <span className="text-xs text-gray-400">({reservation.customerEnglishName})</span>
                )}
              </div>
            )}
            <div className="flex items-start gap-2">
              <span className="font-semibold text-gray-500 text-xs mt-0.5">차량</span>
              <span className="text-sm font-bold text-indigo-700 break-words">{reservation.carType}</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-semibold text-gray-500 text-xs mt-0.5">경로</span>
              <span className="text-sm break-words">{reservation.route} ({reservation.tripType})</span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <Calendar className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-medium">
                {pickupDate?.toLocaleDateString('ko-KR')} {reservation.pickupTime}
              </span>
            </div>
            <div className="flex items-start gap-2">
              <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
              <span className="text-sm break-words">
                {reservation.pickupLocation}
                {reservation.destination && ` → ${reservation.destination}`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-500 text-xs">인원/차량</span>
              <span className="text-sm">👥 {reservation.passengerCount}명 / 🚗 {reservation.carCount}대</span>
            </div>
            {reservation.usagePeriod && (
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-500 text-xs">사용기간</span>
                <span className="text-sm">{reservation.usagePeriod}</span>
              </div>
            )}
          </div>
        </div>
      );
    }

    // 7. 차량 데이터 (기본)
    else if (isCarData(reservation)) {
      console.log('🚗 차량 렌더링:', {
        orderId: reservation.orderId,
        pickupDatetime: reservation.pickupDatetime,
        customerName: reservation.customerName,
        carType: reservation.carType
      });
      const pickupDate = parseDate(reservation.pickupDatetime);
      console.log('📅 파싱된 날짜:', pickupDate);
      const isPast = isPastDate(reservation.pickupDatetime);

      return (
        <div
          key={`${reservation.orderId}-${index}`}
          className={`bg-gray-50 border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-all p-3 flex flex-col h-full ${isPast ? 'opacity-60' : ''}`}
        >
          <div className="flex items-center gap-2 mb-2 pb-1 border-b border-gray-100">
            <div className="flex items-center justify-center w-9 h-9 rounded-full bg-blue-50 border border-blue-200">
              <Car className="w-5 h-5 text-blue-600" />
            </div>
            <h5 className="font-bold text-sm flex-1 truncate text-gray-800">
              크루즈 차량
            </h5>
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${reservation.segmentType === 'return' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                {reservation.segmentRibbon || (reservation.segmentType === 'return' ? '리턴' : '픽업')}
              </span>
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-medium ${isPast
                  ? 'bg-gray-200 text-gray-700'
                  : 'bg-blue-100 text-blue-800'
                  }`}
              >
                {isPast ? '완료' : '예정'}
              </span>
              <button
                onClick={() => handleOpenGoogleSheetsDetail(reservation)}
                className="bg-blue-500 text-white py-0.5 px-2 rounded text-xs hover:bg-blue-600 transition-colors"
              >
                상세
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-1 text-sm text-gray-700 mt-1">
            {reservation.customerName && (
              <div className="flex items-center gap-2 mb-1 pb-1 border-b border-gray-100">
                <span className="font-bold text-blue-700 text-base">
                  {reservation.customerName}
                </span>
                {reservation.customerEnglishName && (
                  <span className="text-xs text-gray-400">
                    ({reservation.customerEnglishName})
                  </span>
                )}
              </div>
            )}
            <div className="flex items-start gap-2">
              <span className="font-semibold text-gray-500 text-xs mt-0.5">차량</span>
              <span className="text-sm break-words">{reservation.carType}</span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <Calendar className="w-4 h-4 text-gray-400" />
              <span className="text-sm">
                {pickupDate ? pickupDate.toLocaleDateString('ko-KR') : <span className="text-red-500">날짜 없음 ({reservation.pickupDatetime})</span>}
              </span>
            </div>
            {reservation.segmentType !== 'return' && reservation.pickupLocation && (
              <div className="flex items-start gap-2">
                <span className="font-semibold text-gray-500 text-xs mt-0.5">승차</span>
                <span className="text-sm break-words">{reservation.pickupLocation}</span>
              </div>
            )}
            {reservation.segmentType === 'return' && reservation.dropoffLocation && (
              <div className="flex items-start gap-2">
                <span className="font-semibold text-gray-500 text-xs mt-0.5">하차</span>
                <span className="text-sm break-words">{reservation.dropoffLocation}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-500 text-xs">인원/차량</span>
              <span className="text-sm">
                👥 {reservation.passengerCount}명 / 🚗 {reservation.carCount}대
              </span>
            </div>
          </div>
        </div>
      );
    }

    // 기타 (fallback)
    return null;
  };

  // 시트 예약 한 행 요약 (테이블 표시용)
  const getSheetRowSummary = (r: any): { dateText: string; timeText: string; info: string; people: string; isPast: boolean; phaseLabel: string; phaseColor: string } => {
    const type = getServiceType(r);
    const fmtDate = (d: Date | null) => d ? d.toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit', weekday: 'short' }) : '-';
    let dateText = '-';
    let timeText = '-';
    const infoLines: string[] = [];
    const peopleLines: string[] = [];
    let isPast = false;
    let phaseLabel = '';
    let phaseColor = '';

    const filterRequestNote = (note: any): string => {
      if (note === undefined || note === null) return '';
      const s = String(note).trim();
      if (!s || s === '0' || s === '-' || s.toLowerCase() === 'updating') return '';
      return s;
    };

    if (type === 'cruise') {
      dateText = fmtDate(parseDate(r.checkin));
      isPast = isPastDate(r.checkin);
      if (r.cruise) infoLines.push(`크루즈: ${r.cruise}`);
      const room = `${r.roomType || ''}${r.category ? ` (${r.category})` : ''}`.trim();
      if (room) infoLines.push(`객실: ${room}`);
      if (r.discount) infoLines.push(`할인: ${r.discount}`);
      const note = filterRequestNote(r.requestNote);
      if (note) infoLines.push(`요청: ${note}`);
      const parts: string[] = [];
      if (r.adult > 0) parts.push(`성인 ${r.adult}`);
      if (r.child > 0) parts.push(`아동 ${r.child}`);
      if (r.toddler > 0) parts.push(`유아 ${r.toddler}`);
      if (parts.length) peopleLines.push(parts.join(' / '));
      peopleLines.push(`객실 ${r.roomCount || 0}개`);
    } else if (type === 'vehicle') {
      dateText = fmtDate(parseDate(r.boardingDate));
      isPast = isPastDate(r.boardingDate);
      if (r.vehicleNumber) infoLines.push(`차량: ${r.vehicleNumber}`);
      if (r.seatNumber) infoLines.push(`좌석: ${r.seatNumber}`);
      if (r.category) infoLines.push(`분류: ${r.category}`);
      if (r.passengerCount) peopleLines.push(`👥 ${r.passengerCount}명`);
    } else if (type === 'airport') {
      dateText = fmtDate(parseDate(r.date));
      timeText = r.time || '-';
      isPast = isPastDate(r.date);
      const tag = `${r.tripType || ''} ${r.category || ''}`.trim();
      if (tag) infoLines.push(`구분: ${tag}`);
      if (r.route) infoLines.push(`경로: ${r.route}`);
      if (r.airportName || r.flightNumber) infoLines.push(`공항/편명: ${r.airportName || ''} / ${r.flightNumber || ''}`);
      const rawStopover = String(r.stopover || '').trim();
      const locLabel = rawStopover === '경유지' ? '숙박지' : (rawStopover || '위치');
      const rawPlace = String(r.placeName || '').trim();
      const locVal = /^updating$/i.test(rawPlace) ? '' : rawPlace;
      if (locVal) infoLines.push(`${locLabel}: ${locVal}`);
      peopleLines.push(`👥 ${r.passengerCount || 0} / 🚗 ${r.carCount || 0}`);
      if (r.carrierCount > 0) peopleLines.push(`🧳 캐리어 ${r.carrierCount}개`);
    } else if (type === 'hotel') {
      dateText = fmtDate(parseDate(r.checkinDate));
      isPast = isPastDate(r.checkinDate);
      if (r.hotelName) infoLines.push(`호텔: ${r.hotelName}`);
      if (r.roomName || r.roomType) infoLines.push(`객실: ${r.roomName || ''}${r.roomType ? ` (${r.roomType})` : ''}`);
      if (r.days > 0) infoLines.push(`기간: ${r.days}박`);
      if (r.breakfastService) infoLines.push('🍳 조식 포함');
      const parts: string[] = [];
      if (r.adult > 0) parts.push(`성인 ${r.adult}`);
      if (r.child > 0) parts.push(`아동 ${r.child}`);
      if (r.toddler > 0) parts.push(`유아 ${r.toddler}`);
      if (parts.length) peopleLines.push(parts.join(' / '));
      peopleLines.push(`객실 ${r.roomCount || 0}개`);
    } else if (type === 'tour') {
      dateText = fmtDate(parseDate(r.startDate));
      isPast = isPastDate(r.startDate);
      if (r.tourName) infoLines.push(`투어: ${r.tourName}`);
      if (r.tourType) infoLines.push(`종류: ${r.tourType}`);
      if (r.pickupLocation) infoLines.push(`픽업: ${r.pickupLocation}`);
      if (r.memo) infoLines.push(`메모: ${r.memo}`);
      if (r.participants) peopleLines.push(`👥 ${r.participants}명`);
    } else if (type === 'rentcar') {
      dateText = fmtDate(parseDate(r.pickupDate));
      timeText = r.pickupTime || '-';
      isPast = isPastDate(r.pickupDate);
      if (r.carType) infoLines.push(`차량: ${r.carType}`);
      const route = [r.route, r.tripType ? `(${r.tripType})` : ''].filter(Boolean).join(' ');
      if (route) infoLines.push(`경로: ${route}`);
      const loc = [r.pickupLocation, r.destination].filter(Boolean).join(' → ');
      if (loc) infoLines.push(`위치: ${loc}`);
      if (r.usagePeriod) infoLines.push(`사용기간: ${r.usagePeriod}`);
      peopleLines.push(`👥 ${r.passengerCount || 0} / 🚗 ${r.carCount || 0}`);
    } else if (type === 'car') {
      const pd = parseDate(r.pickupDatetime);
      dateText = fmtDate(pd);
      timeText = pd ? pd.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }) : '-';
      isPast = isPastDate(r.pickupDatetime);
      if (r.carType) infoLines.push(`차량: ${r.carType}`);
      if (r.segmentType !== 'return' && r.pickupLocation) infoLines.push(`승차: ${r.pickupLocation}`);
      if (r.segmentType === 'return' && r.dropoffLocation) infoLines.push(`하차: ${r.dropoffLocation}`);
      peopleLines.push(`👥 ${r.passengerCount || 0} / 🚗 ${r.carCount || 0}`);
      phaseLabel = r.segmentRibbon || (r.segmentType === 'return' ? '리턴' : '픽업');
      phaseColor = r.segmentType === 'return' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700';
    }

    return {
      dateText,
      timeText,
      info: infoLines.join('\n') || '-',
      people: peopleLines.join('\n') || '-',
      isPast,
      phaseLabel,
      phaseColor,
    };
  };

  // 시트 테이블 렌더 (가독성 좋은 컴팩트 테이블)
  const renderSheetTable = (list: any[]) => (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wider">
          <tr>
            <th className="px-3 py-2.5 text-left font-semibold">타입</th>
            <th className="px-3 py-2.5 text-left font-semibold">고객명</th>
            <th className="px-3 py-2.5 text-left font-semibold">일자</th>
            <th className="px-3 py-2.5 text-left font-semibold">시간</th>
            <th className="px-3 py-2.5 text-left font-semibold">서비스 정보</th>
            <th className="px-3 py-2.5 text-left font-semibold">인원</th>
            <th className="px-3 py-2.5 text-left font-semibold">구분</th>
            <th className="px-3 py-2.5 text-right font-semibold">액션</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {list.map((reservation: any, index: number) => {
            const type = getServiceType(reservation);
            const info = getServiceInfo(type);
            const sum = getSheetRowSummary(reservation);
            return (
              <tr
                key={`${reservation.orderId}-${index}`}
                className={`hover:bg-blue-50/40 transition-colors ${sum.isPast ? 'opacity-60' : ''}`}
              >
                <td className="px-3 py-2 align-top whitespace-nowrap">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-${info.color}-600`}>{info.icon}</span>
                    <span className="text-gray-700 font-medium">{info.name}</span>
                  </div>
                </td>
                <td className="px-3 py-2 align-top font-semibold text-gray-800 whitespace-nowrap">
                  {reservation.customerName || '-'}
                  {reservation.customerEnglishName && (
                    <span className="ml-1 text-xs text-gray-400 font-normal">({reservation.customerEnglishName})</span>
                  )}
                </td>
                <td className="px-3 py-2 align-top text-gray-700 whitespace-nowrap">{sum.dateText}</td>
                <td className="px-3 py-2 align-top text-gray-700 whitespace-nowrap tabular-nums">{sum.timeText}</td>
                <td className="px-3 py-2 align-top text-gray-700 whitespace-pre-line text-xs leading-5 max-w-[360px] break-words">{sum.info}</td>
                <td className="px-3 py-2 align-top text-gray-700 whitespace-pre-line text-xs leading-5">{sum.people}</td>
                <td className="px-3 py-2 align-top whitespace-nowrap">
                  {sum.phaseLabel ? (
                    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${sum.phaseColor}`}>{sum.phaseLabel}</span>
                  ) : <span className="text-gray-300">-</span>}
                </td>
                <td className="px-3 py-2 align-top text-right whitespace-nowrap">
                  <button
                    onClick={() => handleOpenGoogleSheetsDetail(reservation)}
                    className="bg-blue-500 text-white py-1 px-2.5 rounded text-xs hover:bg-blue-600 transition-colors"
                  >상세</button>
                  {(userEmail === 'kys@hyojacho.es.kr' || userEmail === 'kjh@hyojacho.es.kr') && (
                    <button
                      onClick={() => handleDeleteGoogleSheetsReservation(reservation)}
                      className="ml-1 bg-red-500 text-white py-1 px-2 rounded text-xs hover:bg-red-600 transition-colors"
                      title="삭제"
                    >🗑️</button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  // 시트 그룹 렌더 (보기 모드 + vehicle 카테고리 서브그룹화 처리)
  const renderSheetGroup = (serviceType: string, reservationArray: any[]) => {
    if (displayMode === 'grid') return renderSheetGrid(serviceType, reservationArray);
    if (serviceType === 'vehicle') {
      return (
        <div className="space-y-4">
          {Object.entries(
            reservationArray.reduce((acc: Record<string, any[]>, reservation) => {
              const category = reservation.category || '미분류';
              (acc[category] ||= []).push(reservation);
              return acc;
            }, {})
          ).map(([category, categoryReservations]) => (
            <div key={category}>
              <div className="flex items-center gap-2 mb-2 ml-4">
                <span className="px-3 py-1 rounded bg-purple-100 text-purple-700 text-sm font-semibold">{category}</span>
                <span className="text-xs text-gray-500">({categoryReservations.length}건)</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {categoryReservations.map((reservation, index) => renderGoogleSheetsCard(reservation, index))}
              </div>
            </div>
          ))}
        </div>
      );
    }
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {reservationArray.map((reservation, index) => renderGoogleSheetsCard(reservation, index))}
      </div>
    );
  };

  if (loading) {
    return (
      <ManagerLayout title="예약 일정 (신/구 구분)" activeTab="schedule-new">
        <div className="flex justify-center items-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto"></div>
            <p className="mt-4 text-gray-600">일정 정보를 불러오는 중...</p>
          </div>
        </div>
      </ManagerLayout>
    );
  }

  return (
    <ManagerLayout title="예약 일정 (신/구 구분)" activeTab="schedule-new">
      <div className="space-y-6">

        {/* 일정 컨트롤 */}
        <div className="bg-white rounded-lg shadow-md p-6">
          {/* 1행: 날짜 네비게이션 + 검색 바 + 일간/주간/월간 버튼 */}
          <div className="flex items-center justify-between gap-4 mb-4">
            {/* 왼쪽: 날짜 네비게이션 */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigateDate('prev')}
                className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>

              <button
                type="button"
                onClick={openDatePicker}
                className="text-lg font-semibold min-w-max hover:text-green-700"
                title="날짜 선택"
              >
                {viewMode === 'day'
                  ? selectedDate.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
                  : viewMode === 'week'
                    ? (() => {
                      const { start, end } = getRange(selectedDate, 'week');
                      return `${start.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })} - ${end.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })}`;
                    })()
                    : selectedDate.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' })}
              </button>

              <input
                ref={datePickerRef}
                type="date"
                value={toDateInputValue(selectedDate)}
                onChange={(e) => handleDateInputChange(e.target.value)}
                className="sr-only"
                tabIndex={-1}
                aria-hidden="true"
              />

              {/* 오늘 버튼 */}
              {viewMode === 'day' && (
                <button
                  onClick={() => setSelectedDate(new Date())}
                  className="px-2 py-1 bg-blue-50 text-blue-600 rounded border border-blue-200 text-xs font-medium hover:bg-blue-100"
                >오늘</button>
              )}

              <button
                onClick={() => navigateDate('next')}
                className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            {/* 중앙: 검색 바 */}
            <div className="flex items-center gap-1 flex-1 max-w-md">
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="검색..."
                  className="w-full px-3 py-2 pr-8 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <Search className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              </div>
              <button
                onClick={handleSearch}
                className="px-3 py-2 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 transition-colors"
              >
                검색
              </button>
              {activeSearchQuery && (
                <button
                  onClick={handleClearSearch}
                  className="px-3 py-2 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300 transition-colors"
                >
                  초기화
                </button>
              )}
            </div>

            {/* 오른쪽: 일간/주간/월간 버튼 */}
            <div className="flex gap-1">
              <button
                onClick={() => setViewMode('day')}
                className={`px-3 py-2 rounded text-sm transition-colors ${viewMode === 'day' ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-700'}`}
              >
                일간
              </button>
              <button
                onClick={() => setViewMode('week')}
                className={`px-3 py-2 rounded text-sm transition-colors ${viewMode === 'week' ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-700'}`}
              >
                주간
              </button>
              <button
                onClick={() => setViewMode('month')}
                className={`px-3 py-2 rounded text-sm transition-colors ${viewMode === 'month' ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-700'}`}
              >
                월간
              </button>
            </div>
          </div>

          {/* 2행: 타입 필터 + 그룹화 + 검색 결과 */}
          <div className="flex items-center justify-start gap-4">
            {/* 타입 필터 */}
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-600" />
              <div className="flex gap-1 flex-wrap">
                <button
                  onClick={() => setTypeFilter('all')}
                  className={`px-2 py-1 rounded-full text-xs transition-colors ${typeFilter === 'all' ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-700'}`}
                >
                  전체
                </button>
                {['cruise', 'vehicle', 'sht', 'airport', 'hotel', 'tour', 'rentcar', 'package'].map(type => (
                  <button
                    key={type}
                    onClick={() => setTypeFilter(type)}
                    className={`px-2 py-1 rounded-full text-xs transition-colors ${typeFilter === type ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-700'}`}
                  >
                    {getTypeName(type)}
                  </button>
                ))}
              </div>
            </div>

            {/* 그룹화 버튼 (주/월간 모드에만 표시) */}
            {(viewMode === 'week' || viewMode === 'month') && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-600">그룹화:</span>
                <div className="inline-flex rounded overflow-hidden border border-gray-200">
                  <button
                    onClick={() => setGroupMode('day')}
                    className={`px-2 py-1 text-xs ${groupMode === 'day' ? 'bg-green-500 text-white' : 'bg-gray-50 text-gray-700'}`}
                  >
                    일별
                  </button>
                  <button
                    onClick={() => setGroupMode('type')}
                    className={`px-2 py-1 text-xs ${groupMode === 'type' ? 'bg-green-500 text-white' : 'bg-gray-50 text-gray-700'}`}
                  >
                    타입별
                  </button>
                </div>
              </div>
            )}

            {/* 보기 모드 (카드 / 표) */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-600">보기:</span>
              <div className="inline-flex rounded overflow-hidden border border-gray-200">
                <button
                  onClick={() => setDisplayMode('card')}
                  className={`px-2 py-1 text-xs flex items-center gap-1 ${displayMode === 'card' ? 'bg-blue-500 text-white' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'}`}
                  title="카드 보기"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  카드
                </button>
                <button
                  onClick={() => setDisplayMode('grid')}
                  className={`px-2 py-1 text-xs flex items-center gap-1 ${displayMode === 'grid' ? 'bg-blue-500 text-white' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'}`}
                  title="표 보기 (서비스별 컬럼)"
                >
                  <TableIcon className="w-3.5 h-3.5" />
                  표
                </button>
              </div>
            </div>

            {/* 검색 결과 표시 */}
            {activeSearchQuery && (
              <div className="text-xs text-blue-600 ml-auto">
                검색: "{activeSearchQuery}"
              </div>
            )}
          </div>
        </div>

        {/* 일정 목록 - 카드: 2열 / 표: 1열(DB 위, 시트 아래) */}
        <div className={displayMode !== 'card' ? 'space-y-6' : 'grid grid-cols-1 lg:grid-cols-2 gap-6'}>
          {/* 왼쪽: Supabase 데이터 */}
          <div className="bg-white rounded-lg shadow-md">
            <div className="p-6 border-b bg-green-50">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Calendar className="w-6 h-6 text-green-600" />
                DB 예약 일정 ({filteredSchedules.length}건)
              </h3>
            </div>

            {filteredSchedules.length === 0 ? (
              <div className="p-8 text-center">
                <Calendar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-600 mb-2">
                  {typeFilter === 'all' ? '예약된 일정이 없습니다' : `${getTypeName(typeFilter)} 일정이 없습니다`}
                </h3>
              </div>
            ) : (
              <div className="p-6 space-y-10">
                {/* 일간 보기: 서비스별 그룹화 (시트 예약일정과 동일) */}
                {viewMode === 'day' && (
                  <div className="space-y-6">
                    {groupedByTypeEntries.map(([serviceType, list]) => (
                      <div key={serviceType}>
                        <div className="flex items-center gap-2 mb-3 pb-2 border-b">
                          <div>{getTypeIcon(serviceType === 'sht' ? 'vehicle' : serviceType)}</div>
                          <h4 className="text-md font-semibold text-gray-800">
                            {getTypeName(serviceType)}
                            <span className="ml-2 text-sm text-gray-500">({list.length}건)</span>
                          </h4>
                        </div>
                        {renderDbList(list as any[])}
                      </div>
                    ))}
                  </div>
                )}

                {/* 주/월간 보기 */}
                {(viewMode === 'week' || viewMode === 'month') && (
                  <>
                    {groupMode === 'day' && (
                      <div className="space-y-8">
                        {Object.keys(groupedByDate)
                          .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
                          .map(key => {
                            const list = groupedByDate[key];
                            const d = new Date(key + 'T00:00:00');
                            const serviceGroups = (list as any[]).reduce((acc: Record<string, any[]>, schedule: any) => {
                              const serviceType = getScheduleServiceType(schedule) || 'other';
                              (acc[serviceType] ||= []).push(schedule);
                              return acc;
                            }, {});
                            const serviceEntries = sortDbServiceEntries(Object.entries(serviceGroups));
                            return (
                              <div key={key}>
                                <div className="flex items-center justify-between mb-3">
                                  <h4 className="text-md font-semibold flex items-center gap-2">
                                    <Calendar className="w-5 h-5 text-green-600" /> {formatDateLabel(d)} <span className="text-gray-500">({list.length}건)</span>
                                  </h4>
                                </div>
                                <div className="space-y-4">
                                  {serviceEntries.map(([serviceType, serviceSchedules]) => (
                                    <div key={serviceType}>
                                      <div className="flex items-center gap-2 mb-2 pb-1 border-b border-gray-200">
                                        <div>{getTypeIcon(serviceType === 'sht' ? 'vehicle' : serviceType)}</div>
                                        <h5 className="text-sm font-semibold text-gray-700">
                                          {getTypeName(serviceType)}
                                          <span className="ml-2 text-xs text-gray-500">({(serviceSchedules as any[]).length}건)</span>
                                        </h5>
                                      </div>
                                      {renderDbList(serviceSchedules as any[])}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    )}

                    {groupMode === 'type' && (
                      <div className="space-y-10">
                        {groupedByTypeEntries.map(([type, list]) => (
                          <div key={type}>
                            <div className="flex items-center justify-between mb-3">
                              <h4 className="text-md font-semibold flex items-center gap-2">
                                {getTypeIcon(typeFilter === 'sht' || typeFilter === 'vehicle' ? 'vehicle' : type)} {typeFilter === 'sht' ? getTypeName('sht') : typeFilter === 'vehicle' ? getTypeName('vehicle') : getTypeName(type)} <span className="text-gray-500">({list.length}건)</span>
                              </h4>
                            </div>
                            {renderDbList(list as any[])}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div >

          {/* 오른쪽: 시트 데이터 */}
          <div className="bg-white rounded-lg shadow-md">
            <div className="p-6 border-b bg-blue-50">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Calendar className="w-6 h-6 text-blue-600" />
                시트 예약 일정 ({filteredGoogleSheets.length}건)
              </h3>
            </div>

            {googleSheetsLoading ? (
              <div className="p-8 text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
                <p className="mt-4 text-gray-600">데이터를 불러오는 중...</p>
              </div>
            ) : googleSheetsError ? (
              <div className="p-8 text-center">
                <Calendar className="w-16 h-16 text-red-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-red-600 mb-2">
                  데이터 로드 실패
                </h3>
                <p className="text-sm text-gray-500">{googleSheetsError}</p>
              </div>
            ) : filteredGoogleSheets.length === 0 ? (
              <div className="p-8 text-center">
                <Calendar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-600 mb-2">
                  {googleSheetsData.length === 0
                    ? 'DB에 데이터가 없습니다'
                    : '예약된 일정이 없습니다'}
                </h3>
                {googleSheetsData.length === 0 && (
                  <p className="text-sm text-gray-500 mt-2">
                    관리자 페이지에서 Google Sheets 데이터를 동기화해주세요.
                  </p>
                )}
              </div>
            ) : (
              <div className="p-6 space-y-10">
                {/* 일간 보기 - 서비스별 그룹화 */}
                {viewMode === 'day' && (
                  <div className="space-y-6">
                    {Object.entries(groupedByService)
                      .sort(([typeA], [typeB]) => {
                        const order = ['cruise', 'car', 'vehicle', 'airport', 'hotel', 'tour', 'rentcar'];
                        return order.indexOf(typeA) - order.indexOf(typeB);
                      })
                      .map(([serviceType, reservations]) => {
                        const serviceInfo = getServiceInfo(serviceType);
                        const reservationArray = Array.isArray(reservations) ? reservations : [];
                        return (
                          <div key={serviceType}>
                            <div className="flex items-center gap-2 mb-3 pb-2 border-b">
                              <div className={`text-${serviceInfo.color}-600`}>
                                {serviceInfo.icon}
                              </div>
                              <h4 className="text-md font-semibold text-gray-800">
                                {serviceInfo.name}
                                <span className="ml-2 text-sm text-gray-500">({reservationArray.length}건)</span>
                              </h4>
                            </div>

                            {renderSheetGroup(serviceType, reservationArray)}
                          </div>
                        );
                      })}
                    {Object.keys(groupedByService).length === 0 && (
                      <div className="text-center py-8 text-gray-500">
                        예약된 일정이 없습니다.
                      </div>
                    )}
                  </div>
                )}

                {/* 주/월간 보기 */}
                {(viewMode === 'week' || viewMode === 'month') && (
                  <>
                    {groupMode === 'day' && (
                      <div className="space-y-8">
                        {Object.entries(
                          filteredGoogleSheets.reduce((acc: Record<string, any[]>, reservation) => {
                            // 각 서비스 타입별 날짜 필드 확인
                            let date: Date | null = null;

                            if (reservation.checkin) {
                              date = parseDate(reservation.checkin); // 크루즈
                            } else if (reservation.pickupDatetime) {
                              date = parseDate(reservation.pickupDatetime); // 차량
                            } else if (reservation.boardingDate) {
                              date = parseDate(reservation.boardingDate); // 스하차량
                            } else if (reservation.date) {
                              date = parseDate(reservation.date); // 공항
                            } else if (reservation.checkinDate) {
                              date = parseDate(reservation.checkinDate); // 호텔
                            } else if (reservation.startDate) {
                              date = parseDate(reservation.startDate); // 투어
                            } else if (reservation.pickupDate) {
                              date = parseDate(reservation.pickupDate); // 렌트카
                            }

                            if (date) {
                              const key = toKey(date);
                              (acc[key] ||= []).push(reservation);
                            }
                            return acc;
                          }, {})
                        )
                          .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
                          .map(([dateKey, reservations]) => {
                            const d = new Date(dateKey + 'T00:00:00');
                            const reservationArray = Array.isArray(reservations) ? reservations : [];

                            // 날짜별로 서비스 타입별 그룹화
                            const serviceGroups = reservationArray.reduce((acc: Record<string, any[]>, reservation) => {
                              const serviceType = getServiceType(reservation);
                              (acc[serviceType] ||= []).push(reservation);
                              return acc;
                            }, {});

                            return (
                              <div key={dateKey}>
                                <div className="flex items-center justify-between mb-3 pb-2 border-b-2">
                                  <h4 className="text-lg font-bold flex items-center gap-2">
                                    <Calendar className="w-5 h-5 text-blue-600" />
                                    {formatDateLabel(d)}
                                    <span className="text-gray-500">({reservationArray.length}건)</span>
                                  </h4>
                                </div>
                                <div className="space-y-4">
                                  {Object.entries(serviceGroups)
                                    .sort(([typeA], [typeB]) => {
                                      const order = ['cruise', 'car', 'vehicle', 'airport', 'hotel', 'tour', 'rentcar'];
                                      return order.indexOf(typeA) - order.indexOf(typeB);
                                    })
                                    .map(([serviceType, serviceReservations]) => {
                                      const serviceInfo = getServiceInfo(serviceType);
                                      const serviceReservationArray = Array.isArray(serviceReservations) ? serviceReservations : [];
                                      return (
                                        <div key={serviceType}>
                                          <div className="flex items-center gap-2 mb-2 pb-1 border-b border-gray-200">
                                            <div className={`text-${serviceInfo.color}-600`}>
                                              {serviceInfo.icon}
                                            </div>
                                            <h5 className="text-sm font-semibold text-gray-700">
                                              {serviceInfo.name}
                                              <span className="ml-2 text-xs text-gray-500">({serviceReservationArray.length}건)</span>
                                            </h5>
                                          </div>

                                          {renderSheetGroup(serviceType, serviceReservationArray)}
                                        </div>
                                      );
                                    })}
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    )}

                    {groupMode === 'type' && (
                      <div className="space-y-6">
                        {Object.entries(groupedByService)
                          .sort(([typeA], [typeB]) => {
                            const order = ['cruise', 'car', 'vehicle', 'airport', 'hotel', 'tour', 'rentcar'];
                            return order.indexOf(typeA) - order.indexOf(typeB);
                          })
                          .map(([serviceType, reservations]) => {
                            const serviceInfo = getServiceInfo(serviceType);
                            const reservationArray = Array.isArray(reservations) ? reservations : [];
                            return (
                              <div key={serviceType}>
                                <div className="flex items-center gap-2 mb-3 pb-2 border-b">
                                  <div className={`text-${serviceInfo.color}-600`}>
                                    {serviceInfo.icon}
                                  </div>
                                  <h4 className="text-md font-semibold text-gray-800">
                                    {serviceInfo.name}
                                    <span className="ml-2 text-sm text-gray-500">({reservationArray.length}건)</span>
                                  </h4>
                                </div>

                                {renderSheetGroup(serviceType, reservationArray)}
                              </div>
                            );
                          })}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div >

    </ManagerLayout>
  );
}
