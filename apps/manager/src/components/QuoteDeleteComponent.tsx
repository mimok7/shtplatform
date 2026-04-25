// 견적 삭제 기능이 포함된 관리자/매니저용 견적 관리 컴포넌트
import { useState } from 'react';
import supabase from '@/lib/supabase';

interface QuoteDeleteProps {
    quoteId: number;
    quoteTitle: string;
    onDeleteSuccess?: () => void;
    onDeleteCancel?: () => void;
}

export function QuoteDeleteComponent({
    quoteId,
    quoteTitle,
    onDeleteSuccess,
    onDeleteCancel
}: QuoteDeleteProps) {
    const [isDeleting, setIsDeleting] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [deleteStats, setDeleteStats] = useState<any>(null);

    // 견적 삭제 전 연결된 데이터 확인
    const checkRelatedData = async () => {
        try {
            // quote_item 개수 확인
            const { data: quoteItems, error: itemError } = await supabase
                .from('quote_item')
                .select('id, service_type')
                .eq('quote_id', quoteId);

            if (itemError) {
                console.error('quote_item 조회 오류:', itemError);
                return null;
            }

            // reservation 개수 확인
            const { data: reservations, error: reservationError } = await supabase
                .from('reservation')
                .select('re_id, re_type, re_status')
                .eq('re_quote_id', quoteId);

            if (reservationError) {
                console.error('reservation 조회 오류:', reservationError);
                return null;
            }

            return {
                quoteItems: quoteItems || [],
                reservations: reservations || []
            };
        } catch (error) {
            console.error('연결 데이터 확인 오류:', error);
            return null;
        }
    };

    // 삭제 확인 다이얼로그 열기
    const handleDeleteClick = async () => {
        const stats = await checkRelatedData();
        if (stats) {
            setDeleteStats(stats);
            setShowConfirm(true);
        } else {
            alert('연결된 데이터를 확인할 수 없습니다.');
        }
    };

    // 견적 삭제 실행 (CASCADE DELETE로 연결된 모든 데이터 삭제)
    const executeDelete = async () => {
        try {
            setIsDeleting(true);

            // quote 삭제 (CASCADE DELETE로 연결된 모든 데이터 자동 삭제)
            const { error: deleteError } = await supabase
                .from('quote')
                .delete()
                .eq('id', quoteId);

            if (deleteError) {
                console.error('견적 삭제 오류:', deleteError);
                alert('견적 삭제 중 오류가 발생했습니다: ' + deleteError.message);
                return;
            }

            alert(`견적 "${quoteTitle}"이 성공적으로 삭제되었습니다.\n` +
                `연관 삭제된 데이터:\n` +
                `- Quote Items: ${deleteStats.quoteItems.length}개\n` +
                `- Reservations: ${deleteStats.reservations.length}개`);

            setShowConfirm(false);
            if (onDeleteSuccess) {
                onDeleteSuccess();
            }

        } catch (error) {
            console.error('견적 삭제 중 예외:', error);
            alert('견적 삭제 중 오류가 발생했습니다.');
        } finally {
            setIsDeleting(false);
        }
    };

    // 삭제 취소
    const handleCancel = () => {
        setShowConfirm(false);
        setDeleteStats(null);
        if (onDeleteCancel) {
            onDeleteCancel();
        }
    };

    return (
        <div>
            {/* 삭제 버튼 */}
            <button
                onClick={handleDeleteClick}
                className="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600 transition-colors"
                disabled={isDeleting}
            >
                {isDeleting ? '삭제 중...' : '견적 삭제'}
            </button>

            {/* 삭제 확인 다이얼로그 */}
            {showConfirm && deleteStats && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
                        <h3 className="text-lg font-bold text-red-600 mb-4">
                            ⚠️ 견적 삭제 확인
                        </h3>

                        <div className="mb-4">
                            <p className="text-sm text-gray-700 mb-2">
                                다음 견적과 연결된 모든 데이터가 <strong>영구적으로 삭제</strong>됩니다:
                            </p>
                            <div className="bg-gray-50 p-3 rounded border">
                                <p className="font-medium text-gray-800">📋 {quoteTitle}</p>
                                <p className="text-sm text-gray-600 mt-1">견적 ID: {quoteId}</p>
                            </div>
                        </div>

                        <div className="mb-4 space-y-2">
                            <h4 className="text-sm font-medium text-gray-700">연관 삭제될 데이터:</h4>

                            <div className="bg-yellow-50 p-3 rounded border border-yellow-200">
                                <div className="flex justify-between text-sm">
                                    <span>Quote Items:</span>
                                    <span className="font-medium text-yellow-700">
                                        {deleteStats.quoteItems.length}개
                                    </span>
                                </div>
                                {deleteStats.quoteItems.length > 0 && (
                                    <div className="mt-1 text-xs text-gray-600">
                                        타입: {[...new Set(deleteStats.quoteItems.map((item: any) => item.service_type))].join(', ')}
                                    </div>
                                )}
                            </div>

                            <div className="bg-red-50 p-3 rounded border border-red-200">
                                <div className="flex justify-between text-sm">
                                    <span>예약 데이터:</span>
                                    <span className="font-medium text-red-700">
                                        {deleteStats.reservations.length}개
                                    </span>
                                </div>
                                {deleteStats.reservations.length > 0 && (
                                    <div className="mt-1 text-xs text-gray-600">
                                        상태: {[...new Set(deleteStats.reservations.map((res: any) => res.re_status))].join(', ')}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="bg-red-100 p-3 rounded border border-red-300 mb-4">
                            <p className="text-sm text-red-800">
                                <strong>주의:</strong> 이 작업은 되돌릴 수 없습니다.
                                견적과 연결된 모든 예약, 견적 아이템이 함께 삭제됩니다.
                            </p>
                        </div>

                        <div className="flex space-x-3">
                            <button
                                onClick={handleCancel}
                                className="flex-1 px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
                                disabled={isDeleting}
                            >
                                취소
                            </button>
                            <button
                                onClick={executeDelete}
                                className="flex-1 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
                                disabled={isDeleting}
                            >
                                {isDeleting ? '삭제 중...' : '영구 삭제'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// 사용 예시 컴포넌트
export function QuoteManagementExample() {
    const [quotes, setQuotes] = useState<any[]>([]);

    // 견적 목록 새로고침
    const refreshQuotes = async () => {
        const { data: quotesData, error } = await supabase
            .from('quote')
            .select('id, title, status, created_at')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('견적 목록 조회 오류:', error);
            return;
        }

        setQuotes(quotesData || []);
    };

    return (
        <div className="space-y-4">
            <h2 className="text-lg font-bold">견적 관리</h2>

            {quotes.map(quote => (
                <div key={quote.id} className="flex items-center justify-between p-4 bg-white rounded-lg shadow border">
                    <div>
                        <h3 className="font-medium">{quote.title}</h3>
                        <p className="text-sm text-gray-600">
                            상태: {quote.status} | 생성일: {new Date(quote.created_at).toLocaleDateString()}
                        </p>
                    </div>

                    <div className="flex space-x-2">
                        <button className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600">
                            수정
                        </button>

                        <QuoteDeleteComponent
                            quoteId={quote.id}
                            quoteTitle={quote.title}
                            onDeleteSuccess={refreshQuotes}
                        />
                    </div>
                </div>
            ))}
        </div>
    );
}
