"use client";
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { clearCachedUser } from '@/lib/authCache';
import { clearAuthCache } from '@/hooks/useAuth';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    clearCachedUser();
    clearAuthCache();
    try { sessionStorage.removeItem('app:session:cache'); } catch { /* noop */ }
    try { sessionStorage.removeItem('app:auth:cache'); } catch { /* noop */ }
    router.replace('/login');
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
    </div>
  );
}
