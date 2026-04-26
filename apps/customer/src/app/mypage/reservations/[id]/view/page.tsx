"use client";

import React, { useEffect, useState, Suspense } from 'react';
import { useRouter, useParams } from 'next/navigation';
import supabase from '@/lib/supabase';
import { getSessionUser } from '@/lib/authHelpers';
import { formatKst } from '@/lib/kstDateTime';
import PageWrapper from '@/components/PageWrapper';
import SectionBox from '@/components/SectionBox';

type ServiceType = 'cruise' | 'airport' | 'hotel' | 'rentcar' | 'tour' | 'sht_car' | 'sht' | 'car' | 'package';

interface ReservationRow {
  re_id: string;
  re_type: ServiceType;
  re_status: string;
  re_created_at: string;
  re_quote_id: string | null;
  re_user_id: string;
  // 패키지 관련 필드
  package_id?: string | null;
  pax_count?: number | null;
  re_adult_count?: number | null;
  re_child_count?: number | null;
  re_infant_count?: number | null;
  total_amount?: number | null;
  price_breakdown?: any | null;
  manager_note?: string | null;
}

interface PackageMaster {
  id: string;
  package_code: string;
  name: string;
  description: string | null;
  vehicle_config?: any | null;
}

function getTypeIcon(type: string) {
  switch (type) {
    case 'cruise': return '🚢';
    case 'airport': return '✈️';
    case 'hotel': return '🏨';
    case 'rentcar': return '🚗';
    case 'tour': return '🎫';
    case 'car': return '🚙';
    case 'sht_car':
    case 'sht': return '🚙';
    case 'package': return '📦';
    default: return '📋';
  }
}

function getTypeName(type: string) {
  switch (type) {
    case 'cruise': return '크루즈';
    case 'airport': return '공항 서비스';
    case 'hotel': return '호텔';
    case 'rentcar': return '렌터카';
    case 'tour': return '투어';
    case 'car': return '크루즈 차량';
    case 'sht_car':
    case 'sht': return '스하차량';
    case 'package': return '패키지';
    default: return type;
  }
}


// 고객에게 표시할 필드만 선택
const customerFriendlyFields: Record<string, string[]> = {
  cruise: ['request_note'],
  airport: ['route', 'vehicle_type', 'accommodation_info', 'ra_airport_location', 'ra_flight_number', 'ra_datetime', 'ra_stopover_location', 'ra_stopover_wait_minutes', 'ra_car_count', 'ra_passenger_count', 'ra_luggage_count', 'dispatch_code', 'request_note'],
  hotel: ['hotel_name', 'room_name', 'checkin_date', 'guest_count', 'schedule', 'breakfast_service', 'hotel_category', 'assignment_code', 'request_note'],
  rentcar: ['way_type', 'route', 'vehicle_type', 'pickup_datetime', 'pickup_location', 'destination', 'via_location', 'via_waiting', 'car_count', 'passenger_count', 'luggage_count', 'dispatch_code', 'request_note'],
  tour: ['tour_name', 'tour_vehicle', 'tour_type', 'usage_date', 'tour_capacity', 'pickup_location', 'dropoff_location'],
  cruise_car: ['way_type', 'route', 'vehicle_type', 'car_passenger_capacity', 'pickup_datetime', 'pickup_location', 'dropoff_location', 'car_count', 'passenger_count', 'dispatch_code', 'request_note'],
  car: ['way_type', 'route', 'vehicle_type', 'car_passenger_capacity', 'pickup_datetime', 'pickup_location', 'dropoff_location', 'car_count', 'passenger_count', 'dispatch_code', 'request_note'],
  sht_car: ['vehicle_number', 'seat_number', 'car_type', 'usage_date', 'pickup_location', 'dropoff_location', 'passenger_count', 'request_note'],
  sht: ['vehicle_number', 'seat_number', 'car_type', 'usage_date', 'pickup_location', 'dropoff_location', 'passenger_count', 'request_note']
};

const labelMap: Record<string, Record<string, string>> = {
  cruise: {
    request_note: '📝 요청사항'
  },
  airport: {
    route: '🛣️ 경로',
    vehicle_type: '🚗 차량 타입',
    accommodation_info: '📍 장소',
    ra_airport_location: '✈️ 공항',
    ra_flight_number: '✈️ 항공편',
    ra_datetime: '🕐 일시',
    ra_stopover_location: '🔄 경유지',
    ra_stopover_wait_minutes: '⏱️ 경유 대기 시간(분)',
    ra_car_count: '🚗 차량 수',
    ra_passenger_count: '👥 승객 수',
    ra_luggage_count: '🧳 수하물 수',
    dispatch_code: '📦 차량번호',
    request_note: '📝 요청사항'
  },
  hotel: {
    hotel_name: '🏨 호텔명',
    room_name: '🚪 객실명',
    checkin_date: '📅 체크인',
    guest_count: '👥 총 인원',
    schedule: '📅 숙박일정',
    breakfast_service: '🍳 조식',
    hotel_category: '⭐ 호텔 등급',
    assignment_code: '🏛️ 호텔 코드',
    adult_count: '🧑 성인',
    child_count: '👶 아동',
    infant_count: '👼 유아',
    request_note: '📝 요청사항'
  },
  rentcar: {
    way_type: '🛣️ 이용방식',
    route: '🛣️ 경로',
    vehicle_type: '🚗 차종',
    capacity: '👥 탑승인원',
    pickup_datetime: '🕐 픽업 시간',
    pickup_location: '📍 승차 위치',
    destination: '🎯 하차 위치',
    via_location: '🔄 경유지',
    via_waiting: '⏱️ 경유 대기',
    car_count: '🚗 차량 수',
    passenger_count: '👥 승객 수',
    luggage_count: '🧳 수하물',
    dispatch_code: '📦 차량번호',
    request_note: '📝 요청사항'
  },
  tour: {
    tour_name: '🏞️ 투어명',
    tour_vehicle: '🚙 차량',
    tour_type: '🎫 투어 타입',
    usage_date: '📅 투어 날짜',
    tour_capacity: '👥 정원',
    pickup_location: '📍 픽업 장소',
    dropoff_location: '🎯 하차 장소',
    request_note: '📝 요청사항'
  },
  cruise_car: {
    way_type: '🛣️ 이용방식',
    route: '🛣️ 경로',
    vehicle_type: '🚗 차종',
    car_passenger_capacity: '👥 차량 정원',
    pickup_datetime: '🕐 픽업 시간',
    pickup_location: '📍 승차 위치',
    dropoff_location: '🎯 하차 위치',
    car_count: '🚗 차량 수',
    dispatch_code: '📦 차량번호',
    request_note: '📝 요청사항'
  },
  car: {
    way_type: '🛣️ 이용방식',
    route: '🛣️ 경로',
    vehicle_type: '🚗 차종',
    car_passenger_capacity: '👥 차량 정원',
    pickup_datetime: '🕐 픽업 시간',
    pickup_location: '📍 승차 위치',
    dropoff_location: '🎯 하차 위치',
    car_count: '🚗 차량 수',
    passenger_count: '👥 탑승 인원',
    dispatch_code: '📦 차량번호',
    request_note: '📝 요청사항'
  },
  sht_car: {
    car_price_code: '🏷️ 차량 가격 코드',
    vehicle_number: '🔢 차량번호',
    sht_category: '🚙 차량 분류',
    seat_number: '💺 좌석번호',
    car_type: '🚙 차종',
    car_category: '🏷️ 차량 카테고리',
    usage_date: '📅 사용일',
    pickup_location: '📍 승차 위치',
    dropoff_location: '🎯 하차 위치',
    passenger_count: '👥 승객 수',
    request_note: '📝 요청사항'
  },
  sht: {
    car_price_code: '🏷️ 차량 가격 코드',
    vehicle_number: '🔢 차량번호',
    sht_category: '🚙 차량 분류',
    seat_number: '💺 좌석번호',
    car_type: '🚙 차종',
    car_category: '🏷️ 차량 카테고리',
    usage_date: '📅 사용일',
    pickup_location: '📍 승차 위치',
    dropoff_location: '🎯 하차 위치',
    passenger_count: '👥 승객 수',
    request_note: '📝 요청사항'
  }
};

function formatValue(key: string, value: any): string {
  if (value === null || value === undefined) return '-';

  // 사용일(usage_date)은 시간 제외하고 날짜만 표시
  if (key === 'usage_date' && typeof value === 'string') {
    const d = new Date(value);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'short'
      });
    }
  }

  // 날짜/시간 포맷
  if (typeof value === 'string' && /\d{4}-\d{2}-\d{2}/.test(value)) {
    const d = new Date(value);
    if (!isNaN(d.getTime())) {
      // 시간이 포함된 경우
      if (value.includes('T') || value.includes(':')) {
        return formatKst(value);
      }
      // 날짜만
      return d.toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'short'
      });
    }
  }

  // 금액 포맷
  if ((key.includes('price') || key.includes('total')) && typeof value === 'number') {
    return `${value.toLocaleString('ko-KR')}동`;
  }

  // 숫자 포맷
  if (typeof value === 'number') {
    return value.toLocaleString('ko-KR');
  }

  // 불린 포맷
  if (typeof value === 'boolean') {
    return value ? '✅ 예' : '❌ 아니오';
  }

  return String(value);
}

function sanitizeRequestNote(value: any): string {
  if (value === null || value === undefined) return '';

  const hiddenLinePattern = /(?:^|\s)(?:비고\s*:\s*)?(?:\[(?:객실|구성)\s*\d+\]|(?:객실|구성)\s*\d+\b)/;

  const isAutoRoomCompositionLine = (line: string) => {
    const normalized = line.replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();

    // [객실 1] ... | 성인 2, 아동 0, ... 형태를 폭넓게 제거
    if (hiddenLinePattern.test(normalized)) return true;
    if (/(?:\[(?:객실|구성)\s*\d+\]|(?:객실|구성)\s*\d+\b)/.test(normalized) && /(성인|아동|유아|싱글|엑베)/.test(normalized)) return true;
    if (/\|\s*성인\s*\d+/.test(normalized) && /(아동\s*\d+|유아\s*\d+|싱글\s*\d+|엑베)/.test(normalized)) return true;

    return false;
  };

  const raw = String(value);
  const filtered = raw
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.replace(/\u00A0/g, ' ').trim();
      if (!trimmed) return false;
      if (isAutoRoomCompositionLine(trimmed)) return false;
      return true;
    })
    .join('\n')
    .trim();

  return filtered;
}

function renderCustomerFriendlyInfo(obj: any, type: keyof typeof labelMap) {
  if (!obj) return null;

  const normalizedType = (type === 'car' ? 'cruise_car' : type) as keyof typeof labelMap;

  const allowedFields = customerFriendlyFields[normalizedType] || [];
  const labels = labelMap[normalizedType] || {};

  let entries = allowedFields
    .map(key => {
      const original = obj[key];
      const value = key.includes('note') ? sanitizeRequestNote(original) : original;
      return { key, value, label: labels[key] || key };
    })
    .filter(({ value }) => value !== null && value !== undefined && value !== '');

  // 호텔인 경우 guest_count가 없으면 total로 계산
  if (type === 'hotel') {
    const guestCount = Number(obj.guest_count) || 0;

    // guest_count가 없으면 만들기
    if (guestCount === 0) {
      const adultCount = Number(obj.adult_count) || 0;
      const childCount = Number(obj.child_count) || 0;
      const infantCount = Number(obj.infant_count) || 0;
      const totalGuests = adultCount + childCount + infantCount;

      if (totalGuests > 0) {
        // guest_count 항목이 없다면 추가
        if (!entries.find(e => e.key === 'guest_count')) {
          entries.unshift({
            key: 'guest_count',
            value: totalGuests,
            label: labels['guest_count'] || '👥 총 인원'
          });
        }
      }
    }
  }

  // 중복 표시 방지: airport 타입의 경우 상단에 일시를 별도 표시하므로 여기선 ra_datetime을 제거
  if (type === 'airport') {
    entries = entries.filter(e => e.key !== 'ra_datetime');
  }

  if (entries.length === 0) {
    return <div className="text-sm text-gray-500">상세 정보가 없습니다.</div>;
  }

  return (

    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-2">
      {entries.map(({ key, value, label }) => {
        const isPrice = key.includes('price') || key.includes('total');
        const isNote = key.includes('note');

        if (isNote) {
          return (
            <div key={key} className="col-span-full mt-2 pt-2 border-t border-gray-100 flex flex-col gap-1">
              <span className="text-xs font-bold text-gray-500">{label}</span>
              <span className="text-sm text-gray-900 bg-yellow-50 p-2 rounded border border-yellow-200 whitespace-pre-wrap">{formatValue(key, value)}</span>
            </div>
          );
        }

        return (
          <div key={key} className="flex items-center gap-2">
            <span className="text-xs font-bold text-blue-600 shrink-0">{label}:</span>
            <span className={`text-sm ${isPrice ? 'text-blue-600 font-bold' : 'text-gray-900'}`}>
              {formatValue(key, value)}
            </span>
          </div>
        );
      })}
    </div>
  );
}


function ReservationViewInner() {
  const router = useRouter();
  const params = useParams();
  const reservationId = params?.id as string;

  const [reservation, setReservation] = useState<ReservationRow | null>(null);
  const [serviceDetails, setServiceDetails] = useState<any[] | null>(null);
  const [serviceDetailsExtra, setServiceDetailsExtra] = useState<any[] | null>(null);
  const [cruiseInfo, setCruiseInfo] = useState<any>(null);
  const [cruiseCategoryDetails, setCruiseCategoryDetails] = useState<any[]>([]);
  const [packageMaster, setPackageMaster] = useState<PackageMaster | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const confirmPickup = async (serviceType: string, serviceId: string) => {
    if (!confirm('승차 확인을 하시겠습니까?')) return;

    let tableName = '';
    let isCarSht = false;
    switch (serviceType) {
      case 'airport': tableName = 'reservation_airport'; break;
      case 'rentcar': tableName = 'reservation_rentcar'; break;
      case 'cruise_car': tableName = 'reservation_cruise_car'; break;
      case 'sht_car':
      case 'sht':
      case 'car_sht':
        tableName = 'ops_sht_seat_assignment'; // ops 테이블에서 UPDATE
        isCarSht = true;
        break;
      default: return;
    }

    try {
      const { error } = await supabase
        .from(tableName)
        .update({ pickup_confirmed_at: new Date().toISOString() })
        .eq('id', serviceId);

      if (error) throw error;
      alert("승차 확인이 완료되었습니다.");
      window.location.reload();
    } catch (error: any) {
      console.error('Error confirming pickup:', error);
      alert(`승차 확인 중 오류가 발생했습니다: ${error.message}`);
    }
  };

  const airportWayLabel = (svc: any) => {
    const way = svc.way_type || svc.service_type;
    if (!way) return null;
    return (way === 'sending' || way === '샌딩') ? '샌딩' : '픽업';
  };

  useEffect(() => {
    if (!reservationId) return;
    (async () => {
      try {
        setLoading(true);
        const { user, error: authError } = await getSessionUser(8000);
        if (!user) {
          const message = (authError as { message?: string } | null)?.message || '';
          const isTimeout = /AUTH_TIMEOUT_|timed out|timeout/i.test(message);
          if (isTimeout) {
            setError('세션 확인이 지연되었습니다. 잠시 후 다시 시도해 주세요.');
            return;
          }
          router.replace('/login');
          return;
        }

        // 본인 예약만 조회
        const { data: row, error: rErr } = await supabase
          .from('reservation')
          .select('*')
          .eq('re_id', reservationId)
          .eq('re_user_id', user.id)
          .maybeSingle();
        if (rErr) throw rErr;
        if (!row) { setError('예약이 없거나 접근 권한이 없습니다.'); return; }

        setReservation(row as ReservationRow);

        // 서비스 상세
        const tableByType: Record<ServiceType, string> = {
          cruise: 'reservation_cruise',
          airport: 'reservation_airport',
          hotel: 'reservation_hotel',
          rentcar: 'reservation_rentcar',
          tour: 'reservation_tour',
          sht_car: 'reservation_car_sht',
          sht: 'reservation_car_sht',
          car: 'reservation_cruise_car',
          package: 'reservation_package',
        };

        let enrichedSvc: any[] = [];

        const table = tableByType[row.re_type as ServiceType];
        if (table) {
          const { data: svc } = await supabase
            .from(table)
            .select('*')
            .eq('reservation_id', reservationId)
            .order('created_at', { ascending: false });

          enrichedSvc = Array.isArray(svc) ? svc : (svc ? [svc] : []);
        }

        // 각 서비스별로 가격 테이블 정보 추가
        if (row.re_type === 'airport' && enrichedSvc.length > 0) {
          enrichedSvc = await Promise.all(enrichedSvc.map(async (item) => {
            if (item.airport_price_code) {
              const { data: priceInfo } = await supabase
                .from('airport_price')
                .select('service_type, route, vehicle_type')
                .eq('airport_code', item.airport_price_code)
                .maybeSingle();
              if (priceInfo) {
                return { ...item, ...priceInfo };
              }
            }
            return item;
          }));
          // 공항 서비스는 일시(ra_datetime / pickup_datetime / usage_date) 기준 오름차순 정렬
          enrichedSvc.sort((a: any, b: any) => {
            const getTime = (x: any) => {
              const v = x?.ra_datetime || x?.pickup_datetime || x?.usage_date || null;
              const t = v ? new Date(v).getTime() : 0;
              return isNaN(t) ? 0 : t;
            };
            return getTime(a) - getTime(b);
          });
        }

        if (row.re_type === 'hotel' && enrichedSvc.length > 0) {
          enrichedSvc = await Promise.all(enrichedSvc.map(async (item) => {
            if (item.hotel_price_code) {
              const { data: priceInfo } = await supabase
                .from('hotel_price')
                .select('base_price, hotel_name, room_name, room_category')
                .eq('hotel_price_code', item.hotel_price_code)
                .maybeSingle();
              if (priceInfo) {
                return { ...item, hotel_name: priceInfo.hotel_name, room_name: priceInfo.room_name, room_type: priceInfo.room_category };
              }
            }
            return item;
          }));
        }

        if (row.re_type === 'rentcar' && enrichedSvc.length > 0) {
          enrichedSvc = await Promise.all(enrichedSvc.map(async (item) => {
            if (item.rentcar_price_code) {
              const { data: priceInfo } = await supabase
                .from('rentcar_price')
                .select('way_type, route, vehicle_type, capacity')
                .eq('rent_code', item.rentcar_price_code)
                .maybeSingle();
              if (priceInfo) {
                return { ...item, ...priceInfo };
              }
            }
            return item;
          }));
        }

        if (row.re_type === 'tour' && enrichedSvc.length > 0) {
          enrichedSvc = await Promise.all(enrichedSvc.map(async (item) => {
            if (item.tour_price_code) {
              const { data: priceInfo } = await supabase
                .from('tour_pricing')
                .select('pricing_id, price_per_person, vehicle_type, tour:tour_id(tour_name, tour_code)')
                .eq('pricing_id', item.tour_price_code)
                .maybeSingle();
              if (priceInfo) {
                return { ...item, tour_name: priceInfo.tour?.tour_name, tour_vehicle: priceInfo.vehicle_type };
              }
            }
            return item;
          }));
        }

        if ((row.re_type === 'sht_car' || row.re_type === 'sht') && enrichedSvc.length > 0) {
          enrichedSvc = await Promise.all(enrichedSvc.map(async (item) => {
            if (item.car_price_code) {
              try {
                const { data: priceInfo } = await supabase
                  .from('rentcar_price')
                  .select('way_type, route, vehicle_type, capacity')
                  .eq('rent_code', item.car_price_code)
                  .maybeSingle();
                if (priceInfo) {
                  return { ...item, ...priceInfo };
                }
              } catch (err) {
                console.warn('rentcar_price 조회 실패 (무시됨):', err);
              }
            }
            return item;
          }));
        }

        setServiceDetails(enrichedSvc);

        // 크루즈인 경우 cruise_rate_card 정보 조회
        if (row.re_type === 'cruise' && enrichedSvc && enrichedSvc.length > 0) {
          // 모든 room_price_code 수집
          const roomPriceCodes = enrichedSvc.map(item => item.room_price_code).filter(Boolean);

          // 병렬로 모든 cruise_rate_card 정보 조회
          const { data: rateCards } = roomPriceCodes.length > 0
            ? await supabase
              .from('cruise_rate_card')
              .select('id, cruise_name, room_type, schedule_type, price_adult, price_child, price_infant')
              .in('id', roomPriceCodes)
            : { data: [] };

          // cruise_rate_card 데이터를 맵으로 변환
          const roomPriceMap = new Map(
            (rateCards || []).map((rc: any) => [rc.id, rc])
          );

          const categoryDetails = [];
          let totalGuests = 0;
          let cruiseName = '';
          let scheduleInfo = '';
          let checkinDate = null;

          for (const item of enrichedSvc) {
            const roomPriceCode = item.room_price_code;
            const guestCount = item.guest_count || 0;
            totalGuests += guestCount;
            checkinDate = checkinDate || item.checkin;

            if (roomPriceCode) {
              const roomPrice = roomPriceMap.get(roomPriceCode) as any;

              if (roomPrice) {
                cruiseName = cruiseName || roomPrice.cruise_name;
                scheduleInfo = scheduleInfo || roomPrice.schedule_type;

                const adultCount = Number(item.adult_count) || 0;
                const childCount = Number(item.child_count) || 0;
                const infantCount = Number(item.infant_count) || 0;
                const childExtraBedCount = Number(item.child_extra_bed_count) || 0;
                const extraBedCount = Number(item.extra_bed_count) || 0;
                const singleCount = Number(item.single_count) || 0;

                const priceRows = [
                  { label: '성인', count: adultCount, unitPrice: Number(roomPrice.price_adult) || 0 },
                  { label: '아동', count: childCount, unitPrice: Number(roomPrice.price_child) || 0 },
                  { label: '유아', count: infantCount, unitPrice: Number(roomPrice.price_infant) || 0 },
                  { label: '아동(엑스트라베드)', count: childExtraBedCount, unitPrice: Number((roomPrice as any).price_child_extra_bed) || 0 },
                  { label: '엑스트라베드', count: extraBedCount, unitPrice: Number((roomPrice as any).price_extra_bed) || 0 },
                  { label: '싱글', count: singleCount, unitPrice: Number((roomPrice as any).price_single) || 0 },
                ]
                  .filter((rowPrice) => rowPrice.count > 0)
                  .map((rowPrice) => ({
                    ...rowPrice,
                    subtotal: rowPrice.count * rowPrice.unitPrice,
                  }));

                const calculatedTotal = priceRows.reduce((sum, rowPrice) => sum + rowPrice.subtotal, 0);
                const roomTotal = Number(item.room_total_price) || calculatedTotal;

                categoryDetails.push({
                  category: roomPrice.room_type || '객실',
                  room_type: roomPrice.room_type,
                  room_count: Number(item.room_count) || 0,
                  cruise: roomPrice.cruise_name,
                  schedule: roomPrice.schedule_type,
                  guest_count: guestCount,
                  room_price_code: roomPriceCode,
                  unit_price: item.unit_price || null,
                  room_total_price: roomTotal,
                  calculated_total: calculatedTotal,
                  price_rows: priceRows,
                  boarding_assist: item.boarding_assist || null,
                  boarding_code: item.boarding_code || null,
                  request_note: item.request_note || null
                });
              }
            }
          }

          let pierLocation: string | null = null;
          if (cruiseName) {
            const { data: cruiseLocation } = await supabase
              .from('cruise_location')
              .select('pier_location')
              .or(`en_name.eq.${cruiseName},kr_name.eq.${cruiseName}`)
              .limit(1)
              .maybeSingle();
            pierLocation = cruiseLocation?.pier_location || null;
          }

          setCruiseInfo({
            cruise_name: cruiseName,
            schedule: scheduleInfo,
            checkin: checkinDate,
            pier_location: pierLocation,
            total_guest_count: totalGuests
          });

          // 카테고리 순서 정렬: 성인 > 아동 > 유아 > 기타
          const categoryOrder: Record<string, number> = {
            '성인': 1,
            '아동': 2,
            '유아': 3
          };
          categoryDetails.sort((a, b) => {
            const orderA = categoryOrder[a.category] || 999;
            const orderB = categoryOrder[b.category] || 999;
            return orderA - orderB;
          });

          setCruiseCategoryDetails(categoryDetails);
        }

        // 크루즈 차량 추가 데이터
        if (row.re_type === 'cruise') {
          let rawCarData: any[] = [];

          // 1차: 같은 reservation_id로 직접 연결된 차량 조회 (견적 기반 예약 흐름)
          const { data: directCar, error: carErr } = await supabase
            .from('reservation_cruise_car')
            .select('*')
            .eq('reservation_id', reservationId);

          if (carErr) {
            console.error('크루즈 차량 상세 조회 실패', carErr);
          }

          if (directCar && directCar.length > 0) {
            rawCarData = directCar;
          } else if (row.re_quote_id) {
            // 2차: 같은 견적의 별도 차량 예약에서 조회 (직접예약 흐름 – re_type='car')
            const { data: carReservations } = await supabase
              .from('reservation')
              .select('re_id')
              .eq('re_user_id', row.re_user_id)
              .eq('re_quote_id', row.re_quote_id)
              .in('re_type', ['car']);

            if (carReservations && carReservations.length > 0) {
              const carResIds = carReservations.map((r: any) => r.re_id);
              const { data: linkedCar } = await supabase
                .from('reservation_cruise_car')
                .select('*')
                .in('reservation_id', carResIds);

              if (linkedCar && linkedCar.length > 0) {
                rawCarData = linkedCar;
              }
            }
          }

          // 차량 정보 조회하여 car_info 필드 및 총 탑승인원 추가
          if (rawCarData.length > 0) {
            let totalCarPassengers = 0;
            const carsWithInfo = await Promise.all(rawCarData.map(async (carItem) => {
              const passengerCount = carItem.passenger_count || 0;
              totalCarPassengers += passengerCount;

              // rentcar_price_code 우선, 없으면 car_price_code 사용
              const priceCode = carItem.rentcar_price_code || carItem.car_price_code;
              if (priceCode) {
                try {
                  const { data: carPrice } = await supabase
                    .from('rentcar_price')
                    .select('way_type, route, vehicle_type, capacity')
                    .eq('rent_code', priceCode)
                    .maybeSingle();

                  if (carPrice) {
                    return {
                      ...carItem,
                      car_info: `${carPrice.vehicle_type || carItem.vehicle_type || ''} (${carPrice.way_type || carItem.way_type || ''})`.trim(),
                      // 기존 값이 있으면 유지, 없을 때만 rentcar_price 값 사용
                      vehicle_type: carItem.vehicle_type || carPrice.vehicle_type,
                      way_type: carItem.way_type || carPrice.way_type,
                      route: carItem.route || carPrice.route,
                      car_passenger_capacity: carPrice.capacity,
                      total_passenger_count: totalCarPassengers
                    };
                  }
                } catch (err) {
                  console.warn('rentcar_price 조회 실패 (무시됨):', err);
                }
              }
              return {
                ...carItem,
                total_passenger_count: totalCarPassengers
              };
            }));
            setServiceDetailsExtra(carsWithInfo);
          } else {
            setServiceDetailsExtra([]);
          }
        }

        // 패키지 정보 조회
        if (row.re_type === 'package' && row.package_id) {
          const { data: pkgMaster } = await supabase
            .from('package_master')
            .select('id, package_code, name, description, vehicle_config')
            .eq('id', row.package_id)
            .maybeSingle();
          if (pkgMaster) {
            setPackageMaster(pkgMaster as PackageMaster);
          }
        }

        setError(null);
      } catch (e: any) {
        console.error('예약 상세 조회 실패', e);
        setError(e?.message || '예약 정보를 불러오는 중 오류가 발생했습니다.');
      } finally {
        setLoading(false);
      }
    })();
  }, [reservationId]);

  if (loading) {
    return (
      <PageWrapper>
        <div className="flex flex-col justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
          <p className="mt-4 text-gray-600">예약 정보를 불러오는 중...</p>
        </div>
      </PageWrapper>
    );
  }

  if (error) {
    return (
      <PageWrapper>
        <div className="text-center py-12">
          <div className="text-6xl mb-4">⚠️</div>
          <h3 className="text-lg font-medium text-gray-800 mb-2">예약 정보를 불러올 수 없습니다</h3>
          <p className="text-sm text-gray-600 mb-4">{error}</p>
          <div className="flex justify-center gap-2">
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              다시 시도
            </button>
            <button
              onClick={() => router.push('/mypage/reservations/list')}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
            >
              목록으로 돌아가기
            </button>
          </div>
        </div>
      </PageWrapper>
    );
  }

  if (!reservation) {
    return (
      <PageWrapper>
        <div className="text-center py-12">
          <div className="text-6xl mb-4">📭</div>
          <h3 className="text-lg font-medium text-gray-800 mb-2">예약 정보를 찾을 수 없습니다</h3>
          <p className="text-sm text-gray-600 mb-4">예약이 존재하지 않거나 접근 권한이 없습니다.</p>
          <button
            onClick={() => router.push('/mypage/reservations/list')}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            목록으로 돌아가기
          </button>
        </div>
      </PageWrapper>
    );
  }

  const createdDate = new Date(reservation.re_created_at);

  return (
    <PageWrapper>
      <div className="space-y-6 max-w-4xl mx-auto pb-8">
        {/* 헤더 - 고객 친화적으로 개선 */}
        <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl p-6 text-white shadow-lg">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-4xl">{getTypeIcon(reservation.re_type)}</span>
                <div>
                  <h1 className="text-2xl font-bold">{getTypeName(reservation.re_type)} 예약</h1>
                </div>
              </div>
              <div className="mt-4 text-sm">
                <span className="text-blue-100">
                  예약일: {createdDate.toLocaleDateString('ko-KR')}
                </span>
              </div>
            </div>
            <button
              onClick={() => router.push('/mypage/reservations/list')}
              className="self-end px-4 py-2 bg-white bg-opacity-20 hover:bg-opacity-30 text-white rounded-lg transition-all text-sm font-medium"
            >
              ← 목록으로
            </button>
          </div>
        </div>



        {/* 서비스 상세 - 고객 친화적 카드 UI */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              {getTypeIcon(reservation.re_type)} {getTypeName(reservation.re_type)} 상세 정보
            </h2>
          </div>
          <div className="p-6">
            {serviceDetails && serviceDetails.length > 0 ? (
              <div className="space-y-6">
                {/* 크루즈인 경우 크루즈 정보와 상세를 하나의 카드에 통합 */}
                {reservation.re_type === 'cruise' && cruiseInfo && (
                  <div>
                    {/* 기본 정보 - 3열 그리드로 변경 */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-2 mb-6">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-blue-600 shrink-0">🚢 크루즈명:</span>
                        <span className="text-sm font-medium text-gray-900">{cruiseInfo.cruise_name || '-'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-blue-600 shrink-0">📅 스케줄:</span>
                        <span className="text-sm text-gray-900">{cruiseInfo.schedule || '-'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-blue-600 shrink-0">🗓️ 승선일:</span>
                        <span className="text-sm text-gray-900">{cruiseInfo.checkin ? formatValue('checkin', cruiseInfo.checkin) : '-'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-blue-600 shrink-0">🛳️ 선착장:</span>
                        <span className="text-sm text-gray-900">{cruiseInfo.pier_location || '-'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-blue-600 shrink-0">👥 총 탑승 인원:</span>
                        <span className="text-sm font-medium text-gray-900">{cruiseInfo.total_guest_count ? `${cruiseInfo.total_guest_count}명` : '-'}</span>
                      </div>
                    </div>

                    {/* 카테고리별 상세 정보 */}
                    <div className="space-y-4">
                      <div className="text-sm font-semibold text-gray-700 mb-3">🎫 카테고리 / 객실별 상세</div>
                      {cruiseCategoryDetails.map((detail, idx) => {
                        const serviceItem = serviceDetails.find(svc => svc.room_price_code === detail.room_price_code);
                        const filteredRequestNote = sanitizeRequestNote(serviceItem?.request_note);

                        return (
                          <div key={detail.room_price_code || idx} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                            {/* 헤더 */}
                            <div className="flex items-start justify-between mb-3 pb-3 border-b border-gray-200">
                              <div className="flex items-center gap-2">
                                <span className="w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs font-bold shrink-0">
                                  {idx + 1}
                                </span>
                                <div>
                                  <div className="font-bold text-gray-900 text-base">
                                    {detail.category}
                                    {detail.room_count > 0 && (
                                      <span className="ml-2 text-sm font-medium text-gray-600">객실수: {detail.room_count}</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-xs text-gray-500">인원</div>
                                <div className="text-lg font-bold text-blue-600">{detail.guest_count}명</div>
                              </div>
                            </div>

                            {/* 상세 정보 - 3열 그리드로 변경 */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-2">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-blue-600 shrink-0">🚪 객실 타입:</span>
                                <span className="text-sm text-gray-900">{detail.room_type || '-'}</span>
                              </div>
                              {serviceItem?.boarding_code && (
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold text-blue-600 shrink-0">🎫 승선 코드:</span>
                                  <span className="text-sm text-gray-900">{serviceItem.boarding_code}</span>
                                </div>
                              )}
                            </div>

                            {/* 요청사항 */}
                            {filteredRequestNote && (
                              <div className="mt-3 pt-3 border-t border-gray-200">
                                <div className="text-xs text-gray-500 mb-1">📝 요청사항</div>
                                <div className="text-sm text-gray-900 bg-yellow-50 p-2 rounded border border-yellow-200 whitespace-pre-wrap">
                                  {filteredRequestNote}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                  </div>
                )}

                {/* 패키지인 경우 패키지 상세 정보 표시 */}
                {reservation.re_type === 'package' && (
                  <div>
                    {/* 패키지 기본 정보 */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-2 mb-6">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-blue-600 shrink-0">📦 패키지명:</span>
                        <span className="text-sm font-medium text-gray-900">{packageMaster?.name || '-'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-blue-600 shrink-0">👥 총 인원:</span>
                        <span className="text-sm font-medium text-gray-900">{reservation.pax_count ? `${reservation.pax_count}명` : '-'}</span>
                      </div>
                    </div>

                    {packageMaster?.description && (
                      <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                        <div className="text-xs text-blue-600 mb-1">📋 패키지 설명</div>
                        <div className="text-sm text-gray-700">{packageMaster.description}</div>
                      </div>
                    )}


                    {/* 배차 정보 (manager_note에서 추출) */}
                    {reservation.manager_note && (
                      <div className="mt-6">
                        <div className="text-sm font-semibold text-gray-700 mb-3">🚗 배차 및 일정 정보</div>
                        <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                          <div className="text-sm text-gray-700 whitespace-pre-wrap">{reservation.manager_note}</div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 렌터카 전용 픽업/샌딩 구분 표시 */}
                {reservation.re_type === 'rentcar' && (
                  <div className="space-y-4">
                    {serviceDetails.map((it, idx) => {
                      const wayType = it.way_type || '';
                      const showPickup = !!(it.pickup_datetime || it.pickup_location);
                      // return_datetime 있을 때만 샌딩 박스 표시 (destination은 픽업에서도 공통 사용)
                      const showSending = !!(it.return_datetime);
                      const wayLabel =
                        wayType.includes('당일왕복') ? '🔄 당일왕복' :
                          wayType.includes('픽업') ? '⬆️ 픽업' :
                            wayType.includes('샌딩') ? '⬇️ 샌딩' :
                              wayType ? `🚗 ${wayType}` : '🚗 렌터카';
                      return (
                        <div key={it.id || idx} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                          {/* 이용방식 헤더 - 경로만 표시 */}
                          <div className="flex items-center justify-between mb-3 pb-3 border-b border-gray-200">
                            <div className="flex items-center gap-2">
                              {it.route && <span className="text-sm font-bold text-blue-700">{it.route}</span>}
                            </div>
                          </div>

                          {/* 차량 정보 */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-2 mb-3">
                            {it.vehicle_type && (
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-blue-600 shrink-0">🚗 차종:</span>
                                <span className="text-sm text-gray-900">{it.vehicle_type}</span>
                              </div>
                            )}

                            {it.car_count != null && (
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-blue-600 shrink-0">🚗 차량 수:</span>
                                <span className="text-sm text-gray-900">{it.car_count}대</span>
                              </div>
                            )}
                            {it.passenger_count != null && (
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-blue-600 shrink-0">👥 탑승 인원:</span>
                                <span className="text-sm text-gray-900">{it.passenger_count}명</span>
                              </div>
                            )}
                            {it.luggage_count != null && it.luggage_count !== 0 && (
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-blue-600 shrink-0">🧳 수하물:</span>
                                <span className="text-sm text-gray-900">{it.luggage_count}개</span>
                              </div>
                            )}
                            {it.dispatch_code && (
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-blue-600 shrink-0">📦 차량번호:</span>
                                <span className="text-sm text-gray-900">{it.dispatch_code}</span>
                              </div>
                            )}
                          </div>

                          {/* 픽업 정보 Ⅰ */}
                          {showPickup && (
                            <div className="mb-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
                              <div className="text-xs font-bold text-blue-700 mb-2">Ⅰ 📍 픽업 정보</div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {it.pickup_datetime && (
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-blue-600 shrink-0">🕐 픽업 시간:</span>
                                    <span className="text-sm text-gray-900">{formatKst(it.pickup_datetime)}</span>
                                  </div>
                                )}
                                {it.pickup_location && (
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-blue-600 shrink-0">📍 승차 위치:</span>
                                    <span className="text-sm text-gray-900">{it.pickup_location}</span>
                                  </div>
                                )}
                                {it.destination && (
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-blue-600 shrink-0">🎯 하차 위치:</span>
                                    <span className="text-sm text-gray-900">{it.destination}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* 드롭 정보 Ⅱ */}
                          {showSending && (
                            <div className="mb-3 p-3 bg-cyan-50 rounded-lg border border-cyan-100">
                              <div className="text-xs font-bold text-cyan-700 mb-2">Ⅱ 📍 드롭 정보</div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {it.return_datetime && (
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-cyan-600 shrink-0">🕐 드롭 시간:</span>
                                    <span className="text-sm text-gray-900">{formatKst(it.return_datetime)}</span>
                                  </div>
                                )}
                                {it.return_pickup_location && (
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-cyan-600 shrink-0">📍 승차 위치:</span>
                                    <span className="text-sm text-gray-900">{it.return_pickup_location}</span>
                                  </div>
                                )}
                                {it.return_destination && (
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-cyan-600 shrink-0">🎯 하차 위치:</span>
                                    <span className="text-sm text-gray-900">{it.return_destination}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* 픽업 경유 정보 (샌딩 경유) */}
                          {(it.return_via_location || it.return_via_waiting) && (
                            <div className="mb-3 p-3 bg-amber-50 rounded-lg border border-amber-100">
                              <div className="text-xs font-bold text-amber-700 mb-2">🔄 픽업 경유 정보</div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {it.return_via_location && (
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-amber-600 shrink-0">🔄 경유지:</span>
                                    <span className="text-sm text-gray-900">{it.return_via_location}</span>
                                  </div>
                                )}
                                {it.return_via_waiting && (
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-amber-600 shrink-0">⏱️ 경유 대기:</span>
                                    <span className="text-sm text-gray-900">{it.return_via_waiting}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* 픽업 경유 정보 */}
                          {(it.via_location || it.via_waiting) && (
                            <div className="mb-3 p-3 bg-yellow-50 rounded-lg border border-yellow-100">
                              <div className="text-xs font-bold text-yellow-700 mb-2">🔄 픽업 경유 정보</div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {it.via_location && (
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-yellow-600 shrink-0">🔄 경유지:</span>
                                    <span className="text-sm text-gray-900">{it.via_location}</span>
                                  </div>
                                )}
                                {it.via_waiting && (
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-yellow-600 shrink-0">⏱️ 경유 대기:</span>
                                    <span className="text-sm text-gray-900">{it.via_waiting}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* 요청사항 */}
                          {it.request_note && (
                            <div className="mt-3 pt-3 border-t border-gray-200">
                              <div className="text-xs font-bold text-gray-500 mb-1">📝 요청사항</div>
                              <div className="text-sm text-gray-900 bg-yellow-50 p-2 rounded border border-yellow-200 whitespace-pre-wrap">{it.request_note}</div>
                            </div>
                          )}

                          {/* 승차 확인 버튼 - 숨김 처리 */}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* 크루즈, 패키지, 렌터카가 아닌 경우 기존 방식 유지 */}
                {reservation.re_type !== 'cruise' && reservation.re_type !== 'package' && reservation.re_type !== 'rentcar' && (() => {
                  // sht/sht_car의 경우 픽업을 먼저 드롭을 나중에 정렬
                  let displayDetails = serviceDetails;
                  // airport: 픽업(픽업/기본) 항목을 먼저, 샌딩 항목을 뒤로 배치해
                  // 첫번째 항목을 '픽업', 두번째를 '샌딩'으로 표시하기 위함
                  if (reservation.re_type === 'airport') {
                    displayDetails = [...serviceDetails].sort((a, b) => {
                      const aWay = String(a.way_type || a.ra_way_type || a.service_type || '').toLowerCase();
                      const bWay = String(b.way_type || b.ra_way_type || b.service_type || '').toLowerCase();
                      const aIsSending = aWay.includes('sending') || aWay.includes('샌딩');
                      const bIsSending = bWay.includes('sending') || bWay.includes('샌딩');
                      if (aIsSending === bIsSending) return 0;
                      return aIsSending ? 1 : -1;
                    });
                  } else if (['sht', 'sht_car'].includes(reservation.re_type)) {
                    displayDetails = [...serviceDetails].sort((a, b) => {
                      const aCategory = (a.sht_category || a.car_category || '').toLowerCase();
                      const bCategory = (b.sht_category || b.car_category || '').toLowerCase();
                      // Pickup이 먼저 (0), Drop-off가 나중에 (1)
                      const aOrder = aCategory.includes('pickup') ? 0 : 1;
                      const bOrder = bCategory.includes('pickup') ? 0 : 1;
                      return aOrder - bOrder;
                    });
                  }
                  return displayDetails.map((it, idx) => (
                    <div key={idx} className={`${displayDetails.length > 1 ? 'pb-6 border-b border-gray-200 last:border-0 last:pb-0' : ''}`}>
                      {displayDetails.length > 1 && (
                        <div className="text-sm font-medium text-gray-700 mb-4 flex items-center gap-2">
                          <span className="w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs">
                            {idx + 1}
                          </span>
                          {reservation.re_type === 'airport'
                            ? (airportWayLabel(it) || (idx === 0 ? '픽업' : (idx === 1 ? '샌딩' : `${idx + 1}번 항목`)))
                            : ['sht', 'sht_car'].includes(reservation.re_type)
                              ? (it.sht_category === 'Pickup' || it.car_category === 'Pickup' ? '픽업' : '드롭')
                              : `${idx + 1}번 항목`
                          }
                        </div>
                      )}
                      {reservation.re_type === 'airport' && (it.ra_datetime || it.pickup_datetime || it.usage_date) && (
                        <div>
                          <div className="mb-2 text-sm text-gray-700 flex items-center gap-2">
                            <span className="text-xs font-bold text-blue-600 shrink-0">🕐 일시:</span>
                            <span className="text-sm text-gray-900">{formatKst(it.ra_datetime || it.pickup_datetime || it.usage_date)}</span>
                          </div>
                          {airportWayLabel(it) === '샌딩' && (
                            <div className="mt-2 mb-4 p-3 bg-red-50 rounded border border-red-200">
                              <p className="text-sm text-red-700">* 샌딩 일시는 비행기 시간이 아닌 차량 승차 시간입니다.</p>
                            </div>
                          )}
                        </div>
                      )}
                      {renderCustomerFriendlyInfo(it, reservation.re_type)}
                      {/* 승차 확인 버튼 - 숨김 처리 */}
                    </div>
                  ));
                })()}
              </div>
            ) : reservation.re_type === 'package' ? (
              // 패키지인 경우 reservation 테이블의 price_breakdown 정보로 표시
              <div>
                {/* 패키지 기본 정보 */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-2 mb-6">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-blue-600 shrink-0">📦 패키지명:</span>
                    <span className="text-sm font-medium text-gray-900">{packageMaster?.name || '-'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-blue-600 shrink-0">👥 총 인원:</span>
                    <span className="text-sm font-medium text-gray-900">{reservation.pax_count ? `${reservation.pax_count}명` : '-'}</span>
                  </div>
                </div>

                {packageMaster?.description && (
                  <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="text-xs text-blue-600 mb-1">📋 패키지 설명</div>
                    <div className="text-sm text-gray-700">{packageMaster.description}</div>
                  </div>
                )}

                {/* 배차 정보 (manager_note에서 추출) */}
                {reservation.manager_note && (
                  <div className="mt-6">
                    <div className="text-sm font-semibold text-gray-700 mb-3">🚗 배차 및 일정 정보</div>
                    <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                      <div className="text-sm text-gray-700 whitespace-pre-wrap">{reservation.manager_note}</div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <div className="text-4xl mb-2">📭</div>
                <p>상세 정보가 없습니다.</p>
              </div>
            )}
          </div>
        </div>

        {/* 크루즈 차량 정보 - 개선된 UI */}
        {reservation.re_type === 'cruise' && serviceDetailsExtra && serviceDetailsExtra.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="bg-gradient-to-r from-green-50 to-green-100 px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                🚗 연결 차량 정보
              </h2>
            </div>
            <div className="p-6">
              <div className="space-y-6">
                {serviceDetailsExtra.map((it, idx) => (
                  <div key={idx} className={`${serviceDetailsExtra.length > 1 ? 'pb-6 border-b border-gray-200 last:border-0 last:pb-0' : ''}`}>
                    {serviceDetailsExtra.length > 1 && (
                      <div className="text-sm font-medium text-gray-700 mb-4 flex items-center gap-2">
                        <span className="w-6 h-6 bg-green-500 text-white rounded-full flex items-center justify-center text-xs">
                          {idx + 1}
                        </span>
                        <span>
                          {idx + 1}번 차량{it.car_type && ` (${it.car_type})`}
                        </span>
                      </div>
                    )}
                    {renderCustomerFriendlyInfo(it, 'cruise_car')}
                    {/* 승차 확인 버튼 - 숨김 처리 */}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 안내 메시지 - 크루즈, 호텔 예약 제외 */}
        {reservation.re_type !== 'cruise' && reservation.re_type !== 'hotel' && (
          <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
            <div className="flex gap-3">
              <span className="text-2xl">💡</span>
              <div className="flex-1">
                <p className="text-sm text-blue-700">
                  차량 승차 및 하차 위치, 시간 변경 등은 전날 정오까지만 가능합니다.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageWrapper>
  );
}

export default function Page() {
  return (
    <Suspense fallback={
      <PageWrapper>
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        </div>
      </PageWrapper>
    }>
      <ReservationViewInner />
    </Suspense>
  );
}
