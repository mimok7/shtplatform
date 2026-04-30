'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import PartnerLayout from '@/components/PartnerLayout';
import SectionBox from '@/components/SectionBox';
import Spinner from '@/components/Spinner';
import { supabase } from '@/lib/supabase';

interface Partner {
    partner_id: string;
    partner_code: string;
    name: string;
    category: string;
    region?: string | null;
    address?: string | null;
    contact_name?: string | null;
    contact_phone?: string | null;
    contact_email?: string | null;
    description?: string | null;
    is_active: boolean;
}
interface Service {
    service_id: string;
    service_name: string;
    service_type: string;
    capacity?: number | null;
    default_price: number;
    is_active: boolean;
}
interface Price {
    price_code: string;
    service_id: string;
    valid_from?: string | null;
    valid_to?: string | null;
    price: number;
    condition_label?: string | null;
}
interface PartnerUser { pu_id: string; pu_user_id: string; role: string; }

export default function PartnerDetailAdminPage() {
    const params = useParams();
    const partnerId = String(params?.partnerId || '');
    const [tab, setTab] = useState<'info' | 'services' | 'prices' | 'users'>('info');
    const [partner, setPartner] = useState<Partner | null>(null);
    const [services, setServices] = useState<Service[]>([]);
    const [prices, setPrices] = useState<Price[]>([]);
    const [users, setUsers] = useState<PartnerUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [msg, setMsg] = useState<string | null>(null);

    // forms
    const [svcForm, setSvcForm] = useState({ service_name: '', service_type: 'room', capacity: 2, default_price: 0 });
    const [priceForm, setPriceForm] = useState({ price_code: '', service_id: '', valid_from: '', valid_to: '', price: 0, condition_label: '' });
    const [userForm, setUserForm] = useState({ email: '', role: 'staff' });

    const load = async () => {
        setLoading(true);
        const [pRes, sRes, uRes] = await Promise.all([
            supabase.from('partner').select('*').eq('partner_id', partnerId).maybeSingle(),
            supabase.from('partner_service').select('*').eq('partner_id', partnerId).order('service_name'),
            supabase.from('partner_user').select('*').eq('pu_partner_id', partnerId),
        ]);
        setPartner((pRes.data as Partner) || null);
        const ss = (sRes.data as Service[]) || [];
        setServices(ss);
        setUsers((uRes.data as PartnerUser[]) || []);
        if (ss.length > 0) {
            const ids = ss.map(s => s.service_id);
            const { data } = await supabase.from('partner_price').select('*').in('service_id', ids);
            setPrices((data as Price[]) || []);
        } else {
            setPrices([]);
        }
        setLoading(false);
    };

    useEffect(() => { if (partnerId) load(); }, [partnerId]);

    const updatePartner = async () => {
        if (!partner) return;
        setMsg(null);
        const { error } = await supabase.from('partner').update({
            name: partner.name, region: partner.region, address: partner.address,
            contact_name: partner.contact_name, contact_phone: partner.contact_phone,
            contact_email: partner.contact_email, description: partner.description, is_active: partner.is_active,
            updated_at: new Date().toISOString(),
        }).eq('partner_id', partnerId);
        setMsg(error ? `저장 실패: ${error.message}` : '저장됨');
    };

    const addService = async () => {
        if (!svcForm.service_name) { setMsg('서비스명 필수'); return; }
        const { error } = await supabase.from('partner_service').insert({ partner_id: partnerId, ...svcForm });
        if (error) { setMsg(error.message); return; }
        setSvcForm({ service_name: '', service_type: 'room', capacity: 2, default_price: 0 });
        load();
    };

    const addPrice = async () => {
        if (!priceForm.price_code || !priceForm.service_id) { setMsg('가격 코드/서비스 필수'); return; }
        const { error } = await supabase.from('partner_price').insert({
            ...priceForm,
            valid_from: priceForm.valid_from || null,
            valid_to: priceForm.valid_to || null,
        });
        if (error) { setMsg(error.message); return; }
        setPriceForm({ price_code: '', service_id: '', valid_from: '', valid_to: '', price: 0, condition_label: '' });
        load();
    };

    const addUser = async () => {
        if (!userForm.email) { setMsg('이메일 필수'); return; }
        // users 테이블에서 email로 user.id 조회
        const { data: u } = await supabase.from('users').select('id').eq('email', userForm.email).maybeSingle();
        if (!u) { setMsg('사용자를 찾을 수 없습니다 (먼저 회원가입 필요)'); return; }
        const { error } = await supabase.from('partner_user').insert({
            pu_user_id: u.id, pu_partner_id: partnerId, role: userForm.role,
        });
        if (error) { setMsg(error.message); return; }
        // role도 partner로 변경
        await supabase.from('users').update({ role: 'partner' }).eq('id', u.id);
        setUserForm({ email: '', role: 'staff' });
        load();
    };

    const removeUser = async (pu_id: string) => {
        if (!confirm('담당자 매핑을 삭제하시겠습니까?')) return;
        await supabase.from('partner_user').delete().eq('pu_id', pu_id);
        load();
    };

    if (loading) return <PartnerLayout requiredRoles={['manager', 'admin']}><Spinner /></PartnerLayout>;
    if (!partner) return <PartnerLayout requiredRoles={['manager', 'admin']}><div className="text-sm text-gray-500">업체를 찾을 수 없습니다.</div></PartnerLayout>;

    return (
        <PartnerLayout title={`🛠️ ${partner.name}`} requiredRoles={['manager', 'admin']}>
            <div className="flex gap-2 mb-3 text-xs">
                {[['info', '기본정보'], ['services', '서비스'], ['prices', '가격'], ['users', '담당자']].map(([k, label]) => (
                    <button key={k} onClick={() => setTab(k as any)}
                        className={`px-3 py-1.5 rounded border ${tab === k ? 'bg-blue-50 border-blue-300 text-blue-600' : 'bg-white border-gray-200 text-gray-600'}`}>
                        {label}
                    </button>
                ))}
            </div>
            {msg && <div className="text-xs text-red-500 mb-2">{msg}</div>}

            {tab === 'info' && (
                <SectionBox title="기본 정보">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                        <label><div className="text-xs text-gray-500">코드</div><input disabled value={partner.partner_code} className="w-full px-2 py-1 rounded border border-gray-200 bg-gray-100" /></label>
                        <label><div className="text-xs text-gray-500">업체명</div><input value={partner.name} onChange={(e) => setPartner({ ...partner, name: e.target.value })} className="w-full px-2 py-1 rounded border border-gray-200 bg-white" /></label>
                        <label><div className="text-xs text-gray-500">지역</div><input value={partner.region || ''} onChange={(e) => setPartner({ ...partner, region: e.target.value })} className="w-full px-2 py-1 rounded border border-gray-200 bg-white" /></label>
                        <label><div className="text-xs text-gray-500">주소</div><input value={partner.address || ''} onChange={(e) => setPartner({ ...partner, address: e.target.value })} className="w-full px-2 py-1 rounded border border-gray-200 bg-white" /></label>
                        <label><div className="text-xs text-gray-500">담당자</div><input value={partner.contact_name || ''} onChange={(e) => setPartner({ ...partner, contact_name: e.target.value })} className="w-full px-2 py-1 rounded border border-gray-200 bg-white" /></label>
                        <label><div className="text-xs text-gray-500">연락처</div><input value={partner.contact_phone || ''} onChange={(e) => setPartner({ ...partner, contact_phone: e.target.value })} className="w-full px-2 py-1 rounded border border-gray-200 bg-white" /></label>
                        <label><div className="text-xs text-gray-500">이메일</div><input value={partner.contact_email || ''} onChange={(e) => setPartner({ ...partner, contact_email: e.target.value })} className="w-full px-2 py-1 rounded border border-gray-200 bg-white" /></label>
                        <label className="flex items-center gap-2 mt-5"><input type="checkbox" checked={partner.is_active} onChange={(e) => setPartner({ ...partner, is_active: e.target.checked })} /><span className="text-xs">활성</span></label>
                    </div>
                    <textarea rows={3} placeholder="설명" value={partner.description || ''} onChange={(e) => setPartner({ ...partner, description: e.target.value })} className="w-full px-2 py-1 rounded border border-gray-200 bg-white text-sm mt-2" />
                    <div className="flex justify-end mt-2">
                        <button onClick={updatePartner} className="text-xs px-3 py-1.5 rounded bg-blue-500 text-white hover:bg-blue-600">저장</button>
                    </div>
                </SectionBox>
            )}

            {tab === 'services' && (
                <>
                    <SectionBox title="서비스 추가">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                            <input placeholder="서비스명" value={svcForm.service_name} onChange={(e) => setSvcForm({ ...svcForm, service_name: e.target.value })} className="px-2 py-1 rounded border border-gray-200 bg-white" />
                            <input placeholder="타입(room/suite)" value={svcForm.service_type} onChange={(e) => setSvcForm({ ...svcForm, service_type: e.target.value })} className="px-2 py-1 rounded border border-gray-200 bg-white" />
                            <input type="number" placeholder="정원" value={svcForm.capacity} onChange={(e) => setSvcForm({ ...svcForm, capacity: Number(e.target.value) })} className="px-2 py-1 rounded border border-gray-200 bg-white" />
                            <input type="number" placeholder="기본가" value={svcForm.default_price} onChange={(e) => setSvcForm({ ...svcForm, default_price: Number(e.target.value) })} className="px-2 py-1 rounded border border-gray-200 bg-white" />
                        </div>
                        <div className="flex justify-end mt-2"><button onClick={addService} className="text-xs px-3 py-1.5 rounded bg-blue-500 text-white">추가</button></div>
                    </SectionBox>
                    <SectionBox title={`서비스 ${services.length}개`}>
                        <table className="w-full text-xs">
                            <thead className="bg-gray-50 text-gray-600">
                                <tr><th className="px-2 py-2 text-left">서비스명</th><th className="px-2 py-2 text-left">타입</th><th className="px-2 py-2 text-right">정원</th><th className="px-2 py-2 text-right">기본가</th><th className="px-2 py-2 text-center">상태</th></tr>
                            </thead>
                            <tbody>
                                {services.map(s => (
                                    <tr key={s.service_id} className="border-t border-gray-100">
                                        <td className="px-2 py-2">{s.service_name}</td>
                                        <td className="px-2 py-2">{s.service_type}</td>
                                        <td className="px-2 py-2 text-right">{s.capacity ?? '-'}</td>
                                        <td className="px-2 py-2 text-right">{Number(s.default_price).toLocaleString()}</td>
                                        <td className="px-2 py-2 text-center">{s.is_active ? '활성' : '비활성'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </SectionBox>
                </>
            )}

            {tab === 'prices' && (
                <>
                    <SectionBox title="가격 추가">
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                            <input placeholder="가격 코드 (UNIQUE)" value={priceForm.price_code} onChange={(e) => setPriceForm({ ...priceForm, price_code: e.target.value })} className="px-2 py-1 rounded border border-gray-200 bg-white" />
                            <select value={priceForm.service_id} onChange={(e) => setPriceForm({ ...priceForm, service_id: e.target.value })} className="px-2 py-1 rounded border border-gray-200 bg-white">
                                <option value="">서비스 선택</option>
                                {services.map(s => <option key={s.service_id} value={s.service_id}>{s.service_name}</option>)}
                            </select>
                            <input placeholder="조건(주중/주말 등)" value={priceForm.condition_label} onChange={(e) => setPriceForm({ ...priceForm, condition_label: e.target.value })} className="px-2 py-1 rounded border border-gray-200 bg-white" />
                            <input type="date" placeholder="시작일" value={priceForm.valid_from} onChange={(e) => setPriceForm({ ...priceForm, valid_from: e.target.value })} className="px-2 py-1 rounded border border-gray-200 bg-white" />
                            <input type="date" placeholder="종료일" value={priceForm.valid_to} onChange={(e) => setPriceForm({ ...priceForm, valid_to: e.target.value })} className="px-2 py-1 rounded border border-gray-200 bg-white" />
                            <input type="number" placeholder="가격" value={priceForm.price} onChange={(e) => setPriceForm({ ...priceForm, price: Number(e.target.value) })} className="px-2 py-1 rounded border border-gray-200 bg-white" />
                        </div>
                        <div className="flex justify-end mt-2"><button onClick={addPrice} className="text-xs px-3 py-1.5 rounded bg-blue-500 text-white">추가</button></div>
                    </SectionBox>
                    <SectionBox title={`가격 ${prices.length}건`}>
                        <table className="w-full text-xs">
                            <thead className="bg-gray-50 text-gray-600">
                                <tr><th className="px-2 py-2 text-left">코드</th><th className="px-2 py-2 text-left">서비스</th><th className="px-2 py-2 text-left">조건</th><th className="px-2 py-2 text-left">기간</th><th className="px-2 py-2 text-right">가격</th></tr>
                            </thead>
                            <tbody>
                                {prices.map(p => {
                                    const sName = services.find(s => s.service_id === p.service_id)?.service_name || '-';
                                    return (
                                        <tr key={p.price_code} className="border-t border-gray-100">
                                            <td className="px-2 py-2 font-mono">{p.price_code}</td>
                                            <td className="px-2 py-2">{sName}</td>
                                            <td className="px-2 py-2">{p.condition_label || '-'}</td>
                                            <td className="px-2 py-2">{p.valid_from || '~'} ~ {p.valid_to || '~'}</td>
                                            <td className="px-2 py-2 text-right">{Number(p.price).toLocaleString()}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </SectionBox>
                </>
            )}

            {tab === 'users' && (
                <>
                    <SectionBox title="담당자 매핑 추가">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
                            <input placeholder="이메일 (가입된 사용자)" value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} className="px-2 py-1 rounded border border-gray-200 bg-white" />
                            <select value={userForm.role} onChange={(e) => setUserForm({ ...userForm, role: e.target.value })} className="px-2 py-1 rounded border border-gray-200 bg-white">
                                <option value="staff">직원</option>
                                <option value="manager">매니저</option>
                            </select>
                            <button onClick={addUser} className="text-xs px-3 py-1.5 rounded bg-blue-500 text-white">매핑 추가</button>
                        </div>
                        <div className="text-xs text-gray-500 mt-1">※ 매핑 시 해당 사용자의 role이 'partner'로 변경됩니다.</div>
                    </SectionBox>
                    <SectionBox title={`담당자 ${users.length}명`}>
                        {users.length === 0 ? <div className="text-sm text-gray-500">매핑된 담당자가 없습니다.</div> : (
                            <table className="w-full text-xs">
                                <thead className="bg-gray-50 text-gray-600">
                                    <tr><th className="px-2 py-2 text-left">사용자 ID</th><th className="px-2 py-2 text-left">역할</th><th className="px-2 py-2 text-center">관리</th></tr>
                                </thead>
                                <tbody>
                                    {users.map(u => (
                                        <tr key={u.pu_id} className="border-t border-gray-100">
                                            <td className="px-2 py-2 font-mono">{u.pu_user_id}</td>
                                            <td className="px-2 py-2">{u.role}</td>
                                            <td className="px-2 py-2 text-center">
                                                <button onClick={() => removeUser(u.pu_id)} className="text-red-500 hover:underline">삭제</button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </SectionBox>
                </>
            )}
        </PartnerLayout>
    );
}
