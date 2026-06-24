'use client';

import React, { useState, useEffect } from 'react';
import supabase from '@/lib/supabase';
import PackageReservationDetailModal from '@/components/PackageReservationDetailModal';

interface PackageDetailModalContainerProps {
  userId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function PackageDetailModalContainer({
  userId,
  isOpen,
  onClose,
}: PackageDetailModalContainerProps) {
  const [loading, setLoading] = useState(false);
  const [userInfo, setUserInfo] = useState<any>(null);
  const [services, setServices] = useState<any[]>([]);

  useEffect(() => {
    if (!isOpen || !userId) {
      if (!isOpen) {
        setUserInfo(null);
        setServices([]);
      }
      return;
    }

    let cancelled = false;

    const loadData = async () => {
      setLoading(true);
      try {
        // 1. 사용자 정보
        const { data: userData } = await supabase
          .from('users').select('*').eq('id', userId).single();
        if (cancelled) return;
        setUserInfo(userData);

        // 2. 패키지 예약 목록
        const { data: resData } = await supabase
          .from('reservation')
          .select('re_id, re_type, re_status, re_created_at, package_id, total_amount, re_adult_count, re_child_count, re_infant_count, manual_additional_fee, manual_additional_fee_detail, price_breakdown')
          .eq('re_user_id', userId)
          .eq('re_type', 'package');
        if (cancelled) return;

        const packageReservationIds = (resData || []).map((r: any) => r.re_id);
        const packageMasterIds = Array.from(new Set((resData || []).map((r: any) => r.package_id).filter(Boolean)));

        if (packageReservationIds.length === 0) {
          setServices([]);
          return;
        }

        // 3. 모든 서비스 병렬 조회
        const [packageMasterRes, packageDetailRes, cruiseRes, airportRes, tourRes, hotelRes, rentcarRes, shtRes] = await Promise.all([
          packageMasterIds.length > 0
            ? supabase.from('package_master').select('id, name, package_code, description, base_price, price_child_extra_bed, price_child_no_extra_bed, price_infant_tour, price_infant_extra_bed, price_infant_seat').in('id', packageMasterIds)
            : Promise.resolve({ data: [] as any[] }),
          supabase.from('reservation_package').select('*').in('reservation_id', packageReservationIds),
          supabase.from('reservation_cruise').select('*').in('reservation_id', packageReservationIds),
          supabase.from('reservation_airport').select('*').in('reservation_id', packageReservationIds),
          supabase.from('reservation_tour').select('*').in('reservation_id', packageReservationIds),
          supabase.from('reservation_hotel').select('*').in('reservation_id', packageReservationIds),
          supabase.from('reservation_rentcar').select('*').in('reservation_id', packageReservationIds),
          supabase.from('reservation_car_sht').select('*').in('reservation_id', packageReservationIds),
        ]);
        if (cancelled) return;

        const packageMasterMap = new Map<string, any>((packageMasterRes.data || []).map((p: any) => [p.id, p]));
        const packageDetailMap = new Map<string, any>((packageDetailRes.data || []).map((row: any) => [row.reservation_id, row]));
        const cruiseData = cruiseRes.data || [];
        const airportData = airportRes.data || [];
        const tourData = tourRes.data || [];
        const hotelData = hotelRes.data || [];
        const rentcarData = rentcarRes.data || [];
        const shtData = shtRes.data || [];

        // 4. 가격 코드 조회 (병렬)
        const cruiseCodes = cruiseData.map((r: any) => r.room_price_code).filter(Boolean);
        const tourCodes = tourData.map((r: any) => r.tour_price_code).filter(Boolean);
        const airportCodes = airportData.map((r: any) => r.airport_price_code).filter(Boolean);
        const hotelCodes = hotelData.map((r: any) => r.hotel_price_code).filter(Boolean);
        const rentcarCodes = rentcarData.map((r: any) => r.rentcar_price_code).filter(Boolean);

        const [roomPrices, roomPricesByRoomType, tourPriceRows, airportPrices, hotelPrices, rentcarPrices] = await Promise.all([
          cruiseCodes.length > 0 ? supabase.from('cruise_rate_card').select('id, cruise_name, room_type').in('id', cruiseCodes) : Promise.resolve({ data: [] as any[] }),
          cruiseCodes.length > 0 ? supabase.from('cruise_rate_card').select('id, cruise_name, room_type').in('room_type', cruiseCodes) : Promise.resolve({ data: [] as any[] }),
          tourCodes.length > 0 ? supabase.from('tour_pricing').select('pricing_id, tour_id, price_per_person').in('pricing_id', tourCodes) : Promise.resolve({ data: [] as any[] }),
          airportCodes.length > 0 ? supabase.from('airport_price').select('airport_code, service_type, route, vehicle_type, price').in('airport_code', airportCodes) : Promise.resolve({ data: [] as any[] }),
          hotelCodes.length > 0 ? supabase.from('hotel_price').select('hotel_price_code, hotel_name, room_name, base_price').in('hotel_price_code', hotelCodes) : Promise.resolve({ data: [] as any[] }),
          rentcarCodes.length > 0 ? supabase.from('rentcar_price').select('rent_code, vehicle_type, way_type, route, price').in('rent_code', rentcarCodes) : Promise.resolve({ data: [] as any[] }),
        ]);
        if (cancelled) return;

        const tourIds = Array.from(new Set((tourPriceRows.data || []).map((row: any) => row.tour_id).filter(Boolean)));
        const { data: tourNameRows } = tourIds.length > 0
          ? await supabase.from('tour').select('tour_id, tour_name, tour_code').in('tour_id', tourIds)
          : { data: [] as any[] };
        if (cancelled) return;

        const roomPriceMap = new Map<string, any>((roomPrices.data || []).map((r: any) => [r.id, r]));
        (roomPricesByRoomType.data || []).forEach((r: any) => {
          if (r?.room_type && !roomPriceMap.has(r.room_type)) roomPriceMap.set(r.room_type, r);
        });
        const tourById = new Map((tourNameRows || []).map((row: any) => [row.tour_id, row]));
        const tourPriceMap = new Map<string, any>((tourPriceRows.data || []).map((row: any) => [row.pricing_id, { ...row, tour: tourById.get(row.tour_id) }]));
        const airportPriceRows = airportPrices.data || [];
        const hotelPriceMap = new Map<string, any>((hotelPrices.data || []).map((r: any) => [r.hotel_price_code, r]));
        const rentcarPriceMap = new Map<string, any>((rentcarPrices.data || []).map((r: any) => [r.rent_code, r]));

        const getAirportPrice = (item: any) => {
          const way = String(item.way_type || item.ra_way_type || '').toLowerCase();
          const serviceType = way.includes('pickup') || way.includes('entry') || way.includes('픽업') ? '픽업'
            : way.includes('sending') || way.includes('sanding') || way.includes('exit') || way.includes('샌딩') ? '샌딩'
              : '';
          return airportPriceRows.find((row: any) => row.airport_code === item.airport_price_code && (!serviceType || row.service_type === serviceType))
            || airportPriceRows.find((row: any) => row.airport_code === item.airport_price_code);
        };

        // 5. 서비스 배열 구성
        const loadedServices: any[] = [];

        // 패키지 루트 맵 (예약 ID → 인원 정보)
        const packageRootMap = new Map<string, { adult: number; child: number; infant: number }>();
        (resData || []).forEach((pkg: any) => {
          packageRootMap.set(pkg.re_id, {
            adult: pkg.re_adult_count || 0,
            child: pkg.re_child_count || 0,
            infant: pkg.re_infant_count || 0,
          });
        });

        // 패키지 루트
        (resData || []).forEach((pkg: any) => {
          const pkgMaster = packageMasterMap.get(pkg.package_id);
          const pkgDetail = packageDetailMap.get(pkg.re_id);
          loadedServices.push({
            serviceType: 'package',
            reservation_id: pkg.re_id,
            re_status: pkg.re_status,
            re_created_at: pkg.re_created_at,
            package_name: pkgMaster?.name || '',
            package_code: pkgMaster?.package_code || '',
            package_description: pkgMaster?.description || '',
            total_amount: pkg.total_amount,
            re_adult_count: pkg.re_adult_count,
            re_child_count: pkg.re_child_count,
            re_infant_count: pkg.re_infant_count,
            package_master: pkgMaster || null,
            manual_additional_fee: pkg.manual_additional_fee || 0,
            manual_additional_fee_detail: pkg.manual_additional_fee_detail || null,
            price_breakdown_additional_items: pkg.price_breakdown?.additional_fee_items || [],
            ...(pkgDetail || {}),
          });
        });

        cruiseData.forEach((item: any) => {
          const priceInfo = roomPriceMap.get(item.room_price_code);
          const pkgRoot = packageRootMap.get(item.reservation_id);
          loadedServices.push({
            serviceType: 'cruise', isPackageService: true,
            reservation_id: item.reservation_id,
            cruise: priceInfo?.cruise_name || '크루즈',
            roomType: priceInfo?.room_type || item.room_price_code,
            checkin: item.checkin,
            adult: pkgRoot?.adult || item.guest_count || 0,
            child: pkgRoot?.child || item.child_count || 0,
            infant: pkgRoot?.infant || 0,
            totalPrice: item.room_total_price,
            note: item.request_note,
            birthday_event: item.birthday_event === true || item.birthday_event === 'true',
          });
        });

        // 공항
        airportData.forEach((item: any) => {
          const priceInfo = getAirportPrice(item);
          const pkgRoot = packageRootMap.get(item.reservation_id);
          loadedServices.push({
            serviceType: 'airport', isPackageService: true,
            reservation_id: item.reservation_id,
            category: priceInfo?.service_type || '',
            route: priceInfo?.route || '',
            carType: priceInfo?.vehicle_type || '',
            airportName: item.ra_airport_location,
            accommodation_info: item.accommodation_info,
            way_type: item.way_type,
            flightNumber: item.ra_flight_number,
            ra_datetime: item.ra_datetime,
            passengerCount: item.ra_passenger_count,
            carCount: item.ra_car_count,
            luggageCount: item.ra_luggage_count,
            pickupLocation: item.pickup_location,
            dropoffLocation: item.dropoff_location,
            totalPrice: item.total_price,
            unitPrice: priceInfo?.price || item.unit_price,
            dispatchCode: item.dispatch_code,
            adult: pkgRoot?.adult || 0,
            child: pkgRoot?.child || 0,
            infant: pkgRoot?.infant || 0,
            note: item.request_note,
          });
        });

        // 투어
        tourData.forEach((item: any) => {
          const priceInfo = tourPriceMap.get(item.tour_price_code);
          const pkgRoot = packageRootMap.get(item.reservation_id);
          loadedServices.push({
            serviceType: 'tour', isPackageService: true,
            reservation_id: item.reservation_id,
            tourName: priceInfo?.tour?.tour_name || item.tour_price_code,
            tourDate: item.usage_date,
            tourCapacity: item.tour_capacity,
            pickupLocation: item.pickup_location,
            dropoffLocation: item.dropoff_location,
            adult: item.adult_count || pkgRoot?.adult || 0,
            child: item.child_count || pkgRoot?.child || 0,
            infant: item.infant_count || pkgRoot?.infant || 0,
            passengerCount: item.passenger_count,
            carCount: item.car_count,
            totalPrice: item.total_price,
            note: item.request_note,
          });
        });

        // 호텔
        hotelData.forEach((item: any) => {
          const priceInfo = hotelPriceMap.get(item.hotel_price_code);
          const pkgRoot = packageRootMap.get(item.reservation_id);
          loadedServices.push({
            serviceType: 'hotel', isPackageService: true,
            reservation_id: item.reservation_id,
            hotelName: priceInfo?.hotel_name || item.hotel_category,
            roomType: priceInfo?.room_name || item.hotel_price_code,
            checkinDate: item.checkin_date,
            nights: item.room_count,
            guestCount: item.guest_count,
            totalPrice: item.total_price,
            unitPrice: priceInfo?.base_price || item.unit_price,
            adult: pkgRoot?.adult || 0,
            child: pkgRoot?.child || 0,
            infant: pkgRoot?.infant || 0,
            note: item.request_note,
          });
        });

        // 렌터카
        rentcarData.forEach((item: any) => {
          const priceInfo = rentcarPriceMap.get(item.rentcar_price_code);
          const pkgRoot = packageRootMap.get(item.reservation_id);
          loadedServices.push({
            serviceType: 'rentcar', isPackageService: true,
            reservation_id: item.reservation_id,
            category: priceInfo?.way_type || item.way_type || '',
            route: priceInfo?.route || item.route || '',
            carType: priceInfo?.vehicle_type || item.vehicle_type || item.rentcar_price_code,
            pickupDatetime: item.pickup_datetime,
            pickupLocation: item.pickup_location,
            dropoffLocation: item.destination || item.dropoff_location,
            passengerCount: item.passenger_count,
            carCount: item.car_count,
            luggageCount: item.luggage_count,
            totalPrice: item.total_price,
            unitPrice: priceInfo?.price || item.unit_price,
            dispatchCode: item.dispatch_code,
            adult: pkgRoot?.adult || 0,
            child: pkgRoot?.child || 0,
            infant: pkgRoot?.infant || 0,
            note: item.request_note,
          });
        });

        // 스하차량
        shtData.forEach((item: any) => {
          const pkgRoot = packageRootMap.get(item.reservation_id);
          loadedServices.push({
            serviceType: 'sht', isPackageService: true,
            reservation_id: item.reservation_id,
            category: item.sht_category,
            usageDate: item.pickup_datetime || item.usage_date,
            pickupLocation: item.pickup_location,
            dropoffLocation: item.dropoff_location,
            passengerCount: item.passenger_count,
            carCount: item.car_count,
            vehicleNumber: item.vehicle_number,
            seatNumber: item.seat_number,
            driverName: item.driver_name,
            dispatchCode: item.dispatch_code,
            totalPrice: item.car_total_price,
            unitPrice: item.unit_price,
            adult: pkgRoot?.adult || 0,
            child: pkgRoot?.child || 0,
            infant: pkgRoot?.infant || 0,
            note: item.request_note,
          });
        });

        // 날짜순 정렬
        loadedServices.sort((a, b) => {
          const getDate = (s: any) => {
            if (s.checkin) return new Date(s.checkin);
            if (s.ra_datetime) return new Date(s.ra_datetime);
            if (s.tourDate) return new Date(s.tourDate);
            if (s.usageDate) return new Date(s.usageDate);
            if (s.pickupDatetime) return new Date(s.pickupDatetime);
            if (s.checkinDate) return new Date(s.checkinDate);
            return new Date(0);
          };
          return getDate(a).getTime() - getDate(b).getTime();
        });

        setServices(loadedServices);
      } catch (err) {
        console.error('패키지 모달 데이터 로드 실패:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadData();
    return () => { cancelled = true; };
  }, [isOpen, userId]);

  return (
    <PackageReservationDetailModal
      isOpen={isOpen}
      onClose={onClose}
      userInfo={userInfo}
      allUserServices={services}
      loading={loading}
    />
  );
}
