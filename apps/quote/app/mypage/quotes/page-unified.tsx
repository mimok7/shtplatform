'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabase';

type FilterTab = 'all' | 'draft' | 'submitted' | 'approved' | 'confirmed';

interface Quote {
    id: string;
    user_id: string;
    status: string;
    title: string;
    description?: string;
    total_price: number;
    created_at: string;
    updated_at: string;
    submitted_at?: string;
    approved_at?: string;
    confirmed_at?: string;
}

export default function QuotesUnifiedPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [quotes, setQuotes] = useState<Quote[]>([]);
    const [user, setUser] = useState<any>(null);
    const [activeTab, setActiveTab] = useState<FilterTab>('all');

    const handleGoHome = () => {
        router.push('/mypage');
    };

    useEffect(() => {
        loadUserAndQuotes();
    }, []);

    const loadUserAndQuotes = async () => {
        try {
            // 사용자 인증 확인
            const { data: { user }, error: userError } = await supabase.auth.getUser();
            if (userError || !user) {
                alert('로그인이 필요합니다.');
                router.push('/login');
                return;
            }

            setUser(user);

            // 사용자의 견적 목록 조회 - 현재 로그인한 사용자의 견적만 조회
            const { data: userQuotes, error: quotesError } = await supabase
                .from('quote')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });

            console.log('견적 조회 결과:', { userQuotes, quotesError });

            if (quotesError) {
                console.error('견적 조회 오류:', quotesError);
                setQuotes([]);
            } else {
                setQuotes(userQuotes || []);
            }
        } catch (error) {
            console.error('견적 목록 로드 오류:', error);
        } finally {
            setLoading(false);
        }
    };

    const getStatusLabel = (status: string): string => {
        if (status === 'draft') return '작성 중';
        if (status === 'submitted') return '제출됨';
        if (status === 'approved') return '승인됨';
        if (status === 'confirmed') return '확정 견적';
        if (status === 'rejected') return '거절됨';
        if (status === 'completed') return '완료됨';
        return '알 수 없음';
    };

    const getStatusColor = (status: string): string => {
        if (status === 'draft') return 'bg-gray-100 text-gray-800';
        if (status === 'submitted') return 'bg-yellow-50 text-yellow-600';
        if (status === 'approved') return 'bg-blue-50 text-blue-500';
        if (status === 'confirmed') return 'bg-green-50 text-green-500';
        if (status === 'rejected') return 'bg-red-100 text-red-800';
        if (status === 'completed') return 'bg-purple-100 text-purple-800';
        return 'bg-gray-100 text-gray-800';
    };

    // 탭에 따라 견적 필터링
    const filteredQuotes = quotes.filter((quote) => {
        if (activeTab === 'all') return true;
        if (activeTab === 'draft') return quote.status === 'draft';
        if (activeTab === 'submitted') return quote.status === 'submitted';
        if (activeTab === 'approved') return quote.status === 'approved';
        if (activeTab === 'confirmed') return quote.status === 'confirmed';
        return true;
    });

    // 탭별 개수
    const getTabCount = (tab: FilterTab): number => {
        if (tab === 'all') return quotes.length;
        return quotes.filter((q) => q.status === tab).length;
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
                    <p className="mt-4 text-gray-600">견적 목록을 불러오는 중...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {/* 헤더 */}
            <div className="bg-gradient-to-br from-blue-200 via-purple-200 to-indigo-100 text-gray-900">
                <div className="container mx-auto px-4 py-8">
                    <div className="mb-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <h1 className="text-xl font-bold mb-2">📋 내 견적 관리</h1>
                                <p className="text-lg opacity-90">
                                    {user?.email}님의 모든 견적을 한곳에서 확인하고 관리하세요.
                                </p>
                            </div>
                            <button
                                onClick={handleGoHome}
                                className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm"
                            >
                                🏠 홈
                            </button>
                        </div>
                        {/* 탭 버튼 및 새 견적 버튼 */}
                        <div className="flex justify-between items-center mt-6">
                            <div className="flex gap-2 flex-wrap">
                                <button
                                    onClick={() => setActiveTab('all')}
                                    className={`px-3 py-1.5 rounded text-xs font-medium border transition-all ${activeTab === 'all'
                                            ? 'bg-blue-500 text-white border-blue-600 shadow-md'
                                            : 'bg-white/80 text-gray-700 border-gray-300 hover:bg-white'
                                        }`}
                                >
                                    📋 전체 ({getTabCount('all')})
                                </button>
                                <button
                                    onClick={() => setActiveTab('draft')}
                                    className={`px-3 py-1.5 rounded text-xs font-medium border transition-all ${activeTab === 'draft'
                                            ? 'bg-gray-500 text-white border-gray-600 shadow-md'
                                            : 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200'
                                        }`}
                                >
                                    ✏️ 작성중 ({getTabCount('draft')})
                                </button>
                                <button
                                    onClick={() => setActiveTab('submitted')}
                                    className={`px-3 py-1.5 rounded text-xs font-medium border transition-all ${activeTab === 'submitted'
                                            ? 'bg-yellow-500 text-white border-yellow-600 shadow-md'
                                            : 'bg-yellow-100 text-yellow-700 border-yellow-300 hover:bg-yellow-200'
                                        }`}
                                >
                                    📤 제출됨 ({getTabCount('submitted')})
                                </button>
                                <button
                                    onClick={() => setActiveTab('approved')}
                                    className={`px-3 py-1.5 rounded text-xs font-medium border transition-all ${activeTab === 'approved'
                                            ? 'bg-blue-500 text-white border-blue-600 shadow-md'
                                            : 'bg-blue-100 text-blue-700 border-blue-300 hover:bg-blue-200'
                                        }`}
                                >
                                    ✅ 승인됨 ({getTabCount('approved')})
                                </button>
                                <button
                                    onClick={() => setActiveTab('confirmed')}
                                    className={`px-3 py-1.5 rounded text-xs font-medium border transition-all ${activeTab === 'confirmed'
                                            ? 'bg-green-500 text-white border-green-600 shadow-md'
                                            : 'bg-green-100 text-green-700 border-green-300 hover:bg-green-200'
                                        }`}
                                >
                                    🎉 확정됨 ({getTabCount('confirmed')})
                                </button>
                            </div>
                            <button
                                onClick={() => router.push('/mypage/quotes/new')}
                                className="bg-gradient-to-r from-blue-500 to-sky-500 text-white px-4 py-1.5 rounded text-sm font-semibold hover:from-blue-600 hover:to-sky-600 transition-all shadow-md hover:shadow-lg"
                            >
                                ➕ 새 견적 작성
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* 견적 목록 */}
            <div className="container mx-auto px-4 py-8">
                <div className="max-w-5xl mx-auto">
                    {filteredQuotes.length === 0 ? (
                        <div className="bg-white rounded-xl shadow-lg p-12 text-center">
                            <div className="text-6xl mb-4">
                                {activeTab === 'all' && '📝'}
                                {activeTab === 'draft' && '✏️'}
                                {activeTab === 'submitted' && '📤'}
                                {activeTab === 'approved' && '✅'}
                                {activeTab === 'confirmed' && '🎉'}
                            </div>
                            <h3 className="text-xl font-semibold text-gray-600 mb-2">
                                {activeTab === 'all' && '아직 작성한 견적이 없습니다'}
                                {activeTab === 'draft' && '작성 중인 견적이 없습니다'}
                                {activeTab === 'submitted' && '제출된 견적이 없습니다'}
                                {activeTab === 'approved' && '승인된 견적이 없습니다'}
                                {activeTab === 'confirmed' && '확정된 견적이 없습니다'}
                            </h3>
                            <p className="text-gray-500 mb-6">
                                {activeTab === 'all' && '첫 번째 견적을 작성해보세요!'}
                                {activeTab !== 'all' && '다른 탭에서 견적을 확인하거나 새로운 견적을 작성해보세요.'}
                            </p>
                            <button
                                onClick={() => router.push('/mypage/quotes/new')}
                                className="bg-blue-500 text-white px-4 py-2 rounded text-sm hover:bg-blue-600 transition-colors"
                            >
                                견적 작성하기
                            </button>
                        </div>
                    ) : (
                        <>
                            {/* 현재 탭 정보 */}
                            <div className="mb-4 px-2">
                                <p className="text-sm text-gray-600">
                                    {activeTab === 'all' && `전체 견적 ${filteredQuotes.length}건`}
                                    {activeTab === 'draft' && `작성 중인 견적 ${filteredQuotes.length}건`}
                                    {activeTab === 'submitted' && `제출된 견적 ${filteredQuotes.length}건`}
                                    {activeTab === 'approved' && `승인된 견적 ${filteredQuotes.length}건`}
                                    {activeTab === 'confirmed' && `확정된 견적 ${filteredQuotes.length}건`}
                                </p>
                            </div>

                            <div className="space-y-4">
                                {filteredQuotes.map((quote) => (
                                    <div
                                        key={quote.id}
                                        className="bg-white rounded-xl shadow-lg hover:shadow-xl transition-all border border-gray-200"
                                    >
                                        <div className="p-6">
                                            <div className="flex items-start justify-between">
                                                <div className="flex-1">
                                                    <div className="flex items-center space-x-3 mb-2">
                                                        <h3 className="text-lg font-semibold text-gray-800">
                                                            {quote.title || '제목 없음'}
                                                        </h3>
                                                        <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(quote.status)}`}>
                                                            {getStatusLabel(quote.status)}
                                                        </span>
                                                    </div>

                                                    <div className="text-sm text-gray-600 space-y-1">
                                                        <p>생성일: {new Date(quote.created_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                                                        <p>총 금액: <span className="font-semibold text-blue-600">
                                                            {quote.total_price > 0 ? `${quote.total_price.toLocaleString()}동` : '견적 대기'}
                                                        </span></p>
                                                        {quote.description && (
                                                            <p className="text-gray-700 mt-2 line-clamp-2">{quote.description}</p>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="flex flex-col gap-2 ml-4">
                                                    {quote.status === 'draft' && (
                                                        <>
                                                            <button
                                                                onClick={() => router.push(`/mypage/quotes/new?quoteId=${quote.id}`)}
                                                                className="bg-green-500 text-white px-3 py-1.5 rounded text-xs hover:bg-green-600 transition-colors whitespace-nowrap"
                                                            >
                                                                ✏️ 계속 작성
                                                            </button>
                                                            <button
                                                                onClick={() => router.push(`/mypage/quotes/${quote.id}/view`)}
                                                                className="bg-gray-300 text-gray-700 px-3 py-1.5 rounded text-xs hover:bg-gray-400 transition-colors"
                                                            >
                                                                👁️ 미리보기
                                                            </button>
                                                        </>
                                                    )}
                                                    {quote.status === 'submitted' && (
                                                        <button
                                                            onClick={() => router.push(`/mypage/quotes/${quote.id}/view`)}
                                                            className="bg-yellow-500 text-white px-3 py-1.5 rounded text-xs hover:bg-yellow-600 transition-colors whitespace-nowrap"
                                                        >
                                                            📋 상세보기
                                                        </button>
                                                    )}
                                                    {quote.status === 'approved' && (
                                                        <>
                                                            <button
                                                                onClick={() => router.push(`/mypage/quotes/${quote.id}/confirmed`)}
                                                                className="bg-blue-500 text-white px-3 py-1.5 rounded text-xs hover:bg-blue-600 transition-colors whitespace-nowrap"
                                                            >
                                                                📄 확정견적
                                                            </button>
                                                            <button
                                                                onClick={() => router.push(`/mypage/quotes/${quote.id}/view`)}
                                                                className="bg-gray-300 text-gray-700 px-3 py-1.5 rounded text-xs hover:bg-gray-400 transition-colors"
                                                            >
                                                                👁️ 상세보기
                                                            </button>
                                                        </>
                                                    )}
                                                    {quote.status === 'confirmed' && (
                                                        <button
                                                            onClick={() => router.push(`/mypage/quotes/${quote.id}/confirmed`)}
                                                            className="bg-green-500 text-white px-3 py-1.5 rounded text-xs hover:bg-green-600 transition-colors whitespace-nowrap"
                                                        >
                                                            🎉 확정견적
                                                        </button>
                                                    )}
                                                    {!['draft', 'submitted', 'approved', 'confirmed'].includes(quote.status) && (
                                                        <button
                                                            onClick={() => router.push(`/mypage/quotes/${quote.id}/view`)}
                                                            className="bg-blue-500 text-white px-3 py-1.5 rounded text-xs hover:bg-blue-600 transition-colors"
                                                        >
                                                            📋 상세보기
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
