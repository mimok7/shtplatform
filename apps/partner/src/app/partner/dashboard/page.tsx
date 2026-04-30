'use client';

import { useEffect, useMemo, useState } from 'react';
import PartnerLayout from '@/components/PartnerLayout';
import SectionBox from '@/components/SectionBox';
import Spinner from '@/components/Spinner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

interface Row {
    pr_id: string;
    pr_user_id: string;
    pr_partner_id: string;
    checkin_date: string;
    checkout_date: string;
    nights: number;
    guest_count: number;
    room_count: number;
    total_price: number;
    status: string;
    contact_name?: string | null;
    contact_phone?: string | null;
    request_note?: string | null;
    created_at: string;
    service?: { service_name: string };
}

const STATUS_LABEL: Record<string, string> = {
    pending: '대기', confirmed: '확정', cancelled: '취소', completed: '완료',
};
const STATUS_COLOR: Record<string, string> = {
    pending: 'bg-yellow-50 text-yellow-700',
    confirmed: 'bg-green-50 text-green-700',
    cancelled: 'bg-gray-50 text-gray-500',
    completed: 'bg-blue-50 text-blue-700',
};

export default function PartnerDashboardPage() {
    const { profile, loading: authLoading } = useAuth(['partner', 'manager', 'admin'], '/partner/login');
    const [rows, setRows] = useState<Row[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<string>('');
    const [period, setPeriod] = useState<'all' | 'week' | 'month'>('month');

    useEffect(() => {
        if (authLoading) return;
        if (!profile?.partner_id && profile?.role === 'partner') { setLoading(false); return; }
        let cancelled = false;
        (async () => {
            try {
                let q = supabase
                    .from('partner_reservation')
                    .select(`
                        pr_id, pr_user_id, pr_partner_id, checkin_date, checkout_date,
                        nights, guest_count, room_count, total_price, status,
                        contact_name, contact_phone, request_note, created_at,
                        service:pr_service_id(service_name)
                    `)
                    .order('checkin_date', { ascending: false });
                // partner role: RLS가 자기 업체로 자동 필터. 명시적 필터도 추가
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
    }, [authLoading, profile?.partner_id, profile?.role]);

    const filtered = useMemo(() => {
        let r = rows;
        if (statusFilter) r = r.filter(x => x.status === statusFilter);
        if (period !== 'all') {
            const now = new Date();
            const limit = new Date();
            if (period === 'week') limit.setDate(now.getDate() + 7);
            else if (period === 'month') limit.setMonth(now.getMonth() + 1);
            r = r.filter(x => {
                const d = new Date(x.checkin_date);
                return d >= new Date(now.toISOString().slice(0, 10)) && d <= limit;
            });
        }
        return r;
    }, [rows, statusFilter, period]);

    if (authLoading) return <PartnerLayout><Spinner /></PartnerLayout>;

    return (
        <PartnerLayout title="📊 우리 업체 예약" requiredRoles={['partner', 'manager', 'admin']}>
            <SectionBox title="필터">
                <div className="flex gap-2 flex-wrap text-xs">
                    {(['all', 'week', 'month'] as const).map(p => (
                        <button key={p} onClick={() => setPeriod(p)}
                            className={`px-3 py-1 rounded border ${period === p ? 'bg-blue-50 border-blue-300 text-blue-600' : 'bg-white border-gray-200 text-gray-600'}`}>
                            {p === 'all' ? '전체' : p === 'week' ? '향후 7일' : '향후 30일'}
                        </button>
                    ))}
                    <span className="border-l border-gray-200 mx-2" />
                    {['', 'pending', 'confirmed', 'completed', 'cancelled'].map(s => (
                        <button key={s} onClick={() => setStatusFilter(s)}
                            className={`px-3 py-1 rounded border ${statusFilter === s ? 'bg-blue-50 border-blue-300 text-blue-600' : 'bg-white border-gray-200 text-gray-600'}`}>
                            {s === '' ? '상태 전체' : STATUS_LABEL[s]}
                        </button>
                    ))}
                </div>
            </SectionBox>

            <SectionBox title={`예약 ${filtered.length}건`}>
                {loading ? <Spinner label="불러오는 중..." /> : filtered.length === 0 ? (
                    <div className="text-sm text-gray-500 text-center py-8">조건에 맞는 예약이 없습니다.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                            <thead className="bg-gray-50 text-gray-600">
                                <tr>
                                    <th className="px-2 py-2 text-left">체크인</th>
                                    <th className="px-2 py-2 text-left">체크아웃</th>
                                    <th className="px-2 py-2 text-left">객실</th>
                                    <th className="px-2 py-2 text-right">박/실/명</th>
                                    <th className="px-2 py-2 text-left">예약자</th>
                                    <th className="px-2 py-2 text-left">연락처</th>
                                    <th className="px-2 py-2 text-left">요청사항</th>
                                    <th className="px-2 py-2 text-right">금액</th>
                                    <th className="px-2 py-2 text-center">상태</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(r => (
                                    <tr key={r.pr_id} className="border-t border-gray-100 hover:bg-gray-50">
                                        <td className="px-2 py-2">{r.checkin_date}</td>
                                        <td className="px-2 py-2">{r.checkout_date}</td>
                                        <td className="px-2 py-2">{r.service?.service_name || '-'}</td>
                                        <td className="px-2 py-2 text-right">{r.nights}/{r.room_count}/{r.guest_count}</td>
                                        <td className="px-2 py-2">{r.contact_name || '-'}</td>
                                        <td className="px-2 py-2">{r.contact_phone || '-'}</td>
                                        <td className="px-2 py-2 max-w-[200px] truncate" title={r.request_note || ''}>{r.request_note || '-'}</td>
                                        <td className="px-2 py-2 text-right text-red-600 font-semibold">{Number(r.total_price).toLocaleString()}</td>
                                        <td className="px-2 py-2 text-center">
                                            <span className={`px-2 py-0.5 rounded ${STATUS_COLOR[r.status] || 'bg-gray-50 text-gray-600'}`}>
                                                {STATUS_LABEL[r.status] || r.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </SectionBox>
        </PartnerLayout>
    );
}
