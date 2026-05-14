// @ts-nocheck
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import supabase from '@/lib/supabase';
import {
  CheckSquare, Square, ArrowLeft, RefreshCw, CheckCircle,
  XCircle, Clock, AlertTriangle, Users, Eye, X,
  Ship, Plane, Building, MapPin, Car, Bus, Package
} from 'lucide-react';

/* ── 타입 정의 ─────────────────────────────── */
interface ServiceReservation {
  re_id: string;
  re_type: string;
  re_status: string;
}

interface ReservationItem {
  re_quote_id: string | null;
  re_created_at: string;
  users: {
    id: string;
    name: string;
    email: string;
    phone: string;
    english_name?: string;
  } | null;
  quote: { title: string } | null;
  services: ServiceReservation[];
}

interface DetailField {
  label: string;
  value: any;
}

interface DetailServiceItem {
  type: string;
  label: string;
  sublabel?: string;
  date?: string;
  guest?: number;
  price?: number;
  feeSummary?: string[];
  fields: DetailField[];
}

type BulkAction = 'approve' | 'confirm' | 'cancel' | 'delete' | 'status_update';
type SortType = 'date' | 'name';

/* ── 메인 컴포넌트 ──────────────────────────── */
export default function ReservationsPage() {
  const [reservations, setReservations] = useState<ReservationItem[]>([]);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'confirmed' | 'cancelled'>('pending');
  const [serviceFilter, setServiceFilter] = useState('all');
  const [bulkAction, setBulkAction] = useState<BulkAction>('approve');
  const [newStatus, setNewStatus] = useState('approved');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchTrigger, setSearchTrigger] = useState(0);
  const [sortType, setSortType] = useState<SortType>('date');

  // 상세보기 모달
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<ReservationItem | null>(null);
  const [detailServices, setDetailServices] = useState<DetailServiceItem[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailProcessing, setDetailProcessing] = useState(false);

  useEffect(() => { loadReservations(); }, [filter, serviceFilter, searchTrigger, sortType]);

  /* ── 예약 로드 ────────────────────────────── */
  const loadReservations = async () => {
    try {
      setLoading(true);

      // DB 레벨 필터: Supabase 기본 1000행 제한 대응
      const typeMap: Record<string, string[]> = {
        cruise: ['cruise'], airport: ['airport'], hotel: ['hotel'],
        tour: ['tour'], rentcar: ['rentcar'], vehicle: ['car'],
        sht: ['sht', 'car_sht', 'reservation_car_sht'], package: ['package'],
      };
      const matchTypes = serviceFilter !== 'all' ? (typeMap[serviceFilter] || [serviceFilter]) : null;
      const PAGE_SIZE = 1000;
      const MAX_PAGES = 100;
      const allRows: any[] = [];

      // 상태/타입을 DB에서 먼저 필터링 후 range 페이지 조회로 누락 없이 수집
      for (let page = 0; page < MAX_PAGES; page++) {
        const from = page * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;

        let query = supabase
          .from('reservation')
          .select('re_id, re_type, re_status, re_created_at, re_quote_id, re_user_id')
          .order('re_created_at', { ascending: false })
          .order('re_id', { ascending: false })
          .range(from, to);

        if (filter !== 'all') query = query.eq('re_status', filter);
        if (matchTypes) query = query.in('re_type', matchTypes);

        const { data: pageRows, error: err } = await query;
        if (err) throw err;

        const chunk = pageRows || [];
        allRows.push(...chunk);
        if (chunk.length < PAGE_SIZE) break;
      }

      // 사용자 정보 조회
      const userIds = [...new Set(allRows.map(r => r.re_user_id).filter(Boolean))];
      let usersData: any[] = [];
      if (userIds.length > 0) {
        const CHUNK = 50;
        for (let i = 0; i < userIds.length; i += CHUNK) {
          const chunk = userIds.slice(i, i + CHUNK);
          const { data } = await supabase.from('users').select('id, name, email, phone_number, english_name').in('id', chunk);
          usersData = usersData.concat(data || []);
        }
      }
      const userMap = new Map(usersData.map(u => [u.id, u]));

      // 견적 정보
      const quoteIds = [...new Set(allRows.map(r => r.re_quote_id).filter(Boolean))];
      let quotesData: any[] = [];
      if (quoteIds.length > 0) {
        const CHUNK = 50;
        for (let i = 0; i < quoteIds.length; i += CHUNK) {
          const chunk = quoteIds.slice(i, i + CHUNK);
          const { data } = await supabase.from('quote').select('id, title').in('id', chunk);
          quotesData = quotesData.concat(data || []);
        }
      }
      const quoteMap = new Map(quotesData.map(q => [q.id, q]));

      // 그룹화
      const grouped: Record<string, ReservationItem> = {};
      allRows.forEach(r => {
        const key = r.re_quote_id || r.re_id;
        const user = r.re_user_id ? userMap.get(r.re_user_id) : null;
        if (!grouped[key]) {
          grouped[key] = {
            re_quote_id: r.re_quote_id,
            re_created_at: r.re_created_at,
            users: user ? {
              id: user.id,
              name: user.name || user.email?.split('@')[0] || '알 수 없음',
              email: user.email || '',
              phone: user.phone_number || '',
              english_name: user.english_name,
            } : null,
            quote: r.re_quote_id ? quoteMap.get(r.re_quote_id) || null : null,
            services: [],
          };
        }
        grouped[key].services.push({ re_id: r.re_id, re_type: r.re_type, re_status: r.re_status });
      });

      let list = Object.values(grouped);

      // DB에서 이미 필터링됨 - 빈 그룹만 제거
      list = list.filter(item => item.services.length > 0);

      // 정렬
      list.sort((a, b) => {
        if (sortType === 'date') {
          return new Date(b.re_created_at).getTime() - new Date(a.re_created_at).getTime();
        }
        const nameA = (a.users?.name || '').toLowerCase();
        const nameB = (b.users?.name || '').toLowerCase();
        return nameA < nameB ? -1 : nameA > nameB ? 1 :
          new Date(b.re_created_at).getTime() - new Date(a.re_created_at).getTime();
      });

      // 검색 필터
      const q = searchQuery.trim().toLowerCase();
      if (q) {
        list = list.filter(item =>
          (item.users?.name?.toLowerCase().includes(q)) ||
          (item.users?.email?.toLowerCase().includes(q)) ||
          (item.quote?.title?.toLowerCase().includes(q)) ||
          (item.services.some(s => s.re_id.toLowerCase().includes(q)))
        );
      }

      setReservations(list);
      setSelectedItems(new Set());
      setError(null);
    } catch (err: any) {
      setError('예약 목록을 불러오지 못했습니다.');
      setReservations([]);
    } finally {
      setLoading(false);
    }
  };

  /* ── 선택 ────────────────────────────────── */
  const handleSelectAll = () => {
    const allIds = reservations.flatMap(r => r.services.map(s => s.re_id));
    const allSelected = allIds.every(id => selectedItems.has(id));
    setSelectedItems(allSelected ? new Set() : new Set(allIds));
  };

  /* ── 일괄 처리 ──────────────────────────── */
  const handleBulkAction = async () => {
    if (selectedItems.size === 0) return alert('처리할 항목을 선택해주세요.');
    const actionText = {
      approve: '승인',
      confirm: '확정',
      cancel: '취소',
      delete: '삭제',
      status_update: '상태 변경',
    }[bulkAction];
    if (!confirm(`선택한 ${selectedItems.size}건을 ${actionText} 처리하시겠습니까?`)) return;

    setProcessing(true);
    try {
      const ids = [...selectedItems];
      const BATCH = 100;

      for (let i = 0; i < ids.length; i += BATCH) {
        const batch = ids.slice(i, i + BATCH);
        let result;
        switch (bulkAction) {
          case 'approve':
            result = await supabase.from('reservation').update({ re_status: 'approved' }).in('re_id', batch);
            break;
          case 'confirm':
            result = await supabase.from('reservation').update({ re_status: 'confirmed' }).in('re_id', batch);
            break;
          case 'cancel':
            result = await supabase.from('reservation').update({ re_status: 'cancelled' }).in('re_id', batch);
            break;
          case 'delete':
            result = await supabase.from('reservation').delete().in('re_id', batch);
            break;
          case 'status_update':
            result = await supabase.from('reservation').update({ re_status: newStatus }).in('re_id', batch);
            break;
        }
        if (result?.error) throw new Error(result.error.message);
      }

      // 확정 처리 시 결제 레코드 생성
      if (bulkAction === 'confirm') {
        await createPaymentRecords(ids);
      }

      alert(`${selectedItems.size}건이 ${actionText} 처리되었습니다.`);
      setSelectedItems(new Set());
      await loadReservations();
    } catch (err: any) {
      alert(`오류: ${err.message}`);
    } finally {
      setProcessing(false);
    }
  };

  const getNextStatus = (status: string): 'approved' | 'confirmed' | null => {
    if (status === 'pending') return 'approved';
    if (status === 'approved') return 'confirmed';
    return null;
  };

  const handleDetailProcess = async () => {
    if (!detailItem) return;

    const updates = detailItem.services
      .map((s) => ({ id: s.re_id, nextStatus: getNextStatus(s.re_status) }))
      .filter((s): s is { id: string; nextStatus: 'approved' | 'confirmed' } => !!s.nextStatus);

    if (updates.length === 0) {
      alert('처리 가능한 상태(대기/승인)가 없습니다.');
      return;
    }

    if (!confirm(`상세 예약 ${updates.length}건을 처리하시겠습니까?\n(대기→승인, 승인→확정)`)) return;

    setDetailProcessing(true);
    try {
      const approvedIds = updates.filter((u) => u.nextStatus === 'approved').map((u) => u.id);
      const confirmedIds = updates.filter((u) => u.nextStatus === 'confirmed').map((u) => u.id);

      if (approvedIds.length > 0) {
        const { error } = await supabase.from('reservation').update({ re_status: 'approved' }).in('re_id', approvedIds);
        if (error) throw new Error(error.message);
      }

      if (confirmedIds.length > 0) {
        const { error } = await supabase.from('reservation').update({ re_status: 'confirmed' }).in('re_id', confirmedIds);
        if (error) throw new Error(error.message);
        await createPaymentRecords(confirmedIds);
      }

      setDetailItem((prev) => {
        if (!prev) return prev;
        const nextMap = new Map(updates.map((u) => [u.id, u.nextStatus]));
        return {
          ...prev,
          services: prev.services.map((svc) => ({
            ...svc,
            re_status: nextMap.get(svc.re_id) || svc.re_status,
          })),
        };
      });

      alert(`${updates.length}건 처리 완료`);
      await loadReservations();
    } catch (err: any) {
      alert(`오류: ${err.message || '상세 처리에 실패했습니다.'}`);
    } finally {
      setDetailProcessing(false);
    }
  };

  /* ── 결제 레코드 생성 ─────────────────── */
  const createPaymentRecords = async (reservationIds: string[]) => {
    try {
      const CHUNK = 100;
      let allRes: any[] = [];
      for (let i = 0; i < reservationIds.length; i += CHUNK) {
        const { data } = await supabase.from('reservation')
          .select('re_id, re_user_id, re_quote_id, re_type, total_amount')
          .in('re_id', reservationIds.slice(i, i + CHUNK));
        allRes = allRes.concat(data || []);
      }

      // 기존 결제 제외
      const existingIds = new Set<string>();
      for (let i = 0; i < reservationIds.length; i += CHUNK) {
        const { data } = await supabase.from('reservation_payment')
          .select('reservation_id')
          .in('reservation_id', reservationIds.slice(i, i + CHUNK));
        (data || []).forEach(p => existingIds.add(p.reservation_id));
      }

      const newRes = allRes.filter(r => !existingIds.has(r.re_id));
      if (newRes.length === 0) return;

      const records = newRes.map(r => ({
        id: crypto.randomUUID(),
        reservation_id: r.re_id,
        quote_id: r.re_quote_id || null,
        user_id: r.re_user_id,
        amount: Number(r.total_amount) || 0,
        payment_method: 'BANK',
        payment_status: 'pending',
        memo: `자동 생성 - ${r.re_type}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));

      for (let i = 0; i < records.length; i += CHUNK) {
        await supabase.from('reservation_payment').insert(records.slice(i, i + CHUNK));
      }
    } catch (err) {
      console.error('결제 레코드 생성 실패:', err);
    }
  };

  /* ── 상세보기 ──────────────────────────── */
  const handleViewDetail = async (reservation: ReservationItem) => {
    setDetailItem(reservation);
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailServices([]);

    try {
      const serviceIds = reservation.services.map(s => s.re_id);
      if (serviceIds.length === 0) return;

      const cruiseIds = reservation.services.filter(s => s.re_type === 'cruise').map(s => s.re_id);
      const carIds = reservation.services.filter(s => s.re_type === 'car').map(s => s.re_id);
      const airportIds = reservation.services.filter(s => s.re_type === 'airport').map(s => s.re_id);
      const hotelIds = reservation.services.filter(s => s.re_type === 'hotel').map(s => s.re_id);
      const tourIds = reservation.services.filter(s => s.re_type === 'tour').map(s => s.re_id);
      const shtIds = reservation.services.filter(s => ['sht', 'car_sht'].includes(s.re_type)).map(s => s.re_id);
      const allCarQueryIds = [...cruiseIds, ...carIds];

      const [
        cruiseRes, cruiseCarRes, airportRes, hotelRes, tourRes, shtRes,
      ] = await Promise.all([
        cruiseIds.length > 0 ? supabase.from('reservation_cruise').select('*').in('reservation_id', cruiseIds) : { data: [] },
        allCarQueryIds.length > 0 ? supabase.from('reservation_cruise_car').select('*').in('reservation_id', allCarQueryIds) : { data: [] },
        airportIds.length > 0 ? supabase.from('reservation_airport').select('*').in('reservation_id', airportIds) : { data: [] },
        hotelIds.length > 0 ? supabase.from('reservation_hotel').select('*').in('reservation_id', hotelIds) : { data: [] },
        tourIds.length > 0 ? supabase.from('reservation_tour').select('*').in('reservation_id', tourIds) : { data: [] },
        shtIds.length > 0 ? supabase.from('reservation_car_sht').select('*').in('reservation_id', shtIds) : { data: [] },
      ]);

      // 가격 정보 조회
      const cruiseCodes = (cruiseRes.data || []).map(r => r.room_price_code).filter(Boolean);
      const cruiseCarPriceCodes = (cruiseCarRes.data || []).map(r => r.car_price_code).filter(Boolean);
      const [roomPrices, carPrices, rentcarPrices] = await Promise.all([
        cruiseCodes.length > 0
          ? supabase
              .from('cruise_rate_card')
              .select('id, cruise_name, room_type, schedule_type, price_adult, price_child, price_child_extra_bed, price_infant, price_extra_bed, price_single')
              .in('id', cruiseCodes)
          : { data: [] },
        cruiseCarPriceCodes.length > 0
          ? supabase.from('car_price').select('car_code, price, car_type, cruise, car_category').in('car_code', cruiseCarPriceCodes)
          : { data: [] },
        cruiseCarPriceCodes.length > 0
          ? supabase.from('rentcar_price').select('rentcar_code, vehicle_type, price').in('rentcar_code', cruiseCarPriceCodes)
          : { data: [] },
      ]);
      const roomPriceMap = new Map((roomPrices.data || []).map(r => [r.id, r]));
      const carPriceMap = new Map((carPrices.data || []).map(r => [r.car_code, r]));
      const rentcarPriceMap = new Map((rentcarPrices.data || []).map((r: any) => [r.rentcar_code, r]));

      const details: DetailServiceItem[] = [];

      (cruiseRes.data || []).forEach(r => {
        const info = roomPriceMap.get(r.room_price_code);
        let feeSummary = [
          formatLinePrice('성인', info?.price_adult, r.adult_count),
          formatLinePrice('아동', info?.price_child, r.child_count),
          formatLinePrice('유아', info?.price_infant, r.infant_count),
          formatLinePrice('아동 엑스트라', info?.price_child_extra_bed, r.child_extra_bed_count),
          formatLinePrice('엑스트라', info?.price_extra_bed, r.extra_bed_count),
          formatLinePrice('싱글', info?.price_single, r.single_count),
        ].filter(Boolean) as string[];

        if (feeSummary.length === 0 && Number(r.room_total_price || 0) > 0) {
          feeSummary = [`총액 ${formatDong(Number(r.room_total_price))}`];
        }

        details.push({
          type: 'cruise',
          label: info?.cruise_name || '크루즈',
          sublabel: info?.room_type || '',
          date: r.checkin,
          guest: r.guest_count,
          price: r.room_total_price,
          feeSummary,
          fields: [
            { label: '일정', value: info?.schedule_type },
            { label: '체크인', value: r.checkin },
            { label: '객실수', value: r.room_count },
            { label: '총 인원수', value: r.guest_count },
            { label: '성인', value: r.adult_count },
            { label: '아동', value: r.child_count },
            { label: '유아', value: r.infant_count },
            { label: '아동 엑스트라', value: r.child_extra_bed_count },
            { label: '엑스트라', value: r.extra_bed_count },
            { label: '싱글', value: r.single_count },
            { label: '객실 총 금액', value: r.room_total_price },
            { label: '요청사항', value: r.request_note },
          ],
        });
      });
      (cruiseCarRes.data || []).forEach(r => {
        const rentcarInfo = rentcarPriceMap.get(r.car_price_code);
        const carInfo = carPriceMap.get(r.car_price_code);
        const vehicleType = rentcarInfo?.vehicle_type || carInfo?.car_type;
        const unitPrice = rentcarInfo?.price || carInfo?.price || calculateUnitPrice(r.car_total_price, (r.car_count || r.passenger_count || 0));
        const quantity = Number(r.car_count || 0) > 0 ? Number(r.car_count || 0) : Number(r.passenger_count || 0);
        const quantityLabel = Number(r.car_count || 0) > 0 ? '대' : '명';
        const routeText = [r.pickup_location, r.dropoff_location].filter(Boolean).join(' → ');

        const vehicleFeeSummary = [formatGenericPrice(unitPrice, quantity, quantityLabel)].filter(Boolean) as string[];
        if (vehicleFeeSummary.length === 0 && Number(r.car_total_price || 0) > 0) {
          vehicleFeeSummary.push(`총액 ${formatDong(Number(r.car_total_price))}`);
        }

        details.push({
          type: 'vehicle',
          label: '크루즈 차량',
          // 요청사항: 카드 하단 첫 줄은 경로 대신 차종을 표시
          sublabel: vehicleType || '',
          date: r.pickup_datetime,
          price: r.car_total_price,
          feeSummary: vehicleFeeSummary,
          fields: [
            { label: '크루즈', value: carInfo?.cruise },
            { label: '차량명', value: vehicleType },
            { label: '카테고리', value: carInfo?.car_category },
            { label: '경로', value: routeText },
            { label: '차량 수', value: r.car_count },
            { label: '승객 수', value: r.passenger_count },
            { label: '픽업 장소', value: r.pickup_location },
            { label: '하차 장소', value: r.dropoff_location },
            { label: '픽업 일시', value: r.pickup_datetime },
            { label: '차량 총 금액', value: r.car_total_price },
            { label: '요청사항', value: r.request_note },
          ],
        });
      });
      (airportRes.data || []).forEach(r => {
        const quantity = Number(r.ra_passenger_count || 0) > 0 ? Number(r.ra_passenger_count || 0) : Number(r.ra_car_count || 0);
        const unitPrice = calculateUnitPrice(r.total_price, quantity);
        const feeSummary = [formatGenericPrice(unitPrice, quantity, Number(r.ra_passenger_count || 0) > 0 ? '명' : '대')].filter(Boolean) as string[];
        if (feeSummary.length === 0 && Number(r.total_price || 0) > 0) {
          feeSummary.push(`총액 ${formatDong(Number(r.total_price))}`);
        }
        details.push({
          type: 'airport',
          label: '공항',
          sublabel: `${r.ra_airport_location || ''} / ${r.ra_flight_number || ''}`,
          date: r.ra_datetime ? new Date(r.ra_datetime).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' }) : '',
          guest: r.ra_passenger_count,
          price: r.total_price,
          feeSummary,
          fields: [
            { label: '구분', value: r.way_type || r.ra_way_type },
            { label: '일시', value: r.ra_datetime },
            { label: '인원', value: r.ra_passenger_count },
            { label: '차량수', value: r.ra_car_count },
            { label: '수하물', value: r.ra_luggage_count },
            { label: '항공편', value: r.ra_flight_number },
            { label: '공항 위치', value: r.ra_airport_location },
            { label: '숙소 정보', value: r.accommodation_info },
            { label: '요청사항', value: r.request_note },
          ],
        });
      });
      (hotelRes.data || []).forEach(r => {
        const quantity = Number(r.room_count || 0) > 0 ? Number(r.room_count || 0) : Number(r.guest_count || 0);
        const unitPrice = calculateUnitPrice(r.total_price, quantity);
        const feeSummary = [formatGenericPrice(unitPrice, quantity, Number(r.room_count || 0) > 0 ? '객실' : '명')].filter(Boolean) as string[];
        if (feeSummary.length === 0 && Number(r.total_price || 0) > 0) {
          feeSummary.push(`총액 ${formatDong(Number(r.total_price))}`);
        }
        details.push({
          type: 'hotel',
          label: '호텔',
          sublabel: r.hotel_category || '',
          date: r.checkin_date,
          guest: r.guest_count,
          price: r.total_price,
          feeSummary,
          fields: [
            { label: '호텔 카테고리', value: r.hotel_category },
            { label: '체크인', value: r.checkin_date },
            { label: '숙박일수', value: r.nights },
            { label: '객실수', value: r.room_count },
            { label: '투숙객', value: r.guest_count },
            { label: '총 금액', value: r.total_price },
            { label: '요청사항', value: r.request_note },
          ],
        });
      });
      (tourRes.data || []).forEach(r => {
        const quantity = Number(r.tour_capacity || 0);
        const unitPrice = calculateUnitPrice(r.total_price, quantity);
        const feeSummary = [formatGenericPrice(unitPrice, quantity, '명')].filter(Boolean) as string[];
        if (feeSummary.length === 0 && Number(r.total_price || 0) > 0) {
          feeSummary.push(`총액 ${formatDong(Number(r.total_price))}`);
        }
        details.push({
          type: 'tour',
          label: '투어',
          sublabel: '',
          date: r.usage_date,
          guest: r.tour_capacity,
          price: r.total_price,
          feeSummary,
          fields: [
            { label: '사용일', value: r.usage_date },
            { label: '인원', value: r.tour_capacity },
            { label: '픽업 위치', value: r.pickup_location },
            { label: '하차 위치', value: r.dropoff_location },
            { label: '총 금액', value: r.total_price },
            { label: '요청사항', value: r.request_note },
          ],
        });
      });
      (shtRes.data || []).forEach(r => {
        const quantity = 1;
        const unitPrice = calculateUnitPrice(r.car_total_price, quantity);
        const feeSummary = [formatGenericPrice(unitPrice, quantity, '건')].filter(Boolean) as string[];
        if (feeSummary.length === 0 && Number(r.car_total_price || 0) > 0) {
          feeSummary.push(`총액 ${formatDong(Number(r.car_total_price))}`);
        }
        details.push({
          type: 'sht',
          label: '스하차량',
          sublabel: `${r.vehicle_number || ''} / ${r.seat_number || ''}`,
          date: r.usage_date,
          price: r.car_total_price,
          feeSummary,
          fields: [
            { label: '탑승일', value: r.usage_date },
            { label: '차량번호', value: r.vehicle_number },
            { label: '좌석번호', value: r.seat_number },
            { label: '구분', value: r.service_type },
            { label: '카테고리', value: r.category },
            { label: '색상', value: r.color_label },
            { label: '탑승자명', value: r.name },
            { label: '총 금액', value: r.car_total_price },
            { label: '요청사항', value: r.request_note },
          ],
        });
      });

      setDetailServices(details);
    } catch (err) {
      console.error('상세 로드 실패:', err);
    } finally {
      setDetailLoading(false);
    }
  };

  /* ── 유틸 함수 ──────────────────────────── */
  const getStatusText = (s: string) => ({
    pending: '대기중',
    approved: '승인',
    confirmed: '확정',
    cancelled: '취소됨',
  }[s] || s);
  const getStatusColor = (s: string) => ({
    approved: 'bg-blue-100 text-blue-700',
    confirmed: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-700',
  }[s] || 'bg-yellow-100 text-yellow-700');
  const getStatusIcon = (s: string) => ({
    approved: <CheckCircle className="w-3.5 h-3.5 text-blue-600" />,
    confirmed: <CheckCircle className="w-3.5 h-3.5 text-green-600" />,
    cancelled: <XCircle className="w-3.5 h-3.5 text-red-600" />,
  }[s] || <Clock className="w-3.5 h-3.5 text-yellow-600" />);

  const getTypeIcon = (type: string) => {
    const map: Record<string, React.ReactNode> = {
      cruise: <Ship className="w-3.5 h-3.5 text-blue-600" />,
      airport: <Plane className="w-3.5 h-3.5 text-green-600" />,
      hotel: <Building className="w-3.5 h-3.5 text-purple-600" />,
      tour: <MapPin className="w-3.5 h-3.5 text-orange-600" />,
      rentcar: <Car className="w-3.5 h-3.5 text-red-600" />,
      car: <Car className="w-3.5 h-3.5 text-cyan-600" />,
      vehicle: <Car className="w-3.5 h-3.5 text-cyan-600" />,
      sht: <Bus className="w-3.5 h-3.5 text-indigo-600" />,
      car_sht: <Bus className="w-3.5 h-3.5 text-indigo-600" />,
      package: <Package className="w-3.5 h-3.5 text-pink-600" />,
    };
    return map[type] || <Clock className="w-3.5 h-3.5 text-gray-600" />;
  };

  const getTypeName = (type: string) => ({
    cruise: '크루즈', airport: '공항', hotel: '호텔', tour: '투어',
    rentcar: '렌터카', car: '크루즈 차량', vehicle: '크루즈 차량',
    sht: '스하차량', car_sht: '스하차량', package: '패키지',
  }[type] || type);

  const getTypeBadge = (type: string) => ({
    cruise: 'bg-blue-100 text-blue-700', airport: 'bg-green-100 text-green-700',
    hotel: 'bg-purple-100 text-purple-700', tour: 'bg-orange-100 text-orange-700',
    rentcar: 'bg-red-100 text-red-700', car: 'bg-cyan-100 text-cyan-700',
    vehicle: 'bg-cyan-100 text-cyan-700', sht: 'bg-indigo-100 text-indigo-700',
    car_sht: 'bg-indigo-100 text-indigo-700', package: 'bg-pink-100 text-pink-700',
  }[type] || 'bg-gray-100 text-gray-700');

  const hasValue = (value: any) => {
    if (value === undefined || value === null) return false;
    if (typeof value === 'number') return value !== 0;
    const str = String(value).trim();
    if (str === '' || str === '0' || str === '0명' || str === '0대' || str === '0객실') return false;
    return true;
  };

  const detailProcessInfo = useMemo(() => {
    if (!detailItem) return { count: 0, label: '처리' };
    const pendingCount = detailItem.services.filter((s) => s.re_status === 'pending').length;
    const approvedCount = detailItem.services.filter((s) => s.re_status === 'approved').length;
    const count = pendingCount + approvedCount;

    if (count === 0) return { count, label: '처리 불가' };
    if (pendingCount > 0 && approvedCount > 0) return { count, label: '승인/확정 처리' };
    if (pendingCount > 0) return { count, label: '승인 처리' };
    return { count, label: '확정 처리' };
  }, [detailItem]);

  /* ── UI ──────────────────────────────────── */
  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* 헤더 */}
      <div className="bg-white border-b shadow-sm px-2 py-2">
        <div className="flex items-center gap-2 mb-2">
          <Link href="/" className="p-1.5 rounded-lg hover:bg-gray-100">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </Link>
          <h1 className="text-base font-bold text-gray-800 flex-1">⚡ 예약 처리</h1>
          <button onClick={loadReservations} className="p-2 rounded-lg bg-blue-500 text-white hover:bg-blue-600">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* 필터 */}
        <div className="space-y-1">
          <div className="flex gap-1">
            <Select value={sortType} onChange={e => setSortType(e.target.value as SortType)} label="정렬"
              options={[['date', '예약일순'], ['name', '고객명순']]} />
            <Select value={filter} onChange={e => setFilter(e.target.value as any)} label="상태"
              options={[[ 'all', '전체'], ['pending', '대기중'], ['approved', '승인'], ['confirmed', '확정'], ['cancelled', '취소']]} />
            <Select value={serviceFilter} onChange={e => setServiceFilter(e.target.value)} label="서비스"
              options={[['all', '전체'], ['cruise', '크루즈'], ['airport', '공항'], ['hotel', '호텔'],
                ['tour', '투어'], ['rentcar', '렌터카'], ['vehicle', '차량'], ['sht', '스하차량'], ['package', '패키지']]} />
          </div>

          {/* 검색 & 일괄 처리 (1행) */}
          <div className="flex gap-1 items-end">
            <form onSubmit={e => { e.preventDefault(); setSearchTrigger(v => v + 1); }} className="flex gap-1 flex-1">
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="이름검색..."
                className="flex-1 px-2 py-1.5 text-xs border rounded-lg bg-gray-50"
              />
              <button type="submit" className="px-3 py-1.5 bg-blue-500 text-white rounded-lg text-xs font-medium">검색</button>
            </form>

            {/* 일괄 처리 */}
            <div className="flex gap-1 items-center">
              <Select value={bulkAction} onChange={e => setBulkAction(e.target.value as BulkAction)} label=""
                options={[[ 'approve', '승인'], ['confirm', '확정'], ['cancel', '취소'], ['status_update', '상태변경'], ['delete', '삭제']]} />
              {bulkAction === 'status_update' && (
                <Select value={newStatus} onChange={e => setNewStatus(e.target.value)} label=""
                  options={[[ 'pending', '대기중'], ['approved', '승인'], ['confirmed', '확정'], ['cancelled', '취소']]} />
              )}
              <button
                onClick={handleBulkAction}
                disabled={selectedItems.size === 0 || processing}
                className={`px-2 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${
                  selectedItems.size === 0 ? 'bg-gray-300 text-gray-500' :
                  bulkAction === 'delete' ? 'bg-red-500 text-white' : 'bg-green-500 text-white'
                }`}
              >
                {processing ? '처리중...' : `${selectedItems.size}건 처리`}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 에러 */}
      {error && (
        <div className="mx-2 mt-2 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-xs">
          ⚠️ {error}
        </div>
      )}

      {/* 삭제 경고 */}
      {bulkAction === 'delete' && selectedItems.size > 0 && (
        <div className="mx-2 mt-2 bg-red-50 border border-red-200 px-3 py-2 rounded-lg flex items-center gap-2 text-red-700 text-xs">
          <AlertTriangle className="w-4 h-4" />
          <span>삭제된 예약은 복구할 수 없습니다.</span>
        </div>
      )}

      {/* 콘텐츠 */}
      <div className="px-2 py-2">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
            <p className="mt-4 text-sm text-gray-500">예약 목록을 불러오는 중...</p>
          </div>
        ) : reservations.length === 0 ? (
          <div className="text-center py-20">
            <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">
              {filter === 'all' ? '예약이 없습니다' : `${getStatusText(filter)} 예약이 없습니다`}
            </p>
          </div>
        ) : (
          <>
            {/* 전체 선택 */}
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-gray-500">총 {reservations.length}건 / 선택 {selectedItems.size}건</p>
              <button onClick={handleSelectAll} className="flex items-center gap-1 text-sm text-gray-600">
                {reservations.flatMap(r => r.services.map(s => s.re_id)).every(id => selectedItems.has(id))
                  ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                전체 선택
              </button>
            </div>

            {/* 예약 목록 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {reservations.map(reservation => {
                const allIds = reservation.services.map(s => s.re_id);
                const isSelected = allIds.some(id => selectedItems.has(id));

                return (
                  <div
                    key={reservation.re_quote_id || allIds[0]}
                    onClick={() => handleViewDetail(reservation)}
                    className={`bg-white rounded-xl shadow-sm p-4 transition-all cursor-pointer hover:shadow-md hover:bg-blue-50 ${
                      isSelected ? 'ring-2 ring-blue-300' : 'border border-gray-100'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {/* 체크박스 */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const newSet = new Set(selectedItems);
                          allIds.forEach(id => isSelected ? newSet.delete(id) : newSet.add(id));
                          setSelectedItems(newSet);
                        }}
                        className="mt-1 p-0.5"
                      >
                        {isSelected
                          ? <CheckSquare className="w-5 h-5 text-blue-600" />
                          : <Square className="w-5 h-5 text-gray-400" />}
                      </button>

                      <div className="flex-1 min-w-0">
                        {/* 서비스 배지 */}
                        <div className="flex flex-wrap gap-1 mb-2">
                          {reservation.services.map((s, i) => (
                            <span key={i} className={`text-xs px-2 py-0.5 rounded-full flex items-center gap-1 font-medium ${getTypeBadge(s.re_type)}`}>
                              {getTypeIcon(s.re_type)}
                              {getTypeName(s.re_type)}
                            </span>
                          ))}
                        </div>

                        {/* 고객 정보 */}
                        <div className="space-y-1 mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500">고객명:</span>
                            <span className="font-semibold text-gray-800">{reservation.users?.name || 'N/A'}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500">영문:</span>
                            <span className="text-sm text-gray-600">
                              {reservation.users?.english_name || reservation.users?.email?.split('@')[0] || 'N/A'}
                            </span>
                          </div>
                        </div>

                        {/* 하단 */}
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-400">
                            {new Date(reservation.re_created_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}
                          </span>
                          <span className="text-xs text-gray-400">{reservation.services.length}개 서비스</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* 상세 모달 */}
      {detailOpen && detailItem && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-start justify-center pt-0 sm:pt-2 bg-black/40" onClick={() => setDetailOpen(false)}>
          <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[95vh] sm:max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b px-4 py-3 flex items-center justify-between">
              <h2 className="font-bold text-gray-800">예약 상세</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDetailProcess}
                  disabled={detailLoading || detailProcessing || detailProcessInfo.count === 0}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${
                    detailLoading || detailProcessing || detailProcessInfo.count === 0
                      ? 'bg-gray-300 text-gray-500'
                      : 'bg-green-500 text-white'
                  }`}
                >
                  {detailProcessing ? '처리중...' : `${detailProcessInfo.label} (${detailProcessInfo.count})`}
                </button>
                <button onClick={() => setDetailOpen(false)} className="p-1 rounded-full hover:bg-gray-100">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-4 space-y-4">
              {/* 고객 정보 */}
              <div className="bg-gray-50 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-gray-600 mb-2">고객 정보</h3>
                <p className="font-bold text-lg text-gray-800">{detailItem.users?.name || 'N/A'}</p>
                {detailItem.users?.english_name && (
                  <p className="text-sm text-gray-500">{detailItem.users.english_name}</p>
                )}
                <p className="text-sm text-gray-500">{detailItem.users?.email || ''}</p>
              </div>

              {/* 서비스 목록 */}
              {detailLoading ? (
                <div className="flex justify-center py-8">
                  <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
                </div>
              ) : detailServices.length === 0 ? (
                <p className="text-center text-sm text-gray-500 py-8">서비스 정보가 없습니다.</p>
              ) : (
                <div className="space-y-3">
                  {detailServices.map((svc, i) => (
                    <div key={i} className="bg-white border rounded-xl p-3 space-y-1">
                      <div className="flex items-center gap-2">
                        {getTypeIcon(svc.type)}
                        <span className="font-semibold text-sm text-gray-800">{svc.label}</span>
                      </div>
                      {svc.sublabel && (
                        <p className="text-sm text-gray-600 ml-6">{svc.sublabel}</p>
                      )}
                      <div className="flex items-center justify-between ml-6">
                        {hasValue(svc.date) && <span className="text-xs text-gray-500">{svc.date}</span>}
                        {hasValue(svc.guest) && <span className="text-xs text-gray-500">👥 {svc.guest}명</span>}
                        {hasValue(svc.price) && Number(svc.price) > 0 && (
                          <span className="text-sm font-semibold text-green-600">
                            {Number(svc.price).toLocaleString()}동
                          </span>
                        )}
                      </div>

                      {svc.feeSummary && svc.feeSummary.length > 0 && (
                        <div className="mt-2 ml-6 rounded-lg bg-amber-50 border border-amber-200 p-2">
                          <div className="text-[11px] font-semibold text-amber-800 mb-1">요금 내역</div>
                          <div className="space-y-1">
                            {svc.feeSummary.map((line, idx) => (
                              <div key={`${svc.type}-fee-${idx}`} className="text-xs text-amber-900">
                                {line}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {svc.fields && svc.fields.length > 0 && (
                        <div className="mt-2 ml-6 border-t pt-2 grid grid-cols-1 gap-1">
                          {svc.fields
                            .filter((f) => hasValue(f.value))
                            .filter((f) => /요청사항|특별요청|추가사항|메모|노트/i.test(f.label))
                            .map((f, idx) => (
                              <div key={`${f.label}-${idx}`} className="flex items-start justify-between gap-2">
                                <span className="text-xs text-gray-500">{f.label}</span>
                                <span className="text-xs text-gray-700 text-right break-all">
                                  {typeof f.value === 'number' && /금액/.test(f.label)
                                    ? `${Number(f.value).toLocaleString()}동`
                                    : String(f.value)}
                                </span>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatDong(value: number) {
  return `${Number(value).toLocaleString()}동`;
}

function formatLinePrice(label: string, unitPrice?: number, count?: number) {
  if (!unitPrice || !count) return null;
  return `${label} ${formatDong(unitPrice)} × ${count}명`;
}

function calculateUnitPrice(total?: number, quantity?: number) {
  if (!total || !quantity) return null;
  return Math.round(Number(total) / Number(quantity));
}

function formatGenericPrice(unitPrice?: number | null, quantity?: number, unitLabel: string = '명') {
  if (!unitPrice || !quantity) return null;
  return `${formatDong(unitPrice)} × ${quantity}${unitLabel}`;
}

/* ── Select 컴포넌트 ─── */
function Select({ value, onChange, label, options }: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  label: string;
  options: [string, string][];
}) {
  return (
    <div className="flex-1">
      {label && <label className="block text-xs text-gray-500 mb-0.5">{label}</label>}
      <select value={value} onChange={onChange} className="w-full px-2 py-1.5 text-xs border rounded-lg bg-white">
        {options.map(([val, txt]) => (
          <option key={val} value={val}>{txt}</option>
        ))}
      </select>
    </div>
  );
}
