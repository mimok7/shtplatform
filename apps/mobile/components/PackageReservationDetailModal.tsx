'use client';
// 모바일 패키지 예약의 포함 서비스를 한 열로 보여주는 상세 모달

import { useEffect, useMemo, useState } from 'react';
import { Building, Calendar, Car, CheckCircle, MapPin, Package, Plane, Ship, X } from 'lucide-react';
import supabase from '@/lib/supabase';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  userName: string;
  items: any[];
};

const formatMoney = (value: any) => `${Number(value || 0).toLocaleString('ko-KR')}동`;

const formatDate = (value: any) => {
  const raw = String(value || '').trim();
  if (!raw) return '-';
  return raw.replace('T', ' ').slice(0, 16);
};

const serviceMeta: Record<string, { label: string; Icon: typeof Ship; color: string }> = {
  cruise: { label: '크루즈', Icon: Ship, color: 'text-blue-700' },
  airport: { label: '공항', Icon: Plane, color: 'text-emerald-700' },
  hotel: { label: '호텔', Icon: Building, color: 'text-orange-700' },
  tour: { label: '투어', Icon: MapPin, color: 'text-violet-700' },
  rentcar: { label: '렌터카', Icon: Car, color: 'text-rose-700' },
  vehicle: { label: '차량', Icon: Car, color: 'text-cyan-700' },
  car: { label: '차량', Icon: Car, color: 'text-cyan-700' },
  sht: { label: '스하 차량', Icon: Car, color: 'text-indigo-700' },
};

const getServiceDate = (service: any) => (
  service.checkin
  || service.checkin_date
  || service.tourDate
  || service.usage_date
  || service.ra_datetime
  || service.pickup_datetime
  || service.re_created_at
  || ''
);

const getStatusLabel = (status: any) => {
  const value = String(status || '').toLowerCase();
  if (value === 'confirmed') return '확정';
  if (value === 'approved') return '승인';
  if (value === 'pending') return '대기';
  if (value === 'cancelled') return '취소';
  return value || '-';
};

export default function PackageReservationDetailModal({ isOpen, onClose, userName, items }: Props) {
  const [nameMaps, setNameMaps] = useState<Record<string, Record<string, any>>>({});

  const packageRoots = useMemo(
    () => items.filter((item) => String(item?.serviceType || item?.re_type) === 'package'),
    [items],
  );
  const packageReservationIds = useMemo(
    () => new Set(packageRoots.map((item) => String(item?.reservation_id || item?.re_id || '')).filter(Boolean)),
    [packageRoots],
  );
  const includedServices = useMemo(
    () => items
      .filter((item) => {
        const type = String(item?.serviceType || item?.re_type || '');
        return type !== 'package' && packageReservationIds.has(String(item?.reservation_id || item?.re_id || ''));
      })
      .sort((a, b) => String(getServiceDate(a)).localeCompare(String(getServiceDate(b)))),
    [items, packageReservationIds],
  );

  useEffect(() => {
    if (!isOpen || includedServices.length === 0) {
      setNameMaps({});
      return;
    }

    let cancelled = false;
    const loadNames = async () => {
      const codes = (type: string, key: string) => Array.from(new Set(
        includedServices
          .filter((item) => String(item?.serviceType || item?.re_type) === type)
          .map((item) => String(item?.[key] || '').trim())
          .filter(Boolean),
      ));
      const [cruiseRows, airportRows, hotelRows, tourRows, rentcarRows] = await Promise.all([
        (() => { const values = codes('cruise', 'room_price_code'); return values.length ? supabase.from('cruise_rate_card').select('id, cruise_name, room_type').in('id', values) : Promise.resolve({ data: [] }); })(),
        (() => { const values = codes('airport', 'airport_price_code'); return values.length ? supabase.from('airport_price').select('airport_code, service_type, route, vehicle_type').in('airport_code', values) : Promise.resolve({ data: [] }); })(),
        (() => { const values = codes('hotel', 'hotel_price_code'); return values.length ? supabase.from('hotel_price').select('hotel_price_code, hotel_name, room_name').in('hotel_price_code', values) : Promise.resolve({ data: [] }); })(),
        (() => { const values = codes('tour', 'tour_price_code'); return values.length ? supabase.from('tour_pricing').select('pricing_id, tour:tour_id(tour_name)').in('pricing_id', values) : Promise.resolve({ data: [] }); })(),
        (() => { const values = [...codes('rentcar', 'rentcar_price_code'), ...codes('vehicle', 'car_price_code'), ...codes('car', 'car_price_code')]; return values.length ? supabase.from('rentcar_price').select('rent_code, vehicle_type, route').in('rent_code', values) : Promise.resolve({ data: [] }); })(),
      ]);
      if (cancelled) return;
      const mapRows = (rows: any[], key: string) => Object.fromEntries((rows || []).map((row) => [String(row[key]), row]));
      setNameMaps({
        cruise: mapRows(cruiseRows.data || [], 'id'),
        airport: mapRows(airportRows.data || [], 'airport_code'),
        hotel: mapRows(hotelRows.data || [], 'hotel_price_code'),
        tour: mapRows(tourRows.data || [], 'pricing_id'),
        rentcar: mapRows(rentcarRows.data || [], 'rent_code'),
      });
    };
    void loadNames();
    return () => { cancelled = true; };
  }, [includedServices, isOpen]);

  if (!isOpen) return null;

  const getServiceName = (service: any, type: string) => {
    if (type === 'cruise') return nameMaps.cruise?.[service.room_price_code]?.cruise_name || service.cruiseName || service.cruise || '크루즈';
    if (type === 'airport') return nameMaps.airport?.[service.airport_price_code]?.route || service.ra_airport_location || service.airportName || '공항 이동';
    if (type === 'hotel') return nameMaps.hotel?.[service.hotel_price_code]?.hotel_name || service.hotelName || service.hotel_name || '호텔';
    if (type === 'tour') return nameMaps.tour?.[service.tour_price_code]?.tour?.tour_name || service.tourName || service.tour_name || '투어 프로그램';
    const vehicle = nameMaps.rentcar?.[service.rentcar_price_code || service.car_price_code];
    return vehicle?.vehicle_type || service.carType || service.vehicle_type || service.sht_category || '차량 서비스';
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end bg-black/50 sm:items-center sm:justify-center sm:p-4" role="dialog" aria-modal="true" aria-label="패키지 예약 통합 상세">
      <div className="flex max-h-[92dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-h-[90vh] sm:rounded-xl">
        <header className="flex items-start justify-between border-b border-gray-200 px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-indigo-700">
              <Package className="h-5 w-5" />
              <h2 className="text-base font-bold">패키지 예약 통합 상세</h2>
            </div>
            <p className="mt-1 text-xs text-gray-500">{userName} · 패키지 {packageRoots.length}건</p>
          </div>
          <button type="button" onClick={onClose} className="-mr-1 -mt-1 rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label="닫기">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="overflow-y-auto bg-gray-50 p-3 pb-6">
          <section className="space-y-2">
            {packageRoots.map((pkg, index) => {
              const people = [
                Number(pkg.re_adult_count || 0) > 0 ? `성인 ${Number(pkg.re_adult_count)}명` : '',
                Number(pkg.re_child_count || 0) > 0 ? `아동 ${Number(pkg.re_child_count)}명` : '',
                Number(pkg.re_infant_count || 0) > 0 ? `유아 ${Number(pkg.re_infant_count)}명` : '',
              ].filter(Boolean).join(', ') || '인원 미정';
              return (
                <article key={pkg.re_id || index} className="border border-indigo-200 bg-white p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="break-words text-sm font-bold text-gray-900">{pkg.package_name || pkg.package_code || '패키지'}</h3>
                      {pkg.package_description && <p className="mt-1 text-xs leading-relaxed text-gray-600">{pkg.package_description}</p>}
                    </div>
                    <span className="shrink-0 border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">{getStatusLabel(pkg.status)}</span>
                  </div>
                  <div className="mt-3 space-y-1 text-xs text-gray-700">
                    <p><span className="font-semibold text-blue-700">인원. </span>{people}</p>
                    <p><span className="font-semibold text-blue-700">예약일. </span>{formatDate(pkg.re_created_at)}</p>
                    <p className="flex items-center justify-between gap-3 border-t border-gray-100 pt-2"><span className="font-semibold text-blue-700">패키지 총액.</span><strong className="text-sm text-indigo-700">{formatMoney(pkg.total_amount || pkg.totalPrice)}</strong></p>
                  </div>
                </article>
              );
            })}
          </section>

          <section className="mt-5">
            <div className="mb-2 flex items-center gap-1.5 text-sm font-bold text-gray-900">
              <CheckCircle className="h-4 w-4 text-indigo-700" />
              포함 서비스 {includedServices.length}건
            </div>
            <div className="space-y-2">
              {includedServices.length === 0 ? (
                <p className="border border-dashed border-gray-300 bg-white p-4 text-center text-xs text-gray-500">저장된 패키지 포함 서비스가 없습니다.</p>
              ) : includedServices.map((service, index) => {
                const type = String(service.serviceType || service.re_type || '');
                const meta = serviceMeta[type] || { label: '서비스', Icon: Calendar, color: 'text-gray-700' };
                const Icon = meta.Icon;
                const pickup = service.pickupLocation || service.pickup_location;
                const dropoff = service.dropoffLocation || service.dropoff_location || service.destination;
                return (
                  <article key={`${service.reservation_id || service.re_id}-${type}-${index}`} className="border border-gray-200 bg-white p-3">
                    <div className="flex items-center gap-2">
                      <Icon className={`h-4 w-4 ${meta.color}`} />
                      <span className="text-xs font-bold text-blue-700">{meta.label}</span>
                    </div>
                    <h3 className="mt-1 break-words text-sm font-semibold text-gray-900">{getServiceName(service, type)}</h3>
                    <div className="mt-2 space-y-1 text-xs leading-relaxed text-gray-700">
                      <p><span className="font-semibold text-blue-700">일정. </span>{formatDate(getServiceDate(service))}</p>
                      {pickup && <p><span className="font-semibold text-blue-700">픽업. </span>{pickup}</p>}
                      {dropoff && <p><span className="font-semibold text-blue-700">드롭. </span>{dropoff}</p>}
                      {(service.note || service.request_note) && <p><span className="font-semibold text-blue-700">비고. </span>{service.note || service.request_note}</p>}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
