// @ts-nocheck
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabase';
import {
  CheckSquare, Square, ArrowLeft,
  Clock, AlertTriangle, Users,
  Ship, Plane, Building, MapPin, Car, Bus, Package, Home
} from 'lucide-react';
import ReservationDetailModal from '@/components/ReservationDetailModal';
import { fetchPromotionSequenceMap } from '@/lib/promotionSequence';

/* ── 타입 정의 ─────────────────────────────── */
interface ServiceReservation {
  re_id: string;
  re_type: string;
  re_status: string;
  price_breakdown?: Record<string, any> | null;
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
  hasPromotion: boolean;
  promotionSequence?: number | null;
}

function hasPromotionBreakdown(value: any): boolean {
  if (!value) return false;
  if (value.promotion_code) return true;
  if (Array.isArray(value.applied_promotions) && value.applied_promotions.length > 0) return true;
  return Array.isArray(value.room_selections) && value.room_selections.some((item: any) => !!item?.promotion_code);
}

type BulkAction = 'approve' | 'confirm' | 'cancel' | 'delete' | 'status_update';
type SortType = 'date' | 'name';

/* ── 메인 컴포넌트 ──────────────────────────── */
export default function ReservationsPage() {
  const router = useRouter();
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
  const [emailReservationCountMap, setEmailReservationCountMap] = useState<Record<string, number>>({});

  // 상세보기 모달
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<ReservationItem | null>(null);
  const [detailModalItem, setDetailModalItem] = useState<any | null>(null);
  const [detailModalItems, setDetailModalItems] = useState<any[]>([]);
  const [detailModalTitle, setDetailModalTitle] = useState('예약 통합 상세');
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
          .select('re_id, re_type, re_status, re_created_at, re_quote_id, re_user_id, price_breakdown')
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

      const reservationCountByEmail: Record<string, number> = {};
      if (userIds.length > 0) {
        try {
          const CHUNK = 100;
          const countByUserId: Record<string, number> = {};
          for (let i = 0; i < userIds.length; i += CHUNK) {
            const chunk = userIds.slice(i, i + CHUNK);
            const { data: allReservations } = await supabase
              .from('reservation')
              .select('re_id, re_user_id')
              .in('re_user_id', chunk)
              .neq('re_type', 'car_sht');

            (allReservations || []).forEach((row: any) => {
              const uid = String(row.re_user_id || '');
              if (!uid) return;
              countByUserId[uid] = (countByUserId[uid] || 0) + 1;
            });
          }

          (usersData || []).forEach((u: any) => {
            const email = String(u?.email || '').trim().toLowerCase();
            if (!email) return;
            const uid = String(u?.id || '');
            reservationCountByEmail[email] = (reservationCountByEmail[email] || 0) + (countByUserId[uid] || 0);
          });
        } catch (countErr) {
        }
      }
      setEmailReservationCountMap(reservationCountByEmail);

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

      // 그룹화: 이메일이 있으면 이메일 기준으로 묶고, 없으면 견적/예약 ID 기준으로 묶음
      const grouped: Record<string, ReservationItem> = {};
      allRows.forEach(r => {
        const user = r.re_user_id ? userMap.get(r.re_user_id) : null;
        const normalizedEmail = (user?.email || '').trim().toLowerCase();
        const key = normalizedEmail
          ? `email:${normalizedEmail}`
          : (r.re_quote_id ? `quote:${r.re_quote_id}` : `res:${r.re_id}`);

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
            hasPromotion: false,
          };
        } else {
          if (!grouped[key].users && user) {
            grouped[key].users = {
              id: user.id,
              name: user.name || user.email?.split('@')[0] || '알 수 없음',
              email: user.email || '',
              phone: user.phone_number || '',
              english_name: user.english_name,
            };
          }

          if (
            grouped[key].re_quote_id &&
            r.re_quote_id &&
            grouped[key].re_quote_id !== r.re_quote_id
          ) {
            grouped[key].re_quote_id = null;
            grouped[key].quote = null;
          }
        }

        grouped[key].services.push({ re_id: r.re_id, re_type: r.re_type, re_status: r.re_status, price_breakdown: r.price_breakdown || null });
        grouped[key].hasPromotion = grouped[key].hasPromotion || hasPromotionBreakdown(r.price_breakdown);
      });

      let list = Object.values(grouped);

      // DB에서 이미 필터링됨 - 빈 그룹만 제거
      list = list.filter(item => item.services.length > 0);

      // 프로모션 카운터(몇 번째 예약) 계산
      try {
        const promoReIds = list.flatMap((item) =>
          item.services.filter((s) => hasPromotionBreakdown(s.price_breakdown)).map((s) => s.re_id)
        );
        if (promoReIds.length > 0) {
          const seqMap = await fetchPromotionSequenceMap(promoReIds);
          if (seqMap.size > 0) {
            list.forEach((item) => {
              const seqs = item.services
                .map((s) => seqMap.get(s.re_id))
                .filter((v): v is number => typeof v === 'number');
              if (seqs.length > 0) item.promotionSequence = Math.min(...seqs);
            });
          }
        }
      } catch (seqErr) {
      }

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
  const handleViewDetail = async (
    reservation: ReservationItem,
    targetServices?: ServiceReservation[],
    modalTitle: string = '예약 통합 상세'
  ) => {
    setDetailItem(reservation);
    setDetailModalTitle(modalTitle);
    setDetailLoading(true);
    setDetailModalItems([]);
    setDetailModalItem(null);

    try {
      const serviceRows = targetServices && targetServices.length > 0 ? targetServices : reservation.services;
      const serviceIds = serviceRows.map(s => s.re_id).filter(Boolean);
      if (serviceIds.length === 0) {
        setDetailOpen(true);
        return;
      }

      const cruiseIds = serviceRows.filter(s => s.re_type === 'cruise').map(s => s.re_id);
      const carIds = serviceRows.filter(s => ['car', 'cruise'].includes(s.re_type)).map(s => s.re_id);
      const airportIds = serviceRows.filter(s => s.re_type === 'airport').map(s => s.re_id);
      const hotelIds = serviceRows.filter(s => s.re_type === 'hotel').map(s => s.re_id);
      const tourIds = serviceRows.filter(s => s.re_type === 'tour').map(s => s.re_id);
      const ticketIds = serviceRows.filter(s => s.re_type === 'ticket').map(s => s.re_id);
      const rentcarIds = serviceRows.filter(s => s.re_type === 'rentcar').map(s => s.re_id);
      const shtIds = serviceRows.filter(s => ['sht', 'car_sht'].includes(s.re_type)).map(s => s.re_id);

      // 서비스 상세 데이터만 조회 (가격 테이블은 모달 내부 enrich에서 처리)
      const [cruiseRes, cruiseCarRes, airportRes, hotelRes, tourRes, ticketRes, rentcarRes, shtRes] = await Promise.all([
        cruiseIds.length > 0 ? supabase.from('reservation_cruise').select('*').in('reservation_id', cruiseIds) : { data: [] },
        carIds.length > 0 ? supabase.from('reservation_cruise_car').select('*').in('reservation_id', carIds) : { data: [] },
        airportIds.length > 0 ? supabase.from('reservation_airport').select('*').in('reservation_id', airportIds) : { data: [] },
        hotelIds.length > 0 ? supabase.from('reservation_hotel').select('*').in('reservation_id', hotelIds) : { data: [] },
        tourIds.length > 0 ? supabase.from('reservation_tour').select('*').in('reservation_id', tourIds) : { data: [] },
        ticketIds.length > 0 ? supabase.from('reservation_ticket').select('*').in('reservation_id', ticketIds) : { data: [] },
        rentcarIds.length > 0 ? supabase.from('reservation_rentcar').select('*').in('reservation_id', rentcarIds) : { data: [] },
        shtIds.length > 0 ? supabase.from('reservation_car_sht').select('*').in('reservation_id', shtIds) : { data: [] },
      ]);

      const statusMap = new Map(serviceRows.map(s => [s.re_id, s.re_status]));
      const typeMap = new Map(serviceRows.map(s => [s.re_id, s.re_type]));

      const baseHeader = {
        source: 'new',
        re_quote_id: reservation.re_quote_id,
        quoteId: reservation.re_quote_id,
        customerName: reservation.users?.name || '',
        customerEnglishName: reservation.users?.english_name || '',
        email: reservation.users?.email || '',
        phone: reservation.users?.phone || '',
        re_created_at: reservation.re_created_at,
        modal_title: modalTitle,
      };

      const modalItems: any[] = [];

      (cruiseRes.data || []).forEach((r: any) => {
        modalItems.push({
          ...baseHeader, ...r,
          serviceType: 'cruise', re_type: 'cruise',
          reservation_id: r.reservation_id, reservationId: r.reservation_id, re_id: r.reservation_id,
          status: statusMap.get(r.reservation_id) || 'pending',
          note: r.request_note || '',
        });
      });

      (cruiseCarRes.data || []).forEach((r: any) => {
        const reType = typeMap.get(r.reservation_id);
        const normalizedType = reType === 'car' ? 'car' : 'vehicle';
        modalItems.push({
          ...baseHeader, ...r,
          serviceType: normalizedType, re_type: normalizedType,
          reservation_id: r.reservation_id, reservationId: r.reservation_id, re_id: r.reservation_id,
          status: statusMap.get(r.reservation_id) || 'pending',
          carType: r.vehicle_type || r.car_price_code || '',
          pickupDatetime: r.pickup_datetime || '',
          pickupLocation: r.pickup_location || '',
          dropoffLocation: r.dropoff_location || '',
          passengerCount: Number(r.passenger_count || 0),
          totalPrice: Number(r.car_total_price || 0),
          note: r.request_note || '',
        });
      });

      (airportRes.data || []).forEach((r: any) => {
        modalItems.push({
          ...baseHeader, ...r,
          serviceType: 'airport', re_type: 'airport',
          reservation_id: r.reservation_id, reservationId: r.reservation_id, re_id: r.reservation_id,
          status: statusMap.get(r.reservation_id) || 'pending',
          note: r.request_note || '',
        });
      });

      (hotelRes.data || []).forEach((r: any) => {
        modalItems.push({
          ...baseHeader, ...r,
          serviceType: 'hotel', re_type: 'hotel',
          reservation_id: r.reservation_id, reservationId: r.reservation_id, re_id: r.reservation_id,
          status: statusMap.get(r.reservation_id) || 'pending',
          note: r.request_note || '',
        });
      });

      (tourRes.data || []).forEach((r: any) => {
        modalItems.push({
          ...baseHeader, ...r,
          serviceType: 'tour', re_type: 'tour',
          reservation_id: r.reservation_id, reservationId: r.reservation_id, re_id: r.reservation_id,
          status: statusMap.get(r.reservation_id) || 'pending',
          note: r.request_note || '',
        });
      });

      (ticketRes.data || []).forEach((r: any) => {
        modalItems.push({
          ...baseHeader, ...r,
          serviceType: 'ticket', re_type: 'ticket',
          reservation_id: r.reservation_id, reservationId: r.reservation_id, re_id: r.reservation_id,
          status: statusMap.get(r.reservation_id) || 'pending',
          note: r.request_note || '',
        });
      });

      (rentcarRes.data || []).forEach((r: any) => {
        modalItems.push({
          ...baseHeader, ...r,
          serviceType: 'rentcar', re_type: 'rentcar',
          reservation_id: r.reservation_id, reservationId: r.reservation_id, re_id: r.reservation_id,
          status: statusMap.get(r.reservation_id) || 'pending',
          note: r.request_note || '',
        });
      });

      (shtRes.data || []).forEach((r: any) => {
        modalItems.push({
          ...baseHeader, ...r,
          serviceType: 'sht', re_type: 'sht',
          reservation_id: r.reservation_id, reservationId: r.reservation_id, re_id: r.reservation_id,
          status: statusMap.get(r.reservation_id) || 'pending',
          note: r.request_note || '',
        });
      });

      setDetailModalItems(modalItems);
      setDetailModalItem(modalItems[0] || {
        ...baseHeader,
        reservationId: serviceRows[0]?.re_id || '',
        re_id: serviceRows[0]?.re_id || '',
      });
      setDetailOpen(true);
    } catch (err) {
      console.error('상세 로드 실패:', err);
      setDetailOpen(true);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleViewPastReservations = async (reservation: ReservationItem) => {
    const normalizedEmail = String(reservation.users?.email || '').trim().toLowerCase();
    if (!normalizedEmail) {
      alert('이메일 정보가 없어 지난 예약을 조회할 수 없습니다.');
      return;
    }

    try {
      const { data: emailUsers, error: userErr } = await supabase
        .from('users')
        .select('id')
        .ilike('email', normalizedEmail);
      if (userErr) throw userErr;

      const userIds = (emailUsers || []).map((u: any) => u.id).filter(Boolean);
      if (userIds.length === 0) {
        alert('이메일로 연결된 지난 예약이 없습니다.');
        return;
      }

      const { data: rows, error: reservationErr } = await supabase
        .from('reservation')
        .select('re_id, re_type, re_status, re_created_at')
        .in('re_user_id', userIds)
        .neq('re_type', 'car_sht')
        .order('re_created_at', { ascending: false });
      if (reservationErr) throw reservationErr;

      const excludeIds = new Set((reservation.services || []).map((s: ServiceReservation) => s.re_id));
      const pastServices: ServiceReservation[] = (rows || [])
        .filter((r: any) => !excludeIds.has(r.re_id))
        .map((r: any) => ({ re_id: r.re_id, re_type: r.re_type, re_status: r.re_status }));

      if (pastServices.length === 0) {
        alert('지난 예약이 없습니다.');
        return;
      }

      const pseudoReservation: ReservationItem = {
        ...reservation,
        services: pastServices,
      };
      await handleViewDetail(pseudoReservation, pastServices, '지난 예약 통합 상세');
    } catch (err) {
      console.error('지난 예약 조회 실패:', err);
      alert('지난 예약 조회 중 오류가 발생했습니다.');
    }
  };

  /* ── 유틸 함수 ──────────────────────────── */
  const getStatusText = (s: string) => ({
    pending: '대기중',
    approved: '승인',
    confirmed: '확정',
    cancelled: '취소됨',
  }[s] || s);
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

  const moveToReservationEdit = () => {
    if (!detailItem) return;
    if (detailItem.re_quote_id) {
      router.push(`/reservation-edit?quote_id=${detailItem.re_quote_id}`);
      return;
    }
    if (detailItem.users?.id) {
      router.push(`/reservation-edit?user_id=${detailItem.users.id}`);
      return;
    }
    router.push('/reservation-edit');
  };

  /* ── UI ──────────────────────────────────── */
  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* 헤더 */}
      <div className="bg-white border-b border-black shadow-sm px-2 py-3">
        <div className="flex items-center gap-2">
          <button onClick={() => router.back()} className="p-1.5 rounded-lg hover:bg-gray-100">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h1 className="text-base font-bold text-gray-800 flex-1 text-center">⚡ 예약 처리</h1>
          <Link href="/" className="p-1.5 rounded-lg hover:bg-gray-100">
            <Home className="w-5 h-5 text-gray-600" />
          </Link>
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
                const normalizedEmail = String(reservation.users?.email || '').trim().toLowerCase();
                const totalByEmail = normalizedEmail ? (emailReservationCountMap[normalizedEmail] || 0) : 0;
                const hasPastReservations = totalByEmail > reservation.services.length;

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
                          {reservation.hasPromotion && (
                            <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-red-50 text-red-700 border border-red-100 whitespace-nowrap">
                              {reservation.promotionSequence ? `🎁${reservation.promotionSequence}번` : '🎁'}
                            </span>
                          )}
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
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-400">{reservation.services.length}개 서비스</span>
                            {hasPastReservations && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void handleViewPastReservations(reservation);
                                }}
                                className="px-2 py-0.5 rounded-full text-[11px] bg-amber-50 text-amber-700 border border-amber-200 whitespace-nowrap"
                              >
                                기존 예약 {Math.max(totalByEmail - reservation.services.length, 0)}건
                              </button>
                            )}
                          </div>
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

      <ReservationDetailModal
        isOpen={detailOpen}
        onClose={() => setDetailOpen(false)}
        onEdit={detailItem ? (() => moveToReservationEdit()) : undefined}
        onProcess={detailItem ? handleDetailProcess : undefined}
        processLoading={detailProcessing}
        processDisabled={detailLoading || detailProcessing || detailProcessInfo.count === 0}
        processLabel={`${detailProcessInfo.label} (${detailProcessInfo.count})`}
        item={detailModalItem}
        items={detailModalItems}
        modalTitle={detailModalTitle}
      />
    </div>
  );
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
      {label && <label className="block text-xs text-gray-700 mb-0.5">{label}</label>}
      <select value={value} onChange={onChange} className="w-full px-2 py-1.5 text-xs border rounded-lg bg-white">
        {options.map(([val, txt]) => (
          <option key={val} value={val}>{txt}</option>
        ))}
      </select>
    </div>
  );
}
