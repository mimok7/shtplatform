'use client';

import { useEffect, useMemo, useState } from 'react';
import PartnerLayout from '@/components/PartnerLayout';
import SectionBox from '@/components/SectionBox';
import Spinner from '@/components/Spinner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

interface Row { pr_id: string; checkin_date: string; nights: number; guest_count: number; service?: { service_name: string }; }

export default function PartnerCalendarPage() {
    const { profile, loading: authLoading } = useAuth(['partner', 'manager', 'admin'], '/partner/login');
    const [rows, setRows] = useState<Row[]>([]);
    const [loading, setLoading] = useState(true);
    const today = new Date();
    const [year, setYear] = useState(today.getFullYear());
    const [month, setMonth] = useState(today.getMonth() + 1);

    useEffect(() => {
        if (authLoading) return;
        let cancelled = false;
        (async () => {
            try {
                const start = `${year}-${String(month).padStart(2, '0')}-01`;
                const lastDay = new Date(year, month, 0).getDate();
                const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
                let q = supabase
                    .from('partner_reservation')
                    .select(`pr_id, checkin_date, nights, guest_count, service:pr_service_id(service_name)`)
                    .gte('checkin_date', start)
                    .lte('checkin_date', end)
                    .neq('status', 'cancelled');
                if (profile?.role === 'partner' && profile?.partner_id) {
                    q = q.eq('pr_partner_id', profile.partner_id);
                }
                const { data } = await q;
                if (cancelled) return;
                setRows((data as any) || []);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [authLoading, profile?.partner_id, profile?.role, year, month]);

    const grouped = useMemo(() => {
        const m = new Map<string, Row[]>();
        rows.forEach(r => {
            const key = r.checkin_date;
            if (!m.has(key)) m.set(key, []);
            m.get(key)!.push(r);
        });
        return m;
    }, [rows]);

    const lastDay = new Date(year, month, 0).getDate();
    const firstWeekday = new Date(year, month - 1, 1).getDay();

    const navigate = (delta: number) => {
        let m = month + delta;
        let y = year;
        if (m < 1) { m = 12; y--; }
        if (m > 12) { m = 1; y++; }
        setYear(y); setMonth(m); setLoading(true);
    };

    if (authLoading) return <PartnerLayout><Spinner /></PartnerLayout>;

    return (
        <PartnerLayout title="📅 월별 캘린더" requiredRoles={['partner', 'manager', 'admin']}>
            <SectionBox>
                <div className="flex justify-between items-center mb-3">
                    <button onClick={() => navigate(-1)} className="text-xs px-3 py-1 rounded border border-gray-200 bg-white">◀ 이전</button>
                    <div className="text-sm font-medium">{year}년 {month}월</div>
                    <button onClick={() => navigate(1)} className="text-xs px-3 py-1 rounded border border-gray-200 bg-white">다음 ▶</button>
                </div>
                {loading ? <Spinner label="불러오는 중..." /> : (
                    <div className="grid grid-cols-7 gap-1 text-xs">
                        {['일', '월', '화', '수', '목', '금', '토'].map(d => (
                            <div key={d} className="text-center text-gray-500 font-medium py-1">{d}</div>
                        ))}
                        {Array.from({ length: firstWeekday }).map((_, i) => (
                            <div key={`pad-${i}`} />
                        ))}
                        {Array.from({ length: lastDay }).map((_, i) => {
                            const day = i + 1;
                            const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                            const list = grouped.get(dateStr) || [];
                            return (
                                <div key={day} className="min-h-[80px] border border-gray-100 rounded p-1 bg-white">
                                    <div className="text-gray-700 font-medium">{day}</div>
                                    {list.slice(0, 3).map(r => (
                                        <div key={r.pr_id} className="text-[10px] text-blue-600 truncate" title={r.service?.service_name}>
                                            {r.service?.service_name || '예약'} ({r.guest_count}명)
                                        </div>
                                    ))}
                                    {list.length > 3 && <div className="text-[10px] text-gray-500">+{list.length - 3}건</div>}
                                </div>
                            );
                        })}
                    </div>
                )}
            </SectionBox>
        </PartnerLayout>
    );
}
