'use client';

export type CentralReservationDetailPayload = {
  userInfo?: any;
  allUserServices?: any[];
  reservationDetails?: any;
  loading?: boolean;
};

export type CentralGoogleSheetsDetailPayload = {
  selectedReservation?: any;
  allOrderServices?: any[];
  loading?: boolean;
  orderUserInfo?: any;
  relatedEmail?: string;
  relatedDbServices?: any[];
  relatedDbLoading?: boolean;
};

export const RESERVATION_DETAIL_MODAL_EVENT = 'sht:reservation-detail-modal';
export const PACKAGE_DETAIL_MODAL_EVENT = 'sht:package-detail-modal';
export const GOOGLE_SHEETS_DETAIL_MODAL_EVENT = 'sht:google-sheets-detail-modal';

type ModalAction = 'open' | 'update' | 'close';

function dispatchModalEvent<T>(eventName: string, action: ModalAction, payload?: T) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(eventName, { detail: { action, payload } }));
}

export function openCentralReservationDetailModal(payload: CentralReservationDetailPayload) {
  dispatchModalEvent(RESERVATION_DETAIL_MODAL_EVENT, 'open', payload);
}

export function updateCentralReservationDetailModal(payload: CentralReservationDetailPayload) {
  dispatchModalEvent(RESERVATION_DETAIL_MODAL_EVENT, 'update', payload);
}

export function closeCentralReservationDetailModal() {
  dispatchModalEvent(RESERVATION_DETAIL_MODAL_EVENT, 'close');
}

export function setCentralReservationDetailModalLoading(loading: boolean) {
  updateCentralReservationDetailModal({ loading });
}

export function openCentralPackageDetailModal(userId: string | null) {
  dispatchModalEvent(PACKAGE_DETAIL_MODAL_EVENT, 'open', { userId });
}

export function closeCentralPackageDetailModal() {
  dispatchModalEvent(PACKAGE_DETAIL_MODAL_EVENT, 'close');
}

export function openCentralGoogleSheetsDetailModal(payload: CentralGoogleSheetsDetailPayload) {
  dispatchModalEvent(GOOGLE_SHEETS_DETAIL_MODAL_EVENT, 'open', payload);
}

export function updateCentralGoogleSheetsDetailModal(payload: CentralGoogleSheetsDetailPayload) {
  dispatchModalEvent(GOOGLE_SHEETS_DETAIL_MODAL_EVENT, 'update', payload);
}

export function closeCentralGoogleSheetsDetailModal() {
  dispatchModalEvent(GOOGLE_SHEETS_DETAIL_MODAL_EVENT, 'close');
}