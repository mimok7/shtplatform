'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabase';
import ManagerLayout from '@/components/ManagerLayout';
import PageWrapper from '@/components/PageWrapper';
import SectionBox from '@/components/SectionBox';

interface Quote {
    id: string;
    quote_id: string;
    title: string;
    user_name: string;
    user_email: string;
    total_price: number;
    payment_status: string;
    created_at: string;
    confirmed_at?: string;
    reservation_count: number;
}

interface DailyStat {
    date: string;
    sent_count: number;
    pending_count: number;
    total_amount: number;
}

export default function CustomerSendManagementPage() {
    const router = useRouter();
    const [quotes, setQuotes] = useState<Quote[]>([]);
    const [dailyStats, setDailyStats] = useState<DailyStat[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [dateFilter, setDateFilter] = useState('7'); // 7, 30, 전체
    const [statusFilter, setStatusFilter] = useState<'all' | 'sent' | 'pending'>('all');
    const [sending, setSending] = useState<string | null>(null);

    useEffect(() => {
        loadData();
    }, [dateFilter, statusFilter]);

    // 페이지 포커스 시 자동 새로고침 (백그라운드 탭에서는 호출 안 함)
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (!document.hidden) loadData();
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        // 30초 폴링 - 단, 탭이 활성 상태일 때만 호출 (백그라운드 부하 방지)
        const interval = setInterval(() => {
            if (typeof document !== 'undefined' && !document.hidden) {
                loadData();
            }
        }, 30000);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            clearInterval(interval);
        };
    }, []);

    const loadData = async () => {
        try {
            setLoading(true);

            // 날짜 필터 설정
            const days = dateFilter === '전체' ? 365 : parseInt(dateFilter);
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - days);

            // 결제 완료된 견적 조회
            let query = supabase
                .from('quote')
                .select(`
                    id,
                    quote_id,
                    title,
                    total_price,
                    payment_status,
                    created_at,
                    confirmed_at,
                    users!quote_user_id_fkey(name, email)
                `)
                .eq('payment_status', 'paid')
                .gte('created_at', startDate.toISOString());

            if (statusFilter === 'sent') {
                query = query.not('confirmed_at', 'is', null);
            } else if (statusFilter === 'pending') {
                query = query.is('confirmed_at', null);
            }

            const { data: quotesData, error: quotesError } = await query
                .order('created_at', { ascending: false });

            if (quotesError) {
                console.error('견적 조회 실패:', quotesError);
                return;
            }

            // 예약 수 조회
            const quoteIds = quotesData?.map(q => q.quote_id || q.id) || [];
            const { data: reservationCounts } = await supabase
                .from('reservation')
                .select('re_quote_id')
                .in('re_quote_id', quoteIds);

            const countMap = new Map<string, number>();
            reservationCounts?.forEach(res => {
                const count = countMap.get(res.re_quote_id) || 0;
                countMap.set(res.re_quote_id, count + 1);
            });

            const processedQuotes: Quote[] = quotesData?.map(quote => {
                const user = Array.isArray(quote.users) ? quote.users[0] : quote.users;
                return {
                    id: quote.id,
                    quote_id: quote.quote_id || quote.id,
                    title: quote.title || '제목 없음',
                    user_name: user?.name || '알 수 없음',
                    user_email: user?.email || '',
                    total_price: quote.total_price || 0,
                    payment_status: quote.payment_status,
                    created_at: quote.created_at,
                    confirmed_at: quote.confirmed_at,
                    reservation_count: countMap.get(quote.quote_id || quote.id) || 0
                };
            }) || [];

            // 일별 통계 계산
            const statsMap = new Map<string, DailyStat>();
            processedQuotes.forEach(quote => {
                const date = new Date(quote.created_at).toISOString().split('T')[0];
                const existing = statsMap.get(date) || {
                    date,
                    sent_count: 0,
                    pending_count: 0,
                    total_amount: 0
                };

                if (quote.confirmed_at) {
                    existing.sent_count++;
                } else {
                    existing.pending_count++;
                }
                existing.total_amount += quote.total_price;

                statsMap.set(date, existing);
            });

            const sortedStats = Array.from(statsMap.values())
                .sort((a, b) => b.date.localeCompare(a.date));

            setQuotes(processedQuotes);
            setDailyStats(sortedStats);

        } catch (error) {
            console.error('데이터 로드 실패:', error);
        } finally {
            setLoading(false);
        }
    };

    const sendConfirmationEmail = async (quote: Quote) => {
        try {
            setSending(quote.id);

            const { error: updateError } = await supabase
                .from('quote')
                .update({ confirmed_at: new Date().toISOString() })
                .eq('id', quote.id);

            if (updateError) {
                alert('발송 기록 업데이트에 실패했습니다.');
                return;
            }

            await supabase
                .from('reservation_confirmation')
                .insert({
                    quote_id: quote.id,
                    method: 'email',
                    status: 'sent',
                    subject: `[스테이하롱 크루즈] 예약확인서 - ${quote.user_name}님`,
                    recipient_email: quote.user_email,
                    sent_at: new Date().toISOString()
                });

            setQuotes(prevQuotes =>
                prevQuotes.map(q =>
                    q.id === quote.id
                        ? { ...q, confirmed_at: new Date().toISOString() }
                        : q
                )
            );

            alert(`✅ ${quote.user_name}님에게 예약확인서가 전송되었습니다!`);
            setTimeout(loadData, 1000);

        } catch (error) {
            console.error('이메일 전송 실패:', error);
            alert('이메일 전송에 실패했습니다.');
        } finally {
            setSending(null);
        }
    };

    const previewEmail = (quote: Quote) => {
        window.open(`/customer/email-preview?quote_id=${quote.quote_id}&token=preview`, '_blank');
    };

    const viewConfirmation = (quote: Quote) => {
        window.open(`/customer/confirmation?quote_id=${quote.quote_id}&token=admin`, '_blank');
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('ko-KR', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const formatDateOnly = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('ko-KR', {
            month: 'short',
            day: 'numeric'
        });
    };

    const filteredQuotes = quotes.filter(quote =>
        quote.user_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        quote.user_email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        quote.quote_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        quote.title.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const totalStats = {
        total: quotes.length,
        sent: quotes.filter(q => q.confirmed_at).length,
        pending: quotes.filter(q => !q.confirmed_at).length,
        amount: quotes.reduce((sum, q) => sum + q.total_price, 0)
    };

    if (loading) {
        return (
            <ManagerLayout title="고객 발송 관리" activeTab="customer-send">
                <PageWrapper>
                    <div className="flex justify-center items-center h-64">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
                        <p className="ml-4 text-gray-600">데이터를 불러오는 중...</p>
                    </div>
                </PageWrapper>
            </ManagerLayout>
        );
    }

    return (
        <ManagerLayout title="고객 발송 관리" activeTab="customer-send">
            <PageWrapper>
                {/* 전체 요약 통계 */}
                <SectionBox title="📊 발송 현황 요약">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-blue-50 rounded-lg p-4 text-center">
                            <div className="text-2xl font-bold text-blue-600">{totalStats.total}</div>
                            <div className="text-sm text-blue-500">전체 예약</div>
                        </div>
                        <div className="bg-green-50 rounded-lg p-4 text-center">
                            <div className="text-2xl font-bold text-green-600">{totalStats.sent}</div>
                            <div className="text-sm text-green-500">발송 완료</div>
                        </div>
                        <div className="bg-yellow-50 rounded-lg p-4 text-center">
                            <div className="text-2xl font-bold text-yellow-600">{totalStats.pending}</div>
                            <div className="text-sm text-yellow-500">발송 대기</div>
                        </div>
                        <div className="bg-purple-50 rounded-lg p-4 text-center">
                            <div className="text-2xl font-bold text-purple-600">{totalStats.amount.toLocaleString()}</div>
                            <div className="text-sm text-purple-500">총 금액(동)</div>
                        </div>
                    </div>
                </SectionBox>

                {/* 일별 발송 통계 */}
                <SectionBox title="📈 일별 발송 통계">
                    <div className="mb-4 flex items-center space-x-4">
                        <div className="flex bg-gray-100 rounded-lg p-1">
                            {['7', '30', '전체'].map(period => (
                                <button
                                    key={period}
                                    onClick={() => setDateFilter(period)}
                                    className={`px-3 py-1 rounded text-xs font-medium transition-colors ${dateFilter === period
                                            ? 'bg-white text-blue-600 shadow-sm'
                                            : 'text-gray-600 hover:text-gray-900'
                                        }`}
                                >
                                    {period === '전체' ? '전체' : `${period}일`}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <div className="flex space-x-2 pb-2">
                            {dailyStats.slice(0, 10).map(stat => (
                                <div key={stat.date} className="bg-white rounded-lg border p-3 min-w-[120px] text-center">
                                    <div className="text-xs text-gray-500 mb-1">{formatDateOnly(stat.date)}</div>
                                    <div className="text-lg font-bold text-gray-900">{stat.sent_count + stat.pending_count}</div>
                                    <div className="text-xs space-y-1">
                                        <div className="text-green-600">✅ {stat.sent_count}</div>
                                        <div className="text-yellow-600">📋 {stat.pending_count}</div>
                                    </div>
                                    <div className="text-xs text-blue-600 mt-1">{stat.total_amount.toLocaleString()}동</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </SectionBox>

                {/* 필터 및 검색 */}
                <SectionBox title="🔍 필터 및 검색">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
                        <div className="flex items-center space-x-4">
                            <div className="flex bg-gray-100 rounded-lg p-1">
                                {[
                                    { key: 'all', label: '전체', icon: '📊' },
                                    { key: 'pending', label: '발송대기', icon: '📋' },
                                    { key: 'sent', label: '발송완료', icon: '✅' }
                                ].map(filter => (
                                    <button
                                        key={filter.key}
                                        onClick={() => setStatusFilter(filter.key as any)}
                                        className={`px-3 py-2 rounded text-xs font-medium transition-colors ${statusFilter === filter.key
                                                ? 'bg-white text-blue-600 shadow-sm'
                                                : 'text-gray-600 hover:text-gray-900'
                                            }`}
                                    >
                                        {filter.icon} {filter.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="flex items-center space-x-4">
                            <div className="relative">
                                <input
                                    type="text"
                                    placeholder="고객명, 이메일, 예약번호, 제목 검색..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-64 pl-8 pr-4 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                />
                                <div className="absolute inset-y-0 left-0 pl-2 flex items-center pointer-events-none">
                                    <span className="text-gray-400 text-sm">🔍</span>
                                </div>
                            </div>
                            <button
                                onClick={loadData}
                                className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-xs"
                            >
                                새로고침
                            </button>
                        </div>
                    </div>
                </SectionBox>

                {/* 예약 목록 */}
                <SectionBox title={`📋 예약 목록 (${filteredQuotes.length}건)`}>
                    {filteredQuotes.length === 0 ? (
                        <div className="text-center py-12">
                            <div className="text-4xl mb-4">📭</div>
                            <h3 className="text-lg font-medium text-gray-900 mb-2">표시할 예약이 없습니다</h3>
                            <p className="text-gray-600">검색 조건을 변경해 보세요.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-green-800 uppercase">예약 정보</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-green-800 uppercase">고객 정보</th>
                                        <th className="px-4 py-3 text-center text-xs font-medium text-green-800 uppercase">일시/금액</th>
                                        <th className="px-4 py-3 text-center text-xs font-medium text-green-800 uppercase">발송상태</th>
                                        <th className="px-4 py-3 text-center text-xs font-medium text-green-800 uppercase">작업</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {filteredQuotes.map((quote) => (
                                        <tr key={quote.id} className="hover:bg-gray-50">
                                            <td className="px-4 py-3">
                                                <div className="font-medium text-gray-900 text-sm">{quote.title}</div>
                                                <div className="text-xs text-gray-500">#{quote.quote_id}</div>
                                                <div className="text-xs text-gray-500">서비스 {quote.reservation_count}개</div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="font-medium text-gray-900 text-sm">{quote.user_name}</div>
                                                <div className="text-xs text-gray-500">{quote.user_email}</div>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <div className="text-xs text-gray-600">{formatDate(quote.created_at)}</div>
                                                <div className="font-bold text-blue-600 text-sm">{quote.total_price.toLocaleString()}동</div>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                {quote.confirmed_at ? (
                                                    <div>
                                                        <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                                                            ✅ 완료
                                                        </span>
                                                        <div className="text-xs text-gray-500 mt-1">{formatDate(quote.confirmed_at)}</div>
                                                    </div>
                                                ) : (
                                                    <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">
                                                        📋 대기
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <div className="flex items-center justify-center space-x-1">
                                                    <button
                                                        onClick={() => previewEmail(quote)}
                                                        className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                                                        title="미리보기"
                                                    >
                                                        👁️
                                                    </button>
                                                    <button
                                                        onClick={() => viewConfirmation(quote)}
                                                        className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                                                        title="확인서"
                                                    >
                                                        📄
                                                    </button>
                                                    {!quote.confirmed_at && (
                                                        <button
                                                            onClick={() => sendConfirmationEmail(quote)}
                                                            disabled={sending === quote.id}
                                                            className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                                                            title="발송"
                                                        >
                                                            {sending === quote.id ? '📧...' : '📧'}
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </SectionBox>
            </PageWrapper>
        </ManagerLayout>
    );
}
