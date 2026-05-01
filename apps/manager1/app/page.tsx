'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const router = useRouter();
  useEffect(() => {
    try { sessionStorage.removeItem('app:session:cache'); } catch { /* noop */ }
    try { sessionStorage.removeItem('app:auth:cache'); } catch { /* noop */ }
    router.replace('/manager/schedule/new');
  }, [router]);

  return (
    <div className="flex items-center justify-center h-screen">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
    </div>
  );
}
