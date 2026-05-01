'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import supabase from '@/lib/supabase';
import { getQuoteWithItems } from '@/lib/quoteUtils';
import { Quote } from '@/lib/types';

function QuotePricingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const quoteId = searchParams.get('quoteId');
  
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeLeft, setTimeLeft] = useState(120); // 2분 후 다음 단계로
  const [pricingStep, setPricingStep] = useState(1);
  const [calculatedPrice, setCalculatedPrice] = useState(0);

  useEffect(() => {
    if (quoteId) {
      loadQuote();
    }
    
    // 가격 산정 단계 시뮬레이션
    const stepTimers = [
      setTimeout(() => setPricingStep(2), 25000), // 25초 후
      setTimeout(() => setPricingStep(3), 50000), // 50초 후
      setTimeout(() => setPricingStep(4), 75000), // 75초 후
      setTimeout(() => setPricingStep(5), 100000), // 100초 후
    ];

    // 가격 계산 시뮬레이션
    const priceTimer = setTimeout(() => {
      setCalculatedPrice(Math.floor(Math.random() * 500000) + 200000); // 20만동 ~ 70만동
    }, 60000);

    // 2분 후 검증 완료 단계로 이동
    const timer = setTimeout(() => {
      router.push(`/mypage/quotes/verification?quoteId=${quoteId}`);
    }, 120000);

    return () => {
      stepTimers.forEach(t => clearTimeout(t));
      clearTimeout(priceTimer);
      clearTimeout(timer);
    };
  }, [router, quoteId]);

  // 카운트다운 타이머
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          router.push(`/mypage/quotes/verification?quoteId=${quoteId}`);
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

  const getPricingStepInfo = (step: number) => {
    const steps = [
      { icon: '📊', title: '기본 요금 조회', description: '서비스별 기본 요금을 조회하고 있습니다' },
      { icon: '🔍', title: '상세 옵션 계산', description: '요청하신 옵션들의 가격을 계산하고 있습니다' },
      { icon: '📈', title: '시장 가격 비교', description: '시장 가격과 비교하여 최적 가격을 산정합니다' },
      { icon: '💡', title: '할인 혜택 적용', description: '가능한 할인 혜택을 적용하고 있습니다' },
      { icon: '💰', title: '최종 가격 산정', description: '최종 견적 가격이 산정되었습니다' }
    ];
    return steps[step - 1] || steps[0];
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-50">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-3xl mx-auto">
          {/* 헤더 */}
          <div className="text-center mb-12">
            <div className="mb-6">
              <div className="text-8xl mb-4">💰</div>
              <h1 className="text-4xl font-bold text-purple-700 mb-4">
                최적의 가격을 산정하고 있습니다
              </h1>
              <p className="text-xl text-purple-600 mb-2">
                요청하신 서비스에 대한 정확한 가격을 계산하고 있습니다.
              </p>
              <p className="text-purple-500">
                다음 단계까지 <span className="font-bold text-purple-700">{formatTime(timeLeft)}</span> 남았습니다.
              </p>
            </div>
          </div>

          {/* 견적 정보 카드 */}
          {quote && (
            <div className="bg-white rounded-xl shadow-lg p-8 mb-8 border border-purple-200">
              <div className="flex items-center mb-6">
                <div className="text-3xl mr-4">💰</div>
                <h3 className="text-2xl font-semibold text-gray-800">가격 산정 중인 견적</h3>
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
                  <span className="ml-3 text-purple-600 font-bold">가격 산정 중</span>
                </div>
              </div>
              
              {calculatedPrice > 0 && (
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <div className="text-center">
                    <span className="text-gray-600 font-medium text-lg">예상 견적 금액:</span>
                    <div className="text-3xl font-bold text-green-600 mt-2">
                      {calculatedPrice.toLocaleString()}동
                    </div>
                    <p className="text-sm text-gray-500 mt-1">* 최종 검증 후 확정됩니다</p>
                  </div>
                </div>
              )}
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

              <div className="flex items-center space-x-4 p-4 rounded-lg bg-green-50 border border-green-200">
                <div className="text-3xl">✅</div>
                <div className="flex-1">
                  <h4 className="font-bold text-green-700 text-lg">2단계: 내용 검토</h4>
                  <p className="text-green-600">견적 내용 검토가 완료되었습니다</p>
                </div>
                <div className="text-green-600 font-bold">완료</div>
              </div>

              <div className="flex items-center space-x-4 p-4 rounded-lg bg-purple-50 border-2 border-purple-200">
                <div className="text-3xl animate-pulse">{getPricingStepInfo(pricingStep).icon}</div>
                <div className="flex-1">
                  <h4 className="font-bold text-purple-700 text-lg">3단계: 가격 산정</h4>
                  <p className="text-purple-600">{getPricingStepInfo(pricingStep).description}</p>
                </div>
                <div className="text-purple-600 font-bold">진행 중</div>
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

          {/* 가격 산정 상세 내용 */}
          <div className="bg-white rounded-xl shadow-lg p-8 mb-8">
            <h3 className="text-2xl font-semibold text-gray-800 mb-6 flex items-center">
              <span className="text-3xl mr-3">📊</span>
              가격 산정 진행 내용
            </h3>
            
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((step) => {
                const stepInfo = getPricingStepInfo(step);
                const isActive = step === pricingStep;
                const isCompleted = step < pricingStep;
                
                return (
                  <div key={step} className={`flex items-center space-x-4 p-4 rounded-lg transition-all ${
                    isActive ? 'bg-purple-50 border-2 border-purple-200' : 
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
                        isActive ? 'text-purple-700' : 
                        isCompleted ? 'text-green-700' : 
                        'text-gray-500'
                      }`}>
                        {stepInfo.title}
                      </h4>
                      <p className={`text-sm ${
                        isActive ? 'text-purple-600' : 
                        isCompleted ? 'text-green-600' : 
                        'text-gray-400'
                      }`}>
                        {stepInfo.description}
                      </p>
                    </div>
                    {isActive && (
                      <div className="flex space-x-1">
                        <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                        <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 안내 메시지 */}
          <div className="bg-gradient-to-r from-purple-100 to-pink-100 rounded-xl p-8 mb-8">
            <h3 className="text-xl font-bold text-purple-800 mb-4 flex items-center">
              <span className="text-2xl mr-3">💡</span>
              가격 산정 과정 안내
            </h3>
            <div className="space-y-3 text-purple-700">
              <div className="flex items-start space-x-3">
                <span className="text-purple-600 mt-1">💰</span>
                <span>시장 최적 가격으로 정확한 견적을 산정합니다</span>
              </div>
              <div className="flex items-start space-x-3">
                <span className="text-purple-600 mt-1">📊</span>
                <span>다양한 옵션과 할인 혜택을 모두 고려합니다</span>
              </div>
              <div className="flex items-start space-x-3">
                <span className="text-purple-600 mt-1">🎯</span>
                <span>투명하고 합리적인 가격을 제공합니다</span>
              </div>
              <div className="flex items-start space-x-3">
                <span className="text-purple-600 mt-1">⏱️</span>
                <span>평균 가격 산정 시간은 1-2분입니다</span>
              </div>
            </div>
          </div>

          {/* 액션 버튼들 */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => router.push(`/mypage/quotes/verification?quoteId=${quoteId}`)}
              className="px-8 py-4 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-semibold text-lg"
            >
              ✅ 다음 단계로 (검증 완료)
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


export default function QuotePricingPage() {
  return (
    <Suspense fallback={<div className="flex justify-center items-center h-64">로딩 중...</div>}>
      <QuotePricingContent />
    </Suspense>
  );
}

