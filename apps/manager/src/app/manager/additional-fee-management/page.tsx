'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabase';
import ManagerLayout from '@/components/ManagerLayout';

interface AdditionalFeeTemplate {
    id: number;
    name: string;
    amount: number;
    service_type: string | null;
    description: string | null;
    sort_order: number;
    is_active: boolean;
}

export default function AdditionalFeeManagement() {
    const router = useRouter();
    const [user, setUser] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [templates, setTemplates] = useState<AdditionalFeeTemplate[]>([]);
    const [showModal, setShowModal] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [filterServiceType, setFilterServiceType] = useState<string | null>(null);

    const [formData, setFormData] = useState({
        name: '',
        amount: 0,
        service_type: '',
        description: '',
        sort_order: 0,
        is_active: true,
    });

    const serviceTypeMap: Record<string | 'null', { value: string | null; label: string; icon: string }> = {
        'null': { value: null, label: '공통', icon: '⭐' },
        'cruise': { value: 'cruise', label: '크루즈', icon: '🚢' },
        'airport': { value: 'airport', label: '공항', icon: '✈️' },
        'hotel': { value: 'hotel', label: '호텔', icon: '🏨' },
        'rentcar': { value: 'rentcar', label: '렌터카', icon: '🚗' },
        'tour': { value: 'tour', label: '투어', icon: '🎫' },
        'sht': { value: 'sht', label: 'SHT 차량', icon: '🚐' },
        'vehicle': { value: 'vehicle', label: '일반 차량', icon: '🚙' },
    };

    const filterOptions = [
        { value: null, label: '공통', icon: '⭐' },
        { value: 'cruise', label: '크루즈', icon: '🚢' },
        { value: 'airport', label: '공항', icon: '✈️' },
        { value: 'hotel', label: '호텔', icon: '🏨' },
        { value: 'rentcar', label: '렌터카', icon: '🚗' },
        { value: 'tour', label: '투어', icon: '🎫' },
        { value: 'sht', label: 'SHT 차량', icon: '🚐' },
        { value: 'vehicle', label: '일반 차량', icon: '🚙' },
    ];

    const getServiceTypeLabel = (serviceType: string | null): { label: string; icon: string } => {
        const key = serviceType === null ? 'null' : serviceType;
        return serviceTypeMap[key] || { label: '-', icon: '❓' };
    };

    const getFilteredAndGroupedTemplates = () => {
        let filtered = templates;

        if (filterServiceType !== undefined) {
            filtered = templates.filter(t => t.service_type === filterServiceType);
        }

        // 서비스 타입별로 그룹화
        const grouped: Record<string, AdditionalFeeTemplate[]> = {};
        filtered.forEach(template => {
            const key = template.service_type === null ? 'null' : template.service_type;
            if (!grouped[key]) {
                grouped[key] = [];
            }
            grouped[key].push(template);
        });

        return grouped;
    };

    useEffect(() => {
        const checkAuth = async () => {
            const { data: { user: authUser } } = await supabase.auth.getUser();
            if (!authUser) {
                router.push('/login');
                return;
            }
            setUser(authUser);
            setLoading(false);
        };
        checkAuth();
    }, []);

    useEffect(() => {
        if (user) {
            loadTemplates();
        }
    }, [user]);

    const loadTemplates = async () => {
        try {
            const { data, error } = await supabase
                .from('additional_fee_template')
                .select('*')
                .order('sort_order', { ascending: true })
                .order('id', { ascending: true });

            if (error) {
                console.error('❌ 추가내역 조회 실패:', error);
                return;
            }

            setTemplates(data || []);
        } catch (error) {
            console.error('❌ 추가내역 로드 실패:', error);
        }
    };

    const handleOpenModal = (template?: AdditionalFeeTemplate) => {
        if (template) {
            setEditingId(template.id);
            setFormData({
                name: template.name,
                amount: template.amount,
                service_type: template.service_type || '',
                description: template.description || '',
                sort_order: template.sort_order,
                is_active: template.is_active,
            });
        } else {
            setEditingId(null);
            setFormData({
                name: '',
                amount: 0,
                service_type: '',
                description: '',
                sort_order: (Math.max(...templates.map(t => t.sort_order), 0) || 0) + 10,
                is_active: true,
            });
        }
        setShowModal(true);
    };

    const handleCloseModal = () => {
        setShowModal(false);
        setEditingId(null);
    };

    const handleSave = async () => {
        if (!formData.name.trim()) {
            alert('추가내역 이름을 입력해주세요.');
            return;
        }

        setIsSaving(true);
        try {
            const payload = {
                name: formData.name.trim(),
                amount: formData.amount,
                service_type: formData.service_type || null,
                description: formData.description.trim() || null,
                sort_order: formData.sort_order,
                is_active: formData.is_active,
            };

            if (editingId) {
                const { error } = await supabase
                    .from('additional_fee_template')
                    .update(payload)
                    .eq('id', editingId);

                if (error) {
                    console.error('❌ 수정 실패:', error);
                    alert('수정에 실패했습니다.');
                    return;
                }
                alert('수정되었습니다.');
            } else {
                const { error } = await supabase
                    .from('additional_fee_template')
                    .insert([payload]);

                if (error) {
                    console.error('❌ 추가 실패:', error);
                    alert('추가에 실패했습니다.');
                    return;
                }
                alert('추가되었습니다.');
            }

            handleCloseModal();
            await loadTemplates();
        } catch (error) {
            console.error('❌ 저장 완전 실패:', error);
            alert('저장에 실패했습니다.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('정말 삭제하시겠습니까?')) {
            return;
        }

        setIsDeleting(true);
        try {
            const { error } = await supabase
                .from('additional_fee_template')
                .delete()
                .eq('id', id);

            if (error) {
                console.error('❌ 삭제 실패:', error);
                alert('삭제에 실패했습니다.');
                return;
            }

            alert('삭제되었습니다.');
            await loadTemplates();
        } catch (error) {
            console.error('❌ 삭제 완전 실패:', error);
            alert('삭제에 실패했습니다.');
        } finally {
            setIsDeleting(false);
        }
    };

    if (loading) {
        return (
            <ManagerLayout title="추가 요금 관리" activeTab="additional-fee-management">
                <div className="flex justify-center items-center h-96">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
                </div>
            </ManagerLayout>
        );
    }

    return (
        <ManagerLayout title="추가 요금 관리" activeTab="additional-fee-management">
            <div className="w-full">
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-2xl font-bold text-gray-800">추가 요금 관리</h1>
                    <button
                        onClick={() => handleOpenModal()}
                        className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-semibold"
                    >
                        + 항목 추가
                    </button>
                </div>

                {/* 필터 버튼 */}
                <div className="mb-6">
                    <p className="text-sm font-semibold text-gray-700 mb-3">서비스별 필터</p>
                    <div className="flex flex-wrap gap-2">
                        <button
                            onClick={() => setFilterServiceType(undefined)}
                            className={`px-4 py-2 rounded-lg font-semibold transition-colors text-sm ${filterServiceType === undefined
                                ? 'bg-blue-500 text-white'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                }`}
                        >
                            📊 전체
                        </button>
                        {filterOptions.map(option => (
                            <button
                                key={option.value === null ? 'null' : option.value}
                                onClick={() => setFilterServiceType(option.value)}
                                className={`px-4 py-2 rounded-lg font-semibold transition-colors text-sm ${filterServiceType === option.value
                                    ? 'bg-blue-500 text-white'
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                    }`}
                            >
                                {option.icon} {option.label}
                            </button>
                        ))}
                    </div>
                </div>

                {templates.length === 0 ? (
                    <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
                        <p className="text-gray-600 mb-4">추가내역 항목이 없습니다.</p>
                        <button
                            onClick={() => handleOpenModal()}
                            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                        >
                            + 첫 항목 추가
                        </button>
                    </div>
                ) : (() => {
                    const grouped = getFilteredAndGroupedTemplates();
                    const groupKeys = Object.keys(grouped).sort();

                    return groupKeys.length === 0 ? (
                        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
                            <p className="text-gray-600">해당 서비스에 추가내역이 없습니다.</p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {groupKeys.map(groupKey => {
                                const items = grouped[groupKey];
                                const serviceInfo = getServiceTypeLabel(groupKey === 'null' ? null : groupKey);

                                return (
                                    <div key={groupKey} className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
                                        <div className="px-6 py-4 bg-gradient-to-r from-blue-50 to-blue-100 border-b border-blue-200">
                                            <h3 className="text-lg font-bold text-blue-700">
                                                {serviceInfo.icon} {serviceInfo.label}
                                            </h3>
                                        </div>
                                        <table className="w-full">
                                            <thead className="bg-gray-50 border-b border-gray-200">
                                                <tr>
                                                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">이름</th>
                                                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">금액 (VND)</th>
                                                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">설명</th>
                                                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">정렬</th>
                                                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">활성</th>
                                                    <th className="px-6 py-3 text-center text-sm font-semibold text-gray-700">작업</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-200">
                                                {items.map((template) => (
                                                    <tr key={template.id} className="hover:bg-gray-50">
                                                        <td className="px-6 py-3 text-sm text-gray-800 font-medium">{template.name}</td>
                                                        <td className="px-6 py-3 text-sm text-gray-600">{template.amount.toLocaleString()}</td>
                                                        <td className="px-6 py-3 text-sm text-gray-600 max-w-xs truncate">{template.description || '-'}</td>
                                                        <td className="px-6 py-3 text-sm text-gray-600 text-center">{template.sort_order}</td>
                                                        <td className="px-6 py-3 text-sm text-center">
                                                            <span className={`px-2 py-1 rounded-full text-xs font-semibold ${template.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                                                                {template.is_active ? '활성' : '비활성'}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-3 text-sm text-center space-x-2">
                                                            <button
                                                                onClick={() => handleOpenModal(template)}
                                                                className="px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors text-xs font-semibold"
                                                            >
                                                                수정
                                                            </button>
                                                            <button
                                                                onClick={() => handleDelete(template.id)}
                                                                disabled={isDeleting}
                                                                className="px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors text-xs font-semibold disabled:opacity-50"
                                                            >
                                                                삭제
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                );
                            })}
                        </div>
                    );
                })()}

                {showModal && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                        <div className="bg-white rounded-lg shadow-lg max-w-md w-full">
                            <div className="px-6 py-4 border-b border-gray-200">
                                <h2 className="text-lg font-bold text-gray-800">
                                    {editingId ? '항목 수정' : '항목 추가'}
                                </h2>
                            </div>

                            <div className="px-6 py-4 space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        이름 <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        placeholder="예: 얼리체크인"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        금액 (VND) <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="number"
                                        value={formData.amount}
                                        onChange={(e) => setFormData({ ...formData, amount: Number(e.target.value) })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        placeholder="0"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        서비스 타입
                                    </label>
                                    <select
                                        value={formData.service_type}
                                        onChange={(e) => setFormData({ ...formData, service_type: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value="">⭐ (모든 서비스)</option>
                                        <option value="cruise">🚢 크루즈</option>
                                        <option value="airport">✈️ 공항</option>
                                        <option value="hotel">🏨 호텔</option>
                                        <option value="rentcar">🚗 렌터카</option>
                                        <option value="tour">🎫 투어</option>
                                        <option value="sht">🚐 SHT 차량</option>
                                        <option value="vehicle">🚙 일반 차량</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        설명 (선택)
                                    </label>
                                    <textarea
                                        value={formData.description}
                                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                                        placeholder="추가 설명"
                                        rows={3}
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            정렬 순서
                                        </label>
                                        <input
                                            type="number"
                                            value={formData.sort_order}
                                            onChange={(e) => setFormData({ ...formData, sort_order: Number(e.target.value) })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            placeholder="0"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            활성 여부
                                        </label>
                                        <select
                                            value={formData.is_active ? 'true' : 'false'}
                                            onChange={(e) => setFormData({ ...formData, is_active: e.target.value === 'true' })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        >
                                            <option value="true">활성</option>
                                            <option value="false">비활성</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-2">
                                <button
                                    onClick={handleCloseModal}
                                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-semibold"
                                >
                                    취소
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={isSaving}
                                    className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-semibold disabled:opacity-50"
                                >
                                    {isSaving ? '저장 중...' : '저장'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </ManagerLayout>
    );
}
