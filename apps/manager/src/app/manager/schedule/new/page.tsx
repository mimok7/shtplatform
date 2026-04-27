// @ts-nocheck
'use client';

import React, { useState, useEffect, useRef } from 'react';
import ManagerLayout from '@/components/ManagerLayout';
import supabase from '@/lib/supabase';
import UserReservationDetailModal from '@/components/UserReservationDetailModal';
import GoogleSheetsDetailModal from '@/components/GoogleSheetsDetailModal';
import ServiceCardBody from '@/components/ServiceCardBody';
import {
  Calendar,
  Clock,
  Ship,
  Plane,
  Building,
  MapPin,
  Car,
  Filter,
  ChevronLeft,
  ChevronRight,
  Search
} from 'lucide-react';

interface SHCReservation {
  orderId: string;
  customerName: string; // SH_M?먯꽌 議고쉶???쒓??대쫫
  customerEnglishName?: string; // SH_M?먯꽌 議고쉶???곷Ц?대쫫
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
  customerName: string; // SH_M?먯꽌 議고쉶???쒓??대쫫
  customerEnglishName?: string; // SH_M?먯꽌 議고쉶???곷Ц?대쫫
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
  requestNote?: string; // ?붿껌?ы빆/?뱀씠?ы빆/硫붾え
}

// ?ㅽ븯李⑤웾 (SH_CC)
interface SHCCReservation {
  orderId: string;
  customerName: string;
  customerEnglishName?: string;
  cruiseInfo?: string; // SH_R?먯꽌 議고쉶???щ（利덈챸 (C??
  boardingDate: string; // C?? ?뱀감??  serviceType: string; // D?? 援щ텇
  category: string; // E?? 遺꾨쪟
  vehicleNumber: string; // F?? 李⑤웾踰덊샇
  seatNumber: string; // G?? 醫뚯꽍踰덊샇
  name: string; // H?? ?대쫫
  pickupLocation?: string; // L?? ?뱀감?꾩튂
  dropoffLocation?: string; // M?? ?섏감?꾩튂
  email: string;
}

// 怨듯빆 (SH_P)
interface SHPReservation {
  orderId: string;
  customerName: string;
  customerEnglishName?: string;
  tripType: string; // C?? 援щ텇
  category: string; // D?? 遺꾨쪟
  route: string; // E?? 寃쎈줈
  carCode: string;
  carType: string;
  date: string; // H?? ?쇱옄
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

// ?명뀛 (SH_H)
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
  checkinDate: string; // I?? 泥댄겕?몃궇吏?  checkoutDate: string;
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

// ?ъ뼱 (SH_T)
interface SHTReservation {
  orderId: string;
  customerName: string;
  customerEnglishName?: string;
  tourCode: string;
  tourName: string;
  tourType: string;
  detailCategory: string;
  quantity: number;
  startDate: string; // H?? ?쒖옉?쇱옄
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

// ?뚰듃移?(SH_RC)
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
  pickupDate: string; // I?? ?뱀감?쇱옄
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
  // ?ㅻ뒛 ?좎쭨濡?珥덇린??
  const today = new Date();
  const [selectedDate, setSelectedDate] = useState(today);
  const datePickerRef = useRef<HTMLInputElement | null>(null);
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('day');
  // 二??붽컙 蹂닿린?먯꽌 ?쇰퀎 洹몃９??異붽? (湲곕낯: ?쇰퀎)
  const [groupMode, setGroupMode] = useState<'type' | 'day'>('day');
  const [typeFilter, setTypeFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState(''); // ?낅젰 以묒씤 寃?됱뼱
  const [activeSearchQuery, setActiveSearchQuery] = useState(''); // ?ㅼ젣 寃?됱뿉 ?ъ슜?섎뒗 寃?됱뼱
  const [selectedSchedule, setSelectedSchedule] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Google Sheets 紐⑤떖 ?곹깭
  const [selectedGoogleSheetsReservation, setSelectedGoogleSheetsReservation] = useState<any>(null);
  const [isGoogleSheetsModalOpen, setIsGoogleSheetsModalOpen] = useState(false);
  const [allOrderServices, setAllOrderServices] = useState<any[]>([]);
  const [loadingOrderServices, setLoadingOrderServices] = useState(false);
  const [orderUserInfo, setOrderUserInfo] = useState<any>(null); // SH_M ?ъ슜???뺣낫
  const [relatedEmail, setRelatedEmail] = useState('');
  const [relatedDbServices, setRelatedDbServices] = useState<any[]>([]);
  const [relatedDbLoading, setRelatedDbLoading] = useState(false);

  // DB ?덉빟 ?곸꽭 紐⑤떖 ?곹깭 (schedule/page.tsx? ?숈씪)
  const [isDBModalOpen, setIsDBModalOpen] = useState(false);
  const [dbUserInfo, setDbUserInfo] = useState<any>(null);
  const [dbUserServices, setDbUserServices] = useState<any[]>([]);
  const [dbModalLoading, setDbModalLoading] = useState(false);

  // Google Sheets ?곗씠??
  const [googleSheetsData, setGoogleSheetsData] = useState<any[]>([]);
  const [googleSheetsLoading, setGoogleSheetsLoading] = useState(true);
  const [googleSheetsError, setGoogleSheetsError] = useState<string | null>(null);

  // ?꾩옱 ?ъ슜???뺣낫 (??젣 沅뚰븳 ?뺤씤??
  const [userEmail, setUserEmail] = useState<string | null>(null);

  // ?꾩옱 ?ъ슜???뺣낫 濡쒕뱶
  useEffect(() => {
    const loadCurrentUser = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.email) {
          setUserEmail(user.email);
        }
      } catch (error) {
        console.error('?ъ슜???뺣낫 濡쒕뱶 ?ㅽ뙣:', error);
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

  // 寃???ㅽ뻾
  const handleSearch = () => {
    setActiveSearchQuery(searchQuery);
  };

  // 寃??珥덇린??
  const handleClearSearch = () => {
    setSearchQuery('');
    setActiveSearchQuery('');
  };

  // Enter ??泥섎━
  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  // 二쇰Ц ID濡?紐⑤뱺 ?쒕퉬??議고쉶 (Google Sheets - SH_M)
  const loadAllOrderServices = async (orderId: string) => {
    if (!orderId) {
      setAllOrderServices([]);
      setOrderUserInfo(null);
      return null;
    }

    setLoadingOrderServices(true);
    try {
      // sh_m ?ъ슜???뺣낫 議고쉶
      const { data: userData } = await supabase
        .from('sh_m')
        .select('*')
        .eq('order_id', orderId)
        .single();

      if (userData) {
        setOrderUserInfo({
          orderId: userData.order_id,
          email: userData.email,
          koreanName: userData.korean_name,
          englishName: userData.english_name,
          phone: userData.phone,
          url: userData.url,
          reservationDate: userData.reservation_date,
          paymentMethod: userData.payment_method,
          plan: userData.plan,
          memberLevel: userData.member_grade,  // ??member_grade媛 ?뺥솗??而щ읆紐?          kakaoId: userData.kakao_id,
          discountCode: userData.discount_code,
          requestNote: userData.request_note,
          specialNote: userData.special_note,
          memo: userData.memo
        });
        console.log('?뫀 sh_m ?ъ슜???뺣낫:', userData);
      }

      // 紐⑤뱺 ?쒕퉬?????議고쉶 (蹂묐젹)
      const [shRData, shCData, shCCData, shPData, shHData, shTData, shRCData] = await Promise.all([
        supabase.from('sh_r').select('*').eq('order_id', orderId),
        supabase.from('sh_c').select('*').eq('order_id', orderId),
        supabase.from('sh_cc').select('*').eq('order_id', orderId),
        supabase.from('sh_p').select('*').eq('order_id', orderId),
        supabase.from('sh_h').select('*').eq('order_id', orderId),
        supabase.from('sh_t').select('*').eq('order_id', orderId),
        supabase.from('sh_rc').select('*').eq('order_id', orderId)
      ]);

      // ?곗씠??留ㅽ븨 諛??⑹튂湲?(紐⑤뱺 ?꾨뱶 ?ы븿)
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
          pickupLocation: c.boarding_location,  // ??boarding_location
          dropoffLocation: c.dropoff_location,
          passengerCount: c.passenger_count || 0,
          carCount: c.vehicle_count || 0  // ??vehicle_count
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
          carCount: p.vehicle_count || 0,  // ??vehicle_count
          carrierCount: p.carrier_count || 0,
          placeName: p.accommodation_info || p.location_name || ''  // ??accommodation_info ?곗꽑, ?놁쑝硫?location_name
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
          days: h.schedule,  // ??schedule ?꾨뱶
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
          participants: t.tour_count || 0,  // ??tour_count
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
          pickupDate: rc.boarding_date,  // ??boarding_date
          pickupTime: rc.boarding_time,  // ??boarding_time
          pickupLocation: rc.boarding_location,  // ??boarding_location
          destination: rc.destination,
          usagePeriod: rc.usage_period,
          passengerCount: rc.passenger_count || 0,
          carCount: rc.vehicle_count || 0  // ??vehicle_count
        }))
      ];

      console.log('Loaded order services:', allData.length, allData);
      setAllOrderServices(allData);
      return {
        email: userData?.email || ''
      };
    } catch (error) {
      console.error('二쇰Ц ?쒕퉬??議고쉶 ?ㅽ뙣:', error);
      setAllOrderServices([]);
      setOrderUserInfo(null);
      return null;
    } finally {
      setLoadingOrderServices(false);
    }
  };

  // Google Sheets ?곗씠????젣 (沅뚰븳 ?뺤씤 ?ы븿)
  const handleDeleteGoogleSheetsReservation = async (reservation: any) => {
    const emailLower = (userEmail || '').toLowerCase();
    const canDelete = emailLower === 'kys@hyojacho.es.kr' || emailLower === 'kjh@hyojacho.es.kr';

    if (!canDelete) {
      alert('??젣 沅뚰븳???놁뒿?덈떎.');
      return;
    }

    if (!confirm(`${reservation.customerName || '?덉빟'} ?곗씠?곕? ??젣?섏떆寃좎뒿?덇퉴?`)) {
      return;
    }

    try {
      const orderId = reservation.orderId;
      if (!orderId) {
        alert('二쇰Ц ID瑜?李얠쓣 ???놁뒿?덈떎.');
        return;
      }

      // ?쒕퉬????낆뿉 ?곕씪 ?대떦 ?뚯씠釉붿뿉????젣
      const serviceType = getServiceType(reservation);
      let tableName = 'sh_r'; // 湲곕낯媛?
      if (serviceType === 'cruise') tableName = 'sh_r';
      else if (serviceType === 'car') tableName = 'sh_c';
      else if (serviceType === 'vehicle') tableName = 'sh_cc';
      else if (serviceType === 'airport') tableName = 'sh_p';
      else if (serviceType === 'hotel') tableName = 'sh_h';
      else if (serviceType === 'tour') tableName = 'sh_t';
      else if (serviceType === 'rentcar') tableName = 'sh_rc';

      // ?곗씠????젣
      const { error } = await supabase
        .from(tableName)
        .delete()
        .eq('order_id', orderId);

      if (error) {
        console.error('??젣 ?ㅽ뙣:', error);
        alert('??젣 以??ㅻ쪟媛 諛쒖깮?덉뒿?덈떎: ' + error.message);
        return;
      }

      // ?깃났 硫붿떆吏
      alert('??젣?섏뿀?듬땲??');

      // ?곗씠???덈줈怨좎묠
      setGoogleSheetsData(prev =>
        prev.filter(item => item.orderId !== orderId)
      );
    } catch (error: any) {
      console.error('??젣 泥섎━ 以??ㅻ쪟:', error);
      alert('??젣 以??ㅻ쪟媛 諛쒖깮?덉뒿?덈떎.');
    }
  };

  // ?대찓??湲곗? DB ?덉빟(異붽? ?덉빟 ?ы븿) 議고쉶
  const loadRelatedDbReservationsByEmail = async (email: string) => {
    const normalizedEmail = email?.trim();
    setRelatedEmail(normalizedEmail || '');

    if (!normalizedEmail) {
      setRelatedDbServices([]);
      return;
    }

    setRelatedDbLoading(true);
    try {
      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select('id, name, email, phone_number')
        .ilike('email', normalizedEmail);

      if (usersError || !usersData || usersData.length === 0) {
        setRelatedDbServices([]);
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
        setRelatedDbServices([]);
        return;
      }

      const reservationMap = new Map((reservations || []).map((r: any) => [r.re_id, r]));
      const reservationIds = reservations.map((r: any) => r.re_id).filter(Boolean);

      const [cruiseRes, cruiseCarRes, carShtRes, airportRes, hotelRes, tourRes, rentcarRes] = await Promise.all([
        supabase.from('reservation_cruise').select('*').in('reservation_id', reservationIds),
        supabase.from('reservation_cruise_car').select('*').in('reservation_id', reservationIds),
        supabase.from('reservation_car_sht').select('*').in('reservation_id', reservationIds),
        supabase.from('reservation_airport').select('*').in('reservation_id', reservationIds),
        supabase.from('reservation_hotel').select('*').in('reservation_id', reservationIds),
        supabase.from('reservation_tour').select('*').in('reservation_id', reservationIds),
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
        if (way === 'pickup' || way === '?쎌뾽') return '?쎌뾽';
        if (way === 'sending' || way === 'dropoff' || way === '?뚮뵫') return '?뚮뵫';
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
        ...mergeWithBase(rentcarRes.data || [], 'rentcar')
      ].sort((a: any, b: any) => {
        const aTime = new Date(a?.reservation?.re_created_at || 0).getTime();
        const bTime = new Date(b?.reservation?.re_created_at || 0).getTime();
        return bTime - aTime;
      });

      setRelatedDbServices(mergedServices);
    } catch (error) {
      console.error('?대찓??湲곗? DB ?덉빟 議고쉶 ?ㅽ뙣:', error);
      setRelatedDbServices([]);
    } finally {
      setRelatedDbLoading(false);
    }
  };

  // ?ъ슜??ID濡?紐⑤뱺 DB ?덉빟 議고쉶 (schedule/page.tsx? ?숈씪)
  const loadAllUserReservations = async (userId: string) => {
    if (!userId) return;

    try {
      setDbModalLoading(true);
      setIsDBModalOpen(true);

      // 1. ?ъ슜???뺣낫 議고쉶
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (userError) throw userError;
      setDbUserInfo(userData);

      // 2. ?ъ슜?먯쓽 紐⑤뱺 ?덉빟 ID 議고쉶
      const { data: reservations, error: resError } = await supabase
        .from('reservation')
        .select('re_id, re_type, re_status, re_created_at')
        .eq('re_user_id', userId)
        .neq('re_type', 'car_sht')
        .order('re_created_at', { ascending: false });

      if (resError) throw resError;

      const reservationIds = reservations.map(r => r.re_id);

      if (reservationIds.length === 0) {
        setDbUserServices([]);
        return;
      }

      // 3. 媛??쒕퉬???뚯씠釉붿뿉???곸꽭 ?뺣낫 議고쉶
      const [cruiseRes, airportRes, hotelRes, rentcarRes, tourRes, cruiseCarRes, carShtRes] = await Promise.all([
        supabase.from('reservation_cruise').select('*').in('reservation_id', reservationIds),
        supabase.from('reservation_airport').select('*').in('reservation_id', reservationIds),
        supabase.from('reservation_hotel').select('*').in('reservation_id', reservationIds),
        supabase.from('reservation_rentcar').select('*').in('reservation_id', reservationIds),
        supabase.from('reservation_tour').select('*').in('reservation_id', reservationIds),
        supabase.from('reservation_cruise_car').select('*').in('reservation_id', reservationIds),
        supabase.from('reservation_car_sht').select('*').in('reservation_id', reservationIds)
      ]);

      // 4. 異붽? ?뺣낫 議고쉶 (bulk ?섏씠吏? ?숈씪???섏?)
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

      // cruise_rate_card: id + room_type + legacy room_price (bulk ?섏씠吏? ?숈씪)
      const [roomPricesById, roomPricesByType, roomPricesLegacy, tourPrices, hotelPrices, rentPrices, airportPrices, carPrices] = await Promise.all([
        cruiseCodes.length > 0 ? supabase.from('cruise_rate_card').select('id, cruise_name, room_type, price_adult, price_child, price_infant, price_extra_bed, price_single, price_child_extra_bed').in('id', cruiseCodes) : Promise.resolve({ data: [] }),
        cruiseCodes.length > 0 ? supabase.from('cruise_rate_card').select('id, cruise_name, room_type, price_adult, price_child, price_infant, price_extra_bed, price_single, price_child_extra_bed').in('room_type', cruiseCodes) : Promise.resolve({ data: [] }),
        // legacy room_price ?뚯씠釉붿? ???댁긽 ?ъ슜?섏? ?딆쓬 (404 諛⑹?)
        Promise.resolve({ data: [] }),
        tourCodes.length > 0 ? supabase.from('tour_pricing').select('pricing_id, price_per_person, tour_id').in('pricing_id', tourCodes) : Promise.resolve({ data: [] }),
        hotelCodes.length > 0 ? supabase.from('hotel_price').select('hotel_price_code, base_price, hotel_name, room_name').in('hotel_price_code', hotelCodes) : Promise.resolve({ data: [] }),
        rentCodes.length > 0 ? supabase.from('rentcar_price').select('rent_code, vehicle_type, way_type, route, price, category').in('rent_code', rentCodes) : Promise.resolve({ data: [] }),
        airportCodes.length > 0 ? supabase.from('airport_price').select('airport_code, service_type, route, vehicle_type, price').in('airport_code', airportCodes) : Promise.resolve({ data: [] }),
        cruiseCarCodes.length > 0 ? supabase.from('rentcar_price').select('rent_code, vehicle_type, way_type, route, price, category').in('rent_code', cruiseCarCodes) : Promise.resolve({ data: [] })
      ]);

      // roomPriceMap: id + room_type + legacy 蹂묓빀 (bulk ?섏씠吏? ?숈씪)
      const roomPriceMap = new Map((roomPricesById.data || []).map((r: any) => [r.id, r]));
      (roomPricesByType.data || []).forEach((r: any) => {
        if (r?.room_type && !roomPriceMap.has(r.room_type)) roomPriceMap.set(r.room_type, r);
      });
      const getLegacyCategoryKey = (category?: string) => {
        const c = String(category || '').trim();
        if (c.includes('?꾨룞') && c.includes('?묒뒪?몃씪')) return 'price_child_extra_bed';
        if (c.includes('?좎븘')) return 'price_infant';
        if (c.includes('?꾨룞')) return 'price_child';
        if (c.includes('?묒뒪?몃씪')) return 'price_extra_bed';
        if (c.includes('?깃?')) return 'price_single';
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

      // 5. ?곗씠??留ㅽ븨 (bulk ?섏씠吏 flattenedServices? ?숈씪???꾨뱶 援ъ“)
      const reservationMap = new Map(reservations.map(r => [r.re_id, r]));

      const allServices = [
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
            status: reservationMap.get(r.reservation_id)?.re_status,
            cruise: info?.cruise_name || '?щ（利?',
            cruiseName: info?.cruise_name || '?щ（利?',
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
            paymentMethod: '?뺣낫 ?놁쓬',
          };
        }),
        ...(cruiseCarRes.data || []).flatMap((r: any) => {
          const code = r.rentcar_price_code || r.car_price_code;
          const info = carPriceMap.get(code);
          const base = {
            ...r,
            serviceType: 'vehicle',
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

          // ?쎌뾽 移대뱶: ?쎌뾽?쇱옄 + ?뱀감 ?꾩튂留??쒖떆
          if (r.pickup_datetime) {
            rows.push({
              ...base,
              segmentType: 'pickup',
              segmentRibbon: '?쎌뾽',
              pickupDatetime: r.pickup_datetime,
              pickupLocation: r.pickup_location,
              dropoffLocation: null,
            });
          }

          // 由ы꽩 移대뱶: 由ы꽩?쇱옄 + ?섏감 ?꾩튂留??쒖떆
          if (r.return_datetime) {
            rows.push({
              ...base,
              segmentType: 'return',
              segmentRibbon: '由ы꽩',
              pickupDatetime: r.return_datetime,
              pickupLocation: null,
              dropoffLocation: r.dropoff_location,
            });
          }

          // 由ы꽩?쇱옄媛 ?놁쑝硫?湲곗〈泥섎읆 ?쎌뾽 1嫄대쭔 ?좎?
          if (rows.length === 0) {
            rows.push({
              ...base,
              segmentType: 'pickup',
              segmentRibbon: '?쎌뾽',
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
          const isPickup = rawWayType.includes('pickup') || rawWayType.includes('?쎌뾽');
          const airportLocation = r.ra_airport_location || '';
          const accommodationInfo = r.accommodation_info || r.ra_stopover_location || '';
          return {
            ...r,
            serviceType: 'airport',
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
        ...(rentcarRes.data || []).map(r => {
          const rentCode = String(r.rentcar_price_code || '').trim();
          const compactCode = compactRentCode(rentCode);
          const info =
            rentPriceMap.get(rentCode) || rentPriceMap.get(rentCode.toUpperCase()) || rentPriceMap.get(rentCode.toLowerCase()) ||
            rentPriceMap.get(compactCode) || rentPriceMap.get(compactCode.toUpperCase()) || rentPriceMap.get(compactCode.toLowerCase());
          return {
            ...r,
            serviceType: 'rentcar',
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

      setDbUserServices(allServices);

    } catch (error) {
      console.error('?ъ슜???덉빟 ?뺣낫 議고쉶 ?ㅽ뙣:', error);
      setDbUserServices([]);
    } finally {
      setDbModalLoading(false);
    }
  };

  // Google Sheets ?곸꽭蹂닿린 紐⑤떖 ?닿린
  const handleOpenGoogleSheetsDetail = async (reservation: any) => {
    // ?쒕퉬?????媛먯?
    let serviceType = 'unknown';
    if (isCruiseData(reservation)) serviceType = 'cruise';
    else if (isVehicleData(reservation)) serviceType = 'vehicle';
    else if (isAirportData(reservation)) serviceType = 'airport';
    else if (isHotelData(reservation)) serviceType = 'hotel';
    else if (isTourData(reservation)) serviceType = 'tour';
    else if (isRentcarData(reservation)) serviceType = 'rentcar';
    else if (isCarData(reservation)) serviceType = 'car';

    // ?좏깮???덉빟??serviceType 異붽?
    setSelectedGoogleSheetsReservation({ ...reservation, serviceType });
    setIsGoogleSheetsModalOpen(true);
    setRelatedDbServices([]);
    setRelatedEmail('');

    // ?대떦 二쇰Ц ID??紐⑤뱺 ?쒕퉬??議고쉶
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
      // 二쇨컙: ?붿슂???쒖옉 湲곗?
      const day = start.getDay();
      const diffToMonday = (day === 0 ? -6 : 1) - day; // ?쇱슂??0) -> -6, ??1)->0 ...
      start.setDate(start.getDate() + diffToMonday);
      start.setHours(0, 0, 0, 0);
      end.setTime(start.getTime());
      end.setDate(end.getDate() + 6);
      end.setHours(23, 59, 59, 999);
    } else {
      // ?붽컙: ?대떦 ??1??~ 留먯씪
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      end.setMonth(start.getMonth() + 1, 0); // ?ㅼ쓬 ??0??= 留먯씪
      end.setHours(23, 59, 59, 999);
    }
    return { start, end };
  };

  const loadGoogleSheetsData = async () => {
    console.log('?? loadGoogleSheetsData ?몄텧??');
    console.log('   typeFilter:', typeFilter);
    console.log('   ?꾩옱 ?쒓컖:', new Date().toLocaleTimeString());

    try {
      setGoogleSheetsLoading(true);
      setGoogleSheetsError(null);

      console.log('?봽 loadGoogleSheetsData ?쒖옉, typeFilter:', typeFilter);

      // DB?먯꽌 ?곗씠??議고쉶 (sh_* ?뚯씠釉?
      if (typeFilter === 'all') {
        console.log('?뱿 紐⑤뱺 ?쒕퉬???곗씠??議고쉶 ?쒖옉...');

        // 紐⑤뱺 ?쒕퉬?ㅻ? 蹂묐젹濡?議고쉶 (紐⑤뱺 ?곗씠??媛?몄삤湲?
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

        const [shRData, shCData, shCCData, shPData, shHData, shTData, shRCData] = await Promise.all([
          fetchAllRows('sh_r'),
          fetchAllRows('sh_c'),
          fetchAllRows('sh_cc'),
          fetchAllRows('sh_p'),
          fetchAllRows('sh_h'),
          fetchAllRows('sh_t'),
          fetchAllRows('sh_rc')
        ]);

        console.log('??DB 議고쉶 寃곌낵:');
        console.log('  sh_r (?щ（利?:', shRData.data?.length || 0, '嫄?', shRData.error ? `??${shRData.error.message}` : '');
        console.log('  sh_c (李⑤웾):', shCData.data?.length || 0, '嫄?', shCData.error ? `??${shCData.error.message}` : '');
        console.log('  sh_cc (?ㅽ븯李⑤웾):', shCCData.data?.length || 0, '嫄?', shCCData.error ? `??${shCCData.error.message}` : '');
        console.log('  sh_p (怨듯빆):', shPData.data?.length || 0, '嫄?', shPData.error ? `??${shPData.error.message}` : '');
        console.log('  sh_h (?명뀛):', shHData.data?.length || 0, '嫄?', shHData.error ? `??${shHData.error.message}` : '');
        console.log('  sh_t (?ъ뼱):', shTData.data?.length || 0, '嫄?', shTData.error ? `??${shTData.error.message}` : '');
        console.log('  sh_rc (?뚰듃移?:', shRCData.data?.length || 0, '嫄?', shRCData.error ? `??${shRCData.error.message}` : '');

        // ?щ（利??곗씠???섑뵆 濡쒓퉭 (?좎쭨 ?뺤떇 ?뺤씤??
        if (shRData.data && shRData.data.length > 0) {
          console.log('?뱟 ?щ（利??좎쭨 ?섑뵆 (理쒓렐 5嫄?:');
          shRData.data.slice(0, 5).forEach((r: any, i: number) => {
            console.log(`  ${i + 1}. ${r.checkin_date} | ${r.cruise_name} | ${r.order_id}`);
          });
        }

        // sh_m ?ъ슜???뺣낫 議고쉶 (紐⑤뱺 ?곗씠??
        const usersDataResult = await fetchAllRows('sh_m');
        const usersData = usersDataResult.data;
        console.log('?뫁 sh_m ?ъ슜???뺣낫:', usersData?.length || 0, '嫄?');
        const userMap = new Map((usersData || []).map((u: any) => [u.order_id, { korean_name: u.korean_name, english_name: u.english_name, email: u.email }]));

        // ?곗씠??留ㅽ븨 諛??⑹튂湲?
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

        console.log('?뱤 ?꾩껜 濡쒕뱶???곗씠??', allData.length, '嫄?');
        console.log('  - ?щ（利?', shRData.data?.length || 0, '嫄?');
        console.log('  - 李⑤웾:', shCData.data?.length || 0, '嫄?');
        console.log('  - ?ㅽ븯李⑤웾:', shCCData.data?.length || 0, '嫄?');
        console.log('  - 怨듯빆:', shPData.data?.length || 0, '嫄?');
        console.log('  - ?명뀛:', shHData.data?.length || 0, '嫄?');
        console.log('  - ?ъ뼱:', shTData.data?.length || 0, '嫄?');
        console.log('  - ?뚰듃移?', shRCData.data?.length || 0, '嫄?');

        // ?곗씠???섑뵆 ?뺤씤 (?좎쭨 ?꾨뱶 以묒젏 ?뺤씤)
        const cruiseSample = allData.filter(d => d.cruise)[0];
        const carSample = allData.filter(d => d.carType && d.pickupDatetime)[0];
        const vhcSample = allData.filter(d => d.vehicleNumber)[0];
        const airportSample = allData.filter(d => d.airportName)[0];
        const hotelSample = allData.filter(d => d.hotelName)[0];
        const tourSample = allData.filter(d => d.tourName)[0];
        const rentcarSample = allData.filter(d => d.carCode && d.pickupDate)[0];

        console.log('?뱷 ?щ（利??섑뵆:', cruiseSample, '??checkin:', cruiseSample?.checkin);
        console.log('?뱷 李⑤웾 ?섑뵆:', carSample, '??pickupDatetime:', carSample?.pickupDatetime);
        console.log('?뱷 ?ㅽ븯李⑤웾 ?섑뵆:', vhcSample, '??boardingDate:', vhcSample?.boardingDate);
        console.log('?뱷 怨듯빆 ?섑뵆:', airportSample, '??date:', airportSample?.date);
        console.log('?뱷 ?명뀛 ?섑뵆:', hotelSample, '??checkinDate:', hotelSample?.checkinDate);
        console.log('?뱷 ?ъ뼱 ?섑뵆:', tourSample, '??startDate:', tourSample?.startDate);
        console.log('?뱷 ?뚰듃移??섑뵆:', rentcarSample, '??pickupDate:', rentcarSample?.pickupDate);

        // ?ㅻ뒛 ?좎쭨(2025-11-14) ?곗씠??媛쒖닔 ?뺤씤 (?ㅼ뼇???좎쭨 ?뺤떇 吏??
        const todayFormats = ['2025-11-14', '2025. 11. 14', '2025/11/14', '11/14/2025', '14/11/2025', '11-14-2025'];
        const matchesToday = (dateStr: string) => {
          if (!dateStr) return false;
          return todayFormats.some(format => dateStr.includes(format));
        };

        const todayData = {
          cruise: allData.filter(d => d.cruise && matchesToday(d.checkin)).length,
          car: allData.filter(d => d.carType && d.pickupDatetime && matchesToday(d.pickupDatetime)).length,
          sht: allData.filter(d => d.vehicleNumber && matchesToday(d.boardingDate)).length,
          airport: allData.filter(d => d.airportName && matchesToday(d.date)).length,
          hotel: allData.filter(d => d.hotelName && matchesToday(d.checkinDate)).length,
          tour: allData.filter(d => d.tourName && matchesToday(d.startDate)).length,
          rentcar: allData.filter(d => d.carCode && d.pickupDate && matchesToday(d.pickupDate)).length
        };
        console.log('?뱟 ?ㅻ뒛(2025-11-14) ?좎쭨 臾몄옄??寃??', todayData);

        // 2025??11???곗씠??紐⑤몢 李얘린 (?좎쭨 ?뺤떇 吏꾨떒)
        const nov2025Cruise = allData.filter(d => d.cruise && d.checkin && (
          d.checkin.includes('2025-11') ||
          d.checkin.includes('2025. 11') ||
          d.checkin.includes('2025/11') ||
          d.checkin.includes('11/2025') ||
          d.checkin.includes('11-2025')
        ));

        console.log('占?2025??11???щ（利??곗씠??', nov2025Cruise.length, '嫄?');
        if (nov2025Cruise.length > 0) {
          console.log('   ?좎쭨 ?뺤떇 ?섑뵆:');
          nov2025Cruise.slice(0, 10).forEach((d, idx) => {
            console.log(`   [${idx + 1}] orderId: ${d.orderId}, checkin: "${d.checkin}"`);
          });
        }

        // ?ㅼ젣 ?ㅻ뒛 ?곗씠???섑뵆 異쒕젰 (?щ（利??뺤씤)
        const todayCruise = allData.filter(d => d.cruise && matchesToday(d.checkin));
        if (todayCruise.length > 0) {
          console.log('?슓 ?ㅻ뒛 ?щ（利??곗씠??', todayCruise.length, '嫄?');
          todayCruise.forEach((d, idx) => {
            console.log(`   [${idx + 1}] ${d.orderId} - checkin: "${d.checkin}"`);
          });
        } else {
          console.log('???ㅻ뒛 ?щ（利??곗씠??臾몄옄??寃???ㅽ뙣');
        }

        console.log('?벀 留ㅽ븨???꾩껜 ?곗씠??', allData.length, '嫄?');
        console.log('   - ?щ（利?', allData.filter(d => d.cruise).length, '嫄?');
        console.log('   - 李⑤웾:', allData.filter(d => d.carType && d.pickupDatetime).length, '嫄?');
        console.log('   - ?ㅽ븯李⑤웾:', allData.filter(d => d.vehicleNumber).length, '嫄?');
        console.log('   - 怨듯빆:', allData.filter(d => d.airportName).length, '嫄?');
        console.log('   - ?명뀛:', allData.filter(d => d.hotelName).length, '嫄?');
        console.log('   - ?ъ뼱:', allData.filter(d => d.tourName).length, '嫄?');
        console.log('   - ?뚰듃移?', allData.filter(d => d.carCode && d.pickupDate).length, '嫄?');

        setGoogleSheetsData(allData);
      } else {
        // 媛쒕퀎 ?쒕퉬?????議고쉶
        const typeMapping: Record<string, string> = {
          'cruise': 'sh_r',
          'car': 'sh_c',
          'sht': 'sh_cc',
          'airport': 'sh_p',
          'hotel': 'sh_h',
          'tour': 'sh_t',
          'rentcar': 'sh_rc'
        };

        const tableName = typeMapping[typeFilter] || 'sh_c';
        const result = await fetchAllRows(tableName);
        const data = result.data;

        if (result.error) {
          throw new Error(`?곗씠??議고쉶 ?ㅽ뙣: ${result.error.message}`);
        }

        // ??낅퀎 ?곗씠??留ㅽ븨
        let mappedData: any[] = [];

        // sh_m?먯꽌 ?쒓?/?곷Ц ?대쫫 議고쉶 (紐⑤뱺 ?곗씠??
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
      setGoogleSheetsError(err.message || '?곗씠?곕? 遺덈윭?ㅻ뒗 以??ㅻ쪟媛 諛쒖깮?덉뒿?덈떎.');
    } finally {
      setGoogleSheetsLoading(false);
    }
  };

  const parseDate = (dateStr: string): Date | null => {
    if (!dateStr) return null;

    try {
      // "YYYY. MM. DD" ?뺤떇 泥섎━
      if (dateStr.includes('. ')) {
        const parts = dateStr.split('. ').map(p => p.trim());
        if (parts.length >= 3) {
          const [year, month, day] = parts;
          const dayNum = day.split(' ')[0]; // ?쒓컙 遺遺??쒓굅
          // 濡쒖뺄 ?쒓컙?濡?Date 媛앹껜 ?앹꽦 (?뺤삤 12?쒕줈 ?ㅼ젙?섏뿬 ?쒓컙? 臾몄젣 諛⑹?)
          const date = new Date(
            parseInt(year),
            parseInt(month) - 1, // ?붿? 0遺???쒖옉
            parseInt(dayNum),
            12, 0, 0, 0 // ?뺤삤濡??ㅼ젙
          );
          return date;
        }
      }

      // "YYYY-MM-DD" ?뺤떇
      if (dateStr.includes('-')) {
        const datePart = dateStr.split(' ')[0];
        const [year, month, day] = datePart.split('-');
        // 濡쒖뺄 ?쒓컙?濡?Date 媛앹껜 ?앹꽦 (?뺤삤 12?쒕줈 ?ㅼ젙)
        const date = new Date(
          parseInt(year),
          parseInt(month) - 1,
          parseInt(day),
          12, 0, 0, 0 // ?뺤삤濡??ㅼ젙
        );
        return date;
      }

      // 湲고? ?뺤떇
      const date = new Date(dateStr);
      if (!isNaN(date.getTime())) {
        // ?쒓컙???뺤삤濡??ㅼ젙
        date.setHours(12, 0, 0, 0);
        return date;
      }
    } catch (error) {
      // ?먮윭 臾댁떆
    }

    return null;
  };

  const formatPrice = (price: number): string => {
    return price.toLocaleString('ko-KR') + '??';
  };

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

      // ?쒕퉬?ㅻ퀎 ?좎쭨 而щ읆 湲곗??쇰줈 湲곌컙 ???곗씠??議고쉶 (諛곗튂)
      let cruiseRows: any[] = [];
      let airportRows: any[] = [];
      let hotelRows: any[] = [];
      let rentcarRows: any[] = [];
      let tourRows: any[] = [];
      let cruiseCarRows: any[] = [];
      let carShtRows: any[] = [];

      if (hasSearch) {
        // 寃??紐⑤뱶: 湲곌컙怨?臾닿??섍쾶 reservation ?꾩껜瑜??섏씠吏 議고쉶
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

        const [cruiseData, airportData, hotelData, rentcarData, tourData, cruiseCarData, carShtData] = await Promise.all([
          fetchByReservationIds('reservation_cruise', reservationIds),
          fetchByReservationIds('reservation_airport', reservationIds),
          fetchByReservationIds('reservation_hotel', reservationIds),
          fetchByReservationIds('reservation_rentcar', reservationIds),
          fetchByReservationIds('reservation_tour', reservationIds),
          fetchByReservationIds('reservation_cruise_car', reservationIds),
          fetchByReservationIds('reservation_car_sht', reservationIds),
        ]);

        cruiseRows = cruiseData;
        airportRows = airportData;
        hotelRows = hotelData;
        rentcarRows = rentcarData;
        tourRows = tourData;
        cruiseCarRows = cruiseCarData;
        carShtRows = carShtData;
      } else {
        const [cruiseRes, airportRes, hotelRes, rentcarRes, tourRes, cruiseCarRes, carShtRes] = await Promise.all([
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
          // tour: usage_date (date) - ?놁쓣 ???덉쓬, maybeSingle ???踰붿쐞 議고쉶
          supabase
            .from('reservation_tour')
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
        cruiseCarRows = cruiseCarRes.data || [];
        carShtRows = carShtRes.data || [];
      }

      const serviceRows: Array<{ table: string; rows: any[] }> = [
        { table: 'reservation_cruise', rows: cruiseRows },
        { table: 'reservation_airport', rows: airportRows },
        { table: 'reservation_hotel', rows: hotelRows },
        { table: 'reservation_rentcar', rows: rentcarRows },
        { table: 'reservation_tour', rows: tourRows },
        { table: 'reservation_cruise_car', rows: cruiseCarRows },
        { table: 'reservation_car_sht', rows: carShtRows }
      ];

      // ?щ（利?room_price_code ??cruise_rate_card(cruise_name, room_type) 留ㅽ븨 議고쉶
      const cruiseCodes = Array.from(
        new Set((cruiseRows || []).map((r: any) => r.room_price_code).filter(Boolean))
      );
      // cruise_rate_card.id ??uuid 而щ읆?대?濡? ?덇굅??鍮?UUID 肄붾뱶瑜??욎뼱??.in('id', ...) ?몄텧?섎㈃
      // 泥?겕 ?꾩껜媛 'invalid input syntax for type uuid' ?먮윭濡??ㅽ뙣??留ㅽ븨???듭㎏濡?鍮꾧쾶 ??
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
        if (way === 'pickup' || way === '?쎌뾽') return '?쎌뾽';
        if (way === 'sending' || way === 'dropoff' || way === '?뚮뵫') return '?뚮뵫';
        return '';
      };
      const normalizeCruiseCode = (value: any) => String(value || '').trim().toLowerCase();

      // 寃??紐⑤뱶?먯꽌 IN 由ъ뒪?멸? 留ㅼ슦 而ㅼ?硫?URL 湲몄씠 珥덇낵濡??묐떟??鍮꾩뼱 媛앹떎紐??щ（利덈챸???꾨씫??      // ??200嫄??⑥쐞濡?泥?겕 遺꾪븷 議고쉶
      const fetchInChunked = async (table: string, selectCols: string, column: string, values: any[], chunkSize = 200) => {
        const acc: any[] = [];
        const uniq = Array.from(new Set((values || []).filter(v => v !== null && v !== undefined && v !== '')));
        for (let i = 0; i < uniq.length; i += chunkSize) {
          const chunk = uniq.slice(i, i + chunkSize);
          const { data, error } = await supabase.from(table).select(selectCols).in(column, chunk);
          if (error) {
            console.error(`${table}.${column} 泥?겕 議고쉶 ?ㅽ뙣:`, error);
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

      // cruise_rate_card: id 議고쉶 + room_type 議고쉶 寃곌낵 蹂묓빀
      const rpMergedMap = new Map<string, any>();
      for (const rp of [...(rpByIdRes.data || []), ...(rpByTypeRes.data || [])]) {
        const idKey = String(rp.id || '').trim();
        if (idKey && !rpMergedMap.has(idKey)) rpMergedMap.set(idKey, rp);
        const typeKey = String(rp.room_type || '').trim();
        if (typeKey && !rpMergedMap.has(typeKey)) rpMergedMap.set(typeKey, rp);
      }

      // legacy room_price ?뚯씠釉붿? ???댁긽 ?ъ슜?섏? ?딆쓬 (cruise_rate_card濡??듯빀)

      // cruise_info?먯꽌 room_name 議고쉶 (cruise_info?먮뒗 room_type 而щ읆???놁쓬 ??cruise_name ?ㅻ줈留?留ㅽ븨)
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
          // 媛숈? cruise_name???щ윭 room_name?쇰줈 議댁옱?????덉쑝誘濡?泥????좎?
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

      // ?뱦 STEP 1: pricing_id ??tour_id 留ㅽ븨
      const tpData: any[] = tpDataRes?.data || [];
      if (tpData.length > 0) {
        // ?뱦 STEP 2: tour_id 紐⑸줉 異붿텧
        const tourIds = Array.from(new Set((tpData).map((tp: any) => tp.tour_id).filter(Boolean)));

        if (tourIds.length > 0) {
          // ?뱦 STEP 3: tour_id ??tour_name 議고쉶
          const { data: toursById } = await supabase
            .from('tour')
            .select('tour_id, tour_name, tour_code, category')
            .in('tour_id', tourIds);

          // ?뱦 STEP 4: tour_name 留듯븨 (pricing_id ??tour_name)
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

      // ?대떦?섎뒗 ?덉빟 ID??議고쉶
      const reservationIds = Array.from(
        new Set(
          serviceRows.flatMap(s => (s.rows || []).map((r: any) => r.reservation_id)).filter(Boolean)
        )
      );

      if (reservationIds.length === 0) {
        setSchedules([]);
        return;
      }

      // ?덉빟 湲곕낯 ?뺣낫? ?ъ슜???뺣낫瑜?泥?겕 議고쉶 (???IN 議곌굔 ???
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
          console.error('reservation 泥?겕 議고쉶 ?ㅽ뙣:', error);
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
            console.error('users 泥?겕 議고쉶 ?ㅽ뙣:', error);
            continue;
          }
          usersData.push(...(data || []));
        }
        usersById = new Map((usersData || []).map(u => [u.id, u]));
      }

      // ?ㅼ?以?媛앹껜濡?蹂??
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
            // checkin? date留??덉쓣 媛?μ꽦
            if (row.checkin) {
              scheduleDate = new Date(row.checkin + 'T09:00:00');
              // ?щ（利덈뒗 ?쒓컙 ?쒓린 ?④?
              scheduleTime = '';
            }
            location = '?섎”踰좎씠';
            // room_price_code濡??щ（利?猷명???遺媛 ?뺣낫
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
            // ?덉빟 ??hotel_category???명뀛紐???ν븯???⑦꽩
            location = row.hotel_category || null;
            if (row.nights) duration = `${row.nights}諛?`;
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
              location = `${row.pickup_location} ??${row.destination}`;
            } else {
              location = row.pickup_location || row.destination || null;
            }

            if (!scheduleDate) continue;

            // ?뚰듃移대뒗 ?쎌뾽/由ы꽩??媛곴컖 媛쒕퀎 ?쇱젙?쇰줈 ?쒖떆
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
              segment_ribbon: '?쎌뾽',
              service_table: table,
              service_row: row,
              cruise_info: (row as any)._cruise_info || null
            });

            // 由ы꽩 移대뱶: return_datetime???덉쑝硫???긽 ?앹꽦 (媛숈? ?좎씠?대룄)
            const rentcarReturnDate = row.return_datetime ? parseKstDateTime(row.return_datetime) : null;
            if (rentcarReturnDate) {
              const returnLocation = (row.return_pickup_location && row.return_destination)
                ? `${row.return_pickup_location} ??${row.return_destination}`
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
                segment_ribbon: '由ы꽩',
                service_table: table,
                service_row: row,
                cruise_info: (row as any)._cruise_info || null
              });
            }

            continue;
          } else if (table === 'reservation_tour') {
            if (row.usage_date) {
              scheduleDate = new Date(row.usage_date + 'T09:00:00');
              // ?ъ뼱 移대뱶???쒓컙 ?④? ?뺤콉
              scheduleTime = '';
            }
            if (row.pickup_location && row.dropoff_location) {
              location = `${row.pickup_location} ??${row.dropoff_location}`;
            } else {
              location = row.pickup_location || row.dropoff_location || null;
            }
            // ?ъ뼱紐?enrichment: tour_price_code (=pricing_id) ??tour_name
            if (row.tour_price_code && tourInfoByCode.has(row.tour_price_code)) {
              (row as any)._tour_info = tourInfoByCode.get(row.tour_price_code);
            }
            if (row.tour_duration) duration = row.tour_duration;
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

            // ?쎌뾽 移대뱶 ?앹꽦
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
                segment_ribbon: '?쎌뾽',
                service_table: table,
                service_row: row,
                cruise_info: (row as any)._cruise_info || null
              });
            }

            // ?쒕∼ 移대뱶 ?앹꽦: ?뺣났?대㈃ 媛숈??좎씠?대룄 諛섎뱶???앹꽦
            const wayType = String(row.way_type || '').trim();
            const isRoundTrip = wayType.includes('?뺣났');
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
                  segment_ribbon: '?쒕∼',
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

          if (!scheduleDate) continue; // ?좎쭨媛 ?놁쑝硫??쒖쇅

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

      // ????꾪꽣???뚮뜑?먯꽌 ?곸슜?섎릺, ?ш린?쒕뒗 ?좎쭨 踰붿쐞 ??寃곌낵留??명똿
      // 理쒖떊???뺣젹 (?쒓컙 湲곗?)
      result.sort((a, b) => a.schedule_date.getTime() - b.schedule_date.getTime());
      setSchedules(result);
    } catch (error) {
      // ?먮윭 臾댁떆
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
      case 'rentcar': return <Car className="w-5 h-5 text-red-600" />;
      case 'car': return <Car className="w-5 h-5 text-red-600" />;
      case 'vehicle': return <Car className="w-5 h-5 text-red-600" />;
      default: return <Clock className="w-5 h-5 text-gray-600" />;
    }
  };

  const getTypeName = (type: string) => {
    switch (type) {
      case 'cruise': return '?щ（利?';
      case 'airport': return '怨듯빆';
      case 'hotel': return '?명뀛';
      case 'tour': return '?ъ뼱';
      case 'rentcar': return '?뚰듃移?';
      case 'car': return '?ъ감';
      case 'vehicle': return '?ъ감';
      case 'sht': return '?ㅽ븯李⑤웾';
      default: return type;
    }
  };

  // ?쒖떆????낅챸/?꾩씠肄?(service_table??諛섏쁺)
  const getDisplayTypeName = (schedule: any) => {
    if (schedule?.service_table === 'reservation_car_sht') return getTypeName('sht');
    if (schedule?.service_table === 'reservation_cruise_car') return getTypeName('vehicle');
    return getTypeName(schedule?.re_type);
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

  const getDisplayTypeIcon = (schedule: any) => {
    if (schedule?.service_table === 'reservation_car_sht') return getTypeIcon('vehicle');
    if (schedule?.service_table === 'reservation_cruise_car') return getTypeIcon('vehicle');
    return getTypeIcon(schedule?.re_type);
  };

  // ?щ（利덈챸 + 媛앹떎????쒖떆???좏떥 (媛???꾨뱶?먯꽌 理쒕???異붿텧)
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
    const left = cruise || (code ? `肄붾뱶:${code}` : '?щ（利?');
    const right = roomType;
    return [left, right].filter(Boolean).join(' ');
  };

  // ?щ（利??덉씠釉붿쓣 '?щ（利?/ 媛앹떎??? ?뺤떇?쇰줈 諛섑솚 (?щ옒???욌뮘 怨듬갚 ?ы븿)
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

  // ?쒓컙 臾댁떆, ?좎쭨(YYYY-MM-DD) 湲곗??쇰줈留?遺꾨쪟
  // ?꾩? ?좎쭨 湲곗??쇰줈 鍮꾧탳 (UTC 蹂???ㅻ쪟 諛⑹?)
  const isSameLocalDate = (d1: Date, d2: Date) =>
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate();

  // 二??붽컙 ?ы븿 踰붿쐞 鍮꾧탳 (?묐걹 ?ы븿)
  const isDateInRange = (date: Date, start: Date, end: Date) => {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const s = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const e = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    return d >= s && d <= e;
  };

  const typeFilteredSchedules = schedules.filter(schedule => {
    if (typeFilter !== 'all') {
      if (typeFilter === 'sht') {
        if (schedule.service_table !== 'reservation_car_sht') return false;
      } else if (typeFilter === 'vehicle') {
        if (schedule.service_table !== 'reservation_cruise_car') return false;
      } else if (typeFilter === 'cruise') {
        // ?щ（利??꾪꽣: 李⑤웾 ?뚯씠釉붿? ?쒖쇅?섍퀬 cruise ?덉빟留??ы븿
        if (schedule.service_table === 'reservation_cruise_car' || schedule.service_table === 'reservation_car_sht') return false;
        if (schedule.re_type !== 'cruise') return false;
      } else if (schedule.re_type !== typeFilter) {
        return false;
      }
    }
    return true;
  });

  // DB 寃?? 寃?됱뼱媛 ?덉쑝硫??좎쭨 ?꾪꽣瑜?臾댁떆?섍퀬 ?꾩껜(DB)?먯꽌 寃??
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
    // 寃?됱뼱媛 ?놁쓣 ?뚮쭔 ?좎쭨 踰붿쐞 ?꾪꽣 ?곸슜
    filteredSchedules = typeFilteredSchedules.filter(schedule => {
      if (!schedule.schedule_date) return false;
      if (viewMode === 'day') return isSameLocalDate(schedule.schedule_date, selectedDate);
      const { start, end } = getRange(selectedDate, viewMode);
      return isDateInRange(schedule.schedule_date, start, end);
    });
  }

  // 以묐났 ?쒓굅: ?숈씪 ?곸꽭??id)留??쒓굅?섍퀬, 媛숈? ?덉빟???ㅺ굔 ?곸꽭???좎?
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

  // ?쒕퉬????낅퀎 洹몃９
  const groupedByType: Record<string, any[]> = uniqueSchedules.reduce(
    (acc: Record<string, any[]>, cur) => {
      const k = cur.re_type || 'other';
      (acc[k] ||= []).push(cur);
      return acc;
    },
    {}
  );

  // ?좎쭨(YYYY-MM-DD) 湲곗? 洹몃９ (二??붽컙 ?쇰퀎 洹몃９?붿슜)
  const toKey = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const weekdayShort = ['??', '??', '??', '??', '紐?', '湲?', '??'];
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

  // ?좎쭨 踰붿쐞 怨꾩궛 (?붾쾭洹몄슜)
  const { start: rangeStart, end: rangeEnd } = viewMode === 'day'
    ? { start: selectedDate, end: selectedDate }
    : getRange(selectedDate, viewMode);

  console.log('?뱟 ?꾪꽣 ?좎쭨 踰붿쐞:', {
    ?쒖옉: toLocalDateString(rangeStart),
    醫낅즺: toLocalDateString(rangeEnd),
    viewMode
  });

  // Google Sheets ?곗씠???꾪꽣留?
  let filteredGoogleSheets = googleSheetsData.filter(reservation => {
    let targetDate: Date | null = null;
    let dateType = '';
    let dateFieldValue = '';

    // 媛??쒕퉬????낅퀎 ?좎쭨 ?꾨뱶 ?뺤씤
    if (reservation.checkin) {
      // ?щ（利??곗씠??      dateFieldValue = reservation.checkin;
      targetDate = parseDate(reservation.checkin);
      dateType = '?щ（利?泥댄겕??';
    } else if (reservation.pickupDatetime) {
      // 李⑤웾 ?곗씠??      dateFieldValue = reservation.pickupDatetime;
      targetDate = parseDate(reservation.pickupDatetime);
      dateType = '李⑤웾 ?뱀감?쇱떆';
    } else if (reservation.boardingDate) {
      // ?ㅽ븯李⑤웾 ?곗씠??      dateFieldValue = reservation.boardingDate;
      targetDate = parseDate(reservation.boardingDate);
      dateType = '?ㅽ븯李⑤웾 ?뱀감??';
    } else if (reservation.date) {
      // 怨듯빆 ?곗씠??      dateFieldValue = reservation.date;
      targetDate = parseDate(reservation.date);
      dateType = '怨듯빆 ?쇱옄';
    } else if (reservation.checkinDate) {
      // ?명뀛 ?곗씠??      dateFieldValue = reservation.checkinDate;
      targetDate = parseDate(reservation.checkinDate);
      dateType = '?명뀛 泥댄겕??';
    } else if (reservation.startDate) {
      // ?ъ뼱 ?곗씠??      dateFieldValue = reservation.startDate;
      targetDate = parseDate(reservation.startDate);
      dateType = '?ъ뼱 ?쒖옉??';
    } else if (reservation.pickupDate) {
      // ?뚰듃移??곗씠??      dateFieldValue = reservation.pickupDate;
      targetDate = parseDate(reservation.pickupDate);
      dateType = '?뚰듃移??뱀감??';
    }

    // ?좎쭨媛 ?녿뒗 ?곗씠?곕뒗 ?꾪꽣留곸뿉???쒖쇅
    if (!targetDate) {
      const serviceType = reservation.cruise ? '?щ（利?' :
        reservation.carType && reservation.pickupDatetime ? '李⑤웾' :
          reservation.vehicleNumber ? '?ㅽ븯李⑤웾' :
            reservation.airportName ? '怨듯빆' :
              reservation.hotelName ? '?명뀛' :
                reservation.tourName ? '?ъ뼱' :
                  reservation.carCode && reservation.pickupDate ? '?뚰듃移?' : '誘명솗??';
      // 留ㅼ슦 ?쒕Ъ寃뚮쭔 濡쒓퉭 (0.1% ?뺣쪧)
      if (Math.random() < 0.001) {
        console.log(`?좑툘 ?좎쭨 ?녿뒗 ${serviceType} ?쒖쇅:`, reservation.orderId);
      }
      return false; // ???좎쭨 ?놁쑝硫??쒖떆 ?덊븿
    }    // ?좎쭨 踰붿쐞 ?꾪꽣留?
    if (viewMode === 'day') {
      const result = isSameLocalDate(targetDate, selectedDate);
      return result;
    }
    const { start, end } = getRange(selectedDate, viewMode);
    const result = isDateInRange(targetDate, start, end);

    // ?붾쾭源? ?쒕뜡 ?섑뵆留곸쑝濡?濡쒓렇 ?뺤씤
    if (Math.random() < 0.005) {
      const formatLocalDate = (d: Date) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };
      console.log('?뵊 ?좎쭨 鍮꾧탳:', {
        orderId: reservation.orderId,
        ?먮낯?좎쭨: dateFieldValue,
        ?뚯떛寃곌낵: formatLocalDate(targetDate),
        踰붿쐞?쒖옉: formatLocalDate(start),
        踰붿쐞醫낅즺: formatLocalDate(end),
        留ㅼ묶: result ? '??' : '??'
      });
    }

    return result;
  });

  // 寃?됱뼱 ?꾪꽣留?(紐⑤뱺 ?곗씠?곗뿉??寃?? ?좎쭨 ?꾪꽣 臾댁떆)
  if (activeSearchQuery.trim()) {
    const query = activeSearchQuery.toLowerCase().trim();
    filteredGoogleSheets = googleSheetsData.filter(item => {
      // 紐⑤뱺 ?꾨뱶?먯꽌 寃??
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

  // ?꾪꽣留?寃곌낵 濡쒓퉭
  console.log('?뵇 ?꾪꽣留?寃곌낵:');
  console.log('  ?꾩껜?곗씠??', googleSheetsData.length, '嫄?');
  console.log('  ?꾪꽣留곹썑:', filteredGoogleSheets.length, '嫄?');
  console.log('  ?꾩옱 ?좏깮 ?좎쭨:', toLocalDateString(selectedDate));
  console.log('  酉곕え??', viewMode);

  // ?쒕퉬?ㅻ퀎 ?꾪꽣留?寃곌낵
  const filteredServiceCounts = {
    cruise: filteredGoogleSheets.filter(d => d.cruise).length,
    car: filteredGoogleSheets.filter(d => d.carType && d.pickupDatetime).length,
    vehicle: filteredGoogleSheets.filter(d => d.vehicleNumber).length,
    airport: filteredGoogleSheets.filter(d => d.airportName).length,
    hotel: filteredGoogleSheets.filter(d => d.hotelName).length,
    tour: filteredGoogleSheets.filter(d => d.tourName).length,
    rentcar: filteredGoogleSheets.filter(d => d.carCode && d.pickupDate).length
  };
  console.log('  ?쒕퉬?ㅻ퀎 ?꾪꽣留?寃곌낵:');
  Object.entries(filteredServiceCounts).forEach(([type, count]) => {
    if (count > 0) console.log(`    ${type}: ${count}嫄?`);
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

  // Google Sheets ?곗씠??????뺤씤 ?⑥닔??
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

  // ?쒕퉬??????먮퀎 ?⑥닔
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

  // ?쒕퉬????낅퀎 ?꾩씠肄?諛??대쫫
  const getServiceInfo = (type: string) => {
    const serviceMap: Record<string, { icon: React.ReactNode; name: string; color: string }> = {
      cruise: { icon: <Ship className="w-5 h-5" />, name: '?щ（利?', color: 'blue' },
      car: { icon: <Car className="w-5 h-5" />, name: '李⑤웾', color: 'blue' },
      vehicle: { icon: <Car className="w-5 h-5" />, name: '?ㅽ븯李⑤웾', color: 'purple' },
      airport: { icon: <Plane className="w-5 h-5" />, name: '怨듯빆', color: 'green' },
      hotel: { icon: <Building className="w-5 h-5" />, name: '?명뀛', color: 'orange' },
      tour: { icon: <MapPin className="w-5 h-5" />, name: '?ъ뼱', color: 'red' },
      rentcar: { icon: <Car className="w-5 h-5" />, name: '?뚰듃移?', color: 'indigo' }
    };
    return serviceMap[type] || { icon: <Calendar className="w-5 h-5" />, name: '湲고?', color: 'gray' };
  };

  // ?쒕퉬?ㅻ퀎 洹몃９??
  const groupedByService = filteredGoogleSheets.reduce((acc: Record<string, any[]>, reservation) => {
    const serviceType = getServiceType(reservation);
    (acc[serviceType] ||= []).push(reservation);
    return acc;
  }, {});

  // ?꾪꽣留?寃곌낵 濡쒓렇
  console.log('?뵇 ?꾪꽣留?寃곌낵:');
  console.log('  ?꾩껜?곗씠??', googleSheetsData.length, '嫄?');
  console.log('  ?꾪꽣留곹썑:', filteredGoogleSheets.length, '嫄?');
  console.log('  ?꾩옱 ?좏깮 ?좎쭨:', selectedDate.toISOString().split('T')[0]);
  console.log('  酉곕え??', viewMode);
  console.log('  ?쒕퉬?ㅻ퀎 ?꾪꽣留?寃곌낵:');
  Object.entries(groupedByService).forEach(([type, items]) => {
    console.log(`    ${type}: ${items.length}嫄?`);
  });

  // ?꾪꽣留곷맂 ?곗씠???섑뵆 ?뺤씤 (泥섏쓬 3媛?
  if (filteredGoogleSheets.length > 0) {
    console.log('  ?뱥 ?꾪꽣留곷맂 ?곗씠???섑뵆:');
    filteredGoogleSheets.slice(0, 3).forEach((item, idx) => {
      const dateField = item.checkin || item.pickupDatetime || item.boardingDate ||
        item.date || item.checkinDate || item.startDate || item.pickupDate;
      console.log(`    [${idx + 1}] ${item.orderId} - ?좎쭨: ${dateField}`);
    });
  }

  // Google Sheets ?덉빟 移대뱶 ?뚮뜑留?
  const renderGoogleSheetsCard = (reservation: any, index: number) => {
    // 1. ?щ（利??곗씠??
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
              ?щ（利?            </h5>
            <div className="flex items-center gap-2">
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-medium ${isPast
                  ? 'bg-gray-200 text-gray-700'
                  : 'bg-blue-100 text-blue-800'
                  }`}
              >
                {isPast ? '?꾨즺' : '?덉젙'}
              </span>
              <button
                onClick={() => handleOpenGoogleSheetsDetail(reservation)}
                className="bg-blue-500 text-white py-0.5 px-2 rounded text-xs hover:bg-blue-600 transition-colors"
              >
                ?곸꽭
              </button>
              {(userEmail === 'kys@hyojacho.es.kr' || userEmail === 'kjh@hyojacho.es.kr') && (
                <button
                  onClick={() => handleDeleteGoogleSheetsReservation(reservation)}
                  className="bg-red-500 text-white py-0.5 px-2 rounded text-xs hover:bg-red-600 transition-colors"
                  title="??젣"
                >
                  ?뿊截?                </button>
              )}
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
              <span className="font-semibold text-gray-500 text-xs mt-0.5">?щ（利?</span>
              <span className="text-sm font-bold text-blue-700 break-words">{reservation.cruise}</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-semibold text-gray-500 text-xs mt-0.5">媛앹떎</span>
              <span className="text-sm break-words">{reservation.roomType} {reservation.category && `(${reservation.category})`}</span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <Calendar className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-medium">
                {checkinDate?.toLocaleDateString('ko-KR')}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-500 text-xs">?몄썝</span>
              <span className="text-sm">
                {reservation.adult > 0 && `?뫅 ${reservation.adult}紐?`}
                {reservation.child > 0 && ` ?뫔 ${reservation.child}紐?`}
                {reservation.toddler > 0 && ` ?띁 ${reservation.toddler}紐?`}
                {reservation.adult === 0 && reservation.child === 0 && reservation.toddler === 0 && (
                  <span className="text-gray-400">-</span>
                )}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-500 text-xs">媛앹떎??</span>
              <span className="text-sm">{reservation.roomCount}媛?</span>
            </div>
            {reservation.discount && (
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-500 text-xs">?좎씤</span>
                <span className="text-sm text-green-600">{reservation.discount}</span>
              </div>
            )}
            {reservation.requestNote && (
              <div className="flex items-start gap-2 mt-2 pt-2 border-t border-gray-200">
                <span className="font-semibold text-orange-600 text-xs whitespace-nowrap">?뱷</span>
                <span className="text-sm text-gray-700 leading-relaxed">{reservation.requestNote}</span>
              </div>
            )}
          </div>
        </div>
      );
    }

    // 2. ?ㅽ븯李⑤웾 ?곗씠??
    else if (isVehicleData(reservation)) {
      console.log('?슇 ?ㅽ븯李⑤웾 ?뚮뜑留?', {
        orderId: reservation.orderId,
        boardingDate: reservation.boardingDate,
        vehicleNumber: reservation.vehicleNumber,
        customerName: reservation.customerName
      });
      const boardingDate = parseDate(reservation.boardingDate);
      console.log('?뱟 ?뚯떛???좎쭨:', boardingDate);
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
              ?ㅽ븯李⑤웾
            </h5>
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${isPast ? 'bg-gray-200 text-gray-700' : 'bg-purple-100 text-purple-800'}`}>
                {isPast ? '?꾨즺' : '?덉젙'}
              </span>
              <button
                onClick={() => handleOpenGoogleSheetsDetail(reservation)}
                className="bg-purple-500 text-white py-0.5 px-2 rounded text-xs hover:bg-purple-600 transition-colors"
              >
                ?곸꽭
              </button>
              {(userEmail === 'kys@hyojacho.es.kr' || userEmail === 'kjh@hyojacho.es.kr') && (
                <button
                  onClick={() => handleDeleteGoogleSheetsReservation(reservation)}
                  className="bg-red-500 text-white py-0.5 px-2 rounded text-xs hover:bg-red-600 transition-colors"
                  title="??젣"
                >
                  ?뿊截?                </button>
              )}
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
                <span className="font-semibold text-gray-500 text-xs mt-0.5">?щ（利?</span>
                <span className="text-sm text-purple-700 font-medium break-words">{reservation.cruiseInfo}</span>
              </div>
            )}
            <div className="flex items-center gap-2 mt-1">
              <Calendar className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-medium">
                {boardingDate ? boardingDate.toLocaleDateString('ko-KR') : <span className="text-red-500">?좎쭨 ?놁쓬 ({reservation.boardingDate})</span>}
              </span>
            </div>
            <div className="flex items-start gap-2">
              <Car className="w-4 h-4 text-gray-400 mt-0.5" />
              <span className="text-sm break-words">{reservation.vehicleNumber} / 醫뚯꽍: {reservation.seatNumber}</span>
            </div>
            {reservation.pickupLocation && (
              <div className="flex items-start gap-2 mt-1">
                <span className="font-semibold text-gray-500 text-xs mt-0.5">?쎌뾽</span>
                <span className="text-sm break-words">{reservation.pickupLocation}</span>
              </div>
            )}
            {reservation.dropoffLocation && (
              <div className="flex items-start gap-2">
                <span className="font-semibold text-gray-500 text-xs mt-0.5">?쒕엻</span>
                <span className="text-sm break-words">{reservation.dropoffLocation}</span>
              </div>
            )}
          </div>
        </div>
      );
    }

    // 3. 怨듯빆 ?곗씠??
    else if (isAirportData(reservation)) {
      const serviceDate = parseDate(reservation.date);
      const isPast = isPastDate(reservation.date);
      const rawStopover = String(reservation.stopover || '').trim();
      const locationLabel = rawStopover === '寃쎌쑀吏' ? '?숇컯吏 ?뺣낫' : (rawStopover || '?꾩튂');
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
              怨듯빆?쒕퉬??            </h5>
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${isPast ? 'bg-gray-200 text-gray-700' : 'bg-green-100 text-green-800'}`}>
                {isPast ? '?꾨즺' : '?덉젙'}
              </span>
              <button
                onClick={() => handleOpenGoogleSheetsDetail(reservation)}
                className="bg-green-500 text-white py-0.5 px-2 rounded text-xs hover:bg-green-600 transition-colors"
              >
                ?곸꽭
              </button>
              {(userEmail === 'kys@hyojacho.es.kr' || userEmail === 'kjh@hyojacho.es.kr') && (
                <button
                  onClick={() => handleDeleteGoogleSheetsReservation(reservation)}
                  className="bg-red-500 text-white py-0.5 px-2 rounded text-xs hover:bg-red-600 transition-colors"
                  title="??젣"
                >
                  ?뿊截?                </button>
              )}
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
              <span className="font-semibold text-gray-500 text-xs mt-0.5">援щ텇</span>
              <span className="text-sm font-bold text-green-700 break-words">{reservation.tripType} - {reservation.category}</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-semibold text-gray-500 text-xs mt-0.5">寃쎈줈</span>
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
              <span className="font-semibold text-gray-500 text-xs">?몄썝/李⑤웾</span>
              <span className="text-sm">?뫁 {reservation.passengerCount}紐?/ ?슅 {reservation.carCount}?</span>
            </div>
            {reservation.carrierCount > 0 && (
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-500 text-xs">罹먮━??</span>
                <span className="text-sm">?㎡ {reservation.carrierCount}媛?</span>
              </div>
            )}
          </div>
        </div>
      );
    }

    // 4. ?명뀛 ?곗씠??
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
              ?명뀛
            </h5>
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${isPast ? 'bg-gray-200 text-gray-700' : 'bg-orange-100 text-orange-800'}`}>
                {isPast ? '?꾨즺' : '?덉젙'}
              </span>
              <button
                onClick={() => handleOpenGoogleSheetsDetail(reservation)}
                className="bg-orange-500 text-white py-0.5 px-2 rounded text-xs hover:bg-orange-600 transition-colors"
              >
                ?곸꽭
              </button>
              {(userEmail === 'kys@hyojacho.es.kr' || userEmail === 'kjh@hyojacho.es.kr') && (
                <button
                  onClick={() => handleDeleteGoogleSheetsReservation(reservation)}
                  className="bg-red-500 text-white py-0.5 px-2 rounded text-xs hover:bg-red-600 transition-colors"
                  title="??젣"
                >
                  ?뿊截?                </button>
              )}
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
              <span className="font-semibold text-gray-500 text-xs mt-0.5">?명뀛</span>
              <span className="text-sm font-bold text-orange-700 break-words">{reservation.hotelName}</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-semibold text-gray-500 text-xs mt-0.5">媛앹떎</span>
              <span className="text-sm break-words">{reservation.roomName} ({reservation.roomType})</span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <Calendar className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-medium">
                {checkinDate?.toLocaleDateString('ko-KR')}
                {reservation.days > 0 && <span className="text-xs text-gray-500 ml-1">({reservation.days}諛?</span>}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-500 text-xs">?몄썝</span>
              <span className="text-sm">
                {reservation.adult > 0 && `?뫅 ${reservation.adult}紐?`}
                {reservation.child > 0 && ` ?뫔 ${reservation.child}紐?`}
                {reservation.toddler > 0 && ` ?띁 ${reservation.toddler}紐?`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-500 text-xs">媛앹떎??</span>
              <span className="text-sm">{reservation.roomCount}媛?</span>
            </div>
            {reservation.breakfastService && (
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-500 text-xs">議곗떇</span>
                <span className="text-sm">?뜵 ?ы븿</span>
              </div>
            )}
          </div>
        </div>
      );
    }

    // 5. ?ъ뼱 ?곗씠??
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
              ?ъ뼱
            </h5>
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${isPast ? 'bg-gray-200 text-gray-700' : 'bg-pink-100 text-pink-800'}`}>
                {isPast ? '?꾨즺' : '?덉젙'}
              </span>
              <button
                onClick={() => handleOpenGoogleSheetsDetail(reservation)}
                className="bg-pink-500 text-white py-0.5 px-2 rounded text-xs hover:bg-pink-600 transition-colors"
              >
                ?곸꽭
              </button>
              {(userEmail === 'kys@hyojacho.es.kr' || userEmail === 'kjh@hyojacho.es.kr') && (
                <button
                  onClick={() => handleDeleteGoogleSheetsReservation(reservation)}
                  className="bg-red-500 text-white py-0.5 px-2 rounded text-xs hover:bg-red-600 transition-colors"
                  title="??젣"
                >
                  ?뿊截?                </button>
              )}
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
              <span className="font-semibold text-gray-500 text-xs mt-0.5">?ъ뼱</span>
              <span className="text-sm font-bold text-pink-700 break-words">{reservation.tourName}</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-semibold text-gray-500 text-xs mt-0.5">醫낅쪟</span>
              <span className="text-sm break-words">{reservation.tourType}</span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <Calendar className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-medium">{startDate?.toLocaleDateString('ko-KR')}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-500 text-xs">?몄썝</span>
              <span className="text-sm">?뫁 {reservation.participants}紐?</span>
            </div>
            {reservation.pickupLocation && (
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
                <span className="text-sm break-words">{reservation.pickupLocation}</span>
              </div>
            )}
            {reservation.memo && (
              <div className="flex items-start gap-2">
                <span className="font-semibold text-gray-500 text-xs mt-0.5">硫붾え</span>
                <span className="text-sm text-gray-600 break-words">{reservation.memo}</span>
              </div>
            )}
          </div>
        </div>
      );
    }

    // 6. ?뚰듃移??곗씠??
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
              ?뚰듃移?            </h5>
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${isPast ? 'bg-gray-200 text-gray-700' : 'bg-indigo-100 text-indigo-800'}`}>
                {isPast ? '?꾨즺' : '?덉젙'}
              </span>
              <button
                onClick={() => handleOpenGoogleSheetsDetail(reservation)}
                className="bg-indigo-500 text-white py-0.5 px-2 rounded text-xs hover:bg-indigo-600 transition-colors"
              >
                ?곸꽭
              </button>
              {(userEmail === 'kys@hyojacho.es.kr' || userEmail === 'kjh@hyojacho.es.kr') && (
                <button
                  onClick={() => handleDeleteGoogleSheetsReservation(reservation)}
                  className="bg-red-500 text-white py-0.5 px-2 rounded text-xs hover:bg-red-600 transition-colors"
                  title="??젣"
                >
                  ?뿊截?                </button>
              )}
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
              <span className="font-semibold text-gray-500 text-xs mt-0.5">李⑤웾</span>
              <span className="text-sm font-bold text-indigo-700 break-words">{reservation.carType}</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-semibold text-gray-500 text-xs mt-0.5">寃쎈줈</span>
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
                {reservation.destination && ` ??${reservation.destination}`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-500 text-xs">?몄썝/李⑤웾</span>
              <span className="text-sm">?뫁 {reservation.passengerCount}紐?/ ?슅 {reservation.carCount}?</span>
            </div>
            {reservation.usagePeriod && (
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-500 text-xs">?ъ슜湲곌컙</span>
                <span className="text-sm">{reservation.usagePeriod}</span>
              </div>
            )}
          </div>
        </div>
      );
    }

    // 7. 李⑤웾 ?곗씠??(湲곕낯)
    else if (isCarData(reservation)) {
      console.log('?슅 李⑤웾 ?뚮뜑留?', {
        orderId: reservation.orderId,
        pickupDatetime: reservation.pickupDatetime,
        customerName: reservation.customerName,
        carType: reservation.carType
      });
      const pickupDate = parseDate(reservation.pickupDatetime);
      console.log('?뱟 ?뚯떛???좎쭨:', pickupDate);
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
              ?щ（利?李⑤웾
            </h5>
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${reservation.segmentType === 'return' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                {reservation.segmentRibbon || (reservation.segmentType === 'return' ? '由ы꽩' : '?쎌뾽')}
              </span>
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-medium ${isPast
                  ? 'bg-gray-200 text-gray-700'
                  : 'bg-blue-100 text-blue-800'
                  }`}
              >
                {isPast ? '?꾨즺' : '?덉젙'}
              </span>
              <button
                onClick={() => handleOpenGoogleSheetsDetail(reservation)}
                className="bg-blue-500 text-white py-0.5 px-2 rounded text-xs hover:bg-blue-600 transition-colors"
              >
                ?곸꽭
              </button>
              {(userEmail === 'kys@hyojacho.es.kr' || userEmail === 'kjh@hyojacho.es.kr') && (
                <button
                  onClick={() => handleDeleteGoogleSheetsReservation(reservation)}
                  className="bg-red-500 text-white py-0.5 px-2 rounded text-xs hover:bg-red-600 transition-colors"
                  title="??젣"
                >
                  ?뿊截?                </button>
              )}
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
              <span className="font-semibold text-gray-500 text-xs mt-0.5">李⑤웾</span>
              <span className="text-sm break-words">{reservation.carType}</span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <Calendar className="w-4 h-4 text-gray-400" />
              <span className="text-sm">
                {pickupDate ? pickupDate.toLocaleDateString('ko-KR') : <span className="text-red-500">?좎쭨 ?놁쓬 ({reservation.pickupDatetime})</span>}
              </span>
            </div>
            {reservation.segmentType !== 'return' && reservation.pickupLocation && (
              <div className="flex items-start gap-2">
                <span className="font-semibold text-gray-500 text-xs mt-0.5">?뱀감</span>
                <span className="text-sm break-words">{reservation.pickupLocation}</span>
              </div>
            )}
            {reservation.segmentType === 'return' && reservation.dropoffLocation && (
              <div className="flex items-start gap-2">
                <span className="font-semibold text-gray-500 text-xs mt-0.5">?섏감</span>
                <span className="text-sm break-words">{reservation.dropoffLocation}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-500 text-xs">?몄썝/李⑤웾</span>
              <span className="text-sm">
                ?뫁 {reservation.passengerCount}紐?/ ?슅 {reservation.carCount}?
              </span>
            </div>
          </div>
        </div>
      );
    }

    // 湲고? (fallback)
    return null;
  };

  if (loading) {
    return (
      <ManagerLayout title="?덉빟 ?쇱젙 (??援?援щ텇)" activeTab="schedule-new">
        <div className="flex justify-center items-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto"></div>
            <p className="mt-4 text-gray-600">?쇱젙 ?뺣낫瑜?遺덈윭?ㅻ뒗 以?..</p>
          </div>
        </div>
      </ManagerLayout>
    );
  }

  return (
    <ManagerLayout title="?덉빟 ?쇱젙 (??援?援щ텇)" activeTab="schedule-new">
      <div className="space-y-6">

        {/* ?쇱젙 而⑦듃濡?*/}
        <div className="bg-white rounded-lg shadow-md p-6">
          {/* 1?? ?좎쭨 ?ㅻ퉬寃뚯씠??+ 寃??諛?+ ?쇨컙/二쇨컙/?붽컙 踰꾪듉 */}
          <div className="flex items-center justify-between gap-4 mb-4">
            {/* ?쇱そ: ?좎쭨 ?ㅻ퉬寃뚯씠??*/}
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
                title="?좎쭨 ?좏깮"
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

              {/* ?ㅻ뒛 踰꾪듉 */}
              {viewMode === 'day' && (
                <button
                  onClick={() => setSelectedDate(new Date())}
                  className="px-2 py-1 bg-blue-50 text-blue-600 rounded border border-blue-200 text-xs font-medium hover:bg-blue-100"
                >?ㅻ뒛</button>
              )}

              <button
                onClick={() => navigateDate('next')}
                className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            {/* 以묒븰: 寃??諛?*/}
            <div className="flex items-center gap-1 flex-1 max-w-md">
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="寃??.."
                  className="w-full px-3 py-2 pr-8 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <Search className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              </div>
              <button
                onClick={handleSearch}
                className="px-3 py-2 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 transition-colors"
              >
                寃??              </button>
              {activeSearchQuery && (
                <button
                  onClick={handleClearSearch}
                  className="px-3 py-2 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300 transition-colors"
                >
                  珥덇린??                </button>
              )}
            </div>

            {/* ?ㅻⅨ履? ?쇨컙/二쇨컙/?붽컙 踰꾪듉 */}
            <div className="flex gap-1">
              <button
                onClick={() => setViewMode('day')}
                className={`px-3 py-2 rounded text-sm transition-colors ${viewMode === 'day' ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-700'}`}
              >
                ?쇨컙
              </button>
              <button
                onClick={() => setViewMode('week')}
                className={`px-3 py-2 rounded text-sm transition-colors ${viewMode === 'week' ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-700'}`}
              >
                二쇨컙
              </button>
              <button
                onClick={() => setViewMode('month')}
                className={`px-3 py-2 rounded text-sm transition-colors ${viewMode === 'month' ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-700'}`}
              >
                ?붽컙
              </button>
            </div>
          </div>

          {/* 2?? ????꾪꽣 + 洹몃９??+ 寃??寃곌낵 */}
          <div className="flex items-center justify-start gap-4">
            {/* ????꾪꽣 */}
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-600" />
              <div className="flex gap-1 flex-wrap">
                <button
                  onClick={() => setTypeFilter('all')}
                  className={`px-2 py-1 rounded-full text-xs transition-colors ${typeFilter === 'all' ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-700'}`}
                >
                  ?꾩껜
                </button>
                {['cruise', 'vehicle', 'sht', 'airport', 'hotel', 'tour', 'rentcar'].map(type => (
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

            {/* 洹몃９??踰꾪듉 (二??붽컙 紐⑤뱶?먮쭔 ?쒖떆) */}
            {(viewMode === 'week' || viewMode === 'month') && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-600">洹몃９??</span>
                <div className="inline-flex rounded overflow-hidden border border-gray-200">
                  <button
                    onClick={() => setGroupMode('day')}
                    className={`px-2 py-1 text-xs ${groupMode === 'day' ? 'bg-green-500 text-white' : 'bg-gray-50 text-gray-700'}`}
                  >
                    ?쇰퀎
                  </button>
                  <button
                    onClick={() => setGroupMode('type')}
                    className={`px-2 py-1 text-xs ${groupMode === 'type' ? 'bg-green-500 text-white' : 'bg-gray-50 text-gray-700'}`}
                  >
                    ??낅퀎
                  </button>
                </div>
              </div>
            )}

            {/* 寃??寃곌낵 ?쒖떆 */}
            {activeSearchQuery && (
              <div className="text-xs text-blue-600 ml-auto">
                寃?? "{activeSearchQuery}"
              </div>
            )}
          </div>
        </div>

        {/* ?쇱젙 紐⑸줉 - 2??援ъ“ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* ?쇱そ: Supabase ?곗씠??*/}
          <div className="bg-white rounded-lg shadow-md">
            <div className="p-6 border-b bg-green-50">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Calendar className="w-6 h-6 text-green-600" />
                DB ?덉빟 ?쇱젙 ({filteredSchedules.length}嫄?
              </h3>
            </div>

            {filteredSchedules.length === 0 ? (
              <div className="p-8 text-center">
                <Calendar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-600 mb-2">
                  {typeFilter === 'all' ? '?덉빟???쇱젙???놁뒿?덈떎' : `${getTypeName(typeFilter)} ?쇱젙???놁뒿?덈떎`}
                </h3>
              </div>
            ) : (
              <div className="p-6 space-y-10">
                {/* ?쇨컙 蹂닿린: 湲곗〈 ??낅퀎 援щ텇 ?놁씠 ?꾩껜 由ъ뒪??*/}
                {viewMode === 'day' && (
                  <div>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                      {uniqueSchedules.map((schedule: any, idx: number) => (
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
                                {schedule.re_status === 'confirmed' ? '?뺤젙' : schedule.re_status === 'pending' ? '?湲?' : '痍⑥냼'}
                              </span>
                              <button
                                onClick={() => {
                                  if (schedule.users?.id) {
                                    loadAllUserReservations(schedule.users.id);
                                  } else {
                                    setSelectedSchedule(schedule);
                                    setIsModalOpen(true);
                                  }
                                }}
                                className="bg-blue-500 text-white py-0.5 px-2 rounded text-xs hover:bg-blue-600 transition-colors"
                              >?곸꽭</button>
                            </div>
                          </div>
                          {renderDbCardBody(schedule)}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 二??붽컙 蹂닿린 */}
                {(viewMode === 'week' || viewMode === 'month') && (
                  <>
                    {groupMode === 'day' && (
                      <div className="space-y-8">
                        {Object.keys(groupedByDate)
                          .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
                          .map(key => {
                            const list = groupedByDate[key];
                            const d = new Date(key + 'T00:00:00');
                            return (
                              <div key={key}>
                                <div className="flex items-center justify-between mb-3">
                                  <h4 className="text-md font-semibold flex items-center gap-2">
                                    <Calendar className="w-5 h-5 text-green-600" /> {formatDateLabel(d)} <span className="text-gray-500">({list.length}嫄?</span>
                                  </h4>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                                  {list.map((schedule: any, idx: number) => (
                                    <div key={`${schedule.re_id}-${schedule.service_table}-${schedule.segment_type || schedule.rentcar_phase || 'default'}-${idx}`} className="bg-gray-50 border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-all p-3 flex flex-col h-full">
                                      <div className="flex items-center gap-2 mb-2 pb-1 border-b border-gray-100">
                                        <div className="flex items-center justify-center w-9 h-9 rounded-full bg-gray-50 border border-gray-200">
                                          {getDisplayTypeIcon(schedule)}
                                        </div>
                                        <h5 className="font-bold text-sm flex-1 truncate text-gray-800">{getDisplayTypeName(schedule)}</h5>
                                        {schedule.segment_ribbon && (
                                          <span className={`px-2 py-0.5 rounded text-xs font-semibold ${(schedule.segment_type === 'return' || schedule.rentcar_phase === 'return') ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                            {schedule.segment_ribbon}
                                          </span>
                                        )}
                                        <div className="flex items-center gap-2">
                                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${schedule.re_status === 'confirmed' ? 'bg-green-100 text-green-800' : schedule.re_status === 'pending' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>
                                            {schedule.re_status === 'confirmed' ? '?뺤젙' : schedule.re_status === 'pending' ? '?湲?' : '痍⑥냼'}
                                          </span>
                                          <button onClick={() => {
                                            if (schedule.users?.id) {
                                              loadAllUserReservations(schedule.users.id);
                                            } else {
                                              setSelectedSchedule(schedule);
                                              setIsModalOpen(true);
                                            }
                                          }} className="bg-blue-500 text-white py-0.5 px-2 rounded text-xs hover:bg-blue-600 transition-colors">?곸꽭</button>
                                        </div>
                                      </div>
                                      {renderDbCardBody(schedule)}
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
                        {Object.entries(groupedByType).map(([type, list]) => (
                          <div key={type}>
                            <div className="flex items-center justify-between mb-3">
                              <h4 className="text-md font-semibold flex items-center gap-2">
                                {getTypeIcon(typeFilter === 'sht' || typeFilter === 'vehicle' ? 'vehicle' : type)} {typeFilter === 'sht' ? getTypeName('sht') : typeFilter === 'vehicle' ? getTypeName('vehicle') : getTypeName(type)} <span className="text-gray-500">({list.length}嫄?</span>
                              </h4>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                              {list.map((schedule: any, idx: number) => (
                                <div key={`${schedule.re_id}-${schedule.service_table}-${schedule.segment_type || schedule.rentcar_phase || 'default'}-${idx}`} className="bg-gray-50 border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-all p-3 flex flex-col h-full">
                                  <div className="flex items-center gap-2 mb-2 pb-1 border-b border-gray-100">
                                    <div className="flex items-center justify-center w-9 h-9 rounded-full bg-gray-50 border border-gray-200">
                                      {getDisplayTypeIcon(schedule)}
                                    </div>
                                    <h5 className="font-bold text-sm flex-1 truncate text-gray-800">{getDisplayTypeName(schedule)}</h5>
                                    {schedule.segment_ribbon && (
                                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${(schedule.segment_type === 'return' || schedule.rentcar_phase === 'return') ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                        {schedule.segment_ribbon}
                                      </span>
                                    )}
                                    <div className="flex items-center gap-2">
                                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${schedule.re_status === 'confirmed' ? 'bg-green-100 text-green-800' : schedule.re_status === 'pending' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>
                                        {schedule.re_status === 'confirmed' ? '?뺤젙' : schedule.re_status === 'pending' ? '?湲?' : '痍⑥냼'}
                                      </span>
                                      <button onClick={() => {
                                        if (schedule.users?.id) {
                                          loadAllUserReservations(schedule.users.id);
                                        } else {
                                          setSelectedSchedule(schedule);
                                          setIsModalOpen(true);
                                        }
                                      }} className="bg-blue-500 text-white py-0.5 px-2 rounded text-xs hover:bg-blue-600 transition-colors">?곸꽭</button>
                                    </div>
                                  </div>
                                  {renderDbCardBody(schedule)}
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div >

          {/* ?ㅻⅨ履? ?쒗듃 ?곗씠??*/}
          <div className="bg-white rounded-lg shadow-md">
            <div className="p-6 border-b bg-blue-50">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Calendar className="w-6 h-6 text-blue-600" />
                ?쒗듃 ?덉빟 ?쇱젙 ({filteredGoogleSheets.length}嫄?
              </h3>
            </div>

            {googleSheetsLoading ? (
              <div className="p-8 text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
                <p className="mt-4 text-gray-600">?곗씠?곕? 遺덈윭?ㅻ뒗 以?..</p>
              </div>
            ) : googleSheetsError ? (
              <div className="p-8 text-center">
                <Calendar className="w-16 h-16 text-red-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-red-600 mb-2">
                  ?곗씠??濡쒕뱶 ?ㅽ뙣
                </h3>
                <p className="text-sm text-gray-500">{googleSheetsError}</p>
              </div>
            ) : filteredGoogleSheets.length === 0 ? (
              <div className="p-8 text-center">
                <Calendar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-600 mb-2">
                  {googleSheetsData.length === 0
                    ? 'DB???곗씠?곌? ?놁뒿?덈떎'
                    : '?덉빟???쇱젙???놁뒿?덈떎'}
                </h3>
                {googleSheetsData.length === 0 && (
                  <p className="text-sm text-gray-500 mt-2">
                    愿由ъ옄 ?섏씠吏?먯꽌 Google Sheets ?곗씠?곕? ?숆린?뷀빐二쇱꽭??
                  </p>
                )}
              </div>
            ) : (
              <div className="p-6 space-y-10">
                {/* ?쇨컙 蹂닿린 - ?쒕퉬?ㅻ퀎 洹몃９??*/}
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
                                <span className="ml-2 text-sm text-gray-500">({reservationArray.length}嫄?</span>
                              </h4>
                            </div>

                            {/* ?ㅽ븯李⑤웾??寃쎌슦 遺꾨쪟(category)蹂꾨줈 ?쒕툕洹몃９??*/}
                            {serviceType === 'vehicle' ? (
                              <div className="space-y-4">
                                {Object.entries(
                                  reservationArray.reduce((acc: Record<string, any[]>, reservation) => {
                                    const category = reservation.category || '誘몃텇瑜?';
                                    (acc[category] ||= []).push(reservation);
                                    return acc;
                                  }, {})
                                ).map(([category, categoryReservations]) => (
                                  <div key={category}>
                                    <div className="flex items-center gap-2 mb-2 ml-4">
                                      <span className="px-3 py-1 rounded bg-purple-100 text-purple-700 text-sm font-semibold">
                                        {category}
                                      </span>
                                      <span className="text-xs text-gray-500">({categoryReservations.length}嫄?</span>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                                      {categoryReservations.map((reservation, index) =>
                                        renderGoogleSheetsCard(reservation, index)
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                                {reservationArray.map((reservation, index) =>
                                  renderGoogleSheetsCard(reservation, index)
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    {Object.keys(groupedByService).length === 0 && (
                      <div className="text-center py-8 text-gray-500">
                        ?덉빟???쇱젙???놁뒿?덈떎.
                      </div>
                    )}
                  </div>
                )}

                {/* 二??붽컙 蹂닿린 */}
                {(viewMode === 'week' || viewMode === 'month') && (
                  <>
                    {groupMode === 'day' && (
                      <div className="space-y-8">
                        {Object.entries(
                          filteredGoogleSheets.reduce((acc: Record<string, any[]>, reservation) => {
                            // 媛??쒕퉬????낅퀎 ?좎쭨 ?꾨뱶 ?뺤씤
                            let date: Date | null = null;

                            if (reservation.checkin) {
                              date = parseDate(reservation.checkin); // ?щ（利?
                              } else if (reservation.pickupDatetime) {
                              date = parseDate(reservation.pickupDatetime); // 李⑤웾
                            } else if (reservation.boardingDate) {
                              date = parseDate(reservation.boardingDate); // ?ㅽ븯李⑤웾
                            } else if (reservation.date) {
                              date = parseDate(reservation.date); // 怨듯빆
                            } else if (reservation.checkinDate) {
                              date = parseDate(reservation.checkinDate); // ?명뀛
                            } else if (reservation.startDate) {
                              date = parseDate(reservation.startDate); // ?ъ뼱
                            } else if (reservation.pickupDate) {
                              date = parseDate(reservation.pickupDate); // ?뚰듃移?
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

                            // ?좎쭨蹂꾨줈 ?쒕퉬????낅퀎 洹몃９??
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
                                    <span className="text-gray-500">({reservationArray.length}嫄?</span>
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
                                              <span className="ml-2 text-xs text-gray-500">({serviceReservationArray.length}嫄?</span>
                                            </h5>
                                          </div>

                                          {/* ?ㅽ븯李⑤웾??寃쎌슦 遺꾨쪟(category)蹂꾨줈 ?쒕툕洹몃９??*/}
                                          {serviceType === 'vehicle' ? (
                                            <div className="space-y-4">
                                              {Object.entries(
                                                serviceReservationArray.reduce((acc: Record<string, any[]>, reservation) => {
                                                  const category = reservation.category || '誘몃텇瑜?';
                                                  (acc[category] ||= []).push(reservation);
                                                  return acc;
                                                }, {})
                                              ).map(([category, categoryReservations]) => (
                                                <div key={category}>
                                                  <div className="flex items-center gap-2 mb-2 ml-4">
                                                    <span className="px-3 py-1 rounded bg-purple-100 text-purple-700 text-sm font-semibold">
                                                      {category}
                                                    </span>
                                                    <span className="text-xs text-gray-500">({categoryReservations.length}嫄?</span>
                                                  </div>
                                                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                                                    {categoryReservations.map((reservation, index) =>
                                                      renderGoogleSheetsCard(reservation, index)
                                                    )}
                                                  </div>
                                                </div>
                                              ))}
                                            </div>
                                          ) : (
                                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                                              {serviceReservationArray.map((reservation, index) =>
                                                renderGoogleSheetsCard(reservation, index)
                                              )}
                                            </div>
                                          )}
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
                                    <span className="ml-2 text-sm text-gray-500">({reservationArray.length}嫄?</span>
                                  </h4>
                                </div>

                                {/* ?ㅽ븯李⑤웾??寃쎌슦 遺꾨쪟(category)蹂꾨줈 ?쒕툕洹몃９??*/}
                                {serviceType === 'vehicle' ? (
                                  <div className="space-y-4">
                                    {Object.entries(
                                      reservationArray.reduce((acc: Record<string, any[]>, reservation) => {
                                        const category = reservation.category || '誘몃텇瑜?';
                                        (acc[category] ||= []).push(reservation);
                                        return acc;
                                      }, {})
                                    ).map(([category, categoryReservations]) => (
                                      <div key={category}>
                                        <div className="flex items-center gap-2 mb-2 ml-4">
                                          <span className="px-3 py-1 rounded bg-purple-100 text-purple-700 text-sm font-semibold">
                                            {category}
                                          </span>
                                          <span className="text-xs text-gray-500">({categoryReservations.length}嫄?</span>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                                          {categoryReservations.map((reservation, index) =>
                                            renderGoogleSheetsCard(reservation, index)
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                                    {reservationArray.map((reservation, index) =>
                                      renderGoogleSheetsCard(reservation, index)
                                    )}
                                  </div>
                                )}
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

      {/* ?덉빟 ?뷀뀒??紐⑤떖 */}
      {selectedSchedule?.users?.id && (
        <UserReservationDetailModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          userId={selectedSchedule.users.id}
        />
      )}

      {/* DB ?덉빟 ?곸꽭 紐⑤떖 */}
      <UserReservationDetailModal
        isOpen={isDBModalOpen}
        onClose={() => setIsDBModalOpen(false)}
        userInfo={dbUserInfo}
        allUserServices={dbUserServices}
        loading={dbModalLoading}
      />

      {/* Google Sheets ?덉빟 ?곸꽭 紐⑤떖 */}
      <GoogleSheetsDetailModal
        isOpen={isGoogleSheetsModalOpen}
        onClose={() => setIsGoogleSheetsModalOpen(false)}
        selectedReservation={selectedGoogleSheetsReservation}
        allOrderServices={allOrderServices}
        loading={loadingOrderServices}
        orderUserInfo={orderUserInfo}
        relatedEmail={relatedEmail}
        relatedDbServices={relatedDbServices}
        relatedDbLoading={relatedDbLoading}
      />
    </ManagerLayout>
  );
}
