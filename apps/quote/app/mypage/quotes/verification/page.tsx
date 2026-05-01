'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import supabase from '@/lib/supabase';
import { getQuoteWithItems } from '@/lib/quoteUtils';
import { Quote } from '@/lib/types';

function QuoteVerificationContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const quoteId = searchParams.get('quoteId');
  
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [verificationStep, setVerificationStep] = useState(1);
  const [finalPrice, setFinalPrice] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);

  useEffect(() => {
    if (quoteId) {
      loadQuote();
    }
    
    // 검증 단계 시뮬레이션
    const stepTimers = [
      setTimeout(() => setVerificationStep(2), 15000), // 15초 후
      setTimeout(() => setVerificationStep(3), 30000), // 30초 후
      setTimeout(() => setVerificationStep(4), 45000), // 45초 후
      setTimeout(() => {
        setVerificationStep(5);
        setIsCompleted(true);
        setFinalPrice(Math.floor(Math.random() * 500000) + 200000);
      }, 60000), // 60초 후 완료
    ];

    return () => {
      stepTimers.forEach(t => clearTimeout(t));
    };
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

  const getVerificationStepInfo = (step: number) => {
    const steps = [
      { icon: '🔍', title: '가격 정확성 검증', description: '산정된 가격의 정확성을 검증하고 있습니다' },
      { icon: '📋', title: '서비스 내용 확인', description: '요청하신 서비스 내용을 최종 확인하고 있습니다' },
      { icon: '✅', title: '품질 보증 검토', description: '서비스 품질과 만족도를 보장하기 위해 검토합니다' },
      { icon: '📄', title: '견적서 작성', description: '최종 견적서를 작성하고 있습니다' },
      { icon: '🎉', title: '검증 완료', description: '모든 검증이 완료되어 견적서가 준비되었습니다' }
    ];
    return steps[step - 1] || steps[0];
  };

  const handleViewQuote = () => {
    router.push(`/mypage/quotes/${quoteId}/view`);
  };

  const handleReservation = () => {
    router.push(`/reservation/cruise?quoteId=${quoteId}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-50">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-3xl mx-auto">
          {/* 헤더 */}
          <div className="text-center mb-12">
            <div className="mb-6">
              <div className="text-8xl mb-4">{isCompleted ? '🎉' : '✅'}</div>
              <h1 className="text-4xl font-bold text-green-700 mb-4">
                {isCompleted ? '견적서가 완성되었습니다!' : '최종 검증을 진행하고 있습니다'}
              </h1>
              <p className="text-xl text-green-600 mb-2">
                {isCompleted 
                  ? '모든 검증이 완료되어 견적서를 확인하실 수 있습니다.' 
                  : '견적의 정확성과 품질을 최종 검증하고 있습니다.'
                }
              </p>
              {!isCompleted && (
                <p className="text-green-500">
                  검증이 거의 완료되었습니다. 잠시만 기다려주세요.
                </p>
              )}
            </div>
          </div>

          {/* 견적 정보 카드 */}
          {quote && (
            <div className="bg-white rounded-xl shadow-lg p-8 mb-8 border border-green-200">
              <div className="flex items-center mb-6">
                <div className="text-3xl mr-4">{isCompleted ? '📋' : '✅'}</div>
                <h3 className="text-2xl font-semibold text-gray-800">
                  {isCompleted ? '완성된 견적서' : '검증 중인 견적'}
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-lg">
                <div>
                  <span className="text-gray-600 font-medium">견적 제목:</span>
                  <span className="ml-3 font-bold text-blue-600">{quote.title}</span>
                </div>
                <div>
                  <span className="text-gray-600 font-medium">견적명:</span>
                  <span className="ml-3 font-semibold text-blue-600">{quote.title}</span>
                </div>
                <div>
                  <span className="text-gray-600 font-medium">접수 시간:</span>
                  <span className="ml-3 text-gray-800">
                    {new Date(quote.created_at).toLocaleString('ko-KR')}
                  </span>
                </div>
                <div>
                  <span className="text-gray-600 font-medium">현재 상태:</span>
                  <span className={`ml-3 font-bold ${isCompleted ? 'text-green-600' : 'text-blue-600'}`}>
                    {isCompleted ? '검증 완료' : '최종 검증 중'}
                  </span>
                </div>
              </div>
              
              {isCompleted && finalPrice > 0 && (
                <div className="mt-8 pt-6 border-t border-gray-200">
                  <div className="text-center bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg p-6">
                    <h4 className="text-xl font-semibold text-gray-800 mb-3">✨ 최종 견적 금액</h4>
                    <div className="text-4xl font-bold text-green-600 mb-2">
                      {finalPrice.toLocaleString()}동
                    </div>
                    <p className="text-sm text-green-600">
                      🎯 모든 검증을 완료한 확정 가격입니다
                    </p>
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

              <div className="flex items-center space-x-4 p-4 rounded-lg bg-green-50 border border-green-200">
                <div className="text-3xl">✅</div>
                <div className="flex-1">
                  <h4 className="font-bold text-green-700 text-lg">3단계: 가격 산정</h4>
                  <p className="text-green-600">최적의 가격 산정이 완료되었습니다</p>
                </div>
                <div className="text-green-600 font-bold">완료</div>
              </div>

              <div className={`flex items-center space-x-4 p-4 rounded-lg ${
                isCompleted 
                  ? 'bg-green-50 border border-green-200' 
                  : 'bg-blue-50 border-2 border-blue-200'
              }`}>
                <div className={`text-3xl ${isCompleted ? '' : 'animate-pulse'}`}>
                  {isCompleted ? '✅' : getVerificationStepInfo(verificationStep).icon}
                </div>
                <div className="flex-1">
                  <h4 className={`font-bold text-lg ${
                    isCompleted ? 'text-green-700' : 'text-blue-700'
                  }`}>
                    4단계: 검증 완료
                  </h4>
                  <p className={isCompleted ? 'text-green-600' : 'text-blue-600'}>
                    {isCompleted 
                      ? '모든 검증이 완료되어 견적서가 준비되었습니다' 
                      : getVerificationStepInfo(verificationStep).description
                    }
                  </p>
                </div>
                <div className={`font-bold ${
                  isCompleted ? 'text-green-600' : 'text-blue-600'
                }`}>
                  {isCompleted ? '완료' : '진행 중'}
                </div>
              </div>
            </div>
          </div>

          {/* 검증 상세 내용 */}
          <div className="bg-white rounded-xl shadow-lg p-8 mb-8">
            <h3 className="text-2xl font-semibold text-gray-800 mb-6 flex items-center">
              <span className="text-3xl mr-3">📝</span>
              검증 진행 내용
            </h3>
            
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((step) => {
                const stepInfo = getVerificationStepInfo(step);
                const isActive = step === verificationStep && !isCompleted;
                const isCompletedStep = step < verificationStep || isCompleted;
                
                return (
                  <div key={step} className={`flex items-center space-x-4 p-4 rounded-lg transition-all ${
                    isActive ? 'bg-blue-50 border-2 border-blue-200' : 
                    isCompletedStep ? 'bg-green-50 border border-green-200' : 
                    'bg-gray-50 border border-gray-200'
                  }`}>
                    <div className={`text-2xl ${
                      isActive ? 'animate-pulse' : ''
                    }`}>
                      {isCompletedStep ? '✅' : stepInfo.icon}
                    </div>
                    <div className="flex-1">
                      <h4 className={`font-semibold ${
                        isActive ? 'text-blue-700' : 
                        isCompletedStep ? 'text-green-700' : 
                        'text-gray-500'
                      }`}>
                        {stepInfo.title}
                      </h4>
                      <p className={`text-sm ${
                        isActive ? 'text-blue-600' : 
                        isCompletedStep ? 'text-green-600' : 
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

          {/* 완료 메시지 또는 안내 메시지 */}
          <div className={`rounded-xl p-8 mb-8 ${
            isCompleted 
              ? 'bg-gradient-to-r from-green-100 to-emerald-100' 
              : 'bg-gradient-to-r from-blue-100 to-cyan-100'
          }`}>
            <h3 className={`text-xl font-bold mb-4 flex items-center ${
              isCompleted ? 'text-green-800' : 'text-blue-800'
            }`}>
              <span className="text-2xl mr-3">{isCompleted ? '🎉' : '💡'}</span>
              {isCompleted ? '견적 완성 안내' : '검증 과정 안내'}
            </h3>
            <div className={`space-y-3 ${
              isCompleted ? 'text-green-700' : 'text-blue-700'
            }`}>
              {isCompleted ? (
                <>
                  <div className="flex items-start space-x-3">
                    <span className="text-green-600 mt-1">✅</span>
                    <span>모든 검증이 완료되어 신뢰할 수 있는 견적서입니다</span>
                  </div>
                  <div className="flex items-start space-x-3">
                    <span className="text-green-600 mt-1">💰</span>
                    <span>확정된 가격으로 추가 비용 없이 서비스를 받으실 수 있습니다</span>
                  </div>
                  <div className="flex items-start space-x-3">
                    <span className="text-green-600 mt-1">🎫</span>
                    <span>지금 바로 예약을 진행하실 수 있습니다</span>
                  </div>
                  <div className="flex items-start space-x-3">
                    <span className="text-green-600 mt-1">📞</span>
                    <span>궁금한 사항이 있으시면 언제든 연락주세요</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-start space-x-3">
                    <span className="text-blue-600 mt-1">🔍</span>
                    <span>품질과 정확성을 보장하기 위해 꼼꼼히 검증하고 있습니다</span>
                  </div>
                  <div className="flex items-start space-x-3">
                    <span className="text-blue-600 mt-1">📋</span>
                    <span>모든 서비스 내용과 가격을 재확인하고 있습니다</span>
                  </div>
                  <div className="flex items-start space-x-3">
                    <span className="text-blue-600 mt-1">✅</span>
                    <span>검증 완료 후 즉시 견적서를 확인하실 수 있습니다</span>
                  </div>
                  <div className="flex items-start space-x-3">
                    <span className="text-blue-600 mt-1">⏱️</span>
                    <span>평균 검증 시간은 1분입니다</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* 액션 버튼들 */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            {isCompleted ? (
              <>
                <button
                  onClick={handleViewQuote}
                  className="px-8 py-4 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-semibold text-lg"
                >
                  📋 견적서 상세 보기
                </button>
                <button
                  onClick={handleReservation}
                  className="px-8 py-4 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors font-semibold text-lg"
                >
                  🎫 바로 예약하기
                </button>
                <button
                  onClick={() => router.push('/mypage/quotes/new')}
                  className="px-8 py-4 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors font-semibold text-lg"
                >
                  🆕 새 견적 작성하기
                </button>
              </>
            ) : (
              <>
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
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


export default function QuoteVerificationPage() {
  return (
    <Suspense fallback={<div className="flex justify-center items-center h-64">로딩 중...</div>}>
      <QuoteVerificationContent />
    </Suspense>
  );
}

