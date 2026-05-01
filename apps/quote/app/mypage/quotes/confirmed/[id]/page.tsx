'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import supabase from '@/lib/supabase';
import { getQuoteWithItems } from '@/lib/quoteUtils';
import { Quote } from '@/lib/types';

export default function ConfirmedQuoteDetailPage() {
  const router = useRouter();
  const params = useParams();
  const quoteId = params.id as string;

  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [showReservationModal, setShowReservationModal] = useState(false);

  useEffect(() => {
    if (quoteId) {
      loadQuote();
    }
  }, [quoteId]);

  const loadQuote = async () => {
    setLoading(true);
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        alert('로그인이 필요합니다.');
        router.push('/login');
        return;
      }

      const quoteData = await getQuoteWithItems(quoteId);
      if (quoteData) {
        // 확정된 견적인지 확인
        if (quoteData.status !== 'approved' && quoteData.status !== 'completed') {
          alert('확정되지 않은 견적입니다.');
          router.push('/mypage/quotes');
          return;
        }
        setQuote(quoteData);
      } else {
        alert('견적을 찾을 수 없습니다.');
        router.push('/mypage/quotes/confirmed');
      }
    } catch (error) {
      console.error('견적 로드 오류:', error);
      router.push('/mypage/quotes/confirmed');
    } finally {
      setLoading(false);
    }
  };

  const handleReservation = () => {
    setShowReservationModal(true);
  };

  const confirmReservation = () => {
    router.push(`/reservation/cruise?quoteId=${quoteId}`);
  };

  const getStatusColor = (status: string): string => {
    const colors: { [key: string]: string } = {
      approved: 'bg-green-100 text-green-800',
      completed: 'bg-blue-100 text-blue-800'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getStatusLabel = (status: string): string => {
    const labels: { [key: string]: string } = {
      approved: '승인됨',
      completed: '완료됨'
    };
    return labels[status] || status;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-green-500"></div>
          <p className="mt-4 text-gray-600">견적을 불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">❌</div>
          <h2 className="text-2xl font-bold text-gray-600 mb-4">견적을 찾을 수 없습니다</h2>
          <button
            onClick={() => router.push('/mypage/quotes/confirmed')}
            className="bg-blue-500 text-white px-6 py-3 rounded-lg hover:bg-blue-600 transition-colors"
          >
            확정 견적 목록으로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <div className="bg-gradient-to-br from-green-200 via-emerald-200 to-teal-100 text-gray-900">
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="flex items-center space-x-3 mb-2">
                <h1 className="text-3xl font-bold">{quote.title || '확정 견적'}</h1>
                <span className={`inline-block px-4 py-2 rounded-full text-sm font-medium ${getStatusColor(quote.status)}`}>
                  ✅ {getStatusLabel(quote.status)}
                </span>
              </div>
              <p className="text-lg opacity-90">
                승인된 견적의 상세 내용을 확인하고 예약하세요.
              </p>
            </div>
            <button
              onClick={() => router.push('/mypage/quotes/confirmed')}
              className="bg-white/80 text-gray-700 px-6 py-3 rounded-lg font-semibold hover:bg-white transition-all"
            >
              ← 목록으로
            </button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* 견적 기본 정보 */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4">📋 견적 정보</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <div>
                  <span className="text-gray-600 font-medium">견적명:</span>
                  <span className="ml-3 font-semibold text-blue-600">
                    {quote.title}
                  </span>
                </div>
                <div>
                  <span className="text-gray-600 font-medium">생성일:</span>
                  <span className="ml-3 text-gray-800">
                    {new Date(quote.created_at).toLocaleDateString('ko-KR', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      weekday: 'long'
                    })}
                  </span>
                </div>
                <div>
                  <span className="text-gray-600 font-medium">승인일:</span>
                  <span className="ml-3 text-gray-800">
                    {new Date(quote.updated_at || quote.created_at).toLocaleDateString('ko-KR', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      weekday: 'long'
                    })}
                  </span>
                </div>
              </div>
              <div className="space-y-3">
                <div>
                  <span className="text-gray-600 font-medium">상태:</span>
                  <span className={`ml-3 px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(quote.status)}`}>
                    {getStatusLabel(quote.status)}
                  </span>
                </div>
                <div>
                  <span className="text-gray-600 font-medium">총 금액:</span>
                  <span className="ml-3 text-2xl font-bold text-green-600">
                    {quote.total_price > 0 ? `${quote.total_price.toLocaleString()}동` : '금액 협의'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 견적 설명 */}
          {quote.description && (
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-xl font-bold text-gray-800 mb-4">📝 견적 설명</h2>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                  {quote.description}
                </p>
              </div>
            </div>
          )}

          {/* 포함 서비스 */}
          {(quote as any).quote_items && (quote as any).quote_items.length > 0 && (
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-xl font-bold text-gray-800 mb-4">🎯 포함 서비스</h2>
              <div className="space-y-4">
                {(quote as any).quote_items.map((item: any, index: number) => (
                  <div key={index} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-3">
                        <span className="text-2xl">
                          {item.service_type === 'cruise' ? '🚢' :
                            item.service_type === 'airport' ? '✈️' :
                              item.service_type === 'hotel' ? '🏨' :
                                item.service_type === 'tour' ? '🗺️' :
                                  item.service_type === 'rentcar' ? '🚗' : '📋'}
                        </span>
                        <h3 className="text-lg font-semibold text-gray-800 capitalize">
                          {item.service_type}
                        </h3>
                      </div>
                      {item.price > 0 && (
                        <span className="text-lg font-bold text-blue-600">
                          {item.price.toLocaleString()}동
                        </span>
                      )}
                    </div>
                    {item.service_data && (
                      <div className="text-sm text-gray-600 bg-gray-50 rounded p-3 mt-2">
                        <pre className="whitespace-pre-wrap font-sans">
                          {JSON.stringify(item.service_data, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 액션 버튼들 */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4">🎯 다음 단계</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <button
                onClick={handleReservation}
                className="bg-green-500 text-white px-6 py-4 rounded-lg hover:bg-green-600 transition-colors font-semibold text-center"
              >
                <div className="text-2xl mb-1">🎫</div>
                <div>예약하기</div>
              </button>

              <button
                onClick={() => router.push(`/mypage/quotes/${quote.id}/edit`)}
                className="bg-amber-500 text-white px-6 py-4 rounded-lg hover:bg-amber-600 transition-colors font-semibold text-center"
              >
                <div className="text-2xl mb-1">✏️</div>
                <div>수정 요청</div>
              </button>

              <button
                onClick={() => router.push(`/mypage/quotes/new?baseQuoteId=${quote.id}`)}
                className="bg-purple-500 text-white px-6 py-4 rounded-lg hover:bg-purple-600 transition-colors font-semibold text-center"
              >
                <div className="text-2xl mb-1">📋</div>
                <div>복사하여 새 견적</div>
              </button>

              <button
                onClick={() => window.print()}
                className="bg-gray-500 text-white px-6 py-4 rounded-lg hover:bg-gray-600 transition-colors font-semibold text-center"
              >
                <div className="text-2xl mb-1">🖨️</div>
                <div>인쇄하기</div>
              </button>
            </div>
          </div>

          {/* 중요 안내사항 */}
          <div className="bg-gradient-to-r from-blue-100 to-cyan-100 rounded-xl p-6">
            <h2 className="text-xl font-bold text-blue-800 mb-4">📢 중요 안내사항</h2>
            <div className="space-y-3 text-blue-700">
              <div className="flex items-start space-x-3">
                <span className="text-blue-600 mt-1">💰</span>
                <div>
                  <span className="font-semibold">가격 보장:</span>
                  <span className="ml-2">확정된 가격은 변경되지 않습니다.</span>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <span className="text-blue-600 mt-1">📅</span>
                <div>
                  <span className="font-semibold">예약 기한:</span>
                  <span className="ml-2">견적 승인 후 30일 이내 예약을 완료해주세요.</span>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <span className="text-blue-600 mt-1">🔄</span>
                <div>
                  <span className="font-semibold">변경 사항:</span>
                  <span className="ml-2">수정이 필요한 경우 '수정 요청' 버튼을 이용해주세요.</span>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <span className="text-blue-600 mt-1">📞</span>
                <div>
                  <span className="font-semibold">고객 지원:</span>
                  <span className="ml-2">궁금한 사항은 언제든 연락주세요.</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 예약 확인 모달 */}
      {showReservationModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-8 max-w-md mx-4">
            <h3 className="text-xl font-bold text-gray-800 mb-4">🎫 예약 확인</h3>
            <p className="text-gray-600 mb-6">
              이 견적으로 예약을 진행하시겠습니까?<br />
              예약 페이지로 이동합니다.
            </p>
            <div className="flex space-x-3">
              <button
                onClick={confirmReservation}
                className="flex-1 bg-green-500 text-white py-3 rounded-lg hover:bg-green-600 transition-colors font-semibold"
              >
                예, 예약하기
              </button>
              <button
                onClick={() => setShowReservationModal(false)}
                className="flex-1 bg-gray-300 text-gray-700 py-3 rounded-lg hover:bg-gray-400 transition-colors font-semibold"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
