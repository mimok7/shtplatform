import { redirect } from 'next/navigation';

export default function NotificationControlRedirectPage() {
  redirect('/admin/reservation-settings');
}
