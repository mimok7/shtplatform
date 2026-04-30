'use client';

import { useEffect, useState } from 'react';
import PartnerLayout from '@/components/PartnerLayout';
import SectionBox from '@/components/SectionBox';
import Spinner from '@/components/Spinner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

interface Row {
    pr_id: string;
    pr_partner_id: string;
    checkin_date: string;
    checkout_date: string;
    nights: number;
    guest_count: number;
    room_count: number;
    total_price: number;
    status: string;
    created_at: string;
    partner?: { name: string };
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

export default function MyReservationsPage() {
    const { user, loading: authLoading } = useAuth(['member', 'partner', 'manager', 'admin'], '/partner/login');
    const [rows, setRows] = useState<Row[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user) return;
        let cancelled = false;
        (async () => {
            try {
                const { data } = await supabase
                    .from('partner_reservation')
                    .select(`
                        pr_id, pr_partner_id, checkin_date, checkout_date,
                        nights, guest_count, room_count, total_price, status, created_at,
                        partner:pr_partner_id(name),
                        service:pr_service_id(service_name)
                    `)
                    .eq('pr_user_id', user.id)
                    .order('created_at', { ascending: false });
                if (cancelled) return;
                setRows((data as any) || []);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [user]);

    if (authLoading) return <PartnerLayout><Spinner /></PartnerLayout>;

    return (
        <PartnerLayout title="📋 내 예약 내역" requiredRoles={['member', 'partner', 'manager', 'admin']}>
            <SectionBox>
                {loading ? <Spinner label="불러오는 중..." /> : rows.length === 0 ? (
                    <div className="text-sm text-gray-500 text-center py-8">예약 내역이 없습니다.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                            <thead className="bg-gray-50 text-gray-600">
                                <tr>
                                    <th className="px-2 py-2 text-left">호텔</th>
                                    <th className="px-2 py-2 text-left">객실</th>
                                    <th className="px-2 py-2 text-left">체크인</th>
                                    <th className="px-2 py-2 text-left">체크아웃</th>
                                    <th className="px-2 py-2 text-right">박/객실/인원</th>
                                    <th className="px-2 py-2 text-right">금액</th>
                                    <th className="px-2 py-2 text-center">상태</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map(r => (
                                    <tr key={r.pr_id} className="border-t border-gray-100 hover:bg-gray-50">
                                        <td className="px-2 py-2">{r.partner?.name || '-'}</td>
                                        <td className="px-2 py-2">{r.service?.service_name || '-'}</td>
                                        <td className="px-2 py-2">{r.checkin_date}</td>
                                        <td className="px-2 py-2">{r.checkout_date}</td>
                                        <td className="px-2 py-2 text-right">{r.nights}박 / {r.room_count}실 / {r.guest_count}명</td>
                                        <td className="px-2 py-2 text-right text-red-600 font-semibold">{Number(r.total_price).toLocaleString()}동</td>
                                        <td className="px-2 py-2 text-center">
                                            <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLOR[r.status] || 'bg-gray-50 text-gray-600'}`}>
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
