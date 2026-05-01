'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabase';
import { getUserQuotes } from '@/lib/quoteUtils';
import { Quote } from '@/lib/types';
import { AuthWrapper } from '@/components/AuthWrapper';

export default function ConfirmedQuotesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [confirmedQuotes, setConfirmedQuotes] = useState<Quote[]>([]);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    loadConfirmedQuotes();
  }, []);

  const loadConfirmedQuotes = async () => {
    try {
      // 사용자 인증 확인
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        alert('로그인이 필요합니다.');
        router.push('/login');
        return;
      }

      setUser(user);

      // 확정된 견적만 조회
      const allQuotes = await getUserQuotes(user.id);
      const confirmed = allQuotes.filter(quote =>
        quote.status === 'approved' || quote.status === 'completed' || quote.status === 'confirmed'
      );
      setConfirmedQuotes(confirmed);
    } catch (error) {
      console.error('확정 견적 목록 로드 오류:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusLabel = (status: string): string => {
    const labels: { [key: string]: string } = {
      approved: '승인됨',
      completed: '완료됨',
      confirmed: '확정됨'
    };
    return labels[status] || status;
  };

  const getStatusColor = (status: string): string => {
    const colors: { [key: string]: string } = {
      approved: 'bg-green-25 text-green-600',
      completed: 'bg-blue-25 text-blue-600',
      confirmed: 'bg-green-25 text-green-600'
    };
    return colors[status] || 'bg-gray-25 text-gray-600';
  };

  const handleReservation = async (quoteId: string) => {
    try {
      // 견적 데이터 조회 - 실제 테이블 컬럼명 사용
      const { data: quoteData, error } = await supabase
        .from('quote')
        .select(`
          id,
          title,
          total_price,
          quote_item (
            service_type,
            service_ref_id,
            quantity,
            unit_price,
            total_price
          )
        `)
        .eq('id', quoteId)
        .single();

      if (error) {
        console.error('견적 조회 오류:', error);
        alert('견적 데이터를 가져올 수 없습니다.');
        return;
      }

      if (!quoteData) {
        alert('견적을 찾을 수 없습니다.');
        return;
      }

      // 견적 데이터를 URL 파라미터로 전달하여 예약 페이지로 이동
      const reservationData = {
        quoteId: quoteData.id,
        title: quoteData.title,
        cruiseCode: '', // cruise_name 컬럼이 없으므로 빈 값으로 설정
        scheduleCode: '', // cruise_name 컬럼이 없으므로 빈 값으로 설정
        checkin: '', // departure_date 컬럼이 없으므로 빈 값으로 설정
        checkout: '', // return_date 컬럼이 없으므로 빈 값으로 설정
        totalPrice: quoteData.total_price, // total_price는 존재함
        services: quoteData.quote_item.map((item: any) => ({
          type: item.service_type,
          code: item.service_ref_id, // service_ref_id를 code로 사용
          quantity: item.quantity,
          unitPrice: item.unit_price,
          totalPrice: item.total_price
        }))
      };

      // 간단하게 견적 ID만 전달하여 예약 페이지로 이동
      router.push(`/mypage/reservations/?quoteId=${quoteData.id}`);
    } catch (error) {
      console.error('예약 처리 오류:', error);
      alert('예약 처리 중 오류가 발생했습니다.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-green-500"></div>
          <p className="mt-4 text-gray-600">확정 견적을 불러오는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <AuthWrapper>
      <div className="min-h-screen bg-gray-50">
        {/* 헤더 */}
        <div className="bg-gradient-to-br from-green-100 via-emerald-100 to-teal-50 text-gray-700">
          <div className="container mx-auto px-4 py-8">
            <div className="mb-6">
              <h1 className="text-2xl font-bold mb-2">✅ 승인 완료 견적</h1>
              <p className="text-lg opacity-80">
                승인이 완료되었습니다. 확인하시고 예약 신청하세요
              </p>
              {/* 버튼을 아래쪽에 세로로 배치 */}
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => router.push('/mypage/quotes/new')}
                  className="bg-gradient-to-r from-blue-300 to-sky-300 text-white px-6 py-2 rounded-lg font-medium hover:from-blue-400 hover:to-sky-400 transition-all"
                >
                  ➕ 새 견적
                </button>
                <button
                  onClick={() => router.push('/mypage/quotes')}
                  className="bg-gray-300 text-white px-6 py-2 rounded-lg font-medium hover:bg-gray-400 transition-all"
                >
                  📋 전체
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 확정 견적 목록 */}
        <div className="container mx-auto px-4 py-8">
          <div className="max-w-6xl mx-auto">
            {confirmedQuotes.length === 0 ? (
              <div className="bg-white rounded-xl shadow-lg p-12 text-center">
                <div className="text-6xl mb-4">📋</div>
                <h3 className="text-xl font-semibold text-gray-600 mb-2">
                  아직 확정된 견적이 없습니다
                </h3>
                <p className="text-gray-500 mb-6">
                  견적을 작성하고 승인을 받으면 여기에서 확인할 수 있습니다.
                </p>
                <button
                  onClick={() => router.push('/mypage/quotes/new')}
                  className="bg-green-300 text-white px-6 py-3 rounded-lg hover:bg-green-400 transition-colors"
                >
                  첫 견적 작성하기
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                {confirmedQuotes.map((quote) => (
                  <div
                    key={quote.id}
                    className="bg-white rounded-xl shadow-lg hover:shadow-xl transition-shadow border border-gray-200"
                  >
                    <div className="p-6">
                      {/* 헤더 정보 */}
                      <div className="flex items-start justify-between mb-6">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3 mb-2">
                            <h3 className="text-xl font-bold text-gray-800">
                              {quote.title || '제목 없음'}
                            </h3>
                            <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(quote.status)}`}>
                              {getStatusLabel(quote.status)}
                            </span>
                            <span className="inline-block px-3 py-1 rounded-full text-sm font-medium bg-green-25 text-green-600">
                              💰 예약 가능
                            </span>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-600">
                            <div>
                              <span className="font-medium">견적명:</span>
                              <span className="ml-2 font-semibold text-blue-600">
                                {quote.title}
                              </span>
                            </div>
                            <div>
                              <span className="font-medium">승인일:</span>
                              <span className="ml-2">
                                {new Date(quote.updated_at || quote.created_at).toLocaleDateString('ko-KR')}
                              </span>
                            </div>
                            <div>
                              <span className="font-medium">총 금액:</span>
                              <span className="ml-2 font-bold text-green-600 text-lg">
                                {quote.total_price > 0 ? `${quote.total_price.toLocaleString()}동` : '금액 협의'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* 설명 */}
                      {quote.description && (
                        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                          <h4 className="font-medium text-gray-700 mb-2">📝 견적 설명</h4>
                          <p className="text-gray-600 leading-relaxed">{quote.description}</p>
                        </div>
                      )}

                      {/* 서비스 정보 (quote_items가 있다면) */}
                      {(quote as any).quote_items && (quote as any).quote_items.length > 0 && (
                        <div className="mb-6">
                          <h4 className="font-medium text-gray-700 mb-3">🎯 포함 서비스</h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {(quote as any).quote_items.map((item: any, index: number) => (
                              <div key={index} className="flex items-center space-x-2 p-3 bg-blue-50 rounded-lg">
                                <span className="text-blue-600">
                                  {item.service_type === 'cruise' ? '🚢' :
                                    item.service_type === 'airport' ? '✈️' :
                                      item.service_type === 'hotel' ? '🏨' :
                                        item.service_type === 'tour' ? '🗺️' :
                                          item.service_type === 'rentcar' ? '🚗' : '📋'}
                                </span>
                                <span className="text-blue-800 font-medium capitalize">
                                  {item.service_type}
                                </span>
                                {item.price > 0 && (
                                  <span className="text-sm text-blue-600">
                                    ({item.price.toLocaleString()}동)
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* 액션 버튼들 */}
                      <div className="flex flex-wrap gap-3 pt-4 border-t border-gray-200">
                        <button
                          onClick={() => router.back()}
                          className="bg-blue-300 text-white px-6 py-2 rounded-lg hover:bg-blue-400 transition-colors font-medium"
                        >
                          닫기
                        </button>

                        <button
                          onClick={() => handleReservation(quote.id)}
                          className="bg-green-300 text-white px-6 py-2 rounded-lg hover:bg-green-400 transition-colors font-medium"
                        >
                          🎫 예약
                        </button>


                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 하단 안내 */}
        <div className="container mx-auto px-4 pb-8">
          <div className="max-w-6xl mx-auto">
            <div className="bg-gradient-to-r from-green-50 to-teal-50 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-green-600 mb-3">💡 확정 견적 안내</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-green-600">
                <div className="flex items-center space-x-2">
                  <span>✅</span>
                  <span>확정된 견적은 즉시 예약 가능합니다</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span>💰</span>
                  <span>표시된 금액은 최종 확정 가격입니다</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span>📞</span>
                  <span>궁금한 사항은 언제든 문의해주세요</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span>🔄</span>
                  <span>수정이 필요하면 수정 요청을 해주세요</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span>📋</span>
                  <span>견적을 복사하여 새로운 견적 작성 가능</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span>🎫</span>
                  <span>예약 후 바로 여행 준비를 시작하세요</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AuthWrapper>
  );
}
