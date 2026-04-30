'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import PartnerLayout from '@/components/PartnerLayout';
import SectionBox from '@/components/SectionBox';
import Spinner from '@/components/Spinner';
import { supabase } from '@/lib/supabase';

interface Partner {
    partner_id: string;
    partner_code: string;
    name: string;
    region?: string | null;
    description?: string | null;
}

export default function BookingListPage() {
    const [partners, setPartners] = useState<Partner[]>([]);
    const [loading, setLoading] = useState(true);
    const [region, setRegion] = useState<string>('');

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const { data } = await supabase
                    .from('partner')
                    .select('partner_id, partner_code, name, region, description')
                    .eq('is_active', true)
                    .eq('category', 'hotel')
                    .order('name');
                if (cancelled) return;
                setPartners((data as Partner[]) || []);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const filtered = region ? partners.filter(p => (p.region || '').includes(region)) : partners;
    const regions = Array.from(new Set(partners.map(p => p.region).filter(Boolean))) as string[];

    return (
        <PartnerLayout title="🏨 제휴 호텔 둘러보기" requiredRoles={['member', 'partner', 'manager', 'admin']}>
            <SectionBox title="지역 필터">
                <div className="flex gap-2 flex-wrap">
                    <button
                        onClick={() => setRegion('')}
                        className={`text-xs px-3 py-1 rounded border ${region === '' ? 'bg-blue-50 border-blue-300 text-blue-600' : 'bg-white border-gray-200 text-gray-600'}`}
                    >전체</button>
                    {regions.map(r => (
                        <button
                            key={r}
                            onClick={() => setRegion(r)}
                            className={`text-xs px-3 py-1 rounded border ${region === r ? 'bg-blue-50 border-blue-300 text-blue-600' : 'bg-white border-gray-200 text-gray-600'}`}
                        >{r}</button>
                    ))}
                </div>
            </SectionBox>

            <SectionBox title={`호텔 ${filtered.length}개`}>
                {loading ? (
                    <Spinner label="불러오는 중..." />
                ) : filtered.length === 0 ? (
                    <div className="text-sm text-gray-500 text-center py-8">등록된 호텔이 없습니다.</div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {filtered.map(p => (
                            <Link
                                key={p.partner_id}
                                href={`/partner/booking/${p.partner_id}`}
                                className="block p-4 bg-white border border-gray-200 rounded hover:border-blue-300 hover:shadow-sm transition"
                            >
                                <div className="text-sm font-medium text-gray-800">{p.name}</div>
                                <div className="text-xs text-gray-500 mt-1">{p.region || '-'}</div>
                                {p.description && (
                                    <div className="text-xs text-gray-600 mt-2 line-clamp-2">{p.description}</div>
                                )}
                            </Link>
                        ))}
                    </div>
                )}
            </SectionBox>
        </PartnerLayout>
    );
}
