'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useParams } from 'next/navigation';
import supabase from '@/lib/supabase';
import ManagerLayout from '@/components/ManagerLayout';
import {
    ArrowLeft,
    Save,
    User,
    Calendar,
    Phone,
    Mail,
    FileText,
    Ship,
    Plane,
    Building,
    MapPin,
    Car,
    CheckCircle,
    XCircle,
    Clock,
    AlertTriangle,
    Plus,
    Trash2,
    Edit
} from 'lucide-react';

interface QuoteFormData {
    // 기본 정보
    title?: string;
    status: string;
    total_price: number;
    departure_date: string;
    return_date: string;
    adult_count: number;
    child_count: number;
    infant_count: number;
    cruise_name?: string;
    manager_note?: string;

    // 사용자 정보 (읽기 전용)
    users?: {
        id: string;
        name: string;
        email: string;
        phone_number: string;
    };
}

interface ServiceItem {
    id?: string;
    service_type: string;
    service_ref_id?: string;
    quantity: number;
    unit_price: number;
    total_price: number;
    options?: any;
    // UI 필드들
    name: string;
    description?: string;
    isNew?: boolean;
}

function QuoteEditContent() {
    const router = useRouter();
    const params = useParams();
    const quoteId = params.id as string;

    const [quote, setQuote] = useState<QuoteFormData | null>(null);
    const [serviceItems, setServiceItems] = useState<ServiceItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!quoteId) {
            alert('견적 ID가 필요합니다.');
            router.push('/manager/quotes');
            return;
        }
        loadQuoteDetail();
    }, [quoteId]);

    const loadQuoteDetail = async () => {
        try {
            setLoading(true);

            // 권한 확인
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                router.push('/login');
                return;
            }

            // 견적 기본 정보 조회
            const { data: quoteData, error: quoteError } = await supabase
                .from('quote')
                .select('*')
                .eq('id', quoteId)
                .single();

            if (quoteError) {
                throw quoteError;
            }

            if (!quoteData) {
                alert('견적을 찾을 수 없습니다.');
                router.push('/manager/quotes');
                return;
            }

            // 사용자 정보 조회
            const { data: userInfo } = await supabase
                .from('users')
                .select('id, name, email, phone_number')
                .eq('id', quoteData.user_id)
                .single();

            // quote_item 조회
            const { data: quoteItems } = await supabase
                .from('quote_item')
                .select('*')
                .eq('quote_id', quoteId)
                .order('created_at', { ascending: true });

            // 서비스 아이템 변환
            const serviceList: ServiceItem[] = [];

            // 서비스 타입별 상세 정보 일괄 조회
            const serviceRefIds: { [key: string]: string[] } = {};
            quoteItems?.forEach(item => {
                if (item.service_ref_id) {
                    if (!serviceRefIds[item.service_type]) {
                        serviceRefIds[item.service_type] = [];
                    }
                    serviceRefIds[item.service_type].push(item.service_ref_id);
                }
            });

            // 각 서비스 타입별로 데이터 일괄 조회 (병렬 처리)
            const serviceDataMap: { [key: string]: { [id: string]: any } } = {};
            const fetchPromises = Object.entries(serviceRefIds).map(async ([type, ids]) => {
                serviceDataMap[type] = {};
                let query = null;
                let codeField = '';

                switch (type) {
                    case 'room':
                        query = supabase.from('room').select('id, room_code').in('id', ids);
                        codeField = 'room_code';
                        break;
                    case 'car':
                        query = supabase.from('car').select('id, car_code').in('id', ids);
                        codeField = 'car_code';
                        break;
                    case 'airport':
                        query = supabase.from('airport').select('id, airport_code').in('id', ids);
                        codeField = 'airport_code';
                        break;
                    case 'hotel':
                        query = supabase.from('hotel').select('id, hotel_code').in('id', ids);
                        codeField = 'hotel_code';
                        break;
                    case 'rentcar':
                        query = supabase.from('rentcar').select('id, rentcar_code').in('id', ids);
                        codeField = 'rentcar_code';
                        break;
                    case 'tour':
                        query = supabase.from('tour').select('id, tour_code').in('id', ids);
                        codeField = 'tour_code';
                        break;
                }

                if (query) {
                    const { data } = await query;
                    data?.forEach((row: any) => {
                        serviceDataMap[type][row.id] = row[codeField] || 'Unknown';
                    });
                }
            });

            await Promise.all(fetchPromises);


            for (const item of quoteItems || []) {
                let serviceName = '';

                if (serviceDataMap[item.service_type] && serviceDataMap[item.service_type][item.service_ref_id]) {
                    const code = serviceDataMap[item.service_type][item.service_ref_id];
                    switch (item.service_type) {
                        case 'room': serviceName = `객실 (${code})`; break;
                        case 'car': serviceName = `크루즈 차량 (${code})`; break;
                        case 'airport': serviceName = `공항 서비스 (${code})`; break;
                        case 'hotel': serviceName = `호텔 (${code})`; break;
                        case 'rentcar': serviceName = `렌터카 (${code})`; break;
                        case 'tour': serviceName = `투어 (${code})`; break;
                        default: serviceName = `${item.service_type} 서비스`;
                    }
                } else {
                    serviceName = `${item.service_type} 서비스`;
                }

                serviceList.push({
                    id: item.id,
                    service_type: item.service_type,
                    service_ref_id: item.service_ref_id,
                    quantity: item.quantity || 1,
                    unit_price: item.unit_price || 0,
                    total_price: item.total_price || 0,
                    options: item.options || {},
                    name: serviceName,
                    description: ''
                });
            }

            setQuote({
                ...quoteData,
                users: userInfo || { id: quoteData.user_id, name: '정보 없음', email: '', phone_number: '' }
            });
            setServiceItems(serviceList);
            setError(null);

        } catch (error) {
            console.error('견적 상세 정보 로드 실패:', error);
            setError('견적 정보를 불러오는 중 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };

    const handleBasicInfoChange = (field: string, value: any) => {
        setQuote(prev => prev ? {
            ...prev,
            [field]: value
        } : null);
    };

    const handleServiceItemChange = (index: number, field: string, value: any) => {
        setServiceItems(prev => prev.map((item, i) =>
            i === index ? { ...item, [field]: value } : item
        ));
    };

    const addNewServiceItem = () => {
        const newItem: ServiceItem = {
            service_type: 'custom',
            quantity: 1,
            unit_price: 0,
            total_price: 0,
            name: '새 서비스',
            description: '',
            isNew: true
        };
        setServiceItems(prev => [...prev, newItem]);
    };

    const removeServiceItem = (index: number) => {
        if (confirm('이 서비스 항목을 삭제하시겠습니까?')) {
            setServiceItems(prev => prev.filter((_, i) => i !== index));
        }
    };

    const calculateTotalPrice = () => {
        return serviceItems.reduce((sum, item) => sum + (item.total_price || 0), 0);
    };

    const handleSave = async () => {
        if (!quote) return;

        try {
            setSaving(true);

            // 총 금액 자동 계산
            const calculatedTotal = calculateTotalPrice();

            // 견적 기본 정보 업데이트
            const { error: quoteError } = await supabase
                .from('quote')
                .update({
                    title: quote.title,
                    status: quote.status,
                    total_price: calculatedTotal,
                    departure_date: quote.departure_date,
                    return_date: quote.return_date,
                    adult_count: quote.adult_count,
                    child_count: quote.child_count,
                    infant_count: quote.infant_count,
                    cruise_name: quote.cruise_name,
                    manager_note: quote.manager_note,
                    updated_at: new Date().toISOString()
                })
                .eq('id', quoteId);

            if (quoteError) {
                throw quoteError;
            }

            // 서비스 아이템 업데이트
            for (const item of serviceItems) {
                if (item.isNew && !item.id) {
                    // 새 아이템 추가
                    const { error: insertError } = await supabase
                        .from('quote_item')
                        .insert({
                            quote_id: quoteId,
                            service_type: item.service_type,
                            service_ref_id: item.service_ref_id,
                            quantity: item.quantity,
                            unit_price: item.unit_price,
                            total_price: item.total_price,
                            options: item.options
                        });

                    if (insertError) {
                        console.error('새 서비스 아이템 추가 실패:', insertError);
                    }
                } else if (item.id) {
                    // 기존 아이템 업데이트
                    const { error: updateError } = await supabase
                        .from('quote_item')
                        .update({
                            quantity: item.quantity,
                            unit_price: item.unit_price,
                            total_price: item.total_price,
                            options: item.options
                        })
                        .eq('id', item.id);

                    if (updateError) {
                        console.error('서비스 아이템 업데이트 실패:', updateError);
                    }
                }
            }

            alert('견적이 성공적으로 수정되었습니다.');
            router.push(`/manager/quotes/${quoteId}/view`);

        } catch (error) {
            console.error('견적 수정 실패:', error);
            alert('견적 수정 중 오류가 발생했습니다.');
        } finally {
            setSaving(false);
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'approved': return <CheckCircle className="w-5 h-5 text-green-600" />;
            case 'rejected': return <XCircle className="w-5 h-5 text-red-600" />;
            default: return <Clock className="w-5 h-5 text-yellow-600" />;
        }
    };

    const getServiceIcon = (type: string) => {
        switch (type) {
            case 'room':
            case 'cruise': return <Ship className="w-5 h-5 text-blue-600" />;
            case 'car': return <Car className="w-5 h-5 text-green-600" />;
            case 'airport': return <Plane className="w-5 h-5 text-purple-600" />;
            case 'hotel': return <Building className="w-5 h-5 text-orange-600" />;
            case 'tour': return <MapPin className="w-5 h-5 text-red-600" />;
            case 'rentcar': return <Car className="w-5 h-5 text-blue-600" />;
            default: return <FileText className="w-5 h-5 text-gray-600" />;
        }
    };

    if (loading) {
        return (
            <ManagerLayout title="견적 수정" activeTab="quotes">
                <div className="flex justify-center items-center h-64">
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
                        <p className="mt-4 text-gray-600">견적 정보를 불러오는 중...</p>
                    </div>
                </div>
            </ManagerLayout>
        );
    }

    if (!quote) {
        return (
            <ManagerLayout title="견적 수정" activeTab="quotes">
                <div className="text-center py-12">
                    <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-600">견적 정보를 찾을 수 없습니다</h3>
                </div>
            </ManagerLayout>
        );
    }

    return (
        <ManagerLayout title="견적 수정" activeTab="quotes">
            <div className="space-y-6">

                {/* 헤더 */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => router.push(`/manager/quotes/${quoteId}/view`)}
                            className="p-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                        <div>
                            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
                                <Edit className="w-8 h-8 text-blue-600" />
                                견적 수정
                            </h1>
                            <p className="text-gray-600 mt-1">견적 ID: {quoteId}</p>
                        </div>
                    </div>

                    <div className="flex gap-3">
                        <button
                            onClick={() => router.push(`/manager/quotes/${quoteId}/view`)}
                            className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
                        >
                            취소
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-2 disabled:opacity-50"
                        >
                            <Save className="w-4 h-4" />
                            {saving ? '저장 중...' : '저장'}
                        </button>
                    </div>
                </div>

                {error && (
                    <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5" />
                        {error}
                    </div>
                )}

                {/* 고객 정보 (읽기 전용) */}
                <div className="bg-gray-50 rounded-lg shadow-sm p-6">
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                        <User className="w-6 h-6 text-green-600" />
                        고객 정보 (읽기 전용)
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">고객명</label>
                            <input
                                type="text"
                                value={quote.users?.name || ''}
                                disabled
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-600"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">이메일</label>
                            <input
                                type="email"
                                value={quote.users?.email || ''}
                                disabled
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-600"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">전화번호</label>
                            <input
                                type="text"
                                value={quote.users?.phone_number || ''}
                                disabled
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-600"
                            />
                        </div>
                    </div>
                </div>

                {/* 견적 기본 정보 수정 */}
                <div className="bg-white rounded-lg shadow-md p-6">
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                        <FileText className="w-6 h-6 text-blue-600" />
                        견적 기본 정보
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">견적 제목</label>
                            <input
                                type="text"
                                value={quote.title || ''}
                                onChange={(e) => handleBasicInfoChange('title', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                placeholder="견적 제목을 입력하세요"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">견적 상태</label>
                            <div className="flex items-center gap-2">
                                {getStatusIcon(quote.status)}
                                <select
                                    value={quote.status}
                                    onChange={(e) => handleBasicInfoChange('status', e.target.value)}
                                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                >
                                    <option value="draft">임시저장</option>
                                    <option value="pending">검토 대기</option>
                                    <option value="submitted">제출됨</option>
                                    <option value="approved">승인됨</option>
                                    <option value="rejected">거절됨</option>
                                    <option value="confirmed">확정됨</option>
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">출발일</label>
                            <input
                                type="date"
                                value={quote.departure_date?.split('T')[0] || ''}
                                onChange={(e) => handleBasicInfoChange('departure_date', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">복귀일</label>
                            <input
                                type="date"
                                value={quote.return_date?.split('T')[0] || ''}
                                onChange={(e) => handleBasicInfoChange('return_date', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">성인 수</label>
                            <input
                                type="number"
                                min="0"
                                value={quote.adult_count || 0}
                                onChange={(e) => handleBasicInfoChange('adult_count', parseInt(e.target.value))}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">아동 수</label>
                            <input
                                type="number"
                                min="0"
                                value={quote.child_count || 0}
                                onChange={(e) => handleBasicInfoChange('child_count', parseInt(e.target.value))}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">유아 수</label>
                            <input
                                type="number"
                                min="0"
                                value={quote.infant_count || 0}
                                onChange={(e) => handleBasicInfoChange('infant_count', parseInt(e.target.value))}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">크루즈명</label>
                            <input
                                type="text"
                                value={quote.cruise_name || ''}
                                onChange={(e) => handleBasicInfoChange('cruise_name', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                placeholder="크루즈명을 입력하세요"
                            />
                        </div>
                    </div>

                    <div className="mt-6">
                        <label className="block text-sm font-medium text-gray-700 mb-2">매니저 메모</label>
                        <textarea
                            value={quote.manager_note || ''}
                            onChange={(e) => handleBasicInfoChange('manager_note', e.target.value)}
                            rows={3}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="매니저 메모를 입력하세요..."
                        />
                    </div>
                </div>

                {/* 서비스 아이템 관리 */}
                <div className="bg-white rounded-lg shadow-md p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold flex items-center gap-2">
                            <Calendar className="w-6 h-6 text-purple-600" />
                            서비스 항목 관리
                        </h3>
                        <button
                            onClick={addNewServiceItem}
                            className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors flex items-center gap-2"
                        >
                            <Plus className="w-4 h-4" />
                            서비스 추가
                        </button>
                    </div>

                    {serviceItems.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                            <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                            <p>등록된 서비스 항목이 없습니다.</p>
                            <p className="text-sm">서비스 추가 버튼을 클릭하여 새 항목을 추가하세요.</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {serviceItems.map((item, index) => (
                                <div key={index} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                            {getServiceIcon(item.service_type)}
                                            <span className="font-medium text-gray-800">{item.name}</span>
                                            {item.isNew && (
                                                <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                                                    새 항목
                                                </span>
                                            )}
                                        </div>
                                        <button
                                            onClick={() => removeServiceItem(index)}
                                            className="p-1 text-red-600 hover:text-red-800 transition-colors"
                                            title="삭제"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">서비스명</label>
                                            <input
                                                type="text"
                                                value={item.name}
                                                onChange={(e) => handleServiceItemChange(index, 'name', e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">수량</label>
                                            <input
                                                type="number"
                                                min="1"
                                                value={item.quantity}
                                                onChange={(e) => {
                                                    const quantity = parseInt(e.target.value);
                                                    handleServiceItemChange(index, 'quantity', quantity);
                                                    // 총액 자동 계산
                                                    handleServiceItemChange(index, 'total_price', quantity * item.unit_price);
                                                }}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">단가</label>
                                            <input
                                                type="number"
                                                min="0"
                                                value={item.unit_price}
                                                onChange={(e) => {
                                                    const unitPrice = parseInt(e.target.value);
                                                    handleServiceItemChange(index, 'unit_price', unitPrice);
                                                    // 총액 자동 계산
                                                    handleServiceItemChange(index, 'total_price', item.quantity * unitPrice);
                                                }}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">총액</label>
                                            <input
                                                type="number"
                                                min="0"
                                                value={item.total_price}
                                                onChange={(e) => handleServiceItemChange(index, 'total_price', parseInt(e.target.value))}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            />
                                        </div>
                                    </div>

                                    {item.description && (
                                        <div className="mt-3">
                                            <label className="block text-sm font-medium text-gray-700 mb-1">설명</label>
                                            <textarea
                                                value={item.description}
                                                onChange={(e) => handleServiceItemChange(index, 'description', e.target.value)}
                                                rows={2}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                placeholder="서비스 상세 설명..."
                                            />
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* 견적 요약 */}
                <div className="bg-yellow-50 rounded-lg border border-yellow-200 p-6">
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                        <AlertTriangle className="w-6 h-6 text-yellow-600" />
                        견적 요약 및 미리보기
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <h4 className="font-medium text-gray-700 mb-2">서비스 항목</h4>
                            <div className="space-y-1 text-sm">
                                {serviceItems.map((item, index) => (
                                    <div key={index} className="flex justify-between">
                                        <span>{item.name} (x{item.quantity})</span>
                                        <span className="font-medium">{item.total_price.toLocaleString()}동</span>
                                    </div>
                                ))}
                                {serviceItems.length === 0 && (
                                    <p className="text-gray-500">등록된 서비스 항목이 없습니다.</p>
                                )}
                            </div>
                        </div>

                        <div>
                            <h4 className="font-medium text-gray-700 mb-2">총 견적 금액</h4>
                            <div className="text-2xl font-bold text-blue-600 mb-4">
                                {calculateTotalPrice().toLocaleString()}동
                            </div>

                            <div className="text-sm text-gray-600 space-y-1">
                                <div>성인: {quote.adult_count}명</div>
                                <div>아동: {quote.child_count}명</div>
                                <div>유아: {quote.infant_count}명</div>
                                <div>여행기간: {quote.departure_date && quote.return_date ?
                                    `${new Date(quote.departure_date).toLocaleDateString()} ~ ${new Date(quote.return_date).toLocaleDateString()}`
                                    : '미정'}</div>
                            </div>
                        </div>
                    </div>

                    <div className="mt-4 p-3 bg-blue-100 rounded-lg">
                        <p className="text-blue-800 font-medium text-sm">
                            ⚠️ 저장하기 전에 모든 정보가 정확한지 확인해주세요. 총 견적 금액은 자동으로 계산됩니다.
                        </p>
                    </div>
                </div>
            </div>
        </ManagerLayout>
    );
}

export default function QuoteEditPage() {
    return (
        <Suspense fallback={
            <ManagerLayout title="견적 수정" activeTab="quotes">
                <div className="flex justify-center items-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
                </div>
            </ManagerLayout>
        }>
            <QuoteEditContent />
        </Suspense>
    );
}
