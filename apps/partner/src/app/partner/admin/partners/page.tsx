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
    branch_name?: string | null;
    category: string;
    region?: string | null;
    contact_name?: string | null;
    contact_phone?: string | null;
    is_active: boolean;
}

interface PartnerAccount {
    email: string;
    name?: string | null;
}

// 호텔 카테고리는 별도 시스템에서 관리되므로 제휴업체 등록 기본값에서 제외
const emptyForm: Partial<Partner> = { partner_code: '', name: '', category: 'restaurant', region: '', is_active: true };

export default function AdminPartnersPage() {
    const [rows, setRows] = useState<Partner[]>([]);
    const [accountMap, setAccountMap] = useState<Record<string, PartnerAccount[]>>({});
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState<Partial<Partner>>(emptyForm);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);

    const load = async () => {
        setLoading(true);
        const { data } = await supabase.from('partner').select('*').order('created_at', { ascending: false });
        const partners = (data as Partner[]) || [];
        setRows(partners);

        // 담당자 계정(이메일) 매핑 — partner_user → users
        try {
            const partnerIds = partners.map(p => p.partner_id);
            if (partnerIds.length > 0) {
                const { data: pus } = await supabase
                    .from('partner_user')
                    .select('pu_partner_id, pu_user_id, users:pu_user_id(email, name)')
                    .in('pu_partner_id', partnerIds);
                const map: Record<string, PartnerAccount[]> = {};
                (pus as any[] | null)?.forEach(row => {
                    const u = row.users;
                    if (!u?.email) return;
                    const list = map[row.pu_partner_id] || (map[row.pu_partner_id] = []);
                    list.push({ email: u.email, name: u.name });
                });
                setAccountMap(map);
            } else {
                setAccountMap({});
            }
        } catch {
            setAccountMap({});
        }

        setLoading(false);
    };

    useEffect(() => { load(); }, []);

    const save = async () => {
        setMsg(null);
        if (!form.partner_code || !form.name) { setMsg('코드와 이름은 필수입니다.'); return; }
        setSaving(true);
        try {
            const { error } = await supabase.from('partner').insert({
                partner_code: form.partner_code,
                name: form.name,
                category: form.category || 'restaurant',
                region: form.region || null,
                contact_name: form.contact_name || null,
                contact_phone: form.contact_phone || null,
                is_active: form.is_active ?? true,
            });
            if (error) throw error;
            setForm(emptyForm);
            setShowForm(false);
            await load();
        } catch (err: any) {
            setMsg(err?.message || '저장 실패');
        } finally {
            setSaving(false);
        }
    };

    return (
        <PartnerLayout title="🛠️ 제휴업체 목록" requiredRoles={['manager', 'admin']}>
            <div className="flex justify-end mb-2">
                <button onClick={() => setShowForm(v => !v)} className="text-xs px-3 py-1.5 rounded bg-blue-500 text-white hover:bg-blue-600">
                    {showForm ? '취소' : '+ 신규 등록'}
                </button>
            </div>

            {showForm && (
                <SectionBox title="신규 제휴업체">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                        <input placeholder="코드 (예: SOLCAFE-HL-001)" value={form.partner_code || ''} onChange={(e) => setForm({ ...form, partner_code: e.target.value })}
                            className="px-2 py-1 rounded border border-gray-200 bg-white" />
                        <input placeholder="업체명" value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })}
                            className="px-2 py-1 rounded border border-gray-200 bg-white" />
                        <select value={form.category || 'restaurant'} onChange={(e) => setForm({ ...form, category: e.target.value })}
                            className="px-2 py-1 rounded border border-gray-200 bg-white">
                            <option value="restaurant">식당</option>
                            <option value="spa">스파</option>
                            <option value="costume">의상대여</option>
                            <option value="tour">투어</option>
                            <option value="rentcar">렌터카</option>
                            {/* 호텔은 별도 시스템에서 관리 */}
                        </select>
                        <input placeholder="지역" value={form.region || ''} onChange={(e) => setForm({ ...form, region: e.target.value })}
                            className="px-2 py-1 rounded border border-gray-200 bg-white" />
                        <input placeholder="담당자명" value={form.contact_name || ''} onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
                            className="px-2 py-1 rounded border border-gray-200 bg-white" />
                        <input placeholder="연락처" value={form.contact_phone || ''} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
                            className="px-2 py-1 rounded border border-gray-200 bg-white" />
                    </div>
                    {msg && <div className="text-xs text-red-500 mt-2">{msg}</div>}
                    <div className="flex justify-end gap-2 mt-2">
                        <button onClick={save} disabled={saving} className="text-xs px-3 py-1.5 rounded bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50">
                            {saving ? '저장 중...' : '저장'}
                        </button>
                    </div>
                </SectionBox>
            )}

            <SectionBox title={`업체 ${rows.length}개`}>
                {loading ? <Spinner label="불러오는 중..." /> : rows.length === 0 ? (
                    <div className="text-sm text-gray-500 text-center py-8">등록된 업체가 없습니다.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                            <thead className="bg-gray-50 text-gray-600">
                                <tr>
                                    <th className="px-2 py-2 text-left">코드</th>
                                    <th className="px-2 py-2 text-left">업체명</th>
                                    <th className="px-2 py-2 text-left">카테고리</th>
                                    <th className="px-2 py-2 text-left">지역</th>
                                    <th className="px-2 py-2 text-left">담당자</th>
                                    <th className="px-2 py-2 text-center">상태</th>
                                    <th className="px-2 py-2 text-center">관리</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map(p => {
                                    const accounts = accountMap[p.partner_id] || [];
                                    return (
                                        <tr key={p.partner_id} className="border-t border-gray-100 hover:bg-gray-50 align-top">
                                            <td className="px-2 py-2 font-mono">{p.partner_code}</td>
                                            <td className="px-2 py-2">
                                                <div className="font-medium text-gray-800">{p.name}</div>
                                                {p.branch_name && <div className="text-[11px] text-gray-500">{p.branch_name}</div>}
                                            </td>
                                            <td className="px-2 py-2">{p.category}</td>
                                            <td className="px-2 py-2">{p.region || '-'}</td>
                                            <td className="px-2 py-2">
                                                {accounts.length > 0 ? (
                                                    <div className="flex flex-col gap-0.5">
                                                        {accounts.map(a => (
                                                            <div key={a.email} className="flex flex-col">
                                                                <span className="font-mono text-[11px] text-blue-700">{a.email}</span>
                                                                {a.name && <span className="text-[10px] text-gray-500">{a.name}</span>}
                                                            </div>
                                                        ))}
                                                        {(p.contact_name || p.contact_phone) && (
                                                            <div className="text-[10px] text-gray-400 mt-0.5">
                                                                {p.contact_name || ''}{p.contact_phone ? ` · ${p.contact_phone}` : ''}
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="text-gray-400">{p.contact_name || '-'}{p.contact_phone ? ` · ${p.contact_phone}` : ''}</span>
                                                )}
                                            </td>
                                            <td className="px-2 py-2 text-center">
                                                <span className={`px-2 py-0.5 rounded ${p.is_active ? 'bg-green-50 text-green-600' : 'bg-gray-50 text-gray-500'}`}>
                                                    {p.is_active ? '활성' : '비활성'}
                                                </span>
                                            </td>
                                            <td className="px-2 py-2 text-center">
                                                <Link href={`/partner/admin/partners/${p.partner_id}`} className="text-blue-600 hover:underline">상세</Link>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </SectionBox>

            {/* 초기 비밀번호 안내 — 페이지 하단 1회만 표시 */}
            {!loading && rows.length > 0 && (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                    <div className="font-semibold mb-1">🔑 제휴업체 계정 초기 비밀번호</div>
                    <div className="font-mono text-sm text-amber-900">partner1234!</div>
                    <div className="mt-1 text-[11px] text-amber-700">
                        각 업체 담당자에게 위 비밀번호를 안내하고, 최초 로그인 후 변경하도록 유도해 주세요.
                    </div>
                </div>
            )}
        </PartnerLayout>
    );
}
