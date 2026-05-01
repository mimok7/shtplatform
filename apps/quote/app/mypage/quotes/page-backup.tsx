'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabase';
import { Quote } from '@/lib/types';

type FilterTab = 'all' | 'draft' | 'submitted' | 'approved' | 'confirmed';

export default function QuotesPage() {
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
        // 오류가 있어도 빈 배열로 설정하여 UI가 정상 작동하도록 함
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
                <h1 className="text-xl font-bold mb-2">📋 내 견적 목록</h1>
                <p className="text-lg opacity-90">
                  {user?.email}님이 작성한 견적들을 확인하고 관리하세요.
                </p>
              </div>
              <button
                onClick={handleGoHome}
                className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm"
              >
                🏠 홈
              </button>
            </div>
            {/* 새 견적 버튼 오른쪽, 필터 버튼 왼쪽 정렬 */}
            <div className="flex justify-between items-center mb-4">
              <div className="flex gap-2">
                <button className="bg-white/80 text-gray-700 px-2 py-1 rounded text-xs font-medium border border-gray-300 hover:bg-white transition-all">
                  📋 전체
                </button>
                <button
                  onClick={() => router.push('/mypage/quotes/processing')}
                  className="bg-orange-100 text-orange-700 px-2 py-1 rounded text-xs font-medium border border-orange-300 hover:bg-orange-200 transition-all"
                >
                  � 처리중
                </button>
                <button
                  onClick={() => router.push('/mypage/quotes/confirmed')}
                  className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-medium border border-green-300 hover:bg-green-200 transition-all"
                >
                  ✅ 확정됨
                </button>
              </div>
              <button
                onClick={() => router.push('/mypage/quotes/new')}
                className="bg-gradient-to-r from-blue-500 to-sky-500 text-white px-3 py-1 rounded text-sm font-semibold hover:from-blue-600 hover:to-sky-600 transition-all"
              >
                ➕ 새 견적
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 견적 목록 */}
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {quotes.length === 0 ? (
            <div className="bg-white rounded-xl shadow-lg p-12 text-center">
              <div className="text-6xl mb-4">📝</div>
              <h3 className="text-xl font-semibold text-gray-600 mb-2">아직 작성한 견적이 없습니다</h3>
              <p className="text-gray-500 mb-6">첫 번째 견적을 작성해보세요!</p>
              <button
                onClick={() => router.push('/mypage/quotes/new')}
                className="bg-blue-500 text-white px-3 py-1 rounded text-sm hover:bg-blue-600 transition-colors"
              >
                견적 작성하기
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {quotes.map((quote) => (
                <div
                  key={quote.id}
                  className="bg-white rounded-xl shadow-lg hover:shadow-xl transition-shadow border border-gray-200"
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
                          <p>견적명: <span className="font-semibold text-blue-600">{quote.title}</span></p>
                          <p>생성일: {new Date(quote.created_at).toLocaleDateString('ko-KR')}</p>
                          <p>총 금액: <span className="font-semibold text-blue-600">{quote.total_price > 0 ? `${quote.total_price.toLocaleString()}동` : '견적 대기'}</span></p>
                          {quote.description && (
                            <p className="text-gray-700 mt-2">{quote.description}</p>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col gap-1 ml-4">
                        {quote.status === 'approved' ? (
                          <button
                            onClick={() => router.push(`/mypage/quotes/${quote.id}/confirmed`)}
                            className="bg-blue-500 text-white px-2 py-1 rounded text-xs hover:bg-blue-600 transition-colors"
                          >
                            확정견적
                          </button>
                        ) : (
                          <button
                            onClick={() => router.push(`/mypage/quotes/${quote.id}/view`)}
                            className="bg-blue-500 text-white px-2 py-1 rounded text-xs hover:bg-blue-600 transition-colors"
                          >
                            상세 보기
                          </button>
                        )}
                        {quote.status === 'draft' && (
                          <button
                            onClick={() => router.push(`/mypage/quotes/new?quoteId=${quote.id}`)}
                            className="bg-green-500 text-white px-2 py-1 rounded text-xs hover:bg-green-600 transition-colors"
                          >
                            계속 작성
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
