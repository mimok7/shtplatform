'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabase';
import { getUserQuotes } from '@/lib/quoteUtils';
import { Quote } from '@/lib/types';

export default function QuotesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [user, setUser] = useState<any>(null);

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

      // 사용자의 견적 목록 조회
      const userQuotes = await getUserQuotes(user.id);
      setQuotes(userQuotes);
    } catch (error) {
      console.error('견적 목록 로드 오류:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusLabel = (status: string): string => {
    const labels: { [key: string]: string } = {
      draft: '작성 중',
      submitted: '제출됨',
      approved: '승인됨',
      rejected: '거절됨',
      completed: '완료됨'
    };
    return labels[status] || status;
  };

  const getStatusColor = (status: string): string => {
    const colors: { [key: string]: string } = {
      draft: 'bg-gray-100 text-gray-800',
      submitted: 'bg-blue-100 text-blue-800',
      approved: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
      completed: 'bg-purple-100 text-purple-800'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
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
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold mb-2">📋 내 견적 목록</h1>
              <p className="text-lg opacity-90">
                작성한 견적들을 확인하고 관리하세요.
              </p>
            </div>
            <button
              onClick={() => router.push('/mypage/quotes/new')}
              className="bg-gradient-to-r from-blue-500 to-sky-500 text-white px-6 py-3 rounded-lg font-semibold hover:from-blue-600 hover:to-sky-600 transition-all"
            >
              ➕ 새 견적 작성
            </button>
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
                className="bg-blue-500 text-white px-6 py-3 rounded-lg hover:bg-blue-600 transition-colors"
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

                      <div className="flex flex-col gap-2 ml-4">
                        <button
                          onClick={() => router.push(`/mypage/quotes/${quote.id}/view`)}
                          className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors text-sm"
                        >
                          상세 보기
                        </button>
                        
                        {quote.status === 'draft' && (
                          <button
                            onClick={() => router.push(`/mypage/quotes/new?quoteId=${quote.id}`)}
                            className="bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600 transition-colors text-sm"
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

