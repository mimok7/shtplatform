import { redirect } from 'next/navigation';

// 정식 대시보드는 /admin 루트에 존재합니다. 이 경로는 호환용 리다이렉트입니다.
export default function AdminDashboardRedirect() {
  redirect('/admin');
}

