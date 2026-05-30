'use client';
import { useState, useCallback, useEffect, useRef } from 'react';
import supabase from '@/lib/supabase';
import { ReservationDetailModalContext, ReservationDetailModalContextType, GoogleSheetsDetailModalState } from '@/contexts/ReservationDetailModalContext';
import {
  GOOGLE_SHEETS_DETAIL_MODAL_EVENT,
  PACKAGE_DETAIL_MODAL_EVENT,
  RESERVATION_DETAIL_MODAL_EVENT,
} from '@/contexts/reservationDetailModalEvents';

const emptyGoogleSheetsDetail: GoogleSheetsDetailModalState = {
  isOpen: false,
  selectedReservation: null,
  allOrderServices: [],
  loading: false,
  orderUserInfo: null,
  relatedEmail: '',
  relatedDbServices: [],
  relatedDbLoading: false,
  modalKey: 0,
};

const normalizeUserInfo = (raw: any) => {
  if (!raw || typeof raw !== 'object') return raw ?? null;

  const phone = raw.phone_number ?? raw.phone ?? raw.customer_phone ?? raw.user_phone ?? null;
  const nickname = raw.nickname ?? raw.nick_name ?? raw.user_nickname ?? null;

  return {
    ...raw,
    phone_number: phone,
    phone,
    nickname,
  };
};

const normalizeServiceItem = (raw: any) => {
  if (!raw || typeof raw !== 'object') return raw;

  const reservationId = raw.reservation_id ?? raw.reservationId ?? raw.reservation?.re_id ?? raw.re_id ?? null;
  const serviceType = raw.serviceType ?? raw.service_type ?? raw.re_type ?? null;
  const unitPrice = raw.unitPrice ?? raw.unit_price ?? null;
  const totalPrice = raw.totalPrice ?? raw.total_price ?? raw.room_total_price ?? raw.car_total_price ?? null;
  const priceBreakdown = raw.priceBreakdown
    ?? raw.price_breakdown
    ?? raw.reservation_price_breakdown
    ?? raw.reservation?.price_breakdown
    ?? null;

  return {
    ...raw,
    reservation_id: reservationId,
    reservationId,
    serviceType,
    unitPrice,
    totalPrice,
    priceBreakdown,
    reservation: {
      ...(raw.reservation || {}),
      re_id: raw.reservation?.re_id ?? reservationId ?? null,
      price_breakdown: raw.reservation?.price_breakdown ?? priceBreakdown,
    },
  };
};

const normalizeServices = (services: any[] | null | undefined) => {
  if (!Array.isArray(services)) return [];
  return services.map(normalizeServiceItem).filter(Boolean);
};

const mapReservationServices = (rows: any[], reservationMap: Map<string, any>) => {
  const toItems = (data: any[] | null | undefined, serviceType: string) =>
    (data || []).map((row: any) => ({
      ...row,
      serviceType,
      reservation_id: row.reservation_id,
      reservation: reservationMap.get(row.reservation_id) || null,
    }));

  return [
    ...toItems(rows[0], 'cruise'),
    ...toItems(rows[1], 'airport'),
    ...toItems(rows[2], 'hotel'),
    ...toItems(rows[3], 'rentcar'),
    ...toItems(rows[4], 'tour'),
    ...toItems(rows[5], 'ticket'),
    ...toItems(rows[6], 'vehicle'),
    ...toItems(rows[7], 'sht'),
  ];
};

const mapPackageServices = (
  reservations: any[],
  packageDetails: any[],
  packageMasters: any[],
  cruiseRows: any[],
  airportRows: any[],
  hotelRows: any[],
  tourRows: any[],
  rentcarRows: any[],
  shtRows: any[],
) => {
  const packageRoots = reservations.filter((r: any) => r.re_type === 'package');
  const packageRootIds = new Set(packageRoots.map((r: any) => r.re_id));
  const packageDetailMap = new Map((packageDetails || []).map((row: any) => [row.reservation_id, row]));
  const packageMasterMap = new Map((packageMasters || []).map((row: any) => [row.id, row]));

  const rootItems = packageRoots.map((row: any) => ({
    ...row,
    serviceType: 'package',
    reservation_id: row.re_id,
    package_master: packageMasterMap.get(row.package_id) || null,
    ...(packageDetailMap.get(row.re_id) || {}),
  }));

  const toItems = (data: any[] | null | undefined, serviceType: string) =>
    (data || [])
      .filter((row: any) => packageRootIds.has(row.reservation_id))
      .map((row: any) => ({
        ...row,
        serviceType,
        isPackageService: true,
      }));

  return [
    ...rootItems,
    ...toItems(cruiseRows, 'cruise'),
    ...toItems(airportRows, 'airport'),
    ...toItems(hotelRows, 'hotel'),
    ...toItems(tourRows, 'tour'),
    ...toItems(rentcarRows, 'rentcar'),
    ...toItems(shtRows, 'sht'),
  ];
};

export function ReservationDetailModalProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [userInfo, setUserInfo] = useState<any>(null);
  const [allUserServices, setAllUserServices] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [reservationDetails, setReservationDetails] = useState<any>(null);
  const [modalKey, setModalKey] = useState(0);
  const [isPackageOpen, setIsPackageOpen] = useState(false);
  const [packageModalUserId, setPackageModalUserId] = useState<string | null>(null);
  const [googleSheetsDetail, setGoogleSheetsDetail] = useState<GoogleSheetsDetailModalState>(emptyGoogleSheetsDetail);
  const unifiedModeRef = useRef(false);
  const loadSeqRef = useRef(0);

  const loadUnifiedModalData = useCallback(async (userId: string, mode: 'auto' | 'package', seq: number) => {
    const isStale = () => loadSeqRef.current !== seq;

    try {
      const [{ data: userData }, { data: reservations, error: reservationError }] = await Promise.all([
        supabase.from('users').select('*').eq('id', userId).single(),
        supabase
          .from('reservation')
          .select('re_id, re_type, re_status, re_created_at, re_quote_id, total_amount, price_breakdown, re_adult_count, re_child_count, re_infant_count, package_id')
          .eq('re_user_id', userId)
          .order('re_created_at', { ascending: false }),
      ]);

      if (isStale()) return;
      if (reservationError) throw reservationError;

      setUserInfo(normalizeUserInfo(userData || null));

      const reservationRows = reservations || [];
      if (reservationRows.length === 0) {
        setAllUserServices([]);
        setLoading(false);
        return;
      }

      const reservationIds = reservationRows.map((row: any) => row.re_id);
      const hasPackage = mode === 'package' || reservationRows.some((row: any) => row.re_type === 'package');

      if (hasPackage) {
        const packageRows = reservationRows.filter((row: any) => row.re_type === 'package');
        const packageReservationIds = packageRows.map((row: any) => row.re_id);
        const packageMasterIds = Array.from(new Set(packageRows.map((row: any) => row.package_id).filter(Boolean)));

        const [
          packageDetailRes,
          packageMasterRes,
          cruiseRes,
          airportRes,
          hotelRes,
          tourRes,
          rentcarRes,
          shtRes,
        ] = await Promise.all([
          packageReservationIds.length > 0
            ? supabase.from('reservation_package').select('*').in('reservation_id', packageReservationIds)
            : Promise.resolve({ data: [] as any[] }),
          packageMasterIds.length > 0
            ? supabase.from('package_master').select('*').in('id', packageMasterIds)
            : Promise.resolve({ data: [] as any[] }),
          supabase.from('reservation_cruise').select('*').in('reservation_id', reservationIds),
          supabase.from('reservation_airport').select('*').in('reservation_id', reservationIds),
          supabase.from('reservation_hotel').select('*').in('reservation_id', reservationIds),
          supabase.from('reservation_tour').select('*').in('reservation_id', reservationIds),
          supabase.from('reservation_rentcar').select('*').in('reservation_id', reservationIds),
          supabase.from('reservation_car_sht').select('*').in('reservation_id', reservationIds),
        ]);

        if (isStale()) return;

        setAllUserServices(normalizeServices(mapPackageServices(
          reservationRows,
          packageDetailRes.data || [],
          packageMasterRes.data || [],
          cruiseRes.data || [],
          airportRes.data || [],
          hotelRes.data || [],
          tourRes.data || [],
          rentcarRes.data || [],
          shtRes.data || [],
        )));
        setLoading(false);
        return;
      }

      const reservationMap = new Map<string, any>(reservationRows.map((row: any) => [row.re_id, row] as [string, any]));
      const rows = await Promise.all([
        supabase.from('reservation_cruise').select('*').in('reservation_id', reservationIds),
        supabase.from('reservation_airport').select('*').in('reservation_id', reservationIds),
        supabase.from('reservation_hotel').select('*').in('reservation_id', reservationIds),
        supabase.from('reservation_rentcar').select('*').in('reservation_id', reservationIds),
        supabase.from('reservation_tour').select('*').in('reservation_id', reservationIds),
        supabase.from('reservation_ticket').select('*').in('reservation_id', reservationIds),
        supabase.from('reservation_cruise_car').select('*').in('reservation_id', reservationIds),
        supabase.from('reservation_car_sht').select('*').in('reservation_id', reservationIds),
      ]);

      if (isStale()) return;

      const services = mapReservationServices(rows.map((res: any) => res.data || []), reservationMap)
        .sort((a: any, b: any) => {
          const aTime = new Date(a?.reservation?.re_created_at || 0).getTime();
          const bTime = new Date(b?.reservation?.re_created_at || 0).getTime();
          return bTime - aTime;
        });

      setAllUserServices(normalizeServices(services));
      setLoading(false);
    } catch (error) {
      if (isStale()) return;
      console.error('중앙 예약 통합 상세 로드 실패:', error);
      setAllUserServices([]);
      setLoading(false);
    }
  }, []);

  const beginUnifiedLoad = useCallback((userId: string | null | undefined, mode: 'auto' | 'package' = 'auto') => {
    if (!userId) return;
    unifiedModeRef.current = true;
    const seq = ++loadSeqRef.current;
    setIsOpen(true);
    setModalKey(prev => prev + 1);
    setReservationDetails(null);
    setUserInfo(null);
    setAllUserServices([]);
    setLoading(true);
    setIsPackageOpen(false);
    setPackageModalUserId(null);
    void loadUnifiedModalData(String(userId), mode, seq);
  }, [loadUnifiedModalData]);

  const openModal = useCallback((userInfo: any, allUserServices: any[], reservationDetails?: any, nextLoading = false) => {
    unifiedModeRef.current = false;
    const normalizedUserInfo = normalizeUserInfo(userInfo);
    const normalizedServices = normalizeServices(allUserServices);
    setUserInfo(normalizedUserInfo);
    setAllUserServices(normalizedServices);
    setReservationDetails(reservationDetails || null);
    setLoading(nextLoading);
    setModalKey(prev => prev + 1); // 컴포넌트 리마운트
    setIsOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    unifiedModeRef.current = false;
    loadSeqRef.current += 1;
    setIsOpen(false);
    setUserInfo(null);
    setAllUserServices([]);
    setReservationDetails(null);
    setLoading(false);
  }, []);

  const openPackageModal = useCallback((userId: string | null) => {
    setPackageModalUserId(null);
    setIsPackageOpen(false);
    beginUnifiedLoad(userId, 'package');
  }, [beginUnifiedLoad]);

  const closePackageModal = useCallback(() => {
    setIsPackageOpen(false);
    setPackageModalUserId(null);
    closeModal();
  }, [closeModal]);

  const openGoogleSheetsModal = useCallback((payload: Partial<GoogleSheetsDetailModalState>) => {
    setGoogleSheetsDetail({
      ...emptyGoogleSheetsDetail,
      ...payload,
      isOpen: true,
      modalKey: Date.now(),
    });
  }, []);

  const updateGoogleSheetsModal = useCallback((payload: Partial<GoogleSheetsDetailModalState>) => {
    setGoogleSheetsDetail(prev => ({ ...prev, ...payload }));
  }, []);

  const closeGoogleSheetsModal = useCallback(() => {
    setGoogleSheetsDetail(emptyGoogleSheetsDetail);
  }, []);

  useEffect(() => {
    const handleReservationDetail = (event: Event) => {
      const { action, payload } = (event as CustomEvent).detail || {};
      if (action === 'open') {
        const resolvedUserId = payload?.userId ?? payload?.userInfo?.id ?? payload?.userInfo?.re_user_id ?? null;
        if (resolvedUserId) {
          beginUnifiedLoad(String(resolvedUserId), payload?.mode === 'package' ? 'package' : 'auto');
          return;
        }
        openModal(payload?.userInfo ?? null, payload?.allUserServices ?? [], payload?.reservationDetails, !!payload?.loading);
        return;
      }
      if (action === 'update') {
        if (unifiedModeRef.current) return;
        const resolvedUserId = payload?.userId ?? payload?.userInfo?.id ?? payload?.userInfo?.re_user_id ?? null;
        if (resolvedUserId) {
          beginUnifiedLoad(String(resolvedUserId), payload?.mode === 'package' ? 'package' : 'auto');
          return;
        }
        if ('userInfo' in (payload || {})) setUserInfo(normalizeUserInfo(payload.userInfo));
        if ('allUserServices' in (payload || {})) setAllUserServices(normalizeServices(payload.allUserServices));
        if ('reservationDetails' in (payload || {})) setReservationDetails(payload.reservationDetails || null);
        if ('loading' in (payload || {})) setLoading(!!payload.loading);
        return;
      }
      if (action === 'close') closeModal();
    };

    const handlePackageDetail = (event: Event) => {
      const { action, payload } = (event as CustomEvent).detail || {};
      if (action === 'open') beginUnifiedLoad(payload?.userId ?? null, 'package');
      if (action === 'close') closePackageModal();
    };

    const handleGoogleSheetsDetail = (event: Event) => {
      const { action, payload } = (event as CustomEvent).detail || {};
      if (action === 'open') openGoogleSheetsModal(payload || {});
      if (action === 'update') updateGoogleSheetsModal(payload || {});
      if (action === 'close') closeGoogleSheetsModal();
    };

    window.addEventListener(RESERVATION_DETAIL_MODAL_EVENT, handleReservationDetail);
    window.addEventListener(PACKAGE_DETAIL_MODAL_EVENT, handlePackageDetail);
    window.addEventListener(GOOGLE_SHEETS_DETAIL_MODAL_EVENT, handleGoogleSheetsDetail);

    return () => {
      window.removeEventListener(RESERVATION_DETAIL_MODAL_EVENT, handleReservationDetail);
      window.removeEventListener(PACKAGE_DETAIL_MODAL_EVENT, handlePackageDetail);
      window.removeEventListener(GOOGLE_SHEETS_DETAIL_MODAL_EVENT, handleGoogleSheetsDetail);
    };
  }, [beginUnifiedLoad, closeGoogleSheetsModal, closeModal, closePackageModal, openGoogleSheetsModal, openModal, updateGoogleSheetsModal]);

  const contextValue: ReservationDetailModalContextType = {
    isOpen,
    userInfo,
    allUserServices,
    loading,
    reservationDetails,
    modalKey,
    isPackageOpen,
    packageModalUserId,
    googleSheetsDetail,
    openModal,
    closeModal,
    setLoading,
    setReservationDetails,
    openPackageModal,
    closePackageModal,
    openGoogleSheetsModal,
    updateGoogleSheetsModal,
    closeGoogleSheetsModal,
  };

  return (
    <ReservationDetailModalContext.Provider value={contextValue}>
      {children}
    </ReservationDetailModalContext.Provider>
  );
}
