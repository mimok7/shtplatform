'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import supabase from '../../../lib/supabase';
import { fetchTableInBatches, fetchServiceByReservationIds } from '../../../lib/fetchInBatches';
import ManagerLayout from '../../../components/ManagerLayout';
import ServiceCardBody from '@/components/ServiceCardBody';
import {
  openCentralPackageDetailModal,
  openCentralReservationDetailModal,
  setCentralReservationDetailModalLoading,
  updateCentralReservationDetailModal,
} from '../../../contexts/reservationDetailModalEvents';
import {
  Ship,
  Plane,
  Building,
  MapPin,
  Car,
  Package,
  Plus,
  Eye,
  Edit,
  Trash2,
  Clock,
  CheckCircle,
  XCircle,
  User,
  Calendar,
  Phone,
  Mail,
  ChevronDown,
  ChevronRight,
  ChevronLeft
} from 'lucide-react';

interface ReservationData {
  re_id: string;
  re_type: string;
  re_status: string;
  re_created_at: string;
  re_quote_id: string;
  re_user_id: string;
  users: {
    id: string;
    name: string;
    email: string;
  };
  quote: {
    title: string;
    status: string;
  };
  serviceDetails?: any;
  serviceDetailsExtra?: any;
  hasFastTrack?: boolean;
  fastTrackPickupCount?: number;
  fastTrackSendingCount?: number;
}

interface GroupedReservations {
  [userId: string]: {
    userInfo: {
      id: string;
      name: string;
      email: string;
    };
    reservations: ReservationData[];
    totalCount: number;
    statusCounts: {
      pending: number;
      approved: number;
      confirmed: number;
      cancelled: number;
    };
  };
}

export default function ManagerReservationsPage() {
  const router = useRouter();
  const [reservations, setReservations] = useState<ReservationData[]>([]);
  const [groupedReservations, setGroupedReservations] = useState<GroupedReservations>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending');
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<{
    total: number;
    pending: number;
    approved: number;
    confirmed: number;
    cancelled: number;
  } | null>(null);

  // ✅ 페이지네이션 상태
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const PAGE_SIZE = 100; // 한 번에 로드할 예약 수

  // ✅ 단일 팝업 상태 관리
  const [showModal, setShowModal] = useState(false);
  const [modalView, setModalView] = useState<'user' | 'reservation'>('user'); // 현재 보기 모드
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [selectedReservation, setSelectedReservation] = useState<any>(null);

  // ✅ 검색 기능
  const [searchName, setSearchName] = useState('');

  useEffect(() => {
    // 초기 로드: 예약 데이터 + 통계
    setPage(0);
    loadReservations(0, false);
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const [totalRes, pendingRes, approvedRes, confirmedRes, cancelledRes] = await Promise.all([
        supabase.from('reservation').select('*', { head: true, count: 'exact' }).neq('re_type', 'car_sht'),
        supabase.from('reservation').select('*', { head: true, count: 'exact' }).neq('re_type', 'car_sht').eq('re_status', 'pending'),
        supabase.from('reservation').select('*', { head: true, count: 'exact' }).neq('re_type', 'car_sht').eq('re_status', 'approved'),
        supabase.from('reservation').select('*', { head: true, count: 'exact' }).neq('re_type', 'car_sht').eq('re_status', 'confirmed'),
        supabase.from('reservation').select('*', { head: true, count: 'exact' }).neq('re_type', 'car_sht').eq('re_status', 'cancelled'),
      ]);

      setStats({
        total: totalRes.count || 0,
        pending: pendingRes.count || 0,
        approved: approvedRes.count || 0,
        confirmed: confirmedRes.count || 0,
        cancelled: cancelledRes.count || 0,
      });
    } catch (err) {
      console.error('❌ 통계 로드 실패:', err);
    }
  };

  const loadReservations = async (pageNum: number = 0, append: boolean = false) => {
    try {
      console.log('🔍 예약 로딩', { page: pageNum, append });
      setLoading(true);
      setError(null);

      // 3. 예약 데이터 조회 (단계별로 처리하여 오류 원인 파악)
      // 기본 예약 정보 조회 - 페이지네이션 적용

      // 먼저 기본 예약 정보만 조회
      const { data: baseReservations, error: reservationError } = await supabase
        .from('reservation')
        .select(`
          re_id,
          re_type,
          re_status,
          re_created_at,
          re_quote_id,
          re_user_id,
          package_id,
          total_amount,
          re_adult_count,
          re_child_count,
          re_infant_count
        `)
        .neq('re_type', 'car_sht')
        .order('re_created_at', { ascending: false })
        .range(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE - 1);

      if (reservationError) {
        console.error('❌ 예약 기본 정보 조회 실패:', reservationError);
        throw reservationError;
      }

      console.log('✅ 예약 기본 정보:', { count: baseReservations?.length || 0 });

      // 사용자/견적 ID 수집 후 배치 조회
      const userIds: string[] = Array.from(
        new Set((baseReservations || []).map((r: any) => r.re_user_id).filter((id: any): id is string => typeof id === 'string' && id.length > 0))
      );
      console.log('👥 사용자 ID 요약:', { count: userIds.length });

      const quoteIds = Array.from(new Set((baseReservations || []).map((r: any) => r.re_quote_id).filter(Boolean)));

      // 서비스 타입별로 예약 ID 수집 (배치 조회 준비)
      const cruiseIds = (baseReservations || []).filter((r: any) => r.re_type === 'cruise').map((r: any) => r.re_id);
      const airportIds = (baseReservations || []).filter((r: any) => r.re_type === 'airport').map((r: any) => r.re_id);
      const hotelIds = (baseReservations || []).filter((r: any) => r.re_type === 'hotel').map((r: any) => r.re_id);
      const rentcarIds = (baseReservations || []).filter((r: any) => r.re_type === 'rentcar').map((r: any) => r.re_id);
      const tourIds = (baseReservations || []).filter((r: any) => r.re_type === 'tour').map((r: any) => r.re_id);
      const packageIds = (baseReservations || []).filter((r: any) => r.re_type === 'package').map((r: any) => r.re_id);
      const packageMasterIds = Array.from(new Set((baseReservations || []).filter((r: any) => r.re_type === 'package').map((r: any) => r.package_id).filter(Boolean)));

      // ✅ 사용자 조회 - 대량 ID를 안전하게 배치 조회 (URL 길이 초과/400 방지)
      let usersRes: any = { data: [], error: null };
      if (userIds.length > 0) {
        console.log(`👥 사용자 배치 조회: ${userIds.length}`);
        const usersData = await fetchTableInBatches<{ id: string; name?: string; email?: string }>('users', 'id', userIds, 'id, name, email', 100);
        usersRes.data = usersData;
        console.log('✅ 사용자 배치 완료:', { count: usersData.length });
      } else {
        console.log('⚠️ 조회할 사용자 ID가 없습니다.');
      }

      const [quotesRes, cruiseRes, cruiseCarRes, airportRes, hotelRes, rentcarRes, tourRes, packageMasterRes] = await Promise.all([
        // 예약.re_quote_id는 quote.id를 참조 (quote_id가 아닌 기본키 id)
        quoteIds.length
          ? supabase.from('quote').select('id, title, status').in('id', quoteIds)
          : Promise.resolve({ data: [], error: null } as any),
        cruiseIds.length
          ? supabase.from('reservation_cruise').select('*').in('reservation_id', cruiseIds)
          : Promise.resolve({ data: [], error: null } as any),
        cruiseIds.length
          ? supabase.from('reservation_cruise_car').select('*').in('reservation_id', cruiseIds).order('created_at', { ascending: false })
          : Promise.resolve({ data: [], error: null } as any),
        airportIds.length
          ? supabase.from('reservation_airport').select('*').in('reservation_id', airportIds)
          : Promise.resolve({ data: [], error: null } as any),
        hotelIds.length
          ? supabase.from('reservation_hotel').select('*').in('reservation_id', hotelIds)
          : Promise.resolve({ data: [], error: null } as any),
        rentcarIds.length
          ? supabase.from('reservation_rentcar').select('*').in('reservation_id', rentcarIds)
          : Promise.resolve({ data: [], error: null } as any),
        tourIds.length
          ? supabase.from('reservation_tour').select('*').in('reservation_id', tourIds)
          : Promise.resolve({ data: [], error: null } as any),
        packageMasterIds.length
          ? supabase.from('package_master').select('id, name').in('id', packageMasterIds)
          : Promise.resolve({ data: [], error: null } as any),
      ]);

      const { data: fastTrackRows } = airportIds.length
        ? await supabase
          .from('reservation_airport_fasttrack')
          .select('reservation_id, way_type')
          .in('reservation_id', airportIds)
        : { data: [] as any[] };

      if (quotesRes.error) console.warn('⚠️ 견적 배치 조회 일부 실패:', quotesRes.error);

      // ✅ 사용자 맵 생성 개선 - 더 확실한 데이터 처리
      const userMap = new Map<string, { id: string; name: string; email: string }>();

      console.log('🗂️ 사용자 맵 생성:', { count: usersRes.data?.length || 0 });

      (usersRes.data || []).forEach((u: any) => {
        if (u && u.id) {
          userMap.set(u.id, {
            id: u.id,
            name: u.name || u.email?.split('@')[0] || `사용자_${u.id.substring(0, 8)}`,
            email: u.email || '이메일 없음'
          });
        }
      });

      console.log('🗂️ 사용자 맵 요약:', { size: userMap.size });

      // ✅ re_quote_id는 quote.id를 참조하도록 수정
      const quoteMap = new Map<string, { id: string; title: string; status: string }>();
      (quotesRes.data || []).forEach((q: any) => {
        if (q.id) {
          // 요약 유지
          quoteMap.set(q.id, q);
        }
      });

      const packageMasterMap = new Map<string, string>();
      if (packageMasterRes && packageMasterRes.data) {
        (packageMasterRes.data || []).forEach((p: any) => packageMasterMap.set(p.id, p.name));
      }

      // 서비스 상세 맵
      const cruiseMap = new Map<string, any>();
      (cruiseRes.data || []).forEach((row: any) => cruiseMap.set(row.reservation_id, row));

      const cruiseCarLatestMap = new Map<string, any>();
      if (Array.isArray(cruiseCarRes.data)) {
        for (const row of cruiseCarRes.data as any[]) {
          if (!cruiseCarLatestMap.has(row.reservation_id)) {
            cruiseCarLatestMap.set(row.reservation_id, row);
          }
        }
      }

      const airportMap = new Map<string, any>();
      (airportRes.data || []).forEach((row: any) => airportMap.set(row.reservation_id, row));
      const hotelMap = new Map<string, any>();
      (hotelRes.data || []).forEach((row: any) => hotelMap.set(row.reservation_id, row));
      const rentcarMap = new Map<string, any>();
      (rentcarRes.data || []).forEach((row: any) => rentcarMap.set(row.reservation_id, row));
      const tourMap = new Map<string, any>();
      (tourRes.data || []).forEach((row: any) => tourMap.set(row.reservation_id, row));

      const fastTrackCountMap = new Map<string, { pickup: number; sending: number }>();
      (fastTrackRows || []).forEach((row: any) => {
        const reservationId = String(row.reservation_id || '');
        if (!reservationId) return;
        const way = String(row.way_type || '').toLowerCase() === 'sending' ? 'sending' : 'pickup';
        const prev = fastTrackCountMap.get(reservationId) || { pickup: 0, sending: 0 };
        prev[way] += 1;
        fastTrackCountMap.set(reservationId, prev);
      });

      // 사용자 정보와 견적 정보를 매핑하여 확장
      const enrichedReservations: ReservationData[] = [];

      for (const reservation of baseReservations || []) {
        try {
          // 예약 처리 요약 로그 제거

          // ✅ 사용자 정보 조회 및 상세 디버깅
          const userInfo = userMap.get(reservation.re_user_id);

          if (!userInfo) {
            // 실시간 누락 건: 맵에 기본 placeholder만 추가 (추가 재조회는 배치 헬퍼 반복 호출로 해결 권장)
            userMap.set(reservation.re_user_id, {
              id: reservation.re_user_id,
              name: `데이터없음_${reservation.re_user_id.substring(0, 8)}`,
              email: '조회 실패'
            });
          }

          // ✅ 최종 사용자 정보 결정
          const finalUserInfo = userMap.get(reservation.re_user_id) || {
            id: reservation.re_user_id,
            name: `데이터 없음_${reservation.re_user_id.substring(0, 8)}`,
            email: '조회 실패'
          };

          // 상세 사용자 로그 제거 (요약 유지)

          // ✅ 견적 정보 조회 (re_quote_id는 quote.id를 참조)
          const qInfo = reservation.re_quote_id ? quoteMap.get(reservation.re_quote_id) : null;

          // 배치 조회 결과에서 매핑
          let serviceDetails: any = null;
          let serviceDetailsExtra: any = null;
          switch (reservation.re_type) {
            case 'cruise':
              serviceDetails = cruiseMap.get(reservation.re_id) || null;
              serviceDetailsExtra = cruiseCarLatestMap.get(reservation.re_id) || null;
              break;
            case 'airport':
              serviceDetails = airportMap.get(reservation.re_id) || null;
              break;
            case 'hotel':
              serviceDetails = hotelMap.get(reservation.re_id) || null;
              break;
            case 'rentcar':
              serviceDetails = rentcarMap.get(reservation.re_id) || null;
              break;
            case 'tour':
              serviceDetails = tourMap.get(reservation.re_id) || null;
              break;
            case 'package':
              // 패키지의 경우 마스터 정보를 description에 넣어줌
              const pkgName = reservation.package_id ? packageMasterMap.get(reservation.package_id) : null;
              serviceDetails = {
                package_name: pkgName || '패키지',
                total_amount: reservation.total_amount,
                re_adult_count: reservation.re_adult_count,
                re_child_count: reservation.re_child_count,
                re_infant_count: reservation.re_infant_count
              };
              break;
          }

          enrichedReservations.push({
            ...(reservation as any),
            users: finalUserInfo,
            quote: qInfo
              ? { title: qInfo.title ?? '제목 없음', status: qInfo.status ?? 'unknown' }
              : { title: '연결된 견적 없음', status: 'unknown' },
            serviceDetails,
            serviceDetailsExtra,
            hasFastTrack: reservation.re_type === 'airport' ? fastTrackCountMap.has(reservation.re_id) : false,
            fastTrackPickupCount: reservation.re_type === 'airport' ? (fastTrackCountMap.get(reservation.re_id)?.pickup || 0) : 0,
            fastTrackSendingCount: reservation.re_type === 'airport' ? (fastTrackCountMap.get(reservation.re_id)?.sending || 0) : 0,
          });
        } catch (enrichError) {
          console.warn('⚠️ 예약 상세 정보 구성 실패:', (reservation as any).re_id, enrichError);
          enrichedReservations.push({
            ...(reservation as any),
            users: {
              id: (reservation as any).re_user_id,
              name: `처리오류_${(reservation as any).re_user_id.substring(0, 8)}`,
              email: '오류로 인한 정보 없음'
            },
            quote: { title: reservation.re_quote_id ? '제목 없음' : '연결된 견적 없음', status: 'unknown' },
            serviceDetails: null
          } as any);
        }
      }

      console.log('✅ 예약 데이터 완성:', { count: enrichedReservations.length });

      // 페이지네이션: 더 불러올 데이터가 있는지 확인
      setHasMore(enrichedReservations.length === PAGE_SIZE);

      // 4. 사용자별로 예약 그룹화
      if (append) {
        // 기존 데이터에 추가
        const allReservations = [...reservations, ...enrichedReservations];
        const grouped = groupReservationsByUser(allReservations);
        setReservations(allReservations);
        setGroupedReservations(grouped);
      } else {
        // 새로 로드
        const grouped = groupReservationsByUser(enrichedReservations);
        setReservations(enrichedReservations);
        setGroupedReservations(grouped);
      }
      setError(null);

    } catch (error: any) {
      console.error('❌ 예약 데이터 로딩 실패:', error);
      setError(error.message || '예약 데이터를 불러오는 중 오류가 발생했습니다.');

      // 권한 관련 리다이렉트 제거됨 (요청에 따라 매니저 권한 확인 비활성화)
    } finally {
      setLoading(false);
    }
  };

  const groupReservationsByUser = (reservations: ReservationData[]): GroupedReservations => {
    const grouped: GroupedReservations = {};

    reservations.forEach(reservation => {
      const userId = reservation.users.id;

      if (!grouped[userId]) {
        grouped[userId] = {
          userInfo: reservation.users,
          reservations: [],
          totalCount: 0,
          statusCounts: {
            pending: 0,
            approved: 0,
            confirmed: 0,
            cancelled: 0
          }
        };
      }

      grouped[userId].reservations.push(reservation);
      grouped[userId].totalCount++;

      // 상태별 카운트 증가
      const status = reservation.re_status as 'pending' | 'approved' | 'confirmed' | 'cancelled';
      if (grouped[userId].statusCounts[status] !== undefined) {
        grouped[userId].statusCounts[status]++;
      }
    });

    return grouped;
  };

  const toggleUserExpanded = (userId: string) => {
    setExpandedUsers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(userId)) {
        newSet.delete(userId);
      } else {
        newSet.add(userId);
      }
      return newSet;
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved': return <CheckCircle className="w-4 h-4 text-blue-600" />;
      case 'confirmed': return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'cancelled': return <XCircle className="w-4 h-4 text-red-600" />;
      default: return <Clock className="w-4 h-4 text-yellow-600" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending': return '대기중';
      case 'approved': return '승인';
      case 'confirmed': return '확정';
      case 'cancelled': return '취소됨';
      default: return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return 'bg-blue-100 text-blue-800';
      case 'confirmed': return 'bg-green-100 text-green-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-yellow-100 text-yellow-800';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'cruise': return <Ship className="w-4 h-4 text-blue-600" />;
      case 'airport': return <Plane className="w-4 h-4 text-green-600" />;
      case 'hotel': return <Building className="w-4 h-4 text-purple-600" />;
      case 'tour': return <MapPin className="w-4 h-4 text-orange-600" />;
      case 'rentcar': return <Car className="w-4 h-4 text-red-600" />;
      case 'package': return <Package className="w-4 h-4 text-indigo-600" />;
      case 'sht': // sht → 스하차량
      case 'car_sht':
      case 'reservation_car_sht':
        return <Car className="w-4 h-4 text-blue-800" />;
      default: return <Clock className="w-4 h-4 text-gray-600" />;
    }
  };

  const getTypeName = (type: string) => {
    switch (type) {
      case 'cruise': return '크루즈';
      case 'airport': return '공항';
      case 'hotel': return '호텔';
      case 'tour': return '투어';
      case 'rentcar': return '렌터카';
      case 'package': return '패키지';
      case 'sht': // sht → 스하차량
      case 'car_sht':
      case 'reservation_car_sht':
        return '스하차량';
      default: return type;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'cruise': return 'bg-blue-100 text-blue-800';
      case 'airport': return 'bg-green-100 text-green-800';
      case 'hotel': return 'bg-purple-100 text-purple-800';
      case 'tour': return 'bg-orange-100 text-orange-800';
      case 'rentcar': return 'bg-red-100 text-red-800';
      case 'package': return 'bg-indigo-100 text-indigo-800';
      case 'sht': // sht → 스하차량
      case 'car_sht':
      case 'reservation_car_sht':
        return 'bg-blue-100 text-blue-900';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // ✅ 검색과 필터링이 적용된 사용자 목록
  const getFilteredUsers = () => {
    return Object.keys(groupedReservations)
      .filter(userId => {
        const userGroup = groupedReservations[userId];

        // ✅ 이름 검색 필터 적용
        const nameMatch = !searchName ||
          userGroup.userInfo.name.toLowerCase().includes(searchName.toLowerCase()) ||
          userGroup.userInfo.email.toLowerCase().includes(searchName.toLowerCase());

        if (!nameMatch) return false;

        // 상태 필터 적용
        if (filter === 'all') return true;
        return userGroup.reservations.some(reservation => reservation.re_status === filter);
      })
      // ✅ 이름 순으로 정렬
      .sort((userIdA, userIdB) => {
        const userA = groupedReservations[userIdA].userInfo.name;
        const userB = groupedReservations[userIdB].userInfo.name;
        return userA.localeCompare(userB, 'ko-KR');
      });
  };

  const filteredUsers = getFilteredUsers();
  const totalReservations = reservations.length;
  const statusCounts = {
    pending: reservations.filter(r => r.re_status === 'pending').length,
    approved: reservations.filter(r => r.re_status === 'approved').length,
    confirmed: reservations.filter(r => r.re_status === 'confirmed').length,
    cancelled: reservations.filter(r => r.re_status === 'cancelled').length,
  };

  if (loading) {
    return (
      <ManagerLayout title="예약 관리" activeTab="reservations">
        <div className="flex justify-center items-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto"></div>
            <p className="mt-4 text-gray-600">예약 정보를 불러오는 중...</p>
          </div>
        </div>
      </ManagerLayout>
    );
  }

  // ✅ 단일 팝업 관리 함수들
  const openUserModal = (userGroup: any) => {
    // ✅ 고객 카드 클릭 시 모든 예약 조회
    if (userGroup.userInfo?.id) {
      const hasPackage = userGroup.reservations.some((r: any) => r.re_type === 'package');
      if (hasPackage) {
        openCentralPackageDetailModal(userGroup.userInfo.id);
      } else {
        loadAllUserReservations(userGroup.userInfo.id);
      }
    }
  };

  // 사용자 ID로 모든 DB 예약 조회
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
        .select('re_id, re_type, re_status, re_created_at, total_amount, price_breakdown, re_adult_count, re_child_count, re_infant_count')
        .eq('re_user_id', userId)
        .order('re_created_at', { ascending: false });

      if (resError) throw resError;

      const reservationIds = reservations.map((r: any) => r.re_id);

      if (reservationIds.length === 0) {
        updateCentralReservationDetailModal({ allUserServices: [], loading: false });
        return;
      }

      // 3. 각 서비스 테이블에서 상세 정보 조회 (배치 처리로 URL 길이 제한 회피)
      const [cruiseRes, airportRes, hotelRes, rentcarRes, tourRes, cruiseCarRes, carShtRes] = await Promise.all([
        fetchServiceByReservationIds('reservation_cruise', reservationIds, '*', 80),
        fetchServiceByReservationIds('reservation_airport', reservationIds, '*', 80),
        fetchServiceByReservationIds('reservation_hotel', reservationIds, '*', 80),
        fetchServiceByReservationIds('reservation_rentcar', reservationIds, '*', 80),
        fetchServiceByReservationIds('reservation_tour', reservationIds, '*', 80),
        fetchServiceByReservationIds('reservation_cruise_car', reservationIds, '*', 80),
        fetchServiceByReservationIds('reservation_car_sht', reservationIds, '*', 80)
      ]);

      // 4. 추가 정보 조회 (가격/상품명 등)
      const cruiseCodes = (cruiseRes as any[] || []).map((r: any) => r.room_price_code).filter(Boolean);
      const tourCodes = (tourRes as any[] || []).map((r: any) => r.tour_price_code).filter(Boolean);
      const hotelCodes = (hotelRes as any[] || []).map((r: any) => r.hotel_price_code).filter(Boolean);
      const rentCodes = (rentcarRes as any[] || [])
        .map((r: any) => String(r.rentcar_price_code || '').trim())
        .filter(Boolean);
      const airportCodes = (airportRes as any[] || []).map((r: any) => r.airport_price_code).filter(Boolean);

      const [roomPrices, tourPrices, hotelPrices, rentPrices, airportPrices] = await Promise.all([
        cruiseCodes.length > 0 ? supabase.from('cruise_rate_card').select('id, cruise_name, room_type').in('id', cruiseCodes) : Promise.resolve({ data: [] }),
        tourCodes.length > 0 ? supabase.from('tour_pricing').select('pricing_id, price_per_person, tour:tour_id(tour_name, tour_code)').in('pricing_id', tourCodes) : Promise.resolve({ data: [] }),
        hotelCodes.length > 0 ? supabase.from('hotel_price').select('hotel_price_code, base_price, hotel_name, room_name').in('hotel_price_code', hotelCodes) : Promise.resolve({ data: [] }),
        rentCodes.length > 0 ? supabase.from('rentcar_price').select('rent_code, vehicle_type, way_type, route, price').in('rent_code', rentCodes) : Promise.resolve({ data: [] }),
        airportCodes.length > 0 ? supabase.from('airport_price').select('airport_code, service_type, route, vehicle_type').in('airport_code', airportCodes) : Promise.resolve({ data: [] })
      ]);

      const roomPriceMap = new Map((roomPrices.data || []).map((r: any) => [r.id, r]));
      const tourPriceMap = new Map((tourPrices.data || []).map((r: any) => [r.pricing_id, r]));
      const hotelPriceMap = new Map((hotelPrices.data || []).map((r: any) => [r.hotel_price_code, r]));
      const rentPriceMap = new Map<string, any>();
      for (const row of rentPrices.data || []) {
        const rawCode = String(row?.rent_code || '').trim();
        const upperCode = rawCode.toUpperCase();
        if (rawCode) {
          rentPriceMap.set(rawCode, row);
        }
        if (upperCode && upperCode !== rawCode) {
          rentPriceMap.set(upperCode, row);
        }
      }
      const airportPriceMap = new Map((airportPrices.data || []).map((r: any) => [r.airport_code, r]));

      // 디버깅: 렌터카 가격 데이터 확인
      console.log('🚗 Rent Price Data:', rentPrices.data);
      console.log('🚗 Rent Price Map Size:', rentPriceMap.size);
      if (rentPrices.data && rentPrices.data.length > 0) {
        console.log('🚗 Sample Rent Price:', rentPrices.data[0]);
      }

      // 디버깅: 공항 가격 데이터 확인
      console.log('🔍 Airport Price Data:', airportPrices.data);
      console.log('🔍 Airport Price Map Size:', airportPriceMap.size);
      if (airportPrices.data && airportPrices.data.length > 0) {
        console.log('🔍 Sample Airport Price:', airportPrices.data[0]);
      }

      // 5. 데이터 매핑
      const reservationMap = new Map(reservations.map((r: any) => [r.re_id, r]));

      const allServices = [
        ...reservations.filter((r: any) => r.re_type === 'package').map((r: any) => ({
          ...r,
          serviceType: 'package',
          reservation_id: r.re_id,
          status: r.re_status,
          totalPrice: r.total_amount,
          adult: r.re_adult_count || 0,
          child: r.re_child_count || 0,
          infant: r.re_infant_count || 0,
        })),
        ...(cruiseRes as any[] || []).map((r: any) => {
          const info: any = roomPriceMap.get(r.room_price_code);
          const reservationInfo: any = reservationMap.get(r.reservation_id) || {};
          return {
            ...r,
            serviceType: 'cruise',
            status: reservationInfo?.re_status,
            cruise: info?.cruise_name || '크루즈',
            roomType: info?.room_type || r.room_price_code,
            checkin: r.checkin,
            adult: r.adult_count ?? reservationInfo?.re_adult_count ?? r.guest_count,
            child: r.child_count || 0,
            infant: r.infant_count || reservationInfo?.re_infant_count || 0,
            childExtraBedCount: r.child_extra_bed_count || 0,
            extraBedCount: r.extra_bed_count || 0,
            singleCount: r.single_count || 0,
            note: r.request_note,
            unitPrice: r.unit_price,
            totalPrice: r.room_total_price ?? reservationInfo?.total_amount,
            priceBreakdown: reservationInfo?.price_breakdown || null,
            paymentMethod: '정보 없음'
          };
        }),
        ...(cruiseCarRes as any[] || []).map((r: any) => ({
          ...r,
          serviceType: 'vehicle',
          status: (reservationMap.get(r.reservation_id) as any)?.re_status,
          pickupDatetime: r.pickup_datetime,
          pickupLocation: r.pickup_location,
          dropoffLocation: r.dropoff_location,
          passengerCount: r.passenger_count,
          note: r.request_note,
          unitPrice: r.unit_price,
          totalPrice: r.car_total_price
        })),
        ...(airportRes as any[] || []).map((r: any) => {
          const info: any = airportPriceMap.get(r.airport_price_code);
          console.log('🔍 Airport Service:', {
            code: r.airport_price_code,
            info: info,
            route: info?.route,
            carType: info?.vehicle_type
          });
          return {
            ...r,
            serviceType: 'airport',
            status: (reservationMap.get(r.reservation_id) as any)?.re_status,
            category: info?.service_type || '',
            route: info?.route || '',
            carType: info?.vehicle_type || '',
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
          };
        }),
        ...(hotelRes as any[] || []).map((r: any) => {
          const info: any = hotelPriceMap.get(r.hotel_price_code);
          return {
            ...r,
            serviceType: 'hotel',
            status: (reservationMap.get(r.reservation_id) as any)?.re_status,
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
        ...(tourRes as any[] || []).map((r: any) => {
          const info: any = tourPriceMap.get(r.tour_price_code);
          return {
            ...r,
            serviceType: 'tour',
            status: (reservationMap.get(r.reservation_id) as any)?.re_status,
            tourName: info?.tour?.tour_name || r.tour_price_code,
            tourDate: r.usage_date,
            tourCapacity: r.tour_capacity,
            pickupLocation: r.pickup_location,
            dropoffLocation: r.dropoff_location,
            carCount: r.car_count,
            passengerCount: r.passenger_count,
            note: r.request_note,
            unitPrice: info?.price_per_person || r.unit_price,
            totalPrice: r.total_price
          };
        }),
        ...(rentcarRes as any[] || []).map((r: any) => {
          const rentCode = String(r.rentcar_price_code || '').trim();
          const info: any = rentPriceMap.get(rentCode) || rentPriceMap.get(rentCode.toUpperCase());
          console.log('🚗 Rentcar Service:', {
            code: rentCode,
            info: info,
            route: info?.route,
            carType: info?.vehicle_type,
            category: info?.way_type
          });
          return {
            ...r,
            serviceType: 'rentcar',
            status: (reservationMap.get(r.reservation_id) as any)?.re_status,
            category: info?.way_type || '',
            carType: info?.vehicle_type || r.vehicle_type || '-',
            route: info?.route || '',
            pickupDatetime: r.pickup_datetime,
            pickupLocation: r.pickup_location,
            destination: r.destination,
            requestNote: r.request_note,
            note: r.request_note,
            unitPrice: info?.price || r.unit_price,
            totalPrice: r.total_price
          };
        }),
        ...(carShtRes as any[] || []).map((r: any) => ({
          ...r,
          serviceType: 'sht',
          status: (reservationMap.get(r.reservation_id) as any)?.re_status,
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

      updateCentralReservationDetailModal({ userInfo: userData, allUserServices: allServices });

    } catch (error) {
      console.error('사용자 예약 정보 조회 실패:', error);
      updateCentralReservationDetailModal({ allUserServices: [] });
    } finally {
      setCentralReservationDetailModalLoading(false);
    }
  };

  const openReservationModal = (reservation: any) => {
    setSelectedReservation(reservation);
    setModalView('reservation');
    // setShowModal은 이미 true 상태이므로 변경하지 않음
  };

  const goBackToUserView = () => {
    setSelectedReservation(null);
    setModalView('user');
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedUser(null);
    setSelectedReservation(null);
    setModalView('user');
  };

  // ✅ 검색 초기화 함수
  const clearSearch = () => {
    setSearchName('');
  };

  return (
    <ManagerLayout title="예약 관리" activeTab="reservations">
      <div className="space-y-6">

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <XCircle className="w-5 h-5 text-red-600" />
              <span className="font-medium">데이터 로딩 오류</span>
            </div>
            <p className="text-sm">{error}</p>
            <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-yellow-800 text-xs">
              💡 데이터베이스 연결을 확인하고 다시 시도해주세요.
            </div>
          </div>
        )}

        {/* ✅ 검색 및 필터링 - 상태 필터 왼쪽, 고객 검색 오른쪽 */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex flex-col md:flex-row gap-4 items-end justify-between">
            {/* 상태 필터 - 왼쪽 */}
            <div className="md:w-auto">
              <h4 className="text-md font-semibold mb-3">예약 상태 필터</h4>
              <div className="flex gap-2">
                <button
                  onClick={() => setFilter('all')}
                  className={`px-3 py-2 rounded-lg text-sm transition-colors ${filter === 'all'
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                >
                  전체 ({stats ? stats.total : totalReservations})
                </button>
                <button
                  onClick={() => setFilter('pending')}
                  className={`px-3 py-2 rounded-lg text-sm transition-colors ${filter === 'pending'
                    ? 'bg-yellow-500 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                >
                  대기중 ({stats ? stats.pending : statusCounts.pending})
                </button>
                <button
                  onClick={() => setFilter('approved')}
                  className={`px-3 py-2 rounded-lg text-sm transition-colors ${filter === 'approved'
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                >
                  승인 ({stats ? stats.approved : statusCounts.approved})
                </button>
                <button
                  onClick={() => setFilter('confirmed')}
                  className={`px-3 py-2 rounded-lg text-sm transition-colors ${filter === 'confirmed'
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                >
                  확정 ({stats ? stats.confirmed : statusCounts.confirmed})
                </button>
                <button
                  onClick={() => setFilter('cancelled')}
                  className={`px-3 py-2 rounded-lg text-sm transition-colors ${filter === 'cancelled'
                    ? 'bg-red-500 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                >
                  취소 ({stats ? stats.cancelled : statusCounts.cancelled})
                </button>
              </div>
            </div>

            {/* 고객 검색 - 오른쪽 */}
            <div className="flex-1 md:max-w-xs">
              <h4 className="text-md font-semibold mb-3">고객 검색</h4>
              <div className="relative">
                <input
                  type="text"
                  placeholder="고객 이름 또는 이메일로 검색..."
                  value={searchName}
                  onChange={(e) => setSearchName(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10"
                />
                {searchName && (
                  <button
                    onClick={clearSearch}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    ✕
                  </button>
                )}
              </div>
              {searchName && (
                <p className="text-sm text-gray-500 mt-1">
                  "{searchName}" 검색 결과: {filteredUsers.length}명
                </p>
              )}
            </div>
          </div>
        </div>

        {/* 고객별 예약 목록 - 4열 그리드 */}
        <div className="bg-white rounded-lg shadow-md">
          <div className="p-6 border-b">
            <h3 className="text-lg font-semibold">고객별 예약 목록</h3>
            <p className="text-sm text-gray-600 mt-1">
              고객 정보를 클릭하면 해당 고객의 예약 내역을 확인할 수 있습니다.
              {searchName && ` (이름순 정렬, "${searchName}" 검색 중)`}
            </p>
          </div>

          {filteredUsers.length === 0 ? (
            <div className="p-8 text-center">
              <User className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-600 mb-2">
                {searchName
                  ? `"${searchName}"로 검색된 고객이 없습니다`
                  : filter === 'all'
                    ? '예약 고객이 없습니다'
                    : `${getStatusText(filter)} 예약 고객이 없습니다`}
              </h3>
              {searchName && (
                <button
                  onClick={clearSearch}
                  className="mt-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm"
                >
                  검색 초기화
                </button>
              )}
            </div>
          ) : (
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                {filteredUsers.map((userId) => {
                  const userGroup = groupedReservations[userId];

                  // 필터에 맞는 예약만 필터링
                  const filteredReservations = (filter === 'all'
                    ? userGroup.reservations
                    : userGroup.reservations.filter(r => r.re_status === filter));

                  if (filteredReservations.length === 0) return null;

                  // 서비스 타입별 개수 계산
                  const serviceTypeCounts = filteredReservations.reduce((acc, reservation) => {
                    const type = reservation.re_type;
                    acc[type] = (acc[type] || 0) + 1;
                    return acc;
                  }, {} as Record<string, number>);
                  const hasFastTrackReservation = filteredReservations.some(
                    (reservation) => reservation.re_type === 'airport' && reservation.hasFastTrack
                  );

                  return (
                    <div
                      key={userId}
                      className="relative overflow-hidden bg-white border border-gray-200 rounded-lg hover:shadow-md transition-shadow cursor-pointer"
                      onClick={() => openUserModal(userGroup)}
                    >
                      {hasFastTrackReservation && (
                        <div className="absolute -right-10 top-3 rotate-45 bg-rose-600 text-white text-[10px] font-bold px-10 py-1 z-10 shadow-sm">
                          FAST TRACK
                        </div>
                      )}
                      {/* 고객 카드 헤더 */}
                      <div className="p-4 hover:bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-3 mb-3">
                          <User className="w-8 h-8 p-1.5 bg-blue-100 text-blue-600 rounded-full flex-shrink-0" />
                          <div className="min-w-0 flex-1">
                            <h4 className="font-semibold text-sm text-gray-800 truncate">
                              {userGroup.userInfo.name}
                            </h4>
                          </div>
                          <ChevronRight className="w-4 h-4 text-gray-500 flex-shrink-0" />
                        </div>

                        <div className="space-y-1 text-xs text-gray-600">
                          <div className="flex items-center gap-1 truncate">
                            <Mail className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate">{userGroup.userInfo.email || '이메일 없음'}</span>
                          </div>
                        </div>

                        {/* 서비스 타입별 표시 */}
                        <div className="mt-3 space-y-1">
                          <div className="text-xs font-medium text-gray-700">예약 서비스:</div>
                          <div className="flex flex-wrap gap-1">
                            {Object.entries(serviceTypeCounts).map(([type, count]) => (
                              <div key={type} className="flex items-center gap-1">
                                {getTypeIcon(type)}
                                <span className={`px-2 py-0.5 rounded-full text-xs ${getTypeColor(type)}`}>
                                  {getTypeName(type)} {count}건
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* 예약 상태 요약 */}
                        <div className="flex flex-wrap gap-1 mt-3">
                          {userGroup.statusCounts.pending > 0 && (
                            <span className="px-2 py-0.5 bg-yellow-100 text-yellow-800 text-xs rounded-full">
                              대기 {userGroup.statusCounts.pending}
                            </span>
                          )}
                          {userGroup.statusCounts.confirmed > 0 && (
                            <span className="px-2 py-0.5 bg-green-100 text-green-800 text-xs rounded-full">
                              확정 {userGroup.statusCounts.confirmed}
                            </span>
                          )}
                          {userGroup.statusCounts.cancelled > 0 && (
                            <span className="px-2 py-0.5 bg-red-100 text-red-800 text-xs rounded-full">
                              취소 {userGroup.statusCounts.cancelled}
                            </span>
                          )}
                        </div>

                        <div className="text-xs text-gray-500 mt-2 text-center">
                          총 {filteredReservations.length}건 예약
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 더 보기 버튼 */}
              {hasMore && (
                <div className="flex justify-center mt-6">
                  <button
                    onClick={() => {
                      const nextPage = page + 1;
                      setPage(nextPage);
                      loadReservations(nextPage, true);
                    }}
                    disabled={loading}
                    className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {loading ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                        <span>불러오는 중...</span>
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4" />
                        <span>더 보기</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>



        {/* ✅ 단일 팝업 모달 - 사용자 목록 또는 예약 상세 */}
        {showModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">

              {/* ✅ 사용자 예약 목록 뷰 */}
              {modalView === 'user' && selectedUser && (
                <>
                  <div className="p-6 border-b">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <User className="w-8 h-8 p-1.5 bg-blue-100 text-blue-600 rounded-full" />
                        <div>
                          <h2 className="text-xl font-bold text-gray-800">
                            {selectedUser.userInfo.name}
                          </h2>
                          <p className="text-sm text-gray-600">
                            {selectedUser.userInfo.email}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={closeModal}
                        className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
                      >
                        ×
                      </button>
                    </div>
                  </div>

                  <div className="p-6">
                    <div className="mb-4">
                      <h3 className="text-lg font-semibold text-gray-800 mb-2">예약 현황 요약</h3>
                      <div className="grid grid-cols-4 gap-4">
                        <div className="bg-yellow-50 rounded-lg p-3 text-center">
                          <div className="text-2xl font-bold text-yellow-600">
                            {selectedUser.statusCounts.pending}
                          </div>
                          <div className="text-sm text-yellow-700">대기중</div>
                        </div>
                        <div className="bg-blue-50 rounded-lg p-3 text-center">
                          <div className="text-2xl font-bold text-blue-600">
                            {selectedUser.statusCounts.approved}
                          </div>
                          <div className="text-sm text-blue-700">승인</div>
                        </div>
                        <div className="bg-green-50 rounded-lg p-3 text-center">
                          <div className="text-2xl font-bold text-green-600">
                            {selectedUser.statusCounts.confirmed}
                          </div>
                          <div className="text-sm text-green-700">확정</div>
                        </div>
                        <div className="bg-red-50 rounded-lg p-3 text-center">
                          <div className="text-2xl font-bold text-red-600">
                            {selectedUser.statusCounts.cancelled}
                          </div>
                          <div className="text-sm text-red-700">취소</div>
                        </div>
                      </div>
                    </div>

                    {/* 예약 상세 목록 */}
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold text-gray-800">예약 상세 목록</h3>
                      {selectedUser.reservations
                        .slice()
                        .sort((a: any, b: any) => {
                          // 1. 크루즈 우선 정렬
                          if (a.re_type === 'cruise' && b.re_type !== 'cruise') return -1;
                          if (a.re_type !== 'cruise' && b.re_type === 'cruise') return 1;
                          // 2. 그 외에는 최신순 정렬
                          return new Date(b.re_created_at).getTime() - new Date(a.re_created_at).getTime();
                        })
                        .map((reservation: any) => {
                          return (
                            <div key={reservation.re_id} className="border border-gray-200 rounded-lg p-4">
                              <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-100">
                                <div className="flex items-center gap-2">
                                  {getTypeIcon(reservation.re_type)}
                                  <span className="font-semibold text-gray-900">
                                    {getTypeName(reservation.re_type)}
                                  </span>
                                  {reservation.re_type === 'airport' && reservation.hasFastTrack && (
                                    <span className="px-1.5 py-0.5 bg-rose-100 text-rose-700 text-xs rounded font-medium">FAST TRACK</span>
                                  )}
                                  {reservation.re_type === 'package' && (
                                    <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-700 text-xs rounded font-medium">📦 패키지</span>
                                  )}
                                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(reservation.re_status)}`}>
                                    {getStatusText(reservation.re_status)}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openReservationModal(reservation);
                                    }}
                                    className="px-3 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600 flex items-center gap-1"
                                  >
                                    <Eye className="w-3 h-3" /> 상세
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      closeModal();
                                      router.push(`/manager/reservations/${reservation.re_id}/edit`);
                                    }}
                                    className="px-3 py-1 bg-green-500 text-white rounded text-xs hover:bg-green-600"
                                  >
                                    수정
                                  </button>
                                </div>
                              </div>
                              <ServiceCardBody
                                serviceType={reservation.re_type}
                                data={reservation.serviceDetails || {}}
                              />
                              <div className="text-xs text-gray-400 mt-2 pt-2 border-t border-gray-100">
                                예약일: {new Date(reservation.re_created_at).toLocaleDateString('ko-KR')} |
                                ID: {reservation.re_id.slice(0, 8)}...
                              </div>
                              {reservation.quote && (
                                <div className="text-sm text-blue-600 mt-1">
                                  견적: {reservation.quote.title}
                                </div>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  </div>

                  <div className="p-6 border-t bg-gray-50">
                    <div className="flex justify-end">
                      <button
                        onClick={closeModal}
                        className="px-6 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
                      >
                        닫기
                      </button>
                    </div>
                  </div>
                </>
              )}

            </div>
          </div>
        )}
      </div>
    </ManagerLayout>
  );
}
