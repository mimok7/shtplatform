'use client';

import React from 'react';

interface ReservationSummaryTableProps {
    quoteData: {
        user_name: string;
        user_email: string;
        user_phone: string;
        quote_id: string;
        title: string;
        created_at: string;
        reservations: any[];
        total_price: number;
    };
}

export const ReservationSummaryTable = ({ quoteData }: ReservationSummaryTableProps) => {
    const formatDate = (dateString: string) =>
        new Date(dateString).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });

    const getServiceTypeName = (type: string) => {
        const typeNames: Record<string, string> = {
            cruise: '크루즈',
            airport: '공항차량',
            hotel: '호텔',
            rentcar: '렌터카',
            tour: '투어',
            car: '차량 서비스',
        };
        return typeNames[type] || type;
    };

    return (
        <div className="mb-6">
            <table className="w-full border border-gray-300">
                <tbody>
                    <tr className="bg-blue-50">
                        <td className="border border-gray-300 px-3 py-2 font-semibold text-gray-700 w-1/4 text-center">예약자 정보</td>
                        <td className="border border-gray-300 px-3 py-2 font-semibold text-gray-700 w-1/4 text-center">예약 기본 정보</td>
                        <td className="border border-gray-300 px-3 py-2 font-semibold text-gray-700 w-1/4 text-center">예약 내역</td>
                        <td className="border border-gray-300 px-3 py-2 font-semibold text-gray-700 w-1/4 text-center">결제 정보</td>
                    </tr>
                    <tr>
                        <td className="border border-gray-300 px-3 py-2 align-top">
                            <div className="space-y-1 text-sm">
                                <div><span className="text-gray-500">성명:</span> <span className="font-semibold">{quoteData.user_name}</span></div>
                                <div><span className="text-gray-500">📧 이메일:</span> <span>{quoteData.user_email}</span></div>
                                <div><span className="text-gray-500">📞 연락처:</span> <span>{quoteData.user_phone}</span></div>
                            </div>
                        </td>
                        <td className="border border-gray-300 px-3 py-2 align-top">
                            <div className="space-y-1 text-sm">
                                <div><span className="text-gray-500">예약번호:</span> <span className="font-mono">{quoteData.quote_id}</span></div>
                                <div><span className="text-gray-500">예약명:</span> <span className="font-medium">{quoteData.title}</span></div>
                                <div><span className="text-gray-500">예약일:</span> <span>{formatDate(quoteData.created_at)}</span></div>
                            </div>
                        </td>
                        <td className="border border-gray-300 px-3 py-2 align-top">
                            <div className="space-y-1 text-sm">
                                <div><span className="text-gray-500">서비스 종류:</span></div>
                                <div className="flex flex-wrap gap-1 mt-1">
                                    {quoteData.reservations && quoteData.reservations.length > 0 ? (
                                        Array.from(new Set(quoteData.reservations.map((r) => r.service_type))).map((type) => (
                                            <span key={type} className="inline-block px-2 py-1 bg-blue-50 text-blue-600 rounded text-xs font-medium">
                                                {getServiceTypeName(type)}
                                            </span>
                                        ))
                                    ) : (
                                        <span className="text-gray-400">-</span>
                                    )}
                                </div>
                            </div>
                        </td>
                        <td className="border border-gray-300 px-3 py-2 align-top">
                            <div className="space-y-1 text-sm">
                                <div><span className="text-gray-500">결제상태:</span> <span className="inline-block px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded">✅ 결제완료</span></div>
                                <div><span className="text-gray-500">총 금액:</span> <span className="text-lg font-bold text-blue-600">{quoteData.total_price.toLocaleString()}동</span></div>
                            </div>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    );
};
