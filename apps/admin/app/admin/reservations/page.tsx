import { redirect } from 'next/navigation';

// 예약 현황은 대시보드(/admin)에서 조회합니다. 이 경로는 호환용 리다이렉트입니다.
export default function AdminReservationsRedirect() {
  redirect('/admin');
}

