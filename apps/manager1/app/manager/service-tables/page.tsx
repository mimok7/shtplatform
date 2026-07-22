'use client';
// 서비스별 예약을 자연어 컬럼으로 조회하는 매니저 화면

import { useEffect, useMemo, useState } from 'react';
import { Building2, Car, Plane, Search, Ship, Ticket, MapPin, Package } from 'lucide-react';
import ManagerLayout from '../../../components/ManagerLayout';
import supabase from '../../../lib/supabase';
import { fetchTableInBatches } from '../../../lib/fetchInBatches';
import { openCentralReservationDetailModal } from '../../../contexts/reservationDetailModalEvents';

type ServiceRow = Record<string, any> & { id: string; reservation?: Record<string, any> };
type Column = { key: string; label: string; type?: 'date' | 'datetime' | 'price' | 'status' };

const services = [
  { id: 'cruise', label: '크루즈', table: 'reservation_cruise', icon: Ship, date: 'checkin' },
  { id: 'cruise_car', label: '크루즈 차량', table: 'reservation_cruise_car', icon: Car, date: 'pickup_datetime' },
  { id: 'sht_car', label: '스하 차량', table: 'reservation_car_sht', icon: Car, date: 'usage_date' },
  { id: 'airport', label: '공항서비스', table: 'reservation_airport', icon: Plane, date: 'ra_datetime' },
  { id: 'hotel', label: '호텔', table: 'reservation_hotel', icon: Building2, date: 'checkin_date' },
  { id: 'tour', label: '투어', table: 'reservation_tour', icon: MapPin, date: 'usage_date' },
  { id: 'ticket', label: '티켓', table: 'reservation_ticket', icon: Ticket, date: 'usage_date' },
  { id: 'rentcar', label: '렌터카', table: 'reservation_rentcar', icon: Car, date: 'pickup_datetime' },
  { id: 'package', label: '패키지', table: 'reservation', icon: Package, date: 're_created_at' },
  { id: 'fasttrack', label: '패스트랙', table: 'reservation_airport_fasttrack', icon: Plane, date: 'created_at' },
] as const;

const columns: Record<string, Column[]> = {
  cruise: [{ key: 'reservation.users.name', label: '고객명' }, { key: 'checkin', label: '체크인', type: 'date' }, { key: 'cruise_name', label: '크루즈명' }, { key: 'room_type_name', label: '객실 타입' }, { key: 'room_name', label: '객실명' }, { key: 'guest_count', label: '인원' }, { key: 'room_total_price', label: '총금액', type: 'price' }, { key: 'reservation.re_status', label: '상태', type: 'status' }],
  cruise_car: [{ key: 'reservation.users.name', label: '고객명' }, { key: 'vehicle_name', label: '차량명' }, { key: 'pickup_location', label: '픽업 장소' }, { key: 'dropoff_location', label: '드롭 장소' }, { key: 'pickup_datetime', label: '픽업 일시', type: 'datetime' }, { key: 'unit_price', label: '단가', type: 'price' }, { key: 'reservation.re_status', label: '상태', type: 'status' }],
  sht_car: [{ key: 'usage_date', label: '사용일자', type: 'date' }, { key: 'sht_category', label: '구분' }, { key: 'vehicle_number', label: '차량번호' }, { key: 'seat_number', label: '좌석번호' }, { key: 'reservation.users.name', label: '고객명' }, { key: 'reservation.re_status', label: '상태', type: 'status' }],
  airport: [{ key: 'reservation.users.name', label: '고객명' }, { key: 'airport_service_name', label: '서비스' }, { key: 'airport_route', label: '경로' }, { key: 'airport_vehicle', label: '차량' }, { key: 'ra_airport_location', label: '공항' }, { key: 'ra_datetime', label: '일시', type: 'datetime' }, { key: 'ra_passenger_count', label: '승객' }, { key: 'total_price', label: '총금액', type: 'price' }, { key: 'reservation.re_status', label: '상태', type: 'status' }],
  hotel: [{ key: 'reservation.users.name', label: '고객명' }, { key: 'checkin_date', label: '체크인', type: 'date' }, { key: 'hotel_category', label: '호텔 등급' }, { key: 'guest_count', label: '인원' }, { key: 'room_count', label: '객실 수' }, { key: 'total_price', label: '총금액', type: 'price' }, { key: 'reservation.re_status', label: '상태', type: 'status' }],
  tour: [{ key: 'reservation.users.name', label: '고객명' }, { key: 'tour_name', label: '투어명' }, { key: 'tour_capacity', label: '참가 인원' }, { key: 'pickup_location', label: '픽업 장소' }, { key: 'usage_date', label: '사용일자', type: 'date' }, { key: 'total_price', label: '총금액', type: 'price' }, { key: 'reservation.re_status', label: '상태', type: 'status' }],
  ticket: [{ key: 'reservation.users.name', label: '고객명' }, { key: 'ticket_name', label: '티켓명' }, { key: 'program_selection', label: '프로그램' }, { key: 'ticket_quantity', label: '수량' }, { key: 'usage_date', label: '사용일자', type: 'date' }, { key: 'total_price', label: '총금액', type: 'price' }, { key: 'reservation.re_status', label: '상태', type: 'status' }],
  rentcar: [{ key: 'reservation.users.name', label: '고객명' }, { key: 'vehicle_name', label: '차량명' }, { key: 'pickup_datetime', label: '픽업 일시', type: 'datetime' }, { key: 'pickup_location', label: '픽업 장소' }, { key: 'destination', label: '목적지' }, { key: 'passenger_count', label: '승객 수' }, { key: 'total_price', label: '총금액', type: 'price' }, { key: 'reservation.re_status', label: '상태', type: 'status' }],
  package: [{ key: 'reservation.users.name', label: '고객명' }, { key: 'package_name', label: '패키지명' }, { key: 'pax_count', label: '인원' }, { key: 'total_amount', label: '총금액', type: 'price' }, { key: 're_status', label: '상태', type: 'status' }],
  fasttrack: [{ key: 'reservation.users.name', label: '고객명' }, { key: 'way_name', label: '구분' }, { key: 'airport_name', label: '공항명' }, { key: 'applicant_name', label: '신청자' }, { key: 'total_price_krw', label: '금액', type: 'price' }, { key: 'created_at', label: '신청 일시', type: 'datetime' }, { key: 'reservation.re_status', label: '상태', type: 'status' }],
};

function nestedValue(row: Record<string, any>, key: string) {
  return key.split('.').reduce((value, part) => value?.[part], row);
}

export default function ManagerServiceTablesPage() {
  const [activeService, setActiveService] = useState('cruise');
  const [rows, setRows] = useState<ServiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchColumn, setSearchColumn] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [maps, setMaps] = useState<Record<string, Record<string, any>>>({});

  const active = services.find(service => service.id === activeService) || services[0];
  const activeColumns = columns[activeService] || [];

  useEffect(() => {
    Promise.all([
      supabase.from('cruise_rate_card').select('id, cruise_name, room_type, room_name'),
      supabase.from('rentcar_price').select('rent_code, vehicle_type'),
      supabase.from('airport_price').select('airport_code, service_type, route, vehicle_type'),
      supabase.from('tour').select('tour_code, tour_name, category'),
      supabase.from('package_master').select('id, name'),
    ]).then(results => {
      const toMap = (data: any[] | null, key: string) => Object.fromEntries((data || []).filter(row => row[key]).map(row => [row[key], row]));
      setMaps({ cruise: toMap(results[0].data, 'id'), car: toMap(results[1].data, 'rent_code'), airport: toMap(results[2].data, 'airport_code'), tour: toMap(results[3].data, 'tour_code'), package: toMap(results[4].data, 'id') });
    });
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setSearchColumn('all');
    setSearchTerm('');
    const load = async () => {
      let query = supabase.from(active.table).select('*').order(active.date, { ascending: false });
      if (active.id === 'package') query = query.eq('re_type', 'package').not('package_id', 'is', null);
      const { data, error } = await query;
      if (error) throw error;
      const source = data || [];
      const reservationIds = source.map((row: any) => row.reservation_id || row.re_id).filter(Boolean);
      const reservations = active.id === 'package'
        ? source
        : await fetchTableInBatches('reservation', 're_id', reservationIds, 're_id, re_user_id, re_status');
      const reservationMap = Object.fromEntries((reservations || []).map((row: any) => [row.re_id, row]));
      const userIds = (reservations || []).map((row: any) => row.re_user_id).filter(Boolean);
      const users = await fetchTableInBatches('users', 'id', userIds, 'id, name, email');
      const userMap = Object.fromEntries((users || []).map((row: any) => [row.id, row]));
      const merged = source.map((row: any) => {
        const reservation = active.id === 'package' ? row : reservationMap[row.reservation_id];
        return { ...row, reservation: reservation ? { ...reservation, users: userMap[reservation.re_user_id] } : undefined };
      });
      if (alive) setRows(merged);
    };
    load().catch(error => { console.error('서비스별 조회 로딩 실패:', error); if (alive) setRows([]); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [active]);

  const displayValue = (row: ServiceRow, column: Column) => {
    const code = row.room_price_code;
    const cruise = maps.cruise?.[code];
    const car = maps.car?.[row.car_price_code || row.rentcar_price_code];
    const airport = maps.airport?.[row.airport_price_code];
    const tour = maps.tour?.[row.tour_price_code];
    const packageItem = maps.package?.[row.package_id];
    const special: Record<string, any> = {
      cruise_name: cruise?.cruise_name || '미지정', room_type_name: cruise?.room_type || '미지정', room_name: cruise?.room_name || '미지정',
      vehicle_name: car?.vehicle_type || '미지정', airport_service_name: airport?.service_type || '미지정', airport_route: airport?.route || '미지정', airport_vehicle: airport?.vehicle_type || '미지정',
      tour_name: tour?.tour_name || tour?.category || '미지정', package_name: packageItem?.name || '미지정', pax_count: [row.re_adult_count, row.re_child_count, row.re_infant_count].filter(Boolean).reduce((sum: number, count: number) => sum + Number(count), 0),
      way_name: row.way_type === 'pickup' ? '픽업' : row.way_type === 'sending' ? '샌딩' : '미지정',
    };
    const value = Object.hasOwn(special, column.key) ? special[column.key] : nestedValue(row, column.key);
    if (value === null || value === undefined || value === '') return '-';
    if (column.type === 'date') return new Date(value).toLocaleDateString('ko-KR');
    if (column.type === 'datetime') return new Date(value).toLocaleString('ko-KR');
    if (column.type === 'price') return `${Number(value).toLocaleString()}원`;
    if (column.type === 'status') return ({ confirmed: '확정', approved: '승인', pending: '대기중', cancelled: '취소' } as Record<string, string>)[value] || '미지정';
    return String(value);
  };

  const filteredRows = useMemo(() => {
    if (!searchTerm.trim()) return rows;
    const targetColumns = searchColumn === 'all' ? activeColumns : activeColumns.filter(column => column.key === searchColumn);
    return rows.filter(row => targetColumns.some(column => displayValue(row, column).toLowerCase().includes(searchTerm.toLowerCase())));
  }, [rows, activeColumns, searchColumn, searchTerm, maps]);

  const Icon = active.icon;
  return <ManagerLayout title="서비스별 조회" activeTab="service-tables">
    <div className="space-y-4">
      <div className="flex gap-1 overflow-x-auto border-b border-gray-200 pb-2">
        {services.map(service => <button key={service.id} onClick={() => setActiveService(service.id)} className={`min-h-10 whitespace-nowrap border px-3 text-sm ${active.id === service.id ? 'border-teal-800 bg-[#062f33] text-white' : 'border-gray-300 bg-white text-gray-700'}`}>{service.label}</button>)}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <select value={searchColumn} onChange={event => setSearchColumn(event.target.value)} className="min-h-11 border border-gray-300 bg-white px-3 text-sm"><option value="all">전체 컬럼</option>{activeColumns.map(column => <option key={column.key} value={column.key}>{column.label}</option>)}</select>
        <div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input value={searchTerm} onChange={event => setSearchTerm(event.target.value)} placeholder="선택한 컬럼으로 조회" className="min-h-11 w-full border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-teal-700 focus:ring-2 focus:ring-[#d9ff72]" /></div>
      </div>
      <section className="overflow-hidden border border-gray-200 bg-white">
        <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-3"><Icon className="h-5 w-5 text-teal-800" /><h2 className="font-semibold text-gray-900">{active.label} 예약 목록</h2><span className="text-sm text-gray-500">{filteredRows.length}건</span></div>
        <div className="max-h-[70vh] overflow-auto">
          {loading ? <p className="p-8 text-center text-gray-500">데이터를 불러오는 중입니다.</p> : filteredRows.length === 0 ? <p className="p-8 text-center text-gray-500">조회 결과가 없습니다.</p> : <table className="w-full text-sm"><thead className="sticky top-0 bg-gray-50 text-left text-xs text-gray-600"><tr>{activeColumns.map(column => <th key={column.key} className="whitespace-nowrap border-b border-gray-200 px-4 py-3 font-semibold">{column.label}</th>)}<th className="border-b border-gray-200 px-4 py-3">상세</th></tr></thead><tbody>{filteredRows.map(row => <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50">{activeColumns.map(column => <td key={column.key} className="whitespace-nowrap px-4 py-3 text-gray-800">{displayValue(row, column)}</td>)}<td className="px-4 py-3"><button onClick={() => openCentralReservationDetailModal({ userId: row.reservation?.re_user_id, mode: 'auto' })} className="border border-teal-800 px-2 py-1 text-xs font-semibold text-teal-900">상세</button></td></tr>)}</tbody></table>}
        </div>
      </section>
    </div>
  </ManagerLayout>;
}
