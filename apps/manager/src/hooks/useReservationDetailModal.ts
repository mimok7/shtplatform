'use client';
import { useContext } from 'react';
import { ReservationDetailModalContext } from '@/contexts/ReservationDetailModalContext';

export function useReservationDetailModal() {
  const context = useContext(ReservationDetailModalContext);
  if (!context) {
    throw new Error('useReservationDetailModal must be used within ReservationDetailModalProvider');
  }
  return context;
}
