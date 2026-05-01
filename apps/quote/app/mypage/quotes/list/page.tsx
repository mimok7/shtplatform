'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabase';
import PageWrapper from '@/components/PageWrapper';
import { upsertUserProfile } from '@/lib/userUtils';

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
  const [userProfile, setUserProfile] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [creating, setCreating] = useState(false);

  const handleGoHome = () => {
    router.push('/mypage/quotes');
  };

  const ensureUserProfile = async (authUser: any) => {
    const fallbackName = authUser?.user_metadata?.display_name
      || authUser?.user_metadata?.name
      || authUser?.email?.split('@')[0]
      || '사용자';

    const result = await upsertUserProfile(authUser.id, authUser.email || '', {
      name: fallbackName,
      role: 'guest'
    });

    if (!result.success) {
      console.error('사용자 프로필 보장 실패:', result.error);
      return false;
    }

    return true;
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

      const profileReady = await ensureUserProfile(user);
      if (!profileReady) {
        alert('사용자 정보를 준비하지 못했습니다. 잠시 후 다시 시도해주세요.');
        return;
      }

      // 사용자 프로필과 견적 목록을 병렬로 조회 (성능 최적화)
      const [profileRes, quotesRes] = await Promise.all([
        supabase
          .from('users')
          .select('nickname, name, email')
          .eq('id', user.id)
          .maybeSingle(),
        supabase
          .from('quote')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
      ]);

      setUserProfile(profileRes.data);

      if (quotesRes.error) {
        console.error('견적 조회 오류:', quotesRes.error);
        setQuotes([]);
      } else {
        setQuotes(quotesRes.data || []);
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

  // 새 견적 자동 생성
  const handleCreateNewQuote = async () => {
    if (creating) return;
    setCreating(true);

    try {
      // 닉네임 가져오기
      const nickname = userProfile?.nickname || userProfile?.name || user?.email?.split('@')[0] || '사용자';

      // 현재 사용자의 견적 개수로 카운터 설정
      const counter = quotes.length + 1;

      // 자동 생성된 제목
      const autoTitle = `${nickname} ${counter}`;

      const profileReady = await ensureUserProfile(user);
      if (!profileReady) {
        alert('사용자 정보를 준비하지 못했습니다. 다시 시도해주세요.');
        return;
      }

      // 새 견적 생성
      const { data: newQuote, error: createError } = await supabase
        .from('quote')
        .insert({
          user_id: user.id,
          title: autoTitle,
          status: 'draft',
          total_price: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (createError) {
        console.error('견적 생성 오류:', createError);
        alert(`견적 생성에 실패했습니다. (${createError.code || 'UNKNOWN'})`);
        return;
      }

      console.log('✅ 새 견적 생성 완료:', newQuote);

      // 견적 작성 페이지로 이동
      router.push(`/mypage/quotes/new?quoteId=${newQuote.id}`);
    } catch (error) {
      console.error('견적 생성 중 오류:', error);
      alert('견적 생성에 실패했습니다.');
    } finally {
      setCreating(false);
    }
  };

  // 견적 삭제 함수
  const handleDeleteQuote = async (quoteId: string, quoteTitle: string) => {
    const confirmDelete = window.confirm(
      `정말로 "${quoteTitle}" 견적을 삭제하시겠습니까?\n\n삭제된 견적은 복구할 수 없습니다.`
    );

    if (!confirmDelete) return;

    try {
      // 먼저 quote_item 삭제 (외래키 제약조건)
      const { error: itemError } = await supabase
        .from('quote_item')
        .delete()
        .eq('quote_id', quoteId);

      if (itemError) {
        console.error('견적 항목 삭제 오류:', itemError);
        alert('견적 항목 삭제 중 오류가 발생했습니다.');
        return;
      }

      // 견적 삭제
      const { error: quoteError } = await supabase
        .from('quote')
        .delete()
        .eq('id', quoteId)
        .eq('user_id', user.id); // 보안을 위해 사용자 ID 확인

      if (quoteError) {
        console.error('견적 삭제 오류:', quoteError);
        alert('견적 삭제에 실패했습니다.');
        return;
      }

      console.log('✅ 견적 삭제 완료:', quoteId);

      // 목록 새로고침
      await loadUserAndQuotes();
      alert('견적이 성공적으로 삭제되었습니다.');
    } catch (error) {
      console.error('견적 삭제 중 오류:', error);
      alert('견적 삭제 중 오류가 발생했습니다.');
    }
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
    <PageWrapper
      title="📋 견적 관리"
      actions={
        <>
          <button
            onClick={handleCreateNewQuote}
            disabled={creating}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {creating ? '⏳ 생성 중...' : '➕ 새 견적 작성'}
          </button>
          <button
            onClick={handleGoHome}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm font-medium shadow-sm"
          >
            🏠 홈
          </button>
        </>
      }
    >
      {/* 탭 버튼 */}
      <div className="flex justify-start items-center mb-6">
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'all'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
          >
            📋 전체 ({getTabCount('all')})
          </button>
          <button
            onClick={() => setActiveTab('draft')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'draft'
              ? 'bg-gray-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
          >
            ✏️ 작성중 ({getTabCount('draft')})
          </button>
          <button
            onClick={() => setActiveTab('submitted')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'submitted'
              ? 'bg-yellow-500 text-white'
              : 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100'
              }`}
          >
            📤 제출됨 ({getTabCount('submitted')})
          </button>
          <button
            onClick={() => setActiveTab('approved')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'approved'
              ? 'bg-blue-600 text-white'
              : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
              }`}
          >
            ✅ 승인됨 ({getTabCount('approved')})
          </button>
          <button
            onClick={() => setActiveTab('confirmed')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'confirmed'
              ? 'bg-green-600 text-white'
              : 'bg-green-50 text-green-700 hover:bg-green-100'
              }`}
          >
            🎉 확정됨 ({getTabCount('confirmed')})
          </button>
        </div>
      </div>

      {/* 견적 목록 */}
      <div>
        {filteredQuotes.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-12 text-center shadow-sm">
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
              onClick={handleCreateNewQuote}
              disabled={creating}
              className="bg-blue-500 text-white px-4 py-2 rounded text-sm hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {creating ? '⏳ 생성 중...' : '견적 작성하기'}
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
                  className="bg-white rounded-lg border border-gray-200 p-6 hover:border-blue-500 hover:shadow-md transition-all"
                >
                  <div>
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
                            <button
                              onClick={() => handleDeleteQuote(quote.id, quote.title || '제목 없음')}
                              className="bg-red-500 text-white px-3 py-1.5 rounded text-xs hover:bg-red-600 transition-colors whitespace-nowrap"
                            >
                              🗑️ 삭제
                            </button>
                          </>
                        )}
                        {quote.status === 'submitted' && (
                          <>
                            <button
                              onClick={() => router.push(`/mypage/quotes/${quote.id}/view`)}
                              className="bg-yellow-500 text-white px-3 py-1.5 rounded text-xs hover:bg-yellow-600 transition-colors whitespace-nowrap"
                            >
                              📋 상세보기
                            </button>
                            <button
                              onClick={() => handleDeleteQuote(quote.id, quote.title || '제목 없음')}
                              className="bg-red-500 text-white px-3 py-1.5 rounded text-xs hover:bg-red-600 transition-colors whitespace-nowrap"
                            >
                              🗑️ 삭제
                            </button>
                          </>
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
                          <>
                            <button
                              onClick={() => router.push(`/mypage/quotes/${quote.id}/confirmed`)}
                              className="bg-green-500 text-white px-3 py-1.5 rounded text-xs hover:bg-green-600 transition-colors whitespace-nowrap"
                            >
                              🎉 확정견적
                            </button>
                            <button
                              onClick={() => handleDeleteQuote(quote.id, quote.title || '제목 없음')}
                              className="bg-red-500 text-white px-3 py-1.5 rounded text-xs hover:bg-red-600 transition-colors whitespace-nowrap"
                            >
                              🗑️ 삭제
                            </button>
                          </>
                        )}
                        {!['draft', 'submitted', 'approved', 'confirmed'].includes(quote.status) && (
                          <>
                            <button
                              onClick={() => router.push(`/mypage/quotes/${quote.id}/view`)}
                              className="bg-blue-500 text-white px-3 py-1.5 rounded text-xs hover:bg-blue-600 transition-colors"
                            >
                              📋 상세보기
                            </button>
                            <button
                              onClick={() => handleDeleteQuote(quote.id, quote.title || '제목 없음')}
                              className="bg-red-500 text-white px-3 py-1.5 rounded text-xs hover:bg-red-600 transition-colors whitespace-nowrap"
                            >
                              🗑️ 삭제
                            </button>
                          </>
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
    </PageWrapper>
  );
}
