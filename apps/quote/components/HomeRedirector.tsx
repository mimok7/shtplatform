'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { clearCachedUser, getCachedOrderId, getCachedUser, setCachedUser } from '@/lib/authCache';

export default function HomeRedirector() {
    const router = useRouter();

    useEffect(() => {
        let cancelled = false;

        const run = async () => {
            try {
                const cachedUser = getCachedUser();
                const cachedOrderId = getCachedOrderId();

                if (cancelled) return;

                if (cachedUser) {
                    // Cached user can be stale after session expiry; verify local session first.
                    const { default: supabase } = await import('@/lib/supabase');
                    const { data: { session } } = await supabase.auth.getSession();

                    if (cancelled) return;

                    if (!session?.user) {
                        clearCachedUser();
                        return;
                    }

                    if (cachedOrderId) {
                        router.replace('/mypage/reservations/order');
                    } else {
                        router.replace('/mypage/quotes');
                    }
                    return;
                }

                // Lazy-load Supabase only if needed; keep homepage paint unblocked.
                const { default: supabase } = await import('@/lib/supabase');
                const { data: { session }, error } = await supabase.auth.getSession();
                const user = session?.user ?? null;

                if (cancelled) return;
                if (error || !user) return;

                // Cache user so subsequent navigations are faster.
                setCachedUser(user);

                // Avoid blocking on additional DB lookups here.
                // /mypage/quotes is the main landing for the quote system.
                router.replace('/mypage/quotes');
            } catch {
                // If anything fails, keep showing the public homepage.
            }
        };

        run();
        return () => {
            cancelled = true;
        };
    }, [router]);

    return null;
}
