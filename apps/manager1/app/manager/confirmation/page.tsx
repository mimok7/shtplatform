'use client';
import { useState, useEffect, Suspense } from 'react';
import ManagerLayout from '../../../components/ManagerLayout';
import ConfirmationGenerateModal from '../../../components/ConfirmationGenerateModal';
import { fetchTableInBatches } from '@/lib/fetchInBatches';
import supabase from '@/lib/supabase';
import Link from 'next/link';

// 예약 단위 카드 렌더링을 위해 ReservationWithQuoteInfo 타입 정의
interface ReservationWithQuoteInfo {
    re_id: string; // 대표 ID
    re_ids: string[]; // 그룹 내 전체 ID
    re_quote_id: string;
    re_type: string;
    re_status: string;
    quote_title: string;
    user_name: string;
    user_email: string;
    user_phone: string;
    created_at: string;
    payment_status: string;
    status?: string;
    confirmed_at?: string | null;
    confirmation_status?: 'waiting' | 'generated' | 'sent'; // 확인서 상태 추가
}

function ConfirmationContent() {
    const [quotes, setQuotes] = useState<ReservationWithQuoteInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(false);
    const [filter, setFilter] = useState('paid'); // paid만 기본으로
    const [searchTerm, setSearchTerm] = useState('');
    const [searchInput, setSearchInput] = useState('');
    const [selectedCards, setSelectedCards] = useState<Set<string>>(new Set()); // 선택된 카드들
    const [statusFilter, setStatusFilter] = useState<string>('waiting'); // 기본: 확인서 대기
    const [sortBy, setSortBy] = useState<'date' | 'name'>('date'); // 정렬 기준 추가

    // 페이지네이션 상태
    const [page, setPage] = useState(1);
    const PAGE_SIZE = 20;
    const PAYMENT_BATCH_SIZE = 80;

    // 팝업 모달 상태 추가
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedQuoteId, setSelectedQuoteId] = useState<string>('');

    const sortReservations = (items: ReservationWithQuoteInfo[]) => {
        const sorted = [...items];
        if (sortBy === 'name') {
            sorted.sort((a, b) => (a.user_name || '').localeCompare(b.user_name || '', 'ko'));
        } else {
            sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        }
        return sorted;
    };

    useEffect(() => {
        loadQuotesWithReservations(1);
    }, [statusFilter, searchTerm, sortBy]);

    useEffect(() => {
        setPage(1);
        setSelectedCards(new Set());
    }, [statusFilter, searchTerm, sortBy]);

    useEffect(() => {
        if (page === 1) {
            return;
        }
        loadQuotesWithReservations(page);
    }, [page]);

    const loadQuotesWithReservations = async (targetPage: number = 1) => {
        try {
            if (targetPage === 1) {
                setLoading(true);
            } else {
                setIsLoadingMore(true);
            }

            const targetVisibleCount = searchTerm ? Number.MAX_SAFE_INTEGER : targetPage * PAGE_SIZE;
            let paymentOffset = 0;
            let reachedEnd = false;
            const groupedMap = new Map<string, ReservationWithQuoteInfo>();

            const getVisibleCount = () => Array.from(groupedMap.values()).filter((reservation) => {
                if (!searchTerm && statusFilter !== 'all' && reservation.confirmation_status !== statusFilter) {
                    return false;
                }
                return true;
            }).length;

            const mergeReservation = (reservation: ReservationWithQuoteInfo) => {
                const groupKey = reservation.re_quote_id || reservation.re_id;
                const existing = groupedMap.get(groupKey);
                if (!existing) {
                    groupedMap.set(groupKey, { ...reservation, re_ids: [...reservation.re_ids] });
                    return;
                }

                existing.re_ids = Array.from(new Set([...existing.re_ids, ...reservation.re_ids]));
                if (new Date(reservation.created_at) > new Date(existing.created_at)) {
                    existing.created_at = reservation.created_at;
                }

                const statusOrder = { sent: 3, generated: 2, waiting: 1 };
                const currentOrder = statusOrder[existing.confirmation_status || 'waiting'] || 0;
                const newOrder = statusOrder[reservation.confirmation_status || 'waiting'] || 0;
                if (newOrder > currentOrder) {
                    existing.confirmation_status = reservation.confirmation_status;
                    existing.confirmed_at = reservation.confirmed_at;
                }
            };

            while (!reachedEnd && getVisibleCount() < targetVisibleCount) {
                let paymentsQuery = supabase
                    .from('reservation_payment')
                    .select('reservation_id, amount, payment_method, payment_status, created_at, user_id')
                    .eq('payment_status', 'completed')
                    .order('created_at', { ascending: false });

                if (searchTerm) {
                    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(searchTerm);

                    const userFields = [`name.ilike.%${searchTerm}%`, `email.ilike.%${searchTerm}%`, `phone_number.ilike.%${searchTerm}%`];
                    if (isUUID) userFields.push(`id.eq.${searchTerm}`);
                    const { data: matchedUsers } = await supabase
                        .from('users')
                        .select('id')
                        .or(userFields.join(','));
                    const matchedUserIds = (matchedUsers || []).map(u => u.id);

                    const quoteFields = [`title.ilike.%${searchTerm}%`];
                    if (isUUID) quoteFields.push(`id.eq.${searchTerm}`);
                    const { data: matchedQuotes } = await supabase
                        .from('quote')
                        .select('id')
                        .or(quoteFields.join(','));
                    const matchedQuoteIds = (matchedQuotes || []).map(q => q.id);

                    let resOrConditions: string[] = [];
                    if (isUUID) resOrConditions.push(`re_id.eq.${searchTerm}`);
                    if (matchedQuoteIds.length > 0) resOrConditions.push(`re_quote_id.in.(${matchedQuoteIds.join(',')})`);

                    let matchedResIds: string[] = [];
                    if (resOrConditions.length > 0) {
                        const { data: matchedReservations } = await supabase
                            .from('reservation')
                            .select('re_id')
                            .or(resOrConditions.join(','))
                            .neq('re_status', 'completed');
                        matchedResIds = (matchedReservations || []).map(r => r.re_id);
                    }

                    let paymentOrConditions = [`memo.ilike.%${searchTerm}%`];
                    if (isUUID) paymentOrConditions.push(`reservation_id.eq.${searchTerm}`);
                    if (matchedUserIds.length > 0) paymentOrConditions.push(`user_id.in.(${matchedUserIds.join(',')})`);
                    if (matchedResIds.length > 0) paymentOrConditions.push(`reservation_id.in.(${matchedResIds.join(',')})`);

                    paymentsQuery = paymentsQuery.or(paymentOrConditions.join(','));
                }

                paymentsQuery = paymentsQuery.range(paymentOffset, paymentOffset + PAYMENT_BATCH_SIZE - 1);

                const { data: paymentsData, error } = await paymentsQuery as any;
                if (error) throw error;

                const uniquePaymentsMap = new Map<string, any>();
                for (const p of (paymentsData || [])) {
                    if (p?.reservation_id) uniquePaymentsMap.set(p.reservation_id, p);
                }
                const uniquePayments = Array.from(uniquePaymentsMap.values());

                paymentOffset += (paymentsData || []).length;
                if (!paymentsData || paymentsData.length < PAYMENT_BATCH_SIZE) {
                    reachedEnd = true;
                }
                if (uniquePayments.length === 0) {
                    continue;
                }

                const userIds = Array.from(new Set(uniquePayments.map((p: any) => p.user_id).filter(Boolean)));
                const reservationIds = uniquePayments.map(p => p.reservation_id).filter(Boolean);

                const [usersData, reservationsData, confirmationData] = await Promise.all([
                    fetchTableInBatches<any>('users', 'id', userIds, 'id, name, phone_number, email', 80),
                    fetchTableInBatches<any>('reservation', 're_id', reservationIds, 're_id, re_quote_id, re_type, re_status', 80),
                    fetchTableInBatches<any>('confirmation_status', 'reservation_id', reservationIds, 'reservation_id, status, generated_at, sent_at', 80),
                ]);

                const usersMap = new Map((usersData || []).map((u: any) => [u.id, u]));
                const reservationsMap = new Map(
                    (reservationsData || [])
                        .filter((r: any) => r.re_status !== 'completed')
                        .map((r: any) => [r.re_id, r])
                );
                const confirmationStatusMap = new Map((confirmationData || []).map((c: any) => [c.reservation_id, c]));

                const quoteIds = Array.from(new Set(
                    reservationIds
                        .map((reservationId) => reservationsMap.get(reservationId)?.re_quote_id)
                        .filter(Boolean)
                ));

                const quotesData = await fetchTableInBatches<any>('quote', 'id', quoteIds, 'id, title', 80);
                const quotesMap = new Map((quotesData || []).map((q: any) => [q.id, q]));

                uniquePayments
                    .filter((p: any) => reservationsMap.has(p.reservation_id))
                    .forEach((p: any) => {
                        const user = usersMap.get(p.user_id) || {};
                        const reservation = reservationsMap.get(p.reservation_id) || {};
                        const quote = quotesMap.get(reservation.re_quote_id) || {};
                        const confirmationStatus = confirmationStatusMap.get(p.reservation_id) || {};

                        mergeReservation({
                            re_id: p.reservation_id,
                            re_ids: [p.reservation_id],
                            re_quote_id: reservation.re_quote_id || '',
                            re_type: reservation.re_type || '',
                            re_status: reservation.re_status || '',
                            quote_title: quote.title || '예약',
                            user_name: user.name || '',
                            user_email: user.email || '',
                            user_phone: user.phone_number || '',
                            created_at: p.created_at,
                            payment_status: p.payment_status,
                            status: '',
                            confirmed_at: confirmationStatus.generated_at || null,
                            confirmation_status: (confirmationStatus.status as any) || 'waiting',
                        });
                    });
                if (searchTerm) {
                    reachedEnd = true;
                }
            }

            setQuotes(sortReservations(Array.from(groupedMap.values())));
            setHasMore(!searchTerm && !reachedEnd);
        } catch (error) {
            console.error('견적 데이터 로드 실패:', error);
            setHasMore(false);
        } finally {
            if (targetPage === 1) {
                setLoading(false);
            } else {
                setIsLoadingMore(false);
            }
        }
    };

    // 카드 선택 토글
    const toggleCardSelection = (reservationId: string) => {
        const newSelected = new Set(selectedCards);
        if (newSelected.has(reservationId)) {
            newSelected.delete(reservationId);
        } else {
            newSelected.add(reservationId);
        }
        setSelectedCards(newSelected);
    };

    // 전체 선택/해제
    const toggleAllSelection = () => {
        if (selectedCards.size === filteredQuotes.length) {
            setSelectedCards(new Set());
        } else {
            setSelectedCards(new Set(filteredQuotes.map(q => q.re_id)));
        }
    };

    // 일괄 생성 처리
    const handleBulkGeneration = async () => {
        if (selectedCards.size === 0) {
            alert('생성할 확인서를 선택해주세요.');
            return;
        }
        try {
            const selectedReservations = Array.from(selectedCards);
            const { data: updatedRows, error: updateErr } = await supabase
                .from('confirmation_status')
                .update({ status: 'generated' })
                .in('reservation_id', selectedReservations)
                .select('reservation_id');

            if (updateErr) {
                console.warn('일괄 업데이트 오류(무시 후 진행):', updateErr.message);
            }

            const updatedSet = new Set((updatedRows || []).map((r: any) => r.reservation_id));
            const remainingToInsert = selectedReservations.filter(id => !updatedSet.has(id));

            if (remainingToInsert.length > 0) {
                const reToQuote = new Map(quotes.map(q => [q.re_id, q.re_quote_id] as const));
                const insertPayload = remainingToInsert.map(id => ({
                    reservation_id: id,
                    quote_id: reToQuote.get(id) || null,
                    status: 'generated' as const,
                }));

                const { error: insertErr } = await supabase
                    .from('confirmation_status')
                    .insert(insertPayload);

                if (insertErr) {
                    console.warn('일괄 삽입 오류(낙관적 처리):', insertErr.message);
                }
            }

            alert(`${selectedCards.size}개의 확인서 생성이 완료되었습니다.`);
            // 낙관적 로컬 상태 반영
            const selectedSet = new Set(selectedReservations);
            setQuotes(prev => prev.map(q => selectedSet.has(q.re_id) ? { ...q, confirmation_status: 'generated' } : q));
            setSelectedCards(new Set());

            // 데이터 새로고침
            await loadQuotesWithReservations();
        } catch (error) {
            console.error('일괄 생성 실패:', error);
            alert('일괄 생성 중 오류가 발생했습니다.');
        }
    };

    // 확인서 상태별 뱃지 렌더링 함수
    const renderConfirmationStatusBadge = (confirmationStatus: string) => {
        switch (confirmationStatus) {
            case 'waiting':
                return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">확인서 대기</span>;
            case 'generated':
                return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">확인서 생성</span>;
            case 'sent':
                return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">고객 발송</span>;
            default:
                return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">확인서 대기</span>;
        }
    };

    // 검색 및 상태 필터 적용
    const allFilteredQuotes = quotes.filter((reservation) => {
        if (!searchTerm && statusFilter !== 'all' && reservation.confirmation_status !== statusFilter) {
            return false;
        }
        return true;
    });
    const filteredQuotes = allFilteredQuotes;

    // 단건 생성 버튼 핸들러: 상태를 'generated'로 업데이트하고 목록 갱신 후 모달 오픈
    const handleGenerateClick = async (reservation: ReservationWithQuoteInfo) => {
        try {
            console.log('📄 확인서 생성(단건) 실행:', {
                reservation_id: reservation.re_id,
                quote_id: reservation.re_quote_id,
            });

            // 모달을 즉시 오픈하여 작업 흐름을 끊기지 않게 함
            setSelectedQuoteId(reservation.re_quote_id || reservation.re_id);
            setIsModalOpen(true);

            // 1) 기존 행이 있으면 업데이트 (예약당 1행 규칙)
            const { error: updateError, data: updateData } = await supabase
                .from('confirmation_status')
                .update({ status: 'generated' })
                .eq('reservation_id', reservation.re_id)
                .select('reservation_id');

            if (updateError) {
                console.warn('⚠️ 업데이트 실패, 신규 생성 시도:', updateError.message);
                // 2) 없으면 삽입 (예외 상황 대비)
                const { error: insertError } = await supabase
                    .from('confirmation_status')
                    .insert({
                        reservation_id: reservation.re_id,
                        quote_id: reservation.re_quote_id,
                        status: 'generated',
                    });
                if (insertError) {
                    console.error('❌ 확인서 상태 삽입 실패(낙관적 처리로 진행):', insertError.message);
                    // 테이블이 없거나 권한 오류 등으로 실패해도 모달은 유지하고 로컬 상태를 업데이트
                    setQuotes(prev => prev.map(q => q.re_id === reservation.re_id ? { ...q, confirmation_status: 'generated' } : q));
                    return; // 서버 반영 실패 시 여기서 종료(모달은 이미 열림)
                }
            } else if (!updateData || updateData.length === 0) {
                // 업데이트가 0건이면 삽입 시도
                const { error: insertError } = await supabase
                    .from('confirmation_status')
                    .insert({
                        reservation_id: reservation.re_id,
                        quote_id: reservation.re_quote_id,
                        status: 'generated',
                    });
                if (insertError) {
                    console.error('❌ 확인서 상태 삽입 실패(낙관적 처리로 진행):', insertError.message);
                    setQuotes(prev => prev.map(q => q.re_id === reservation.re_id ? { ...q, confirmation_status: 'generated' } : q));
                    return;
                }
            }

            // 3) 목록 새로고침하여 필터에 즉시 반영
            await loadQuotesWithReservations();
            // 모달은 이미 열림 상태 유지
        } catch (e: any) {
            console.error('❌ 확인서 생성 처리 중 오류:', e?.message || e);
            // 서버 오류 시에도 미리보기는 가능해야 하므로 로컬 상태만 반영
            setQuotes(prev => prev.map(q => q.re_id === reservation.re_id ? { ...q, confirmation_status: 'generated' } : q));
        }
    };

    // 미리보기(모달) 전용 핸들러
    const handlePreviewClick = (reservation: ReservationWithQuoteInfo) => {
        const id = reservation.re_quote_id || reservation.re_id;
        if (!id) return;
        setSelectedQuoteId(id);
        setIsModalOpen(true);
    };

    return (
        <ManagerLayout title="예약 확인서 발송 관리" activeTab="confirmation">
            <div className="py-8">
                {/* 필터 및 검색 영역 */}
                <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center gap-4">
                        {/* 상태별 필터 */}
                        <div className="flex gap-2 items-center">
                            {[
                                { value: 'all', label: '전체' },
                                { value: 'waiting', label: '확인서 대기' },
                                { value: 'generated', label: '확인서 생성' },
                            ].map(opt => (
                                <button
                                    key={opt.value}
                                    onClick={() => setStatusFilter(opt.value)}
                                    className={`px-3 py-2 rounded text-sm border transition-colors font-medium ${statusFilter === opt.value
                                        ? 'bg-blue-600 text-white border-blue-600'
                                        : 'bg-gray-100 text-gray-700 border-gray-200 hover:bg-blue-50'
                                        }`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>

                        {/* 정렬 필터 추가 */}
                        <div className="flex gap-2 items-center ml-2 border-l pl-4 border-gray-200">
                            <span className="text-xs text-gray-500 font-medium">정렬:</span>
                            {[
                                { value: 'date', label: '생성일 순' },
                                { value: 'name', label: '이름순' },
                            ].map(opt => (
                                <button
                                    key={opt.value}
                                    onClick={() => setSortBy(opt.value as 'date' | 'name')}
                                    className={`px-3 py-1.5 rounded text-xs border transition-colors font-medium ${sortBy === opt.value
                                        ? 'bg-gray-800 text-white border-gray-800'
                                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                                        }`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>

                        {/* 선택 및 일괄 처리 */}
                        {filteredQuotes.length > 0 && (
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={toggleAllSelection}
                                    className="px-3 py-2 border border-gray-300 rounded text-sm hover:bg-gray-50 transition-colors"
                                >
                                    {selectedCards.size === filteredQuotes.length ? '전체 해제' : '전체 선택'}
                                </button>
                                {selectedCards.size > 0 && (
                                    <button
                                        onClick={handleBulkGeneration}
                                        className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm transition-colors"
                                    >
                                        📄 선택된 {selectedCards.size}개 일괄생성
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        <input
                            type="text"
                            placeholder="고객명, 이메일, 전화번호, 견적명, 예약ID 검색"
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') setSearchTerm(searchInput);
                            }}
                            className="w-80 px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                        />
                        <button
                            onClick={() => setSearchTerm(searchInput)}
                            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm transition-colors"
                        >
                            🔍 검색
                        </button>
                        <button
                            onClick={() => {
                                setSearchInput('');
                                setSearchTerm('');
                            }}
                            className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 text-sm transition-colors"
                        >
                            🔄 초기화
                        </button>
                    </div>
                </div>
                {loading ? (
                    <div className="flex justify-center items-center h-40">
                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500 mr-4"></div>
                        <p className="ml-4 text-gray-600">데이터를 불러오는 중...</p>
                    </div>
                ) : (
                    <>
                        {/* 예약 목록 */}
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
                            {filteredQuotes.map((reservation) => (
                                <div
                                    key={reservation.re_id}
                                    className={`bg-white rounded-lg shadow-sm p-6 hover:bg-gray-50 transition-colors ${selectedCards.has(reservation.re_id)
                                        ? 'border-2 border-blue-500'
                                        : 'border border-gray-200'
                                        }`}
                                >
                                    <div className="flex flex-col gap-4">
                                        <div className="flex items-center gap-3 overflow-x-auto no-scrollbar">
                                            <button
                                                onClick={() => toggleCardSelection(reservation.re_id)}
                                                className="p-1 hover:bg-gray-200 rounded flex-shrink-0"
                                            >
                                                {selectedCards.has(reservation.re_id) ? (
                                                    <div className="w-5 h-5 bg-blue-600 text-white rounded flex items-center justify-center">✓</div>
                                                ) : (
                                                    <div className="w-5 h-5 border-2 border-gray-400 rounded"></div>
                                                )}
                                            </button>
                                            <div className="p-3 bg-gray-100 rounded-full flex-shrink-0">
                                                📄
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h4 className="font-semibold text-base text-gray-900 truncate whitespace-nowrap">
                                                    {reservation.user_name || '고객명 없음'}
                                                </h4>
                                            </div>
                                        </div>
                                        {/* 카드 내부 정보를 1열로 세로 배치 */}
                                        <div className="flex flex-col gap-1 text-sm text-gray-700 mt-2 w-full">
                                            {/* 견적명 및 예약 ID는 카드에서 제거됨 */}
                                            <div>
                                                <span className="font-semibold">이메일: </span>
                                                {reservation.user_email || '-'}
                                            </div>
                                            <div>
                                                <span className="font-semibold">예약일: </span>
                                                {reservation.created_at
                                                    ? new Date(reservation.created_at).toLocaleDateString()
                                                    : '-'}
                                            </div>
                                            <div>
                                                <span className="font-semibold">상태: </span>
                                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 ml-1">결제완료</span>
                                                <span className="ml-1">
                                                    {renderConfirmationStatusBadge(reservation.confirmation_status || 'waiting')}
                                                </span>
                                            </div>
                                            {/* 버튼들을 한 행에 배치 */}
                                            <div className="mt-3 flex gap-2 flex-wrap">
                                                <button
                                                    onClick={() => handleGenerateClick(reservation)}
                                                    className={`px-4 py-1 text-sm rounded transition-colors whitespace-nowrap ${reservation.confirmation_status === 'waiting'
                                                        ? 'bg-blue-600 text-white hover:bg-blue-700'
                                                        : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                                        }`}
                                                    disabled={reservation.confirmation_status !== 'waiting'}
                                                >
                                                    📄 확인서 생성
                                                </button>

                                                <button
                                                    onClick={() => handlePreviewClick(reservation)}
                                                    className="px-4 py-1 bg-gray-600 text-white rounded hover:bg-gray-700 text-sm transition-colors whitespace-nowrap"
                                                >
                                                    👁️ 미리보기
                                                </button>
                                            </div>
                                            {reservation.confirmed_at && (
                                                <div className="mt-2 text-xs text-gray-500">
                                                    ✅ 발송일: {reservation.confirmed_at}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        {hasMore && filteredQuotes.length > 0 && (
                            <div className="mt-6 flex justify-center">
                                <button
                                    onClick={() => setPage(prev => prev + 1)}
                                    disabled={isLoadingMore}
                                    className={`px-5 py-2 rounded text-sm border transition-colors ${isLoadingMore
                                        ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                                        }`}
                                >
                                    {isLoadingMore ? '불러오는 중...' : '더 불러오기 (20개)'}
                                </button>
                            </div>
                        )}
                        {filteredQuotes.length === 0 && !loading && (
                            <div className="bg-white rounded-lg shadow-sm p-12 text-center">
                                <div className="text-4xl mb-4">📄</div>
                                <h3 className="text-lg font-medium text-gray-900 mb-2">
                                    {searchTerm ? '검색 결과가 없습니다' : '발송할 확인서가 없습니다'}
                                </h3>
                                <p className="text-gray-500">
                                    {searchTerm ? '다른 검색어로 시도해보세요.' : '결제완료+예약완료된 예약이 없습니다.'}
                                </p>
                                {searchTerm && (
                                    <button
                                        onClick={() => {
                                            setSearchInput('');
                                            setSearchTerm('');
                                        }}
                                        className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                                    >
                                        전체 보기
                                    </button>
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* 확인서 생성 팝업 모달 */}
            <ConfirmationGenerateModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                quoteId={selectedQuoteId}
            />
        </ManagerLayout>
    );
}

export default function ManagerConfirmationPage() {
    return (
        <Suspense fallback={
            <div className="flex justify-center items-center h-screen bg-gray-50">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        }>
            <ConfirmationContent />
        </Suspense>
    );
}
