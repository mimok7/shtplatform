'use client';

import React, { useEffect, useState, Suspense, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MobileQuoteLayout } from '../_components/MobileQuoteShell';
import supabase from '@/lib/supabase';
import { PackageWithItems } from '@/lib/types';
import {
    Package, Ship, Hotel, Car, MapPin, Plane,
    Loader2, CheckCircle2, Copy, RefreshCw
} from 'lucide-react';

function ManagerServiceTabs({ active }: { active: 'cruise' | 'airport' | 'hotel' | 'rentcar' | 'tour' | 'comprehensive' | 'package' }) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const quoteId = searchParams.get('quoteId');
    const makeHref = (key: string, id?: string | null) => `/quotes/${key}${id ? `?quoteId=${id}` : (quoteId ? `?quoteId=${quoteId}` : '')}`;

    const Tab = ({ keyName, label }: { keyName: typeof active; label: string }) => (
        <button
            type="button"
            onClick={() => router.push(makeHref(keyName))}
            className={`px-3 py-1.5 text-xs rounded-md border ${active === keyName ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}
        >
            {label}
        </button>
    );

    return (
        <div className="mb-6 flex flex-wrap gap-2">
            <Tab keyName="comprehensive" label="전체" />
            <Tab keyName="package" label="패키지" />
            <Tab keyName="cruise" label="크루즈" />
            <Tab keyName="airport" label="공항" />
            <Tab keyName="hotel" label="호텔" />
            <Tab keyName="rentcar" label="렌트카" />
            <Tab keyName="tour" label="투어" />
        </div>
    );
}

function PackageQuoteForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const quoteId = searchParams.get('quoteId');

    const [packages, setPackages] = useState<PackageWithItems[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedPkg, setSelectedPkg] = useState<PackageWithItems | null>(null);
    const [naturalSummary, setNaturalSummary] = useState<string>('');
    const naturalTextRef = useRef<HTMLDivElement | null>(null);

    // 폼 상태 (다른 서비스와 동일한 형식)
    const [form, setForm] = useState({
        adultCount: 2,
        childCount: 0,
        infantCount: 0,
        departureDate: new Date().toISOString().split('T')[0],
        requestNote: ''
    });

    useEffect(() => {
        fetchPackages();
    }, []);

    // 패키지 또는 인원 변경시 자연어 요약 자동 생성
    useEffect(() => {
        if (selectedPkg) {
            generateNaturalSummary();
        }
    }, [selectedPkg, form.adultCount, form.childCount, form.infantCount, form.departureDate, form.requestNote]);

    const fetchPackages = async () => {
        try {
            const { data, error } = await supabase
                .from('package_master')
                .select('*, items:package_items(*)')
                .eq('is_active', true);
            if (error) throw error;
            setPackages(data || []);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const totalPax = form.adultCount + form.childCount + form.infantCount;

    // 가격 계산
    const calculatePrice = () => {
        if (!selectedPkg) return { total: 0, perPerson: 0 };

        // price_config에서 인원별 가격 조회
        if (selectedPkg.price_config && selectedPkg.price_config[totalPax]) {
            return {
                total: selectedPkg.price_config[totalPax].total || selectedPkg.base_price,
                perPerson: selectedPkg.price_config[totalPax].per_person || Math.round(selectedPkg.base_price / totalPax)
            };
        }

        return {
            total: selectedPkg.base_price,
            perPerson: Math.round(selectedPkg.base_price / Math.max(totalPax, 1))
        };
    };

    const priceInfo = calculatePrice();

    // 자연어 요약 생성
    const generateNaturalSummary = () => {
        if (!selectedPkg) {
            setNaturalSummary('');
            return;
        }

        const formatDate = (dateStr: string) => {
            const d = new Date(dateStr);
            return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
        };

        const formatPrice = (v: number) => {
            const man = Math.round(v / 10000);
            return `${man.toLocaleString()}만동`;
        };

        let summary = `회원님~! 패키지 견적드립니다^^\n\n`;
        summary += `📦 ${selectedPkg.name}\n`;
        summary += `📅 출발일: ${formatDate(form.departureDate)}\n\n`;

        // 인원 구성
        const paxParts = [];
        if (form.adultCount > 0) paxParts.push(`성인 ${form.adultCount}명`);
        if (form.childCount > 0) paxParts.push(`아동 ${form.childCount}명`);
        if (form.infantCount > 0) paxParts.push(`유아 ${form.infantCount}명`);
        summary += `👥 인원: ${paxParts.join(', ')} (총 ${totalPax}명)\n\n`;

        // 패키지 구성 내역
        summary += `📋 패키지 구성:\n`;
        selectedPkg.items?.forEach((item, idx) => {
            const icon = item.service_type === 'cruise' ? '🚢' :
                item.service_type === 'hotel' ? '🏨' :
                    item.service_type === 'airport' ? '✈️' :
                        ['rentcar', 'car_sht'].includes(item.service_type) ? '🚗' :
                            item.service_type === 'tour' ? '🎫' : '📍';
            summary += `  ${idx + 1}. ${icon} ${item.service_type.toUpperCase()}`;
            if (item.description) summary += ` - ${item.description}`;
            summary += `\n`;
        });

        summary += `\n💰 예상 금액: ${formatPrice(priceInfo.total)}`;
        summary += ` (1인당 ${formatPrice(priceInfo.perPerson)})\n`;

        if (form.requestNote) {
            summary += `\n📝 요청사항: ${form.requestNote}\n`;
        }

        summary += `\n감사합니다! 🙏`;

        setNaturalSummary(summary);
    };

    const copyNaturalSummary = async () => {
        try {
            await navigator.clipboard.writeText(naturalSummary);
            alert('자연어 요약을 클립보드에 복사했습니다.');
        } catch (e) {
            console.error('복사 실패:', e);
            alert('복사에 실패했습니다.');
        }
    };

    const getServiceIcon = (type: string) => {
        switch (type) {
            case 'cruise': return <Ship size={12} className="text-blue-500" />;
            case 'hotel': return <Hotel size={12} className="text-purple-500" />;
            case 'airport': return <Plane size={12} className="text-green-500" />;
            case 'rentcar':
            case 'car_sht': return <Car size={12} className="text-orange-500" />;
            case 'tour': return <MapPin size={12} className="text-red-500" />;
            default: return <Package size={12} className="text-gray-500" />;
        }
    };

    return (
        <div className="space-y-6">
            <ManagerServiceTabs active="package" />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* 왼쪽: 패키지 선택 + 인원 설정 */}
                <div className="lg:col-span-2 space-y-4">
                    {/* 패키지 선택 */}
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                            <Package className="text-blue-600" /> 패키지 상품 선택
                        </h3>
                        {loading ? (
                            <div className="flex justify-center py-10"><Loader2 className="animate-spin" /></div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {packages.map(pkg => (
                                    <div
                                        key={pkg.id}
                                        onClick={() => setSelectedPkg(pkg)}
                                        className={`p-4 rounded-xl border-2 transition-all cursor-pointer ${selectedPkg?.id === pkg.id ? 'border-blue-500 bg-blue-50' : 'border-gray-100 hover:border-blue-200'}`}
                                    >
                                        <div className="flex justify-between items-start mb-2">
                                            <span className="text-[10px] font-bold bg-gray-200 px-2 py-0.5 rounded text-gray-600">{pkg.package_code}</span>
                                            {selectedPkg?.id === pkg.id && <CheckCircle2 size={16} className="text-blue-500" />}
                                        </div>
                                        <p className="font-bold text-gray-800">{pkg.name}</p>
                                        <div className="flex justify-between items-end mt-1">
                                            <p className="text-xs text-blue-600 font-bold">
                                                {pkg.price_config?.[totalPax]
                                                    ? `${pkg.price_config[totalPax].total?.toLocaleString() || pkg.base_price.toLocaleString()} VND (${totalPax}인)`
                                                    : `${pkg.base_price.toLocaleString()} VND`
                                                }
                                            </p>
                                        </div>
                                        <div className="flex gap-1 mt-3">
                                            {pkg.items?.map((it, idx) => (
                                                <div key={idx} className="w-5 h-5 bg-white rounded border flex items-center justify-center shadow-xs">
                                                    {getServiceIcon(it.service_type)}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* 인원 설정 */}
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                        <h3 className="text-md font-bold mb-4">👥 인원 설정</h3>
                        <div className="grid grid-cols-3 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1">성인</label>
                                <select
                                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                                    value={form.adultCount}
                                    onChange={e => setForm({ ...form, adultCount: Number(e.target.value) })}
                                >
                                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                                        <option key={n} value={n}>{n}명</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1">아동 (2-11세)</label>
                                <select
                                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                                    value={form.childCount}
                                    onChange={e => setForm({ ...form, childCount: Number(e.target.value) })}
                                >
                                    {[0, 1, 2, 3, 4, 5].map(n => (
                                        <option key={n} value={n}>{n}명</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1">유아 (0-1세)</label>
                                <select
                                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                                    value={form.infantCount}
                                    onChange={e => setForm({ ...form, infantCount: Number(e.target.value) })}
                                >
                                    {[0, 1, 2, 3].map(n => (
                                        <option key={n} value={n}>{n}명</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div className="mt-4">
                            <label className="block text-xs font-bold text-gray-500 mb-1">출발일</label>
                            <input
                                type="date"
                                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                                value={form.departureDate}
                                onChange={e => setForm({ ...form, departureDate: e.target.value })}
                            />
                        </div>
                        <div className="mt-4">
                            <label className="block text-xs font-bold text-gray-500 mb-1">요청사항 (옵션)</label>
                            <textarea
                                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                                rows={3}
                                placeholder="추가 요청사항이 있으면 입력해주세요"
                                value={form.requestNote}
                                onChange={e => setForm({ ...form, requestNote: e.target.value })}
                            />
                        </div>
                    </div>

                    {/* 패키지 상세 구성 */}
                    {selectedPkg && (
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 animate-in fade-in duration-300">
                            <h3 className="text-md font-bold mb-4">📋 패키지 상세 구성</h3>
                            <div className="space-y-2">
                                {selectedPkg.items.map((item, idx) => (
                                    <div key={idx} className="flex flex-col p-3 bg-gray-50 rounded-lg">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <span className="text-sm font-bold text-gray-400">{idx + 1}</span>
                                                <div className="flex items-center gap-2">
                                                    {getServiceIcon(item.service_type)}
                                                    <span className="text-sm font-semibold capitalize">{item.service_type}</span>
                                                </div>
                                            </div>
                                            <span className="text-[10px] bg-blue-100 text-blue-600 px-2 py-0.5 rounded font-bold uppercase">{item.service_type}</span>
                                        </div>
                                        {item.description && (
                                            <p className="text-xs text-gray-600 mt-2 pl-7 font-medium border-l-2 border-blue-200 ml-1">
                                                {item.description}
                                            </p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* 오른쪽: 자연어 요약 */}
                <div className="lg:col-span-1">
                    <div className="bg-white p-6 rounded-xl shadow-lg border border-blue-100 sticky top-24">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold flex items-center gap-2">
                                📝 견적 요약
                            </h3>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => generateNaturalSummary()}
                                    className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors"
                                    title="다시 생성"
                                >
                                    <RefreshCw size={14} />
                                </button>
                                <button
                                    onClick={copyNaturalSummary}
                                    disabled={!naturalSummary}
                                    className="p-2 rounded-lg bg-blue-100 hover:bg-blue-200 text-blue-600 transition-colors disabled:opacity-50"
                                    title="복사하기"
                                >
                                    <Copy size={14} />
                                </button>
                            </div>
                        </div>

                        {selectedPkg ? (
                            <div
                                ref={naturalTextRef}
                                className="bg-gray-50 rounded-lg p-4 text-sm whitespace-pre-wrap font-mono leading-relaxed"
                            >
                                {naturalSummary || '패키지와 인원을 선택하면 자연어 요약이 생성됩니다.'}
                            </div>
                        ) : (
                            <div className="bg-gray-50 rounded-lg p-8 text-center text-gray-400">
                                <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
                                <p className="text-sm">패키지를 선택해주세요</p>
                            </div>
                        )}

                        {selectedPkg && (
                            <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-sm font-medium text-gray-600">총 인원</span>
                                    <span className="text-sm font-bold">{totalPax}명</span>
                                </div>
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-sm font-medium text-gray-600">1인당 금액</span>
                                    <span className="text-sm font-bold text-blue-600">{priceInfo.perPerson.toLocaleString()} VND</span>
                                </div>
                                <div className="flex justify-between items-center pt-2 border-t border-blue-200">
                                    <span className="text-sm font-bold text-gray-700">총 예상 금액</span>
                                    <span className="text-lg font-bold text-blue-600">{priceInfo.total.toLocaleString()} VND</span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function PackageQuotePage() {
    return (
        <MobileQuoteLayout title="📦 패키지 견적">
            <Suspense fallback={<Loader2 className="animate-spin" />}>
                <PackageQuoteForm />
            </Suspense>
        </MobileQuoteLayout>
    );
}
