// @ts-nocheck
'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabase';
import {
  Calendar, Clock, Ship, Plane, Building, MapPin, Car,
  ChevronLeft, ChevronRight, Search, ArrowLeft, RefreshCw
} from 'lucide-react';
import ReservationDetailModal from './ReservationDetailModal';

/* ── 타입 정의 ──────────────────────────────── */
type ViewMode = 'day' | 'week' | 'month';
type SourceFilter = 'all' | 'old' | 'new';

/* ── 날짜 유틸 ──────────────────────────────── */
const parseDate = (dateStr: string | null | undefined): Date | null => {
  if (!dateStr) return null;
  const s = String(dateStr).trim();
  // YYYY-MM-DD
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3]);
  // YYYY. MM. DD
  const dot = s.match(/^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/);
  if (dot) return new Date(+dot[1], +dot[2] - 1, +dot[3]);
  // MM/DD/YYYY
  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (slash) return new Date(+slash[3], +slash[1] - 1, +slash[2]);
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
};

const isSameLocalDate = (d1: Date, d2: Date) =>
  d1.getFullYear() === d2.getFullYear() &&
  d1.getMonth() === d2.getMonth() &&
  d1.getDate() === d2.getDate();

const isDateInRange = (date: Date, start: Date, end: Date) => {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const s = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const e = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  return d >= s && d <= e;
};

const getRange = (base: Date, mode: ViewMode) => {
  const start = new Date(base);
  const end = new Date(base);
  if (mode === 'day') {
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  } else if (mode === 'week') {
    const day = start.getDay();
    const diffToMonday = (day === 0 ? -6 : 1) - day;
    start.setDate(start.getDate() + diffToMonday);
    start.setHours(0, 0, 0, 0);
    end.setTime(start.getTime());
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);
  } else {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    end.setMonth(start.getMonth() + 1, 0);
    end.setHours(23, 59, 59, 999);
  }
  return { start, end };
};

const isPastDate = (dateStr: string) => {
  const d = parseDate(dateStr);
  if (!d) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d < today;
};

const normalizeWayType = (value: string | null | undefined) => {
  const way = (value || '').toLowerCase();
  if (way === 'pickup' || way === '픽업') return '픽업';
  if (way === 'sending' || way === 'dropoff' || way === '샌딩') return '샌딩';
  return value || '';
};

const getPlus8DateTimeParts = (value: string | null | undefined) => {
  if (!value) return { date: '', time: '' };
  const parsed = new Date(String(value).replace(' ', 'T'));
  if (isNaN(parsed.getTime())) return { date: String(value), time: '' };
  const plus8 = new Date(parsed.getTime() + 8 * 60 * 60 * 1000);
  const yyyy = plus8.getFullYear();
  const mm = String(plus8.getMonth() + 1).padStart(2, '0');
  const dd = String(plus8.getDate()).padStart(2, '0');
  const time = plus8.toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: 'numeric', minute: '2-digit', hour12: true });
  return { date: `${yyyy}-${mm}-${dd}`, time };
};

/* ── DB 조회(전체 행) ─────────────────────────── */
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
  return allData;
};

const fetchRowsByIds = async (tableName: string, column: string, ids: string[]) => {
  if (!ids.length) return [];
  const chunkSize = 200;
  let allData: any[] = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .in(column, chunk);
    if (error) throw error;
    allData = allData.concat(data || []);
  }
  return allData;
};

/* ── 서비스 판별 ──────────────────────────────── */
const getServiceType = (item: any): string => {
  if (item.cruise && item.checkin) return 'cruise';
  if (item.boardingDate && item.vehicleNumber) return 'vehicle';
  const hasAirportHint = !!(item.tripType || item.route || item.airportName || item.flightNumber || item.placeName);
  if (hasAirportHint && (item.date || item.time || item.airportName)) return 'airport';
  if (item.hotelName && item.checkinDate) return 'hotel';
  if (item.tourName && item.startDate) return 'tour';
  if (item.pickupDate && item.usagePeriod) return 'rentcar';
  if (item.pickupDatetime && !item.boardingDate && !item.pickupDate) return 'car';
  return 'unknown';
};

const getDateField = (item: any): string | null => {
  if (item.checkin) return item.checkin;
  if (item.pickupDatetime) return item.pickupDatetime;
  if (item.boardingDate) return item.boardingDate;
  if (item.date) return item.date;
  if (item.checkinDate) return item.checkinDate;
  if (item.startDate) return item.startDate;
  if (item.pickupDate) return item.pickupDate;
  return null;
};

const serviceConfig: Record<string, { icon: any; name: string; color: string }> = {
  cruise:  { icon: Ship,     name: '크루즈',      color: 'blue' },
  car:     { icon: Car,      name: '차량',        color: 'cyan' },
  vehicle: { icon: Car,      name: '스하차량',    color: 'purple' },
  airport: { icon: Plane,    name: '공항',        color: 'green' },
  hotel:   { icon: Building, name: '호텔',        color: 'orange' },
  tour:    { icon: MapPin,   name: '투어',        color: 'red' },
  rentcar: { icon: Car,      name: '렌트카',      color: 'indigo' },
};

/* ── 메인 컴포넌트 ─────────────────────────────── */
export default function SchedulePage() {
  const router = useRouter();
  const [allData, setAllData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date());
  // 고정값: 일간, 전체 필터
  const viewMode = 'day' as ViewMode;
  const sourceFilter = 'all' as SourceFilter;
  const typeFilter = 'all';
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [selectedItem, setSelectedItem] = useState<any | null>(null);
  const [selectedItems, setSelectedItems] = useState<any[]>([]);
  const [modalOpen, setModalOpen] = useState(false);

  const openDetail = (item: any) => {
    let related: any[] = [item];

    if (item?.source === 'sh') {
      if (item?.orderId) {
        related = allData.filter(d => d?.source === 'sh' && d?.orderId === item.orderId);
      }
    } else {
      const groupKey = item?.quoteId || item?.re_quote_id || item?.reservationId;
      if (groupKey) {
        related = allData.filter(d => d?.source === 'new' && (d?.quoteId || d?.re_quote_id || d?.reservationId) === groupKey);
      }
    }

    setSelectedItem(item);
    setSelectedItems(related.length > 0 ? related : [item]);
    setModalOpen(true);
  };

  const moveToReservationEdit = (target: any) => {
    if (!target) return;
    const quoteId = target?.quoteId || target?.re_quote_id || target?.quote_id;
    const userId = target?.re_user_id || target?.userId || target?.user_id;

    if (quoteId) {
      router.push(`/reservation-edit?quote_id=${quoteId}`);
      return;
    }
    if (userId) {
      router.push(`/reservation-edit?user_id=${userId}`);
      return;
    }
    router.push('/reservation-edit');
  };

  /* ── 데이터 로드: sh_* + reservation_* 통합 로드 ─── */
  const loadData = async () => {
    setLoading(true);
    try {
      const [shR, shC, shCC, shP, shH, shT, shRC, shM, reservationsRaw] = await Promise.all([
        fetchAllRows('sh_r'),
        fetchAllRows('sh_c'),
        fetchAllRows('sh_cc'),
        fetchAllRows('sh_p'),
        fetchAllRows('sh_h'),
        fetchAllRows('sh_t'),
        fetchAllRows('sh_rc'),
        fetchAllRows('sh_m'),
        fetchAllRows('reservation'),
      ]);

      const userMap = new Map(shM.map((u: any) => [
        u.order_id,
        {
          korean_name: u.korean_name,
          english_name: u.english_name,
          email: u.email,
          phone: u.phone_number || u.phone || '',
          nickname: u.nickname || '',
          child_birth_dates: u.child_birth_dates || [],
        },
      ]));

      const oldMapped = [
        ...shR.map((r: any) => {
          const u = userMap.get(r.order_id);
          return {
            ...r,
            orderId: r.order_id,
            customerName: u?.korean_name || '',
            customerEnglishName: u?.english_name || '',
            cruise: r.cruise_name,
            cruiseName: r.cruise_name,
            category: r.division,
            roomType: r.room_type,
            roomCount: parseInt(r.room_count) || 0,
            checkin: r.checkin_date,
            adult: parseInt(r.adult) || 0,
            child: parseInt(r.child) || 0,
            toddler: parseInt(r.toddler) || 0,
            discount: r.room_discount,
            requestNote: r.connecting_room,
            email: u?.email || r.email,
          };
        }),
        ...shC.map((c: any) => {
          const u = userMap.get(c.order_id);
          return {
            ...c,
            orderId: c.order_id,
            customerName: u?.korean_name || '',
            customerEnglishName: u?.english_name || '',
            carType: c.vehicle_type,
            carCategory: c.division || c.category || '',
            route: [c.boarding_location, c.dropoff_location].filter(Boolean).join(' → '),
            carCount: parseInt(c.vehicle_count) || 0,
            passengerCount: parseInt(c.passenger_count) || 0,
            pickupDatetime: c.boarding_datetime,
            pickupLocation: c.boarding_location,
            dropoffLocation: c.dropoff_location,
            email: u?.email || c.email,
          };
        }),
        ...shCC.map((cc: any) => {
          const u = userMap.get(cc.order_id);
          return {
            ...cc,
            orderId: cc.order_id,
            customerName: u?.korean_name || '',
            customerEnglishName: u?.english_name || '',
            boardingDate: cc.boarding_date,
            usageDate: cc.boarding_date,
            serviceType: cc.division,
            category: cc.category,
            vehicleNumber: cc.vehicle_number,
            seatNumber: cc.seat_number,
            name: cc.name,
            email: u?.email || cc.email,
          };
        }),
        ...shP.map((p: any) => {
          const u = userMap.get(p.order_id);
          return {
            ...p,
            orderId: p.order_id,
            customerName: u?.korean_name || '',
            customerEnglishName: u?.english_name || '',
            tripType: p.division,
            category: p.category,
            route: p.route,
            carType: p.vehicle_type || '',
            date: p.date,
            time: p.time,
            airportName: p.airport_name,
            flightNumber: p.flight_number,
            passengerCount: parseInt(p.passenger_count) || 0,
            carCount: parseInt(p.vehicle_count) || 0,
            placeName: p.location_name,
            email: u?.email || p.email,
          };
        }),
        ...shH.map((h: any) => {
          const u = userMap.get(h.order_id);
          return {
            ...h,
            orderId: h.order_id,
            customerName: u?.korean_name || '',
            customerEnglishName: u?.english_name || '',
            hotelName: h.hotel_name,
            roomName: h.room_name,
            roomType: h.room_type,
            roomCount: parseInt(h.room_count) || 0,
            days: parseInt(h.schedule) || 0,
            nights: parseInt(h.schedule) || 0,
            checkinDate: h.checkin_date,
            guestCount: (parseInt(h.adult) || 0) + (parseInt(h.child) || 0) + (parseInt(h.toddler) || 0),
            adult: parseInt(h.adult) || 0,
            child: parseInt(h.child) || 0,
            toddler: parseInt(h.toddler) || 0,
            email: u?.email || h.email,
          };
        }),
        ...shT.map((t: any) => {
          const u = userMap.get(t.order_id);
          return {
            ...t,
            orderId: t.order_id,
            customerName: u?.korean_name || '',
            customerEnglishName: u?.english_name || '',
            tourName: t.tour_name,
            tourType: t.tour_type,
            startDate: t.start_date,
            tourDate: t.start_date,
            endDate: t.end_date,
            participants: parseInt(t.tour_count) || 0,
            tourCapacity: parseInt(t.tour_count) || 0,
            pickupLocation: t.pickup_location,
            dropoffLocation: t.dropoff_location || '',
            email: u?.email || t.email,
          };
        }),
        ...shRC.map((rc: any) => {
          const u = userMap.get(rc.order_id);
          return {
            ...rc,
            orderId: rc.order_id,
            customerName: u?.korean_name || '',
            customerEnglishName: u?.english_name || '',
            carType: rc.vehicle_type,
            route: [rc.boarding_location, rc.destination].filter(Boolean).join(' → '),
            carCount: parseInt(rc.vehicle_count) || 0,
            pickupDate: rc.boarding_date,
            pickupTime: rc.boarding_time,
            pickupLocation: rc.boarding_location,
            destination: rc.destination,
            dropoffLocation: rc.destination,
            usagePeriod: rc.usage_period,
            passengerCount: parseInt(rc.passenger_count) || 0,
            email: u?.email || rc.email,
          };
        }),
      ];

      const allowedTypes = ['cruise', 'car', 'airport', 'hotel', 'tour', 'rentcar', 'sht', 'car_sht'];
      const reservations = (reservationsRaw || []).filter((r: any) => allowedTypes.includes(r.re_type));
      const reservationIds = Array.from(new Set(reservations.map((r: any) => r.re_id).filter(Boolean)));
      const userIds = Array.from(new Set(reservations.map((r: any) => r.re_user_id).filter(Boolean)));

      const [usersData, cruiseData, carData, airportData, hotelData, tourData, rentcarData, shtData] = await Promise.all([
        fetchRowsByIds('users', 'id', userIds),
        fetchRowsByIds('reservation_cruise', 'reservation_id', reservationIds),
        fetchRowsByIds('reservation_cruise_car', 'reservation_id', reservationIds),
        fetchRowsByIds('reservation_airport', 'reservation_id', reservationIds),
        fetchRowsByIds('reservation_hotel', 'reservation_id', reservationIds),
        fetchRowsByIds('reservation_tour', 'reservation_id', reservationIds),
        fetchRowsByIds('reservation_rentcar', 'reservation_id', reservationIds),
        fetchRowsByIds('reservation_car_sht', 'reservation_id', reservationIds),
      ]);

      const airportCodes = Array.from(new Set((airportData || []).map((x: any) => x.airport_price_code).filter(Boolean)));
      const airportPriceData = airportCodes.length > 0
        ? await fetchRowsByIds('airport_price', 'airport_code', airportCodes)
        : [];
      const airportPriceMap = new Map((airportPriceData || []).map((x: any) => [`${x.airport_code}-${x.service_type || ''}`, x]));

      const usersById = new Map((usersData || []).map((u: any) => [u.id, u]));
      const cruiseByRid = new Map((cruiseData || []).map((x: any) => [x.reservation_id, x]));
      const carByRid = new Map((carData || []).map((x: any) => [x.reservation_id, x]));
      const airportByRid = new Map((airportData || []).map((x: any) => [x.reservation_id, x]));
      const hotelByRid = new Map((hotelData || []).map((x: any) => [x.reservation_id, x]));
      const tourByRid = new Map((tourData || []).map((x: any) => [x.reservation_id, x]));
      const rentcarByRid = new Map((rentcarData || []).map((x: any) => [x.reservation_id, x]));
      const shtByRid = new Map((shtData || []).map((x: any) => [x.reservation_id, x]));

      const newMapped = reservations.map((r: any) => {
        const user = usersById.get(r.re_user_id);
        const base = {
          ...r,
          source: 'new',
          reservationId: r.re_id,
          re_user_id: r.re_user_id,
          re_quote_id: r.re_quote_id,
          quoteId: r.re_quote_id,
          totalAmount: Number(r.total_amount || 0),
          customerName: user?.name || '',
          customerEnglishName: user?.english_name || '',
          email: user?.email || '',
          phone: user?.phone_number || '',
          nickname: user?.nickname || '',
          child_birth_dates: user?.child_birth_dates || [],
        };

        if (r.re_type === 'cruise') {
          const d = cruiseByRid.get(r.re_id) || {};
          return {
            ...base,
            ...d,
            cruise: '신규 크루즈',
            cruiseName: d.cruise_name || '신규 크루즈',
            roomType: d.room_price_code || '',
            roomCount: Number(d.room_count || 0),
            checkin: d.checkin || '',
            adult: Number(d.adult_count || 0),
            child: Number(d.child_count || 0),
            toddler: Number(d.infant_count || 0),
            totalPrice: Number(d.room_total_price || 0),
            requestNote: d.request_note || '',
          };
        }

        if (r.re_type === 'car') {
          const d = carByRid.get(r.re_id) || {};
          return {
            ...base,
            ...d,
            carType: d.car_price_code || '',
            carCategory: d.sht_category || d.category || '',
            route: [d.pickup_location, d.dropoff_location].filter(Boolean).join(' → '),
            carCount: Number(d.car_count || 0),
            passengerCount: Number(d.passenger_count || 0),
            pickupDatetime: d.pickup_datetime || '',
            pickupLocation: d.pickup_location || '',
            dropoffLocation: d.dropoff_location || '',
            unitPrice: Number(d.unit_price || 0),
            totalPrice: Number(d.car_total_price || 0),
            requestNote: d.request_note || '',
          };
        }

        if (r.re_type === 'airport') {
          const d = airportByRid.get(r.re_id) || {};
          const wayType = normalizeWayType(d.way_type || d.ra_way_type || d.service_type || '');
          const priceInfo = airportPriceMap.get(`${d.airport_price_code || ''}-${wayType}`)
            || (airportPriceData || []).find((p: any) => p.airport_code === d.airport_price_code)
            || {};
          const dtParts = getPlus8DateTimeParts(d.ra_datetime || '');
          const isSending = String(d.category || d.way_type || d.ra_way_type || '').toLowerCase().includes('sending') || String(d.category || d.way_type || d.ra_way_type || '').includes('샌딩');
          const accommodationInfo = d.accommodation_info || '';
          return {
            ...base,
            ...d,
            ...priceInfo,
            tripType: wayType,
            wayType,
            category: d.category || d.way_type || d.ra_way_type || '',
            route: [priceInfo.route, d.ra_airport_location, d.accommodation_info].filter(Boolean).join(' ↔ '),
            date: dtParts.date,
            time: dtParts.time,
            airportName: d.ra_airport_location || '',
            flightNumber: d.ra_flight_number || '',
            vehicleType: d.vehicle_type || priceInfo.vehicle_type || '',
            carType: d.vehicle_type || priceInfo.vehicle_type || '',
            passengerCount: Number(d.ra_passenger_count || 0),
            carCount: Number(d.ra_car_count || 0),
            unitPrice: Number(d.unit_price || 0),
            totalPrice: Number(d.total_price || 0),
            placeName: accommodationInfo,
            pickupLocation: isSending ? accommodationInfo : '',
            dropoffLocation: isSending ? '' : accommodationInfo,
            requestNote: d.request_note || '',
          };
        }

        if (r.re_type === 'hotel') {
          const d = hotelByRid.get(r.re_id) || {};
          return {
            ...base,
            ...d,
            hotelName: d.hotel_category || '신규 호텔',
            roomName: d.hotel_price_code || '',
            roomType: d.hotel_price_code || '',
            roomCount: Number(d.room_count || 0),
            days: Number(d.nights || 0),
            nights: Number(d.nights || 0),
            checkinDate: d.checkin_date || '',
            guestCount: Number(d.guest_count || 0),
            adult: Number(d.guest_count || 0),
            child: 0,
            toddler: 0,
            unitPrice: Number(d.unit_price || 0),
            totalPrice: Number(d.total_price || 0),
            requestNote: d.request_note || '',
          };
        }

        if (r.re_type === 'tour') {
          const d = tourByRid.get(r.re_id) || {};
          return {
            ...base,
            ...d,
            tourName: '신규 투어',
            tourType: d.tour_price_code || '',
            startDate: d.usage_date || '',
            tourDate: d.usage_date || '',
            endDate: '',
            participants: Number(d.tour_capacity || 0),
            tourCapacity: Number(d.tour_capacity || 0),
            pickupLocation: d.pickup_location || '',
            dropoffLocation: d.dropoff_location || '',
            unitPrice: Number(d.unit_price || 0),
            totalPrice: Number(d.total_price || 0),
            requestNote: d.request_note || '',
          };
        }

        if (r.re_type === 'rentcar') {
          const d = rentcarByRid.get(r.re_id) || {};
          const pickupParts = getPlus8DateTimeParts(d.pickup_datetime || '');
          return {
            ...base,
            ...d,
            carType: d.rentcar_price_code || '',
            route: [d.pickup_location, d.destination || d.dropoff_location].filter(Boolean).join(' → '),
            carCount: Number(d.car_count || 0),
            pickupDate: pickupParts.date,
            pickupTime: pickupParts.time,
            pickupDatetime: d.pickup_datetime || '',
            pickupLocation: d.pickup_location || '',
            destination: d.destination || '',
            dropoffLocation: d.destination || d.dropoff_location || '',
            usagePeriod: d.rental_days ? `${d.rental_days}일` : '',
            passengerCount: Number(d.passenger_count || d.driver_count || 0),
            luggageCount: Number(d.luggage_count || 0),
            dispatchCode: d.dispatch_code || '',
            returnDatetime: d.return_datetime || '',
            returnPickupLocation: d.return_pickup_location || '',
            returnDestination: d.return_destination || '',
            viaLocation: d.via_location || '',
            viaWaiting: d.via_waiting || '',
            returnViaLocation: d.return_via_location || '',
            returnViaWaiting: d.return_via_waiting || '',
            unitPrice: Number(d.unit_price || 0),
            totalPrice: Number(d.total_price || 0),
            requestNote: d.request_note || '',
          };
        }

        const d = shtByRid.get(r.re_id) || {};
        return {
          ...base,
          ...d,
          boardingDate: d.usage_date || '',
          usageDate: d.usage_date || d.pickup_datetime || '',
          serviceType: d.service_type || d.sht_category || '',
          category: d.sht_category || d.category || '',
          vehicleNumber: d.vehicle_number || '',
          seatNumber: d.seat_number || '',
          pickupLocation: d.pickup_location || '',
          dropoffLocation: d.dropoff_location || '',
          passengerCount: Number(d.passenger_count || 0),
          unitPrice: Number(d.unit_price || 0),
          totalPrice: Number(d.car_total_price || 0),
          name: d.name || user?.name || '',
          requestNote: d.request_note || '',
        };
      });

      setAllData([
        ...oldMapped.map(m => ({ ...m, source: 'sh' })),
        ...newMapped,
      ]);
    } catch (err) {
      console.error('데이터 로드 실패:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  /* ── 필터링 ── */
  let filtered = allData;

  if (sourceFilter === 'old') {
    filtered = filtered.filter(item => item.source === 'sh');
  } else if (sourceFilter === 'new') {
    filtered = filtered.filter(item => item.source === 'new');
  }

  // 검색어 필터
  if (activeSearch.trim()) {
    const q = activeSearch.toLowerCase();
    filtered = filtered.filter(item => {
      const fields = [
        item.reservationId,
        item.orderId, item.customerName, item.customerEnglishName,
        item.email, item.cruise, item.carType, item.vehicleNumber,
        item.airportName, item.flightNumber, item.hotelName,
        item.tourName, item.pickupLocation, item.dropoffLocation,
      ];
      return fields.some(f => f && String(f).toLowerCase().includes(q));
    });
  } else {
    // 날짜 필터
    filtered = filtered.filter(item => {
      const dateStr = getDateField(item);
      const d = parseDate(dateStr);
      if (!d) return false;
      if (viewMode === 'day') return isSameLocalDate(d, selectedDate);
      const { start, end } = getRange(selectedDate, viewMode);
      return isDateInRange(d, start, end);
    });
  }

  // 서비스 타입필터
  if (typeFilter !== 'all') {
    filtered = filtered.filter(item => getServiceType(item) === typeFilter);
  }

  // 서비스별 그룹화
  const grouped: Record<string, any[]> = {};
  filtered.forEach(item => {
    const type = getServiceType(item);
    (grouped[type] ||= []).push(item);
  });

  /* ── 날짜 이동 ─── */
  const navigateDate = (dir: 'prev' | 'next') => {
    const d = new Date(selectedDate);
    if (viewMode === 'day') d.setDate(d.getDate() + (dir === 'next' ? 1 : -1));
    else if (viewMode === 'week') d.setDate(d.getDate() + (dir === 'next' ? 7 : -7));
    else d.setMonth(d.getMonth() + (dir === 'next' ? 1 : -1));
    setSelectedDate(d);
  };

  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  const formatDate = (d: Date) => {
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const day = d.getDate();
    return `${y}. ${m}. ${day} (${weekdays[d.getDay()]})`;
  };

  /* ── 카드 렌더링 ─── */
  const renderCard = (item: any, idx: number) => {
    const type = getServiceType(item);
    const conf = serviceConfig[type] || { icon: Clock, name: type, color: 'gray' };
    const Icon = conf.icon;
    const dateStr = getDateField(item);
    const past = dateStr ? isPastDate(dateStr) : false;
    const dateObj = parseDate(dateStr);

    return (
      <div
        key={`${item.source}-${item.orderId || item.reservationId || idx}-${idx}`}
        onClick={() => openDetail(item)}
        className={`bg-white border rounded-xl shadow-sm p-3 space-y-2 ${past ? 'opacity-50' : ''} cursor-pointer`}
      >
        {/* 헤더 */}
        <div className="flex items-center gap-2 pb-2 border-b">
          <div className={`w-8 h-8 flex items-center justify-center rounded-lg bg-${conf.color}-100`}>
            <Icon className={`w-4 h-4 text-${conf.color}-600`} />
          </div>
          <span className="font-bold text-sm flex-1">{conf.name}</span>
          {item.source === 'sh' && (
            <button
              onClick={e => { e.stopPropagation(); openDetail(item); }}
              className="text-xs px-2 py-0.5 rounded-full bg-gray-200 text-gray-700 hover:bg-gray-300"
            >Old</button>
          )}
          {item.source === 'new' && (
            <button
              onClick={e => { e.stopPropagation(); openDetail(item); }}
              className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 hover:bg-blue-200"
            >New</button>
          )}
          <button
            onClick={e => { e.stopPropagation(); openDetail(item); }}
            className={`text-xs px-2 py-0.5 rounded-full font-medium bg-${conf.color}-500 text-white hover:bg-${conf.color}-600`}
          >상세</button>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${past ? 'bg-gray-200 text-gray-600' : `bg-${conf.color}-100 text-${conf.color}-700`}`}>
            {past ? '완료' : '예정'}
          </span>
        </div>

        {/* 고객명 */}
        {item.customerName && (
          <div className="flex items-center gap-2 pb-1 border-b">
            <span className={`font-bold text-base text-${conf.color}-700`}>{item.customerName}</span>
            {item.customerEnglishName && (
              <span className="text-xs text-gray-400">({item.customerEnglishName})</span>
            )}
          </div>
        )}

        {/* 서비스 상세 */}
        <div className="space-y-1 text-sm text-gray-600">
          {type === 'cruise' && (
            <>
              <Row label="크루즈" value={item.cruise} bold />
              <Row label="객실" value={`${item.roomType || ''} ${item.category ? `(${item.category})` : ''}`} />
              <DateRow date={dateObj} />
              <Row label="인원" value={formatGuests(item)} />
              <Row label="객실수" value={`${item.roomCount}개`} />
            </>
          )}
          {type === 'car' && (
            <>
              <Row label="차종" value={item.carType} bold />
              <DateRow date={dateObj} />
              <Row label="인원" value={`${item.passengerCount}명`} />
              {item.pickupLocation && <Row label="픽업" value={item.pickupLocation} />}
              {item.dropoffLocation && <Row label="드랍" value={item.dropoffLocation} />}
            </>
          )}
          {type === 'vehicle' && (
            <>
              <DateRow date={dateObj} />
              <Row label="차량" value={`${item.vehicleNumber} / 좌석: ${item.seatNumber}`} />
              {item.serviceType && <Row label="구분" value={item.serviceType} />}
              {item.category && <Row label="분류" value={item.category} />}
            </>
          )}
          {type === 'airport' && (
            <>
              <Row label="구분" value={`${item.tripType || '-'} - ${item.category || '-'}`} bold />
              <Row label="경로" value={item.route} />
              <DateRow date={dateObj} time={item.time} />
              <Row label="공항" value={`${item.airportName} / ${item.flightNumber}`} />
              <Row label="차종" value={item.vehicleType || item.carType} />
              <Row label="인원/차량" value={`👥 ${item.passengerCount}명 / 🚗 ${item.carCount}대`} />
            </>
          )}
          {type === 'hotel' && (
            <>
              <Row label="호텔" value={item.hotelName} bold />
              <Row label="객실" value={`${item.roomName || ''} (${item.roomType || ''})`} />
              <DateRow date={dateObj} />
              {item.days > 0 && <Row label="숙박" value={`${item.days}박`} />}
              <Row label="인원" value={formatGuests(item)} />
            </>
          )}
          {type === 'tour' && (
            <>
              <Row label="투어" value={item.tourName} bold />
              <DateRow date={dateObj} />
              <Row label="인원" value={`${item.participants}명`} />
              {item.pickupLocation && <Row label="픽업" value={item.pickupLocation} />}
            </>
          )}
          {type === 'rentcar' && (
            <>
              <Row label="차종" value={item.carType} bold />
              <DateRow date={dateObj} time={item.pickupTime} />
              {item.pickupLocation && <Row label="픽업" value={item.pickupLocation} />}
              {item.destination && <Row label="목적지" value={item.destination} />}
              <Row label="인원" value={`${item.passengerCount}명`} />
            </>
          )}
        </div>

        {/* 요청사항 */}
        {item.requestNote && (
          <div className="pt-2 border-t text-sm text-gray-700">
            <span className="text-orange-600 font-semibold text-xs">📝 </span>
            {item.requestNote}
          </div>
        )}
      </div>
    );
  };

  const formatGuests = (item: any) => {
    const parts = [];
    if (item.adult > 0) parts.push(`👨 ${item.adult}명`);
    if (item.child > 0) parts.push(`👶 ${item.child}명`);
    if (item.toddler > 0) parts.push(`🍼 ${item.toddler}명`);
    return parts.length > 0 ? parts.join(' ') : '-';
  };

  /* ── UI ──────────────────────────────────── */
  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* 헤더 */}
      <div className="bg-white border-b shadow-sm px-4 py-3">
        <div className="flex items-center gap-3 mb-3">
          <Link href="/" className="p-1.5 rounded-lg hover:bg-gray-100">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </Link>
          <h1 className="text-lg font-bold text-gray-800 flex-1">🆕 신/구 구분</h1>
          <button onClick={loadData} className="p-2 rounded-lg bg-blue-500 text-white hover:bg-blue-600">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* 날짜 네비게이션 */}
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => navigateDate('prev')} className="p-2 rounded-lg hover:bg-gray-100">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="text-center flex-1">
            <input
              type="date"
              value={selectedDate.toISOString().split('T')[0]}
              onChange={(e) => {
                const [year, month, day] = e.target.value.split('-').map(Number);
                setSelectedDate(new Date(year, month - 1, day));
              }}
              className="w-32 px-2 py-1.5 text-sm border border-blue-300 rounded-lg bg-white text-center font-semibold"
            />
            <button
              onClick={() => setSelectedDate(new Date())}
              className="text-xs text-blue-500 hover:underline mt-0.5 block w-full"
            >
              오늘
            </button>
          </div>
          <button onClick={() => navigateDate('next')} className="p-2 rounded-lg hover:bg-gray-100">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* 검색 */}
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && setActiveSearch(searchQuery)}
            placeholder="이름, 주문번호, 예약ID 검색..."
            className="flex-1 px-3 py-2 text-sm border rounded-lg bg-gray-50"
          />
          <button
            onClick={() => setActiveSearch(searchQuery)}
            className="px-3 py-2 bg-blue-500 text-white rounded-lg"
          >
            <Search className="w-4 h-4" />
          </button>
          {activeSearch && (
            <button
              onClick={() => { setSearchQuery(''); setActiveSearch(''); }}
              className="px-3 py-2 bg-gray-200 text-gray-700 rounded-lg text-xs"
            >
              초기화
            </button>
          )}
        </div>
      </div>

      {/* 콘텐츠 */}
      <div className="px-4 py-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
            <p className="mt-4 text-sm text-gray-500">데이터를 불러오는 중...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <Calendar className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="text-sm">해당 조건에 맞는 데이터가 없습니다.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* 카운트 표시 */}
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">총 {filtered.length}건</p>
              <div className="flex gap-1 flex-wrap justify-end">
                {Object.entries(grouped).map(([type, items]) => {
                  const conf = serviceConfig[type];
                  if (!conf) return null;
                  return (
                    <span key={type} className={`text-xs px-2 py-0.5 rounded-full bg-${conf.color}-100 text-${conf.color}-700`}>
                      {conf.name} {items.length}
                    </span>
                  );
                })}
              </div>
            </div>

            {/* 서비스별 그룹 렌더링 */}
            {Object.entries(grouped).map(([type, items]) => {
              const conf = serviceConfig[type] || { icon: Clock, name: type, color: 'gray' };
              const Icon = conf.icon;
              return (
                <div key={type}>
                  <div className="flex items-center gap-2 mb-3">
                    <Icon className={`w-5 h-5 text-${conf.color}-600`} />
                    <h2 className="font-bold text-gray-800">{conf.name}</h2>
                    <span className="text-xs text-gray-400">{items.length}건</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {items.map((item, idx) => renderCard(item, idx))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <ReservationDetailModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onEdit={selectedItem ? moveToReservationEdit : undefined}
        item={selectedItem}
        items={selectedItems}
      />
    </div>
  );
}

/* ── 서브 컴포넌트 ──────────────────────────── */
function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  if (!value || !value.trim()) return null;
  return (
    <div className="flex items-start gap-2">
      <span className="text-xs text-gray-500 font-semibold whitespace-nowrap mt-0.5">{label}</span>
      <span className={`text-sm break-words ${bold ? 'font-bold text-gray-800' : ''}`}>{value}</span>
    </div>
  );
}

function DateRow({ date, time }: { date: Date | null; time?: string }) {
  return (
    <div className="flex items-center gap-2">
      <Calendar className="w-3.5 h-3.5 text-gray-400" />
      <span className="text-sm font-medium">
        {date ? date.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' }) : '-'}
        {time && <span className="text-gray-500 ml-1">{time}</span>}
      </span>
    </div>
  );
}

function FilterBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`whitespace-nowrap px-3 py-1.5 text-xs rounded-full font-medium transition-colors ${
        active ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      }`}
    >
      {label}
    </button>
  );
}
