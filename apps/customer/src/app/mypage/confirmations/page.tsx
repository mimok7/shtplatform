'use client';
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import supabase from '../../../lib/supabase';
import PageWrapper from '../../../components/PageWrapper';
import SectionBox from '../../../components/SectionBox';
import ConfirmationGenerateModal from '@/components/ConfirmationGenerateModal';
import { clearInvalidSession, isInvalidRefreshTokenError } from '@/lib/authRecovery';
import { useLoadingTimeout } from '@/hooks/useLoadingTimeout';
import { getAuthUserSafe } from '@/lib/authSafe';
import { Home } from 'lucide-react';

interface Quote {
    id: string;
    quote_id: string;
    title: string;
    total_price: number;
    payment_status: string;
    created_at: string;
    confirmed_at?: string;
    reservation_count: number;
}

export default function MyConfirmationsPage() {
    const router = useRouter();
    const [user, setUser] = useState<any>(null);
    const [quotes, setQuotes] = useState<Quote[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [authError, setAuthError] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedQuoteId, setSelectedQuoteId] = useState<string>('');
    const [authRetryKey, setAuthRetryKey] = useState(0);
    // 결제 완료만 보여주므로 filter 상태 제거

    useLoadingTimeout(isLoading, setIsLoading, 12000);

    const handleGoHome = () => {
        router.push('/mypage');
    };

    const isAuthTimeoutError = (error: unknown) => {
        const message = (error as { message?: string } | null)?.message || '';
        return /AUTH_TIMEOUT_|timed out|timeout/i.test(message);
    };

    const loadQuotes = async (userId?: string) => {
        if (!userId) {
            setQuotes([]);
            setIsLoading(false);
            return;
        }

        try {
            setIsLoading(true);

            // 1. 결제 완료된 예약(payment_status = 'completed') 조회
            const { data: completedPayments, error: paymentError } = await supabase
                .from('reservation_payment')
                .select('reservation_id')
                .eq('user_id', userId)
                .eq('payment_status', 'completed');

            if (paymentError) {
                console.error('결제 조회 실패:', paymentError);
                setQuotes([]);
                setIsLoading(false);
                return;
            }

            const completedReservationIds = completedPayments?.map(p => p.reservation_id) || [];
            if (completedReservationIds.length === 0) {
                setQuotes([]);
                setIsLoading(false);
                return;
            }

            // 2. 해당 예약 정보 조회
            const { data: reservations, error: reservationError } = await supabase
                .from('reservation')
                .select('re_id, re_quote_id, re_user_id')
                .in('re_id', completedReservationIds);

            if (reservationError) {
                console.error('예약 조회 실패:', reservationError);
                setQuotes([]);
                setIsLoading(false);
                return;
            }

            // 3. 본인 예약만 필터링
            const myReservations = reservations?.filter(r => r.re_user_id === userId) || [];
            const myQuoteIds = myReservations.map(r => r.re_quote_id);
            if (myQuoteIds.length === 0) {
                setQuotes([]);
                setIsLoading(false);
                return;
            }

            // 4. 해당 quote 정보 조회
            const { data: quotesData, error: quotesError } = await supabase
                .from('quote')
                .select('*')
                .in('id', myQuoteIds)
                .order('created_at', { ascending: false });

            if (quotesError) {
                console.error('견적 조회 실패:', quotesError);
                setQuotes([]);
                setIsLoading(false);
                return;
            }
            const { data: paymentRecords, error: paymentRecordsError } = await supabase
                .from('reservation_payment')
                .select('reservation_id, amount')
                .in('reservation_id', completedReservationIds)
                .eq('payment_status', 'completed');

            if (paymentRecordsError) {
                console.error('결제내역 조회 실패:', paymentRecordsError);
                setQuotes([]);
                setIsLoading(false);
                return;
            }

            const reservationPaymentMap = new Map<string, number>();
            (paymentRecords || []).forEach(record => {
                const amount = Number((record as any).amount) || 0;
                const sum = reservationPaymentMap.get((record as any).reservation_id) || 0;
                reservationPaymentMap.set((record as any).reservation_id, sum + amount);
            });

            const quotePaymentMap = new Map<string, number>();
            myReservations.forEach(res => {
                const amount = reservationPaymentMap.get(res.re_id) || 0;
                const sum = quotePaymentMap.get(res.re_quote_id) || 0;
                quotePaymentMap.set(res.re_quote_id, sum + amount);
            });

            // 5. 각 quote별 서비스 개수 집계 (reservation 기준)
            const serviceCountMap = new Map<string, number>();
            myReservations.forEach(res => {
                const count = serviceCountMap.get(res.re_quote_id) || 0;
                serviceCountMap.set(res.re_quote_id, count + 1);
            });

            const processedQuotes: Quote[] = quotesData.map(quote => ({
                id: quote.id,
                quote_id: quote.quote_id || quote.id,
                title: quote.title || '제목 없음',
                total_price: quotePaymentMap.get(quote.id) || quote.total_price || 0,
                payment_status: quote.payment_status || 'pending',
                created_at: quote.created_at,
                confirmed_at: quote.confirmed_at,
                reservation_count: serviceCountMap.get(quote.id) || 0 // 서비스 개수로 변경
            }));

            setQuotes(processedQuotes);

        } catch (error) {
            console.error('데이터 로드 실패:', error);
            setQuotes([]);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        const fetchData = async () => {
            try {
                setAuthError(null);
                const { user, error: userError, timedOut } = await getAuthUserSafe({ timeoutMs: 8000, retries: 1 });

                if (timedOut) {
                    setIsLoading(false);
                    setAuthError('세션 확인이 지연되었습니다. 잠시 후 다시 시도해 주세요.');
                    return;
                }

                if (userError && isInvalidRefreshTokenError(userError)) {
                    await clearInvalidSession();
                    setIsLoading(false);
                    router.replace('/login');
                    return;
                }

                if (userError || !user) {
                    if (isAuthTimeoutError(userError)) {
                        setIsLoading(false);
                        setAuthError('세션 확인이 지연되었습니다. 네트워크 상태를 확인 후 다시 시도해 주세요.');
                        return;
                    }
                    setIsLoading(false);
                    router.replace('/login');
                    return;
                }

                setUser(user);
                await loadQuotes(user.id);
            } catch (error) {
                if (isInvalidRefreshTokenError(error)) {
                    await clearInvalidSession();
                    setIsLoading(false);
                    router.replace('/login');
                    return;
                }
                if (isAuthTimeoutError(error)) {
                    setAuthError('세션 확인이 지연되었습니다. 잠시 후 다시 시도해 주세요.');
                    setIsLoading(false);
                    return;
                }
                setIsLoading(false);
                router.replace('/login');
            }
        };

        fetchData();
    }, [authRetryKey]); // ✅ 재시도 버튼으로만 재실행

    // 필터 관련 useEffect 제거

    const viewConfirmation = (quote: Quote) => {
        setSelectedQuoteId(quote.id);
        setIsModalOpen(true);
    };



    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('ko-KR', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    };

    const getStatusBadge = (status: string, hasReservations: boolean) => {
        if (status === 'paid' && hasReservations) {
            return <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">✅ 예약완료</span>;
        } else if (status === 'paid') {
            return <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">💳 결제완료</span>;
        } else {
            return null;
        }
    };

    if (isLoading) {
        return (
            <PageWrapper title="예약확인서">
                <div className="text-center py-12">
                    <div className="text-4xl mb-4">🔄</div>
                    <p>로딩 중...</p>
                </div>
            </PageWrapper>
        );
    }

    if (authError) {
        return (
            <PageWrapper title="예약확인서">
                <SectionBox title="인증 확인 지연">
                    <div className="text-center py-8">
                        <div className="text-4xl mb-3">⏱️</div>
                        <p className="text-sm text-gray-700 mb-4">{authError}</p>
                        <div className="flex justify-center gap-2">
                            <button
                                onClick={() => {
                                    setIsLoading(true);
                                    setAuthRetryKey((prev) => prev + 1);
                                }}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                            >
                                다시 시도
                            </button>
                            <button
                                onClick={handleGoHome}
                                className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm font-medium"
                            >
                                <Home className="w-4 h-4" />
                                홈
                            </button>
                        </div>
                    </div>
                </SectionBox>
            </PageWrapper>
        );
    }

    // paidQuotes만 사용, pendingQuotes 제거
    const paidQuotes = quotes;

    return (
        <>
            <PageWrapper
                title="📄 예약확인서"
                actions={
                    <>
                        <button
                            onClick={handleGoHome}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm font-medium"
                        >
                            <Home className="w-4 h-4" />
                            홈
                        </button>
                        <button
                            onClick={() => loadQuotes(user?.id)}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                        >
                            🔄 새로고침
                        </button>
                    </>
                }
            >

                {/* 상단 안내 */}
                <SectionBox title="">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
                        <div className="flex items-start space-x-4">
                            <div className="text-3xl">📄</div>
                            <div>
                                <h2 className="text-lg font-semibold text-blue-900 mb-2">나의 예약확인서</h2>
                                <p className="text-blue-700 text-sm">
                                    결제가 완료된 예약의 확인서를 확인하고 인쇄할 수 있습니다.
                                    확인서에는 여행 상세 정보, 준비사항, 연락처 등이 포함되어 있습니다.
                                </p>
                                <p className="mt-2 text-sm font-semibold text-red-600 md:hidden">
                                    모바일 사용시 가로 보기로 보세요.
                                </p>
                            </div>
                        </div>
                    </div>
                </SectionBox>

                {/* 새로고침 버튼 영역 삭제 */}



                {/* 예약 목록 - 결제 완료된 예약만 표시 */}
                <SectionBox title="예약확인서 목록">
                    {quotes.length === 0 ? (
                        <div className="text-center py-12">
                            <div className="text-4xl mb-4">📭</div>
                            <h3 className="text-lg font-medium text-gray-900 mb-2">예약 내역이 없습니다</h3>
                            <p className="text-gray-600">결제 완료된 예약이 없습니다.</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {quotes.map((quote) => (
                                <div
                                    key={quote.id}
                                    className="w-full text-left bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md transition-all"
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex-1">
                                            <div className="flex items-center space-x-3 mb-2">
                                                <h3 className="text-lg font-semibold text-gray-900">{quote.title.replace(/\d+$/, '')}</h3>
                                                {getStatusBadge(quote.payment_status, quote.reservation_count > 0)}
                                            </div>
                                            <div className="text-sm text-gray-600">
                                                <div className="md:hidden space-y-1">
                                                    <div>예약일: {formatDate(quote.created_at)}</div>
                                                    <div>서비스: {quote.reservation_count}개</div>
                                                </div>
                                                <div className="hidden md:grid grid-cols-2 md:grid-cols-3 gap-4">
                                                    <div>
                                                        <span className="font-medium">예약일:</span>
                                                        <div>{formatDate(quote.created_at)}</div>
                                                    </div>
                                                    <div>
                                                        <span className="font-medium">서비스:</span>
                                                        <div>{quote.reservation_count}개</div>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="md:hidden mt-3 flex justify-end">
                                                <button
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        viewConfirmation(quote);
                                                    }}
                                                    className="px-3 py-1 bg-blue-600 text-white rounded text-sm flex items-center space-x-2"
                                                >
                                                    <span>📄</span>
                                                    <span>확인서 보기</span>
                                                </button>
                                            </div>
                                        </div>
                                        <div className="ml-6 md:ml-0">
                                            <div className="hidden md:flex items-center space-x-3">
                                                <button
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        viewConfirmation(quote);
                                                    }}
                                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm flex items-center space-x-2"
                                                >
                                                    <span>📄</span>
                                                    <span>확인서 보기</span>
                                                </button>
                                                {quote.confirmed_at && (
                                                    <div className="text-xs text-green-600">
                                                        발송완료: {formatDate(quote.confirmed_at)}
                                                    </div>
                                                )}
                                            </div>
                                            {quote.confirmed_at && (
                                                <div className="text-xs text-green-600 mt-2 text-center md:text-left">
                                                    발송완료: {formatDate(quote.confirmed_at)}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </SectionBox>

                {/* 안내사항 */}
                <SectionBox title="">
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
                        <h3 className="text-lg font-semibold text-yellow-800 mb-3 flex items-center">
                            <span className="mr-2">💡</span>
                            예약확인서 안내
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-yellow-700">
                            <div>
                                <h4 className="font-semibold mb-2">📄 확인서 내용</h4>
                                <ul className="space-y-1">
                                    <li>• 예약자 정보 및 연락처</li>
                                    <li>• 예약 서비스 상세 내역</li>
                                    <li>• 긴급연락처 및 고객지원</li>
                                </ul>
                            </div>
                            <div>
                                <h4 className="font-semibold mb-2">🖨️ 이용 방법</h4>
                                <ul className="space-y-1">
                                    <li>• 확인서 페이지에서 인쇄 가능</li>
                                    <li>• 모바일에서도 열람 가능</li>
                                    <li>• 24시간 언제든 접근 가능</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </SectionBox>


            </PageWrapper>

            {selectedQuoteId && (
                <ConfirmationGenerateModal
                    isOpen={isModalOpen}
                    quoteId={selectedQuoteId}
                    onClose={() => {
                        setIsModalOpen(false);
                        setSelectedQuoteId('');
                    }}
                />
            )}
        </>
    );
}
