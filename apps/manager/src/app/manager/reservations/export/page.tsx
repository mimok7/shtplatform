'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabase';
import ManagerLayout from '@/components/ManagerLayout';
import {
    Download,
    ArrowLeft,
    RefreshCw,
    Calendar,
    FileText,
    Database,
    Filter,
    CheckSquare,
    Square,
    AlertCircle
} from 'lucide-react';

interface ExportOptions {
    startDate: string;
    endDate: string;
    status: string[];
    types: string[];
    format: 'csv' | 'json';
    includeUserDetails: boolean;
    includeServiceDetails: boolean;
}

interface ReservationExportData {
    re_id: string;
    re_type: string;
    re_status: string;
    re_created_at: string;
    customer_name: string;
    customer_email: string;
    customer_phone: string;
    quote_title: string;
    quote_id: string;
}

export default function ReservationExportPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [previewData, setPreviewData] = useState<ReservationExportData[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [options, setOptions] = useState<ExportOptions>({
        startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30일 전
        endDate: new Date().toISOString().split('T')[0], // 오늘
        status: ['pending', 'approved', 'confirmed'],
        types: ['cruise', 'airport', 'hotel', 'tour', 'rentcar'],
        format: 'csv',
        includeUserDetails: true,
        includeServiceDetails: false
    });

    const statusOptions = [
        { value: 'pending', label: '대기중' },
        { value: 'approved', label: '승인' },
        { value: 'confirmed', label: '확정' },
        { value: 'cancelled', label: '취소' }
    ];

    const typeOptions = [
        { value: 'cruise', label: '크루즈' },
        { value: 'airport', label: '공항' },
        { value: 'hotel', label: '호텔' },
        { value: 'tour', label: '투어' },
        { value: 'rentcar', label: '렌터카' }
    ];

    useEffect(() => {
        // 옵션이 변경되면 미리보기 데이터 로드
        loadPreviewData();
    }, [options.startDate, options.endDate, options.status, options.types]);

    const loadPreviewData = async () => {
        if (options.status.length === 0 || options.types.length === 0) {
            setPreviewData([]);
            setTotalCount(0);
            return;
        }

        setLoading(true);
        try {
            // 1) 예약 기본 행 조회 (미리보기 10건)
            const { data: rows, error: baseError } = await supabase
                .from('reservation')
                .select('re_id, re_type, re_status, re_created_at, re_quote_id, re_user_id')
                .gte('re_created_at', options.startDate + 'T00:00:00.000Z')
                .lte('re_created_at', options.endDate + 'T23:59:59.999Z')
                .in('re_status', options.status)
                .in('re_type', options.types)
                .order('re_created_at', { ascending: false })
                .limit(10);
            if (baseError) throw baseError;

            const userIds = Array.from(new Set((rows || []).map((r: any) => r.re_user_id).filter(Boolean)));
            const quoteIds = Array.from(new Set((rows || []).map((r: any) => r.re_quote_id).filter(Boolean)));

            let usersById: Record<string, any> = {};
            let quotesById: Record<string, any> = {};

            if (userIds.length > 0) {
                const { data: usersData } = await supabase
                    .from('users')
                    .select('id, name, email, phone_number')
                    .in('id', userIds);
                (usersData || []).forEach((u: any) => { usersById[u.id] = u; });
            }

            if (quoteIds.length > 0) {
                const { data: quotesData } = await supabase
                    .from('quote')
                    .select('id, title')
                    .in('id', quoteIds);
                (quotesData || []).forEach((q: any) => { quotesById[q.id] = q; });
            }

            const formattedData: ReservationExportData[] = (rows || []).map((r: any) => ({
                re_id: r.re_id,
                re_type: r.re_type,
                re_status: r.re_status,
                re_created_at: r.re_created_at,
                customer_name: r.re_user_id ? (usersById[r.re_user_id]?.name || 'N/A') : 'N/A',
                customer_email: r.re_user_id ? (usersById[r.re_user_id]?.email || 'N/A') : 'N/A',
                customer_phone: r.re_user_id ? (usersById[r.re_user_id]?.phone_number || 'N/A') : 'N/A',
                quote_title: r.re_quote_id ? (quotesById[r.re_quote_id]?.title || 'N/A') : 'N/A',
                quote_id: r.re_quote_id || 'N/A'
            }));

            setPreviewData(formattedData);

            // 전체 개수 조회
            const { count } = await supabase
                .from('reservation')
                .select('*', { count: 'exact', head: true })
                .gte('re_created_at', options.startDate + 'T00:00:00.000Z')
                .lte('re_created_at', options.endDate + 'T23:59:59.999Z')
                .in('re_status', options.status)
                .in('re_type', options.types);

            setTotalCount(count || 0);
            setError(null);

        } catch (error) {
            console.error('미리보기 데이터 로드 실패:', error);
            setError('데이터를 불러오는 중 오류가 발생했습니다.');
            setPreviewData([]);
            setTotalCount(0);
        } finally {
            setLoading(false);
        }
    };

    const handleStatusToggle = (status: string) => {
        setOptions(prev => ({
            ...prev,
            status: prev.status.includes(status)
                ? prev.status.filter(s => s !== status)
                : [...prev.status, status]
        }));
    };

    const handleTypeToggle = (type: string) => {
        setOptions(prev => ({
            ...prev,
            types: prev.types.includes(type)
                ? prev.types.filter(t => t !== type)
                : [...prev.types, type]
        }));
    };

    const generateCSV = (data: ReservationExportData[]): string => {
        const headers = [
            '예약ID',
            '서비스타입',
            '상태',
            '예약일시',
            '고객명',
            '이메일',
            '전화번호',
            '견적명',
            '견적ID'
        ];

        const rows = data.map(item => [
            item.re_id,
            getTypeName(item.re_type),
            getStatusText(item.re_status),
            new Date(item.re_created_at).toLocaleString('ko-KR'),
            item.customer_name,
            item.customer_email,
            item.customer_phone,
            item.quote_title,
            item.quote_id
        ]);

        const csvContent = [headers, ...rows]
            .map(row => row.map(field => `"${field}"`).join(','))
            .join('\\n');

        return csvContent;
    };

    const handleExport = async () => {
        if (options.status.length === 0 || options.types.length === 0) {
            alert('내보낼 데이터의 상태와 타입을 선택해주세요.');
            return;
        }

        if (totalCount === 0) {
            alert('내보낼 데이터가 없습니다.');
            return;
        }

        if (!confirm(`총 ${totalCount}건의 데이터를 ${options.format.toUpperCase()} 형식으로 내보내시겠습니까?`)) {
            return;
        }

        setExporting(true);
        try {
            // 전체 데이터 조회 (제한 없음)
            const { data: rows, error: baseError } = await supabase
                .from('reservation')
                .select('re_id, re_type, re_status, re_created_at, re_quote_id, re_user_id')
                .gte('re_created_at', options.startDate + 'T00:00:00.000Z')
                .lte('re_created_at', options.endDate + 'T23:59:59.999Z')
                .in('re_status', options.status)
                .in('re_type', options.types)
                .order('re_created_at', { ascending: false });
            if (baseError) throw baseError;

            const userIds = Array.from(new Set((rows || []).map((r: any) => r.re_user_id).filter(Boolean)));
            const quoteIds = Array.from(new Set((rows || []).map((r: any) => r.re_quote_id).filter(Boolean)));

            let usersById: Record<string, any> = {};
            let quotesById: Record<string, any> = {};

            if (userIds.length > 0) {
                const { data: usersData } = await supabase
                    .from('users')
                    .select('id, name, email, phone_number')
                    .in('id', userIds);
                (usersData || []).forEach((u: any) => { usersById[u.id] = u; });
            }

            if (quoteIds.length > 0) {
                const { data: quotesData } = await supabase
                    .from('quote')
                    .select('id, title')
                    .in('id', quoteIds);
                (quotesData || []).forEach((q: any) => { quotesById[q.id] = q; });
            }

            const exportData: ReservationExportData[] = (rows || []).map((r: any) => ({
                re_id: r.re_id,
                re_type: r.re_type,
                re_status: r.re_status,
                re_created_at: r.re_created_at,
                customer_name: r.re_user_id ? (usersById[r.re_user_id]?.name || 'N/A') : 'N/A',
                customer_email: r.re_user_id ? (usersById[r.re_user_id]?.email || 'N/A') : 'N/A',
                customer_phone: r.re_user_id ? (usersById[r.re_user_id]?.phone_number || 'N/A') : 'N/A',
                quote_title: r.re_quote_id ? (quotesById[r.re_quote_id]?.title || 'N/A') : 'N/A',
                quote_id: r.re_quote_id || 'N/A'
            }));

            // 파일 생성 및 다운로드
            let content: string;
            let mimeType: string;
            let fileName: string;

            if (options.format === 'csv') {
                content = generateCSV(exportData);
                mimeType = 'text/csv;charset=utf-8;';
                fileName = `reservations_${options.startDate}_to_${options.endDate}.csv`;
            } else {
                content = JSON.stringify(exportData, null, 2);
                mimeType = 'application/json;charset=utf-8;';
                fileName = `reservations_${options.startDate}_to_${options.endDate}.json`;
            }

            // BOM 추가 (엑셀에서 한글이 깨지지 않도록)
            const BOM = '\\uFEFF';
            const blob = new Blob([BOM + content], { type: mimeType });

            // 다운로드
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.setAttribute('href', url);
            link.setAttribute('download', fileName);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);

            alert(`${exportData.length}건의 데이터가 성공적으로 내보내졌습니다.`);

        } catch (error) {
            console.error('데이터 내보내기 실패:', error);
            alert('데이터 내보내기 중 오류가 발생했습니다.');
        } finally {
            setExporting(false);
        }
    };

    const getTypeName = (type: string) => {
        switch (type) {
            case 'cruise': return '크루즈';
            case 'airport': return '공항';
            case 'hotel': return '호텔';
            case 'tour': return '투어';
            case 'rentcar': return '렌터카';
            default: return type;
        }
    };

    const getStatusText = (status: string) => {
        switch (status) {
            case 'pending': return '대기중';
            case 'approved': return '승인';
            case 'confirmed': return '확정';
            case 'cancelled': return '취소됨';
            default: return status;
        }
    };

    return (
        <ManagerLayout title="데이터 내보내기" activeTab="reservations">
            <div className="space-y-6">

                {/* 헤더 */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => router.push('/manager/reservations')}
                            className="p-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                        <div>
                            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                                <Download className="w-7 h-7 text-purple-600" />
                                예약 데이터 내보내기
                            </h1>
                            <p className="text-gray-600 mt-1">예약 데이터를 Excel 또는 JSON 파일로 내보냅니다.</p>
                        </div>
                    </div>

                    <button
                        onClick={loadPreviewData}
                        disabled={loading}
                        className="p-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-400 transition-colors"
                        title="새로고침"
                    >
                        <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>

                {error && (
                    <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
                        ⚠️ {error}
                    </div>
                )}

                {/* 내보내기 옵션 */}
                <div className="bg-white rounded-lg shadow-md p-6">
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                        <Filter className="w-6 h-6 text-blue-600" />
                        내보내기 옵션
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                        {/* 날짜 범위 */}
                        <div>
                            <h4 className="font-medium mb-3 flex items-center gap-2">
                                <Calendar className="w-5 h-5 text-gray-600" />
                                날짜 범위
                            </h4>
                            <div className="space-y-3">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        시작일
                                    </label>
                                    <input
                                        type="date"
                                        value={options.startDate}
                                        onChange={(e) => setOptions(prev => ({ ...prev, startDate: e.target.value }))}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        종료일
                                    </label>
                                    <input
                                        type="date"
                                        value={options.endDate}
                                        onChange={(e) => setOptions(prev => ({ ...prev, endDate: e.target.value }))}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* 파일 형식 */}
                        <div>
                            <h4 className="font-medium mb-3 flex items-center gap-2">
                                <FileText className="w-5 h-5 text-gray-600" />
                                파일 형식
                            </h4>
                            <div className="space-y-3">
                                <label className="flex items-center gap-2">
                                    <input
                                        type="radio"
                                        name="format"
                                        value="csv"
                                        checked={options.format === 'csv'}
                                        onChange={(e) => setOptions(prev => ({ ...prev, format: e.target.value as 'csv' }))}
                                    />
                                    <span>CSV (Excel 호환)</span>
                                </label>
                                <label className="flex items-center gap-2">
                                    <input
                                        type="radio"
                                        name="format"
                                        value="json"
                                        checked={options.format === 'json'}
                                        onChange={(e) => setOptions(prev => ({ ...prev, format: e.target.value as 'json' }))}
                                    />
                                    <span>JSON</span>
                                </label>
                            </div>
                        </div>
                    </div>

                    {/* 필터 옵션 */}
                    <div className="mt-6 pt-6 border-t">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                            {/* 예약 상태 */}
                            <div>
                                <h4 className="font-medium mb-3">예약 상태</h4>
                                <div className="space-y-2">
                                    {statusOptions.map(option => (
                                        <label key={option.value} className="flex items-center gap-2 cursor-pointer">
                                            <button
                                                type="button"
                                                onClick={() => handleStatusToggle(option.value)}
                                                className="flex items-center"
                                            >
                                                {options.status.includes(option.value) ? (
                                                    <CheckSquare className="w-5 h-5 text-blue-600" />
                                                ) : (
                                                    <Square className="w-5 h-5 text-gray-400" />
                                                )}
                                            </button>
                                            <span>{option.label}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {/* 서비스 타입 */}
                            <div>
                                <h4 className="font-medium mb-3">서비스 타입</h4>
                                <div className="space-y-2">
                                    {typeOptions.map(option => (
                                        <label key={option.value} className="flex items-center gap-2 cursor-pointer">
                                            <button
                                                type="button"
                                                onClick={() => handleTypeToggle(option.value)}
                                                className="flex items-center"
                                            >
                                                {options.types.includes(option.value) ? (
                                                    <CheckSquare className="w-5 h-5 text-blue-600" />
                                                ) : (
                                                    <Square className="w-5 h-5 text-gray-400" />
                                                )}
                                            </button>
                                            <span>{option.label}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 미리보기 및 통계 */}
                <div className="bg-white rounded-lg shadow-md p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold flex items-center gap-2">
                            <Database className="w-6 h-6 text-green-600" />
                            데이터 미리보기
                        </h3>
                        <div className="text-sm text-gray-600">
                            총 <strong className="text-blue-600">{totalCount}</strong>건의 데이터
                        </div>
                    </div>

                    {loading ? (
                        <div className="text-center py-8">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
                            <p className="text-gray-600">데이터를 불러오는 중...</p>
                        </div>
                    ) : previewData.length === 0 ? (
                        <div className="text-center py-8">
                            <AlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                            <p className="text-gray-600">선택한 조건에 해당하는 데이터가 없습니다.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
                            <table className="min-w-full table-auto text-sm">
                                <thead className="sticky top-0 z-10 bg-gray-50">
                                    <tr className="bg-gray-50">
                                        <th className="px-4 py-2 text-left font-medium text-gray-700 bg-gray-50">예약 ID</th>
                                        <th className="px-4 py-2 text-left font-medium text-gray-700 bg-gray-50">서비스</th>
                                        <th className="px-4 py-2 text-left font-medium text-gray-700 bg-gray-50">상태</th>
                                        <th className="px-4 py-2 text-left font-medium text-gray-700 bg-gray-50">고객</th>
                                        <th className="px-4 py-2 text-left font-medium text-gray-700 bg-gray-50">예약일</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {previewData.map((item) => (
                                        <tr key={item.re_id} className="border-t">
                                            <td className="px-4 py-2 font-mono text-xs">{item.re_id.slice(0, 8)}...</td>
                                            <td className="px-4 py-2">{getTypeName(item.re_type)}</td>
                                            <td className="px-4 py-2">
                                                <span className={`px-2 py-1 rounded text-xs ${item.re_status === 'confirmed' ? 'bg-green-100 text-green-800' :
                                                    item.re_status === 'cancelled' ? 'bg-red-100 text-red-800' :
                                                        'bg-yellow-100 text-yellow-800'
                                                    }`}>
                                                    {getStatusText(item.re_status)}
                                                </span>
                                            </td>
                                            <td className="px-4 py-2">{item.customer_name}</td>
                                            <td className="px-4 py-2">{new Date(item.re_created_at).toLocaleDateString('ko-KR')}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {totalCount > previewData.length && (
                                <p className="text-center text-sm text-gray-500 mt-3">
                                    ... 및 {totalCount - previewData.length}건의 추가 데이터
                                </p>
                            )}
                        </div>
                    )}
                </div>

                {/* 내보내기 버튼 */}
                <div className="bg-white rounded-lg shadow-md p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="font-medium">데이터 내보내기 준비 완료</h3>
                            <p className="text-sm text-gray-600 mt-1">
                                {totalCount}건의 데이터를 {options.format.toUpperCase()} 형식으로 내보냅니다.
                            </p>
                        </div>
                        <button
                            onClick={handleExport}
                            disabled={exporting || totalCount === 0 || loading}
                            className={`px-6 py-3 rounded-lg font-medium transition-colors ${exporting || totalCount === 0 || loading
                                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                : 'bg-purple-500 text-white hover:bg-purple-600'
                                }`}
                        >
                            {exporting ? (
                                <>
                                    <RefreshCw className="inline w-4 h-4 mr-2 animate-spin" />
                                    내보내는 중...
                                </>
                            ) : (
                                <>
                                    <Download className="inline w-4 h-4 mr-2" />
                                    데이터 내보내기
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </ManagerLayout>
    );
}
