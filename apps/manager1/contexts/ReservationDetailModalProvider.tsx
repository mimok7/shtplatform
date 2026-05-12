'use client';
import { useState, useCallback, useEffect } from 'react';
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

  const openModal = useCallback((userInfo: any, allUserServices: any[], reservationDetails?: any, nextLoading = false) => {
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
    setIsOpen(false);
    setUserInfo(null);
    setAllUserServices([]);
    setReservationDetails(null);
    setLoading(false);
  }, []);

  const openPackageModal = useCallback((userId: string | null) => {
    setPackageModalUserId(userId);
    setIsPackageOpen(true);
  }, []);

  const closePackageModal = useCallback(() => {
    setIsPackageOpen(false);
    setPackageModalUserId(null);
  }, []);

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
        openModal(payload?.userInfo ?? null, payload?.allUserServices ?? [], payload?.reservationDetails, !!payload?.loading);
        return;
      }
      if (action === 'update') {
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
      if (action === 'open') openPackageModal(payload?.userId ?? null);
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
  }, [closeGoogleSheetsModal, closeModal, closePackageModal, openGoogleSheetsModal, openModal, openPackageModal, updateGoogleSheetsModal]);

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
