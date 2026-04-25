'use client';

import React from 'react';

interface ConfirmationHeaderProps {
    quoteId: string;
    createdAt: string;
}

export const ConfirmationHeader = ({ quoteId, createdAt }: ConfirmationHeaderProps) => {
    const formatDate = (dateString: string) =>
        new Date(dateString).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });

    return (
        <div className="text-center mb-6 border-b-2 border-blue-600 pb-4">
            <div className="flex justify-between items-center mb-2">
                <div className="text-left">
                    <img src="/logo2.png" alt="스테이하롱 크루즈" className="h-12 mx-auto" />
                </div>
                <div className="text-right">
                    <div className="text-xs text-gray-500">확인서 번호</div>
                    <div className="text-xs font-mono text-gray-700">{quoteId.slice(-8).toUpperCase()}</div>
                    <div className="text-xs text-gray-400 mt-1">발행일: {formatDate(new Date().toISOString())}</div>
                </div>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-1">🎯 예약 확인서</h1>
        </div>
    );
};
