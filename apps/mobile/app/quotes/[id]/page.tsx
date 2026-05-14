// @ts-nocheck
'use client';

/**
 * 견적 상세 (모바일)
 * - manager1 QuoteDetailModal의 핵심 동작 동기화
 * - UI는 모바일 전용 풀스크린 페이지
 * - 복잡한 가격 편집/세부 항목 편집은 manager1로 위임
 */

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import {
  ArrowLeft, Loader2, RefreshCw, CheckCircle, XCircle,
  Calculator, Edit3, Ship, Plane, Building, Car as CarIcon,
  Bus, MapPin,
} from 'lucide-react';
import supabase from '@/lib/supabase';

const fmt = (v: any) => (v == null || v === '' ? '-' : Number(v).toLocaleString());
const fmtDate = (v: any) => {
  if (!v) return '-';
  try { return new Date(v).toLocaleDateString('ko-KR'); } catch { return String(v); }
};
const fmtDateTime = (v: any) => {
  if (!v) return '-';
  try { return new Date(v).toLocaleString('ko-KR'); } catch { return String(v); }
};

const SERVICE_META: Record<string, { label: string; icon: any; color: string; bg: string }> = {
  room:    { label: '크루즈 객실', icon: Ship,      color: 'text-blue-600',   bg: 'bg-blue-100' },
  car:     { label: '크루즈 차량', icon: CarIcon,   color: 'text-cyan-600',   bg: 'bg-cyan-100' },
  airport: { label: '공항 픽업',   icon: Plane,     color: 'text-sky-600',    bg: 'bg-sky-100' },
  hotel:   { label: '호텔',        icon: Building,  color: 'text-amber-600',  bg: 'bg-amber-100' },
  rentcar: { label: '렌터카',      icon: Bus,       color: 'text-teal-600',   bg: 'bg-teal-100' },
  tour:    { label: '투어',        icon: MapPin,    color: 'text-rose-600',   bg: 'bg-rose-100' },
};

function statusBadge(status?: string | null) {
  const m: Record<string, { label: string; cls: string }> = {
    draft:     { label: '작성 중',   cls: 'bg-gray-100 text-gray-700' },
    submitted: { label: '검토 대기', cls: 'bg-yellow-100 text-yellow-800' },
    approved:  { label: '승인됨',    cls: 'bg-green-100 text-green-800' },
    rejected:  { label: '거부됨',    cls: 'bg-red-100 text-red-800' },
  };
  return m[String(status || '')] || { label: status || '-', cls: 'bg-gray-100 text-gray-700' };
}

export default function MobileQuoteDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const quoteId = params?.id;

  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [quote, setQuote] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [showApproval, setShowApproval] = useState(false);
  const [showRejection, setShowRejection] = useState(false);
  const [approvalNote, setApprovalNote] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');

  useEffect(() => {
    if (quoteId) loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteId]);

  async function loadAll() {
    setLoading(true);
    try {
      await Promise.all([loadQuote(), loadItems()]);
    } finally {
      setLoading(false);
    }
  }

  async function loadQuote() {
    try {
      const { data: quoteData, error } = await supabase
        .from('quote')
        .select('*')
        .eq('id', quoteId)
        .single();
      if (error) throw error;

      let userData: any = null;
      try {
        const { data: u } = await supabase
          .from('users')
          .select('id, name, email, phone_number')
          .eq('id', quoteData.user_id)
          .single();
        userData = u;
      } catch {}
      setQuote({ ...quoteData, users: userData || { name: '알 수 없음', email: '미확인' } });
    } catch (e) {
      console.error('견적 조회 실패:', e);
      alert('견적을 불러오지 못했습니다.');
      router.replace('/quotes');
    }
  }

  async function loadItems() {
    try {
      const { data, error } = await supabase
        .from('quote_item')
        .select('*')
        .eq('quote_id', quoteId);
      if (error) throw error;
      setItems(data || []);
    } catch (e) {
      console.error('견적 항목 조회 실패:', e);
    }
  }

  // 서비스 타입별 그룹
  const grouped = useMemo(() => {
    const g: Record<string, any[]> = {};
    for (const it of items) {
      const key = String(it.service_type || 'unknown');
      (g[key] = g[key] || []).push(it);
    }
    return g;
  }, [items]);

  const calcTotal = useMemo(() => {
    return items.reduce((s, it) => s + Number(it.unit_price || 0) * Number(it.quantity || 1), 0);
  }, [items]);

  async function handleCalculatePrices() {
    setCalculating(true);
    try {
      // 가격 계산 로직은 manager1의 updateQuoteItemPrices에 의존
      // 모바일은 단순히 quote_item 합계를 quote.total_price 에 동기화
      const total = items.reduce((s, it) => s + Number(it.total_price ?? Number(it.unit_price || 0) * Number(it.quantity || 1)), 0);
      const { error } = await supabase
        .from('quote')
        .update({ total_price: total, updated_at: new Date().toISOString() })
        .eq('id', quoteId);
      if (error) throw error;
      await loadQuote();
      alert(`총액이 ${total.toLocaleString()}동으로 업데이트되었습니다.`);
    } catch (e: any) {
      console.error(e);
      alert('가격 동기화 실패: ' + (e?.message || '오류'));
    } finally {
      setCalculating(false);
    }
  }

  async function handleApprove() {
    setActionLoading('approve');
    try {
      const update: any = {
        status: 'approved',
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      if (approvalNote.trim()) update.manager_note = approvalNote.trim();
      const { error } = await supabase.from('quote').update(update).eq('id', quoteId);
      if (error) throw error;
      setShowApproval(false);
      setApprovalNote('');
      await loadQuote();
      alert('견적이 승인되었습니다.');
    } catch (e: any) {
      console.error(e);
      alert('승인 실패: ' + (e?.message || '오류'));
    } finally {
      setActionLoading(null);
    }
  }

  async function handleReject() {
    if (!rejectionReason.trim()) {
      alert('거절 사유를 입력해주세요.');
      return;
    }
    setActionLoading('reject');
    try {
      const { error } = await supabase
        .from('quote')
        .update({
          status: 'rejected',
          updated_at: new Date().toISOString(),
          manager_note: rejectionReason.trim(),
        })
        .eq('id', quoteId);
      if (error) throw error;
      setShowRejection(false);
      setRejectionReason('');
      await loadQuote();
      alert('견적이 거절되었습니다.');
    } catch (e: any) {
      console.error(e);
      alert('거절 실패: ' + (e?.message || '오류'));
    } finally {
      setActionLoading(null);
    }
  }

  async function handleCancelApproval() {
    if (!confirm('승인을 취소하고 "작성 중" 상태로 되돌릴까요?')) return;
    setActionLoading('cancel');
    try {
      const { error } = await supabase
        .from('quote')
        .update({
          status: 'draft',
          approved_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', quoteId);
      if (error) throw error;
      await loadQuote();
      alert('승인이 취소되었습니다.');
    } catch (e: any) {
      console.error(e);
      alert('취소 실패: ' + (e?.message || '오류'));
    } finally {
      setActionLoading(null);
    }
  }

  if (loading || !quote) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  const badge = statusBadge(quote.status);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 pb-24">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-md mx-auto flex items-center justify-between px-4 py-3">
          <Link href="/quotes" className="flex items-center gap-1 text-slate-600 active:text-slate-900">
            <ArrowLeft className="w-5 h-5" />
            <span className="text-sm">목록</span>
          </Link>
          <h1 className="text-base font-bold text-slate-800">견적 상세</h1>
          <button
            type="button"
            onClick={loadAll}
            className="text-slate-600 active:text-slate-900"
            aria-label="새로 고침"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 pt-4 space-y-4">
        {/* 헤더 카드 */}
        <section className="bg-white rounded-2xl shadow-sm p-4">
          <div className="flex items-start justify-between gap-2 mb-2">
            <h2 className="text-base font-bold text-slate-800 flex-1 break-words">
              {quote.title || '제목 없음'}
            </h2>
            <span className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-medium ${badge.cls}`}>
              {badge.label}
            </span>
          </div>
          {quote.description && (
            <p className="text-xs text-slate-600 mb-3 whitespace-pre-wrap">{quote.description}</p>
          )}
          <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-500">
            <Info label="생성일" value={fmtDateTime(quote.created_at)} />
            <Info label="수정일" value={fmtDateTime(quote.updated_at)} />
            {quote.submitted_at && <Info label="제출일" value={fmtDateTime(quote.submitted_at)} />}
            {quote.approved_at && <Info label="승인일" value={fmtDateTime(quote.approved_at)} />}
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs text-slate-500">총 금액</span>
            <span className="text-lg font-bold text-blue-600">
              {fmt(quote.total_price ?? calcTotal)} <span className="text-xs">동</span>
            </span>
          </div>
          {quote.manager_note && (
            <div className="mt-3 p-2.5 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="text-[10px] font-semibold text-yellow-700 mb-1">매니저 메모</div>
              <div className="text-xs text-yellow-900 whitespace-pre-wrap">{quote.manager_note}</div>
            </div>
          )}
        </section>

        {/* 고객 정보 */}
        <section className="bg-white rounded-2xl shadow-sm p-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-2">👤 고객 정보</h3>
          <div className="space-y-1 text-sm">
            <Row label="이름"   value={quote.users?.name} />
            <Row label="이메일" value={quote.users?.email} />
            <Row label="전화"   value={quote.users?.phone_number} />
            <Row label="ID"     value={String(quote.user_id || '').slice(0, 8) + '…'} />
          </div>
        </section>

        {/* 견적 항목 */}
        <section className="bg-white rounded-2xl shadow-sm p-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">
            🛒 견적 항목 ({items.length}건)
          </h3>
          {items.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-4">등록된 항목이 없습니다.</p>
          ) : (
            <ul className="space-y-2.5">
              {Object.entries(grouped).map(([type, list]) => {
                const meta = SERVICE_META[type] || {
                  label: type, icon: MapPin, color: 'text-slate-600', bg: 'bg-slate-100',
                };
                const Icon = meta.icon;
                const sub = list.reduce(
                  (s: number, it: any) => s + Number(it.total_price ?? Number(it.unit_price || 0) * Number(it.quantity || 1)),
                  0,
                );
                return (
                  <li key={type} className="border border-slate-100 rounded-xl p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${meta.bg}`}>
                        <Icon className={`w-4 h-4 ${meta.color}`} />
                      </span>
                      <span className="text-sm font-semibold text-slate-800 flex-1">
                        {meta.label} <span className="text-xs text-slate-400">×{list.length}</span>
                      </span>
                      <span className="text-sm font-bold text-blue-600">{fmt(sub)}동</span>
                    </div>
                    <ul className="space-y-1.5 pl-9">
                      {list.map((it: any) => {
                        const u = Number(it.unit_price || 0);
                        const q = Number(it.quantity || 1);
                        const t = Number(it.total_price ?? u * q);
                        return (
                          <li key={it.id} className="text-[11px] text-slate-600 flex items-center justify-between">
                            <span className="text-slate-500">
                              {fmt(u)} × {q}
                              {it.usage_date && ` · ${fmtDate(it.usage_date)}`}
                            </span>
                            <span className="text-slate-800 font-medium">{fmt(t)}동</span>
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* 액션 영역 */}
        <section className="bg-white rounded-2xl shadow-sm p-4 space-y-2">
          <h3 className="text-sm font-semibold text-slate-700 mb-1">⚙️ 액션</h3>

          <button
            type="button"
            onClick={handleCalculatePrices}
            disabled={calculating}
            className="w-full py-3 rounded-xl bg-blue-50 text-blue-700 text-sm font-medium active:bg-blue-100 disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {calculating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />}
            {calculating ? '동기화 중…' : '총액 동기화'}
          </button>

          {(quote.status === 'submitted' || quote.status === 'draft') && (
            <>
              <button
                type="button"
                onClick={() => setShowApproval(true)}
                className="w-full py-3 rounded-xl bg-green-500 text-white text-sm font-semibold active:bg-green-600 flex items-center justify-center gap-2"
              >
                <CheckCircle className="w-4 h-4" /> 승인
              </button>
              <button
                type="button"
                onClick={() => setShowRejection(true)}
                className="w-full py-3 rounded-xl bg-red-50 text-red-600 text-sm font-medium active:bg-red-100 flex items-center justify-center gap-2"
              >
                <XCircle className="w-4 h-4" /> 거절
              </button>
            </>
          )}

          {quote.status === 'approved' && (
            <button
              type="button"
              onClick={handleCancelApproval}
              disabled={actionLoading === 'cancel'}
              className="w-full py-3 rounded-xl bg-amber-50 text-amber-700 text-sm font-medium active:bg-amber-100 disabled:opacity-60 flex items-center justify-center gap-2"
            >
              <XCircle className="w-4 h-4" />
              {actionLoading === 'cancel' ? '처리 중…' : '승인 취소'}
            </button>
          )}

          <a
            href={`https://manager.staycruise.kr/manager/quotes/${quoteId}/edit`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-3 rounded-xl border border-slate-200 text-slate-700 text-sm font-medium active:bg-slate-50 flex items-center justify-center gap-2"
          >
            <Edit3 className="w-4 h-4" /> 매니저에서 견적 수정
          </a>
        </section>
      </main>

      {/* 승인 모달 */}
      {showApproval && (
        <Sheet onClose={() => setShowApproval(false)} title="견적 승인">
          <textarea
            value={approvalNote}
            onChange={(e) => setApprovalNote(e.target.value)}
            placeholder="매니저 메모 (선택)"
            rows={3}
            className="w-full p-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <button
            type="button"
            onClick={handleApprove}
            disabled={actionLoading === 'approve'}
            className="mt-3 w-full py-3 bg-green-500 text-white rounded-xl font-semibold active:bg-green-600 disabled:opacity-60"
          >
            {actionLoading === 'approve' ? '승인 중…' : '✅ 승인 확정'}
          </button>
        </Sheet>
      )}

      {/* 거절 모달 */}
      {showRejection && (
        <Sheet onClose={() => setShowRejection(false)} title="견적 거절">
          <textarea
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            placeholder="거절 사유 (필수)"
            rows={3}
            className="w-full p-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
          />
          <button
            type="button"
            onClick={handleReject}
            disabled={actionLoading === 'reject' || !rejectionReason.trim()}
            className="mt-3 w-full py-3 bg-red-500 text-white rounded-xl font-semibold active:bg-red-600 disabled:opacity-60"
          >
            {actionLoading === 'reject' ? '처리 중…' : '❌ 거절 확정'}
          </button>
        </Sheet>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <div className="text-slate-400">{label}</div>
      <div className="text-slate-700 font-medium">{value}</div>
    </div>
  );
}
function Row({ label, value }: { label: string; value: any }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-slate-500 text-xs">{label}</span>
      <span className="text-slate-800 font-medium text-right break-all">{value || '-'}</span>
    </div>
  );
}
function Sheet({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white rounded-t-3xl p-5 pb-8 shadow-2xl animate-in slide-in-from-bottom">
        <div className="w-10 h-1 bg-slate-300 rounded-full mx-auto mb-4" />
        <h3 className="text-base font-bold text-slate-800 mb-3">{title}</h3>
        {children}
        <button
          type="button"
          onClick={onClose}
          className="mt-2 w-full py-3 text-slate-600 text-sm font-medium"
        >
          취소
        </button>
      </div>
    </div>
  );
}
