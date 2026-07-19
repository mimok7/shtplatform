'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Home } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import supabase from '@/lib/supabase';
import { getKstDayUtcRange } from '@/lib/dateKst';

/**
 * 모바일 견적 페이지 공통 래퍼
 * - manager1의 ManagerLayout을 단순 헤더로 대체 (사이드바 제거)
 * - 기능은 manager1과 동일, UI만 모바일 최적화 (text-xs, max-w-screen-md)
 */
export function MobileQuoteLayout({ title, children }: { title: string; children: React.ReactNode }) {
    const router = useRouter();

    return (
        <div className="min-h-screen bg-slate-50 pb-20 overflow-x-hidden text-xs">
            <header className="bg-white border-b shadow-sm px-2 py-2">
                <div className="flex items-center gap-2">
                    <button type="button" onClick={() => router.back()} className="p-1.5 rounded-lg hover:bg-gray-100">
                        <ArrowLeft className="w-5 h-5 text-gray-600" />
                    </button>
                    <h1 className="text-base font-bold text-gray-800 flex-1 text-center">{title}</h1>
                    <Link href="/" className="p-1.5 rounded-lg hover:bg-gray-100">
                        <Home className="w-5 h-5 text-gray-600" />
                    </Link>
                </div>
            </header>
            <div className="max-w-screen-md mx-auto w-full min-w-0 px-2 py-2 overflow-x-hidden">
                {children}
            </div>
        </div>
    );
}

export type ManagerServiceKey = 'cruise' | 'airport' | 'hotel' | 'rentcar' | 'tour' | 'comprehensive' | 'package';

/**
 * 견적 서비스 탭 + 오늘 작성 타이틀 선택 + 신규 작업 시작
 * cruise 페이지의 ManagerServiceTabs와 동일 동작 (모바일 호환)
 */
export function ManagerServiceTabs({ active, pageRawRate }: { active: ManagerServiceKey; pageRawRate?: number | null }) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const quoteId = searchParams.get('quoteId');
    const [titlesToday, setTitlesToday] = useState<any[]>([]);
    const [creating, setCreating] = useState(false);
    const [titleInput, setTitleInput] = useState('');
    const makeHref = (key: string, id?: string | null) =>
        `/quotes/${key}${id ? `?quoteId=${id}` : (quoteId ? `?quoteId=${quoteId}` : '')}`;

    const Tab = ({ keyName, label }: { keyName: ManagerServiceKey; label: string }) => (
        <button
            type="button"
            onClick={() => router.push(makeHref(keyName))}
            className={`px-3 py-1.5 text-xs rounded-md border ${active === keyName ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}
        >
            {label}
        </button>
    );

    useEffect(() => {
        const loadTodaysTitles = async () => {
            try {
                const { data: authData } = await supabase.auth.getUser();
                const user = (authData as any)?.user;
                const { start, end: next } = getKstDayUtcRange();
                let q = supabase.from('quote').select('id,title,created_at').gte('created_at', start).lt('created_at', next).order('created_at', { ascending: false });
                if (user?.id) q = q.eq('user_id', user.id);
                const { data } = await q;
                setTitlesToday(data || []);
            } catch { setTitlesToday([]); }
        };
        loadTodaysTitles();
    }, []);

    const onPickTitle = (id: string) => router.push(makeHref(active, id));
    const startNew = async () => {
        if (!titleInput.trim()) return alert('타이틀을 입력하세요');
        try {
            setCreating(true);
            const { data: authData, error: authErr } = await supabase.auth.getUser();
            if (authErr) return alert('로그인이 필요합니다.');
            const user = (authData as any)?.user;
            if (!user?.id) return alert('로그인이 필요합니다.');
            const resp = await supabase.from('quote').insert({ title: titleInput.trim(), status: 'draft', user_id: user.id }).select('id').single();
            if (resp.error || !resp.data?.id) return alert(`견적 생성 실패: ${resp.error?.message || '알 수 없는 오류'}`);
            router.push(makeHref(active, resp.data.id));
        } finally { setCreating(false); }
    };

    return (
        <div className="mb-2 w-full min-w-0 flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
                <div className="flex flex-wrap gap-1.5">
                    <Tab keyName="cruise" label="크루즈" />
                    <Tab keyName="airport" label="공항" />
                    <Tab keyName="hotel" label="호텔" />
                    <Tab keyName="rentcar" label="렌트카" />
                    <Tab keyName="tour" label="투어" />
                    <Tab keyName="package" label="패키지" />
                    <Tab keyName="comprehensive" label="전체" />
                </div>
                {pageRawRate !== null && pageRawRate !== undefined && (
                    <span className="text-[10px] text-gray-500 whitespace-nowrap">환율(DB raw): {pageRawRate}</span>
                )}
            </div>
            <div className="w-full min-w-0 grid grid-cols-2 gap-1.5">
                <select onChange={(e) => e.target.value && onPickTitle(e.target.value)} className="border h-8 px-2 rounded text-[11px] bg-white w-full min-w-0">
                    <option value="">오늘 작성한 타이틀 선택</option>
                    {titlesToday.map(t => (
                        <option key={t.id} value={t.id}>{t.title} — {new Date(t.created_at).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul' })}</option>
                    ))}
                </select>
                <input value={titleInput} onChange={(e) => setTitleInput(e.target.value)} placeholder="타이틀" className="border h-8 px-2 rounded text-[11px] w-full min-w-0" />
                <button
                    type="button"
                    onClick={startNew}
                    disabled={creating}
                    className="col-span-2 h-8 text-[11px] bg-green-600 text-white px-2 rounded text-center"
                    aria-label="작업 시작"
                >
                    {creating ? '생성중...' : '작업 시작'}
                </button>
            </div>
        </div>
    );
}
