'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import supabase from '@/lib/supabase';
import { getQuoteWithItems } from '@/lib/quoteUtils';
import { Quote } from '@/lib/types';

function QuoteReviewContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const quoteId = searchParams.get('quoteId');
  
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeLeft, setTimeLeft] = useState(90); // 1분 30초 후 다음 단계로
  const [reviewStep, setReviewStep] = useState(1);

  useEffect(() => {
    if (quoteId) {
      loadQuote();
    }
    
    // 검토 단계 시뮬레이션
    const stepTimers = [
      setTimeout(() => setReviewStep(2), 20000), // 20초 후
      setTimeout(() => setReviewStep(3), 45000), // 45초 후
      setTimeout(() => setReviewStep(4), 70000), // 70초 후
    ];

    // 1분 30초 후 가격 산정 단계로 이동
    const timer = setTimeout(() => {
      router.push(`/mypage/quotes/pricing?quoteId=${quoteId}`);
    }, 90000);

    return () => {
      stepTimers.forEach(t => clearTimeout(t));
      clearTimeout(timer);
    };
  }, [router, quoteId]);

  // 카운트다운 타이머
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          router.push(`/mypage/quotes/pricing?quoteId=${quoteId}`);
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

  const getReviewStepInfo = (step: number) => {
    const steps = [
      { icon: '📋', title: '기본 정보 확인', description: '견적 요청 내용을 확인하고 있습니다' },
      { icon: '🔍', title: '상세 내용 분석', description: '요청하신 서비스 내용을 분석하고 있습니다' },
      { icon: '✅', title: '가능성 검토', description: '요청 사항의 실현 가능성을 검토하고 있습니다' },
      { icon: '📝', title: '검토 완료', description: '내용 검토가 완료되었습니다' }
    ];
    return steps[step - 1] || steps[0];
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-yellow-50">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-3xl mx-auto">
          {/* 헤더 */}
          <div className="text-center mb-12">
            <div className="mb-6">
              <div className="text-8xl mb-4">🔍</div>
              <h1 className="text-4xl font-bold text-orange-700 mb-4">
                견적 내용을 검토하고 있습니다
              </h1>
              <p className="text-xl text-orange-600 mb-2">
                전문가가 요청하신 내용을 꼼꼼히 검토하고 있습니다.
              </p>
              <p className="text-orange-500">
                다음 단계까지 <span className="font-bold text-orange-700">{formatTime(timeLeft)}</span> 남았습니다.
              </p>
            </div>
          </div>

          {/* 견적 정보 카드 */}
          {quote && (
            <div className="bg-white rounded-xl shadow-lg p-8 mb-8 border border-orange-200">
              <div className="flex items-center mb-6">
                <div className="text-3xl mr-4">📋</div>
                <h3 className="text-2xl font-semibold text-gray-800">검토 중인 견적</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-lg">
                <div>
                  <span className="text-gray-600 font-medium">견적명:</span>
                  <span className="ml-3 font-bold text-blue-600">{quote.title}</span>
                </div>
                <div>
                  <span className="text-gray-600 font-medium">접수 시간:</span>
                  <span className="ml-3 text-gray-800">
                    {new Date(quote.created_at).toLocaleString('ko-KR')}
                  </span>
                </div>
                <div>
                  <span className="text-gray-600 font-medium">현재 상태:</span>
                  <span className="ml-3 text-orange-600 font-bold">내용 검토 중</span>
                </div>
              </div>
            </div>
          )}

          {/* 진행 상황 */}
          <div className="bg-white rounded-xl shadow-lg p-8 mb-8">
            <h3 className="text-2xl font-semibold text-gray-800 mb-6 flex items-center">
              <span className="text-3xl mr-3">🔄</span>
              처리 진행 상황
            </h3>
            
            <div className="space-y-4">
              <div className="flex items-center space-x-4 p-4 rounded-lg bg-green-50 border border-green-200">
                <div className="text-3xl">✅</div>
                <div className="flex-1">
                  <h4 className="font-bold text-green-700 text-lg">1단계: 견적 접수</h4>
                  <p className="text-green-600">견적 요청이 성공적으로 접수되었습니다</p>
                </div>
                <div className="text-green-600 font-bold">완료</div>
              </div>

              <div className="flex items-center space-x-4 p-4 rounded-lg bg-orange-50 border-2 border-orange-200">
                <div className="text-3xl animate-pulse">{getReviewStepInfo(reviewStep).icon}</div>
                <div className="flex-1">
                  <h4 className="font-bold text-orange-700 text-lg">2단계: 내용 검토</h4>
                  <p className="text-orange-600">{getReviewStepInfo(reviewStep).description}</p>
                </div>
                <div className="text-orange-600 font-bold">진행 중</div>
              </div>

              <div className="flex items-center space-x-4 p-4 rounded-lg bg-gray-50 border border-gray-200">
                <div className="text-3xl text-gray-400">💰</div>
                <div className="flex-1">
                  <h4 className="font-semibold text-gray-500 text-lg">3단계: 가격 산정</h4>
                  <p className="text-gray-400">최적의 가격을 계산합니다</p>
                </div>
                <div className="text-gray-400">대기 중</div>
              </div>

              <div className="flex items-center space-x-4 p-4 rounded-lg bg-gray-50 border border-gray-200">
                <div className="text-3xl text-gray-400">✅</div>
                <div className="flex-1">
                  <h4 className="font-semibold text-gray-500 text-lg">4단계: 검증 완료</h4>
                  <p className="text-gray-400">최종 검증 후 견적서를 완성합니다</p>
                </div>
                <div className="text-gray-400">대기 중</div>
              </div>
            </div>
          </div>

          {/* 검토 상세 내용 */}
          <div className="bg-white rounded-xl shadow-lg p-8 mb-8">
            <h3 className="text-2xl font-semibold text-gray-800 mb-6 flex items-center">
              <span className="text-3xl mr-3">📝</span>
              검토 진행 내용
            </h3>
            
            <div className="space-y-4">
              {[1, 2, 3, 4].map((step) => {
                const stepInfo = getReviewStepInfo(step);
                const isActive = step === reviewStep;
                const isCompleted = step < reviewStep;
                
                return (
                  <div key={step} className={`flex items-center space-x-4 p-4 rounded-lg transition-all ${
                    isActive ? 'bg-orange-50 border-2 border-orange-200' : 
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
                        isActive ? 'text-orange-700' : 
                        isCompleted ? 'text-green-700' : 
                        'text-gray-500'
                      }`}>
                        {stepInfo.title}
                      </h4>
                      <p className={`text-sm ${
                        isActive ? 'text-orange-600' : 
                        isCompleted ? 'text-green-600' : 
                        'text-gray-400'
                      }`}>
                        {stepInfo.description}
                      </p>
                    </div>
                    {isActive && (
                      <div className="flex space-x-1">
                        <div className="w-2 h-2 bg-orange-500 rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-orange-500 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                        <div className="w-2 h-2 bg-orange-500 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 안내 메시지 */}
          <div className="bg-gradient-to-r from-orange-100 to-yellow-100 rounded-xl p-8 mb-8">
            <h3 className="text-xl font-bold text-orange-800 mb-4 flex items-center">
              <span className="text-2xl mr-3">💡</span>
              검토 과정 안내
            </h3>
            <div className="space-y-3 text-orange-700">
              <div className="flex items-start space-x-3">
                <span className="text-orange-600 mt-1">🔍</span>
                <span>전문가가 요청하신 내용을 상세히 검토하고 있습니다</span>
              </div>
              <div className="flex items-start space-x-3">
                <span className="text-orange-600 mt-1">📋</span>
                <span>서비스 가능 여부와 최적 방안을 검토합니다</span>
              </div>
              <div className="flex items-start space-x-3">
                <span className="text-orange-600 mt-1">✅</span>
                <span>검토 완료 후 정확한 가격 산정을 진행합니다</span>
              </div>
              <div className="flex items-start space-x-3">
                <span className="text-orange-600 mt-1">⏱️</span>
                <span>평균 검토 시간은 1-2분입니다</span>
              </div>
            </div>
          </div>

          {/* 액션 버튼들 */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => router.push(`/mypage/quotes/pricing?quoteId=${quoteId}`)}
              className="px-8 py-4 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-semibold text-lg"
            >
              💰 다음 단계로 (가격 산정)
            </button>
            <button
              onClick={() => router.push('/mypage/quotes/new')}
              className="px-8 py-4 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors font-semibold text-lg"
            >
              🆕 새 견적 작성하기
            </button>
            <button
              onClick={() => router.push('/mypage/quotes')}
              className="px-8 py-4 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors font-semibold text-lg"
            >
              📋 견적 목록 보기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


export default function QuoteReviewPage() {
  return (
    <Suspense fallback={<div className="flex justify-center items-center h-64">로딩 중...</div>}>
      <QuoteReviewContent />
    </Suspense>
  );
}
