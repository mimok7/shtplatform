'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import supabase from '@/lib/supabase';
import { getQuoteWithItems } from '@/lib/quoteUtils';
import { Quote } from '@/lib/types';

function QuoteProcessingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const quoteId = searchParams.get('quoteId');
  
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeLeft, setTimeLeft] = useState(300); // 5분 = 300초
  const [processingStep, setProcessingStep] = useState(1);

  useEffect(() => {
    if (quoteId) {
      loadQuote();
    }
    
    // 처리 단계 시뮬레이션
    const stepTimer = setInterval(() => {
      setProcessingStep(prev => {
        if (prev < 4) return prev + 1;
        return prev;
      });
    }, 30000); // 30초마다 단계 진행

    // 5분 후 자동 리다이렉트
    const redirectTimer = setTimeout(() => {
      if (quoteId) {
        router.push(`/mypage/quotes/${quoteId}/view`);
      } else {
        router.push('/mypage/quotes');
      }
    }, 300000);

    return () => {
      clearInterval(stepTimer);
      clearTimeout(redirectTimer);
    };
  }, [router, quoteId]);

  // 카운트다운 타이머
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          if (quoteId) {
            router.push(`/mypage/quotes/${quoteId}/view`);
          } else {
            router.push('/mypage/quotes');
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [router, quoteId]);

  const loadQuote = async () => {
    if (!quoteId) return;
    
    setLoading(true);
    try {
      const quoteData = await getQuoteWithItems(quoteId);
      if (quoteData) {
        setQuote(quoteData);
      }
    } catch (error) {
      console.error('견적 로드 오류:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getProcessingStepInfo = (step: number) => {
    const steps = [
      { icon: '📝', title: '견적 접수', description: '견적 요청을 접수했습니다' },
      { icon: '🔍', title: '내용 검토', description: '견적 내용을 검토하고 있습니다' },
      { icon: '💰', title: '가격 산정', description: '최적의 가격을 계산하고 있습니다' },
      { icon: '✅', title: '검증 완료', description: '견적 검증이 완료되었습니다' }
    ];
    return steps[step - 1] || steps[0];
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-3xl mx-auto">
          {/* 헤더 */}
          <div className="text-center mb-12">
            <div className="mb-6">
              <div className="text-6xl mb-4">🎉</div>
              <h1 className="text-3xl font-bold text-blue-700 mb-4">
                견적 요청이 완료되었습니다!
              </h1>
              <p className="text-lg text-blue-600 mb-2">
                소중한 견적을 작성해주셔서 감사합니다.
              </p>
              <p className="text-blue-500">
                현재 견적을 처리하고 있으며, 완료까지 약 <span className="font-bold text-blue-700">{formatTime(timeLeft)}</span> 남았습니다.
              </p>
            </div>
          </div>

          {/* 견적 정보 카드 */}
          {quote && (
            <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">📋 제출한 견적 정보</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">견적명:</span>
                  <span className="ml-2 font-semibold text-blue-600">
                    {quote.title}
                  </span>
                </div>
                <div>
                  <span className="text-gray-600">제출 시간:</span>
                  <span className="ml-2 text-gray-800">
                    {new Date(quote.created_at).toLocaleString('ko-KR')}
                  </span>
                </div>
                <div>
                  <span className="text-gray-600">견적 제목:</span>
                  <span className="ml-2 text-gray-800">{quote.title || '제목 없음'}</span>
                </div>
                <div>
                  <span className="text-gray-600">상태:</span>
                  <span className="ml-2 text-blue-600 font-medium">처리 중</span>
                </div>
              </div>
            </div>
          )}

          {/* 처리 진행 상황 */}
          <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
            <h3 className="text-lg font-semibold text-gray-800 mb-6">🔄 처리 진행 상황</h3>
            
            <div className="space-y-4">
              {[1, 2, 3, 4].map((step) => {
                const stepInfo = getProcessingStepInfo(step);
                const isActive = step === processingStep;
                const isCompleted = step < processingStep;
                
                return (
                  <div key={step} className={`flex items-center space-x-4 p-4 rounded-lg transition-all ${
                    isActive ? 'bg-blue-50 border-2 border-blue-200' : 
                    isCompleted ? 'bg-green-50 border border-green-200' : 
                    'bg-gray-50 border border-gray-200'
                  }`}>
                    <div className={`text-2xl ${
                      isActive ? 'animate-pulse' : ''
                    }`}>
                      {isCompleted ? '✅' : stepInfo.icon}
                    </div>
                    <div className="flex-1">
                      <h4 className={`font-semibold ${
                        isActive ? 'text-blue-700' : 
                        isCompleted ? 'text-green-700' : 
                        'text-gray-500'
                      }`}>
                        {stepInfo.title}
                      </h4>
                      <p className={`text-sm ${
                        isActive ? 'text-blue-600' : 
                        isCompleted ? 'text-green-600' : 
                        'text-gray-400'
                      }`}>
                        {stepInfo.description}
                      </p>
                    </div>
                    {isActive && (
                      <div className="flex space-x-1">
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 안내 메시지 */}
          <div className="bg-gradient-to-r from-blue-100 to-indigo-100 rounded-xl p-6 mb-8">
            <h3 className="text-lg font-semibold text-blue-800 mb-3">💡 안내사항</h3>
            <ul className="space-y-2 text-blue-700">
              <li className="flex items-center space-x-2">
                <span>📞</span>
                <span>처리 중 궁금한 사항이 있으시면 언제든 연락주세요</span>
              </li>
              <li className="flex items-center space-x-2">
                <span>📧</span>
                <span>견적 완료 시 자동으로 알림을 보내드립니다</span>
              </li>
              <li className="flex items-center space-x-2">
                <span>⏰</span>
                <span>평균 처리 시간은 3-5분입니다</span>
              </li>
            </ul>
          </div>

          {/* 액션 버튼들 */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => router.push('/mypage/quotes/new')}
              className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-semibold"
            >
              🆕 새 견적 작성하기
            </button>
            <button
              onClick={() => router.push('/mypage/quotes')}
              className="px-6 py-3 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors font-semibold"
            >
              📋 견적 목록 보기
            </button>
            {quoteId && (
              <button
                onClick={() => router.push(`/mypage/quotes/${quoteId}/view`)}
                className="px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors font-semibold"
              >
                👀 견적 상세 보기
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


export default function QuoteProcessingPage() {
  return (
    <Suspense fallback={<div className="flex justify-center items-center h-64">로딩 중...</div>}>
      <QuoteProcessingContent />
    </Suspense>
  );
}
