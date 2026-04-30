'use client';

import { useEffect, useMemo, useState } from 'react';
import PartnerLayout from '@/components/PartnerLayout';
import SectionBox from '@/components/SectionBox';
import Spinner from '@/components/Spinner';
import { supabase } from '@/lib/supabase';

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
    partner?: { name: string };
    service?: { service_name: string };
}

const STATUS_LABEL: Record<string, string> = { pending: '대기', confirmed: '확정', cancelled: '취소', completed: '완료' };
const STATUS_COLOR: Record<string, string> = {
    pending: 'bg-yellow-50 text-yellow-700',
    confirmed: 'bg-green-50 text-green-700',
    cancelled: 'bg-gray-50 text-gray-500',
    completed: 'bg-blue-50 text-blue-700',
};

export default function AdminReservationsPage() {
    const [rows, setRows] = useState<Row[]>([]);
    const [partners, setPartners] = useState<{ partner_id: string; name: string }[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterPartner, setFilterPartner] = useState<string>('');
    const [filterStatus, setFilterStatus] = useState<string>('');

    const load = async () => {
        setLoading(true);
        const [resPartners, resRows] = await Promise.all([
            supabase.from('partner').select('partner_id, name').order('name'),
            supabase.from('partner_reservation').select(`
                pr_id, pr_user_id, pr_partner_id, checkin_date, checkout_date,
                nights, guest_count, room_count, total_price, status,
                contact_name, contact_phone, request_note, created_at,
                partner:pr_partner_id(name),
                service:pr_service_id(service_name)
            `).order('checkin_date', { ascending: false }),
        ]);
        setPartners((resPartners.data as any) || []);
        setRows((resRows.data as any) || []);
        setLoading(false);
    };

    useEffect(() => { load(); }, []);

    const filtered = useMemo(() => {
        return rows.filter(r =>
            (!filterPartner || r.pr_partner_id === filterPartner) &&
            (!filterStatus || r.status === filterStatus)
        );
    }, [rows, filterPartner, filterStatus]);

    const updateStatus = async (pr_id: string, status: string) => {
        const { error } = await supabase.from('partner_reservation').update({ status, updated_at: new Date().toISOString() }).eq('pr_id', pr_id);
        if (error) alert(error.message);
        else load();
    };

    return (
        <PartnerLayout title="🗂️ 전체 예약 조회" requiredRoles={['manager', 'admin']}>
            <SectionBox title="필터">
                <div className="flex gap-2 flex-wrap text-xs items-center">
                    <select value={filterPartner} onChange={(e) => setFilterPartner(e.target.value)}
                        className="px-2 py-1 rounded border border-gray-200 bg-white">
                        <option value="">업체 전체</option>
                        {partners.map(p => <option key={p.partner_id} value={p.partner_id}>{p.name}</option>)}
                    </select>
                    {['', 'pending', 'confirmed', 'completed', 'cancelled'].map(s => (
                        <button key={s} onClick={() => setFilterStatus(s)}
                            className={`px-3 py-1 rounded border ${filterStatus === s ? 'bg-blue-50 border-blue-300 text-blue-600' : 'bg-white border-gray-200 text-gray-600'}`}>
                            {s === '' ? '상태 전체' : STATUS_LABEL[s]}
                        </button>
                    ))}
                </div>
            </SectionBox>

            <SectionBox title={`예약 ${filtered.length}건`}>
                {loading ? <Spinner label="불러오는 중..." /> : filtered.length === 0 ? (
                    <div className="text-sm text-gray-500 text-center py-8">예약이 없습니다.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                            <thead className="bg-gray-50 text-gray-600">
                                <tr>
                                    <th className="px-2 py-2 text-left">업체</th>
                                    <th className="px-2 py-2 text-left">서비스</th>
                                    <th className="px-2 py-2 text-left">체크인</th>
                                    <th className="px-2 py-2 text-left">체크아웃</th>
                                    <th className="px-2 py-2 text-right">박/실/명</th>
                                    <th className="px-2 py-2 text-left">예약자</th>
                                    <th className="px-2 py-2 text-right">금액</th>
                                    <th className="px-2 py-2 text-center">상태</th>
                                    <th className="px-2 py-2 text-center">변경</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(r => (
                                    <tr key={r.pr_id} className="border-t border-gray-100 hover:bg-gray-50">
                                        <td className="px-2 py-2">{r.partner?.name || '-'}</td>
                                        <td className="px-2 py-2">{r.service?.service_name || '-'}</td>
                                        <td className="px-2 py-2">{r.checkin_date}</td>
                                        <td className="px-2 py-2">{r.checkout_date}</td>
                                        <td className="px-2 py-2 text-right">{r.nights}/{r.room_count}/{r.guest_count}</td>
                                        <td className="px-2 py-2">{r.contact_name || '-'}<br /><span className="text-gray-500">{r.contact_phone || ''}</span></td>
                                        <td className="px-2 py-2 text-right text-red-600 font-semibold">{Number(r.total_price).toLocaleString()}</td>
                                        <td className="px-2 py-2 text-center">
                                            <span className={`px-2 py-0.5 rounded ${STATUS_COLOR[r.status] || 'bg-gray-50'}`}>{STATUS_LABEL[r.status] || r.status}</span>
                                        </td>
                                        <td className="px-2 py-2 text-center">
                                            <select value={r.status} onChange={(e) => updateStatus(r.pr_id, e.target.value)}
                                                className="px-1 py-0.5 rounded border border-gray-200 bg-white text-xs">
                                                {Object.keys(STATUS_LABEL).map(k => <option key={k} value={k}>{STATUS_LABEL[k]}</option>)}
                                            </select>
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
