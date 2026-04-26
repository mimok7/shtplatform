"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabase';
import ManagerLayout from '@/components/ManagerLayout';
import QuoteDetailModal from '@/components/QuoteDetailModal';
import { cancelQuoteApproval, reapproveQuote } from '@/lib/quoteActions';
import { useRole } from '@/app/components/RoleContext';

type Quote = {
  id: string;
  title?: string | null;
  status?: string | null;
  user_id?: string | null;
  created_at?: string | null;
  approved_at?: string | null;
  total_price?: number | null;
  user_nickname?: string | null;
};

export default function ManagerQuotesPage() {
  const router = useRouter();
  const { user } = useRole();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>(typeof window !== 'undefined' ? (new URLSearchParams(window.location.search).get('filter') || 'submitted') : 'submitted');
  const [stats, setStats] = useState({ total: 0, submitted: 0, approved: 0, draft: 0, rejected: 0 });
  const [statsLoading, setStatsLoading] = useState(false);
  const [modalQuoteId, setModalQuoteId] = useState<string | null>(null);
  const [selectedQuotes, setSelectedQuotes] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [syncingApproval, setSyncingApproval] = useState(false);
  const [loadedDaysCount, setLoadedDaysCount] = useState(3);
  const [canLoadMore, setCanLoadMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);

  // 초기 로딩 (권한 체크 제거)
  useEffect(() => {
    if (user) {
      loadQuotes();
      loadStats();
    }
  }, [user]);

  const handleFilterChange = async (newFilter: string) => {
    setFilter(newFilter);
    setLoadedDaysCount(3); // 필터 변경 시 초기화
    setSearch('');
    setSearchResults([]);
    // 필터 변경 시 즉시 조회 시작 (새 필터 값 전달)
    await loadQuotes(newFilter);
    await loadStats();
  };

  async function syncQuotesLinkedToReservations() {
    setSyncingApproval(true);
    try {
      const { data: reservationRows, error: reservationError } = await supabase
        .from('reservation')
        .select('re_quote_id')
        .not('re_quote_id', 'is', null);

      if (reservationError) throw reservationError;

      const reservedQuoteKeys = new Set(
        (reservationRows || [])
          .map((row: any) => String(row.re_quote_id || '').trim())
          .filter(Boolean)
      );

      if (reservedQuoteKeys.size === 0) return { updated: 0 };

      const { data: quoteRows, error: quoteError } = await supabase
        .from('quote')
        .select('id, status');

      if (quoteError) throw quoteError;

      const targetIds = (quoteRows || [])
        .filter((q: any) => {
          const idKey = String(q.id || '').trim();
          const linked = reservedQuoteKeys.has(idKey);
          return linked && q.status !== 'approved';
        })
        .map((q: any) => q.id)
        .filter(Boolean);

      if (targetIds.length === 0) return { updated: 0 };

      const { error: updateError } = await supabase
        .from('quote')
        .update({ status: 'approved', approved_at: new Date().toISOString() })
        .in('id', targetIds);

      if (updateError) throw updateError;

      return { updated: targetIds.length };
    } finally {
      setSyncingApproval(false);
    }
  }

  async function loadQuotes(filterOverride?: string) {
    setLoading(true);
    try {
      await syncQuotesLinkedToReservations();
      const currentFilter = filterOverride !== undefined ? filterOverride : filter;
      
      // 최근 loadedDaysCount일 범위 계산
      const now = new Date();
      const startDate = new Date(now.getTime() - loadedDaysCount * 24 * 60 * 60 * 1000);
      const startDateStr = startDate.toISOString().split('T')[0];
      
      let q = supabase.from('quote').select('id, title, status, user_id, created_at, approved_at, total_price').order('created_at', { ascending: false });
      if (currentFilter !== 'all') q = q.eq('status', currentFilter as any);
      
      // 날짜 범위 필터
      q = q.gte('created_at', startDateStr);
      
      const { data, error } = await q;
      if (error) throw error;

      // 전체 데이터 중 더 로드할 데이터가 있는지 확인하기 위해 한 건 더 조회
      let hasMore = false;
      try {
        const checkDate = new Date(startDate.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        let checkQ = supabase.from('quote').select('id', { count: 'exact', head: true });
        if (currentFilter !== 'all') checkQ = checkQ.eq('status', currentFilter as any);
        checkQ = checkQ.lt('created_at', startDateStr);
        const { count } = await checkQ;
        hasMore = (count || 0) > 0;
      } catch (e) { /* noop */ }
      setCanLoadMore(hasMore);

      const enriched = await Promise.all((data || []).map(async (item: any) => {
        let nickname = item?.user_id ? `${String(item.user_id).slice(0, 8)}...` : '알 수 없음';
        try {
          const { data: u } = await supabase.from('users').select('name, email').eq('id', item.user_id).single();
          if (u) nickname = u.name || (u.email ? u.email.split('@')[0] : nickname);
        } catch (_e) { /* ignore */ }
        return { ...item, user_nickname: nickname };
      }));

      setQuotes(enriched as Quote[]);
      setSearchResults([]);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  async function handleLoadMore() {
    setLoadingMore(true);
    try {
      const newDaysCount = loadedDaysCount + 3;
      setLoadedDaysCount(newDaysCount);
      await loadQuotes();
    } catch (e) {
      console.error(e);
      setLoadedDaysCount(loadedDaysCount); // 롤백
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleSearch(searchTerm: string) {
    setSearch(searchTerm);
    if (!searchTerm.trim()) {
      setSearchResults([]);
      return;
    }

    setSearchLoading(true);
    try {
      const s = searchTerm.trim().toLowerCase();
      
      // 전체 DB에서 검색 (날짜 제한 없음)
      const { data, error } = await supabase
        .from('quote')
        .select('id, title, status, user_id, created_at, approved_at, total_price')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // 메모리에서 필터링
      const enriched = await Promise.all((data || []).map(async (item: any) => {
        let nickname = item?.user_id ? `${String(item.user_id).slice(0, 8)}...` : '알 수 없음';
        try {
          const { data: u } = await supabase.from('users').select('name, email').eq('id', item.user_id).single();
          if (u) nickname = u.name || (u.email ? u.email.split('@')[0] : nickname);
        } catch (_e) { /* ignore */ }
        return { ...item, user_nickname: nickname };
      }));

      const filtered = (enriched as Quote[]).filter(q => {
        return (String(q.user_nickname || '')).toLowerCase().includes(s) || (String(q.title || '')).toLowerCase().includes(s) || (String(q.id || '')).toLowerCase().includes(s);
      });

      setSearchResults(filtered);
    } catch (e) { console.error(e); }
    finally { setSearchLoading(false); }
  }

  async function loadStats() {
    setStatsLoading(true);
    try {
      const total = await supabase.from('quote').select('*', { count: 'exact', head: true });
      const submitted = await supabase.from('quote').select('*', { count: 'exact', head: true }).eq('status', 'submitted');
      const approved = await supabase.from('quote').select('*', { count: 'exact', head: true }).eq('status', 'approved');
      const draft = await supabase.from('quote').select('*', { count: 'exact', head: true }).eq('status', 'draft');
      const rejected = await supabase.from('quote').select('*', { count: 'exact', head: true }).eq('status', 'rejected');
      setStats({ total: Number((total as any).count) || 0, submitted: Number((submitted as any).count) || 0, approved: Number((approved as any).count) || 0, draft: Number((draft as any).count) || 0, rejected: Number((rejected as any).count) || 0 });
    } catch (e) { console.error(e); }
    finally { setStatsLoading(false); }
  }

  async function handleSyncApprovalNow() {
    try {
      const result = await syncQuotesLinkedToReservations();
      await Promise.all([loadQuotes(), loadStats()]);
      alert(`예약 연동 승인 동기화 완료: ${result.updated}건 변경`);
    } catch (e) {
      console.error(e);
      alert('예약 연동 승인 동기화 중 오류가 발생했습니다.');
    }
  }

  async function handleCancelApproval(quoteId: string, quoteTitle?: string) {
    if (!confirm(`"${quoteTitle || quoteId}" 승인 취소할까요?`)) return;
    const reason = prompt('승인 취소 사유 (선택)') || undefined;
    setActionLoading(quoteId);
    try {
      const res = await cancelQuoteApproval(quoteId, user?.id || '', reason);
      if (res?.success) { await Promise.all([loadQuotes(), loadStats()]); alert(res.message || '취소 완료'); }
      else alert('승인 취소 실패');
    } catch (e) { console.error(e); alert('오류 발생'); }
    finally { setActionLoading(null); }
  }

  async function handleReapprove(quoteId: string, quoteTitle?: string) {
    if (!confirm(`"${quoteTitle || quoteId}" 승인할까요?`)) return;
    setActionLoading(quoteId);
    try {
      const res = await reapproveQuote(quoteId, user?.id || '');
      if (res?.success) { await Promise.all([loadQuotes(), loadStats()]); alert(res.message || '승인 완료'); }
      else alert('승인 실패');
    } catch (e) { console.error(e); alert('오류 발생'); }
    finally { setActionLoading(null); }
  }

  const toggleSelectQuote = (quoteId: string) => {
    const newSelected = new Set(selectedQuotes);
    if (newSelected.has(quoteId)) {
      newSelected.delete(quoteId);
    } else {
      newSelected.add(quoteId);
    }
    setSelectedQuotes(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedQuotes.size === filteredQuotes.length) {
      setSelectedQuotes(new Set());
    } else {
      setSelectedQuotes(new Set(filteredQuotes.map(q => q.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedQuotes.size === 0) {
      alert('삭제할 견적을 선택해주세요.');
      return;
    }

    if (!confirm(`선택한 ${selectedQuotes.size}개의 견적을 삭제하시겠습니까?\n\n⚠️ 이 작업은 되돌릴 수 없습니다.`)) {
      return;
    }

    setIsDeleting(true);
    try {
      const idsToDelete = Array.from(selectedQuotes);

      // 견적 항목 먼저 삭제
      const { error: itemError } = await supabase
        .from('quote_item')
        .delete()
        .in('quote_id', idsToDelete);

      if (itemError) throw itemError;

      // 견적 삭제
      const { error: quoteError } = await supabase
        .from('quote')
        .delete()
        .in('id', idsToDelete);

      if (quoteError) throw quoteError;

      alert(`${selectedQuotes.size}개의 견적이 삭제되었습니다.`);
      setSelectedQuotes(new Set());
      await Promise.all([loadQuotes(), loadStats()]);
    } catch (e) {
      console.error(e);
      alert('삭제 중 오류가 발생했습니다.');
    } finally {
      setIsDeleting(false);
    }
  };

  const getStatusStyle = (status?: string | null) => {
    switch (status) {
      case 'draft': return 'bg-gray-50 text-gray-600';
      case 'submitted': return 'bg-yellow-50 text-yellow-700';
      case 'approved': return 'bg-green-50 text-green-700';
      case 'rejected': return 'bg-red-50 text-red-700';
      default: return 'bg-gray-50 text-gray-600';
    }
  };

  const getStatusText = (status?: string | null) => {
    switch (status) {
      case 'draft': return '작성 중';
      case 'submitted': return '검토 대기';
      case 'approved': return '승인됨';
      case 'rejected': return '거부됨';
      default: return status || '';
    }
  };

  const filteredQuotes = search.trim() ? searchResults : quotes;

  return (
    <ManagerLayout title="견적 관리" activeTab="quotes">
      <div className="space-y-6">
        {/* stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
          <div className={`bg-white rounded border p-4 ${filter === 'all' ? 'ring-2 ring-blue-400' : ''}`} onClick={() => handleFilterChange('all')}>
            <div className="text-lg font-medium">{statsLoading ? '...' : stats.total}</div>
            <div className="text-xs text-gray-600">전체 견적</div>
          </div>
          <div className={`bg-white rounded border p-4 ${filter === 'submitted' ? 'ring-2 ring-yellow-400' : ''}`} onClick={() => handleFilterChange('submitted')}>
            <div className="text-lg font-medium text-yellow-600">{statsLoading ? '...' : stats.submitted}</div>
            <div className="text-xs text-gray-600">검토 대기</div>
          </div>
          <div className={`bg-white rounded border p-4 ${filter === 'approved' ? 'ring-2 ring-green-400' : ''}`} onClick={() => handleFilterChange('approved')}>
            <div className="text-lg font-medium text-green-600">{statsLoading ? '...' : stats.approved}</div>
            <div className="text-xs text-gray-600">승인됨</div>
          </div>
          <div className={`bg-white rounded border p-4 ${filter === 'draft' ? 'ring-2 ring-gray-400' : ''}`} onClick={() => handleFilterChange('draft')}>
            <div className="text-lg font-medium">{statsLoading ? '...' : stats.draft}</div>
            <div className="text-xs text-gray-600">작성 중</div>
          </div>
          <div className={`bg-white rounded border p-4 ${filter === 'rejected' ? 'ring-2 ring-red-400' : ''}`} onClick={() => handleFilterChange('rejected')}>
            <div className="text-lg font-medium text-red-600">{statsLoading ? '...' : stats.rejected}</div>
            <div className="text-xs text-gray-600">거부됨</div>
          </div>
        </div>

        {/* filter & search */}
        <div className="bg-white rounded border p-4">
          <div className="flex flex-col md:flex-row gap-4 items-end justify-between">
            <div>
              <h4 className="text-md font-semibold mb-2">견적 상태 필터</h4>
              <div className="flex gap-2 flex-wrap">
                {[{ key: 'all', label: '전체' }, { key: 'draft', label: '작성 중' }, { key: 'submitted', label: '검토 대기' }, { key: 'approved', label: '승인됨' }, { key: 'rejected', label: '거부됨' }].map(opt => (
                  <button key={opt.key} onClick={() => handleFilterChange(opt.key)} className={`px-3 py-2 rounded-lg text-sm ${filter === opt.key ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700'}`}>{opt.label}</button>
                ))}
              </div>
            </div>

            <div className="md:max-w-xs w-full">
              <h4 className="text-md font-semibold mb-2">고객/견적 검색 (전체)</h4>
              <div className="relative">
                <input value={search} onChange={e => handleSearch(e.target.value)} disabled={searchLoading} className="w-full px-4 py-2 border rounded-lg pr-10 disabled:bg-gray-100" placeholder="이름, 이메일, 견적ID 검색..." />
                {search && <button onClick={() => handleSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">✕</button>}
              </div>
              {searchLoading && <p className="text-sm text-gray-500 mt-1">검색 중...</p>}
              {search && !searchLoading && <p className="text-sm text-gray-500 mt-1">"{search}" 검색 결과: {filteredQuotes.length}건</p>}
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <button
              onClick={handleSyncApprovalNow}
              disabled={syncingApproval}
              className="px-3 py-2 rounded-lg border border-green-200 bg-green-50 text-green-700 text-sm disabled:opacity-60"
            >
              {syncingApproval ? '동기화 중...' : '예약연결 견적 승인 동기화'}
            </button>
          </div>
        </div>

        {/* list */}
        <div className="space-y-3">
          {/* 로딩 상태 표시 */}
          {loading && <div className="bg-white rounded border p-8 text-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div><p className="mt-4 text-gray-600">데이터를 불러오는 중...</p></div>}

          {!loading && filteredQuotes.length === 0 ? (
            <div className="bg-white rounded border p-8 text-center">
              <div className="text-4xl">📋</div>
              <p className="text-gray-500">조건에 맞는 견적이 없습니다.</p>
              <div className="mt-4"><button onClick={() => loadQuotes()} className="px-4 py-2 rounded bg-blue-50 text-blue-600">다시 조회</button></div>
            </div>
          ) : (
            <>
              {/* 전체 선택 및 삭제 버튼 */}
              {filteredQuotes.length > 0 && <div className="bg-white rounded border p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedQuotes.size === filteredQuotes.length && filteredQuotes.length > 0}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded border-gray-300"
                    />
                    <span className="text-sm font-medium text-gray-700">
                      전체 선택 {selectedQuotes.size > 0 && `(${selectedQuotes.size}/${filteredQuotes.length})`}
                    </span>
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  {selectedQuotes.size > 0 && (
                    <button
                      onClick={handleBulkDelete}
                      disabled={isDeleting}
                      className="px-4 py-2 bg-red-50 text-red-600 rounded-lg border border-red-200 hover:bg-red-100 disabled:opacity-50 text-sm font-medium"
                    >
                      {isDeleting ? '삭제 중...' : `🗑️ 선택 삭제 (${selectedQuotes.size})`}
                    </button>
                  )}
                </div>
              </div>}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {filteredQuotes.map(q => (
                  <div key={q.id} className={`bg-white rounded border p-4 flex flex-col justify-between ${selectedQuotes.has(q.id) ? 'ring-2 ring-blue-500' : ''}`}>
                    <div>
                      <div className="flex items-start gap-3 mb-2">
                        <input
                          type="checkbox"
                          checked={selectedQuotes.has(q.id)}
                          onChange={() => toggleSelectQuote(q.id)}
                          className="mt-1 w-4 h-4 rounded border-gray-300 cursor-pointer"
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div className="min-w-0 flex-1">
                          <h3 className="text-base font-medium truncate">{q.title || '제목 없음'}</h3>
                          <div className="text-xs text-gray-600 mt-1">👤 <strong className="font-medium">{q.user_nickname || (q.user_id ? String(q.user_id).slice(0, 8) + '...' : '알 수 없음')}</strong></div>
                        </div>
                        <span className={`ml-auto px-2 py-1 rounded text-xs ${getStatusStyle(q.status)}`}>{getStatusText(q.status)}</span>
                      </div>
                      <div className="text-xs text-gray-600 space-y-1">
                        <div>📅 생성일: {q.created_at ? new Date(q.created_at).toLocaleDateString('ko-KR') : '-'}</div>
                        {q.approved_at && <div>✅ 승인일: {new Date(q.approved_at).toLocaleDateString('ko-KR')}</div>}
                        {q.total_price != null && <div>💰 총 금액: <strong>{q.total_price?.toLocaleString()}동</strong></div>}
                        <div className="text-xs text-gray-400">🆔 {String(q.id).slice(0, 8)}...</div>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center gap-2">
                      <button onClick={() => setModalQuoteId(q.id)} className="bg-gray-50 text-gray-600 px-3 py-1 rounded border text-xs">👁️ 상세보기</button>
                      {q.status === 'approved' && <button onClick={() => handleCancelApproval(q.id, q.title || undefined)} disabled={actionLoading === q.id} className="bg-red-50 text-red-600 px-3 py-1 rounded border text-xs">{actionLoading === q.id ? '처리 중...' : '❌ 승인 취소'}</button>}
                      {(['draft', 'submitted'].includes(q.status || '')) && <button onClick={() => handleReapprove(q.id, q.title || undefined)} disabled={actionLoading === q.id} className="bg-green-50 text-green-600 px-3 py-1 rounded border text-xs">{actionLoading === q.id ? '처리 중...' : '✅ 승인'}</button>}
                      {q.status === 'draft' && <button onClick={() => router.push(`/manager/quotes/${q.id}/edit`)} className="bg-blue-50 text-blue-600 px-3 py-1 rounded border text-xs">✏️ 수정</button>}
                    </div>
                  </div>
                ))}
              </div>

              {/* 더 불러오기 버튼 - 검색 중이 아니고 추가로 로드할 데이터가 있을 때만 표시 */}
              {!search && canLoadMore && (
                <div className="flex justify-center mt-4">
                  <button
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                    className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-60"
                  >
                    {loadingMore ? '불러오는 중...' : `📥 더 불러오기 (최근 ${loadedDaysCount + 3}일 표시)`}
                  </button>
                </div>
              )}

              {/* 로딩 범위 표시 - 검색 중이 아닐 때만 */}
              {!search && (
                <div className="text-center text-xs text-gray-500 mt-2">
                  최근 {loadedDaysCount}일치의 견적을 표시하고 있습니다.
                </div>
              )}
            </>
          )}
        </div>
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded p-4">
          <h4 className="text-sm font-medium text-yellow-800 mb-2">📋 견적 승인 관리 안내</h4>
          <ul className="text-xs text-yellow-700 space-y-1">
            <li>• <strong>주문 제목</strong>: 고객이 입력한 견적 제목입니다</li>
            <li>• <strong>고객 닉네임</strong>: 등록된 고객은 이름/이메일, 견적자는 ID 앞 8자리로 표시</li>
            <li>• <strong>승인 취소</strong>: 승인된 견적을 다시 "작성 중" 상태로 되돌립니다</li>
          </ul>
        </div>

        {modalQuoteId && <QuoteDetailModal quoteId={modalQuoteId} onClose={() => setModalQuoteId(null)} />}
      </div>
    </ManagerLayout>
  );
}

