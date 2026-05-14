// @ts-nocheck
'use client';

/**
 * 견적 목록 (모바일)
 * - manager1 `/manager/quotes` 기능 동기화
 * - UI는 모바일 최적화 (max-w-md, 카드 리스트, 큰 터치 영역)
 */

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Search, X, RefreshCw, FileText, CheckCircle,
  Clock, FileEdit, XCircle, Filter, Trash2, Eye, Loader2,
} from 'lucide-react';
import supabase from '@/lib/supabase';

type Quote = {
  id: string;
  title?: string | null;
  status?: string | null;
  user_id?: string | null;
  created_at?: string | null;
  approved_at?: string | null;
  total_price?: number | null;
  user_nickname?: string | null;
  has_reservation?: boolean;
};

const STATUS_FILTERS = [
  { key: 'submitted', label: '검토 대기' },
  { key: 'approved',  label: '승인됨' },
  { key: 'draft',     label: '작성 중' },
  { key: 'rejected',  label: '거부됨' },
  { key: 'all',       label: '전체' },
];

function statusStyle(status?: string | null) {
  switch (status) {
    case 'draft':     return 'bg-gray-100 text-gray-700';
    case 'submitted': return 'bg-yellow-100 text-yellow-800';
    case 'approved':  return 'bg-green-100 text-green-800';
    case 'rejected':  return 'bg-red-100 text-red-800';
    default:          return 'bg-gray-100 text-gray-700';
  }
}
function statusText(status?: string | null) {
  switch (status) {
    case 'draft':     return '작성 중';
    case 'submitted': return '검토 대기';
    case 'approved':  return '승인됨';
    case 'rejected':  return '거부됨';
    default:          return status || '-';
  }
}

export default function MobileQuotesPage() {
  const router = useRouter();

  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Quote[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<string>('submitted');
  const [stats, setStats] = useState({ total: 0, submitted: 0, approved: 0, draft: 0, rejected: 0 });
  const [statsLoading, setStatsLoading] = useState(false);
  const [loadedDays, setLoadedDays] = useState(3);
  const [canLoadMore, setCanLoadMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    loadQuotes();
    loadStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchReservedQuoteIds(): Promise<Set<string>> {
    try {
      const { data, error } = await supabase
        .from('reservation')
        .select('re_quote_id')
        .not('re_quote_id', 'is', null);
      if (error) throw error;
      return new Set(
        (data || [])
          .map((r: any) => String(r.re_quote_id || '').trim())
          .filter(Boolean)
      );
    } catch (e) {
      console.error('예약 연결 조회 실패:', e);
      return new Set();
    }
  }

  async function loadQuotes(filterOverride?: string, daysOverride?: number) {
    setLoading(true);
    try {
      const currentFilter = filterOverride ?? filter;
      const days = daysOverride ?? loadedDays;
      const now = new Date();
      const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      const startDateStr = startDate.toISOString().split('T')[0];

      let q = supabase
        .from('quote')
        .select('id, title, status, user_id, created_at, approved_at, total_price')
        .order('created_at', { ascending: false });
      if (currentFilter !== 'all') q = q.eq('status', currentFilter as any);
      q = q.gte('created_at', startDateStr);

      const { data, error } = await q;
      if (error) throw error;

      // hasMore 체크
      let hasMore = false;
      try {
        let checkQ = supabase.from('quote').select('id', { count: 'exact', head: true });
        if (currentFilter !== 'all') checkQ = checkQ.eq('status', currentFilter as any);
        checkQ = checkQ.lt('created_at', startDateStr);
        const { count } = await checkQ;
        hasMore = (count || 0) > 0;
      } catch {}
      setCanLoadMore(hasMore);

      const reservedKeys = await fetchReservedQuoteIds();

      const enriched = await Promise.all((data || []).map(async (item: any) => {
        let nickname = item?.user_id ? `${String(item.user_id).slice(0, 8)}...` : '알 수 없음';
        try {
          const { data: u } = await supabase.from('users').select('name, email').eq('id', item.user_id).single();
          if (u) nickname = u.name || (u.email ? u.email.split('@')[0] : nickname);
        } catch {}
        return {
          ...item,
          user_nickname: nickname,
          has_reservation: reservedKeys.has(String(item.id || '').trim()),
        };
      }));

      setQuotes(enriched as Quote[]);
      setSearchResults([]);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function loadStats() {
    setStatsLoading(true);
    try {
      const total     = await supabase.from('quote').select('*', { count: 'exact', head: true });
      const submitted = await supabase.from('quote').select('*', { count: 'exact', head: true }).eq('status', 'submitted');
      const approved  = await supabase.from('quote').select('*', { count: 'exact', head: true }).eq('status', 'approved');
      const draft     = await supabase.from('quote').select('*', { count: 'exact', head: true }).eq('status', 'draft');
      const rejected  = await supabase.from('quote').select('*', { count: 'exact', head: true }).eq('status', 'rejected');
      setStats({
        total:     Number((total as any).count) || 0,
        submitted: Number((submitted as any).count) || 0,
        approved:  Number((approved as any).count) || 0,
        draft:     Number((draft as any).count) || 0,
        rejected:  Number((rejected as any).count) || 0,
      });
    } catch (e) {
      console.error(e);
    } finally {
      setStatsLoading(false);
    }
  }

  async function handleFilterChange(newFilter: string) {
    setFilter(newFilter);
    setLoadedDays(3);
    setSearch('');
    setSearchResults([]);
    await loadQuotes(newFilter, 3);
    await loadStats();
  }

  async function handleSearch(term: string) {
    setSearch(term);
    if (!term.trim()) { setSearchResults([]); return; }
    setSearchLoading(true);
    try {
      const s = term.trim().toLowerCase();
      const { data, error } = await supabase
        .from('quote')
        .select('id, title, status, user_id, created_at, approved_at, total_price')
        .order('created_at', { ascending: false });
      if (error) throw error;

      const reservedKeys = await fetchReservedQuoteIds();
      const enriched = await Promise.all((data || []).map(async (item: any) => {
        let nickname = item?.user_id ? `${String(item.user_id).slice(0, 8)}...` : '알 수 없음';
        try {
          const { data: u } = await supabase.from('users').select('name, email').eq('id', item.user_id).single();
          if (u) nickname = u.name || (u.email ? u.email.split('@')[0] : nickname);
        } catch {}
        return {
          ...item,
          user_nickname: nickname,
          has_reservation: reservedKeys.has(String(item.id || '').trim()),
        };
      }));

      const filtered = (enriched as Quote[]).filter(q =>
        String(q.user_nickname || '').toLowerCase().includes(s) ||
        String(q.title || '').toLowerCase().includes(s) ||
        String(q.id || '').toLowerCase().includes(s)
      );
      setSearchResults(filtered);
    } catch (e) {
      console.error(e);
    } finally {
      setSearchLoading(false);
    }
  }

  async function handleLoadMore() {
    setLoadingMore(true);
    try {
      const next = loadedDays + 3;
      setLoadedDays(next);
      await loadQuotes(undefined, next);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleSingleDelete(quoteId: string, quoteTitle?: string) {
    if (!confirm(`"${quoteTitle || quoteId}" 견적을 삭제할까요?\n이 작업은 되돌릴 수 없습니다.`)) return;
    setActionLoading(quoteId);
    try {
      const { data: linked } = await supabase.from('reservation').select('re_id').eq('re_quote_id', quoteId).limit(1);
      if (linked && linked.length > 0) { alert('예약과 연결된 견적은 삭제할 수 없습니다.'); return; }
      const { error: itemErr } = await supabase.from('quote_item').delete().eq('quote_id', quoteId);
      if (itemErr) throw itemErr;
      const { error: qErr } = await supabase.from('quote').delete().eq('id', quoteId);
      if (qErr) throw qErr;
      await Promise.all([loadQuotes(), loadStats()]);
      alert('삭제되었습니다.');
    } catch (e: any) {
      console.error(e);
      alert('삭제 실패: ' + (e?.message || '오류'));
    } finally {
      setActionLoading(null);
    }
  }

  const display = (search.trim() ? searchResults : quotes);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 pb-20">
      {/* 상단 헤더 */}
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="flex items-center justify-between px-2 py-2">
          <Link href="/" className="flex items-center gap-1 text-slate-600 active:text-slate-900">
            <ArrowLeft className="w-5 h-5" />
            <span className="text-sm">홈</span>
          </Link>
          <h1 className="text-base font-bold text-slate-800">견적 목록</h1>
          <button
            type="button"
            onClick={() => { loadQuotes(); loadStats(); }}
            disabled={loading || statsLoading}
            className="text-slate-600 active:text-slate-900 disabled:opacity-50"
            aria-label="새로 고침"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      <main className="w-full px-2 pt-2 space-y-2">
        {/* 통계 - 한 줄 칩 (최소 공간) */}
        <div className="flex gap-1.5 overflow-hidden">
          <StatChip label="대기" value={stats.submitted} loading={statsLoading} active={filter === 'submitted'} onClick={() => handleFilterChange('submitted')} color="bg-yellow-100 text-yellow-800 ring-yellow-400" />
          <StatChip label="승인" value={stats.approved} loading={statsLoading} active={filter === 'approved'} onClick={() => handleFilterChange('approved')} color="bg-green-100 text-green-800 ring-green-400" />
          <StatChip label="작성중" value={stats.draft} loading={statsLoading} active={filter === 'draft'} onClick={() => handleFilterChange('draft')} color="bg-slate-100 text-slate-700 ring-slate-400" />
          <StatChip label="전체" value={stats.total} loading={statsLoading} active={filter === 'all'} onClick={() => handleFilterChange('all')} color="bg-blue-100 text-blue-800 ring-blue-400" />
        </div>

        {/* 검색 */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            disabled={searchLoading}
            placeholder="이름, 제목, 견적ID 검색"
            className="w-full pl-9 pr-9 py-2.5 bg-white rounded-xl border border-slate-200 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-slate-100"
          />
          {search && (
            <button
              type="button"
              onClick={() => handleSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 active:text-slate-700"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* 필터 칩 (가로 스크롤) */}
        <div className="-mx-4 px-4 overflow-x-auto">
          <div className="flex gap-2 whitespace-nowrap pb-1">
            {STATUS_FILTERS.map(opt => (
              <button
                key={opt.key}
                type="button"
                onClick={() => handleFilterChange(opt.key)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-medium border transition ${
                  filter === opt.key
                    ? 'bg-blue-500 text-white border-blue-500'
                    : 'bg-white text-slate-600 border-slate-200 active:bg-slate-100'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* 검색 정보 */}
        {search && !searchLoading && (
          <div className="text-xs text-slate-500 px-1">
            "{search}" 검색 결과: {display.length}건
          </div>
        )}
        {searchLoading && (
          <div className="text-xs text-slate-500 px-1 flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" /> 검색 중…
          </div>
        )}

        {/* 리스트 */}
        {loading ? (
          <div className="bg-white rounded-2xl shadow-sm p-10 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
          </div>
        ) : display.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm p-10 text-center">
            <div className="text-4xl mb-2">📋</div>
            <p className="text-sm text-slate-500">조건에 맞는 견적이 없습니다.</p>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {display.map(q => (
              <li key={q.id}>
                <QuoteCard
                  quote={q}
                  busy={actionLoading === q.id}
                  onOpen={() => router.push(`/quotes/${q.id}`)}
                  onDelete={() => handleSingleDelete(q.id, q.title || undefined)}
                />
              </li>
            ))}
          </ul>
        )}

        {/* 더 불러오기 */}
        {!search && canLoadMore && (
          <button
            type="button"
            onClick={handleLoadMore}
            disabled={loadingMore}
            className="w-full py-3 bg-white border border-slate-200 rounded-2xl text-sm font-medium text-blue-600 active:bg-blue-50 disabled:opacity-60"
          >
            {loadingMore ? '불러오는 중…' : `📥 더 불러오기 (최근 ${loadedDays + 3}일)`}
          </button>
        )}
        {!search && (
          <p className="text-center text-[11px] text-slate-400">
            최근 {loadedDays}일치의 견적을 표시 중
          </p>
        )}
      </main>
    </div>
  );
}

/* ─── 통계 칩 (한 줄, 최소 공간) ──────────────────────────── */
function StatChip({
  label, value, loading, active, onClick, color,
}: {
  label: string;
  value: number;
  loading: boolean;
  active: boolean;
  onClick: () => void;
  color: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 min-w-0 px-1.5 py-1 rounded-md text-[11px] font-medium active:scale-95 transition flex items-center justify-center gap-1 ${color} ${active ? 'ring-2' : 'ring-0 opacity-80'}`}
    >
      <span className="truncate">{label}</span>
      <span className="font-bold">{loading ? '…' : value.toLocaleString()}</span>
    </button>
  );
}

/* ─── 견적 카드 ──────────────────────────── */
function QuoteCard({
  quote, busy, onOpen, onDelete,
}: {
  quote: Quote;
  busy: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`relative bg-white rounded-2xl shadow-sm p-4 ${
        quote.has_reservation ? 'border border-pink-200' : ''
      }`}
    >
      {quote.has_reservation && (
        <div className="absolute top-0 right-0 bg-gradient-to-l from-pink-500 to-rose-500 text-white text-[10px] font-bold px-2.5 py-0.5 rounded-bl-xl rounded-tr-2xl">
          🎫 예약
        </div>
      )}

      <button
        type="button"
        onClick={onOpen}
        className="block w-full text-left active:opacity-80"
      >
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <h3 className="text-sm font-semibold text-slate-800 truncate flex-1">
            👤 {quote.user_nickname || '알 수 없음'}
          </h3>
          <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium ${statusStyle(quote.status)}`}>
            {statusText(quote.status)}
          </span>
        </div>
        <p className="text-xs text-slate-600 line-clamp-2 mb-2">
          {quote.title || '제목 없음'}
        </p>

        <div className="space-y-0.5 text-[11px] text-slate-500">
          <div>📅 {quote.created_at ? new Date(quote.created_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' }) : '-'}</div>
          {quote.approved_at && (
            <div>✅ 승인 {new Date(quote.approved_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}</div>
          )}
          {quote.total_price != null && (
            <div className="text-slate-700">
              💰 <strong className="text-slate-900">{Number(quote.total_price).toLocaleString()}</strong>동
            </div>
          )}
          <div className="text-slate-400">🆔 {String(quote.id).slice(0, 8)}…</div>
        </div>
      </button>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onOpen}
          className="flex-1 py-2 rounded-lg bg-blue-50 text-blue-700 text-xs font-medium active:bg-blue-100 flex items-center justify-center gap-1"
        >
          <Eye className="w-3.5 h-3.5" /> 상세
        </button>
        {!quote.has_reservation && (
          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            className="px-3 py-2 rounded-lg bg-red-50 text-red-600 text-xs font-medium active:bg-red-100 disabled:opacity-60 flex items-center gap-1"
          >
            <Trash2 className="w-3.5 h-3.5" /> {busy ? '…' : '삭제'}
          </button>
        )}
      </div>
    </div>
  );
}
