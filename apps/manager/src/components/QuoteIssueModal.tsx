'use client';
// 매니저가 저장된 견적을 발행하고 인쇄용 문서로 확인하는 팝업이다.

import { useEffect, useRef, useState } from 'react';

export type QuoteIssueRow = { category: string; name: string; details: string; total: number };
type QuoteIssue = { quote_number: string; quote_title: string; recipient_name: string; memo: string; items: QuoteIssueRow[]; totals: { VND?: number; KRW?: number }; item_count: number; issued_at: string };

function money(value: number, currency: string) {
  return value > 0 ? `${Math.round(value).toLocaleString('ko-KR')} ${currency}` : '견적 확인';
}

function date(value: string) {
  return new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(value));
}

export default function QuoteIssueModal({ quoteId, quoteTitle, rows, totalDong, totalWon, defaultRecipient, defaultMemo, getAccessToken }: {
  quoteId: string | null;
  quoteTitle: string;
  rows: QuoteIssueRow[];
  totalDong: number;
  totalWon: number;
  defaultRecipient: string;
  defaultMemo: string;
  getAccessToken: () => Promise<string | null>;
}) {
  const [open, setOpen] = useState(false);
  const [recipient, setRecipient] = useState('');
  const [memo, setMemo] = useState('');
  const [issue, setIssue] = useState<QuoteIssue | null>(null);
  const [loading, setLoading] = useState(false);
  const [printing, setPrinting] = useState(false);
  const documentRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open || !quoteId) return;
    let cancelled = false;
    const loadLatest = async () => {
      try {
        const token = await getAccessToken();
        if (!token) throw new Error('로그인 정보를 확인하지 못했습니다.');
        const response = await fetch(`/api/manager/quote-issues?quoteId=${encodeURIComponent(quoteId)}`, { headers: { Authorization: `Bearer ${token}` } });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || '발행 견적서를 불러오지 못했습니다.');
        if (!cancelled && result.issue) {
          setIssue(result.issue);
          setRecipient(result.issue.recipient_name || defaultRecipient || quoteTitle);
          setMemo(result.issue.memo || defaultMemo);
        }
      } catch (error) {
        if (!cancelled) alert(error instanceof Error ? error.message : '발행 견적서를 불러오지 못했습니다.');
      }
    };
    void loadLatest();
    return () => { cancelled = true; };
  }, [defaultMemo, defaultRecipient, getAccessToken, open, quoteId, quoteTitle]);

  const openModal = () => {
    setIssue(null);
    setRecipient(defaultRecipient || quoteTitle);
    setMemo(defaultMemo);
    setOpen(true);
  };

  const issueQuote = async () => {
    if (!quoteId || !rows.length) return;
    setLoading(true);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('로그인 정보를 확인하지 못했습니다.');
      const response = await fetch('/api/manager/quote-issues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ quoteId, quoteTitle, recipientName: recipient, memo, items: rows, totals: { VND: totalDong, KRW: totalWon } }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '견적서를 발행하지 못했습니다.');
      setIssue(result.issue);
      setRecipient(result.issue.recipient_name || '');
      setMemo(result.issue.memo || '');
    } catch (error) {
      alert(error instanceof Error ? error.message : '견적서를 발행하지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const printQuote = () => {
    if (printing || !issue || !documentRef.current) return;
    setPrinting(true);
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0;visibility:hidden;';
    const copiedStyles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style')).map((style) => style.outerHTML).join('');
    let cleaned = false;
    const cleanup = () => { if (!cleaned) { cleaned = true; frame.remove(); setPrinting(false); } };
    frame.onload = () => {
      const printWindow = frame.contentWindow;
      if (!printWindow) return cleanup();
      printWindow.addEventListener('afterprint', cleanup, { once: true });
      window.setTimeout(cleanup, 60000);
      window.setTimeout(() => { printWindow.focus(); printWindow.print(); }, 100);
    };
    frame.srcdoc = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>스테이하롱 여행 견적서</title>${copiedStyles}<style>@media print{@page{size:A4;margin:12mm}html,body{margin:0!important;background:#fff!important}.manager-quote-document{width:100%!important;margin:0!important;padding:0!important;border:0!important;box-sizing:border-box}.manager-quote-row,.manager-quote-total{break-inside:avoid}.no-print{display:none!important}}</style></head><body>${documentRef.current.outerHTML}</body></html>`;
    document.body.appendChild(frame);
  };

  const documentRows = issue?.items || rows;
  const totals = issue?.totals || { VND: totalDong, KRW: totalWon };
  const issuedAt = issue?.issued_at || new Date().toISOString();
  const quoteNumber = issue?.quote_number || '발행 전';

  return <>
    <button type="button" onClick={openModal} disabled={!quoteId || !rows.length} title={!quoteId ? '먼저 견적을 저장하세요.' : !rows.length ? '추가된 상품이 없습니다.' : ''} className="text-xs bg-emerald-600 text-white px-2 py-1 rounded disabled:cursor-not-allowed disabled:opacity-50">견적서 보기</button>
    {open && <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/55 p-2 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="manager-quote-issue-title">
      <div className="my-0 max-h-[calc(100dvh-1rem)] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-4 shadow-2xl sm:my-4 sm:max-h-[calc(100dvh-2rem)] sm:p-5">
        <div className="no-print sticky top-0 z-10 -mx-4 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-4 pb-4 sm:-mx-5 sm:px-5"><div><p className="text-xs font-semibold tracking-wider text-emerald-700">QUOTATION / SAVED ITEMS</p><h2 id="manager-quote-issue-title" className="mt-1 text-2xl font-bold text-slate-900">견적서 발행</h2></div><button type="button" onClick={() => setOpen(false)} className="shrink-0 rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">닫기</button></div>
        <section className="no-print mt-5 border-b border-slate-200 pb-5"><p className="text-sm text-slate-600">저장된 견적 상품과 현재 금액으로 견적서를 발행합니다.</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm font-medium text-slate-700">견적 받는 분<input value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="성함 또는 회사명" className="rounded border border-slate-300 px-3 py-2 font-normal" /></label><label className="grid gap-1 text-sm font-medium text-slate-700">메모<input value={memo} onChange={(event) => setMemo(event.target.value)} placeholder="선택 사항" className="rounded border border-slate-300 px-3 py-2 font-normal" /></label></div><div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={issueQuote} disabled={loading} className="rounded bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{loading ? '발행 중…' : '견적서 발행'}</button><button type="button" onClick={printQuote} disabled={!issue || loading || printing} className="rounded border border-slate-400 px-4 py-2 text-sm font-semibold text-slate-800 disabled:cursor-not-allowed disabled:opacity-50">{printing ? '인쇄 준비 중…' : '견적서 인쇄'}</button><button type="button" onClick={printQuote} disabled={!issue || loading || printing} className="rounded border border-slate-400 px-4 py-2 text-sm font-semibold text-slate-800 disabled:cursor-not-allowed disabled:opacity-50">{printing ? 'PDF 준비 중…' : 'PDF로 저장'}</button></div><p className="mt-2 text-xs text-slate-500">견적서를 발행한 뒤 인쇄하거나 PDF로 저장할 수 있습니다.</p></section>
        <article ref={documentRef} className="manager-quote-document mt-5 border border-slate-300 p-5 text-slate-900" data-manager-quote-document aria-label="매니저 여행 견적서"><header className="flex justify-between gap-6 border-b-2 border-slate-900 pb-4"><div><span className="text-xs font-bold tracking-[.18em] text-emerald-700">STAY HALONG</span><h2 className="mt-1 text-2xl font-bold">여행 견적서</h2><p className="text-xs tracking-[.14em] text-slate-500">TRAVEL QUOTATION</p></div><dl className="grid shrink-0 gap-2 text-right text-sm"><div><dt className="text-xs text-slate-500">견적 번호</dt><dd className="font-semibold">{quoteNumber}</dd></div><div><dt className="text-xs text-slate-500">발행일</dt><dd className="font-semibold">{date(issuedAt)}</dd></div></dl></header><section className="mt-4 grid gap-3 border-y border-slate-200 py-3 text-sm sm:grid-cols-2"><div><span className="block text-xs font-bold tracking-[.12em] text-slate-500">TO</span><strong>{issue?.recipient_name || recipient || '고객님'}</strong></div><div><span className="block text-xs font-bold tracking-[.12em] text-slate-500">여행 상품</span><strong>{documentRows.length}개 서비스</strong></div></section><p className="my-4 text-sm leading-6 text-slate-600">아래 내용은 요청하신 여행 상품의 참고 견적입니다. 이용일과 예약 가능 여부를 확인한 뒤 최종 예약 금액이 확정됩니다.</p><section><div className="grid grid-cols-[48px_minmax(0,1fr)_auto] gap-3 border-y-2 border-slate-900 py-2 text-xs font-bold text-slate-600"><span>NO.</span><span>상품 및 이용 정보</span><span className="text-right">참고 금액</span></div>{documentRows.map((row, index) => <div key={`${row.category}-${index}`} className="manager-quote-row grid grid-cols-[48px_minmax(0,1fr)_auto] gap-3 border-b border-slate-200 py-3 text-sm"><span>{String(index + 1).padStart(2, '0')}</span><div><small className="font-bold tracking-wide text-emerald-700">{row.category}</small><strong className="mt-0.5 block">{row.name}</strong>{row.details && <p className="mt-1 text-xs text-slate-500">{row.details}</p>}</div><b className="text-right">{money(Number(row.total) || 0, 'VND')}</b></div>)}</section><section className="manager-quote-total mt-5 bg-slate-900 p-4 text-right text-white"><span className="text-xs font-bold tracking-[.16em] text-lime-200">ESTIMATED TOTAL</span><div className="mt-1 grid gap-1"><strong className="text-xl">{money(Number(totals.VND) || 0, 'VND')}</strong><strong className="text-base">{money(Number(totals.KRW) || 0, 'KRW')}</strong></div></section>{(issue?.memo || memo) && <section className="mt-4 border-l-2 border-emerald-600 pl-3 text-sm"><span className="text-xs font-bold tracking-[.12em] text-slate-500">MEMO</span><p className="mt-1 whitespace-pre-wrap">{issue?.memo || memo}</p></section>}<footer className="mt-5 flex justify-between gap-4 border-t border-slate-200 pt-3 text-xs text-slate-500"><div><strong className="block text-slate-900">STAY HALONG</strong><span>하롱베이 현지 프리미엄 여행</span></div><p className="max-w-sm text-right">본 견적서는 예약 확정서가 아닙니다.<br />최종 금액과 예약 가능 여부는 결제 전 다시 확인합니다.<br />견적서의 유효기간은 발생일로 부터 2일간 입니다.</p></footer></article>
      </div>
    </div>}
  </>;
}
