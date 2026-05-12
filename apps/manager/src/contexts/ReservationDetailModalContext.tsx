'use client';
import { createContext } from 'react';

export interface GoogleSheetsDetailModalState {
  isOpen: boolean;
  selectedReservation: any;
  allOrderServices: any[];
  loading: boolean;
  orderUserInfo: any;
  relatedEmail: string;
  relatedDbServices: any[];
  relatedDbLoading: boolean;
  modalKey: number;
}

export interface ReservationDetailModalContextType {
  isOpen: boolean;
  userInfo: any;
  allUserServices: any[];
  loading: boolean;
  reservationDetails: any;
  modalKey: number;
  isPackageOpen: boolean;
  packageModalUserId: string | null;
  googleSheetsDetail: GoogleSheetsDetailModalState;
  
  // 모달 열기 (userInfo와 서비스 정보로 모달 오픈)
  openModal: (userInfo: any, allUserServices: any[], reservationDetails?: any, loading?: boolean) => void;
  
  // 모달 닫기
  closeModal: () => void;
  
  // 로딩 상태 설정
  setLoading: (loading: boolean) => void;
  
  // 예약 상세 정보 설정
  setReservationDetails: (details: any) => void;

  openPackageModal: (userId: string | null) => void;
  closePackageModal: () => void;
  openGoogleSheetsModal: (payload: Partial<GoogleSheetsDetailModalState>) => void;
  updateGoogleSheetsModal: (payload: Partial<GoogleSheetsDetailModalState>) => void;
  closeGoogleSheetsModal: () => void;
}

export const ReservationDetailModalContext = createContext<ReservationDetailModalContextType | undefined>(undefined);
