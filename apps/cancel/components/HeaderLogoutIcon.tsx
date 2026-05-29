'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserSupabase } from '@/lib/supabase';

export default function HeaderLogoutIcon() {
    const router = useRouter();
    const [ready, setReady] = useState(false);

    useEffect(() => {
        setReady(true);
    }, []);

    const onLogout = async () => {
        try {
            const supabase = getBrowserSupabase();
            await supabase.auth.signOut();
        } finally {
            router.replace('/');
        }
    };

    if (!ready) return null;

    return (
        <button
            type="button"
            onClick={onLogout}
            title="로그아웃"
            aria-label="로그아웃"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white bg-white text-blue-700 shadow-sm hover:bg-blue-50"
        >
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <path d="M16 17l5-5-5-5" />
                <path d="M21 12H9" />
            </svg>
        </button>
    );
}