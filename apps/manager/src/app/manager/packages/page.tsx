'use client';

import React, { useState, useEffect } from 'react';
import {
    Plus, Edit, Trash2, Package, Ship, Hotel, Car, MapPin, Plane,
    ChevronRight, Loader2, X, AlertCircle, CheckCircle2, Users, DollarSign
} from 'lucide-react';
import supabase from '@/lib/supabase';
import { PackageWithItems, PackageMaster, PackageItem } from '@/lib/types';
import ManagerLayout from '@/components/ManagerLayout';

const SERVICE_LABELS: Record<string, { label: string; icon: any; color: string }> = {
    cruise: { label: '크루즈', icon: Ship, color: 'bg-blue-50 text-blue-600 border-blue-200' },
    hotel: { label: '호텔', icon: Hotel, color: 'bg-purple-50 text-purple-600 border-purple-200' },
    airport: { label: '공항 픽업/샌딩', icon: Plane, color: 'bg-green-50 text-green-600 border-green-200' },
    tour: { label: '데이투어', icon: MapPin, color: 'bg-orange-50 text-orange-600 border-orange-200' },
    rentcar: { label: '렌트카', icon: Car, color: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
    car_sht: { label: 'SHT차량', icon: Car, color: 'bg-teal-50 text-teal-600 border-teal-200' },
};

function formatVND(val: number | string) {
    const n = typeof val === 'string' ? parseInt(val) : val;
    if (!n) return '';
    return n.toLocaleString('vi-VN') + '동';
}

export default function PackagesPage() {
    const [packages, setPackages] = useState<PackageWithItems[]>([]);
    const [loading, setLoading] = useState(true);
    const [opened, setOpened] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const [formData, setFormData] = useState<Partial<PackageMaster>>({
        name: '', package_code: '', base_price: 0, description: '', is_active: true, price_config: {}
    });
    const [formItems, setFormItems] = useState<Partial<PackageItem>[]>([]);
    const [availableCruises, setAvailableCruises] = useState<string[]>([]);
    const [availableRooms, setAvailableRooms] = useState<any[]>([]);
    const [availableTours, setAvailableTours] = useState<any[]>([]);
    const [availableHotels, setAvailableHotels] = useState<any[]>([]);

    useEffect(() => { fetchPackages(); loadServiceData(); }, []);

    const loadServiceData = async () => {
        try {
            const [roomRes, tourRes, hotelRes] = await Promise.all([
                supabase.from('cruise_rate_card').select('cruise_name, room_type, id').eq('is_active', true),
                supabase.from('tour').select('tour_name, tour_code, category, tour_id').eq('is_active', true),
                supabase.from('cruise_rate_card').select('cruise_name').eq('is_active', true).then(r => {
                    const names = Array.from(new Set((r.data || []).map((x: any) => x.cruise_name).filter(Boolean)));
                    return { data: names };
                })
            ]);
            if (roomRes.data) {
                const cruises = Array.from(new Set(roomRes.data.map((r: any) => r.cruise_name).filter(Boolean)));
                setAvailableCruises(cruises as string[]);
                setAvailableRooms(roomRes.data);
            }
            if (tourRes.data) setAvailableTours(tourRes.data);
            if (hotelRes.data) setAvailableHotels(hotelRes.data as any[]);
        } catch (e) { console.error('Error loading service data:', e); }
    };

    const fetchPackages = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('package_master')
                .select('*, items:package_items(*)')
                .order('created_at', { ascending: false });
            if (error) throw error;
            setPackages(data || []);
        } catch (error) { console.error('Error fetching packages:', error); }
        finally { setLoading(false); }
    };

    const handleCreate = () => {
        setFormData({ name: '', package_code: '', base_price: 0, description: '', is_active: true, price_config: {} });
        setFormItems([]);
        setOpened(true);
    };

    const handleEdit = (pkg: PackageWithItems) => {
        setFormData({
            id: pkg.id, name: pkg.name, package_code: pkg.package_code,
            base_price: pkg.base_price, description: pkg.description,
            is_active: pkg.is_active, price_config: pkg.price_config || {}
        });
        setFormItems(pkg.items?.sort((a, b) => a.item_order - b.item_order) || []);
        setOpened(true);
    };

    const addItem = () => {
        setFormItems([...formItems, { service_type: 'cruise', item_order: formItems.length + 1, description: '', default_data: {} }]);
    };
    const removeItem = (index: number) => setFormItems(formItems.filter((_, i) => i !== index));
    const updateItemType = (index: number, type: any) => {
        const newItems = [...formItems];
        newItems[index] = { ...newItems[index], service_type: type, default_data: {} };
        setFormItems(newItems);
    };
    const updateItemValue = (index: number, field: keyof PackageItem, value: any) => {
        const newItems = [...formItems];
        newItems[index] = { ...newItems[index], [field]: value };
        setFormItems(newItems);
    };
    const updateItemData = (index: number, field: string, value: any) => {
        const newItems = [...formItems];
        const defaultData = { ...(newItems[index].default_data || {}) };
        defaultData[field] = value;
        newItems[index] = { ...newItems[index], default_data: defaultData };
        setFormItems(newItems);
    };

    const updatePriceConfig = (pax: number, field: 'per_person' | 'total', value: number) => {
        const newConfig = { ...(formData.price_config || {}) };
        if (!newConfig[pax]) newConfig[pax] = { per_person: 0, total: 0 };
        if (field === 'per_person') {
            newConfig[pax].per_person = value;
            newConfig[pax].total = value * pax;
        } else {
            newConfig[pax].total = value;
            newConfig[pax].per_person = Math.floor(value / pax);
        }
        setFormData({ ...formData, price_config: newConfig });
    };

    const handleSave = async () => {
        if (!formData.package_code || !formData.name) { alert('필수 정보를 입력해주세요.'); return; }
        setSubmitting(true);
        try {
            let packageId = formData.id;
            if (packageId) {
                const { error } = await supabase.from('package_master').update({
                    package_code: formData.package_code, name: formData.name,
                    base_price: formData.base_price, description: formData.description,
                    price_config: formData.price_config, is_active: formData.is_active,
                    updated_at: new Date().toISOString()
                }).eq('id', packageId);
                if (error) throw error;
            } else {
                const { data, error } = await supabase.from('package_master').insert([{
                    package_code: formData.package_code, name: formData.name,
                    base_price: formData.base_price, description: formData.description,
                    price_config: formData.price_config, is_active: formData.is_active
                }]).select();
                if (error) throw error;
                if (!data?.length) throw new Error('데이터 저장 실패');
                packageId = data[0].id;
            }
            if (packageId) {
                const { error: delErr } = await supabase.from('package_items').delete().eq('package_id', packageId);
                if (delErr) throw new Error('기존 구성 삭제 오류: ' + delErr.message);
                if (formItems.length > 0) {
                    const itemsToInsert = formItems.map((item, idx) => ({
                        package_id: packageId, service_type: item.service_type,
                        item_order: idx + 1, description: item.description || '',
                        default_data: item.default_data || {}
                    }));
                    const { error } = await supabase.from('package_items').insert(itemsToInsert);
                    if (error) throw error;
                }
            }
            await fetchPackages();
            setOpened(false);
            alert('저장되었습니다.');
        } catch (error: any) {
            console.error('Save error:', error);
            alert('저장 중 오류: ' + (error.message || '알 수 없는 오류'));
        } finally { setSubmitting(false); }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('정말 삭제하시겠습니까?')) return;
        try {
            const { error } = await supabase.from('package_master').delete().eq('id', id);
            if (error) throw error;
            fetchPackages();
        } catch (error: any) { alert('삭제 실패: ' + error.message); }
    };

    // 구성 항목 상세 설정 렌더링
    const renderItemDetails = (item: Partial<PackageItem>, idx: number) => {
        const type = item.service_type;
        const data = item.default_data || {};

        switch (type) {
            case 'cruise':
                return (
                    <div className="grid grid-cols-2 gap-2 mt-2">
                        <div>
                            <label className="text-[10px] text-gray-400 font-bold">크루즈 선택</label>
                            <select className="w-full bg-white border border-gray-200 rounded-lg py-1.5 px-2 text-xs outline-none"
                                value={data.cruise_name || ''} onChange={e => updateItemData(idx, 'cruise_name', e.target.value)}>
                                <option value="">선택</option>
                                {availableCruises.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-[10px] text-gray-400 font-bold">객실 타입</label>
                            <select className="w-full bg-white border border-gray-200 rounded-lg py-1.5 px-2 text-xs outline-none"
                                value={data.room_code || ''} onChange={e => updateItemData(idx, 'room_code', e.target.value)}
                                disabled={!data.cruise_name}>
                                <option value="">선택</option>
                                {availableRooms.filter(r => r.cruise === data.cruise_name).map(r => (
                                    <option key={r.room_code} value={r.room_code}>{r.room_type} ({r.room_category})</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="text-[10px] text-gray-400 font-bold">일정 (박)</label>
                            <input type="number" className="w-full bg-white border border-gray-200 rounded-lg py-1.5 px-2 text-xs outline-none"
                                placeholder="1" value={data.nights || ''} onChange={e => updateItemData(idx, 'nights', e.target.value)} />
                        </div>
                        <div>
                            <label className="text-[10px] text-gray-400 font-bold">포함 식사</label>
                            <input type="text" className="w-full bg-white border border-gray-200 rounded-lg py-1.5 px-2 text-xs outline-none"
                                placeholder="조식, 중식, 석식" value={data.meals || ''} onChange={e => updateItemData(idx, 'meals', e.target.value)} />
                        </div>
                    </div>
                );
            case 'hotel':
                return (
                    <div className="grid grid-cols-2 gap-2 mt-2">
                        <div>
                            <label className="text-[10px] text-gray-400 font-bold">호텔명</label>
                            <input type="text" className="w-full bg-white border border-gray-200 rounded-lg py-1.5 px-2 text-xs outline-none"
                                placeholder="호텔명 입력" value={data.hotel_name || ''} onChange={e => updateItemData(idx, 'hotel_name', e.target.value)} />
                        </div>
                        <div>
                            <label className="text-[10px] text-gray-400 font-bold">등급</label>
                            <select className="w-full bg-white border border-gray-200 rounded-lg py-1.5 px-2 text-xs outline-none"
                                value={data.hotel_grade || ''} onChange={e => updateItemData(idx, 'hotel_grade', e.target.value)}>
                                <option value="">선택</option>
                                <option value="3성급">3성급</option>
                                <option value="4성급">4성급</option>
                                <option value="5성급">5성급</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-[10px] text-gray-400 font-bold">객실 타입</label>
                            <input type="text" className="w-full bg-white border border-gray-200 rounded-lg py-1.5 px-2 text-xs outline-none"
                                placeholder="디럭스, 스위트 등" value={data.room_type || ''} onChange={e => updateItemData(idx, 'room_type', e.target.value)} />
                        </div>
                        <div>
                            <label className="text-[10px] text-gray-400 font-bold">숙박 (박)</label>
                            <input type="number" className="w-full bg-white border border-gray-200 rounded-lg py-1.5 px-2 text-xs outline-none"
                                placeholder="1" value={data.nights || ''} onChange={e => updateItemData(idx, 'nights', e.target.value)} />
                        </div>
                        <div className="col-span-2">
                            <label className="text-[10px] text-gray-400 font-bold">포함사항</label>
                            <input type="text" className="w-full bg-white border border-gray-200 rounded-lg py-1.5 px-2 text-xs outline-none"
                                placeholder="조식 포함, 수영장, 피트니스 등" value={data.amenities || ''} onChange={e => updateItemData(idx, 'amenities', e.target.value)} />
                        </div>
                    </div>
                );
            case 'airport':
                return (
                    <div className="grid grid-cols-2 gap-2 mt-2">
                        <div>
                            <label className="text-[10px] text-gray-400 font-bold">서비스 유형</label>
                            <select className="w-full bg-white border border-gray-200 rounded-lg py-1.5 px-2 text-xs outline-none"
                                value={data.transfer_type || ''} onChange={e => updateItemData(idx, 'transfer_type', e.target.value)}>
                                <option value="">선택</option>
                                <option value="pickup">픽업 (공항→호텔)</option>
                                <option value="sending">샌딩 (호텔→공항)</option>
                                <option value="roundtrip">왕복 (픽업+샌딩)</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-[10px] text-gray-400 font-bold">차량 유형</label>
                            <select className="w-full bg-white border border-gray-200 rounded-lg py-1.5 px-2 text-xs outline-none"
                                value={data.vehicle_type || ''} onChange={e => updateItemData(idx, 'vehicle_type', e.target.value)}>
                                <option value="">선택</option>
                                <option value="sedan">세단 (4인 이하)</option>
                                <option value="suv">SUV (6인 이하)</option>
                                <option value="van">밴 (10인 이하)</option>
                                <option value="bus">버스 (10인 이상)</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-[10px] text-gray-400 font-bold">공항</label>
                            <input type="text" className="w-full bg-white border border-gray-200 rounded-lg py-1.5 px-2 text-xs outline-none"
                                placeholder="노이바이, 반돈 등" value={data.airport_name || ''} onChange={e => updateItemData(idx, 'airport_name', e.target.value)} />
                        </div>
                        <div>
                            <label className="text-[10px] text-gray-400 font-bold">가이드 동행</label>
                            <select className="w-full bg-white border border-gray-200 rounded-lg py-1.5 px-2 text-xs outline-none"
                                value={data.with_guide || ''} onChange={e => updateItemData(idx, 'with_guide', e.target.value)}>
                                <option value="">선택</option>
                                <option value="yes">포함</option>
                                <option value="no">미포함</option>
                            </select>
                        </div>
                    </div>
                );
            case 'tour':
                return (
                    <div className="grid grid-cols-2 gap-2 mt-2">
                        <div className="col-span-2">
                            <label className="text-[10px] text-gray-400 font-bold">투어 선택</label>
                            <select className="w-full bg-white border border-gray-200 rounded-lg py-1.5 px-2 text-xs outline-none"
                                value={data.tour_code || ''} onChange={e => updateItemData(idx, 'tour_code', e.target.value)}>
                                <option value="">선택</option>
                                {availableTours.map(t => (
                                    <option key={t.tour_code} value={t.tour_code}>{t.tour_name} ({t.tour_type})</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="text-[10px] text-gray-400 font-bold">소요 시간</label>
                            <input type="text" className="w-full bg-white border border-gray-200 rounded-lg py-1.5 px-2 text-xs outline-none"
                                placeholder="종일, 반일 등" value={data.duration || ''} onChange={e => updateItemData(idx, 'duration', e.target.value)} />
                        </div>
                        <div>
                            <label className="text-[10px] text-gray-400 font-bold">포함사항</label>
                            <input type="text" className="w-full bg-white border border-gray-200 rounded-lg py-1.5 px-2 text-xs outline-none"
                                placeholder="입장료, 중식, 가이드 등" value={data.includes || ''} onChange={e => updateItemData(idx, 'includes', e.target.value)} />
                        </div>
                    </div>
                );
            case 'rentcar':
                return (
                    <div className="grid grid-cols-2 gap-2 mt-2">
                        <div>
                            <label className="text-[10px] text-gray-400 font-bold">차량 종류</label>
                            <select className="w-full bg-white border border-gray-200 rounded-lg py-1.5 px-2 text-xs outline-none"
                                value={data.car_type || ''} onChange={e => updateItemData(idx, 'car_type', e.target.value)}>
                                <option value="">선택</option>
                                <option value="sedan">세단</option>
                                <option value="suv">SUV</option>
                                <option value="van">밴</option>
                                <option value="bus">미니버스</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-[10px] text-gray-400 font-bold">이용 일수</label>
                            <input type="number" className="w-full bg-white border border-gray-200 rounded-lg py-1.5 px-2 text-xs outline-none"
                                placeholder="1" value={data.rental_days || ''} onChange={e => updateItemData(idx, 'rental_days', e.target.value)} />
                        </div>
                        <div>
                            <label className="text-[10px] text-gray-400 font-bold">기사 포함</label>
                            <select className="w-full bg-white border border-gray-200 rounded-lg py-1.5 px-2 text-xs outline-none"
                                value={data.with_driver || ''} onChange={e => updateItemData(idx, 'with_driver', e.target.value)}>
                                <option value="">선택</option>
                                <option value="yes">포함</option>
                                <option value="no">미포함</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-[10px] text-gray-400 font-bold">유류비 포함</label>
                            <select className="w-full bg-white border border-gray-200 rounded-lg py-1.5 px-2 text-xs outline-none"
                                value={data.fuel_included || ''} onChange={e => updateItemData(idx, 'fuel_included', e.target.value)}>
                                <option value="">선택</option>
                                <option value="yes">포함</option>
                                <option value="no">미포함</option>
                            </select>
                        </div>
                    </div>
                );
            case 'car_sht':
                return (
                    <div className="grid grid-cols-2 gap-2 mt-2">
                        <div>
                            <label className="text-[10px] text-gray-400 font-bold">차량 배정</label>
                            <select className="w-full bg-white border border-gray-200 rounded-lg py-1.5 px-2 text-xs outline-none"
                                value={data.car_type || ''} onChange={e => updateItemData(idx, 'car_type', e.target.value)}>
                                <option value="">선택</option>
                                <option value="sedan">세단 (4인)</option>
                                <option value="suv7">SUV 7인승</option>
                                <option value="van16">밴 16인승</option>
                                <option value="bus29">버스 29인승</option>
                                <option value="bus45">버스 45인승</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-[10px] text-gray-400 font-bold">운행 구간</label>
                            <input type="text" className="w-full bg-white border border-gray-200 rounded-lg py-1.5 px-2 text-xs outline-none"
                                placeholder="하노이↔하롱, 시내 관광 등" value={data.route || ''} onChange={e => updateItemData(idx, 'route', e.target.value)} />
                        </div>
                        <div>
                            <label className="text-[10px] text-gray-400 font-bold">운행 일수</label>
                            <input type="number" className="w-full bg-white border border-gray-200 rounded-lg py-1.5 px-2 text-xs outline-none"
                                placeholder="1" value={data.days || ''} onChange={e => updateItemData(idx, 'days', e.target.value)} />
                        </div>
                        <div>
                            <label className="text-[10px] text-gray-400 font-bold">한국어 가이드</label>
                            <select className="w-full bg-white border border-gray-200 rounded-lg py-1.5 px-2 text-xs outline-none"
                                value={data.korean_guide || ''} onChange={e => updateItemData(idx, 'korean_guide', e.target.value)}>
                                <option value="">선택</option>
                                <option value="yes">포함</option>
                                <option value="no">미포함</option>
                            </select>
                        </div>
                    </div>
                );
            default: return null;
        }
    };

    return (
        <ManagerLayout title="📦 패키지 상품 관리" activeTab="packages">
            <div className="max-w-7xl mx-auto space-y-6">
                <div className="flex justify-between items-center">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-800">패키지 상품 관리</h2>
                        <p className="text-gray-500 text-sm">하이브리드 패키지 상품을 정의하고 관리합니다.</p>
                    </div>
                    <button onClick={handleCreate}
                        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-bold transition-colors shadow-sm">
                        <Plus size={20} /> 새 패키지 등록
                    </button>
                </div>

                {/* 패키지 목록 */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden relative">
                    {loading && (
                        <div className="absolute inset-0 bg-white/50 backdrop-blur-[2px] z-10 flex items-center justify-center">
                            <Loader2 className="animate-spin text-blue-600" size={32} />
                        </div>
                    )}
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-gray-50 border-b border-gray-200 text-xs font-bold text-gray-400 uppercase tracking-wider">
                                    <th className="px-6 py-4">패키지 코드</th>
                                    <th className="px-6 py-4">패키지 명</th>
                                    <th className="px-6 py-4">2인 기준가</th>
                                    <th className="px-6 py-4">구성 항목</th>
                                    <th className="px-6 py-4">상태</th>
                                    <th className="px-6 py-4 text-center">관리</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {packages.map((pkg) => {
                                    const price2 = pkg.price_config?.['2']?.per_person;
                                    return (
                                        <tr key={pkg.id} className="hover:bg-gray-50/50 transition-colors">
                                            <td className="px-6 py-4 font-mono text-sm text-blue-600 font-bold">{pkg.package_code}</td>
                                            <td className="px-6 py-4 font-bold text-gray-800">{pkg.name}</td>
                                            <td className="px-6 py-4 text-sm font-semibold">{price2 ? formatVND(price2) : (pkg.base_price?.toLocaleString() + ' VND')}</td>
                                            <td className="px-6 py-4">
                                                <div className="flex flex-wrap gap-1">
                                                    {pkg.items?.map((item, idx) => {
                                                        const svc = SERVICE_LABELS[item.service_type] || { label: item.service_type, color: 'bg-gray-50 text-gray-600 border-gray-200' };
                                                        return (
                                                            <span key={idx} className={`${svc.color} px-2 py-0.5 rounded text-[10px] font-bold border`}>
                                                                {svc.label}
                                                            </span>
                                                        );
                                                    })}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                {pkg.is_active ? (
                                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">판매중</span>
                                                ) : (
                                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">중단</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex justify-center gap-2">
                                                    <button onClick={() => handleEdit(pkg)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><Edit size={18} /></button>
                                                    <button onClick={() => handleDelete(pkg.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={18} /></button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                                {packages.length === 0 && !loading && (
                                    <tr><td colSpan={6} className="px-6 py-20 text-center text-gray-400">
                                        <div className="flex flex-col items-center"><AlertCircle size={48} className="mb-2 opacity-20" /><p>등록된 패키지가 없습니다.</p></div>
                                    </td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* ===== 모달 ===== */}
            {opened && (
                <div className="fixed inset-0 z-50 overflow-y-auto">
                    <div className="flex items-start justify-center min-h-screen px-4 pt-10 pb-20">
                        <div className="fixed inset-0 bg-gray-500/75 transition-opacity" onClick={() => setOpened(false)} />
                        <div className="relative inline-block bg-white rounded-2xl text-left shadow-xl w-full max-w-4xl">
                            {/* Header */}
                            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gradient-to-r from-blue-50 to-white rounded-t-2xl">
                                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                    <Package size={20} className="text-blue-600" />
                                    {formData.id ? '패키지 수정' : '새 패키지 등록'}
                                </h3>
                                <button onClick={() => setOpened(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
                            </div>

                            <div className="px-6 py-6 space-y-6 max-h-[75vh] overflow-y-auto">
                                {/* 기본 정보 */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="grid gap-1">
                                        <label className="text-xs font-bold text-gray-500">패키지 코드 *</label>
                                        <input className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                                            placeholder="PKG-GRAND-PIONIS" value={formData.package_code || ''}
                                            onChange={e => setFormData({ ...formData, package_code: e.target.value })} />
                                    </div>
                                    <div className="grid gap-1">
                                        <label className="text-xs font-bold text-gray-500">패키지 명 *</label>
                                        <input className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                                            placeholder="그랜드 파이어니스 풀패키지" value={formData.name || ''}
                                            onChange={e => setFormData({ ...formData, name: e.target.value })} />
                                    </div>
                                </div>
                                <div className="grid gap-1">
                                    <label className="text-xs font-bold text-gray-500">설명</label>
                                    <textarea className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none min-h-[60px]"
                                        placeholder="패키지 상세 설명을 입력하세요" value={formData.description || ''}
                                        onChange={e => setFormData({ ...formData, description: e.target.value })} />
                                </div>

                                {/* 인원별 가격표 */}
                                <div>
                                    <div className="flex items-center gap-2 mb-3">
                                        <DollarSign size={16} className="text-blue-600" />
                                        <label className="text-sm font-bold text-gray-700">인원별 가격 설정 (VND)</label>
                                    </div>
                                    <div className="bg-gradient-to-br from-blue-50/50 to-white rounded-xl border border-blue-100 overflow-hidden">
                                        <table className="w-full text-xs">
                                            <thead>
                                                <tr className="bg-blue-100/60 text-blue-700 font-bold">
                                                    <th className="px-3 py-2.5 text-left w-24">여행 인원</th>
                                                    <th className="px-3 py-2.5 text-left">기준</th>
                                                    <th className="px-3 py-2.5 text-left">1인당 요금 (VND)</th>
                                                    <th className="px-3 py-2.5 text-left">총 합계 (VND)</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-blue-50">
                                                {[2, 3, 4, 5, 6, 7, 8, 9, 10].map(pax => (
                                                    <tr key={pax} className="hover:bg-blue-50/30">
                                                        <td className="px-3 py-2 font-bold text-gray-700 flex items-center gap-1">
                                                            <Users size={12} className="text-blue-400" /> {pax}인
                                                        </td>
                                                        <td className="px-3 py-2 text-gray-400">1인당</td>
                                                        <td className="px-3 py-2">
                                                            <input type="number" className="w-full bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-blue-300"
                                                                placeholder="0" value={formData.price_config?.[pax]?.per_person || ''}
                                                                onChange={e => updatePriceConfig(pax, 'per_person', Number(e.target.value))} />
                                                        </td>
                                                        <td className="px-3 py-2">
                                                            <span className="font-bold text-blue-700">
                                                                {formData.price_config?.[pax]?.total ? formatVND(formData.price_config[pax].total) : '-'}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* 구성 서비스 */}
                                <div>
                                    <div className="flex justify-between items-center mb-3">
                                        <div className="flex items-center gap-2">
                                            <CheckCircle2 size={16} className="text-blue-600" />
                                            <label className="text-sm font-bold text-gray-700">구성 서비스 항목</label>
                                            <span className="text-xs text-gray-400">({formItems.length}개)</span>
                                        </div>
                                        <button onClick={addItem} className="text-xs text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg font-bold border border-blue-200">
                                            + 항목 추가
                                        </button>
                                    </div>

                                    <div className="space-y-3">
                                        {formItems.map((item, idx) => {
                                            const svc = SERVICE_LABELS[item.service_type || 'cruise'];
                                            const IconComp = svc?.icon || Package;
                                            return (
                                                <div key={idx} className={`p-4 rounded-xl border-2 space-y-2 ${svc?.color || 'bg-gray-50 border-gray-200'} bg-opacity-30`}
                                                    style={{ backgroundColor: 'white' }}>
                                                    <div className="flex gap-2 items-center">
                                                        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-gray-200 text-gray-600 text-[10px] font-bold">{idx + 1}</span>
                                                        <IconComp size={16} className="text-gray-500" />
                                                        <select className="flex-1 bg-white border border-gray-200 rounded-lg py-1.5 px-2 text-sm outline-none font-bold"
                                                            value={item.service_type} onChange={e => updateItemType(idx, e.target.value)}>
                                                            {Object.entries(SERVICE_LABELS).map(([k, v]) => (
                                                                <option key={k} value={k}>{v.label}</option>
                                                            ))}
                                                        </select>
                                                        <button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600 p-1 hover:bg-red-50 rounded-lg transition-colors">
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </div>

                                                    {/* 서비스별 상세 설정 */}
                                                    {renderItemDetails(item, idx)}

                                                    {/* 공통: 설명 */}
                                                    <div className="mt-2 pt-2 border-t border-gray-100">
                                                        <input type="text" className="w-full bg-gray-50 border border-gray-200 rounded-lg py-1.5 px-2 text-xs outline-none"
                                                            placeholder="서비스 요약 설명 (예: 앰배서더 시그니처 크루즈 1박 2일)"
                                                            value={item.description || ''} onChange={e => updateItemValue(idx, 'description', e.target.value)} />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                        {formItems.length === 0 && (
                                            <div className="text-center py-8 text-xs text-gray-400 italic border-2 border-dashed border-gray-200 rounded-xl">
                                                <Package size={24} className="mx-auto mb-2 opacity-30" />
                                                항목을 추가해주세요.
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Footer */}
                            <div className="bg-gray-50 px-6 py-4 flex justify-between items-center rounded-b-2xl border-t border-gray-100">
                                <label className="flex items-center gap-2 text-sm">
                                    <input type="checkbox" checked={formData.is_active ?? true}
                                        onChange={e => setFormData({ ...formData, is_active: e.target.checked })}
                                        className="rounded border-gray-300" />
                                    <span className="text-gray-600 font-bold">판매 활성화</span>
                                </label>
                                <div className="flex gap-3">
                                    <button onClick={() => setOpened(false)}
                                        className="px-4 py-2 border border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-100">취소</button>
                                    <button disabled={submitting} onClick={handleSave}
                                        className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-md shadow-blue-100 disabled:bg-gray-300">
                                        {submitting ? '저장 중...' : '저장하기'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </ManagerLayout>
    );
}
