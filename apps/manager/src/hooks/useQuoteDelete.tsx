// 개선된 견적 삭제 훅
import { useState } from 'react';
import supabase from '@/lib/supabase';

interface DeleteQuoteData {
    quote: any;
    relatedData: {
        quoteItems: any[];
        reservations: any[];
        summary: {
            quoteItemsCount: number;
            reservationsCount: number;
            serviceTypes: string[];
            reservationTypes: string[];
            reservationStatuses: string[];
        };
    };
}

export function useQuoteDelete() {
    const [isLoading, setIsLoading] = useState(false);
    const [deleteData, setDeleteData] = useState<DeleteQuoteData | null>(null);
    const [showConfirm, setShowConfirm] = useState(false);

    // 견적 삭제 전 연결된 데이터 확인
    const checkDeleteData = async (quoteId: number) => {
        try {
            setIsLoading(true);

            // API로 연결된 데이터 조회
            const response = await fetch(`/api/admin/quotes/${quoteId}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
                }
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || '데이터 조회 실패');
            }

            const data = await response.json();
            setDeleteData(data);
            setShowConfirm(true);

            return data;
        } catch (error) {
            console.error('삭제 데이터 확인 오류:', error);
            alert('삭제 전 데이터 확인 중 오류가 발생했습니다.');
            return null;
        } finally {
            setIsLoading(false);
        }
    };

    // 견적 삭제 실행
    const executeDelete = async (quoteId: number) => {
        try {
            setIsLoading(true);

            const response = await fetch(`/api/admin/quotes/${quoteId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
                }
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || '삭제 실패');
            }

            const result = await response.json();

            // 성공 메시지 표시
            alert(`견적 "${result.deletedData.quote.title}"이 성공적으로 삭제되었습니다.\n\n` +
                `연관 삭제된 데이터:\n` +
                `• Quote Items: ${result.deletedData.quoteItemsCount}개\n` +
                `• Reservations: ${result.deletedData.reservationsCount}개`);

            setShowConfirm(false);
            setDeleteData(null);

            return result;
        } catch (error) {
            console.error('견적 삭제 오류:', error);
            alert('견적 삭제 중 오류가 발생했습니다: ' + error);
            return null;
        } finally {
            setIsLoading(false);
        }
    };

    // 삭제 취소
    const cancelDelete = () => {
        setShowConfirm(false);
        setDeleteData(null);
    };

    return {
        isLoading,
        deleteData,
        showConfirm,
        checkDeleteData,
        executeDelete,
        cancelDelete
    };
}

// 견적 삭제 확인 다이얼로그 컴포넌트
interface QuoteDeleteDialogProps {
    isVisible: boolean;
    deleteData: DeleteQuoteData | null;
    isLoading: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}

export function QuoteDeleteDialog({
    isVisible,
    deleteData,
    isLoading,
    onConfirm,
    onCancel
}: QuoteDeleteDialogProps) {
    if (!isVisible || !deleteData) return null;

    const { quote, relatedData } = deleteData;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto">
                <h3 className="text-lg font-bold text-red-600 mb-4">
                    ⚠️ 견적 삭제 확인
                </h3>

                {/* 견적 정보 */}
                <div className="mb-4">
                    <p className="text-sm text-gray-700 mb-2">
                        다음 견적과 연결된 모든 데이터가 <strong className="text-red-600">영구적으로 삭제</strong>됩니다:
                    </p>
                    <div className="bg-gray-50 p-3 rounded border">
                        <p className="font-medium text-gray-800">📋 {quote.title}</p>
                        <p className="text-sm text-gray-600 mt-1">
                            견적 ID: {quote.id} | 상태: {quote.status}
                        </p>
                        <p className="text-sm text-gray-600">
                            생성일: {new Date(quote.created_at).toLocaleDateString()}
                        </p>
                    </div>
                </div>

                {/* 연관 삭제 데이터 상세 */}
                <div className="mb-4 space-y-3">
                    <h4 className="text-sm font-medium text-gray-700">연관 삭제될 데이터:</h4>

                    {/* Quote Items */}
                    <div className="bg-yellow-50 p-3 rounded border border-yellow-200">
                        <div className="flex justify-between text-sm mb-2">
                            <span className="font-medium">📦 Quote Items:</span>
                            <span className="font-bold text-yellow-700">
                                {relatedData.summary.quoteItemsCount}개
                            </span>
                        </div>
                        {relatedData.summary.serviceTypes.length > 0 && (
                            <div className="text-xs text-gray-600">
                                서비스 타입: {relatedData.summary.serviceTypes.join(', ')}
                            </div>
                        )}
                        {relatedData.quoteItems.length > 0 && (
                            <div className="mt-2 max-h-24 overflow-y-auto">
                                <div className="text-xs space-y-1">
                                    {relatedData.quoteItems.map((item, index) => (
                                        <div key={index} className="flex justify-between">
                                            <span>{item.service_type}</span>
                                            <span>{item.quantity}개 × {item.unit_price?.toLocaleString()}원</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Reservations */}
                    <div className="bg-red-50 p-3 rounded border border-red-200">
                        <div className="flex justify-between text-sm mb-2">
                            <span className="font-medium">🎫 예약 데이터:</span>
                            <span className="font-bold text-red-700">
                                {relatedData.summary.reservationsCount}개
                            </span>
                        </div>
                        {relatedData.summary.reservationTypes.length > 0 && (
                            <div className="text-xs text-gray-600 mb-1">
                                예약 타입: {relatedData.summary.reservationTypes.join(', ')}
                            </div>
                        )}
                        {relatedData.summary.reservationStatuses.length > 0 && (
                            <div className="text-xs text-gray-600">
                                상태: {relatedData.summary.reservationStatuses.join(', ')}
                            </div>
                        )}
                        {relatedData.reservations.length > 0 && (
                            <div className="mt-2 max-h-24 overflow-y-auto">
                                <div className="text-xs space-y-1">
                                    {relatedData.reservations.map((reservation, index) => (
                                        <div key={index} className="flex justify-between">
                                            <span>{reservation.re_type} ({reservation.re_status})</span>
                                            <span>{new Date(reservation.re_created_at).toLocaleDateString()}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* 경고 메시지 */}
                <div className="bg-red-100 p-3 rounded border border-red-300 mb-4">
                    <p className="text-sm text-red-800">
                        <strong>⚠️ 주의:</strong> 이 작업은 되돌릴 수 없습니다.
                        견적과 연결된 모든 예약, 견적 아이템이 CASCADE DELETE로 함께 삭제됩니다.
                    </p>
                </div>

                {/* 버튼 */}
                <div className="flex space-x-3">
                    <button
                        onClick={onCancel}
                        className="flex-1 px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
                        disabled={isLoading}
                    >
                        취소
                    </button>
                    <button
                        onClick={onConfirm}
                        className="flex-1 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
                        disabled={isLoading}
                    >
                        {isLoading ? '삭제 중...' : '영구 삭제'}
                    </button>
                </div>
            </div>
        </div>
    );
}
