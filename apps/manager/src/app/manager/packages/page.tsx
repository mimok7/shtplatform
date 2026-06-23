'use client';
// 패키지 상품을 정의하고 구성 항목 및 가격을 관리하는 관리자용 페이지

import React, { useState, useEffect, useMemo } from 'react';
import {
    Plus, Edit, Trash2, Package, Ship, Hotel, Car, MapPin, Plane,
    ChevronRight, Loader2, X, AlertCircle, CheckCircle2, Users, DollarSign,
    Settings2, RefreshCw, Filter, List, Save
} from 'lucide-react';
import supabase from '@/lib/supabase';
import { PackageWithItems, PackageMaster, PackageItem } from '@/lib/types';
import ManagerLayout from '@/components/ManagerLayout';
import { openCentralReservationDetailModal } from '@/contexts/reservationDetailModalEvents';

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
    if (!n) return '0동';
    return n.toLocaleString('vi-VN') + '동';
}

type PageTab = 'settings' | 'reservations';

export default function PackagesPage() {
    const [packages, setPackages] = useState<PackageWithItems[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [pageTab, setPageTab] = useState<PageTab>('settings');

    const [selectedPackageId, setSelectedPackageId] = useState<string>('');
    const [formData, setFormData] = useState<Partial<PackageMaster>>({
        name: '', package_code: '', base_price: 0, description: '', is_active: true, price_config: {}
    });
    const [formItems, setFormItems] = useState<Partial<PackageItem>[]>([]);

    const [availableCruises, setAvailableCruises] = useState<string[]>([]);
    const [availableRooms, setAvailableRooms] = useState<any[]>([]);
    const [availableTours, setAvailableTours] = useState<any[]>([]);

    // 예약내역 관련 상태
    const [usageRows, setUsageRows] = useState<any[]>([]);
    const [usageLoading, setUsageLoading] = useState(false);
    const [usageFilterPackageId, setUsageFilterPackageId] = useState<string>('all');

    const [error, setError] = useState('');
    const [message, setMessage] = useState('');

    const selectedPackage = useMemo(
        () => packages.find((pkg) => pkg.id === selectedPackageId) || null,
        [packages, selectedPackageId]
    );

    const filteredUsageRows = useMemo(() => {
        if (usageFilterPackageId === 'all') return usageRows;
        return usageRows.filter((row) => row.package_id === usageFilterPackageId);
    }, [usageRows, usageFilterPackageId]);

    useEffect(() => {
        void loadInitialData();
    }, []);

    const loadInitialData = async () => {
        setLoading(true);
        try {
            await loadServiceData();
            await loadPackages();
        } catch (e) {
            console.error('Error loading initial data:', e);
        } finally {
            setLoading(false);
        }
    };

    const loadServiceData = async () => {
        try {
            const [roomRes, tourRes] = await Promise.all([
                supabase.from('cruise_rate_card').select('cruise_name, room_type, id').eq('is_active', true),
                supabase.from('tour').select('tour_name, tour_code, category, tour_id').eq('is_active', true)
            ]);
            if (roomRes.data) {
                const cruises = Array.from(new Set(roomRes.data.map((r: any) => r.cruise_name).filter(Boolean)));
                setAvailableCruises(cruises as string[]);
                setAvailableRooms(roomRes.data);
            }
            if (tourRes.data) setAvailableTours(tourRes.data);
        } catch (e) {
            console.error('Error loading service data:', e);
        }
    };

    const loadPackages = async (preferredId?: string) => {
        try {
            const { data, error: pkgErr } = await supabase
                .from('package_master')
                .select('*, items:package_items(*)')
                .order('created_at', { ascending: false });
            if (pkgErr) throw pkgErr;

            const list = (data || []) as PackageWithItems[];
            setPackages(list);

            const nextSelectedId = preferredId ?? selectedPackageId ?? list[0]?.id ?? '';
            setSelectedPackageId(nextSelectedId);

            const nextSelected = list.find((pkg) => pkg.id === nextSelectedId);
            if (nextSelected) {
                setFormData({
                    id: nextSelected.id,
                    name: nextSelected.name,
                    package_code: nextSelected.package_code,
                    base_price: nextSelected.base_price,
                    description: nextSelected.description || '',
                    is_active: nextSelected.is_active,
                    price_config: nextSelected.price_config || {}
                });
                setFormItems(nextSelected.items?.sort((a, b) => a.item_order - b.item_order) || []);
            } else {
                startNewPackage();
            }

            await loadPackageReservations(list);
        } catch (err: any) {
            console.error('Error fetching packages:', err);
            setError('패키지 목록을 불러오지 못했습니다.');
        }
    };

    const loadPackageReservations = async (pkgList?: PackageWithItems[]) => {
        setUsageLoading(true);
        try {
            const usingPkgs = pkgList || packages;
            const pkgMap = new Map(usingPkgs.map((p) => [p.id, p]));

            const { data: resData, error: resError } = await supabase
                .from('reservation')
                .select('re_id, re_status, re_created_at, re_user_id, total_amount, package_id, re_adult_count, re_child_count, re_infant_count')
                .eq('re_type', 'package')
                .not('package_id', 'is', null)
                .order('re_created_at', { ascending: false });

            if (resError) throw resError;

            const rowsRaw = (resData || []) as any[];
            if (rowsRaw.length === 0) {
                setUsageRows([]);
                return;
            }

            const userIds = Array.from(new Set(rowsRaw.map((row) => String(row.re_user_id || '').trim()).filter(Boolean)));
            const { data: usersData, error: usersError } = userIds.length > 0
                ? await supabase.from('users').select('id, name, email').in('id', userIds)
                : { data: [], error: null };

            if (usersError) throw usersError;
            const userMap = new Map(((usersData || []) as any[]).map((row) => [String(row.id || '').trim(), row]));

            const mergedRows = rowsRaw.map((row) => {
                const pkgId = String(row.package_id || '').trim();
                const pkg = pkgMap.get(pkgId) || null;
                const user = userMap.get(String(row.re_user_id || '').trim()) || null;

                return {
                    reservation_id: row.re_id,
                    re_user_id: row.re_user_id,
                    reservation_status: row.re_status,
                    reservation_created_at: row.re_created_at,
                    total_amount: row.total_amount,
                    adult_count: row.re_adult_count || 0,
                    child_count: row.re_child_count || 0,
                    infant_count: row.re_infant_count || 0,
                    user_name: user?.name || '-',
                    user_email: user?.email || '-',
                    package_id: pkgId,
                    package_name: pkg?.name || '알 수 없는 패키지',
                    package_code: pkg?.package_code || '-',
                };
            });

            setUsageRows(mergedRows);
        } catch (err) {
            console.error('패키지 예약내역 조회 실패:', err);
            setError('패키지 예약내역을 조회하지 못했습니다.');
        } finally {
            setUsageLoading(false);
        }
    };

    const selectPackage = (pkg: PackageWithItems) => {
        setSelectedPackageId(pkg.id);
        setFormData({
            id: pkg.id,
            name: pkg.name,
            package_code: pkg.package_code,
            base_price: pkg.base_price,
            description: pkg.description || '',
            is_active: pkg.is_active,
            price_config: pkg.price_config || {}
        });
        setFormItems(pkg.items?.sort((a, b) => a.item_order - b.item_order) || []);
        setError('');
        setMessage('');
    };

    const startNewPackage = () => {
        setSelectedPackageId('');
        setFormData({ name: '', package_code: '', base_price: 0, description: '', is_active: true, price_config: {} });
        setFormItems([]);
        setError('');
        setMessage('새 패키지 상품을 작성 중입니다. 작성 완료 후 저장해주세요.');
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
        if (!formData.package_code?.trim() || !formData.name?.trim()) {
            setError('패키지 코드와 패키지 명은 필수입니다.');
            return;
        }
        setSubmitting(true);
        setError('');
        setMessage('');
        try {
            let packageId = formData.id;
            const payload = {
                package_code: formData.package_code.trim(),
                name: formData.name.trim(),
                base_price: formData.base_price || 0,
                description: formData.description || '',
                price_config: formData.price_config || {},
                is_active: formData.is_active ?? true,
                updated_at: new Date().toISOString()
            };

            if (packageId) {
                const { error: updErr } = await supabase.from('package_master').update(payload).eq('id', packageId);
                if (updErr) throw updErr;
                setMessage('패키지 설정을 저장했습니다.');
            } else {
                const { data: insData, error: insErr } = await supabase.from('package_master').insert([payload]).select();
                if (insErr) throw insErr;
                if (!insData?.length) throw new Error('패키지 생성 후 결과 데이터 반환 실패.');
                packageId = insData[0].id;
                setMessage('패키지 상품을 생성했습니다.');
            }

            if (packageId) {
                const { error: delErr } = await supabase.from('package_items').delete().eq('package_id', packageId);
                if (delErr) throw new Error('기존 구성 정보 삭제 오류가 발생했습니다.');

                if (formItems.length > 0) {
                    const itemsToInsert = formItems.map((item, idx) => ({
                        package_id: packageId,
                        service_type: item.service_type,
                        item_order: idx + 1,
                        description: item.description || '',
                        default_data: item.default_data || {}
                    }));
                    const { error: itemInsErr } = await supabase.from('package_items').insert(itemsToInsert);
                    if (itemInsErr) throw itemInsErr;
                }
            }

            await loadPackages(packageId);
        } catch (err: any) {
            console.error('Save error:', err);
            setError('저장 처리 중 오류가 발생했습니다: ' + (err.message || '알 수 없는 오류.'));
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async () => {
        if (!selectedPackageId) return;
        if (!confirm('정말 이 패키지 상품을 삭제하시겠습니까?')) return;

        setSubmitting(true);
        setError('');
        setMessage('');
        try {
            const { error: delErr } = await supabase.from('package_master').delete().eq('id', selectedPackageId);
            if (delErr) throw delErr;
            setMessage('패키지 상품이 삭제되었습니다.');
            setSelectedPackageId('');
            await loadPackages();
        } catch (err: any) {
            console.error('Delete error:', err);
            setError('삭제 처리 중 오류가 발생했습니다: ' + (err.message || '알 수 없는 오류.'));
        } finally {
            setSubmitting(false);
        }
    };

    const getReservationStatusBadge = (status: string) => {
        switch (status) {
            case 'confirmed':
                return 'bg-green-100 text-green-800';
            case 'reserved':
                return 'bg-blue-100 text-blue-800';
            case 'pending':
                return 'bg-yellow-100 text-yellow-800';
            case 'cancelled':
                return 'bg-red-100 text-red-800';
            default:
                return 'bg-gray-100 text-gray-800';
        }
    };

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
                                    <option key={t.tour_code} value={t.tour_code}>{t.tour_name} ({t.category || '기타'})</option>
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
            <div className="space-y-4 p-4">
                {/* 헤더 영역 */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h1 className="text-xl font-semibold text-slate-900">패키지 상품 관리</h1>
                        <p className="mt-1 text-sm text-slate-600">하이브리드 패키지 상품을 정의하고 구성 요소와 인원별 가격을 관리합니다.</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="inline-flex rounded-lg border border-slate-300 bg-white p-1">
                            <button
                                type="button"
                                onClick={() => setPageTab('settings')}
                                className={`rounded-md px-3 py-1.5 text-sm font-medium ${pageTab === 'settings' ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
                            >
                                설정
                            </button>
                            <button
                                type="button"
                                onClick={() => setPageTab('reservations')}
                                className={`rounded-md px-3 py-1.5 text-sm font-medium ${pageTab === 'reservations' ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
                            >
                                패키지 예약내역
                            </button>
                        </div>
                        <button
                            type="button"
                            onClick={() => void loadInitialData()}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                        >
                            <RefreshCw className="h-4 w-4" />
                            새로고침
                        </button>
                        <button
                            type="button"
                            onClick={startNewPackage}
                            className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                        >
                            <Plus className="h-4 w-4" />
                            새 패키지
                        </button>
                    </div>
                </div>

                {/* 상태 피드백 알림 */}
                {(error || message) && (
                    <div className={`rounded-lg border px-4 py-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-blue-200 bg-blue-50 text-blue-700'}`}>
                        {error || message}
                    </div>
                )}

                {loading ? (
                    <div className="flex h-64 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500">
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        패키지 정보를 불러오는 중입니다.
                    </div>
                ) : (
                    pageTab === 'settings' ? (
                        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[360px_1fr]">
                            {/* 좌측 패키지 리스트 */}
                            <section className="space-y-3">
                                <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                                    <div className="mb-3 flex items-center gap-2">
                                        <Package className="h-4 w-4 text-blue-600" />
                                        <h2 className="text-sm font-semibold text-slate-900">패키지 목록</h2>
                                    </div>
                                    <div className="space-y-2">
                                        {packages.length === 0 ? (
                                            <div className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">등록된 패키지가 없습니다.</div>
                                        ) : packages.map((pkg) => {
                                            const selected = selectedPackageId === pkg.id;
                                            const price2 = pkg.price_config?.['2']?.per_person;
                                            return (
                                                <button
                                                    key={pkg.id}
                                                    type="button"
                                                    onClick={() => selectPackage(pkg)}
                                                    className={`w-full rounded-lg border p-3 text-left transition ${selected ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                                                >
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="min-w-0">
                                                            <div className="truncate text-sm font-semibold text-slate-900">{pkg.name}</div>
                                                            <div className="mt-1 font-mono text-xs text-blue-600 font-bold">{pkg.package_code}</div>
                                                        </div>
                                                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold border ${pkg.is_active ? 'bg-green-50 text-green-700 border-green-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                                                            {pkg.is_active ? '판매중' : '중단'}
                                                        </span>
                                                    </div>
                                                    <div className="mt-3 flex flex-wrap items-center justify-between text-xs text-slate-600 gap-1">
                                                        <div className="flex gap-1 flex-wrap">
                                                            {pkg.items?.map((item, idx) => {
                                                                const svc = SERVICE_LABELS[item.service_type] || { label: item.service_type };
                                                                return (
                                                                    <span key={idx} className="bg-slate-100 text-slate-600 px-1 py-0.5 rounded text-[9px] font-semibold">
                                                                        {svc.label}
                                                                    </span>
                                                                );
                                                            })}
                                                        </div>
                                                        <span className="font-semibold text-slate-800 shrink-0">
                                                            {price2 ? formatVND(price2) : (pkg.base_price ? formatVND(pkg.base_price) : '-')}
                                                        </span>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </section>

                            {/* 우측 편집 폼 */}
                            <section className="space-y-4">
                                <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm space-y-4">
                                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                                        <div className="flex items-center gap-2">
                                            <Settings2 className="h-4 w-4 text-blue-600" />
                                            <h2 className="text-sm font-semibold text-slate-900">
                                                {selectedPackageId ? '패키지 상세 수정' : '새 패키지 상품 작성'}
                                            </h2>
                                        </div>
                                        {selectedPackageId && (
                                            <button
                                                type="button"
                                                onClick={handleDelete}
                                                disabled={submitting}
                                                className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
                                            >
                                                <Trash2 size={14} />
                                                패키지 삭제
                                            </button>
                                        )}
                                    </div>

                                    {/* 기본 정보 설정 */}
                                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                        <label className="space-y-1">
                                            <span className="text-xs font-semibold text-blue-700">패키지 코드 *</span>
                                            <input
                                                value={formData.package_code || ''}
                                                onChange={(event) => setFormData((prev) => ({ ...prev, package_code: event.target.value }))}
                                                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                                                placeholder="예: PKG-GRAND-PIONIS"
                                            />
                                        </label>
                                        <label className="space-y-1">
                                            <span className="text-xs font-semibold text-blue-700">패키지 명 *</span>
                                            <input
                                                value={formData.name || ''}
                                                onChange={(event) => setFormData((prev) => ({ ...prev, name: event.target.value }))}
                                                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                                                placeholder="예: 그랜드 파이어니스 풀패키지"
                                            />
                                        </label>
                                        <label className="space-y-1 md:col-span-2">
                                            <span className="text-xs font-semibold text-blue-700">설명</span>
                                            <textarea
                                                value={formData.description || ''}
                                                onChange={(event) => setFormData((prev) => ({ ...prev, description: event.target.value }))}
                                                rows={2}
                                                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                                                placeholder="패키지 상세 설명을 입력해주세요."
                                            />
                                        </label>
                                    </div>

                                    {/* 인원별 가격 설정 */}
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-2">
                                            <DollarSign className="h-4 w-4 text-blue-600" />
                                            <span className="text-xs font-semibold text-blue-700">인원별 가격 설정 (VND)</span>
                                        </div>
                                        <div className="bg-gradient-to-br from-blue-50/20 to-white rounded-lg border border-blue-100 overflow-hidden">
                                            <table className="w-full text-xs">
                                                <thead>
                                                    <tr className="bg-blue-50 text-blue-800 font-bold border-b border-blue-100">
                                                        <th className="px-3 py-2 text-left w-24">여행 인원</th>
                                                        <th className="px-3 py-2 text-left">기준</th>
                                                        <th className="px-3 py-2 text-left">1인당 요금 (VND)</th>
                                                        <th className="px-3 py-2 text-left">총 합계 (VND)</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-blue-50/50">
                                                    {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((pax) => (
                                                        <tr key={pax} className="hover:bg-blue-50/10">
                                                            <td className="px-3 py-2.5 font-bold text-gray-700">
                                                                <span className="flex items-center gap-1">
                                                                    <Users size={12} className="text-blue-400" /> {pax}인
                                                                </span>
                                                            </td>
                                                            <td className="px-3 py-2.5 text-gray-400">1인당</td>
                                                            <td className="px-3 py-2.5">
                                                                <input
                                                                    type="number"
                                                                    className="w-full max-w-[200px] bg-white border border-gray-200 rounded px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-blue-400"
                                                                    placeholder="0"
                                                                    value={formData.price_config?.[pax]?.per_person || ''}
                                                                    onChange={(e) => updatePriceConfig(pax, 'per_person', Number(e.target.value))}
                                                                />
                                                            </td>
                                                            <td className="px-3 py-2.5">
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

                                    {/* 구성 서비스 항목 */}
                                    <div className="space-y-3 pt-2">
                                        <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                                            <div className="flex items-center gap-2">
                                                <CheckCircle2 size={16} className="text-blue-600" />
                                                <span className="text-xs font-semibold text-blue-700">구성 서비스 항목 ({formItems.length}개)</span>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={addItem}
                                                className="text-xs text-blue-600 hover:bg-blue-50 px-2.5 py-1 rounded font-bold border border-blue-200"
                                            >
                                                + 항목 추가
                                            </button>
                                        </div>

                                        <div className="space-y-3">
                                            {formItems.map((item, idx) => {
                                                const svc = SERVICE_LABELS[item.service_type || 'cruise'];
                                                const IconComp = svc?.icon || Package;
                                                return (
                                                    <div key={idx} className="p-3 rounded-lg border border-slate-200 bg-slate-50/50 space-y-2">
                                                        <div className="flex gap-2 items-center">
                                                            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-slate-200 text-slate-700 text-[10px] font-bold">{idx + 1}</span>
                                                            <IconComp size={14} className="text-slate-500" />
                                                            <select
                                                                className="bg-white border border-gray-300 rounded px-2 py-1 text-xs outline-none font-bold"
                                                                value={item.service_type}
                                                                onChange={(e) => updateItemType(idx, e.target.value)}
                                                            >
                                                                {Object.entries(SERVICE_LABELS).map(([k, v]) => (
                                                                    <option key={k} value={k}>{v.label}</option>
                                                                ))}
                                                            </select>
                                                            <div className="flex-1" />
                                                            <button
                                                                type="button"
                                                                onClick={() => removeItem(idx)}
                                                                className="text-red-400 hover:text-red-600 p-1 hover:bg-red-50 rounded transition-colors"
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </div>

                                                        {renderItemDetails(item, idx)}

                                                        <div className="pt-2 border-t border-slate-100">
                                                            <input
                                                                type="text"
                                                                className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-xs outline-none"
                                                                placeholder="서비스 요약 설명 (예: 앰배서더 시그니처 크루즈 1박 2일)"
                                                                value={item.description || ''}
                                                                onChange={(e) => updateItemValue(idx, 'description', e.target.value)}
                                                            />
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                            {formItems.length === 0 && (
                                                <div className="text-center py-6 text-xs text-gray-400 italic border border-dashed border-gray-200 rounded-lg">
                                                    <Package size={20} className="mx-auto mb-1 opacity-30" />
                                                    등록된 구성 서비스가 없습니다. 우측 상단 '항목 추가'를 눌러 서비스를 연동해주세요.
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* 활성화 여부 및 액션 버튼 */}
                                    <div className="flex flex-wrap items-center justify-between border-t border-slate-100 pt-3 gap-2">
                                        <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={formData.is_active ?? true}
                                                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                                                className="rounded border-gray-300"
                                            />
                                            판매 활성화
                                        </label>
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                onClick={startNewPackage}
                                                className="px-3 py-1.5 border border-slate-300 rounded text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50"
                                            >
                                                작성 초기화
                                            </button>
                                            <button
                                                type="button"
                                                onClick={handleSave}
                                                disabled={submitting}
                                                className="inline-flex items-center gap-1 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold disabled:opacity-60"
                                            >
                                                {submitting ? <Loader2 size={12} className="animate-spin" /> : <Save className="h-3 w-3" />}
                                                패키지 저장
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </section>
                        </div>
                    ) : (
                        /* 패키지 예약 내역 탭 */
                        <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
                                <div>
                                    <h2 className="text-base font-semibold text-slate-900">패키지 예약 상세 조회</h2>
                                    <p className="mt-1 text-xs text-slate-500">패키지 상품으로 접수된 실시간 예약 내역을 통합 조회하고 관리합니다.</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Filter className="h-4 w-4 text-slate-500" />
                                    <select
                                        value={usageFilterPackageId}
                                        onChange={(event) => setUsageFilterPackageId(event.target.value)}
                                        className="rounded border border-slate-300 px-2.5 py-1.5 text-xs"
                                    >
                                        <option value="all">전체 패키지 상품</option>
                                        {packages.map((pkg) => (
                                            <option key={pkg.id} value={pkg.id}>{pkg.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="text-xs text-slate-500">
                                전체 {usageRows.length.toLocaleString()}건, 필터 결과 {filteredUsageRows.length.toLocaleString()}건
                            </div>

                            {usageLoading ? (
                                <div className="rounded-lg border border-slate-100 px-3 py-8 text-center text-slate-500">
                                    <span className="inline-flex items-center gap-2">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        예약내역을 조회하는 중입니다.
                                    </span>
                                </div>
                            ) : filteredUsageRows.length === 0 ? (
                                <div className="rounded-lg border border-slate-100 px-3 py-8 text-center text-slate-500">
                                    표시할 패키지 예약내역이 없습니다.
                                </div>
                            ) : (
                                <div className="overflow-x-auto rounded-lg border border-slate-200">
                                    <table className="min-w-[900px] w-full text-left text-xs">
                                        <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                                            <tr>
                                                <th className="px-4 py-2.5">예약 코드</th>
                                                <th className="px-4 py-2.5">접수 일시</th>
                                                <th className="px-4 py-2.5">예약자</th>
                                                <th className="px-4 py-2.5">패키지 정보</th>
                                                <th className="px-4 py-2.5 text-center">인원</th>
                                                <th className="px-4 py-2.5 text-right">총 결제액 (VND)</th>
                                                <th className="px-4 py-2.5 text-center">상태</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 bg-white">
                                            {filteredUsageRows.map((row) => (
                                                <tr key={row.reservation_id} className="hover:bg-slate-50/50 transition-colors">
                                                    <td className="px-4 py-2.5 font-semibold">
                                                        <button
                                                            type="button"
                                                            onClick={() => openCentralReservationDetailModal({ userId: row.re_user_id, mode: 'auto' })}
                                                            className="text-blue-600 hover:text-blue-800 hover:underline font-mono text-left"
                                                        >
                                                            {row.reservation_id.split('-')[0]?.toUpperCase() || row.reservation_id}
                                                        </button>
                                                    </td>
                                                    <td className="px-4 py-2.5 text-slate-500">
                                                        {row.reservation_created_at ? new Date(row.reservation_created_at).toLocaleString('ko-KR') : '-'}
                                                    </td>
                                                    <td className="px-4 py-2.5">
                                                        <div className="font-semibold text-slate-700">{row.user_name}</div>
                                                        <div className="text-[10px] text-slate-400">{row.user_email}</div>
                                                    </td>
                                                    <td className="px-4 py-2.5">
                                                        <div className="font-semibold text-slate-700">{row.package_name}</div>
                                                        <div className="font-mono text-[10px] text-slate-400">{row.package_code}</div>
                                                    </td>
                                                    <td className="px-4 py-2.5 text-center font-medium">
                                                        성인 {row.adult_count} / 아동 {row.child_count} / 유아 {row.infant_count}
                                                    </td>
                                                    <td className="px-4 py-2.5 text-right font-semibold text-slate-800">
                                                        {formatVND(row.total_amount)}
                                                    </td>
                                                    <td className="px-4 py-2.5 text-center">
                                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${getReservationStatusBadge(row.reservation_status)}`}>
                                                            {row.reservation_status}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </section>
                    )
                )}
            </div>
        </ManagerLayout>
    );
}
