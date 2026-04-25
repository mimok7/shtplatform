'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ConfirmationGenerateModal from '@/components/ConfirmationGenerateModal';

function CustomerConfirmationContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const quoteId = searchParams.get('quote_id') || '';

    if (!quoteId) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="text-6xl mb-6">❌</div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-4">접근 오류</h2>
                    <p className="text-gray-600 mb-6">예약 정보를 찾을 수 없습니다. 견적 번호를 확인해 주세요.</p>
                    <button
                        onClick={() => router.push('/')}
                        className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                        홈으로 이동
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            <ConfirmationGenerateModal
                isOpen={true}
                onClose={() => {
                    if (window.history.length > 1) {
                        window.close();
                        router.back();
                        return;
                    }
                    router.push('/mypage/confirmations');
                }}
                quoteId={quoteId}
            />
        </div>
    );
}

export const dynamic = 'force-dynamic';

export default function CustomerConfirmationPage() {
    return (
        <Suspense
            fallback={
                <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500 mx-auto mb-4" />
                        <p className="text-gray-600">페이지를 불러오는 중...</p>
                    </div>
                </div>
            }
        >
            <CustomerConfirmationContent />
        </Suspense>
    );
}
