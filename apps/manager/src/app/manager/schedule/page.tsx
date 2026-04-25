// @ts-nocheck
'use client';

import React, { useState, useEffect } from 'react';
import ManagerLayout from '@/components/ManagerLayout';
import supabase from '@/lib/supabase';
import UserReservationDetailModal from '@/components/UserReservationDetailModal';
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
  ChevronRight
} from 'lucide-react';

export default function ManagerSchedulePage() {
  const [schedules, setSchedules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // 오늘 날짜로 초기화: 로컬 자정으로 정규화 (UTC 오프셋 오류 방지)
  const toLocalMidnight = (d: Date = new Date()) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  const [selectedDate, setSelectedDate] = useState(() => toLocalMidnight());
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('day');
  // 주/월간 보기에서 일별 그룹화 추가 (기본: 일별)
  const [groupMode, setGroupMode] = useState<'type' | 'day'>('day');
  const [typeFilter, setTypeFilter] = useState('all');
  // DB 예약 상세 모달 상태
  const [isDBModalOpen, setIsDBModalOpen] = useState(false);
  const [dbUserInfo, setDbUserInfo] = useState<any>(null);
  const [dbUserServices, setDbUserServices] = useState<any[]>([]);
  const [dbModalLoading, setDbModalLoading] = useState(false);

  useEffect(() => {
    loadSchedules();
  }, [selectedDate, viewMode, typeFilter]);

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

  const loadSchedules = async () => {
    try {
      setLoading(true);
      const { start, end } = getRange(selectedDate, viewMode);

      console.log('Fetching schedules for range:', start.toISOString(), end.toISOString());

      // 서비스별 날짜 컬럼 기준으로 기간 내 데이터 조회 (배치)
      const [cruiseRes, airportRes, hotelRes, rentcarRes, tourRes, cruiseCarRes, carShtRes] = await Promise.all([
        // cruise: checkin (date)
        supabase
          .from('reservation_cruise')
          .select('*, reservation_id')
          .gte('checkin', start.toISOString().slice(0, 10))
          .lte('checkin', end.toISOString().slice(0, 10)),
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
          .gte('checkin_date', start.toISOString().slice(0, 10))
          .lte('checkin_date', end.toISOString().slice(0, 10)),
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
          .gte('usage_date', start.toISOString().slice(0, 10))
          .lte('usage_date', end.toISOString().slice(0, 10)),
        // cruise car: pickup_datetime (date)
        supabase
          .from('reservation_cruise_car')
          .select('*, reservation_id')
          .gte('pickup_datetime', start.toISOString().slice(0, 10))
          .lte('pickup_datetime', end.toISOString().slice(0, 10)),
        // car_sht: pickup_datetime (timestamptz)
        supabase
          .from('reservation_car_sht')
          .select('*, reservation_id')
          .gte('pickup_datetime', start.toISOString())
          .lte('pickup_datetime', end.toISOString())
      ]);

      const serviceRows: Array<{ table: string; rows: any[] }> = [
        { table: 'reservation_cruise', rows: cruiseRes.data || [] },
        { table: 'reservation_airport', rows: airportRes.data || [] },
        { table: 'reservation_hotel', rows: hotelRes.data || [] },
        { table: 'reservation_rentcar', rows: rentcarRes.data || [] },
        { table: 'reservation_tour', rows: tourRes.data || [] },
        { table: 'reservation_cruise_car', rows: cruiseCarRes.data || [] },
        { table: 'reservation_car_sht', rows: carShtRes.data || [] }
      ];

      console.log('Fetched service rows:', serviceRows.map(s => `${s.table}: ${s.rows.length}`));

      // 크루즈 room_price_code → cruise_rate_card(cruise_name, room_type) 매핑 조회
      const cruiseCodes = Array.from(
        new Set((cruiseRes.data || []).map((r: any) => r.room_price_code).filter(Boolean))
      );
      let cruiseInfoByCode = new Map<string, { cruise?: string; room_type?: string; room_category?: string }>();
      if (cruiseCodes.length > 0) {
        const { data: rpData } = await supabase
          .from('cruise_rate_card')
          .select('id, cruise_name, room_type')
          .in('id', cruiseCodes);
        for (const rp of rpData || []) {
          cruiseInfoByCode.set(rp.id, {
            cruise: rp.cruise_name || undefined,
            room_type: rp.room_type || undefined,
            room_category: undefined
          });
        }
      }

      // 해당되는 예약 ID들 조회
      const reservationIds = Array.from(
        new Set(
          serviceRows.flatMap(s => (s.rows || []).map((r: any) => r.reservation_id)).filter(Boolean)
        )
      );

      // 예약 기본 정보와 사용자 정보 일괄 조회
      let reservationById = new Map();
      if (reservationIds.length > 0) {
        const { data: reservationsData, error: resErr } = await supabase
          .from('reservation')
          .select('re_id, re_type, re_status, re_user_id')
          .in('re_id', reservationIds)
          .neq('re_status', 'completed');

        if (resErr) {
          console.error('예약 정보 조회 실패:', resErr);
        } else {
          reservationById = new Map(reservationsData!.map(r => [r.re_id, r]));
        }
      }

      const userIds = Array.from(new Set(Array.from(reservationById.values()).map((r: any) => r.re_user_id).filter(Boolean)));
      let usersById = new Map<string, any>();
      if (userIds.length > 0) {
        const { data: usersData } = await supabase
          .from('users')
          .select('id, name, email')
          .in('id', userIds);
        usersById = new Map((usersData || []).map(u => [u.id, u]));
      }

      // 스케줄 객체로 변환
      const result: any[] = [];
      const toTimeStr = (d: Date) => d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });

      for (const { table, rows } of serviceRows) {
        for (const row of rows) {
          // 예약 정보가 없어도 서비스 로우가 있으면 표시 (고아 데이터 처리)
          const reservation = reservationById.get(row.reservation_id) || {
            re_id: row.reservation_id,
            re_type: 'unknown',
            re_status: 'unknown',
            re_user_id: null
          };

          let scheduleDate: Date | null = null;
          let scheduleTime = '';
          let location: string | null = null;
          let duration: string | null = null;
          const reservationAny = reservation as any;
          let type = reservationAny.re_type === 'unknown' ? table.replace('reservation_', '') : reservationAny.re_type;

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
              const info = cruiseInfoByCode.get(row.room_price_code);
              if (info) {
                (row as any)._cruise_info = { ...info, room_code: row.room_price_code };
              }
            }
          } else if (table === 'reservation_airport') {
            if (row.ra_datetime) {
              // UTC → 현지 시간 보정
              const d = new Date(row.ra_datetime);
              if (!isNaN(d.getTime())) {
                // 현지 시간대(베트남/한국)로 변환
                const localDate = new Date(d.getTime() + (9 * 60 * 60 * 1000)); // UTC+9 (한국 기준)
                scheduleDate = localDate;
                scheduleTime = toTimeStr(localDate);
              }
            }
            location = row.ra_airport_location || null;
          } else if (table === 'reservation_hotel') {
            if (row.checkin_date) {
              scheduleDate = new Date(row.checkin_date + 'T15:00:00');
              scheduleTime = '15:00';
            }
            // 예약 시 hotel_category에 호텔명 저장하는 패턴
            location = row.hotel_category || null;
            if (row.nights) duration = `${row.nights}박`;
          } else if (table === 'reservation_rentcar') {
            if (row.pickup_datetime) {
              // UTC → 현지 시간 보정
              const d = new Date(row.pickup_datetime);
              if (!isNaN(d.getTime())) {
                const localDate = new Date(d.getTime() + (9 * 60 * 60 * 1000)); // UTC+9 (한국 기준)
                scheduleDate = localDate;
                scheduleTime = toTimeStr(localDate);
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
              service_table: table,
              service_row: row,
              cruise_info: (row as any)._cruise_info || null
            });

            if (row.return_datetime) {
              const rd = new Date(row.return_datetime);
              if (!isNaN(rd.getTime())) {
                const returnDate = new Date(rd.getTime() + (9 * 60 * 60 * 1000));
                const isSameDay =
                  returnDate.getFullYear() === scheduleDate.getFullYear() &&
                  returnDate.getMonth() === scheduleDate.getMonth() &&
                  returnDate.getDate() === scheduleDate.getDate();

                if (!isSameDay) {
                  const returnLocation = (row.return_pickup_location && row.return_destination)
                    ? `${row.return_pickup_location} → ${row.return_destination}`
                    : row.return_pickup_location || row.return_destination || row.dropoff_location || location;

                  result.push({
                    re_id: reservationAny.re_id,
                    re_type: type,
                    re_status: reservationAny.re_status,
                    users: usersById.get(reservationAny.re_user_id) || null,
                    schedule_date: returnDate,
                    schedule_time: toTimeStr(returnDate),
                    location: returnLocation,
                    duration,
                    rentcar_phase: 'return',
                    service_table: table,
                    service_row: row,
                    cruise_info: (row as any)._cruise_info || null
                  });
                }
              }
            }

            continue;
          } else if (table === 'reservation_tour') {
            if (row.usage_date) {
              scheduleDate = new Date(row.usage_date + 'T09:00:00');
              scheduleTime = '09:00';
            }
            location = row.pickup_location || row.dropoff_location || null;
            if (row.tour_duration) duration = row.tour_duration;
          } else if (table === 'reservation_cruise_car') {
            // pickup_datetime is date, default to 09:00
            if (row.pickup_datetime) {
              scheduleDate = new Date(row.pickup_datetime + 'T09:00:00');
              scheduleTime = '09:00';
            }
            if (row.pickup_location && row.dropoff_location) {
              location = `${row.pickup_location} → ${row.dropoff_location}`;
            } else {
              location = row.pickup_location || row.dropoff_location || null;
            }
          } else if (table === 'reservation_car_sht') {
            // pickup_datetime is timestamptz
            if (row.pickup_datetime) {
              const d = new Date(row.pickup_datetime);
              if (!isNaN(d.getTime())) {
                const localDate = new Date(d.getTime() + (9 * 60 * 60 * 1000)); // UTC+9
                scheduleDate = localDate;
                scheduleTime = toTimeStr(localDate);
              }
            }
            // No location fields; show category or vehicle info in location slot
            location = row.sht_category || row.vehicle_number || row.dispatch_code || null;
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
      console.error('일정 데이터 로딩 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAllUserReservations = async (userId: string) => {
    if (!userId) return;

    try {
      setDbModalLoading(true);
      setIsDBModalOpen(true);

      // 1. 사용자 정보 조회
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (userError) throw userError;
      setDbUserInfo(userData);

      // 2. 사용자의 모든 예약 ID 조회
      const { data: reservations, error: resError } = await supabase
        .from('reservation')
        .select('re_id, re_type, re_status, re_created_at')
        .eq('re_user_id', userId)
        .neq('re_status', 'completed')
        .order('re_created_at', { ascending: false });

      if (resError) throw resError;

      const reservationIds = reservations.map(r => r.re_id);

      if (reservationIds.length === 0) {
        setDbUserServices([]);
        return;
      }

      // 3. 각 서비스 테이블에서 상세 정보 조회
      const [cruiseRes, airportRes, hotelRes, rentcarRes, tourRes, cruiseCarRes, carShtRes] = await Promise.all([
        supabase.from('reservation_cruise').select('*').in('reservation_id', reservationIds),
        supabase.from('reservation_airport').select('*').in('reservation_id', reservationIds),
        supabase.from('reservation_hotel').select('*').in('reservation_id', reservationIds),
        supabase.from('reservation_rentcar').select('*').in('reservation_id', reservationIds),
        supabase.from('reservation_tour').select('*').in('reservation_id', reservationIds),
        supabase.from('reservation_cruise_car').select('*').in('reservation_id', reservationIds),
        supabase.from('reservation_car_sht').select('*').in('reservation_id', reservationIds)
      ]);

      // 4. 추가 정보 조회 (가격/상품명 등)
      const cruiseCodes = (cruiseRes.data || []).map(r => r.room_price_code).filter(Boolean);
      const tourCodes = (tourRes.data || []).map(r => r.tour_price_code).filter(Boolean);
      const hotelCodes = (hotelRes.data || []).map(r => r.hotel_price_code).filter(Boolean);
      const rentCodes = (rentcarRes.data || []).map(r => r.rentcar_price_code).filter(Boolean);

      const [roomPrices, tourPrices, hotelPrices, rentPrices] = await Promise.all([
        cruiseCodes.length > 0 ? supabase.from('cruise_rate_card').select('id, cruise_name, room_type').in('id', cruiseCodes) : Promise.resolve({ data: [] }),
        tourCodes.length > 0 ? supabase.from('tour_pricing').select('pricing_id, price_per_person, tour:tour_id(tour_name, tour_code)').in('pricing_id', tourCodes) : Promise.resolve({ data: [] }),
        hotelCodes.length > 0 ? supabase.from('hotel_price').select('hotel_price_code, base_price, hotel_name, room_name').in('hotel_price_code', hotelCodes) : Promise.resolve({ data: [] }),
        rentCodes.length > 0 ? supabase.from('rentcar_price').select('rent_code, vehicle_type, price').in('rent_code', rentCodes) : Promise.resolve({ data: [] })
      ]);

      const roomPriceMap = new Map((roomPrices.data || []).map((r: any) => [r.id, r]));
      const tourPriceMap = new Map((tourPrices.data || []).map((r: any) => [r.pricing_id, r]));
      const hotelPriceMap = new Map((hotelPrices.data || []).map((r: any) => [r.hotel_price_code, r]));
      const rentPriceMap = new Map((rentPrices.data || []).map((r: any) => [r.rent_code, r]));

      // 5. 데이터 매핑
      const reservationMap = new Map(reservations.map(r => [r.re_id, r]));

      const allServices = [
        ...(cruiseRes.data || []).map(r => {
          const info = roomPriceMap.get(r.room_price_code);
          return {
            ...r,
            serviceType: 'cruise',
            status: reservationMap.get(r.reservation_id)?.re_status,
            cruise: info?.cruise_name || '크루즈',
            roomType: info?.room_type || r.room_price_code,
            checkin: r.checkin,
            adult: r.guest_count,
            child: r.child_count || 0,
            note: r.request_note,
            unitPrice: r.unit_price,
            totalPrice: r.room_total_price,
            paymentMethod: '정보 없음'
          };
        }),
        ...(cruiseCarRes.data || []).map(r => ({
          ...r,
          serviceType: 'vehicle',
          status: reservationMap.get(r.reservation_id)?.re_status,
          pickupDatetime: r.pickup_datetime,
          pickupLocation: r.pickup_location,
          dropoffLocation: r.dropoff_location,
          passengerCount: r.passenger_count,
          note: r.request_note,
          unitPrice: r.unit_price,
          totalPrice: r.car_total_price
        })),
        ...(airportRes.data || []).map(r => ({
          ...r,
          serviceType: 'airport',
          status: reservationMap.get(r.reservation_id)?.re_status,
          date: r.ra_datetime ? new Date(r.ra_datetime).toLocaleDateString() : '',
          time: r.ra_datetime ? new Date(r.ra_datetime).toLocaleTimeString() : '',
          airportName: r.ra_airport_location,
          destination: r.ra_stopover_location,
          flightNumber: r.ra_flight_number,
          passengerCount: r.ra_passenger_count,
          carCount: r.ra_car_count,
          note: r.request_note,
          unitPrice: r.unit_price,
          totalPrice: r.total_price
        })),
        ...(hotelRes.data || []).map(r => {
          const info = hotelPriceMap.get(r.hotel_price_code);
          return {
            ...r,
            serviceType: 'hotel',
            status: reservationMap.get(r.reservation_id)?.re_status,
            hotelName: info?.hotel_info?.hotel_name || r.hotel_category,
            roomType: info?.room_type?.room_name || r.hotel_price_code,
            checkinDate: r.checkin_date,
            nights: r.room_count,
            guestCount: r.guest_count,
            note: r.request_note,
            unitPrice: info?.base_price || r.unit_price,
            totalPrice: r.total_price
          };
        }),
        ...(tourRes.data || []).map(r => {
          const info = tourPriceMap.get(r.tour_price_code);
          return {
            ...r,
            serviceType: 'tour',
            status: reservationMap.get(r.reservation_id)?.re_status,
            tourName: info?.tour?.tour_name || r.tour_price_code,
            tourDate: r.usage_date,
            tourCapacity: r.tour_capacity,
            pickupLocation: r.pickup_location,
            dropoffLocation: r.dropoff_location,
            carCount: r.car_count,
            passengerCount: r.passenger_count,
            note: r.request_note,
            unitPrice: info?.price || r.unit_price,
            totalPrice: r.total_price
          };
        }),
        ...(rentcarRes.data || []).map(r => {
          const info = rentPriceMap.get(r.rentcar_price_code);
          return {
            ...r,
            serviceType: 'rentcar',
            status: reservationMap.get(r.reservation_id)?.re_status,
            carType: info?.vehicle_type || r.rentcar_price_code,
            pickupDatetime: r.pickup_datetime,
            pickupLocation: r.pickup_location,
            destination: r.destination,
            return_datetime: r.return_datetime,
            return_pickup_location: r.return_pickup_location,
            return_destination: r.return_destination,
            requestNote: r.request_note,
            note: r.request_note,
            unitPrice: info?.price || r.unit_price,
            totalPrice: r.total_price
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
          totalPrice: r.car_total_price
        }))
      ];

      setDbUserServices(allServices);

    } catch (error) {
      console.error('사용자 예약 정보 조회 실패:', error);
      setDbUserServices([]);
    } finally {
      setDbModalLoading(false);
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
      case 'cruise': return '크루즈';
      case 'airport': return '공항';
      case 'hotel': return '호텔';
      case 'tour': return '투어';
      case 'rentcar': return '렌트카';
      case 'car': return '크루즈 차량';
      case 'vehicle': return '크루즈 차량';
      case 'sht': return '스하차량';
      default: return type;
    }
  };

  // 표시용 타입명/아이콘 (service_table을 반영)
  const getDisplayTypeName = (schedule: any) => {
    if (schedule?.service_table === 'reservation_car_sht') return getTypeName('sht');
    if (schedule?.service_table === 'reservation_cruise_car') return getTypeName('vehicle');
    return getTypeName(schedule?.re_type);
  };

  const renderScheduleCardBody = (schedule: any) => {
    const serviceType = schedule?.service_table || schedule?.re_type || '';
    const row = schedule?.service_row || {};
    const cardData =
      (serviceType === 'reservation_rentcar' || serviceType === 'rentcar')
        ? { ...row, _rentcar_phase: schedule?.rentcar_phase || '' }
        : row;

    return (
      <ServiceCardBody
        serviceType={serviceType}
        data={cardData}
        customerName={schedule.users?.name}
        showCustomer={true}
        dateText={schedule?.schedule_date ? schedule.schedule_date.toLocaleDateString('ko-KR') : undefined}
        timeText={schedule?.schedule_time || undefined}
      />
    );
  };

  const getDisplayTypeIcon = (schedule: any) => {
    if (schedule?.service_table === 'reservation_car_sht') return getTypeIcon('vehicle');
    if (schedule?.service_table === 'reservation_cruise_car') return getTypeIcon('vehicle');
    return getTypeIcon(schedule?.re_type);
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

  const filteredSchedules = schedules.filter(schedule => {
    if (typeFilter !== 'all') {
      if (typeFilter === 'sht') {
        if (schedule.service_table !== 'reservation_car_sht') return false;
      } else if (typeFilter === 'vehicle') {
        if (schedule.service_table !== 'reservation_cruise_car') return false;
      } else if (schedule.re_type !== typeFilter) {
        return false;
      }
    }
    if (!schedule.schedule_date) return false;
    if (viewMode === 'day') return isSameLocalDate(schedule.schedule_date, selectedDate);
    const { start, end } = getRange(selectedDate, viewMode);
    return isDateInRange(schedule.schedule_date, start, end);
  });

  // 서비스 타입별 그룹
  const groupedByType: Record<string, any[]> = filteredSchedules.reduce(
    (acc: Record<string, any[]>, cur) => {
      const k = cur.re_type || 'other';
      (acc[k] ||= []).push(cur);
      return acc;
    },
    {}
  );

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
  const groupedByDate: Record<string, any[]> = filteredSchedules.reduce(
    (acc: Record<string, any[]>, cur) => {
      const k = toKey(cur.schedule_date);
      (acc[k] ||= []).push(cur);
      return acc;
    },
    {}
  );

  const navigateDate = (direction: 'prev' | 'next') => {
    const newDate = new Date(selectedDate);
    if (viewMode === 'day') {
      newDate.setDate(newDate.getDate() + (direction === 'next' ? 1 : -1));
    } else if (viewMode === 'week') {
      newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7));
    } else {
      newDate.setMonth(newDate.getMonth() + (direction === 'next' ? 1 : -1));
    }
    setSelectedDate(toLocalMidnight(newDate));
  };

  if (loading) {
    return (
      <ManagerLayout title="예약 일정" activeTab="schedule">
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
    <ManagerLayout title="예약 일정" activeTab="schedule">
      <div className="space-y-6">

        {/* 일정 컨트롤 */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigateDate('prev')}
                className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>

              <h2 className="text-xl font-semibold">
                {viewMode === 'day'
                  ? selectedDate.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
                  : viewMode === 'week'
                    ? (() => {
                      const { start, end } = getRange(selectedDate, 'week');
                      return `${start.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })} - ${end.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })}`;
                    })()
                    : selectedDate.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' })}
              </h2>

              {/* 오늘 버튼 추가 */}
              {viewMode === 'day' && (
                <button
                  onClick={() => setSelectedDate(toLocalMidnight())}
                  className="px-3 py-1 bg-blue-50 text-blue-600 rounded-lg border border-blue-200 text-sm font-medium hover:bg-blue-100"
                >오늘</button>
              )}

              <button
                onClick={() => navigateDate('next')}
                className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setViewMode('day')}
                className={`px-4 py-2 rounded-lg transition-colors ${viewMode === 'day' ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-700'
                  }`}
              >
                일간
              </button>
              <button
                onClick={() => setViewMode('week')}
                className={`px-4 py-2 rounded-lg transition-colors ${viewMode === 'week' ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-700'
                  }`}
              >
                주간
              </button>
              <button
                onClick={() => setViewMode('month')}
                className={`px-4 py-2 rounded-lg transition-colors ${viewMode === 'month' ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-700'
                  }`}
              >
                월간
              </button>
              {(viewMode === 'week' || viewMode === 'month') && (
                <div className="ml-4 flex items-center gap-2">
                  <span className="text-sm text-gray-600">그룹화:</span>
                  <div className="inline-flex rounded-lg overflow-hidden border border-gray-200">
                    <button
                      onClick={() => setGroupMode('day')}
                      className={`px-3 py-1 text-sm ${groupMode === 'day' ? 'bg-green-500 text-white' : 'bg-gray-50 text-gray-700'}`}
                    >
                      일별
                    </button>
                    <button
                      onClick={() => setGroupMode('type')}
                      className={`px-3 py-1 text-sm ${groupMode === 'type' ? 'bg-green-500 text-white' : 'bg-gray-50 text-gray-700'}`}
                    >
                      타입별
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 타입 필터 */}

          <div className="flex gap-2">
            <Filter className="w-5 h-5 text-gray-600 mt-2" />
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setTypeFilter('all')}
                className={`px-3 py-1 rounded-full text-sm transition-colors ${typeFilter === 'all' ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-700'}`}
              >
                전체
              </button>
              {['cruise', 'vehicle', 'sht', 'airport', 'hotel', 'tour', 'rentcar'].map(type => (
                <button
                  key={type}
                  onClick={() => setTypeFilter(type)}
                  className={`px-3 py-1 rounded-full text-sm transition-colors ${typeFilter === type ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-700'}`}
                >
                  {getTypeName(type)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 일정 목록 */}
        <div className="bg-white rounded-lg shadow-md">
          <div className="p-6 border-b">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Calendar className="w-6 h-6 text-green-600" />
              예약 일정 ({filteredSchedules.length}건)
            </h3>
          </div>

          {filteredSchedules.length === 0 ? (
            <div className="p-8 text-center">
              <Calendar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-600 mb-2">
                {typeFilter === 'all' ? '예약된 일정이 없습니다' : `${getTypeName(typeFilter)} 일정이 없습니다`}
              </h3>
              <div className="mt-4 text-xs text-gray-400 bg-gray-50 p-2 rounded inline-block">
                <p>Debug Info:</p>
                <p>Date: {selectedDate.toLocaleDateString()}</p>
                <p>View: {viewMode}</p>
                <p>Fetched: {schedules.length}</p>
              </div>
            </div>
          ) : (
            <div className="p-6 space-y-10">
              {/* 일간 보기: 주간과 동일한 UI (날짜 헤더 + 고객 정보 포함) */}
              {viewMode === 'day' && (
                <div className="space-y-8">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-md font-semibold flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-green-600" />
                        {selectedDate.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })}
                        <span className="text-gray-500">({filteredSchedules.length}건)</span>
                      </h4>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                      {filteredSchedules.map((schedule: any) => (
                        <div key={`${schedule.re_id}-${schedule.service_table}-${schedule.service_row?.id || Math.random()}`} className="bg-gray-50 border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-all p-3 flex flex-col h-full">
                          <div className="flex items-center gap-2 mb-2 pb-1 border-b border-gray-100">
                            <div className="flex items-center justify-center w-9 h-9 rounded-full bg-gray-50 border border-gray-200">
                              {getDisplayTypeIcon(schedule)}
                            </div>
                            <h5 className="font-bold text-sm flex-1 truncate text-gray-800">{getDisplayTypeName(schedule)}</h5>
                            {schedule.re_type === 'package' && (
                              <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-700 text-xs rounded font-medium">📦</span>
                            )}
                            <div className="flex items-center gap-2">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${schedule.re_status === 'confirmed' ? 'bg-green-100 text-green-800' : schedule.re_status === 'approved' ? 'bg-blue-100 text-blue-800' : schedule.re_status === 'pending' ? 'bg-yellow-100 text-yellow-800' : schedule.re_status === 'completed' ? 'bg-gray-100 text-gray-800' : 'bg-red-100 text-red-800'}`}>
                                {schedule.re_status === 'confirmed' ? '확정' : schedule.re_status === 'approved' ? '승인' : schedule.re_status === 'pending' ? '대기' : schedule.re_status === 'completed' ? '완료' : '취소'}
                              </span>
                              <button onClick={() => {
                                if (schedule.users?.id) {
                                  loadAllUserReservations(schedule.users.id);
                                }
                              }} className="bg-blue-500 text-white py-0.5 px-2 rounded text-xs hover:bg-blue-600 transition-colors">상세</button>
                            </div>
                          </div>
                          {renderScheduleCardBody(schedule)}
                        </div>
                      ))}
                    </div>
                  </div>
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
                          return (
                            <div key={key}>
                              <div className="flex items-center justify-between mb-3">
                                <h4 className="text-md font-semibold flex items-center gap-2">
                                  <Calendar className="w-5 h-5 text-green-600" /> {formatDateLabel(d)} <span className="text-gray-500">({list.length}건)</span>
                                </h4>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                                {list.map((schedule: any) => (
                                  <div key={`${schedule.re_id}-${schedule.service_table}-${schedule.service_row?.id || Math.random()}`} className="bg-gray-50 border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-all p-3 flex flex-col h-full">
                                    <div className="flex items-center gap-2 mb-2 pb-1 border-b border-gray-100">
                                      <div className="flex items-center justify-center w-9 h-9 rounded-full bg-gray-50 border border-gray-200">
                                        {getDisplayTypeIcon(schedule)}
                                      </div>
                                      <h5 className="font-bold text-sm flex-1 truncate text-gray-800">{getDisplayTypeName(schedule)}</h5>
                                      {schedule.re_type === 'package' && (
                                        <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-700 text-xs rounded font-medium">📦</span>
                                      )}
                                      <div className="flex items-center gap-2">
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${schedule.re_status === 'confirmed' ? 'bg-green-100 text-green-800' : schedule.re_status === 'pending' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>
                                          {schedule.re_status === 'confirmed' ? '확정' : schedule.re_status === 'pending' ? '대기' : '취소'}
                                        </span>
                                        <button onClick={() => {
                                          if (schedule.users?.id) {
                                            loadAllUserReservations(schedule.users.id);
                                          }
                                        }} className="bg-blue-500 text-white py-0.5 px-2 rounded text-xs hover:bg-blue-600 transition-colors">상세</button>
                                      </div>
                                    </div>
                                    {renderScheduleCardBody(schedule)}
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
                              {getTypeIcon(typeFilter === 'sht' || typeFilter === 'vehicle' ? 'vehicle' : type)} {typeFilter === 'sht' ? getTypeName('sht') : typeFilter === 'vehicle' ? getTypeName('vehicle') : getTypeName(type)} <span className="text-gray-500">({list.length}건)</span>
                            </h4>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                            {list.map((schedule: any) => (
                              <div key={`${schedule.re_id}-${schedule.service_table}-${schedule.service_row?.id || Math.random()}`} className="bg-gray-50 border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-all p-3 flex flex-col h-full">
                                <div className="flex items-center gap-2 mb-2 pb-1 border-b border-gray-100">
                                  <div className="flex items-center justify-center w-9 h-9 rounded-full bg-gray-50 border border-gray-200">
                                    {getDisplayTypeIcon(schedule)}
                                  </div>
                                  <h5 className="font-bold text-sm flex-1 truncate text-gray-800">{getDisplayTypeName(schedule)}</h5>
                                  {schedule.re_type === 'package' && (
                                    <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-700 text-xs rounded font-medium">📦</span>
                                  )}
                                  <div className="flex items-center gap-2">
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${schedule.re_status === 'confirmed' ? 'bg-green-100 text-green-800' : schedule.re_status === 'pending' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>
                                      {schedule.re_status === 'confirmed' ? '확정' : schedule.re_status === 'pending' ? '대기' : '취소'}
                                    </span>
                                    <button onClick={() => {
                                      if (schedule.users?.id) {
                                        loadAllUserReservations(schedule.users.id);
                                      }
                                    }} className="bg-blue-500 text-white py-0.5 px-2 rounded text-xs hover:bg-blue-600 transition-colors">상세</button>
                                  </div>
                                </div>
                                {renderScheduleCardBody(schedule)}
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
        </div>

        {/* DB 예약 상세 모달 */}
        <UserReservationDetailModal
          isOpen={isDBModalOpen}
          onClose={() => setIsDBModalOpen(false)}
          userInfo={dbUserInfo}
          allUserServices={dbUserServices}
          loading={dbModalLoading}
        />
      </div>
    </ManagerLayout>
  );
}
